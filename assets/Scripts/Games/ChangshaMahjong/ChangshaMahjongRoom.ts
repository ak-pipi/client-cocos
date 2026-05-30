/**
 * 长沙麻将 (ChangshaMahjongRoom) - v2 完整版
 *
 * 长沙沙麻将规则：
 * - 4人麻将，可以吃碰杠胡
 * - "二五八"做将（必须258做将牌）
 * - 番型：平胡/自摸/将将胡/七小对/碰碰胡/豪华七对/清一色/混一色
 * - 扎鸟玩法（最后一张牌额外计分）
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label } from 'cc';
import { MahjongRoomBase, MahjongTile, AvailableActions, MahjongEventCallbacks } from '../../GameCommon/MahjongRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../../GameCommon/GameTypes';
import { NetworkManager } from '../../Manager/NetworkManager';

const { ccclass, property } = _decorator;

// ==================== 类型定义 ====================

export enum ChangshaFanType {
    PingHu = 'pinghu', ZiMo = 'zimo', JiangJiangHu = 'jiangjiang',
    QiXiaoDui = 'qixiaodui', PengPengHu = 'pengpeng',
    HaoHua = 'haohua', QingYise = 'qingyise',
    HunYise = 'hunyise', ZhaNiao = 'zhaniao',
}

export interface ZhaNiaoResult {
    niaoTiles: MahjongTile[];
    hitCount: number;
    extraScore: number;
}

export interface ChangshaRoundSettlement extends RoundSettlementData {
    fanTypes: ChangshaFanType[];
    zhaNiao?: ZhaNiaoResult;
    totalScore: number;
    jiangRequired: boolean;
}

@ccclass('ChangshaMahjongRoom')
export class ChangshaMahjongRoom extends MahjongRoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected niaoDisplayArea: Node = null;

    @property({ type: Label })
    public scoreLabel: Label = null;

    // ==================== 内部状态 ====================

    protected myScore: number = 0;
    protected requireJiang258: boolean = true;

    static readonly JIANG_VALUES = [2, 5, 8];

    // ==================== 消息前缀 ====================

    protected get mjMsgPrefix(): string { return "MsgChangshaMahjong"; }

    // ==================== 初始化 ====================

    start(): void {
        super.start();
        this.gameId = 'changsha_mahjong';
    }

    protected getSeatCount(): number { return 4; }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        this.requireJiang258 = roomInfo.ruleConfig?.requireJiang258 !== false;
    }

    // ==================== 工具方法 ====================

    static isJiangValue(value: number): boolean {
        return ChangshaMahjongRoom.JIANG_VALUES.includes(value);
    }

    // ==================== 扎鸟系统 ====================

    public showRoundSettlement(data: ChangshaRoundSettlement): void {
        console.log(`[ChangshaRoom] Round: fans=${data.fanTypes.join(',')} score=${data.totalScore}`);

        if (data.zhaNiao) this.renderZhaNiao(data.zhaNiao);

        const myResult = data.players.find(() => true);
        if (myResult) this.updateScore(myResult.score);

        super.handleRoundSettlement(data);
    }

    protected renderZhaNiao(niao: ZhaNiaoResult): void {
        if (!this.niaoDisplayArea) return;
        this.niaoDisplayArea.removeAllChildren();
        for (const tile of niao.niaoTiles) {
            const node = this.createTileNode(tile, false);
            if (this.niaoDisplayArea) node.parent = this.niaoDisplayArea;
        }
        console.log(`[ChangshaRoom] Zha niao: ${nioa.hitCount}/${nioa.niaoTiles.length}`);
    }

    protected updateScore(delta: number): void {
        this.myScore += delta;
        if (this.scoreLabel) this.scoreLabel.label = String(this.myScore);
    }

    public showFinalSettlement(data: FinalSettlementData): void {
        super.handleFinalSettlement(data);
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        if (this.niaoDisplayArea) this.niaoDisplayArea.removeAllChildren();
    }
}
