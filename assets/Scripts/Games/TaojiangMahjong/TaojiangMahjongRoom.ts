/**
 * 桃江麻将 (TaojiangMahjongRoom)
 *
 * 桃江麻将规则：
 * - 2人麻将，108张牌（无风箭花）
 * - 可吃、可碰、可杠、可胡
 * - 番型：平胡/自摸/点炮/杠上开花/七对/碰碰胡/清一色
 *
 * 服务端协议消息（C++ server）：
 * - MsgTJSync / MsgTJSyncResp        同步请求/响应
 * - MsgTJStartRound                 开始新一局
 * - MsgTJSettlement                  结算
 * - MsgTJDisbandVote                 解散投票
 * - MsgMahjongTiles                  发牌
 * - MsgFetchTile                     摸牌
 * - MsgActionOption / MsgDoActionOption / MsgPassActionOption  动作选项
 * - MsgPlayTile / MsgGangTile / MsgPengChiTile   出牌/杠/碰吃
 * - MsgTingTile / MsgHuTile / MsgShowTiles         听/胡/亮牌
 * - MsgPassTip / MsgDisbandChoice / MsgDisband / MsgDisbandObsolete
 *
 * 资源：复用 GuanDan Bundle
 */

import { _decorator, Node, Label, Graphics, Color, UITransform } from 'cc';
import { MahjongRoomBase, MahjongTile, AvailableActions, MahjongActionOption, MahjongActionType, tileDisplayText } from '../../GameCommon/MahjongRoomBase';
import { RoomInfo, RoundSettlementData } from '../../GameCommon/GameTypes';
import { GameState } from '../../GameCommon/RoomBase';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../../Game/Client';

const { ccclass } = _decorator;

// ==================== 桃江麻将特有类型 ====================

export enum TaojiangFanType {
    PingHu = 'pinghu', ZiMo = 'zimo', DianPao = 'dianpao',
    GangShangKaiHua = 'gangkai', Qidui = 'qidui', PengPengHu = 'pengpeng',
    QingYise = 'qingyise',
}

export interface TaojiangRoundSettlement extends RoundSettlementData {
    fanType: TaojiangFanType;
    totalFans: number;
    isZimo: boolean;
    isGangKai: boolean;
}

// ==================== 番型名称映射（已迁移到 parseHuStyleNames/parseHuWayNames 位掩码解析） ====================

@ccclass('TaojiangMahjongRoom')
export class TaojiangMahjongRoom extends MahjongRoomBase {
    // ==================== 内部状态 ====================

    protected taojiangHudRoot: Node | null = null;
    protected scoreLabel: Label | null = null;
    protected fanSummaryLabel: Label | null = null;
    protected opponentInfoLabel: Label | null = null;
    protected tingHintNode: Node | null = null;
    protected tingTitleLabel: Label | null = null;
    protected tingTilesRoot: Node | null = null;
    protected totalFans: number = 0;
    protected myScore: number = 0;
    protected opponentHandCount: number = 0;
    protected settlementNode: Node | null = null;
    protected disbandVoteNode: Node | null = null;
    protected currentDisbandChoices: number[] = [];

    // ==================== 消息前缀覆写 ====================

    protected get mjMsgPrefix(): string { return "MsgTJ"; }

    // ==================== 初始化 ====================

    start(): void {
        this.syncMsgPrefix = "MsgTJ";
        super.start();
        this.gameId = 'taojiang_mahjong';
        this.buildTaojiangHud();
        this.refreshTaojiangHud();
    }

    protected getSeatCount(): number { return 2; }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        this.updateHudInfo();
        console.log('[TaojiangRoom] Initialized');
    }

    protected getRuleHintText(): string {
        return '桃江麻将 · 两人对局 · 可吃碰杠胡';
    }

    /** 同步后 UI 更新 */
    protected onSyncGameUIUpdate(isSitting: boolean): void {
        super.onSyncGameUIUpdate(isSitting);
        this.hideTingHint();
    }

    /** 全量同步响应（补齐桃江麻将局内数据） */
    protected onSyncGame(msg: any): void {
        super.onSyncGame(msg);
        if (!msg) return;

        // roundState: 0=NotStarted(Waiting), 1=Underway(Playing)
        if (msg.leftTiles !== undefined) {
            this.remainingTiles = Number(msg.leftTiles) || 0;
        }

        // 仅在对局中才回填牌局快照
        if (this.gameState === GameState.Playing) {
            // 手牌（仅自己）
            if (Array.isArray(msg.handTiles) && msg.handTiles.length > 0) {
                this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
                this.sortHandTiles();
                this.renderMyHand();
            }

            // 是否有摸起牌未打出（仅自己）
            if (msg.hasFetch && msg.fetchTile) {
                const fetch = this.parseMahjongTile(msg.fetchTile);
                this.drawnTile = fetch;
                this.showDrawnTile(fetch);
            } else {
                this.drawnTile = null;
                if (this.drawnTileNode) this.drawnTileNode.removeAllChildren();
            }

            // 各座位手牌数量（服务端座位 -> 客户端座位）
            if (msg.handTileNums) {
                for (let serverSeat = 0; serverSeat < this.getSeatCount(); serverSeat++) {
                    const clientSeat = this.server2ClientSeat(serverSeat);
                    if (clientSeat === 0) continue;
                    const n = Array.isArray(msg.handTileNums) ? msg.handTileNums[serverSeat] : msg.handTileNums[serverSeat];
                    const count = typeof n === 'number' ? n : Number(n);
                    if (!isNaN(count)) {
                        this.opponentHandCounts.set(clientSeat, count);
                        this.opponentHandCount = count;
                    }
                }
                this.renderAllOpponentHands();
            }

            // 出牌区快照
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

            // 副露快照
            this.meldRecords.clear();
            if (msg.chapters) {
                for (let serverSeat = 0; serverSeat < this.getSeatCount(); serverSeat++) {
                    const chapters = msg.chapters[serverSeat];
                    if (!Array.isArray(chapters) || chapters.length === 0) continue;
                    const clientSeat = this.server2ClientSeat(serverSeat);
                    const melds = chapters
                        .filter((g: any) => Array.isArray(g))
                        .map((g: any) => g.map((t: any) => this.parseMahjongTile(t)));
                    this.meldRecords.set(clientSeat, melds);
                }
                this.renderAllMeldAreas();
            }
        } else {
            this.clearTableDisplay();
            this.hideActionPanel();
        }

        this.updateHudInfo();
        this.refreshTaojiangHud();
    }

    // ==================== 消息分发 ====================

    public onMessage(msgType: string, msg: any): boolean {
        // 先尝试父类 RoomBase 的通用处理 (MsgAddAvatar, MsgPlayerReady 等)
        if (super.onMessage(msgType, msg)) return true;

        // ---- 桃江麻将特有消息 ----
        if (msgType === "MsgTJStartRound") { this.onTJStartRound(msg); return true; }
        if (msgType === "MsgTJSettlement") { this.onTJSettlement(msg); return true; }
        if (msgType === "MsgTJDisbandVote") { this.onTJDisbandVote(msg); return true; }

        // ---- 基础麻将消息 ----
        if (msgType === "MsgMahjongTiles") { this.onServerDealTiles(msg); return true; }
        if (msgType === "MsgFetchTile") { this.onServerFetchTile(msg); return true; }
        if (msgType === "MsgActionOption") { this.onServerActionOption(msg); return true; }
        if (msgType === "MsgActionOptionFinish") { this.onServerActionOptionFinish(msg); return true; }
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
        if (msgType === "MsgDisband") { this.onDisband(msg); return true; }
        if (msgType === "MsgDisbandObsolete") { this.onDisbandObsolete(); return true; }

        return false;
    }

    // ==================== 桃江麻将消息处理 ====================

    /** 开始新一局 */
    protected onTJStartRound(msg: any): void {
        console.log('[TaojiangRoom] Start round, banker:', msg.banker);
        this.gameState = GameState.Dealing;
        this.stopCountdown();
        this.hideActionPanel();
        this.hideTingHint();
        this.hideSettlementUI();
        this.hideDisbandVoteUI();
        // 隐藏准备按钮和开始游戏按钮
        if (this.btnReady) this.btnReady.active = false;
        if (this.readyGroup) this.readyGroup.active = false;
        if (this.btnStartGame) this.btnStartGame.active = false;
        // 隐藏剩余准备标记
        if (this.readyFlags) {
            for (const f of this.readyFlags) { if (f) f.active = false; }
        }
        // 清理上一局的桌面牌
        this.clearTableDisplay();
        this.totalFans = 0;
        this.hideTingHint();
        this.refreshTaojiangHud();
    }

    /** 结算 */
    protected onTJSettlement(msg: any): void {
        console.log('[TaojiangRoom] Settlement:', msg);
        this.gameState = GameState.Waiting;
        this.stopCountdown();
        this.hideActionPanel();
        this.hideDisbandVoteUI();
        this.totalFans = this.extractTotalFansFromSettlement(msg);
        this.myScore += this.extractMyRoundDelta(msg);

        // 显示结算弹窗
        this.showSettlementUI(msg);

        // 被踢出房间（金币不足）
        if (msg.kick) {
            console.log('[TaojiangRoom] Kicked due to insufficient gold');
            this.scheduleOnce(() => this.exitRoom(), 3);
        }

        this.handleRoundSettlement(msg);
        this.updateReadyButtonState();
        this.refreshTaojiangHud();
    }

    /** 解散投票 */
    protected onTJDisbandVote(msg: any): void {
        console.log('[TaojiangRoom] Disband vote:', msg);
        if (Array.isArray(msg.choices)) {
            this.currentDisbandChoices = [...msg.choices];
        }
        this.showDisbandVoteUI(msg);
    }

    // ==================== 基础麻将消息处理 ====================

    /** 服务端发牌 */
    protected onServerDealTiles(msg: any): void {
        const tiles = msg.tiles || [];
        // 调试日志：打印收到的牌数据
        console.log('[TaojiangRoom] onServerDealTiles tiles count:', tiles.length);
        if (tiles.length > 0) {
            console.log('[TaojiangRoom] First tile raw:', JSON.stringify(tiles[0]));
            // 检查并转换牌格式
            const parsedTiles: MahjongTile[] = tiles.map((t: any) => this.parseMahjongTile(t));
            this.gameState = GameState.Playing;
            this.dealTiles(parsedTiles);
            this.opponentHandCount = 13; // 2人麻将每人13张
            this.opponentHandCounts.set(1, this.opponentHandCount);
            this.refreshTaojiangHud();
            console.log(`[TaojiangRoom] Dealt ${parsedTiles.length} tiles, first display: ${tileDisplayText(parsedTiles[0])}`);
        } else {
            console.warn('[TaojiangRoom] onServerDealTiles: tiles is empty, msg keys:', Object.keys(msg));
        }
    }

    /** 解析服务端传来的牌数据，兼容多种格式 */
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
        // 格式1: {id, tile: {pattern, number}}
        if (raw.tile) {
            const p0 = toNum(raw.tile.pattern);
            const n0 = toNum(raw.tile.number);
            if (p0 != null && n0 != null) {
                return { id: toNum(raw.id) ?? 0, tile: { pattern: p0, number: n0 } };
            }
            // msgpack 可能解成 {0: pattern, 1: number}
            const p = raw.tile[0] ?? raw.tile['0'];
            const n = raw.tile[1] ?? raw.tile['1'];
            const pn = toNum(p);
            const nn = toNum(n);
            if (pn != null && nn != null) {
                return { id: toNum(raw.id) ?? 0, tile: { pattern: pn, number: nn } };
            }
        }
        // 格式2: {id, pattern, number}（扁平格式）
        {
            const p = toNum(raw.pattern);
            const n = toNum(raw.number);
            if (p != null && n != null) {
                return { id: toNum(raw.id) ?? 0, tile: { pattern: p, number: n } };
            }
        }
        // 格式3: msgpack array 解码后可能是 [id, pattern, number] 或 [id, {pattern, number}] 或 {0:id,1:{0:pattern,1:number}}
        if (Array.isArray(raw)) {
            const id = toNum(raw[0]) ?? 0;
            const second = raw[1];
            if (second && typeof second === 'object') {
                const p = second.pattern ?? second[0] ?? second['0'];
                const n = second.number ?? second[1] ?? second['1'];
                return { id, tile: { pattern: toNum(p) ?? 0, number: toNum(n) ?? 0 } };
            }
            const p = raw[1];
            const n = raw[2];
            return { id, tile: { pattern: toNum(p) ?? 0, number: toNum(n) ?? 0 } };
        }
        // 格式4: msgpack map 可能解成 {0:id, 1:{0:pattern,1:number}}
        if (raw[0] != null && raw[1] != null) {
            const id = toNum(raw[0] ?? raw['0']) ?? 0;
            const t = raw[1] ?? raw['1'];
            if (t && typeof t === 'object') {
                const p = t.pattern ?? t[0] ?? t['0'];
                const n = t.number ?? t[1] ?? t['1'];
                return { id, tile: { pattern: toNum(p) ?? 0, number: toNum(n) ?? 0 } };
            }
        }
        // 未知格式，尝试提取
        console.warn('[TaojiangRoom] Unknown tile format:', JSON.stringify(raw));
        return {
            id: toNum(raw.id) ?? 0,
            tile: {
                pattern: toNum(raw.tile?.pattern) ?? toNum(raw.pattern) ?? 0,
                number: toNum(raw.tile?.number) ?? toNum(raw.number) ?? 0,
            }
        };
    }

    /** 服务端摸牌通知 */
    protected onServerFetchTile(msg: any): void {
        // 更新剩余牌数
        if (msg.nums !== undefined) {
            this.updateRemainingCount(msg.nums);
        }

        if (!msg.tile) return;
        const isSelf = (msg.player === undefined || msg.player === this.seat);
        if (isSelf) {
            const tile = this.parseMahjongTile(msg.tile);
            this.drawTile(tile);
        } else {
            this.opponentHandCount = (msg.tileNums !== undefined) ? msg.tileNums : this.opponentHandCount + 1;
            this.opponentHandCounts.set(1, this.opponentHandCount);
            this.renderOpponentHand(this.opponentHandCount);
        }
        this.refreshTaojiangHud();
    }

    /** 服务端动作选项通知 */
    protected onServerActionOption(msg: any): void {
        const options: MahjongActionOption[] = msg.actionOptions || [];
        this.currentActionOptions = options;

        if (options.length === 0) {
            this.hideActionPanel();
            return;
        }

        // 如果包含 Play 选项，说明轮到我出牌
        const hasPlay = options.some(o => o.type === MahjongActionType.Play);
        if (hasPlay) {
            this.isMyTurn = true;
        }

        // 渲染按钮
        this.renderActionButtonsFromOptions(options);
        this.showActionPanel(this.buildAvailableActions(options));

        const hasHu = options.some(o => o.type === MahjongActionType.ZiMo || o.type === MahjongActionType.DianPao);
        const timeout = hasHu ? 15 : 10;
        this.startCountdown(timeout);
        this.updateFanSummary(options.map(opt => this.actionTypeName(opt.type)).filter(Boolean).join(' / ') || '等待出牌');
        console.log(`[TaojiangRoom] Action options: ${options.length}, hasPlay=${hasPlay}, timeout: ${timeout}`);
    }

    /** 服务端出牌通知 */
    protected onServerPlayTile(msg: any): void {
        const serverSeat = msg.actor;
        const clientSeat = this.server2ClientSeat(serverSeat);
        const tile = this.parseMahjongTile(msg.tile);
        const isSelf = serverSeat === this.seat;

        // 将出的牌添加到对应出牌区
        this.addDiscardToDisplay(clientSeat, tile);

        // 如果是自己的出牌通知（包含手牌），更新手牌显示
        if (isSelf && msg.handTiles) {
            this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
            this.sortHandTiles();
            this.renderMyHand();
        }

        // 如果是对手出牌，停止对手倒计时
        if (clientSeat !== 0) {
            this.stopCountdown();
        }

        const skipSound = isSelf && this.lastLocalDiscardTileId === tile.id;
        if (skipSound) {
            this.lastLocalDiscardTileId = null;
        } else {
            this.playDiscardSound();
        }
        this.refreshTaojiangHud();
        console.log(`[TaojiangRoom] Player server=${serverSeat} client=${clientSeat} played: ${tileDisplayText(tile)}`);
    }

    /** 服务端杠牌通知 */
    protected onServerGangTile(msg: any): void {
        const actorSeat = msg.actor;
        const clientSeat = this.server2ClientSeat(actorSeat);

        // 更新自己的手牌
        if (actorSeat === this.seat && msg.handTiles) {
            this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
            this.sortHandTiles();
            this.renderMyHand();
        }

        // 更新对手手牌数
        if (actorSeat !== this.seat && msg.tileNums !== undefined) {
            this.opponentHandCount = msg.tileNums;
            this.opponentHandCounts.set(clientSeat, this.opponentHandCount);
            this.renderOpponentHand(this.opponentHandCount);
        }

        // 显示副露（msg.chapters 是该玩家的副露数组，取最后一个即当前杠）
        const isAnGang = (msg.chapter === 5); // AnGang
        const chapters: any[] = msg.chapters || [];
        let meldTiles: MahjongTile[] = [];
        if (chapters.length > 0) {
            const lastChapter = chapters[chapters.length - 1];
            meldTiles = (lastChapter.tiles || []).map((t: any) => this.parseMahjongTile(t));
        }
        this.showMeldGang(clientSeat, meldTiles, isAnGang);
        this.playGangSound();
        this.updateFanSummary(isAnGang ? '暗杠' : '明杠');
        console.log(`[TaojiangRoom] Player ${actorSeat} gang, chapter: ${msg.chapter}`);
    }

    /** 服务端碰/吃牌通知 */
    protected onServerPengChiTile(msg: any): void {
        const actorSeat = msg.actor;
        const clientSeat = this.server2ClientSeat(actorSeat);
        const isPeng = msg.pengOrChi; // true=Peng, false=Chi
        const tiles: MahjongTile[] = (msg.tiles || []).map((t: any) => this.parseMahjongTile(t));

        // 更新自己的手牌
        if (actorSeat === this.seat && msg.handTiles) {
            this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
            this.sortHandTiles();
            this.renderMyHand();
        }

        // 更新对手手牌数（碰/吃后手牌减少2张）
        if (actorSeat !== this.seat) {
            this.opponentHandCount -= 2;
            if (this.opponentHandCount < 0) this.opponentHandCount = 0;
            this.opponentHandCounts.set(clientSeat, this.opponentHandCount);
            this.renderOpponentHand(this.opponentHandCount);
        }

        // 显示副露
        const fromSeat = this.server2ClientSeat(msg.player);
        this.showMeldPeng(clientSeat, tiles, fromSeat);
        if (isPeng) this.playPengSound();
        else console.log(`[TaojiangRoom] Player ${actorSeat} chi`);
        this.updateFanSummary(isPeng ? '碰牌完成' : '吃牌完成');
    }

    /** 服务端听牌通知 */
    protected onServerTingTile(msg: any): void {
        // msg.tiles = [{pattern, number}, ...] (MahjongTile::TileArray)，需转换为 MahjongTile 格式
        const rawTiles: any[] = msg.tiles || [];
        const tingTiles: MahjongTile[] = rawTiles.map(t => {
            const p = Number(t.pattern) || 0;
            const n = Number(t.number) || 0;
            return { id: 0, tile: { pattern: p, number: n } };
        });
        if (tingTiles.length > 0) {
            this.showTingHint(tingTiles);
            this.updateFanSummary(`听牌 ${tingTiles.length} 张`);
            console.log(`[TaojiangRoom] Ting: ${tingTiles.length} tiles`);
        }
    }

    /** 服务端胡牌通知 */
    protected onServerHuTile(msg: any): void {
        const winnerSeats = msg.players || []; // 胡牌玩家座位列表
        const actorSeat = msg.actor;
        const ziMo = msg.ziMo;
        console.log(`[TaojiangRoom] Hu! actor=${actorSeat}, ziMo=${ziMo}, winners=${JSON.stringify(winnerSeats)}`);
        this.stopCountdown();
        this.hideActionPanel();

        // 显示胡牌庆祝
        if (winnerSeats.length > 0) {
            const clientSeat = this.server2ClientSeat(winnerSeats[0]);
            this.showHuCelebration(clientSeat);
        }
        this.updateFanSummary(ziMo ? '自摸' : '胡牌');
        this.playHuSound(winnerSeats.includes(this.seat));
    }

    /** 服务端亮牌 */
    protected onServerShowTiles(msg: any): void {
        const handTiles = msg.handTiles;
        if (!handTiles) return;
        console.log('[TaojiangRoom] Show all tiles');
        for (let serverSeat = 0; serverSeat < this.getSeatCount(); serverSeat++) {
            const clientSeat = this.server2ClientSeat(serverSeat);
            if (clientSeat !== 0 && handTiles[serverSeat]) {
                this.revealOpponentHand(handTiles[serverSeat]);
            }
        }
    }

    /** 当前操作玩家更新 */
    protected onServerActorUpdated(msg: any): void {
        const actorSeat = msg.actor;
        if (actorSeat === this.seat) {
            this.isMyTurn = true;
            if (this.currentActionOptions && this.currentActionOptions.length > 0) {
                this.renderActionButtonsFromOptions(this.currentActionOptions);
                this.showActionPanel(this.buildAvailableActions(this.currentActionOptions));
            }
            this.updateFanSummary('轮到你出牌');
            console.log('[TaojiangRoom] My turn (actor)');
        } else {
            this.isMyTurn = false;
            this.hideActionPanel();
            this.startOtherCountdown(15);
            this.updateFanSummary('等待对手操作');
            console.log('[TaojiangRoom] Opponent turn');
        }
    }

    /** 等待操作通知 */
    protected onServerWaitAction(msg: any): void {
        // msg: {waitting, beingHeld, second}
        if (msg.beingHeld) {
            console.log('[TaojiangRoom] Waiting for my action');
        }
    }

    /** 动作选项阶段结束 */
    protected onServerActionOptionFinish(_msg: any): void {
        this.hideActionPanel();
        this.stopCountdown();
        this.currentActionOptions = [];
        console.log('[TaojiangRoom] Action options finished');
    }

    /** 过牌提示 */
    protected onServerPassTip(msg: any): void {
        const tip = msg.action === 0 ? '已过碰，不能再碰' : '已过胡，不能再胡';
        Client.Instance.showPromptTip(tip, 2.0);
    }

    /** 解散投票选择通知 */
    protected onDisbandChoice(msg: any): void {
        console.log(`[TaojiangRoom] Player ${msg.seat} voted: ${msg.choice === 1 ? 'agree' : 'oppose'}`);
        if (typeof msg.seat === 'number' && typeof msg.choice === 'number') {
            if (!Array.isArray(this.currentDisbandChoices) || this.currentDisbandChoices.length < 4) {
                this.currentDisbandChoices = [0, 0, 0, 0];
            }
            this.currentDisbandChoices[msg.seat] = msg.choice;
        }
        this.updateDisbandVoteUI();
    }

    /** 房间解散 */
    protected onDisband(_msg: any): void {
        console.log('[TaojiangRoom] Room disbanded');
        this.hideDisbandVoteUI();
        this.exitRoom();
    }

    /** 解散投票取消 */
    protected onDisbandObsolete(): void {
        console.log('[TaojiangRoom] Disband vote cancelled');
        Client.Instance.showPromptTip('解散投票已取消', 2.0);
        this.hideDisbandVoteUI();
    }

    // ==================== 2人对局布局 ====================

    /** 覆写：根据 client seat 获取手牌区 */
    protected getHandAreaBySeat(seatIndex: number): Node | null {
        if (seatIndex === 0) return this.myHandArea;
        if (seatIndex === 1) return this.topHandArea;
        return null;
    }

    /** 覆写：根据 client seat 获取出牌区 */
    protected getDiscardAreaBySeat(seatIndex: number): Node | null {
        if (seatIndex === 0) return this.myDiscardArea;
        if (seatIndex === 1) return this.topDiscardArea;
        return null;
    }

    /** 覆写：2人对局所有出牌区统一使用横向布局，牌面正面朝向 */
    protected renderDiscardArea(seatIndex: number): void {
        const discardArea = this.getDiscardAreaBySeat(seatIndex);
        if (!discardArea) return;
        discardArea.removeAllChildren();
        const discards = this.discardRecords.get(seatIndex) || [];
        const columns = 8;
        const tileGapY = 8;
        for (let i = 0; i < discards.length; i++) {
            const row = Math.floor(i / columns);
            const col = i % columns;
            const tileNode = this.createTileNodeForSeat(discards[i], 0, false);
            tileNode.parent = discardArea;
            tileNode.setPosition(col * 44 - ((columns - 1) * 22), -row * (42 + tileGapY), 0);
        }
    }

    /** 覆写：根据 client seat 获取副露区 */
    protected getMeldAreaBySeat(seatIndex: number): Node | null {
        if (seatIndex === 0) return this.myMeldArea;
        if (seatIndex === 1) return this.topMeldArea;
        return null;
    }

    /** 覆写：2人对局副露区统一横向布局，牌面正面朝向 */
    protected renderMeldArea(seatIndex: number): void {
        const area = this.getMeldAreaBySeat(seatIndex);
        if (!area) return;
        area.removeAllChildren();
        const melds = this.meldRecords.get(seatIndex) || [];
        for (let groupIndex = 0; groupIndex < melds.length; groupIndex++) {
            const meld = melds[groupIndex];
            const group = new Node(`Meld_${groupIndex}`);
            group.parent = area;
            (group.getComponent(UITransform) || group.addComponent(UITransform)).setContentSize(160, 72);
            group.setPosition(groupIndex * 160, 0, 0);
            for (let i = 0; i < meld.length; i++) {
                const tileNode = this.createTileNodeForSeat(meld[i], 0, false);
                tileNode.parent = group;
                tileNode.setPosition(i * 42 - 42, 0, 0);
            }
        }
    }

    /** 覆写：对手手牌用顶部横排样式（2人对局） */
    protected renderOpponentHandBySeat(seatIndex: number, count: number): void {
        if (seatIndex === 1) {
            this.renderOpponentHand(count);
            return;
        }
        super.renderOpponentHandBySeat(seatIndex, count);
    }

    /** 渲染对手手牌（牌背） */
    protected renderOpponentHand(count: number): void {
        if (!this.topHandArea) return;
        this.topHandArea.removeAllChildren();
        if (count <= 0) return;

        const tw = 40, th = 56, gap = 2;
        const totalW = count * (tw + gap) - gap;
        let startX = -totalW / 2 + tw / 2;

        for (let i = 0; i < count; i++) {
            const back = this.createTileBackNode();
            back.setScale(tw / MahjongRoomBase.TILE_W, th / MahjongRoomBase.TILE_H, 1);
            back.parent = this.topHandArea;
            back.setPosition(startX, 0, 0);
            startX += tw + gap;
        }
    }

    /** 亮牌时翻开对手手牌 */
    protected revealOpponentHand(tiles: MahjongTile[]): void {
        if (!this.topHandArea) return;
        this.topHandArea.removeAllChildren();
        const tw = 40, th = 56, gap = 2;
        const totalW = tiles.length * (tw + gap) - gap;
        let startX = -totalW / 2 + tw / 2;

        for (const tile of tiles) {
            const node = this.createTileNode(tile, false);
            node.setScale(tw / MahjongRoomBase.TILE_W, th / MahjongRoomBase.TILE_H, 1);
            node.parent = this.topHandArea;
            node.setPosition(startX, 0, 0);
            startX += tw + gap;
        }
    }

    /** 清理桌面显示 */
    protected clearTableDisplay(): void {
        if (this.myDiscardArea) this.myDiscardArea.removeAllChildren();
        if (this.topDiscardArea) this.topDiscardArea.removeAllChildren();
        if (this.leftDiscardArea) this.leftDiscardArea.removeAllChildren();
        if (this.rightDiscardArea) this.rightDiscardArea.removeAllChildren();
        if (this.leftHandArea) this.leftHandArea.removeAllChildren();
        if (this.rightHandArea) this.rightHandArea.removeAllChildren();
        this.opponentHandCount = 0;
        if (this.topHandArea) this.topHandArea.removeAllChildren();
        this.discardRecords.clear();
        this.meldRecords.clear();
    }

    /** 从 actionOptions 构建 AvailableActions */
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

    protected buildTaojiangHud(): void {
        if (this.taojiangHudRoot) return;

        this.taojiangHudRoot = this.createUIChild(this.node, 'TaojiangHud', 360, 166, -560, 356, 120);
        this.paintRect(this.taojiangHudRoot, 360, 166, new Color(29, 35, 52, 214), new Color(238, 198, 116, 255), 18);

        const titleNode = this.createUIChild(this.taojiangHudRoot, 'Title', 280, 28, 0, 54, 1);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = '桃江麻将';
        titleLabel.fontSize = 26;
        titleLabel.lineHeight = 30;
        titleLabel.horizontalAlign = 1;
        titleLabel.color = new Color(255, 236, 198, 255);

        const scoreNode = this.createUIChild(this.taojiangHudRoot, 'Score', 300, 26, 0, 18, 1);
        this.scoreLabel = scoreNode.addComponent(Label);
        this.scoreLabel.fontSize = 22;
        this.scoreLabel.lineHeight = 26;
        this.scoreLabel.horizontalAlign = 1;
        this.scoreLabel.color = new Color(255, 255, 255, 255);

        const fanNode = this.createUIChild(this.taojiangHudRoot, 'FanSummary', 320, 24, 0, -16, 1);
        this.fanSummaryLabel = fanNode.addComponent(Label);
        this.fanSummaryLabel.fontSize = 18;
        this.fanSummaryLabel.lineHeight = 22;
        this.fanSummaryLabel.horizontalAlign = 1;
        this.fanSummaryLabel.color = new Color(255, 219, 144, 255);

        const oppNode = this.createUIChild(this.taojiangHudRoot, 'OpponentInfo', 320, 24, 0, -48, 1);
        this.opponentInfoLabel = oppNode.addComponent(Label);
        this.opponentInfoLabel.fontSize = 18;
        this.opponentInfoLabel.lineHeight = 22;
        this.opponentInfoLabel.horizontalAlign = 1;
        this.opponentInfoLabel.color = new Color(184, 226, 255, 255);

        this.tingHintNode = this.createUIChild(this.node, 'TaojiangTingHint', 430, 86, 520, -318, 120);
        this.paintRect(this.tingHintNode, 430, 86, new Color(19, 24, 35, 214), new Color(117, 186, 255, 255), 16);
        this.tingTitleLabel = this.createUIChild(this.tingHintNode, 'Title', 90, 24, -160, 22, 1).addComponent(Label);
        this.tingTitleLabel.fontSize = 20;
        this.tingTitleLabel.lineHeight = 24;
        this.tingTitleLabel.color = new Color(255, 222, 135, 255);
        this.tingTitleLabel.string = '听牌';
        this.tingTilesRoot = this.createUIChild(this.tingHintNode, 'Tiles', 320, 50, 26, -4, 1);
        this.tingHintNode.active = false;
    }

    protected refreshTaojiangHud(): void {
        if (this.scoreLabel) {
            this.scoreLabel.string = `本局积分 ${this.myScore >= 0 ? '+' : ''}${this.myScore}`;
        }
        if (this.fanSummaryLabel) {
            const summary = this.totalFans > 0 ? `累计番数 ${this.totalFans} 番` : '番型状态 等待结算';
            this.fanSummaryLabel.string = summary;
        }
        if (this.opponentInfoLabel) {
            this.opponentInfoLabel.string = `对手手牌 ${Math.max(0, this.opponentHandCount)} 张`;
        }
    }

    protected updateFanSummary(text: string): void {
        if (this.fanSummaryLabel) {
            this.fanSummaryLabel.string = text;
        }
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

    protected extractTotalFansFromSettlement(msg: any): number {
        const data = msg?.data || {};
        if (typeof data.totalFans === 'number') return data.totalFans;
        if (typeof msg?.totalFans === 'number') return msg.totalFans;
        const huStyles = data.huStyles || [];
        let count = 0;
        for (let i = 0; i < huStyles.length; i++) {
            const styleValue = huStyles[i] || 0;
            count = Math.max(count, this.parseHuStyleNames(styleValue).length);
        }
        return count;
    }

    protected extractMyRoundDelta(msg: any): number {
        const seat = this.seat;
        const winGolds = msg?.winGolds || [];
        if (typeof winGolds[seat] === 'number') return winGolds[seat];
        const scores = msg?.data?.scores || [];
        if (typeof scores[seat] === 'number') return scores[seat];
        return 0;
    }

    // ==================== 结算 UI ====================

    /** 解析 huStyles 位掩码返回牌型名称列表（对照 MahjongGenre.h HuStyle 枚举） */
    protected parseHuStyleNames(huStyle: number): string[] {
        const names: string[] = [];
        // QiXiaoDui 系列 (高位优先)
        if (huStyle & 0x400) { names.push('三豪华七小对'); return names; }
        if (huStyle & 0x200) { names.push('双豪华七小对'); return names; }
        if (huStyle & 0x100) { names.push('单豪华七小对'); return names; }
        if (huStyle & 0x080) { names.push('七小对'); return names; }
        // 特殊牌型
        if (huStyle & 0x1000) { names.push('十三烂'); return names; }
        if (huStyle & 0x800) { names.push('十三幺'); return names; }
        if (huStyle & 0x040) { names.push('字一色'); return names; }
        if (huStyle & 0x020) { names.push('清一色'); return names; }
        // 基础牌型
        if (huStyle & 0x010) { names.push('碰碰胡'); return names; }
        // 包含 PingHu 的子类型
        if (huStyle & 0x002) { names.push('单吊'); return names; }
        if (huStyle & 0x004) { names.push('边张'); return names; }
        if (huStyle & 0x008) { names.push('卡张'); return names; }
        if (huStyle & 0x001) { names.push('平胡'); return names; }
        return names;
    }

    /** 解析 huWays 位掩码返回加番名称列表（对照 MahjongGenre.h HuWay 枚举） */
    protected parseHuWayNames(huWay: number): string[] {
        const names: string[] = [];
        if (huWay & 0x40) names.push('地胡');
        if (huWay & 0x20) names.push('天胡');
        if (huWay & 0x80000) names.push('抢杠胡');
        if (huWay & 0x200) names.push('海底炮');
        if (huWay & 0x100) names.push('海底捞月');
        if (huWay & 0x8000) names.push('杠上炮');
        if (huWay & 0x800) names.push('杠上花');
        if (huWay & 0x80) names.push('人胡');
        if (huWay & 0x08) names.push('全求人');
        if (huWay & 0x04) names.push('门清');
        if (huWay & 0x02) names.push('点炮');
        if (huWay & 0x01) names.push('自摸');
        return names;
    }

    protected showSettlementUI(msg: any): void {
        this.hideSettlementUI();
        const overlay = this.createPopupOverlay('SettlementOverlay', 999, 176);

        const data = msg.data || {};
        const isHu = !!data.hu;
        const seatCount = this.getSeatCount();

        // 计算胡牌玩家信息
        let huPlayerSeat = -1;
        let huStyleNames: string[] = [];
        let huWayNames: string[] = [];
        for (let i = 0; i < seatCount; i++) {
            if (data.huStyles && data.huStyles[i]) {
                huPlayerSeat = i;
                huStyleNames = this.parseHuStyleNames(data.huStyles[i]);
                huWayNames = this.parseHuWayNames(data.huWays[i] || 0);
                break;
            }
        }

        const panelHeight = isHu ? 430 : 370;
        const panel = this.createPopupPanel(
            overlay,
            'SettlementPanel',
            760,
            panelHeight,
            isHu ? '本局结算' : '本局流局',
            isHu ? '桃江麻将战绩回顾' : '本局无人胡牌，等待下一轮',
        );

        const badge = this.createUIChild(panel, 'ResultBadge', 180, 42, 0, panelHeight / 2 - 88, 1);
        this.paintRect(badge, 180, 42, isHu ? new Color(171, 74, 30, 230) : new Color(63, 90, 124, 230), new Color(255, 214, 132, 255), 16);
        const badgeLabel = badge.addComponent(Label);
        badgeLabel.string = isHu ? '胡牌结算' : '本局流局';
        badgeLabel.fontSize = 22;
        badgeLabel.lineHeight = 26;
        badgeLabel.horizontalAlign = 1;
        badgeLabel.verticalAlign = 1;
        badgeLabel.color = new Color(255, 245, 223, 255);

        if (isHu) {
            const styleCard = this.createUIChild(panel, 'StyleCard', 680, 72, 0, panelHeight / 2 - 148, 1);
            this.paintRect(styleCard, 680, 72, new Color(20, 32, 48, 205), new Color(234, 190, 106, 255), 16);
            const styleLabel = styleCard.addComponent(Label);
            const styleStr = huStyleNames.length > 0 ? huStyleNames.join(' · ') : '平胡';
            const wayStr = huWayNames.length > 0 ? `\n${huWayNames.join(' · ')}` : '';
            styleLabel.string = `${styleStr}${wayStr}`;
            styleLabel.fontSize = 22;
            styleLabel.lineHeight = 28;
            styleLabel.horizontalAlign = 1;
            styleLabel.verticalAlign = 1;
            styleLabel.color = new Color(255, 219, 145, 255);
        }

        const golds = msg.golds || [];
        const winGolds = msg.winGolds || [];
        const scores = data.scores || [];
        const startY = isHu ? 30 : 62;
        for (let i = 0; i < seatCount; i++) {
            const serverSeat = this.client2ServerSeat(i);
            if (!this.playerInfos[serverSeat]) continue;
            const nickname = this.playerInfos[serverSeat].nickname || ('玩家' + i);
            const winGold = winGolds[serverSeat] || 0;
            const score = scores[serverSeat] || 0;
            const isPositive = winGold > 0;
            const isWinner = (serverSeat === huPlayerSeat);
            const row = this.createUIChild(panel, `PlayerRow${i}`, 680, 84, 0, startY - i * 96, 1);
            this.paintRect(
                row,
                680,
                84,
                isWinner ? new Color(74, 54, 22, 225) : new Color(19, 28, 42, 205),
                isWinner ? new Color(255, 210, 116, 255) : new Color(97, 124, 157, 255),
                18,
            );

            const nameNode = this.createUIChild(row, 'Name', 220, 30, -195, 18, 1);
            const nameLabel = nameNode.addComponent(Label);
            nameLabel.string = `${isWinner ? '赢家 ' : ''}${nickname}`;
            nameLabel.fontSize = 24;
            nameLabel.lineHeight = 28;
            nameLabel.horizontalAlign = 0;
            nameLabel.color = isWinner ? new Color(255, 228, 160, 255) : new Color(235, 241, 248, 255);

            const detailNode = this.createUIChild(row, 'Detail', 610, 24, 0, -14, 1);
            const detailLabel = detailNode.addComponent(Label);
            detailLabel.string = `番分 ${score >= 0 ? '+' : ''}${score}    金币 ${winGold >= 0 ? '+' : ''}${winGold}    余额 ${golds[serverSeat] || 0}`;
            detailLabel.fontSize = 20;
            detailLabel.lineHeight = 24;
            detailLabel.horizontalAlign = 1;
            detailLabel.color = isPositive ? new Color(147, 242, 169, 255) : new Color(255, 176, 176, 255);
        }

        this.createPopupButton(
            panel,
            '继续',
            0,
            -panelHeight / 2 + 42,
            188,
            new Color(46, 128, 88, 255),
            new Color(133, 231, 174, 255),
            () => this.hideSettlementUI(),
        );

        this.settlementNode = overlay;
    }

    protected hideSettlementUI(): void {
        if (this.settlementNode) {
            this.settlementNode.destroy();
            this.settlementNode = null;
        }
    }

    // ==================== 解散投票 UI ====================

    protected showDisbandVoteUI(msg: any): void {
        this.hideDisbandVoteUI();
        const overlay = this.createPopupOverlay('DisbandVoteOverlay', 998, 136);
        const panel = this.createPopupPanel(
            overlay,
            'DisbandPanel',
            620,
            334,
            '解散投票',
            '请在对局内确认是否同意解散房间',
        );

        const disbanderSeat = msg.disbander;
        const disbanderInfo = this.playerInfos[disbanderSeat];
        const initiatorNode = this.createUIChild(panel, 'Initiator', 540, 44, 0, 74, 1);
        this.paintRect(initiatorNode, 540, 44, new Color(63, 40, 39, 228), new Color(240, 177, 144, 255), 14);
        const initiator = initiatorNode.addComponent(Label);
        initiator.string = `${disbanderInfo?.nickname || '玩家'} 发起了解散投票`;
        initiator.fontSize = 22;
        initiator.color = new Color(255, 230, 214, 255);
        initiator.horizontalAlign = 1;
        initiator.verticalAlign = 1;

        const votesNode = this.createUIChild(panel, 'Votes', 540, 116, 0, -8, 1);
        this.paintRect(votesNode, 540, 116, new Color(19, 28, 42, 212), new Color(118, 145, 180, 255), 16);
        this._disbandVotesNode = votesNode;

        const votesLabel = votesNode.addComponent(Label);
        if (Array.isArray(msg.choices)) {
            this.currentDisbandChoices = [...msg.choices];
        }
        votesLabel.string = this.buildDisbandVoteText(this.currentDisbandChoices || []);
        votesLabel.fontSize = 20;
        votesLabel.lineHeight = 30;
        votesLabel.color = new Color(230, 236, 245, 255);
        votesLabel.horizontalAlign = 1;
        votesLabel.verticalAlign = 1;

        this.createPopupButton(
            panel,
            '同意',
            -108,
            -116,
            170,
            new Color(46, 128, 88, 255),
            new Color(133, 231, 174, 255),
            () => NetworkManager.Instance.sendMessage("MsgDisbandChoose", { venueId: GameManager.Instance.VenueId, choice: 1 }, true),
        );
        this.createPopupButton(
            panel,
            '拒绝',
            108,
            -116,
            170,
            new Color(138, 71, 46, 255),
            new Color(255, 178, 138, 255),
            () => NetworkManager.Instance.sendMessage("MsgDisbandChoose", { venueId: GameManager.Instance.VenueId, choice: 2 }, true),
        );

        this.disbandVoteNode = overlay;
    }

    protected _disbandVotesNode: Node | null = null;

    protected updateDisbandVoteUI(): void {
        if (!this._disbandVotesNode) return;
        const label = this._disbandVotesNode.getComponent(Label);
        if (label) label.string = this.buildDisbandVoteText(this.currentDisbandChoices || []);
    }

    protected hideDisbandVoteUI(): void {
        if (this.disbandVoteNode) {
            this.disbandVoteNode.destroy();
            this.disbandVoteNode = null;
        }
        this._disbandVotesNode = null;
    }

    protected createPopupOverlay(name: string, siblingIndex: number, maskOpacity: number): Node {
        const overlay = new Node(name);
        overlay.parent = this.node;
        overlay.layer = 1 << 25;
        overlay.addComponent(UITransform).setContentSize(1920, 1080);
        overlay.setPosition(0, 0, 0);
        overlay.setSiblingIndex(siblingIndex);

        const mask = this.createUIChild(overlay, 'Mask', 1920, 1080, 0, 0, 0);
        const graphics = mask.addComponent(Graphics);
        graphics.fillColor = new Color(0, 0, 0, maskOpacity);
        graphics.rect(-960, -540, 1920, 1080);
        graphics.fill();
        return overlay;
    }

    protected createPopupPanel(parent: Node, name: string, width: number, height: number, title: string, subtitle: string): Node {
        const panel = this.createUIChild(parent, name, width, height, 0, 0, 1);
        this.paintRect(panel, width, height, new Color(17, 27, 40, 245), new Color(228, 190, 110, 255), 22);

        const titleBar = this.createUIChild(panel, 'TitleBar', width - 56, 66, 0, height / 2 - 48, 1);
        this.paintRect(titleBar, width - 56, 66, new Color(48, 61, 81, 230), new Color(255, 214, 132, 255), 18);

        const titleNode = this.createUIChild(titleBar, 'Title', width - 120, 28, 0, 10, 1);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = title;
        titleLabel.fontSize = 30;
        titleLabel.lineHeight = 34;
        titleLabel.horizontalAlign = 1;
        titleLabel.color = new Color(255, 238, 201, 255);

        const subtitleNode = this.createUIChild(titleBar, 'Subtitle', width - 120, 22, 0, -16, 1);
        const subtitleLabel = subtitleNode.addComponent(Label);
        subtitleLabel.string = subtitle;
        subtitleLabel.fontSize = 16;
        subtitleLabel.lineHeight = 20;
        subtitleLabel.horizontalAlign = 1;
        subtitleLabel.color = new Color(188, 205, 225, 255);
        return panel;
    }

    protected buildDisbandVoteText(choices: any[]): string {
        const lines: string[] = [];
        const seatCount = this.getSeatCount();
        for (let i = 0; i < seatCount; i++) {
            const info = this.playerInfos[i];
            if (!info) continue;
            const choice = choices[i] || 0;
            const choiceText = choice === 1 ? '已同意' : (choice === 2 ? '已拒绝' : '等待回应');
            lines.push(`${info.nickname}  ·  ${choiceText}`);
        }
        return lines.join('\n');
    }

    /** 创建弹窗按钮 */
    private createPopupButton(parent: Node, text: string, x: number, y: number, width: number, color: Color, strokeColor: Color, handler: () => void): void {
        const btnNode = new Node(text);
        btnNode.parent = parent;
        btnNode.addComponent(UITransform).setContentSize(width, 52);
        btnNode.setPosition(x, y, 0);
        this.paintRect(btnNode, width, 52, color, strokeColor, 14);

        const labelNode = new Node('Label');
        labelNode.parent = btnNode;
        labelNode.addComponent(UITransform).setContentSize(width - 20, 36);
        const lc = labelNode.addComponent(Label);
        lc.string = text;
        lc.fontSize = 22;
        lc.lineHeight = 28;
        lc.color = new Color(255, 255, 255, 255);
        lc.horizontalAlign = 1;
        lc.verticalAlign = 1;

        btnNode.on(Node.EventType.TOUCH_END, handler, this);
    }

    // ==================== 胡牌庆祝 ====================

    protected showHuCelebration(clientSeat: number): void {
        let y = clientSeat === 0 ? -200 : 200;
        const labelNode = new Node('HuCelebration');
        labelNode.parent = this.node;
        labelNode.layer = 1 << 25;
        const lt = labelNode.addComponent(UITransform);
        lt.setContentSize(200, 80);
        labelNode.setPosition(0, y, 0);
        labelNode.setSiblingIndex(999);

        const lc = labelNode.addComponent(Label);
        lc.string = '胡!';
        lc.fontSize = 60;
        lc.lineHeight = 68;
        lc.color = new Color(255, 50, 50, 255);
        lc.isBold = true;
        lc.horizontalAlign = 1;
        lc.verticalAlign = 1;
        lc.outlineColor = new Color(255, 200, 0, 255);
        lc.outlineWidth = 2;

        // 2秒后自动消失
        this.scheduleOnce(() => labelNode.destroy(), 2.5);
    }

    // ==================== 听牌提示 ====================

    public showTingHint(tingTiles: MahjongTile[]): void {
        if (tingTiles.length === 0) return;
        if (!this.tingHintNode || !this.tingTilesRoot) return;
        this.tingHintNode.active = true;
        this.tingTilesRoot.removeAllChildren();
        if (this.tingTitleLabel) {
            this.tingTitleLabel.string = `可胡 ${tingTiles.length} 张`;
        }
        let startX = -130;
        for (const t of tingTiles.slice(0, 8)) {
            const tileNode = this.createTileNodeForSeat(t, 3, false);
            tileNode.setScale(0.7, 0.7, 1);
            tileNode.parent = this.tingTilesRoot;
            tileNode.setPosition(startX, 0, 0);
            startX += 38;
        }
    }

    public hideTingHint(): void {
        if (this.tingTilesRoot) this.tingTilesRoot.removeAllChildren();
        if (this.tingHintNode) this.tingHintNode.active = false;
    }

    // ==================== 音效桩 ====================

    protected playDiscardSound(): void { super.playDiscardSound(); }
    protected playHuSound(isSelf: boolean): void { super.playHuSound(isSelf); }
    protected playPengSound(): void { super.playPengSound(); }
    protected playGangSound(): void { super.playGangSound(); }
    protected playErrorSound(): void { super.playErrorSound(); }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        this.opponentHandCount = 0;
        this.hideSettlementUI();
        this.hideDisbandVoteUI();
        this.totalFans = 0;
        this.hideTingHint();
        this.refreshTaojiangHud();
    }
}
