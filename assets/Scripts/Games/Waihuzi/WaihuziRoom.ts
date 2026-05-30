/**
 * 益阳歪胡子 (WaihuziRoom) - v2 完整版
 *
 * 歪胡子规则（湖南地方字牌）：
 * - 2人对战，每人起手20张牌，共80张牌
 * - 牌组：大壹~大拾(红)、小一~小十(黑)，每种4张
 * - 操作：偎、碰、提、跑、吃、胡六种操作
 * - 吃牌组合：一二三、二七十、依十等
 * - 计分：偎1分、碰1分、提3分、跑6分、胡=总分之和
 * - 特殊和牌类型：自摸/点胡/天胡/地胡/红胡(全红)/乌胡(全黑)
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label } from 'cc';
import { ZipaiRoomBase, ZipaiTile, ZipaiRank, ZipaiSuit, ZipaiAction, ZipaiAvailableActions, MeldType, ZipaiMeld } from '../../GameCommon/ZipaiRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../../GameCommon/GameTypes';
import { NetworkManager } from '../../Manager/NetworkManager';

const { ccclass, property } = _decorator;

// ==================== 类型定义 ====================

export enum WaihuScoreUnit {
    Wei = 1, Peng = 1, Ti = 3, Pao = 6, Chi = 0, Hu = 'base',
}

export enum WaihuWinType {
    ZiMo = 'zimo', DianHu = 'dianhu', TianHu = 'tianhu',
    DiHu = 'dihu', HongHu = 'honghu', WuHu = 'wuhu',
}

export interface WaihuRoundSettlement extends RoundSettlementData {
    winType: WaihuWinType;
    meldScores: MeldType[];
    totalScore: number;
    specialBonus: string[];
}

@ccclass('WaihuziRoom')
export class WaihuziRoom extends ZipaiRoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Label, override: true })
    public scoreLabel: Label = null;

    @property({ type: Node })
    protected meldScoreArea: Node = null;

    // ==================== 内部状态 ====================

    protected myTotalScore: number = 0;
    protected meldScoreDetails: Array<{ meld: MeldType; score: number }> = [];

    // ==================== 消息前缀 ====================

    protected get zipaiMsgPrefix(): string { return "MsgWaihuzi"; }

    // ==================== 初始化 ====================

    start(): void {
        super.start();
        this.gameId = 'yiyangwaihuzi_zipai';
    }

    protected getSeatCount(): number { return 2; }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        console.log('[WaihuRoom] Initialized');
    }

    // ==================== 组合计分 ====================

    public recordMeldScore(meld: MeldType): void {
        let score = 0;
        switch (meld) {
            case MeldType.Wei: score = WaihuScoreUnit.Wei; break;
            case MeldType.Peng: score = WaihuScoreUnit.Peng; break;
            case MeldType.Ti: score = WaihuScoreUnit.Ti; break;
            case MeldType.Pao: score = WaihuScoreUnit.Pao; break;
            case MeldType.Chi: score = WaihuScoreUnit.Chi; break;
        }
        this.meldScoreDetails.push({ meld, score });
        console.log(`[WaihuRoom] Meld recorded: ${meld} = ${score}分`);
        this.renderMeldScoreDetail(meld, score);
    }

    protected renderMeldScoreDetail(_meld: MeldType, _score: number): void {
        console.log(`[WaihuRoom] Score detail: ${_meld} → ${_score}分`);
    }

    // ==================== 结算 ====================

    public showRoundSettlement(data: WaihuRoundSettlement): void {
        console.log(`[WaihuRoom] Round: type=${data.winType} score=${data.totalScore} bonus=[${data.specialBonus.join(',')}]`);

        const myResult = data.players.find(() => true);
        if (myResult) this.updateScore(myResult.score);

        super.handleRoundSettlement(data);
    }

    protected updateScore(delta: number): void {
        this.myTotalScore += delta;
        if (this.scoreLabel) this.scoreLabel.string = String(this.myTotalScore);
    }

    public showFinalSettlement(data: FinalSettlementData): void {
        super.handleFinalSettlement(data);
    }

    // ==================== 大贰特殊处理 ====================

    static isDaEr(tile: ZipaiTile): boolean {
        return tile.rank === ZipaiRank.DaEr && tile.suit === ZipaiSuit.Red;
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        this.meldScoreDetails = [];
    }
}
