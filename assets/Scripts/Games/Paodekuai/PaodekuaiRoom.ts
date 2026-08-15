/**
 * 跑得快 (PaodekuaiRoom)
 *
 * 两人15张跑得快：
 * - 45张牌库：去掉大小王、三张2、三张A、一张K
 * - 首局随机先出，后续由上一局赢家先出
 * - 按剩余牌张计分，扎鸟局红桃10翻倍，未被管住的炸弹单独计分
 */

import { _decorator, Node, Label, Color, Graphics, Button, UITransform, Vec3, BlockInputEvents, EventTouch, EventHandler } from 'cc';
import { PokerRoomBase, PokerCard, CardPlay } from '../../GameCommon/PokerRoomBase';
import { RoomInfo, PokerPattern, RoomState } from '../../GameCommon/GameTypes';
import { GameState } from '../../GameCommon/RoomBase';
import { NetworkManager } from '../../Manager/NetworkManager';
import { Client } from '../../Game/Client';
import { GameManager } from '../../Manager/GameManager';

const { ccclass, property } = _decorator;

type PdkGenre = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
const PDK_UI_LAYER = 1 << 25;
const PDK_STAGE_WIDTH = 1920;
const PDK_STAGE_HEIGHT = 1080;
const PDK_STANDALONE_MARKER = 'PaodekuaiStandaloneRoomV2_20260812';
const PDK_PLAY_REQUEST_TIMEOUT_MS = 5000;

const GENRE_TO_PATTERN: Record<number, PokerPattern> = {
    1: PokerPattern.Single,
    2: PokerPattern.Pair,
    3: PokerPattern.Triple,
    4: PokerPattern.TripleWithOne,
    5: PokerPattern.TripleWithPair,
    6: PokerPattern.Straight,
    7: PokerPattern.ConsecutivePairs,
    8: PokerPattern.Airplane,
    9: PokerPattern.AirplaneWithSingles,
    10: PokerPattern.AirplaneWithPairs,
    11: PokerPattern.Bomb,
    12: PokerPattern.Rocket,
};

@ccclass('PaodekuaiRoom')
export class PaodekuaiRoom extends PokerRoomBase {
    @property({ type: Label })
    public scoreLabel: Label = null;

    protected bombCountThisRound: number = 0;
    protected baseScore: number = 1;
    protected scoreScale: number = 10;
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
    private pdkCountdownRoot: Node | null = null;
    private pdkCountdownLabel: Label | null = null;
    private pdkDissolvePanel: Node | null = null;
    private pdkDissolveTitleLabel: Label | null = null;
    private pdkDissolveChoiceLabel: Label | null = null;
    private pdkDissolveAgreeButton: Node | null = null;
    private pdkDissolveRejectButton: Node | null = null;
    private opponentHandArea: Node | null = null;
    private overlayRoot: Node | null = null;
    private pdkReadyGroup: Node | null = null;
    private pdkBackButton: Node | null = null;
    private pdkActionRoot: Node | null = null;
    private pdkActionPassButton: Node | null = null;
    private pdkActionHintButton: Node | null = null;
    private pdkActionPlayButton: Node | null = null;
    private playerInfoRoot: Node | null = null;
    private playerCardRoots: Array<Node | null> = [null, null];
    private playerNameLabels: Array<Label | null> = [null, null];
    private playerGoldLabels: Array<Label | null> = [null, null];
    private playerStateLabels: Array<Label | null> = [null, null];
    private settlementPanel: Node | null = null;
    private settlementTitleLabel: Label | null = null;
    private settlementScoreLabel: Label | null = null;
    private settlementDetailLabel: Label | null = null;
    private settlementPlayerLabels: Array<Label | null> = [null, null];
    private settlementRoomFeeLabel: Label | null = null;
    private settlementReplayLabel: Label | null = null;
    private settlementShuffleButton: Node | null = null;
    private settlementShuffleLabel: Label | null = null;
    private settlementContinueLabel: Label | null = null;
    private settlementIsFinalRound: boolean = false;
    private settlementRoundNo: number = 0;
    private settlementTotalRounds: number = 0;
    private avatarListRequested: boolean = false;
    private hintOptions: Array<{ indices: number[]; play: CardPlay }> = [];
    private hintOptionIndex: number = 0;
    private hintContextKey: string = '';
    private dragSelectStartIndex: number = -1;
    private dragSelectCurrentIndex: number = -1;
    private dragSelectStartX: number = 0;
    private dragSelectActive: boolean = false;
    private pendingPlayCardIds: number[] = [];
    private playRequestPending: boolean = false;
    private playRequestSentAt: number = 0;
    private autoPassScheduled: boolean = false;
    private lastButtonInvokeKey: string = '';
    private lastButtonInvokeAt: number = 0;

    protected get pokerMsgPrefix(): string { return 'PaoDeKuai.'; }

    start(): void {
        this.syncMsgPrefix = 'PaoDeKuai.';
        this.gameId = 'paodekuai_poker';
        super.start();
        this.hideGuanDanPokerNodes();
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
        this.scoreScale = this.normalizeScoreScale(roomInfo.ruleConfig?.score_scale);
        this.roundCount = Number(roomInfo.ruleConfig?.round_count) || 8;
        this.forcePlayIfCanBeat = roomInfo.ruleConfig?.force_play_if_can_beat !== false;
        this.refreshPaodekuaiHud();
        console.log('[PaodekuaiRoom] Initialized as 2-player 15-card mode');
    }

    update(deltaTime: number): void {
        super.update(deltaTime);
        this.updatePendingPlayRequest();
        this.updatePaodekuaiCountdownVisual();
    }

    public startCountdown(seconds: number): void {
        this.ensurePaodekuaiCountdown();
        super.startCountdown(seconds);
        if (this.pdkCountdownRoot) this.pdkCountdownRoot.active = true;
        this.updatePaodekuaiCountdownVisual();
    }

    public stopCountdown(): void {
        super.stopCountdown();
        if (this.pdkCountdownRoot) this.pdkCountdownRoot.active = false;
    }

    public onMessage(msgType: string, msg: any): boolean {
        if (super.onMessage(msgType, msg)) return true;

        if (msgType === 'PaoDeKuai.Deal') this.onPdkDeal(msg);
        else if (msgType === 'PaoDeKuai.PlayNotify') this.onPdkPlayNotify(msg);
        else if (msgType === 'PaoDeKuai.PlayFailed') this.onPdkPlayFailed(msg);
        else if (msgType === 'PaoDeKuai.Settlement') this.onPdkSettlement(msg);
        else if (msgType === 'PaoDeKuai.DisbandVote') this.onPdkDisbandVote(msg);
        else if (msgType === 'MsgDisbandChoice') this.onPdkDisbandChoice(msg);
        else if (msgType === 'MsgDisbandObsolete') this.onPdkDisbandObsolete();
        else if (msgType === 'MsgDisband') this.onPdkDisband();
        else return false;
        return true;
    }

    protected onSyncGameUIUpdate(isSitting: boolean): void {
        super.onSyncGameUIUpdate(isSitting);
        if (isSitting || this.seat !== -1) this.updateReadyButtonState();
        this.hideGuanDanPokerNodes();
        this.ensurePaodekuaiUI();
        this.refreshPaodekuaiHud();
        this.updateReadyButtonState();
    }

    protected onPlayerAdded(seatIndex: number, playerInfo: any): void {
        super.onPlayerAdded(seatIndex, playerInfo);
        this.hideGuanDanPokerNodes();
        this.refreshPaodekuaiHud();
    }

    protected onPlayerRemoved(seatIndex: number): void {
        super.onPlayerRemoved(seatIndex);
        this.hideGuanDanPokerNodes();
        this.renderOpponentHandBacks(0);
        this.refreshPaodekuaiHud();
    }

    protected onPlayerCapitalChanged(seatIndex: number, capital: any): void {
        super.onPlayerCapitalChanged(seatIndex, capital);
        this.refreshPaodekuaiHud();
    }

    private onPdkDisbandVote(msg: any): void {
        this.showPaodekuaiDissolveVote(msg);
    }

    private onPdkDisbandChoice(msg: any): void {
        const seat = Number(msg?.seat ?? -1);
        const choice = Number(msg?.choice ?? 0);
        if (seat >= 0 && choice > 0) {
            const name = this.getSeatDisplayName(seat);
            Client.Instance.showPromptTip(`${name}${choice === 1 ? '同意' : '拒绝'}解散`, 1.5);
        }
    }

    private onPdkDisbandObsolete(): void {
        if (this.dissolvePanel) this.dissolvePanel.active = false;
        if (this.pdkDissolvePanel) this.pdkDissolvePanel.active = false;
        Client.Instance.showPromptTip('解散申请未通过', 2.0);
    }

    private onPdkDisband(): void {
        if (this.dissolvePanel) this.dissolvePanel.active = false;
        if (this.pdkDissolvePanel) this.pdkDissolvePanel.active = false;
        if (this.settlementPanel?.active) {
            this.updateStatus('房间已解散，请点击完成返回');
            return;
        }
        this.exitRoom();
    }

    protected updateReadyButtonState(): void {
        const selfInfo = this.seat >= 0 ? this.playerInfos[this.seat] : null;
        const alreadyReady = !!selfInfo?.ready;
        const settlementVisible = !!this.settlementPanel?.active;
        const canReady = (this.seat !== -1 &&
            this.gameState === GameState.Waiting &&
            !this.isAllRoundsFinished() &&
            !settlementVisible &&
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
        this.scoreScale = this.resolveMessageScoreScale(msg);
        this.roundCount = Number(msg?.roundCount) || this.roundCount;
        this.bombCountThisRound = Number(msg?.bombCount) || 0;
        this.currentMultiplier = Number(msg?.multiplier) || 1;
        const syncScores = this.arrayLikeToArray(msg?.scores);
        if (this.seat >= 0 && syncScores[this.seat] !== undefined) {
            this.updateScore(Number(syncScores[this.seat]) || 0);
        }
        this.serverCurrentPlayer = Number(msg?.currentPlayer ?? -1);
        this.serverLastPlaySeat = Number(msg?.lastPlaySeat ?? -1);
        this.pdkIsLeader = !!msg?.isFirstPlay;
        this.hasFirstPlayed = false;
        if (!Array.isArray(msg?.avatars) || msg.avatars.length < this.getSeatCount()) {
            this.requestAvatarList();
        }

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
        this.ensureSelfPlayerInfo();
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

    public onSettlementContinueClick(): void {
        if (!this.settlementPanel?.active) return;
        const isFinalRound = this.settlementIsFinalRound;
        this.hideSettlementPanel();

        if (isFinalRound) {
            this.updateStatus('全部对局结束');
            this.exitRoom();
            return;
        }

        this.updateStatus('已继续，等待对手');
        this.onReadyClick();
    }

    public onSettlementReplayClick(): void {
        if (!this.settlementPanel?.active) return;
        this.openSettlementReplay(this.settlementRoundNo, this.settlementTotalRounds);
    }

    public onDissolveAgreeClick(): void {
        this.voteDissolve(true);
    }

    public onDissolveRejectClick(): void {
        this.voteDissolve(false);
    }

    public onPlayClick(): void {
        console.log(`[PaodekuaiRoom] onPlayClick, isMyTurn=${this.isMyTurn}, selected=${this.selectedIndices.size}, hand=${this.myCards.length}`);
        this.playSelectedCards();
    }

    public onHintClick(): void {
        this.hint();
    }

    public onPassClick(): void {
        this.pass();
    }

    public playSelectedCards(): void {
        console.log(`[PaodekuaiRoom] playSelectedCards, isMyTurn=${this.isMyTurn}, selected=${this.selectedIndices.size}, hand=${this.myCards.length}, leader=${this.pdkIsLeader}, current=${this.serverCurrentPlayer}, seat=${this.seat}`);
        if (this.playRequestPending) {
            Client.Instance.showPromptTip('上一手出牌确认中，请稍候', 1.1);
            return;
        }
        if (!this.isMyTurn) {
            Client.Instance.showPromptTip('还没轮到你出牌', 1.2);
            return;
        }

        const selectedIndices = this.getSelectedHandIndices();
        if (selectedIndices.length > 0) {
            const selectedCards = selectedIndices.map(i => this.myCards[i]).filter(Boolean);
            if (selectedCards.length !== selectedIndices.length) {
                Client.Instance.showPromptTip('手牌同步中，请稍后再出牌', 1.5);
                NetworkManager.Instance.sendInnerMessage('PaoDeKuai.Sync');
                return;
            }

            const cardIds = selectedCards.map(c => Number(c.cardId)).filter(id => Number.isFinite(id));
            if (cardIds.length !== selectedCards.length) {
                Client.Instance.showPromptTip('牌数据异常，请重新进入房间', 1.8);
                return;
            }

            console.log(`[PaodekuaiRoom] Sending PaoDeKuai.Play cardIds=${cardIds.join(',')}`);
            if (!this.sendCardIds(cardIds)) return;

            this.previewPendingPlay(selectedCards, this.recognizePattern(selectedCards));
            this.resetHintCycle();
            this.markPlayRequestPending();
            return;
        }

        const picked = this.resolveCardsForPlay();
        if (!picked || picked.cards.length === 0) {
            if (this.myCards.length === 0) {
                NetworkManager.Instance.sendInnerMessage('PaoDeKuai.Sync');
                Client.Instance.showPromptTip('手牌同步中，请稍后再出牌', 1.5);
                return;
            }
            Client.Instance.showPromptTip(this.pdkIsLeader ? '暂无可出的牌' : '没有能管上的牌，请选择要不起', 1.4);
            return;
        }

        const selectedCards = picked.cards;
        const play = picked.play || this.recognizePattern(selectedCards);
        if (!play) {
            Client.Instance.showPromptTip('选择的牌不符合跑得快规则', 1.4);
            return;
        }
        if (!this.pdkIsLeader && this.lastPlay && !this.canBeat(play, this.lastPlay)) {
            Client.Instance.showPromptTip('这手牌管不上对方', 1.4);
            return;
        }

        const cardIds = selectedCards.map(c => Number(c.cardId)).filter(id => Number.isFinite(id));
        if (cardIds.length !== selectedCards.length) {
            Client.Instance.showPromptTip('牌数据异常，请重新进入房间', 1.8);
            return;
        }
        console.log(`[PaodekuaiRoom] Sending PaoDeKuai.Play cardIds=${cardIds.join(',')}`);
        if (!this.sendCardIds(cardIds)) return;

        this.previewPendingPlay(selectedCards, play);
        this.resetHintCycle();
        this.markPlayRequestPending();
    }

    public pass(): void {
        if (this.playRequestPending) {
            Client.Instance.showPromptTip('上一手出牌确认中，请稍候', 1.1);
            return;
        }
        if (!this.isMyTurn || !this.pokerActions?.canPass) return;
        if (!this.sendCardIds([])) return;
        this.markPlayRequestPending();
        this.clearSelection();
        this.resetHintCycle();
        this.updateStatus('已过牌，等待服务器确认');
    }

    private scheduleAutoPass(): void {
        if (this.autoPassScheduled || this.playRequestPending) return;
        this.autoPassScheduled = true;
        this.scheduleOnce(() => {
            this.autoPassScheduled = false;
            if (!this.shouldAutoPassCurrentTurn()) return;
            if (!this.sendCardIds([])) return;
            this.markPlayRequestPending();
            this.clearSelection();
            this.resetHintCycle();
            this.updateStatus('已自动过牌，等待服务器确认');
        }, 0.15);
    }

    private shouldAutoPassCurrentTurn(): boolean {
        if (this.playRequestPending) return false;
        if (this.seat < 0 || this.serverCurrentPlayer !== this.seat) return false;
        if (this.gameState !== GameState.Playing) return false;
        if (this.pdkIsLeader || !this.lastPlay) return false;
        return !this.findSmallestBeatingPlay(this.lastPlay);
    }

    public hint(): void {
        if (this.playRequestPending) {
            Client.Instance.showPromptTip('上一手出牌确认中，请稍候', 1.1);
            return;
        }
        if (!this.isMyTurn) return;

        const target = this.pdkIsLeader ? null : this.lastPlay;
        const contextKey = this.buildHintContextKey(target);
        if (contextKey !== this.hintContextKey) {
            this.hintContextKey = contextKey;
            this.hintOptions = this.enumerateHintPlays(target);
            this.hintOptionIndex = 0;
        } else if (this.hintOptions.length > 0) {
            this.hintOptionIndex = (this.hintOptionIndex + 1) % this.hintOptions.length;
        }

        const suggestion = this.hintOptions[this.hintOptionIndex];
        if (!suggestion) {
            this.clearSelection();
            this.renderMyHand();
            Client.Instance.showPromptTip(target ? '要不起' : '暂无可出的牌', 1.2);
            return;
        }
        this.clearSelection();
        suggestion.indices.forEach(i => this.selectedIndices.add(i));
        this.renderMyHand();
    }

    protected sendPlay(play: CardPlay): void {
        if (this.playRequestPending) return;
        if (this.sendCardIds(play.cards.map(c => Number(c.cardId)))) this.markPlayRequestPending();
    }

    private sendCardIds(cardIds: number[]): boolean {
        if (!NetworkManager.Instance.isConnected()) {
            Client.Instance.showPromptTip('网络未连接，无法出牌', 1.5);
            return false;
        }
        const venueId = GameManager.Instance.VenueId || this.roomInfo?.roomId;
        if (!venueId) {
            Client.Instance.showPromptTip('房间连接未就绪，请稍候', 1.5);
            return false;
        }
        const signedMsg = GameManager.Instance.signatureMessage({ venueId, cardIds });
        if (!signedMsg) {
            Client.Instance.showPromptTip('登录信息异常，请重新进入房间', 1.8);
            return false;
        }
        NetworkManager.Instance.sendMessage('PaoDeKuai.Play', signedMsg, false);
        return true;
    }

    protected onPdkDeal(msg: any): void {
        this.resetRoundState();
        this.resetHintCycle();
        this.hideSettlementPanel();
        this.gameState = GameState.Playing;
        this.currentState = RoomState.Playing;
        this.currentRound = Number(msg?.roundNo) || this.currentRound + 1;
        this.roundCount = Number(msg?.roundCount) || this.roundCount;
        this.totalRounds = this.roundCount;
        this.baseScore = Number(msg?.baseScore) || this.baseScore;
        this.scoreScale = this.resolveMessageScoreScale(msg);
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
        this.clearPlayRequestPending();
        this.clearPendingPlayPreview();
        const serverSeat = Number(msg?.seat ?? -1);
        const clientSeat = this.server2ClientSeat(serverSeat);
        const cardIds: number[] = Array.isArray(msg?.cardIds) ? msg.cardIds.map((id: any) => Number(id)) : [];
        this.currentMultiplier = Number(msg?.multiplier) || this.currentMultiplier;
        const hasServerBombCount = msg?.bombCount !== undefined;
        if (hasServerBombCount) {
            this.bombCountThisRound = Number(msg.bombCount) || 0;
        }
        const scores = this.arrayLikeToArray(msg?.scores);
        if (this.seat >= 0 && scores[this.seat] !== undefined) {
            this.updateScore(Number(scores[this.seat]) || 0);
        }

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
                if (play.pattern === PokerPattern.Bomb && !hasServerBombCount) this.bombCountThisRound++;
                this.playCardSound(play.pattern);
            }
        }

        this.updatePlayerCardCount(clientSeat, Number(msg?.remainCount) || 0);
        this.serverCurrentPlayer = Number(msg?.nextPlayer ?? -1);
        this.clearSelection();
        this.resetHintCycle();
        this.renderMyHand();
        this.updateCardCountDisplay();
        this.updateMultiplierDisplay();
        this.refreshPaodekuaiHud();
        this.updateTurnState();
    }

    protected onPdkPlayFailed(msg: any): void {
        this.clearPlayRequestPending();
        Client.Instance.showPromptTip(msg?.errMsg || '出牌失败', 2.0);
        this.playErrorSound();
        this.restorePendingPlaySelection();
        this.isMyTurn = this.serverCurrentPlayer === this.seat;
        this.updateTurnState();
    }

    protected onPdkSettlement(msg: any): void {
        this.isMyTurn = false;
        this.stopCountdown();
        this.showPassAndPlayButtons(false);
        this.currentMultiplier = Number(msg?.multiplier) || this.currentMultiplier;
        this.scoreScale = this.resolveMessageScoreScale(msg);
        this.bombCountThisRound = Number(msg?.bombCount) || this.bombCountThisRound;
        this.currentState = RoomState.RoundSettlement;

        if (msg?.roundNo !== undefined) this.currentRound = Number(msg.roundNo) || this.currentRound;
        if (msg?.roundCount !== undefined) {
            this.roundCount = Number(msg.roundCount) || this.roundCount;
            this.totalRounds = this.roundCount;
        }

        const scores: number[] = this.arrayLikeToArray(msg?.scores);
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
        const golds = this.arrayLikeToArray(msg?.golds);
        const winGolds = this.arrayLikeToArray(msg?.winGolds);
        const balanceCount = golds.length > 0 ? golds.length : winGolds.length;
        for (let s = 0; s < Math.min(2, balanceCount); s++) {
            const info = this.playerInfos[s];
            if (!info) continue;
            const balance = golds.length > 0
                ? Number(golds[s] || 0)
                : Number(info.gold || 0) + Number(winGolds[s] || 0);
            info.gold = Math.max(0, balance);
        }
        const winner = Number(msg?.winnerSeat ?? -1);
        const resultText = winner === this.seat ? '胜利' : '失败';
        const springText = msg?.spring ? ' 春天' : '';
        this.updateStatus(`${resultText} ${this.formatSignedScore(myScore)}${springText}`);
        Client.Instance.showPromptTip(`本局${resultText}：${this.formatSignedScore(myScore)}`, 2.5);
        this.gameState = GameState.Waiting;
        this.setLocalReadyFlags(false);
        this.refreshPaodekuaiHud();
        const settledRound = Number(msg?.roundNo ?? this.currentRound) || 0;
        const totalRounds = Number(msg?.roundCount ?? this.roundCount ?? this.totalRounds) || 0;
        const isFinalRound = msg?.roomFinished === true ||
            (totalRounds > 0 && settledRound >= totalRounds) ||
            this.hasFinalFeeSettlement(msg);
        this.showSettlementPanel(msg, scores, myScore, winner, isFinalRound);
        this.updateReadyButtonState();
        console.log(`[PaodekuaiRoom] Settlement winner=${winner}, multiplier=${this.currentMultiplier}, spring=${!!msg?.spring}`);
    }

    private hasFinalFeeSettlement(msg: any): boolean {
        return Number(msg?.roomFeeTotal || 0) > 0 || Number(msg?.shuffleFeeTotal || 0) > 0;
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
        if (n >= 4 && n % 2 === 0 && this.isConsecutivePairs(values)) {
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
        const options = this.enumerateHintPlays(target);
        return options.length > 0 ? options[0] : null;
    }

    private enumerateHintPlays(target: CardPlay | null): Array<{ indices: number[]; play: CardPlay }> {
        const n = this.myCards.length;
        const options: Array<{ indices: number[]; play: CardPlay }> = [];
        const seen = new Set<string>();
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
            const signature = this.getHintPlaySignature(play);
            if (seen.has(signature)) continue;
            seen.add(signature);
            options.push({ indices, play });
        }
        options.sort((a, b) => this.compareHintSuggestion(a.play, b.play, !!target));
        return options;
    }

    private compareHintSuggestion(a: CardPlay, b: CardPlay, beating: boolean): number {
        if (this.isBetterSuggestion(a, b, beating)) return -1;
        if (this.isBetterSuggestion(b, a, beating)) return 1;
        const aValues = a.cards.map(c => c.value).sort((x, y) => x - y).join(',');
        const bValues = b.cards.map(c => c.value).sort((x, y) => x - y).join(',');
        return aValues.localeCompare(bValues);
    }

    private getHintPlaySignature(play: CardPlay): string {
        const values = play.cards.map(c => c.value).sort((a, b) => a - b).join(',');
        return `${play.pattern}|${play.weight}|${values}`;
    }

    private buildHintContextKey(target: CardPlay | null): string {
        const handKey = this.myCards.map(c => c.cardId).join(',');
        if (!target) return `${handKey}|lead`;
        const targetCards = target.cards.map(c => c.cardId).sort().join(',');
        return `${handKey}|${target.pattern}|${target.weight}|${targetCards}`;
    }

    private resetHintCycle(): void {
        this.hintOptions = [];
        this.hintOptionIndex = 0;
        this.hintContextKey = '';
    }

    private findBestDragPlay(rangeIndices: number[]): { indices: number[]; play: CardPlay } | null {
        const indices = Array.from(new Set(rangeIndices))
            .filter(i => i >= 0 && i < this.myCards.length)
            .sort((a, b) => a - b);
        if (indices.length === 0) return null;

        const target = this.pdkIsLeader ? null : this.lastPlay;
        const exact = this.buildPlayFromIndices(indices, target);
        if (exact) return exact;

        const candidates = this.enumerateHintPlaysFromIndices(indices, target);
        if (target) return candidates.length > 0 ? candidates[0] : null;

        candidates.sort((a, b) => this.compareDragLeadSuggestion(a.play, b.play));
        return candidates.length > 0 ? candidates[0] : null;
    }

    private buildPlayFromIndices(indices: number[], target: CardPlay | null): { indices: number[]; play: CardPlay } | null {
        const cards = indices.map(i => this.myCards[i]).filter(Boolean);
        const play = this.recognizePattern(cards);
        if (!play) return null;
        if (target && !this.canBeat(play, target)) return null;
        return { indices: indices.slice(), play };
    }

    private enumerateHintPlaysFromIndices(allowedIndices: number[], target: CardPlay | null): Array<{ indices: number[]; play: CardPlay }> {
        const options: Array<{ indices: number[]; play: CardPlay }> = [];
        const seen = new Set<string>();
        const n = allowedIndices.length;
        for (let mask = 1; mask < (1 << n); mask++) {
            const indices: number[] = [];
            const cards: PokerCard[] = [];
            for (let i = 0; i < n; i++) {
                if ((mask & (1 << i)) === 0) continue;
                const cardIndex = allowedIndices[i];
                indices.push(cardIndex);
                cards.push(this.myCards[cardIndex]);
            }
            const play = this.recognizePattern(cards);
            if (!play) continue;
            if (target && !this.canBeat(play, target)) continue;
            const signature = this.getHintPlaySignature(play);
            if (seen.has(signature)) continue;
            seen.add(signature);
            options.push({ indices: indices.sort((a, b) => a - b), play });
        }
        options.sort((a, b) => this.compareHintSuggestion(a.play, b.play, !!target));
        return options;
    }

    private compareDragLeadSuggestion(a: CardPlay, b: CardPlay): number {
        if (a.cards.length !== b.cards.length) return b.cards.length - a.cards.length;
        const rankDiff = this.getDragPatternRank(b.pattern) - this.getDragPatternRank(a.pattern);
        if (rankDiff !== 0) return rankDiff;
        if (a.weight !== b.weight) return a.weight - b.weight;
        return this.compareHintSuggestion(a, b, false);
    }

    private getDragPatternRank(pattern: PokerPattern): number {
        switch (pattern) {
            case PokerPattern.AirplaneWithPairs: return 92;
            case PokerPattern.AirplaneWithSingles: return 91;
            case PokerPattern.Airplane: return 90;
            case PokerPattern.ConsecutivePairs: return 80;
            case PokerPattern.Straight: return 70;
            case PokerPattern.TripleWithPair: return 60;
            case PokerPattern.TripleWithOne: return 50;
            case PokerPattern.Bomb: return 45;
            case PokerPattern.Triple: return 40;
            case PokerPattern.Pair: return 20;
            case PokerPattern.Single: return 10;
            default: return 0;
        }
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
            if (!this.pdkIsLeader && !!this.lastPlay && !canBeat) {
                this.pokerActions = {
                    canPlay: false,
                    canHint: false,
                    canPass: false,
                    isLeader: false,
                    mustPlay: false,
                };
                this.showPassAndPlayButtons(false);
                this.stopCountdown();
                this.clearSelection();
                this.resetHintCycle();
                this.updateStatus('要不起，自动过牌');
                this.scheduleAutoPass();
                return;
            }
            const canPass = !this.pdkIsLeader && (!this.forcePlayIfCanBeat || !canBeat);
            const canPlay = this.pdkIsLeader || canBeat || !this.lastPlay;
            const canHint = canPlay || (!!this.lastPlay && !this.pdkIsLeader);
            this.pokerActions = {
                canPlay,
                canHint,
                canPass,
                isLeader: this.pdkIsLeader,
                mustPlay: !canPass,
            };
            this.showPassAndPlayButtons(true);
            this.startCountdown(180);
            this.updateStatus(this.pdkIsLeader ? '轮到你出牌' : (canPass ? '要不起可跳过' : '有牌可管，必须出牌'));
        } else {
            this.pokerActions = null;
            this.showPassAndPlayButtons(false);
            this.resetHintCycle();
            this.stopCountdown();
            this.autoPassScheduled = false;
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
        this.clearPlayRequestPending();
        this.bombCountThisRound = 0;
        this.currentMultiplier = 1;
        this.myRoundScore = 0;
        this.serverCurrentPlayer = -1;
        this.serverLastPlaySeat = -1;
        this.pdkIsLeader = true;
        this.hasFirstPlayed = false;
        this.resetHintCycle();
        this.autoPassScheduled = false;
    }

    protected showPassAndPlayButtons(show: boolean): void {
        const showPass = show && !!this.pokerActions?.canPass;
        const showHint = show && !!this.pokerActions?.canHint;
        const showPlay = show && !!this.pokerActions?.canPlay;
        const canTouch = !this.playRequestPending;
        this.ensurePaodekuaiActionControls();
        if (this.pdkActionRoot) {
            const anyVisible = showPass || showHint || showPlay;
            this.pdkActionRoot.active = anyVisible;
            if (anyVisible && this.overlayRoot) {
                this.pdkActionRoot.setSiblingIndex(this.overlayRoot.children.length - 1);
            }

            const visibleButtons = [
                { node: this.pdkActionPassButton, active: showPass },
                { node: this.pdkActionHintButton, active: showHint },
                { node: this.pdkActionPlayButton, active: showPlay },
            ].filter(item => item.node && item.active);
            const positions = visibleButtons.length === 3
                ? [-210, -40, 130]
                : (visibleButtons.length === 2 ? [-94, 94] : [0]);

            [
                { node: this.pdkActionPassButton, active: showPass },
                { node: this.pdkActionHintButton, active: showHint },
                { node: this.pdkActionPlayButton, active: showPlay },
            ].forEach(item => {
                if (!item.node) return;
                item.node.active = item.active;
                this.setButtonInteractable(item.node, item.active && canTouch);
                const visibleIndex = visibleButtons.findIndex(visible => visible.node === item.node);
                if (visibleIndex >= 0) item.node.setPosition(positions[visibleIndex], 0, 0);
            });
            return;
        }
        if (this.passGroup) {
            const passX = showPass && showPlay ? -176 : 0;
            this.passGroup.setPosition(passX, this.passGroup.position.y, this.passGroup.position.z);
            this.passGroup.active = showPass;
        }
        if (this.playGroup) {
            const playX = showPass && showPlay ? 54 : 0;
            this.playGroup.setPosition(playX, this.playGroup.position.y, this.playGroup.position.z);
            this.playGroup.active = showPlay;
        }
    }

    private setButtonInteractable(node: Node, interactable: boolean): void {
        (node as any)._pdkDisabled = !interactable;
        const button = node.getComponent(Button);
        if (button) button.interactable = interactable;
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
            this.bindHandCardTouch(cardNode, i);
        }
        this.updateCardCountDisplay();
    }

    private bindHandCardTouch(cardNode: Node, cardIndex: number): void {
        cardNode.on(Node.EventType.TOUCH_START, (event: EventTouch) => this.onHandCardTouchStart(event, cardIndex), this);
        cardNode.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => this.onHandCardTouchMove(event), this);
        cardNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => this.onHandCardTouchEnd(event, cardIndex), this);
        cardNode.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => this.onHandCardTouchCancel(event), this);
    }

    private onHandCardTouchStart(event: EventTouch, cardIndex: number): void {
        if (!this.isMyTurn || !this.pokerActions?.canPlay) return;
        event.propagationStopped = true;
        this.dragSelectStartIndex = cardIndex;
        this.dragSelectCurrentIndex = cardIndex;
        this.dragSelectStartX = this.getHandTouchLocalX(event);
        this.dragSelectActive = false;
    }

    private onHandCardTouchMove(event: EventTouch): void {
        if (this.dragSelectStartIndex < 0 || !this.isMyTurn || !this.pokerActions?.canPlay) return;
        event.propagationStopped = true;

        const localX = this.getHandTouchLocalX(event);
        const cardIndex = this.getHandIndexByLocalX(localX);
        if (cardIndex < 0) return;

        const movedEnough = Math.abs(localX - this.dragSelectStartX) >= 14 || cardIndex !== this.dragSelectStartIndex;
        if (!this.dragSelectActive && !movedEnough) return;

        this.dragSelectActive = true;
        if (cardIndex === this.dragSelectCurrentIndex) return;
        this.dragSelectCurrentIndex = cardIndex;
        this.applyDragRuleSelection(false);
    }

    private onHandCardTouchEnd(event: EventTouch, cardIndex: number): void {
        if (this.dragSelectStartIndex < 0) return;
        event.propagationStopped = true;

        if (!this.dragSelectActive) {
            this.resetDragSelectionState();
            this.toggleCardSelection(cardIndex);
            return;
        }

        const localX = this.getHandTouchLocalX(event);
        const endIndex = this.getHandIndexByLocalX(localX);
        if (endIndex >= 0) this.dragSelectCurrentIndex = endIndex;
        this.applyDragRuleSelection(true);
        this.resetDragSelectionState();
    }

    private onHandCardTouchCancel(event: EventTouch): void {
        if (this.dragSelectStartIndex >= 0) event.propagationStopped = true;
        this.resetDragSelectionState();
    }

    private getHandTouchLocalX(event: EventTouch): number {
        if (!this.myHandArea) return 0;
        const transform = this.myHandArea.getComponent(UITransform);
        if (!transform) return 0;
        const pos = event.getUILocation();
        return transform.convertToNodeSpaceAR(new Vec3(pos.x, pos.y, 0)).x;
    }

    private getHandIndexByLocalX(localX: number): number {
        if (this.myCards.length === 0) return -1;
        const layout = this.getMyHandLayout();
        const rawIndex = Math.round((localX - layout.startX) / layout.gap);
        return Math.max(0, Math.min(this.myCards.length - 1, rawIndex));
    }

    private applyDragRuleSelection(finalize: boolean): void {
        const range = this.getDragRangeIndices();
        const best = this.findBestDragPlay(range);
        if (best) {
            this.selectedIndices = new Set(best.indices);
        } else {
            this.selectedIndices = new Set(range);
        }
        this.resetHintCycle();
        this.applyCurrentSelectionToHand();
        if (finalize && !best) Client.Instance.showPromptTip('范围内没有可出的牌', 1.1);
    }

    private getDragRangeIndices(): number[] {
        if (this.dragSelectStartIndex < 0 || this.dragSelectCurrentIndex < 0) return [];
        const min = Math.min(this.dragSelectStartIndex, this.dragSelectCurrentIndex);
        const max = Math.max(this.dragSelectStartIndex, this.dragSelectCurrentIndex);
        const indices: number[] = [];
        for (let i = min; i <= max; i++) indices.push(i);
        return indices;
    }

    private resetDragSelectionState(): void {
        this.dragSelectStartIndex = -1;
        this.dragSelectCurrentIndex = -1;
        this.dragSelectStartX = 0;
        this.dragSelectActive = false;
    }

    private applyCurrentSelectionToHand(): void {
        for (let i = 0; i < this.myCards.length; i++) {
            const node = this.getCardNodeByIndex(i);
            if (!node) continue;
            if (this.selectedIndices.has(i)) this.applySelectedStyle(node);
            else this.applyNormalStyle(node);
        }
        this.pokerCallbacks.onSelectionChanged?.(Array.from(this.selectedIndices));
    }

    private getSelectedHandIndices(): number[] {
        const rawIndices = Array.from(this.selectedIndices);
        const indices = rawIndices
            .map(i => Number(i))
            .filter(i => Number.isInteger(i) && i >= 0 && i < this.myCards.length)
            .sort((a, b) => a - b);

        if (indices.length !== rawIndices.length) {
            console.warn(`[PaodekuaiRoom] Dropped invalid selected indices: selected=${rawIndices.join(',')}, hand=${this.myCards.length}`);
            this.selectedIndices = new Set(indices);
            this.applyCurrentSelectionToHand();
        }

        return indices;
    }

    private getMyHandLayout(): { gap: number; startX: number } {
        const gap = this.myCards.length > 14 ? 58 : 66;
        return {
            gap,
            startX: -((this.myCards.length - 1) * gap) / 2,
        };
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
        this.prepareStandalonePaodekuaiRoot();

        if (this.overlayRoot) {
            if (this.overlayRoot.parent !== this.node) {
                this.overlayRoot.parent = this.node;
            }
            this.overlayRoot.layer = PDK_UI_LAYER;
            this.overlayRoot.getComponent(UITransform)?.setContentSize(PDK_STAGE_WIDTH, PDK_STAGE_HEIGHT);
            if (!this.overlayRoot.getComponent(BlockInputEvents)) this.overlayRoot.addComponent(BlockInputEvents);
            this.hideGuanDanPokerNodes();
            this.overlayRoot.active = true;
            this.overlayRoot.setSiblingIndex(this.node.children.length - 1);
            this.ensurePaodekuaiReadyButton();
            this.ensurePaodekuaiBackButton();
            this.ensurePaodekuaiActionControls();
            this.ensurePaodekuaiPlayerInfo();
            this.ensurePaodekuaiCountdown();
            this.ensureSettlementPanel();
            this.ensurePaodekuaiDissolvePanel();
            return;
        }

        const overlay = new Node('PaodekuaiOverlay');
        overlay.layer = PDK_UI_LAYER;
        overlay.parent = this.node;
        overlay.addComponent(UITransform).setContentSize(PDK_STAGE_WIDTH, PDK_STAGE_HEIGHT);
        overlay.addComponent(BlockInputEvents);
        overlay.setPosition(0, 0, 0);
        overlay.setSiblingIndex(this.node.children.length - 1);
        (overlay as any)._paodekuaiStandaloneMarker = PDK_STANDALONE_MARKER;
        this.overlayRoot = overlay;

        const tableBg = this.createArea(overlay, 'PaodekuaiTableBg', 0, 0, PDK_STAGE_WIDTH, PDK_STAGE_HEIGHT);
        this.paintRect(tableBg, PDK_STAGE_WIDTH, PDK_STAGE_HEIGHT, new Color(23, 78, 70, 255), undefined, 0);
        const tableCenter = this.createArea(overlay, 'PaodekuaiTableCenter', 0, 8, 1180, 660);
        this.paintRect(tableCenter, 1180, 660, new Color(31, 104, 88, 238), new Color(226, 190, 112, 185), 26);

        const hud = this.createArea(overlay, 'PaodekuaiHud', -560, 315, 360, 240);
        this.paintRect(hud, 360, 240, new Color(29, 35, 52, 214), new Color(238, 198, 116, 255), 18);

        this.createLabel(hud, 'Title', '跑得快', 26, 0, 92, 280, 30, new Color(255, 236, 198, 255));
        this.roomInfoLabel = this.createLabel(hud, 'RoomInfo', '', 16, 0, 62, 320, 22, new Color(188, 205, 225, 255));
        this.ruleInfoLabel = this.createLabel(hud, 'RuleInfo', '两人15张 · 赢家先出', 16, 0, 38, 320, 22, new Color(255, 200, 80, 255));
        this.scoreLabel = this.createLabel(hud, 'Score', '本局 0', 22, 0, 10, 300, 26, new Color(255, 255, 255, 255));
        this.multiLabel = this.createLabel(hud, 'Multiplier', '倍数 1倍', 18, 0, -18, 320, 24, new Color(255, 219, 144, 255));
        this.opponentInfoLabel = this.createLabel(hud, 'OpponentInfo', '等待对手入座', 18, 0, -48, 320, 24, new Color(184, 226, 255, 255));
        this.opponentCountLabel = this.createLabel(hud, 'OpponentCount', '对手手牌', 16, 0, -76, 320, 22, new Color(188, 205, 225, 255));

        this.statusLabel = this.createLabel(overlay, 'Status', '', 28, 0, 248, 560, 44, new Color(255, 226, 136, 255));
        this.ensurePaodekuaiCountdown();
        this.cardCountLabel = this.createLabel(overlay, 'MyCount', '0张', 22, 0, -292, 180, 36, new Color(240, 240, 240, 255));

        this.myHandArea = this.createArea(overlay, 'MyHand', 0, -390, 1240, 140);
        this.myPlayArea = this.createArea(overlay, 'MyPlay', 0, -120, 760, 98);
        this.leftPlayArea = this.createArea(overlay, 'OpponentPlay', 0, 118, 760, 98);
        this.opponentHandArea = this.createArea(overlay, 'OpponentHand', 0, 302, 760, 82);

        this.ensurePaodekuaiActionControls();
        this.ensurePaodekuaiReadyButton();
        this.ensurePaodekuaiBackButton();
        this.ensurePaodekuaiPlayerInfo();
        this.ensurePaodekuaiCountdown();
        this.ensureSettlementPanel();
        this.ensurePaodekuaiDissolvePanel();
        this.showPassAndPlayButtons(false);
    }

    private ensurePaodekuaiCountdown(): void {
        if (!this.overlayRoot) return;
        if (this.pdkCountdownRoot && this.pdkCountdownLabel) {
            this.countdownLabel = this.pdkCountdownLabel;
            return;
        }

        const root = this.createArea(this.overlayRoot, 'PaodekuaiCountdown', 0, 190, 220, 58);
        this.paintRect(root, 220, 58, new Color(18, 27, 42, 232), new Color(247, 194, 92, 255), 8);
        this.createLabel(root, 'Caption', '出牌倒计时', 16, 0, 14, 160, 20, new Color(198, 215, 232, 255));
        this.pdkCountdownLabel = this.createLabel(root, 'Second', '180', 32, -14, -12, 92, 36, new Color(255, 244, 190, 255));
        this.createLabel(root, 'Unit', '秒', 18, 48, -12, 34, 28, new Color(255, 230, 150, 255));
        root.active = false;

        this.pdkCountdownRoot = root;
        this.countdownLabel = this.pdkCountdownLabel;
    }

    private updatePaodekuaiCountdownVisual(): void {
        if (!this.pdkCountdownLabel || !this.pdkCountdownRoot || !this.pdkCountdownRoot.active) return;
        const remaining = Math.max(0, Math.ceil(this.countdownSeconds - this.countdownElapsed));
        this.pdkCountdownLabel.string = String(remaining);
        this.pdkCountdownLabel.color = remaining <= 15
            ? new Color(255, 92, 92, 255)
            : new Color(255, 244, 190, 255);
    }

    private ensurePaodekuaiActionControls(): void {
        if (!this.overlayRoot) return;

        if (this.passGroup && this.passGroup !== this.pdkActionRoot) this.passGroup.active = false;
        if (this.playGroup && this.playGroup !== this.pdkActionRoot) this.playGroup.active = false;

        if (this.pdkActionRoot) {
            if (this.pdkActionRoot.parent !== this.overlayRoot) this.pdkActionRoot.parent = this.overlayRoot;
            this.pdkActionRoot.setSiblingIndex(this.overlayRoot.children.length - 1);
            return;
        }

        const root = this.createArea(this.overlayRoot, 'PaodekuaiActionControls', 0, -236, 640, 96);
        root.setSiblingIndex(this.overlayRoot.children.length - 1);
        this.pdkActionRoot = root;

        this.pdkActionPassButton = this.createPaodekuaiActionButton(
            root,
            '要不起',
            -210,
            'pass',
            new Color(84, 92, 106, 244),
            new Color(174, 187, 201, 255),
            'PaodekuaiFreshPassButton'
        );
        this.pdkActionHintButton = this.createPaodekuaiActionButton(
            root,
            '提示',
            -40,
            'hint',
            new Color(39, 118, 165, 246),
            new Color(151, 216, 255, 255),
            'PaodekuaiFreshHintButton'
        );
        this.pdkActionPlayButton = this.createPaodekuaiActionButton(
            root,
            '出牌',
            130,
            'onPlayClick',
            new Color(34, 148, 88, 248),
            new Color(167, 244, 190, 255),
            'PaodekuaiFreshPlayButton'
        );

        root.active = false;
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

    private ensurePaodekuaiBackButton(): void {
        if (!this.overlayRoot || this.pdkBackButton) return;
        const inheritedBack = this.findChildRecursive(this.node, 'BtnBack');
        if (inheritedBack) inheritedBack.active = false;
        this.pdkBackButton = this.createTextButton(
            this.overlayRoot,
            '退出',
            -742,
            420,
            'onBackClick',
            new Color(16, 20, 30, 228),
            'PaodekuaiBackButton'
        );
    }

    private ensurePaodekuaiPlayerInfo(): void {
        if (!this.overlayRoot || this.playerInfoRoot) return;
        this.playerInfoRoot = this.createArea(this.overlayRoot, 'PaodekuaiPlayerInfoRoot', 0, 0, 1, 1);
        this.createPlayerInfoCard(0, -560, -300, 318, 86);
        this.createPlayerInfoCard(1, 560, 356, 318, 86);
    }

    private createPlayerInfoCard(index: number, x: number, y: number, w: number, h: number): void {
        if (!this.playerInfoRoot) return;
        const root = this.createArea(this.playerInfoRoot, `PlayerInfo${index}`, x, y, w, h);
        this.paintRect(root, w, h, new Color(18, 26, 38, 220), new Color(214, 182, 116, 255), 8);
        this.playerCardRoots[index] = root;
        this.playerNameLabels[index] = this.createLabel(root, 'Name', '', 22, 0, 22, w - 24, 26, new Color(255, 238, 201, 255));
        this.playerGoldLabels[index] = this.createLabel(root, 'Gold', '', 18, 0, -4, w - 24, 22, new Color(213, 232, 255, 255));
        this.playerStateLabels[index] = this.createLabel(root, 'State', '', 18, 0, -28, w - 24, 22, new Color(255, 220, 146, 255));
        root.active = true;
    }

    private ensureSettlementPanel(): void {
        if (!this.overlayRoot || this.settlementPanel) return;

        const overlay = this.createArea(this.overlayRoot, 'SettlementOverlay', 0, 0, PDK_STAGE_WIDTH, PDK_STAGE_HEIGHT);
        overlay.addComponent(BlockInputEvents);
        const mask = overlay.addComponent(Graphics);
        mask.fillColor = new Color(0, 0, 0, 138);
        mask.roundRect(-PDK_STAGE_WIDTH / 2, -PDK_STAGE_HEIGHT / 2, PDK_STAGE_WIDTH, PDK_STAGE_HEIGHT, 0);
        mask.fill();

        const panel = this.createArea(overlay, 'SettlementPanel', 0, 22, 680, 470);
        this.paintRect(panel, 680, 470, new Color(18, 29, 42, 246), new Color(236, 190, 96, 255), 8);

        this.settlementTitleLabel = this.createLabel(panel, 'Title', '本局结算', 32, 0, 178, 420, 44, new Color(255, 225, 120, 255));
        this.settlementScoreLabel = this.createLabel(panel, 'Score', '+0', 40, 0, 123, 420, 54, new Color(255, 255, 255, 255));
        this.settlementDetailLabel = this.createLabel(panel, 'Detail', '', 21, 0, 62, 590, 66, new Color(218, 226, 234, 255));

        for (let i = 0; i < 2; i++) {
            const row = this.createArea(panel, `PlayerSettlement${i}`, 0, i === 0 ? -28 : -90, 600, 52);
            this.paintRect(row, 600, 52, new Color(26, 39, 56, 222), new Color(99, 128, 156, 155), 8);
            this.settlementPlayerLabels[i] = this.createLabel(row, 'Text', '', 20, 0, 0, 570, 34, new Color(238, 242, 246, 255));
        }

        this.settlementRoomFeeLabel = this.createLabel(panel, 'SettlementStatsInfo', '', 18, 0, -138, 610, 56, new Color(255, 207, 128, 255));
        this.settlementRoomFeeLabel.lineHeight = 23;
        this.settlementRoomFeeLabel.verticalAlign = 1;
        this.settlementRoomFeeLabel.overflow = Label.Overflow.SHRINK;
        this.settlementRoomFeeLabel.node.active = false;

        const replayButton = this.createTextButton(panel, '回放', -154, -194, 'onSettlementReplayClick', new Color(63, 98, 143, 235), 'SettlementReplayButton');
        this.settlementReplayLabel = this.findChildComponent<Label>(replayButton, 'Label', Label);
        this.settlementShuffleButton = this.createTextButton(panel, '洗牌', 0, -194, 'onShuffleCardsClick', new Color(135, 93, 40, 235), 'SettlementShuffleButton');
        this.settlementShuffleLabel = this.findChildComponent<Label>(this.settlementShuffleButton, 'Label', Label);
        const continueButton = this.createTextButton(panel, '继续', 154, -194, 'onSettlementContinueClick', new Color(46, 139, 87, 235), 'SettlementContinueButton');
        this.settlementContinueLabel = this.findChildComponent<Label>(continueButton, 'Label', Label);

        overlay.active = false;
        this.settlementPanel = overlay;
    }

    private ensurePaodekuaiDissolvePanel(): void {
        if (!this.overlayRoot || this.pdkDissolvePanel) return;

        const overlay = this.createArea(this.overlayRoot, 'DissolveOverlay', 0, 0, PDK_STAGE_WIDTH, PDK_STAGE_HEIGHT);
        overlay.addComponent(BlockInputEvents);
        const mask = overlay.addComponent(Graphics);
        mask.fillColor = new Color(0, 0, 0, 150);
        mask.roundRect(-PDK_STAGE_WIDTH / 2, -PDK_STAGE_HEIGHT / 2, PDK_STAGE_WIDTH, PDK_STAGE_HEIGHT, 0);
        mask.fill();

        const panel = this.createArea(overlay, 'DissolvePanel', 0, 34, 540, 268);
        this.paintRect(panel, 540, 268, new Color(23, 35, 52, 248), new Color(238, 198, 116, 255), 10);
        this.pdkDissolveTitleLabel = this.createLabel(panel, 'Title', '申请解散房间', 28, 0, 78, 460, 40, new Color(255, 226, 136, 255));
        this.pdkDissolveChoiceLabel = this.createLabel(panel, 'Choices', '', 21, 0, 18, 460, 72, new Color(226, 235, 242, 255));
        this.pdkDissolveAgreeButton = this.createTextButton(panel, '同意', -92, -82, 'onDissolveAgreeClick', new Color(46, 139, 87, 238), 'DissolveAgreeButton');
        this.pdkDissolveRejectButton = this.createTextButton(panel, '拒绝', 92, -82, 'onDissolveRejectClick', new Color(158, 68, 64, 238), 'DissolveRejectButton');

        overlay.active = false;
        this.pdkDissolvePanel = overlay;
        this.dissolvePanel = overlay;
    }

    private showPaodekuaiDissolveVote(msg: any): void {
        this.ensurePaodekuaiDissolvePanel();
        if (!this.pdkDissolvePanel) return;
        const disbander = Number(msg?.disbander ?? -1);
        const remainTime = Math.max(0, Number(msg?.remainTime ?? 300) || 0);
        const choices = this.arrayLikeToArray(msg?.choices);
        const titleName = this.getSeatDisplayName(disbander);
        if (this.pdkDissolveTitleLabel) {
            this.pdkDissolveTitleLabel.string = `${titleName}申请解散房间`;
        }
        if (this.pdkDissolveChoiceLabel) {
            const parts = [0, 1].map((seat) => `${this.getSeatDisplayName(seat)}：${this.formatDissolveChoice(Number(choices[seat] || 0))}`);
            this.pdkDissolveChoiceLabel.string = `${parts.join('\n')}\n剩余 ${remainTime} 秒`;
        }
        const myChoice = this.seat >= 0 ? Number(choices[this.seat] || 0) : 0;
        const canVote = this.seat >= 0 && myChoice === 0;
        this.setDissolveButtonActive(this.pdkDissolveAgreeButton, canVote);
        this.setDissolveButtonActive(this.pdkDissolveRejectButton, canVote);
        this.pdkDissolvePanel.active = true;
        this.pdkDissolvePanel.setSiblingIndex(this.overlayRoot ? this.overlayRoot.children.length - 1 : 999);
    }

    private setDissolveButtonActive(node: Node | null, active: boolean): void {
        if (!node) return;
        node.active = active;
        const button = node.getComponent(Button);
        if (button) button.interactable = active;
    }

    private formatDissolveChoice(choice: number): string {
        if (choice === 1) return '已同意';
        if (choice === 2) return '已拒绝';
        return '待选择';
    }

    private getSeatDisplayName(seat: number): string {
        if (seat < 0) return '玩家';
        const info = this.playerInfos[seat];
        if (seat === this.seat) return '你';
        return info?.nickname || info?.playerId || `玩家${seat + 1}`;
    }

    private showSettlementPanel(msg: any, scores: number[], myScore: number, winnerSeat: number, isFinalRound: boolean): void {
        this.ensureSettlementPanel();
        if (!this.settlementPanel) return;

        this.settlementIsFinalRound = isFinalRound;
        const isWin = winnerSeat === this.seat;
        const scoreScale = this.resolveMessageScoreScale(msg);
        this.scoreScale = scoreScale;
        const multiplier = Number(msg?.multiplier ?? this.currentMultiplier ?? 1) || 1;
        const baseScore = Number(msg?.baseScore ?? this.baseScore) || this.baseScore || 1;
        const bombCount = Number(msg?.bombCount ?? this.bombCountThisRound) || 0;
        const springText = msg?.spring ? ' | 春天' : '';
        const zhaNiao = !!msg?.zhaNiao;
        const birdHit = !!msg?.birdHit;
        const birdText = zhaNiao ? (birdHit ? `扎鸟 x${multiplier}` : '扎鸟未中') : '普通计分';
        const bombScores = this.arrayLikeToArray(msg?.bombScores);
        const settledRound = Number(msg?.roundNo ?? this.currentRound) || this.currentRound || 0;
        const totalRounds = Number(msg?.roundCount ?? this.roundCount ?? this.totalRounds) || 0;
        this.settlementRoundNo = settledRound;
        this.settlementTotalRounds = totalRounds;
        const roundText = totalRounds > 0 ? `第 ${settledRound}/${totalRounds} 局` : `第 ${settledRound} 局`;

        if (this.settlementTitleLabel) this.settlementTitleLabel.string = isWin ? '本局胜利' : '本局失败';
        if (this.settlementScoreLabel) {
            this.settlementScoreLabel.string = this.formatSignedScore(myScore, scoreScale);
            this.settlementScoreLabel.color = isWin ? new Color(255, 239, 178, 255) : new Color(152, 213, 255, 255);
        }
        if (this.settlementDetailLabel) {
            const myBombScore = this.seat >= 0 ? Number(bombScores[this.seat] || 0) : 0;
            this.settlementDetailLabel.string =
                `${roundText} | 底分 ${this.formatScoreValue(baseScore, scoreScale)} | ${birdText}${springText}\n` +
                `炸弹 ${bombCount} 次 | 炸弹分 ${this.formatSignedScore(myBombScore, scoreScale)} | ${isFinalRound ? '全部对局结束' : '点击继续后进入下一局准备'}`;
        }

        const winGolds = this.arrayLikeToArray(msg?.winGolds);
        const remainCards = this.arrayLikeToNestedArray(msg?.remainCards);
        for (let clientSeat = 0; clientSeat < 2; clientSeat++) {
            const serverSeat = this.client2ServerSeat(clientSeat);
            const info = serverSeat >= 0 ? this.playerInfos[serverSeat] : null;
            const score = scores[serverSeat] ?? 0;
            const winGold = winGolds[serverSeat] ?? score;
            const remain = remainCards[serverSeat] || [];
            const name = info?.nickname || info?.playerId || (clientSeat === 0 ? '自己' : '对手');
            const tags: string[] = [];
            if (serverSeat === this.seat) tags.push('我');
            if (serverSeat === winnerSeat) tags.push('胜方');
            const tagText = tags.length > 0 ? ` · ${tags.join('/')}` : '';
            const remainText = remain.length === 1 ? '剩 1 张（报单不计分）' : `剩 ${remain.length} 张`;
            if (this.settlementPlayerLabels[clientSeat]) {
                this.settlementPlayerLabels[clientSeat]!.string =
                    `${name}${tagText} | 本局 ${this.formatSignedScore(score, scoreScale)} | 金币 ${this.formatSignedScore(winGold, scoreScale)} | ${remainText}`;
            }
        }

        if (this.settlementRoomFeeLabel) {
            this.settlementRoomFeeLabel.string = '';
            this.settlementRoomFeeLabel.node.active = false;
        }

        if (this.settlementReplayLabel) this.settlementReplayLabel.string = totalRounds > 1 ? '选择回放' : '回放';
        if (this.settlementShuffleButton) this.settlementShuffleButton.active = !isFinalRound;
        if (this.settlementShuffleLabel) this.settlementShuffleLabel.string = '洗牌';
        if (this.settlementContinueLabel) this.settlementContinueLabel.string = isFinalRound ? '完成' : '继续';
        if (this.readyGroup) this.readyGroup.active = false;
        if (this.btnReady) this.btnReady.active = false;
        this.settlementPanel.active = true;
        this.settlementPanel.setSiblingIndex(this.overlayRoot ? this.overlayRoot.children.length - 1 : 999);
    }

    private hideSettlementPanel(): void {
        if (this.settlementPanel) this.settlementPanel.active = false;
    }

    private createArea(parent: Node, name: string, x: number, y: number, w: number, h: number): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        node.parent = parent;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(x, y, 0);
        return node;
    }

    private prepareStandalonePaodekuaiRoot(): void {
        this.node.layer = PDK_UI_LAYER;
        this.ensureNodeTransform(this.node, PDK_STAGE_WIDTH, PDK_STAGE_HEIGHT);

        const host = this.node.parent;
        if (host) {
            host.layer = PDK_UI_LAYER;
            this.ensureNodeTransform(host, PDK_STAGE_WIDTH, PDK_STAGE_HEIGHT);
        }
    }

    private ensureNodeTransform(node: Node, width: number, height: number): UITransform {
        const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
        transform.setContentSize(width, height);
        return transform;
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

    private createTextButton(parent: Node, text: string, x: number, y: number, handler: string, color: Color, nodeName: string = handler, width = 112): Node {
        const node = this.createArea(parent, nodeName, x, y, width, 44);
        const g = node.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-width / 2, -22, width, 44, 8);
        g.fill();

        const labelNode = this.createArea(node, 'Label', 0, 0, width - 8, 36);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 20;
        label.lineHeight = 26;
        label.overflow = Label.Overflow.SHRINK;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(255, 255, 255, 255);

        this.configurePaodekuaiButton(node, labelNode, handler, 1.05);
        return node;
    }

    private createPaodekuaiActionButton(parent: Node, text: string, x: number, handler: string, fill: Color, stroke: Color, nodeName: string): Node {
        const width = 168;
        const height = 66;
        const node = this.createArea(parent, nodeName, x, 0, width, height);
        this.paintRect(node, width, height, fill, stroke, 10);

        const label = this.createLabel(node, 'Label', text, 24, 0, 1, width - 14, 42, new Color(255, 255, 255, 255));
        label.lineHeight = 30;

        this.configurePaodekuaiButton(node, label.node, handler, 1.06);
        return node;
    }

    private invokePaodekuaiButton(handler: string): void {
        const now = Date.now();
        if (this.lastButtonInvokeKey === handler && now - this.lastButtonInvokeAt < 80) return;
        this.lastButtonInvokeKey = handler;
        this.lastButtonInvokeAt = now;
        const fn = (this as any)[handler];
        if (typeof fn === 'function') fn.call(this);
    }

    public onPaodekuaiButtonClick(_event: unknown, handler: string): void {
        if (this.playRequestPending && (handler === 'onPlayClick' || handler === 'playSelectedCards' || handler === 'pass' || handler === 'onPassClick' || handler === 'hint' || handler === 'onHintClick')) return;
        this.invokePaodekuaiButton(handler);
    }

    private configurePaodekuaiButton(buttonNode: Node, labelNode: Node, handler: string, zoomScale: number): Button {
        this.bindReliableButtonClick(buttonNode, handler);
        this.bindReliableButtonClick(labelNode, handler);

        const button = buttonNode.getComponent(Button) || buttonNode.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = zoomScale;
        button.target = buttonNode;
        button.interactable = true;
        button.clickEvents.length = 0;
        const clickEvent = new EventHandler();
        clickEvent.target = this.node;
        clickEvent.component = 'PaodekuaiRoom';
        clickEvent.handler = 'onPaodekuaiButtonClick';
        clickEvent.customEventData = handler;
        button.clickEvents.push(clickEvent);
        buttonNode.on(Button.EventType.CLICK, () => {
            if (this.isPaodekuaiButtonDisabled(buttonNode)) return;
            this.invokePaodekuaiButton(handler);
        }, this);
        return button;
    }

    private bindReliableButtonClick(node: Node, handler: string): void {
        let touchStarted = false;
        const invoke = (event: EventTouch) => {
            event.propagationStopped = true;
            if (!touchStarted) return;
            touchStarted = false;
            if (this.isPaodekuaiButtonDisabled(node)) return;
            this.invokePaodekuaiButton(handler);
        };
        const cancel = (event: EventTouch) => {
            event.propagationStopped = true;
            touchStarted = false;
        };

        node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            event.propagationStopped = true;
            if (this.isPaodekuaiButtonDisabled(node)) {
                touchStarted = false;
                return;
            }
            touchStarted = true;
        }, this);
        node.on(Node.EventType.TOUCH_END, invoke, this);
        node.on(Node.EventType.TOUCH_CANCEL, cancel, this);
    }

    private isPaodekuaiButtonDisabled(node: Node): boolean {
        let cursor: Node | null = node;
        while (cursor) {
            if ((cursor as any)._pdkDisabled) return true;
            cursor = cursor.parent;
        }
        return false;
    }

    private resolveCardsForPlay(): { cards: PokerCard[]; play: CardPlay } | null {
        let indices = this.getSelectedHandIndices();
        if (indices.length > 0) {
            const target = this.getTurnTargetPlay();
            const exact = this.buildPlayFromIndices(indices, target);
            if (exact) return this.materializePlaySuggestion(exact);

            if (!target) return null;

            const bestFromSelection = this.findBestPlayFromIndices(indices, target);
            if (bestFromSelection) {
                this.applyPlaySuggestion(bestFromSelection);
                return this.materializePlaySuggestion(bestFromSelection);
            }
            return null;
        }

        const suggestion = this.pdkIsLeader || !this.lastPlay
            ? this.findSmallestLeadSingle()
            : this.findSmallestBeatingPlay(this.lastPlay);
        if (!suggestion) {
            if ((this.pdkIsLeader || !this.lastPlay) && this.myCards.length > 0) {
                const card = this.myCards[0];
                this.clearSelection();
                this.selectedIndices.add(0);
                this.renderMyHand();
                return {
                    cards: [card],
                    play: {
                        pattern: PokerPattern.Single,
                        cards: [card],
                        weight: card.value || 0,
                    },
                };
            }
            return null;
        }

        this.applyPlaySuggestion(suggestion);
        return this.materializePlaySuggestion(suggestion);
    }

    private findSmallestLeadSingle(): { indices: number[]; play: CardPlay } | null {
        if (this.myCards.length === 0) return null;
        let bestIndex = 0;
        for (let i = 1; i < this.myCards.length; i++) {
            const card = this.myCards[i];
            const best = this.myCards[bestIndex];
            if (card.value < best.value || (card.value === best.value && card.suit < best.suit)) bestIndex = i;
        }
        const bestCard = this.myCards[bestIndex];
        return {
            indices: [bestIndex],
            play: {
                pattern: PokerPattern.Single,
                cards: [bestCard],
                weight: bestCard.value || 0,
            },
        };
    }

    private getTurnTargetPlay(): CardPlay | null {
        return (!this.pdkIsLeader && this.lastPlay) ? this.lastPlay : null;
    }

    private findBestPlayFromIndices(indices: number[], target: CardPlay | null): { indices: number[]; play: CardPlay } | null {
        const candidates = this.enumerateHintPlaysFromIndices(indices, target);
        if (candidates.length === 0) return null;
        if (target) return candidates[0];
        candidates.sort((a, b) => this.compareDragLeadSuggestion(a.play, b.play));
        return candidates[0];
    }

    private applyPlaySuggestion(suggestion: { indices: number[]; play: CardPlay }): void {
        this.clearSelection();
        suggestion.indices.forEach(i => this.selectedIndices.add(i));
        this.renderMyHand();
    }

    private materializePlaySuggestion(suggestion: { indices: number[]; play: CardPlay }): { cards: PokerCard[]; play: CardPlay } | null {
        const indices = suggestion.indices.slice()
            .filter(i => i >= 0 && i < this.myCards.length)
            .sort((a, b) => a - b);
        const cards = indices.map(i => this.myCards[i]).filter(Boolean);
        if (cards.length === 0) return null;
        const play = this.recognizePattern(cards) || suggestion.play;
        return { cards, play };
    }

    private previewPendingPlay(cards: PokerCard[], play: CardPlay | null): void {
        this.pendingPlayCardIds = cards.map(c => Number(c.cardId)).filter(id => Number.isFinite(id));
        const displayPlay: CardPlay = play || {
            pattern: PokerPattern.Single,
            cards,
            weight: Math.max(...cards.map(c => c.value || 0)),
        };
        this.showMyPlay(displayPlay);
        this.updateStatus('已出牌，等待服务器确认');
        this.playCardSound(displayPlay.pattern);
    }

    private markPlayRequestPending(): void {
        this.playRequestPending = true;
        this.playRequestSentAt = Date.now();
        this.showPassAndPlayButtons(true);
    }

    private clearPlayRequestPending(): void {
        this.playRequestPending = false;
        this.playRequestSentAt = 0;
    }

    private updatePendingPlayRequest(): void {
        if (!this.playRequestPending) return;
        if (Date.now() - this.playRequestSentAt < PDK_PLAY_REQUEST_TIMEOUT_MS) return;

        this.clearPlayRequestPending();
        this.restorePendingPlaySelection();
        this.isMyTurn = this.seat !== -1 && this.serverCurrentPlayer === this.seat && this.gameState === GameState.Playing;
        this.showPassAndPlayButtons(this.isMyTurn);
        NetworkManager.Instance.sendInnerMessage('PaoDeKuai.Sync');
        Client.Instance.showPromptTip('出牌响应超时，已重新同步房间', 1.8);
    }

    private clearPendingPlayPreview(): void {
        this.pendingPlayCardIds = [];
    }

    private restorePendingPlaySelection(): void {
        const ids = new Set(this.pendingPlayCardIds.map(id => String(id)));
        this.pendingPlayCardIds = [];
        if (this.myPlayArea) this.myPlayArea.removeAllChildren();
        this.clearSelection();
        this.myCards.forEach((card, index) => {
            if (ids.has(String(card.cardId))) this.selectedIndices.add(index);
        });
        this.renderMyHand();
    }

    private refreshPaodekuaiHud(): void {
        if (!this.overlayRoot) return;
        this.ensureSelfPlayerInfo();
        if (this.roomInfoLabel) {
            const roomNo = this.roomNumber || this.roomInfo?.roomNo || '--';
            const current = Number(this.currentRound || this.roomInfo?.currentRound || 0);
            const total = Number(this.roundCount || this.totalRounds || this.roomInfo?.totalRounds || 0);
            const roundText = total > 0 ? `${current || 0}/${total}` : `${current || 0}`;
            this.roomInfoLabel.string = `房号 ${roomNo}   局数 ${roundText}   底分 ${this.formatScoreValue(this.baseScore)}`;
        }
        if (this.ruleInfoLabel) {
            this.ruleInfoLabel.string = '首局随机先出 · 赢家先出 · 有牌必出';
        }
        if (this.scoreLabel) this.scoreLabel.string = `本局 ${this.formatScoreValue(this.myRoundScore)}`;
        if (this.multiLabel) this.multiLabel.string = `倍数 ${this.currentMultiplier || 1}倍`;
        if (this.opponentInfoLabel) this.opponentInfoLabel.string = this.getOpponentInfoText();
        this.refreshPaodekuaiPlayers();
    }

    private refreshPaodekuaiPlayers(): void {
        this.ensureSelfPlayerInfo();
        for (let clientSeat = 0; clientSeat < 2; clientSeat++) {
            const root = this.playerCardRoots[clientSeat];
            if (!root) continue;
            const serverSeat = this.pdkClient2ServerSeat(clientSeat);
            const info = serverSeat >= 0 ? this.playerInfos[serverSeat] : null;
            root.active = true;
            if (!info) {
                if (this.playerNameLabels[clientSeat]) this.playerNameLabels[clientSeat]!.string = clientSeat === 0 ? '自己' : '等待对手';
                if (this.playerGoldLabels[clientSeat]) this.playerGoldLabels[clientSeat]!.string = '';
                if (this.playerStateLabels[clientSeat]) this.playerStateLabels[clientSeat]!.string = clientSeat === 0 ? '资料同步中' : '空座';
                continue;
            }
            const name = info.nickname || info.playerId || (clientSeat === 0 ? '自己' : '对手');
            const gold = Number(info.gold || 0);
            const readyText = this.gameState === GameState.Playing ? '游戏中' : (info.ready ? '已准备' : '未准备');
            const tags: string[] = [];
            if (serverSeat === this.seat) tags.push('我');
            if (serverSeat === this.ownerSeat) tags.push('房主');
            if (info.offline) tags.push('离线');
            if (this.playerNameLabels[clientSeat]) {
                this.playerNameLabels[clientSeat]!.string = `${name}${tags.length > 0 ? ` · ${tags.join('/')}` : ''}`;
            }
            if (this.playerGoldLabels[clientSeat]) this.playerGoldLabels[clientSeat]!.string = gold > 0 ? `金币 ${this.formatBalanceValue(gold)}` : '';
            if (this.playerStateLabels[clientSeat]) this.playerStateLabels[clientSeat]!.string = `${clientSeat === 0 ? '自己' : '对手'} · ${readyText}`;
        }
    }

    private ensureSelfPlayerInfo(): void {
        if (this.seat < 0 || this.playerInfos[this.seat]) return;
        const playerId = GameManager.Instance.PlayerId;
        if (!playerId) return;
        this.playerInfos[this.seat] = {
            playerId,
            nickname: GameManager.Instance.NickName || playerId,
            sex: GameManager.Instance.Sex,
            gold: GameManager.Instance.Gold,
            headUrl: GameManager.Instance.Avatar,
            offline: false,
            ready: false,
            authorize: false,
        };
    }

    private pdkClient2ServerSeat(clientSeat: number): number {
        if (this.seat >= 0) return (clientSeat + this.seat) % 2;
        return clientSeat;
    }

    private requestAvatarList(): void {
        if (this.avatarListRequested) return;
        this.avatarListRequested = true;
        NetworkManager.Instance.sendInnerMessage('MsgGetAvatars');
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
        const names = new Set([
            'CardLayout', 'CardPlayedOut', 'CardBacks',
            'GradePointBoard', 'GradePointGroup', 'RefundTribute',
            'PassBtnGroup', 'PlayBtnGroup', 'PassGroup', 'PlayGroup',
            'BtnPass', 'BtnPlay', 'BtnHint', 'HintButton', 'PlayButton',
            'ChatDialog', 'AutoBtnGroup', 'UpRightPanel',
            'BtnChat', 'BtnAuto', 'BtnPresent', 'BtnRefund',
            'BtnTongHuaShun', 'BtnColumn', 'BtnUndo', 'BtnJPQ', 'BtnCapture',
            'BtnSetting', 'BtnShowDesktop',
            'BottomBar',
        ]);
        const queue: Node[] = [this.node];
        while (queue.length > 0) {
            const node = queue.shift()!;
            if (names.has(node.name)) node.active = false;
            for (const child of node.children) queue.push(child);
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
        if (this.autoGroup) this.autoGroup.active = false;
        if (this.btnStartGame) this.btnStartGame.active = false;
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

    private arrayLikeToArray(value: any): number[] {
        if (Array.isArray(value)) return value.map(v => Number(v) || 0);
        if (value && typeof value === 'object') {
            return Object.keys(value)
                .sort((a, b) => Number(a) - Number(b))
                .map(k => Number(value[k]) || 0);
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

    private normalizeScoreScale(value: any): number {
        const scale = Number(value ?? 10);
        return Number.isFinite(scale) && scale > 0 ? scale : 10;
    }

    private resolveMessageScoreScale(msg: any): number {
        return this.normalizeScoreScale(msg?.scoreScale ?? msg?.score_scale ?? this.scoreScale);
    }

    private formatScoreValue(value: number, scale: number = this.scoreScale): string {
        const normalizedScale = this.normalizeScoreScale(scale);
        const score = (Number(value) || 0) / normalizedScale;
        return this.formatBalanceValue(score);
    }

    private formatBalanceValue(value: number): string {
        const rounded = Math.round((Number(value) || 0) * 10) / 10;
        const normalized = Object.is(rounded, -0) ? 0 : rounded;
        return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1).replace(/\.0$/, '');
    }

    private formatSignedScore(value: number, scale: number = this.scoreScale): string {
        const text = this.formatScoreValue(value, scale);
        return text.startsWith('-') ? text : `+${text}`;
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
        if (values.length < 4 || values.length % 2 !== 0 || values.some(v => v >= 15)) return false;
        for (let i = 0; i < values.length; i += 2) {
            if (values[i] !== values[i + 1]) return false;
            if (i > 0 && values[i] !== values[i - 2] + 1) return false;
        }
        return true;
    }

    private recognizePlane(cards: PokerCard[], values: number[], counts: Map<number, number>): CardPlay | null {
        if (values.length >= 6 && values.length % 3 === 0 && this.isStraightTriples(values)) {
            return { pattern: PokerPattern.Airplane, cards, weight: values[values.length - 1] };
        }

        if (values.length >= 8 && values.length % 4 === 0) {
            const weight = this.findPlaneCoreWeight(counts, values.length / 4);
            if (weight > 0) return { pattern: PokerPattern.AirplaneWithSingles, cards, weight };
        }

        if (values.length >= 10 && values.length % 5 === 0) {
            const weight = this.findPlaneCoreWeight(counts, values.length / 5);
            if (weight > 0) return { pattern: PokerPattern.AirplaneWithPairs, cards, weight };
        }

        return null;
    }

    private isStraightTriples(values: number[]): boolean {
        if (values.length < 6 || values.length % 3 !== 0 || values.some(v => v >= 15)) return false;
        for (let i = 0; i < values.length; i += 3) {
            if (values[i] !== values[i + 1] || values[i] !== values[i + 2]) return false;
            if (i > 0 && values[i] !== values[i - 3] + 1) return false;
        }
        return true;
    }

    private findPlaneCoreWeight(counts: Map<number, number>, planeLen: number): number {
        if (planeLen < 2) return -1;
        const tripleValues = Array.from(counts.entries())
            .filter(([value, count]) => count >= 3 && value < 15)
            .map(([value]) => value)
            .sort((a, b) => a - b);
        if (tripleValues.length < planeLen) return -1;

        let bestWeight = -1;
        for (let start = 0; start + planeLen <= tripleValues.length; start++) {
            const seq = tripleValues.slice(start, start + planeLen);
            if (this.isConsecutiveRaw(seq)) bestWeight = Math.max(bestWeight, seq[planeLen - 1]);
        }
        return bestWeight;
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
            pattern === PokerPattern.Airplane ||
            pattern === PokerPattern.AirplaneWithSingles ||
            pattern === PokerPattern.AirplaneWithPairs;
    }
}
