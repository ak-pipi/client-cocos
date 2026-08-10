/**
 * 崩溃日志上报系统 (CrashReporter)
 *
 * 功能：
 * 1. 全局 JS 异常捕获 (window.onerror / unhandledrejection / Cocos error)
 * 2. 错误分类：JS错误 / 资源加载失败 / 网络异常 / 游戏逻辑异常
 * 3. 本地持久化（崩溃日志缓存，网络恢复后批量上传）
 * 4. 上报策略：实时上报 + 批量补传 + 防抖/去重
 * 5. 设备信息 + 用户信息 + 场景上下文自动附加
 */
import { _decorator, sys, game, view, sys as ccSys } from 'cc';

// ==================== 崩溃类型 ====================
export enum CrashType {
    JS_ERROR = 'js_error',                // JavaScript 运行时错误
    UNHANDLED_REJECTION = 'promise_error', // 未捕获的 Promise rejection
    RESOURCE_LOAD_ERROR = 'resource_error',// 资源加载失败
    NETWORK_ERROR = 'network_error',       // 网络异常
    GAME_LOGIC_ERROR = 'logic_error',      // 游戏逻辑异常（手动报告）
    NATIVE_CRASH = 'native_crash',         // 原生层崩溃
    OOM = 'oom',                          // 内存溢出
    ANR = 'anr',                          // 应用无响应
}

// ==================== 严重等级 ====================
export enum CrashSeverity {
    FATAL = 'fatal',      // 致命：导致应用崩溃/无法恢复
    ERROR = 'error',      // 错误：功能异常但可继续
    WARNING = 'warning',  // 警告：非预期但不影响主流程
    INFO = 'info',        // 信息：记录用途
}

// ==================== 崩溃报告数据结构 ====================
export interface CrashReport {
    id: string;                    // 唯一ID
    type: CrashType;
    severity: CrashSeverity;
    message: string;               // 错误消息
    stack?: string;                // 堆栈信息
    timestamp: number;             // 时间戳(ms)

    // === 环境上下文 ===
    scene?: string;                // 当前场景
    gameType?: string;             // 当前游戏类型
    userId?: string;               // 用户ID

    // === 设备信息 ===
    deviceInfo: DeviceInfo;

    // === 附加自定义数据 ===
    extraData?: Record<string, any>;

    // === 上报状态 ===
    reported: boolean;             // 是否已上报
    retryCount: number;            // 重试次数
}

export interface DeviceInfo {
    platform: string;              // 运行平台
    osVersion: string;             // OS版本
    deviceModel: string;           // 设备型号
    screenWidth: number;
    screenHeight: number;
    language: string;
    engineVersion: string;         // Cocos引擎版本
    appVersion: string;            // 应用版本
    memoryUsage: number;           // 当前内存使用(MB)
    isLowMemory: boolean;          // 是否低内存设备
}

// ==================== 上报配置 ====================
export interface ReporterConfig {
    reportUrl: string;              // 上报服务器地址
    maxCacheSize: number;           // 最大缓存条数(本地)
    batchSize: number;              // 批量上报条数
    retryMaxAttempts: number;       // 最大重试次数
    retryDelayMs: number;           // 重试间隔(ms)
    enableRealTimeReport: boolean;  // 是否实时上报(FATAL级别始终实时)
    sampleRate: number;             // 采样率 0-1 (1=全部采集)
    deduplicateWindowMs: number;    // 去重窗口期(ms), 相同错误不重复上报
}

// ==================== 主类 ====================
export class CrashReporter {
    private static _instance: CrashReporter | null = null;

    public static get Instance(): CrashReporter {
        if (!CrashReporter._instance) {
            CrashReporter._instance = new CrashReporter();
        }
        return CrashReporter._instance;
    }

    // ======== 配置 ========
    private _config: ReporterConfig = {
        reportUrl: '',
        maxCacheSize: 50,
        batchSize: 5,
        retryMaxAttempts: 3,
        retryDelayMs: 5000,
        enableRealTimeReport: true,
        sampleRate: 1.0,
        deduplicateWindowMs: 10000,
    };

    // ======== 内部状态 ========
    private _initialized: boolean = false;
    private _cache: CrashReport[] = [];
    private _recentErrors: Map<string, number> = new Map(); // 去重用
    private _sceneContext: string = '';
    private _gameContext: string = '';
    private _userId: string = '';
    private _customContext: Record<string, any> = {};

    /** 初始化并注册全局异常捕获 */
    init(config: Partial<ReporterConfig>): void {
        Object.assign(this._config, config);
        if (!this._config.reportUrl) {
            console.warn('[CrashReporter] No reportUrl configured, reports will be cached only');
        }

        this.loadCachedReports();
        this.registerGlobalHandlers();
        this._initialized = true;
        console.log('[CrashReporter] initialized');
    }

    // ==================== 全局异常捕获注册 ====================
    private registerGlobalHandlers(): void {
        const hasWindow = typeof window !== 'undefined';
        const hasDocument = typeof document !== 'undefined';

        if (hasWindow) {
            const anyWindow = window as any;
            const prevOnError = anyWindow.onerror;
            anyWindow.onerror = (message, source, lineno, colno, error) => {
                this.captureError(error || new Error(String(message)), CrashType.JS_ERROR);
                if (prevOnError) return prevOnError(message, source, lineno, colno, error);
                return false;
            };

            const prevOnUnhandled = anyWindow.onunhandledrejection;
            anyWindow.onunhandledrejection = (event) => {
                this.captureError(
                    event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
                    CrashType.UNHANDLED_REJECTION
                );
                if (prevOnUnhandled) prevOnUnhandled(event);
            };
        }

        // Cocos Creator 错误
        game.on(game.EVENT_RENDERER_INIT_FAIL, () => {
            this.report(CrushSeverity.ERROR, CrashType.JS_ERROR, 'Renderer initialization failed');
        });

        // 内存警告
        if ((ccSys as any).on) {
            (ccSys as any).on(sys.Event.MEMORY_WARNING, () => {
                this.report(CrashSeverity.WARNING, CrashType.OOM, 'Low memory warning received');
            });
        }

        if (hasWindow && typeof window.addEventListener === 'function') {
            window.addEventListener('beforeunload', () => {
                this.saveCache();
            });
        }

        // 页面可见性变化 - 恢复后尝试补传
        if (!hasDocument || typeof document.addEventListener !== 'function') return;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.flushCachedReports();
            }
        });
    }

    // ==================== 核心捕获方法 ====================

    /**
     * 捕获 Error 对象，自动提取堆栈和分类
     */
    captureError(error: Error, type: CrashType = CrashType.JS_ERROR): void {
        if (!this._initialized) return;
        if (Math.random() > this._config.sampleRate) return;

        const severity = this.classifySeverity(type);

        const report: CrashReport = {
            id: this.generateId(),
            type,
            severity,
            message: error.message || String(error),
            stack: error.stack || '',
            timestamp: Date.now(),
            scene: this._sceneContext,
            gameType: this._gameContext,
            userId: this._userId,
            deviceInfo: this.collectDeviceInfo(),
            extraData: { ...this._customContext },
            reported: false,
            retryCount: 0,
        };

        this.processReport(report);
    }

    /**
     * 手动上报崩溃/错误（游戏逻辑层调用）
     */
    report(severity: CrashSeverity, type: CrashType, message: string, extraData?: Record<string, any>, stack?: string): void {
        if (!this._initialized) return;

        const report: CrashReport = {
            id: this.generateId(),
            type,
            severity,
            message,
            stack: stack || new Error().stack,
            timestamp: Date.now(),
            scene: this._sceneContext,
            gameType: this._gameContext,
            userId: this._userId,
            deviceInfo: this.collectDeviceInfo(),
            extraData: { ...this._customContext, ...extraData },
            reported: false,
            retryCount: 0,
        };

        this.processReport(report);
    }

    /**
     * 快捷方法：资源加载失败
     */
    reportResourceError(url: string, error?: Error): void {
        this.report(CrashSeverity.ERROR, CrashType.RESOURCE_LOAD_ERROR,
            `Resource load failed: ${url}`, { resourceUrl: url },
            error?.stack);
    }

    /**
     * 快捷方法：网络异常
     */
    reportNetworkError(action: string, statusCode?: number, errorMsg?: string): void {
        this.report(CrashSeverity.WARNING, CrashType.NETWORK_ERROR,
            `Network error [${action}]: ${statusCode || ''} ${errorMsg || ''}`,
            { action, statusCode });
    }

    /**
     * 快捷方法：游戏逻辑异常
     */
    reportLogicError(context: string, message: string, data?: any): void {
        this.report(CrashSeverity.ERROR, CrashType.GAME_LOGIC_ERROR,
            `[${context}] ${message}`, data);
    }

    // ==================== 处理流程 ====================

    private processReport(report: CrashReport): void {
        // 去重检查
        const dedupeKey = `${report.type}:${report.message}`;
        const lastTime = this._recentErrors.get(dedupeKey) || 0;
        if (Date.now() - lastTime < this._config.deduplicateWindowMs) {
            console.log(`[CrashReporter] Dropped duplicate: ${dedupeKey}`);
            return;
        }
        this._recentErrors.set(dedupeKey, Date.now());

        console.warn(`[CrashReporter] Captured [${report.type}] ${report.message}`);

        // FATAL 级别或开启实时上报 → 立即尝试
        if (report.severity === CrashSeverity.FATAL || this._config.enableRealTimeReport) {
            this.sendReport(report);
        } else {
            // 缓存等待批量上报
            this.addToCache(report);
        }
    }

    private addToCache(report: CrashReport): void {
        this._cache.push(report);
        if (this._cache.length >= this._config.batchSize) {
            this.flushCachedReports();
        } else {
            this.saveCache();
        }
    }

    // ==================== 上报逻辑 ====================

    private async sendReport(report: CrashReport): Promise<void> {
        if (!this._config.reportUrl) {
            report.reported = true;
            this.addToCache(report);
            return;
        }
        if (typeof fetch !== 'function') {
            this.addToCache(report);
            return;
        }

        try {
            const response = await fetch(this._config.reportUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.serializeReport(report)),
            });

            if (response.ok) {
                report.reported = true;
                console.log(`[CrashReporter] Report ${report.id} sent successfully`);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            report.retryCount++;
            if (report.retryCount < this._config.retryMaxAttempts) {
                setTimeout(() => this.sendReport(report), this._config.retryDelayMs * report.retryCount);
            } else {
                // 重试耗尽，加入缓存等下次
                console.warn(`[CrashReporter] Report ${report.id} failed after ${report.retryCount} retries`);
                this.addToCache(report);
            }
        }
    }

    private async flushCachedReports(): Promise<void> {
        if (!this._cache.length || !this._config.reportUrl) return;
        if (typeof fetch !== 'function') return;

        const batch = this._cache.splice(0, this._config.batchSize);
        try {
            const response = await fetch(this._config.reportUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'batch',
                    reports: batch.map(r => this.serializeReport(r)),
                    count: batch.length,
                }),
            });

            if (response.ok) {
                console.log(`[CrashReporter] Batch sent ${batch.length} reports`);
            } else {
                // 失败放回缓存
                this._cache.unshift(...batch);
            }
        } catch (error) {
            this._cache.unshift(...batch);
        }

        this.saveCache();
    }

    // ==================== 上下文管理 ====================

    /** 设置当前场景 */
    setScene(scene: string): void {
        this._sceneContext = scene;
    }

    /** 设置当前游戏 */
    setGameType(gameType: string): void {
        this._gameContext = gameType;
    }

    /** 设置用户ID */
    setUserId(userId: string): void {
        this._userId = userId;
    }

    /** 添加自定义上下文字段 */
    addContext(key: string, value: any): void {
        this._customContext[key] = value;
    }

    /** 清除自定义上下文 */
    clearContext(): void {
        this._customContext = {};
    }

    // ==================== 工具方法 ====================

    private classifySeverity(type: CrashType): CrashSeverity {
        switch (type) {
            case CrashType.NATIVE_CRASH:
            case CrashType.OOM:
            case CrashType.ANR:
                return CrashSeverity.FATAL;
            case CrashType.JS_ERROR:
            case CrashType.UNHANDLED_REJECTION:
                return CrashSeverity.ERROR;
            case CrashType.RESOURCE_LOAD_ERROR:
            case CrashType.NETWORK_ERROR:
                return CrashSeverity.WARNING;
            default:
                return CrashSeverity.INFO;
        }
    }

    private collectDeviceInfo(): DeviceInfo {
        const screenSize = view.getVisibleSize();
        const memoryUsage = this.getMemoryUsageMB();
        return {
            platform: ccSys.platform || 'unknown',
            osVersion: ccSys.os || 'unknown',
            deviceModel: (ccSys as any).deviceModel || 'unknown',
            screenWidth: Math.floor(screenSize.width),
            screenHeight: Math.floor(screenSize.height),
            language: ccSys.language || 'zh-CN',
            engineVersion: (ccSys as any).engineVersion || 'unknown',
            appVersion: this.getAppVersion(),
            memoryUsage,
            isLowMemory: (ccSys as any).isNative ? (ccSys as any).totalMemory < (512 * 1024 * 1024) : false,
        };
    }

    private getMemoryUsageMB(): number {
        try {
            const memory = typeof performance !== 'undefined' ? (performance as any).memory : null;
            return Math.floor((memory?.usedJSHeapSize || 0) / (1024 * 1024)) || 0;
        } catch {
            return 0;
        }
    }

    private getAppVersion(): string {
        // 尝试从 localStorage 或全局配置获取版本号
        return sys.localStorage.getItem('app_version') || '1.0.0';
    }

    private serializeReport(report: CrashReport): any {
        return {
            id: report.id,
            type: report.type,
            severity: report.severity,
            message: report.message,
            stack: report.stack,
            timestamp: report.timestamp,
            scene: report.scene,
            gameType: report.gameType,
            userId: report.userId,
            deviceInfo: report.deviceInfo,
            extraData: report.extraData,
        };
    }

    private generateId(): string {
        return `cr_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    }

    // ==================== 持久化 ====================
    private saveCache(): void {
        try {
            // 只保存未上报的报告
            const pending = this._cache.filter(r => !r.reported);
            sys.localStorage.setItem('crash_reporter_cache', JSON.stringify(pending.slice(0, this._config.maxCacheSize)));
        } catch (e) {
            console.warn('[CrashReporter] Failed to save cache:', e);
        }
    }

    private loadCachedReports(): void {
        try {
            const raw = sys.localStorage.getItem('crash_reporter_cache');
            if (raw) {
                this._cache = JSON.parse(raw);
                console.log(`[CrashReporter] Loaded ${this._cache.length} cached reports`);
            }
        } catch (e) {
            /* ignore */
        }
    }

    /** 获取待上报数量 */
    getPendingCount(): number {
        return this._cache.filter(r => !r.reported).length;
    }

    /** 手动触发批量上报 */
    async flush(): Promise<void> {
        await this.flushCachedReports();
    }
}

// 兼容性别名
const CrushSeverity = CrashSeverity;
