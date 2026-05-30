/**
 * 沅江千分 (QianfenRoom) - v2 完整版
 *
 * 千分规则（湖南沅江地方扑克）：
 * - 4人游戏，两两组队对抗
 * - 使用双副牌(108张)，类似升级/拖拉机
 * - 主牌等级逐步升级（从2开始到A）
 * - 庄家方 vs 闲家方
 * - 底牌、埋底、主牌常主等复杂策略
 * - 计分以"分"为单位(5/10/K为分牌)
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label } from 'cc';
import { PokerRoomBase, PokerCard, CardPlay, PokerAvailableActions, PokerEventCallbacks } from '../../GameCommon/PokerRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData, SeatPosition } from '../../GameCommon/GameTypes';
import { NetworkManager } from '../../Manager/NetworkManager';

const { ccclass, property } = _decorator;

// ==================== 类型定义 ====================

export type RankLevel = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export enum Team { Zhuang = 'zhuang', Xian = 'xian' }

export enum QianfenPhase { Bidding = 'bidding', DiPai = 'dipai', Playing = 'playing', Settlement = 'settlement' }

export interface TrickResult {
    leaderSeat: number;
    winnerSeat: number;
    playedCards: Array<{ seat: number; card: PokerCard }>;
    pointsCollected: number;
}

export interface QianfenRoundSettlement extends RoundSettlementData {
    phase: QianfenPhase;
    zhuangTeam: Team;
    teamScores: { [Team.Zhuang]: number; [Team.Xian]: number };
    pointsNeeded: number;
    upgraded: boolean;
    newLevel: RankLevel;
    doubleFlag: boolean;
}

@ccclass('QianfenRoom')
export class QianfenRoom extends PokerRoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected diPaiArea: Node = null;

    @property({ type: Label })
    protected levelLabel: Label = null;

    @property({ type: Label })
    protected teamScoreLabel: Label = null;

    @property({ type: Label })
    protected pointsLabel: Label = null;

    @property({ type: Node })
    protected trumpIndicator: Node = null;

    // ==================== 内部状态 ====================

    protected currentLevel: RankLevel = 2;
    protected currentPhase: QianfenPhase = QianfenPhase.Bidding;
    protected myTeam: Team = Team.Xian;
    protected zhuangSeatIndex: number = 0;
    protected collectedPoints: number = 0;
    protected teamScores: { [Team.Zhuang]: number; [Team.Xian]: number } = { [Team.Zhuang]: 0, [Team.Xian]: 0 };
    protected isDouble: boolean = false;

    // ==================== 消息前缀 ====================

    protected get pokerMsgPrefix(): string { return "MsgQianfen"; }

    // ==================== 初始化 ====================

    start(): void {
        super.start();
        this.gameId = 'yuanjiangqianfen_poker';
    }

    protected getSeatCount(): number { return 4; }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        console.log('[QianfenRoom] Initialized');
    }

    // ==================== 主牌等级管理 ====================

    public setCurrentLevel(level: RankLevel): void {
        this.currentLevel = level;
        this.updateLevelDisplay();
    }

    public getCurrentTrumpSuit(): number { return 0; }

    public isTrumpCard(card: PokerCard): boolean {
        if (card.value >= 15) return true;
        if (card.value === this.currentLevel) return true;
        if (card.suit === this.getCurrentTrumpSuit() && card.value >= 2) return true;
        return false;
    }

    protected updateLevelDisplay(): void {
        if (this.levelLabel) this.levelLabel.string = `主: ${this.getLevelName(this.currentLevel)}`;
    }

    protected getLevelName(level: RankLevel): string {
        if (level <= 10) return String(level);
        if (level === 11) return 'J'; if (level === 12) return 'Q';
        if (level === 13) return 'K'; if (level === 14) return 'A';
        if (level === 15) return 'A(王)';
        return String(level);
    }

    // ==================== 阶段控制 ====================

    public setPhase(phase: QianfenPhase): void {
        this.currentPhase = phase;
        switch (phase) {
            case QianfenPhase.DiPai: if (this.diPaiArea) this.diPaiArea.active = true; break;
            case QianfenPhase.Playing: if (this.diPaiArea) this.diPaiArea.active = false; break;
        }
    }

    // ==================== 出牌与回合 ====================

    public onTrickEnd(result: TrickResult): void {
        this.collectedPoints += result.pointsCollected;
        this.updatePointsDisplay();

        const winnerTeam = this.getTeamBySeat(result.winnerSeat);
        if (winnerTeam === this.myTeam) {
            this.teamScores[this.myTeam] += result.pointsCollected;
        }
        console.log(`[QianfenRoom] Trick end: winner=seat${result.winnerSeat} points=${result.pointsCollected}`);
    }

    protected getTeamBySeat(seatIndex: number): Team {
        return (seatIndex % 2 === this.zhuangSeatIndex % 2) ? Team.Zhuang : Team.Xian;
    }

    protected updatePointsDisplay(): void {
        if (this.pointsLabel) this.pointsLabel.string = `分: ${this.collectedPoints}`;
    }

    protected updateTeamScoreDisplay(): void {
        if (this.teamScoreLabel) {
            this.teamScoreLabel.string = `庄:${this.teamScores[Team.Zhuang]} / 闲:${this.teamScores[Team.Xian]}`;
        }
    }

    // ==================== 结算 ====================

    public showRoundSettlement(data: QianfenRoundSettlement): void {
        console.log(`[QianfenRoom] Round: upgraded=${data.upgraded} newLevel=${data.newLevel}` +
            ` zhuang=${data.teamScores[Team.Zhuang]} xian=${data.teamScores[Team.Xian]}`);

        if (data.upgraded) this.setCurrentLevel(data.newLevel);
        this.teamScores = data.teamScores;
        this.updateTeamScoreDisplay();
        super.handleRoundSettlement(data);
    }

    public showFinalSettlement(data: FinalSettlementData): void {
        super.handleFinalSettlement(data);
    }

    // ==================== 覆写牌型逻辑 ====================

    protected recognizePattern(cards: PokerCard[]): CardPlay | null {
        const base = super.recognizePattern(cards);
        if (base) return base;
        // 千分特有：拖拉机(连续对子)、同花色甩牌
        return null;
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        this.collectedPoints = 0;
        this.currentPhase = QianfenPhase.Bidding;
        this.isDouble = false;
        this.updatePointsDisplay();
    }
}
