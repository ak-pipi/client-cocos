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

import { _decorator, Component, Node, Label, Prefab, instantiate, Vec3, Tween, tween, UIOpacity, SpriteFrame, AudioClip, Graphics, Color, Button, EventHandler, UITransform, Event, js } from 'cc';
import { RoomBase, RoomLevel, GameState } from './RoomBase';
import { RoomState, PlayerRoomState, SeatPosition, MahjongAction, RoundSettlementData, FinalSettlementData } from './GameTypes';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { GameManager } from '../Manager/GameManager';
import { NetworkManager } from '../Manager/NetworkManager';

const { ccclass, property } = _decorator;

// ==================== 麻将类型定义 ====================

/**
 * 麻将牌数据 — 匹配 C++ 服务端序列化格式
 * 服务端 MahjongTile::MSGPACK_DEFINE_MAP(id, tile)
 * 服务端 MahjongTile::Tile::MSGPACK_DEFINE_MAP(pattern, number)
 * pattern: 0=Invalid, 1=Tong(筒), 2=Tiao(条), 3=Wan(万), 4+=风箭花
 */
export interface MahjongTile {
    id: number;
    tile: { pattern: number; number: number };
}

// ==================== 麻将牌辅助函数 ====================

const PATTERN_NAMES: Record<number, string> = { 1: '筒', 2: '条', 3: '万' };
const NUMBER_NAMES: Record<number, string> = { 0: '', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九' };

export function tilePatternName(pattern: number): string {
    return PATTERN_NAMES[pattern] || '?';
}

export function tileNumberStr(number: number): string {
    return NUMBER_NAMES[number] || String(number);
}

export function tileDisplayText(tile: MahjongTile): string {
    if (!tile || !tile.tile) return '?';
    return tileNumberStr(tile.tile.number) + tilePatternName(tile.tile.pattern);
}

export function tileCompare(a: MahjongTile, b: MahjongTile): number {
    if (!a.tile || !b.tile) return 0;
    if (a.tile.pattern !== b.tile.pattern) return a.tile.pattern - b.tile.pattern;
    return a.tile.number - b.tile.number;
}

/** 麻将操作类型枚举 — 对应 C++ MahjongAction::Type */
export const MahjongActionType = {
    Invalid: 0,
    Fetch: 1,
    Play: 2,
    Chi: 3,
    Peng: 4,
    ZhiGang: 5,
    JiaGang: 6,
    AnGang: 7,
    DianPao: 8,
    ZiMo: 9,
} as const;

export type MahjongActionOption = {
    id: number;
    type: number;
    player: number;
    tile1: number;
    tile2: number;
};

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

    /** 服务端发来的当前操作选项列表（含 actionId） */
    protected currentActionOptions: MahjongActionOption[] = [];

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
        this.buildMahjongUI();
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
        console.log(`[MahjongRoom] Drew tile: ${tileDisplayText(tile)}`);
    }

    protected sortHandTiles(): void {
        this.myHandTiles.sort(tileCompare);
    }

    protected renderMyHand(): void {
        if (!this.myHandArea) return;
        this.myHandArea.removeAllChildren();

        const tw = MahjongRoomBase.TILE_W, gap = MahjongRoomBase.TILE_GAP;
        const totalW = this.myHandTiles.length * (tw + gap) - gap;
        let startX = -totalW / 2 + tw / 2;

        for (let i = 0; i < this.myHandTiles.length; i++) {
            const tileNode = this.createTileNode(this.myHandTiles[i], true);
            tileNode.name = `tile_${i}`;
            if (this.myHandArea) {
                tileNode.parent = this.myHandArea;
                tileNode.setPosition(startX, 0, 0);
            }
            tileNode['_tileIndex'] = i;
            startX += tw + gap;
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

    /**
     * 通过出牌按钮丢弃选中的牌
     * @param playActionId 服务端发来的 Play 动作选项 ID
     */
    public discardSelectedTile(playActionId: number): void {
        if (this.selectedTileIndex < 0 || this.selectedTileIndex >= this.myHandTiles.length) {
            console.warn('[MahjongRoom] No tile selected for discard');
            return;
        }
        const tile = this.myHandTiles[this.selectedTileIndex];
        if (!tile) return;

        this.integrateDrawnTile();
        // 重新查找选中牌的位置（integrateDrawnTile 可能改变索引）
        const newIdx = this.myHandTiles.indexOf(tile);
        if (newIdx >= 0) {
            this.myHandTiles.splice(newIdx, 1);
        }

        // 发送到服务端
        this.hideActionPanel();
        this.stopCountdown();
        NetworkManager.Instance.sendMessage("MsgDoActionOption", {
            actionId: playActionId,
            tileId: tile.id,
        }, true);

        // 更新本地显示
        this.renderMyHand();
        this.selectedTileIndex = -1;
        this.isMyTurn = false;

        const myClientSeat = 0;
        let discards = this.discardRecords.get(myClientSeat) || [];
        discards.push(tile);
        this.discardRecords.set(myClientSeat, discards);
        this.addDiscardToDisplay(myClientSeat, tile);
        this.playDiscardSound();

        console.log(`[MahjongRoom] Discard tile: ${tileDisplayText(tile)}, actionId=${playActionId}`);
    }

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
     * 发送出牌到服务端 — 通过 MsgDoActionOption (actionType=Play)
     * 服务端在 Play 状态下发 MsgActionOption{type=Play}，客户端回复 MsgDoActionOption{actionId, tileId}
     */
    protected sendDiscard(tile: MahjongTile): void {
        // 找到 type=Play(2) 的 actionOption
        const playOpt = this.currentActionOptions.find(o => o.type === MahjongActionType.Play);
        if (playOpt) {
            this.hideActionPanel();
            this.stopCountdown();
            NetworkManager.Instance.sendMessage("MsgDoActionOption", {
                actionId: playOpt.id,
                tileId: tile.id,
            }, true);
        } else {
            console.warn('[MahjongRoom] No Play action option found for discard');
        }

        const mySeatIndex = 0;
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

    protected renderActionButtons(_actions: AvailableActions): void {
        // 子类（如 TaojiangMahjongRoom）应根据 currentActionOptions 渲染实际按钮
        // 此处为兼容保留
    }

    // ---- 操作执行 (统一通过 MsgDoActionOption 发送) ----
    // 服务端所有操作（出牌/吃/碰/杠/胡）都用 MsgDoActionOption{actionId, tileId}
    // 服务端先发 MsgActionOption{actionOptions:[{id,type,player,tile1,tile2}]}
    // 客户端选择后回复 MsgDoActionOption{actionId, tileId}

    /**
     * 通过 actionId 执行操作（统一入口）
     * @param actionId 服务端分配的操作选项 ID
     * @param tileId 要操作的牌 ID（出牌/杠时需要）
     */
    public doActionById(actionId: number, tileId?: number): void {
        this.hideActionPanel();
        this.stopCountdown();
        const msg: any = { actionId: actionId };
        if (tileId !== undefined) msg.tileId = tileId;
        NetworkManager.Instance.sendMessage("MsgDoActionOption", msg, true);
        console.log(`[MahjongRoom] doActionById: id=${actionId}, tileId=${tileId}`);
    }

    /**
     * 放弃所有操作选项
     */
    public doActionPass(): void {
        this.hideActionPanel();
        this.stopCountdown();
        NetworkManager.Instance.sendInnerMessage("MsgPassActionOption");
        console.log('[MahjongRoom] Pass action');
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

    // ==================== 麻将 UI 布局常量 ====================

    protected static readonly TILE_W = 60;
    protected static readonly TILE_H = 84;
    protected static readonly TILE_GAP = 4;

    // ==================== 工具方法 ====================

    protected createTileNode(tile: MahjongTile, interactive: boolean): Node {
        if (this.tilePrefab) {
            const node = instantiate(this.tilePrefab);
            return node;
        }
        const tw = MahjongRoomBase.TILE_W, th = MahjongRoomBase.TILE_H;
        const node = new Node(`tile_${tile.id || 0}_${tile.tile?.pattern || 0}_${tile.tile?.number || 0}`);
        node['_tileData'] = tile;

        const transform = node.addComponent(UITransform);
        transform.setContentSize(tw, th);

        const g = node.addComponent(Graphics);
        g.fillColor = new Color(255, 250, 240, 255);
        g.roundRect(-tw / 2, -th / 2, tw, th, 6);
        g.fill();
        g.strokeColor = new Color(180, 170, 160, 255);
        g.lineWidth = 1;
        g.roundRect(-tw / 2, -th / 2, tw, th, 6);
        g.stroke();

        const labelNode = new Node('TileLabel');
        labelNode.parent = node;
        const lt = labelNode.addComponent(UITransform);
        lt.setContentSize(tw - 8, th - 8);
        const lc = labelNode.addComponent(Label);
        lc.string = tileDisplayText(tile);
        lc.fontSize = 22;
        lc.lineHeight = 28;
        lc.overflow = 2; // SHRINK
        lc.horizontalAlign = 1; // CENTER
        lc.verticalAlign = 1; // CENTER

        // 颜色区分花色
        if (tile.tile) {
            if (tile.tile.pattern === 1) lc.color = new Color(0, 100, 200, 255);      // 筒=蓝
            else if (tile.tile.pattern === 2) lc.color = new Color(0, 150, 50, 255);  // 条=绿
            else if (tile.tile.pattern === 3) lc.color = new Color(200, 50, 50, 255); // 万=红
            else lc.color = new Color(100, 100, 100, 255); // 风箭花=灰
        }

        if (interactive) {
            node.on(Node.EventType.TOUCH_END, () => {
                this.onTileTapped(tile, node);
            }, this);
        }

        return node;
    }

    protected createTileBackNode(): Node {
        if (this.tileBackPrefab) {
            return instantiate(this.tileBackPrefab);
        }
        const tw = MahjongRoomBase.TILE_W, th = MahjongRoomBase.TILE_H;
        const node = new Node('tile_back');
        const transform = node.addComponent(UITransform);
        transform.setContentSize(tw, th);

        const g = node.addComponent(Graphics);
        g.fillColor = new Color(60, 120, 180, 255);
        g.roundRect(-tw / 2, -th / 2, tw, th, 6);
        g.fill();
        g.strokeColor = new Color(40, 80, 140, 255);
        g.lineWidth = 1;
        g.roundRect(-tw / 2, -th / 2, tw, th, 6);
        g.stroke();

        const labelNode = new Node('BackLabel');
        labelNode.parent = node;
        const lt = labelNode.addComponent(UITransform);
        lt.setContentSize(tw - 10, th - 10);
        const lc = labelNode.addComponent(Label);
        lc.string = '牛';
        lc.fontSize = 28;
        lc.lineHeight = 32;
        lc.overflow = 2;
        lc.horizontalAlign = 1;
        lc.verticalAlign = 1;
        lc.color = new Color(200, 180, 100, 255);

        return node;
    }

    /** 点击手牌回调 — 仅选中，不直接出牌 */
    protected onTileTapped(tile: MahjongTile, node: Node): void {
        if (!this.isMyTurn) return;
        // 高亮选中
        this.highlightTile(node);
        this.selectedTileIndex = this.myHandTiles.indexOf(tile);
    }

    /** 高亮选中的牌 */
    protected highlightTile(node: Node): void {
        // 取消之前的高亮
        if (this.myHandArea) {
            for (const child of this.myHandArea.children) {
                const g = child.getComponent(Graphics);
                if (g) {
                    g.fillColor = new Color(255, 250, 240, 255);
                }
                const pos = child.getPosition();
                pos.y = 0;
                child.setPosition(pos);
            }
        }
        // 高亮当前牌
        if (node) {
            const g = node.getComponent(Graphics);
            if (g) g.fillColor = new Color(255, 255, 180, 255);
            const pos = node.getPosition();
            pos.y = 10;
            node.setPosition(pos);
        }
    }

    // ==================== 代码生成麻将桌面 UI ====================

    /** 在 start() 后调用，动态创建麻将桌面 UI */
    protected buildMahjongUI(): void {
        // 如果 @property 已有绑定则跳过
        if (this.myHandArea && this.actionPanel) return;

        const parent = this.node;

        // 隐藏 GuanDan prefab 的桌面背景，避免和麻将 UI 重叠
        this.hidePrefabDesktopUI(parent);

        const zOrder = 100; // 在 GuanDan prefab UI 之上

        // 1. 麻将桌面背景（不创建全屏背景，复用 prefab 已有的桌面）

        // 2. 手牌区
        this.myHandArea = this.createUIChild(parent, 'MyHandArea', 1200, 100, 0, -480, zOrder + 1);
        this.topHandArea = this.createUIChild(parent, 'TopHandArea', 800, 80, 0, 460, zOrder + 1);

        // 3. 出牌区
        this.myDiscardArea = this.createUIChild(parent, 'MyDiscardArea', 400, 300, 500, -150, zOrder + 1);
        this.topDiscardArea = this.createUIChild(parent, 'TopDiscardArea', 400, 300, -500, 150, zOrder + 1);
        this.leftDiscardArea = this.createUIChild(parent, 'LeftDiscardArea', 300, 200, -500, -150, zOrder + 1);
        this.rightDiscardArea = this.createUIChild(parent, 'RightDiscardArea', 300, 200, 500, 150, zOrder + 1);

        // 4. 操作面板
        this.actionPanel = this.createUIChild(parent, 'ActionPanel', 800, 60, 0, -340, zOrder + 10);
        this.actionPanel.active = false;

        // 5. 摸到的牌
        this.drawnTileNode = this.createUIChild(parent, 'DrawnTileNode', 70, 90, 660, -480, zOrder + 2);

        // 6. 剩余牌数
        const remainNode = this.createUIChild(parent, 'RemainCount', 200, 40, -820, 480, zOrder + 1);
        this.remainCountLabel = remainNode.addComponent(Label);
        this.remainCountLabel.string = '剩余: 0';
        this.remainCountLabel.fontSize = 24;
        this.remainCountLabel.lineHeight = 30;
        this.remainCountLabel.color = new Color(255, 255, 255, 255);
        this.remainCountLabel.horizontalAlign = 1;
        this.remainCountLabel.verticalAlign = 1;
        this.remainCountLabel.overflow = 2;

        // 7. 副露区
        this.leftHandArea = this.createUIChild(parent, 'MeldLeft', 200, 120, -400, 0, zOrder + 1);
        this.rightHandArea = this.createUIChild(parent, 'MeldRight', 200, 120, 400, 0, zOrder + 1);

        console.log('[MahjongRoom] Mahjong UI built (code-generated)');
    }

    /** 隐藏 GuanDan prefab 中与麻将 UI 冲突的桌面背景节点 */
    protected hidePrefabDesktopUI(root: Node): void {
        for (const child of root.children) {
            const n = child.name;
            // 隐藏音频节点（麻将有自己的音效桩）
            if (n === 'AudioSources') { child.active = false; continue; }
            // 根节点 BottomBar：隐藏掼蛋专属的 BtnMore，保留 BtnReady/BtnBack/BtnChangeSeat
            if (n === 'BottomBar') {
                for (const bc of child.children) {
                    if (bc.name === 'More') { bc.active = false; }
                }
                continue;
            }
            // Seat：隐藏 BtnVoice 和 SpectatorFlag
            if (n === 'Seat') {
                for (const sc of child.children) {
                    if (sc.name === 'BtnVoice' || sc.name === 'SpectatorFlag') {
                        sc.active = false;
                    }
                }
                continue;
            }
            // Desktop 直接子节点中，隐藏掼蛋卡牌相关和3D角色身体
            if (n === 'Desktop') {
                for (const dc of child.children) {
                    const dn = dc.name;
                    if (dn === 'CardPlayedOut' || dn === 'CardBacks' || dn === 'CardLayout' ||
                        dn === 'ChairLeft' || dn === 'ChairRight' ||
                        dn === 'YouGroup' || dn === 'ClockArrow') {
                        dc.active = false;
                    }
                    if (dn === 'Desktop') { dc.active = false; }
                    if (dn.startsWith('Player') && dc.getChildByName('BodyPos')) { dc.active = false; }
                }
                continue;
            }
            // DesktopUI 中的掼蛋专属 UI 元素
            if (n === 'DesktopUI') {
                for (const dc of child.children) {
                    const dn = dc.name;
                    if (dn === 'GradePointBoard' || dn === 'GradePointGroup' ||
                        dn === 'PassBtnGroup' || dn === 'PlayBtnGroup' ||
                        dn === 'RefundTribute' || dn === 'ChatDialog' ||
                        dn === 'BottomBar' || dn === 'UpRightPanel') {
                        dc.active = false;
                    }
                }
                continue;
            }
        }
    }

    /** 创建 UI 子节点 */
    protected createUIChild(parent: Node, name: string, w: number, h: number, x: number, y: number, z: number): Node {
        const node = new Node(name);
        node.parent = parent;
        node.layer = 1 << 25; // UI_2D layer
        const transform = node.addComponent(UITransform);
        transform.setContentSize(w, h);
        node.setPosition(x, y, 0);
        node.setSiblingIndex(z);
        return node;
    }

    /**
     * 根据 currentActionOptions 渲染操作按钮
     * 子类可在 showActionPanel 后调用此方法
     */
    protected renderActionButtonsFromOptions(options: MahjongActionOption[]): void {
        if (!this.actionPanel) return;
        this.actionPanel.removeAllChildren();

        const buttons: Array<{text: string, actionId: number, tileId?: number, color: Color}> = [];

        for (const opt of options) {
            const t = opt.type;
            if (t === MahjongActionType.ZiMo) buttons.push({text: '自摸', actionId: opt.id, tileId: opt.tile1, color: new Color(220, 50, 50, 255)});
            else if (t === MahjongActionType.DianPao) buttons.push({text: '点炮', actionId: opt.id, tileId: opt.tile1, color: new Color(220, 50, 50, 255)});
            else if (t === MahjongActionType.ZhiGang) buttons.push({text: '直杠', actionId: opt.id, tileId: opt.tile1, color: new Color(200, 150, 50, 255)});
            else if (t === MahjongActionType.JiaGang) buttons.push({text: '加杠', actionId: opt.id, tileId: opt.tile1, color: new Color(200, 150, 50, 255)});
            else if (t === MahjongActionType.AnGang) buttons.push({text: '暗杠', actionId: opt.id, color: new Color(200, 150, 50, 255)});
            else if (t === MahjongActionType.Peng) buttons.push({text: '碰', actionId: opt.id, tileId: opt.tile1, color: new Color(50, 150, 200, 255)});
            else if (t === MahjongActionType.Chi) buttons.push({text: '吃', actionId: opt.id, tileId: opt.tile1, color: new Color(50, 200, 100, 255)});
            else if (t === MahjongActionType.Play) buttons.push({text: '出牌', actionId: opt.id, color: new Color(180, 160, 80, 255)});
        }

        // 添加过牌按钮
        if (buttons.length > 0) {
            buttons.push({text: '过', actionId: -1, color: new Color(120, 120, 120, 255)});
        }

        if (buttons.length === 0) return;

        const btnW = 120, btnH = 50, gap = 20;
        const totalWidth = buttons.length * btnW + (buttons.length - 1) * gap;
        let startX = -totalWidth / 2 + btnW / 2;

        const self = this;

        for (const btnInfo of buttons) {
            const btnNode = new Node(btnInfo.text);
            btnNode.parent = this.actionPanel;
            const bt = btnNode.addComponent(UITransform);
            bt.setContentSize(btnW, btnH);
            btnNode.setPosition(startX, 0, 0);
            startX += btnW + gap;

            const g = btnNode.addComponent(Graphics);
            g.fillColor = btnInfo.color;
            g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 8);
            g.fill();

            const labelNode = new Node('Label');
            labelNode.parent = btnNode;
            labelNode.addComponent(UITransform).setContentSize(btnW - 8, btnH - 8);
            const lc = labelNode.addComponent(Label);
            lc.string = btnInfo.text;
            lc.fontSize = 24;
            lc.lineHeight = 30;
            lc.overflow = 2;
            lc.horizontalAlign = 1;
            lc.verticalAlign = 1;
            lc.color = new Color(255, 255, 255, 255);

            const button = btnNode.addComponent(Button);
            button.transition = 1; // SCALE
            button.zoomScale = 1.05;
            button.duration = 0.1;

            // 用闭包存储回调
            const isPlayBtn = (btnInfo.text === '出牌');
            btnNode.on(Node.EventType.TOUCH_END, () => {
                if (btnInfo.actionId === -1) {
                    self.doActionPass();
                } else if (isPlayBtn) {
                    // 出牌：使用当前选中的手牌
                    self.discardSelectedTile(btnInfo.actionId);
                } else {
                    self.doActionById(btnInfo.actionId, btnInfo.tileId);
                }
            }, this);
        }

        console.log(`[MahjongRoom] Rendered ${buttons.length} action buttons`);
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
        // 麻将超时自动行为：胡 > 杠 > 碰 > 自动出最后一张
        if (this.availableActions?.canHu) {
            const huOpt = this.currentActionOptions.find(o => o.type === MahjongActionType.ZiMo || o.type === MahjongActionType.DianPao);
            if (huOpt) this.doActionById(huOpt.id, huOpt.tile1);
        } else if (this.availableActions?.canGang) {
            const gangOpt = this.currentActionOptions.find(o => o.type >= MahjongActionType.ZhiGang && o.type <= MahjongActionType.AnGang);
            if (gangOpt) this.doActionById(gangOpt.id, gangOpt.tile1);
        } else if (this.availableActions?.canPeng) {
            const pengOpt = this.currentActionOptions.find(o => o.type === MahjongActionType.Peng);
            if (pengOpt) this.doActionById(pengOpt.id, pengOpt.tile1);
        } else {
            // 自动出最后一张牌
            const playOpt = this.currentActionOptions.find(o => o.type === MahjongActionType.Play);
            if (playOpt && this.myHandTiles.length > 0) {
                this.selectedTileIndex = this.myHandTiles.length - 1;
                this.discardSelectedTile(playOpt.id);
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
