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

import { _decorator, Component, Node, Label, Prefab, instantiate, director, Sprite, SpriteFrame } from 'cc';
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

    /** 当前房间信息 */
    protected roomInfo: RoomInfo | null = null;

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

    /** 默认资源 Bundle 名 (用于加载 GuanDan 共享资源) */
    protected static readonly DEFAULT_BUNDLE_MAIN = 'GuanDanRoomMain';
    protected static readonly DEFAULT_BUNDLE_AUDIO = 'GuanDanAudio';
    protected static readonly DEFAULT_BUNDLE_BG = 'GuanDanRoomBackground';

    // ==================== 生命周期 ====================

    onLoad(): void {
        NetMsgManager.Instance.registerHandler(this);
        NetworkManager.Instance.registerHandler(this);
    }

    onDestroy(): void {
        NetMsgManager.Instance.unregisterHandler(this);
        NetworkManager.Instance.unregisterHandler(this);
    }

    start(): void {
        // 加载通用提示弹窗预制体
        ResourceLoader.Instance.loadAsset(RoomBase.DEFAULT_BUNDLE_MAIN, "PromptDialog", Prefab, (prefab: Prefab) => {
            if (prefab) Client.Instance.setPromptDialogPrefab(prefab);
        });
        ResourceLoader.Instance.loadAsset(RoomBase.DEFAULT_BUNDLE_MAIN, "PromptTip", Prefab, (prefab: Prefab) => {
            if (prefab) Client.Instance.setPromptTipPrefab(prefab);
        });

        // 请求游戏数据同步
        NetworkManager.Instance.sendInnerMessage(this.syncMsgPrefix + "Sync");
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
        this.clearRoom();

        if (msg.level !== undefined) this.level = msg.level;
        if (msg.number !== undefined) this.roomNumber = String(msg.number);
        if (msg.ownerSeat !== undefined) this.ownerSeat = msg.ownerSeat;
        if (msg.gameState !== undefined) this.gameState = msg.gameState;
        if (msg.seat !== undefined) this.seat = msg.seat;

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

        console.log(`[RoomBase] Sync: level=${this.level} room=${this.roomNumber} seat=${this.seat} state=${this.gameState}`);
    }

    /**
     * 同步后的 UI 更新（子类覆写以控制具体 UI 显隐）
     */
    protected onSyncGameUIUpdate(isSitting: boolean): void {
        // 基类空实现，子类根据自身 UI 结构覆写
    }

    protected clearRoom(): void {
        console.log('[RoomBase] Clearing room');
        // 子类覆写以清理所有 UI 元素
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
            const text = CommonUtils.decodeBase64(info.base64);
            const extraInfo = JSON.parse(text);
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
     * 新玩家加入（子类覆写以更新 UI）
     */
    protected onPlayerAdded(seatIndex: number, playerInfo: any): void {
        console.log(`[RoomBase] Player added at seat ${seatIndex}: ${playerInfo.nickname}`);
    }

    protected onRemoveAvatar(msg: any): void {
        if (!msg) return;
        if (msg.seat === this.seat) this.seat = -1;
        this.playerInfos[msg.seat] = null;
        this.onPlayerRemoved(msg.seat);
    }

    /**
     * 玩家离开（子类覆写）
     */
    protected onPlayerRemoved(seatIndex: number): void {
        console.log(`[RoomBase] Player removed at seat ${seatIndex}`);
    }

    protected onAvatarConnect(msg: any): void {
        if (!msg) return;
        if (this.playerInfos[msg.seat]) {
            this.playerInfos[msg.seat].offline = msg.offline;
        }
        this.onPlayerOfflineChanged(msg.seat, msg.offline);
    }

    protected onPlayerOfflineChanged(_seatIndex: number, _offline: boolean): void {}

    protected onPlayerReady(msg: any): void {
        if (!msg) return;
        if (this.playerInfos[msg.seat]) {
            this.playerInfos[msg.seat].ready = true;
        }
        this.onPlayerReadyUIUpdate(msg.seat);
    }

    /** 准备状态 UI 更新（子类覆写） */
    protected onPlayerReadyUIUpdate(_seatIndex: number): void {}

    protected onPlayerAuthorize(msg: any): void {
        if (!msg) return;
        if (this.playerInfos[msg.seat]) {
            this.playerInfos[msg.seat].authorize = msg.authorize;
        }
        this.onPlayerAuthorizeUIUpdate(msg.seat, msg.authorize);
    }

    /** 托管状态 UI 更新（子类覆写） */
    protected onPlayerAuthorizeUIUpdate(_seatIndex: number, _authorize: boolean): void {}

    protected onLeaveVenueResp(_msg: any): void {}

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

    // ==================== UI 更新方法 ====================

    protected updateRoomDisplay(): void {
        if (this.roomNoLabel && this.roomNumber) {
            this.roomNoLabel.string = this.roomNumber;
        }
        if (this.roundLabel && this.roomInfo) {
            this.roundLabel.string = `${this.roomInfo.currentRound}/${this.roomInfo.totalRounds}`;
        }
    }

    protected updateLevelDisplay(): void {
        // 子类覆写以显示房间等级名称
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
        if (this.countdownElapsed < 15.0) {
            const prevElapsed = this.countdownElapsed;
            this.countdownElapsed += deltaTime;
            const sec = Math.max(0, Math.floor(15.0 - this.countdownElapsed));
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
        if (this.seat === -1) return;
        NetworkManager.Instance.sendInnerMessage("MsgPlayerReady");
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
        NetworkManager.Instance.sendInnerMessage("MsgDisbandChoice", { agree });
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
        ResourceLoader.Instance.loadAsset(RoomBase.DEFAULT_BUNDLE_MAIN, "Room", Prefab, (prefab: Prefab) => {
            if (!prefab) {
                Client.Instance.showPromptDialog("游戏加载失败");
                return;
            }
            Client.Instance.initGameRoom(prefab);
        });
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
