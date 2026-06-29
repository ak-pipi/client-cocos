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

import { _decorator, Node, Label, Graphics, Color, UITransform, BlockInputEvents, Vec3, tween, UIOpacity, Sprite, SpriteFrame, view } from 'cc';
import { MahjongRoomBase, MahjongTile, AvailableActions, MahjongActionOption, MahjongActionType, MeldType, MahjongMeldGroup, tileDisplayText } from '../../GameCommon/MahjongRoomBase';
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
    protected pendingRoundIncrement: boolean = false;

    // 赖子系统
    protected laiziEnabled: boolean = false;
    protected laiziTile: MahjongTile | null = null;     // 赖子牌（万能牌，mingZi 的下一张同花色牌）
    protected mingZiTile: MahjongTile | null = null;    // 明子（骰子翻出的牌）
    protected dicePoint: number = 0;
    // 庄家
    protected bankerSeat: number = -1;
    // 报听
    protected baoTingEnabled: boolean = false;
    protected baoTinged: boolean[] = [false, false, false, false];
    // 房间规则
    protected roomNumber: string = '';
    protected diZhu: number = 1;
    protected allowChi: boolean = false;
    protected allowDianPao: boolean = true;

    // HUD UI 节点
    protected laiziInfoLabel: Label | null = null;
    protected roomInfoLabel: Label | null = null;
    protected bankerLabels: (Label | null)[] = [null, null, null, null];
    protected baoTingLabels: (Label | null)[] = [null, null, null, null];

    protected laiziHintRoot: Node | null = null;
    protected laiziHintDiceLabel: Label | null = null;
    protected laiziHintMingSlot: Node | null = null;
    protected laiziHintLaiSlot: Node | null = null;
    protected laiziHintWangLabel: Label | null = null;
    private _hintDiceRollCount: number = 0;
    private _hintDiceRollTarget: number = 0;
    private _hintAnimating: boolean = false;

    // 骰子动画 + 明子/赖子牌展示
    protected laiziRevealNode: Node | null = null;  // 整个展示容器的根节点
    protected diceLabel: Label | null = null;
    protected mingZiTileDisplayNode: Node | null = null;
    protected laiziTileDisplayNode: Node | null = null;
    protected laiziRevealTimer: number = 0;
    private _diceRollCount: number = 0;
    private _diceRollTarget: number = 0;
    private _laiziRevealShownRoundNo: number = -1;

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
        // 桃江麻将已入座（桌面模式）时也需要准备按钮，覆写 readyGroup 逻辑
        if (this.readyGroup && this.seat !== -1) {
            this.readyGroup.active = (this.gameState === GameState.Waiting);
        }
        this.hideTingHint();
    }

    /** 覆写准备按钮状态，确保已入座时 readyGroup 也可见 */
    protected updateReadyButtonState(): void {
        if (!this.btnReady) return;
        const canReady = (this.seat !== -1 && this.gameState === GameState.Waiting);
        // 已入座桌面模式下，需要手动激活 readyGroup 父节点
        if (canReady && this.readyGroup) {
            this.readyGroup.active = true;
        }
        this.btnReady.active = canReady;
        if (!canReady) return;

        const selfInfo = this.playerInfos[this.seat];
        const ready = !!selfInfo?.ready;
        if (this.btnReadyLabel) {
            this.btnReadyLabel.string = ready ? '取消准备' : '准备';
        }
    }

    /** 全量同步响应（补齐桃江麻将局内数据） */
    protected onSyncGame(msg: any): void {
        super.onSyncGame(msg);
        if (!msg) return;

        if (msg.roundNo !== undefined) {
            (this as any).currentRound = Number(msg.roundNo) || 0;
        }
        if (msg.roundCount !== undefined) {
            (this as any).totalRounds = Number(msg.roundCount) || 0;
        }

        this.applyLaiziDataFromMsg(msg);

        // 庄家
        if (msg.banker !== undefined) this.bankerSeat = Number(msg.banker) ?? -1;

        // 报听
        if (msg.baoTingEnabled !== undefined) this.baoTingEnabled = !!msg.baoTingEnabled;
        if (Array.isArray(msg.baoTinged)) {
            for (let i = 0; i < 4; i++) this.baoTinged[i] = !!msg.baoTinged[i];
        }

        // 房间规则
        if (msg.number !== undefined) this.roomNumber = String(msg.number || '');
        if (msg.diZhu !== undefined) this.diZhu = Number(msg.diZhu) || 1;
        if (msg.chi !== undefined) this.allowChi = !!msg.chi;
        if (msg.dianPao !== undefined) this.allowDianPao = !!msg.dianPao;

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
                    const melds: MahjongMeldGroup[] = chapters
                        .filter((g: any) => g && (Array.isArray(g.tiles) || Array.isArray(g)))
                        .map((g: any) => {
                            const tiles = (g.tiles || g).map((t: any) => this.parseMahjongTile(t));
                            // 服务端 chapters 包含 types 字段可以区分副露类型
                            let meldType = MeldType.Peng;
                            if (g.types && g.types[0] !== undefined) {
                                meldType = this.chapterTypeToMeldType(g.types[0]);
                            } else if (tiles.length === 4) {
                                meldType = MeldType.AnGang; // 4张默认暗杠
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

        this.tryShowLaiziReveal();
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
        console.log('[TaojiangRoom] Start round, banker:', msg.banker, 'roundNo:', msg.roundNo, 'laizi:', msg.laiziEnabled);
        this.gameState = GameState.Dealing;

        const laiziSnapshot = this.extractLaiziSnapshot(msg);
        const laiziEnabled = laiziSnapshot.laiziEnabled;
        const wangPai = laiziSnapshot.wangPai;
        const mingZi = laiziSnapshot.mingZi;
        const dicePoint = laiziSnapshot.dicePoint;
        const bankerSeat = msg.banker !== undefined ? (Number(msg.banker) ?? -1) : -1;

        // 庄家
        this.bankerSeat = bankerSeat;

        // 清除上一局的报听状态（新局重新报听）
        this.baoTinged = [false, false, false, false];

        if (msg?.roundNo !== undefined) {
            (this as any).currentRound = Number(msg.roundNo) || 0;
            this.pendingRoundIncrement = false;
        } else if (this.pendingRoundIncrement || (this as any).currentRound === 0) {
            const current = Number((this as any).currentRound) || 0;
            (this as any).currentRound = current + 1;
            this.pendingRoundIncrement = false;
        }
        if (msg?.roundCount !== undefined) {
            (this as any).totalRounds = Number(msg.roundCount) || 0;
        }
        this.stopCountdown();
        this.resetRoundState();

        this.laiziEnabled = laiziEnabled;
        this.laiziTile = wangPai;
        this.mingZiTile = mingZi;
        this.dicePoint = dicePoint;
        if (this.laiziEnabled) {
            this.ensureLaiziDerived();
        }
        this.bankerSeat = bankerSeat;

        // 隐藏准备按钮和开始游戏按钮
        if (this.btnReady) this.btnReady.active = false;
        if (this.readyGroup) this.readyGroup.active = false;
        if (this.btnStartGame) this.btnStartGame.active = false;
        // 隐藏剩余准备标记
        if (this.readyFlags) {
            for (const f of this.readyFlags) { if (f) f.active = false; }
        }
        this.totalFans = 0;
        this.refreshTaojiangHud();

        this._laiziRevealShownRoundNo = -1;
        this.tryShowLaiziReveal();
    }

    /** 结算 */
    protected onTJSettlement(msg: any): void {
        console.log('[TaojiangRoom] Settlement:', msg);
        this.gameState = GameState.Waiting;
        this.stopCountdown();
        this.hideActionPanel();
        this.hideDisbandVoteUI();
        this.hideTingHint();
        this.totalFans = this.extractTotalFansFromSettlement(msg);
        this.myScore += this.extractMyRoundDelta(msg);
        if (msg?.roundNo !== undefined) {
            (this as any).currentRound = Number(msg.roundNo) || 0;
        }
        if (msg?.roundCount !== undefined) {
            (this as any).totalRounds = Number(msg.roundCount) || 0;
        }
        this.pendingRoundIncrement = true;

        // 检查是否最后一局（服务端 _roundNo >= _roundCount 后自动解散）
        const isLastRound = (this as any).currentRound >= (this as any).totalRounds && (this as any).totalRounds > 0;

        // 重置所有玩家的准备状态（服务端 afterHu 也会重置，客户端需同步）
        for (const seat of Object.keys(this.playerInfos)) {
            if (this.playerInfos[seat]) {
                this.playerInfos[seat].ready = false;
            }
        }

        // 显示结算弹窗
        this.showSettlementUI(msg, isLastRound);

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
        // 不再调用 resetRoundState()，因为 onTJStartRound 已经调用过了。
        // resetRoundState 会清除 laiziTile/mingZiTile/dicePoint 等赖子数据，
        // 而 MsgMahjongTiles 消息中不包含赖子信息，导致赖子数据丢失。
        this._laiziRevealShownRoundNo = -1;
        this.applyLaiziDataFromMsg(msg);
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
            this.tryShowLaiziReveal();
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

    private parseTileOnly(raw: any): MahjongTile {
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
            if (p0 != null && n0 != null) return { id: 0, tile: { pattern: p0, number: n0 } };
            const p = raw.tile[0] ?? raw.tile['0'];
            const n = raw.tile[1] ?? raw.tile['1'];
            const pn = toNum(p);
            const nn = toNum(n);
            if (pn != null && nn != null) return { id: 0, tile: { pattern: pn, number: nn } };
        }
        {
            const p = toNum(raw.pattern ?? raw[0] ?? raw['0']);
            const n = toNum(raw.number ?? raw[1] ?? raw['1']);
            if (p != null && n != null) return { id: 0, tile: { pattern: p, number: n } };
        }
        if (Array.isArray(raw)) {
            const p = toNum(raw[0]);
            const n = toNum(raw[1]);
            return { id: 0, tile: { pattern: p ?? 0, number: n ?? 0 } };
        }
        return { id: 0, tile: { pattern: toNum(raw.pattern) ?? 0, number: toNum(raw.number) ?? 0 } };
    }

    private parseActionOptionRaw(raw: any): MahjongActionOption {
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

        const score = (c: MahjongActionOption): number => {
            let s = 0;
            if (isValidType(c.type)) s += 3;
            if (c.player >= 0 && c.player <= 3) s += 1;
            if (c.id > 0) s += 1;
            return s;
        };

        const a = score(candA);
        const b = score(candB);
        return b > a ? candB : candA;
    }

    private extractLaiziSnapshot(msg: any): { laiziEnabled: boolean; wangPai: MahjongTile | null; mingZi: MahjongTile | null; dicePoint: number } {
        const sources: any[] = [msg, msg?.data, msg?.round, msg?.laizi, msg?.laiziInfo, msg?.extra].filter(v => v && typeof v === 'object');
        const pickBool = (keys: string[]): boolean | null => {
            for (const src of sources) {
                for (const k of keys) {
                    if (src[k] !== undefined) return !!src[k];
                }
            }
            return null;
        };
        const pickTile = (keys: string[]): MahjongTile | null => {
            for (const src of sources) {
                for (const k of keys) {
                    const v = src[k];
                    if (v != null) return this.parseMahjongTile(v);
                }
            }
            return null;
        };
        const pickNumber = (keys: string[]): number | null => {
            for (const src of sources) {
                for (const k of keys) {
                    const v = src[k];
                    if (v === undefined || v === null) continue;
                    const n = Number(v);
                    if (Number.isFinite(n)) return n;
                }
            }
            return null;
        };

        const mingZi = pickTile(['mingZi', 'mingzi', 'mingPai', 'mingpai', 'mingTile', 'mingtile', 'openTile', 'opentile', 'ming']);
        const wangPai = pickTile(['wangPai', 'wangpai', 'laiZi', 'laizi', 'wildcard', 'wang', 'wangTile', 'wangtile']);

        let dicePoint = pickNumber(['dicePoint', 'dice_point', 'diceSum', 'dice_sum', 'shaizi', 'touzi']) ?? 0;
        let diceArr: any = null;
        for (const src of sources) {
            if (src?.dice != null) { diceArr = src.dice; break; }
            if (src?.dices != null) { diceArr = src.dices; break; }
            if (src?.dicePoints != null) { diceArr = src.dicePoints; break; }
            if (src?.dice_points != null) { diceArr = src.dice_points; break; }
        }
        if (dicePoint <= 0 && Array.isArray(diceArr) && diceArr.length > 0) {
            const a = Number(diceArr[0]) || 0;
            const b = diceArr.length > 1 ? (Number(diceArr[1]) || 0) : 0;
            const sum = a + b;
            dicePoint = sum > 0 ? sum : (a > 0 ? a : 0);
        }
        if (dicePoint <= 0) {
            let d1 = 0;
            let d2 = 0;
            for (const src of sources) {
                d1 = Number(src?.dice1 ?? src?.d1 ?? src?.touzi1 ?? src?.shaizi1) || 0;
                d2 = Number(src?.dice2 ?? src?.d2 ?? src?.touzi2 ?? src?.shaizi2) || 0;
                if (d1 > 0 || d2 > 0) break;
            }
            const sum = d1 + d2;
            dicePoint = sum > 0 ? sum : (d1 > 0 ? d1 : 0);
        }

        const enabled = pickBool(['laiziEnabled', 'laiZiEnabled', 'wangPaiEnabled', 'wangpaiEnabled', 'wildEnabled', 'wildcardEnabled']);
        const laiziEnabled = enabled != null ? enabled : !!(mingZi || wangPai || this.laiziEnabled);

        return { laiziEnabled, wangPai, mingZi, dicePoint };
    }

    private applyLaiziDataFromMsg(msg: any): void {
        const snap = this.extractLaiziSnapshot(msg);
        const sources: any[] = [msg, msg?.data, msg?.round, msg?.laizi, msg?.laiziInfo, msg?.extra].filter(v => v && typeof v === 'object');
        const hasEnabled = sources.some(s => s?.laiziEnabled !== undefined
            || s?.laiZiEnabled !== undefined
            || s?.wangPaiEnabled !== undefined
            || s?.wangpaiEnabled !== undefined
            || s?.wildEnabled !== undefined
            || s?.wildcardEnabled !== undefined);
        const hasMingZi = sources.some(s => s?.mingZi != null || s?.mingzi != null || s?.mingPai != null || s?.mingpai != null || s?.mingTile != null || s?.mingtile != null || s?.openTile != null || s?.opentile != null || s?.ming != null);
        const hasWangPai = sources.some(s => s?.wangPai != null || s?.wangpai != null || s?.laiZi != null || s?.laizi != null || s?.wildcard != null || s?.wang != null || s?.wangTile != null || s?.wangtile != null);
        if (hasEnabled) {
            this.laiziEnabled = snap.laiziEnabled;
        } else if (hasMingZi || hasWangPai) {
            this.laiziEnabled = true;
        }

        if (hasMingZi) this.mingZiTile = snap.mingZi;

        if (hasWangPai) this.laiziTile = snap.wangPai;

        const hasDice = sources.some(s => s?.dicePoint !== undefined || s?.dice_point !== undefined || s?.diceSum !== undefined || s?.dice_sum !== undefined
            || s?.shaizi !== undefined || s?.touzi !== undefined || s?.dice1 !== undefined || s?.dice2 !== undefined || s?.dice != null || s?.dices != null || s?.dicePoints != null || s?.dice_points != null);
        if (hasDice) this.dicePoint = snap.dicePoint;

        if (this.laiziEnabled) this.ensureLaiziDerived();
    }

    private ensureLaiziDerived(): void {
        if (!this.laiziEnabled) return;
        if (!this.laiziTile && this.mingZiTile) {
            const m = this.mingZiTile;
            const p = Number(m.tile.pattern) || 0;
            const n = Number(m.tile.number) || 0;
            if (p >= 1 && p <= 3) {
                const next = (n % 9) + 1;
                this.laiziTile = { id: 0, tile: { pattern: p, number: next } };
                return;
            }
            if (p >= 4 && p <= 7) {
                const nextP = p === 7 ? 4 : (p + 1);
                this.laiziTile = { id: 0, tile: { pattern: nextP, number: 0 } };
                return;
            }
            if (p >= 8 && p <= 10) {
                const nextP = p === 10 ? 8 : (p + 1);
                this.laiziTile = { id: 0, tile: { pattern: nextP, number: 0 } };
                return;
            }
            if (p >= 11 && p <= 18) {
                const nextP = p === 18 ? 11 : (p + 1);
                this.laiziTile = { id: 0, tile: { pattern: nextP, number: 0 } };
            }
        }
    }

    private tryShowLaiziReveal(): void {
        const roundNo = Number((this as any).currentRound) || 0;
        if (this._laiziRevealShownRoundNo === roundNo) return;
        if (this.gameState !== GameState.Dealing && this.gameState !== GameState.Playing) {
            this.hideLaiziHint();
            return;
        }
        if (!this.laiziEnabled) {
            this.hideLaiziReveal();
            this.hideLaiziHint();
            return;
        }
        this.ensureLaiziDerived();
        if (!this.mingZiTile && !this.laiziTile) {
            this.hideLaiziReveal();
            this.hideLaiziHint();
            return;
        }
        this._laiziRevealShownRoundNo = roundNo;
        this.updateLaiziHint(true);
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
            this.opponentHandCount += 1;
            this.opponentHandCounts.set(1, this.opponentHandCount);
            this.renderOpponentHand(this.opponentHandCount);
        }
        this.refreshTaojiangHud();
    }

    /** 服务端动作选项通知 */
    protected onServerActionOption(msg: any): void {
        const rawOptions: any[] = msg.actionOptions || [];
        const options: MahjongActionOption[] = rawOptions.map((o: any) => this.parseActionOptionRaw(o));
        this.currentActionOptions = options;

        if (options.length === 0) {
            this.hideActionPanel();
            return;
        }

        // 如果包含 Play 选项，说明轮到我出牌
        const hasPlay = options.some(o => Number(o.type) === MahjongActionType.Play);
        if (hasPlay) {
            this.isMyTurn = true;
        }

        // 渲染按钮
        this.renderActionButtonsFromOptions(options);
        this.showActionPanel(this.buildAvailableActions(options));

        const hasHu = options.some(o => Number(o.type) === MahjongActionType.ZiMo || Number(o.type) === MahjongActionType.DianPao);
        const timeout = hasHu ? 180 : 180;
        this.startCountdown(timeout);
        this.updateFanSummary(options.map(opt => this.actionTypeName(Number(opt.type))).filter(Boolean).join(' / ') || '等待出牌');
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
        // 注意：addDiscardToDisplay 内部已处理对手手牌数递减
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

        // 杠牌后清理操作面板和旧的选项
        this.hideActionPanel();
        this.stopCountdown();
        this.currentActionOptions = [];

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

        // 碰/吃牌后清理操作面板和旧的选项，避免残留按钮
        this.hideActionPanel();
        this.stopCountdown();
        this.currentActionOptions = [];

        // 更新自己的手牌
        if (actorSeat === this.seat && msg.handTiles) {
            this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
            this.sortHandTiles();
            this.renderMyHand();
        }

        // 更新对手手牌数（碰/吃后手牌减少2张）
        if (actorSeat !== this.seat) {
            if (msg.handTiles && Array.isArray(msg.handTiles)) {
                // 服务端提供了碰/吃后的手牌，用实际数量更新
                this.opponentHandCount = msg.handTiles.length;
            } else {
                this.opponentHandCount -= 2;
                if (this.opponentHandCount < 0) this.opponentHandCount = 0;
            }
            this.opponentHandCounts.set(clientSeat, this.opponentHandCount);
            this.renderOpponentHand(this.opponentHandCount);
        }

        // 显示副露
        const fromSeat = this.server2ClientSeat(msg.player);
        if (isPeng) {
            this.showMeldPeng(clientSeat, tiles, fromSeat);
            this.playPengSound();
        } else {
            this.showMeldChi(clientSeat, tiles, fromSeat);
            console.log(`[TaojiangRoom] Player ${actorSeat} chi`);
        }
        this.updateFanSummary(isPeng ? '碰牌完成' : '吃牌完成');
    }

    /** 服务端听牌通知 */
    protected onServerTingTile(msg: any): void {
        const rawTiles: any[] = msg.tiles || msg?.data?.tiles || [];
        const seen = new Set<string>();
        const tingTiles: MahjongTile[] = [];
        for (const t of rawTiles) {
            const tile = this.parseTileOnly(t);
            const p = Number(tile.tile.pattern) || 0;
            const n = Number(tile.tile.number) || 0;
            if (p <= 0) continue;
            const key = `${p}_${n}`;
            if (seen.has(key)) continue;
            seen.add(key);
            tingTiles.push({ id: 0, tile: { pattern: p, number: n } });
        }
        if (tingTiles.length > 0) {
            this.showTingHint(tingTiles);
            this.updateFanSummary(`听牌 ${tingTiles.length} 张`);
            console.log(`[TaojiangRoom] Ting: ${tingTiles.length} tiles`);
        } else {
            this.hideTingHint();
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
            // 不在此处渲染操作面板，面板显示完全由 MsgActionOption 消息驱动
            // 避免使用旧的 currentActionOptions 重新渲染残留的碰/吃按钮
            this.updateFanSummary('轮到你出牌');
            console.log('[TaojiangRoom] My turn (actor)');
        } else {
            this.isMyTurn = false;
            this.hideActionPanel();
            this.startOtherCountdown(180);
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
        this.hideSettlementUI();
        this.hideDisbandVoteUI();
        this.hideTingHint();
        // 如果还有未处理的积分，显示最终积分提示
        if (this.myScore !== 0) {
            Client.Instance.showPromptTip(`对局结束，总积分 ${this.myScore >= 0 ? '+' : ''}${this.myScore}`, 3.0);
        }
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
        const lastDiscardId = this.lastDiscardTileId.get(seatIndex);
        for (let i = 0; i < discards.length; i++) {
            const row = Math.floor(i / columns);
            const col = i % columns;
            const isLast = discards[i].id === lastDiscardId;
            const tileNode = this.createTileNodeForSeat(discards[i], 0, false);
            tileNode.parent = discardArea;
            tileNode.setPosition(col * 44 - ((columns - 1) * 22), -row * (42 + tileGapY), 0);
            // 最后出牌高亮标记
            if (isLast) {
                this.paintHighlightBorder(tileNode, 48, 66, new Color(255, 220, 50, 255), 8);
            }
            // 新打出的牌弹出动画（与高亮标记统一处理，避免 scale 冲突）
            if (i === discards.length - 1 && discards.length > 0) {
                tileNode.setScale(new Vec3(0.6, 0.6, 1));
                const capturedNode = tileNode;
                const targetScale = isLast ? new Vec3(1.08, 1.08, 1) : Vec3.ONE;
                this.scheduleOnce(() => {
                    if (!capturedNode.isValid) return;
                    capturedNode.setScale(targetScale);
                }, 0.12);
            }
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
            const meldGroup = melds[groupIndex];
            const meld = meldGroup.tiles;
            const isAnGang = meldGroup.meldType === MeldType.AnGang;
            const group = new Node(`Meld_${groupIndex}`);
            group.parent = area;
            (group.getComponent(UITransform) || group.addComponent(UITransform)).setContentSize(160, 72);
            group.setPosition(groupIndex * 160, 0, 0);
            for (let i = 0; i < meld.length; i++) {
                const useBack = isAnGang && (i === 2);
                const tileNode = useBack
                    ? this.createTileBackNode()
                    : this.createTileNodeForSeat(meld[i], 0, false);
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
        if (this.lastDiscardTileId) this.lastDiscardTileId.clear();
        if (this.topHandArea) this.topHandArea.removeAllChildren();
        this.discardRecords.clear();
        this.meldRecords.clear();
    }

    // ==================== 赖子判断 ====================

    /** 覆写手牌渲染，添加赖子标记 */
    protected renderMyHand(): void {
        super.renderMyHand();
        this.markLaiziTilesInHand();
    }

    /** 给手牌中的赖子添加金色角标 */
    protected markLaiziTilesInHand(): void {
        if (!this.laiziEnabled || !this.laiziTile || !this.myHandArea) return;
        const children = this.myHandArea.children;
        for (let i = 0; i < children.length && i < this.myHandTiles.length; i++) {
            const tile = this.myHandTiles[i];
            if (this.isLaiZiTile(tile)) {
                this.addLaiziMarker(children[i]);
            }
        }
        // 也标记摸起牌
        if (this.drawnTile && this.isLaiZiTile(this.drawnTile) && this.drawnTileNode) {
            const drawnChildren = this.drawnTileNode.children;
            if (drawnChildren.length > 0) {
                this.addLaiziMarker(drawnChildren[0]);
            }
        }
    }

    /** 给节点添加 "赖" 字角标 */
    protected addLaiziMarker(tileNode: Node): void {
        if (tileNode.getChildByName('LaiziBadge')) return; // 避免重复添加
        const badge = new Node('LaiziBadge');
        badge.parent = tileNode;
        badge.addComponent(UITransform).setContentSize(22, 22);
        badge.setPosition(20, 20, 0);
        this.paintRect(badge, 22, 22, new Color(255, 180, 0, 240), new Color(255, 240, 180, 255), 6);
        const label = badge.addComponent(Label);
        label.string = '赖';
        label.fontSize = 14;
        label.lineHeight = 16;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.color = new Color(80, 30, 0, 255);
        label.isBold = true;
    }

    /** 判断一张牌是否是赖子（万能牌） */
    protected isLaiZiTile(tile: MahjongTile): boolean {
        if (!this.laiziEnabled || !this.laiziTile) return false;
        return tile.tile.pattern === this.laiziTile.tile.pattern
            && tile.tile.number === this.laiziTile.tile.number;
    }

    /** 判断一张牌是否是明子（赖子的原始面） */
    protected isLaiZiOriginal(tile: MahjongTile): boolean {
        if (!this.laiziEnabled || !this.mingZiTile) return false;
        return tile.tile.pattern === this.mingZiTile.tile.pattern
            && tile.tile.number === this.mingZiTile.tile.number;
    }

    /** 将服务端 chapter type 值映射为客户端 MeldType */
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

        this.taojiangHudRoot = this.createUIChild(this.node, 'TaojiangHud', 360, 240, -560, 356, 120);
        this.paintRect(this.taojiangHudRoot, 360, 240, new Color(29, 35, 52, 214), new Color(238, 198, 116, 255), 18);

        const titleNode = this.createUIChild(this.taojiangHudRoot, 'Title', 280, 28, 0, 92, 1);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = '桃江麻将';
        titleLabel.fontSize = 26;
        titleLabel.lineHeight = 30;
        titleLabel.horizontalAlign = 1;
        titleLabel.color = new Color(255, 236, 198, 255);

        // 房间信息行
        const roomNode = this.createUIChild(this.taojiangHudRoot, 'RoomInfo', 320, 22, 0, 62, 1);
        this.roomInfoLabel = roomNode.addComponent(Label);
        this.roomInfoLabel.fontSize = 16;
        this.roomInfoLabel.lineHeight = 20;
        this.roomInfoLabel.horizontalAlign = 1;
        this.roomInfoLabel.color = new Color(188, 205, 225, 255);

        // 赖子信息行
        const laiziNode = this.createUIChild(this.taojiangHudRoot, 'LaiziInfo', 320, 22, 0, 38, 1);
        this.laiziInfoLabel = laiziNode.addComponent(Label);
        this.laiziInfoLabel.fontSize = 16;
        this.laiziInfoLabel.lineHeight = 20;
        this.laiziInfoLabel.horizontalAlign = 1;
        this.laiziInfoLabel.color = new Color(255, 200, 80, 255);

        // 积分行
        const scoreNode = this.createUIChild(this.taojiangHudRoot, 'Score', 300, 26, 0, 10, 1);
        this.scoreLabel = scoreNode.addComponent(Label);
        this.scoreLabel.fontSize = 22;
        this.scoreLabel.lineHeight = 26;
        this.scoreLabel.horizontalAlign = 1;
        this.scoreLabel.color = new Color(255, 255, 255, 255);

        // 番型状态行
        const fanNode = this.createUIChild(this.taojiangHudRoot, 'FanSummary', 320, 24, 0, -18, 1);
        this.fanSummaryLabel = fanNode.addComponent(Label);
        this.fanSummaryLabel.fontSize = 18;
        this.fanSummaryLabel.lineHeight = 22;
        this.fanSummaryLabel.horizontalAlign = 1;
        this.fanSummaryLabel.color = new Color(255, 219, 144, 255);

        // 对手信息行
        const oppNode = this.createUIChild(this.taojiangHudRoot, 'OpponentInfo', 320, 24, 0, -48, 1);
        this.opponentInfoLabel = oppNode.addComponent(Label);
        this.opponentInfoLabel.fontSize = 18;
        this.opponentInfoLabel.lineHeight = 22;
        this.opponentInfoLabel.horizontalAlign = 1;
        this.opponentInfoLabel.color = new Color(184, 226, 255, 255);

        // 庄家标记（座位0=自己，在底部显示）
        for (let i = 0; i < 2; i++) {
            const bkNode = this.createUIChild(this.taojiangHudRoot, `BankerBadge${i}`, 32, 24, 150 - i * 0, 92, 1);
            this.paintRect(bkNode, 32, 24, new Color(171, 74, 30, 230), new Color(255, 210, 116, 255), 8);
            this.bankerLabels[i] = bkNode.addComponent(Label);
            this.bankerLabels[i]!.fontSize = 16;
            this.bankerLabels[i]!.lineHeight = 20;
            this.bankerLabels[i]!.horizontalAlign = 1;
            this.bankerLabels[i]!.verticalAlign = 1;
            this.bankerLabels[i]!.color = new Color(255, 245, 223, 255);
            this.bankerLabels[i]!.string = '庄';
            bkNode.active = false;
        }

        // 报听标记
        for (let i = 0; i < 2; i++) {
            const btNode = this.createUIChild(this.taojiangHudRoot, `BaoTingBadge${i}`, 32, 24, 150 - i * 0, 62, 1);
            this.paintRect(btNode, 32, 24, new Color(30, 100, 170, 230), new Color(117, 186, 255, 255), 8);
            this.baoTingLabels[i] = btNode.addComponent(Label);
            this.baoTingLabels[i]!.fontSize = 16;
            this.baoTingLabels[i]!.lineHeight = 20;
            this.baoTingLabels[i]!.horizontalAlign = 1;
            this.baoTingLabels[i]!.verticalAlign = 1;
            this.baoTingLabels[i]!.color = new Color(200, 235, 255, 255);
            this.baoTingLabels[i]!.string = '听';
            btNode.active = false;
        }

        this.tingHintNode = this.createUIChild(this.node, 'TaojiangTingHint', 430, 130, 520, -318, 120);
        this.paintRect(this.tingHintNode, 430, 130, new Color(19, 24, 35, 214), new Color(117, 186, 255, 255), 16);
        this.tingTitleLabel = this.createUIChild(this.tingHintNode, 'Title', 90, 24, -160, 52, 1).addComponent(Label);
        this.tingTitleLabel.fontSize = 20;
        this.tingTitleLabel.lineHeight = 24;
        this.tingTitleLabel.color = new Color(255, 222, 135, 255);
        this.tingTitleLabel.string = '听牌';
        this.tingTilesRoot = this.createUIChild(this.tingHintNode, 'Tiles', 400, 90, 10, -8, 1);
        this.tingHintNode.active = false;

        this.laiziHintRoot = this.createUIChild(this.node, 'LaiziHint', 230, 110, 520, 356, 120);
        this.paintRect(this.laiziHintRoot, 230, 110, new Color(19, 24, 35, 214), new Color(255, 200, 80, 255), 16);

        const diceBg = this.createUIChild(this.laiziHintRoot, 'DiceBg', 40, 40, -90, 0, 2);
        this.paintRect(diceBg, 40, 40, new Color(200, 50, 50, 255), new Color(255, 220, 180, 255), 10);
        this.laiziHintDiceLabel = diceBg.addComponent(Label);
        this.laiziHintDiceLabel.string = '?';
        this.laiziHintDiceLabel.fontSize = 24;
        this.laiziHintDiceLabel.lineHeight = 28;
        this.laiziHintDiceLabel.horizontalAlign = 1;
        this.laiziHintDiceLabel.verticalAlign = 1;
        this.laiziHintDiceLabel.color = new Color(255, 255, 255, 255);

        this.laiziHintMingSlot = this.createUIChild(this.laiziHintRoot, 'MingSlot', 72, 100, -10, 0, 2);
        this.laiziHintLaiSlot = this.createUIChild(this.laiziHintRoot, 'WangSlot', 72, 100, 70, 0, 2);
        const wangTitleNode = this.createUIChild(this.laiziHintRoot, 'WangTitle', 72, 18, 70, 52, 3);
        this.laiziHintWangLabel = wangTitleNode.addComponent(Label);
        this.laiziHintWangLabel.string = '王牌';
        this.laiziHintWangLabel.fontSize = 14;
        this.laiziHintWangLabel.lineHeight = 16;
        this.laiziHintWangLabel.horizontalAlign = 1;
        this.laiziHintWangLabel.color = new Color(255, 220, 100, 255);

        this.laiziHintRoot.active = false;
        this.updateLaiziHintLayout();
    }

    protected refreshTaojiangHud(): void {
        // 房间信息
        if (this.roomInfoLabel) {
            const roundInfo = (this as any).totalRounds > 0
                ? `第 ${(this as any).currentRound || 0}/${(this as any).totalRounds} 局`
                : '';
            const ruleParts: string[] = [];
            if (this.roomNumber) ruleParts.push(`房号 ${this.roomNumber}`);
            if (this.diZhu > 1) ruleParts.push(`底注 ${this.diZhu}`);
            if (this.allowChi) ruleParts.push('可吃');
            if (!this.allowDianPao) ruleParts.push('禁止点炮');
            const ruleStr = ruleParts.length > 0 ? ruleParts.join(' · ') : '桃江麻将';
            this.roomInfoLabel.string = `${roundInfo}${roundInfo && ruleStr ? '  ' : ''}${ruleStr}`;
        }

        // 赖子信息
        if (this.laiziInfoLabel) {
            if (this.laiziEnabled && this.laiziTile) {
                const laiziName = tileDisplayText(this.laiziTile);
                const mingName = this.mingZiTile ? tileDisplayText(this.mingZiTile) : '?';
                this.laiziInfoLabel.string = `王牌 ${laiziName}（明牌 ${mingName}）骰点 ${this.dicePoint}`;
            } else if (this.laiziEnabled) {
                this.laiziInfoLabel.string = '王牌未定';
            } else {
                this.laiziInfoLabel.string = '';
            }
        }

        // 积分
        if (this.scoreLabel) {
            this.scoreLabel.string = `本局积分 ${this.myScore >= 0 ? '+' : ''}${this.myScore}`;
        }

        // 番型状态
        if (this.fanSummaryLabel) {
            const summary = this.totalFans > 0 ? `累计番数 ${this.totalFans} 番` : '番型状态 等待结算';
            this.fanSummaryLabel.string = summary;
        }

        // 对手信息
        if (this.opponentInfoLabel) {
            let oppStr = `对手手牌 ${Math.max(0, this.opponentHandCount)} 张`;
            // 庄家标识
            if (this.bankerSeat !== -1) {
                const isBanker = this.seat === this.bankerSeat;
                oppStr += isBanker ? ' · 你是庄' : ' · 对手是庄';
            }
            this.opponentInfoLabel.string = oppStr;
        }

        // 庄家标记
        this.updateBankerUI();
        // 报听标记
        this.updateBaoTingUI();

        if (!this._hintAnimating) {
            this.updateLaiziHint(false);
        }
    }

    private onHintDiceRollTick(): void {
        this._hintDiceRollCount++;
        if (this.laiziHintDiceLabel && this._hintDiceRollCount < this._hintDiceRollTarget) {
            this.laiziHintDiceLabel.string = String((this._hintDiceRollCount % 6) + 1);
        }
    }

    private stopHintDiceRoll(): void {
        this.unschedule(this.onHintDiceRollTick);
        this._hintDiceRollCount = 0;
        this._hintDiceRollTarget = 0;
        this._hintAnimating = false;
    }

    private hideLaiziHint(): void {
        this.stopHintDiceRoll();
        if (this.laiziHintRoot) this.laiziHintRoot.active = false;
    }

    private updateLaiziHintLayout(): void {
        if (!this.laiziHintRoot) return;
        const t = this.laiziHintRoot.getComponent(UITransform);
        if (!t) return;
        const vis = view.getVisibleSize();
        const margin = 18;
        const x = vis.width / 2 - margin - t.width / 2;
        const topOffset = 86;
        const y = vis.height / 2 - topOffset - t.height / 2;
        this.laiziHintRoot.setPosition(x, y, 120);
    }

    private createHintTileFace(parent: Node, tile: MahjongTile): void {
        const old = parent.getChildByName('HintTile');
        if (old) old.destroy();

        const tw = 72;
        const th = 100;
        const node = new Node('HintTile');
        node.parent = parent;
        node.setPosition(0, 0, 0);
        node.addComponent(UITransform).setContentSize(tw, th);

        const atlas = this.getAtlasForSeat(0, true);
        const spriteName = this.getLegacyTileSpriteName(tile);
        const frame = (atlas && spriteName) ? atlas.getSpriteFrame('M_' + spriteName) : null;
        if (frame) {
            const sprite = node.addComponent(Sprite);
            sprite.spriteFrame = frame;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.color = Color.WHITE;
            return;
        }

        const g = node.addComponent(Graphics);
        g.fillColor = new Color(255, 250, 240, 255);
        g.roundRect(-tw / 2, -th / 2, tw, th, 8);
        g.fill();
        g.strokeColor = new Color(180, 170, 160, 255);
        g.lineWidth = 1.5;
        g.roundRect(-tw / 2, -th / 2, tw, th, 8);
        g.stroke();

        const labelNode = new Node('TileLabel');
        labelNode.parent = node;
        (labelNode.getComponent(UITransform) || labelNode.addComponent(UITransform)).setContentSize(tw - 10, th - 10);
        const label = labelNode.addComponent(Label);
        label.string = tileDisplayText(tile);
        label.fontSize = 20;
        label.lineHeight = 24;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.overflow = 2;
        label.color = tile.tile?.pattern === 3 ? new Color(200, 50, 50, 255) : new Color(60, 60, 60, 255);
    }

    private updateLaiziHint(animated: boolean): void {
        if (!this.laiziHintRoot || !this.laiziHintMingSlot || !this.laiziHintLaiSlot || !this.laiziHintDiceLabel) return;
        this.updateLaiziHintLayout();
        if (this.gameState !== GameState.Dealing && this.gameState !== GameState.Playing) {
            this.hideLaiziHint();
            return;
        }
        if (!this.laiziEnabled) {
            this.hideLaiziHint();
            return;
        }
        this.ensureLaiziDerived();
        if (!this.mingZiTile && !this.laiziTile) {
            this.hideLaiziHint();
            return;
        }

        this.laiziHintRoot.active = true;
        const finalDiceText = this.dicePoint > 0 ? String(this.dicePoint) : '?';

        const applyTiles = () => {
            if (this.laiziHintMingSlot) {
                const t = this.mingZiTile || this.laiziTile!;
                this.createHintTileFace(this.laiziHintMingSlot, t);
            }
            if (this.laiziHintLaiSlot) {
                const t = this.laiziTile || this.mingZiTile!;
                this.createHintTileFace(this.laiziHintLaiSlot, t);
            }
            if (this.laiziHintWangLabel) {
                this.laiziHintWangLabel.node.active = !!this.laiziTile;
            }
        };

        if (!animated) {
            this.stopHintDiceRoll();
            this.laiziHintDiceLabel.string = finalDiceText;
            applyTiles();
            return;
        }

        this.stopHintDiceRoll();
        this._hintAnimating = true;
        this.laiziHintDiceLabel.string = '?';
        this._hintDiceRollTarget = Math.floor(1.2 / 0.08);
        this._hintDiceRollCount = 0;
        this.schedule(this.onHintDiceRollTick, 0.08);
        tween(this.laiziHintDiceLabel.node)
            .delay(1.2)
            .call(() => {
                this.stopHintDiceRoll();
                if (this.laiziHintDiceLabel) this.laiziHintDiceLabel.string = finalDiceText;
                applyTiles();
            })
            .start();
    }

    /** 更新庄家标记显示 */
    protected updateBankerUI(): void {
        if (!this.bankerLabels) return;
        for (let i = 0; i < 2; i++) {
            const node = this.bankerLabels[i]?.node;
            if (!node) continue;
            if (this.bankerSeat === -1) {
                node.active = false;
                continue;
            }
            // i=0 对应 clientSeat 0（自己），i=1 对应 clientSeat 1（对手）
            const clientSeat = i;
            const serverSeat = this.client2ServerSeat(clientSeat);
            node.active = (serverSeat === this.bankerSeat);
        }
    }

    /** 更新报听标记显示 */
    protected updateBaoTingUI(): void {
        if (!this.baoTingLabels) return;
        if (!this.baoTingEnabled) {
            for (let i = 0; i < 2; i++) {
                if (this.baoTingLabels[i]?.node) this.baoTingLabels[i].node.active = false;
            }
            return;
        }
        for (let i = 0; i < 2; i++) {
            const node = this.baoTingLabels[i]?.node;
            if (!node) continue;
            const clientSeat = i;
            const serverSeat = this.client2ServerSeat(clientSeat);
            node.active = this.baoTinged[serverSeat] || false;
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
        // 桃江特有（可与其他牌型叠加）
        if (huStyle & 0x00020000) names.push('黑天胡');
        if (huStyle & 0x00010000) names.push('将将胡');
        // QiXiaoDui 系列（互斥，高位优先）
        if (huStyle & 0x400) names.push('豪七对');
        else if (huStyle & 0x200) names.push('豪七对');
        else if (huStyle & 0x100) names.push('豪七对');
        else if (huStyle & 0x080) names.push('七小对');
        // 特殊牌型（十三系列互斥）
        if (huStyle & 0x1000) names.push('十三烂');
        else if (huStyle & 0x800) names.push('十三幺');
        // 花色牌型（互斥）
        if (huStyle & 0x040) names.push('字一色');
        else if (huStyle & 0x020) names.push('清一色');
        // 基础牌型（碰碰胡包含PingHu位）
        if (huStyle & 0x010) names.push('碰碰胡');
        // PingHu子类型（互斥，仅在没有碰碰胡/七小对时显示）
        else if (huStyle & 0x002) names.push('单吊');
        else if (huStyle & 0x004) names.push('边张');
        else if (huStyle & 0x008) names.push('卡张');
        else if (huStyle & 0x001) names.push('平胡');
        return names;
    }

    /** 解析 huWays 位掩码返回加番名称列表（对照 MahjongGenre.h HuWay 枚举） */
    protected parseHuWayNames(huWay: number): string[] {
        const names: string[] = [];
        // 桃江特有（高位优先）
        if (huWay & 0x01000000) names.push('天天胡');
        if (huWay & 0x00800000) names.push('报听');
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

    protected showSettlementUI(msg: any, isLastRound: boolean = false): void {
        this.hideSettlementUI();
        const overlay = this.createPopupOverlay('SettlementOverlay', 999, 176);

        const data = msg.data || {};
        const isHu = !!data.hu;
        const seatCount = this.getSeatCount();

        // 计算胡牌玩家信息
        let huPlayerSeat = -1;
        let huStyleNames: string[] = [];
        let huWayNames: string[] = [];
        let isYingZhuang = false;
        for (let i = 0; i < seatCount; i++) {
            if (data.huStyles && data.huStyles[i]) {
                huPlayerSeat = i;
                huStyleNames = this.parseHuStyleNames(data.huStyles[i]);
                huWayNames = this.parseHuWayNames(data.huWays[i] || 0);
                if (msg.yingZhuang && msg.yingZhuang[i]) isYingZhuang = true;
                break;
            }
        }

        // 增大面板高度：标题(~75) + 徽章(42+16) + 胡牌样式(78+20) + 玩家行(N*96) + 按钮区(60) + 底部padding(30)
        const playerRows = seatCount;
        const panelHeight = isHu ? (75 + 58 + 98 + playerRows * 96 + 60 + 30) : (75 + 58 + playerRows * 96 + 60 + 30);
        const panel = this.createPopupPanel(
            overlay,
            'SettlementPanel',
            740,
            panelHeight,
            isHu ? '本局结算' : '本局流局',
            isLastRound ? '全部对局结束，即将自动解散' : (isHu ? '桃江麻将战绩回顾' : '本局无人胡牌，等待下一轮'),
        );

        const titleBarBottom = panelHeight / 2 - 48 - 33;
        let cursorY = titleBarBottom - 12;

        // --- 结果徽章 ---
        const badge = this.createUIChild(panel, 'ResultBadge', 160, 38, 0, cursorY - 19, 1);
        this.paintRect(badge, 160, 38, isHu ? new Color(171, 74, 30, 230) : new Color(63, 90, 124, 230), new Color(255, 214, 132, 255), 16);
        const badgeLabel = badge.addComponent(Label);
        badgeLabel.string = isHu ? '胡牌结果' : '本局流局';
        badgeLabel.fontSize = 20;
        badgeLabel.lineHeight = 24;
        badgeLabel.horizontalAlign = 1;
        badgeLabel.verticalAlign = 1;
        badgeLabel.color = new Color(255, 245, 223, 255);
        cursorY = cursorY - 38 - 14;

        // --- 胡牌样式卡片 ---
        if (isHu) {
            const styleCard = this.createUIChild(panel, 'StyleCard', 660, 78, 0, cursorY - 39, 1);
            this.paintRect(styleCard, 660, 78, new Color(25, 38, 55, 220), new Color(218, 170, 80, 255), 14);
            const styleLabel = styleCard.addComponent(Label);
            const yingStr = isYingZhuang ? '(硬庄)' : '';
            const styleStr = huStyleNames.length > 0 ? huStyleNames.join(' · ') : '平胡';
            const wayStr = huWayNames.length > 0 ? `  |  ${huWayNames.join(' · ')}` : '';
            styleLabel.string = `${styleStr}${yingStr}${wayStr}`;
            styleLabel.fontSize = 26;
            styleLabel.lineHeight = 32;
            styleLabel.overflow = Label.Overflow.SHRINK;
            styleLabel.horizontalAlign = 1;
            styleLabel.verticalAlign = 1;
            // 更亮的颜色确保可读性
            styleLabel.color = new Color(255, 235, 180, 255);
            cursorY = cursorY - 78 - 20;
        }

        // --- 分隔线 ---
        const sepLine = this.createUIChild(panel, 'SepLine', 660, 1, 0, cursorY, 1);
        const sepGfx = sepLine.addComponent(Graphics);
        sepGfx.strokeColor = new Color(100, 130, 160, 120);
        sepGfx.lineWidth = 1;
        sepGfx.moveTo(-330, 0);
        sepGfx.lineTo(330, 0);
        sepGfx.stroke();
        cursorY = cursorY - 16;

        // --- 玩家结算行 ---
        const golds = msg.golds || [];
        const winGolds = msg.winGolds || [];
        const scores = data.scores || [];
        const rowH = 84;
        const rowGap = 12;
        const startY = cursorY - rowH / 2;
        for (let i = 0; i < seatCount; i++) {
            const serverSeat = this.client2ServerSeat(i);
            if (!this.playerInfos[serverSeat]) continue;
            const nickname = this.playerInfos[serverSeat].nickname || ('玩家' + i);
            const winGold = winGolds[serverSeat] || 0;
            const score = scores[serverSeat] || 0;
            const isPositive = winGold > 0;
            const isWinner = (serverSeat === huPlayerSeat);
            const rowY = startY - i * (rowH + rowGap);

            const row = this.createUIChild(panel, `PlayerRow${i}`, 660, rowH, 0, rowY, 1);
            this.paintRect(
                row,
                660,
                rowH,
                isWinner ? new Color(80, 58, 20, 230) : new Color(20, 30, 45, 210),
                isWinner ? new Color(255, 200, 100, 255) : new Color(70, 100, 140, 200),
                16,
            );

            // 左侧：昵称 + 庄标记
            const nameNode = this.createUIChild(row, 'Name', 240, 32, -195, 16, 1);
            const nameLabel = nameNode.addComponent(Label);
            nameLabel.string = `${isWinner ? '赢家  ' : ''}${nickname}${serverSeat === this.bankerSeat ? ' [庄]' : ''}`;
            nameLabel.fontSize = 24;
            nameLabel.lineHeight = 28;
            nameLabel.overflow = Label.Overflow.SHRINK;
            nameLabel.horizontalAlign = 0;
            nameLabel.color = isWinner ? new Color(255, 225, 150, 255) : new Color(220, 230, 245, 255);

            // 右侧：番分 / 金币变化 / 余额 —— 分两行显示更清晰
            const scoreNode = this.createUIChild(row, 'ScoreInfo', 600, 26, 0, 8, 1);
            const scoreLabel = scoreNode.addComponent(Label);
            scoreLabel.fontSize = 21;
            scoreLabel.lineHeight = 26;
            scoreLabel.horizontalAlign = 1;
            scoreLabel.overflow = Label.Overflow.SHRINK;
            scoreLabel.string = `番分 ${score >= 0 ? '+' : ''}${score}   金币 ${winGold >= 0 ? '+' : ''}${winGold}`;
            scoreLabel.color = isPositive ? new Color(130, 235, 160, 255) : new Color(255, 140, 140, 255);

            const goldNode = this.createUIChild(row, 'GoldInfo', 300, 22, 140, -18, 1);
            const goldLabel = goldNode.addComponent(Label);
            goldLabel.fontSize = 17;
            goldLabel.lineHeight = 20;
            goldLabel.horizontalAlign = 2; // right align
            goldLabel.overflow = Label.Overflow.SHRINK;
            goldLabel.string = `余额 ${golds[serverSeat] || 0}`;
            goldLabel.color = new Color(170, 185, 205, 255);
        }

        // --- 底部按钮区 ---
        const btnAreaTop = startY - seatCount * (rowH + rowGap) - 20;
        this.createPopupButton(
            panel,
            isLastRound ? '确认' : '继续',
            0,
            -panelHeight / 2 + 44,
            178,
            new Color(46, 128, 88, 255),
            new Color(133, 231, 174, 255),
            () => {
                this.hideSettlementUI();
                if (!isLastRound) {
                    this.onReadyClick();
                    this.updateReadyButtonState();
                    this.updateFanSummary('已准备，等待下一局');
                }
            },
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
        // 阻止点击穿透到下层 UI（如返回按钮）
        mask.addComponent(BlockInputEvents);
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
        // 多行展示：每行最多8张，自动换行
        const tilesPerRow = 8;
        const tileSpacing = 38;
        const rowSpacing = 44;
        const startX = -145;

        for (let idx = 0; idx < tingTiles.length; idx++) {
            const t = tingTiles[idx];
            const row = Math.floor(idx / tilesPerRow);
            const col = idx % tilesPerRow;
            const tileNode = this.createTileNodeForSeat(t, 3, false);
            tileNode.setScale(0.7, 0.7, 1);
            tileNode.parent = this.tingTilesRoot;
            tileNode.setPosition(startX + col * tileSpacing, -row * rowSpacing, 0);
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

    // ==================== 骰子动画 + 明子/赖子牌展示 ====================

    /** 隐藏赖子展示动画节点 */
    protected hideLaiziReveal(): void {
        this.laiziRevealTimer = 0;
        this.unschedule(this.onDiceRollTick);
        if (this.laiziRevealNode) {
            this.laiziRevealNode.destroy();
            this.laiziRevealNode = null;
        }
        this.diceLabel = null;
        this.mingZiTileDisplayNode = null;
        this.laiziTileDisplayNode = null;
    }

    /** 显示骰子滚动 + 明子/赖子翻牌动画 */
    protected showLaiziRevealAnimation(): void {
        this.hideLaiziReveal();

        // 创建容器节点（屏幕中央偏上）
        this.laiziRevealNode = this.createUIChild(this.node, 'LaiziReveal', 400, 260, 0, 120, 200);
        this.paintRect(this.laiziRevealNode, 400, 260, new Color(20, 25, 40, 220), new Color(238, 198, 116, 255), 18);

        // 标题
        const titleNode = this.createUIChild(this.laiziRevealNode, 'Title', 300, 30, 0, 90, 1);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = '赖子翻牌';
        titleLabel.fontSize = 24;
        titleLabel.lineHeight = 28;
        titleLabel.horizontalAlign = 1;
        titleLabel.color = new Color(255, 236, 198, 255);

        // 骰子区域（一个圆形背景 + 数字）
        const diceBg = this.createUIChild(this.laiziRevealNode, 'DiceBg', 80, 80, 0, 20, 2);
        this.paintRect(diceBg, 80, 80, new Color(200, 50, 50, 255), new Color(255, 220, 180, 255), 12);
        this.diceLabel = diceBg.addComponent(Label);
        this.diceLabel.string = '?';
        this.diceLabel.fontSize = 48;
        this.diceLabel.lineHeight = 52;
        this.diceLabel.horizontalAlign = 1;
        this.diceLabel.verticalAlign = 1;
        this.diceLabel.color = new Color(255, 255, 255, 255);

        // 明子占位（左侧）
        this.mingZiTileDisplayNode = this.createUIChild(this.laiziRevealNode, 'MingZiSlot', 80, 110, -100, -60, 3);
        const mingZiBg = this.createUIChild(this.mingZiTileDisplayNode, 'Bg', 80, 110, 0, 0, 0);
        this.paintRect(mingZiBg, 80, 110, new Color(60, 70, 90, 180), new Color(150, 160, 180, 200), 10);
        const mingZiTitle = this.createUIChild(this.mingZiTileDisplayNode, 'Title', 80, 20, 0, 64, 1);
        const mingZiTitleLabel = mingZiTitle.addComponent(Label);
        mingZiTitleLabel.string = '明子';
        mingZiTitleLabel.fontSize = 16;
        mingZiTitleLabel.lineHeight = 18;
        mingZiTitleLabel.horizontalAlign = 1;
        mingZiTitleLabel.color = new Color(188, 205, 225, 255);

        // 赖子占位（右侧）
        this.laiziTileDisplayNode = this.createUIChild(this.laiziRevealNode, 'LaiziSlot', 80, 110, 100, -60, 3);
        const laiziBg = this.createUIChild(this.laiziTileDisplayNode, 'Bg', 80, 110, 0, 0, 0);
        this.paintRect(laiziBg, 80, 110, new Color(60, 70, 90, 180), new Color(255, 200, 80, 200), 10);
        const laiziTitle = this.createUIChild(this.laiziTileDisplayNode, 'Title', 80, 20, 0, 64, 1);
        const laiziTitleLabel = laiziTitle.addComponent(Label);
        laiziTitleLabel.string = '赖子';
        laiziTitleLabel.fontSize = 16;
        laiziTitleLabel.lineHeight = 18;
        laiziTitleLabel.horizontalAlign = 1;
        laiziTitleLabel.color = new Color(255, 220, 100, 255);

        // 初始隐藏牌面，只显示占位
        this.mingZiTileDisplayNode.active = false;
        this.laiziTileDisplayNode.active = false;

        // 阻挡点击
        const blockInput = new Node('__block__');
        blockInput.parent = this.laiziRevealNode;
        blockInput.layer = 1 << 25;
        blockInput.addComponent(BlockInputEvents);
        const blockTransform = blockInput.addComponent(UITransform);
        blockTransform.setContentSize(400, 260);

        this.laiziRevealNode.active = true;

        // 骰子滚动动画：快速切换数字 1.5 秒
        const finalDice = this.dicePoint;
        const finalDiceText = finalDice > 0 ? String(finalDice) : '?';
        const rollInterval = 0.08; // 每 80ms 切换一次
        const totalRollTime = 1.5;
        this._diceRollTarget = Math.floor(totalRollTime / rollInterval);
        this._diceRollCount = 0;

        const rollAction = tween(this.diceLabel!.node)
            .delay(totalRollTime)
            .call(() => {
                // 停止骰子滚动
                this.unschedule(this.onDiceRollTick);
                // 骰子停止，显示最终点数
                if (this.diceLabel) {
                    this.diceLabel.string = finalDiceText;
                }
                // 骰子停止后 0.3 秒，显示明子和赖子牌
                this.scheduleOnce(() => {
                    this.revealMingZiAndLaiziTiles();
                }, 0.3);
            });

        // 使用 schedule 驱动骰子滚动
        this.unschedule(this.onDiceRollTick);
        this.schedule(this.onDiceRollTick, rollInterval);

        rollAction.start();

        // 4秒后自动隐藏
        this.laiziRevealTimer = 4.0;
    }

    /** 骰子滚动 tick */
    private onDiceRollTick(dt?: number): void {
        this._diceRollCount++;
        if (this.diceLabel && this._diceRollCount < this._diceRollTarget) {
            this.diceLabel.string = String((this._diceRollCount % 6) + 1);
        }
    }

    /** 翻开明子和赖子牌 */
    protected revealMingZiAndLaiziTiles(): void {
        const showOne = (node: Node | null, tile: MahjongTile | null, prefix: string, delay: number) => {
            if (!node || !tile) return;
            this.createRevealTileNode(node, tile, prefix);
            this.scheduleOnce(() => {
                if (!node || !node.isValid) return;
                node.active = true;
                node.setScale(0, 0);
                tween(node)
                    .to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                    .start();
            }, delay);
        };

        showOne(this.mingZiTileDisplayNode, this.mingZiTile, 'M', 0);
        showOne(this.laiziTileDisplayNode, this.laiziTile, 'L', 0.3);
    }

    /** 创建展示用的牌面节点（使用 graphics 文字回退方式） */
    protected createRevealTileNode(parent: Node, tile: MahjongTile, prefix: string): void {
        // 移除旧的牌面
        const oldTile = parent.getChildByName('TileFace');
        if (oldTile) oldTile.destroy();

        const tw = 72;
        const th = 100;

        // 尝试使用图集渲染
        const atlas = this.legacyAtlases.get('my') || null;
        const spriteName = this.getLegacyTileSpriteName(tile);
        let frame: SpriteFrame | null = null;
        if (atlas && spriteName) {
            frame = atlas.getSpriteFrame(prefix + spriteName);
        }

        const tileNode = this.createUIChild(parent, 'TileFace', tw, th, 0, -4, 5);

        if (frame) {
            // 使用图集精灵
            const sprite = tileNode.addComponent(Sprite);
            sprite.spriteFrame = frame;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        } else {
            // 文字回退：画一个牌面背景 + 文字
            const bgColor = new Color(250, 240, 220, 255);
            this.paintRect(tileNode, tw, th, bgColor, new Color(180, 160, 140, 255), 8);

            const labelNode = this.createUIChild(tileNode, 'TileLabel', tw - 10, th - 10, 0, 0, 1);
            const tileLabel = labelNode.addComponent(Label);
            tileLabel.string = tileDisplayText(tile);
            tileLabel.fontSize = 22;
            tileLabel.lineHeight = 26;
            tileLabel.horizontalAlign = 1;
            tileLabel.verticalAlign = 1;
            tileLabel.color = tile.tile.pattern === 3
                ? new Color(200, 30, 30, 255)
                : new Color(40, 40, 40, 255);
        }
    }

    /** update 中处理自动隐藏 */
    update(dt: number): void {
        if (this.laiziRevealTimer > 0 && this.laiziRevealNode && this.laiziRevealNode.active) {
            this.laiziRevealTimer -= dt;
            if (this.laiziRevealTimer <= 0) {
                // 淡出动画
                this.unschedule(this.onDiceRollTick);
                const opacity = this.laiziRevealNode.getComponent(UIOpacity)
                    || this.laiziRevealNode.addComponent(UIOpacity);
                opacity.opacity = 255;
                tween(opacity)
                    .to(0.5, { opacity: 0 })
                    .call(() => { this.hideLaiziReveal(); })
                    .start();
            }
        }
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        this.opponentHandCount = 0;
        this.hideSettlementUI();
        this.hideDisbandVoteUI();
        this.totalFans = 0;
        this.hideTingHint();
        this.hideLaiziReveal();
        this.hideLaiziHint();
        // 清除上一局赖子相关UI状态（不重置 laiziTile 等数据，由 onTJStartRound 重新设置）
        this.laiziTile = null;
        this.mingZiTile = null;
        this.dicePoint = 0;
        this.laiziEnabled = false;
        // 报听状态由 onTJStartRound 统一清除
        this.baoTinged = [false, false, false, false];
        this.bankerSeat = -1;
        this.refreshTaojiangHud();
    }
}
