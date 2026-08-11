/**
 * 长沙麻将 (ChangshaMahjongRoom)
 *
 * 对齐 C++ server 实服协议：
 * - MsgChangShaSync / MsgChangShaSyncResp
 * - MsgChangShaStartRound / MsgChangShaSettlement
 * - MsgChangShaQiShouHu / MsgChangShaBird / MsgChangShaDisbandVote
 * - MsgMahjongTiles / MsgFetchTile / MsgActionOption / MsgPlayTile 等通用麻将消息
 */

import { _decorator, Node, Label, Color, BlockInputEvents } from 'cc';
import {
    MahjongRoomBase,
    MahjongTile,
    AvailableActions,
    MahjongActionOption,
    MahjongActionType,
    MeldType,
    MahjongMeldGroup,
    tileDisplayText,
} from '../../GameCommon/MahjongRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../../GameCommon/GameTypes';
import { GameState } from '../../GameCommon/RoomBase';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../../Game/Client';

const { ccclass } = _decorator;

// ==================== 类型定义 ====================

export enum ChangshaFanType {
    PingHu = 'pinghu', ZiMo = 'zimo', JiangJiangHu = 'jiangjiang',
    QiXiaoDui = 'qixiaodui', PengPengHu = 'pengpeng',
    HaoHua = 'haohua', QingYise = 'qingyise',
    HunYise = 'hunyise', ZhaNiao = 'zhaniao',
}

export interface ZhaNiaoResult {
    niaoTiles: MahjongTile[];
    hitCount: number;
    extraScore: number;
}

export interface ChangshaRoundSettlement extends RoundSettlementData {
    fanTypes: ChangshaFanType[];
    zhaNiao?: ZhaNiaoResult;
    totalScore: number;
    jiangRequired: boolean;
}

@ccclass('ChangshaMahjongRoom')
export class ChangshaMahjongRoom extends MahjongRoomBase {
    // ==================== 内部状态 ====================

    protected specialHudRoot: Node = null;
    protected niaoDisplayArea: Node = null;
    protected scoreLabel: Label = null;
    protected jiangRuleLabel: Label = null;
    protected zhaNiaoLabel: Label = null;
    protected settlementNode: Node | null = null;
    protected myScore: number = 0;
    protected requireJiang258: boolean = true;
    protected bankerSeat: number = -1;
    protected birdCount: number = 2;
    protected zhongNiaoEnabled: boolean = true;
    protected currentDisbandChoices: number[] = [0, 0, 0, 0];

    static readonly JIANG_VALUES = [2, 5, 8];

    // ==================== 消息前缀 ====================

    protected get mjMsgPrefix(): string { return "MsgChangSha"; }

    // ==================== 初始化 ====================

    start(): void {
        this.syncMsgPrefix = "MsgChangSha";
        super.start();
        this.gameId = 'changsha_mahjong';
        this.buildChangshaHud();
        this.refreshChangshaHud();
    }

    protected getSeatCount(): number { return 4; }

    protected isAllRoundsFinished(): boolean {
        const currentRound = Number((this as any).currentRound) || 0;
        const totalRounds = Number((this as any).totalRounds) || 0;
        return this.gameState === GameState.Waiting && totalRounds > 0 && currentRound >= totalRounds;
    }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        const rule = roomInfo.ruleConfig || {};
        this.requireJiang258 = rule.require_258_jiang !== false && rule.requireJiang258 !== false;
        this.birdCount = Number(rule.bird_count ?? rule.birdCount ?? this.birdCount) || this.birdCount;
        this.zhongNiaoEnabled = rule.zhongniao_enabled !== false && rule.zhongNiaoEnabled !== false;
        this.updateHudInfo();
        this.refreshChangshaHud();
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

    // ==================== 工具方法 ====================

    static isJiangValue(value: number): boolean {
        return ChangshaMahjongRoom.JIANG_VALUES.indexOf(value) !== -1;
    }

    protected getRuleHintText(): string {
        if (!this.zhongNiaoEnabled || this.birdCount <= 0) {
            return this.requireJiang258 ? '长沙麻将 · 258将' : '长沙麻将';
        }
        return this.requireJiang258 ? `长沙麻将 · 258将 · ${this.birdCount}鸟` : `长沙麻将 · ${this.birdCount}鸟`;
    }

    /** 全量同步响应 */
    protected onSyncGame(msg: any): void {
        super.onSyncGame(msg);
        if (!msg) return;

        if (msg.roundNo !== undefined) (this as any).currentRound = Number(msg.roundNo) || 0;
        if (msg.roundCount !== undefined) (this as any).totalRounds = Number(msg.roundCount) || 0;
        if (msg.banker !== undefined) this.bankerSeat = Number(msg.banker) || -1;
        if (msg.leftTiles !== undefined) this.remainingTiles = Number(msg.leftTiles) || 0;
        if (msg.diZhu !== undefined) this.updateScoreText(0, Number(msg.diZhu) || 1);
        if (msg.qiShouHuSeat !== undefined && Number(msg.qiShouHuSeat) >= 0) {
            this.updateFanSummary(`起手胡 ${this.qiShouHuName(Number(msg.qiShouHuType))}`);
        }
        if (Array.isArray(msg.birdTiles) && msg.birdTiles.length > 0) {
            this.renderBirdByIds(msg.birdTiles, msg.hitSeats || [], Number(msg.birdMultiple) || 1);
        }

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
                    const raw = Array.isArray(msg.handTileNums) ? msg.handTileNums[serverSeat] : msg.handTileNums[serverSeat];
                    const count = Number(raw);
                    if (Number.isFinite(count)) this.opponentHandCounts.set(clientSeat, count);
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
                            if (g.types && g.types[0] !== undefined) meldType = this.chapterTypeToMeldType(Number(g.types[0]));
                            else if (tiles.length === 4) meldType = MeldType.AnGang;
                            return { tiles, meldType };
                        });
                    this.meldRecords.set(clientSeat, melds);
                }
                this.renderAllMeldAreas();
            }
        } else {
            this.resetRoundState();
        }

        this.updateHudInfo();
        this.refreshChangshaHud();
    }

    // ==================== 消息分发 ====================

    public onMessage(msgType: string, msg: any): boolean {
        if (super.onMessage(msgType, msg)) return true;

        if (msgType === "MsgChangShaStartRound") { this.onChangShaStartRound(msg); return true; }
        if (msgType === "MsgChangShaSettlement") { this.onChangShaSettlement(msg); return true; }
        if (msgType === "MsgChangShaQiShouHu") { this.onChangShaQiShouHu(msg); return true; }
        if (msgType === "MsgChangShaBird") { this.onChangShaBird(msg); return true; }
        if (msgType === "MsgChangShaDisbandVote") { this.onChangShaDisbandVote(msg); return true; }

        if (msgType === "MsgMahjongTiles") { this.onServerDealTiles(msg); return true; }
        if (msgType === "MsgFetchTile") { this.onServerFetchTile(msg); return true; }
        if (msgType === "MsgActionOption") { this.onServerActionOption(msg); return true; }
        if (msgType === "MsgActionOptionFinish") { this.onServerActionOptionFinish(); return true; }
        if (msgType === "MsgPlayTile") { this.onServerPlayTile(msg); return true; }
        if (msgType === "MsgGangTile") { this.onServerGangTile(msg); return true; }
        if (msgType === "MsgPengChiTile") { this.onServerPengChiTile(msg); return true; }
        if (msgType === "MsgTingTile") { this.onServerTingTile(msg); return true; }
        if (msgType === "MsgHuTile") { this.onServerHuTile(msg); return true; }
        if (msgType === "MsgShowTiles") { this.onServerShowTiles(msg); return true; }
        if (msgType === "MsgActorUpdated") { this.onServerActorUpdated(msg); return true; }
        if (msgType === "MsgWaitAction") { this.onServerWaitAction(msg); return true; }
        if (msgType === "MsgPassTip") { this.onServerPassTip(msg); return true; }
        if (msgType === "MsgDisbandChoice") { this.onDisbandChoice(msg); return true; }
        if (msgType === "MsgDisband") { this.onDisband(); return true; }
        if (msgType === "MsgDisbandObsolete") { this.onDisbandObsolete(); return true; }

        return false;
    }

    // ==================== 长沙麻将消息处理 ====================

    protected onChangShaStartRound(msg: any): void {
        this.gameState = GameState.Dealing;
        this.hideSettlementUI();
        this.bankerSeat = Number(msg?.banker) || -1;
        if (msg?.roundNo !== undefined) (this as any).currentRound = Number(msg.roundNo) || 0;
        if (msg?.roundCount !== undefined) (this as any).totalRounds = Number(msg.roundCount) || 0;
        if (msg?.birdCount !== undefined) this.birdCount = Number(msg.birdCount) || 0;
        if (msg?.zhongNiaoEnabled !== undefined) this.zhongNiaoEnabled = !!msg.zhongNiaoEnabled;
        if (msg?.require258Jiang !== undefined) this.requireJiang258 = !!msg.require258Jiang;

        this.stopCountdown();
        this.resetRoundState();
        if (this.btnReady) this.btnReady.active = false;
        if (this.readyGroup) this.readyGroup.active = false;
        if (this.btnStartGame) this.btnStartGame.active = false;
        if (this.readyFlags) {
            for (const f of this.readyFlags) if (f) f.active = false;
        }
        this.updateFanSummary('新一局开始');
        this.refreshChangshaHud();
    }

    protected onChangShaSettlement(msg: any): void {
        this.gameState = GameState.Waiting;
        this.stopCountdown();
        this.hideActionPanel();
        this.currentActionOptions = [];
        if (msg?.roundNo !== undefined) (this as any).currentRound = Number(msg.roundNo) || 0;
        if (msg?.roundCount !== undefined) (this as any).totalRounds = Number(msg.roundCount) || 0;

        const winGolds = Array.isArray(msg?.winGolds) ? msg.winGolds : [];
        const delta = this.seat >= 0 ? Number(winGolds[this.seat] || 0) : 0;
        this.myScore += delta;
        this.renderBirdByIds(msg?.birdTiles || [], msg?.hitSeats || [], Number(msg?.birdMultiple) || 1);
        this.updateFanSummary(`本局结算 ${delta >= 0 ? '+' : ''}${delta}`);

        for (const seat of Object.keys(this.playerInfos)) {
            if (this.playerInfos[seat]) this.playerInfos[seat].ready = false;
        }
        const isLastRound = this.isAllRoundsFinished() || this.hasFinalFeeSettlement(msg);
        if (msg?.kick && !isLastRound) {
            Client.Instance.showPromptTip('金币不足，稍后将离开房间', 3.0);
            this.scheduleOnce(() => this.exitRoom(), 3);
        }

        this.handleRoundSettlement(msg);
        this.showSettlementUI(msg, isLastRound);
        this.updateReadyButtonState();
        this.refreshChangshaHud();
    }

    protected hasFinalFeeSettlement(msg: any): boolean {
        return Number(msg?.roomFeeTotal || 0) > 0 || Number(msg?.shuffleFeeTotal || 0) > 0;
    }

    protected showSettlementUI(msg: any, isLastRound: boolean): void {
        this.hideSettlementUI();
        const overlay = this.createUIChild(this.node, 'ChangshaSettlementOverlay', 1920, 1080, 0, 0, 999);
        overlay.addComponent(BlockInputEvents);
        this.paintRect(overlay, 1920, 1080, new Color(0, 0, 0, 150), undefined, 0);

        const data = msg?.data || {};
        const seatCount = this.getSeatCount();
        const settlementStatsHeight = 0;
        const panelHeight = 390 + seatCount * 78 + settlementStatsHeight;
        const panel = this.createUIChild(overlay, 'ChangshaSettlementPanel', 720, panelHeight, 0, 0, 2);
        this.paintRect(panel, 720, panelHeight, new Color(17, 27, 40, 246), new Color(228, 190, 110, 255), 18);

        const settledRound = Number(msg?.roundNo ?? (this as any).currentRound) || Number((this as any).currentRound) || 0;
        const settledTotal = Number(msg?.roundCount ?? (this as any).totalRounds) || Number((this as any).totalRounds) || 0;
        const roundText = settledTotal > 0 ? `第 ${settledRound}/${settledTotal} 局` : `第 ${settledRound} 局`;
        const winGolds = this.arrayLikeToArray(msg?.winGolds);
        const scores = this.arrayLikeToArray(data?.scores || msg?.scores);
        const winnerSeat = this.findSettlementWinnerSeat(data, winGolds);
        const myDelta = this.seat >= 0 ? Number(winGolds[this.seat] ?? scores[this.seat] ?? 0) : 0;

        const title = this.createSettlementLabel(panel, 'Title', '本局结算', 32, 0, panelHeight / 2 - 52, 420, 42, new Color(255, 230, 160, 255));
        title.horizontalAlign = 1;
        const subtitle = this.createSettlementLabel(panel, 'Subtitle', `${roundText}  |  ${isLastRound ? '全部对局结束' : '点击继续后自动准备下一局'}`, 18, 0, panelHeight / 2 - 84, 580, 28, new Color(186, 207, 225, 255));
        subtitle.horizontalAlign = 1;

        const summary = this.createUIChild(panel, 'Summary', 620, 86, 0, panelHeight / 2 - 150, 1);
        this.paintRect(summary, 620, 86, new Color(31, 45, 61, 230), new Color(255, 204, 112, 255), 14);
        const winnerText = winnerSeat >= 0 ? `${this.getSeatName(winnerSeat)} 胜出` : '本局流局';
        const birdText = this.describeSettlementBird(msg);
        const summaryLabel = this.createSettlementLabel(summary, 'SummaryText', `${winnerText}\n${birdText}  |  我的变化 ${myDelta >= 0 ? '+' : ''}${myDelta}`, 22, 0, 0, 560, 62, new Color(255, 241, 214, 255));
        summaryLabel.horizontalAlign = 1;
        summaryLabel.verticalAlign = 1;

        const rowStartY = panelHeight / 2 - 235;
        for (let clientSeat = 0; clientSeat < seatCount; clientSeat++) {
            const serverSeat = this.client2ServerSeat(clientSeat);
            const winGold = Number(winGolds[serverSeat] ?? 0);
            const score = Number(scores[serverSeat] ?? winGold);
            const isWinner = serverSeat === winnerSeat || winGold > 0;
            const row = this.createUIChild(panel, `PlayerRow${clientSeat}`, 620, 66, 0, rowStartY - clientSeat * 78, 1);
            this.paintRect(
                row,
                620,
                66,
                isWinner ? new Color(82, 52, 26, 232) : new Color(20, 31, 44, 218),
                isWinner ? new Color(255, 205, 112, 255) : new Color(80, 111, 150, 210),
                12,
            );

            const nameLabel = this.createSettlementLabel(row, 'Name', `${isWinner ? '赢家  ' : ''}${this.getSeatName(serverSeat)}${serverSeat === this.bankerSeat ? ' [庄]' : ''}`, 22, -188, 10, 230, 28, new Color(240, 236, 226, 255));
            nameLabel.horizontalAlign = 0;
            const scoreLabel = this.createSettlementLabel(row, 'Score', `番分 ${score >= 0 ? '+' : ''}${score}   金币 ${winGold >= 0 ? '+' : ''}${winGold}`, 20, 116, 10, 330, 28, winGold >= 0 ? new Color(132, 235, 162, 255) : new Color(255, 142, 142, 255));
            scoreLabel.horizontalAlign = 2;
        }

        const replayButtonX = isLastRound ? -112 : -214;
        const continueButtonX = isLastRound ? 112 : 214;
        this.createSettlementButton(
            panel,
            settledTotal > 1 ? '选择回放' : '本局回放',
            replayButtonX,
            -panelHeight / 2 + 46,
            178,
            new Color(63, 98, 143, 255),
            new Color(170, 220, 255, 255),
            () => {
                this.openSettlementReplay(settledRound, settledTotal);
            },
        );
        if (!isLastRound) {
            this.createSettlementButton(
                panel,
                '洗牌',
                0,
                -panelHeight / 2 + 46,
                178,
                new Color(135, 93, 40, 255),
                new Color(255, 211, 128, 255),
                () => {
                    this.onShuffleCardsClick();
                },
            );
        }
        this.createSettlementButton(
            panel,
            isLastRound ? '返回大厅' : '继续',
            continueButtonX,
            -panelHeight / 2 + 46,
            178,
            isLastRound ? new Color(63, 98, 143, 255) : new Color(46, 128, 88, 255),
            isLastRound ? new Color(170, 220, 255, 255) : new Color(133, 231, 174, 255),
            () => {
                this.hideSettlementUI();
                if (isLastRound) {
                    this.onBackClick();
                    return;
                }
                this.onReadyClick();
                this.updateReadyButtonState();
                this.updateFanSummary('已准备，等待下一局');
            },
        );

        this.settlementNode = overlay;
    }

    protected hideSettlementUI(): void {
        if (this.settlementNode && this.settlementNode.isValid) {
            this.settlementNode.destroy();
        }
        this.settlementNode = null;
    }

    private createSettlementLabel(parent: Node, name: string, text: string, size: number, x: number, y: number, w: number, h: number, color: Color): Label {
        const node = this.createUIChild(parent, name, w, h, x, y, 1);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size + 6;
        label.overflow = Label.Overflow.SHRINK;
        label.verticalAlign = 1;
        label.color = color;
        return label;
    }

    private createSettlementButton(parent: Node, text: string, x: number, y: number, width: number, color: Color, strokeColor: Color, handler: () => void): void {
        const button = this.createUIChild(parent, text, width, 50, x, y, 2);
        this.paintRect(button, width, 50, color, strokeColor, 14);
        const label = this.createSettlementLabel(button, 'Label', text, 22, 0, 0, width - 18, 34, new Color(255, 255, 255, 255));
        label.horizontalAlign = 1;
        button.on(Node.EventType.TOUCH_END, handler, this);
    }

    private findSettlementWinnerSeat(data: any, winGolds: any[]): number {
        const huWays = this.arrayLikeToArray(data?.huWays);
        const huStyles = this.arrayLikeToArray(data?.huStyles);
        for (let i = 0; i < this.getSeatCount(); i++) {
            if (Number(huWays[i] || 0) > 0 || Number(huStyles[i] || 0) > 0) return i;
        }
        let winner = -1;
        let best = 0;
        for (let i = 0; i < this.getSeatCount(); i++) {
            const value = Number(winGolds[i] || 0);
            if (value > best) {
                best = value;
                winner = i;
            }
        }
        return winner;
    }

    private describeSettlementBird(msg: any): string {
        const tiles = Array.isArray(msg?.birdTiles) ? msg.birdTiles : [];
        const hits = Array.isArray(msg?.hitSeats) ? msg.hitSeats : [];
        const multiple = Number(msg?.birdMultiple ?? msg?.multiple ?? 1) || 1;
        if (tiles.length === 0) return '未扎鸟';
        return `鸟牌 ${tiles.length} 张  中鸟 ${hits.length} 张  x${multiple}`;
    }

    private getSeatName(serverSeat: number): string {
        const info = this.playerInfos[serverSeat];
        return info?.nickname || info?.playerId || `玩家${serverSeat + 1}`;
    }

    private arrayLikeToArray(value: any): any[] {
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'object') return [];
        return Object.keys(value)
            .filter((key) => /^\d+$/.test(key))
            .sort((a, b) => Number(a) - Number(b))
            .map((key) => value[key]);
    }

    protected onChangShaQiShouHu(msg: any): void {
        const seat = Number(msg?.seat);
        const huType = Number(msg?.huType) || 0;
        const score = Number(msg?.score) || 0;
        const clientSeat = this.server2ClientSeat(seat);
        this.playMahjongActionEffect(clientSeat, clientSeat === 0 ? 'zimo' : 'hu');
        this.updateFanSummary(`起手胡 ${this.qiShouHuName(huType)} ${score > 0 ? '+' + score : ''}`);
    }

    protected onChangShaBird(msg: any): void {
        this.renderBirdByIds(msg?.birdTiles || [], msg?.hitSeats || [], Number(msg?.multiple) || 1);
    }

    protected onChangShaDisbandVote(msg: any): void {
        if (Array.isArray(msg?.choices)) this.currentDisbandChoices = [...msg.choices];
        this.showDissolveVote(String(msg?.disbander ?? ''));
        Client.Instance.showPromptTip(`解散投票中，剩余 ${Number(msg?.remainTime) || 0} 秒`, 2.0);
    }

    // ==================== 通用麻将实服消息处理 ====================

    protected onServerDealTiles(msg: any): void {
        const tiles = msg?.tiles || [];
        if (!Array.isArray(tiles) || tiles.length === 0) return;
        const parsedTiles = tiles.map((t: any) => this.parseMahjongTile(t));
        this.gameState = GameState.Playing;
        this.dealTiles(parsedTiles);
        this.updateFanSummary('请整理手牌');
        this.refreshChangshaHud();
    }

    protected onServerFetchTile(msg: any): void {
        if (msg?.nums !== undefined) this.updateRemainingCount(Number(msg.nums) || 0);
        if (!msg?.tile) return;

        const serverSeat = Number(msg.player);
        const isSelf = msg.player === undefined || serverSeat === this.seat;
        if (isSelf) {
            this.drawTile(this.parseMahjongTile(msg.tile));
        } else {
            const clientSeat = this.server2ClientSeat(serverSeat);
            const count = (this.opponentHandCounts.get(clientSeat) || 0) + 1;
            this.opponentHandCounts.set(clientSeat, count);
            this.renderOpponentHandBySeat(clientSeat, count);
        }
        this.refreshChangshaHud();
    }

    protected onServerActionOption(msg: any): void {
        const rawOptions: any[] = msg?.actionOptions || [];
        const options = rawOptions.map((o: any) => this.parseActionOptionRaw(o));
        this.currentActionOptions = options;
        if (options.length === 0) {
            this.hideActionPanel();
            return;
        }

        this.isMyTurn = options.some(o => Number(o.type) === MahjongActionType.Play);
        this.renderActionButtonsFromOptions(options);
        this.showActionPanel(this.buildAvailableActions(options));
        this.startCountdown(180);
        this.updateFanSummary(options.map(opt => this.actionTypeName(Number(opt.type))).filter(Boolean).join(' / ') || '等待操作');
    }

    protected onServerActionOptionFinish(): void {
        this.hideActionPanel();
        this.stopCountdown();
        this.currentActionOptions = [];
    }

    protected onServerPlayTile(msg: any): void {
        const serverSeat = Number(msg?.actor);
        const clientSeat = this.server2ClientSeat(serverSeat);
        const tile = this.parseMahjongTile(msg?.tile);
        const isSelf = serverSeat === this.seat;

        this.addDiscardToDisplay(clientSeat, tile);
        if (isSelf && Array.isArray(msg?.handTiles)) {
            this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
            this.sortHandTiles();
            this.renderMyHand();
        }

        const skipSound = isSelf && this.lastLocalDiscardTileId === tile.id;
        if (skipSound) this.lastLocalDiscardTileId = null;
        else this.playDiscardSound();
        this.refreshChangshaHud();
    }

    protected onServerGangTile(msg: any): void {
        const actorSeat = Number(msg?.actor);
        const clientSeat = this.server2ClientSeat(actorSeat);
        this.hideActionPanel();
        this.stopCountdown();
        this.currentActionOptions = [];

        if (actorSeat === this.seat && Array.isArray(msg?.handTiles)) {
            this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
            this.sortHandTiles();
            this.renderMyHand();
        }
        if (actorSeat !== this.seat && msg?.tileNums !== undefined) {
            const count = Number(msg.tileNums) || 0;
            this.opponentHandCounts.set(clientSeat, count);
            this.renderOpponentHandBySeat(clientSeat, count);
        }

        const chapters: any[] = msg?.chapters || [];
        const lastChapter = chapters.length > 0 ? chapters[chapters.length - 1] : null;
        const meldTiles = lastChapter?.tiles ? lastChapter.tiles.map((t: any) => this.parseMahjongTile(t)) : [];
        this.showMeldGang(clientSeat, meldTiles, Number(msg?.chapter) === 5);
        this.playGangSound();
        this.updateFanSummary(Number(msg?.chapter) === 5 ? '暗杠' : '杠牌');
    }

    protected onServerPengChiTile(msg: any): void {
        const actorSeat = Number(msg?.actor);
        const clientSeat = this.server2ClientSeat(actorSeat);
        const tiles = (msg?.tiles || []).map((t: any) => this.parseMahjongTile(t));
        this.hideActionPanel();
        this.stopCountdown();
        this.currentActionOptions = [];

        if (actorSeat === this.seat && Array.isArray(msg?.handTiles)) {
            this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
            this.sortHandTiles();
            this.renderMyHand();
        } else if (actorSeat !== this.seat) {
            const count = Array.isArray(msg?.handTiles)
                ? msg.handTiles.length
                : Math.max(0, (this.opponentHandCounts.get(clientSeat) || 0) - 2);
            this.opponentHandCounts.set(clientSeat, count);
            this.renderOpponentHandBySeat(clientSeat, count);
        }

        const fromSeat = this.server2ClientSeat(Number(msg?.player));
        if (msg?.pengOrChi) {
            this.showMeldPeng(clientSeat, tiles, fromSeat);
            this.playPengSound();
            this.updateFanSummary('碰牌');
        } else {
            this.showMeldChi(clientSeat, tiles, fromSeat);
            this.updateFanSummary('吃牌');
        }
    }

    protected onServerTingTile(msg: any): void {
        const rawTiles = msg?.tiles || [];
        if (!Array.isArray(rawTiles) || rawTiles.length === 0) return;
        const names = rawTiles.map((t: any) => tileDisplayText(this.parseTileOnly(t)));
        const summary = names.length <= 9 ? names.join('、') : `${names.slice(0, 9).join('、')}等`;
        this.updateFanSummary(`听牌 ${names.length} 张：${summary}`);
    }

    protected onServerHuTile(msg: any): void {
        this.stopCountdown();
        this.hideActionPanel();
        const winners = Array.isArray(msg?.players) ? msg.players.map((v: any) => Number(v)).filter((v: number) => v >= 0 && v < 4) : [];
        if (winners.length > 0) {
            const clientSeat = this.server2ClientSeat(winners[0]);
            this.playMahjongActionEffect(clientSeat, clientSeat === 0 ? 'zimo' : 'hu');
        }
        this.updateFanSummary(msg?.ziMo ? '自摸' : '胡牌');
        this.playHuSound(winners.includes(this.seat));
    }

    protected onServerShowTiles(msg: any): void {
        const handTiles = msg?.handTiles;
        if (!handTiles) return;
        for (let serverSeat = 0; serverSeat < this.getSeatCount(); serverSeat++) {
            const clientSeat = this.server2ClientSeat(serverSeat);
            if (clientSeat !== 0 && Array.isArray(handTiles[serverSeat])) {
                this.revealOpponentHand(clientSeat, handTiles[serverSeat].map((t: any) => this.parseMahjongTile(t)));
            }
        }
    }

    protected onServerActorUpdated(msg: any): void {
        const actorSeat = Number(msg?.actor);
        if (actorSeat === this.seat) {
            this.isMyTurn = true;
            this.updateFanSummary('轮到你出牌');
        } else {
            this.isMyTurn = false;
            this.hideActionPanel();
            this.startOtherCountdown(180);
            this.updateFanSummary('等待其他玩家');
        }
    }

    protected onServerWaitAction(msg: any): void {
        if (msg?.beingHeld) this.updateFanSummary('等待你操作');
    }

    protected onServerPassTip(msg: any): void {
        const action = Number(msg?.action);
        const tile = msg?.tile ? ` ${String(msg.tile)}` : '';
        Client.Instance.showPromptTip(action === 0 ? `已过碰${tile}` : `已过胡${tile}`, 2.0);
    }

    protected onDisbandChoice(msg: any): void {
        const seat = Number(msg?.seat);
        const choice = Number(msg?.choice);
        if (seat >= 0 && seat < 4 && (choice === 1 || choice === 2)) {
            this.currentDisbandChoices[seat] = choice;
        }
    }

    protected onDisband(): void {
        if (this.settlementNode && this.settlementNode.isValid) {
            this.updateFanSummary('房间已解散，请点击返回');
            return;
        }
        Client.Instance.showPromptTip('房间已解散', 2.0);
        this.exitRoom();
    }

    protected onDisbandObsolete(): void {
        Client.Instance.showPromptTip('解散投票已取消', 2.0);
        if (this.dissolvePanel) this.dissolvePanel.active = false;
    }

    public voteDissolve(agree: boolean): void {
        NetworkManager.Instance.sendMessage("MsgDisbandChoose", {
            venueId: GameManager.Instance.VenueId,
            choice: agree ? 1 : 2,
        }, true);
        if (this.dissolvePanel) this.dissolvePanel.active = false;
    }

    // ==================== 牌与动作解析 ====================

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
        if (typeof raw === 'number') return this.tileFromId(raw);

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

        const flatP = toNum(raw.pattern);
        const flatN = toNum(raw.number);
        if (flatP != null && flatN != null) return { id: toNum(raw.id) ?? 0, tile: { pattern: flatP, number: flatN } };

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
            },
        };
    }

    protected parseTileOnly(raw: any): MahjongTile {
        if (typeof raw === 'number') return this.tileFromId(raw);
        const parsed = this.parseMahjongTile(raw);
        return { id: 0, tile: { pattern: Number(parsed.tile.pattern) || 0, number: Number(parsed.tile.number) || 0 } };
    }

    protected parseActionOptionRaw(raw: any): MahjongActionOption {
        const toNum = (v: any): number => {
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };
        const isValidType = (t: number): boolean =>
            t === MahjongActionType.Fetch || t === MahjongActionType.Play ||
            t === MahjongActionType.Chi || t === MahjongActionType.Peng ||
            t === MahjongActionType.ZhiGang || t === MahjongActionType.JiaGang ||
            t === MahjongActionType.AnGang || t === MahjongActionType.DianPao ||
            t === MahjongActionType.ZiMo;

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
        const score = (c: MahjongActionOption): number => (isValidType(c.type) ? 3 : 0) + (c.id > 0 ? 1 : 0);
        return score(candB) > score(candA) ? candB : candA;
    }

    protected tileFromId(rawId: number): MahjongTile {
        const id = Number(rawId) || 0;
        if (id >= 0 && id < 108) {
            const pattern = 1 + Math.floor(id / 36);
            const number = 1 + Math.floor((id % 36) / 4);
            return { id, tile: { pattern, number } };
        }
        if (id >= 108 && id < 136) {
            const pattern = 4 + Math.floor((id - 108) / 4);
            return { id, tile: { pattern, number: 0 } };
        }
        if (id >= 136 && id < 144) {
            return { id, tile: { pattern: 11 + (id - 136), number: 0 } };
        }
        return { id, tile: { pattern: 0, number: 0 } };
    }

    protected chapterTypeToMeldType(serverType: number): MeldType {
        switch (serverType) {
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

    protected actionTypeName(type: number): string {
        switch (type) {
            case MahjongActionType.Play: return '出牌';
            case MahjongActionType.Peng: return '碰';
            case MahjongActionType.Chi: return '吃';
            case MahjongActionType.ZhiGang: return '直杠';
            case MahjongActionType.JiaGang: return '加杠';
            case MahjongActionType.AnGang: return '暗杠';
            case MahjongActionType.DianPao: return '胡';
            case MahjongActionType.ZiMo: return '自摸';
            default: return '';
        }
    }

    protected qiShouHuName(type: number): string {
        switch (type) {
            case 1: return '缺一色';
            case 2: return '板板胡';
            case 3: return '大四喜';
            case 4: return '六六顺';
            case 5: return '节节高';
            case 6: return '三同';
            case 7: return '一枝花';
            default: return '起手胡';
        }
    }

    // ==================== 扎鸟系统 ====================

    public showRoundSettlement(data: ChangshaRoundSettlement): void {
        console.log(`[ChangshaRoom] Round: fans=${data.fanTypes.join(',')} score=${data.totalScore}`);
        if (data.zhaNiao) this.renderZhaNiao(data.zhaNiao);

        const myResult = Array.isArray(data.players) ? data.players.find((p: any) => p && (p.isSelf || p.seat === this.seat)) : null;
        if (myResult) this.updateScore(Number(myResult.score) || 0);

        super.handleRoundSettlement(data);
    }

    protected renderBirdByIds(rawTiles: any[], hitSeats: any[], multiple: number): void {
        if (!Array.isArray(rawTiles) || rawTiles.length === 0) {
            if (this.zhaNiaoLabel) this.zhaNiaoLabel.string = '扎鸟未结算';
            return;
        }
        const tiles = rawTiles.map((raw: any) => typeof raw === 'number' ? this.tileFromId(raw) : this.parseMahjongTile(raw));
        const hitCount = Array.isArray(hitSeats) ? hitSeats.length : 0;
        this.renderZhaNiao({ niaoTiles: tiles, hitCount, extraScore: multiple });
    }

    protected renderZhaNiao(niao: ZhaNiaoResult): void {
        if (!this.niaoDisplayArea) return;
        this.niaoDisplayArea.removeAllChildren();
        if (this.zhaNiaoLabel) {
            this.zhaNiaoLabel.string = `中鸟 ${niao.hitCount} 张  倍数 x${niao.extraScore}`;
        }
        for (const tile of niao.niaoTiles) {
            const node = this.createTileNodeForSeat(tile, 3, false);
            node.parent = this.niaoDisplayArea;
        }
        this.playMahjongActionEffect(0, 'zimo', '中鸟');
    }

    protected revealOpponentHand(clientSeat: number, tiles: MahjongTile[]): void {
        const area = this.getHandAreaBySeat(clientSeat);
        if (!area) return;
        area.removeAllChildren();
        const tw = clientSeat === 3 ? 40 : 34;
        const gap = 2;
        const horizontal = clientSeat === 3;
        const total = tiles.length * (tw + gap) - gap;
        let start = -total / 2 + tw / 2;
        for (const tile of tiles) {
            const node = this.createTileNodeForSeat(tile, clientSeat, false);
            node.parent = area;
            if (horizontal) {
                node.setPosition(start, 0, 0);
                start += tw + gap;
            } else {
                node.setPosition(0, start, 0);
                start += tw + gap;
            }
        }
    }

    protected updateScore(delta: number): void {
        this.myScore += delta;
        this.updateScoreText(this.myScore);
    }

    protected updateScoreText(score: number, diZhu?: number): void {
        if (!this.scoreLabel) return;
        const scoreText = `本局积分 ${score >= 0 ? '+' : ''}${score}`;
        this.scoreLabel.string = diZhu ? `${scoreText}  底分 ${diZhu}` : scoreText;
    }

    protected updateFanSummary(text: string): void {
        if (this.zhaNiaoLabel) this.zhaNiaoLabel.string = text;
    }

    public showFinalSettlement(data: FinalSettlementData): void {
        super.handleFinalSettlement(data);
    }

    // ==================== 重置与 HUD ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        if (this.niaoDisplayArea) this.niaoDisplayArea.removeAllChildren();
        if (this.zhaNiaoLabel) this.zhaNiaoLabel.string = '扎鸟未结算';
        this.refreshChangshaHud();
    }

    protected buildChangshaHud(): void {
        if (this.specialHudRoot) return;
        this.specialHudRoot = this.createUIChild(this.node, 'ChangshaHud', 360, 164, this.getLeftHudCenterX(360), this.getBelowExitButtonCenterY(164), 120);
        this.paintRect(this.specialHudRoot, 360, 164, new Color(27, 35, 49, 210), new Color(232, 194, 112, 255), 18);

        const title = this.createUIChild(this.specialHudRoot, 'Title', 280, 30, 0, 52, 1);
        const titleLabel = title.addComponent(Label);
        titleLabel.string = '长沙麻将';
        titleLabel.fontSize = 26;
        titleLabel.lineHeight = 30;
        titleLabel.horizontalAlign = 1;
        titleLabel.color = new Color(255, 235, 188, 255);

        const scoreNode = this.createUIChild(this.specialHudRoot, 'Score', 300, 28, 0, 16, 1);
        this.scoreLabel = scoreNode.addComponent(Label);
        this.scoreLabel.fontSize = 22;
        this.scoreLabel.lineHeight = 26;
        this.scoreLabel.horizontalAlign = 1;
        this.scoreLabel.color = new Color(255, 255, 255, 255);

        const jiangNode = this.createUIChild(this.specialHudRoot, 'JiangRule', 300, 26, 0, -18, 1);
        this.jiangRuleLabel = jiangNode.addComponent(Label);
        this.jiangRuleLabel.fontSize = 20;
        this.jiangRuleLabel.lineHeight = 24;
        this.jiangRuleLabel.horizontalAlign = 1;
        this.jiangRuleLabel.color = new Color(255, 220, 146, 255);

        const zhaNode = this.createUIChild(this.specialHudRoot, 'ZhaNiaoLabel', 300, 24, 0, -48, 1);
        this.zhaNiaoLabel = zhaNode.addComponent(Label);
        this.zhaNiaoLabel.fontSize = 18;
        this.zhaNiaoLabel.lineHeight = 22;
        this.zhaNiaoLabel.horizontalAlign = 1;
        this.zhaNiaoLabel.color = new Color(185, 226, 255, 255);

        this.niaoDisplayArea = this.createUIChild(this.node, 'ChangshaNiaoArea', 330, 70, 524, 364, 120);
        this.paintRect(this.niaoDisplayArea, 330, 70, new Color(27, 35, 49, 196), new Color(117, 184, 248, 255), 16);
    }

    protected refreshChangshaHud(): void {
        this.updateScoreText(this.myScore);
        if (this.jiangRuleLabel) {
            this.jiangRuleLabel.string = this.requireJiang258 ? '将牌要求：2/5/8' : '将牌要求：不限';
        }
        if (this.zhaNiaoLabel && this.zhaNiaoLabel.string.length === 0) {
            this.zhaNiaoLabel.string = '扎鸟未结算';
        }
    }
}
