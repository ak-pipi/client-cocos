/**
 * 跑得快 (PaodekuaiRoom) - v2 完整版
 *
 * 跑得快规则：
 * - 2人或3人游戏，每人17或16张牌
 * - 出牌类似斗地主但无地主概念
 * - 牌型：单、对、三带一/二、顺子、连队、飞机、炸弹、火箭
 * - 倍数递增：炸弹x2、火箭x4
 * - 第一个出完牌的人获胜
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label } from 'cc';
import { PokerRoomBase, PokerCard, CardPlay, PokerAvailableActions, PokerEventCallbacks } from '../../GameCommon/PokerRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData, PokerPattern } from '../../GameCommon/GameTypes';
import { NetworkManager } from '../../Manager/NetworkManager';

const { ccclass, property } = _decorator;

// ==================== 类型定义 ====================

export interface PaodekuaiRoundResult {
    rank: number[];
    scores: Map<number, number>;
    bombCount: Map<number, number>;
    rocketCount: Map<number, number>;
    multiplier: number;
}

@ccclass('PaodekuaiRoom')
export class PaodekuaiRoom extends PokerRoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Label })
    public scoreLabel: Label = null;

    @property({ type: Node })
    protected passGroup: Node = null;

    @property({ type: Node })
    protected playGroup: Node = null;

    // ==================== 内部状态 ====================

    protected playerMode: '2p' | '3p' = '3p';
    protected bombCountThisRound: number = 0;

    // ==================== 消息前缀 ====================

    protected get pokerMsgPrefix(): string { return "MsgPaodekuai"; }

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

    // ==================== 覆写牌型识别 ====================

    protected recognizePattern(cards: PokerCard[]): CardPlay | null {
        const base = super.recognizePattern(cards);
        if (base) return base;

        const n = cards.length;
        const values = cards.map(c => c.value).sort((a, b) => a - b);

        // 四带二(对) - 6张
        if (n === 6) {
            const qv = this.findQuadValue(values);
            if (qv !== -1) {
                const remaining = values.filter(v => v !== qv);
                if (remaining.length === 2 && remaining[0] === remaining[1]) {
                    return { pattern: PokerPattern.TripleWithPair, cards, weight: qv };
                }
            }
        }

        return null;
    }

    private findQuadValue(sortedValues: number[]): number {
        for (let i = 0; i <= sortedValues.length - 4; i++) {
            if (sortedValues[i] === sortedValues[i + 3]) return sortedValues[i];
        }
        return -1;
    }

    // ==================== 游戏事件处理 ====================

    /** 覆写 onPkPlayCard 以检测炸弹倍数 */
    protected onPkPlayCard(msg: any): void {
        super.onPkPlayCard(msg);
        const clientSeat = this.server2ClientSeat(msg.seatIndex);
        const play = this.playedRecords.get(clientSeat);

        if (play) {
            if (play.pattern === PokerPattern.Bomb) {
                this.bombCountThisRound++;
                this.addMultiplier(2);
            } else if (play.pattern === PokerPattern.Rocket) {
                this.addMultiplier(4);
            }
        }
    }

    public onPlayRoundEnd(winnerSeat: number, plays: Map<number, CardPlay>): void {
        console.log(`[PaodekuaiRoom] Round end, winner: seat ${winnerSeat}`);

        const winPlay = plays.get(winnerSeat);
        if (winPlay) {
            this.lastPlay = winPlay;
            if (winPlay.pattern === PokerPattern.Bomb) { this.bombCountThisRound++; this.addMultiplier(2); }
            else if (winPlay.pattern === PokerPattern.Rocket) this.addMultiplier(4);
        }
        this.pokerCallbacks.onRoundEnd?.(winnerSeat, [...plays.values()]);
    }

    public onGameOver(rankings: number[]): void {
        console.log(`[PaodekuaiRoom] Game over, rankings: ${rankings.join(',')}`);
        this.pokerCallbacks.onGameOver?.(rankings);
    }

    public calculateScores(result: PaodekuaiRoundResult): void {
        let myScore = result.scores.get(this.getMySeatIndex()) || 0;
        this.updateScore(myScore);
    }

    protected updateScore(score: number): void {
        if (this.scoreLabel) this.scoreLabel.string = String(score);
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        this.bombCountThisRound = 0;
        this.currentMultiplier = 1;
    }
}
