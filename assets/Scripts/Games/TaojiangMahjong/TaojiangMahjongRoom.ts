/**
 * 桃江麻将 (TaojiangMahjongRoom)
 *
 * 桃江麻将规则：
 * - 2人麻将，108张牌（无风箭花）
 * - 可吃、可碰、可杠、可胡
 * - 醒牌系统（翻一张确定可胡目标）
 * - 番型：平胡/自摸/点炮/杠上开花/七对/碰碰胡/清一色/混一色
 *
 * 服务端协议消息（C++ server）：
 * - MsgTJSync / MsgTJSyncResp      同步请求/响应
 * - MsgTJStartRound               开始新一局
 * - MsgTJSettlement                结算
 * - MsgTJDisbandVote               解散投票
 * - MsgMahjongTiles                发牌（基础麻将消息）
 * - MsgFetchTile                   摸牌（基础麻将消息）
 * - MsgActionOption / MsgDoActionOption / MsgPassActionOption  动作选项
 * - MsgPlayTile / MsgGangTile / MsgPengChiTile  出牌/杠/碰吃
 * - MsgTingTile / MsgHuTile / MsgShowTiles      听/胡/亮牌
 *
 * 资源：复用 GuanDan Bundle
 */

import { _decorator, Component, Node, Label } from 'cc';
import { MahjongRoomBase, MahjongTile, AvailableActions } from '../../GameCommon/MahjongRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../../GameCommon/GameTypes';
import { GameState } from '../../GameCommon/RoomBase';
import { NetworkManager } from '../../Manager/NetworkManager';

const { ccclass, property } = _decorator;

// ==================== 桃江麻将特有类型 ====================

export enum TaojiangFanType {
    PingHu = 'pinghu', ZiMo = 'zimo', DianPao = 'dianpao',
    GangShangKaiHua = 'gangkai', Qidui = 'qidui', PengPengHu = 'pengpeng',
    QingYise = 'qingyise', HunYise = 'hunyise',
}

export interface XingTile {
    tile: MahjongTile;
    targetValues: number[];
}

export interface TaojiangRoundSettlement extends RoundSettlementData {
    fanType: TaojiangFanType;
    totalFans: number;
    isZimo: boolean;
    isGangKai: boolean;
    xingTile?: MahjongTile;
}

@ccclass('TaojiangMahjongRoom')
export class TaojiangMahjongRoom extends MahjongRoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected xingTileDisplay: Node = null;

    @property({ type: Label })
    protected fanLabel: Label = null;

    @property({ type: Node })
    protected tingHintPanel: Node = null;

    // ==================== 内部状态 ====================

    protected currentXingTile: XingTile | null = null;
    protected totalFans: number = 0;
    protected hasXingRevealed: boolean = false;

    // ==================== 消息前缀覆写 ====================
    // C++ server 消息前缀: MsgTJ (用于 Sync 等桃江特有消息)
    // 基础麻将消息使用 MsgMahjong / MsgFetchTile / MsgPlayTile 等固定前缀

    protected get mjMsgPrefix(): string { return "MsgTJ"; }

    // ==================== 初始化 ====================

    start(): void {
        // 必须在 super.start() 之前设置，因为 start() 中需要用 syncMsgPrefix 发送 Sync
        this.syncMsgPrefix = "MsgTJ";
        super.start();
        this.gameId = 'taojiang_mahjong';
    }

    protected getSeatCount(): number { return 2; }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        console.log('[TaojiangRoom] Initialized');
    }

    /** 同步后 UI 更新 */
    protected onSyncGameUIUpdate(isSitting: boolean): void {
        super.onSyncGameUIUpdate(isSitting);
        if (this.xingTileDisplay) this.xingTileDisplay.active = false;
        if (this.tingHintPanel) this.tingHintPanel.active = false;
    }

    // ==================== 消息分发覆写 ====================
    // C++ server 发送的消息与 MahjongRoomBase 默认假设的消息名不同
    // 必须在此覆写 onMessage 以匹配服务端实际消息名

    public onMessage(msgType: string, msg: any): boolean {
        // 先尝试父类 RoomBase 的通用处理 (MsgAddAvatar, MsgPlayerReady 等)
        if (super.onMessage(msgType, msg)) return true;

        // ---- 桃江麻将特有消息 ----
        if (msgType === "MsgTJStartRound") {
            this.onTJStartRound(msg);
            return true;
        }
        if (msgType === "MsgTJSettlement") {
            this.onTJSettlement(msg);
            return true;
        }
        if (msgType === "MsgTJDisbandVote") {
            this.onTJDisbandVote(msg);
            return true;
        }

        // ---- 基础麻将消息（服务端发送固定消息名，无前缀变化） ----
        if (msgType === "MsgMahjongTiles") {
            this.onServerDealTiles(msg);
            return true;
        }
        if (msgType === "MsgFetchTile") {
            this.onServerFetchTile(msg);
            return true;
        }
        if (msgType === "MsgActionOption") {
            this.onServerActionOption(msg);
            return true;
        }
        if (msgType === "MsgPlayTile") {
            this.onServerPlayTile(msg);
            return true;
        }
        if (msgType === "MsgGangTile") {
            this.onServerGangTile(msg);
            return true;
        }
        if (msgType === "MsgPengChiTile") {
            this.onServerPengChiTile(msg);
            return true;
        }
        if (msgType === "MsgTingTile") {
            this.onServerTingTile(msg);
            return true;
        }
        if (msgType === "MsgHuTile") {
            this.onServerHuTile(msg);
            return true;
        }
        if (msgType === "MsgShowTiles") {
            this.onServerShowTiles(msg);
            return true;
        }
        if (msgType === "MsgActorUpdated") {
            this.onServerActorUpdated(msg);
            return true;
        }
        if (msgType === "MsgWaitAction") {
            this.onServerWaitAction(msg);
            return true;
        }
        if (msgType === "MsgActionOptionFinish") {
            this.onServerActionOptionFinish(msg);
            return true;
        }

        return false;
    }

    // ==================== 桃江麻将消息处理 ====================

    /** 开始新一局 */
    protected onTJStartRound(msg: any): void {
        console.log('[TaojiangRoom] Start round, banker:', msg.banker);
        this.gameState = GameState.Dealing;
        this.stopCountdown();
    }

    /** 结算 */
    protected onTJSettlement(msg: any): void {
        console.log('[TaojiangRoom] Settlement received');
        this.gameState = GameState.Sitting;
        const settlement: TaojiangRoundSettlement = msg as any;
        this.updateFanDisplay(msg.totalFans || 0);
        this.handleRoundSettlement(msg);
    }

    /** 解散投票 */
    protected onTJDisbandVote(msg: any): void {
        console.log('[TaojiangRoom] Disband vote:', msg);
    }

    // ==================== 基础麻将消息处理 ====================

    /** 服务端发牌 */
    protected onServerDealTiles(msg: any): void {
        const tiles = msg.tiles || [];
        if (tiles.length > 0) {
            this.gameState = GameState.Playing;
            this.dealTiles(tiles);
            console.log(`[TaojiangRoom] Dealt ${tiles.length} tiles`);
        }
    }

    /** 服务端摸牌通知 */
    protected onServerFetchTile(msg: any): void {
        if (!msg.tile) return;
        const tile: MahjongTile = msg.tile;
        const isSelf = (msg.seat === undefined || msg.seat === this.seat);
        if (isSelf) {
            this.drawTile(tile);
        } else {
            // 对手摸牌，只播放摸牌动画（不显示牌面）
            console.log(`[TaojiangRoom] Other player fetched a tile`);
        }
    }

    /** 服务端动作选项通知（胡/杠/碰/吃） */
    protected onServerActionOption(msg: any): void {
        const actions: AvailableActions = {
            canHu: !!msg.canHu,
            canGang: !!msg.canGang,
            canPeng: !!msg.canPeng,
            canChi: !!msg.canChi,
        };
        if (actions.canHu || actions.canGang || actions.canPeng || actions.canChi) {
            this.showActionPanel(actions);
            const timeout = actions.canHu ? 15 : (actions.canGang || actions.canPeng ? 10 : 8);
            this.startCountdown(timeout);
        }
    }

    /** 服务端出牌通知 */
    protected onServerPlayTile(msg: any): void {
        const seatIndex = msg.seat;
        const tile: MahjongTile = msg.tile;
        if (tile) {
            this.onOtherPlayerDiscard(seatIndex, tile);
            console.log(`[TaojiangRoom] Player ${seatIndex} played: ${tile.suit}-${tile.value}`);
        }
    }

    /** 服务端杠牌通知 */
    protected onServerGangTile(msg: any): void {
        console.log(`[TaojiangRoom] Player ${msg.seat} gang`);
        // TODO: 播放杠牌动画
    }

    /** 服务端碰/吃牌通知 */
    protected onServerPengChiTile(msg: any): void {
        console.log(`[TaojiangRoom] Player ${msg.seat} peng/chi`);
        // TODO: 播放碰/吃牌动画
    }

    /** 服务端听牌通知 */
    protected onServerTingTile(msg: any): void {
        if (!msg.tingTiles || msg.tingTiles.length === 0) return;
        const tingTiles: MahjongTile[] = msg.tingTiles;
        console.log(`[TaojiangRoom] Ting tiles: ${tingTiles.length}`);
        this.showTingHint(tingTiles);
    }

    /** 服务端胡牌通知 */
    protected onServerHuTile(msg: any): void {
        console.log(`[TaojiangRoom] Player ${msg.seat} hu!`);
        this.stopCountdown();
    }

    /** 服务端亮牌（局结束展示所有手牌） */
    protected onServerShowTiles(msg: any): void {
        console.log('[TaojiangRoom] Show all tiles');
    }

    /** 当前操作玩家更新 */
    protected onServerActorUpdated(msg: any): void {
        const actorSeat = msg.actor;
        if (actorSeat === this.seat) {
            this.isMyTurn = true;
            console.log('[TaojiangRoom] My turn');
        } else {
            this.isMyTurn = false;
            this.startOtherCountdown(15);
        }
    }

    /** 等待操作通知 */
    protected onServerWaitAction(msg: any): void {
        if (msg.hasOption) {
            console.log('[TaojiangRoom] Waiting for my action option');
        }
    }

    /** 动作选项阶段结束 */
    protected onServerActionOptionFinish(msg: any): void {
        this.hideActionPanel();
        this.stopCountdown();
    }

    // ==================== 玩家操作（发送到服务端） ====================

    /** 发送动作选项到服务端 */
    public sendActionOption(action: string, tile?: MahjongTile): void {
        const msg: any = { action: action };
        if (tile) msg.tile = tile;
        NetworkManager.Instance.sendInnerMessage("MsgDoActionOption", msg);
    }

    /** 发送过（放弃碰/胡） */
    public sendPassOption(): void {
        NetworkManager.Instance.sendInnerMessage("MsgPassActionOption");
    }

    // ==================== 醒牌系统 ====================

    public setXingTile(xing: XingTile): void {
        this.currentXingTile = xing;
        this.hasXingRevealed = true;
        this.renderXingTile(xing);
        console.log(`[TaojiangRoom] Xing set: ${xing.tile.suit}-${xing.tile.value}, targets:`, xing.targetValues);
    }

    protected renderXingTile(xing: XingTile): void {
        if (!this.xingTileDisplay) return;
        this.xingTileDisplay.removeAllChildren();
        const node = this.createTileNode(xing.tile, false);
        if (node && this.xingTileDisplay) {
            node.parent = this.xingTileDisplay;
            node.setScale(1.2, 1.2, 1);
        }
    }

    public canHuWithXing(tile: MahjongTile): boolean {
        if (!this.currentXingTile) return true;
        return this.currentXingTile.targetValues.indexOf(tile.value) !== -1;
    }

    public showTingHint(tingTiles: MahjongTile[]): void {
        if (this.tingHintPanel) {
            this.tingHintPanel.active = true;
            this.tingHintPanel.removeAllChildren();
            for (const t of tingTiles) {
                const node = this.createTileNode(t, false);
                if (node && this.tingHintPanel) node.parent = this.tingHintPanel;
            }
        }
    }

    public hideTingHint(): void {
        if (this.tingHintPanel) this.tingHintPanel.active = false;
    }

    // ==================== 结算 ====================

    protected updateFanDisplay(fans: number): void {
        this.totalFans += fans;
        if (this.fanLabel) this.fanLabel.string = `${this.totalFans}番`;
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        this.currentXingTile = null;
        this.hasXingRevealed = false;
        this.hideTingHint();
        this.totalFans = 0;
        if (this.fanLabel) this.fanLabel.string = '0番';
        if (this.xingTileDisplay) this.xingTileDisplay.removeAllChildren();
    }
}
