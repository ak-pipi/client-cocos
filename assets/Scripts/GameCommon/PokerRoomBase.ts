/**
 * 扑克房间基类 (PokerRoomBase)
 * 所有扑克牌类游戏的统一基类，提供：
 * - 扑克手牌管理（横屏扇形/水平排列）
 * - 出牌选牌交互
 * - 扑克牌型判断辅助
 * - 顺子/连对/炸弹等组合识别
 * - 扑克结算逻辑
 *
 * 适用游戏：跑得快、沅江千分
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, Prefab, instantiate, Vec3, Color, Sprite } from 'cc';
import { RoomBase } from './RoomBase';
import { GameTypes, RoomState, PlayerRoomState, SeatPosition, PokerPattern, RoundSettlementData, FinalSettlementData } from './GameTypes';

const { ccclass, property } = _decorator;

// ==================== 类型定义 ====================

/** 扑克牌数据 */
export interface PokerCard {
    /** 牌值 (2-14, 14=A, 15=小王, 16=大王) */
    value: number;
    /** 花色 (0=黑桃, 1=红桃, 2=梅花, 3=方块, -1=王牌无花色) */
    suit: number;
    /** 唯一ID */
    cardId: string;
}

/** 出牌组合 */
export interface CardPlay {
    /** 主牌型 */
    pattern: PokerPattern;
    /** 出的牌列表 */
    cards: PokerCard[];
    /** 牌型权重(用于比较大小) */
    weight: number;
}

/** 扑克可用操作 */
export interface PokerAvailableActions {
    canPlay?: boolean;          // 可以出牌
    canPass?: boolean;          // 可以不出(要得起时不可用)
    canHint?: boolean;          // 提示可用
    isLeader?: boolean;         // 是否首出(可出任意牌型)
    mustPlay?: boolean;         // 必须出牌(最小牌时)
}

/** 扑克事件回调 */
export interface PokerEventCallbacks {
    /** 手牌变化 */
    onHandChanged?: (cards: PokerCard[]) => void;
    /** 出牌事件 */
    onCardPlay?: (play: CardPlay, seatIndex: number) => void;
    /** 一轮结束(比大小) */
    onRoundEnd?: (winnerSeat: number, plays: CardPlay[]) => void;
    /** 游戏结束 */
    onGameOver?: (rankings: number[]) => void;
    /** 选中的牌变化 */
    onSelectionChanged?: (selectedIndices: number[]) => void;
}

@ccclass('PokerRoomBase')
export class PokerRoomBase extends RoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected pokerTable: Node = null;           // 牌桌主体

    @property({ type: Node })
    protected myHandArea: Node = null;           // 自己的手牌区

    @property({ type: Node })
    protected leftHandArea: Node = null;         // 左边对手手牌区

    @property({ type: Node })
    protected rightHandArea: Node = null;        // 右边对手手牌区

    @property({ type: Node })
    protected topHandArea: Node = null;          // 对面手牌区(部分模式)

    @property({ type: Node })
    protected playArea: Node = null;             // 中央出牌区

    @property({ type: Node })
    protected myPlayArea: Node = null;           // 自己的出牌展示区

    @property({ type: Node })
    protected leftPlayArea: Node = null;         // 左边出牌区

    @property({ type: Node })
    protected rightPlayArea: Node = null;        // 右边出牌区

    @property({ type: Node })
    protected topPlayArea: Node = null;          // 对面出牌区

    @property({ type: Node })
    protected actionPanel: Node = null;          // 操作按钮区(出牌/不出/提示)

    @property({ type: Label })
    protected cardCountLabel: Label = null;      // 剩余手牌数

    @property({ type: Label })
    protected multiLabel: Label = null;          // 倍数显示

    @property({ type: Prefab })
    protected cardPrefab: Prefab = null;         // 扑克牌预制体

    @property({ type: Prefab })
    protected cardBackPrefab: Prefab = null;     // 牌背预制体

    // ==================== 内部状态 ====================

    /** 自己的手牌 */
    protected myCards: PokerCard[] = [];

    /** 当前选中的牌索引集合 */
    protected selectedIndices: Set<number> = new Set();

    /** 各玩家已出的牌 */
    protected playedRecords: Map<number, CardPlay> = new Map();

    /** 各玩家手牌数量 */
    protected playerCardCounts: Map<number, number> = new Map();

    /** 当前可用操作 */
    protected pokerActions: PokerAvailableActions | null = null;

    /** 是否轮到自己出牌 */
    protected isMyTurn: boolean = false;

    /** 当前轮次的首出玩家座位 */
    protected leadSeatIndex: number = -1;

    /** 上一手出牌(用于比较) */
    protected lastPlay: CardPlay | null = null;

    /** 当前倍数 */
    protected currentMultiplier: number = 1;

    /** 扑克专属回调 */
    protected pokerCallbacks: PokerEventCallbacks = {};

    // ==================== 初始化 ====================

    onLoad(): void {
        super.onLoad();
    }

    /** 设置扑克专属回调 */
    public setPokerCallbacks(callbacks: PokerEventCallbacks): void {
        this.pokerCallbacks = { ...this.pokerCallbacks, ...callbacks };
    }

    // ==================== 座位覆写 ====================

    protected getSeatCount(): number {
        // 跑得快2人/3人，千分4人
        return 3; // 默认3人
    }

    protected getHandAreaBySeat(seatIndex: number): Node {
        switch (seatIndex) {
            case 0: return this.myHandArea;
            case 1: return this.leftHandArea;
            case 2: return this.rightHandArea;
            case 3: return this.topHandArea;
            default: return null;
        }
    }

    protected getPlayAreaBySeat(seatIndex: number): Node {
        switch (seatIndex) {
            case 0: return this.myPlayArea;
            case 1: return this.leftPlayArea;
            case 2: return this.rightPlayArea;
            case 3: return this.topPlayArea;
            default: return null;
        }
    }

    // ==================== 发牌与手牌 ====================

    /**
     * 发牌
     * @param cards 初始手牌
     */
    public dealCards(cards: PokerCard[]): void {
        this.myCards = [...cards];
        this.sortHandCards();
        this.renderMyHand();
        this.updateCardCountDisplay();
        console.log(`[PokerRoom] Dealt ${cards.length} cards`);
    }

    /**
     * 排序手牌 (先按牌值降序，同值按花色排序)
     */
    protected sortHandCards(): void {
        this.myCards.sort((a, b) => {
            if (a.value !== b.value) return b.value - a.value; // 大到小
            return a.suit - b.suit;
        });
    }

    /**
     * 渲染手牌
     */
    protected renderMyHand(): void {
        if (!this.myHandArea) return;

        this.myHandArea.removeAllChildren();

        for (let i = 0; i < this.myCards.length; i++) {
            const cardNode = this.createCardNode(this.myCards[i], true);
            cardNode.name = `card_${i}`;
            cardNode['_cardIndex'] = i;
            if (this.myHandArea) {
                cardNode.parent = this.myHandArea;
            }

            // 如果被选中，高亮显示
            if (this.selectedIndices.has(i)) {
                this.applySelectedStyle(cardNode);
            }
        }
    }

    /**
     * 更新手牌数显示
     */
    protected updateCardCountDisplay(): void {
        if (this.cardCountLabel) {
            this.cardCountLabel.string = `${this.myCards.length}张`;
        }
    }

    /** 获取自己座位索引 */
    protected getMySeatIndex(): number {
        return 0;
    }

    // ==================== 选牌交互 ====================

    /**
     * 点击选牌/取消选牌
     * @param cardIndex 手牌索引
     */
    public toggleCardSelection(cardIndex: number): void {
        if (!this.isMyTurn) return;

        if (this.selectedIndices.has(cardIndex)) {
            this.selectedIndices.delete(cardIndex);
        } else {
            this.selectedIndices.add(cardIndex);
        }

        // 更新选中视觉
        const cardNode = this.getCardNodeByIndex(cardIndex);
        if (cardNode) {
            if (this.selectedIndices.has(cardIndex)) {
                this.applySelectedStyle(cardNode);
            } else {
                this.applyNormalStyle(cardNode);
            }
        }

        this.pokerCallbacks.onSelectionChanged?.([...this.selectedIndices]);
    }

    /**
     * 清除所有选中
     */
    public clearSelection(): void {
        this.selectedIndices.clear();
        this.renderMyHand(); // 重新渲染以清除高亮
    }

    /**
     * 根据索引获取卡牌节点
     */
    protected getCardNodeByIndex(index: number): Node | null {
        if (!this.myHandArea) return null;
        return this.myHandArea.getChildByName(`card_${index}`);
    }

    /**
     * 应用选中样式(上浮)
     */
    protected applySelectedStyle(node: Node): void {
        node.setPosition(0, 30, 0); // 上浮
    }

    /**
     * 应用普通样式
     */
    protected applyNormalStyle(node: Node): void {
        node.setPosition(0, 0, 0);
    }

    // ==================== 出牌操作 ====================

    /**
     * 出牌(使用当前选中的牌)
     */
    public playSelectedCards(): void {
        if (!this.isMyTurn || this.selectedIndices.size === 0) return;

        // 收集选中的牌
        const selectedCards: PokerCard[] = [];
        const indices = [...this.selectedIndices].sort((a, b) => a - b);
        for (const idx of indices) {
            selectedCards.push(this.myCards[idx]);
        }

        // 验证牌型
        const pattern = this.recognizePattern(selectedCards);
        if (!pattern) {
            console.warn('[PokerRoom] Invalid card combination');
            return;
        }

        // 与上一手比较(非首出时)
        if (!this.pokerActions?.isLeader && this.lastPlay) {
            if (!this.canBeat(pattern, this.lastPlay)) {
                console.warn('[PokerRoom] Cannot beat last play');
                return;
            }
        }

        // 从手牌移除
        for (let i = indices.length - 1; i >= 0; i--) {
            this.myCards.splice(indices[i], 1);
        }
        this.selectedIndices.clear();

        // 创建出牌记录
        const play: CardPlay = {
            pattern: pattern.pattern,
            cards: selectedCards,
            weight: pattern.weight,
        };

        // 发送到服务端
        this.sendPlay(play);

        // 本地展示
        this.showMyPlay(play);

        // 更新显示
        this.renderMyHand();
        this.updateCardCountDisplay();
        this.isMyTurn = false;

        this.pokerCallbacks.onCardPlay?.(play, this.getMySeatIndex());
    }

    /**
     * 不出/跳过
     */
    public pass(): void {
        if (!this.isMyTurn || !this.pokerActions?.canPass) return;

        this.clearSelection();
        this.isMyTurn = false;

        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action('pass', {});

        // 清空自己的出牌区显示
        if (this.myPlayArea) {
            this.myPlayArea.removeAllChildren();
        }
    }

    /**
     * 提示(自动选出一手能打得过的牌)
     */
    public hint(): void {
        if (!this.isMyTurn) return;
        this.clearSelection();

        if (this.pokerActions?.isLeader) {
            // 首出时提示最小的单张
            if (this.myCards.length > 0) {
                this.selectedIndices.add(this.myCards.length - 1); // 最小的牌
                this.renderMyHand();
            }
        } else if (this.lastPlay) {
            // 找能打得过的最小组合
            const hint = this.findSmallestBeatingPlay(this.lastPlay);
            if (hint) {
                for (const idx of hint.indices) {
                    this.selectedIndices.add(idx);
                }
                this.renderMyHand();
            }
        }
    }

    /**
     * 发送出牌到服务端
     */
    protected sendPlay(play: CardPlay): void {
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action('play_cards', {
            cards: play.cards.map(c => ({ cardId: c.cardId, value: c.value, suit: c.suit })),
            pattern: play.pattern,
        });

        this.playedRecords.set(this.getMySeatIndex(), play);
    }

    // ==================== 牌型识别 ====================

    /**
     * 识别牌型 (基础实现，子类可扩展)
     * @param cards 要识别的牌
     * @returns 识别结果，无效返回null
     */
    protected recognizePattern(cards: PokerCard[]): CardPlay | null {
        const n = cards.length;
        if (n === 0) return null;

        const values = cards.map(c => c.value).sort((a, b) => a - b);

        // 单张
        if (n === 1) {
            return { pattern: PokerPattern.Single, cards, weight: values[0] };
        }

        // 对子
        if (n === 2 && values[0] === values[1]) {
            // 王炸
            if (values[0] >= 15) {
                return { pattern: PokerPattern.Rocket, cards, weight: 1000 };
            }
            return { pattern: PokerPattern.Pair, cards, weight: values[0] };
        }

        // 三条
        if (n === 3 && values[0] === values[1] && values[1] === values[2]) {
            return { pattern: PokerPattern.Triple, cards, weight: values[0] };
        }

        // 炸弹(四张相同)
        if (n === 4 && values[0] === values[1] && values[1] === values[2] && values[2] === values[3]) {
            return { pattern: PokerPattern.Bomb, cards, weight: 500 + values[0] };
        }

        // 三带一
        if (n === 4) {
            const tripleValue = this.findTripleValue(values);
            if (tripleValue !== -1) {
                return { pattern: PokerPattern.TripleWithOne, cards, weight: tripleValue };
            }
        }

        // 三带二
        if (n === 5) {
            const tripleValue = this.findTripleValue(values);
            if (tripleValue !== -1) {
                const pairValue = this.findPairValueExclude(values, tripleValue);
                if (pairValue !== -1) {
                    return { pattern: PokerPattern.TripleWithPair, cards, weight: tripleValue };
                }
            }
        }

        // 顺子 (5张及以上连续单牌，不含2和王)
        if (n >= 5 && this.isConsecutive(values) && !values.some(v => v >= 15)) {
            return { pattern: PokerPattern.Straight, cards, weight: values[0] };
        }

        // 连对 (3对及以上连续对子)
        if (n >= 6 && n % 2 === 0 && this.isConsecutivePairs(values)) {
            return { pattern: PokerPattern.ConsecutivePairs, cards, weight: values[0] };
        }

        // 飞机(连续三张不带/带翅膀) - 简化版
        if (n >= 6) {
            const airplane = this.recognizeAirplane(values, cards);
            if (airplane) return airplane;
        }

        return null; // 无法识别
    }

    // ==================== 牌型比较 ====================

    /**
     * 判断 play 能否打过 target
     */
    protected canBeat(play: CardPlay, target: CardPlay): boolean {
        // 火箭最大
        if (play.pattern === PokerPattern.Rocket) return true;
        if (target.pattern === PokerPattern.Rocket) return false;

        // 炸弹大于非炸弹
        if (play.pattern === PokerPattern.Bomb && target.pattern !== PokerPattern.Bomb) return true;
        if (target.pattern === PokerPattern.Bomb && play.pattern !== PokerPattern.Bomb) return false;

        // 同牌型比重量
        if (play.pattern === target.pattern) {
            return play.weight > target.weight;
        }

        // 不同非炸弹牌型不能打
        return false;
    }

    /**
     * 寻找能打过目标的最小牌型
     */
    protected findSmallestBeatingPlay(target: CardPlay): { indices: number[]; play: CardPlay } | null {
        // 简化实现：遍历所有可能的组合
        const n = this.myCards.length;

        // 尝试单张
        if (target.pattern === PokerPattern.Single) {
            for (let i = n - 1; i >= 0; i--) {
                if (this.myCards[i].value > target.weight) {
                    const play = this.recognizePattern([this.myCards[i]]);
                    if (play) return { indices: [i], play };
                }
            }
        }

        // 尝试对子
        if (target.pattern === PokerPattern.Pair) {
            for (let i = n - 1; i >= 1; i--) {
                if (this.myCards[i].value === this.myCards[i - 1].value &&
                    this.myCards[i].value > target.weight) {
                    const play = this.recognizePattern([this.myCards[i - 1], this.myCards[i]]);
                    if (play) return { indices: [i - 1, i], play };
                }
            }
        }

        // 尝试炸弹(通用压制)
        if (target.pattern !== PokerPattern.Rocket) {
            for (let i = 0; i <= n - 4; i++) {
                if (this.myCards[i].value === this.myCards[i + 3].value) {
                    const play = this.recognizePattern([
                        this.myCards[i], this.myCards[i + 1],
                        this.myCards[i + 2], this.myCards[i + 3],
                    ]);
                    if (play && this.canBeat(play, target)) {
                        return { indices: [i, i + 1, i + 2, i + 3], play };
                    }
                }
            }
        }

        return null;
    }

    // ==================== 其他玩家出牌 ====================

    /**
     * 处理其他玩家出牌
     */
    public onOtherPlayerPlay(seatIndex: number, play: CardPlay): void {
        this.playedRecords.set(seatIndex, play);
        this.lastPlay = play;
        this.showOtherPlay(seatIndex, play);
    }

    /**
     * 展示其他玩家出牌
     */
    protected showOtherPlay(seatIndex: number, play: CardPlay): void {
        const playArea = this.getPlayAreaBySeat(seatIndex);
        if (!playArea) return;

        playArea.removeAllChildren();
        for (const card of play.cards) {
            const cardNode = this.createCardNode(card, false);
            cardNode.setScale(new Vec3(0.7, 0.7, 1));
            if (playArea) {
                cardNode.parent = playArea;
            }
        }
    }

    /**
     * 展示自己的出牌
     */
    protected showMyPlay(play: CardPlay): void {
        if (!this.myPlayArea) return;
        this.myPlayArea.removeAllChildren();
        for (const card of play.cards) {
            const cardNode = this.createCardNode(card, false);
            if (this.myPlayArea) {
                cardNode.parent = this.myPlayArea;
            }
        }
    }

    // ==================== 操作面板 ====================

    /**
     * 显示扑克操作面板
     */
    public showPokerActionPanel(actions: PokerAvailableActions): void {
        this.pokerActions = actions;
        this.isMyTurn = true;
        if (this.actionPanel) {
            this.actionPanel.active = true;
        }
    }

    /**
     * 隐藏操作面板
     */
    public hidePokerActionPanel(): void {
        this.pokerActions = null;
        if (this.actionPanel) {
            this.actionPanel.active = false;
        }
    }

    // ==================== 倍数管理 ====================

    /**
     * 增加倍数
     */
    public addMultiplier(delta: number): void {
        this.currentMultiplier *= delta;
        if (this.multiLabel) {
            this.multiLabel.string = `${this.currentMultiplier}倍`;
        }
    }

    /**
     * 更新各玩家手牌数
     */
    public updatePlayerCardCount(seatIndex: number, count: number): void {
        this.playerCardCounts.set(seatIndex, count);
        // 子类可在各座位上显示手牌数
    }

    // ==================== 工具方法 ====================

    /**
     * 创建扑克牌节点
     */
    protected createCardNode(card: PokerCard, interactive: boolean): Node {
        if (this.cardPrefab) {
            const node = instantiate(this.cardPrefab);
            // 子类应设置牌面贴图(根据 value + suit)
            return node;
        }
        const node = new Node(`card_${card.value}_${card.suit}`);
        node['_cardData'] = card;
        return node;
    }

    /** 查找三条的值 */
    protected findTripleValue(sortedValues: number[]): number {
        for (let i = 0; i <= sortedValues.length - 3; i++) {
            if (sortedValues[i] === sortedValues[i + 1] && sortedValues[i + 1] === sortedValues[i + 2]) {
                return sortedValues[i];
            }
        }
        return -1;
    }

    /** 查找对子的值(排除某个值) */
    protected findPairValueExclude(sortedValues: number[], exclude: number): number {
        for (let i = 0; i < sortedValues.length - 1; i++) {
            if (sortedValues[i] === sortedValues[i + 1] && sortedValues[i] !== exclude) {
                return sortedValues[i];
            }
        }
        return -1;
    }

    /** 检查是否连续(顺子) */
    protected isConsecutive(sortedValues: number[]): boolean {
        for (let i = 1; i < sortedValues.length; i++) {
            if (sortedValues[i] !== sortedValues[i - 1] + 1) return false;
        }
        return true;
    }

    /** 检查是否为连续对子 */
    protected isConsecutivePairs(sortedValues: number[]): boolean {
        if (sortedValues.length % 2 !== 0) return false;
        for (let i = 0; i < sortedValues.length; i += 2) {
            if (sortedValues[i] !== sortedValues[i + 1]) return false;
            if (i > 0 && sortedValues[i] !== sortedValues[i - 2] + 1) return false;
        }
        return true;
    }

    /** 简化的飞机识别 */
    protected recognizeAirplane(sortedValues: number[], originalCards: PokerCard[]): CardPlay | null {
        // 连续两个三张以上即可视为飞机(简化)
        // 实际实现需要更复杂的匹配
        return null;
    }

    // ==================== 重置与清理 ====================

    /**
     * 重置一轮状态
     */
    protected resetRoundState(): void {
        this.myCards = [];
        this.selectedIndices.clear();
        this.playedRecords.clear();
        this.playerCardCounts.clear();
        this.lastPlay = null;
        this.leadSeatIndex = -1;
        this.isMyTurn = false;
        this.currentMultiplier = 1;
        this.hidePokerActionPanel();

        // 清空所有显示区域
        [this.myHandArea, this.leftHandArea, this.rightHandArea, this.topHandArea].forEach(area => {
            if (area) area.removeAllChildren();
        });
        [this.myPlayArea, this.leftPlayArea, this.rightPlayArea, this.topPlayArea].forEach(area => {
            if (area) area.removeAllChildren();
        });
    }

    protected handleGameStart(data: any): boolean {
        super.handleGameStart(data);
        this.resetRoundState();
        return true;
    }

    protected handleFinalSettlement(data: any): boolean {
        super.handleFinalSettlement(data);
        this.resetRoundState();
        return true;
    }

    protected onAutoAction(): void {
        // 扑克超时自动行为：
        // 1. 能出则出最小的一手
        // 2. 不行则pass(如果允许)
        if (this.pokerActions?.mustPlay || !this.pokerActions?.canPass) {
            this.hint();
            if (this.selectedIndices.size > 0) {
                this.playSelectedCards();
            }
        } else {
            this.pass();
        }
    }

    protected cleanup(): void {
        super.cleanup();
        this.resetRoundState();
        this.pokerCallbacks = {};
    }
}
