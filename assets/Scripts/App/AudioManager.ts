/**
 * 音频管理器 (AudioManager) - 全局音效引擎
 *
 * 能力清单：
 * - 多音轨独立音量控制 (BGM/SFX/Voice/Env/Reward)
 * - 短音效池化（低延迟、防 GC）
 * - 预加载系统（按需/批量）
 * - BGM 淡入淡出
 * - 后台自动暂停 / 前台恢复
 * - 静默模式检测
 * - 音量持久化
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, AudioSource, AudioClip, resources, AssetManager, director, game } from 'cc';

// ==================== 类型定义 ====================

/** 音频轨道类型 */
export enum AudioChannel {
    BGM = 'bgm',           // 背景音乐
    SFX = 'sfx',            // 操作音效
    StrongFeedback = 'strong', // 强反馈(胡牌/炸弹等)
    Voice = 'voice',        // 语音播报
    Environment = 'env',    // 环境音
    Reward = 'reward',      // 金币奖励音效
}

/** 音轨配置 */
export interface ChannelConfig {
    /** 默认音量 (0-1) */
    defaultVolume: number;
    /** 最大同时播放数 */
    maxConcurrent: number;
    /** 是否循环 */
    loop?: boolean;
}

/** 音频预加载条目 */
export interface AudioPreloadItem {
    /** 资源路径 */
    path: string;
    /** 所属轨道 */
    channel: AudioChannel;
    /** 是否立即加载 */
    immediate?: boolean;
}

/** 播放选项 */
export interface PlayOptions {
    /** 播放音量 (覆盖当前通道音量，0-1) */
    volume?: number;
    /** 是否循环 */
    loop?: boolean;
    /** 播放完成后回调 */
    onComplete?: () => void;
    /** 延迟播放(秒) */
    delay?: number;
}

/** 音量设置快照 */
export interface VolumeSnapshot {
    bgm: number;
    sfx: number;
    strong: number;
    voice: number;
    env: number;
    reward: number;
    master: number;         // 总体静音开关 (0或1)
}

@ccclass('AudioManager')
export class AudioManager {
    private static _instance: AudioManager | null = null;

    public static get Instance(): AudioManager {
        if (!AudioManager._instance) {
            AudioManager._instance = new AudioManager();
        }
        return AudioManager._instance;
    }

    // ==================== 单例状态 ====================

    /** 各通道音量 (0-1) */
    private volumes: Map<AudioChannel, number> = new Map();

    /** 总体音量 (0=全部静音, 1=正常) */
    private masterVolume: number = 1;

    /** BGM AudioSource 组件 */
    private bgmSource: AudioSource | null = null;

    /** BGM 宿主节点 */
    private bgmNode: Node | null = null;

    /** 当前正在播放的 BGM 名 */
    private currentBGMName: string = '';

    /** BGM 目标淡入淡出音量 */
    private targetBGMVolume: number = 0;

    /** 当前实际 BGM 音量 */
    private currentBGMVolume: number = 0;

    /** 音效池 (已加载的 AudioClip) */
    private clipPool: Map<string, AudioClip> = new Map();

    /** 正在播放的 SFX 列表 */
    private activeSFX: Array<{ source: AudioSource; node: Node; startTime: number }> = [];

    /** 预加载队列 */
    private preloadQueue: AudioPreloadItem[] = [];

    /** 正在预加载的标记 */
    private preloading: Set<string> = new Set();

    /** 已初始化 */
    private initialized: boolean = false;

    /** 是否在后台 */
    private isBackground: boolean = false;

    // ==================== 默认配置 ====================

    /** 各通道默认音量 (按 DEV_PLAN.md 规范) */
    static readonly DEFAULT_VOLUMES: Record<AudioChannel, number> = {
        [AudioChannel.BGM]: 0.35,
        [AudioChannel.SFX]: 0.80,
        [AudioChannel.StrongFeedback]: 1.00,
        [AudioChannel.Voice]: 0.90,
        [AudioChannel.Environment]: 0.25,
        [AudioChannel.Reward]: 0.90,
    };

    /** 各通道最大并发数 */
    static readonly CHANNEL_CONFIG: Map<AudioChannel, ChannelConfig> = new Map([
        [AudioChannel.BGM, { defaultVolume: 0.35, maxConcurrent: 1, loop: true }],
        [AudioChannel.SFX, { defaultVolume: 0.80, maxConcurrent: 8 }],
        [AudioChannel.StrongFeedback, { defaultVolume: 1.0, maxConcurrent: 4 }],
        [AudioChannel.Voice, { defaultVolume: 0.90, maxConcurrent: 2 }],
        [AudioChannel.Environment, { defaultVolume: 0.25, maxConcurrent: 2, loop: true }],
        [AudioChannel.Reward, { defaultVolume: 0.90, maxConcurrent: 4 }],
    ]);

    /** 本地存储 key */
    private static readonly STORAGE_KEY = 'audio_volumes';

    // ==================== 构造与初始化 ====================

    private constructor() {}

    /**
     * 初始化音频管理器
     * 应在应用启动时调用一次
     */
    public init(): void {
        if (this.initialized) return;

        // 加载保存的音量设置
        this.loadVolumesFromStorage();

        // 创建 BGM 宿主节点
        this.createBGMNode();

        // 注册前后台事件
        this.registerLifecycleEvents();

        this.initialized = true;
        console.log('[AudioManager] Initialized');
    }

    /**
     * 创建 BGM 播放节点
     */
    private createBGMNode(): void {
        this.bgmNode = new Node('AudioManager_BGM');
        this.bgmSource = this.bgmNode.addComponent(AudioSource);
        this.bgmSource.loop = true;
        // 保持常驻
        if (!this.bgmNode.parent) {
            const scene = director.getScene();
            if (scene) {
                this.bgmNode.parent = scene;
            }
        }
    }

    /**
     * 注册生命周期事件
     */
    private registerLifecycleEvents(): void {
        game.on(game.EVENT_HIDE, this.onPause, this);
        game.on(game.EVENT_SHOW, this.onResume, this);
    }

    // ==================== BGM 控制 ====================

    /**
     * 播放背景音乐
     * @param path BGM 资源路径 (resources 下)
     * @param fadeIn 淡入时长(秒)
     */
    public playBGM(path: string, fadeIn: number = 1.0): void {
        // 如果是同一首 BGM，不做处理
        if (this.currentBGMName === path && this.isBGMPlaying()) {
            return;
        }

        // 先停止当前 BGM
        if (this.bgmSource && this.currentBGMName) {
            this.stopBGM(0.5);
        }

        this.currentBGMName = path;

        // 从池中获取或从资源加载
        const cachedClip = this.clipPool.get(`bgm:${path}`);
        if (cachedClip) {
            this.playBGMWithClip(cachedClip, fadeIn);
        } else {
            resources.load(path, AudioClip, (err, clip) => {
                if (err || !clip) {
                    console.error(`[AudioManager] Failed to load BGM: ${path}`, err);
                    return;
                }
                this.clipPool.set(`bgm:${path}`, clip);
                this.playBGMWithClip(clip, fadeIn);
            });
        }
    }

    /**
     * 用指定 AudioClip 播放 BGM
     */
    private playBGMWithClip(clip: AudioClip, fadeIn: number): void {
        if (!this.bgmSource || !this.bgmNode) return;

        this.bgmSource.clip = clip;
        this.targetBGMVolume = this.getEffectiveVolume(AudioChannel.BGM);

        if (fadeIn > 0) {
            // 淡入：从 0 开始渐变到目标音量
            this.currentBGMVolume = 0;
            this.bgmSource.volume = 0;
        } else {
            this.currentBGMVolume = this.targetBGMVolume;
            this.bgmSource.volume = this.currentBGMVolume;
        }

        this.bgmSource.play();

        if (fadeIn > 0) {
            this.startFadeIn(fadeIn);
        }
    }

    /**
     * 停止 BGM
     * @param fadeOut 淡出时长(秒)
     */
    public stopBGM(fadeOut: number = 0.5): void {
        if (!this.bgmSource) return;

        if (fadeOut > 0 && this.bgmSource.playing) {
            this.startFadeOut(fadeOut, () => {
                this.doStopBGM();
            });
        } else {
            this.doStopBGM();
        }
    }

    private doStopBGM(): void {
        if (this.bgmSource) {
            this.bgmSource.stop();
            this.bgmSource.clip = null;
        }
        this.currentBGMName = '';
        this.currentBGMVolume = 0;
    }

    public isBGMPlaying(): boolean {
        return this.bgmSource?.playing ?? false;
    }

    // ==================== SFX / 音效播放 ====================

    /**
     * 播放短音效（核心方法）
     * @param path 音效资源路径(resources 下相对)
     * @param channel 所属通道
     * @param options 播放选项
     */
    public play(path: string, channel: AudioChannel = AudioChannel.SFX, options?: PlayOptions): void {
        // 总体静音时直接跳过
        if (this.masterVolume <= 0) return;

        // 检查该通道是否静音
        const chVol = this.volumes.get(channel) ?? AudioManager.DEFAULT_VOLUMES[channel];
        if (chVol <= 0) return;

        // 检查最大并发数
        const config = AudioManager.CHANNEL_CONFIG.get(channel);
        if (config && this.countActiveInChannel(channel) >= config.maxConcurrent) {
            console.warn(`[AudioManager] Channel ${channel} at max concurrent`);
            // 回收最早的 SFX
            this.recycleOldestSFX(channel);
        }

        // 尝试从缓存获取
        let clip = this.clipPool.get(`${channel}:${path}`);

        if (clip) {
            this.playClipImmediate(clip, channel, options);
        } else {
            // 未缓存则异步加载后播放
            resources.load(path, AudioClip, (err, loadedClip) => {
                if (err || !loadedClip) {
                    console.warn(`[AudioManager] Failed to load SFX: ${path}`, err?.message || '');
                    return;
                }
                this.clipPool.set(`${channel}:${path}`, loadedClip);
                this.playClipImmediate(loadedClip, channel, options);
            });
        }
    }

    /**
     * 立即播放一个已加载的 AudioClip
     */
    private playClipImmediate(clip: AudioClip, channel: AudioChannel, options?: PlayOptions): void {
        // 创建临时节点 + AudioSource 来播放
        const sfxNode = new Node('sfx_' + Date.now());
        const source = sfxNode.addComponent(AudioSource);

        source.clip = clip;
        source.loop = options?.loop ?? false;
        
        // 计算最终音量
        const chVol = this.volumes.get(channel) ?? AudioManager.DEFAULT_VOLUMES[channel];
        const finalVol = (options?.volume ?? 1.0) * chVol * this.masterVolume;
        source.volume = Math.max(0, Math.min(1, finalVol));

        // 挂载到场景
        const scene = director.getScene();
        if (scene) {
            sfxNode.parent = scene;
        }

        // 延迟播放
        const delay = options?.delay ?? 0;
        if (delay > 0) {
            this.scheduleOnce(() => {
                if (source.isValid) {
                    source.play();
                }
            }, delay);
        } else {
            source.play();
        }

        // 记录活跃 SFX
        this.activeSFX.push({ source, node: sfxNode, startTime: Date.now() });

        // 非循环音效播完后自动回收
        if (!source.loop) {
            const duration = clip.duration;
            this.scheduleOnce(() => {
                this.recycleSFX(sfxNode);
                options?.onComplete?.();
            }, duration + 0.1); // 小缓冲
        }
    }

    // ==================== 快捷播放方法 ====================

    /** 播放麻将操作音效 */
    public playMahjongSFX(action: string): void {
        const path = `audio/mahjong/${action}`;
        const channel = this.getActionChannel(action);
        this.play(path, channel);
    }

    /** 播放扑克操作音效 */
    public playPokerSFX(action: string): void {
        const path = `audio/poker/${action}`;
        const channel = this.getActionChannel(action);
        this.play(path, channel);
    }

    /** 播放字牌操作音效 */
    public playZipaiSFX(action: string): void {
        const path = `audio/zipai/${action}`;
        const channel = this.getActionChannel(action);
        this.play(path, channel);
    }

    /** 播放 UI 操作音效 */
    public playUISFX(name: string): void {
        this.play(`audio/ui/${name}`, AudioChannel.SFX);
    }

    /** 播放强反馈音效 */
    public playStrongFeedback(name: string): void {
        this.play(`audio/feedback/${name}`, AudioChannel.StrongFeedback);
    }

    /** 播放奖励音效 */
    public playReward(name: string = 'coin'): void {
        this.play(`audio/reward/${name}`, AudioChannel.Reward);
    }

    /**
     * 根据操作类型判断使用哪个通道
     */
    private getActionChannel(action: string): AudioChannel {
        const strongActions = ['hu', 'zimo', 'gangkai', 'bomb', 'rocket', 'pao', 'haidilao'];
        if (strongActions.some(a => action.includes(a))) {
            return AudioChannel.StrongFeedback;
        }
        return AudioChannel.SFX;
    }

    // ==================== 预加载 ====================

    /**
     * 批量预加载音效
     * @param items 预加载列表
     */
    public preload(items: AudioPreloadItem[]): void {
        this.preloadQueue.push(...items);
        this.processPreloadQueue();
    }

    /**
     * 预加载单个游戏的全部音效
     */
    public preloadGameSounds(gameId: string): void {
        const items = this.getGameSoundList(gameId);
        this.preload(items);
    }

    private processPreloadQueue(): void {
        while (this.preloadQueue.length > 0) {
            const item = this.preloadQueue.shift()!;
            const key = `${item.channel}:${item.path}`;
            
            if (this.clipPool.has(key) || this.preloading.has(key)) continue;
            
            this.preloading.add(key);
            resources.load(item.path, AudioClip, (err, clip) => {
                this.preloading.delete(key);
                if (err || !clip) {
                    console.warn(`[AudioManager] Preload failed: ${item.path}`);
                    return;
                }
                this.clipPool.set(key, clip);
            });
        }
    }

    // ==================== 音量控制 ====================

    /**
     * 设置某通道音量
     */
    public setChannelVolume(channel: AudioChannel, volume: number): void {
        const v = Math.max(0, Math.min(1, volume));
        this.volumes.set(channel, v);

        // 如果是 BGM 通道，实时更新
        if (channel === AudioChannel.BGM && this.bgmSource) {
            this.targetBGMVolume = this.getEffectiveVolume(AudioChannel.BGM);
            this.bgmSource.volume = this.targetBGMVolume;
        }

        this.saveVolumesToStorage();
    }

    /**
     * 获取某通道音量
     */
    public getChannelVolume(channel: AudioChannel): number {
        return this.volumes.get(channel) ?? AudioManager.DEFAULT_VOLUMES[channel];
    }

    /**
     * 设置总体音量 (总开关)
     */
    public setMasterVolume(volume: number): void {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        
        // 更新 BGM
        if (this.bgmSource) {
            this.bgmSource.volume = this.getEffectiveVolume(AudioChannel.BGM);
        }

        this.saveVolumesToStorage();
    }

    public getMasterVolume(): number {
        return this.masterVolume;
    }

    /** 获取考虑了总体音量的有效音量 */
    private getEffectiveVolume(channel: AudioChannel): number {
        const chVol = this.volumes.get(channel) ?? AudioManager.DEFAULT_VOLUMES[channel];
        return chVol * this.masterVolume;
    }

    /** 静音切换 */
    public toggleMute(): boolean {
        if (this.masterVolume > 0) {
            this.setMasterVolume(0);
            return true;
        } else {
            this.setMasterVolume(1);
            return false;
        }
    }

    public isMuted(): boolean {
        return this.masterVolume <= 0;
    }

    // ==================== 淡入淡出 ====================

    private fadeInTimer: number | null = null;
    private fadeOutTimer: number | null = null;
    private fadeOutCallback: (() => void) | null = null;

    private startFadeIn(duration: number): void {
        if (this.fadeInTimer !== null) clearInterval(this.fadeInTimer);
        const stepTime = 0.03; // 30ms 每步
        const steps = Math.ceil(duration / stepTime);
        const delta = this.targetBGMVolume / steps;
        let current = 0;

        this.fadeInTimer = setInterval(() => {
            current += delta;
            if (current >= this.targetBGMVolume) {
                current = this.targetBGMVolume;
                if (this.fadeInTimer !== null) {
                    clearInterval(this.fadeInTimer);
                    this.fadeInTimer = null;
                }
            }
            if (this.bgmSource) {
                this.bgmSource.volume = current;
                this.currentBGMVolume = current;
            }
        }, stepTime * 1000) as unknown as number;
    }

    private startFadeOut(duration: number, callback?: () => void): void {
        if (this.fadeOutTimer !== null) clearInterval(this.fadeOutTimer);
        this.fadeOutCallback = callback || null;
        const stepTime = 0.03;
        const steps = Math.ceil(duration / stepTime);
        const delta = this.currentBGMVolume / steps;
        let current = this.currentBGMVolume;

        this.fadeOutTimer = setInterval(() => {
            current -= delta;
            if (current <= 0) {
                current = 0;
                if (this.fadeOutTimer !== null) {
                    clearInterval(this.fadeOutTimer);
                    this.fadeOutTimer = null;
                }
                this.doStopBGM();
                this.fadeOutCallback?.();
                this.fadeOutCallback = null;
                return;
            }
            if (this.bgmSource) {
                this.bgmSource.volume = current;
                this.currentBGMVolume = current;
            }
        }, stepTime * 1000) as unknown as number;
    }

    // ==================== SFX 回收 ====================

    private countActiveInChannel(_channel: AudioChannel): number {
        return this.activeSFX.length;
    }

    private recycleOldestSFX(_channel: AudioChannel): void {
        if (this.activeSFX.length === 0) return;
        const oldest = this.activeSFX.shift();
        if (oldest) {
            this.recycleSFX(oldest.node);
        }
    }

    private recycleSFX(node: Node): void {
        const idx = this.activeSFX.findIndex(s => s.node === node);
        if (idx >= 0) this.activeSFX.splice(idx, 1);

        if (node && node.isValid) {
            const source = node.getComponent(AudioSource);
            if (source) {
                try { source.stop(); } catch (_) {}
            }
            node.destroy();
        }
    }

    // ==================== 前后台 ====================

    private onPause(): void {
        this.isBackground = true;
        // 暂停 BGM
        if (this.bgmSource?.playing) {
            this.bgmSource.pause();
        }
        // 暂停所有活跃 SFX
        for (const s of [...this.activeSFX]) {
            try { s.source?.stop(); } catch (_) {}
            this.recycleSFX(s.node);
        }
    }

    private onResume(): void {
        this.isBackground = false;
        // 恢复 BGM
        if (this.bgmSource && !this.bgmSource.playing && this.bgmSource.clip) {
            this.bgmSource.play();
        }
    }

    // ==================== 持久化 ====================

    private loadVolumesFromStorage(): void {
        try {
            const saved = localStorage.getItem(AudioManager.STORAGE_KEY);
            if (saved) {
                const data: VolumeSnapshot = JSON.parse(saved);
                this.masterVolume = data.master ?? 1;
                this.volumes.set(AudioChannel.BGM, data.bgm ?? AudioManager.DEFAULT_VOLUMES[AudioChannel.BGM]);
                this.volumes.set(AudioChannel.SFX, data.sfx ?? AudioManager.DEFAULT_VOLUMES[AudioChannel.SFX]);
                this.volumes.set(AudioChannel.StrongFeedback, data.strong ?? AudioManager.DEFAULT_VOLUMES[AudioChannel.StrongFeedback]);
                this.volumes.set(AudioChannel.Voice, data.voice ?? AudioManager.DEFAULT_VOLUMES[AudioChannel.Voice]);
                this.volumes.set(AudioChannel.Environment, data.env ?? AudioManager.DEFAULT_VOLUMES[AudioChannel.Environment]);
                this.volumes.set(AudioChannel.Reward, data.reward ?? AudioManager.DEFAULT_VOLUMES[AudioChannel.Reward]);
                console.log('[AudioManager] Volumes restored from storage');
            } else {
                // 使用默认值
                for (const [ch, vol] of Object.entries(AudioManager.DEFAULT_VOLUMES)) {
                    this.volumes.set(ch as AudioChannel, vol);
                }
            }
        } catch (e) {
            console.warn('[AudioManager] Failed to load volumes:', e);
            for (const [ch, vol] of Object.entries(AudioManager.DEFAULT_VOLUMES)) {
                this.volumes.set(ch as AudioChannel, vol);
            }
        }
    }

    private saveVolumesToStorage(): void {
        try {
            const snapshot: VolumeSnapshot = {
                master: this.masterVolume,
                bgm: this.volumes.get(AudioChannel.BGM) ?? AudioManager.DEFAULT_VOLUMES[AudioChannel.BGM],
                sfx: this.volumes.get(AudioChannel.SFX) ?? AudioManager.DEFAULT_VOLUMES[AudioChannel.SFX],
                strong: this.volumes.get(AudioChannel.StrongFeedback) ?? AudioManager.DEFAULT_VOLUMES[AudioChannel.StrongFeedback],
                voice: this.volumes.get(AudioChannel.Voice) ?? AudioManager.DEFAULT_VOLUMES[AudioChannel.Voice],
                env: this.volumes.get(AudioChannel.Environment) ?? AudioManager.DEFAULT_VOLUMES[AudioChannel.Environment],
                reward: this.volumes.get(AudioChannel.Reward) ?? AudioManager.DEFAULT_VOLUMES[AudioChannel.Reward],
            };
            localStorage.setItem(AudioManager.STORAGE_KEY, JSON.stringify(snapshot));
        } catch (e) {
            console.warn('[AudioManager] Failed to save volumes:', e);
        }
    }

    // ==================== 游戏音效列表 ====================

    /**
     * 获取某款游戏的全部音效列表（用于预加载）
     */
    private getGameSoundList(gameId: string): AudioPreloadItem[] {
        switch (gameId) {
            case 'taojiang_mahjong':
            case 'hongzhong_mahjong':
            case 'changsha_mahjong':
                return MAHJONG_SOUND_LIST;
            case 'paodekuai_poker':
                return POKER_SOUND_LIST;
            case 'yiyangwaihuzi_zipai':
                return ZIPAI_SOUND_LIST;
            case 'yuanjiangqianfen_poker':
                return QIANFEN_SOUND_LIST;
            default:
                return COMMON_UI_SOUNDS;
        }
    }

    // ==================== 定时器兼容 ====================
    private scheduleOnce(callback: () => void, interval: number): void {
        setTimeout(callback, interval * 1000);
    }

    // ==================== 清理 ====================

    /**
     * 清理所有资源（退出游戏时调用）
     */
    public dispose(): void {
        this.stopBGM(0);
        
        // 回收所有 SFX
        for (const s of [...this.activeSFX]) {
            this.recycleSFX(s.node);
        }

        // 清空缓存
        this.clipPool.clear();
        this.preloadQueue = [];
        this.preloading.clear();

        // 销毁 BGM 节点
        if (this.bgmNode && this.bgmNode.isValid) {
            this.bgmNode.destroy();
        }
        this.bgmNode = null;
        this.bgmSource = null;

        // 注销事件
        game.off(game.EVENT_HIDE, this.onPause, this);
        game.off(game.EVENT_SHOW, this.onResume, this);

        this.initialized = false;
        console.log('[AudioManager] Disposed');
    }
}
