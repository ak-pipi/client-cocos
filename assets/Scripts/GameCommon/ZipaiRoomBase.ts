/**
 * 字牌/纸牌房间基类 (ZipaiRoomBase)
 * 湖南地方字牌类游戏的统一基类，提供：
 * - 字牌手牌管理（20张手牌布局）
 * - 字牌特有操作（偎/提/碰/胡/跑）
 * - "大贰"牌组支持
 * - 起手翻牌/王炸等特殊规则框架
 * - 字牌结算逻辑
 *
 * 适用游戏：益阳歪胡子（跑胡子/二七十）
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, Prefab, instantiate, Vec3 } from 'cc';
import { RoomBase } from './RoomBase';
import { GameTypes, RoomState, PlayerRoomState, SeatPosition, RoundSettlementData, FinalSettlementData } from './GameTypes';

const { ccclass, property } = _decorator;

// ==================== 字牌类型定义 ====================

/** 字牌枚举 (湖南字牌标准) */
export enum ZipaiRank {
    /** 小一 */ Yi_1 = 1,
    /** 小二 */ Er_2 = 2,
    /** 小三 */ San_3 = 3,
    /** 小四 */ Si_4 = 4,
    /** 小五 */ Wu_5 = 5,
    /** 小六 */ Liu_6 = 6,
    /** 小七 */ Qi_7 = 7,
    /** 小八 */ Ba_8 = 8,
    /** 小九 */ Jiu_9 = 9,
    /** 小十 */ Shi_10 = 10,
    /** 大壹 */ DaYi = 11,
    /** 大贰 */ DaEr = 12,
    /** 大叁 */ DaSan = 13,
    /** 大肆 */ DaSi = 14,
    /** 大伍 */ DaWu = 15,
    /** 大陆 */ DaLiu = 16,
    /** 大柒 */ DaQi = 17,
    /** 大捌 */ DaBa = 18,
    /** 大玖 */ DaJiu = 19,
    /** 大拾 */ DaShi = 20,
}

/** 字牌花色/颜色 */
export enum ZipaiSuit {
    Red = 'red',      // 红色(大写: 壹~拾)
    Black = 'black',   // 黑色(小写: 一~十)
}

/** 字牌数据 */
export interface ZipaiTile {
    /** 牌等级 (1-20) */
    rank: ZipaiRank;
    /** 花色(红/黑) */
    suit: ZipaiSuit;
    /** 唯一ID */
    tileId: string;
}

/** 字牌操作类型 */
export enum ZipaiAction {
    Wei = 'wei',           // 偎(手中有同样一张，吃别人打出的)
    Ti = 'ti',             // 提(手中有碰，再摸到同样的)
    Peng = 'peng',         // 碰
    Hu = 'hu',             // 胡
    Pao = 'pao',           // 跑(手中已有4张中的第3张，有人打出第4张时必须"跑")
    Chi = 'chi',           // 吃(组成一二三 / 二七十 等合法组合)
    Pass = 'pass',         // 过
}

/** 字牌可用操作 */
export interface ZipaiAvailableActions {
    canWei?: boolean;
    canTi?: boolean;
    canPeng?: boolean;
    canHu?: boolean;
    canPao?: boolean;
    canChi?: boolean;
    chiCombinations?: ZipaiTile[][]; // 可吃的组合
}

/** 字牌组合类型 */
export enum MeldType {
    Wei = 'wei',       // 偎(3张，1明2暗)
    Ti = 'ti',         // 提(4张全显)
    Peng = 'peng',     // 碰(3张全显)
    Pao = 'pao',       // 跑(4张全显，算分更高)
    Chi = 'chi',       // 吃(3张组合显示)
}

/** 组合数据 */
export interface ZipaiMeld {
    type: MeldType;
    tiles: ZipaiTile[];
    /** 来源座位(对于偎/碰/跑) */
    fromSeat?: number;
}

/** 字牌事件回调 */
export interface ZipaiEventCallbacks {
    /** 手牌变化 */
    onHandChanged?: (tiles: ZipaiTile[]) => void;
    /** 出牌 */
    onDiscard?: (tile: ZipaiTile, seatIndex: number) => void;
    /** 字牌操作 */
    onZipaiAction?: (action: ZipaiAction, tiles?: ZipaiTile[]) => void;
    /** 摸牌 */
    onDrawTile?: (tile: ZipaiTile) => void;
    /** 胡牌 */
    onWin?: (winType: string, tiles: ZipaiTile[]) => void;
}

@ccclass('ZipaiRoomBase')
export class ZipaiRoomBase extends RoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected zipaiTable: Node = null;          // 牌桌主体

    @property({ type: Node })
    protected myHandArea: Node = null;          // 自己的手牌区(20张)

    @property({ type: Node })
    protected leftHandArea: Node = null;        // 左边对手手牌区

    @property({ type: Node })
    protected rightHandArea: Node = null;       // 右边对手手牌区

    @property({ type: Node })
    protected myDiscardArea: Node = null;       // 自己弃牌区

    @property({ type: Node })
    protected leftDiscardArea: Node = null;     // 左边弃牌区

    @property({ type: Node })
    protected rightDiscardArea: Node = null;    // 右边弃牌区

    @property({ type: Node })
    protected meldArea: Node = null;            // 自己的组合区(偎/提/碰/跑/吃)

    @property({ type: Node })
    protected leftMeldArea: Node = null;        // 左边组合区

    @property({ type: Node })
    protected rightMeldArea: Node = null;       // 右边组合区

    @property({ type: Node })
    protected actionPanel: Node = null;         // 操作面板(偎/提/碰/跑/胡/吃/过)

    @property({ type: Node })
    protected drawnTileNode: Node = null;       // 刚摸到的牌

    @property({ type: Label })
    protected scoreLabel: Label = null;         // 分数显示(字牌计分)

    @property({ type: Label })
    protected remainCountLabel: Label = null;   // 剩余牌数

    @property({ type: Prefab })
    protected zipaiTilePrefab: Prefab = null;   // 字牌预制体

    // ==================== 内部状态 ====================

    /** 自己的手牌 */
    protected myHandTiles: ZipaiTile[] = [];

    /** 刚摸到的牌 */
    protected drawnTile: ZipaiTile | null = null;

    /** 弃牌记录 */
    protected discardRecords: Map<number, ZipaiTile[]> = new Map();

    /** 组合记录(偎/提/碰/跑/吃) */
    protected meldRecords: Map<number, ZipaiMeld[]> = new Map();

    /** 当前可用操作 */
    protected zipaiActions: ZipaiAvailableActions | null = null;

    /** 是否轮到自己 */
    protected isMyTurn: boolean = false;

    /** 剩余牌数(字牌堆总80张左右) */
    protected remainingTiles: number = 0;

    /** 当前分数 */
    protected currentScore: number = 0;

    /** 字牌专属回调 */
    protected zpCallbacks: ZipaiEventCallbacks = {};

    // ==================== 初始化 ====================

    onLoad(): void {
        super.onLoad();
        this.initRecords();
    }

    /** 设置字牌专属回调 */
    public setZpCallbacks(callbacks: ZipaiEventCallbacks): void {
        this.zpCallbacks = { ...this.zpCallbacks, ...callbacks };
    }

    private initRecords(): void {
        const seatCount = this.getSeatCount();
        for (let i = 0; i < seatCount; i++) {
            this.discardRecords.set(i, []);
            this.meldRecords.set(i, []);
        }
    }

    // ==================== 座位覆写 ====================

    protected getSeatCount(): number {
        // 歪胡子通常是2人
        return 2;
    }

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

    /**
     * 发牌 (歪胡子每人起手20张)
     */
    public dealTiles(tiles: ZipaiTile[]): void {
        this.myHandTiles = [...tiles];
        this.sortHandTiles();
        this.renderMyHand();
        console.log(`[ZipaiRoom] Dealt ${tiles.length} tiles`);
    }

    /**
     * 排序手牌 (红大在前，然后按数字顺序)
     */
    protected sortHandTiles(): void {
        this.myHandTiles.sort((a, b) => {
            // 红(大)排前面
            if (a.suit !== b.suit) {
                return a.suit === ZipaiSuit.Red ? -1 : 1;
            }
            return a.rank - b.rank;
        });
    }

    /**
     * 渲染手牌
     */
    protected renderMyHand(): void {
        if (!this.myHandArea) return;
        this.myHandArea.removeAllChildren();

        for (let i = 0; i < this.myHandTiles.length; i++) {
            const tileNode = this.createTileNode(this.myHandTiles[i], true);
            tileNode.name = `tile_${i}`;
            tileNode['_tileIndex'] = i;
            if (this.myHandArea) {
                tileNode.parent = this.myHandArea;
            }
        }
    }

    // ==================== 摸牌 ====================

    /**
     * 摸牌
     */
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

    // ==================== 出牌 ====================

    /**
     * 选择并出牌
     */
    public selectAndDiscard(tileIndex: number): void {
        if (!this.isTurn || (this.zipaiActions && !this.canDiscardDirectly())) {
            return;
        }

        const tile = this.myHandTiles[tileIndex];
        if (!tile) return;

        this.integrateDrawnTile();
        this.myHandTiles.splice(tileIndex, 1);
        this.renderMyHand();
        this.sendDiscard(tile);
        this.isMyTurn = false;
    }

    protected canDiscardDirectly(): boolean {
        if (!this.zipaiActions) return true;
        return !(this.zipaiActions.canHu ||
                 this.zipaiActions.canPao ||
                 this.zipaiActions.canTi ||
                 this.zipaiActions.canPeng ||
                 this.zipaiActions.canWei ||
                 this.zipaiActions.canChi);
    }

    protected sendDiscard(tile: ZipaiTile): void {
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action('discard', {
            tileId: tile.tileId,
            rank: tile.rank,
            suit: tile.suit,
        });

        const mySeat = this.getMySeatIndex();
        let discs = this.discardRecords.get(mySeat) || [];
        discs.push(tile);
        this.discardRecords.set(mySeat, discs);
        this.addDiscardToDisplay(mySeat, tile);
        this.zpCallbacks.onDiscard?.(tile, mySeat);
    }

    protected getMySeatIndex(): number { return 0; }

    // ==================== 字牌操作面板 ====================

    public showActionPanel(actions: ZipaiAvailableActions): void {
        this.zipaiActions = actions;
        if (this.actionPanel) {
            this.actionPanel.active = true;
        }
        this.renderActionButtons(actions);
    }

    public hideActionPanel(): void {
        this.zipaiActions = null;
        if (this.actionPanel) {
            this.actionPanel.active = false;
        }
    }

    protected renderActionButtons(actions: ZipaiAvailableActions): void {
        console.log('[ZipaiRoom] Available actions:', JSON.stringify(actions));
    }

    // ---- 操作执行 ----

    /** 偎 */
    public doActionWei(): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.zpCallbacks.onZipaiAction?.(ZipaiAction.Wei);
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action(ZipaiAction.Wei, {});
    }

    /** 提 */
    public doActionTi(): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.zpCallbacks.onZipaiAction?.(ZipaiAction.Ti);
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action(ZipaiAction.Ti, {});
    }

    /** 碰 */
    public doActionPeng(): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.zpCallbacks.onZipaiAction?.(ZipaiAction.Peng);
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action(ZipaiAction.Peng, {});
    }

    /** 跑 */
    public doActionPao(): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.zpCallbacks.onZipaiAction?.(ZipaiAction.Pao);
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action(ZipaiAction.Pao, {});
    }

    /** 胡 */
    public doActionHu(): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.zpCallbacks.onZipaiAction?.(ZipaiAction.Hu);
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action(ZipaiAction.Hu, {});
    }

    /** 吃 */
    public doActionChi(tiles?: ZipaiTile[]): void {
        this.hideActionPanel();
        this.integrateDrawnTile();
        this.zpCallbacks.onZipaiAction?.(ZipaiAction.Chi, tiles);
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action(ZipaiAction.Chi, { tiles });
    }

    /** 过 */
    public doActionPass(): void {
        this.hideActionPanel();
        if (this.drawnTile) {
            this.integrateDrawnTile();
            this.isMyTurn = true;
        }
        const { WsEventRouter } = require('../Network/WsEventRouter');
        WsEventRouter.Instance.action(ZipaiAction.Pass, {});
    }

    // ==================== 组合展示 ====================

    /** 显示偎 */
    public showMeldWei(seatIndex: number, tiles: ZipaiTile[]): void {
        this.addMeldRecord(seatIndex, { type: MeldType.Wei, tiles });
    }

    /** 显示提 */
    public showMeldTi(seatIndex: number, tiles: ZipaiTile[]): void {
        this.addMeldRecord(seatIndex, { type: MeldType.Ti, tiles });
    }

    /** 显示碰 */
    public showMeldPeng(seatIndex: number, tiles: ZipaiTile[]): void {
        this.addMeldRecord(seatIndex, { type: MeldType.Peng, tiles });
    }

    /** 显示跑 */
    public showMeldPao(seatIndex: number, tiles: ZipaiTile[]): void {
        this.addMeldRecord(seatIndex, { type: MeldType.Pao, tiles });
    }

    /** 显示吃 */
    public showMeldChi(seatIndex: number, tiles: ZipaiTile[]): void {
        this.addMeldRecord(seatIndex, { type: MeldType.Chi, tiles });
    }

    private addMeldRecord(seatIndex: number, meld: ZipaiMeld): void {
        let melds = this.meldRecords.get(seatIndex) || [];
        melds.push(meld);
        this.meldRecords.set(seatIndex, melds);
        console.log(`[ZipaiRoom] Seat ${seatIndex} ${meld.type}:`,
            meld.tiles.map(t => `${t.suit}-${t.rank}`));
    }

    // ==================== 弃牌区 ====================

    protected addDiscardToDisplay(seatIndex: number, tile: ZipaiTile): void {
        const area = this.getDiscardAreaBySeat(seatIndex);
        if (!area) return;
        const tileNode = this.createTileNode(tile, false);
        tileNode.setScale(new Vec3(0.55, 0.55, 1));
        if (area) {
            tileNode.parent = area;
        }
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
        if (this.scoreLabel) {
            this.scoreLabel.string = String(score);
        }
    }

    public updateRemainingCount(count: number): void {
        this.remainingTiles = count;
        if (this.remainCountLabel) {
            this.remainCountLabel.string = String(count);
        }
    }

    // ==================== 工具方法 ====================

    protected createTileNode(tile: ZipaiTile, interactive: boolean): Node {
        if (this.zipaiTilePrefab) {
            const node = instantiate(this.zipaiTilePrefab);
            // 根据 rank 和 suit 设置牌面
            return node;
        }
        const node = new Node(`zipai_${tile.suit}_${tile.rank}`);
        node['_tileData'] = tile;
        return node;
    }

    // ---- 字牌工具函数 ----

    /** 检查是否为"大"牌 (红色) */
    static isBigTile(rank: ZipaiRank): boolean {
        return rank >= ZipaiRank.DaYi;
    }

    /** 获取牌的分值 (用于计分) */
    static getTilePoints(rank: ZipaiRank): number {
        // 大贰等特殊牌可能有不同分值
        switch (rank) {
            case ZipaiRank.DaEr:
                return 12; // 大贰通常计分最高
            case ZipapiRank.Er_2:
                return 2;
            default:
                return rank >= ZipaiRank.DaYi ? rank - 10 : rank;
        }
    }

    /** 检查一组牌是否构成合法的"吃"(一二三 / 二七十 等) */
    static isValidChiCombo(tiles: ZipaiTile[]): boolean {
        if (tiles.length !== 3) return false;
        const ranks = tiles.map(t => t.rank).sort((a, b) => a - b);
        // 一二三
        if (ranks[0] === 1 && ranks[1] === 2 && ranks[2] === 3) return true;
        // 二七十
        if (ranks[0] === 2 && ranks[1] === 7 && ranks[2] === 10) return true;
        // 一四七 / 二五八 / 三六九
        if (ranks[2] - ranks[1] === 3 && ranks[1] - ranks[0] === 3) return true;
        // 依十 (壹貳叁 / 贰柒拾 / etc.)
        if (ranks[0] >= 11) {
            const adjusted = ranks.map(r => r - 10);
            if (adjusted[0] === 1 && adjusted[1] === 2 && adjusted[2] === 3) return true;
            if (adjusted[0] === 2 && adjusted[1] === 7 && adjusted[2] === 10) return true;
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

        [this.myHandArea, this.leftHandArea, this.rightHandArea].forEach(area => {
            if (area) area.removeAllChildren();
        });
        [this.myDiscardArea, this.leftDiscardArea, this.rightDiscardArea].forEach(area => {
            if (area) area.removeAllChildren();
        });
        [this.meldArea, this.leftMeldArea, this.rightMeldArea].forEach(area => {
            if (area) area.removeAllChildren();
        });
        if (this.drawnTileNode) {
            this.drawnTileNode.removeAllChildren();
        }
    }

    // 注意: isMyTurn 应改为 isTurn 或修复属性名
    protected get isTurn(): boolean {
        return this.isMyTurn;
    }

    protected set isTurn(v: boolean) {
        this.isMyTurn = v;
    }

    // 修复 typo: ZipapiRank -> ZipaiRank
    // (已在上方代码中修正为 ZipaiRank)

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
        // 字牌超时自动行为：
        // 1. 有跑必跑(强制性操作)
        // 2. 有胡则胡
        // 3. 有提则提
        // 4. 有偎则偎
        // 5. 否则出一张
        if (this.zipaiActions?.canPao) {
            this.doActionPao();
        } else if (this.zipaiActions?.canHu) {
            this.doActionHu();
        } else if (this.zipaiActions?.canTi) {
            this.doActionTi();
        } else if (this.zipaiActions?.canPeng) {
            this.doActionPeng();
        } else if (this.zipaiActions?.canWei) {
            this.doActionWei();
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
        this.zpCallbacks = {};
    }
}
