/**
 * 麻将房间基类 (MahjongRoomBase)
 * 所有麻将类游戏的统一基类，提供：
 * - 麻将手牌管理（横屏排列）
 * - 牌墙展示（可选）
 * - 吃碰杠胡操作面板
 * - 出牌交互
 * - 麻将特效触发接口
 * - 麻将特有结算逻辑
 *
 * 适用游戏：桃江麻将、红中麻将、长沙麻将
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, Prefab, instantiate, Vec3, Tween, tween, UIOpacity } from 'cc';
import { RoomBase } from './RoomBase';
import { GameTypes, RoomState, PlayerRoomState, SeatPosition, MahjongAction, RoundSettlementData, FinalSettlementData } from './GameTypes';

const { ccclass, property } = _decorator;

// ==================== 麻将类型定义 ====================

/** 麻将牌数据 */
export interface MahjongTile {
    /** 牌值 (1-9万, 1-9条, 1-9筒, 东南西北中发白) */
    value: number;
    /** 花色 (0=万, 1=条, 2=筒, 3=字) */
    suit: number;
    /** 唯一ID (用于动画追踪) */
    tileId: string;
}

/** 麻将手牌区域配置 */
export interface HandAreaConfig {
    /** 手牌节点 */
    handContainer: Node;
    /** 已出的牌容器 */
    discardContainer: Node;
    /** 暗杠/明杠展示区 */
    meldContainer: Node;
    /** 最大手牌数 */
    maxHandSize: number;
}

/** 可用操作列表 */
export interface AvailableActions {
    canChi?: boolean;       // 可以吃
    canPeng?: boolean;      // 可以碰
    canGang?: boolean;      // 可以杠（可能多个）
    canHu?: boolean;        // 可以胡
    canTing?: boolean;      // 可以听
    gangTiles?: number[];   // 可杠的牌列表
    chiTiles?: number[][];  // 可吃的牌组合
}

/** 出牌结果 */
export interface DiscardResult {
    playerId: string;
    tile: MahjongTile;
    seatIndex: number;
}

// ==================== 麻将事件回调 ====================

export interface MahjongEventCallbacks {
    /** 手牌变化 */
    onHandChanged?: (tiles: MahjongTile[]) => void;
    /** 出牌事件 */
    onDiscard?: (result: DiscardResult) => void;
    /** 吃碰杠胡操作 */
    onMahjongAction?: (action: MahjongAction, tiles?: MahjongTile[]) => void;
    /** 听牌状态变化 */
    onTingStateChanged?: (isTing: boolean, tingInfo?: any) => void;
    /** 摸牌 */
    onDrawTile?: (tile: MahjongTile) => void;
    /** 补杠/暗杠 */
    onConcealedGang?: (tile: MahjongTile) => void;
}

@ccclass('MahjongRoomBase')
export class MahjongRoomBase extends RoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected mahjongTable: Node = null;         // 牌桌主体

    @property({ type: Node })
    protected myHandArea: Node = null;           // 自己的手牌区

    @property({ type: Node })
    protected leftHandArea: Node = null;         // 左边对手手牌区(背面)

    @property({ type: Node })
    protected rightHandArea: Node = null;        // 右边对手手牌区(背面)

    @property({ type: Node })
    protected topHandArea: Node = null;          // 对面手牌区(背面, 4人场)

    @property({ type: Node })
    protected myDiscardArea: Node = null;        // 自己的弃牌区

    @property({ type: Node })
    protected leftDiscardArea: Node = null;      // 左边弃牌区

    @property({ type: Node })
    protected rightDiscardArea: Node = null;     // 右边弃牌区

    @property({ type: Node })
    protected topDiscardArea: Node = null;       // 对面弃牌区

    @property({ type: Node })
    protected actionPanel: Node = null;          // 操作按钮面板(胡/杠/碰/吃/过)

    @property({ type: Node })
    protected drawnTileNode: Node = null;        // 刚摸到的牌(独立显示)

    @property({ type: Label })
    protected remainCountLabel: Label = null;    // 剩余牌数

    @property({ type: Prefab })
    protected tilePrefab: Prefab = null;         // 单张麻将牌预制体

    @property({ type: Prefab })
    protected tileBackPrefab: Prefab = null;     // 牌背预制体

    // ==================== 内部状态 ====================

    /** 自己的手牌 */
    protected myHandTiles: MahjongTile[] = [];

    /** 刚摸到的牌(未融入手牌前单独存放) */
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

    // ==================== 初始化 ====================

    onLoad(): void {
        super.onLoad();
        this.initDiscardRecords();
    }

    /** 设置麻将专属回调 */
    public setMjCallbacks(callbacks: MahjongEventCallbacks): void {
        this.mjCallbacks = { ...this.mjCallbacks, ...callbacks };
    }

    /** 初始化弃牌记录 */
    private initDiscardRecords(): void {
        const seatCount = this.getSeatCount();
        for (let i = 0; i < seatCount; i++) {
            this.discardRecords.set(i, []);
            this.meldRecords.set(i, []);
        }
    }

    // ==================== 座位覆写 ====================

    protected getSeatCount(): number {
        // 默认4人麻将，2人麻将可覆写
        return 4;
    }

    /** 获取指定座位的手牌区节点 */
    protected getHandAreaBySeat(seatIndex: number): Node {
        switch (seatIndex) {
            case 0: return this.myHandArea;
            case 1: return this.leftHandArea;
            case 2: return this.rightHandArea;
            case 3: return this.topHandArea;
            default: return null;
        }
    }

    /** 获取指定座位的弃牌区节点 */
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

    /**
     * 发牌/设置初始手牌
     * @param tiles 初始手牌列表
     */
    public dealTiles(tiles: MahjongTile[]): void {
        this.myHandTiles = [...tiles];
        this.sortHandTiles();
        this.renderMyHand();
        console.log(`[MahjongRoom] Dealt ${tiles.length} tiles`);
    }

    /**
     * 摸牌
     * @param tile 摸到的牌
     */
    public drawTile(tile: MahjongTile): void {
        this.drawnTile = tile;
        this.showDrawnTile(tile);
        this.isMyTurn = true;
        this.mjCallbacks.onDrawTile?.(tile);
        console.log(`[MahjongRoom] Drew tile: ${tile.suit}-${tile.value}`);
    }

    /**
     * 排序手牌 (按花色+数值)
     */
    protected sortHandTiles(): void {
        this.myHandTiles.sort((a, b) => {
            if (a.suit !== b.suit) return a.suit - b.suit;
            return a.value - b.value;
        });
    }

    /**
     * 渲染自己的手牌
     */
    protected renderMyHand(): void {
        if (!this.myHandArea) return;

        // 清空现有手牌UI
        this.myHandArea.removeAllChildren();

        // 创建手牌节点
        for (let i = 0; i < this.myHandTiles.length; i++) {
            const tileNode = this.createTileNode(this.myHandTiles[i], true);
            tileNode.name = `tile_${i}`;
            if (this.myHandArea) {
                tileNode.parent = this.myHandArea;
            }
            // 存储索引用于点击选择
            tileNode['_tileIndex'] = i;
        }
    }

    /**
     * 显示刚摸到的牌
     */
    protected showDrawnTile(tile: MahjongTile): void {
        if (!this.drawnTileNode) return;
        this.drawnTileNode.removeAllChildren();
        const tileNode = this.createTileNode(tile, true);
        if (this.drawnTileNode) {
            tileNode.parent = this.drawnTileNode;
        }
    }

    /**
     * 将摸到的牌融入手牌
     */
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
     * 点击手牌出牌
     * @param tileIndex 手牌索引
     */
    public selectAndDiscard(tileIndex: number): void {
        if (!this.isMyTurn || this.availableActions && !this.canDiscardDirectly()) {
            // 如果有待处理的操作(如吃碰杠胡)，不能直接出牌
            return;
        }

        const tile = this.myHandTiles[tileIndex];
        if (!tile) return;

        // 如果有刚摸的牌，先融入
        this.integrateDrawnTile();

        // 从手牌移除
        this.myHandTiles.splice(tileIndex, 1);

        // 更新手牌显示
        this.renderMyHand();

        // 发送出牌请求
        this.sendDiscard(tile);

        this.isMyTurn = false;
    }

    /** 是否可以直接出牌(无待处理操作时) */
    protected canDiscardDirectly(): boolean {
        if (!this.availableActions) return true;
        return !this.availableActions.canHu &&
               !this.availableActions.canGang &&
               !this.availableActions.canPeng &&
               !this.availableActions.canChi;
    }

    /**
     * 发送出牌到服务端
     */
    protected sendDiscard(tile: MahjongTile): void {
        // 通过 WS 发送出牌事件
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action('discard', {
            tileId: tile.tileId,
            value: tile.value,
            suit: tile.suit,
        });

        // 本地记录弃牌
        const mySeatIndex = this.getMySeatIndex();
        let discards = this.discardRecords.get(mySeatIndex) || [];
        discards.push(tile);
        this.discardRecords.set(mySeatIndex, discards);

        // 显示在弃牌区
        this.addDiscardToDisplay(mySeatIndex, tile);

        const result: DiscardResult = {
            playerId: '',  // 由外部填入
            tile,
            seatIndex: mySeatIndex,
        };
        this.mjCallbacks.onDiscard?.(result);
    }

    /** 获取自己座位索引 (子类可覆写) */
    protected getMySeatIndex(): number {
        return 0; // 默认自己是0号位
    }

    // ==================== 操作面板 (吃碰杠胡) ====================

    /**
     * 显示可用操作面板
     */
    public showActionPanel(actions: AvailableActions): void {
        this.availableActions = actions;
        if (this.actionPanel) {
            this.actionPanel.active = true;
        }
        this.renderActionButtons(actions);
    }

    /**
     * 隐藏操作面板
     */
    public hideActionPanel(): void {
        this.availableActions = null;
        if (this.actionPanel) {
            this.actionPanel.active = false;
        }
    }

    /**
     * 渲染操作按钮 (子类覆写以自定义UI样式)
     */
    protected renderActionButtons(actions: AvailableActions): void {
        console.log('[MahjongRoom] Available actions:', JSON.stringify(actions));
        // 子类应根据具体UI实现渲染按钮
        // 此处只做日志，实际按钮由编辑器绑定或子类动态创建
    }

    /**
     * 执行吃操作
     */
    public doActionChi(tiles?: MahjongTile[]): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.mjCallbacks.onMahjongAction?.(MahjongAction.Chi, tiles);
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action(MahjongAction.Chi, { tiles });
    }

    /**
     * 执行碰操作
     */
    public doActionPeng(): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.mjCallbacks.onMahjongAction?.(MahjongAction.Peng);
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action(MahjongAction.Peng, {});
    }

    /**
     * 执行杠操作
     * @param tile 杠的牌(可选，用于区分多杠情况)
     */
    public doActionGang(tile?: MahjongTile): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.mjCallbacks.onMahjongAction?.(MahjongAction.Gang, tile ? [tile] : undefined);
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action(MahjongAction.Gang, { tileId: tile?.tileId });
    }

    /**
     * 执行胡操作
     */
    public doActionHu(): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.mjCallbacks.onMahjongAction?.(MahjongAction.Hu);
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action(MahjongAction.Hu, {});
    }

    /**
     * 执行过/跳过操作
     */
    public doActionPass(): void {
        this.hideActionPanel();
        // 如果有摸到的牌，融入后标记为可出牌状态
        if (this.drawnTile) {
            this.integrateDrawnTile();
            // 过之后可以正常出牌
            this.isMyTurn = true;
        }
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action(GameTypes.Action.Pass, {});
    }

    /**
     * 执行听操作
     */
    public doActionTing(): void {
        this.hideActionPanel();
        this.isTing = true;
        this.mjCallbacks.onTingStateChanged?.(true);
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action(MahjongAction.Ting, {});
    }

    // ==================== 弃牌区更新 ====================

    /**
     * 在弃牌区添加一张牌
     */
    protected addDiscardToDisplay(seatIndex: number, tile: MahjongTile): void {
        const discardArea = this.getDiscardAreaBySeat(seatIndex);
        if (!discardArea) return;

        const tileNode = this.createTileNode(tile, false);
        tileNode.parent = discardArea;
        // 弃牌区的牌通常缩小显示
        tileNode.setScale(new Vec3(0.6, 0.6, 1));
    }

    /**
     * 处理其他玩家出牌消息
     */
    public onOtherPlayerDiscard(seatIndex: number, tile: MahjongTile): void {
        let discards = this.discardRecords.get(seatIndex) || [];
        discards.push(tile);
        this.discardRecords.set(seatIndex, discards);
        this.addDiscardToDisplay(seatIndex, tile);
    }

    // ==================== 碰杠展示 ====================

    /**
     * 展示碰牌
     */
    public showMeldPeng(seatIndex: number, tiles: MahjongTile[], fromSeat: number): void {
        let melds = this.meldRecords.get(seatIndex) || [];
        melds.push(tiles);
        this.meldRecords.set(seatIndex, melds);

        const handArea = this.getHandAreaBySeat(seatIndex);
        if (handArea) {
            // 子类应在此处实现具体的碰牌UI展示
            console.log(`[MahjongRoom] Seat ${seatIndex} peng:`, tiles.map(t => `${t.suit}-${t.value}`));
        }
    }

    /**
     * 展示杠牌(明杠/暗杠)
     */
    public showMeldGang(seatIndex: number, tiles: MahjongTile[], isConcealed: boolean): void {
        let melds = this.meldRecords.get(seatIndex) || [];
        melds.push(tiles);
        this.meldRecords.set(seatIndex, melds);
        console.log(`[MahjongRoom] Seat ${seatIndex} gang (${isConcealed ? 'concealed' : 'revealed'}):`,
            tiles.map(t => `${t.suit}-${t.value}`));
    }

    // ==================== 牌数与状态 ====================

    /**
     * 更新剩余牌数
     */
    public updateRemainingCount(count: number): void {
        this.remainingTiles = count;
        if (this.remainCountLabel) {
            this.remainCountLabel.string = String(count);
        }
    }

    /**
     * 重置一局的状态
     */
    protected resetRoundState(): void {
        this.myHandTiles = [];
        this.drawnTile = null;
        this.isMyTurn = false;
        this.isTing = false;
        this.availableActions = null;
        this.selectedTileIndex = -1;
        this.initDiscardRecords();
        this.hideActionPanel();

        // 清空所有手牌和弃牌区显示
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

    // ==================== 工具方法 ====================

    /**
     * 创建一张麻将牌节点
     * @param tile 牌数据
     * @param interactive 是否可交互(自己的牌)
     */
    protected createTileNode(tile: MahjongTile, interactive: boolean): Node {
        if (this.tilePrefab) {
            const node = instantiate(this.tilePrefab);
            // 子类应在此处根据 tile.suit/tile.value 设置牌面贴图
            return node;
        }
        // 无预制体时创建占位节点
        const node = new Node(`tile_${tile.suit}_${tile.value}`);
        node['_tileData'] = tile;
        return node;
    }

    /**
     * 创建牌背节点
     */
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
        // 麻将结算后可以查看回放或准备下一局
        return true;
    }

    protected handleFinalSettlement(data: any): boolean {
        super.handleFinalSettlement(data);
        this.resetRoundState();
        return true;
    }

    protected onAutoAction(): void {
        // 麻将超时自动行为：
        // 1. 有胡 -> 自动胡
        // 2. 有杠 -> 自动杠
        // 3. 有碰 -> 自动碰
        // 4. 出最后一张/摸到的牌
        if (this.availableActions?.canHu) {
            this.doActionHu();
        } else if (this.availableActions?.canGang) {
            this.doActionGang();
        } else if (this.availableActions?.canPeng) {
            this.doActionPeng();
        } else {
            // 自动出最后一张或摸到的牌
            if (this.drawnTile) {
                this.integrateDrawnTile();
            }
            if (this.myHandTiles.length > 0) {
                this.selectAndDiscard(this.myHandTiles.length - 1);
            }
        }
    }

    /** 清理资源 */
    protected cleanup(): void {
        super.cleanup();
        this.resetRoundState();
        this.mjCallbacks = {};
    }
}
