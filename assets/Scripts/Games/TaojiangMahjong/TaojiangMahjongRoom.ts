/**
 * 桃江麻将 (TaojiangMahjongRoom) - v2 完整版
 *
 * 桃江麻将规则：
 * - 4人麻将，108张牌（无风箭花）
 * - 可吃、可碰、可杠、可胡
 * - 醒牌系统（翻一张确定可胡目标）
 * - 番型：平胡/自摸/点炮/杠上开花/七对/碰碰胡/清一色/混一色
 *
 * 服务器协议：通过 InnerMessage 与服务端通信
 * 资源：复用 GuanDan Bundle
 */

import { _decorator, Component, Node, Label } from 'cc';
import { MahjongRoomBase, MahjongTile, AvailableActions, DiscardResult, MahjongEventCallbacks } from '../../GameCommon/MahjongRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../../GameCommon/GameTypes';
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

    protected get mjMsgPrefix(): string { return "MsgTaojiangMahjong"; }

    // ==================== 初始化 ====================

    start(): void {
        super.start();
        this.gameId = 'taojiang_mahjong';
    }

    protected getSeatCount(): number { return 4; }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        console.log('[TaojiangRoom] Initialized');
    }

    /** 同步后 UI 更新 */
    protected onSyncGameUIUpdate(isSitting: boolean): void {
        if (this.xingTileDisplay) this.xingTileDisplay.active = false;
        if (this.tingHintPanel) this.tingHintPanel.active = false;
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
        if (this.xingTileDisplay) node.parent = this.xingTileDisplay;
        node.setScale ? node.setScale(new (window as any).Vec3(1.2, 1.2, 1)) : null; // 放大显示
    }

    public canHuWithXing(tile: MahjongTile): boolean {
        if (!this.currentXingTile) return true;
        return this.currentXingTile.targetValues.includes(tile.value);
    }

    public showTingHint(tingTiles: MahjongTile[]): void {
        if (this.tingHintPanel) {
            this.tingHintPanel.active = true;
            this.tingHintPanel.removeAllChildren();
            for (const t of tingTiles) {
                const node = this.createTileNode(t, false);
                if (this.tingHintPanel) node.parent = this.tingHintPanel;
            }
        }
    }

    public hideTingHint(): void {
        if (this.tingHintPanel) this.tingHintPanel.active = false;
    }

    // ==================== 发牌与游戏流程覆写 ====================

    /**
     * 服务端发牌回调 (带可选的醒牌信息)
     */
    public onServerDeal(tiles: MahjongTile[], _xing?: XingTile): void {
        super.dealTiles(tiles);
        console.log(`[TaojiangRoom] Server dealt ${tiles.length} tiles`);
    }

    public onRequestActions(actions: AvailableActions): void {
        this.showActionPanel(actions);
        const timeout = actions.canHu ? 15 : (actions.canGang || actions.canPeng ? 10 : 8);
        super.startCountdown(timeout);
    }

    public onPlayerDiscard(_seatIndex: number, tile: MahjongTile): void {
        super.onOtherPlayerDiscord(_seatIndex, tile);
        console.log(`[TaojiangRoom] Player ${_seatIndex} discarded: ${tile.suit}-${tile.value}`);
    }

    // ==================== 结算 ====================

    public showRoundSettlement(data: TaojiangRoundSettlement): void {
        console.log(`[TaojiangRoom] Round settlement: fans=${data.totalFans} type=${data.fanType}`);
        this.updateFanDisplay(data.totalFans);
        super.handleRoundSettlement(data);
    }

    protected updateFanDisplay(fans: number): void {
        this.totalFans += fans;
        if (this.fanLabel) this.fanLabel.string = `${this.totalFans}番`;
    }

    public showFinalSettlement(data: FinalSettlementData): void {
        console.log('[TaojiangRoom] Final settlement:', data.players.map((p: any) => `${p.nickname}: ${p.totalScore}`));
        super.handleFinalSettlement(data);
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        this.currentXingTile = null;
        this.hasXingRevealed = false;
        this.hideTingHint();
        if (this.fanLabel) this.fanLabel.string = '0番';
        if (this.xingTileDisplay) this.xingTileDisplay.removeAllChildren();
    }
}
