/**
 * 性能监控系统 (PerformanceMonitor)
 *
 * 功能：
 * 1. FPS 监控（帧率统计/卡顿检测）
 * 2. 内存监控（JS堆内存/纹理内存/总趋势）
 * 3. 加载耗时追踪（场景切换/资源加载/游戏初始化）
 * 4. 自定义埋点（游戏操作耗时/关键路径）
 * 5. 性能告警（FPS过低/内存过高/加载超时）
 * 6. 定时汇总上报（可配置周期）
 */
import { _decorator, sys, game, view, profiler, sys as ccSys } from 'cc';
import { CrashReporter } from './CrashReporter';

// ==================== 性能指标 ====================
export interface PerfMetrics {
    // FPS 相关
    fps: number;                  // 当前 FPS
    fpsAvg: number;               // 平均 FPS（最近N秒）
    fpsMin: number;               // 最低 FPS
    fpsMax: number;               // 最高 FPS
    frameTime: number;            // 当前帧耗时(ms)
    jankCount: number;            // 卡顿次数（帧时间>阈值）
    severeJankCount: number;      // 严重卡顿次数

    // 内存相关
    jsHeapMB: number;             // JS 堆内存(MB)
    jsHeapTrend: 'stable' | 'rising' | 'critical'; // 内存趋势

    // 会话统计
    uptimeSeconds: number;        // 运行时长(s)
    totalFrames: number;          // 总帧数
    droppedFrames: number;        // 掉帧数
}

// ==================== 性能告警 ====================
export interface PerfAlert {
    id: string;
    type: AlertType;
    level: AlertLevel;
    message: string;
    value: number;
    threshold: number;
    timestamp: number;
    context?: string;
}

export enum AlertType {
    LOW_FPS = 'low_fps',           // 低帧率
    HIGH_MEMORY = 'high_memory',   // 高内存
    MEMORY_LEAK = 'memory_leak',   // 内存泄漏趋势
    SLOW_FRAME = 'slow_frame',     // 单帧过慢
    LOAD_TIMEOUT = 'load_timeout', // 加载超时
    CUSTOM = 'custom',             // 自定义告警
}

export enum AlertLevel {
    INFO = 'info',
    WARNING = 'warning',
    CRITICAL = 'critical',
}

// ==================== 计时器（用于埋点）====================
interface TimerEntry {
    name: string;
    startTime: number;
    category: string;
    tags?: Record<string, string>;
}

// ==================== 上报配置 ====================
export interface PerfMonitorConfig {
    enabled: boolean;
    reportUrl: string;                 // 上报地址
    reportIntervalMs: number;          // 定时上报周期(ms)
    fpsWarningThreshold: number;      // FPS 警告阈值
    fpsCriticalThreshold: number;     // FPS 严重阈值
    jankFrameThreshold: number;       // 卡顿帧阈值(ms)
    memoryWarningMB: number;          // 内存警告阈值(MB)
    memoryCriticalMB: number;         // 内存严重阈值(MB)
    leakDetectionFrames: number;      // 泄漏检测观察帧数
    leakThresholdKBPerFrame: number;  // 泄漏阈值(KB/frame)
    loadTimeoutMs: number;            // 加载超时阈值(ms)
    maxAlertsToKeep: number;          // 保留最大告警数
}

// ==================== 主类 ====================
export class PerformanceMonitor {
    private static _instance: PerformanceMonitor | null = null;

    public static get Instance(): PerformanceMonitor {
        if (!PerformanceMonitor._instance) {
            PerformanceMonitor._instance = new PerformanceMonitor();
        }
        return PerformanceMonitor._instance;
    }

    // ======== 配置 ========
    private _config: PerfMonitorConfig = {
        enabled: true,
        reportUrl: '',
        reportIntervalMs: 60000,       // 每60秒上报一次
        fpsWarningThreshold: 24,       // <24fps 警告
        fpsCriticalThreshold: 15,      // <15fps 严重
        jankFrameThreshold: 200,       // >200ms/帧 卡顿
        memoryWarningMB: 150,          // >150MB 警告
        memoryCriticalMB: 300,         // >300MB 严重
        leakDetectionFrames: 600,      // 观察600帧(~10s)
        leakThresholdKBPerFrame: 5,    // >5KB/frame 泄漏
        loadTimeoutMs: 15000,          // 15s超时
        maxAlertsToKeep: 50,
    };

    // ======== 内部状态 ========
    private _initialized: boolean = false;
    private _metrics: PerfMetrics = this.createEmptyMetrics();
    private _alerts: PerfAlert[] = [];

    // FPS 计算
    private _frameTimestamps: number[] = [];  // 最近N帧的时间戳
    private _lastFrameTime: number = 0;
    private _fpsHistory: number[] = [];       // 最近N秒的fps快照
    private _fpsHistoryMaxLength: number = 60; // 60个采样点

    // 内存追踪
    private _memoryHistory: { time: number; mb: number }[] = [];
    private _leakCheckCounter: number = 0;
    private _prevLeakCheckMemory: number = 0;

    // 计时器
    private _timers: Map<string, TimerEntry> = new Map();
    private _timerResults: Array<{ name: string; duration: number; category: string; tags?: Record<string, string> }> = [];

    // 上报定时器
    private _reportTimer: number | null = null;
    private _sessionStartTime: number = 0;

    /** 初始化性能监控 */
    init(config: Partial<PerfMonitorConfig>): void {
        Object.assign(this._config, config);
        this._sessionStartTime = Date.now();

        if (this._config.enabled) {
            this.startReportingCycle();
        }

        this._initialized = true;
        console.log('[PerformanceMonitor] initialized');
    }

    // ==================== 每帧调用（由 Client.update 驱动）====================

    /** 每帧更新 - 必须在 update() 中调用 */
    onUpdate(deltaTime: number): void {
        if (!this._initialized || !this._config.enabled) return;

        const now = performance.now();

        // 1. FPS 计算
        this.recordFrame(now);

        // 2. 帧耗时
        this._metrics.frameTime = now - this._lastFrameTime;
        this._lastFrameTime = now;

        // 3. 卡顿检测
        if (this._metrics.frameTime > this._config.jankFrameThreshold) {
            this._metrics.jankCount++;
            if (this._metrics.frameTime > this._config.jankFrameThreshold * 2) {
                this._metrics.severeJankCount++;
            }
        }

        // 4. 总帧数/掉帧
        this._metrics.totalFrames++;
        if (deltaTime > 0.05) { // >50ms 视为掉帧目标60fps
            this._metrics.droppedFrames++;
        }

        // 5. 运行时长
        this._metrics.uptimeSeconds = Math.floor((Date.now() - this._sessionStartTime) / 1000);

        // 6. 内存检查（每30帧一次）
        if (this._metrics.totalFrames % 30 === 0) {
            this.checkMemory();
        }

        // 7. 内存泄漏检测
        this._leakCheckCounter++;
        if (this._leakCheckCounter >= this._config.leakDetectionFrames) {
            this.detectMemoryLeak();
            this._leakCheckCounter = 0;
        }
    }

    // ==================== FPS 记录与计算 ====================

    private recordFrame(now: number): void {
        this._frameTimestamps.push(now);

        // 只保留最近1秒的帧
        const oneSecAgo = now - 1000;
        while (this._frameTimestamps.length > 0 && this._frameTimestamps[0] < oneSecAgo) {
            this._frameTimestamps.shift();
        }

        // 当前 FPS = 1秒内帧数
        this._metrics.fps = this._frameTimestamps.length;

        // 更新 min/max
        if (this._metrics.fps > 0) {
            if (this._metrics.fps < this._metrics.fpsMin || this._metrics.fpsMin === 0) {
                this._metrics.fpsMin = this._metrics.fps;
            }
            if (this._metrics.fps > this._metrics.fpsMax) {
                this._metrics.fpsMax = this._metrics.fps;
            }
        }

        // FPS 历史（每秒记录一个点）
        if (this._fpsHistory.length === 0 ||
            now - (this._fpsHistory[this._fpsHistory.length - 1] as any)._time > 1000) {
            this._fpsHistory.push({ _time: now, fps: this._metrics.fps } as any);
            if (this._fpsHistory.length > this._fpsHistoryMaxLength) {
                this._fpsHistory.shift();
            }
        }

        // 平均 FPS
        if (this._fpsHistory.length > 0) {
            const sum = this._fpsHistory.reduce((acc, entry) => acc + (entry as any).fps, 0);
            this._metrics.fpsAvg = Math.round(sum / this._fpsHistory.length * 10) / 10;
        }

        // FPS 告警
        if (this._metrics.fps < this._config.fpsCriticalThreshold && this._metrics.fps > 0) {
            this.addAlert(AlertType.LOW_FPS, AlertLevel.CRITICAL,
                `Critical low FPS: ${this._metrics.fps.toFixed(1)}`,
                this._metrics.fps, this._config.fpsCriticalThreshold);
        } else if (this._metrics.fps < this._config.fpsWarningThreshold && this._metrics.fps > 0) {
            this.addAlert(AlertType.LOW_FPS, AlertLevel.WARNING,
                `Low FPS: ${this._metrics.fps.toFixed(1)}`,
                this._metrics.fps, this._config.fpsWarningThreshold);
        }
    }

    // ==================== 内存监控 ====================

    private checkMemory(): void {
        const memInfo = (performance as any).memory;
        if (!memInfo) return;

        const usedMB = Math.floor(memInfo.usedJSHeapSize / (1024 * 1024));
        this._metrics.jsHeapMB = usedMB;

        this._memoryHistory.push({ time: Date.now(), mb: usedMB });
        // 保留最近5分钟的数据
        const fiveMinAgo = Date.now() - 300000;
        while (this._memoryHistory.length > 0 && this._memoryHistory[0].time < fiveMinAgo) {
            this._memoryHistory.shift();
        }

        // 内存告警
        if (usedMB > this._config.memoryCriticalMB) {
            this.addAlert(AlertType.HIGH_MEMORY, AlertLevel.CRITICAL,
                `Critical memory usage: ${usedMB}MB`,
                usedMB, this._config.memoryCriticalMB);
        } else if (usedMB > this._config.memoryWarningMB) {
            this.addAlert(AlertType.HIGH_MEMORY, AlertLevel.WARNING,
                `High memory usage: ${usedMB}MB`,
                usedMB, this._config.memoryWarningMB);
        }
    }

    private detectMemoryLeak(): void {
        if (this._memoryHistory.length < 10) return;

        const current = this._memoryHistory[this._memoryHistory.length - 1].mb;
        const oldest = this._memoryHistory[0].mb;
        const framesElapsed = this._config.leakDetectionFrames;
        const kbPerFrame = ((current - oldest) * 1024) / framesElapsed;

        if (kbPerFrame > this._config.leakThresholdKBPerFrame) {
            this._metrics.jsHeapTrend = 'critical';
            this.addAlert(AlertType.MEMORY_LEAK, AlertLevel.WARNING,
                `Possible memory leak: +${kbPerFrame.toFixed(1)}KB/frame over ~${Math.floor(framesElapsed / 60)}s`,
                kbPerFrame, this._config.leakThresholdKBPerFrame);
        } else if (kbPerFrame > 0) {
            this._metrics.jsHeapTrend = 'rising';
        } else {
            this._metrics.jsHeapTrend = 'stable';
        }

        this._prevLeakCheckMemory = current;
    }

    // ==================== 计时器 API（埋点用）====================

    /** 开始计时 */
    startTimer(name: string, category: string = 'general', tags?: Record<string, string>): void {
        if (this._timers.has(name)) {
            console.warn(`[PerformanceMonitor] Timer "${name}" already running, restarting`);
        }
        this._timers.set(name, { name, startTime: performance.now(), category, tags });
    }

    /** 结束计时 */
    endTimer(name: string): number | null {
        const entry = this._timers.get(name);
        if (!entry) {
            console.warn(`[PerformanceMonitor] Timer "${name}" not found`);
            return null;
        }

        const duration = performance.now() - entry.startTime;
        this._timerResults.push({
            name: name,
            duration: Math.round(duration),
            category: entry.category,
            tags: entry.tags,
        });

        this._timers.delete(name);

        // 超时检测
        if (category === 'load' && duration > this._config.loadTimeoutMs) {
            this.addAlert(AlertType.LOAD_TIMEOUT, AlertLevel.WARNING,
                `Load timeout: "${name}" took ${(duration / 1000).toFixed(1)}s`,
                duration, this._config.loadTimeoutMs);
        }

        return duration;
    }

    /** 包装异步操作的计时 */
    async timeAsync<T>(name: string, fn: () => Promise<T>, category: string = 'async'): Promise<T> {
        this.startTimer(name, category);
        try {
            return await fn();
        } finally {
            this.endTimer(name);
        }
    }

    /** 包装同步操作的计时 */
    timeSync<T>(name: string, fn: () => T, category: string = 'sync'): T {
        this.startTimer(name, category);
        try {
            return fn();
        } finally {
            this.endTimer(name);
        }
    }

    // ==================== 场景生命周期标记 ====================

    /** 标记场景开始加载 */
    markSceneLoadStart(sceneName: string): void {
        this.startTimer(`scene_${sceneName}`, 'scene_load');
        CrashReporter.Instance.setScene(sceneName);
    }

    /** 标记场景加载完成 */
    markSceneLoadEnd(sceneName: string): void {
        this.endTimer(`scene_${sceneName}`);
    }

    /** 标记游戏开始 */
    markGameStart(gameType: string): void {
        this.startTimer(`game_init_${gameType}`, 'game_init');
        CrashReporter.Instance.setGameType(gameType);
    }

    /** 标记游戏初始化完成 */
    markGameReady(gameType: string): void {
        this.endTimer(`game_init_${gameType}`);
    }

    /** 标记一局开始 */
    markRoundStart(gameType: string, roundIndex: number): void {
        this.startTimer(`round_${gameType}_${roundIndex}`, 'round');
    }

    /** 标记一局结束 */
    markRoundEnd(gameType: string, roundIndex: number): void {
        this.endTimer(`round_${gameType}_${roundIndex}`);
    }

    // ==================== 告警管理 ====================

    private addAlert(type: AlertType, level: AlertLevel, message: string, value: number, threshold: number, context?: string): void {
        // 同类型同级别去重（10秒内）
        const recent = this._alerts.find(a =>
            a.type === type && a.level === level &&
            Date.now() - a.timestamp < 10000
        );
        if (recent) return;

        const alert: PerfAlert = {
            id: `pa_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            type, level, message, value, threshold,
            timestamp: Date.now(), context,
        };
        this._alerts.push(alert);

        // 限制数量
        while (this._alerts.length > this._config.maxAlertsToKeep) {
            this._alerts.shift();
        }

        // Critical 同时上报到 CrashReporter
        if (level === AlertLevel.CRITICAL) {
            CrashReporter.Instance.report(
                require('./CrashReporter').CrashSeverity.WARNING,
                require('./CrashReporter').CrashType.GAME_LOGIC_ERROR,
                `[Perf] ${message}`,
                { alertType: type, value, threshold }
            );
        }
    }

    // ==================== 数据获取 ====================

    /** 获取当前性能快照 */
    getMetrics(): PerfMetrics {
        return { ...this._metrics };
    }

    /** 获取最近的告警 */
    getAlerts(level?: AlertLevel): PerfAlert[] {
        if (level) return this._alerts.filter(a => a.level === level);
        return [...this._alerts];
    }

    /** 获取计时结果 */
    getTimerResults(category?: string): typeof this._timerResults {
        if (category) return this._timerResults.filter(r => r.category === category);
        return [...this._timerResults];
    }

    /** 获取简化的健康状态摘要 */
    getHealthSummary(): { status: 'good' | 'fair' | 'poor' | 'critical'; issues: string[] } {
        const issues: string[] = [];

        if (this._metrics.fpsAvg > 0 && this._metrics.fpsAvg < this._config.fpsWarningThreshold) {
            issues.push(`平均FPS偏低(${this._metrics.fpsAvg})`);
        }
        if (this._metrics.jsHeapMB > this._config.memoryWarningMB) {
            issues.push(`内存使用较高(${this._metrics.jsHeapMB}MB)`);
        }
        if (this._metrics.jsHeapTrend === 'critical') {
            issues.push('可能存在内存泄漏');
        }
        if (this._metrics.jankCount > 10) {
            issues.push(`频繁卡顿(${this._metrics.jankCount}次)`);
        }

        let status: 'good' | 'fair' | 'poor' | 'critical' = 'good';
        if (issues.length >= 3 || this._metrics.fpsAvg < this._config.fpsCriticalThreshold) {
            status = 'critical';
        } else if (issues.length >= 2) {
            status = 'poor';
        } else if (issues.length >= 1) {
            status = 'fair';
        }

        return { status, issues };
    }

    // ==================== 上报 ====================

    private startReportingCycle(): void {
        if (!this._config.reportUrl) return;

        this._reportTimer = window.setInterval(() => {
            this.sendReport();
        }, this._config.reportIntervalMs) as unknown as number;
    }

    private async sendReport(): Promise<void> {
        if (!this._config.reportUrl) return;

        const payload = {
            type: 'performance_report',
            timestamp: Date.now(),
            metrics: this._metrics,
            alerts: this._alerts.filter(a => Date.now() - a.timestamp < this._config.reportIntervalMs),
            timers: this._timerResults.slice(-20), // 最近20条计时
            sessionDuration: this._metrics.uptimeSeconds,
            healthSummary: this.getHealthSummary(),
        };

        try {
            const response = await fetch(this._config.reportUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (response.ok) {
                // 清理已上报的旧告警和计时结果
                this._alerts = this._alerts.filter(a => Date.now() - a.timestamp < this._config.reportIntervalMs);
                if (this._timerResults.length > 20) {
                    this._timerResults = this._timerResults.slice(-20);
                }
            }
        } catch (e) {
            console.warn('[PerformanceMonitor] Report failed:', e);
        }
    }

    /** 手动触发上报 */
    async flush(): Promise<void> {
        await this.sendReport();
    }

    // ==================== 工具方法 ====================

    private createEmptyMetrics(): PerfMetrics {
        return {
            fps: 0, fpsAvg: 0, fpsMin: 0, fpsMax: 0, frameTime: 0,
            jankCount: 0, severeJankCount: 0,
            jsHeapMB: 0, jsHeapTrend: 'stable',
            uptimeSeconds: 0, totalFrames: 0, droppedFrames: 0,
        };
    }

    /** 启用/禁用 */
    setEnabled(enabled: boolean): void {
        this._config.enabled = enabled;
        if (enabled && !this._reportTimer) {
            this.startReportingCycle();
        } else if (!enabled && this._reportTimer) {
            clearInterval(this._reportTimer);
            this._reportTimer = null;
        }
    }

    /** 重置所有指标 */
    resetMetrics(): void {
        this._metrics = this.createEmptyMetrics();
        this._frameTimestamps = [];
        this._fpsHistory = [];
        this._memoryHistory = [];
        this._alerts = [];
        this._timerResults = [];
        this._sessionStartTime = Date.now();
        this._leakCheckCounter = 0;
    }

    /** 清理 */
    dispose(): void {
        if (this._reportTimer) {
            clearInterval(this._reportTimer);
            this._reportTimer = null;
        }
        this.resetMetrics();
        PerformanceMonitor._instance = null;
    }
}
