/**
 * 特效管理器
 * 管理游戏中所有视觉特效：粒子、屏幕震动、飘字、卡牌动画、结算动画
 */
import { _decorator, Node, Vec3, tween, UIOpacity, Color, Label, RichText, ParticleSystem2D, SpriteFrame, Sprite, Size, director, view } from 'cc';
import { AudioManager } from './AudioManager';

const { ccclass, property } = _decorator;

// ==================== 特效类型枚举 ====================
export enum EffectType {
    // === 麻将类 ===
    MJ_DRAW_CARD = 'mj_draw_card',           // 摸牌
    MJ_DISCARD = 'mj_discard',               // 出牌
    MJ_CHI = 'mj_chi',                       // 吃
    MJ_PENG = 'mj_peng',                     // 碰
    MJ_GANG = 'mj_gang',                     // 杠(明杠/暗杠)
    MJ_HU = 'mj_hu',                         // 胡
    MJ_TING = 'mj_ting',                     // 听牌
    MJ_XING = 'mj_xing',                     // 醒牌
    MJ_QIPAI = 'mj_qipai',                   // 弃牌
    MJ_LAST_DISCARD = 'mj_last_discard',     // 最后一张出牌高亮

    // === 扑克类 ===
    PK_SELECT = 'pk_select',                 // 选牌高亮
    PK_PLAY = 'pk_play',                     // 出牌飞出
    PK_BOMB = 'pk_bomb',                     // 炸弹爆炸
    PK_ROCKET = 'pk_rocket',                 // 火箭
    PK_PASS = 'pk_pass',                     // 不要/过

    // === 字牌类 ===
    ZP_PLAY = 'zp_play',                     // 出牌
    ZP_CHI = 'zp_chi',                       // 吃
    ZP_PENG = 'zp_peng',                     // 碰
    ZP_WEI = 'zp_wei',                       // 偎
    ZP_TI = 'zp_ti',                         // 提
    ZP_PAO = 'zp_pao',                       // 跑
    ZP_HU = 'zp_hu',                         // 胡

    // === 通用 UI ===
    UI_CLICK = 'ui_click',                   // 按钮点击
    UI_PANEL_OPEN = 'ui_panel_open',         // 面板打开
    UI_PANEL_CLOSE = 'ui_panel_close',       // 面板关闭
    UI_COUNTDOWN = 'ui_countdown',           // 倒计时警告
    UI_ERROR = 'ui_error',                   // 错误提示抖动
    UI_SUCCESS = 'ui_success',               // 成功光效

    // === 奖励类 ===
    REWARD_GOLD = 'reward_gold',             // 金币奖励
    REWARD_JACKPOT = 'reward_jackpot',       // 大奖
    REWARD_WIN_STREAK = 'reward_win_streak', // 连胜

    // === 屏幕 ===
    SCREEN_SHAKE = 'screen_shake',           // 屏幕震动
    FLASH_WHITE = 'flash_white',             // 白色闪屏
    FLASH_GOLD = 'flash_gold',               // 金色闪屏

    // === 飘字 ===
    FLOAT_TEXT = 'float_text',              // 通用飘字
    FLOAT_DAMAGE = 'float_damage',          // 伤害数字
    FLOAT_HEAL = 'float_heal',              // 治疗数字
}

// ==================== 特效配置 ====================
export interface EffectConfig {
    type: EffectType;
    duration: number;          // 持续时间(ms)
    scale?: number;            // 缩放动画
    fadeIn?: number;           // 淡入时间(ms)
    fadeOut?: number;          // 淡出时间(ms)
    shakeIntensity?: number;   // 震动强度
    particleCount?: number;    // 粒子数量(预留)
    sound?: string;            // 关联音效
    layer: EffectLayer;        // 所在层级
}

export enum EffectLayer {
    BELOW_CARDS = 0,     // 卡牌下方
    CARDS = 1,           // 卡牌层
    ABOVE_CARDS = 2,     // 卡牌上方
    UI = 3,              // UI层
    TOPMOST = 4,         // 最顶层(飘字/闪屏)
}

// ==================== 飘字配置 ====================
export interface FloatTextConfig {
    text: string;
    position?: Vec3;           // 世界坐标，默认屏幕中心偏上
    color?: Color;             // 文字颜色
    fontSize?: number;         // 字号
    duration?: number;         // 存在时间(ms)
    offsetY?: number;         // 上浮距离
    isRichText?: boolean;     // 是否富文本
    outlineColor?: Color;     // 描边颜色
    outlineWidth?: number;    // 描边宽度
    scaleAnim?: boolean;      // 缩放动画(弹出效果)
}

// ==================== 屏幕震动配置 ====================
export interface ScreenShakeConfig {
    intensity: number;      // 震动强度 (像素)
    duration: number;       // 持续时间 (ms)
    decay?: boolean;        // 是否衰减
    direction?: 'horizontal' | 'vertical' | 'both'; // 震动方向
}

// ==================== 闪光配置 ====================
export interface FlashConfig {
    color: Color;
    duration: number;       // 持续时间 (ms)
    peakAlpha?: number;     // 峰值透明度
}

// ==================== 结算动画配置 ====================
export interface SettlementAnimConfig {
    winType: string;        // 胜利类型文字
    fanCount?: number;      // 番数
    scoreChange: number;    // 分数变化
    isBigWin?: boolean;     // 是否大牌
    playerPosition: number; // 玩家位置 0-3
}

@ccclass('EffectManager')
export class EffectManager {
    private static _instance: EffectManager | null = null;

    public static get Instance(): EffectManager {
        if (!EffectManager._instance) {
            EffectManager._instance = new EffectManager();
        }
        return EffectManager._instance;
    }

    // === 节点容器 ===
    private _container: Node | null = null;
    private _layerNodes: Map<EffectLayer, Node> = new Map();

    // === 对象池 ===
    private _particlePool: Node[] = [];
    private _floatTextPool: Node[] = [];
    private _activeEffects: Set<Node> = new Set();

    // === 屏幕震动状态 ===
    private _isShaking: boolean = false;
    private _originalPos: Vec3 = new Vec3();

    // === 特效配置表 ===
    private _configs: Map<EffectType, EffectConfig> = new Map();

    // === 全局开关 ===
    private _enabled: boolean = true;
    private _lowPerformanceMode: boolean = false;

    constructor() {
        this.initDefaultConfigs();
    }

    /**
     * 初始化特效管理器，挂载到指定节点下
     */
    init(parentNode: Node): void {
        this._container = new Node('EffectManager');
        this._container.parent = parentNode;

        // 创建5层节点容器
        const layerNames = ['BelowCards', 'Cards', 'AboveCards', 'UI', 'Topmost'];
        for (let i = 0; i < layerNames.length; i++) {
            const layerNode = new Node(`EffectLayer_${layerNames[i]}`);
            layerNode.parent = this._container;
            this._layerNodes.set(i as EffectLayer, layerNode);
        }

        console.log('[EffectManager] initialized with 5 layers');
    }

    // ==================== 默认配置 ====================
    private initDefaultConfigs(): void {
        const configs: EffectConfig[] = [
            // --- 麻将 ---
            { type: EffectType.MJ_DRAW_CARD, duration: 200, scale: 1.2, sound: 'mj_draw', layer: EffectLayer.CARDS },
            { type: EffectType.MJ_DISCARD, duration: 150, sound: 'mj_discard', layer: EffectLayer.ABOVE_CARDS },
            { type: EffectType.MJ_CHI, duration: 400, scale: 1.15, sound: 'mj_chi', layer: EffectLayer.CARDS },
            { type: EffectType.MJ_PENG, duration: 350, scale: 1.2, sound: 'mj_peng', layer: EffectLayer.CARDS },
            { type: EffectType.MJ_GANG, duration: 600, scale: 1.3, shakeIntensity: 8, sound: 'mj_gang', layer: EffectLayer.ABOVE_CARDS },
            { type: EffectType.MJ_HU, duration: 1500, scale: 1.4, shakeIntensity: 15, sound: 'mj_hu', layer: EffectLayer.TOPMOST },
            { type: EffectType.MJ_TING, duration: 300, fadeIn: 100, fadeOut: 200, layer: EffectLayer.ABOVE_CARDS },
            { type: EffectType.MJ_XING, duration: 800, scale: 1.25, sound: 'mj_xing', layer: EffectLayer.ABOVE_CARDS },
            { type: EffectType.MJ_QIPAI, duration: 200, fadeOut: 150, layer: EffectLayer.CARDS },

            // --- 扑克 ---
            { type: EffectType.PK_SELECT, duration: 100, scale: 1.08, layer: EffectLayer.CARDS },
            { type: EffectType.PK_PLAY, duration: 250, sound: 'pk_play', layer: EffectLayer.ABOVE_CARDS },
            { type: EffectType.PK_BOMB, duration: 1200, scale: 1.5, shakeIntensity: 20, sound: 'pk_bomb', layer: EffectLayer.TOPMOST },
            { type: EffectType.PK_ROCKET, duration: 1800, scale: 2.0, shakeIntensity: 25, sound: 'pk_rocket', layer: EffectLayer.TOPMOST },
            { type: EffectType.PK_PASS, duration: 200, fadeOut: 150, layer: EffectLayer.UI },

            // --- 字牌 ---
            { type: EffectType.ZP_PLAY, duration: 150, sound: 'zp_play', layer: EffectLayer.CARDS },
            { type: EffectType.ZP_CHI, duration: 350, scale: 1.15, sound: 'zp_chi', layer: EffectLayer.CARDS },
            { type: EffectType.ZP_PENG, duration: 300, scale: 1.2, sound: 'zp_peng', layer: EffectLayer.CARDS },
            { type: EffectType.ZP_WEI, duration: 400, scale: 1.15, sound: 'zp_wei', layer: EffectLayer.CARDS },
            { type: EffectType.ZP_TI, duration: 500, scale: 1.25, sound: 'zp_ti', layer: EffectLayer.ABOVE_CARDS },
            { type: EffectType.ZP_PAO, duration: 600, scale: 1.3, sound: 'zp_pao', layer: EffectLayer.ABOVE_CARDS },
            { type: EffectType.ZP_HU, duration: 1200, scale: 1.35, shakeIntensity: 12, sound: 'zp_hu', layer: EffectLayer.TOPMOST },

            // --- UI ---
            { type: EffectType.UI_CLICK, duration: 80, scale: 0.95, layer: EffectLayer.UI },
            { type: EffectType.UI_PANEL_OPEN, duration: 250, scale: 1.05, fadeIn: 150, layer: EffectLayer.UI },
            { type: EffectType.UI_PANEL_CLOSE, duration: 150, fadeOut: 120, layer: EffectLayer.UI },
            { type: EffectType.UI_COUNTDOWN, duration: 500, shakeIntensity: 5, layer: EffectLayer.UI },
            { type: EffectType.UI_ERROR, duration: 400, shakeIntensity: 10, layer: EffectLayer.UI },
            { type: EffectType.UI_SUCCESS, duration: 600, scale: 1.1, layer: EffectLayer.UI },

            // --- 奖励 ---
            { type: EffectType.REWARD_GOLD, duration: 1000, scale: 1.3, layer: EffectLayer.TOPMOST },
            { type: EffectType.REWARD_JACKPOT, duration: 2000, scale: 1.8, shakeIntensity: 10, layer: EffectLayer.TOPMOST },
            { type: EffectType.REWARD_WIN_STREAK, duration: 1500, scale: 1.5, layer: EffectLayer.TOPMOST },

            // --- 屏幕 ---
            { type: EffectType.SCREEN_SHAKE, duration: 300, shakeIntensity: 10, layer: EffectLayer.TOPMOST },
            { type: EffectType.FLASH_WHITE, duration: 200, layer: EffectLayer.TOPMOST },
            { type: EffectType.FLASH_GOLD, duration: 300, layer: EffectLayer.TOPMOST },

            // --- 飘字 ---
            { type: EffectType.FLOAT_TEXT, duration: 1200, layer: EffectLayer.TOPMOST },
            { type: EffectType.FLOAT_DAMAGE, duration: 1000, scale: 1.2, layer: EffectLayer.TOPMOST },
            { type: EffectType.FLOAT_HEAL, duration: 1000, scale: 1.1, layer: EffectLayer.TOPMOST },
        ];

        for (const cfg of configs) {
            this._configs.set(cfg.type, cfg);
        }
    }

    // ==================== 公开 API - 快捷方法 ====================

    /** 播放麻将操作特效 */
    playMahjongEffect(action: string, targetNode?: Node): void {
        const map: Record<string, EffectType> = {
            draw: EffectType.MJ_DRAW_CARD,
            discard: EffectType.MJ_DISCARD,
            chi: EffectType.MJ_CHI,
            peng: EffectType.MJ_PENG,
            gang: EffectType.MJ_GANG,
            hu: EffectType.MJ_HU,
            ting: EffectType.MJ_TING,
            xing: EffectType.MJ_XING,
            qipai: EffectType.MJ_QIPAI,
        };
        const type = map[action];
        if (type) this.play(type, targetNode);
    }

    /** 播放扑克操作特效 */
    playPokerEffect(action: string, targetNode?: Node): void {
        const map: Record<string, EffectType> = {
            select: EffectType.PK_SELECT,
            play: EffectType.PK_PLAY,
            bomb: EffectType.PK_BOMB,
            rocket: EffectType.PK_ROCKET,
            pass: EffectType.PK_PASS,
        };
        const type = map[action];
        if (type) this.play(type, targetNode);
    }

    /** 播放字牌操作特效 */
    playZipaiEffect(action: string, targetNode?: Node): void {
        const map: Record<string, EffectType> = {
            play: EffectType.ZP_PLAY,
            chi: EffectType.ZP_CHI,
            peng: EffectType.ZP_PENG,
            wei: EffectType.ZP_WEI,
            ti: EffectType.ZP_TI,
            pao: EffectType.ZP_PAO,
            hu: EffectType.ZP_HU,
        };
        const type = map[action];
        if (type) this.play(type, targetNode);
    }

    /** 播放UI点击反馈 */
    playClickFeedback(targetNode: Node): void {
        this.play(EffectType.UI_CLICK, targetNode);
    }

    // ==================== 核心播放方法 ====================

    /**
     * 播放特效（主入口）
     * @param type 特效类型
     * @param targetNode 目标节点(可选)，用于绑定到特定位置
     * @returns 动画Promise，可await等待完成
     */
    async play(type: EffectType, targetNode?: Node): Promise<void> {
        if (!this._enabled || !this._container) return;

        const config = this._configs.get(type);
        if (!config) {
            console.warn(`[EffectManager] No config for effect type: ${type}`);
            return;
        }

        // 低性能模式跳过部分特效
        if (this._lowPerformanceMode && this.isExpensiveEffect(type)) {
            return;
        }

        // 关联音效
        if (config.sound) {
            AudioManager.playSFX(config.sound);
        }

        // 屏幕震动
        if (config.shakeIntensity && config.shakeIntensity > 5) {
            this.screenShake({
                intensity: config.shakeIntensity,
                duration: config.duration,
                decay: true,
            });
        }

        // 目标节点动画
        if (targetNode && targetNode.isValid) {
            await this.animateNode(targetNode, config);
        }
    }

    /**
     * 节点动画（缩放+淡入淡出）
     */
    private async animateNode(node: Node, config: EffectConfig): Promise<void> {
        return new Promise<void>((resolve) => {
            const durationSec = config.duration / 1000;
            const tw = tween(node);

            // 缩放动画
            if (config.scale && config.scale !== 1) {
                tw.to(durationSec * 0.5, { scale: new Vec3(config.scale, config.scale, 1) })
                  .to(durationSec * 0.5, { scale: new Vec3(1, 1, 1) });
            }

            // 透明度动画
            const opacity = node.getComponent(UIOpacity);
            if (opacity && (config.fadeIn || config.fadeOut)) {
                if (config.fadeIn) {
                    tw.to(config.fadeIn / 1000, { opacity: 255 });
                }
                if (config.fadeOut) {
                    tw.delay((durationSec - (config.fadeOut || 0) / 1000))
                      .to(config.fadeOut! / 1000, { opacity: 0 });
                }
            }

            tw.call(() => resolve()).start();
        });
    }

    // ==================== 飘字系统 ====================

    /**
     * 显示飘字
     * @param config 飘字配置
     */
    showFloatText(config: FloatTextConfig): void {
        if (!this._enabled || !this._container) return;

        const layerNode = this._layerNodes.get(EffectLayer.TOPMOST);
        if (!layerNode) return;

        // 尝试从对象池获取
        let textNode = this._floatTextPool.pop();
        if (!textNode || !textNode.isValid) {
            textNode = new Node('FloatText');
            if (config.isRichText) {
                textNode.addComponent(RichText);
            } else {
                textNode.addComponent(Label);
            }
            textNode.addComponent(UIOpacity);
        }

        textNode.parent = layerNode;
        this._activeEffects.add(textNode);

        // 设置位置
        const pos = config.position || new Vec3(0, 100, 0);
        textNode.setPosition(pos);

        // 设置内容
        if (config.isRichText) {
            const rt = textNode.getComponent(RichText)!;
            rt.string = config.text;
            if (config.fontSize) rt.fontSize = config.fontSize;
            if (config.color) rt.color = config.color;
        } else {
            const label = textNode.getComponent(Label)!;
            label.string = config.text;
            if (config.fontSize) label.fontSize = config.fontSize;
            if (config.color) label.color = config.color;
        }

        // 透明度
        const opacity = textNode.getComponent(UIOpacity)!;
        opacity.opacity = 255;

        // 上浮 + 淡出动画
        const duration = (config.duration || 1200) / 1000;
        const offsetY = config.offsetY || 80;

        tween(textNode)
            .by(duration, { position: new Vec3(0, offsetY, 0) })
            .to(duration * 0.3, { opacity: 0 })
            .call(() => this.recycleFloatText(textNode!))
            .start();

        // 弹出缩放
        if (config.scaleAnim !== false) {
            textNode.setScale(0.5, 0.5, 1);
            tween(textNode)
                .to(0.15, { scale: new Vec3(1.2, 1.2, 1) })
                .to(0.1, { scale: new Vec3(1, 1, 1) })
                .start();
        }
    }

    /** 快捷飘字：普通文本 */
    showFloatTextSimple(text: string, position?: Vec3, color?: Color): void {
        this.showFloatText({ text, position, color });
    }

    /** 快捷飘字：得分变化(+xxx / -xxx) */
    showScoreChange(score: number, position: Vec3): void {
        const prefix = score >= 0 ? '+' : '';
        const color = score >= 0 ? new Color(255, 215, 0, 255) : new Color(255, 80, 80, 255);
        this.showFloatText({
            text: `${prefix}${score}`,
            position,
            color,
            fontSize: 36,
            scaleAnim: true,
            offsetY: 100,
        });
    }

    /** 快捷飘字：胡牌类型 */
    showHuType(huType: string, position: Vec3): void {
        this.showFloatText({
            text: huType,
            position: new Vec3(position.x, position.y + 30, position.z),
            color: new Color(255, 50, 50, 255),
            fontSize: 42,
            scaleAnim: true,
            offsetY: 60,
            duration: 1800,
        });
    }

    // ==================== 屏幕震动 ====================

    /**
     * 屏幕震动效果
     */
    screenShake(config: ScreenShakeConfig): void {
        if (!this._enabled || this._isShaking) return;
        if (!this._container) return;

        this._isShaking = true;
        const gameRoot = this._container.parent;
        if (!gameRoot) {
            this._isShaking = false;
            return;
        }

        this._originalPos.set(gameRoot.position);

        const durationSec = config.duration / 1000;
        const intensity = config.intensity;
        const dir = config.direction || 'both';
        const decay = config.decay;

        let elapsed = 0;

        const shakeTween = tween(gameRoot);
        const steps = Math.floor(durationSec / 0.03); // ~33fps

        for (let i = 0; i < steps; i++) {
            const progress = elapsed / durationSec;
            const decayFactor = decay ? (1 - progress) : 1;
            const currentIntensity = intensity * decayFactor;

            let offsetX = 0, offsetY = 0;
            if (dir === 'horizontal' || dir === 'both') {
                offsetX = (Math.random() - 0.5) * 2 * currentIntensity;
            }
            if (dir === 'vertical' || dir === 'both') {
                offsetY = (Math.random() - 0.5) * 2 * currentIntensity;
            }

            shakeTween.to(0.03, {
                position: new Vec3(
                    this._originalPos.x + offsetX,
                    this._originalPos.y + offsetY,
                    this._originalPos.z
                )
            });

            elapsed += 0.03;
        }

        shakeTween.to(0.05, { position: this._originalPos })
            .call(() => { this._isShaking = false; })
            .start();

        // 同时触发震动反馈
        HapticManager.Instance.triggerImpact(intensity > 15 ? 'heavy' : intensity > 8 ? 'medium' : 'light');
    }

    // ==================== 闪光效果 ====================

    /**
     * 全屏闪光
     */
    flashScreen(config: FlashConfig): void {
        if (!this._enabled || !this._container) return;

        const layerNode = this._layerNodes.get(EffectLayer.TOPMOST);
        if (!layerNode) return;

        // 创建全屏覆盖节点
        const flashNode = new Node('FlashScreen');
        flashNode.parent = layerNode;
        flashNode.addComponent(UIOpacity);

        const sprite = flashNode.addComponent(Sprite);
        // 注意：实际使用时需设置 SpriteFrame，这里预留接口
        flashNode.setScale(10, 10, 1); // 覆盖全屏

        const opacity = flashNode.getComponent(UIOpacity)!;
        opacity.opacity = 0;

        const durationSec = config.duration / 1000;
        const peakAlpha = config.peakAlpha || 200;

        tween(flashNode)
            .to(durationSec * 0.3, { /* alpha */ }, {
                onUpdate: (target) => {
                    opacity.opacity = Math.floor(peakAlpha * (target as any).progress || 0);
                }
            })
            .to(durationSec * 0.7, { /* alpha */ }, {
                onUpdate: (target) => {
                    const t = 1 - ((target as any).progress || 0);
                    opacity.opacity = Math.floor(peakAlpha * t);
                }
            })
            .call(() => {
                if (flashNode.isValid) flashNode.destroy();
            })
            .start();
    }

    /** 快捷白色闪屏（胡牌/炸弹时） */
    flashWhite(duration: number = 200): void {
        this.flashScreen({ color: new Color(255, 255, 255, 255), duration, peakAlpha: 220 });
    }

    /** 快捷金色闪屏（大奖时） */
    flashGold(duration: number = 300): void {
        this.flashScreen({ color: new Color(255, 215, 0, 255), duration, peakAlpha: 180 });
    }

    // ==================== 卡牌移动动画 ====================

    /**
     * 卡牌从A点飞行到B点
     */
    async flyCard(fromPos: Vec3, toPos: Vec3, duration: number = 300, cardNode?: Node): Promise<void> {
        if (!this._enabled) return;

        if (cardNode && cardNode.isValid) {
            cardNode.setPosition(fromPos);
            return new Promise(resolve => {
                tween(cardNode)
                    .to(duration / 1000, { position: toPos }, { easing: 'quadOut' })
                    .call(() => resolve())
                    .start();
            });
        }
        return Promise.resolve();
    }

    /**
     * 发牌动画（多张牌依次飞入）
     */
    async dealCards(cardNodes: Node[], targetPositions: Vec3[], interval: number = 50): Promise<void> {
        if (!this._enabled || !cardNodes.length) return;

        return new Promise(resolve => {
            cardNodes.forEach((card, index) => {
                if (!card.isValid || index >= targetPositions.length) return;

                setTimeout(() => {
                    tween(card)
                        .to(0.2, { position: targetPositions[index] }, { easing: 'backOut' })
                        .start();

                    if (index === cardNodes.length - 1) {
                        setTimeout(resolve, 200);
                    }
                }, index * interval);
            });
        });
    }

    // ==================== 结算动画 ====================

    /**
     * 播放胜利/失败结算动画
     */
    async playSettlementAnimation(config: SettlementAnimConfig): Promise<void> {
        if (!this._enabled) return;

        // 1. 大牌额外效果
        if (config.isBigWin) {
            this.flashGold(500);
            this.screenShake({ intensity: 20, duration: 800, decay: true });
        }

        // 2. 显示胡牌类型
        this.showHuType(config.winType, this.getPlayerScreenPosition(config.playerPosition));

        // 3. 延迟显示分数
        await new Promise(r => setTimeout(r, 500));
        this.showScoreChange(config.scoreChange, this.getPlayerScreenPosition(config.playerPosition));

        // 4. 番数显示
        if (config.fanCount && config.fanCount > 1) {
            await new Promise(r => setTimeout(r, 300));
            this.showFloatTextSimple(
                `${config.fanCount}番`,
                this.getPlayerScreenPosition(config.playerPosition),
                new Color(255, 150, 50, 255)
            );
        }
    }

    // ==================== 工具方法 ====================

    /** 根据玩家位置获取屏幕坐标（需根据具体布局调整） */
    private getPlayerScreenPosition(playerIndex: number): Vec3 {
        const screenSize = view.getVisibleSize();
        const positions: Vec3[] = [
            new Vec3(0, -screenSize.height * 0.25, 0),  // 自己(底部)
            new Vec3(-screenSize.width * 0.3, screenSize.height * 0.1, 0),  // 左边
            new Vec3(0, screenSize.height * 0.3, 0),   // 对面
            new Vec3(screenSize.width * 0.3, screenSize.height * 0.1, 0),  // 右边
        ];
        return positions[playerIndex % 4] || positions[0];
    }

    /** 判断是否为昂贵特效（低性能模式下跳过） */
    private isExpensiveEffect(type: EffectType): boolean {
        const expensive = [
            EffectType.PK_BOMB, EffectType.PK_ROCKET,
            EffectType.MJ_HU, EffectType.ZP_HU,
            EffectType.REWARD_JACKPOT,
        ];
        return expensive.includes(type);
    }

    /** 回收飘字节点到对象池 */
    private recycleFloatText(node: Node): void {
        this._activeEffects.delete(node);
        if (node.isValid) {
            node.removeFromParent();
            this._floatTextPool.push(node);
            // 限制池大小
            if (this._floatTextPool.length > 10) {
                node.destroy();
                this._floatTextPool.pop();
            }
        }
    }

    // ==================== 全局控制 ====================

    /** 启用/禁用所有特效 */
    setEnabled(enabled: boolean): void {
        this._enabled = enabled;
        if (!enabled) {
            this.stopAllEffects();
        }
    }

    /** 低性能模式（自动跳过昂贵特效） */
    setLowPerformanceMode(enabled: boolean): void {
        this._lowPerformanceMode = enabled;
        console.log(`[EffectManager] Low performance mode: ${enabled}`);
    }

    /** 停止所有正在播放的特效 */
    stopAllEffects(): void {
        // 停止所有tween
        for (const node of this._activeEffects) {
            if (node && node.isValid) {
                tween(node).stop();
                // 回收飘字
                const floatIdx = this._floatTextPool.indexOf(node);
                if (floatIdx >= 0) continue;
                node.removeFromParent();
            }
        }
        this._activeEffects.clear();

        // 停止震动
        if (this._isShaking && this._container?.parent) {
            tween(this._container.parent).stop();
            this._container.parent.setPosition(this._originalPos);
            this._isShaking = false;
        }
    }

    /** 清理资源 */
    dispose(): void {
        this.stopAllEffects();
        this._floatTextPool.forEach(n => { if (n.isValid) n.destroy(); });
        this._floatTextPool = [];
        this._particlePool.forEach(n => { if (n.isValid) n.destroy(); });
        this._particlePool = [];
        if (this._container?.isValid) this._container.destroy();
        this._container = null;
        EffectManager._instance = null;
    }
}

// ==================== 震动管理器（内联） ====================
export class HapticManager {
    private static _instance: HapticManager | null = null;
    public static get Instance(): HapticManager {
        if (!HapticManager._instance) HapticManager._instance = new HapticManager();
        return HapticManager._instance;
    }

    private _enabled: boolean = true;
    private _intensity: 'light' | 'medium' | 'heavy' = 'medium';

    setEnabled(enabled: boolean): void { this._enabled = enabled; }
    setIntensity(level: 'light' | 'medium' | 'heavy'): void { this._intensity = level; }

    /** 触发撞击型震动 */
    triggerImpact(intensity?: 'light' | 'medium' | 'heavy'): void {
        if (!this._enabled) return;
        const level = intensity || this._intensity;
        // Cocos Creator 原生平台使用 native vibration
        if (typeof (globalThis as any).__napiVibrate !== 'undefined') {
            const durations = { light: 15, medium: 30, heavy: 50 };
            try {
                (globalThis as any).__napiVibrate(durations[level]);
            } catch (e) { /* ignore */ }
        }
        // Web 平台备用
        else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            const durations = { light: 15, medium: 30, heavy: 50 };
            navigator.vibrate(durations[level]);
        }
    }

    /** 触发成功震动（轻短双击） */
    triggerSuccess(): void {
        if (!this._enabled) return;
        this.tryVibrate([20, 50, 20]);
    }

    /** 触发错误震动 */
    triggerError(): void {
        if (!this._enabled) return;
        this.tryVibrate([50, 30, 50, 30, 50]);
    }

    /** 触发选择改变震动（滚动列表/选牌） */
    triggerSelectionChange(): void {
        if (!this._enabled) return;
        this.triggerImpact('light');
    }

    private tryVibrate(pattern: number[]): void {
        if (typeof (globalThis as any).__napiVibrate !== 'undefined') {
            try { (globalThis as any).__napiVibrate(pattern); } catch (e) { /* ignore */ }
        } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
    }
}
