/**
 * 游戏内设置管理器 - 音频/特效/震动/游戏专属选项
 * 持久化到 localStorage
 */
import { sys } from 'cc';
import { AudioManager } from './AudioManager';
import { EffectManager, HapticManager } from './EffectManager';

// === 接口定义 ===
export interface AudioSettingsData {
    masterVolume: number; bgmVolume: number; sfxVolume: number; voiceVolume: number;
    masterMute: boolean; bgmMute: boolean; sfxMute: boolean; voiceMute: boolean;
}
export interface EffectSettingsData {
    effectsEnabled: boolean; screenShake: boolean; floatText: boolean;
    cardAnimation: boolean; settlementAnim: boolean; lowPerformanceMode: boolean;
}
export interface HapticSettingsData { hapticsEnabled: boolean; hapticIntensity: 'light' | 'medium' | 'heavy'; }
export interface GameSettingOption {
    key: string; label: string; type: 'toggle' | 'select' | 'slider';
    defaultValue: boolean | string | number;
    options?: string[]; min?: number; max?: number; step?: number;
}

// === 各游戏专属设置 ===
export const GAME_SPECIFIC_SETTINGS: Record<string, GameSettingOption[]> = {
    TaojiangMahjong: [
        { key: 'autoXing', label: '\u81ea\u52a8\u9192\u724c', type: 'toggle', defaultValue: true },
        { key: 'showHint', label: '\u51fa\u724c\u63d0\u793a', type: 'toggle', defaultValue: true },
        { key: 'voiceDialect', label: '\u65b9\u8a00\u9009\u62e9', type: 'select', defaultValue: 'taojiang', options: ['taojiang','changsha','putonghua'] },
        { key: 'cardStyle', label: '\u724c\u9762\u98ce\u683c', type: 'select', defaultValue: 'classic', options: ['classic','modern','simple'] },
    ],
    HongzhongMahjong: [
        { key: 'autoDiscard', label: '\u5feb\u901f\u51fa\u724c', type: 'toggle', defaultValue: false },
        { key: 'showHint', label: '\u51fa\u724c\u63d0\u793a', type: 'toggle', defaultValue: true },
        { key: 'showHongzhongCount', label: '\u7ea2\u4e2d\u7edf\u8ba1', type: 'toggle', defaultValue: true },
        { key: 'voiceDialect', label: '\u65b9\u8a00\u9009\u62e9', type: 'select', defaultValue: 'hunan', options: ['hunan','putonghua'] },
    ],
    ChangshaMahjong: [
        { key: 'autoXing', label: '\u81ea\u52a8\u9192\u724c', type: 'toggle', defaultValue: true },
        { key: 'showHint', label: '\u51fa\u724c\u63d0\u793a', type: 'toggle', defaultValue: true },
        { key: 'showZhaNiaoResult', label: '\u624e\u9e1f\u7ed3\u679c', type: 'toggle', defaultValue: true },
        { key: 'voiceDialect', label: '\u65b9\u8a00\u9009\u62e9', type: 'select', defaultValue: 'changsha', options: ['changsha','taojiang','putonghua'] },
    ],
    Paodekuai: [
        { key: 'autoPlay', label: '\u81ea\u52a8\u51fa\u724c', type: 'toggle', defaultValue: false },
        { key: 'showHint', label: '\u51fa\u724c\u63d0\u793a', type: 'toggle', defaultValue: true },
        { key: 'doubleConfirmBomb', label: '\u70b8\u5f39\u4e8c\u6b21\u786e\u8ba4', type: 'toggle', defaultValue: true },
    ],
    Waihuzi: [
        { key: 'autoHu', label: '\u81ea\u52a8\u80e1', type: 'toggle', defaultValue: false },
        { key: 'showHint', label: '\u51fa\u724c\u63d0\u793a', type: 'toggle', defaultValue: true },
        { key: 'voiceDialect', label: '\u65b9\u8a00\u9009\u62e9', type: 'select', defaultValue: 'yiyang', options: ['yiyang','yuanjiang','putonghua'] },
    ],
    Qianfen: [
        { key: 'autoPlay', label: '\u81ea\u52a8\u51fa\u724c', type: 'toggle', defaultValue: false },
        { key: 'showHint', label: '\u51fa\u724c\u63d0\u793a', type: 'toggle', defaultValue: true },
        { key: 'showScoreDetail', label: '\u5206\u6570\u8be6\u60c5', type: 'toggle', defaultValue: true },
    ],
};

// === 设置管理器（单例）===
export class GameSettings {
    private static _instance: GameSettings | null = null;
    public static get Instance(): GameSettings {
        if (!GameSettings._instance) GameSettings._instance = new GameSettings();
        return GameSettings._instance;
    }

    // 默认值
    private _defaults: {
        audio: AudioSettingsData;
        effect: EffectSettingsData;
        haptic: HapticSettingsData;
    } = {
        audio: { masterVolume: 0.8, bgmVolume: 0.35, sfxVolume: 0.8, voiceVolume: 0.9,
                 masterMute: false, bgmMute: false, sfxMute: false, voiceMute: false },
        effect: { effectsEnabled: true, screenShake: true, floatText: true,
                  cardAnimation: true, settlementAnim: true, lowPerformanceMode: false },
        haptic: { hapticsEnabled: true, hapticIntensity: 'medium' as const },
    };

    /** 初始化：从 localStorage 加载，应用到各管理器 */
    init(): void {
        this.loadAndApply('audio');
        this.loadAndApply('effect');
        this.loadAndApply('haptic');
        console.log('[GameSettings] initialized');
    }

    // ====== 音频设置 ======
    getAudioSettings(): AudioSettingsData {
        return this.loadData('audio') as AudioSettingsData || this._defaults.audio;
    }
    setAudioSettings(data: Partial<AudioSettingsData>): void {
        const current = this.getAudioSettings();
        const merged = { ...current, ...data };
        this.saveData('audio', merged);
        this.applyAudio(merged);
    }
    private applyAudio(data: AudioSettingsData): void {
        AudioManager.Instance.setMasterVolume(data.masterMute ? 0 : data.masterVolume);
        AudioManager.Instance.setBGMVolume(data.bgmMute ? 0 : data.bgmVolume);
        AudioManager.Instance.setSFXVolume(data.sfxMute ? 0 : data.sfxVolume);
        // voice volume
    }

    // ====== 特效设置 ======
    getEffectSettings(): EffectSettingsData {
        return this.loadData('effect') as EffectSettingsData || this._defaults.effect;
    }
    setEffectSettings(data: Partial<EffectSettingsData>): void {
        const current = this.getEffectSettings();
        const merged = { ...current, ...data };
        this.saveData('effect', merged);
        this.applyEffect(merged);
    }
    private applyEffect(data: EffectSettingsData): void {
        EffectManager.Instance.setEnabled(data.effectsEnabled);
        if (data.lowPerformanceMode !== undefined) EffectManager.Instance.setLowPerformanceMode(data.lowPerformanceMode);
    }

    // ====== 震动设置 ======
    getHapticSettings(): HapticSettingsData {
        return this.loadData('haptic') as HapticSettingsData || this._defaults.haptic;
    }
    setHapticSettings(data: Partial<HapticSettingsData>): void {
        const current = this.getHapticSettings();
        const merged = { ...current, ...data };
        this.saveData('haptic', merged);
        this.applyHaptic(merged);
    }
    private applyHaptic(data: HapticSettingsData): void {
        HapticManager.Instance.setEnabled(data.hapticsEnabled);
        HapticManager.Instance.setIntensity(data.hapticIntensity);
    }

    // ====== 游戏专属设置 ======
    getGameSetting(gameKey: string, settingKey: string): boolean | string | number {
        const settings = GAME_SPECIFIC_SETTINGS[gameKey];
        if (!settings) return undefined!;
        const option = settings.find(o => o.key === settingKey);
        if (!option) return undefined!;
        const saved = this.loadData(`game_${gameKey}`);
        if (saved && (saved as any)[settingKey] !== undefined) return (saved as any)[settingKey];
        return option.defaultValue;
    }
    setGameSetting(gameKey: string, settingKey: string, value: boolean | string | number): void {
        const current = this.loadData(`game_${gameKey}`) || {};
        (current as any)[settingKey] = value;
        this.saveData(`game_${gameKey}`, current);
    }
    getGameSettingsDefinition(gameKey: string): GameSettingOption[] {
        return GAME_SPECIFIC_SETTINGS[gameKey] || [];
    }

    // ====== 持久化 ======
    private loadData(key: string): any {
        try {
            const json = sys.localStorage.getItem(`gamesettings_${key}`);
            return json ? JSON.parse(json) : null;
        } catch { return null; }
    }
    private saveData(key: string, data: any): void {
        sys.localStorage.setItem(`gamesettings_${key}`, JSON.stringify(data));
    }
    private loadAndApply(category: string): void {
        const data = this.loadData(category);
        if (!data) return;
        switch (category) {
            case 'audio': this.applyAudio(data); break;
            case 'effect': this.applyEffect(data); break;
            case 'haptic': this.applyHaptic(data); break;
        }
    }

    /** 重置所有设置为默认值 */
    resetAll(): void {
        this.saveData('audio', this._defaults.audio);
        this.saveData('effect', this._defaults.effect);
        this.saveData('haptic', this._defaults.haptic);
        // 清理游戏专属
        for (const gameKey of Object.keys(GAME_SPECIFIC_SETTINGS)) {
            sys.localStorage.removeItem(`gamesettings_game_${gameKey}`);
        }
        this.init();
        console.log('[GameSettings] all settings reset to default');
    }
}
