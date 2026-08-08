/**
 * 通用房间基类 (RoomBase) - v2 完整版
 *
 * 所有游戏的统一基类，集成：
 * - NetMsgHandler / ConnectionHandler 协议模式（与 GuanDan 一致）
 * - NetworkManager WebSocket 通信
 * - GameManager HTTP API 调用
 * - 资源加载（复用 GuanDan Bundle 作为默认资源）
 * - 完整的房间生命周期管理
 * - 座位/玩家/倒计时/托管/解散投票
 * - 断线重连同步
 *
 * 适用游戏：桃江麻将、红中麻将、长沙麻将、跑得快、千分、歪胡子
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, Prefab, instantiate, director, Sprite, SpriteFrame, Event, Button, EventHandler, js } from 'cc';
import { NetMsgHandler, NetMsgManager } from '../Manager/NetMsgManager';
import { ConnectionHandler, NetworkManager } from '../Manager/NetworkManager';
import { GameManager } from '../Manager/GameManager';
import { Client } from '../Game/Client';
import { CommonUtils } from '../Utils/CommonUtils';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { GameRoomApi } from '../Network/GameRoomApi';
import { RoomState, PlayerRoomState, SeatPosition, RoomPlayerInfo, RoomInfo, RoundSettlementData, FinalSettlementData, CreateRoomOptions } from './GameTypes';

const { ccclass, property } = _decorator;

// ==================== 房间级别枚举 ====================

/** 房间级别 */
export enum RoomLevel {
    Invalid = 0,
    Friend = 1,       // 好友房
    Practice = 2,     // 练习房
    Beginner = 3,     // 初级房
    Moderate = 4,     // 中级房
    Advanced = 5,     // 高级房
    Master = 6,       // 大师房
}

/** 游戏状态 */
export enum GameState {
    Sitting = 0,       // 等待入座
    Waiting = 1,       // 等待开始
    Dealing = 2,       // 发牌中
    Playing = 3,       // 游戏进行中
}

// ==================== 事件回调类型 ====================

export interface RoomEventCallbacks {
    onRoomStateChanged?: (state: RoomState) => void;
    onPlayerJoined?: (player: RoomPlayerInfo) => void;
    onPlayerLeft?: (playerId: string) => void;
    onPlayerReadyChanged?: (playerId: string, ready: boolean) => void;
    onGameStart?: () => void;
    onRoundSettlement?: (data: RoundSettlementData) => void;
    onFinalSettlement?: (data: FinalSettlementData) => void;
    onDisconnect?: () => void;
    onReconnect?: () => void;
    onRoomDissolved?: () => void;
}

@ccclass('RoomBase')
export class RoomBase extends Component implements NetMsgHandler, ConnectionHandler {
    // ==================== UI 引用 (子类通过 @property 覆写绑定) ====================

    @property({ type: Node })
    protected topBar: Node = null;

    @property({ type: Node })
    protected seatContainer: Node = null;

    @property({ type: Node })
    protected chatButton: Node = null;

    @property({ type: Node })
    protected actionArea: Node = null;

    @property({ type: Node })
    protected disconnectTip: Node = null;

    @property({ type: Node })
    protected trusteePanel: Node = null;

    @property({ type: Node })
    protected dissolvePanel: Node = null;

    @property({ type: Label })
    protected roomNoLabel: Label = null;

    @property({ type: Label })
    protected roundLabel: Label = null;

    @property({ type: Label })
    protected countdownLabel: Label = null;

    // ==================== 内部状态 ====================

    // ---- GuanDan Prefab UI 引用（通过 bindPrefabNodes 程序化绑定） ----

    /** LabelLevel 节点（显示房间号/等级） */
    protected labelLevel: Label | null = null;

    /** 入座层（Sitting 阶段显示） */
    protected seatLayer: Node | null = null;

    /** 桌面层（Playing 阶段显示） */
    protected desktopLayer: Node | null = null;

    /** 桌面 UI 层 */
    protected desktopUILayer: Node | null = null;

    /** SeatPanel 组件数组（按服务端座位索引: East=0, North=1, West=2, South=3） */
    protected seatPanels: any[] = [];

    /** GuanDanPlayer 组件数组（按客户端座位索引: Bottom=0, Left=1, Top=2, Right=3） */
    protected guanDanPlayers: any[] = [];

    /** 准备标记节点（按客户端座位索引） */
    protected readyFlags: Node[] = [];

    /** 开始按钮 */
    protected btnStartGame: Node | null = null;

    /** 准备按钮 */
    protected btnReady: Node | null = null;

    /** 准备按钮文字 */
    protected btnReadyLabel: Label | null = null;

    /** 准备按钮组 */
    protected readyGroup: Node | null = null;

    /** 托管按钮组 */
    protected autoGroup: Node | null = null;

    // ---- 原有内部状态 ----

    /** 当前房间信息 */
    protected roomInfo: RoomInfo | null = null;

    /** 当前局数（如果服务端未下发，则由客户端在开局事件中自增） */
    protected currentRound: number = 0;

    /** 总局数（优先使用服务端下发；缺失时为 0 表示未知） */
    protected totalRounds: number = 0;

    /** 当前房间状态 */
    protected currentState: RoomState = RoomState.Idle;

    /** 房间号 */
    protected roomNumber: string = null;

    /** 房间等级 */
    protected level: number = RoomLevel.Invalid;

    /** 房主座位号 */
    protected ownerSeat: number = 0;

    /** 游戏状态 */
    protected gameState: number = GameState.Sitting;

    /** 本玩家座位号 (-1=未入座/观众) */
    protected seat: number = -1;

    /** 倒计时剩余秒数 */
    protected countdownSeconds: number = 0;

    /** 是否正在倒计时 */
    protected isCountingDown: boolean = false;

    /** 倒计时累计时间 */
    protected countdownElapsed: number = 0;

    /** 是否正在倒计时(自己回合) */
    protected clockFlag: boolean = false;

    /** 自己是否在倒计时 */
    protected clockSelf: boolean = false;

    /** 是否托管中 */
    protected isTrustee: boolean = false;

    /** 事件回调 */
    protected callbacks: RoomEventCallbacks = {};

    /** 游戏ID (子类设置) */
    protected gameId: string = '';

    /** 同步消息名前缀 (子类覆写，如 "MsgTaojiangMahjong") */
    protected syncMsgPrefix: string = 'MsgGame';

    /** 玩家信息列表 */
    protected playerInfos: any[] = [];

    private capitalChangedHandler: (capital: any) => void = (capital: any) => {
        this.onCapitalChanged(capital);
    };

    // ==================== 生命周期 ====================

    onLoad(): void {
        NetMsgManager.Instance.registerHandler(this);
        NetworkManager.Instance.registerHandler(this);
        GameManager.Instance.addCapitalListener(this.capitalChangedHandler);
    }

    onDestroy(): void {
        NetMsgManager.Instance.unregisterHandler(this);
        NetworkManager.Instance.unregisterHandler(this);
        GameManager.Instance.removeCapitalListener(this.capitalChangedHandler);
    }

    start(): void {
        ResourceLoader.Instance.loadAsset("Prompt", "PromptDialog", Prefab, (prefab: Prefab) => {
            if (prefab) Client.Instance.setPromptDialogPrefab(prefab);
        });
        ResourceLoader.Instance.loadAsset("Prompt", "PromptTip", Prefab, (prefab: Prefab) => {
            if (prefab) Client.Instance.setPromptTipPrefab(prefab);
        });

        // 如果 MsgEnterVenueResp 已携带房间快照，先用其初始化 UI；
        // 仍然再请求一次全量同步，确保重连/重新进入时能恢复局内完整状态（如碰/吃/杠副露、手牌数量等）。
        const enterData = GameManager.Instance.EnterVenueData;
        if (enterData) {
            GameManager.Instance.EnterVenueData = null;
            const savedRoomNumber = this.roomNumber;
            this.onEnterVenueData(enterData);
            if (!this.roomNumber && savedRoomNumber) {
                this.roomNumber = savedRoomNumber;
            }
            NetworkManager.Instance.sendInnerMessage(this.syncMsgPrefix + "Sync");
        } else {
            NetworkManager.Instance.sendInnerMessage(this.syncMsgPrefix + "Sync");
        }
    }

    /**
     * 用 MsgEnterVenueResp 携带的房间快照初始化 UI
     * 服务端可能在进房响应中直接返回完整房间数据，无需额外 Sync。
     */
    protected onEnterVenueData(msg: any): void {
        if (!msg) return;
        const roomData = (msg.data && typeof msg.data === 'object') ? msg.data : msg;
        if (roomData.level !== undefined) this.level = roomData.level;
        if (roomData.number !== undefined) this.roomNumber = String(roomData.number);
        if (roomData.currentRound !== undefined) this.currentRound = Number(roomData.currentRound) || 0;
        if (roomData.totalRounds !== undefined) this.totalRounds = Number(roomData.totalRounds) || 0;
        if (roomData.ownerSeat !== undefined) this.ownerSeat = roomData.ownerSeat;
        if (roomData.seat !== undefined) this.seat = roomData.seat;
        // gameState / roundState 兼容处理
        if (roomData.gameState !== undefined) {
            this.gameState = roomData.gameState;
        } else if (roomData.roundState !== undefined) {
            this.gameState = (roomData.roundState === 1) ? GameState.Playing : GameState.Waiting;
        }

        this.updateLevelDisplay();
        this.updateRoomDisplay();

        // 处理进房时带的玩家列表
        if (Array.isArray(roomData.avatars) && roomData.avatars.length > 0) {
            this.onAddAvatar({ avatars: roomData.avatars });
        }

        // 切换 UI 阶段
        const sittingPhase = (this.gameState === GameState.Sitting);
        if (!sittingPhase && this.seat === -1) {
            this.exitRoom();
            return;
        }
        this.onSyncGameUIUpdate(sittingPhase);
        this.updateReadyButtonState();

        console.log(`[RoomBase] EnterVenueData: level=${this.level} room=${this.roomNumber} seat=${this.seat} state=${this.gameState} avatars=${roomData.avatars?.length || 0}`);
    }

    update(deltaTime: number): void {
        this.updateClock(deltaTime);
    }

    // ==================== NetMsgHandler 接口实现 ====================

    /**
     * 消息分发入口（子类覆写以处理各自的消息类型）
     * 返回 true 表示已处理，false 表示不认识此消息
     */
    public onMessage(msgType: string, msg: any): boolean {
        let ret: boolean = true;

        if (msgType === this.syncMsgPrefix + "SyncResp") this.onSyncGame(msg);
        else if (msgType === "MsgAddSpectator") this.onAddSpectator(msg);
        else if (msgType === "MsgAddAvatar") this.onAddAvatar(msg);
        else if (msgType === "MsgRemoveAvatar") this.onRemoveAvatar(msg);
        else if (msgType === "MsgAvatarConnect") this.onAvatarConnect(msg);
        else if (msgType === "MsgRemoveSpectator") this.onRemoveSpectator(msg);
        else if (msgType === "MsgPlayerReadyResp") this.onPlayerReady(msg);
        else if (msgType === "MsgPlayerAuthorizeResp") this.onPlayerAuthorize(msg);
        else if (msgType === "MsgLeaveVenueResp") this.onLeaveVenueResp(msg);
        else if (msgType === "MsgJoinGameResp") this.onJoinGameResp(msg);
        else if (msgType === "MsgBecomeSpectatorResp") this.onBecomeSpectatorResp(msg);
        else if (msgType === "MsgShuffleCardsResp") this.onShuffleCardsResp(msg);
        else if (msgType === "MsgOwnerSeat") this.onOwnerSeat(msg);
        else if (msgType === "MsgSitting") this.onSitting(msg);
        else ret = false;

        return ret;
    }

    // ==================== ConnectionHandler 接口实现 ====================

    public onDisconnect(): void {}

    public onReconnect(): void {
        // 重连后请求全量同步
        NetworkManager.Instance.sendInnerMessage(this.syncMsgPrefix + "Sync");
    }

    // ==================== 服务器消息处理 (基类通用) ====================

    /** 全量同步响应 */
    protected onSyncGame(msg: any): void {
        if (!msg) return;
        const savedRoomNumber = this.roomNumber;
        this.clearRoom();

        if (msg.level !== undefined) this.level = msg.level;
        if (msg.number !== undefined) this.roomNumber = String(msg.number);
        if (msg.currentRound !== undefined) this.currentRound = Number(msg.currentRound) || 0;
        if (msg.totalRounds !== undefined) this.totalRounds = Number(msg.totalRounds) || 0;
        if (msg.ownerSeat !== undefined) this.ownerSeat = msg.ownerSeat;
        if (msg.seat !== undefined) this.seat = msg.seat;

        // gameState: 掼蛋等游戏直接发 gameState 字段；麻将游戏发 roundState 字段
        // roundState: 0=NotStarted(等同Waiting，玩家已自动入座等待准备), 1=Underway(等同Playing)
        if (msg.gameState !== undefined) {
            this.gameState = msg.gameState;
        } else if (msg.roundState !== undefined) {
            this.gameState = (msg.roundState === 1) ? GameState.Playing : GameState.Waiting;
        }

        // 保留 presetRoomNumber 设置的房间号
        if (!this.roomNumber && savedRoomNumber) {
            this.roomNumber = savedRoomNumber;
        }

        this.updateLevelDisplay();
        this.updateRoomDisplay();

        // 入座阶段 vs 游戏阶段 UI 切换
        const sittingPhase = (this.gameState === GameState.Sitting);

        if (!sittingPhase && this.seat === -1) {
            // 游戏进行中但未入座 → 强制离开
            this.exitRoom();
            return;
        }

        this.onSyncGameUIUpdate(sittingPhase);

        // 有些房间同步包会直接带上当前玩家列表，先行回填 UI，
        // 避免依赖后续 MsgAddAvatar 才能显示昵称/ID。
        if (Array.isArray(msg.avatars) && msg.avatars.length > 0) {
            this.onAddAvatar({ avatars: msg.avatars });
        }

        // Waiting 阶段：确保 readyFlags 从同步数据中恢复
        if (this.gameState === GameState.Waiting) {
            const seatCount = this.getSeatCount();
            for (let i = 0; i < seatCount; i++) {
                if (this.readyFlags[i] && this.playerInfos[i]) {
                    this.readyFlags[i].active = !!this.playerInfos[i].ready;
                }
            }
        }

        this.updateReadyButtonState();

        console.log(`[RoomBase] Sync: level=${this.level} room=${this.roomNumber} seat=${this.seat} state=${this.gameState}`);
    }

    /**
     * 同步后的 UI 更新（子类覆写以控制具体 UI 显隐）
     */
    protected onSyncGameUIUpdate(isSitting: boolean): void {
        // 切换入座层/桌面层
        if (this.seatLayer) this.seatLayer.active = isSitting;
        if (this.desktopLayer) this.desktopLayer.active = !isSitting;
        if (this.desktopUILayer) this.desktopUILayer.active = !isSitting;

        if (isSitting) {
            this.resetSeatPanels();
        } else {
            this.resetDesktopPlayers();
        }

        if (this.readyGroup) this.readyGroup.active = (!isSitting && this.gameState === GameState.Waiting);
    }

    protected clearRoom(): void {
        console.log('[RoomBase] Clearing room');
        const seatCount = this.getSeatCount();
        for (let i = 0; i < seatCount; i++) {
            if (this.seatPanels[i]) this.seatPanels[i].setEmpty();
            if (this.guanDanPlayers[i]) {
                this.guanDanPlayers[i].clear();
                this.guanDanPlayers[i].show(false);
            }
            if (this.readyFlags[i]) this.readyFlags[i].active = false;
        }
        if (this.btnReady) this.btnReady.active = false;
        this.updateReadyButtonState();
        if (this.autoGroup) this.autoGroup.active = false;
    }

    protected exitRoom(): void {
        GameManager.Instance.leaveVenue();
        GameManager.Instance.getCapital();
        Client.Instance.backToGameHall();
    }

    // ---- 玩家管理消息 ----

    protected onAddSpectator(_msg: any): void {}
    protected onRemoveSpectator(_msg: any): void {}

    protected onAddAvatar(msg: any): void {
        if (!msg) return;
        const count = msg.avatars?.length || 0;
        for (let i = 0; i < count; i++) {
            const info = msg.avatars[i];
            let extraInfo: any = {};
            if (info.base64) {
                try {
                    const text = CommonUtils.decodeBase64(info.base64);
                    extraInfo = text ? JSON.parse(text) : {};
                } catch (err) {
                    console.warn('[RoomBase] Failed to parse avatar extra info:', err);
                }
            }
            const total = (extraInfo.winNum || 0) + (extraInfo.loseNum || 0) + (extraInfo.drawNum || 0);
            const winRate = total > 0 ? ((extraInfo.winNum + extraInfo.drawNum) * 100.0 / total) : 100.0;

            const playerInfo = {
                playerId: info.playerId,
                nickname: info.nickname,
                sex: info.sex,
                gold: extraInfo.gold,
                headUrl: info.headUrl,
                offline: info.offline,
                ready: info.ready,
                authorize: extraInfo.authorize,
                ip: extraInfo.ip,
                winNum: extraInfo.winNum,
                loseNum: extraInfo.loseNum,
                drawNum: extraInfo.drawNum,
                winRate: winRate,
            };
            this.playerInfos[info.seat] = playerInfo;
            this.onPlayerAdded(info.seat, playerInfo);
        }
    }

    /**
     * 新玩家加入
     */
    protected onPlayerAdded(seatIndex: number, playerInfo: any): void {
        console.log(`[RoomBase] Player added at seat ${seatIndex}: ${playerInfo.nickname}`);

        if (this.gameState === GameState.Sitting) {
            if (this.seatPanels[seatIndex]) {
                const isSelf = (seatIndex === this.seat);
                const isOwner = (seatIndex === this.ownerSeat);
                this.seatPanels[seatIndex].setPlayerInfo(playerInfo, isSelf, isOwner);
            }
        } else {
            const clientSeat = this.server2ClientSeat(seatIndex);
            this.setupDesktopPlayer(clientSeat, playerInfo);
        }
    }

    protected onRemoveAvatar(msg: any): void {
        if (!msg) return;
        if (msg.seat === this.seat) this.seat = -1;
        this.playerInfos[msg.seat] = null;
        this.onPlayerRemoved(msg.seat);
    }

    /**
     * 玩家离开
     */
    protected onPlayerRemoved(seatIndex: number): void {
        console.log(`[RoomBase] Player removed at seat ${seatIndex}`);

        if (this.gameState === GameState.Sitting) {
            if (this.seatPanels[seatIndex]) {
                this.seatPanels[seatIndex].setEmpty();
            }
        } else {
            const clientSeat = this.server2ClientSeat(seatIndex);
            if (this.guanDanPlayers[clientSeat]) {
                this.guanDanPlayers[clientSeat].clear();
                this.guanDanPlayers[clientSeat].show(false);
            }
            if (this.readyFlags[clientSeat]) {
                this.readyFlags[clientSeat].active = false;
            }
        }
    }

    protected onAvatarConnect(msg: any): void {
        if (!msg) return;
        if (this.playerInfos[msg.seat]) {
            this.playerInfos[msg.seat].offline = msg.offline;
        }
        this.onPlayerOfflineChanged(msg.seat, msg.offline);
    }

    protected onPlayerOfflineChanged(seatIndex: number, offline: boolean): void {
        if (this.gameState === GameState.Sitting) {
            if (this.seatPanels[seatIndex]) {
                this.seatPanels[seatIndex].setOffline(offline);
            }
        } else {
            const clientSeat = this.server2ClientSeat(seatIndex);
            if (this.guanDanPlayers[clientSeat]) {
                this.guanDanPlayers[clientSeat].setOffline(offline);
            }
        }
    }

    protected onPlayerReady(msg: any): void {
        if (!msg) return;
        if (this.playerInfos[msg.seat]) {
            // C++ server MsgPlayerReadyResp only has {playerId, seat}, no ready field.
            // Server only sends this after successfully setting ready=true.
            if (msg.ready !== undefined) {
                this.playerInfos[msg.seat].ready = !!msg.ready;
            } else {
                this.playerInfos[msg.seat].ready = true;
            }
        }
        this.onPlayerReadyUIUpdate(msg.seat);
    }

    /** 准备状态 UI 更新 */
    protected onPlayerReadyUIUpdate(seatIndex: number): void {
        if (this.gameState === GameState.Sitting) {
            if (this.seatPanels[seatIndex]) {
                this.seatPanels[seatIndex].setReady(!!this.playerInfos[seatIndex]?.ready);
            }
        } else {
            const clientSeat = this.server2ClientSeat(seatIndex);
            if (this.readyFlags[clientSeat]) {
                this.readyFlags[clientSeat].active = !!this.playerInfos[seatIndex]?.ready;
            }
            if (clientSeat === 0 && this.btnReady) {
                this.btnReady.active = true;
            }
        }
        this.updateReadyButtonState();
    }

    protected onPlayerAuthorize(msg: any): void {
        if (!msg) return;
        if (this.playerInfos[msg.seat]) {
            this.playerInfos[msg.seat].authorize = msg.authorize;
        }
        this.onPlayerAuthorizeUIUpdate(msg.seat, msg.authorize);
    }

    /** 托管状态 UI 更新 */
    protected onPlayerAuthorizeUIUpdate(seatIndex: number, authorize: boolean): void {
        if (this.gameState !== GameState.Sitting) {
            const clientSeat = this.server2ClientSeat(seatIndex);
            if (this.guanDanPlayers[clientSeat]) {
                this.guanDanPlayers[clientSeat].setAuto(authorize);
            }
            if (clientSeat === 0 && this.autoGroup) {
                this.autoGroup.active = authorize;
            }
        }
    }

    protected onCapitalChanged(capital: any): void {
        if (!capital) return;
        const playerId = capital.playerId != null ? String(capital.playerId) : GameManager.Instance.PlayerId;
        const seatIndex = this.findPlayerSeat(playerId);
        if (seatIndex < 0) return;

        if (!this.playerInfos[seatIndex] && seatIndex === this.seat) {
            this.playerInfos[seatIndex] = this.createSelfPlayerInfo();
        }
        const info = this.playerInfos[seatIndex];
        if (!info) return;

        let changed = false;
        if (capital.gold !== undefined && capital.gold !== null) {
            const gold = Number(capital.gold);
            info.gold = isFinite(gold) ? gold : 0;
            changed = true;
        }
        if (!changed) return;
        this.onPlayerCapitalChanged(seatIndex, capital);
    }

    protected onPlayerCapitalChanged(seatIndex: number, _capital: any): void {
        const playerInfo = this.playerInfos[seatIndex];
        if (!playerInfo) return;
        if (this.gameState === GameState.Sitting) {
            if (this.seatPanels[seatIndex]) {
                const isSelf = (seatIndex === this.seat);
                const isOwner = (seatIndex === this.ownerSeat);
                this.seatPanels[seatIndex].setPlayerInfo(playerInfo, isSelf, isOwner);
            }
            return;
        }
        const clientSeat = this.server2ClientSeat(seatIndex);
        if (this.guanDanPlayers[clientSeat]) {
            this.guanDanPlayers[clientSeat].show(true);
            this.guanDanPlayers[clientSeat].setPlayerInfo(playerInfo);
            if (this.gameState === GameState.Waiting) {
                this.guanDanPlayers[clientSeat].setReady(playerInfo.ready);
            }
        }
    }

    private findPlayerSeat(playerId: string): number {
        const seatCount = this.getSeatCount();
        if (playerId) {
            for (let i = 0; i < seatCount; i++) {
                if (this.playerInfos[i]?.playerId != null && String(this.playerInfos[i].playerId) === playerId) {
                    return i;
                }
            }
        }
        if (this.seat >= 0 && (!playerId || playerId === GameManager.Instance.PlayerId)) {
            return this.seat;
        }
        return -1;
    }

    private createSelfPlayerInfo(): any {
        return {
            playerId: GameManager.Instance.PlayerId,
            nickname: GameManager.Instance.NickName || GameManager.Instance.PlayerId,
            sex: GameManager.Instance.Sex,
            gold: GameManager.Instance.Gold,
            headUrl: GameManager.Instance.Avatar,
            offline: false,
            ready: false,
            authorize: false,
        };
    }

    protected onLeaveVenueResp(msg: any): void {
        if (!msg) return;
        if (msg.result === 0) {
            this.exitRoom();
            return;
        }
        if (msg.result === 1) {
            NetworkManager.Instance.sendInnerMessage("MsgDisbandRequest");
            return;
        }
        Client.Instance.showPromptTip(msg.errMsg || "退出房间失败", 3.0);
    }

    /** 入座响应 */
    protected onJoinGameResp(msg: any): void {
        if (!msg) return;
        if (msg.success) {
            this.seat = msg.seat;
        } else {
            Client.Instance.showPromptTip(msg.errMsg, 2.0);
        }
    }

    /** 旁观切换响应 */
    protected onBecomeSpectatorResp(msg: any): void {
        if (!msg) return;
        if (msg.result === 0) {
            this.seat = -1;
            this.resetSeatPanels();
        } else {
            Client.Instance.showPromptTip(msg.errMsg, 3.0);
        }
    }

    /** 房主座位变更 */
    protected onOwnerSeat(msg: any): void {
        if (!msg) return;
        this.ownerSeat = msg.ownerSeat;
        if (this.ownerSeat === -1) return;
        if (this.gameState === GameState.Sitting && this.seatPanels[this.ownerSeat]) {
            this.seatPanels[this.ownerSeat].setOwnerSeat(true);
        }
        if (this.level === RoomLevel.Friend && this.btnStartGame && this.seat !== -1) {
            this.btnStartGame.active = (this.seat === this.ownerSeat);
        }
    }

    /** 游戏状态切换（入座 ↔ 游戏中） */
    protected onSitting(msg: any): void {
        if (!msg) return;
        this.gameState = msg.gameState;
        const sittingPhase = (this.gameState === GameState.Sitting);
        if (!sittingPhase && this.seat === -1) {
            Client.Instance.showPromptDialog("游戏已开始，未入座玩家被请出房间。", this.exitRoom, this.exitRoom);
            return;
        }
        this.onSyncGameUIUpdate(sittingPhase);
    }

    // ==================== 座位转换 ====================

    /** 服务端座位 → 客户端座位 (视角旋转) */
    protected server2ClientSeat(s: number): number {
        if (this.seat === -1) return s;
        if (this.gameState === GameState.Sitting) return s;
        const seatCount = this.getSeatCount();
        return (s + seatCount - this.seat) % seatCount;
    }

    /** 客户端座位 → 服务端座位 */
    protected client2ServerSeat(s: number): number {
        if (this.seat === -1) return s;
        if (this.gameState === GameState.Sitting) return s;
        return (s + this.seat) % this.getSeatCount();
    }

    // ==================== 初始化 ====================

    init(roomInfo: RoomInfo): void {
        this.roomInfo = roomInfo;
        this.currentState = roomInfo.gameState;
        this.updateRoomDisplay();
        console.log(`[RoomBase] Room initialized: ${roomInfo.roomNo}`);
    }

    setCallbacks(callbacks: RoomEventCallbacks): void {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    // ==================== Prefab 节点绑定 ====================

    /**
     * 从 GuanDan Room.prefab 中查找并绑定 UI 节点
     * 当通过 GameFactory + prefab 复用路径创建房间时调用
     */
    protected bindPrefabNodes(): void {
        const root = this.node;

        // 1. LabelLevel（房间号/等级显示）
        this.labelLevel = this.findChildComponent<Label>(root, 'LabelLevel', Label);
        this.roomNoLabel = this.labelLevel;

        // 2. 层级节点
        this.seatLayer = this.findChildByName(root, 'Seat');
        this.desktopLayer = this.findChildByName(root, 'Desktop');
        this.desktopUILayer = this.findChildByName(root, 'DesktopUI');

        // 3. SeatPanel 组件（服务端座位: East=0, North=1, West=2, South=3）
        this.seatPanels = [];
        const seatNames = ['SeatEast', 'SeatNorth', 'SeatWest', 'SeatSouth'];
        const seatParent = this.seatLayer || root;
        for (const name of seatNames) {
            const child = this.findChildByName(seatParent, name);
            const seatPanel = child ? this.findComponentByMethod(child, 'setPlayerInfo') : null;
            if (seatPanel && typeof seatPanel.setData === 'function') {
                seatPanel.setData(this.seatPanels.length, this);
            }
            this.seatPanels.push(seatPanel);
        }

        // 4. GuanDanPlayer 组件（客户端座位: Bottom=0, Left=1, Top=2, Right=3）
        this.guanDanPlayers = [];
        const playerNames = ['PlayerBottom', 'PlayerLeft', 'PlayerTop', 'PlayerRight'];
        const uiParent = this.desktopUILayer || root;
        for (const name of playerNames) {
            const child = this.findChildByName(uiParent, name);
            this.guanDanPlayers.push(child ? this.findComponentByMethod(child, 'setPlayerInfo') : null);
        }

        // 5. 准备标记
        this.readyFlags = [];
        for (let i = 1; i <= 4; i++) {
            this.readyFlags.push(this.findChildByName(uiParent, `Ready${i}`));
        }

        // 6. 倒计时标签
        this.countdownLabel = this.findChildComponent<Label>(uiParent, 'Second', Label);

        // 7. 按钮（可能不在 root 直接子节点，需要递归搜索）
        this.readyGroup = this.findChildRecursive(root, 'ReadyGroup');
        this.autoGroup = this.findChildRecursive(root, 'AutoGroup');
        // BtnReady 优先取 ReadyGroup 内的（游戏阶段可见），其次取全局的
        this.btnReady = this.readyGroup ? this.findChildByName(this.readyGroup, 'BtnReady') : null;
        if (!this.btnReady) this.btnReady = this.findChildRecursive(root, 'BtnReady');
        this.btnReadyLabel = this.findChildComponent<Label>(this.btnReady || root, 'Label', Label);
        this.btnStartGame = this.findChildRecursive(root, 'BtnStartGame');

        // 编程式绑定按钮点击事件（不依赖 rebind，确保可靠）
        this.bindButtonEvent(this.btnReady, 'onReadyClick');
        this.bindButtonEvent(this.btnStartGame, 'onStartGameClick');
        this.bindButtonEvent(this.findChildRecursive(root, 'BtnBack'), 'onBackClick');
        this.bindButtonEvent(this.findChildRecursive(root, 'BtnChangeSeat'), 'onChangeSeatClick');

        // 8. 隐藏多余的座位面板和玩家节点（适配少于4人的游戏）
        this.hideExtraSeats();

        console.log(`[RoomBase] bindPrefabNodes: labelLevel=${!!this.labelLevel}, seatPanels=${this.seatPanels.filter(Boolean).length}, players=${this.guanDanPlayers.filter(Boolean).length}, btnReady=${!!this.btnReady}, readyGroup=${!!this.readyGroup}, btnStartGame=${!!this.btnStartGame}`);
    }

    /** 隐藏超出 getSeatCount() 的座位面板和桌面玩家节点 */
    protected hideExtraSeats(): void {
        const seatCount = this.getSeatCount();
        for (let i = seatCount; i < 4; i++) {
            if (this.seatPanels[i]) {
                this.seatPanels[i].node.active = false;
            }
            if (this.guanDanPlayers[i]) {
                this.guanDanPlayers[i].node.active = false;
            }
            if (this.readyFlags[i]) {
                this.readyFlags[i].active = false;
            }
        }
    }

    /** 按名称查找直接子节点 */
    protected findChildByName(parent: Node, name: string): Node | null {
        if (!parent) return null;
        for (let i = 0; i < parent.children.length; i++) {
            if (parent.children[i].name === name) return parent.children[i];
        }
        return null;
    }

    /** 按名称递归查找所有层级的子节点 */
    protected findChildRecursive(parent: Node, name: string): Node | null {
        if (!parent) return null;
        const queue: Node[] = [parent];
        while (queue.length > 0) {
            const node = queue.shift()!;
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.name === name) return child;
                queue.push(child);
            }
        }
        return null;
    }

    /** 编程式绑定按钮点击事件到当前组件 */
    protected bindButtonEvent(node: Node | null, handler: string): void {
        if (!node) return;
        // 优先通过 Button 组件的 EventHandler 绑定
        const button = node.getComponent(Button);
        if (button) {
            const componentName = js.getClassName(this);
            if (componentName && typeof (this as any)[handler] === 'function') {
                button.clickEvents.length = 0;
                const evt = new EventHandler();
                evt.target = this.node;
                evt.component = componentName;
                evt.handler = handler;
                button.clickEvents.push(evt);
                console.log(`[RoomBase] Bound button event: ${handler} on '${node.name}' via Button component`);
                return;
            }
        }
        // 回退：直接监听节点触摸事件
        const handlerFn = (this as any)[handler];
        if (typeof handlerFn === 'function') {
            node.on(Node.EventType.TOUCH_END, () => {
                handlerFn.call(this);
            }, this);
            console.log(`[RoomBase] Bound button event: ${handler} on '${node.name}' via TOUCH_END`);
        } else {
            console.warn(`[RoomBase] Cannot bind handler '${handler}' on '${node.name}'`);
        }
    }

    /** 遍历节点所有组件，按方法名查找（避免跨 chunk 类名查找失败） */
    protected findComponentByMethod(node: Node, methodName: string): any | null {
        if (!node) return null;
        const comps = node.components;
        for (let i = 0; i < comps.length; i++) {
            if (typeof (comps[i] as any)[methodName] === 'function') {
                return comps[i];
            }
        }
        return null;
    }

    /** 按名称查找子节点并获取指定组件 */
    protected findChildComponent<T>(parent: Node, name: string, componentType: any): T | null {
        const node = this.findChildByName(parent, name);
        if (!node) return null;
        return node.getComponent(componentType) as T;
    }

    /** Sitting 阶段同步时重置所有座位面板 */
    protected resetSeatPanels(): void {
        const seatCount = this.getSeatCount();
        for (let i = 0; i < seatCount; i++) {
            if (!this.seatPanels[i]) continue;
            if (this.playerInfos[i]) {
                const isSelf = (i === this.seat);
                const isOwner = (i === this.ownerSeat);
                this.seatPanels[i].setPlayerInfo(this.playerInfos[i], isSelf, isOwner);
            } else {
                this.seatPanels[i].setEmpty();
            }
        }
    }

    /** Playing 阶段同步时重置所有桌面玩家 */
    protected resetDesktopPlayers(): void {
        const seatCount = this.getSeatCount();
        const isWaiting = (this.gameState === GameState.Waiting);
        for (let i = 0; i < seatCount; i++) {
            if (!this.guanDanPlayers[i]) continue;
            const serverSeat = this.client2ServerSeat(i);
            const playerInfo = this.playerInfos[serverSeat];
            if (playerInfo) {
                this.guanDanPlayers[i].show(true);
                this.guanDanPlayers[i].setPlayerInfo(playerInfo);
                if (isWaiting) {
                    this.guanDanPlayers[i].setReady(playerInfo.ready);
                    if (this.readyFlags[i]) {
                        this.readyFlags[i].active = !!playerInfo.ready;
                    }
                }
            } else {
                this.guanDanPlayers[i].clear();
                this.guanDanPlayers[i].show(false);
            }
        }
    }

    /** 设置单个桌面玩家（Playing 阶段新玩家加入时调用） */
    protected setupDesktopPlayer(clientSeat: number, playerInfo: any): void {
        if (this.guanDanPlayers[clientSeat]) {
            this.guanDanPlayers[clientSeat].show(true);
            this.guanDanPlayers[clientSeat].setPlayerInfo(playerInfo);
            if (this.gameState === GameState.Waiting) {
                this.guanDanPlayers[clientSeat].setReady(playerInfo.ready);
            }
        }
        if (this.gameState === GameState.Waiting && this.readyFlags[clientSeat]) {
            this.readyFlags[clientSeat].active = !!playerInfo.ready;
        }
        if (clientSeat === 0 && this.autoGroup) {
            this.autoGroup.active = !!playerInfo.authorize;
        }
    }

    // ==================== UI 更新方法 ====================

    protected updateRoomDisplay(): void {
        if (this.roomNoLabel && this.roomNumber) {
            this.roomNoLabel.string = `房号: ${this.roomNumber}`;
        }
        if (this.roundLabel) {
            const current = this.roomInfo?.currentRound ?? this.currentRound;
            const total = this.roomInfo?.totalRounds ?? this.totalRounds;
            if (current > 0 && total > 0) this.roundLabel.string = `${current}/${total}`;
            else if (current > 0) this.roundLabel.string = `${current}`;
        }
    }

    protected updateLevelDisplay(): void {
        if (!this.labelLevel) return;
        if (this.roomNumber) {
            this.labelLevel.string = `房号: ${this.roomNumber}`;
            return;
        }
        switch (this.level) {
            case RoomLevel.Friend:
                this.labelLevel.string = '好友房';
                break;
            case RoomLevel.Practice:
                this.labelLevel.string = '练习房';
                break;
            case RoomLevel.Beginner:
                this.labelLevel.string = '初级房';
                break;
            case RoomLevel.Moderate:
                this.labelLevel.string = '中级房';
                break;
            case RoomLevel.Advanced:
                this.labelLevel.string = '高级房';
                break;
            case RoomLevel.Master:
                this.labelLevel.string = '大师房';
                break;
            default:
                this.labelLevel.string = '';
                break;
        }
    }

    public presetRoomNumber(roomNumber: string | null | undefined): void {
        if (!roomNumber) return;
        this.roomNumber = String(roomNumber);
        this.updateLevelDisplay();
        this.updateRoomDisplay();
    }

    protected updateCountdownDisplay(): void {
        if (this.countdownLabel) {
            this.countdownLabel.string = String(Math.max(0, Math.ceil(this.countdownSeconds - this.countdownElapsed)));
        }
    }

    protected hideAllPanels(): void {
        if (this.disconnectTip) this.disconnectTip.active = false;
        if (this.trusteePanel) this.trusteePanel.active = false;
        if (this.dissolvePanel) this.dissolvePanel.active = false;
    }

    // ==================== 座位管理 ====================

    protected initSeats(): void {
        const seatCount = this.getSeatCount();
        for (let i = 0; i < seatCount; i++) {
            this.createSeatNode(i);
        }
    }

    /** 获取当前游戏的座位数量 (子类覆写) */
    protected getSeatCount(): number {
        return 4;
    }

    protected createSeatNode(_seatIndex: number): Node {
        // 基类占位，实际由编辑器预制体提供
        return null;
    }

    // ==================== 倒计时系统 ====================

    /** 开始倒计时 */
    public startCountdown(seconds: number): void {
        this.countdownSeconds = seconds;
        this.countdownElapsed = 0;
        this.isCountingDown = true;
        this.clockFlag = true;
        this.clockSelf = true;
        this.updateCountdownDisplay();
    }

    /** 开始他人倒计时 (仅显示不播放音效) */
    public startOtherCountdown(seconds: number): void {
        this.countdownSeconds = seconds;
        this.countdownElapsed = 0;
        this.isCountingDown = true;
        this.clockFlag = true;
        this.clockSelf = false;
        this.updateCountdownDisplay();
    }

    /** 停止倒计时 */
    public stopCountdown(): void {
        this.isCountingDown = false;
        this.clockFlag = false;
        this.countdownSeconds = 0;
        this.updateCountdownDisplay();
    }

    /** 帧更新倒计时 (GuanDan 风格的15秒倒计时时钟) */
    private updateClock(deltaTime: number): void {
        if (!this.clockFlag) return;
        const totalSeconds = this.countdownSeconds || 15.0;
        if (this.countdownElapsed < totalSeconds) {
            const prevElapsed = this.countdownElapsed;
            this.countdownElapsed += deltaTime;
            const sec = Math.max(0, Math.floor(totalSeconds - this.countdownElapsed));
            if (this.countdownLabel) {
                this.countdownLabel.string = String(sec);
            }

            // 倒计时音效 (9s-14s 播放 warning1~5)
            if (this.clockSelf) {
                this.checkAndPlayClockWarning(prevElapsed);
            }
        } else {
            this.clockFlag = false;
            this.isCountingDown = false;
            if (this.countdownLabel) this.countdownLabel.string = "0";
            this.onCountdownExpired();
        }
    }

    /** 检查并播放倒计时告警音效 (9s~14s 各秒播一次) */
    protected checkAndPlayClockWarning(prevElapsed: number): void {
        const thresholds = [9, 10, 11, 12, 13, 14];
        for (let i = 0; i < thresholds.length; i++) {
            if (prevElapsed < thresholds[i] && this.countdownElapsed >= thresholds[i]) {
                this.playClockWarning(5 - i); // 9s->warning5, 14s->warning0
                break;
            }
        }
    }

    /** 播放倒计时告警音效（子类可覆写使用自己的音频控制器） */
    protected playClockWarning(_count: number): void {}

    protected onCountdownExpired(): void {
        this.isCountingDown = false;
        console.log('[RoomBase] Countdown expired');
        this.onAutoAction();
    }

    /** 超时自动操作 (子类覆写) */
    protected onAutoAction(): void {
        if (!this.isTrustee) {
            this.setTrustee(true);
        }
    }

    // ==================== 托管 ====================

    public setTrustee(trustee: boolean): void {
        this.isTrustee = trustee;
        if (this.trusteePanel) {
            this.trusteePanel.active = trustee;
        }
        console.log(`[RoomBase] Trustee mode: ${trustee}`);
        NetworkManager.Instance.sendInnerMessage("MsgPlayerAuthorize");
    }

    /** 点击自动/托管按钮 */
    public onAutoClick(): void {
        NetworkManager.Instance.sendInnerMessage("MsgPlayerAuthorize");
    }

    /** 点击准备按钮 */
    public onReadyClick(): void {
        console.log('[RoomBase] onReadyClick, seat:', this.seat);
        if (this.seat === -1) return;
        NetworkManager.Instance.sendInnerMessage("MsgPlayerReady");
    }

    public onShuffleCardsClick(): void {
        if (this.seat === -1) {
            Client.Instance.showPromptTip('请先入座后再洗牌', 2.0);
            return;
        }
        NetworkManager.Instance.sendInnerMessage("MsgShuffleCards");
    }

    protected onShuffleCardsResp(msg: any): void {
        if (!msg) return;
        if (msg.errMsg) {
            const isSelf = !msg.playerId || String(msg.playerId) === String(GameManager.Instance.PlayerId);
            if (isSelf) Client.Instance.showPromptTip(msg.errMsg, 2.0);
            return;
        }
        const isSelf = String(msg.playerId || '') === String(GameManager.Instance.PlayerId || '');
        const fee = Number(msg.fee) || 1;
        if (isSelf) {
            Client.Instance.showPromptTip(`已洗牌，扣除${fee}积分`, 2.0);
            GameManager.Instance.getCapital();
            return;
        }
        const name = msg.playerId ? this.getRoomFeePlayerName(String(msg.playerId)) : '其他玩家';
        Client.Instance.showPromptTip(`${name}已洗牌，下局重新发牌`, 2.0);
    }

    protected async openSettlementReplay(roundNo?: number, totalRounds?: number): Promise<void> {
        const replayRound = Number(roundNo || this.currentRound || this.roomInfo?.currentRound || 0);
        const replayTotal = Number(totalRounds || this.totalRounds || this.roomInfo?.totalRounds || 0);
        try {
            const { ReplayDialogManager } = await import('../Game/Dialogs/ReplayDialogManager');
            await ReplayDialogManager.openSettlementReplay(this.node, this.gameId, {
                venueId: GameManager.Instance.VenueId || undefined,
                number: this.roomNumber || this.roomInfo?.roomNo,
                roundNo: replayRound,
                totalRounds: replayTotal,
            });
        } catch (err) {
            console.error('[RoomBase] Open settlement replay failed:', err);
            Client.Instance.showPromptDialog('打开回放失败');
        }
    }

    protected async updateSettlementIncomeBoxSummary(label: Label | null, roomFeeText: string = ''): Promise<void> {
        if (!label || !label.node || !label.node.isValid) return;
        const setText = (incomeText: string) => {
            if (!label || !label.node || !label.node.isValid) return;
            const parts: string[] = [];
            if (roomFeeText) parts.push(roomFeeText);
            if (incomeText) parts.push(incomeText);
            label.string = parts.join('\n');
            label.node.active = parts.length > 0;
        };
        setText(roomFeeText ? '' : '收益箱统计加载中');

        const maxAttempts = 4;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const dto = await GameManager.Instance.authGet('/player/agency/income-box');
                if (!this.isIncomeBoxResponseSuccess(dto)) {
                    setText('');
                    return;
                }
                setText(this.formatSettlementIncomeBoxText(dto));
                return;
            } catch (err) {
                if (attempt >= maxAttempts - 1) {
                    setText('');
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 650));
            }
        }
    }

    protected formatSettlementIncomeBoxText(dto: any): string {
        const withdrawable = this.getIncomeBoxWithdrawableAmount(dto);
        const today = Math.max(
            this.toIncomeBoxNumber(dto?.availableTodayCommission),
            this.toIncomeBoxNumber(dto?.todayPendingCommission) + this.toIncomeBoxNumber(dto?.todayDepositSettledAmount),
            this.toIncomeBoxNumber(dto?.todayCommission),
        );
        const total = Math.max(
            this.toIncomeBoxNumber(dto?.totalCommission),
            today,
            withdrawable,
        );
        return `收益箱 今日 ${today}，可提 ${withdrawable}，累计 ${total}`;
    }

    protected getIncomeBoxWithdrawableAmount(dto: any): number {
        const ledgerTotal = this.toIncomeBoxNumber(dto?.pendingLedgerAmount)
            + Math.max(this.toIncomeBoxNumber(dto?.depositSettledAmount), this.toIncomeBoxNumber(dto?.prepaidAmount))
            + this.toIncomeBoxNumber(dto?.legacyReward);
        const todayAvailable = this.toIncomeBoxNumber(dto?.availableTodayCommission)
            || (this.toIncomeBoxNumber(dto?.todayPendingCommission) + this.toIncomeBoxNumber(dto?.todayDepositSettledAmount));
        return Math.max(
            this.toIncomeBoxNumber(dto?.balance),
            this.toIncomeBoxNumber(dto?.pendingAmount),
            ledgerTotal,
            todayAvailable,
            this.toIncomeBoxNumber(dto?.todayCommission),
        );
    }

    private isIncomeBoxResponseSuccess(dto: any): boolean {
        return dto?.code === '00000000' || dto?.code === 200 || dto?.code === '200';
    }

    private toIncomeBoxNumber(value: any): number {
        const num = Number(value);
        return isFinite(num) ? Math.floor(num) : 0;
    }

    protected updateReadyButtonState(): void {
        if (!this.btnReady) return;
        const canReady = (this.seat !== -1 && this.gameState === GameState.Waiting);
        this.btnReady.active = canReady;
        if (!canReady) return;

        const selfInfo = this.playerInfos[this.seat];
        const ready = !!selfInfo?.ready;
        if (this.btnReadyLabel) {
            this.btnReadyLabel.string = ready ? '取消准备' : '准备';
        }
    }

    /** 点击开始按钮 */
    public onStartGameClick(): void {
        NetworkManager.Instance.sendInnerMessage(this.syncMsgPrefix + "StartGame");
    }

    /** 点击返回按钮 */
    public onBackClick(): void {
        if (NetworkManager.Instance.isConnected()) {
            NetworkManager.Instance.sendInnerMessage("MsgLeaveVenue");
        } else {
            this.exitRoom();
        }
    }

    /** 点击换座/旁观按钮 */
    public onChangeSeatClick(): void {
        NetworkManager.Instance.sendInnerMessage("MsgBecomeSpectator");
    }

    /** 点击入座区域 */
    public OnSeatPanelClick(_event: Event, customEventData: any | null): void {
        const seatIndex = Number(customEventData);
        if (isNaN(seatIndex)) return;
        if (seatIndex < 0 || seatIndex >= this.getSeatCount()) return;

        if (!this.playerInfos[seatIndex]) {
            if (this.seat !== -1) {
                Client.Instance.showPromptTip("您当前已经在其他座位坐下", 3.0);
                return;
            }
            NetworkManager.Instance.sendMessage("MsgJoinGame", {
                venueId: GameManager.Instance.VenueId,
                seat: seatIndex
            }, true);
            return;
        }

        this.seatPanels[seatIndex]?.showMenu?.(true);
    }

    // ==================== 断线重连 ====================

    public showDisconnectTip(show: boolean): void {
        if (this.disconnectTip) {
            this.disconnectTip.active = show;
        }
        if (show) {
            this.callbacks.onDisconnect?.();
        }
    }

    public handleReconnect(data: any): void {
        console.log('[RoomBase] Handling reconnect data');
        this.showDisconnectTip(false);
        if (data.roomState) {
            this.currentState = data.roomState as RoomState;
        }
        this.callbacks.onReconnect?.();
    }

    // ==================== 解散投票 ====================

    public showDissolveVote(_initiatorId: string): void {
        if (this.dissolvePanel) {
            this.dissolvePanel.active = true;
        }
    }

    public voteDissolve(agree: boolean): void {
        NetworkManager.Instance.sendMessage("MsgDisbandChoose", {
            venueId: GameManager.Instance.VenueId,
            choice: agree ? 1 : 2
        }, true);
        if (this.dissolvePanel) {
            this.dissolvePanel.active = false;
        }
    }

    // ==================== 聊天入口 ====================

    public openChat(): void {
        console.log('[RoomBase] Open chat');
    }

    // ==================== HTTP API 辅助方法 ====================

    /**
     * 创建房间 (HTTP API)
     * @param gameType GameType 枚举值 (来自 ConstDefines)
     * @param level 房间级别
     * @param extraData 额外参数
     */
    protected createRoomAPI(gameType: number, level: number, extraData?: any): Promise<void> {
        const params = Object.assign({ level }, extraData || {});
        return GameRoomApi.Instance.createRoom(gameType, params).then((result) => {
            if (!result) return;
            GameRoomApi.Instance.enterVenue(result, gameType, () => this.onEnterVenue());
        }).catch((err: any) => {
            console.error("Create room error:", err);
        });
    }

    /**
     * 通过 districtId 加入场次
     */
    protected enterDistrictAPI(districtId: number, gameType: number): Promise<void> {
        return GameRoomApi.Instance.joinByDistrict(districtId).then((result) => {
            if (!result) return;
            GameRoomApi.Instance.enterVenue(result, gameType, () => this.onEnterVenue());
        }).catch((err: any) => {
            console.error("Enter district error:", err);
        });
    }

    /**
     * 通过房号加入房间
     */
    protected joinRoomByNumberAPI(number: string, gameType: number): Promise<void> {
        return GameRoomApi.Instance.joinByNumber(number, gameType).then((result) => {
            if (!result) return;
            GameRoomApi.Instance.enterVenue(result, gameType, () => this.onEnterVenue());
        }).catch((err: any) => {
            console.error("Join room error:", err);
        });
    }

    /**
     * 通过 venueId 加入房间
     */
    protected joinRoomByVenueIdAPI(venueId: string, gameType: number): Promise<void> {
        return GameRoomApi.Instance.joinByVenueId(venueId, gameType).then((result) => {
            if (!result) return;
            GameRoomApi.Instance.enterVenue(result, gameType, () => this.onEnterVenue());
        }).catch((err: any) => {
            console.error("Join room by venueId error:", err);
        });
    }

    /**
     * 进入场地后加载房间场景（子类覆写以指定预制体名）
     */
    protected onEnterVenue(): void {
        Client.Instance.initGameRoom(null);
    }

    // ==================== 退出房间 ====================

    public backToHall(): void {
        GameManager.Instance.leaveVenue();
        GameManager.Instance.getCapital();
        Client.Instance.backToGameHall();
    }

    /** 清理资源 */
    protected cleanup(): void {
        this.stopCountdown();
        this.hideAllPanels();
        this.playerInfos = [];
        this.roomInfo = null;
        this.roomNumber = null;
    }

    // ==================== 事件监听 (保留兼容旧 WsEventRouter 的接口) ====================

    protected setupEventListeners(): void {
        // 已迁移到 NetMsgHandler 模式，此处保留为空兼容
    }

    protected handleRoomUpdate(data: any): boolean {
        console.log('[RoomBase] Room update:', data);
        if (data.state) {
            this.currentState = data.state as RoomState;
            this.callbacks.onRoomStateChanged?.(this.currentState);
        }
        return true;
    }

    protected handleGameStart(data: any): boolean {
        this.currentState = RoomState.Playing;
        this.stopCountdown();
        console.log('[RoomBase] Game started');
        this.callbacks.onGameStart?.();
        return true;
    }

    protected getRoomFeeSettlementText(data: any): string {
        const parts: string[] = [];
        const roomFeeText = this.getFeeSettlementText(data, 'roomFee', '房费抽取');
        const shuffleFeeText = this.getFeeSettlementText(data, 'shuffleFee', '洗牌分抽取');
        if (roomFeeText) parts.push(roomFeeText);
        if (shuffleFeeText) parts.push(shuffleFeeText);
        return parts.join('；');
    }

    protected getFeeSettlementText(data: any, fieldPrefix: string, title: string): string {
        const rows = this.getRoomFeeSettlementRows(data, fieldPrefix);
        if (rows.total <= 0) return '';
        const details = rows.payers
            .map((payer) => `${payer.name} -${payer.amount}`)
            .join('，');
        return details.length > 0 ? `${title} ${rows.total}（${details}）` : `${title} ${rows.total}`;
    }

    protected getRoomFeeSettlementRows(data: any, fieldPrefix: string = 'roomFee'): { total: number; payers: Array<{ playerId: string; name: string; amount: number }> } {
        const ids = this.toRoomFeeStringArray(data?.[`${fieldPrefix}PlayerIds`]);
        const amounts = this.toRoomFeeNumberArray(data?.[`${fieldPrefix}Amounts`]);
        const payers: Array<{ playerId: string; name: string; amount: number }> = [];
        let amountSum = 0;
        const count = Math.min(ids.length, amounts.length);
        for (let i = 0; i < count; i++) {
            const playerId = ids[i];
            const amount = Number(amounts[i]) || 0;
            if (!playerId || amount <= 0) continue;
            amountSum += amount;
            payers.push({
                playerId,
                name: this.getRoomFeePlayerName(playerId),
                amount,
            });
        }
        const total = Number(data?.[`${fieldPrefix}Total`]) || amountSum;
        return { total, payers };
    }

    private getRoomFeePlayerName(playerId: string): string {
        for (const info of this.playerInfos) {
            if (!info) continue;
            if (String(info.playerId || '') === playerId) {
                return info.nickname || info.playerId || playerId;
            }
        }
        return playerId.length > 4 ? `玩家${playerId.slice(-4)}` : playerId;
    }

    private toRoomFeeStringArray(value: any): string[] {
        return this.toRoomFeeArray(value).map((item) => String(item || ''));
    }

    private toRoomFeeNumberArray(value: any): number[] {
        return this.toRoomFeeArray(value).map((item) => Number(item) || 0);
    }

    private toRoomFeeArray(value: any): any[] {
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'object') return [];
        return Object.keys(value)
            .filter((key) => /^\d+$/.test(key))
            .sort((a, b) => Number(a) - Number(b))
            .map((key) => value[key]);
    }

    protected handleRoundSettlement(data: any): boolean {
        this.currentState = RoomState.RoundSettlement;
        this.stopCountdown();
        const settlement: RoundSettlementData = data as RoundSettlementData;
        console.log(`[RoomBase] Round ${settlement.roundNumber} settlement`);
        this.callbacks.onRoundSettlement?.(settlement);
        return true;
    }

    protected handleFinalSettlement(data: any): boolean {
        this.currentState = RoomState.FinalSettlement;
        const settlement: FinalSettlementData = data as FinalSettlementData;
        console.log('[RoomBase] Final settlement');
        this.callbacks.onFinalSettlement?.(settlement);
        return true;
    }

    /** 座位索引转位置枚举 */
    protected indexToPosition(index: number): SeatPosition {
        switch (index) {
            case 0: return SeatPosition.Self;
            case 1: return SeatPosition.Left;
            case 2: return SeatPosition.Right;
            case 3: return SeatPosition.Top;
            default: return SeatPosition.Self;
        }
    }
}
