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

import { _decorator, Component, Node, Label, Graphics, Color, Button, UITransform, Color as CcColor } from 'cc';
import { MahjongRoomBase, MahjongTile, AvailableActions, MahjongActionOption, MahjongActionType, tileDisplayText } from '../../GameCommon/MahjongRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../../GameCommon/GameTypes';
import { GameState } from '../../GameCommon/RoomBase';
import { NetworkManager } from '../../Manager/NetworkManager';
import { Client } from '../../Game/Client';

const { ccclass, property } = _decorator;

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

    protected totalFans: number = 0;
    protected opponentHandCount: number = 0;
    protected settlementNode: Node | null = null;
    protected disbandVoteNode: Node | null = null;

    // ==================== 消息前缀覆写 ====================

    protected get mjMsgPrefix(): string { return "MsgTJ"; }

    // ==================== 初始化 ====================

    start(): void {
        this.syncMsgPrefix = "MsgTJ";
        super.start();
        this.gameId = 'taojiang_mahjong';
    }

    protected getSeatCount(): number { return 2; }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        console.log('[TaojiangRoom] Initialized');
    }

    /** 同步后 UI 更新 */
    protected onSyncGameUIUpdate(isSitting: boolean): void {
        super.onSyncGameUIUpdate(isSitting);
        this.hideTingHint();
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
    }

    /** 结算 */
    protected onTJSettlement(msg: any): void {
        console.log('[TaojiangRoom] Settlement:', msg);
        this.gameState = GameState.Waiting;
        this.stopCountdown();
        this.hideActionPanel();
        this.hideDisbandVoteUI();

        // 显示结算弹窗
        this.showSettlementUI(msg);

        // 被踢出房间（金币不足）
        if (msg.kick) {
            console.log('[TaojiangRoom] Kicked due to insufficient gold');
            this.scheduleOnce(() => this.exitRoom(), 3);
        }

        this.handleRoundSettlement(msg);
        this.updateReadyButtonState();
    }

    /** 解散投票 */
    protected onTJDisbandVote(msg: any): void {
        console.log('[TaojiangRoom] Disband vote:', msg);
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
            console.log(`[TaojiangRoom] Dealt ${parsedTiles.length} tiles, first display: ${tileDisplayText(parsedTiles[0])}`);
        } else {
            console.warn('[TaojiangRoom] onServerDealTiles: tiles is empty, msg keys:', Object.keys(msg));
        }
    }

    /** 解析服务端传来的牌数据，兼容多种格式 */
    protected parseMahjongTile(raw: any): MahjongTile {
        if (!raw) return { id: 0, tile: { pattern: 0, number: 0 } };
        // 格式1: {id, tile: {pattern, number}}
        if (raw.tile && typeof raw.tile.pattern === 'number') {
            return { id: raw.id || 0, tile: { pattern: raw.tile.pattern, number: raw.tile.number } };
        }
        // 格式2: {id, pattern, number}（扁平格式）
        if (typeof raw.pattern === 'number' && typeof raw.number === 'number') {
            return { id: raw.id || 0, tile: { pattern: raw.pattern, number: raw.number } };
        }
        // 格式3: msgpack array 解码后可能是 {0: id, 1: {0: pattern, 1: number}}
        if (Array.isArray(raw)) {
            return { id: raw[0] || 0, tile: { pattern: raw[1] || 0, number: raw[2] || 0 } };
        }
        // 未知格式，尝试提取
        console.warn('[TaojiangRoom] Unknown tile format:', JSON.stringify(raw));
        return { id: raw.id || 0, tile: { pattern: raw.tile?.pattern || 0, number: raw.tile?.number || 0 } };
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
            this.renderOpponentHand(this.opponentHandCount);
        }
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
        console.log(`[TaojiangRoom] Action options: ${options.length}, hasPlay=${hasPlay}, timeout: ${timeout}`);
    }

    /** 服务端出牌通知 */
    protected onServerPlayTile(msg: any): void {
        const serverSeat = msg.actor;
        const clientSeat = this.server2ClientSeat(serverSeat);
        const tile = this.parseMahjongTile(msg.tile);

        // 将出的牌添加到对应出牌区
        this.addDiscardToDisplay(clientSeat, tile);
        let discards = this.discardRecords.get(clientSeat) || [];
        discards.push(tile);
        this.discardRecords.set(clientSeat, discards);

        // 如果是自己的出牌通知（包含手牌），更新手牌显示
        if (serverSeat === this.seat && msg.handTiles) {
            this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
            this.sortHandTiles();
            this.renderMyHand();
        }

        // 如果是对手出牌，停止对手倒计时
        if (clientSeat !== 0) {
            this.stopCountdown();
        }

        this.playDiscardSound();
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

        // 显示副露
        const isAnGang = (msg.chapter === 5); // AnGang
        const meldTiles: MahjongTile[][] = msg.chapters ? msg.chapters[clientSeat] : [];
        this.showMeldGang(clientSeat, meldTiles, isAnGang);
        this.playGangSound();
        console.log(`[TaojiangRoom] Player ${actorSeat} gang, chapter: ${msg.chapter}`);
    }

    /** 服务端碰/吃牌通知 */
    protected onServerPengChiTile(msg: any): void {
        const actorSeat = msg.actor;
        const clientSeat = this.server2ClientSeat(actorSeat);
        const isPeng = msg.pengOrChi; // true=Peng, false=Chi
        const tiles: MahjongTile[] = msg.tiles || [];

        // 更新自己的手牌
        if (actorSeat === this.seat && msg.handTiles) {
            this.myHandTiles = msg.handTiles.map((t: any) => this.parseMahjongTile(t));
            this.sortHandTiles();
            this.renderMyHand();
        }

        // 更新对手手牌数
        if (actorSeat !== this.seat && msg.tileNums !== undefined) {
            this.opponentHandCount = msg.tileNums;
            this.renderOpponentHand(this.opponentHandCount);
        }

        // 显示副露
        const fromSeat = this.server2ClientSeat(msg.player);
        this.showMeldPeng(clientSeat, tiles, fromSeat);
        if (isPeng) this.playPengSound();
        else console.log(`[TaojiangRoom] Player ${actorSeat} chi`);
    }

    /** 服务端听牌通知 */
    protected onServerTingTile(msg: any): void {
        // msg.tiles = 可以胡的牌列表
        const tingTiles: MahjongTile[] = msg.tiles || [];
        if (tingTiles.length > 0) {
            this.showTingHint(tingTiles);
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
            this.hideActionPanel();
            console.log('[TaojiangRoom] My turn (actor)');
        } else {
            this.isMyTurn = false;
            this.startOtherCountdown(15);
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
        this.updateDisbandVoteUI(msg);
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

    /** 覆写：根据 server seat 获取手牌区 */
    protected getHandAreaBySeat(serverSeat: number): Node | null {
        const clientSeat = this.server2ClientSeat(serverSeat);
        if (clientSeat === 0) return this.myHandArea;
        if (clientSeat === 1) return this.topHandArea;
        return null;
    }

    /** 覆写：根据 server seat 获取出牌区 */
    protected getDiscardAreaBySeat(serverSeat: number): Node | null {
        const clientSeat = this.server2ClientSeat(serverSeat);
        if (clientSeat === 0) return this.myDiscardArea;
        if (clientSeat === 1) return this.topDiscardArea;
        return null;
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
        const overlay = new Node('SettlementOverlay');
        overlay.parent = this.node;
        overlay.layer = 1 << 25;

        const ot = overlay.addComponent(UITransform);
        ot.setContentSize(1920, 1080);
        overlay.setPosition(0, 0, 0);
        overlay.setSiblingIndex(999);

        // 遮罩
        const mask = new Node('Mask');
        mask.parent = overlay;
        mask.addComponent(UITransform).setContentSize(1920, 1080);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 160);
        mg.roundRect(-960, -540, 1920, 1080, 0);
        mg.fill();

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

        // 面板
        const panelHeight = 180 + seatCount * 50 + (isHu ? 50 : 0);
        const panel = new Node('Panel');
        panel.parent = overlay;
        panel.addComponent(UITransform).setContentSize(640, panelHeight);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(40, 60, 90, 255);
        pg.roundRect(-320, -panelHeight / 2, 640, panelHeight, 12);
        pg.fill();

        let y = panelHeight / 2 - 40;

        // 标题
        const titleNode = new Node('Title');
        titleNode.parent = panel;
        titleNode.addComponent(UITransform).setContentSize(600, 40);
        titleNode.setPosition(0, y, 0);
        const title = titleNode.addComponent(Label);
        title.string = isHu ? '本局胡牌' : '流局';
        title.fontSize = 32;
        title.lineHeight = 40;
        title.color = new Color(255, 220, 100, 255);
        title.isBold = true;
        title.horizontalAlign = 1;
        title.verticalAlign = 1;
        y -= 50;

        // 番型信息（胡牌时显示）
        if (isHu && huStyleNames.length > 0) {
            const styleLine = new Node('StyleLine');
            styleLine.parent = panel;
            styleLine.addComponent(UITransform).setContentSize(600, 30);
            styleLine.setPosition(0, y, 0);
            const styleLabel = styleLine.addComponent(Label);
            const styleStr = huStyleNames.join(' · ');
            const wayStr = huWayNames.length > 0 ? '  ( ' + huWayNames.join(' · ') + ' )' : '';
            styleLabel.string = styleStr + wayStr;
            styleLabel.fontSize = 22;
            styleLabel.lineHeight = 28;
            styleLabel.color = new Color(255, 200, 80, 255);
            styleLabel.horizontalAlign = 1;
            styleLabel.verticalAlign = 1;
            y -= 35;
        }

        // 分割线
        const sep1 = new Node('Sep1');
        sep1.parent = panel;
        sep1.addComponent(UITransform).setContentSize(580, 2);
        sep1.setPosition(0, y, 0);
        const sg1 = sep1.addComponent(Graphics);
        sg1.fillColor = new Color(100, 120, 150, 255);
        sg1.rect(-290, -1, 580, 2);
        sg1.fill();
        y -= 20;

        // 玩家结算详情
        const golds = msg.golds || [];
        const winGolds = msg.winGolds || [];
        const scores = data.scores || [];

        for (let i = 0; i < seatCount; i++) {
            const serverSeat = this.client2ServerSeat(i);
            if (!this.playerInfos[serverSeat]) continue;

            const line = new Node(`Player${i}`);
            line.parent = panel;
            line.addComponent(UITransform).setContentSize(600, 40);
            line.setPosition(0, y, 0);

            const label = line.addComponent(Label);
            const nickname = this.playerInfos[serverSeat].nickname || ('玩家' + i);
            const winGold = winGolds[serverSeat] || 0;
            const score = scores[serverSeat] || 0;
            const isPositive = winGold > 0;
            const isWinner = (serverSeat === huPlayerSeat);

            let text = `${isWinner ? '🏆 ' : ''}${nickname}:`;
            if (score > 0) text += `  分数${score}`;
            text += `  ${isPositive ? '+' : ''}${winGold}金币`;
            text += `  余额${golds[serverSeat] || 0}`;

            label.string = text;
            label.fontSize = 22;
            label.lineHeight = 28;
            label.color = isPositive ? new Color(100, 255, 100, 255) : new Color(255, 150, 150, 255);
            label.horizontalAlign = 1;
            label.verticalAlign = 1;
            y -= 45;
        }

        // 确定按钮
        const btnNode = new Node('OkBtn');
        btnNode.parent = panel;
        btnNode.addComponent(UITransform).setContentSize(160, 50);
        btnNode.setPosition(0, -panelHeight / 2 + 35, 0);
        const bg = btnNode.addComponent(Graphics);
        bg.fillColor = new Color(46, 139, 87, 255);
        bg.roundRect(-80, -25, 160, 50, 8);
        bg.fill();
        const btnLabel = new Node('Label');
        btnLabel.parent = btnNode;
        btnLabel.addComponent(UITransform).setContentSize(140, 40);
        const bl = btnLabel.addComponent(Label);
        bl.string = '确定';
        bl.fontSize = 24;
        bl.lineHeight = 30;
        bl.color = new Color(255, 255, 255, 255);
        bl.horizontalAlign = 1;
        bl.verticalAlign = 1;
        btnNode.on(Node.EventType.TOUCH_END, () => this.hideSettlementUI(), this);

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
        const overlay = new Node('DisbandVoteOverlay');
        overlay.parent = this.node;
        overlay.layer = 1 << 25;

        const ot = overlay.addComponent(UITransform);
        ot.setContentSize(1920, 1080);
        overlay.setPosition(0, 0, 0);
        overlay.setSiblingIndex(998);

        // 遮罩
        const mask = new Node('Mask');
        mask.parent = overlay;
        mask.addComponent(UITransform).setContentSize(1920, 1080);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 120);
        mg.roundRect(-960, -540, 1920, 1080, 0);
        mg.fill();

        // 面板
        const panel = new Node('Panel');
        panel.parent = overlay;
        panel.addComponent(UITransform).setContentSize(500, 250);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(60, 40, 40, 255);
        pg.roundRect(-250, -125, 500, 250, 12);
        pg.fill();

        // 标题
        const titleNode = new Node('Title');
        titleNode.parent = panel;
        titleNode.addComponent(UITransform).setContentSize(460, 40);
        titleNode.setPosition(0, 90, 0);
        const title = titleNode.addComponent(Label);
        title.string = '解散投票';
        title.fontSize = 28;
        title.color = new Color(255, 200, 200, 255);
        title.isBold = true;
        title.horizontalAlign = 1;
        title.verticalAlign = 1;

        // 发起者
        const disbanderSeat = msg.disbander;
        const disbanderInfo = this.playerInfos[disbanderSeat];
        const initiatorNode = new Node('Initiator');
        initiatorNode.parent = panel;
        initiatorNode.addComponent(UITransform).setContentSize(460, 30);
        initiatorNode.setPosition(0, 55, 0);
        const initiator = initiatorNode.addComponent(Label);
        initiator.string = `${disbanderInfo?.nickname || '玩家'} 发起了解散投票`;
        initiator.fontSize = 20;
        initiator.color = new Color(200, 200, 200, 255);
        initiator.horizontalAlign = 1;
        initiator.verticalAlign = 1;

        // 投票状态
        const votesNode = new Node('Votes');
        votesNode.parent = panel;
        votesNode.addComponent(UITransform).setContentSize(460, 60);
        votesNode.setPosition(0, 0, 0);
        this._disbandVotesNode = votesNode;

        const choices = msg.choices || [];
        let voteText = '';
        const seatCount = this.getSeatCount();
        for (let i = 0; i < seatCount; i++) {
            const info = this.playerInfos[i];
            if (!info) continue;
            const choice = choices[i] || 0;
            const choiceText = choice === 1 ? '同意' : (choice === 2 ? '拒绝' : '等待中...');
            voteText += `${info.nickname}: ${choiceText}\n`;
        }
        const votesLabel = votesNode.addComponent(Label);
        votesLabel.string = voteText.trim();
        votesLabel.fontSize = 20;
        votesLabel.lineHeight = 26;
        votesLabel.color = new Color(220, 220, 220, 255);

        // 按钮
        this.createPopupButton(panel, '同意', -50, new Color(46, 139, 87, 255), () => {
            NetworkManager.Instance.sendInnerMessage("MsgDisbandChoose", { choice: 1 });
        }, -80);
        this.createPopupButton(panel, '拒绝', -50, new Color(160, 82, 45, 255), () => {
            NetworkManager.Instance.sendInnerMessage("MsgDisbandChoose", { choice: 2 });
        }, 80);

        this.disbandVoteNode = overlay;
    }

    protected _disbandVotesNode: Node | null = null;

    protected updateDisbandVoteUI(msg: any): void {
        if (!this._disbandVotesNode) return;
        const choices = msg.choices || [];
        let voteText = '';
        const seatCount = this.getSeatCount();
        for (let i = 0; i < seatCount; i++) {
            const info = this.playerInfos[i];
            if (!info) continue;
            const choice = choices[i] || 0;
            const choiceText = choice === 1 ? '同意' : (choice === 2 ? '拒绝' : '等待中...');
            voteText += `${info.nickname}: ${choiceText}\n`;
        }
        const label = this._disbandVotesNode.getComponent(Label);
        if (label) label.string = voteText.trim();
    }

    protected hideDisbandVoteUI(): void {
        if (this.disbandVoteNode) {
            this.disbandVoteNode.destroy();
            this.disbandVoteNode = null;
        }
        this._disbandVotesNode = null;
    }

    /** 创建弹窗按钮 */
    private createPopupButton(parent: Node, text: string, y: number, color: Color, handler: () => void, offsetX: number): void {
        const btnNode = new Node(text);
        btnNode.parent = parent;
        btnNode.addComponent(UITransform).setContentSize(120, 44);
        btnNode.setPosition(offsetX, y, 0);

        const g = btnNode.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-60, -22, 120, 44, 8);
        g.fill();

        const labelNode = new Node('Label');
        labelNode.parent = btnNode;
        labelNode.addComponent(UITransform).setContentSize(110, 34);
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
        const node = new Node('TingHint');
        node.parent = this.node;
        node.layer = 1 << 25;
        node.setSiblingIndex(997);

        const ot = node.addComponent(UITransform);
        ot.setContentSize(600, 90);
        node.setPosition(0, -300, 0);

        const g = node.addComponent(Graphics);
        g.fillColor = new Color(0, 0, 0, 180);
        g.roundRect(-300, -45, 600, 90, 8);
        g.fill();

        const title = new Node('Title');
        title.parent = node;
        title.addComponent(UITransform).setContentSize(200, 30);
        title.setPosition(-230, 20, 0);
        const tl = title.addComponent(Label);
        tl.string = '可胡:';
        tl.fontSize = 20;
        tl.color = new Color(255, 220, 100, 255);
        tl.horizontalAlign = 0;

        let startX = -120;
        for (const t of tingTiles.slice(0, 12)) {
            const tileNode = this.createTileNode(t, false);
            tileNode.setScale(0.5, 0.5, 1);
            tileNode.parent = node;
            tileNode.setPosition(startX, 0, 0);
            startX += 32;
        }

        this.scheduleOnce(() => node.destroy(), 5);
    }

    public hideTingHint(): void {
        // tingHint is managed by scheduleOnce auto-destroy now
    }

    // ==================== 音效桩 ====================

    protected playDiscardSound(): void { console.log('[TaojiangRoom] Sound: discard'); }
    protected playHuSound(_isSelf: boolean): void { console.log('[TaojiangRoom] Sound: hu'); }
    protected playPengSound(): void { console.log('[TaojiangRoom] Sound: peng'); }
    protected playGangSound(): void { console.log('[TaojiangRoom] Sound: gang'); }
    protected playErrorSound(): void { console.log('[TaojiangRoom] Sound: error'); }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        this.opponentHandCount = 0;
        this.hideSettlementUI();
        this.hideDisbandVoteUI();
        this.totalFans = 0;
    }
}
