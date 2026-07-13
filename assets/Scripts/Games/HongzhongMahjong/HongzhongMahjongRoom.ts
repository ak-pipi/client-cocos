/**
 * 红中麻将 (HongzhongMahjongRoom)
 *
 * 服务端协议消息：
 * - MsgHZSync / MsgHZSyncResp        同步请求/响应
 * - MsgHZStartRound                 开始新一局
 * - MsgHZSettlement                  结算
 * - MsgHZDisbandVote                 解散投票
 * - MsgMahjongTiles                  发牌
 * - MsgFetchTile                     摸牌
 * - MsgActionOption / MsgDoActionOption / MsgPassActionOption  动作选项
 * - MsgPlayTile / MsgGangTile / MsgPengChiTile   出牌/杠/碰
 * - MsgTingTile / MsgHuTile / MsgShowTiles         听/胡/亮牌
 */

import { _decorator, Node, Label, Color, UITransform, Vec3 } from 'cc';
import { MahjongRoomBase, MahjongTile, AvailableActions, MahjongActionOption, MahjongActionType, MeldType, MahjongMeldGroup, tileDisplayText } from '../../GameCommon/MahjongRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../../GameCommon/GameTypes';
import { GameState } from '../../GameCommon/RoomBase';
import { Client } from '../../Game/Client';

const { ccclass } = _decorator;

export enum HongzhongFanType {
    PingHu = 'pinghu',
    ZiMo = 'zimo',
    QiXiaoDui = 'qixiaodui',
    PengPengHu = 'pengpenghu',
    QingYiSe = 'qingyise',
}

export interface HongzhongRoundSettlement extends RoundSettlementData {
    fanType?: HongzhongFanType;
    birdTile?: MahjongTile;
    birdMultiplier?: number;
    totalScore?: number;
}

@ccclass('HongzhongMahjongRoom')
export class HongzhongMahjongRoom extends MahjongRoomBase {
    protected hzHudRoot: Node | null = null;
    protected hongzhongIndicator: Node | null = null;
    protected hzCountLabel: Label | null = null;
    protected scoreLabel: Label | null = null;
    protected hzRuleLabel: Label | null = null;
    protected birdLabel: Label | null = null;
    protected myScore: number = 0;
    protected bankerSeat: number = -1;
    protected roomNumber: string = '';
    protected diZhu: number = 1;
    protected allowChi: boolean = false;
    protected allowDianPao: boolean = true;
    protected pendingRoundIncrement: boolean = false;
    protected currentTingTiles: MahjongTile[] = [];
    protected finalSettlementPendingExit: boolean = false;

    protected get mjMsgPrefix(): string { return 'MsgHZ'; }

    start(): void {
        this.syncMsgPrefix = 'MsgHZ';
        super.start();
        this.gameId = 'hongzhong_mahjong';
        this.buildHongzhongHud();
        this.refreshHongzhongHud();
    }

    protected getSeatCount(): number { return 4; }

    protected isAllRoundsFinished(): boolean {
        const currentRound = Number((this as any).currentRound) || 0;
        const totalRounds = Number((this as any).totalRounds) || 0;
        return this.gameState === GameState.Waiting && totalRounds > 0 && currentRound >= totalRounds;
    }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        this.updateHudInfo();
        console.log('[HongzhongRoom] Initialized');
    }

    protected getRuleHintText(): string {
        return '红中麻将 · 红中癞子 · 可碰杠 · 不可吃';
    }

    protected onSyncGameUIUpdate(isSitting: boolean): void {
        super.onSyncGameUIUpdate(isSitting);
        if (isSitting || this.seat !== -1) this.updateReadyButtonState();
    }

    protected updateReadyButtonState(): void {
        const canReady = (this.seat !== -1 && this.gameState === GameState.Waiting && !this.isAllRoundsFinished());
        if (this.readyGroup) this.readyGroup.active = canReady;
        if (!this.btnReady) return;
        this.btnReady.active = canReady;
        if (!canReady) return;

        const selfInfo = this.playerInfos[this.seat];
        const ready = !!selfInfo?.ready;
        if (this.btnReadyLabel) {
            this.btnReadyLabel.string = ready ? '取消准备' : '准备';
        }
    }

    protected onSyncGame(msg: any): void {
        super.onSyncGame(msg);
        if (!msg) return;

        if (msg.roundNo !== undefined) (this as any).currentRound = Number(msg.roundNo) || 0;
        if (msg.roundCount !== undefined) (this as any).totalRounds = Number(msg.roundCount) || 0;
        if (msg.number !== undefined) this.roomNumber = String(msg.number || '');
        if (msg.diZhu !== undefined) this.diZhu = Number(msg.diZhu) || 1;
        if (msg.chi !== undefined) this.allowChi = !!msg.chi;
        if (msg.dianPao !== undefined) this.allowDianPao = !!msg.dianPao;
        if (msg.banker !== undefined) this.bankerSeat = Number(msg.banker) ?? -1;
        if (msg.leftTiles !== undefined) this.remainingTiles = Number(msg.leftTiles) || 0;

        if (this.gameState === GameState.Playing) {
            if (Array.isArray(msg.handTiles) && msg.handTiles.length > 0) {
                this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
                this.sortHandTiles();
                this.renderMyHand();
            }

            if (msg.hasFetch && msg.fetchTile) {
                const fetch = this.parseMahjongTile(msg.fetchTile);
                this.drawnTile = fetch;
                this.showDrawnTile(fetch);
            } else {
                this.drawnTile = null;
                if (this.drawnTileNode) this.drawnTileNode.removeAllChildren();
            }

            if (msg.handTileNums) {
                for (let serverSeat = 0; serverSeat < this.getSeatCount(); serverSeat++) {
                    const clientSeat = this.server2ClientSeat(serverSeat);
                    if (clientSeat === 0) continue;
                    const n = Array.isArray(msg.handTileNums) ? msg.handTileNums[serverSeat] : msg.handTileNums[serverSeat];
                    const count = typeof n === 'number' ? n : Number(n);
                    if (!isNaN(count)) this.opponentHandCounts.set(clientSeat, count);
                }
                this.renderAllOpponentHands();
            }

            this.discardRecords.clear();
            if (msg.playedTiles) {
                for (let serverSeat = 0; serverSeat < this.getSeatCount(); serverSeat++) {
                    const arr = msg.playedTiles[serverSeat];
                    if (!Array.isArray(arr) || arr.length === 0) continue;
                    const clientSeat = this.server2ClientSeat(serverSeat);
                    this.discardRecords.set(clientSeat, arr.map((t: any) => this.parseMahjongTile(t)));
                }
                this.renderAllDiscardAreas();
            }

            this.meldRecords.clear();
            if (msg.chapters) {
                for (let serverSeat = 0; serverSeat < this.getSeatCount(); serverSeat++) {
                    const chapters = msg.chapters[serverSeat];
                    if (!Array.isArray(chapters) || chapters.length === 0) continue;
                    const clientSeat = this.server2ClientSeat(serverSeat);
                    const melds: MahjongMeldGroup[] = chapters
                        .filter((g: any) => g && (Array.isArray(g.tiles) || Array.isArray(g)))
                        .map((g: any) => {
                            const tiles = (g.tiles || g).map((t: any) => this.parseMahjongTile(t));
                            let meldType = MeldType.Peng;
                            if (g.types && g.types[0] !== undefined) {
                                meldType = this.chapterTypeToMeldType(g.types[0]);
                            } else if (tiles.length === 4) {
                                meldType = MeldType.AnGang;
                            }
                            return { tiles, meldType };
                        });
                    this.meldRecords.set(clientSeat, melds);
                }
                this.renderAllMeldAreas();
            }
        } else {
            this.clearTableDisplay();
            this.hideActionPanel();
        }

        this.updateHudInfo();
        this.refreshHongzhongHud();
    }

    public onMessage(msgType: string, msg: any): boolean {
        if (super.onMessage(msgType, msg)) return true;

        if (msgType === 'MsgHZStartRound') { this.onHZStartRound(msg); return true; }
        if (msgType === 'MsgHZSettlement') { this.onHZSettlement(msg); return true; }
        if (msgType === 'MsgHZDisbandVote') { this.onHZDisbandVote(msg); return true; }

        if (msgType === 'MsgMahjongTiles') { this.onServerDealTiles(msg); return true; }
        if (msgType === 'MsgFetchTile') { this.onServerFetchTile(msg); return true; }
        if (msgType === 'MsgActionOption') { this.onServerActionOption(msg); return true; }
        if (msgType === 'MsgActionOptionFinish') { this.onServerActionOptionFinish(msg); return true; }
        if (msgType === 'MsgPlayTile') { this.onServerPlayTile(msg); return true; }
        if (msgType === 'MsgGangTile') { this.onServerGangTile(msg); return true; }
        if (msgType === 'MsgPengChiTile') { this.onServerPengChiTile(msg); return true; }
        if (msgType === 'MsgTingTile') { this.onServerTingTile(msg); return true; }
        if (msgType === 'MsgHuTile') { this.onServerHuTile(msg); return true; }
        if (msgType === 'MsgShowTiles') { this.onServerShowTiles(msg); return true; }
        if (msgType === 'MsgActorUpdated') { this.onServerActorUpdated(msg); return true; }
        if (msgType === 'MsgWaitAction') { this.onServerWaitAction(msg); return true; }
        if (msgType === 'MsgPassTip') { this.onServerPassTip(msg); return true; }
        if (msgType === 'MsgDisbandChoice') { this.onDisbandChoice(msg); return true; }
        if (msgType === 'MsgDisband') { this.onDisband(msg); return true; }
        if (msgType === 'MsgDisbandObsolete') { this.onDisbandObsolete(); return true; }

        return false;
    }

    protected onHZStartRound(msg: any): void {
        console.log('[HongzhongRoom] Start round:', msg);
        this.gameState = GameState.Dealing;
        this.bankerSeat = msg?.banker !== undefined ? Number(msg.banker) : -1;
        if (msg?.roundNo !== undefined) {
            (this as any).currentRound = Number(msg.roundNo) || 0;
            this.pendingRoundIncrement = false;
        } else if (this.pendingRoundIncrement || (this as any).currentRound === 0) {
            (this as any).currentRound = (Number((this as any).currentRound) || 0) + 1;
            this.pendingRoundIncrement = false;
        }
        if (msg?.roundCount !== undefined) (this as any).totalRounds = Number(msg.roundCount) || 0;
        this.stopCountdown();
        this.resetRoundState();
        this.currentTingTiles = [];

        if (this.btnReady) this.btnReady.active = false;
        if (this.readyGroup) this.readyGroup.active = false;
        if (this.btnStartGame) this.btnStartGame.active = false;
        if (this.readyFlags) {
            for (const flag of this.readyFlags) if (flag) flag.active = false;
        }

        this.refreshHongzhongHud();
    }

    protected onHZSettlement(msg: any): void {
        console.log('[HongzhongRoom] Settlement:', msg);
        this.gameState = GameState.Waiting;
        this.stopCountdown();
        this.hideActionPanel();
        this.currentTingTiles = [];
        this.myScore += this.extractMyRoundDelta(msg);
        this.pendingRoundIncrement = true;

        for (const seat of Object.keys(this.playerInfos)) {
            if (this.playerInfos[seat]) this.playerInfos[seat].ready = false;
        }

        const isLastRound = this.isAllRoundsFinished();
        this.finalSettlementPendingExit = isLastRound;
        const birdText = this.describeBird(msg);
        const delta = this.extractMyRoundDelta(msg);
        Client.Instance.showPromptTip(`本局${delta >= 0 ? '+' : ''}${delta}${birdText ? ' · ' + birdText : ''}`, 3.0);

        if (msg.kick && !isLastRound) {
            this.scheduleOnce(() => this.exitRoom(), 3);
        }

        this.handleRoundSettlement(msg);
        this.updateReadyButtonState();
        this.refreshHongzhongHud();
    }

    protected onHZDisbandVote(msg: any): void {
        const disbander = Number(msg?.disbander) || 0;
        const elapsed = Number(msg?.elapsed) || 0;
        Client.Instance.showPromptTip(`玩家${disbander + 1}发起解散投票 (${elapsed}s)`, 2.5);
    }

    protected onServerDealTiles(msg: any): void {
        const tiles = msg?.tiles || [];
        if (!Array.isArray(tiles) || tiles.length === 0) {
            console.warn('[HongzhongRoom] Empty deal tiles:', msg);
            return;
        }
        const parsedTiles = tiles.map((t: any) => this.parseMahjongTile(t));
        this.gameState = GameState.Playing;
        this.dealTiles(parsedTiles);
        for (let clientSeat = 1; clientSeat < this.getSeatCount(); clientSeat++) {
            this.opponentHandCounts.set(clientSeat, 13);
        }
        this.renderAllOpponentHands();
        this.refreshHongzhongHud();
    }

    protected onServerFetchTile(msg: any): void {
        if (msg.nums !== undefined) this.updateRemainingCount(Number(msg.nums) || 0);

        const serverSeat = Number(msg.player);
        const clientSeat = this.server2ClientSeat(serverSeat);
        const isSelf = serverSeat === this.seat;
        if (isSelf && msg.tile) {
            const tile = this.parseMahjongTile(msg.tile);
            this.drawTile(tile);
            this.markHongzhongTilesInHand();
        } else if (clientSeat > 0) {
            const current = this.opponentHandCounts.get(clientSeat) || 0;
            this.opponentHandCounts.set(clientSeat, current + 1);
            this.renderOpponentHandBySeat(clientSeat, current + 1);
        }
        this.refreshHongzhongHud();
    }

    protected onServerActionOption(msg: any): void {
        const rawOptions: any[] = msg?.actionOptions || [];
        const options: MahjongActionOption[] = rawOptions.map((o: any) => this.parseActionOptionRaw(o));
        this.currentActionOptions = options;

        if (options.length === 0) {
            this.hideActionPanel();
            return;
        }

        const hasPlay = options.some(o => Number(o.type) === MahjongActionType.Play);
        if (hasPlay) this.isMyTurn = true;

        this.renderActionButtonsFromOptions(options);
        this.showActionPanel(this.buildAvailableActions(options));
        this.startCountdown(180);
    }

    protected onServerActionOptionFinish(_msg: any): void {
        this.hideActionPanel();
        this.stopCountdown();
        this.currentActionOptions = [];
    }

    protected onServerPlayTile(msg: any): void {
        const serverSeat = Number(msg.actor);
        const clientSeat = this.server2ClientSeat(serverSeat);
        const tile = this.parseMahjongTile(msg.tile);
        const isSelf = serverSeat === this.seat;

        this.addDiscardToDisplay(clientSeat, tile);
        if (isSelf && msg.handTiles) {
            this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
            this.sortHandTiles();
            this.renderMyHand();
        }
        if (clientSeat !== 0) this.stopCountdown();

        const skipSound = isSelf && this.lastLocalDiscardTileId === tile.id;
        if (skipSound) this.lastLocalDiscardTileId = null;
        else this.playDiscardSound();
        this.refreshHongzhongHud();
    }

    protected onServerGangTile(msg: any): void {
        const actorSeat = Number(msg.actor);
        const clientSeat = this.server2ClientSeat(actorSeat);
        this.hideActionPanel();
        this.stopCountdown();
        this.currentActionOptions = [];

        if (actorSeat === this.seat && msg.handTiles) {
            this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
            this.sortHandTiles();
            this.renderMyHand();
        }
        if (actorSeat !== this.seat && msg.tileNums !== undefined) {
            const count = Number(msg.tileNums) || 0;
            this.opponentHandCounts.set(clientSeat, count);
            this.renderOpponentHandBySeat(clientSeat, count);
        }

        const isAnGang = Number(msg.chapter) === 5;
        const chapters: any[] = msg.chapters || [];
        let meldTiles: MahjongTile[] = [];
        if (chapters.length > 0) {
            const lastChapter = chapters[chapters.length - 1];
            meldTiles = (lastChapter.tiles || []).map((t: any) => this.parseMahjongTile(t));
        }
        this.showMeldGang(clientSeat, meldTiles, isAnGang);
        this.playGangSound();
    }

    protected onServerPengChiTile(msg: any): void {
        const actorSeat = Number(msg.actor);
        const clientSeat = this.server2ClientSeat(actorSeat);
        const isPeng = !!msg.pengOrChi;
        const tiles: MahjongTile[] = (msg.tiles || []).map((t: any) => this.parseMahjongTile(t));

        this.hideActionPanel();
        this.stopCountdown();
        this.currentActionOptions = [];

        if (actorSeat === this.seat && msg.handTiles) {
            this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
            this.sortHandTiles();
            this.renderMyHand();
        } else if (actorSeat !== this.seat) {
            const count = msg.handTiles && Array.isArray(msg.handTiles)
                ? msg.handTiles.length
                : Math.max(0, (this.opponentHandCounts.get(clientSeat) || 0) - 2);
            this.opponentHandCounts.set(clientSeat, count);
            this.renderOpponentHandBySeat(clientSeat, count);
        }

        const fromSeat = this.server2ClientSeat(Number(msg.player));
        if (isPeng) {
            this.showMeldPeng(clientSeat, tiles, fromSeat);
            this.playPengSound();
        } else {
            this.showMeldChi(clientSeat, tiles, fromSeat);
        }
    }

    protected onServerTingTile(msg: any): void {
        const rawTiles: any[] = msg?.tiles || msg?.data?.tiles || [];
        const seen = new Set<string>();
        const tingTiles: MahjongTile[] = [];
        for (const raw of rawTiles) {
            const tile = this.parseTileOnly(raw);
            const p = Number(tile.tile.pattern) || 0;
            const n = Number(tile.tile.number) || 0;
            if (p <= 0) continue;
            const key = `${p}_${n}`;
            if (seen.has(key)) continue;
            seen.add(key);
            tingTiles.push(tile);
        }
        this.currentTingTiles = tingTiles;
        if (tingTiles.length > 0) {
            const names = tingTiles.map(t => tileDisplayText(t));
            const summary = names.length <= 8 ? names.join('、') : `${names.slice(0, 8).join('、')}等`;
            if (this.hzRuleLabel) this.hzRuleLabel.string = `听牌 ${tingTiles.length} 张：${summary}`;
        } else {
            this.refreshHongzhongHud();
        }
    }

    protected onServerHuTile(msg: any): void {
        const winnerSeats = msg?.players || [];
        const ziMo = !!msg?.ziMo;
        this.stopCountdown();
        this.hideActionPanel();
        if (winnerSeats.length > 0) {
            const clientSeat = this.server2ClientSeat(Number(winnerSeats[0]));
            this.showHuCelebration(clientSeat);
        }
        this.playHuSound(winnerSeats.includes(this.seat));
        if (this.hzRuleLabel) this.hzRuleLabel.string = ziMo ? '自摸胡牌' : '胡牌';
    }

    protected onServerShowTiles(msg: any): void {
        const handTiles = msg?.handTiles;
        if (!handTiles) return;
        for (let serverSeat = 0; serverSeat < this.getSeatCount(); serverSeat++) {
            const clientSeat = this.server2ClientSeat(serverSeat);
            if (clientSeat !== 0 && handTiles[serverSeat]) {
                this.revealOpponentHandBySeat(clientSeat, handTiles[serverSeat].map((t: any) => this.parseMahjongTile(t)));
            }
        }
    }

    protected onServerActorUpdated(msg: any): void {
        const actorSeat = Number(msg.actor);
        if (actorSeat === this.seat) {
            this.isMyTurn = true;
            if (this.hzRuleLabel) this.hzRuleLabel.string = '轮到你出牌';
        } else {
            this.isMyTurn = false;
            this.hideActionPanel();
            this.startOtherCountdown(180);
            if (this.hzRuleLabel) this.hzRuleLabel.string = '等待其他玩家操作';
        }
    }

    protected onServerWaitAction(msg: any): void {
        if (msg?.beingHeld && this.hzRuleLabel) this.hzRuleLabel.string = '等待你操作';
    }

    protected onServerPassTip(msg: any): void {
        const action = Number(msg?.action);
        const tip = action === 0 ? '本轮已过碰' : '本轮已过胡';
        Client.Instance.showPromptTip(tip, 2.0);
    }

    protected onDisbandChoice(msg: any): void {
        Client.Instance.showPromptTip(`玩家${Number(msg?.seat) + 1}${Number(msg?.choice) === 1 ? '同意' : '拒绝'}解散`, 2.0);
    }

    protected onDisband(_msg: any): void {
        if (this.finalSettlementPendingExit || this.isAllRoundsFinished()) {
            Client.Instance.showPromptTip('全部对局结束，请手动返回', 2.5);
            return;
        }
        Client.Instance.showPromptTip(`对局结束，总积分 ${this.myScore >= 0 ? '+' : ''}${this.myScore}`, 3.0);
        this.exitRoom();
    }

    protected onDisbandObsolete(): void {
        Client.Instance.showPromptTip('解散投票已取消', 2.0);
    }

    static isHongzhong(tile: MahjongTile): boolean {
        return Number(tile?.tile?.pattern) === 8;
    }

    protected countHongzhongs(): number {
        let count = this.myHandTiles.filter(t => HongzhongMahjongRoom.isHongzhong(t)).length;
        if (this.drawnTile && HongzhongMahjongRoom.isHongzhong(this.drawnTile)) count++;
        return count;
    }

    public dealTiles(tiles: MahjongTile[]): void {
        super.dealTiles(tiles);
        this.markHongzhongTilesInHand();
        this.refreshHongzhongHud();
    }

    public drawTile(tile: MahjongTile): void {
        super.drawTile(tile);
        this.markHongzhongTilesInHand();
        this.refreshHongzhongHud();
    }

    public doActionChi(_tiles?: MahjongTile[]): void {
        console.warn('[HongzhongRoom] Chi is not supported');
    }

    public selectAndDiscard(tileIndex: number): void {
        super.selectAndDiscard(tileIndex);
        this.refreshHongzhongHud();
    }

    public updateScore(delta: number): void {
        this.myScore += delta;
        this.refreshHongzhongHud();
    }

    public showRoundSettlement(data: HongzhongRoundSettlement): void {
        super.handleRoundSettlement(data);
    }

    public showFinalSettlement(data: FinalSettlementData): void {
        super.handleFinalSettlement(data);
    }

    protected resetRoundState(): void {
        super.resetRoundState();
        this.currentTingTiles = [];
        this.refreshHongzhongHud();
    }

    protected renderMyHand(): void {
        super.renderMyHand();
        this.markHongzhongTilesInHand();
    }

    protected markHongzhongTilesInHand(): void {
        if (!this.myHandArea) return;
        const children = this.myHandArea.children;
        for (let i = 0; i < children.length && i < this.myHandTiles.length; i++) {
            if (HongzhongMahjongRoom.isHongzhong(this.myHandTiles[i])) {
                this.addHongzhongMarker(children[i]);
            }
        }
        if (this.drawnTile && HongzhongMahjongRoom.isHongzhong(this.drawnTile) && this.drawnTileNode?.children.length) {
            this.addHongzhongMarker(this.drawnTileNode.children[0]);
        }
    }

    protected addHongzhongMarker(tileNode: Node): void {
        if (tileNode.getChildByName('HongzhongBadge')) return;
        const badge = new Node('HongzhongBadge');
        badge.layer = 1 << 25;
        badge.parent = tileNode;
        badge.addComponent(UITransform).setContentSize(22, 22);
        badge.setPosition(20, 20, 0);
        this.paintRect(badge, 22, 22, new Color(185, 38, 44, 245), new Color(255, 228, 180, 255), 6);
        const label = badge.addComponent(Label);
        label.string = '中';
        label.fontSize = 14;
        label.lineHeight = 16;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.color = new Color(255, 246, 230, 255);
        label.isBold = true;
    }

    protected revealOpponentHandBySeat(seatIndex: number, tiles: MahjongTile[]): void {
        const area = this.getHandAreaBySeat(seatIndex);
        if (!area) return;
        area.removeAllChildren();
        if (!tiles || tiles.length === 0) return;

        const vertical = seatIndex === 1 || seatIndex === 2;
        const step = vertical ? 38 : 42;
        const total = tiles.length * step;
        let start = -total / 2;
        for (const tile of tiles) {
            const node = this.createTileNodeForSeat(tile, seatIndex, false);
            node.parent = area;
            if (vertical) node.setPosition(0, start, 0);
            else node.setPosition(start, 0, 0);
            node.setScale(new Vec3(0.62, 0.62, 1));
            start += step;
        }
    }

    protected showHuCelebration(clientSeat: number): void {
        const labelNode = new Node('HongzhongHuCelebration');
        labelNode.parent = this.node;
        labelNode.layer = 1 << 25;
        labelNode.addComponent(UITransform).setContentSize(220, 86);
        labelNode.setPosition(0, clientSeat === 0 ? -192 : 192, 0);
        labelNode.setSiblingIndex(999);

        const label = labelNode.addComponent(Label);
        label.string = '胡!';
        label.fontSize = 60;
        label.lineHeight = 68;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.color = new Color(230, 46, 48, 255);
        label.isBold = true;
        label.outlineColor = new Color(255, 220, 130, 255);
        label.outlineWidth = 2;

        this.scheduleOnce(() => {
            if (labelNode.isValid) labelNode.destroy();
        }, 2.4);
    }

    protected clearTableDisplay(): void {
        [this.myDiscardArea, this.topDiscardArea, this.leftDiscardArea, this.rightDiscardArea,
            this.myHandArea, this.topHandArea, this.leftHandArea, this.rightHandArea,
            this.myMeldArea, this.topMeldArea, this.leftMeldArea, this.rightMeldArea].forEach(area => {
                if (area) area.removeAllChildren();
            });
        if (this.drawnTileNode) this.drawnTileNode.removeAllChildren();
        if (this.lastDiscardTileId) this.lastDiscardTileId.clear();
        this.discardRecords.clear();
        this.meldRecords.clear();
        this.initOpponentHandCounts();
    }

    protected chapterTypeToMeldType(serverType: number): MeldType {
        switch (Number(serverType)) {
            case 1: return MeldType.Chi;
            case 2: return MeldType.Peng;
            case 3: return MeldType.ZhiGang;
            case 4: return MeldType.JiaGang;
            case 5: return MeldType.AnGang;
            default: return MeldType.Peng;
        }
    }

    protected buildAvailableActions(options: MahjongActionOption[]): AvailableActions {
        const actions: AvailableActions = {};
        for (const opt of options) {
            if (opt.type === MahjongActionType.Chi) actions.canChi = true;
            else if (opt.type >= MahjongActionType.ZhiGang && opt.type <= MahjongActionType.AnGang) actions.canGang = true;
            else if (opt.type === MahjongActionType.DianPao || opt.type === MahjongActionType.ZiMo) actions.canHu = true;
            else if (opt.type === MahjongActionType.Peng) actions.canPeng = true;
        }
        return actions;
    }

    protected parseMahjongTile(raw: any): MahjongTile {
        const toNum = (v: any): number | null => {
            if (typeof v === 'number') return Number.isFinite(v) ? v : null;
            if (typeof v === 'string' && v.trim() !== '') {
                const n = Number(v);
                return Number.isFinite(n) ? n : null;
            }
            return null;
        };
        if (!raw) return { id: 0, tile: { pattern: 0, number: 0 } };
        if (raw.tile) {
            const p0 = toNum(raw.tile.pattern);
            const n0 = toNum(raw.tile.number);
            if (p0 != null && n0 != null) return { id: toNum(raw.id) ?? 0, tile: { pattern: p0, number: n0 } };
            const p = raw.tile[0] ?? raw.tile['0'];
            const n = raw.tile[1] ?? raw.tile['1'];
            const pn = toNum(p);
            const nn = toNum(n);
            if (pn != null && nn != null) return { id: toNum(raw.id) ?? 0, tile: { pattern: pn, number: nn } };
        }
        {
            const p = toNum(raw.pattern);
            const n = toNum(raw.number);
            if (p != null && n != null) return { id: toNum(raw.id) ?? 0, tile: { pattern: p, number: n } };
        }
        if (Array.isArray(raw)) {
            const id = toNum(raw[0]) ?? 0;
            const second = raw[1];
            if (second && typeof second === 'object') {
                const p = second.pattern ?? second[0] ?? second['0'];
                const n = second.number ?? second[1] ?? second['1'];
                return { id, tile: { pattern: toNum(p) ?? 0, number: toNum(n) ?? 0 } };
            }
            return { id, tile: { pattern: toNum(raw[1]) ?? 0, number: toNum(raw[2]) ?? 0 } };
        }
        if (raw[0] != null && raw[1] != null) {
            const id = toNum(raw[0] ?? raw['0']) ?? 0;
            const t = raw[1] ?? raw['1'];
            if (t && typeof t === 'object') {
                const p = t.pattern ?? t[0] ?? t['0'];
                const n = t.number ?? t[1] ?? t['1'];
                return { id, tile: { pattern: toNum(p) ?? 0, number: toNum(n) ?? 0 } };
            }
        }
        return {
            id: toNum(raw.id) ?? 0,
            tile: {
                pattern: toNum(raw.tile?.pattern) ?? toNum(raw.pattern) ?? 0,
                number: toNum(raw.tile?.number) ?? toNum(raw.number) ?? 0,
            }
        };
    }

    protected parseTileOnly(raw: any): MahjongTile {
        const parsed = this.parseMahjongTile(raw);
        return { id: 0, tile: { pattern: Number(parsed.tile.pattern) || 0, number: Number(parsed.tile.number) || 0 } };
    }

    protected parseActionOptionRaw(raw: any): MahjongActionOption {
        const toNum = (v: any): number => {
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };
        const isValidType = (t: number): boolean =>
            t === MahjongActionType.Fetch
            || t === MahjongActionType.Play
            || t === MahjongActionType.Chi
            || t === MahjongActionType.Peng
            || t === MahjongActionType.ZhiGang
            || t === MahjongActionType.JiaGang
            || t === MahjongActionType.AnGang
            || t === MahjongActionType.DianPao
            || t === MahjongActionType.ZiMo;

        if (!raw) return { id: 0, type: 0, player: 0, tile1: 0, tile2: 0 };
        if (raw.id !== undefined || raw.type !== undefined) {
            return {
                id: toNum(raw.id),
                type: toNum(raw.type),
                player: toNum(raw.player),
                tile1: toNum(raw.tile1),
                tile2: toNum(raw.tile2),
            };
        }

        const v0 = toNum(raw?.[0] ?? raw?.['0']);
        const v1 = toNum(raw?.[1] ?? raw?.['1']);
        const v2 = toNum(raw?.[2] ?? raw?.['2']);
        const v3 = toNum(raw?.[3] ?? raw?.['3']);
        const v4 = toNum(raw?.[4] ?? raw?.['4']);
        const candA = { id: v0, type: v1, player: v2, tile1: v3, tile2: v4 };
        const candB = { id: v1, type: v0, player: v2, tile1: v3, tile2: v4 };
        const score = (c: MahjongActionOption): number => (isValidType(c.type) ? 3 : 0) + (c.player >= 0 && c.player <= 3 ? 1 : 0) + (c.id > 0 ? 1 : 0);
        return score(candB) > score(candA) ? candB : candA;
    }

    protected extractMyRoundDelta(msg: any): number {
        if (Array.isArray(msg?.winGolds) && this.seat >= 0) return Number(msg.winGolds[this.seat]) || 0;
        const raw = msg?.winGolds?.[this.seat] ?? msg?.data?.winGolds?.[this.seat] ?? 0;
        return Number(raw) || 0;
    }

    protected describeBird(msg: any): string {
        const multiplier = Number(msg?.birdMultiplier) || 1;
        const tile = msg?.birdTile ? this.parseMahjongTile(msg.birdTile) : null;
        if (!tile || !tile.tile || tile.tile.pattern <= 0) return multiplier > 1 ? `扎鸟x${multiplier}` : '';
        return `鸟牌${tileDisplayText(tile)} x${multiplier}`;
    }

    protected buildHongzhongHud(): void {
        if (this.hzHudRoot) return;
        this.hzHudRoot = this.createUIChild(this.node, 'HongzhongHud', 344, 172, 560, 344, 120);
        this.paintRect(this.hzHudRoot, 344, 172, new Color(35, 31, 38, 214), new Color(232, 194, 122, 255), 12);

        const title = this.createUIChild(this.hzHudRoot, 'Title', 280, 28, 0, 58, 1);
        const titleLabel = title.addComponent(Label);
        titleLabel.string = '红中麻将';
        titleLabel.fontSize = 26;
        titleLabel.lineHeight = 30;
        titleLabel.horizontalAlign = 1;
        titleLabel.color = new Color(255, 236, 205, 255);

        const scoreNode = this.createUIChild(this.hzHudRoot, 'Score', 280, 26, 0, 24, 1);
        this.scoreLabel = scoreNode.addComponent(Label);
        this.scoreLabel.fontSize = 21;
        this.scoreLabel.lineHeight = 25;
        this.scoreLabel.horizontalAlign = 1;
        this.scoreLabel.color = new Color(255, 255, 255, 255);

        const birdNode = this.createUIChild(this.hzHudRoot, 'Bird', 280, 24, 0, -6, 1);
        this.birdLabel = birdNode.addComponent(Label);
        this.birdLabel.fontSize = 18;
        this.birdLabel.lineHeight = 22;
        this.birdLabel.horizontalAlign = 1;
        this.birdLabel.color = new Color(255, 220, 182, 255);

        const ruleNode = this.createUIChild(this.hzHudRoot, 'Rule', 300, 24, 0, -34, 1);
        this.hzRuleLabel = ruleNode.addComponent(Label);
        this.hzRuleLabel.fontSize = 17;
        this.hzRuleLabel.lineHeight = 21;
        this.hzRuleLabel.horizontalAlign = 1;
        this.hzRuleLabel.color = new Color(235, 245, 235, 255);

        this.hongzhongIndicator = this.createUIChild(this.hzHudRoot, 'HzIndicator', 116, 40, 0, -66, 1);
        this.hzCountLabel = this.hongzhongIndicator.addComponent(Label);
        this.hzCountLabel.fontSize = 20;
        this.hzCountLabel.lineHeight = 24;
        this.hzCountLabel.horizontalAlign = 1;
        this.hzCountLabel.verticalAlign = 1;
        this.hzCountLabel.color = new Color(255, 245, 224, 255);
    }

    protected refreshHongzhongHud(): void {
        const count = this.countHongzhongs();
        if (this.scoreLabel) this.scoreLabel.string = `本局积分 ${this.myScore >= 0 ? '+' : ''}${this.myScore}`;
        if (this.hzCountLabel) this.hzCountLabel.string = `红中 ${count}`;
        if (this.hongzhongIndicator) {
            this.hongzhongIndicator.active = true;
            this.paintRect(this.hongzhongIndicator, 116, 40,
                count > 0 ? new Color(166, 40, 45, 222) : new Color(50, 58, 68, 218),
                new Color(255, 214, 168, 255), 10);
        }
        if (this.birdLabel) this.birdLabel.string = `底分 ${this.diZhu} · 扎鸟一张`;
        if (this.hzRuleLabel && this.currentTingTiles.length === 0) {
            this.hzRuleLabel.string = this.allowDianPao ? '无红中可接炮，红中手牌只自摸/抢杠' : '仅自摸';
        }
    }
}
