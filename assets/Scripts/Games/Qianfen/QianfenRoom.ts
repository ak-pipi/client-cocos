/**
 * 沅江千分 (Yuanjiang Qianfen) - P2 优先级
 *
 * 千分规则特点（湖南沅江地方扑克）：
 * - 4人游戏，两两组队对抗
 * - 使用双副牌(108张)或单副牌+大小王
 * - 类似"升级"/"拖拉机"的升级类游戏
 * - 主牌等级逐步升级（从2开始升级到A）
 * - 庄家方 vs 闲家方
 * - 底牌、埋底、主牌常主等复杂策略
 * - 计分以"分"为单位(牌面5/10/K为分牌)
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label } from 'cc';
import { PokerRoomBase, PokerCard, CardPlay, PokerAvailableActions, PokerEventCallbacks } from '../../GameCommon/PokerRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData, SeatPosition } from '../../GameCommon/GameTypes';

const { ccclass, property } = _decorator;

// ==================== 类型定义 ====================

/** 主牌等级 */
export type RankLevel = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15; // 2~A

/** 阵营 */
export enum Team {
    Zhuang = 'zhuang',   // 庄家方
    Xian = 'xian',       // 闲家方
}

/** 千分阶段 */
export enum QianfenPhase {
    Bidding = 'bidding',       // 叫分/抢庄阶段
    DiPai = 'dipai',           // 埋底阶段
    Playing = 'playing',       // 出牌阶段
    Settlement = 'settlement', // 结算阶段
}

/** 千分回合结果 */
export interface TrickResult {
    leaderSeat: number;
    winnerSeat: number;
    playedCards: Array<{ seat: number; card: PokerCard }>;
    pointsCollected: number;   // 本轮收集到的分牌数
}

/** 千分结算 */
export interface QianfenRoundSettlement extends RoundSettlementData {
    phase: QianfenPhase;
    zhuangTeam: Team;
    teamScores: { [Team.Zhuang]: number; [Team.Xian]: number };
    pointsNeeded: number;      // 升级所需分数
    upgraded: boolean;         // 是否成功升级
    newLevel: RankLevel;       // 新等级
    doubleFlag: boolean;       // 是否翻倍
}

@ccclass('QianfenRoom')
export class QianfenRoom extends PokerRoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected diPaiArea: Node = null;           // 底牌展示区

    @property({ type: Label })
    protected levelLabel: Label = null;        // 当前等级显示

    @property({ type: Label })
    protected teamScoreLabel: Label = null;    // 队伍分数

    @property({ type: Label })
    protected pointsLabel: Label = null;       // 已获分牌数

    @property({ type: Node })
    protected trumpIndicator: Node = null;     // 主牌指示器

    // ==================== 内部状态 ====================

    /** 当前主牌等级 */
    protected currentLevel: RankLevel = 2;

    /** 当前阶段 */
    protected currentPhase: QianfenPhase = QianfenPhase.Bidding;

    /** 我的阵营 */
    protected myTeam: Team = Team.Xian;

    /** 庄家座位索引 */
    protected zhuangSeatIndex: number = 0;

    /** 本局收集到的分牌数 */
    protected collectedPoints: number = 0;

    /** 队伍分数 */
    protected teamScores: { [Team.Zhuang]: number; [Team.Xian]: number } = {
        [Team.Zhuang]: 0,
        [Team.Xian]: 0,
    };

    /** 是否已翻倍 */
    protected isDouble: boolean = false;

    // ==================== 初始化 ====================

    start(): void {
        super.start();
        this.gameId = 'yuanjiangqianfen_poker';
    }

    protected getSeatCount(): number {
        return 4; // 千分固定4人
    }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        console.log('[QianfenRoom] Initialized');
    }

    // ==================== 主牌等级管理 ====================

    /**
     * 设置当前主牌等级
     */
    public setCurrentLevel(level: RankLevel): void {
        this.currentLevel = level;
        this.updateLevelDisplay();
    }

    /**
     * 获取当前主牌花色(简化：等级牌的花色为主花色)
     */
    public getCurrentTrumpSuit(): number {
        // 简化处理：实际应根据具体规则确定主花色
        return 0; // 默认黑桃为主
    }

    /**
     * 检查某张牌是否为主牌
     */
    public isTrumpCard(card: PokerCard): boolean {
        // 大小王总是主牌
        if (card.value >= 15) return true;
        // 当前等级牌是主牌
        if (card.value === this.currentLevel) return true;
        // 与主花色相同的常主
        if (card.suit === this.getCurrentTrumpSuit() && card.value >= 2) return true;
        return false;
    }

    /**
     * 更新等级显示
     */
    protected updateLevelDisplay(): void {
        if (this.levelLabel) {
            const levelName = this.getLevelName(this.currentLevel);
            this.levelLabel.string = `主: ${levelName}`;
        }
    }

    /** 等级转名称 */
    protected getLevelName(level: RankLevel): string {
        if (level <= 10) return String(level);
        if (level === 11) return 'J';
        if (level === 12) return 'Q';
        if (level === 13) return 'K';
        if (level === 14) return 'A';
        if (level === 15) return 'A(王)';
        return String(level);
    }

    // ==================== 阶段控制 ====================

    /**
     * 切换阶段
     */
    public setPhase(phase: QianfenPhase): void {
        this.currentPhase = phase;
        console.log(`[QianfenRoom] Phase changed to: ${phase}`);

        switch (phase) {
            case QianfenPhase.DiPai:
                this.showDiPaiPhase();
                break;
            case QianfenPhase.Playing:
                this.hideDiPaiArea();
                break;
        }
    }

    /** 显示底牌区域 */
    protected showDiPaiPhase(): void {
        if (this.diPaiArea) {
            this.diPaiArea.active = true;
        }
    }

    /** 隐藏底牌区域 */
    protected hideDiPaiArea(): void {
        if (this.diPaiArea) {
            this.diPaiArea.active = false;
        }
    }

    // ==================== 出牌与回合 ====================

    /**
     * 处理一墩(trick)结束
     */
    public onTrickEnd(result: TrickResult): void {
        this.collectedPoints += result.pointsCollected;
        this.updatePointsDisplay();

        // 如果赢家属于我方队伍，加分
        const winnerTeam = this.getTeamBySeat(result.winnerSeat);
        if (winnerTeam === this.myTeam) {
            this.teamScores[this.myTeam] += result.pointsCollected;
        }

        console.log(`[QianfenRoom] Trick end: winner=seat${result.winnerSeat} points=${result.pointsCollected}`);
    }

    /**
     * 根据座位获取阵营
     */
    protected getTeamBySeat(seatIndex: number): Team {
        // 简化：0-2一组，1-3一组（实际由服务端分配）
        return (seatIndex % 2 === this.zhuangSeatIndex % 2) ? Team.Zhuang : Team.Xian;
    }

    /** 更新分牌数显示 */
    protected updatePointsDisplay(): void {
        if (this.pointsLabel) {
            this.pointsLabel.string = `分: ${this.collectedPoints}`;
        }
    }

    /** 更新队伍分数显示 */
    protected updateTeamScoreDisplay(): void {
        if (this.teamScoreLabel) {
            this.teamScoreLabel.string = `庄:${this.teamScores[Team.Zhuang]} / 闲:${this.teamScores[Team.Xian]}`;
        }
    }

    // ==================== 结算 ====================

    public showRoundSettlement(data: QianfenRoundSettlement): void {
        console.log(`[QianfenRoom] Round settlement: upgraded=${data.upgraded} newLevel=${data.newLevel}` +
            ` zhuang=${data.teamScores[Team.Zhuang]} xian=${data.teamScores[Team.Xian]}`);

        // 为下一局更新等级
        if (data.upgraded) {
            this.setCurrentLevel(data.newLevel);
        }

        this.teamScores = data.teamScores;
        this.updateTeamScoreDisplay();
        this.handleRoundSettlement(data);
    }

    public showFinalSettlement(data: FinalSettlementData): void {
        this.handleFinalSettlement(data);
    }

    // ==================== 覆写出牌逻辑（千分特有） ====================

    /**
     * 千分的出牌规则更复杂（跟主牌、甩牌等），此处提供框架
     */
    protected recognizePattern(cards: PokerCard[]): CardPlay | null {
        // 先调用父类基本牌型识别
        const base = super.recognizePattern(cards);
        if (base) return base;

        // 千分特有牌型：
        // - 拖拉机(连续对子/连续三条)
        // - 同花色甩牌
        // 这些在完整版中实现

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
