/**
 * 斗地主 (DoudizhuRoom)
 * 两人斗地主客户端协议适配：DouDiZhu.Sync / Call / Play。
 */

import { _decorator, Node, Label, Color, Graphics, Button, EventHandler, UITransform, Vec3 } from 'cc';
import { PokerRoomBase, PokerCard, CardPlay, PokerAvailableActions } from '../../GameCommon/PokerRoomBase';
import { PokerPattern, RoomState } from '../../GameCommon/GameTypes';
import { GameState } from '../../GameCommon/RoomBase';
import { NetworkManager } from '../../Manager/NetworkManager';
import { Client } from '../../Game/Client';

const { ccclass } = _decorator;

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

    private landlordSeat: number = -1;
    private highestBid: number = 0;
    private highestBidSeat: number = -1;
    private lastServerPlaySeat: number = -1;

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
        this.clearSelection();

        let indices: number[] = [];
        if (!this.lastPlay) {
            if (this.myCards.length > 0) indices = [this.myCards.length - 1];
        } else {
            const found = this.findSmallestBeatingPlay(this.lastPlay);
            if (found) indices = found.indices;
        }
        for (const idx of indices) this.selectedIndices.add(idx);
        this.renderMyHand();
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
        const triples = [...counts.entries()].filter(([, c]) => c === 3).map(([v]) => v).sort((a, b) => a - b);
        const quads = [...counts.entries()].filter(([, c]) => c === 4).map(([v]) => v);

        if (triples.length >= 2 && this.isConsecutiveRanks(triples)) {
            const wingCount = n - triples.length * 3;
            if (wingCount === 0) return { pattern: PokerPattern.Airplane, cards, weight: triples[0] };
            if (wingCount === triples.length) return { pattern: PokerPattern.Airplane, cards, weight: triples[0] };
            if (wingCount === triples.length * 2 && this.remainingArePairs(counts, triples)) {
                return { pattern: PokerPattern.Airplane, cards, weight: triples[0] };
            }
        }

        if (quads.length === 1 && (n === 6 || n === 8)) {
            return { pattern: PokerPattern.Airplane, cards, weight: quads[0] };
        }

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

    protected renderMyHand(): void {
        if (!this.myHandArea) return;
        this.myHandArea.removeAllChildren();

        const gap = this.myCards.length > 16 ? 52 : 62;
        const startX = -((this.myCards.length - 1) * gap) / 2;
        for (let i = 0; i < this.myCards.length; i++) {
            const cardNode = this.createCardNode(this.myCards[i], true);
            (cardNode as any)._cardIndex = i;
            cardNode.parent = this.myHandArea;
            cardNode.setPosition(startX + i * gap, this.selectedIndices.has(i) ? 28 : 0, 0);
            cardNode.on(Node.EventType.TOUCH_END, () => this.toggleCardSelection(i));
        }
        this.updateCardCountDisplay();
    }

    protected updateReadyButtonState(): void {
        super.updateReadyButtonState();
        this.updateDoudizhuReadyButtonLabel();
        if (!this.isAllRoundsFinished()) return;
        if (this.btnReady) this.btnReady.active = false;
        if (this.readyGroup) this.readyGroup.active = false;
        if (this.btnStartGame) this.btnStartGame.active = false;
        this.updateStatus('全部对局结束');
    }

    protected onPlayerReadyUIUpdate(seatIndex: number): void {
        super.onPlayerReadyUIUpdate(seatIndex);
        this.updateDoudizhuReadyButtonLabel();
    }

    protected applySelectedStyle(node: Node): void {
        const idx = (node as any)._cardIndex || 0;
        const gap = this.myCards.length > 16 ? 52 : 62;
        const startX = -((this.myCards.length - 1) * gap) / 2;
        node.setPosition(startX + idx * gap, 28, 0);
    }

    protected applyNormalStyle(node: Node): void {
        const idx = (node as any)._cardIndex || 0;
        const gap = this.myCards.length > 16 ? 52 : 62;
        const startX = -((this.myCards.length - 1) * gap) / 2;
        node.setPosition(startX + idx * gap, 0, 0);
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
        this.highestBid = Number(msg.highestBid ?? 0);
        this.highestBidSeat = Number(msg.highestBidSeat ?? -1);
        this.currentMultiplier = Number(msg.multiplier ?? 1) || 1;
        this.currentRound = Number(msg.roundNo ?? this.currentRound) || 0;
        if (msg.number !== undefined) this.roomNumber = String(msg.number);
        if (msg.level !== undefined) this.level = Number(msg.level) || this.level;
        if (msg.roundCount !== undefined) {
            const roundCount = Number(msg.roundCount);
            this.totalRounds = isNaN(roundCount) ? 0 : roundCount;
        }
        this.gameState = waitingState ? GameState.Waiting : GameState.Playing;
        this.currentState = waitingState ? RoomState.Waiting :
            (state === DoudizhuState.Settling ? RoomState.RoundSettlement : RoomState.Playing);

        if (Array.isArray(msg.myCards)) this.dealCards(this.toPokerCards(msg.myCards));
        this.renderBottomCards(msg.bottomCards || []);
        this.updateHandCounts(msg.handCounts);
        this.updateMultiplierLabel();
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
        this.dealCards(this.toPokerCards(msg.cards || []));
        this.updateHandCounts(msg.handCounts);
        this.renderBottomCards([]);
        this.highestBid = 0;
        this.highestBidSeat = -1;
        this.landlordSeat = -1;
        this.currentMultiplier = 1;
        this.updateMultiplierLabel();
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
        this.currentMultiplier = Number(msg.multiplier ?? 1) || 1;
        this.renderBottomCards(msg.bottomCards || []);
        this.updateHandCounts(msg.handCounts);
        this.updateMultiplierLabel();

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
        this.setTurn(Number(msg.nextPlayer), this.lastPlay === null);
    }

    private onDoudizhuPlayFailed(msg: any): void {
        this.playErrorSound();
        Client.Instance.showPromptTip(msg?.errMsg || '出牌失败', 1.8);
        this.isMyTurn = true;
        this.showPassAndPlayButtons(true);
        this.startCountdown(20);
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
        if (this.readyGroup) this.readyGroup.active = true;
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
            this.startCountdown(20);
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

        const parent = this.desktopUILayer || this.node;
        if (this.desktopUILayer) this.desktopUILayer.active = true;

        const overlay = new Node('DoudizhuOverlay');
        overlay.layer = 1 << 25;
        overlay.parent = parent;
        overlay.addComponent(UITransform).setContentSize(1920, 1080);
        overlay.setPosition(0, 0, 0);
        this.overlayRoot = overlay;

        this.statusLabel = this.createLabel(overlay, 'Status', '', 28, 0, 250, 620, 44, new Color(255, 225, 120, 255));
        this.multiLabel = this.createLabel(overlay, 'Multiplier', '1倍', 24, -760, 360, 180, 38, new Color(255, 225, 120, 255));
        this.cardCountLabel = this.createLabel(overlay, 'MyCount', '0张', 22, 0, -292, 180, 36, new Color(240, 240, 240, 255));
        this.opponentCountLabel = this.createLabel(overlay, 'OpponentCount', '对手 0张', 22, 0, 214, 220, 36, new Color(240, 240, 240, 255));

        this.bottomCardsArea = this.createArea(overlay, 'BottomCards', 0, 318, 280, 80);
        this.myHandArea = this.createArea(overlay, 'MyHand', 0, -390, 1240, 140);
        this.myPlayArea = this.createArea(overlay, 'MyPlay', 0, -118, 720, 96);
        this.leftPlayArea = this.createArea(overlay, 'OpponentPlay', 0, 112, 720, 96);

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

        this.ensureSettlementPanel(overlay);
    }

    private ensureSettlementPanel(parent: Node): void {
        if (this.settlementPanel) return;

        const panel = this.createArea(parent, 'SettlementPanel', 0, 34, 640, 360);
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
        const evt = new EventHandler();
        evt.target = this.node;
        evt.component = 'DoudizhuRoom';
        evt.handler = handler;
        button.clickEvents.push(evt);
        return node;
    }

    private hideGuanDanPokerNodes(): void {
        const names = ['CardLayout', 'CardPlayedOut', 'CardBacks'];
        for (const name of names) {
            const node = this.findChildRecursive(this.node, name);
            if (node) node.active = false;
        }
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
    }

    protected updateCardCountDisplay(): void {
        if (this.cardCountLabel) this.cardCountLabel.string = `${this.myCards.length}张`;
        this.playerCardCounts.set(0, this.myCards.length);
    }

    private updateMultiplierLabel(): void {
        if (this.multiLabel) this.multiLabel.string = `${this.currentMultiplier}倍`;
    }

    private updateStatus(text: string): void {
        if (this.statusLabel) this.statusLabel.string = text;
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
    }

    private updateDoudizhuReadyButtonLabel(): void {
        if (!this.btnReadyLabel || this.seat < 0) return;
        const ready = !!this.playerInfos[this.seat]?.ready;
        this.btnReadyLabel.string = ready ? '已准备' : '准备';
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

    private remainingArePairs(counts: Map<number, number>, tripleValues: number[]): boolean {
        const triples = new Set(tripleValues);
        for (const [value, count] of counts.entries()) {
            if (triples.has(value)) continue;
            if (count !== 2) return false;
        }
        return true;
    }

    private patternByGenre(genre: number): PokerPattern {
        if (genre === 14) return PokerPattern.Rocket;
        if (genre === 13) return PokerPattern.Bomb;
        if (genre === 7) return PokerPattern.ConsecutivePairs;
        if (genre === 6) return PokerPattern.Straight;
        if (genre >= 8) return PokerPattern.Airplane;
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
