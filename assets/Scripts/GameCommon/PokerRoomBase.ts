/**
 * 扑克房间基类 (PokerRoomBase) - v2 完整版
 *
 * 集成真实服务器协议的扑克基类，提供：
 * - 完整的扑克在线协议消息处理（同步/发牌/出牌/提示/结算）
 * - 手牌管理、选牌交互、出牌比较
 * - 倒计时与超时自动操作
 * - 炸弹倍数管理
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
    value: number;     // 2-14(A), 15(小王), 16(大王)
    suit: number;      // 0=黑桃, 1=红桃, 2=梅花, 3=方块, -1=王牌
    cardId: string;
}

/** 出牌组合 */
export interface CardPlay {
    pattern: PokerPattern;
    cards: PokerCard[];
    weight: number;
}

/** 扑克可用操作 */
export interface PokerAvailableActions {
    canPlay?: boolean;
    canPass?: boolean;
    canHint?: boolean;
    isLeader?: boolean;
    mustPlay?: boolean;
}

/** 扑克事件回调 */
export interface PokerEventCallbacks {
    onHandChanged?: (cards: PokerCard[]) => void;
    onCardPlay?: (play: CardPlay, seatIndex: number) => void;
    onRoundEnd?: (winnerSeat: number, plays: CardPlay[]) => void;
    onGameOver?: (rankings: number[]) => void;
    onSelectionChanged?: (selectedIndices: number[]) => void;
}

@ccclass('PokerRoomBase')
export class PokerRoomBase extends RoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected pokerTable: Node = null;

    @property({ type: Node })
    protected myHandArea: Node = null;

    @property({ type: Node })
    protected leftHandArea: Node = null;

    @property({ type: Node })
    protected rightHandArea: Node = null;

    @property({ type: Node })
    protected topHandArea: Node = null;

    @property({ type: Node })
    protected playArea: Node = null;

    @property({ type: Node })
    protected myPlayArea: Node = null;

    @property({ type: Node })
    protected leftPlayArea: Node = null;

    @property({ type: Node })
    protected rightPlayArea: Node = null;

    @property({ type: Node })
    protected topPlayArea: Node = null;

    @property({ type: Node })
    protected actionPanel: Node = null;          // 出牌/不出/提示按钮区

    @property({ type: Node })
    protected passGroup: Node = null;            // 不要按钮组

    @property({ type: Node })
    protected playGroup: Node = null;            // 出牌按钮组

    @property({ type: Label })
    protected cardCountLabel: Label = null;

    @property({ type: Label })
    protected multiLabel: Label = null;

    @property({ type: Prefab })
    protected cardPrefab: Prefab = null;

    @property({ type: Prefab })
    protected cardBackPrefab: Prefab = null;

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

    // ==================== 消息前缀 ====================

    protected get pokerMsgPrefix(): string {
        return "MsgPoker";
    }

    // ==================== 生命周期 ====================

    onLoad(): void {
        super.onLoad();
    }

    start(): void {
        super.start();
        this.syncMsgPrefix = this.pokerMsgPrefix;
    }

    // ==================== NetMsgHandler 覆写 (扑克特有消息) ====================

    public onMessage(msgType: string, msg: any): boolean {
        if (super.onMessage(msgType, msg)) return true;

        const prefix = this.pokerMsgPrefix;
        let ret = true;

        if (msgType === prefix + "StartGameResp") this.onPkStartGameResp(msg);
        else if (msgType === prefix + "DealCard") this.onPkDealCard();
        else if (msgType === prefix + "HandCard") this.onPkHandCard(msg);
        else if (msgType === prefix + "CardNums") this.onPkCardNums(msg);
        else if (msgType === prefix + "WaitPlay") this.onPkWaitPlay(msg);
        else if (msgType === prefix + "PlayCard") this.onPkPlayCard(msg);
        else if (msgType === prefix + "PlayCardFailed") this.onPkPlayCardFailed(msg);
        else if (msgType === prefix + "HintCardResp") this.onPkHintCardResp(msg);
        else if (msgType === prefix + "ClearPlayedOut") this.onPkClearPlayedOut();
        else if (msgType === prefix + "Finished") this.onPkFinished(msg);
        else if (msgType === prefix + "Result") this.onPkResult(msg);
        else ret = false;

        return ret;
    }

    // ==================== 扑克服务器消息处理 ----

    protected onPkStartGameResp(_msg: any): void {
        this.gameState = GameState.Playing;
        console.log(`[PokerRoom] Game started`);
    }

    protected onPkDealCard(): void {
        console.log(`[PokerRoom] Dealing cards...`);
    }

    protected onPkHandCard(msg: any): void {
        const cards: PokerCard[] = msg.cards || [];
        this.dealCards(cards);
    }

    protected onPkCardNums(msg: any): void {
        const nums: number[] = msg.nums || [];
        for (let i = 0; i < nums.length && i < this.getSeatCount(); i++) {
            this.updatePlayerCardCount(i, nums[i]);
        }
    }

    /** 轮到自己出牌 */
    protected onPkWaitPlay(_msg: any): void {
        this.isMyTurn = true;
        this.showPassAndPlayButtons(true);

        // 启动倒计时
        this.startCountdown(15);

        console.log(`[PokerRoom] Your turn to play`);
    }

    /** 其他玩家出牌 */
    protected onPkPlayCard(msg: any): void {
        const serverSeat = msg.seatIndex;
        const clientSeat = this.server2ClientSeat(serverSeat);
        const cards: PokerCard[] = msg.cards || [];

        const play = this.recognizePattern(cards) || {
            pattern: PokerPattern.Single,
            cards,
            weight: cards[0]?.value || 0,
        };

        this.playedRecords.set(clientSeat, play);
        this.lastPlay = play;
        this.showOtherPlay(clientSeat, play);

        // 检查是否轮到自己了
        const nextServerSeat = msg.nextSeat;
        if (nextServerSeat !== undefined && this.client2ServerSeat(0) === nextServerSeat) {
            this.isMyTurn = true;
            this.showPassAndPlayButtons(true);
            this.startCountdown(15);
        } else {
            this.isMyTurn = false;
            this.showPassAndPlayButtons(false);
        }
    }

    /** 出牌失败 */
    protected onPkPlayCardFailed(msg: any): void {
        console.warn(`[PokerRoom] Play failed:`, msg.reason || 'invalid play');
        this.playErrorSound();
    }

    /** 提示响应 */
    protected onPkHintCardResp(msg: any): void {
        const indices: number[] = msg.indices || [];
        this.clearSelection();
        for (const idx of indices) {
            this.selectedIndices.add(idx);
        }
        this.renderMyHand();
    }

    /** 清空出牌区 */
    protected onPkClearPlayedOut(): void {
        [this.myPlayArea, this.leftPlayArea, this.rightPlayArea, this.topPlayArea].forEach(area => {
            if (area) area.removeAllChildren();
        });
        this.lastPlay = null;
    }

    /** 一局结束 */
    protected onPkFinished(msg: any): void {
        this.stopCountdown();
        this.currentState = RoomState.RoundSettlement;
        console.log(`[PokerRoom] Round finished`, msg);
        this.handleRoundSettlement(msg);
    }

    /** 结算结果 */
    protected onPkResult(msg: any): void {
        console.log(`[PokerRoom] Result:`, msg);
        this.handleFinalSettlement(msg);
    }

    // ==================== 座位覆写 ====================

    protected getSeatCount(): number {
        return 3; // 默认3人，子类覆写
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

    public dealCards(cards: PokerCard[]): void {
        this.myCards = [...cards];
        this.sortHandCards();
        this.renderMyHand();
        this.updateCardCountDisplay();
        console.log(`[PokerRoom] Dealt ${cards.length} cards`);
    }

    protected sortHandCards(): void {
        this.myCards.sort((a, b) => {
            if (a.value !== b.value) return b.value - a.value;
            return a.suit - b.suit;
        });
    }

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
            if (this.selectedIndices.has(i)) {
                this.applySelectedStyle(cardNode);
            }
        }
    }

    protected updateCardCountDisplay(): void {
        if (this.cardCountLabel) {
            this.cardCountLabel.string = `${this.myCards.length}张`;
        }
    }

    protected getMySeatIndex(): number { return 0; }

    // ==================== 选牌交互 ====================

    public toggleCardSelection(cardIndex: number): void {
        if (!this.isMyTurn) return;

        if (this.selectedIndices.has(cardIndex)) {
            this.selectedIndices.delete(cardIndex);
        } else {
            this.selectedIndices.add(cardIndex);
        }

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

    public clearSelection(): void {
        this.selectedIndices.clear();
        this.renderMyHand();
    }

    protected getCardNodeByIndex(index: number): Node | null {
        if (!this.myHandArea) return null;
        return this.myHandArea.getChildByName(`card_${index}`);
    }

    protected applySelectedStyle(node: Node): void {
        node.setPosition(0, 30, 0);
    }

    protected applyNormalStyle(node: Node): void {
        node.setPosition(0, 0, 0);
    }

    // ==================== 出牌操作 ====================

    public playSelectedCards(): void {
        if (!this.isMyTurn || this.selectedIndices.size === 0) return;

        const selectedCards: PokerCard[] = [];
        const indices = [...this.selectedIndices].sort((a, b) => a - b);
        for (const idx of indices) {
            selectedCards.push(this.myCards[idx]);
        }

        const pattern = this.recognizePattern(selectedCards);
        if (!pattern) {
            console.warn('[PokerRoom] Invalid card combination');
            this.playErrorSound();
            return;
        }

        // 与上一手比较(非首出时)
        if (!this.pokerActions?.isLeader && this.lastPlay) {
            if (!this.canBeat(pattern, this.lastPlay)) {
                console.warn('[PokerRoom] Cannot beat last play');
                this.playErrorSound();
                return;
            }
        }

        // 从手牌移除
        for (let i = indices.length - 1; i >= 0; i--) {
            this.myCards.splice(indices[i], 1);
        }
        this.selectedIndices.clear();

        const play: CardPlay = {
            pattern: pattern.pattern,
            cards: selectedCards,
            weight: pattern.weight,
        };

        // 发送到服务端
        this.sendPlay(play);

        this.showMyPlay(play);
        this.renderMyHand();
        this.updateCardCountDisplay();
        this.isMyTurn = false;
        this.stopCountdown();
        this.showPassAndPlayButtons(false);

        this.pokerCallbacks.onCardPlay?.(play, this.getMySeatIndex());
    }

    /**
     * 不要 / 过
     */
    public pass(): void {
        if (!this.isMyTurn || !this.pokerActions?.canPass) return;

        this.clearSelection();
        this.isMyTurn = false;
        this.stopCountdown();
        this.showPassAndPlayButtons(false);

        NetworkManager.Instance.sendInnerMessage(this.pokerMsgPrefix + "Pass", {});

        if (this.myPlayArea) {
            this.myPlayArea.removeAllChildren();
        }
        this.playPassSound();
    }

    /** 提示 */
    public hint(): void {
        if (!this.isMyTurn) return;
        this.clearSelection();
        NetworkManager.Instance.sendInnerMessage(this.pokerMsgPrefix + "HintCard", {});
    }

    /** 显示/隐藏出牌和不要按钮 */
    protected showPassAndPlayButtons(show: boolean): void {
        if (this.passGroup) this.passGroup.active = show;
        if (this.playGroup) this.playGroup.active = show;
    }

    /**
     * 发送出牌到服务端
     */
    protected sendPlay(play: CardPlay): void {
        NetworkManager.Instance.sendInnerMessage(this.pokerMsgPrefix + "PlayCard", {
            cards: play.cards.map(c => ({ cardId: c.cardId, value: c.value, suit: c.suit })),
            pattern: play.pattern,
        });

        this.playedRecords.set(this.getMySeatIndex(), play);

        // 检查炸弹/火箭加倍
        if (play.pattern === PokerPattern.Bomb) {
            this.addMultiplier(2);
        } else if (play.pattern === PokerPattern.Rocket) {
            this.addMultiplier(4);
        }

        this.playCardSound(play.pattern);
    }

    // ==================== 牌型识别 ====================

    protected recognizePattern(cards: PokerCard[]): CardPlay | null {
        const n = cards.length;
        if (n === 0) return null;

        const values = cards.map(c => c.value).sort((a, b) => a - b);

        if (n === 1) {
            return { pattern: PokerPattern.Single, cards, weight: values[0] };
        }
        if (n === 2 && values[0] === values[1]) {
            if (values[0] >= 15) return { pattern: PokerPattern.Rocket, cards, weight: 1000 };
            return { pattern: PokerPattern.Pair, cards, weight: values[0] };
        }
        if (n === 3 && values[0] === values[1] && values[1] === values[2]) {
            return { pattern: PokerPattern.Triple, cards, weight: values[0] };
        }
        if (n === 4 && values[0] === values[1] && values[1] === values[2] && values[2] === values[3]) {
            return { pattern: PokerPattern.Bomb, cards, weight: 500 + values[0] };
        }
        if (n === 4) {
            const tv = this.findTripleValue(values);
            if (tv !== -1) return { pattern: PokerPattern.TripleWithOne, cards, weight: tv };
        }
        if (n === 5) {
            const tv = this.findTripleValue(values);
            if (tv !== -1) {
                const pv = this.findPairValueExclude(values, tv);
                if (pv !== -1) return { pattern: PokerPattern.TripleWithPair, cards, weight: tv };
            }
        }
        if (n >= 5 && this.isConsecutive(values) && !values.some(v => v >= 15)) {
            return { pattern: PokerPattern.Straight, cards, weight: values[0] };
        }
        if (n >= 6 && n % 2 === 0 && this.isConsecutivePairs(values)) {
            return { pattern: PokerPattern.ConsecutivePairs, cards, weight: values[0] };
        }

        return null;
    }

    // ==================== 牌型比较 ====================

    protected canBeat(play: CardPlay, target: CardPlay): boolean {
        if (play.pattern === PokerPattern.Rocket) return true;
        if (target.pattern === PokerPattern.Rocket) return false;
        if (play.pattern === PokerPattern.Bomb && target.pattern !== PokerPattern.Bomb) return true;
        if (target.pattern === PokerPattern.Bomb && play.pattern !== PokerPattern.Bomb) return false;
        if (play.pattern === target.pattern) {
            return play.weight > target.weight;
        }
        return false;
    }

    protected findSmallestBeatingPlay(target: CardPlay): { indices: number[]; play: CardPlay } | null {
        const n = this.myCards.length;

        if (target.pattern === PokerPattern.Single) {
            for (let i = n - 1; i >= 0; i--) {
                if (this.myCards[i].value > target.weight) {
                    const play = this.recognizePattern([this.myCards[i]]);
                    if (play) return { indices: [i], play };
                }
            }
        }
        if (target.pattern === PokerPattern.Pair) {
            for (let i = n - 1; i >= 1; i--) {
                if (this.myCards[i].value === this.myCards[i - 1].value &&
                    this.myCards[i].value > target.weight) {
                    const play = this.recognizePattern([this.myCards[i - 1], this.myCards[i]]);
                    if (play) return { indices: [i - 1, i], play };
                }
            }
        }
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

    public onOtherPlayerPlay(seatIndex: number, play: CardPlay): void {
        this.playedRecords.set(seatIndex, play);
        this.lastPlay = play;
        this.showOtherPlay(seatIndex, play);
    }

    protected showOtherPlay(seatIndex: number, play: CardPlay): void {
        const playArea = this.getPlayAreaBySeat(seatIndex);
        if (!playArea) return;
        playArea.removeAllChildren();
        for (const card of play.cards) {
            const cardNode = this.createCardNode(card, false);
            cardNode.setScale(new Vec3(0.7, 0.7, 1));
            if (playArea) cardNode.parent = playArea;
        }
    }

    protected showMyPlay(play: CardPlay): void {
        if (!this.myPlayArea) return;
        this.myPlayArea.removeAllChildren();
        for (const card of play.cards) {
            const cardNode = this.createCardNode(card, false);
            if (this.myPlayArea) cardNode.parent = this.myPlayArea;
        }
    }

    // ==================== 操作面板 ====================

    public showPokerActionPanel(actions: PokerAvailableActions): void {
        this.pokerActions = actions;
        this.isMyTurn = true;
        if (this.actionPanel) this.actionPanel.active = true;
    }

    public hidePokerActionPanel(): void {
        this.pokerActions = null;
        if (this.actionPanel) this.actionPanel.active = false;
    }

    // ==================== 倍数管理 ====================

    public addMultiplier(delta: number): void {
        this.currentMultiplier *= delta;
        if (this.multiLabel) {
            this.multiLabel.string = `${this.currentMultiplier}倍`;
        }
    }

    public updatePlayerCardCount(seatIndex: number, count: number): void {
        this.playerCardCounts.set(seatIndex, count);
    }

    // ==================== 工具方法 ====================

    protected createCardNode(card: PokerCard, _interactive: boolean): Node {
        if (this.cardPrefab) {
            return instantiate(this.cardPrefab);
        }
        const node = new Node(`card_${card.value}_${card.suit}`);
        node['_cardData'] = card;
        return node;
    }

    protected findTripleValue(sortedValues: number[]): number {
        for (let i = 0; i <= sortedValues.length - 3; i++) {
            if (sortedValues[i] === sortedValues[i + 1] && sortedValues[i + 1] === sortedValues[i + 2]) {
                return sortedValues[i];
            }
        }
        return -1;
    }

    protected findPairValueExclude(sortedValues: number[], exclude: number): number {
        for (let i = 0; i < sortedValues.length - 1; i++) {
            if (sortedValues[i] === sortedValues[i + 1] && sortedValues[i] !== exclude) {
                return sortedValues[i];
            }
        }
        return -1;
    }

    protected isConsecutive(sortedValues: number[]): boolean {
        for (let i = 1; i < sortedValues.length; i++) {
            if (sortedValues[i] !== sortedValues[i - 1] + 1) return false;
        }
        return true;
    }

    protected isConsecutivePairs(sortedValues: number[]): boolean {
        if (sortedValues.length % 2 !== 0) return false;
        for (let i = 0; i < sortedValues.length; i += 2) {
            if (sortedValues[i] !== sortedValues[i + 1]) return false;
            if (i > 0 && sortedValues[i] !== sortedValues[i - 2] + 1) return false;
        }
        return true;
    }

    // ==================== 音效接口 ====================

    protected playCardSound(_pattern: PokerPattern): void {}
    protected playPassSound(): void {}
    protected playErrorSound(): void {}
    protected playBombSound(): void {}

    // ==================== 重置与清理 ====================

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
        this.showPassAndPlayButtons(false);

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

    public setPokerCallbacks(callbacks: PokerEventCallbacks): void {
        this.pokerCallbacks = { ...this.pokerCallbacks, ...callbacks };
    }
}
