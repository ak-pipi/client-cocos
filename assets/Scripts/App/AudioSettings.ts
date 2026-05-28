/**
 * 音频设置 (AudioSettings)
 * 
 * 提供音效设置的统一接口，用于：
 * - 设置面板的音量滑块绑定
 * - 音效/震动/语音开关
 * - 特效强度设置
 * - 低性能模式切换
 * - 持久化存储
 *
 * Author: AI Assistant
 */

import { AudioManager, AudioChannel } from './AudioManager';

// ==================== 设置数据结构 ====================

/** 完整音频设置 */
export interface FullAudioSettings {
    /** 总体音量 (0-1) */
    masterVolume: number;
    /** BGM 音量 */
    bgmVolume: number;
    /** 操作音效音量 */
    sfxVolume: number;
    /** 强反馈音效音量 */
    strongVolume: number;
    /** 语音播报音量 */
    voiceVolume: number;
    /** 环境音音量 */
    envVolume: number;
    /** 奖励音效音量 */
    rewardVolume: number;
    /** 震动开关 */
    vibrationEnabled: boolean;
    /** 语音播报开关 */
    voiceEnabled: boolean;
    /** 特效强度: 'low' | 'medium' | 'high' | 'ultra' */
    fxIntensity: string;
    /** 低性能模式 */
    lowPerfMode: boolean;
}

/** 默认设置值 */
export const DEFAULT_AUDIO_SETTINGS: FullAudioSettings = {
    masterVolume: 1.0,
    bgmVolume: AudioManager.DEFAULT_VOLUMES[AudioChannel.BGM],
    sfxVolume: AudioManager.DEFAULT_VOLUMES[AudioChannel.SFX],
    strongVolume: AudioManager.DEFAULT_VOLUMES[AudioChannel.StrongFeedback],
    voiceVolume: AudioManager.DEFAULT_VOLUMES[AudioChannel.Voice],
    envVolume: AudioManager.DEFAULT_VOLUMES[AudioChannel.Environment],
    rewardVolume: AudioManager.DEFAULT_VOLUMES[AudioChannel.Reward],
    vibrationEnabled: true,
    voiceEnabled: true,
    fxIntensity: 'medium',
    lowPerfMode: false,
};

/** 存储键 */
const SETTINGS_STORAGE_KEY = 'audio_settings_full';
const VIBRATION_STORAGE_KEY = 'vibration_enabled';
const FX_INTENSITY_KEY = 'fx_intensity';
const LOW_PERF_MODE_KEY = 'low_perf_mode';

// ==================== AudioSettings 类 ====================

export class AudioSettings {
    private static _instance: AudioSettings | null = null;

    public static get Instance(): AudioSettings {
        if (!AudioSettings._instance) {
            AudioSettings._instance = new AudioSettings();
        }
        return AudioSettings._instance;
    }

    private currentSettings: FullAudioSettings;

    // ---- 变更回调列表 ----
    private changeListeners: Array<(settings: FullAudioSettings) => void> = [];

    private constructor() {
        this.currentSettings = this.loadFromStorage();
    }

    // ==================== 获取 ====================

    /** 获取完整设置快照 */
    public get settings(): Readonly<FullAudioSettings> {
        return this.currentSettings;
    }

    /** 获取某项设置值 */
    public get<K extends keyof FullAudioSettings>(key: K): FullAudioSettings[K] {
        return this.currentSettings[key];
    }

    /** 震动是否开启 */
    public get isVibrationEnabled(): boolean {
        return this.currentSettings.vibrationEnabled;
    }

    /** 语音播报是否开启 */
    public get isVoiceEnabled(): boolean {
        return this.currentSettings.voiceEnabled;
    }

    /** 特效强度 */
    public get fxIntensity(): 'low' | 'medium' | 'high' | 'ultra' {
        return this.currentSettings.fxIntensity as 'low' | 'medium' | 'high' | 'ultra';
    }

    /** 是否低性能模式 */
    public get isLowPerfMode(): boolean {
        return this.currentSettings.lowPerfMode;
    }

    // ==================== 设置方法 ====================

    /**
     * 设置总体音量
     */
    public setMasterVolume(vol: number): void {
        this.currentSettings.masterVolume = Math.max(0, Math.min(1, vol));
        AudioManager.Instance.setMasterVolume(this.currentSettings.masterVolume);
        this.saveAndNotify();
    }

    /**
     * 设置某通道音量
     */
    public setChannelVolume(channel: AudioChannel, vol: number): void {
        const v = Math.max(0, Math.min(1, vol));
        switch (channel) {
            case AudioChannel.BGM:
                this.currentSettings.bgmVolume = v; break;
            case AudioChannel.SFX:
                this.currentSettings.sfxVolume = v; break;
            case AudioChannel.StrongFeedback:
                this.currentSettings.strongVolume = v; break;
            case AudioChannel.Voice:
                this.currentSettings.voiceVolume = v; break;
            case AudioChannel.Environment:
                this.currentSettings.envVolume = v; break;
            case AudioChannel.Reward:
                this.currentSettings.rewardVolume = v; break;
        }
        AudioManager.Instance.setChannelVolume(channel, v);
        this.saveAndNotify();
    }

    /**
     * 切换总体静音
     */
    public toggleMute(): boolean {
        const muted = AudioManager.Instance.toggleMute();
        this.currentSettings.masterVolume = muted ? 0 : 1;
        this.saveAndNotify();
        return muted;
    }

    /**
     * 切换 BGM 单独静音
     */
    public toggleBGM(): boolean {
        if (this.currentSettings.bgmVolume > 0) {
            this.setChannelVolume(AudioChannel.BGM, 0);
            return true;
        } else {
            this.setChannelVolume(AudioChannel.BGM, AudioManager.DEFAULT_VOLUMES[AudioChannel.BGM]);
            return false;
        }
    }

    /**
     * 切换 SFX 单独静音
     */
    public toggleSFX(): boolean {
        if (this.currentSettings.sfxVolume > 0) {
            this.setChannelVolume(AudioChannel.SFX, 0);
            return true;
        } else {
            this.setChannelVolume(AudioChannel.SFX, AudioManager.DEFAULT_VOLUMES[AudioChannel.SFX]);
            return false;
        }
    }

    /**
     * 切换震动
     */
    public setVibration(enabled: boolean): void {
        this.currentSettings.vibrationEnabled = enabled;
        try {
            localStorage.setItem(VIBRATION_STORAGE_KEY, String(enabled));
        } catch (_) {}
        this.notifyChange();
    }

    /**
     * 切换语音播报
     */
    public setVoiceEnabled(enabled: boolean): void {
        this.currentSettings.voiceEnabled = enabled;
        if (!enabled) {
            // 关闭语音时将语音通道设为 0
            AudioManager.Instance.setChannelVolume(AudioChannel.Voice, 0);
        } else {
            // 恢复默认
            AudioManager.Instance.setChannelVolume(
                AudioChannel.Voice,
                AudioManager.DEFAULT_VOLUMES[AudioChannel.Voice]
            );
        }
        this.saveAndNotify();
    }

    /**
     * 设置特效强度
     */
    public setFxIntensity(intensity: 'low' | 'medium' | 'high' | 'ultra'): void {
        this.currentSettings.fxIntensity = intensity;
        try {
            localStorage.setItem(FX_INTENSITY_KEY, intensity);
        } catch (_) {}
        this.notifyChange();
    }

    /**
     * 设置低性能模式
     */
    public setLowPerfMode(enabled: boolean): void {
        this.currentSettings.lowPerfMode = enabled;
        try {
            localStorage.setItem(LOW_PERF_MODE_KEY, String(enabled));
        } catch (_) {}
        
        // 低性能模式下自动降低音效质量
        if (enabled) {
            // 降低最大并发数等优化由 AudioManager 内部处理
            console.log('[AudioSettings] Low performance mode ON');
        }
        this.notifyChange();
    }

    /**
     * 恢复所有设置为默认
     */
    public resetToDefaults(): void {
        this.currentSettings = { ...DEFAULT_AUDIO_SETTINGS };
        this.applyToAudioManager();
        this.saveToStorage();
        this.notifyChange();
        console.log('[AudioSettings] Reset to defaults');
    }

    // ==================== 监听 ====================

    /**
     * 注册变更监听
     */
    public addListener(callback: (settings: FullAudioSettings) => void): () => void {
        this.changeListeners.push(callback);
        // 返回取消订阅函数
        return () => {
            const idx = this.changeListeners.indexOf(callback);
            if (idx >= 0) this.changeListeners.splice(idx, 1);
        };
    }

    // ==================== 内部方法 ====================

    private applyToAudioManager(): void {
        const am = AudioManager.Instance;
        am.setMasterVolume(this.currentSettings.masterVolume);
        am.setChannelVolume(AudioChannel.BGM, this.currentSettings.bgmVolume);
        am.setChannelVolume(AudioChannel.SFX, this.currentSettings.sfxVolume);
        am.setChannelVolume(AudioChannel.StrongFeedback, this.currentSettings.strongVolume);
        am.setChannelVolume(AudioChannel.Voice, this.currentSettings.voiceVolume);
        am.setChannelVolume(AudioChannel.Environment, this.currentSettings.envVolume);
        am.setChannelVolume(AudioChannel.Reward, this.currentSettings.rewardVolume);
    }

    private saveAndNotify(): void {
        this.saveToStorage();
        this.notifyChange();
    }

    private notifyChange(): void {
        const snapshot = { ...this.currentSettings };
        for (const cb of this.changeListeners) {
            try { cb(snapshot); } catch (e) { console.warn(e); }
        }
    }

    private loadFromStorage(): FullAudioSettings {
        try {
            const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                return { ...DEFAULT_AUDIO_SETTINGS, ...parsed };
            }
        } catch (e) {
            console.warn('[AudioSettings] Load failed:', e);
        }

        // 尝试逐个读取旧格式兼容
        const settings = { ...DEFAULT_AUDIO_SETTINGS };
        try {
            const vib = localStorage.getItem(VIBRATION_STORAGE_KEY);
            if (vib !== null) settings.vibrationEnabled = vib === 'true';
            const fx = localStorage.getItem(FX_INTENSITY_KEY);
            if (fx) settings.fxIntensity = fx;
            const lp = localStorage.getItem(LOW_PERF_MODE_KEY);
            if (lp !== null) settings.lowPerfMode = lp === 'true';
        } catch (_) {}

        return settings;
    }

    private saveToStorage(): void {
        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.currentSettings));
            // 兼容旧 key
            localStorage.setItem(VIBRATION_STORAGE_KEY, String(this.currentSettings.vibrationEnabled));
            localStorage.setItem(FX_INTENSITY_KEY, this.currentSettings.fxIntensity);
            localStorage.setItem(LOW_PERF_MODE_KEY, String(this.currentSettings.lowPerfMode));
        } catch (e) {
            console.warn('[AudioSettings] Save failed:', e);
        }
    }
}
