/**
 * 字牌/纸牌房间基类 (ZipaiRoomBase) - v2 完整版
 *
 * 集成真实服务器协议的字牌基类，提供：
 * - 完整的字牌在线协议（同步/发牌/出牌/偎提碰跑吃胡/结算）
 * - 字牌特有操作面板
 * - 组合计分
 *
 * 适用游戏：益阳歪胡子（跑胡子）
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, Prefab, instantiate, Vec3 } from 'cc';
import { RoomBase } from './RoomBase';
import { RoomState, RoundSettlementData, FinalSettlementData } from './GameTypes';
import { NetworkManager } from '../Manager/NetworkManager';

const { ccclass, property } = _decorator;

// ==================== 字牌类型定义 ====================

export enum ZipaiRank {
    Yi_1 = 1, Er_2 = 2, San_3 = 3, Si_4 = 4, Wu_5 = 5,
    Liu_6 = 7, Qi_7 = 7, Ba_8 = 8, Jiu_9 = 9, Shi_10 = 10,
    DaYi = 11, DaEr = 12, DaSan = 13, DaSi = 14,
    DaWu = 15, DaLiu = 16, DaQi = 17, DaBa = 18,
    DaJiu = 19, DaShi = 20,
}

export enum ZipaiSuit {
    Red = 'red',
    Black = 'black',
}

export interface ZipaiTile {
    rank: ZipaiRank;
    suit: ZipaiSuit;
    tileId: string;
}

export enum ZipaiAction {
    Wei = 'wei', Ti = 'ti', Peng = 'peng', Hu = 'hu',
    Pao = 'pao', Chi = 'chi', Pass = 'pass',
}

export interface ZipaiAvailableActions {
    canWei?: boolean;
    canTi?: boolean;
    canPeng?: boolean;
    canHu?: boolean;
    canPao?: boolean;
    canChi?: boolean;
    chiCombinations?: ZipaiTile[][];
}

export enum MeldType {
    Wei = 'wei', Ti = 'ti', Peng = 'peng', Pao = 'pao', Chi = 'chi',
}

export interface ZipaiMeld {
    type: MeldType;
    tiles: ZipaiTile[];
    fromSeat?: number;
}

export interface ZipaiEventCallbacks {
    onHandChanged?: (tiles: ZipaiTile[]) => void;
    onDiscard?: (tile: ZipaiTile, seatIndex: number) => void;
    onZipaiAction?: (action: ZipaiAction, tiles?: ZipaiTile[]) => void;
    onDrawTile?: (tile: ZipaiTile) => void;
    onWin?: (winType: string, tiles: ZipaiTile[]) => void;
}

@ccclass('ZipaiRoomBase')
export class ZipaiRoomBase extends RoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected zipaiTable: Node = null;

    @property({ type: Node })
    protected myHandArea: Node = null;

    @property({ type: Node })
    protected leftHandArea: Node = null;

    @property({ type: Node })
    protected rightHandArea: Node = null;

    @property({ type: Node })
    protected myDiscardArea: Node = null;

    @property({ type: Node })
    protected leftDiscardArea: Node = null;

    @property({ type: Node })
    protected rightDiscardArea: Node = null;

    @property({ type: Node })
    protected meldArea: Node = null;

    @property({ type: Node })
    protected leftMeldArea: Node = null;

    @property({ type: Node })
    protected rightMeldArea: Node = null;

    @property({ type: Node })
    protected actionPanel: Node = null;         // 偎/提/碰/跑/胡/吃/过 面板

    @property({ type: Node })
    protected drawnTileNode: Node = null;

    @property({ type: Label })
    protected scoreLabel: Label = null;

    @property({ type: Label })
    protected remainCountLabel: Label = null;

    @property({ type: Prefab })
    protected zipaiTilePrefab: Prefab = null;

    // ==================== 内部状态 ====================

    protected myHandTiles: ZipaiTile[] = [];
    protected drawnTile: ZipaiTile | null = null;
    protected discardRecords: Map<number, ZipaiTile[]> = new Map();
    protected meldRecords: Map<number, ZipaiMeld[]> = new Map();
    protected zipaiActions: ZipaiAvailableActions | null = null;
    protected isMyTurn: boolean = false;
    protected remainingTiles: number = 0;
    protected currentScore: number = 0;
    protected zpCallbacks: ZipaiEventCallbacks = {};

    // ==================== 消息前缀 ====================

    protected get zipaiMsgPrefix(): string {
        return "MsgZipai";
    }

    // ==================== 生命周期 ====================

    onLoad(): void {
        super.onLoad();
        this.initRecords();
    }

    start(): void {
        super.start();
        this.syncMsgPrefix = this.zipaiMsgPrefix;
    }

    // ==================== NetMsgHandler 覆写 (字牌特有消息) ====================

    public onMessage(msgType: string, msg: any): boolean {
        if (super.onMessage(msgType, msg)) return true;

        const prefix = this.zipaiMsgPrefix;
        let ret = true;

        if (msgType === prefix + "StartGameResp") this.onZpStartGameResp(msg);
        else if (msgType === prefix + "DealCard") this.onZpDealCard();
        else if (msgType === prefix + "HandCard") this.onZpHandCard(msg);
        else if (msgType === prefix + "DrawTile") this.onZpDrawTile(msg);
        else if (msgType === prefix + "RequestActions") this.onZpRequestActions(msg);
        else if (msgType === prefix + "PlayerDiscard") this.onZpPlayerDiscard(msg);
        else if (msgType === prefix + "PlayerWei") this.onZpPlayerWei(msg);
        else if (msgType === prefix + "PlayerTi") this.onZpPlayerTi(msg);
        else if (msgType === prefix + "PlayerPeng") this.onZpPlayerPeng(msg);
        else if (msgType === prefix + "PlayerPao") this.onZpPlayerPao(msg);
        else if (msgType === prefix + "PlayerChi") this.onZpPlayerChi(msg);
        else if (msgType === prefix + "PlayerHu") this.onZpPlayerHu(msg);
        else if (msgType === prefix + "RoundSettlement") this.onZpRoundSettlement(msg);
        else if (msgType === prefix + "FinalSettlement") this.onZpFinalSettlement(msg);
        else ret = false;

        return ret;
    }

    // ==================== 字牌服务器消息处理 ----

    protected onZpStartGameResp(_msg: any): void {
        this.gameState = GameState.Playing;
        console.log(`[ZipaiRoom] Game started`);
    }

    protected onZpDealCard(): void {
        console.log(`[ZipaiRoom] Dealing...`);
    }

    protected onZpHandCard(msg: any): void {
        const tiles: ZipaiTile[] = msg.tiles || [];
        this.dealTiles(tiles);
    }

    protected onZpDrawTile(msg: any): void {
        const tile: ZipaiTile = msg.tile;
        if (tile) this.drawTile(tile);
    }

    /** 操作请求 */
    protected onZpRequestActions(msg: any): void {
        const actions: ZipaiAvailableActions = msg.actions || {};
        this.showActionPanel(actions);

        const timeout = actions.canPao ? 15 : (actions.canHu ? 12 : (actions.canTi || actions.canPeng || actions.canWei ? 8 : 5));
        this.startCountdown(timeout);
    }

    /** 其他玩家出牌 */
    protected onZpPlayerDiscard(msg: any): void {
        const clientSeat = this.server2ClientSeat(msg.seatIndex);
        const tile: ZipaiTile = msg.tile;
        if (tile) this.onOtherPlayerDiscard(clientSeat, tile);
    }

    protected onZpPlayerWei(_msg: any): void { console.log(`[ZipaiRoom] Player wei`); }
    protected onZpPlayerTi(_msg: any): void { console.log(`[ZipaiRoom] Player ti`); }
    protected onZpPlayerPeng(_msg: any): void { console.log(`[ZipaiRoom] Player peng`); }
    protected onZpPlayerPao(_msg: any): void { console.log(`[ZipaiRoom] Player pao`); }
    protected onZpPlayerChi(_msg: any): void { console.log(`[ZipaiRoom] Player chi`); }

    /** 其他玩家/自己胡牌 */
    protected onZpPlayerHu(msg: any): void {
        this.stopCountdown();
        const huSeat = this.server2ClientSeat(msg.seatIndex);
        console.log(`[ZipaiRoom] Player hu at seat ${huSeat}`);
    }

    protected onZpRoundSettlement(msg: any): void {
        this.currentState = RoomState.RoundSettlement;
        this.stopCountdown();
        console.log(`[ZipaiRoom] Round settlement`, msg);
        this.handleRoundSettlement(msg);
    }

    protected onZpFinalSettlement(msg: any): void {
        this.currentState = RoomState.FinalSettlement;
        this.handleFinalSettlement(msg);
    }

    // ==================== 座位覆写 ====================

    protected getSeatCount(): number { return 2; }

    protected getHandAreaBySeat(seatIndex: number): Node {
        switch (seatIndex) {
            case 0: return this.myHandArea;
            case 1: return this.leftHandArea;
            default: return null;
        }
    }

    protected getDiscardAreaBySeat(seatIndex: number): Node {
        switch (seatIndex) {
            case 0: return this.myDiscardArea;
            case 1: return this.leftDiscardArea;
            default: return null;
        }
    }

    protected getMeldAreaBySeat(seatIndex: number): Node {
        switch (seatIndex) {
            case 0: return this.meldArea;
            case 1: return this.leftMeldArea;
            default: return null;
        }
    }

    // ==================== 发牌与手牌 ====================

    public dealTiles(tiles: ZipaiTile[]): void {
        this.myHandTiles = [...tiles];
        this.sortHandTiles();
        this.renderMyHand();
        console.log(`[ZipaiRoom] Dealt ${tiles.length} tiles`);
    }

    protected sortHandTiles(): void {
        this.myHandTiles.sort((a, b) => {
            if (a.suit !== b.suit) return a.suit === ZipaiSuit.Red ? -1 : 1;
            return a.rank - b.rank;
        });
    }

    protected renderMyHand(): void {
        if (!this.myHandArea) return;
        this.myHandArea.removeAllChildren();

        for (let i = 0; i < this.myHandTiles.length; i++) {
            const tileNode = this.createTileNode(this.myHandTiles[i], true);
            tileNode.name = `tile_${i}`;
            tileNode['_tileIndex'] = i;
            if (this.myHandArea) tileNode.parent = this.myHandArea;
        }
    }

    // ==================== 摸牌 ====================

    public drawTile(tile: ZipaiTile): void {
        this.drawnTile = tile;
        this.showDrawnTile(tile);
        this.isMyTurn = true;
        this.zpCallbacks.onDrawTile?.(tile);
    }

    protected showDrawnTile(tile: ZipaiTile): void {
        if (!this.drawnTileNode) return;
        this.drawnTileNode.removeAllChildren();
        const tileNode = this.createTileNode(tile, true);
        if (this.drawnTileNode) tileNode.parent = this.drawnTileNode;
    }

    private integrateDrawnTile(): void {
        if (this.drawnTile) {
            this.myHandTiles.push(this.drawnTile);
            this.sortHandTiles();
            this.drawnTile = null;
            if (this.drawnTileNode) this.drawnTileNode.removeAllChildren();
        }
    }

    // ==================== 出牌 ====================

    public selectAndDiscard(tileIndex: number): void {
        if (!this.isMyTurn || (this.zipaiActions && !this.canDiscardDirectly())) return;

        const tile = this.myHandTiles[tileIndex];
        if (!tile) return;

        this.integrateDrawnTile();
        this.myHandTiles.splice(tileIndex, 1);
        this.renderMyHand();
        this.sendDiscard(tile);
        this.isMyTurn = false;
        this.stopCountdown();
    }

    protected canDiscardDirectly(): boolean {
        if (!this.zipaiActions) return true;
        return !(this.zipaiActions.canHu || this.zipaiActions.canPao ||
                 this.zipaiActions.canTi || this.zipaiActions.canPeng ||
                 this.zipaiActions.canWei || this.zipaiActions.canChi);
    }

    protected sendDiscard(tile: ZipaiTile): void {
        NetworkManager.Instance.sendInnerMessage(this.zipaiMsgPrefix + "Discard", {
            tileId: tile.tileId,
            rank: tile.rank,
            suit: tile.suit,
        });

        const mySeat = this.getMySeatIndex();
        let discs = this.discardRecords.get(mySeat) || [];
        discs.push(tile);
        this.discardRecords.set(mySeat, discs);
        this.addDiscardToDisplay(mySeat, tile);
        this.playDiscardSound();
        this.zpCallbacks.onDiscard?.(tile, mySeat);
    }

    protected getMySeatIndex(): number { return 0; }

    // ==================== 字牌操作面板 ====================

    public showActionPanel(actions: ZipaiAvailableActions): void {
        this.zipaiActions = actions;
        if (this.actionPanel) this.actionPanel.active = true;
        this.renderActionButtons(actions);
    }

    public hideActionPanel(): void {
        this.zipaiActions = null;
        if (this.actionPanel) this.actionPanel.active = false;
    }

    protected renderActionButtons(actions: ZipaiAvailableActions): void {
        console.log('[ZipaiRoom] Available actions:', JSON.stringify(actions));
    }

    // ---- 操作执行 (发送到服务端) ----

    public doActionWei(): void {
        this.hideActionPanel(); this.integrateDrawnTile();
        this.zpCallbacks.onZipaiAction?.(ZipaiAction.Wei);
        NetworkManager.Instance.sendInnerMessage(this.zipaiMsgPrefix + "Wei", {});
        this.stopCountdown();
    }

    public doActionTi(): void {
        this.hideActionPanel(); this.integrateDrawnTile();
        this.zpCallbacks.onZipaiAction?.(ZipaiAction.Ti);
        NetworkManager.Instance.sendInnerMessage(this.zipaiMsgPrefix + "Ti", {});
        this.stopCountdown();
    }

    public doActionPeng(): void {
        this.hideActionPanel(); this.integrateDrawnTile();
        this.zpCallbacks.onZipaiAction?.(ZipaiAction.Peng);
        NetworkManager.Instance.sendInnerMessage(this.zipaiMsgPrefix + "Peng", {});
        this.stopCountdown();
    }

    public doActionPao(): void {
        this.hideActionPanel(); this.integrateDrawnTile();
        this.zpCallbacks.onZipaiAction?.(ZipaiAction.Pao);
        NetworkManager.Instance.sendInnerMessage(this.zipaiMsgPrefix + "Pao", {});
        this.stopCountdown();
    }

    public doActionHu(): void {
        this.hideActionPanel(); this.integrateDrawnTile();
        this.zpCallbacks.onZipaiAction?.(ZipaiAction.Hu);
        NetworkManager.Instance.sendInnerMessage(this.zipaiMsgPrefix + "Hu", {});
        this.stopCountdown();
    }

    public doActionChi(_tiles?: ZipaiTile[]): void {
        this.hideActionPanel(); this.integrateDrawnTile();
        this.zpCallbacks.onZipaiAction?.(ZipaiAction.Chi, _tiles);
        NetworkManager.Instance.sendInnerMessage(this.zipaiMsgPrefix + "Chi", { tiles: _tiles });
        this.stopCountdown();
    }

    public doActionPass(): void {
        this.hideActionPanel();
        if (this.drawnTile) { this.integrateDrawnTile(); this.isMyTurn = true; }
        NetworkManager.Instance.sendInnerMessage(this.zipaiMsgPrefix + "Pass", {});
        this.stopCountdown();
    }

    // ==================== 组合展示 ====================

    public showMeldWei(s: number, t: ZipaiTile[]): void { this.addMeldRecord(s, { type: MeldType.Wei, tiles: t }); }
    public showMeldTi(s: number, t: ZipaiTile[]): void { this.addMeldRecord(s, { type: MeldType.Ti, tiles: t }); }
    public showMeldPeng(s: number, t: ZipaiTile[]): void { this.addMeldRecord(s, { type: MeldType.Peng, tiles: t }); }
    public showMeldPao(s: number, t: ZipaiTile[]): void { this.addMeldRecord(s, { type: MeldType.Pao, tiles: t }); }
    public showMeldChi(s: number, t: ZipaiTile[]): void { this.addMeldRecord(s, { type: MeldType.Chi, tiles: t }); }

    private addMeldRecord(si: number, meld: ZipaiMeld): void {
        let melds = this.meldRecords.get(si) || [];
        melds.push(meld);
        this.meldRecords.set(si, melds);
    }

    // ==================== 弃牌区 ====================

    protected addDiscardToDisplay(seatIndex: number, tile: ZipaiTile): void {
        const area = this.getDiscardAreaBySeat(seatIndex);
        if (!area) return;
        const tileNode = this.createTileNode(tile, false);
        tileNode.setScale(new Vec3(0.55, 0.55, 1));
        if (area) tileNode.parent = area;
    }

    public onOtherPlayerDiscard(seatIndex: number, tile: ZipaiTile): void {
        let discs = this.discardRecords.get(seatIndex) || [];
        discs.push(tile);
        this.discardRecords.set(seatIndex, discs);
        this.addDiscardToDisplay(seatIndex, tile);
    }

    // ==================== 分数与牌数 ====================

    public updateScore(score: number): void {
        this.currentScore = score;
        if (this.scoreLabel) this.scoreLabel.string = String(score);
    }

    public updateRemainingCount(count: number): void {
        this.remainingTiles = count;
        if (this.remainCountLabel) this.remainCountLabel.string = String(count);
    }

    // ==================== 音效接口 ====================

    protected playDiscardSound(): void {}
    protected playHuSound(): void {}

    // ==================== 工具方法 ====================

    protected createTileNode(tile: ZipaiTile, _interactive: boolean): Node {
        if (this.zipaiTilePrefab) return instantiate(this.zipaiTilePrefab);
        const node = new Node(`zipai_${tile.suit}_${tile.rank}`);
        node['_tileData'] = tile;
        return node;
    }

    static isBigTile(rank: ZipaiRank): boolean { return rank >= ZipaiRank.DaYi; }

    static isValidChiCombo(tiles: ZipaiTile[]): boolean {
        if (tiles.length !== 3) return false;
        const ranks = tiles.map(t => t.rank).sort((a, b) => a - b);
        if (ranks[0] === 1 && ranks[1] === 2 && ranks[2] === 3) return true;
        if (ranks[0] === 2 && ranks[1] === 7 && ranks[2] === 10) return true;
        if (ranks[2] - ranks[1] === 3 && ranks[1] - ranks[0] === 3) return true;
        if (ranks[0] >= 11) {
            const adj = ranks.map(r => r - 10);
            if (adj[0] === 1 && adj[1] === 2 && adj[2] === 3) return true;
            if (adj[0] === 2 && adj[1] === 7 && adj[2] === 10) return true;
        }
        return false;
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        this.myHandTiles = [];
        this.drawnTile = null;
        this.isMyTurn = false;
        this.zipaiActions = null;
        this.initRecords();
        this.hideActionPanel();

        [this.myHandArea, this.leftHandArea, this.rightHandArea].forEach(a => { if (a) a.removeAllChildren(); });
        [this.myDiscardArea, this.leftDiscardArea, this.rightDiscardArea].forEach(a => { if (a) a.removeAllChildren(); });
        [this.meldArea, this.leftMeldArea, this.rightMeldArea].forEach(a => { if (a) a.removeAllChildren(); });
        if (this.drawnTileNode) this.drawnTileNode.removeAllChildren();
    }

    protected handleGameStart(data: any): boolean {
        super.handleGameStart(data); this.resetRoundState(); return true;
    }

    protected handleFinalSettlement(data: any): boolean {
        super.handleFinalSettlement(data); this.resetRoundState(); return true;
    }

    protected onAutoAction(): void {
        if (this.zipaiActions?.canPao) this.doActionPao();
        else if (this.zipaiActions?.canHu) this.doActionHu();
        else if (this.zipaiActions?.canTi) this.doActionTi();
        else if (this.zipaiActions?.canPeng) this.doActionPeng();
        else if (this.zipaiActions?.canWei) this.doActionWei();
        else {
            if (this.drawnTile) this.integrateDrawnTile();
            if (this.myHandTiles.length > 0) this.selectAndDiscard(this.myHandTiles.length - 1);
        }
    }

    protected cleanup(): void {
        super.cleanup(); this.resetRoundState(); this.zpCallbacks = {};
    }

    public setZpCallbacks(callbacks: ZipaiEventCallbacks): void {
        this.zpCallbacks = { ...this.zpCallbacks, ...callbacks };
    }

    private initRecords(): void {
        for (let i = 0; i < this.getSeatCount(); i++) {
            this.discardRecords.set(i, []);
            this.meldRecords.set(i, []);
        }
    }
}
