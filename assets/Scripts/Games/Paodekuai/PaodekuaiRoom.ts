/**
 * 跑得快 (PaodekuaiRoom)
 *
 * 两人15张跑得快：
 * - 45张牌库：去掉大小王、三张2、三张A、一张K
 * - 黑桃3首出，先出完获胜
 * - 炸弹翻倍，输家一张未出关门/春天翻倍
 */

import { _decorator, Node, Label } from 'cc';
import { PokerRoomBase, PokerCard, CardPlay } from '../../GameCommon/PokerRoomBase';
import { RoomInfo, PokerPattern } from '../../GameCommon/GameTypes';
import { GameState } from '../../GameCommon/RoomBase';
import { NetworkManager } from '../../Manager/NetworkManager';
import { Client } from '../../Game/Client';

const { ccclass, property } = _decorator;

type PdkGenre = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

const GENRE_TO_PATTERN: Record<number, PokerPattern> = {
    1: PokerPattern.Single,
    2: PokerPattern.Pair,
    3: PokerPattern.Triple,
    4: PokerPattern.TripleWithOne,
    5: PokerPattern.TripleWithPair,
    6: PokerPattern.Straight,
    7: PokerPattern.ConsecutivePairs,
    8: PokerPattern.Airplane,
    9: PokerPattern.Airplane,
    10: PokerPattern.Airplane,
    11: PokerPattern.Bomb,
    12: PokerPattern.Rocket,
};

@ccclass('PaodekuaiRoom')
export class PaodekuaiRoom extends PokerRoomBase {
    @property({ type: Label })
    public scoreLabel: Label = null;

    @property({ type: Node })
    protected passGroup: Node = null;

    @property({ type: Node })
    protected playGroup: Node = null;

    protected bombCountThisRound: number = 0;
    protected baseScore: number = 1;
    protected roundCount: number = 8;
    protected serverCurrentPlayer: number = -1;
    protected serverLastPlaySeat: number = -1;
    protected pdkIsLeader: boolean = true;

    protected get pokerMsgPrefix(): string { return 'PaoDeKuai.'; }

    start(): void {
        this.syncMsgPrefix = 'PaoDeKuai.';
        super.start();
        this.gameId = 'paodekuai_poker';
    }

    protected getSeatCount(): number { return 2; }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        this.baseScore = Number(roomInfo.ruleConfig?.base_score) || 1;
        this.roundCount = Number(roomInfo.ruleConfig?.round_count) || 8;
        console.log('[PaodekuaiRoom] Initialized as 2-player 15-card mode');
    }

    public onMessage(msgType: string, msg: any): boolean {
        if (super.onMessage(msgType, msg)) return true;

        if (msgType === 'PaoDeKuai.Deal') this.onPdkDeal(msg);
        else if (msgType === 'PaoDeKuai.PlayNotify') this.onPdkPlayNotify(msg);
        else if (msgType === 'PaoDeKuai.PlayFailed') this.onPdkPlayFailed(msg);
        else if (msgType === 'PaoDeKuai.Settlement') this.onPdkSettlement(msg);
        else return false;
        return true;
    }

    /** 服务端 PaoDeKuai.SyncResp -> 通用房间状态 + 跑得快局内状态 */
    protected onSyncGame(msg: any): void {
        const rawState = Number(msg?.gameState) || 0; // 0=None, 1=Ready, 2=Playing, 3=Settling
        const normalized = {
            ...msg,
            seat: msg?.mySeat,
            number: msg?.number,
            currentRound: msg?.roundNo,
            totalRounds: msg?.roundCount,
            gameState: rawState === 2 ? GameState.Playing : GameState.Waiting,
        };
        super.onSyncGame(normalized);

        this.baseScore = Number(msg?.baseScore) || 1;
        this.roundCount = Number(msg?.roundCount) || this.roundCount;
        this.bombCountThisRound = Number(msg?.bombCount) || 0;
        this.currentMultiplier = Number(msg?.multiplier) || 1;
        this.serverCurrentPlayer = Number(msg?.currentPlayer ?? -1);
        this.serverLastPlaySeat = Number(msg?.lastPlaySeat ?? -1);
        this.pdkIsLeader = !!msg?.isFirstPlay;

        if (Array.isArray(msg?.myCards)) {
            this.dealCards(msg.myCards.map((id: number) => this.cardFromServerId(Number(id))));
        }

        if (Array.isArray(msg?.remainCounts)) {
            for (let s = 0; s < Math.min(2, msg.remainCounts.length); s++) {
                this.updatePlayerCardCount(this.server2ClientSeat(s), Number(msg.remainCounts[s]) || 0);
            }
        }

        if (Array.isArray(msg?.lastPlayCards) && msg.lastPlayCards.length > 0) {
            const cards = msg.lastPlayCards.map((id: number) => this.cardFromServerId(Number(id)));
            const play = this.playFromGenre(Number(msg.lastPlayGenre) as PdkGenre, cards) || this.recognizePattern(cards);
            if (play) {
                this.lastPlay = play;
                this.serverLastPlaySeat = Number(msg.lastPlaySeat);
                this.showOtherPlay(this.server2ClientSeat(this.serverLastPlaySeat), play);
            }
        } else {
            this.lastPlay = null;
        }

        this.updateMultiplierDisplay();
        this.updateTurnState();
    }

    public onReadyClick(): void {
        if (this.seat === -1) return;
        NetworkManager.Instance.sendInnerMessage('PaoDeKuai.Ready');
    }

    public playSelectedCards(): void {
        if (!this.isMyTurn || this.selectedIndices.size === 0) return;

        const indices = [...this.selectedIndices].sort((a, b) => a - b);
        const selectedCards = indices.map(i => this.myCards[i]);
        const play = this.recognizePattern(selectedCards);
        if (!play) {
            this.playErrorSound();
            return;
        }
        if (!this.pdkIsLeader && this.lastPlay && !this.canBeat(play, this.lastPlay)) {
            this.playErrorSound();
            return;
        }

        this.sendPlay(play);
    }

    public pass(): void {
        if (!this.isMyTurn || this.pdkIsLeader) return;
        NetworkManager.Instance.sendInnerMessage('PaoDeKuai.Play', { cardIds: [] });
        this.clearSelection();
        this.isMyTurn = false;
        this.showPassAndPlayButtons(false);
        this.stopCountdown();
    }

    public hint(): void {
        if (!this.isMyTurn) return;
        this.clearSelection();

        const target = this.pdkIsLeader ? null : this.lastPlay;
        const suggestion = target ? this.findSmallestBeatingPlay(target) : this.findFirstLeadPlay();
        if (!suggestion) return;
        suggestion.indices.forEach(i => this.selectedIndices.add(i));
        this.renderMyHand();
    }

    protected sendPlay(play: CardPlay): void {
        const cardIds = play.cards.map(c => Number(c.cardId));
        NetworkManager.Instance.sendInnerMessage('PaoDeKuai.Play', { cardIds });
    }

    protected onPdkDeal(msg: any): void {
        this.resetRoundState();
        this.gameState = GameState.Playing;
        this.currentRound = Number(msg?.roundNo) || this.currentRound + 1;
        this.roundCount = Number(msg?.roundCount) || this.roundCount;
        this.baseScore = Number(msg?.baseScore) || this.baseScore;
        this.bombCountThisRound = 0;
        this.currentMultiplier = 1;
        this.serverCurrentPlayer = Number(msg?.firstPlayer ?? -1);
        this.pdkIsLeader = true;

        const cards = Array.isArray(msg?.cards) ? msg.cards.map((id: number) => this.cardFromServerId(Number(id))) : [];
        this.dealCards(cards);
        this.updateRoomDisplay();
        this.updateMultiplierDisplay();
        this.updateTurnState();
    }

    protected onPdkPlayNotify(msg: any): void {
        const serverSeat = Number(msg?.seat ?? -1);
        const clientSeat = this.server2ClientSeat(serverSeat);
        const cardIds: number[] = Array.isArray(msg?.cardIds) ? msg.cardIds.map((id: any) => Number(id)) : [];
        this.currentMultiplier = Number(msg?.multiplier) || this.currentMultiplier;

        if (cardIds.length === 0) {
            this.lastPlay = null;
            this.pdkIsLeader = true;
            this.serverLastPlaySeat = -1;
            this.playPassSound();
        } else {
            const cards = cardIds.map(id => this.cardFromServerId(id));
            const play = this.playFromGenre(Number(msg?.genre) as PdkGenre, cards) || this.recognizePattern(cards);
            if (play) {
                this.playedRecords.set(clientSeat, play);
                this.lastPlay = play;
                this.serverLastPlaySeat = serverSeat;
                this.pdkIsLeader = false;
                if (clientSeat === 0) {
                    this.removeMyCards(cardIds);
                    this.showMyPlay(play);
                } else {
                    this.showOtherPlay(clientSeat, play);
                }
                if (play.pattern === PokerPattern.Bomb) this.bombCountThisRound++;
                this.playCardSound(play.pattern);
            }
        }

        this.updatePlayerCardCount(clientSeat, Number(msg?.remainCount) || 0);
        this.serverCurrentPlayer = Number(msg?.nextPlayer ?? -1);
        this.clearSelection();
        this.renderMyHand();
        this.updateCardCountDisplay();
        this.updateMultiplierDisplay();
        this.updateTurnState();
    }

    protected onPdkPlayFailed(msg: any): void {
        Client.Instance.showPromptTip(msg?.errMsg || '出牌失败', 2.0);
        this.playErrorSound();
        this.isMyTurn = this.serverCurrentPlayer === this.seat;
        this.showPassAndPlayButtons(this.isMyTurn);
    }

    protected onPdkSettlement(msg: any): void {
        this.stopCountdown();
        this.showPassAndPlayButtons(false);
        this.currentMultiplier = Number(msg?.multiplier) || this.currentMultiplier;
        this.bombCountThisRound = Number(msg?.bombCount) || this.bombCountThisRound;

        const scores: number[] = Array.isArray(msg?.scores) ? msg.scores : [];
        if (this.seat >= 0 && scores[this.seat] !== undefined) {
            this.updateScore(Number(scores[this.seat]) || 0);
        }
        if (Array.isArray(msg?.remainCards)) {
            for (let s = 0; s < Math.min(2, msg.remainCards.length); s++) {
                const remain = Array.isArray(msg.remainCards[s]) ? msg.remainCards[s].length : 0;
                this.updatePlayerCardCount(this.server2ClientSeat(s), remain);
            }
        }
        const winner = Number(msg?.winnerSeat ?? -1);
        console.log(`[PaodekuaiRoom] Settlement winner=${winner}, multiplier=${this.currentMultiplier}, spring=${!!msg?.spring}`);
    }

    protected recognizePattern(cards: PokerCard[]): CardPlay | null {
        const n = cards.length;
        if (n === 0) return null;
        const values = cards.map(c => c.value).sort((a, b) => a - b);
        const counts = this.countValues(values);
        const tripleValue = this.findNValue(counts, 3);

        if (n === 1) return { pattern: PokerPattern.Single, cards, weight: values[0] };
        if (n === 2 && values[0] === values[1]) return { pattern: PokerPattern.Pair, cards, weight: values[0] };
        if (n === 3 && values[0] === values[2]) return { pattern: PokerPattern.Triple, cards, weight: values[0] };
        if (n === 4 && values[0] === values[3]) return { pattern: PokerPattern.Bomb, cards, weight: values[0] };
        if (n === 4 && tripleValue > 0) return { pattern: PokerPattern.TripleWithOne, cards, weight: tripleValue };
        if (n === 5 && tripleValue > 0 && this.hasPairExcept(counts, tripleValue)) {
            return { pattern: PokerPattern.TripleWithPair, cards, weight: tripleValue };
        }
        if (n >= 5 && this.isStraight(values)) return { pattern: PokerPattern.Straight, cards, weight: values[n - 1] };
        if (n >= 6 && n % 2 === 0 && this.isConsecutivePairs(values)) {
            return { pattern: PokerPattern.ConsecutivePairs, cards, weight: values[n - 1] };
        }

        const plane = this.recognizePlane(cards, values, counts);
        if (plane) return plane;
        return null;
    }

    protected canBeat(play: CardPlay, target: CardPlay): boolean {
        if (play.pattern === PokerPattern.Bomb && target.pattern !== PokerPattern.Bomb) return true;
        if (target.pattern === PokerPattern.Bomb && play.pattern !== PokerPattern.Bomb) return false;
        if (play.pattern !== target.pattern) return false;
        if (this.isSequencePattern(play.pattern) && play.cards.length !== target.cards.length) return false;
        return play.weight > target.weight;
    }

    protected findSmallestBeatingPlay(target: CardPlay): { indices: number[]; play: CardPlay } | null {
        return this.enumerateBestPlay(target);
    }

    protected findFirstLeadPlay(): { indices: number[]; play: CardPlay } | null {
        const spade3 = this.myCards.findIndex(c => c.value === 3 && c.suit === 0);
        if (spade3 >= 0) {
            const play = this.recognizePattern([this.myCards[spade3]]);
            if (play) return { indices: [spade3], play };
        }
        return this.enumerateBestPlay(null);
    }

    private enumerateBestPlay(target: CardPlay | null): { indices: number[]; play: CardPlay } | null {
        const n = this.myCards.length;
        let best: { indices: number[]; play: CardPlay } | null = null;
        for (let mask = 1; mask < (1 << n); mask++) {
            const indices: number[] = [];
            const cards: PokerCard[] = [];
            for (let i = 0; i < n; i++) {
                if ((mask & (1 << i)) !== 0) {
                    indices.push(i);
                    cards.push(this.myCards[i]);
                }
            }
            const play = this.recognizePattern(cards);
            if (!play) continue;
            if (target && !this.canBeat(play, target)) continue;
            if (!best || this.isBetterSuggestion(play, best.play, !!target)) {
                best = { indices, play };
            }
        }
        return best;
    }

    private isBetterSuggestion(candidate: CardPlay, current: CardPlay, beating: boolean): boolean {
        if (beating && candidate.pattern !== PokerPattern.Bomb && current.pattern === PokerPattern.Bomb) return true;
        if (beating && candidate.pattern === PokerPattern.Bomb && current.pattern !== PokerPattern.Bomb) return false;
        if (candidate.cards.length !== current.cards.length) return candidate.cards.length < current.cards.length;
        if (candidate.pattern !== current.pattern) return String(candidate.pattern) < String(current.pattern);
        return candidate.weight < current.weight;
    }

    private playFromGenre(genre: PdkGenre, cards: PokerCard[]): CardPlay | null {
        const pattern = GENRE_TO_PATTERN[genre];
        const local = this.recognizePattern(cards);
        if (local) return local;
        if (!pattern || cards.length === 0) return null;
        const weight = Math.max(...cards.map(c => c.value));
        return { pattern, cards, weight };
    }

    private removeMyCards(cardIds: number[]): void {
        const idSet = new Set(cardIds.map(id => String(id)));
        this.myCards = this.myCards.filter(c => !idSet.has(String(c.cardId)));
    }

    private updateTurnState(): void {
        this.isMyTurn = this.seat !== -1 && this.serverCurrentPlayer === this.seat && this.gameState === GameState.Playing;
        if (this.isMyTurn) {
            const canPass = !this.pdkIsLeader;
            this.pokerActions = { canPlay: true, canHint: true, canPass, isLeader: this.pdkIsLeader, mustPlay: !canPass };
            this.showPassAndPlayButtons(true);
            this.startCountdown(30);
        } else {
            this.pokerActions = null;
            this.showPassAndPlayButtons(false);
        }
    }

    private updateMultiplierDisplay(): void {
        if (this.multiLabel) this.multiLabel.string = `${this.currentMultiplier}倍`;
    }

    protected updateScore(score: number): void {
        if (this.scoreLabel) this.scoreLabel.string = String(score);
    }

    protected resetRoundState(): void {
        super.resetRoundState();
        this.bombCountThisRound = 0;
        this.currentMultiplier = 1;
        this.serverCurrentPlayer = -1;
        this.serverLastPlaySeat = -1;
        this.pdkIsLeader = true;
    }

    private cardFromServerId(id: number): PokerCard {
        const card = this.buildServerDeck()[id];
        return card || { value: 0, suit: 0, cardId: String(id) };
    }

    private buildServerDeck(): PokerCard[] {
        const deck: PokerCard[] = [];
        const push = (serverPoint: number, serverSuit: number) => {
            if (this.isServerCardRemoved(serverPoint, serverSuit)) return;
            deck.push({
                value: this.toClientValue(serverPoint),
                suit: this.toClientSuit(serverSuit),
                cardId: String(deck.length),
            });
        };
        for (let point = 1; point <= 13; point++) {
            for (let suit = 1; suit <= 4; suit++) push(point, suit);
        }
        return deck;
    }

    private isServerCardRemoved(point: number, suit: number): boolean {
        if (point === 2) return suit !== 4;      // 仅保留黑桃2
        if (point === 1) return suit !== 4;      // 仅保留黑桃A
        if (point === 13) return suit === 1;     // 去掉方块K
        return false;
    }

    private toClientValue(point: number): number {
        if (point === 1) return 14;
        if (point === 2) return 15;
        return point;
    }

    private toClientSuit(serverSuit: number): number {
        if (serverSuit === 4) return 0; // 黑桃
        if (serverSuit === 3) return 1; // 红桃
        if (serverSuit === 2) return 2; // 梅花
        return 3;                       // 方块
    }

    private countValues(values: number[]): Map<number, number> {
        const counts = new Map<number, number>();
        values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
        return counts;
    }

    private findNValue(counts: Map<number, number>, n: number): number {
        let ret = -1;
        counts.forEach((count, value) => {
            if (count >= n && value > ret) ret = value;
        });
        return ret;
    }

    private hasPairExcept(counts: Map<number, number>, exclude: number): boolean {
        let ok = false;
        counts.forEach((count, value) => {
            if (value !== exclude && count === 2) ok = true;
        });
        return ok;
    }

    private isStraight(values: number[]): boolean {
        if (values.some(v => v >= 15)) return false;
        for (let i = 1; i < values.length; i++) {
            if (values[i] !== values[i - 1] + 1) return false;
        }
        return new Set(values).size === values.length;
    }

    protected isConsecutivePairs(values: number[]): boolean {
        if (values.length % 2 !== 0 || values.some(v => v >= 15)) return false;
        for (let i = 0; i < values.length; i += 2) {
            if (values[i] !== values[i + 1]) return false;
            if (i > 0 && values[i] !== values[i - 2] + 1) return false;
        }
        return true;
    }

    private recognizePlane(cards: PokerCard[], values: number[], counts: Map<number, number>): CardPlay | null {
        const tripleValues = [...counts.entries()]
            .filter(([value, count]) => count >= 3 && value < 15)
            .map(([value]) => value)
            .sort((a, b) => a - b);
        if (tripleValues.length < 2) return null;

        for (let start = 0; start < tripleValues.length; start++) {
            for (let len = 2; start + len <= tripleValues.length; len++) {
                const seq = tripleValues.slice(start, start + len);
                if (!this.isConsecutiveRaw(seq)) break;
                if (values.length === len * 3) return { pattern: PokerPattern.Airplane, cards, weight: seq[len - 1] };
                if (values.length === len * 4) return { pattern: PokerPattern.Airplane, cards, weight: seq[len - 1] };
                if (values.length === len * 5 && this.planeMatesArePairs(counts, seq)) {
                    return { pattern: PokerPattern.Airplane, cards, weight: seq[len - 1] };
                }
            }
        }
        return null;
    }

    private planeMatesArePairs(counts: Map<number, number>, seq: number[]): boolean {
        const left = new Map(counts);
        seq.forEach(v => left.set(v, (left.get(v) || 0) - 3));
        let pairs = 0;
        for (const [, count] of left) {
            if (count === 0) continue;
            if (count !== 2) return false;
            pairs++;
        }
        return pairs === seq.length;
    }

    private isConsecutiveRaw(values: number[]): boolean {
        for (let i = 1; i < values.length; i++) {
            if (values[i] !== values[i - 1] + 1) return false;
        }
        return true;
    }

    private isSequencePattern(pattern: PokerPattern): boolean {
        return pattern === PokerPattern.Straight ||
            pattern === PokerPattern.ConsecutivePairs ||
            pattern === PokerPattern.Airplane;
    }
}
