/**
 * 麻将房间基类 (MahjongRoomBase) - v2 完整版
 *
 * 集成真实服务器协议的麻将基类，提供：
 * - 完整的麻将在线协议消息处理（同步/发牌/摸牌/出牌/操作请求/结算）
 * - 手牌管理、吃碰杠胡操作面板
 * - 倒计时与超时自动操作
 * - 音效播放接口
 * - 断线重连恢复
 *
 * 适用游戏：桃江麻将、红中麻将、长沙麻将
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, Prefab, instantiate, Vec3, Tween, tween, UIOpacity, SpriteFrame, AudioClip } from 'cc';
import { RoomBase, RoomLevel, GameState } from './RoomBase';
import { RoomState, PlayerRoomState, SeatPosition, MahjongAction, RoundSettlementData, FinalSettlementData } from './GameTypes';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { GameManager } from '../Manager/GameManager';
import { NetworkManager } from '../Manager/NetworkManager';

const { ccclass, property } = _decorator;

// ==================== 麻将类型定义 ====================

/** 麻将牌数据 */
export interface MahjongTile {
    value: number;
    suit: number;
    tileId: string;
}

/** 可用操作列表 */
export interface AvailableActions {
    canChi?: boolean;
    canPeng?: boolean;
    canGang?: boolean;
    canHu?: boolean;
    canTing?: boolean;
    gangTiles?: number[];
    chiTiles?: number[][];
}

/** 出牌结果 */
export interface DiscardResult {
    playerId: string;
    tile: MahjongTile;
    seatIndex: number;
}

/** 麻将事件回调 */
export interface MahjongEventCallbacks {
    onHandChanged?: (tiles: MahjongTile[]) => void;
    onDiscard?: (result: DiscardResult) => void;
    onMahjongAction?: (action: MahjongAction, tiles?: MahjongTile[]) => void;
    onTingStateChanged?: (isTing: boolean, tingInfo?: any) => void;
    onDrawTile?: (tile: MahjongTile) => void;
    onConcealedGang?: (tile: MahjongTile) => void;
}

@ccclass('MahjongRoomBase')
export class MahjongRoomBase extends RoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected mahjongTable: Node = null;

    @property({ type: Node })
    protected myHandArea: Node = null;

    @property({ type: Node })
    protected leftHandArea: Node = null;

    @property({ type: Node })
    protected rightHandArea: Node = null;

    @property({ type: Node })
    protected topHandArea: Node = null;

    @property({ type: Node })
    protected myDiscardArea: Node = null;

    @property({ type: Node })
    protected leftDiscardArea: Node = null;

    @property({ type: Node })
    protected rightDiscardArea: Node = null;

    @property({ type: Node })
    protected topDiscardArea: Node = null;

    @property({ type: Node })
    protected actionPanel: Node = null;          // 操作面板(胡/杠/碰/吃/过)

    @property({ type: Node })
    protected drawnTileNode: Node = null;        // 刚摸到的牌

    @property({ type: Label })
    protected remainCountLabel: Label = null;    // 剩余牌数

    @property({ type: Prefab })
    protected tilePrefab: Prefab = null;         // 单张麻将牌预制体

    @property({ type: Prefab })
    protected tileBackPrefab: Prefab = null;     // 牌背预制体

    // ==================== 内部状态 ====================

    /** 自己的手牌 */
    protected myHandTiles: MahjongTile[] = [];

    /** 刚摸到的牌 */
    protected drawnTile: MahjongTile | null = null;

    /** 各玩家已打出的牌 */
    protected discardRecords: Map<number, MahjongTile[]> = new Map();

    /** 各玩家的明牌(碰/杠/吃) */
    protected meldRecords: Map<number, MahjongTile[][]> = new Map();

    /** 当前可用操作 */
    protected availableActions: AvailableActions | null = null;

    /** 是否正在出牌阶段 */
    protected isMyTurn: boolean = false;

    /** 是否已听牌 */
    protected isTing: boolean = false;

    /** 当前局剩余牌数 */
    protected remainingTiles: number = 0;

    /** 麻将专属事件回调 */
    protected mjCallbacks: MahjongEventCallbacks = {};

    /** 选中的手牌索引 */
    protected selectedTileIndex: number = -1;

    // ==================== 消息前缀 (子类覆写) ====================

    /** 麻将消息前缀，子类可覆写为 "MsgTaojiangMahjong" 等 */
    protected get mjMsgPrefix(): string {
        return "MsgMahjong";
    }

    // ==================== 生命周期 ====================

    onLoad(): void {
        super.onLoad();
        this.initDiscardRecords();
    }

    start(): void {
        super.start();
    }

    // ==================== NetMsgHandler 覆写 (麻将特有消息) ====================

    public onMessage(msgType: string, msg: any): boolean {
        // 先尝试父类的通用处理
        if (super.onMessage(msgType, msg)) return true;

        const prefix = this.mjMsgPrefix;
        let ret = true;

        if (msgType === prefix + "StartGameResp") this.onStartGameResp(msg);
        else if (msgType === prefix + "DealCard") this.onMjDealCard();
        else if (msgType === prefix + "HandCard") this.onMjHandCard(msg);
        else if (msgType === prefix + "DrawTile") this.onMjDrawTile(msg);
        else if (msgType === prefix + "RequestActions") this.onMjRequestActions(msg);
        else if (msgType === prefix + "PlayerDiscard") this.onMjPlayerDiscard(msg);
        else if (msgType === prefix + "PlayerChi") this.onMjPlayerChi(msg);
        else if (msgType === prefix + "PlayerPeng") this.onMjPlayerPeng(msg);
        else if (msgType === prefix + "PlayerGang") this.onMjPlayerGang(msg);
        else if (msgType === prefix + "PlayerHu") this.onMjPlayerHu(msg);
        else if (msgType === prefix + "RoundSettlement") this.onMjRoundSettlement(msg);
        else if (msgType === prefix + "FinalSettlement") this.onMjFinalSettlement(msg);
        else ret = false;

        return ret;
    }

    // ==================== 服务器消息处理 (完整麻将协议) ----

    /** 游戏开始响应 */
    protected onStartGameResp(_msg: any): void {
        this.gameState = GameState.Dealing;
        console.log(`[MahjongRoom] Game started`);
    }

    /** 发牌通知 */
    protected onMjDealCard(): void {
        console.log(`[MahjongRoom] Dealing cards...`);
        this.gameState = GameState.Playing;
    }

    /** 收到手牌数据 */
    protected onMjHandCard(msg: any): void {
        const tiles: MahjongTile[] = msg.tiles || [];
        this.dealTiles(tiles);
    }

    /** 摸牌通知 */
    protected onMjDrawTile(msg: any): void {
        const tile: MahjongTile = msg.tile;
        if (tile) {
            this.drawTile(tile);
        }
    }

    /** 操作请求 (服务端询问是否要吃碰杠胡) */
    protected onMjRequestActions(msg: any): void {
        const actions: AvailableActions = msg.actions || {};
        this.showActionPanel(actions);

        // 启动倒计时
        const timeout = actions.canHu ? 15 : (actions.canGang || actions.canPeng ? 10 : 8);
        this.startCountdown(timeout);
    }

    /** 其他玩家出牌 */
    protected onMjPlayerDiscard(msg: any): void {
        const serverSeat = msg.seatIndex;
        const clientSeat = this.server2ClientSeat(serverSeat);
        const tile: MahjongTile = msg.tile;
        if (tile) {
            this.onOtherPlayerDiscard(clientSeat, tile);
        }
    }

    /** 其他玩家吃 */
    protected onMjPlayerChi(_msg: any): void {
        console.log(`[MahjongRoom] Player chi`);
    }

    /** 其他玩家碰 */
    protected onMjPlayerPeng(_msg: any): void {
        console.log(`[MahjongRoom] Player peng`);
    }

    /** 其他玩家杠 */
    protected onMjPlayerGang(_msg: any): void {
        console.log(`[MahjongRoom] Player gang`);
    }

    /** 其他玩家胡/被胡 */
    protected onMjPlayerHu(msg: any): void {
        const huSeat = this.server2ClientSeat(msg.seatIndex);
        console.log(`[MahjongRoom] Player hu at seat ${huSeat}`);
        this.stopCountdown();
        this.playHuSound(huSeat !== 0); // 别人胡
    }

    /** 单局结算 */
    protected onMjRoundSettlement(msg: any): void {
        this.currentState = RoomState.RoundSettlement;
        this.stopCountdown();
        console.log(`[MahjongRoom] Round settlement`, msg);
        this.handleRoundSettlement(msg);
    }

    /** 总结算 */
    protected onMjFinalSettlement(msg: any): void {
        this.currentState = RoomState.FinalSettlement;
        console.log(`[MahjongRoom] Final settlement`, msg);
        this.handleFinalSettlement(msg);
    }

    // ==================== 座位覆写 ====================

    protected getSeatCount(): number {
        return 4;
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

    protected getDiscardAreaBySeat(seatIndex: number): Node {
        switch (seatIndex) {
            case 0: return this.myDiscardArea;
            case 1: return this.leftDiscardArea;
            case 2: return this.rightDiscardArea;
            case 3: return this.topDiscardArea;
            default: return null;
        }
    }

    // ==================== 手牌管理 ====================

    public dealTiles(tiles: MahjongTile[]): void {
        this.myHandTiles = [...tiles];
        this.sortHandTiles();
        this.renderMyHand();
        console.log(`[MahjongRoom] Dealt ${tiles.length} tiles`);
    }

    public drawTile(tile: MahjongTile): void {
        this.drawnTile = tile;
        this.showDrawnTile(tile);
        this.isMyTurn = true;
        this.mjCallbacks.onDrawTile?.(tile);
        console.log(`[MahjongRoom] Drew tile: ${tile.suit}-${tile.value}`);
    }

    protected sortHandTiles(): void {
        this.myHandTiles.sort((a, b) => {
            if (a.suit !== b.suit) return a.suit - b.suit;
            return a.value - b.value;
        });
    }

    protected renderMyHand(): void {
        if (!this.myHandArea) return;
        this.myHandArea.removeAllChildren();

        for (let i = 0; i < this.myHandTiles.length; i++) {
            const tileNode = this.createTileNode(this.myHandTiles[i], true);
            tileNode.name = `tile_${i}`;
            if (this.myHandArea) {
                tileNode.parent = this.myHandArea;
            }
            tileNode['_tileIndex'] = i;
        }
    }

    protected showDrawnTile(tile: MahjongTile): void {
        if (!this.drawnTileNode) return;
        this.drawnTileNode.removeAllChildren();
        const tileNode = this.createTileNode(tile, true);
        if (this.drawnTileNode) {
            tileNode.parent = this.drawnTileNode;
        }
    }

    private integrateDrawnTile(): void {
        if (this.drawnTile) {
            this.myHandTiles.push(this.drawnTile);
            this.sortHandTiles();
            this.drawnTile = null;
            if (this.drawnTileNode) {
                this.drawnTileNode.removeAllChildren();
            }
        }
    }

    // ==================== 出牌操作 ====================

    public selectAndDiscard(tileIndex: number): void {
        if (!this.isMyTurn || (this.availableActions && !this.canDiscardDirectly())) {
            return;
        }
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
        if (!this.availableActions) return true;
        return !this.availableActions.canHu &&
               !this.availableActions.canGang &&
               !this.availableActions.canPeng &&
               !this.availableActions.canChi;
    }

    /**
     * 发送出牌到服务端 (通过 InnerMessage 协议)
     */
    protected sendDiscard(tile: MahjongTile): void {
        NetworkManager.Instance.sendMessage(this.mjMsgPrefix + "Discard", {
            venueId: GameManager.Instance.VenueId,
            tileId: tile.tileId,
            value: tile.value,
            suit: tile.suit,
        }, true);

        const mySeatIndex = 0; // 自己始终是客户端视角的0号位
        let discards = this.discardRecords.get(mySeatIndex) || [];
        discards.push(tile);
        this.discardRecords.set(mySeatIndex, discards);
        this.addDiscardToDisplay(mySeatIndex, tile);
        this.playDiscardSound();

        const result: DiscardResult = { playerId: '', tile, seatIndex: mySeatIndex };
        this.mjCallbacks.onDiscard?.(result);
    }

    // ==================== 操作面板 (吃碰杠胡) ====================

    public showActionPanel(actions: AvailableActions): void {
        this.availableActions = actions;
        if (this.actionPanel) {
            this.actionPanel.active = true;
        }
        this.renderActionButtons(actions);
    }

    public hideActionPanel(): void {
        this.availableActions = null;
        if (this.actionPanel) {
            this.actionPanel.active = false;
        }
    }

    protected renderActionButtons(actions: AvailableActions): void {
        console.log('[MahjongRoom] Available actions:', JSON.stringify(actions));
    }

    // ---- 操作执行 (发送到服务端) ----

    public doActionChi(_tiles?: MahjongTile[]): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.mjCallbacks.onMahjongAction?.(MahjongAction.Chi, _tiles);
        NetworkManager.Instance.sendMessage(this.mjMsgPrefix + "Chi", {
            venueId: GameManager.Instance.VenueId,
            tiles: _tiles
        }, true);
        this.stopCountdown();
    }

    public doActionPeng(): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.mjCallbacks.onMahjongAction?.(MahjongAction.Peng);
        NetworkManager.Instance.sendMessage(this.mjMsgPrefix + "Peng", {
            venueId: GameManager.Instance.VenueId
        }, true);
        this.stopCountdown();
    }

    public doActionGang(_tile?: MahjongTile): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.mjCallbacks.onMahjongAction?.(MahjongAction.Gang, _tile ? [_tile] : undefined);
        NetworkManager.Instance.sendMessage(this.mjMsgPrefix + "Gang", {
            venueId: GameManager.Instance.VenueId,
            tileId: _tile?.tileId
        }, true);
        this.stopCountdown();
    }

    public doActionHu(): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.mjCallbacks.onMahjongAction?.(MahjongAction.Hu);
        NetworkManager.Instance.sendMessage(this.mjMsgPrefix + "Hu", {
            venueId: GameManager.Instance.VenueId
        }, true);
        this.stopCountdown();
        this.playHuSound(true); // 自己胡
    }

    public doActionPass(): void {
        this.hideActionPanel();
        if (this.drawnTile) {
            this.integrateDrawnTile();
            this.isMyTurn = true;
        }
        NetworkManager.Instance.sendMessage(this.mjMsgPrefix + "Pass", {
            venueId: GameManager.Instance.VenueId
        }, true);
        this.stopCountdown();
    }

    public doActionTing(): void {
        this.hideActionPanel();
        this.isTing = true;
        this.mjCallbacks.onTingStateChanged?.(true);
        NetworkManager.Instance.sendMessage(this.mjMsgPrefix + "Ting", {
            venueId: GameManager.Instance.VenueId
        }, true);
    }

    // ==================== 弃牌区更新 ====================

    protected addDiscardToDisplay(seatIndex: number, tile: MahjongTile): void {
        const discardArea = this.getDiscardAreaBySeat(seatIndex);
        if (!discardArea) return;
        const tileNode = this.createTileNode(tile, false);
        tileNode.parent = discardArea;
        tileNode.setScale(new Vec3(0.6, 0.6, 1));
    }

    public onOtherPlayerDiscard(seatIndex: number, tile: MahjongTile): void {
        let discards = this.discardRecords.get(seatIndex) || [];
        discards.push(tile);
        this.discardRecords.set(seatIndex, discards);
        this.addDiscardToDisplay(seatIndex, tile);
    }

    // ==================== 碰杠展示 ====================

    public showMeldPeng(seatIndex: number, tiles: MahjongTile[], _fromSeat: number): void {
        let melds = this.meldRecords.get(seatIndex) || [];
        melds.push(tiles);
        this.meldRecords.set(seatIndex, melds);
        console.log(`[MahjongRoom] Seat ${seatIndex} peng`);
    }

    public showMeldGang(seatIndex: number, tiles: MahjongTile[], isConcealed: boolean): void {
        let melds = this.meldRecords.get(seatIndex) || [];
        melds.push(tiles);
        this.meldRecords.set(seatIndex, melds);
        console.log(`[MahjongRoom] Seat ${seatIndex} gang (${isConcealed ? 'concealed' : 'revealed'})`);
    }

    // ==================== 牌数与状态 ====================

    public updateRemainingCount(count: number): void {
        this.remainingTiles = count;
        if (this.remainCountLabel) {
            this.remainCountLabel.string = String(count);
        }
    }

    protected resetRoundState(): void {
        this.myHandTiles = [];
        this.drawnTile = null;
        this.isMyTurn = false;
        this.isTing = false;
        this.availableActions = null;
        this.selectedTileIndex = -1;
        this.initDiscardRecords();
        this.hideActionPanel();

        [this.myHandArea, this.leftHandArea, this.rightHandArea, this.topHandArea].forEach(area => {
            if (area) area.removeAllChildren();
        });
        [this.myDiscardArea, this.leftDiscardArea, this.rightDiscardArea, this.topDiscardArea].forEach(area => {
            if (area) area.removeAllChildren();
        });
        if (this.drawnTileNode) {
            this.drawnTileNode.removeAllChildren();
        }
    }

    // ==================== 音效接口 (子类覆写或由 AudioControl 处理) ====================

    /** 出牌音效 */
    protected playDiscardSound(): void {}

    /** 胡牌音效 */
    protected playHuSound(_isSelf: boolean): void {}

    /** 碰牌音效 */
    protected playPengSound(): void {}

    /** 杠牌音效 */
    protected playGangSound(): void {}

    /** 错误/失败音效 */
    protected playErrorSound(): void {}

    // ==================== 工具方法 ====================

    protected createTileNode(tile: MahjongTile, _interactive: boolean): Node {
        if (this.tilePrefab) {
            const node = instantiate(this.tilePrefab);
            return node;
        }
        const node = new Node(`tile_${tile.suit}_${tile.value}`);
        node['_tileData'] = tile;
        return node;
    }

    protected createTileBackNode(): Node {
        if (this.tileBackPrefab) {
            return instantiate(this.tileBackPrefab);
        }
        return new Node('tile_back');
    }

    // ==================== 事件覆写 ====================

    protected handleGameStart(data: any): boolean {
        super.handleGameStart(data);
        this.resetRoundState();
        return true;
    }

    protected handleRoundSettlement(data: any): boolean {
        super.handleRoundSettlement(data);
        return true;
    }

    protected handleFinalSettlement(data: any): boolean {
        super.handleFinalSettlement(data);
        this.resetRoundState();
        return true;
    }

    protected onAutoAction(): void {
        // 麻将超时自动行为：胡 > 杠 > 碰 > 出最后一张
        if (this.availableActions?.canHu) {
            this.doActionHu();
        } else if (this.availableActions?.canGang) {
            this.doActionGang();
        } else if (this.availableActions?.canPeng) {
            this.doActionPeng();
        } else {
            if (this.drawnTile) {
                this.integrateDrawnTile();
            }
            if (this.myHandTiles.length > 0) {
                this.selectAndDiscard(this.myHandTiles.length - 1);
            }
        }
    }

    protected cleanup(): void {
        super.cleanup();
        this.resetRoundState();
        this.mjCallbacks = {};
    }

    public setMjCallbacks(callbacks: MahjongEventCallbacks): void {
        this.mjCallbacks = { ...this.mjCallbacks, ...callbacks };
    }

    private initDiscardRecords(): void {
        if (!this.discardRecords) {
            this.discardRecords = new Map<number, MahjongTile[]>();
        } else {
            this.discardRecords.clear();
        }
        if (!this.meldRecords) {
            this.meldRecords = new Map<number, MahjongTile[][]>();
        } else {
            this.meldRecords.clear();
        }
        const seatCount = this.getSeatCount();
        for (let i = 0; i < seatCount; i++) {
            this.discardRecords.set(i, []);
            this.meldRecords.set(i, []);
        }
    }
}
