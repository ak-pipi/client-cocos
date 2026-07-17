/**
 * 斗地主 (DoudizhuRoom)
 * 两人斗地主客户端协议适配：DouDiZhu.Sync / Call / Play。
 */

import { _decorator, Node, Label, Color, Graphics, Button, UITransform, Vec3, EventTouch, BlockInputEvents } from 'cc';
import { PokerRoomBase, PokerCard, CardPlay, PokerAvailableActions } from '../../GameCommon/PokerRoomBase';
import { PokerPattern, RoomState } from '../../GameCommon/GameTypes';
import { GameState } from '../../GameCommon/RoomBase';
import { NetworkManager } from '../../Manager/NetworkManager';
import { Client } from '../../Game/Client';

const { ccclass } = _decorator;
const DOUDIZHU_PLAY_COUNTDOWN_SECONDS = 180;

enum DoudizhuState {
    None = 0,
    Ready = 1,
    Bidding = 2,
    Playing = 3,
    Settling = 4,
}

@ccclass('DoudizhuRoom')
export class DoudizhuRoom extends PokerRoomBase {
    private statusLabel: Label | null = null;
    private opponentCountLabel: Label | null = null;
    private bottomCardsArea: Node | null = null;
    private callPanel: Node | null = null;
    private overlayRoot: Node | null = null;
    private settlementPanel: Node | null = null;
    private settlementTitleLabel: Label | null = null;
    private settlementScoreLabel: Label | null = null;
    private settlementDetailLabel: Label | null = null;
    private settlementRemainLabel: Label | null = null;
    private controlBarNode: Node | null = null;
    private customReadyButton: Node | null = null;
    private customReadyLabel: Label | null = null;
    private customStartButton: Node | null = null;
    private customStartLabel: Label | null = null;
    private tableBackgroundNode: Node | null = null;
    private roomInfoLabel: Label | null = null;
    private roundInfoLabel: Label | null = null;
    private ruleHintLabel: Label | null = null;
    private playerInfoRoot: Node | null = null;
    private playerNameLabels: (Label | null)[] = [null, null];
    private playerGoldLabels: (Label | null)[] = [null, null];
    private playerStateLabels: (Label | null)[] = [null, null];
    private playerCardRoots: (Node | null)[] = [null, null];
    private fallbackBackButton: Node | null = null;
    private dragSelectStartIndex: number = -1;
    private dragSelectCurrentIndex: number = -1;
    private dragSelectStartX: number = 0;
    private dragSelectStartY: number = 0;
    private isDragSelecting: boolean = false;

    private landlordSeat: number = -1;
    private bankerSeat: number = -1;
    private highestBid: number = 0;
    private highestBidSeat: number = -1;
    private lastServerPlaySeat: number = -1;
    private baseScore: number = 1;

    protected get pokerMsgPrefix(): string { return 'DouDiZhu.'; }

    start(): void {
        this.gameId = 'doudizhu_poker';
        this.syncMsgPrefix = this.pokerMsgPrefix;
        super.start();
        this.ensureDoudizhuUI();
        this.updateStatus('等待准备');
    }

    protected getSeatCount(): number { return 2; }

    protected bindPrefabNodes(): void {
        super.bindPrefabNodes();
        this.hideGuanDanPokerNodes();
        this.ensureDoudizhuUI();
    }

    protected onSyncGameUIUpdate(isSitting: boolean): void {
        super.onSyncGameUIUpdate(isSitting);
        this.refreshDoudizhuHud();
        this.refreshDoudizhuPlayers();
        if (isSitting || this.seat !== -1) this.updateReadyButtonState();
    }

    public onMessage(msgType: string, msg: any): boolean {
        if (msgType === 'DouDiZhu.SyncResp') {
            this.onDoudizhuSyncResp(msg);
            return true;
        }
        if (super.onMessage(msgType, msg)) return true;

        if (msgType === 'DouDiZhu.Deal') this.onDoudizhuDeal(msg);
        else if (msgType === 'DouDiZhu.CallNotify') this.onDoudizhuCallNotify(msg);
        else if (msgType === 'DouDiZhu.Landlord') this.onDoudizhuLandlord(msg);
        else if (msgType === 'DouDiZhu.PlayNotify') this.onDoudizhuPlayNotify(msg);
        else if (msgType === 'DouDiZhu.PlayFailed') this.onDoudizhuPlayFailed(msg);
        else if (msgType === 'DouDiZhu.Settlement') this.onDoudizhuSettlement(msg);
        else return false;
        return true;
    }

    public onReadyClick(): void {
        if (this.seat === -1) return;
        NetworkManager.Instance.sendInnerMessage('DouDiZhu.Ready');
        this.markSelfReadyLocally();
    }

    public onStartGameClick(): void {
        this.onReadyClick();
    }

    public call0(): void { this.callScore(0); }
    public call1(): void { this.callScore(1); }
    public call2(): void { this.callScore(2); }
    public call3(): void { this.callScore(3); }

    public closeSettlementPanel(): void {
        this.hideSettlementPanel();
    }

    public pass(): void {
        if (!this.isMyTurn || !this.pokerActions?.canPass) return;
        NetworkManager.Instance.sendInnerMessage('DouDiZhu.Play', { cardIds: [] });
        this.clearSelection();
        this.isMyTurn = false;
        this.showPassAndPlayButtons(false);
        this.stopCountdown();
    }

    public hint(): void {
        if (!this.isMyTurn) return;
        const currentKey = this.getSelectedIndicesKey();
        const candidates = this.buildHintCandidates();
        if (candidates.length === 0) {
            this.clearSelection();
            Client.Instance.showPromptTip(this.lastPlay ? '要不起' : '无可提示牌型', 1.2);
            return;
        }

        const currentIndex = candidates.findIndex(item => this.getIndicesKey(item.indices) === currentKey);
        const next = candidates[(currentIndex + 1) % candidates.length];
        this.selectedIndices.clear();
        for (const idx of next.indices) this.selectedIndices.add(idx);
        this.renderMyHand();
    }

    public toggleCardSelection(cardIndex: number): void {
        if (!this.isMyTurn) return;
        if (this.selectedIndices.has(cardIndex)) this.selectedIndices.delete(cardIndex);
        else this.selectedIndices.add(cardIndex);
        this.applyHandSelectionVisuals();
        this.pokerCallbacks.onSelectionChanged?.([...this.selectedIndices]);
    }

    public playSelectedCards(): void {
        if (!this.isMyTurn || this.selectedIndices.size === 0) return;

        const indices = [...this.selectedIndices].sort((a, b) => a - b);
        const selectedCards = indices.map(idx => this.myCards[idx]).filter(Boolean);
        const pattern = this.recognizePattern(selectedCards);
        if (!pattern) {
            this.playErrorSound();
            Client.Instance.showPromptTip('牌型不正确', 1.5);
            return;
        }
        if (!this.pokerActions?.isLeader && this.lastPlay && !this.canBeat(pattern, this.lastPlay)) {
            this.playErrorSound();
            Client.Instance.showPromptTip('要不起', 1.5);
            return;
        }

        NetworkManager.Instance.sendInnerMessage('DouDiZhu.Play', {
            cardIds: selectedCards.map(c => Number(c.cardId)),
        });
        this.isMyTurn = false;
        this.showPassAndPlayButtons(false);
        this.stopCountdown();
    }

    protected onAutoAction(): void {
        if (!this.isMyTurn) return;
        if (this.pokerActions?.canPass) {
            this.pass();
            return;
        }
        this.hint();
        if (this.selectedIndices.size > 0) this.playSelectedCards();
    }

    protected recognizePattern(cards: PokerCard[]): CardPlay | null {
        const n = cards.length;
        if (n === 0) return null;

        const values = cards.map(c => c.value).sort((a, b) => a - b);
        if (n === 2 && this.isRocket(values)) {
            return { pattern: PokerPattern.Rocket, cards, weight: 1000 };
        }
        if (n === 2 && values[0] === values[1]) {
            return { pattern: PokerPattern.Pair, cards, weight: values[0] };
        }

        const base = super.recognizePattern(cards);
        if (base) return base;

        const counts = this.countValues(values);
        const plane = this.recognizePlane(cards, counts);
        if (plane) return plane;

        const fourWithTwo = this.recognizeFourWithTwo(cards, counts);
        if (fourWithTwo) return fourWithTwo;

        return null;
    }

    protected canBeat(play: CardPlay, target: CardPlay): boolean {
        if (play.pattern === PokerPattern.Rocket) return true;
        if (target.pattern === PokerPattern.Rocket) return false;
        if (play.pattern === PokerPattern.Bomb && target.pattern !== PokerPattern.Bomb) return true;
        if (target.pattern === PokerPattern.Bomb && play.pattern !== PokerPattern.Bomb) return false;
        if (play.pattern !== target.pattern) return false;
        if (play.cards.length !== target.cards.length) return false;
        return play.weight > target.weight;
    }

    protected findSmallestBeatingPlay(target: CardPlay): { indices: number[]; play: CardPlay } | null {
        return this.buildHintCandidates(target)[0] || null;
    }

    protected renderMyHand(): void {
        if (!this.myHandArea) return;
        this.myHandArea.removeAllChildren();

        const layout = this.getMyHandLayout();
        for (let i = 0; i < this.myCards.length; i++) {
            const cardNode = this.createCardNode(this.myCards[i], true);
            cardNode.name = `card_${i}`;
            (cardNode as any)._cardIndex = i;
            (cardNode as any)._cardId = this.myCards[i].cardId;
            cardNode.parent = this.myHandArea;
            cardNode.setPosition(layout.startX + i * layout.gap, this.selectedIndices.has(i) ? 28 : 0, 0);
            this.attachCardTouchArea(cardNode, i, i === this.myCards.length - 1, layout);
        }
        this.updateCardCountDisplay();
    }

    protected updateReadyButtonState(): void {
        const canReady = this.seat !== -1 && this.gameState === GameState.Waiting && !this.isAllRoundsFinished();
        const selfInfo = this.seat !== -1 ? this.playerInfos[this.seat] : null;
        const ready = !!selfInfo?.ready;
        const isOwner = this.seat !== -1 && this.seat === this.ownerSeat;

        if (this.readyGroup) this.readyGroup.active = false;
        if (this.btnReady) this.btnReady.active = false;
        if (this.btnReadyLabel) this.btnReadyLabel.string = ready ? '已准备' : '准备';
        if (this.btnStartGame) this.btnStartGame.active = false;

        if (this.controlBarNode) this.controlBarNode.active = canReady;
        if (this.customReadyButton) this.customReadyButton.active = canReady;
        if (this.customReadyLabel) this.customReadyLabel.string = ready ? '已准备' : '准备';
        if (this.customStartButton) this.customStartButton.active = canReady && isOwner;
        if (this.customStartLabel) this.customStartLabel.string = '开始';

        this.refreshDoudizhuPlayers();
        if (this.isAllRoundsFinished()) this.updateStatus('全部对局结束');
    }

    protected onPlayerReadyUIUpdate(seatIndex: number): void {
        super.onPlayerReadyUIUpdate(seatIndex);
        this.updateDoudizhuReadyButtonLabel();
    }

    protected onPlayerAdded(seatIndex: number, playerInfo: any): void {
        super.onPlayerAdded(seatIndex, playerInfo);
        this.refreshDoudizhuPlayers();
        this.updateReadyButtonState();
    }

    protected onPlayerRemoved(seatIndex: number): void {
        super.onPlayerRemoved(seatIndex);
        this.refreshDoudizhuPlayers();
        this.updateReadyButtonState();
    }

    protected onPlayerOfflineChanged(seatIndex: number, offline: boolean): void {
        super.onPlayerOfflineChanged(seatIndex, offline);
        this.refreshDoudizhuPlayers();
    }

    protected applySelectedStyle(node: Node): void {
        const idx = (node as any)._cardIndex ?? 0;
        const layout = this.getMyHandLayout();
        node.setPosition(layout.startX + idx * layout.gap, 28, 0);
    }

    protected applyNormalStyle(node: Node): void {
        const idx = (node as any)._cardIndex ?? 0;
        const layout = this.getMyHandLayout();
        node.setPosition(layout.startX + idx * layout.gap, 0, 0);
    }

    protected showOtherPlay(seatIndex: number, play: CardPlay): void {
        this.renderPlayCards(this.getPlayAreaBySeat(seatIndex), play, 52, 0.86);
    }

    protected showMyPlay(play: CardPlay): void {
        this.renderPlayCards(this.myPlayArea, play, 58, 0.94);
    }

    protected createCardNode(card: PokerCard, interactive: boolean): Node {
        const w = interactive ? 78 : 54;
        const h = interactive ? 108 : 74;
        const node = new Node(`card_${card.cardId}`);
        node.layer = 1 << 25;
        node.addComponent(UITransform).setContentSize(w, h);
        (node as any)._cardData = card;

        const g = node.addComponent(Graphics);
        g.fillColor = new Color(248, 248, 236, 255);
        g.roundRect(-w / 2, -h / 2, w, h, 8);
        g.fill();
        g.strokeColor = new Color(55, 70, 82, 255);
        g.lineWidth = 2;
        g.roundRect(-w / 2, -h / 2, w, h, 8);
        g.stroke();

        const valueNode = new Node('Value');
        valueNode.layer = node.layer;
        valueNode.parent = node;
        valueNode.addComponent(UITransform).setContentSize(w - 8, h - 10);
        const label = valueNode.addComponent(Label);
        label.string = this.cardText(card);
        label.fontSize = interactive ? 22 : 16;
        label.lineHeight = interactive ? 28 : 20;
        label.overflow = Label.Overflow.SHRINK;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = this.isRedCard(card) ? new Color(190, 42, 45, 255) : new Color(25, 34, 45, 255);

        return node;
    }

    private onDoudizhuSyncResp(msg: any): void {
        const state = Number(msg.gameState ?? DoudizhuState.None);
        this.hideSettlementPanel();
        const waitingState = state === DoudizhuState.None || state === DoudizhuState.Ready;
        this.seat = Number(msg.mySeat ?? this.seat);
        this.landlordSeat = Number(msg.landlordSeat ?? -1);
        this.bankerSeat = Number(msg.banker ?? msg.callStarter ?? this.bankerSeat);
        this.highestBid = Number(msg.highestBid ?? 0);
        this.highestBidSeat = Number(msg.highestBidSeat ?? -1);
        this.currentMultiplier = Number(msg.multiplier ?? 1) || 1;
        this.currentRound = Number(msg.roundNo ?? this.currentRound) || 0;
        if (msg.baseScore !== undefined) this.baseScore = Number(msg.baseScore) || this.baseScore;
        if (msg.number !== undefined) this.roomNumber = String(msg.number);
        if (msg.level !== undefined) this.level = Number(msg.level) || this.level;
        if (msg.roundCount !== undefined) {
            const roundCount = Number(msg.roundCount);
            this.totalRounds = isNaN(roundCount) ? 0 : roundCount;
        }
        this.gameState = waitingState ? GameState.Waiting : GameState.Playing;
        this.currentState = waitingState ? RoomState.Waiting :
            (state === DoudizhuState.Settling ? RoomState.RoundSettlement : RoomState.Playing);

        this.ingestSyncAvatars(msg);
        if (Array.isArray(msg.myCards)) this.dealCards(this.toPokerCards(msg.myCards));
        this.renderBottomCards(msg.bottomCards || []);
        this.updateHandCounts(msg.handCounts);
        this.updateMultiplierLabel();
        this.refreshDoudizhuHud();
        this.onSyncGameUIUpdate(this.seat === -1);
        this.updateRoomDisplay();
        this.updateReadyButtonState();

        if (state === DoudizhuState.Bidding) {
            this.showCallPanel(Number(msg.callTurn) === this.seat);
            this.updateStatus(Number(msg.callTurn) === this.seat ? '轮到你叫地主' : '等待对手叫地主');
        } else if (state === DoudizhuState.Playing) {
            this.showCallPanel(false);
            const lastCards = Array.isArray(msg.lastPlayCards) ? msg.lastPlayCards : [];
            if (lastCards.length > 0) {
                const cards = this.toPokerCards(lastCards);
                this.lastPlay = this.recognizePattern(cards);
                this.lastServerPlaySeat = Number(msg.lastPlaySeat ?? -1);
                this.showPlayForSeat(this.lastServerPlaySeat, lastCards, Number(msg.lastPlayGenre ?? 0));
            }
            this.setTurn(Number(msg.currentPlayer), !!msg.isFirstPlay);
        } else {
            this.showCallPanel(false);
            this.showPassAndPlayButtons(false);
            this.updateStatus(this.isAllRoundsFinished() ? '全部对局结束' : '等待准备');
        }
    }

    private onDoudizhuDeal(msg: any): void {
        this.resetRoundState();
        this.hideSettlementPanel();
        this.gameState = GameState.Playing;
        this.currentState = RoomState.Playing;
        this.setLocalReadyFlags(false);
        if (this.readyGroup) this.readyGroup.active = false;
        if (this.btnReady) this.btnReady.active = false;
        if (this.btnStartGame) this.btnStartGame.active = false;
        this.updateReadyButtonState();
        this.currentRound = Number(msg.roundNo ?? this.currentRound) || 0;
        if (msg.roundCount !== undefined) {
            const roundCount = Number(msg.roundCount);
            this.totalRounds = isNaN(roundCount) ? 0 : roundCount;
        }
        if (msg.baseScore !== undefined) this.baseScore = Number(msg.baseScore) || this.baseScore;
        this.dealCards(this.toPokerCards(msg.cards || []));
        this.updateHandCounts(msg.handCounts);
        this.renderBottomCards([]);
        this.highestBid = 0;
        this.highestBidSeat = -1;
        this.landlordSeat = -1;
        this.bankerSeat = Number(msg.banker ?? msg.callStarter ?? -1);
        this.currentMultiplier = 1;
        this.updateMultiplierLabel();
        this.refreshDoudizhuHud();
        this.showCallPanel(Number(msg.callStarter) === this.seat);
        this.updateStatus(Number(msg.callStarter) === this.seat ? '轮到你叫地主' : '等待对手叫地主');
    }

    private onDoudizhuCallNotify(msg: any): void {
        const seat = Number(msg.seat);
        const score = Number(msg.score ?? 0);
        this.highestBid = Number(msg.highestBid ?? 0);
        this.highestBidSeat = Number(msg.highestBidSeat ?? -1);
        const callText = score > 0 ? `${score}分` : '不叫';
        this.updateStatus(`${seat === this.seat ? '你' : '对手'}叫分：${callText}`);
        const nextSeat = Number(msg.nextSeat ?? -1);
        this.showCallPanel(nextSeat === this.seat);
        if (nextSeat === this.seat) {
            this.updateStatus('轮到你叫地主');
        }
    }

    private onDoudizhuLandlord(msg: any): void {
        this.landlordSeat = Number(msg.landlordSeat ?? -1);
        this.bankerSeat = this.landlordSeat;
        this.currentMultiplier = Number(msg.multiplier ?? 1) || 1;
        this.renderBottomCards(msg.bottomCards || []);
        this.updateHandCounts(msg.handCounts);
        this.updateMultiplierLabel();
        this.refreshDoudizhuHud();

        if (this.landlordSeat === this.seat) {
            const existing = new Set(this.myCards.map(c => c.cardId));
            for (const card of this.toPokerCards(msg.bottomCards || [])) {
                if (!existing.has(card.cardId)) this.myCards.push(card);
            }
            this.sortHandCards();
            this.renderMyHand();
        }
        this.showCallPanel(false);
        this.setTurn(Number(msg.currentPlayer), true);
        this.updateStatus(this.landlordSeat === this.seat ? '你是地主' : '对手是地主');
    }

    private onDoudizhuPlayNotify(msg: any): void {
        const serverSeat = Number(msg.seat);
        const ids: number[] = Array.isArray(msg.cardIds) ? msg.cardIds : [];
        const clientSeat = this.server2ClientSeat(serverSeat);

        if (ids.length > 0) {
            const cards = this.toPokerCards(ids);
            const play = this.recognizePattern(cards) || { pattern: this.patternByGenre(Number(msg.genre)), cards, weight: cards[0]?.value || 0 };
            this.lastPlay = play;
            this.lastServerPlaySeat = serverSeat;

            if (clientSeat === 0) {
                const idSet = new Set(ids.map(id => String(id)));
                this.myCards = this.myCards.filter(c => !idSet.has(c.cardId));
                this.selectedIndices.clear();
                this.renderMyHand();
                this.showMyPlay(play);
            } else {
                this.showOtherPlay(clientSeat, play);
            }
        } else {
            this.showPassAtSeat(clientSeat);
            if (Number(msg.nextPlayer) === this.lastServerPlaySeat) {
                this.lastPlay = null;
                this.lastServerPlaySeat = -1;
            }
        }

        this.currentMultiplier = Number(msg.multiplier ?? this.currentMultiplier) || 1;
        this.updateHandCounts(msg.handCounts);
        this.updateMultiplierLabel();
        this.refreshDoudizhuHud();
        this.setTurn(Number(msg.nextPlayer), this.lastPlay === null);
    }

    private onDoudizhuPlayFailed(msg: any): void {
        this.playErrorSound();
        Client.Instance.showPromptTip(msg?.errMsg || '出牌失败', 1.8);
        this.isMyTurn = true;
        this.showPassAndPlayButtons(true);
        this.startCountdown(DOUDIZHU_PLAY_COUNTDOWN_SECONDS);
    }

    private onDoudizhuSettlement(msg: any): void {
        this.isMyTurn = false;
        this.showPassAndPlayButtons(false);
        this.showCallPanel(false);
        this.stopCountdown();
        this.currentState = RoomState.RoundSettlement;

        const scores = this.arrayLikeToArray(msg.scores);
        const myScore = scores[this.seat] ?? 0;
        const winnerSeat = Number(msg.winnerSeat ?? -1);
        const springText = msg.spring ? ' 春天' : '';
        this.updateStatus(`${winnerSeat === this.seat ? '胜利' : '失败'} ${myScore >= 0 ? '+' : ''}${myScore}${springText}`);
        this.showSettlementPanel(msg, scores, myScore, winnerSeat);
        Client.Instance.showPromptTip(`本局${winnerSeat === this.seat ? '胜利' : '失败'}：${myScore >= 0 ? '+' : ''}${myScore}`, 2.5);
        this.gameState = GameState.Waiting;
        this.setLocalReadyFlags(false);
        if (this.readyGroup) this.readyGroup.active = false;
        this.updateReadyButtonState();
    }

    private callScore(score: number): void {
        if (!this.callPanel?.active) return;
        NetworkManager.Instance.sendInnerMessage('DouDiZhu.Call', { score });
        this.showCallPanel(false);
    }

    private showCallPanel(show: boolean): void {
        if (this.callPanel) this.callPanel.active = show;
    }

    private setTurn(serverSeat: number, isLeader: boolean): void {
        this.isMyTurn = serverSeat === this.seat;
        if (this.isMyTurn) {
            const actions: PokerAvailableActions = {
                canPlay: true,
                canHint: true,
                canPass: !isLeader,
                isLeader,
                mustPlay: isLeader,
            };
            this.pokerActions = actions;
            this.showPassAndPlayButtons(true);
            this.startCountdown(DOUDIZHU_PLAY_COUNTDOWN_SECONDS);
            this.updateStatus(isLeader ? '轮到你出牌' : '轮到你跟牌');
        } else {
            this.pokerActions = null;
            this.showPassAndPlayButtons(false);
            this.stopCountdown();
            if (serverSeat >= 0) this.updateStatus('等待对手出牌');
        }
    }

    private ensureDoudizhuUI(): void {
        if (this.overlayRoot) return;

        const parent = this.node;
        if (this.desktopUILayer) this.desktopUILayer.active = true;
        this.hideGuanDanPokerNodes();

        const overlay = new Node('DoudizhuOverlay');
        overlay.layer = 1 << 25;
        overlay.parent = parent;
        overlay.addComponent(UITransform).setContentSize(1680, 920);
        overlay.setPosition(0, 0, 0);
        overlay.setSiblingIndex(parent.children.length - 1);
        this.overlayRoot = overlay;

        this.tableBackgroundNode = this.createArea(overlay, 'TableBackground', 0, 0, 1680, 920);
        this.paintRect(this.tableBackgroundNode, 1680, 920, new Color(42, 96, 74, 255), new Color(18, 50, 38, 255), 18);

        const topHud = this.createArea(overlay, 'TopHud', 0, 420, 1240, 74);
        this.paintRect(topHud, 1240, 74, new Color(14, 31, 44, 210), new Color(214, 182, 116, 255), 18);
        this.roomInfoLabel = this.createLabel(topHud, 'RoomInfo', '', 22, -380, 0, 360, 40, new Color(255, 240, 202, 255));
        this.statusLabel = this.createLabel(topHud, 'Status', '', 28, 0, 0, 390, 44, new Color(255, 255, 255, 255));
        this.roundInfoLabel = this.createLabel(topHud, 'RoundInfo', '', 22, 360, 0, 280, 40, new Color(255, 229, 143, 255));

        const infoPanel = this.createArea(overlay, 'DoudizhuHud', -560, 266, 360, 240);
        this.paintRect(infoPanel, 360, 240, new Color(29, 35, 52, 214), new Color(238, 198, 116, 255), 18);
        this.createLabel(infoPanel, 'Title', '斗地主', 26, 0, 92, 280, 32, new Color(255, 236, 198, 255));
        this.ruleHintLabel = this.createLabel(infoPanel, 'RuleHint', '', 16, 0, 62, 320, 24, new Color(188, 205, 225, 255));
        this.multiLabel = this.createLabel(infoPanel, 'Multiplier', '1倍', 22, 0, 28, 300, 28, new Color(255, 255, 255, 255));
        this.cardCountLabel = this.createLabel(infoPanel, 'MyCount', '0张', 18, 0, -8, 320, 24, new Color(255, 219, 144, 255));
        this.opponentCountLabel = this.createLabel(infoPanel, 'OpponentCount', '对手 0张', 18, 0, -40, 320, 24, new Color(184, 226, 255, 255));
        this.createLabel(infoPanel, 'Tip', '两人对战 · 叫地主后出牌', 16, 0, -74, 320, 22, new Color(230, 235, 238, 255));

        this.bottomCardsArea = this.createArea(overlay, 'BottomCards', 0, 318, 280, 80);
        this.paintRect(this.bottomCardsArea, 280, 80, new Color(19, 24, 35, 120), new Color(214, 182, 116, 180), 14);
        this.myHandArea = this.createArea(overlay, 'MyHand', 0, -388, 1260, 140);
        this.myPlayArea = this.createArea(overlay, 'MyPlay', 0, -112, 720, 110);
        this.leftPlayArea = this.createArea(overlay, 'OpponentPlay', 0, 106, 720, 110);

        this.callPanel = this.createArea(overlay, 'CallPanel', 0, -242, 520, 64);
        this.createTextButton(this.callPanel, '不叫', -195, 0, 'call0', new Color(92, 99, 112, 235));
        this.createTextButton(this.callPanel, '1分', -65, 0, 'call1', new Color(60, 128, 170, 235));
        this.createTextButton(this.callPanel, '2分', 65, 0, 'call2', new Color(60, 128, 170, 235));
        this.createTextButton(this.callPanel, '3分', 195, 0, 'call3', new Color(198, 93, 58, 235));
        this.callPanel.active = false;

        this.passGroup = this.createArea(overlay, 'PassGroup', -86, -242, 120, 52);
        this.playGroup = this.createArea(overlay, 'PlayGroup', 92, -242, 250, 52);
        this.createTextButton(this.passGroup, '不要', 0, 0, 'pass', new Color(92, 99, 112, 235));
        this.createTextButton(this.playGroup, '提示', -68, 0, 'hint', new Color(60, 128, 170, 235));
        this.createTextButton(this.playGroup, '出牌', 68, 0, 'playSelectedCards', new Color(46, 139, 87, 235));
        this.showPassAndPlayButtons(false);

        this.ensureDoudizhuPlayerInfo(overlay);
        this.ensureDoudizhuControls(overlay);
        this.ensureDoudizhuBackButton(overlay);
        this.ensureSettlementPanel(overlay);
        this.refreshDoudizhuHud();
        this.refreshDoudizhuPlayers();
        this.updateReadyButtonState();
    }

    private ensureDoudizhuControls(parent: Node): void {
        if (this.controlBarNode) return;

        this.controlBarNode = this.createArea(parent, 'DoudizhuControlBar', 520, 420, 280, 56);
        this.customReadyButton = this.createActionButton(this.controlBarNode, 'ReadyBtn', '准备', -68, 0, 120,
            new Color(46, 128, 88, 255), new Color(133, 231, 174, 255), 'onReadyClick');
        this.customReadyLabel = this.findChildComponent<Label>(this.customReadyButton, 'Label', Label);
        this.customStartButton = this.createActionButton(this.controlBarNode, 'StartBtn', '开始', 68, 0, 120,
            new Color(191, 122, 36, 255), new Color(255, 214, 138, 255), 'onStartGameClick');
        this.customStartLabel = this.findChildComponent<Label>(this.customStartButton, 'Label', Label);
    }

    private ensureDoudizhuPlayerInfo(parent: Node): void {
        if (this.playerInfoRoot) return;
        this.playerInfoRoot = this.createArea(parent, 'DoudizhuPlayerInfoRoot', 0, 0, 1680, 920);
        this.createPlayerInfoCard(0, -610, -252, 318, 92);
        this.createPlayerInfoCard(1, 610, 278, 318, 92);
    }

    private getMyHandLayout(): { gap: number; startX: number; cardWidth: number; cardHeight: number } {
        const gap = this.myCards.length > 16 ? 52 : 62;
        return {
            gap,
            startX: -((this.myCards.length - 1) * gap) / 2,
            cardWidth: 78,
            cardHeight: 108,
        };
    }

    private attachCardTouchArea(
        cardNode: Node,
        cardIndex: number,
        isLastCard: boolean,
        layout: { gap: number; cardWidth: number; cardHeight: number },
    ): void {
        const hitWidth = isLastCard ? layout.cardWidth : Math.min(layout.gap, layout.cardWidth);
        const hitNode = new Node('HitArea');
        hitNode.layer = cardNode.layer;
        hitNode.parent = cardNode;
        hitNode.addComponent(UITransform).setContentSize(hitWidth, layout.cardHeight + 22);
        hitNode.setPosition(isLastCard ? 0 : -(layout.cardWidth - hitWidth) / 2, 0, 0);
        hitNode.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            if (!this.isMyTurn) return;
            event.propagationStopped = true;
            const location = event.getUILocation();
            this.dragSelectStartIndex = cardIndex;
            this.dragSelectCurrentIndex = cardIndex;
            this.dragSelectStartX = location.x;
            this.dragSelectStartY = location.y;
            this.isDragSelecting = false;
        }, this);
        hitNode.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            if (!this.isMyTurn || this.dragSelectStartIndex < 0) return;
            event.propagationStopped = true;
            const location = event.getUILocation();
            const dx = location.x - this.dragSelectStartX;
            const dy = location.y - this.dragSelectStartY;
            if (!this.isDragSelecting && Math.sqrt(dx * dx + dy * dy) < 18) return;
            this.isDragSelecting = true;
            const currentIndex = this.getHandIndexByTouch(event);
            if (currentIndex === null || currentIndex === this.dragSelectCurrentIndex) return;
            this.dragSelectCurrentIndex = currentIndex;
            this.applyDragSelection(false);
        }, this);
        hitNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            if (this.isDragSelecting) this.applyDragSelection(true);
            else this.toggleCardSelection(cardIndex);
            this.resetDragSelection();
        }, this);
        hitNode.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
            event.propagationStopped = true;
            this.resetDragSelection();
        }, this);
    }

    private getHandIndexByTouch(event: EventTouch): number | null {
        if (!this.myHandArea || this.myCards.length === 0) return null;
        const transform = this.myHandArea.getComponent(UITransform);
        if (!transform) return null;
        const location = event.getUILocation();
        const local = transform.convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
        const layout = this.getMyHandLayout();
        const rawIndex = Math.round((local.x - layout.startX) / layout.gap);
        return Math.max(0, Math.min(this.myCards.length - 1, rawIndex));
    }

    private applyDragSelection(finalize: boolean): void {
        if (this.dragSelectStartIndex < 0 || this.dragSelectCurrentIndex < 0) return;
        const rangeIndices = this.getIndexRange(this.dragSelectStartIndex, this.dragSelectCurrentIndex);
        const best = this.pickBestDragSelection(rangeIndices);
        this.selectedIndices.clear();
        for (const idx of best.indices) this.selectedIndices.add(idx);
        this.applyHandSelectionVisuals();
        this.pokerCallbacks.onSelectionChanged?.([...this.selectedIndices]);

        if (finalize && !best.play) {
            Client.Instance.showPromptTip('未识别有效牌型', 1.0);
        }
    }

    private pickBestDragSelection(rangeIndices: number[]): { indices: number[]; play: CardPlay | null } {
        const exactCards = rangeIndices.map(idx => this.myCards[idx]).filter(Boolean);
        const exactPlay = this.recognizePattern(exactCards);
        if (exactPlay && this.isPlayablePattern(exactPlay)) {
            return { indices: rangeIndices, play: exactPlay };
        }

        const rangeSet = new Set(rangeIndices);
        const candidates = this.buildHintCandidates().filter(item => item.indices.every(idx => rangeSet.has(idx)));
        if (candidates.length === 0) return { indices: rangeIndices, play: null };

        candidates.sort((a, b) => {
            if (a.indices.length !== b.indices.length) return b.indices.length - a.indices.length;
            return this.compareHintCandidate(a.play, b.play);
        });
        return candidates[0];
    }

    private isPlayablePattern(play: CardPlay): boolean {
        if (!this.pokerActions?.isLeader && this.lastPlay) return this.canBeat(play, this.lastPlay);
        return true;
    }

    private getIndexRange(a: number, b: number): number[] {
        const start = Math.max(0, Math.min(a, b));
        const end = Math.min(this.myCards.length - 1, Math.max(a, b));
        const indices: number[] = [];
        for (let i = start; i <= end; i++) indices.push(i);
        return indices;
    }

    private applyHandSelectionVisuals(): void {
        if (!this.myHandArea) return;
        const layout = this.getMyHandLayout();
        for (let i = 0; i < this.myCards.length; i++) {
            const cardNode = this.getCardNodeByIndex(i);
            if (cardNode) cardNode.setPosition(layout.startX + i * layout.gap, this.selectedIndices.has(i) ? 28 : 0, 0);
        }
    }

    private resetDragSelection(): void {
        this.dragSelectStartIndex = -1;
        this.dragSelectCurrentIndex = -1;
        this.dragSelectStartX = 0;
        this.dragSelectStartY = 0;
        this.isDragSelecting = false;
    }

    private findRocketPlay(): { indices: number[]; play: CardPlay } | null {
        const little = this.myCards.findIndex(card => card.value === 16);
        const big = this.myCards.findIndex(card => card.value === 17);
        if (little < 0 || big < 0) return null;
        const indices = [little, big].sort((a, b) => a - b);
        const cards = indices.map(idx => this.myCards[idx]);
        const play = this.recognizePattern(cards);
        return play ? { indices, play } : null;
    }

    private buildHintCandidates(target: CardPlay | null = this.lastPlay): Array<{ indices: number[]; play: CardPlay }> {
        const candidates: Array<{ indices: number[]; play: CardPlay }> = [];
        const seen = new Set<string>();
        const add = (indices: number[]): void => {
            const sorted = [...indices].sort((a, b) => a - b);
            const cards = sorted.map(idx => this.myCards[idx]).filter(Boolean);
            const play = this.recognizePattern(cards);
            if (!play) return;
            if (target && !this.canBeat(play, target)) return;
            const key = this.getPlayValueKey(play);
            if (seen.has(key)) return;
            seen.add(key);
            candidates.push({ indices: sorted, play });
        };

        if (target) {
            if (target.pattern !== PokerPattern.Rocket) {
                this.forEachCombination(this.myCards.length, target.cards.length, add);
                if (target.pattern !== PokerPattern.Bomb) this.addBombCandidates(add);
                this.addRocketCandidate(add);
            }
        } else {
            this.addLeadHintCandidates(add);
        }

        candidates.sort((a, b) => this.compareHintCandidate(a.play, b.play));
        return candidates;
    }

    private addLeadHintCandidates(add: (indices: number[]) => void): void {
        const groups = this.groupCardIndicesByValue();
        const entries = [...groups.entries()].sort((a, b) => a[0] - b[0]);

        for (const [, indices] of entries) add([indices[0]]);
        for (const [, indices] of entries) if (indices.length >= 2) add(indices.slice(0, 2));
        for (const [, indices] of entries) if (indices.length >= 3) add(indices.slice(0, 3));

        for (const [tripleValue, tripleIndices] of entries) {
            if (tripleIndices.length < 3) continue;
            for (const [singleValue, singleIndices] of entries) {
                if (singleValue !== tripleValue) add([...tripleIndices.slice(0, 3), singleIndices[0]]);
            }
            for (const [pairValue, pairIndices] of entries) {
                if (pairValue !== tripleValue && pairIndices.length >= 2) add([...tripleIndices.slice(0, 3), ...pairIndices.slice(0, 2)]);
            }
        }

        this.addStraightCandidates(entries, add);
        this.addConsecutivePairCandidates(entries, add);
        this.addPlaneCandidates(entries, add);
        this.addFourWithTwoCandidates(entries, add);
        this.addBombCandidates(add);
        this.addRocketCandidate(add);
    }

    private addStraightCandidates(entries: Array<[number, number[]]>, add: (indices: number[]) => void): void {
        const values = entries.map(([value]) => value).filter(value => value >= 3 && value < 15).sort((a, b) => a - b);
        for (let start = 0; start < values.length; start++) {
            for (let end = start + 4; end < values.length; end++) {
                if (!this.isContinuousValues(values, start, end)) break;
                add(values.slice(start, end + 1).map(value => entries.find(([v]) => v === value)![1][0]));
            }
        }
    }

    private addConsecutivePairCandidates(entries: Array<[number, number[]]>, add: (indices: number[]) => void): void {
        const values = entries
            .filter(([value, indices]) => value >= 3 && value < 15 && indices.length >= 2)
            .map(([value]) => value)
            .sort((a, b) => a - b);
        for (let start = 0; start < values.length; start++) {
            for (let end = start + 2; end < values.length; end++) {
                if (!this.isContinuousValues(values, start, end)) break;
                const indices: number[] = [];
                for (const value of values.slice(start, end + 1)) {
                    indices.push(...entries.find(([v]) => v === value)![1].slice(0, 2));
                }
                add(indices);
            }
        }
    }

    private addPlaneCandidates(entries: Array<[number, number[]]>, add: (indices: number[]) => void): void {
        const values = entries
            .filter(([value, indices]) => value >= 3 && value < 15 && indices.length >= 3)
            .map(([value]) => value)
            .sort((a, b) => a - b);
        for (let start = 0; start < values.length; start++) {
            for (let end = start + 1; end < values.length; end++) {
                if (!this.isContinuousValues(values, start, end)) break;
                const indices: number[] = [];
                for (const value of values.slice(start, end + 1)) {
                    indices.push(...entries.find(([v]) => v === value)![1].slice(0, 3));
                }
                add(indices);

                const wingCount = end - start + 1;
                const coreSet = new Set(indices);
                const wingPool: number[] = [];
                for (let i = 0; i < this.myCards.length; i++) {
                    if (!coreSet.has(i)) wingPool.push(i);
                }
                this.forEachCombination(wingPool.length, wingCount, wingPositions => {
                    add([...indices, ...wingPositions.map(pos => wingPool[pos])]);
                });

                const pairGroups: number[][] = [];
                for (const [value, groupIndices] of entries) {
                    const remain = groupIndices.filter(idx => !coreSet.has(idx));
                    if (value < 16 && remain.length >= 2) pairGroups.push(remain.slice(0, 2));
                }
                this.forEachCombination(pairGroups.length, wingCount, pairPositions => {
                    const pairIndices: number[] = [];
                    for (const pos of pairPositions) pairIndices.push(...pairGroups[pos]);
                    add([...indices, ...pairIndices]);
                });
            }
        }
    }

    private addFourWithTwoCandidates(entries: Array<[number, number[]]>, add: (indices: number[]) => void): void {
        for (const [fourValue, fourIndices] of entries) {
            if (fourIndices.length < 4) continue;
            const core = fourIndices.slice(0, 4);
            const singlePool: number[] = [];
            for (let i = 0; i < this.myCards.length; i++) {
                if (core.indexOf(i) === -1) singlePool.push(i);
            }
            this.forEachCombination(singlePool.length, 2, positions => {
                add([...core, ...positions.map(pos => singlePool[pos])]);
            });

            const pairGroups: number[][] = [];
            for (const [value, groupIndices] of entries) {
                if (value === fourValue || value >= 16) continue;
                if (groupIndices.length >= 2) pairGroups.push(groupIndices.slice(0, 2));
            }
            this.forEachCombination(pairGroups.length, 2, positions => {
                const pairIndices: number[] = [];
                for (const pos of positions) pairIndices.push(...pairGroups[pos]);
                add([...core, ...pairIndices]);
            });
        }
    }

    private addBombCandidates(add: (indices: number[]) => void): void {
        for (const [, indices] of this.groupCardIndicesByValue()) {
            if (indices.length >= 4) add(indices.slice(0, 4));
        }
    }

    private addRocketCandidate(add: (indices: number[]) => void): void {
        const rocket = this.findRocketPlay();
        if (rocket) add(rocket.indices);
    }

    private forEachCombination(count: number, size: number, visit: (indices: number[]) => void): void {
        if (size <= 0 || size > count) return;
        const picked: number[] = [];
        const dfs = (start: number): void => {
            if (picked.length === size) {
                visit([...picked]);
                return;
            }
            const remaining = size - picked.length;
            for (let i = start; i <= count - remaining; i++) {
                picked.push(i);
                dfs(i + 1);
                picked.pop();
            }
        };
        dfs(0);
    }

    private groupCardIndicesByValue(): Map<number, number[]> {
        const groups = new Map<number, number[]>();
        for (let i = 0; i < this.myCards.length; i++) {
            const value = this.myCards[i].value;
            if (!groups.has(value)) groups.set(value, []);
            groups.get(value)!.push(i);
        }
        return groups;
    }

    private isContinuousValues(values: number[], start: number, end: number): boolean {
        for (let i = start + 1; i <= end; i++) {
            if (values[i] !== values[i - 1] + 1) return false;
        }
        return true;
    }

    private compareHintCandidate(a: CardPlay, b: CardPlay): number {
        const pa = this.getHintPatternOrder(a.pattern);
        const pb = this.getHintPatternOrder(b.pattern);
        if (pa !== pb) return pa - pb;
        if (a.cards.length !== b.cards.length) return a.cards.length - b.cards.length;
        return a.weight - b.weight;
    }

    private getHintPatternOrder(pattern: PokerPattern): number {
        switch (pattern) {
            case PokerPattern.Single: return 1;
            case PokerPattern.Pair: return 2;
            case PokerPattern.Triple: return 3;
            case PokerPattern.TripleWithOne: return 4;
            case PokerPattern.TripleWithPair: return 5;
            case PokerPattern.Straight: return 6;
            case PokerPattern.ConsecutivePairs: return 7;
            case PokerPattern.Airplane: return 8;
            case PokerPattern.AirplaneWithSingles: return 9;
            case PokerPattern.AirplaneWithPairs: return 10;
            case PokerPattern.FourWithTwo: return 11;
            case PokerPattern.FourWithTwoPairs: return 12;
            case PokerPattern.Bomb: return 90;
            case PokerPattern.Rocket: return 100;
            default: return 50;
        }
    }

    private getPlayValueKey(play: CardPlay): string {
        const values = play.cards.map(card => card.value).sort((a, b) => a - b).join(',');
        return `${play.pattern}:${values}:${play.weight}`;
    }

    private getSelectedIndicesKey(): string {
        return this.getIndicesKey([...this.selectedIndices]);
    }

    private getIndicesKey(indices: number[]): string {
        return [...indices].sort((a, b) => a - b).join(',');
    }

    private ingestSyncAvatars(msg: any): void {
        const lists = [msg?.avatars, msg?.avatarInfos, msg?.players];
        for (const avatars of lists) {
            if (Array.isArray(avatars) && avatars.length > 0) {
                this.onAddAvatar({ avatars });
                return;
            }
        }
    }

    private createPlayerInfoCard(index: number, x: number, y: number, w: number, h: number): void {
        if (!this.playerInfoRoot) return;
        const root = this.createArea(this.playerInfoRoot, `PlayerInfo${index}`, x, y, w, h);
        this.paintRect(root, w, h, new Color(18, 26, 38, 220), new Color(214, 182, 116, 255), 16);
        this.playerCardRoots[index] = root;
        this.playerNameLabels[index] = this.createLabel(root, 'Name', '', 22, 0, 22, w - 24, 26, new Color(255, 238, 201, 255));
        this.playerGoldLabels[index] = this.createLabel(root, 'Gold', '', 18, 0, -4, w - 24, 22, new Color(213, 232, 255, 255));
        this.playerStateLabels[index] = this.createLabel(root, 'State', '', 18, 0, -28, w - 24, 22, new Color(255, 220, 146, 255));
        root.active = false;
    }

    private ensureDoudizhuBackButton(parent: Node): void {
        if (this.fallbackBackButton) return;
        const btnBack = this.findChildRecursive(this.node, 'BtnBack');
        if (btnBack) btnBack.active = false;
        this.fallbackBackButton = this.createActionButton(parent, 'DoudizhuBackButton', '退出房间', -742, 420, 132,
            new Color(16, 20, 30, 228), new Color(255, 210, 112, 255), 'onBackClick');
    }

    private ensureSettlementPanel(parent: Node): void {
        if (this.settlementPanel) return;

        const panel = this.createArea(parent, 'SettlementPanel', 0, 34, 640, 360);
        panel.addComponent(BlockInputEvents);
        const bg = panel.addComponent(Graphics);
        bg.fillColor = new Color(18, 29, 42, 244);
        bg.roundRect(-320, -180, 640, 360, 8);
        bg.fill();
        bg.strokeColor = new Color(236, 190, 96, 255);
        bg.lineWidth = 2;
        bg.roundRect(-320, -180, 640, 360, 8);
        bg.stroke();

        this.settlementTitleLabel = this.createLabel(panel, 'Title', '', 32, 0, 128, 360, 48, new Color(255, 225, 120, 255));
        this.settlementScoreLabel = this.createLabel(panel, 'Score', '', 38, 0, 74, 360, 54, new Color(255, 255, 255, 255));
        this.settlementDetailLabel = this.createLabel(panel, 'Detail', '', 22, 0, 6, 560, 70, new Color(218, 226, 234, 255));
        this.settlementRemainLabel = this.createLabel(panel, 'RemainCards', '', 20, 0, -72, 580, 92, new Color(230, 235, 238, 255));
        this.createTextButton(panel, '继续', 0, -142, 'closeSettlementPanel', new Color(46, 139, 87, 235));

        panel.active = false;
        this.settlementPanel = panel;
    }

    private createArea(parent: Node, name: string, x: number, y: number, w: number, h: number): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        node.parent = parent;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(x, y, 0);
        return node;
    }

    private paintRect(node: Node, w: number, h: number, fillColor: Color, strokeColor?: Color, radius: number = 12): void {
        const bg = node.addComponent(Graphics);
        bg.fillColor = fillColor;
        bg.roundRect(-w / 2, -h / 2, w, h, radius);
        bg.fill();
        if (strokeColor) {
            bg.strokeColor = strokeColor;
            bg.lineWidth = 2;
            bg.roundRect(-w / 2, -h / 2, w, h, radius);
            bg.stroke();
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

    private createTextButton(parent: Node, text: string, x: number, y: number, handler: string, color: Color): Node {
        const node = this.createArea(parent, handler, x, y, 112, 44);
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
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            const fn = (this as any)[handler];
            if (typeof fn === 'function') fn.call(this);
        }, this);
        return node;
    }

    private createActionButton(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        width: number,
        fillColor: Color,
        strokeColor: Color,
        handler: string,
    ): Node {
        const node = this.createArea(parent, name, x, y, width, 48);
        const halfW = width / 2;
        const g = node.addComponent(Graphics);
        g.fillColor = fillColor;
        g.roundRect(-halfW, -24, width, 48, 14);
        g.fill();
        g.strokeColor = strokeColor;
        g.lineWidth = 2;
        g.roundRect(-halfW, -24, width, 48, 14);
        g.stroke();

        const labelNode = this.createArea(node, 'Label', 0, 0, width - 12, 30);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 22;
        label.lineHeight = 26;
        label.overflow = Label.Overflow.SHRINK;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(255, 244, 220, 255);

        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 1.05;
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            const fn = (this as any)[handler];
            if (typeof fn === 'function') fn.call(this);
        }, this);
        return node;
    }

    private hideGuanDanPokerNodes(): void {
        const names = ['CardLayout', 'CardPlayedOut', 'CardBacks', 'GradePointBoard', 'GradePointGroup', 'RefundTribute', 'ChatDialog'];
        for (const name of names) {
            const node = this.findChildRecursive(this.node, name);
            if (node) node.active = false;
        }
        const desktop = this.findChildRecursive(this.node, 'Desktop');
        if (desktop) {
            for (const child of desktop.children) {
                if (child.name === 'Desktop' || child.name === 'ChairLeft' || child.name === 'ChairRight' || child.name === 'YouGroup' || child.name === 'ClockArrow') {
                    child.active = false;
                }
                if (child.name.startsWith('Player') && child.getChildByName('BodyPos')) child.active = false;
            }
        }
        const upRightPanel = this.findChildRecursive(this.node, 'UpRightPanel');
        if (upRightPanel) upRightPanel.active = false;
    }

    private renderBottomCards(ids: number[]): void {
        if (!this.bottomCardsArea) return;
        this.bottomCardsArea.removeAllChildren();
        const cards = this.toPokerCards(ids || []);
        const gap = 48;
        const startX = -((cards.length - 1) * gap) / 2;
        cards.forEach((card, idx) => {
            const node = this.createCardNode(card, false);
            node.parent = this.bottomCardsArea!;
            node.setScale(new Vec3(0.82, 0.82, 1));
            node.setPosition(startX + idx * gap, 0, 0);
        });
    }

    private renderPlayCards(area: Node | null, play: CardPlay, preferredGap: number, preferredScale: number): void {
        if (!area) return;
        area.removeAllChildren();

        const cards = [...(play.cards || [])].sort((a, b) => b.value - a.value || b.suit - a.suit);
        if (cards.length === 0) return;

        const maxWidth = 680;
        const gap = cards.length > 1 ? Math.min(preferredGap, maxWidth / (cards.length - 1)) : preferredGap;
        const scale = cards.length > 14 ? Math.min(preferredScale, 0.76) : preferredScale;
        const startX = -((cards.length - 1) * gap) / 2;
        cards.forEach((card, idx) => {
            const node = this.createCardNode(card, false);
            node.parent = area;
            node.setScale(new Vec3(scale, scale, 1));
            node.setPosition(startX + idx * gap, 0, 0);
        });
    }

    private showPlayForSeat(serverSeat: number, ids: number[], genre: number): void {
        if (serverSeat < 0) return;
        const clientSeat = this.server2ClientSeat(serverSeat);
        const cards = this.toPokerCards(ids || []);
        const play = this.recognizePattern(cards) || { pattern: this.patternByGenre(genre), cards, weight: cards[0]?.value || 0 };
        if (clientSeat === 0) this.showMyPlay(play);
        else this.showOtherPlay(clientSeat, play);
    }

    private showPassAtSeat(clientSeat: number): void {
        const area = this.getPlayAreaBySeat(clientSeat);
        if (!area) return;
        area.removeAllChildren();
        this.createLabel(area, 'PassText', '不要', 24, 0, 0, 120, 42, new Color(210, 220, 230, 255));
    }

    private updateHandCounts(countsLike: any): void {
        const counts = this.arrayLikeToArray(countsLike);
        if (counts.length === 0) return;
        for (let i = 0; i < counts.length && i < 2; i++) {
            const clientSeat = this.server2ClientSeat(i);
            this.updatePlayerCardCount(clientSeat, Number(counts[i]) || 0);
        }
        if (this.opponentCountLabel) {
            const opponentCount = this.playerCardCounts.get(1) ?? 0;
            this.opponentCountLabel.string = `对手 ${opponentCount}张`;
        }
        this.updateCardCountDisplay();
        this.refreshDoudizhuPlayers();
    }

    protected updateCardCountDisplay(): void {
        if (this.cardCountLabel) this.cardCountLabel.string = `${this.myCards.length}张`;
        this.playerCardCounts.set(0, this.myCards.length);
        this.refreshDoudizhuHud();
    }

    private updateMultiplierLabel(): void {
        if (this.multiLabel) this.multiLabel.string = `${this.currentMultiplier}倍`;
    }

    private updateStatus(text: string): void {
        if (this.statusLabel) this.statusLabel.string = text;
    }

    private refreshDoudizhuHud(): void {
        if (this.roomInfoLabel) {
            const parts: string[] = [];
            if (this.roomNumber) parts.push(`房号 ${this.roomNumber}`);
            if (this.baseScore > 0) parts.push(`底分 ${this.baseScore}`);
            this.roomInfoLabel.string = parts.length > 0 ? parts.join(' · ') : '斗地主房间';
        }
        if (this.roundInfoLabel) {
            this.roundInfoLabel.string = this.totalRounds > 0
                ? `第 ${this.currentRound || 0}/${this.totalRounds} 局`
                : `第 ${this.currentRound || 0} 局`;
        }
        if (this.ruleHintLabel) {
            this.ruleHintLabel.string = '两人对战 · 初始17张 · 地主20张';
        }
        if (this.multiLabel) this.multiLabel.string = `${this.currentMultiplier || 1}倍`;
        if (this.cardCountLabel) this.cardCountLabel.string = `我的手牌 ${this.myCards.length} 张`;
        if (this.opponentCountLabel) {
            const opponentCount = this.playerCardCounts.get(1) ?? 0;
            const landlordText = this.landlordSeat >= 0
                ? (this.landlordSeat === this.seat ? ' · 你是地主' : ' · 对手是地主')
                : (this.bankerSeat >= 0 ? (this.bankerSeat === this.seat ? ' · 你是庄' : ' · 对手是庄') : '');
            this.opponentCountLabel.string = `对手手牌 ${opponentCount} 张${landlordText}`;
        }
    }

    private refreshDoudizhuPlayers(): void {
        for (let clientSeat = 0; clientSeat < this.playerCardRoots.length; clientSeat++) {
            const root = this.playerCardRoots[clientSeat];
            if (!root) continue;

            const serverSeat = this.client2ServerSeat(clientSeat);
            const info = serverSeat >= 0 ? this.playerInfos[serverSeat] : null;
            root.active = true;

            if (!info) {
                if (this.playerNameLabels[clientSeat]) {
                    this.playerNameLabels[clientSeat]!.string = clientSeat === 0 ? '未入座' : '等待对手';
                }
                if (this.playerGoldLabels[clientSeat]) this.playerGoldLabels[clientSeat]!.string = '';
                if (this.playerStateLabels[clientSeat]) {
                    this.playerStateLabels[clientSeat]!.string = this.gameState === GameState.Waiting ? '等待中' : '空座';
                }
                continue;
            }

            const tags: string[] = [];
            if (serverSeat === this.ownerSeat) tags.push('房主');
            if (serverSeat === this.seat) tags.push('我');
            if (serverSeat === this.landlordSeat) tags.push('地主');
            else if (serverSeat === this.bankerSeat) tags.push('庄');
            if (this.playerNameLabels[clientSeat]) {
                this.playerNameLabels[clientSeat]!.string = `${info.nickname || info.playerId || `玩家${serverSeat + 1}`}${tags.length > 0 ? ` · ${tags.join('/')}` : ''}`;
            }
            if (this.playerGoldLabels[clientSeat]) {
                this.playerGoldLabels[clientSeat]!.string = `金币 ${info.gold ?? 0}`;
            }
            if (this.playerStateLabels[clientSeat]) {
                this.playerStateLabels[clientSeat]!.string = this.getDoudizhuPlayerStateText(info, serverSeat, clientSeat);
            }
        }
    }

    private getDoudizhuPlayerStateText(info: any, serverSeat: number, clientSeat: number): string {
        const states: string[] = [];
        if (info.offline) states.push('离线');
        if (info.authorize) states.push('托管');
        if (info.ready && this.gameState === GameState.Waiting) states.push('已准备');
        if (this.landlordSeat === serverSeat) states.push('地主');
        else if (this.bankerSeat === serverSeat) states.push('庄家');
        const cardCount = clientSeat === 0 ? this.myCards.length : (this.playerCardCounts.get(clientSeat) ?? 0);
        if (this.gameState !== GameState.Waiting) states.push(`${cardCount}张`);
        if (states.length === 0) states.push(this.gameState === GameState.Waiting ? '等待中' : '游戏中');
        return states.join(' · ');
    }

    private showSettlementPanel(msg: any, scores: number[], myScore: number, winnerSeat: number): void {
        if (!this.settlementPanel) return;

        const multiplier = Number(msg.multiplier ?? this.currentMultiplier ?? 1) || 1;
        const landlordSeat = Number(msg.landlordSeat ?? this.landlordSeat);
        const isWin = winnerSeat === this.seat;
        const roleText = landlordSeat === this.seat ? '地主' : '农民';
        const winnerText = winnerSeat === this.seat ? '你' : '对手';
        const winnerRole = winnerSeat === landlordSeat ? '地主' : '农民';
        const opponentSeat = this.seat === 0 ? 1 : 0;
        const opponentScore = scores[opponentSeat] ?? 0;
        const springText = msg.spring ? ' | 春天' : '';

        if (this.settlementTitleLabel) this.settlementTitleLabel.string = isWin ? '本局胜利' : '本局失败';
        if (this.settlementScoreLabel) this.settlementScoreLabel.string = `${myScore >= 0 ? '+' : ''}${myScore}`;
        if (this.settlementDetailLabel) {
            this.settlementDetailLabel.string =
                `${roleText} | ${multiplier}倍${springText}\n胜方：${winnerText}（${winnerRole}）  对手：${opponentScore >= 0 ? '+' : ''}${opponentScore}`;
        }

        const remainCards = this.arrayLikeToNestedArray(msg.remainCards);
        const myRemain = this.seat >= 0 ? (remainCards[this.seat] || []) : [];
        const opponentRemain = this.seat >= 0 ? (remainCards[opponentSeat] || []) : [];
        if (this.settlementRemainLabel) {
            this.settlementRemainLabel.string =
                `你剩余：${this.formatCardIds(myRemain)}\n对手剩余：${this.formatCardIds(opponentRemain)}`;
        }

        this.settlementPanel.active = true;
    }

    private hideSettlementPanel(): void {
        if (this.settlementPanel) this.settlementPanel.active = false;
    }

    private markSelfReadyLocally(): void {
        if (this.seat < 0) return;
        if (this.playerInfos[this.seat]) this.playerInfos[this.seat].ready = true;
        const clientSeat = this.server2ClientSeat(this.seat);
        if (this.readyFlags[clientSeat]) this.readyFlags[clientSeat].active = true;
        const playerView = this.guanDanPlayers[clientSeat] as any;
        if (playerView && typeof playerView.setReady === 'function') {
            playerView.setReady(true);
        }
        this.refreshDoudizhuPlayers();
        this.updateReadyButtonState();
    }

    private isAllRoundsFinished(): boolean {
        return this.gameState === GameState.Waiting &&
            this.totalRounds > 0 && this.currentRound >= this.totalRounds;
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
        this.refreshDoudizhuPlayers();
    }

    private updateDoudizhuReadyButtonLabel(): void {
        this.updateReadyButtonState();
    }

    private toPokerCards(ids: number[]): PokerCard[] {
        const cards: PokerCard[] = [];
        for (const id of ids || []) {
            const card = this.cardIdToPokerCard(Number(id));
            if (card) cards.push(card);
        }
        return cards;
    }

    private cardIdToPokerCard(id: number): PokerCard | null {
        if (!isFinite(id) || id < 0 || id > 53) return null;
        if (id >= 52) {
            return { value: id === 52 ? 16 : 17, suit: -1, cardId: String(id) };
        }
        const pointOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
        const point = pointOrder[Math.floor(id / 4)] || 0;
        const value = point === 1 ? 14 : point === 2 ? 15 : point;
        return { value, suit: id % 4, cardId: String(id) };
    }

    private cardText(card: PokerCard): string {
        if (card.value === 16) return '小王';
        if (card.value === 17) return '大王';
        const valueText = card.value === 14 ? 'A' :
            card.value === 15 ? '2' :
            card.value === 13 ? 'K' :
            card.value === 12 ? 'Q' :
            card.value === 11 ? 'J' : String(card.value);
        const suits = ['♦', '♣', '♥', '♠'];
        return `${valueText}\n${suits[card.suit] || ''}`;
    }

    private isRedCard(card: PokerCard): boolean {
        return card.suit === 0 || card.suit === 2 || card.value === 17;
    }

    private isRocket(values: number[]): boolean {
        return values.length === 2 && values[0] === 16 && values[1] === 17;
    }

    private countValues(values: number[]): Map<number, number> {
        const counts = new Map<number, number>();
        for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
        return counts;
    }

    private isConsecutiveRanks(values: number[]): boolean {
        if (values.length < 2) return false;
        if (values.some(v => v >= 15)) return false;
        for (let i = 1; i < values.length; i++) {
            if (values[i] !== values[i - 1] + 1) return false;
        }
        return true;
    }

    private recognizePlane(cards: PokerCard[], counts: Map<number, number>): CardPlay | null {
        const n = cards.length;
        const tripleValues = [...counts.entries()]
            .filter(([value, count]) => value < 15 && count >= 3)
            .map(([value]) => value)
            .sort((a, b) => a - b);
        if (tripleValues.length < 2) return null;

        for (let len = tripleValues.length; len >= 2; len--) {
            for (let start = 0; start <= tripleValues.length - len; start++) {
                const sequence = tripleValues.slice(start, start + len);
                if (!this.isConsecutiveRanks(sequence)) continue;
                const rest = new Map<number, number>(counts);
                for (const value of sequence) rest.set(value, (rest.get(value) || 0) - 3);

                const restCards = [...rest.values()].reduce((sum, count) => sum + count, 0);
                if (restCards === 0 && n === len * 3) {
                    return { pattern: PokerPattern.Airplane, cards, weight: sequence[0] };
                }
                if (restCards === len && n === len * 4) {
                    return { pattern: PokerPattern.AirplaneWithSingles, cards, weight: sequence[0] };
                }
                if (restCards === len * 2 && n === len * 5 && this.remainingAreNonJokerPairs(rest)) {
                    return { pattern: PokerPattern.AirplaneWithPairs, cards, weight: sequence[0] };
                }
            }
        }
        return null;
    }

    private recognizeFourWithTwo(cards: PokerCard[], counts: Map<number, number>): CardPlay | null {
        const n = cards.length;
        if (n !== 6 && n !== 8) return null;
        const fourValue = [...counts.entries()].find(([, count]) => count === 4)?.[0];
        if (fourValue === undefined) return null;
        if (n === 6) return { pattern: PokerPattern.FourWithTwo, cards, weight: fourValue };

        for (const [value, count] of counts.entries()) {
            if (value === fourValue) continue;
            if (count !== 2 || value >= 16) return null;
        }
        return { pattern: PokerPattern.FourWithTwoPairs, cards, weight: fourValue };
    }

    private remainingAreNonJokerPairs(counts: Map<number, number>): boolean {
        for (const [value, count] of counts.entries()) {
            if (count === 0) continue;
            if (count !== 2 || value >= 16) return false;
        }
        return true;
    }

    private patternByGenre(genre: number): PokerPattern {
        if (genre === 14) return PokerPattern.Rocket;
        if (genre === 13) return PokerPattern.Bomb;
        if (genre === 12) return PokerPattern.FourWithTwoPairs;
        if (genre === 11) return PokerPattern.FourWithTwo;
        if (genre === 10) return PokerPattern.AirplaneWithPairs;
        if (genre === 9) return PokerPattern.AirplaneWithSingles;
        if (genre === 8) return PokerPattern.Airplane;
        if (genre === 7) return PokerPattern.ConsecutivePairs;
        if (genre === 6) return PokerPattern.Straight;
        if (genre === 5) return PokerPattern.TripleWithPair;
        if (genre === 4) return PokerPattern.TripleWithOne;
        if (genre === 3) return PokerPattern.Triple;
        if (genre === 2) return PokerPattern.Pair;
        return PokerPattern.Single;
    }

    private arrayLikeToArray(value: any): number[] {
        if (Array.isArray(value)) return value.map(v => Number(v) || 0);
        if (value && typeof value === 'object') {
            return Object.keys(value).sort().map(k => Number(value[k]) || 0);
        }
        return [];
    }

    private arrayLikeToNestedArray(value: any): number[][] {
        if (Array.isArray(value)) return value.map(v => this.arrayLikeToArray(v));
        if (value && typeof value === 'object') {
            return Object.keys(value)
                .sort((a, b) => Number(a) - Number(b))
                .map(k => this.arrayLikeToArray(value[k]));
        }
        return [];
    }

    private formatCardIds(ids: number[]): string {
        const cards = this.toPokerCards(ids);
        if (cards.length === 0) return '无';
        cards.sort((a, b) => b.value - a.value || b.suit - a.suit);
        return cards.map(card => this.cardText(card).replace('\n', '')).join(' ');
    }
}
