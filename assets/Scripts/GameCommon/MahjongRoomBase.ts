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

import { _decorator, Node, Label, Prefab, instantiate, Vec3, SpriteFrame, Graphics, Color, Button, UITransform, Sprite, SpriteAtlas, resources, view, UIOpacity } from 'cc';
import { RoomBase, GameState } from './RoomBase';
import { RoomState, MahjongAction } from './GameTypes';
import { NetworkManager } from '../Manager/NetworkManager';
import { GameManager } from '../Manager/GameManager';
import { AudioChannel, AudioManager } from '../App/AudioManager';

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
    style?: number;
}

// ==================== 麻将牌辅助函数 ====================

const PATTERN_NAMES: Record<number, string> = {
    1: '筒',
    2: '条',
    3: '万',
    4: '东',
    5: '南',
    6: '西',
    7: '北',
    8: '中',
    9: '发',
    10: '白',
    11: '春',
    12: '夏',
    13: '秋',
    14: '冬',
    15: '梅',
    16: '兰',
    17: '菊',
    18: '竹',
};
const NUMBER_NAMES: Record<number, string> = { 0: '', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九' };

export function tilePatternName(pattern: number): string {
    return PATTERN_NAMES[pattern] || '?';
}

export function tileNumberStr(number: number): string {
    return NUMBER_NAMES[number] || String(number);
}

export function tileDisplayText(tile: MahjongTile): string {
    if (!tile || !tile.tile) return '?';
    const pattern = Number(tile.tile.pattern) || 0;
    const number = Number(tile.tile.number) || 0;

    if (pattern >= 1 && pattern <= 3) {
        return tileNumberStr(number) + tilePatternName(pattern);
    }
    if (pattern >= 4 && pattern <= 7) {
        return tilePatternName(pattern) + '风';
    }
    if (pattern === 8) return '红中';
    if (pattern === 9) return '发财';
    if (pattern === 10) return '白板';

    return tilePatternName(pattern);
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

/** 副露类型 */
export enum MeldType {
    Chi = 'chi',
    Peng = 'peng',
    ZhiGang = 'zhigang',
    JiaGang = 'jiagang',
    AnGang = 'angang',
}

/** 副露组数据 */
export interface MahjongMeldGroup {
    tiles: MahjongTile[];
    meldType: MeldType;
}

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

type LegacyAtlasKey = 'my' | 'bottom' | 'left' | 'right' | 'empty';

type LegacySpriteKey =
    | 'tableBg'
    | 'actionBg'
    | 'seatBg'
    | 'roundBg'
    | 'moneyFrame';

type MahjongEffectKey =
    | 'peng'
    | 'gang'
    | 'guafeng'
    | 'xiayu'
    | 'hu'
    | 'zimo';

interface MahjongPlayerInfoCard {
    root: Node;
    nameLabel: Label;
    goldLabel: Label;
    stateLabel: Label;
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

    /** 各玩家的明牌(碰/杠/吃) — 每组含牌数据和副露类型 */
    protected meldRecords: Map<number, MahjongMeldGroup[]> = new Map();

    /** 各座位最后打出的牌 ID（用于高亮标记） */
    protected lastDiscardTileId: Map<number, number> = new Map();

    /** 当前可用操作 */
    protected availableActions: AvailableActions | null = null;

    /** 服务端发来的当前操作选项列表（含 actionId） */
    protected currentActionOptions: MahjongActionOption[] = [];

    /** 操作面板显示/隐藏版本，防止旧的延迟隐藏回调关掉新的按钮 */
    protected actionPanelVisibilityToken: number = 0;

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

    /** 选中的手牌 ID（用于重绘后保持高亮） */
    protected selectedTileId: number = -1;

    /** 最近一次本地发起的出牌 tileId（用于避免服务端回包时重复播放音效等） */
    protected lastLocalDiscardTileId: number | null = null;

    /** 对手手牌数量缓存 */
    protected opponentHandCounts: Map<number, number> = new Map();

    /** 副露区域 */
    protected myMeldArea: Node = null;
    protected leftMeldArea: Node = null;
    protected rightMeldArea: Node = null;
    protected topMeldArea: Node = null;

    /** HUD 与资源 */
    protected tableBackgroundNode: Node = null;
    protected roomInfoLabel: Label = null;
    protected roundInfoLabel: Label = null;
    protected actionHintLabel: Label = null;
    protected legacyAtlases: Map<LegacyAtlasKey, SpriteAtlas> = new Map();
    protected legacySprites: Map<LegacySpriteKey, SpriteFrame> = new Map();
    protected legacyThemeReady: boolean = false;
    protected effectLayer: Node = null;
    protected ruleHintLabel: Label = null;
    protected cachedEffectFrames: Map<string, SpriteFrame> = new Map();
    protected fallbackBackButton: Node = null;
    protected controlBarNode: Node = null;
    protected customReadyButton: Node = null;
    protected customReadyLabel: Label = null;
    protected customStartButton: Node = null;
    protected customStartLabel: Label = null;
    protected customSeatButton: Node = null;
    protected customSeatLabel: Label = null;
    protected playerInfoRoot: Node = null;
    protected playerInfoCards: Array<MahjongPlayerInfoCard | null> = [null, null, null, null];

    // ==================== 消息前缀 (子类覆写) ====================

    /** 麻将消息前缀，子类可覆写为 "MsgTaojiangMahjong" 等 */
    protected get mjMsgPrefix(): string {
        return "MsgMahjong";
    }

    // ==================== 生命周期 ====================

    onLoad(): void {
        super.onLoad();
        this.initDiscardRecords();
        this.initOpponentHandCounts();
    }

    start(): void {
        super.start();
        this.buildMahjongUI();
        this.preloadLegacyMahjongAssets();
        this.updateHudInfo();
        this.ensureBackButtonVisible();
        this.refreshMahjongOverlayUI();
    }

    protected onSyncGameUIUpdate(isSitting: boolean): void {
        super.onSyncGameUIUpdate(isSitting);
        this.refreshMahjongOverlayUI();
    }

    protected onPlayerAdded(seatIndex: number, playerInfo: any): void {
        super.onPlayerAdded(seatIndex, playerInfo);
        this.refreshMahjongOverlayUI();
    }

    protected onPlayerRemoved(seatIndex: number): void {
        super.onPlayerRemoved(seatIndex);
        this.refreshMahjongOverlayUI();
    }

    protected onPlayerOfflineChanged(seatIndex: number, offline: boolean): void {
        super.onPlayerOfflineChanged(seatIndex, offline);
        this.refreshMahjongOverlayUI();
    }

    protected onPlayerReadyUIUpdate(seatIndex: number): void {
        super.onPlayerReadyUIUpdate(seatIndex);
        this.refreshMahjongOverlayUI();
    }

    protected onPlayerAuthorizeUIUpdate(seatIndex: number, authorize: boolean): void {
        super.onPlayerAuthorizeUIUpdate(seatIndex, authorize);
        this.refreshMahjongOverlayUI();
    }

    protected onOwnerSeat(msg: any): void {
        super.onOwnerSeat(msg);
        this.refreshMahjongOverlayUI();
    }

    protected clearRoom(): void {
        super.clearRoom();
        this.refreshMahjongOverlayUI();
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
        this.playMahjongActionEffect(huSeat, huSeat === 0 ? 'zimo' : 'hu');
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
        this.selectedTileIndex = -1;
        this.selectedTileId = -1;
        this.seedOpponentHands();
        this.renderMyHand();
        this.renderAllOpponentHands();
        this.updateHudInfo();
        console.log(`[MahjongRoom] Dealt ${tiles.length} tiles`);
    }

    public drawTile(tile: MahjongTile): void {
        this.drawnTile = tile;
        this.showDrawnTile(tile);
        this.isMyTurn = true;
        this.selectedTileIndex = -1;
        this.selectedTileId = -1;
        this.mjCallbacks.onDrawTile?.(tile);
        console.log(`[MahjongRoom] Drew tile: ${tileDisplayText(tile)}`);
    }

    protected sortHandTiles(): void {
        this.myHandTiles.sort(tileCompare);
    }

    protected renderMyHand(): void {
        if (!this.myHandArea) return;
        this.myHandArea.removeAllChildren();

        const tw = 72;
        const gap = this.myHandTiles.length >= 14 ? 2 : 6;
        const totalW = this.myHandTiles.length * (tw + gap) - gap;
        let startX = -totalW / 2 + tw / 2;

        for (let i = 0; i < this.myHandTiles.length; i++) {
            const tile = this.myHandTiles[i];
            const tileNode = this.createTileNodeForSeat(tile, 0, true);
            tileNode.name = `tile_${i}`;
            tileNode.parent = this.myHandArea;
            tileNode.setPosition(startX, this.selectedTileId === tile.id ? 24 : 0, 0);
            tileNode.setScale(this.selectedTileId === tile.id ? new Vec3(1.04, 1.04, 1) : Vec3.ONE);
            (tileNode as any)._tileIndex = i;
            startX += tw + gap;
        }
    }

    protected showDrawnTile(tile: MahjongTile): void {
        if (!this.drawnTileNode) return;
        this.drawnTileNode.removeAllChildren();
        const tileNode = this.createTileNodeForSeat(tile, 0, true);
        tileNode.parent = this.drawnTileNode;
        tileNode.setPosition(0, this.selectedTileId === tile.id ? 24 : 0, 0);
        tileNode.setScale(this.selectedTileId === tile.id ? new Vec3(1.04, 1.04, 1) : Vec3.ONE);
    }

    private integrateDrawnTile(): void {
        if (this.drawnTile) {
            this.myHandTiles.push(this.drawnTile);
            this.sortHandTiles();
            this.drawnTile = null;
            if (this.drawnTileNode) {
                this.drawnTileNode.removeAllChildren();
            }
            this.selectedTileId = -1;
        }
    }

    // ==================== 出牌操作 ====================

    /**
     * 通过出牌按钮丢弃选中的牌
     * @param playActionId 服务端发来的 Play 动作选项 ID
     */
    public discardSelectedTile(playActionId: number): void {
        const actionId = typeof playActionId === 'number' ? playActionId : Number(playActionId);
        if (!Number.isFinite(actionId) || actionId < 0) {
            console.error('[MahjongRoom] Invalid playActionId for discard:', playActionId);
            return;
        }
        // 确定要打出的牌：优先从 myHandTiles 取，否则从 drawnTile 取
        let tile: MahjongTile | null = null;
        if (this.selectedTileIndex >= 0 && this.selectedTileIndex < this.myHandTiles.length) {
            tile = this.myHandTiles[this.selectedTileIndex];
        } else if (this.drawnTile && this.selectedTileId === this.drawnTile.id) {
            tile = this.drawnTile;
        }
        if (!tile) {
            console.warn('[MahjongRoom] No tile selected for discard');
            return;
        }

        this.integrateDrawnTile();
        // 重新查找选中牌的位置（integrateDrawnTile 可能改变索引）
        const newIdx = this.myHandTiles.indexOf(tile);
        if (newIdx >= 0) {
            this.myHandTiles.splice(newIdx, 1);
        }

        // 发送到服务端
        this.hideActionPanel();
        this.stopCountdown();
        this.currentActionOptions = [];
        this.lastLocalDiscardTileId = tile.id;
        NetworkManager.Instance.sendMessage("MsgDoActionOption", {
            venueId: GameManager.Instance.VenueId,
            actionId: actionId,
            tileId: tile.id,
        }, true);

        // 更新本地显示
        this.renderMyHand();
        this.selectedTileIndex = -1;
        this.selectedTileId = -1;
        this.isMyTurn = false;

        const myClientSeat = 0;
        let discards = this.discardRecords.get(myClientSeat) || [];
        discards.push(tile);
        this.discardRecords.set(myClientSeat, discards);
        this.addDiscardToDisplay(myClientSeat, tile);
        this.playDiscardSound();

        console.log(`[MahjongRoom] Discard tile: ${tileDisplayText(tile)}, actionId=${actionId}`);
    }

    public selectAndDiscard(tileIndex: number): void {
        if (!this.isMyTurn || !this.canDiscardDirectly()) {
            return;
        }
        const tile = this.myHandTiles[tileIndex];
        if (!tile) return;

        this.selectedTileIndex = -1;
        this.selectedTileId = -1;
        this.sendDiscard(tile);
    }

    /**
     * 发送出牌到服务端 — 通过 MsgDoActionOption (actionType=Play)
     * 服务端在 Play 状态下发 MsgActionOption{type=Play}，客户端回复 MsgDoActionOption{actionId, tileId}
     */
    protected sendDiscard(tile: MahjongTile): void {
        // 找到 type=Play(2) 的 actionOption
        const playOpt = this.currentActionOptions.find(o => o.type === MahjongActionType.Play);
        if (!playOpt) {
            console.error('[MahjongRoom] No Play action option found for discard, isMyTurn:', this.isMyTurn,
                'options:', JSON.stringify(this.currentActionOptions));
            return;
        }

        // 发送到服务端
        this.hideActionPanel();
        this.stopCountdown();
        this.currentActionOptions = [];
        this.lastLocalDiscardTileId = tile.id;
        this.isMyTurn = false;

        NetworkManager.Instance.sendMessage("MsgDoActionOption", {
            venueId: GameManager.Instance.VenueId,
            actionId: playOpt.id,
            tileId: tile.id,
        }, true);

        // 仅在确认发送后更新本地状态（从手牌移除 + 添加到出牌区）
        this.integrateDrawnTile();
        const newIdx = this.myHandTiles.indexOf(tile);
        if (newIdx >= 0) {
            this.myHandTiles.splice(newIdx, 1);
        }
        this.renderMyHand();

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
        this.actionPanelVisibilityToken++;
        if (this.actionPanel) {
            this.actionPanel.active = true;
            if (this.actionPanel.parent) {
                this.actionPanel.setSiblingIndex(this.actionPanel.parent.children.length - 1);
            }
            const uiOpacity = this.actionPanel.getComponent(UIOpacity) || this.actionPanel.addComponent(UIOpacity);
            uiOpacity.opacity = 255;
        }
        this.renderActionButtons(actions);
    }

    public hideActionPanel(): void {
        this.actionPanelVisibilityToken++;
        const token = this.actionPanelVisibilityToken;
        if (this.actionPanel && this.actionPanel.active) {
            const panel = this.actionPanel;
            const uiOpacity = panel.getComponent(UIOpacity) || panel.addComponent(UIOpacity);
            uiOpacity.opacity = 255;
            this.scheduleOnce(() => {
                if (token !== this.actionPanelVisibilityToken) return;
                if (!panel.isValid) return;
                panel.active = false;
                const uiOpacityInner = panel.getComponent(UIOpacity) || panel.addComponent(UIOpacity);
                uiOpacityInner.opacity = 255;
            }, 0.1);
            uiOpacity.opacity = 0;
        }
        this.availableActions = null;
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
        this.currentActionOptions = [];
        const msg: any = { venueId: GameManager.Instance.VenueId, actionId: actionId };
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
        this.currentActionOptions = [];
        NetworkManager.Instance.sendInnerMessage("MsgPassActionOption");
        console.log('[MahjongRoom] Pass action');
    }

    // ==================== 弃牌区更新 ====================

    protected addDiscardToDisplay(seatIndex: number, tile: MahjongTile): void {
        const discards = this.discardRecords.get(seatIndex) || [];
        const exists = discards.some(item => item.id === tile.id);
        if (!exists) {
            discards.push(tile);
            this.discardRecords.set(seatIndex, discards);
        }
        // 记录最后出牌
        this.lastDiscardTileId.set(seatIndex, tile.id);
        if (seatIndex > 0) {
            const current = this.opponentHandCounts.get(seatIndex) || 0;
            const newCount = Math.max(0, current - 1);
            this.opponentHandCounts.set(seatIndex, newCount);
            this.renderOpponentHandBySeat(seatIndex, newCount);
        }
        this.renderDiscardArea(seatIndex);
    }

    public onOtherPlayerDiscard(seatIndex: number, tile: MahjongTile): void {
        let discards = this.discardRecords.get(seatIndex) || [];
        discards.push(tile);
        this.discardRecords.set(seatIndex, discards);
        // 记录最后出牌
        this.lastDiscardTileId.set(seatIndex, tile.id);
        this.renderDiscardArea(seatIndex);
        const current = this.opponentHandCounts.get(seatIndex) || 0;
        const newCount = Math.max(0, current - 1);
        this.opponentHandCounts.set(seatIndex, newCount);
        this.renderOpponentHandBySeat(seatIndex, newCount);
    }

    // ==================== 碰杠展示 ====================

    public showMeldPeng(seatIndex: number, tiles: MahjongTile[], _fromSeat: number): void {
        let melds = this.meldRecords.get(seatIndex) || [];
        melds.push({ tiles, meldType: MeldType.Peng });
        this.meldRecords.set(seatIndex, melds);
        this.renderMeldArea(seatIndex);
        this.playMahjongActionEffect(seatIndex, 'peng');
        this.playMeldAppearAnimation(seatIndex, melds.length - 1);
        console.log(`[MahjongRoom] Seat ${seatIndex} peng`);
    }

    public showMeldChi(seatIndex: number, tiles: MahjongTile[], _fromSeat: number): void {
        let melds = this.meldRecords.get(seatIndex) || [];
        melds.push({ tiles, meldType: MeldType.Chi });
        this.meldRecords.set(seatIndex, melds);
        this.renderMeldArea(seatIndex);
        this.playMeldAppearAnimation(seatIndex, melds.length - 1);
        console.log(`[MahjongRoom] Seat ${seatIndex} chi`);
    }

    public showMeldGang(seatIndex: number, tiles: MahjongTile[], isConcealed: boolean): void {
        let melds = this.meldRecords.get(seatIndex) || [];
        if (!tiles || tiles.length === 0) return;

        const tileKey = (t: MahjongTile): string => {
            const pattern = Number(t?.tile?.pattern) || 0;
            const number = Number(t?.tile?.number) || 0;
            return `${pattern}_${number}`;
        };

        // 加杠（碰后补杠）：升级已存在的 Peng 副露，而不是新增一组（避免出现 3+4=7 张）。
        if (!isConcealed) {
            const key = tileKey(tiles[0]);
            const pengIndex = melds.findIndex(g => g?.meldType === MeldType.Peng &&
                Array.isArray(g.tiles) &&
                g.tiles.length >= 3 &&
                g.tiles.every(tt => tileKey(tt) === key));

            if (pengIndex >= 0) {
                const existing = melds[pengIndex].tiles || [];
                let upgradedTiles = tiles;
                if (tiles.length < 4) {
                    const extra = tiles[0];
                    upgradedTiles = existing.slice(0, 3).concat([extra]);
                } else if (tiles.length > 4) {
                    upgradedTiles = tiles.slice(0, 4);
                }
                melds[pengIndex] = { tiles: upgradedTiles, meldType: MeldType.JiaGang };
                this.meldRecords.set(seatIndex, melds);
                this.renderMeldArea(seatIndex);
                this.playMahjongActionEffect(seatIndex, 'guafeng');
                this.playMeldAppearAnimation(seatIndex, pengIndex);
                console.log(`[MahjongRoom] Seat ${seatIndex} jiagang (upgrade from peng)`);
                return;
            }
        }

        const meldType = isConcealed ? MeldType.AnGang : MeldType.ZhiGang;
        const normalizedTiles = tiles.length > 4 ? tiles.slice(0, 4) : tiles;
        melds.push({ tiles: normalizedTiles, meldType });
        this.meldRecords.set(seatIndex, melds);
        this.renderMeldArea(seatIndex);
        this.playMahjongActionEffect(seatIndex, isConcealed ? 'gang' : 'guafeng');
        this.playMeldAppearAnimation(seatIndex, melds.length - 1);
        console.log(`[MahjongRoom] Seat ${seatIndex} gang (${isConcealed ? 'concealed' : 'revealed'})`);
    }

    /** 副露组弹入动画 */
    protected playMeldAppearAnimation(seatIndex: number, groupIndex: number): void {
        const area = this.getMeldAreaBySeat(seatIndex);
        if (!area) return;
        const groupNode = area.children[groupIndex];
        if (!groupNode) return;
        groupNode.setScale(new Vec3(0.5, 0.5, 1));
        this.scheduleOnce(() => {
            if (!groupNode.isValid) return;
            groupNode.setScale(new Vec3(1.0, 1.0, 1));
        }, 0.0);
        // 使用 tween 效果
        this.scheduleOnce(() => {
            if (!groupNode.isValid) return;
            groupNode.setScale(new Vec3(1.0, 1.0, 1));
        }, 0.15);
    }

    // ==================== 牌数与状态 ====================

    public updateRemainingCount(count: number): void {
        this.remainingTiles = count;
        this.updateHudInfo();
    }

    protected resetRoundState(): void {
        this.myHandTiles = [];
        this.drawnTile = null;
        this.isMyTurn = false;
        this.isTing = false;
        this.availableActions = null;
        this.selectedTileIndex = -1;
        this.selectedTileId = -1;
        this.initOpponentHandCounts();
        this.initDiscardRecords();
        this.hideActionPanel();

        [this.myHandArea, this.leftHandArea, this.rightHandArea, this.topHandArea].forEach(area => {
            if (area) area.removeAllChildren();
        });
        [this.myMeldArea, this.leftMeldArea, this.rightMeldArea, this.topMeldArea].forEach(area => {
            if (area) area.removeAllChildren();
        });
        [this.myDiscardArea, this.leftDiscardArea, this.rightDiscardArea, this.topDiscardArea].forEach(area => {
            if (area) area.removeAllChildren();
        });
        if (this.drawnTileNode) {
            this.drawnTileNode.removeAllChildren();
        }
        if (this.effectLayer) {
            this.effectLayer.removeAllChildren();
        }
        this.updateHudInfo();
    }

    // ==================== 音效接口 (子类覆写或由 AudioControl 处理) ====================

    /** 出牌音效 */
    protected playDiscardSound(): void {
        AudioManager.Instance.play('legacy-mj/sounds/select', AudioChannel.SFX, { volume: 0.45 });
    }

    /** 胡牌音效 */
    protected playHuSound(_isSelf: boolean): void {
        AudioManager.Instance.play('legacy-mj/sounds/nv/hu', AudioChannel.StrongFeedback, { volume: 0.75 });
    }

    /** 碰牌音效 */
    protected playPengSound(): void {
        AudioManager.Instance.play('legacy-mj/sounds/nv/peng', AudioChannel.SFX, { volume: 0.7 });
    }

    /** 杠牌音效 */
    protected playGangSound(): void {
        AudioManager.Instance.play('legacy-mj/sounds/nv/gang', AudioChannel.StrongFeedback, { volume: 0.75 });
    }

    /** 错误/失败音效 */
    protected playErrorSound(): void {
        AudioManager.Instance.play('legacy-mj/sounds/give', AudioChannel.SFX, { volume: 0.35 });
    }

    // ==================== 麻将 UI 布局常量 ====================

    protected static readonly TILE_W = 60;
    protected static readonly TILE_H = 84;
    protected static readonly TILE_GAP = 4;

    // ==================== 工具方法 ====================

    protected initOpponentHandCounts(): void {
        if (!this.opponentHandCounts) {
            this.opponentHandCounts = new Map<number, number>();
        } else {
            this.opponentHandCounts.clear();
        }
        for (let i = 1; i < this.getSeatCount(); i++) {
            this.opponentHandCounts.set(i, 0);
        }
    }

    protected seedOpponentHands(defaultCount: number = 13): void {
        for (let i = 1; i < this.getSeatCount(); i++) {
            if ((this.opponentHandCounts.get(i) || 0) <= 0) {
                this.opponentHandCounts.set(i, defaultCount);
            }
        }
    }

    protected preloadLegacyMahjongAssets(): void {
        const atlasPaths: Array<[LegacyAtlasKey, string]> = [
            ['my', 'legacy-mj/textures/MJ/my/Z_my'],
            ['bottom', 'legacy-mj/textures/MJ/bottom/Z_bottom'],
            ['left', 'legacy-mj/textures/MJ/left/Z_left'],
            ['right', 'legacy-mj/textures/MJ/right/Z_right'],
            ['empty', 'legacy-mj/textures/MJ/mjEmpty'],
        ];
        for (const [key, path] of atlasPaths) {
            resources.load(path, SpriteAtlas, (err, atlas) => {
                if (!err && atlas) {
                    this.legacyAtlases.set(key, atlas);
                    this.onLegacyThemeLoaded();
                }
            });
        }

        const spritePaths: Array<[LegacySpriteKey, string]> = [
            ['tableBg', 'legacy-mj/textures/images/mahjong_table/spriteFrame'],
            ['actionBg', 'legacy-mj/textures/ops/penggang_bottom/spriteFrame'],
            ['seatBg', 'legacy-mj/textures/png/fangkaxiaobeijing/spriteFrame'],
            ['roundBg', 'legacy-mj/textures/MJRoom/roundnumbg/spriteFrame'],
            ['moneyFrame', 'legacy-mj/textures/png/money_frame/spriteFrame'],
        ];
        for (const [key, path] of spritePaths) {
            resources.load(path, SpriteFrame, (err, frame) => {
                if (!err && frame) {
                    this.legacySprites.set(key, frame);
                    this.onLegacyThemeLoaded();
                }
            });
        }

        const effectFrameNames = [
            'peng_glow',
            'peng_glow2',
            'gang_glow',
            'gang_glow2',
            'guafeng1',
            'guafeng2',
            'guafeng3',
            'guafeng4',
            'guafeng5',
            'guafeng6',
            'guafeng7',
            'rain1',
            'rain2',
            'rain3',
            'rain4',
            'rain5',
            'rain6',
            'hu_glow',
            'hu_glow3',
            'hu_glow4',
            'zimo_glow2',
        ];
        for (const name of effectFrameNames) {
            resources.load(`legacy-mj/textures/images/efx/${name}/spriteFrame`, SpriteFrame, (err, frame) => {
                if (!err && frame) {
                    this.cachedEffectFrames.set(name, frame);
                }
            });
        }
    }

    protected onLegacyThemeLoaded(): void {
        this.legacyThemeReady = this.legacyAtlases.size >= 4;
        this.applyLegacyTheme();
        this.renderMyHand();
        if (this.drawnTile) this.showDrawnTile(this.drawnTile);
        this.renderAllOpponentHands();
        this.renderAllDiscardAreas();
        this.renderAllMeldAreas();
    }

    protected updateHudInfo(): void {
        if (this.roomInfoLabel) {
            const roomText = this.roomNumber ? `房号 ${this.roomNumber}` : '麻将房间';
            this.roomInfoLabel.string = roomText;
        }
        if (this.roundInfoLabel) {
            const stateText = this.gameState === GameState.Playing ? '对局中' : (this.gameState === GameState.Dealing ? '发牌中' : '等待开始');
            const current = (this as any).roomInfo?.currentRound ?? (this as any).currentRound ?? 0;
            const total = (this as any).roomInfo?.totalRounds ?? (this as any).totalRounds ?? 0;
            const roundText = (current > 0 && total > 0) ? `第 ${current}/${total} 局` : (current > 0 ? `第 ${current} 局` : '');
            this.roundInfoLabel.string = `${stateText}${roundText ? '  ' + roundText : ''}  剩余 ${this.remainingTiles}`;
        }
        if (this.remainCountLabel) {
            this.remainCountLabel.string = `剩余 ${this.remainingTiles} 张`;
        }
        if (this.ruleHintLabel) {
            this.ruleHintLabel.string = this.getRuleHintText();
        }
    }

    protected getRuleHintText(): string {
        return '';
    }

    protected applyLegacyTheme(): void {
        if (!this.tableBackgroundNode) return;
        const tableBg = this.legacySprites.get('tableBg');
        const sprite = this.tableBackgroundNode.getComponent(Sprite);
        if (tableBg && sprite) {
            sprite.spriteFrame = tableBg;
            sprite.color = Color.WHITE;
        }
    }

    protected getLegacyTileSpriteName(tile: MahjongTile): string | null {
        if (!tile?.tile) return null;
        const pattern = Number(tile.tile.pattern) || 0;
        const number = Number(tile.tile.number) || 0;

        if (pattern === 1) return `dot_${number}`;
        if (pattern === 2) return `bamboo_${number}`;
        if (pattern === 3) return `character_${number}`;

        const patternMap: Record<number, string> = {
            4: 'wind_east',
            5: 'wind_south',
            6: 'wind_west',
            7: 'wind_north',
            8: 'red',
            9: 'green',
            10: 'white',
            11: 'spring',
            12: 'summer',
            13: 'autumn',
            14: 'winter',
            15: 'plum',
            16: 'orchid',
            17: 'chrysanthemum',
            18: 'bamboo',
        };
        return patternMap[pattern] || null;
    }

    protected getAtlasForSeat(seatIndex: number, interactive: boolean): SpriteAtlas | null {
        if (seatIndex === 0 && interactive) return this.legacyAtlases.get('my') || null;
        if (seatIndex === 1) return this.legacyAtlases.get('left') || null;
        if (seatIndex === 2) return this.legacyAtlases.get('right') || null;
        return this.legacyAtlases.get('bottom') || null;
    }

    protected getEmptyFrameNameForSeat(seatIndex: number): string | null {
        if (seatIndex === 1) return 'e_mj_left';
        if (seatIndex === 2) return 'e_mj_right';
        if (seatIndex === 3) return 'e_mj_up';
        return 'e_mj_b_bottom';
    }

    protected createTileNode(tile: MahjongTile, interactive: boolean): Node {
        return this.createTileNodeForSeat(tile, 0, interactive);
    }

    protected createTileNodeForSeat(tile: MahjongTile, seatIndex: number, interactive: boolean): Node {
        if (this.tilePrefab && seatIndex === 0 && interactive) {
            return instantiate(this.tilePrefab);
        }

        const tw = seatIndex === 0 && interactive ? 72 : 48;
        const th = seatIndex === 0 && interactive ? 100 : 66;
        const node = new Node(`tile_${tile.id || 0}_${tile.tile?.pattern || 0}_${tile.tile?.number || 0}`);
        node.layer = 1 << 25; // UI_2D layer
        (node as any)._tileData = tile;

        const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
        transform.setContentSize(tw, th);

        const atlas = this.getAtlasForSeat(seatIndex, interactive);
        const spriteName = this.getLegacyTileSpriteName(tile);
        let frame: SpriteFrame | null = null;
        if (atlas && spriteName) {
            const prefix = seatIndex === 0 && interactive ? 'M_' : (seatIndex === 1 ? 'L_' : (seatIndex === 2 ? 'R_' : 'B_'));
            frame = atlas.getSpriteFrame(prefix + spriteName);
        }

        if (frame) {
            const sprite = node.addComponent(Sprite);
            sprite.spriteFrame = frame;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.color = Color.WHITE;
            transform.setContentSize(tw, th);
        } else {
            const g = node.addComponent(Graphics);
            g.fillColor = new Color(255, 250, 240, 255);
            g.roundRect(-tw / 2, -th / 2, tw, th, 8);
            g.fill();
            g.strokeColor = new Color(180, 170, 160, 255);
            g.lineWidth = 1.5;
            g.roundRect(-tw / 2, -th / 2, tw, th, 8);
            g.stroke();

            const labelNode = new Node('TileLabel');
            labelNode.layer = node.layer;
            labelNode.parent = node;
            (labelNode.getComponent(UITransform) || labelNode.addComponent(UITransform)).setContentSize(tw - 10, th - 10);
            const label = labelNode.addComponent(Label);
            label.string = tileDisplayText(tile);
            label.fontSize = seatIndex === 0 ? 20 : 15;
            label.lineHeight = seatIndex === 0 ? 24 : 18;
            label.horizontalAlign = 1;
            label.verticalAlign = 1;
            label.overflow = 2;
            label.color = tile.tile?.pattern === 3 ? new Color(200, 50, 50, 255) : new Color(60, 60, 60, 255);
        }

        if (interactive) {
            node.on(Node.EventType.TOUCH_START, () => {
                (node as any)._dragLift = 24;
                this.onTileTapped(tile, node);
            }, this);
            node.on(Node.EventType.TOUCH_MOVE, (event: any) => {
                if (!this.isMyTurn || !this.canDiscardDirectly()) return;
                const delta = event?.getUIDelta ? event.getUIDelta() : null;
                const dy = delta?.y ?? event?.getDeltaY?.() ?? 0;
                const dragLift = Math.max(24, Math.min(120, ((node as any)._dragLift || 24) + dy));
                (node as any)._dragLift = dragLift;
                const pos = node.getPosition();
                pos.y = dragLift;
                node.setPosition(pos);
            }, this);
            const finalizeTouch = () => {
                const dragLift = (node as any)._dragLift || 0;
                if (dragLift >= 90 && this.canDiscardDirectly()) {
                    const tileIndex = this.myHandTiles.findIndex(item => item.id === tile.id);
                    if (tileIndex >= 0) {
                        this.selectedTileIndex = tileIndex;
                        this.selectedTileId = tile.id;
                        this.selectAndDiscard(tileIndex);
                        return;
                    }
                }
                this.highlightTile(node);
            };
            node.on(Node.EventType.TOUCH_END, finalizeTouch, this);
            node.on(Node.EventType.TOUCH_CANCEL, finalizeTouch, this);
        }

        return node;
    }

    protected createTileBackNode(): Node {
        return this.createTileBackNodeForSeat(3);
    }

    protected createTileBackNodeForSeat(seatIndex: number): Node {
        if (this.tileBackPrefab && seatIndex === 3) {
            return instantiate(this.tileBackPrefab);
        }

        const node = new Node(`tile_back_${seatIndex}`);
        node.layer = 1 << 25; // UI_2D layer
        const transform = node.addComponent(UITransform);
        const tw = seatIndex === 3 ? 42 : 36;
        const th = seatIndex === 3 ? 58 : 52;
        transform.setContentSize(tw, th);

        const atlas = this.legacyAtlases.get('empty');
        const frameName = this.getEmptyFrameNameForSeat(seatIndex);
        const frame = atlas && frameName ? atlas.getSpriteFrame(frameName) : null;
        if (frame) {
            const sprite = node.addComponent(Sprite);
            sprite.spriteFrame = frame;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.color = Color.WHITE;
        } else {
            const g = node.addComponent(Graphics);
            g.fillColor = new Color(90, 125, 170, 255);
            g.roundRect(-tw / 2, -th / 2, tw, th, 6);
            g.fill();
        }
        return node;
    }

    protected getEffectAnchor(seatIndex: number): Vec3 {
        switch (seatIndex) {
            case 0: return new Vec3(0, -120, 0);
            case 1: return new Vec3(-420, 10, 0);
            case 2: return new Vec3(420, 10, 0);
            case 3: return new Vec3(0, 190, 0);
            default: return Vec3.ZERO;
        }
    }

    protected getEffectFrameSequence(effect: MahjongEffectKey): string[] {
        switch (effect) {
            case 'peng': return ['peng_glow', 'peng_glow2'];
            case 'gang': return ['gang_glow', 'gang_glow2'];
            case 'guafeng': return ['guafeng1', 'guafeng2', 'guafeng3', 'guafeng4', 'guafeng5', 'guafeng6', 'guafeng7'];
            case 'xiayu': return ['rain1', 'rain2', 'rain3', 'rain4', 'rain5', 'rain6'];
            case 'zimo': return ['zimo_glow2', 'hu_glow3'];
            case 'hu':
            default:
                return ['hu_glow', 'hu_glow3', 'hu_glow4'];
        }
    }

    protected playMahjongActionEffect(seatIndex: number, effect: MahjongEffectKey, text?: string): void {
        if (!this.effectLayer) return;
        const anchor = this.getEffectAnchor(seatIndex);
        const frames = this.getEffectFrameSequence(effect)
            .map(name => this.cachedEffectFrames.get(name))
            .filter((frame): frame is SpriteFrame => !!frame);

        const effectNode = this.createUIChild(this.effectLayer, `Efx_${effect}_${Date.now()}`, 260, 180, anchor.x, anchor.y, 1);
        effectNode.setScale(new Vec3(0.85, 0.85, 1));

        if (frames.length > 0) {
            const sprite = effectNode.addComponent(Sprite);
            sprite.spriteFrame = frames[0];
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.color = new Color(255, 255, 255, 235);
            for (let index = 1; index < frames.length; index++) {
                this.scheduleOnce(() => {
                    if (!effectNode.isValid) return;
                    sprite.spriteFrame = frames[index];
                    effectNode.setScale(new Vec3(0.85 + index * 0.06, 0.85 + index * 0.06, 1));
                }, 0.08 * index);
            }
        } else {
            this.paintRect(effectNode, 220, 92, new Color(255, 215, 80, 180), new Color(255, 240, 180, 255), 18);
        }

        const labelNode = this.createUIChild(effectNode, 'Label', 220, 60, 0, 0, 1);
        const label = labelNode.addComponent(Label);
        label.string = text || this.getEffectDisplayText(effect);
        label.fontSize = 36;
        label.lineHeight = 40;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.color = new Color(255, 245, 214, 255);
        this.scheduleOnce(() => effectNode.isValid && effectNode.destroy(), 0.8);
    }

    protected getEffectDisplayText(effect: MahjongEffectKey): string {
        switch (effect) {
            case 'peng': return '碰';
            case 'gang': return '杠';
            case 'guafeng': return '刮风';
            case 'xiayu': return '下雨';
            case 'zimo': return '自摸';
            case 'hu':
            default:
                return '胡';
        }
    }

    protected renderAllOpponentHands(): void {
        for (let seatIndex = 1; seatIndex < this.getSeatCount(); seatIndex++) {
            this.renderOpponentHandBySeat(seatIndex, this.opponentHandCounts.get(seatIndex) || 0);
        }
    }

    protected renderOpponentHandBySeat(seatIndex: number, count: number): void {
        const area = this.getHandAreaBySeat(seatIndex);
        if (!area) return;
        area.removeAllChildren();
        if (count <= 0) return;

        const gap = seatIndex === 3 ? 4 : 2;
        const vertical = seatIndex === 1 || seatIndex === 2;
        const total = count * (vertical ? 18 : 34);
        let start = -total / 2;
        for (let i = 0; i < count; i++) {
            const back = this.createTileBackNodeForSeat(seatIndex);
            back.parent = area;
            if (vertical) {
                back.setPosition(0, start + i * 18, 0);
            } else {
                back.setPosition(start + i * (34 + gap), 0, 0);
            }
        }
    }

    protected renderAllDiscardAreas(): void {
        for (let seatIndex = 0; seatIndex < this.getSeatCount(); seatIndex++) {
            this.renderDiscardArea(seatIndex);
        }
    }

    protected renderDiscardArea(seatIndex: number): void {
        const discardArea = this.getDiscardAreaBySeat(seatIndex);
        if (!discardArea) return;
        discardArea.removeAllChildren();
        const discards = this.discardRecords.get(seatIndex) || [];
        if (discards.length === 0) return;

        // 历史出牌只展示最后一张，避免出牌堆叠到副露区域
        const lastDiscardId = this.lastDiscardTileId.get(seatIndex);
        const last = (lastDiscardId != null)
            ? (discards.find(d => d.id === lastDiscardId) || discards[discards.length - 1])
            : discards[discards.length - 1];

        const tileNode = this.createTileNodeForSeat(last, seatIndex, false);
        tileNode.parent = discardArea;
        tileNode.setPosition(0, 0, 0);

        this.paintHighlightBorder(tileNode, 48, 66, new Color(255, 220, 50, 255), 8);
        tileNode.setScale(new Vec3(0.6, 0.6, 1));
        const capturedNode = tileNode;
        this.scheduleOnce(() => {
            if (!capturedNode.isValid) return;
            capturedNode.setScale(new Vec3(1.08, 1.08, 1));
        }, 0.12);
    }

    protected getMeldAreaBySeat(seatIndex: number): Node | null {
        switch (seatIndex) {
            case 0: return this.myMeldArea;
            case 1: return this.leftMeldArea;
            case 2: return this.rightMeldArea;
            case 3: return this.topMeldArea;
            default: return null;
        }
    }

    protected renderAllMeldAreas(): void {
        for (let seatIndex = 0; seatIndex < this.getSeatCount(); seatIndex++) {
            this.renderMeldArea(seatIndex);
        }
    }

    protected renderMeldArea(seatIndex: number): void {
        const area = this.getMeldAreaBySeat(seatIndex);
        if (!area) return;
        area.removeAllChildren();
        const melds = this.meldRecords.get(seatIndex) || [];
        for (let groupIndex = 0; groupIndex < melds.length; groupIndex++) {
            const meldGroup = melds[groupIndex];
            const meld = meldGroup.tiles;
            const isAnGang = meldGroup.meldType === MeldType.AnGang;
            const group = new Node(`Meld_${groupIndex}`);
            group.layer = 1 << 25; // UI_2D layer
            group.parent = area;
            (group.getComponent(UITransform) || group.addComponent(UITransform)).setContentSize(180, 72);
            group.setPosition((seatIndex === 0 || seatIndex === 3 ? groupIndex * 160 : 0), (seatIndex === 1 ? -groupIndex * 72 : seatIndex === 2 ? groupIndex * 72 : 0), 0);
            for (let i = 0; i < meld.length; i++) {
                // 暗杠：第0张和第1张显示正面，第2张（中间牌）显示牌背
                const useBack = isAnGang && (i === 2);
                const tileNode = useBack
                    ? this.createTileBackNodeForSeat(seatIndex)
                    : this.createTileNodeForSeat(meld[i], seatIndex, false);
                tileNode.parent = group;
                if (seatIndex === 1 || seatIndex === 2) {
                    tileNode.setPosition(0, i * 38 - 38, 0);
                } else {
                    tileNode.setPosition(i * 42 - 42, 0, 0);
                }
            }
        }
    }

    /** 点击手牌回调 — 双击直接出牌（参考 babykylin MJGame.onMJClicked） */
    protected onTileTapped(tile: MahjongTile, node: Node): void {
        if (!this.isMyTurn) return;

        // 双击已选中的牌直接出牌
        if (this.selectedTileId === tile.id) {
            const tileIndex = this.myHandTiles.findIndex(item => item.id === tile.id);
            if (tileIndex >= 0 && this.canDiscardDirectly()) {
                this.selectAndDiscard(tileIndex);
                return;
            }
            // 摸到的牌（未加入 myHandTiles）
            if (tileIndex < 0 && this.drawnTile && tile.id === this.drawnTile.id && this.canDiscardDirectly()) {
                const playOpt = this.currentActionOptions.find(o => o.type === MahjongActionType.Play);
                if (playOpt) {
                    this.selectedTileIndex = -1;
                    this.selectedTileId = tile.id;
                    this.discardSelectedTile(playOpt.id);
                }
                return;
            }
        }

        this.selectedTileIndex = this.myHandTiles.findIndex(item => item.id === tile.id);
        // 摸到的牌尚未加入 myHandTiles，用 -1 标记并通过 selectedTileId 区分
        if (this.selectedTileIndex < 0 && this.drawnTile && tile.id === this.drawnTile.id) {
            this.selectedTileIndex = -1;
        }
        this.selectedTileId = tile.id;
        this.highlightTile(node);
        AudioManager.Instance.play('legacy-mj/sounds/select', AudioChannel.SFX, { volume: 0.3 });
    }

    /** 判断当前是否可以直接出牌（有 Play 选项且不在等待碰/杠/胡） */
    protected canDiscardDirectly(): boolean {
        return this.currentActionOptions.some(o => o.type === MahjongActionType.Play);
    }

    /** 高亮选中的牌 */
    protected highlightTile(node: Node): void {
        if (this.myHandArea) {
            for (const child of this.myHandArea.children) {
                const tileData = (child as any)._tileData as MahjongTile | undefined;
                const baseY = tileData && tileData.id === this.selectedTileId ? 24 : 0;
                const pos = child.getPosition();
                pos.y = baseY;
                child.setPosition(pos);
                child.setScale(tileData && tileData.id === this.selectedTileId ? new Vec3(1.04, 1.04, 1) : Vec3.ONE);
            }
        }
        if (this.drawnTileNode && this.drawnTileNode.children.length > 0) {
            const child = this.drawnTileNode.children[0];
            const tileData = (child as any)._tileData as MahjongTile | undefined;
            const pos = child.getPosition();
            pos.y = tileData && tileData.id === this.selectedTileId ? 24 : 0;
            child.setPosition(pos);
            child.setScale(tileData && tileData.id === this.selectedTileId ? new Vec3(1.04, 1.04, 1) : Vec3.ONE);
        }
        if (node) {
            const pos = node.getPosition();
            pos.y = Math.max(pos.y, 24);
            node.setPosition(pos);
            node.setScale(new Vec3(1.04, 1.04, 1));
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

        this.tableBackgroundNode = this.createUIChild(parent, 'TableBackground', 1680, 920, 0, 0, zOrder);
        const tableSprite = this.tableBackgroundNode.addComponent(Sprite);
        tableSprite.color = new Color(42, 96, 74, 255);
        const tableBackgroundFallback = this.createUIChild(this.tableBackgroundNode, 'FallbackBg', 1680, 920, 0, 0, 0);
        this.paintRect(tableBackgroundFallback, 1680, 920, new Color(42, 96, 74, 255), new Color(18, 50, 38, 255), 18);

        const topHud = this.createUIChild(parent, 'TopHud', 1240, 74, 0, 470, zOrder + 4);
        this.paintRect(topHud, 1240, 74, new Color(14, 31, 44, 210), new Color(214, 182, 116, 255), 18);

        const roomNode = this.createUIChild(topHud, 'RoomInfo', 320, 40, -360, 0, 1);
        this.roomInfoLabel = roomNode.addComponent(Label);
        this.roomInfoLabel.fontSize = 28;
        this.roomInfoLabel.lineHeight = 34;
        this.roomInfoLabel.color = new Color(255, 240, 202, 255);

        const roundNode = this.createUIChild(topHud, 'RoundInfo', 340, 40, 0, 0, 1);
        this.roundInfoLabel = roundNode.addComponent(Label);
        this.roundInfoLabel.fontSize = 26;
        this.roundInfoLabel.lineHeight = 32;
        this.roundInfoLabel.horizontalAlign = 1;
        this.roundInfoLabel.color = new Color(255, 255, 255, 255);

        const remainNode = this.createUIChild(topHud, 'RemainCount', 260, 40, 360, 0, 1);
        this.remainCountLabel = remainNode.addComponent(Label);
        this.remainCountLabel.fontSize = 26;
        this.remainCountLabel.lineHeight = 32;
        this.remainCountLabel.horizontalAlign = 2;
        this.remainCountLabel.color = new Color(255, 229, 143, 255);

        const ruleNode = this.createUIChild(parent, 'RuleHint', 520, 40, 0, 420, zOrder + 3);
        this.ruleHintLabel = ruleNode.addComponent(Label);
        this.ruleHintLabel.fontSize = 22;
        this.ruleHintLabel.lineHeight = 26;
        this.ruleHintLabel.horizontalAlign = 1;
        this.ruleHintLabel.color = new Color(255, 237, 186, 255);

        if (!this.countdownLabel) {
            const timerNode = this.createUIChild(parent, 'MahjongCountdown', 120, 60, 0, 200, zOrder + 4);
            this.paintRect(timerNode, 120, 60, new Color(20, 24, 36, 220), new Color(255, 219, 140, 255), 14);
            this.countdownLabel = timerNode.addComponent(Label);
            this.countdownLabel.fontSize = 34;
            this.countdownLabel.lineHeight = 40;
            this.countdownLabel.horizontalAlign = 1;
            this.countdownLabel.verticalAlign = 1;
            this.countdownLabel.color = new Color(255, 255, 255, 255);
            this.countdownLabel.string = '0';
        }

        this.topHandArea = this.createUIChild(parent, 'TopHandArea', 940, 80, 0, 330, zOrder + 2);
        this.topMeldArea = this.createUIChild(parent, 'TopMeldArea', 640, 80, 0, 255, zOrder + 2);
        this.topDiscardArea = this.createUIChild(parent, 'TopDiscardArea', 420, 180, 0, 120, zOrder + 2);

        this.leftHandArea = this.createUIChild(parent, 'LeftHandArea', 100, 560, -690, -10, zOrder + 2);
        this.leftMeldArea = this.createUIChild(parent, 'LeftMeldArea', 110, 320, -560, -50, zOrder + 2);
        this.leftDiscardArea = this.createUIChild(parent, 'LeftDiscardArea', 220, 240, -360, -10, zOrder + 2);

        this.rightHandArea = this.createUIChild(parent, 'RightHandArea', 100, 560, 690, -10, zOrder + 2);
        this.rightMeldArea = this.createUIChild(parent, 'RightMeldArea', 110, 320, 560, -50, zOrder + 2);
        this.rightDiscardArea = this.createUIChild(parent, 'RightDiscardArea', 220, 240, 360, -10, zOrder + 2);

        this.myDiscardArea = this.createUIChild(parent, 'MyDiscardArea', 460, 180, 0, -70, zOrder + 2);
        this.myMeldArea = this.createUIChild(parent, 'MyMeldArea', 640, 80, -180, -240, zOrder + 2);
        this.myHandArea = this.createUIChild(parent, 'MyHandArea', 1260, 120, 0, -408, zOrder + 3);
        this.drawnTileNode = this.createUIChild(parent, 'DrawnTileNode', 90, 120, 600, -404, zOrder + 4);

        this.actionPanel = this.createUIChild(parent, 'ActionPanel', 860, 120, 0, -286, zOrder + 6);
        this.paintRect(this.actionPanel, 860, 120, new Color(16, 20, 30, 215), new Color(255, 210, 112, 255), 18);
        const actionHint = this.createUIChild(this.actionPanel, 'ActionHint', 220, 30, 0, 34, 1);
        this.actionHintLabel = actionHint.addComponent(Label);
        this.actionHintLabel.string = '请选择操作';
        this.actionHintLabel.fontSize = 20;
        this.actionHintLabel.lineHeight = 24;
        this.actionHintLabel.horizontalAlign = 1;
        this.actionHintLabel.color = new Color(255, 228, 166, 255);
        this.actionPanel.active = false;

        this.effectLayer = this.createUIChild(parent, 'MahjongEffectLayer', 1680, 920, 0, 0, zOrder + 8);
        this.buildMahjongControls(parent, zOrder + 9);
        this.buildMahjongPlayerInfo(parent, zOrder + 5);
        this.ensureBackButtonVisible();

        console.log('[MahjongRoom] Mahjong UI built (legacy-inspired)');
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
        const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
        transform.setContentSize(w, h);
        node.setPosition(x, y, 0);
        node.setSiblingIndex(z);
        return node;
    }

    protected buildMahjongControls(parent: Node, zOrder: number): void {
        if (this.controlBarNode) return;
        const visibleWidth = view.getVisibleSize().width || 1280;
        const controlX = Math.max(240, visibleWidth / 2 - 240);
        this.controlBarNode = this.createUIChild(parent, 'MahjongControlBar', 432, 56, controlX, 470, zOrder);

        this.customReadyButton = this.createActionButton(this.controlBarNode, 'ReadyBtn', '准备', 0, 0, 120, new Color(46, 128, 88, 255), new Color(133, 231, 174, 255), 'onReadyClick');
        this.customReadyLabel = this.findChildComponent<Label>(this.customReadyButton, 'Label', Label);

        this.customStartButton = this.createActionButton(this.controlBarNode, 'StartBtn', '开始', 136, 0, 120, new Color(191, 122, 36, 255), new Color(255, 214, 138, 255), 'onStartGameClick');
        this.customStartLabel = this.findChildComponent<Label>(this.customStartButton, 'Label', Label);

        this.customSeatButton = this.createActionButton(this.controlBarNode, 'SeatBtn', '旁观', 272, 0, 120, new Color(63, 93, 134, 255), new Color(147, 201, 255, 255), 'onChangeSeatClick');
        this.customSeatLabel = this.findChildComponent<Label>(this.customSeatButton, 'Label', Label);
    }

    protected buildMahjongPlayerInfo(parent: Node, zOrder: number): void {
        if (this.playerInfoRoot) return;
        this.playerInfoRoot = this.createUIChild(parent, 'MahjongPlayerInfoRoot', 1680, 920, 0, 0, zOrder);
        this.playerInfoCards[0] = this.createPlayerInfoCard(this.playerInfoRoot, 'SelfInfo', -610, -304, 292, 92);
        this.playerInfoCards[1] = this.createPlayerInfoCard(this.playerInfoRoot, 'LeftInfo', -690, 118, 188, 84);
        this.playerInfoCards[2] = this.createPlayerInfoCard(this.playerInfoRoot, 'TopInfo', 0, 372, 292, 84);
        this.playerInfoCards[3] = this.createPlayerInfoCard(this.playerInfoRoot, 'RightInfo', 690, 118, 188, 84);
    }

    protected createPlayerInfoCard(parent: Node, name: string, x: number, y: number, w: number, h: number): MahjongPlayerInfoCard {
        const root = this.createUIChild(parent, name, w, h, x, y, 1);
        this.paintRect(root, w, h, new Color(18, 26, 38, 220), new Color(214, 182, 116, 255), 16);

        const nameNode = this.createUIChild(root, 'Name', w - 24, 26, 0, 22, 1);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = '';
        nameLabel.fontSize = 22;
        nameLabel.lineHeight = 26;
        nameLabel.horizontalAlign = 1;
        nameLabel.color = new Color(255, 238, 201, 255);

        const goldNode = this.createUIChild(root, 'Gold', w - 24, 22, 0, -4, 1);
        const goldLabel = goldNode.addComponent(Label);
        goldLabel.string = '';
        goldLabel.fontSize = 18;
        goldLabel.lineHeight = 22;
        goldLabel.horizontalAlign = 1;
        goldLabel.color = new Color(213, 232, 255, 255);

        const stateNode = this.createUIChild(root, 'State', w - 24, 22, 0, -28, 1);
        const stateLabel = stateNode.addComponent(Label);
        stateLabel.string = '';
        stateLabel.fontSize = 18;
        stateLabel.lineHeight = 22;
        stateLabel.horizontalAlign = 1;
        stateLabel.color = new Color(255, 220, 146, 255);

        return { root, nameLabel, goldLabel, stateLabel };
    }

    protected createActionButton(parent: Node, name: string, text: string, x: number, y: number, width: number, fillColor: Color, strokeColor: Color, handler: string): Node {
        const buttonNode = this.createUIChild(parent, name, width, 48, x, y, 1);
        this.paintRect(buttonNode, width, 48, fillColor, strokeColor, 14);
        const labelNode = this.createUIChild(buttonNode, 'Label', width - 12, 28, 0, 0, 1);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 22;
        label.lineHeight = 26;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.color = new Color(255, 244, 220, 255);

        buttonNode.addComponent(Button);
        buttonNode.on(Node.EventType.TOUCH_END, () => {
            const fn = (this as any)[handler];
            if (typeof fn === 'function') {
                fn.call(this);
            }
        }, this);
        return buttonNode;
    }

    protected refreshMahjongOverlayUI(): void {
        this.refreshMahjongControls();
        this.refreshMahjongPlayerInfo();
        this.ensureBackButtonVisible();
    }

    protected refreshMahjongControls(): void {
        const canReady = this.seat !== -1 && this.gameState === GameState.Waiting;
        const selfInfo = this.seat !== -1 ? this.playerInfos[this.seat] : null;
        const isOwner = this.seat !== -1 && this.seat === this.ownerSeat;

        if (this.customReadyButton) this.customReadyButton.active = canReady;
        if (this.customReadyLabel) this.customReadyLabel.string = selfInfo?.ready ? '已准备' : '准备';

        if (this.customStartButton) this.customStartButton.active = !!(canReady && isOwner);
        if (this.customStartLabel) this.customStartLabel.string = '开始';

        if (this.customSeatButton) this.customSeatButton.active = this.seat !== -1;
        if (this.customSeatLabel) this.customSeatLabel.string = '旁观';
    }

    protected getPlayerCardIndexByClientSeat(clientSeat: number): number {
        if (this.getSeatCount() === 2) {
            if (clientSeat === 0) return 0;
            if (clientSeat === 1) return 2;
            return -1;
        }
        return clientSeat >= 0 && clientSeat < 4 ? clientSeat : -1;
    }

    protected refreshMahjongPlayerInfo(): void {
        for (let i = 0; i < this.playerInfoCards.length; i++) {
            if (this.playerInfoCards[i]) {
                this.playerInfoCards[i]!.root.active = false;
            }
        }

        for (let serverSeat = 0; serverSeat < this.getSeatCount(); serverSeat++) {
            const clientSeat = this.server2ClientSeat(serverSeat);
            const cardIndex = this.getPlayerCardIndexByClientSeat(clientSeat);
            if (cardIndex < 0 || !this.playerInfoCards[cardIndex]) continue;
            const card = this.playerInfoCards[cardIndex]!;
            const info = this.playerInfos[serverSeat];
            card.root.active = !!info;
            if (!info) continue;

            const tags: string[] = [];
            if (serverSeat === this.ownerSeat) tags.push('房主');
            if (serverSeat === this.seat) tags.push('我');
            card.nameLabel.string = `${info.nickname || `玩家${serverSeat + 1}`}${tags.length > 0 ? ` · ${tags.join('/')}` : ''}`;
            card.goldLabel.string = `金币 ${info.gold ?? 0}`;
            card.stateLabel.string = this.getPlayerStateText(info);
        }
    }

    protected getPlayerStateText(info: any): string {
        const states: string[] = [];
        if (info.offline) states.push('离线');
        if (info.authorize) states.push('托管');
        if (info.ready) states.push('已准备');
        if (states.length === 0) states.push(this.gameState === GameState.Waiting ? '等待中' : '游戏中');
        return states.join(' · ');
    }

    protected ensureBackButtonVisible(): void {
        const root = this.node;
        const visibleWidth = view.getVisibleSize().width || 1280;
        const backX = -visibleWidth / 2 + 86;
        const btnBack = this.findChildRecursive(root, 'BtnBack');
        if (btnBack) {
            btnBack.active = true;
            btnBack.setPosition(backX, 470, 0);
            if (btnBack.parent) {
                btnBack.parent.active = true;
                btnBack.setSiblingIndex(btnBack.parent.children.length - 1);
            }
            return;
        }

        if (this.fallbackBackButton && this.fallbackBackButton.isValid) {
            this.fallbackBackButton.active = true;
            this.fallbackBackButton.setPosition(backX, 470, 0);
            this.fallbackBackButton.setSiblingIndex(this.node.children.length - 1);
            return;
        }

        const buttonNode = this.createUIChild(root, 'MahjongFallbackBack', 132, 52, backX, 470, 999);
        this.paintRect(buttonNode, 132, 52, new Color(16, 20, 30, 228), new Color(255, 210, 112, 255), 14);
        const labelNode = this.createUIChild(buttonNode, 'Label', 100, 28, 0, 0, 1);
        const label = labelNode.addComponent(Label);
        label.string = '退出房间';
        label.fontSize = 22;
        label.lineHeight = 26;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.color = new Color(255, 241, 210, 255);

        buttonNode.addComponent(Button);
        buttonNode.on(Node.EventType.TOUCH_END, () => this.onBackClick(), this);
        this.fallbackBackButton = buttonNode;
    }

    protected paintRect(node: Node, w: number, h: number, fillColor: Color, strokeColor?: Color, radius: number = 12): void {
        const bgName = '__paint_rect_bg__';
        let bgNode = node.getChildByName(bgName);
        if (!bgNode) {
            bgNode = new Node(bgName);
            bgNode.parent = node;
            bgNode.layer = node.layer;
        }
        const transform = bgNode.getComponent(UITransform) || bgNode.addComponent(UITransform);
        transform.setContentSize(w, h);
        bgNode.setPosition(0, 0, 0);
        bgNode.setSiblingIndex(0);

        const graphics = bgNode.getComponent(Graphics) || bgNode.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = fillColor;
        graphics.roundRect(-w / 2, -h / 2, w, h, radius);
        graphics.fill();
        if (strokeColor) {
            graphics.strokeColor = strokeColor;
            graphics.lineWidth = 2;
            graphics.roundRect(-w / 2, -h / 2, w, h, radius);
            graphics.stroke();
        }
    }

    /** 仅绘制高亮描边，不填充，不影响子节点布局 */
    protected paintHighlightBorder(node: Node, w: number, h: number, strokeColor: Color, radius: number = 8): void {
        const borderName = '__highlight_border__';
        let borderNode = node.getChildByName(borderName);
        if (!borderNode) {
            borderNode = new Node(borderName);
            borderNode.parent = node;
            borderNode.layer = node.layer;
        }
        const transform = borderNode.getComponent(UITransform) || borderNode.addComponent(UITransform);
        transform.setContentSize(w, h);
        borderNode.setPosition(0, 0, 0);
        borderNode.setSiblingIndex(0);

        const graphics = borderNode.getComponent(Graphics) || borderNode.addComponent(Graphics);
        graphics.clear();
        graphics.strokeColor = strokeColor;
        graphics.lineWidth = 3;
        graphics.roundRect(-w / 2, -h / 2, w, h, radius);
        graphics.stroke();
    }

    /**
     * 根据吃牌选项的 tile1/tile2 生成按钮文字，如"吃5-7万"
     */
    protected buildChiButtonText(tileId1: number, tileId2: number): string {
        const findTile = (id: number): string => {
            if (!id) return '';
            for (const t of this.myHandTiles) {
                if (t.id === id) return tileDisplayText(t);
            }
            return '';
        };
        const t1 = findTile(tileId1);
        const t2 = findTile(tileId2);
        if (t1 && t2) return `吃${t1}${t2}`;
        return '吃';
    }

    /**
     * 根据胡牌选项的目标 tileId 生成按钮文字。
     * 子类可扩展 findTileById 来支持杠翻牌、弃牌等非手牌区域。
     */
    protected buildHuButtonText(tileId: number): string {
        const tile = this.findTileById(tileId);
        return tile ? `胡${tileDisplayText(tile)}` : '胡牌';
    }

    /**
     * 根据 currentActionOptions 渲染操作按钮（增强版）
     * 参考 babykylin MJGame.js showAction/addOption 的设计：
     * - 碰/杠/胡按钮旁显示目标牌的缩略牌面预览
     * - 按钮点击音效与缩放反馈
     * - 过牌按钮仅在非"仅出牌"时显示
     */
    protected renderActionButtonsFromOptions(options: MahjongActionOption[]): void {
        if (!this.actionPanel) return;
        this.actionPanel.removeAllChildren();
        const hintNode = this.createUIChild(this.actionPanel, 'ActionHint', 220, 30, 0, 34, 1);
        const hint = hintNode.addComponent(Label);
        this.actionHintLabel = hint;
        hint.string = '请选择操作';
        hint.fontSize = 20;
        hint.lineHeight = 24;
        hint.horizontalAlign = 1;
        hint.color = new Color(255, 228, 166, 255);

        const buttons: Array<{text: string, actionId: number, tileId?: number, color: Color, showPreview?: boolean, previewTileId?: number}> = [];
        const self = this;

        for (const opt of options) {
            const t = opt.type;
            if (t === MahjongActionType.ZiMo) buttons.push({text: this.buildHuButtonText(opt.tile1), actionId: opt.id, tileId: opt.tile1, color: new Color(220, 50, 50, 255), showPreview: true, previewTileId: opt.tile1});
            else if (t === MahjongActionType.DianPao) buttons.push({text: this.buildHuButtonText(opt.tile1), actionId: opt.id, tileId: opt.tile1, color: new Color(220, 50, 50, 255), showPreview: true, previewTileId: opt.tile1});
            else if (t === MahjongActionType.ZhiGang) buttons.push({text: '直杠', actionId: opt.id, tileId: opt.tile1, color: new Color(200, 150, 50, 255), showPreview: true, previewTileId: opt.tile1});
            else if (t === MahjongActionType.JiaGang) buttons.push({text: '加杠', actionId: opt.id, tileId: opt.tile1, color: new Color(200, 150, 50, 255), showPreview: true, previewTileId: opt.tile1});
            else if (t === MahjongActionType.AnGang) buttons.push({text: '暗杠', actionId: opt.id, color: new Color(200, 150, 50, 255)});
            else if (t === MahjongActionType.Peng) buttons.push({text: '碰', actionId: opt.id, tileId: opt.tile1, color: new Color(50, 150, 200, 255), showPreview: true, previewTileId: opt.tile1});
            else if (t === MahjongActionType.Chi) {
                const chiText = this.buildChiButtonText(opt.tile1, opt.tile2);
                buttons.push({text: chiText, actionId: opt.id, tileId: opt.tile1, color: new Color(50, 200, 100, 255), showPreview: true, previewTileId: opt.tile1});
            }
            else if (t === MahjongActionType.Play) buttons.push({text: '出牌', actionId: opt.id, color: new Color(180, 160, 80, 255)});
        }

        // 仅在有碰/杠/胡/吃操作时才显示过牌按钮（参考 babykylin 仅在 peng/gang/hu 时显示 options）
        const hasInteractiveActions = buttons.some(b => b.text !== '出牌');
        if (hasInteractiveActions) {
            buttons.push({text: '过', actionId: -1, color: new Color(120, 120, 120, 255)});
        }

        if (buttons.length === 0) return;

        // 计算布局：含预览牌的按钮更宽
        const btnW = 120, btnH = 54, gap = 16;
        const previewBtnW = 160; // 有牌面预览的按钮更宽
        let totalWidth = 0;
        for (const btnInfo of buttons) {
            totalWidth += btnInfo.showPreview ? previewBtnW : btnW;
        }
        totalWidth += (buttons.length - 1) * gap;
        let startX = -totalWidth / 2;

        for (const btnInfo of buttons) {
            const currentBtnW = btnInfo.showPreview ? previewBtnW : btnW;
            const btnContainer = new Node(`Btn_${btnInfo.text}`);
            btnContainer.parent = this.actionPanel;
            const bt = btnContainer.getComponent(UITransform) || btnContainer.addComponent(UITransform);
            bt.setContentSize(currentBtnW, btnH);
            startX += currentBtnW / 2;
            btnContainer.setPosition(startX, 0, 0);
            startX += currentBtnW / 2 + gap;

            // 按钮背景
            const g = btnContainer.addComponent(Graphics);
            g.fillColor = btnInfo.color;
            g.roundRect(-currentBtnW / 2, -btnH / 2, currentBtnW, btnH, 10);
            g.fill();
            // 描边
            g.strokeColor = new Color(255, 255, 255, 80);
            g.lineWidth = 1.5;
            g.roundRect(-currentBtnW / 2, -btnH / 2, currentBtnW, btnH, 10);
            g.stroke();

            // 牌面预览（参考 babykylin 的 opTarget Sprite）
            if (btnInfo.showPreview && btnInfo.previewTileId) {
                const previewTile = this.findTileById(btnInfo.previewTileId);
                if (previewTile) {
                    const previewNode = this.createTileNodeForSeat(previewTile, 0, false);
                    previewNode.setScale(new Vec3(0.42, 0.42, 1));
                    previewNode.setPosition(-currentBtnW / 2 + 26, 0, 0);
                    previewNode.parent = btnContainer;
                }
            }

            // 按钮文字（有预览时偏右）
            const labelNode = new Node('Label');
            labelNode.parent = btnContainer;
            const labelW = btnInfo.showPreview ? currentBtnW - 68 : btnW - 12;
            (labelNode.getComponent(UITransform) || labelNode.addComponent(UITransform)).setContentSize(labelW, btnH - 10);
            labelNode.setPosition(btnInfo.showPreview ? 18 : 0, 0, 0);
            const lc = labelNode.addComponent(Label);
            lc.string = btnInfo.text;
            lc.fontSize = 24;
            lc.lineHeight = 30;
            lc.overflow = 2;
            lc.horizontalAlign = 1;
            lc.verticalAlign = 1;
            lc.color = new Color(255, 255, 255, 255);

            const button = btnContainer.addComponent(Button);
            button.transition = 1; // SCALE
            button.zoomScale = 0.92;
            button.duration = 0.08;

            // 用闭包存储回调
            const isPlayBtn = (btnInfo.text === '出牌');
            btnContainer.on(Node.EventType.TOUCH_END, () => {
                // 点击音效
                AudioManager.Instance.play('legacy-mj/sounds/btnClick', AudioChannel.SFX, { volume: 0.35 });
                // 短暂禁用按钮防止重复点击
                button.interactable = false;
                self.scheduleOnce(() => {
                    if (btnContainer.isValid) button.interactable = true;
                }, 0.3);

                if (btnInfo.actionId === -1) {
                    self.doActionPass();
                } else if (isPlayBtn) {
                    self.discardSelectedTile(btnInfo.actionId);
                } else {
                    self.doActionById(btnInfo.actionId, btnInfo.tileId);
                }
            }, this);
        }

        console.log(`[MahjongRoom] Rendered ${buttons.length} action buttons (enhanced)`);
    }

    /** 根据 tileId 在手牌和摸牌中查找牌 */
    protected findTileById(tileId: number): MahjongTile | null {
        if (!tileId) return null;
        for (const t of this.myHandTiles) {
            if (t.id === tileId) return t;
        }
        if (this.drawnTile && this.drawnTile.id === tileId) return this.drawnTile;
        return null;
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
            this.meldRecords = new Map<number, MahjongMeldGroup[]>();
        } else {
            this.meldRecords.clear();
        }
        if (!this.lastDiscardTileId) {
            this.lastDiscardTileId = new Map<number, number>();
        } else {
            this.lastDiscardTileId.clear();
        }
        const seatCount = this.getSeatCount();
        for (let i = 0; i < seatCount; i++) {
            this.discardRecords.set(i, []);
            this.meldRecords.set(i, []);
        }
    }
}
