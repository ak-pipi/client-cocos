/**
 * 跑得快 (PaodekuaiRoom)
 *
 * 两人15张跑得快：
 * - 45张牌库：去掉大小王、三张2、三张A、一张K
 * - 首局随机先出，后续由上一局赢家先出
 * - 炸弹翻倍，输家一张未出关门/春天翻倍
 */

import { _decorator, Node, Label, Color, Graphics, Button, EventHandler, UITransform, Vec3 } from 'cc';
import { PokerRoomBase, PokerCard, CardPlay } from '../../GameCommon/PokerRoomBase';
import { RoomInfo, PokerPattern, RoomState } from '../../GameCommon/GameTypes';
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

    protected bombCountThisRound: number = 0;
    protected baseScore: number = 1;
    protected roundCount: number = 8;
    protected serverCurrentPlayer: number = -1;
    protected serverLastPlaySeat: number = -1;
    protected pdkIsLeader: boolean = true;
    protected forcePlayIfCanBeat: boolean = true;
    protected hasFirstPlayed: boolean = false;
    private myRoundScore: number = 0;
    private statusLabel: Label | null = null;
    private roomInfoLabel: Label | null = null;
    private ruleInfoLabel: Label | null = null;
    private opponentInfoLabel: Label | null = null;
    private opponentCountLabel: Label | null = null;
    private opponentHandArea: Node | null = null;
    private overlayRoot: Node | null = null;
    private pdkReadyGroup: Node | null = null;

    protected get pokerMsgPrefix(): string { return 'PaoDeKuai.'; }

    start(): void {
        this.syncMsgPrefix = 'PaoDeKuai.';
        this.gameId = 'paodekuai_poker';
        super.start();
        this.ensurePaodekuaiUI();
        this.updateStatus('等待准备');
        this.refreshPaodekuaiHud();
        this.updateReadyButtonState();
    }

    protected getSeatCount(): number { return 2; }

    protected bindPrefabNodes(): void {
        super.bindPrefabNodes();
        this.hideGuanDanPokerNodes();
        this.ensurePaodekuaiUI();
        this.refreshPaodekuaiHud();
        this.updateReadyButtonState();
    }

    protected isAllRoundsFinished(): boolean {
        const currentRound = Number((this as any).currentRound) || 0;
        const totalRounds = Number((this as any).totalRounds) || 0;
        return this.gameState === GameState.Waiting && totalRounds > 0 && currentRound >= totalRounds;
    }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        this.baseScore = Number(roomInfo.ruleConfig?.base_score) || 1;
        this.roundCount = Number(roomInfo.ruleConfig?.round_count) || 8;
        this.forcePlayIfCanBeat = roomInfo.ruleConfig?.force_play_if_can_beat !== false;
        this.refreshPaodekuaiHud();
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

    protected onSyncGameUIUpdate(isSitting: boolean): void {
        super.onSyncGameUIUpdate(isSitting);
        if (isSitting || this.seat !== -1) this.updateReadyButtonState();
        this.ensurePaodekuaiUI();
        this.refreshPaodekuaiHud();
        this.updateReadyButtonState();
    }

    protected onPlayerAdded(seatIndex: number, playerInfo: any): void {
        super.onPlayerAdded(seatIndex, playerInfo);
        this.refreshPaodekuaiHud();
    }

    protected onPlayerRemoved(seatIndex: number): void {
        super.onPlayerRemoved(seatIndex);
        this.renderOpponentHandBacks(0);
        this.refreshPaodekuaiHud();
    }

    protected updateReadyButtonState(): void {
        const selfInfo = this.seat >= 0 ? this.playerInfos[this.seat] : null;
        const alreadyReady = !!selfInfo?.ready;
        const canReady = (this.seat !== -1 &&
            this.gameState === GameState.Waiting &&
            !this.isAllRoundsFinished() &&
            !alreadyReady);

        if (this.readyGroup) this.readyGroup.active = canReady;
        if (!this.btnReady) return;
        this.btnReady.active = canReady;
        if (this.btnStartGame) this.btnStartGame.active = false;
        if (this.btnReadyLabel) {
            this.btnReadyLabel.string = '准备';
        }
    }

    protected updateRoomDisplay(): void {
        super.updateRoomDisplay();
        this.refreshPaodekuaiHud();
    }

    protected onPlayerReadyUIUpdate(seatIndex: number): void {
        super.onPlayerReadyUIUpdate(seatIndex);
        if (this.gameState !== GameState.Waiting) return;
        if (seatIndex === this.seat) {
            this.updateStatus('已准备，等待对手');
        } else {
            this.updateStatus('对手已准备');
        }
        this.refreshPaodekuaiHud();
        this.updateReadyButtonState();
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
        this.hasFirstPlayed = false;

        if (Array.isArray(msg?.myCards)) {
            this.dealCards(msg.myCards.map((id: number) => this.cardFromServerId(Number(id))));
        }

        if (Array.isArray(msg?.remainCounts)) {
            for (let s = 0; s < Math.min(2, msg.remainCounts.length); s++) {
                const remain = Number(msg.remainCounts[s]) || 0;
                this.updatePlayerCardCount(this.server2ClientSeat(s), remain);
                if (remain > 0 && remain < 15) this.hasFirstPlayed = true;
            }
        }

        if (Array.isArray(msg?.lastPlayCards) && msg.lastPlayCards.length > 0) {
            const cards = msg.lastPlayCards.map((id: number) => this.cardFromServerId(Number(id)));
            const play = this.playFromGenre(Number(msg.lastPlayGenre) as PdkGenre, cards) || this.recognizePattern(cards);
            if (play) {
                this.hasFirstPlayed = true;
                this.lastPlay = play;
                this.serverLastPlaySeat = Number(msg.lastPlaySeat);
                this.showOtherPlay(this.server2ClientSeat(this.serverLastPlaySeat), play);
            }
        } else {
            this.lastPlay = null;
        }

        this.updateMultiplierDisplay();
        this.refreshPaodekuaiHud();
        this.updateTurnState();
    }

    public onReadyClick(): void {
        if (this.seat === -1) return;
        NetworkManager.Instance.sendInnerMessage('PaoDeKuai.Ready');
        if (this.btnReady) this.btnReady.active = false;
        if (this.readyGroup) this.readyGroup.active = false;
    }

    public onStartGameClick(): void {
        this.onReadyClick();
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
        this.isMyTurn = false;
        this.showPassAndPlayButtons(false);
        this.stopCountdown();
    }

    public pass(): void {
        if (!this.isMyTurn || !this.pokerActions?.canPass) return;
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
        this.currentState = RoomState.Playing;
        this.currentRound = Number(msg?.roundNo) || this.currentRound + 1;
        this.roundCount = Number(msg?.roundCount) || this.roundCount;
        this.totalRounds = this.roundCount;
        this.baseScore = Number(msg?.baseScore) || this.baseScore;
        this.bombCountThisRound = 0;
        this.currentMultiplier = 1;
        this.serverCurrentPlayer = Number(msg?.firstPlayer ?? -1);
        this.pdkIsLeader = true;
        this.hasFirstPlayed = false;
        this.setLocalReadyFlags(false);

        const cards = Array.isArray(msg?.cards) ? msg.cards.map((id: number) => this.cardFromServerId(Number(id))) : [];
        this.dealCards(cards);
        this.renderOpponentHandBacks(15);
        this.updateRoomDisplay();
        this.updateMultiplierDisplay();
        this.refreshPaodekuaiHud();
        this.updateReadyButtonState();
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
            this.showPassAtSeat(clientSeat);
            this.playPassSound();
        } else {
            const cards = cardIds.map(id => this.cardFromServerId(id));
            const play = this.playFromGenre(Number(msg?.genre) as PdkGenre, cards) || this.recognizePattern(cards);
            if (play) {
                this.hasFirstPlayed = true;
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
        this.refreshPaodekuaiHud();
        this.updateTurnState();
    }

    protected onPdkPlayFailed(msg: any): void {
        Client.Instance.showPromptTip(msg?.errMsg || '出牌失败', 2.0);
        this.playErrorSound();
        this.isMyTurn = this.serverCurrentPlayer === this.seat;
        this.showPassAndPlayButtons(this.isMyTurn);
        if (this.isMyTurn) this.startCountdown(30);
    }

    protected onPdkSettlement(msg: any): void {
        this.isMyTurn = false;
        this.stopCountdown();
        this.showPassAndPlayButtons(false);
        this.currentMultiplier = Number(msg?.multiplier) || this.currentMultiplier;
        this.bombCountThisRound = Number(msg?.bombCount) || this.bombCountThisRound;
        this.currentState = RoomState.RoundSettlement;

        const scores: number[] = Array.isArray(msg?.scores) ? msg.scores : [];
        let myScore = 0;
        if (this.seat >= 0 && scores[this.seat] !== undefined) {
            myScore = Number(scores[this.seat]) || 0;
            this.updateScore(myScore);
        }
        if (Array.isArray(msg?.remainCards)) {
            for (let s = 0; s < Math.min(2, msg.remainCards.length); s++) {
                const remain = Array.isArray(msg.remainCards[s]) ? msg.remainCards[s].length : 0;
                this.updatePlayerCardCount(this.server2ClientSeat(s), remain);
            }
        }
        const winner = Number(msg?.winnerSeat ?? -1);
        const resultText = winner === this.seat ? '胜利' : '失败';
        const springText = msg?.spring ? ' 春天' : '';
        this.updateStatus(`${resultText} ${myScore >= 0 ? '+' : ''}${myScore}${springText}`);
        Client.Instance.showPromptTip(`本局${resultText}：${myScore >= 0 ? '+' : ''}${myScore}`, 2.5);
        this.gameState = GameState.Waiting;
        this.setLocalReadyFlags(false);
        this.refreshPaodekuaiHud();
        this.updateReadyButtonState();
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
        if (n === 5 && tripleValue > 0 && this.isTripleWithAnyTwo(counts, tripleValue)) {
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
            const canBeat = !this.pdkIsLeader && !!this.lastPlay && !!this.findSmallestBeatingPlay(this.lastPlay);
            const canPass = !this.pdkIsLeader && (!this.forcePlayIfCanBeat || !canBeat);
            this.pokerActions = { canPlay: true, canHint: true, canPass, isLeader: this.pdkIsLeader, mustPlay: !canPass };
            this.showPassAndPlayButtons(true);
            this.startCountdown(30);
            this.updateStatus(this.pdkIsLeader ? '轮到你出牌' : (canPass ? '要不起可跳过' : '有牌可管，必须出牌'));
        } else {
            this.pokerActions = null;
            this.showPassAndPlayButtons(false);
            this.stopCountdown();
            if (this.gameState === GameState.Playing && this.serverCurrentPlayer >= 0) {
                this.updateStatus('等待对手出牌');
            } else {
                this.updateStatus('等待准备');
            }
        }
    }

    private updateMultiplierDisplay(): void {
        if (this.multiLabel) this.multiLabel.string = `${this.currentMultiplier}倍`;
        this.refreshPaodekuaiHud();
    }

    protected updateScore(score: number): void {
        this.myRoundScore = score;
        this.refreshPaodekuaiHud();
    }

    protected resetRoundState(): void {
        super.resetRoundState();
        this.bombCountThisRound = 0;
        this.currentMultiplier = 1;
        this.myRoundScore = 0;
        this.serverCurrentPlayer = -1;
        this.serverLastPlaySeat = -1;
        this.pdkIsLeader = true;
        this.hasFirstPlayed = false;
    }

    protected showPassAndPlayButtons(show: boolean): void {
        if (this.passGroup) this.passGroup.active = show && !!this.pokerActions?.canPass;
        if (this.playGroup) this.playGroup.active = show;
    }

    protected renderMyHand(): void {
        if (!this.myHandArea) return;
        this.myHandArea.removeAllChildren();

        const gap = this.myCards.length > 14 ? 58 : 66;
        const startX = -((this.myCards.length - 1) * gap) / 2;
        for (let i = 0; i < this.myCards.length; i++) {
            const cardNode = this.createCardNode(this.myCards[i], true);
            cardNode.name = `card_${i}`;
            (cardNode as any)._cardIndex = i;
            cardNode.parent = this.myHandArea;
            cardNode.setPosition(startX + i * gap, this.selectedIndices.has(i) ? 30 : 0, 0);
            cardNode.on(Node.EventType.TOUCH_END, () => this.toggleCardSelection(i), this);
        }
        this.updateCardCountDisplay();
    }

    protected applySelectedStyle(node: Node): void {
        const idx = (node as any)._cardIndex || 0;
        const gap = this.myCards.length > 14 ? 58 : 66;
        const startX = -((this.myCards.length - 1) * gap) / 2;
        node.setPosition(startX + idx * gap, 30, 0);
    }

    protected applyNormalStyle(node: Node): void {
        const idx = (node as any)._cardIndex || 0;
        const gap = this.myCards.length > 14 ? 58 : 66;
        const startX = -((this.myCards.length - 1) * gap) / 2;
        node.setPosition(startX + idx * gap, 0, 0);
    }

    protected showOtherPlay(seatIndex: number, play: CardPlay): void {
        this.renderPlayCards(this.getPlayAreaBySeat(seatIndex), play, 56, 0.82);
    }

    protected showMyPlay(play: CardPlay): void {
        this.renderPlayCards(this.myPlayArea, play, 64, 0.9);
    }

    public updatePlayerCardCount(seatIndex: number, count: number): void {
        super.updatePlayerCardCount(seatIndex, count);
        if (seatIndex === 0) {
            this.updateCardCountDisplay();
        } else if (seatIndex === 1 && this.opponentCountLabel) {
            this.opponentCountLabel.string = count > 0 ? '对手手牌' : '对手无牌';
            this.renderOpponentHandBacks(count);
        }
        this.refreshPaodekuaiHud();
    }

    protected updateCardCountDisplay(): void {
        if (this.cardCountLabel) this.cardCountLabel.string = `${this.myCards.length}张`;
        this.playerCardCounts.set(0, this.myCards.length);
        this.refreshPaodekuaiHud();
    }

    protected createCardNode(card: PokerCard, interactive: boolean): Node {
        const w = interactive ? 78 : 56;
        const h = interactive ? 108 : 78;
        const node = new Node(`card_${card.cardId}`);
        node.layer = 1 << 25;
        node.addComponent(UITransform).setContentSize(w, h);
        (node as any)._cardData = card;

        const g = node.addComponent(Graphics);
        g.fillColor = new Color(255, 252, 238, 255);
        g.roundRect(-w / 2, -h / 2, w, h, 8);
        g.fill();
        g.strokeColor = new Color(50, 62, 76, 255);
        g.lineWidth = 2;
        g.roundRect(-w / 2, -h / 2, w, h, 8);
        g.stroke();

        const labelNode = this.createArea(node, 'Value', 0, 0, w - 8, h - 10);
        const label = labelNode.addComponent(Label);
        label.string = this.cardText(card);
        label.fontSize = interactive ? 22 : 16;
        label.lineHeight = interactive ? 28 : 20;
        label.overflow = Label.Overflow.SHRINK;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = this.isRedCard(card) ? new Color(194, 45, 52, 255) : new Color(28, 37, 48, 255);

        return node;
    }

    private ensurePaodekuaiUI(): void {
        if (this.overlayRoot) {
            if (this.overlayRoot.parent !== this.node) {
                this.overlayRoot.parent = this.node;
            }
            this.ensurePaodekuaiReadyButton();
            return;
        }

        const overlay = new Node('PaodekuaiOverlay');
        overlay.layer = 1 << 25;
        overlay.parent = this.node;
        overlay.addComponent(UITransform).setContentSize(1920, 1080);
        overlay.setPosition(0, 0, 0);
        this.overlayRoot = overlay;

        const hud = this.createArea(overlay, 'PaodekuaiHud', -560, 356, 360, 240);
        this.paintRect(hud, 360, 240, new Color(29, 35, 52, 214), new Color(238, 198, 116, 255), 18);

        this.createLabel(hud, 'Title', '跑得快', 26, 0, 92, 280, 30, new Color(255, 236, 198, 255));
        this.roomInfoLabel = this.createLabel(hud, 'RoomInfo', '', 16, 0, 62, 320, 22, new Color(188, 205, 225, 255));
        this.ruleInfoLabel = this.createLabel(hud, 'RuleInfo', '两人15张 · 赢家先出', 16, 0, 38, 320, 22, new Color(255, 200, 80, 255));
        this.scoreLabel = this.createLabel(hud, 'Score', '本局 0', 22, 0, 10, 300, 26, new Color(255, 255, 255, 255));
        this.multiLabel = this.createLabel(hud, 'Multiplier', '倍数 1倍', 18, 0, -18, 320, 24, new Color(255, 219, 144, 255));
        this.opponentInfoLabel = this.createLabel(hud, 'OpponentInfo', '等待对手入座', 18, 0, -48, 320, 24, new Color(184, 226, 255, 255));
        this.opponentCountLabel = this.createLabel(hud, 'OpponentCount', '对手手牌', 16, 0, -76, 320, 22, new Color(188, 205, 225, 255));

        this.statusLabel = this.createLabel(overlay, 'Status', '', 28, 0, 248, 560, 44, new Color(255, 226, 136, 255));
        this.cardCountLabel = this.createLabel(overlay, 'MyCount', '0张', 22, 0, -292, 180, 36, new Color(240, 240, 240, 255));

        this.myHandArea = this.createArea(overlay, 'MyHand', 0, -390, 1240, 140);
        this.myPlayArea = this.createArea(overlay, 'MyPlay', 0, -120, 760, 98);
        this.leftPlayArea = this.createArea(overlay, 'OpponentPlay', 0, 118, 760, 98);
        this.opponentHandArea = this.createArea(overlay, 'OpponentHand', 0, 302, 760, 82);

        this.passGroup = this.createArea(overlay, 'PassGroup', -92, -242, 120, 52);
        this.playGroup = this.createArea(overlay, 'PlayGroup', 92, -242, 250, 52);
        this.createTextButton(this.passGroup, '要不起', 0, 0, 'pass', new Color(92, 99, 112, 235));
        this.createTextButton(this.playGroup, '提示', -68, 0, 'hint', new Color(60, 128, 170, 235));
        this.createTextButton(this.playGroup, '出牌', 68, 0, 'playSelectedCards', new Color(46, 139, 87, 235));
        this.ensurePaodekuaiReadyButton();
        this.showPassAndPlayButtons(false);
    }

    private ensurePaodekuaiReadyButton(): void {
        if (!this.overlayRoot) return;

        if (this.readyGroup && this.readyGroup !== this.pdkReadyGroup) {
            this.readyGroup.active = false;
        }

        if (this.pdkReadyGroup) {
            this.readyGroup = this.pdkReadyGroup;
            this.btnReady = this.findChildByName(this.pdkReadyGroup, 'BtnReady');
            this.btnReadyLabel = this.btnReady ? this.findChildComponent<Label>(this.btnReady, 'Label', Label) : null;
            return;
        }

        const readyRoot = this.createArea(this.overlayRoot, 'PaodekuaiReadyGroup', 0, -242, 180, 58);
        this.pdkReadyGroup = readyRoot;
        this.readyGroup = readyRoot;
        this.btnReady = this.createTextButton(readyRoot, '准备', 0, 0, 'onReadyClick', new Color(196, 118, 37, 238), 'BtnReady');
        this.btnReadyLabel = this.findChildComponent<Label>(this.btnReady, 'Label', Label);
        this.readyGroup.active = false;
    }

    private createArea(parent: Node, name: string, x: number, y: number, w: number, h: number): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        node.parent = parent;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(x, y, 0);
        return node;
    }

    private paintRect(node: Node, w: number, h: number, fill: Color, stroke?: Color, radius: number = 8): void {
        const g = node.getComponent(Graphics) || node.addComponent(Graphics);
        g.clear();
        g.fillColor = fill;
        g.roundRect(-w / 2, -h / 2, w, h, radius);
        g.fill();
        if (stroke) {
            g.strokeColor = stroke;
            g.lineWidth = 2;
            g.roundRect(-w / 2, -h / 2, w, h, radius);
            g.stroke();
        }
    }

    private createLabel(parent: Node, name: string, text: string, size: number, x: number, y: number, w: number, h: number, color: Color): Label {
        const node = this.createArea(parent, name, x, y, w, h);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size + 8;
        label.overflow = Label.Overflow.SHRINK;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = color;
        return label;
    }

    private createTextButton(parent: Node, text: string, x: number, y: number, handler: string, color: Color, nodeName: string = handler): Node {
        const node = this.createArea(parent, nodeName, x, y, 112, 44);
        const g = node.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-56, -22, 112, 44, 8);
        g.fill();

        const labelNode = this.createArea(node, 'Label', 0, 0, 104, 36);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 20;
        label.lineHeight = 26;
        label.overflow = Label.Overflow.SHRINK;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(255, 255, 255, 255);

        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 1.05;
        const evt = new EventHandler();
        evt.target = this.node;
        evt.component = 'PaodekuaiRoom';
        evt.handler = handler;
        button.clickEvents.push(evt);
        return node;
    }

    private refreshPaodekuaiHud(): void {
        if (!this.overlayRoot) return;
        if (this.roomInfoLabel) {
            const roomNo = this.roomNumber || this.roomInfo?.roomNo || '--';
            const current = Number(this.currentRound || this.roomInfo?.currentRound || 0);
            const total = Number(this.roundCount || this.totalRounds || this.roomInfo?.totalRounds || 0);
            const roundText = total > 0 ? `${current || 0}/${total}` : `${current || 0}`;
            this.roomInfoLabel.string = `房号 ${roomNo}   局数 ${roundText}   底分 ${this.baseScore}`;
        }
        if (this.ruleInfoLabel) {
            this.ruleInfoLabel.string = '首局随机先出 · 赢家先出 · 有牌必出';
        }
        if (this.scoreLabel) this.scoreLabel.string = `本局 ${this.myRoundScore}`;
        if (this.multiLabel) this.multiLabel.string = `倍数 ${this.currentMultiplier || 1}倍`;
        if (this.opponentInfoLabel) this.opponentInfoLabel.string = this.getOpponentInfoText();
    }

    private getOpponentInfoText(): string {
        const opponentSeat = this.getOpponentServerSeat();
        const info = opponentSeat >= 0 ? this.playerInfos[opponentSeat] : null;
        if (!info) return '等待对手入座';
        const name = info.nickname || info.playerId || '对手';
        const status = this.gameState === GameState.Playing ? '游戏中' : (info.ready ? '已准备' : '未准备');
        const gold = Number(info.gold || 0);
        return gold > 0 ? `${name} · ${status} · ${gold}` : `${name} · ${status}`;
    }

    private getOpponentServerSeat(): number {
        if (this.seat >= 0) return (this.seat + 1) % 2;
        if (this.playerInfos[1]) return 1;
        if (this.playerInfos[0]) return 0;
        return -1;
    }

    private renderOpponentHandBacks(count: number): void {
        if (!this.opponentHandArea) return;
        this.opponentHandArea.removeAllChildren();
        if (count <= 0) return;

        const shown = 10;
        const gap = 34;
        const startX = -((shown - 1) * gap) / 2;
        for (let i = 0; i < shown; i++) {
            const node = this.createCardBackNode();
            node.parent = this.opponentHandArea;
            node.setPosition(startX + i * gap, 0, 0);
        }
    }

    private createCardBackNode(): Node {
        const w = 46;
        const h = 64;
        const node = new Node('OpponentCardBack');
        node.layer = 1 << 25;
        node.addComponent(UITransform).setContentSize(w, h);
        const g = node.addComponent(Graphics);
        g.fillColor = new Color(39, 85, 142, 255);
        g.roundRect(-w / 2, -h / 2, w, h, 7);
        g.fill();
        g.strokeColor = new Color(224, 236, 255, 255);
        g.lineWidth = 2;
        g.roundRect(-w / 2, -h / 2, w, h, 7);
        g.stroke();
        g.fillColor = new Color(76, 135, 200, 255);
        g.roundRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 5);
        g.fill();
        return node;
    }

    private renderPlayCards(area: Node | null, play: CardPlay, gap: number, scale: number): void {
        if (!area) return;
        area.removeAllChildren();
        const startX = -((play.cards.length - 1) * gap) / 2;
        play.cards.forEach((card, idx) => {
            const node = this.createCardNode(card, false);
            node.parent = area;
            node.setScale(new Vec3(scale, scale, 1));
            node.setPosition(startX + idx * gap, 0, 0);
        });
    }

    private showPassAtSeat(clientSeat: number): void {
        const area = this.getPlayAreaBySeat(clientSeat);
        if (!area) return;
        area.removeAllChildren();
        this.createLabel(area, 'PassText', '要不起', 24, 0, 0, 120, 42, new Color(210, 220, 230, 255));
    }

    private hideGuanDanPokerNodes(): void {
        const names = ['CardLayout', 'CardPlayedOut', 'CardBacks'];
        for (const name of names) {
            const node = this.findChildRecursive(this.node, name);
            if (node) node.active = false;
        }
    }

    private updateStatus(text: string): void {
        if (this.statusLabel) this.statusLabel.string = text;
    }

    private setLocalReadyFlags(ready: boolean): void {
        for (let s = 0; s < 2; s++) {
            if (this.playerInfos[s]) this.playerInfos[s].ready = ready;
            const clientSeat = this.server2ClientSeat(s);
            if (this.readyFlags[clientSeat]) this.readyFlags[clientSeat].active = ready;
            const playerView = this.guanDanPlayers[clientSeat] as any;
            if (playerView && typeof playerView.setReady === 'function') {
                playerView.setReady(ready);
            }
        }
    }

    private cardText(card: PokerCard): string {
        const valueText = card.value === 14 ? 'A' :
            card.value === 15 ? '2' :
            card.value === 13 ? 'K' :
            card.value === 12 ? 'Q' :
            card.value === 11 ? 'J' : String(card.value);
        const suits = ['♠', '♥', '♣', '♦'];
        return `${valueText}\n${suits[card.suit] || ''}`;
    }

    private isRedCard(card: PokerCard): boolean {
        return card.suit === 1 || card.suit === 3;
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

    private isTripleWithAnyTwo(counts: Map<number, number>, tripleValue: number): boolean {
        if ((counts.get(tripleValue) || 0) !== 3) return false;
        let mates = 0;
        for (const [value, count] of counts) {
            if (value === tripleValue) continue;
            if (count > 2) return false;
            mates += count;
        }
        return mates === 2;
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
