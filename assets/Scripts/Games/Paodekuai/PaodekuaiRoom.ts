/**
 * 跑得快 (Paodekuai / Run Fast) - P1 优先级
 *
 * 跑得快规则特点：
 * - 2人或3人游戏，每人17或16张牌（去掉大小王和一张3/部分3）
 * - 出牌类似斗地主但无地主概念
 * - 牌型：单、对、三带一/二、顺子、连队、飞机、炸弹、火箭
 * - 第一个出完牌的人获胜
 * - 支持"要得起"/"不要"(pass)机制
 * - 倍数递增：炸弹x2、火箭x4
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label } from 'cc';
import { PokerRoomBase, PokerCard, CardPlay, PokerAvailableActions, PokerEventCallbacks } from '../../GameCommon/PokerRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../../GameCommon/GameTypes';

const { ccclass, property } = _decorator;

// ==================== 类型定义 ====================

/** 跑得快结算 */
export interface PaodekuaiRoundResult {
    rank: number[];              // 排名(座位索引数组，第1个=冠军)
    scores: Map<number, number>; // 各座位得分
    bombCount: Map<number, number>; // 各座位炸出的炸弹数
    rocketCount: Map<number, number>; // 各座位火箭数
    multiplier: number;          // 最终倍数
}

@ccclass('PaodekuaiRoom')
export class PaodekuaiRoom extends PokerRoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Label })
    public scoreLabel: Label = null;          // 分数显示

    @property({ type: Node })
    protected passButton: Node = null;        // 不出按钮

    @property({ type: Node })
    protected hintButton: Node = null;        // 提示按钮

    @property({ type: Node })
    protected playButton: Node = null;        // 出牌按钮

    // ==================== 内部状态 ====================

    protected playerMode: '2p' | '3p' = '3p'; // 2人还是3人模式

    protected bombCountThisRound: number = 0;  // 本轮炸弹数

    // ==================== 初始化 ====================

    start(): void {
        super.start();
        this.gameId = 'paodekuai_poker';
    }

    protected getSeatCount(): number {
        return this.playerMode === '2p' ? 2 : 3;
    }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        this.playerMode = (roomInfo.ruleConfig?.playerMode === '2') ? '2p' : '3p';
        console.log(`[PaodekuaiRoom] Mode: ${this.playerMode}`);
    }

    // ==================== 覆写牌型识别（跑得快特有） ====================

    protected recognizePattern(cards: PokerCard[]): CardPlay | null {
        // 先调用父类通用识别
        const base = super.recognizePattern(cards);
        if (base) return base;

        const n = cards.length;
        const values = cards.map(c => c.value).sort((a, b) => a - b);

        // ---- 跑得快特有牌型 ----

        // 四带二(对) - 4+2=6张
        if (n === 6) {
            const quadValue = this.findQuadValue(values);
            if (quadValue !== -1) {
                const remaining = values.filter(v => v !== quadValue);
                if (remaining[0] === remaining[1]) {
                    return { pattern: GameTypes.PokerPattern.TripleWithPair, cards, weight: quadValue };
                }
            }
        }

        // 软炸弹(3张相同+1张任意，某些规则变体) - 不在此实现

        return null;
    }

    private findQuadValue(sortedValues: number[]): number {
        for (let i = 0; i <= sortedValues.length - 4; i++) {
            if (sortedValues[i] === sortedValues[i + 3]) {
                return sortedValues[i];
            }
        }
        return -1;
    }

    // ==================== 游戏事件处理 ====================

    /**
     * 处理一轮出牌结束(比较大小)
     */
    public onPlayRoundEnd(winnerSeat: number, plays: Map<number, CardPlay>): void {
        console.log(`[PaodekuaiRoom] Round end, winner: seat ${winnerSeat}`);

        // 清空上一手记录
        const winPlay = plays.get(winnerSeat);
        if (winPlay) {
            this.lastPlay = winPlay;

            // 检查炸弹/火箭增加倍数
            if (winPlay.pattern === GameTypes.PokerPattern.Bomb) {
                this.bombCountThisRound++;
                this.addMultiplier(2);
            } else if (winPlay.pattern === GameTypes.PokerPattern.Rocket) {
                this.addMultiplier(4);
            }
        }

        this.pokerCallbacks.onRoundEnd?.(winnerSeat, [...plays.values()]);
    }

    /**
     * 处理游戏结束(有人出完所有牌)
     */
    public onGameOver(rankings: number[]): void {
        console.log(`[PaodekuaiRoom] Game over, rankings: ${rankings.join(',')}`);
        this.pokerCallbacks.onGameOver?.(rankings);
    }

    // ==================== 分数计算 ====================

    /**
     * 计算并显示最终得分
     */
    public calculateScores(result: PaodekuaiRoundResult): void {
        let myScore = result.scores.get(this.getMySeatIndex()) || 0;
        this.updateScore(myScore);
    }

    protected updateScore(score: number): void {
        if (this.scoreLabel) {
            this.scoreLabel.string = String(score);
        }
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        this.bombCountThisRound = 0;
        this.currentMultiplier = 1;
    }
}
