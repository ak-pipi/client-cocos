/**
 * 通用房间基类 (RoomBase)
 * 所有六款游戏牌桌的基类，提供：
 * - 房间生命周期管理
 * - 玩家位管理
 * - 倒计时控制
 * - 聊天/表情入口
 * - 解散投票
 * - 托管状态
 * - 断线重连
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, Sprite, Prefab, instantiate, director } from 'cc';
import { RoomState, PlayerRoomState, SeatPosition, RoomPlayerInfo, RoomInfo, RoundSettlementData, FinalSettlementData, CreateRoomOptions } from './GameTypes';
import { WsEventRouter, ServerEventType, ClientEventType } from '../Network/WsEventRouter';
import { ProtoAdapter } from '../Network/ProtoAdapter';

const { ccclass, property } = _decorator;

// ==================== 事件回调类型 ====================

export interface RoomEventCallbacks {
    /** 房间状态变化 */
    onRoomStateChanged?: (state: RoomState) => void;
    /** 玩家加入 */
    onPlayerJoined?: (player: RoomPlayerInfo) => void;
    /** 玩家离开 */
    onPlayerLeft?: (playerId: string) => void;
    /** 玩家准备状态变化 */
    onPlayerReadyChanged?: (playerId: string, ready: boolean) => void;
    /** 游戏开始 */
    onGameStart?: () => void;
    /** 单局结算 */
    onRoundSettlement?: (data: RoundSettlementData) => void;
    /** 总结算 */
    onFinalSettlement?: (data: FinalSettlementData) => void;
    /** 断线提示 */
    onDisconnect?: () => void;
    /** 重连成功 */
    onReconnect?: () => void;
    /** 房间解散 */
    onRoomDissolved?: () => void;
}

@ccclass('RoomBase')
export class RoomBase extends Component {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected topBar: Node = null;           // 顶部状态栏

    @property({ type: Node })
    protected seatContainer: Node = null;    // 玩家位容器

    @property({ type: Node })
    protected chatButton: Node = null;      // 聊天按钮（左下）

    @property({ type: Node })
    protected actionArea: Node = null;      // 操作按钮区（右下）

    @property({ type: Node })
    protected disconnectTip: Node = null;   // 断线提示

    @property({ type: Node })
    protected trusteePanel: Node = null;    // 托管面板

    @property({ type: Node })
    protected dissolvePanel: Node = null;   // 解散投票面板

    @property({ type: Label })
    protected roomNoLabel: Label = null;     // 房号显示

    @property({ type: Label })
    protected roundLabel: Label = null;      // 局数显示

    @property({ type: Label })
    protected countdownLabel: Label = null;  // 倒计时显示

    // ==================== 内部状态 ====================

    /** 当前房间信息 */
    protected roomInfo: RoomInfo | null = null;

    /** 当前房间状态 */
    protected currentState: RoomState = RoomState.Idle;

    /** 玩家位映射表 (seatIndex -> Node) */
    protected seatNodes: Map<number, Node> = new Map();

    /** 玩家信息映射表 (playerId -> RoomPlayerInfo) */
    protected playerMap: Map<string, RoomPlayerInfo> = new Map();

    /** 倒计时剩余秒数 */
    protected countdownSeconds: number = 0;

    /** 是否正在倒计时 */
    protected isCountingDown: boolean = false;

    /** 倒计时累计时间 */
    protected countdownElapsed: number = 0;

    /** 是否托管中 */
    protected isTrustee: boolean = false;

    /** 事件回调 */
    protected callbacks: RoomEventCallbacks = {};

    /** 游戏ID (子类设置) */
    protected gameId: string = '';

    onLoad(): void {
        this.setupEventListeners();
        this.hideAllPanels();
    }

    start(): void {
        // 子类可覆盖初始化逻辑
    }

    update(deltaTime: number): void {
        if (this.isCountingDown && this.countdownSeconds > 0) {
            this.countdownElapsed += deltaTime;
            if (this.countdownElapsed >= 1.0) {
                this.countdownElapsed -= 1.0;
                this.countdownSeconds--;
                this.updateCountdownDisplay();
                if (this.countdownSeconds <= 0) {
                    this.onCountdownExpired();
                }
            }
        }
    }

    // ==================== 初始化 ====================

    /**
     * 初始化房间（创建房间后调用）
     */
    init(roomInfo: RoomInfo): void {
        this.roomInfo = roomInfo;
        this.currentState = roomInfo.gameState;
        this.updateRoomDisplay();
        this.initSeats();
        console.log(`[RoomBase] Room initialized: ${roomInfo.roomNo}`);
    }

    /**
     * 设置事件回调
     */
    setCallbacks(callbacks: RoomEventCallbacks): void {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    // ==================== UI 更新方法 ====================

    /** 更新顶部栏显示 */
    protected updateRoomDisplay(): void {
        if (this.roomNoLabel && this.roomInfo) {
            this.roomNoLabel.string = `房号: ${this.roomInfo.roomNo}`;
        }
        if (this.roundLabel && this.roomInfo) {
            this.roundLabel.string = `${this.roomInfo.currentRound}/${this.roomInfo.totalRounds}`;
        }
    }

    /** 更新倒计时显示 */
    protected updateCountdownDisplay(): void {
        if (this.countdownLabel) {
            this.countdownLabel.string = String(this.countdownSeconds);
        }
    }

    /** 隐藏所有面板 */
    protected hideAllPanels(): void {
        if (this.disconnectTip) this.disconnectTip.active = false;
        if (this.trusteePanel) this.trusteePanel.active = false;
        if (this.dissolvePanel) this.dissolvePanel.active = false;
    }

    // ==================== 座位管理 (子类实现) ====================

    /** 初始化座位布局 (根据玩家数量) */
    protected initSeats(): void {
        this.seatNodes.clear();
        // 子类应根据具体游戏的玩家数量创建座位节点
        const seatCount = this.getSeatCount();
        for (let i = 0; i < seatCount; i++) {
            this.createSeatNode(i);
        }
    }

    /** 获取当前游戏的座位数量 (子类覆写) */
    protected getSeatCount(): number {
        return 2; // 默认 2 人
    }

    /** 创建单个座位节点 (子类可覆写以自定义样式) */
    protected createSeatNode(seatIndex: number): Node {
        // 基本实现：创建空节点占位
        // 实际使用时应通过预制体实例化
        const node = new Node(`Seat_${seatIndex}`);
        if (this.seatContainer) {
            node.parent = this.seatContainer;
        }
        this.seatNodes.set(seatIndex, node);
        return node;
    }

    /** 更新指定座位上的玩家信息 */
    protected updateSeatPlayer(seatIndex: number, player: RoomPlayerInfo | null): void {
        const seatNode = this.seatNodes.get(seatIndex);
        if (!seatNode) return;

        if (!player) {
            // 清空座位
            seatNode.removeAllChildren();
            return;
        }

        // 更新玩家信息到座位UI
        this.playerMap.set(player.playerId, player);
        this.renderSeatInfo(seatNode, player);
    }

    /** 渲染座位信息 (子类覆写以自定义渲染) */
    protected renderSeatInfo(seatNode: Node, player: RoomPlayerInfo): void {
        // 基本实现：子类应覆写此方法来渲染头像、昵称、状态等
        console.log(`[RoomBase] Render seat ${player.seatIndex}: ${player.nickname} (${player.state})`);
    }

    // ==================== 倒计时 ====================

    /** 开始倒计时 */
    public startCountdown(seconds: number): void {
        this.countdownSeconds = seconds;
        this.countdownElapsed = 0;
        this.isCountingDown = true;
        this.updateCountdownDisplay();
    }

    /** 停止倒计时 */
    public stopCountdown(): void {
        this.isCountingDown = false;
        this.countdownSeconds = 0;
        this.updateCountdownDisplay();
    }

    /** 倒计时结束回调 (超时自动处理) */
    protected onCountdownExpired(): void {
        this.isCountingDown = false;
        console.log('[RoomBase] Countdown expired');
        // 默认行为：子类可覆写，如自动出牌/托管等
        this.onAutoAction();
    }

    /** 超时自动操作 (子类覆写) */
    protected onAutoAction(): void {
        // 默认进入托管或过
        if (!this.isTrustee) {
            this.setTrustee(true);
        }
    }

    // ==================== 托管 ====================

    /** 设置托管状态 */
    public setTrustee(trustee: boolean): void {
        this.isTrustee = trustee;
        if (this.trusteePanel) {
            this.trusteePanel.active = trustee;
        }
        console.log(`[RoomBase] Trustee mode: ${trustee}`);

        if (trustee) {
            WsEventRouter.Instance.action('trust', { enable: true });
        } else {
            WsEventRouter.Instance.action('cancel_trust', { enable: false });
        }
    }

    // ==================== 断线重连 ====================

    /** 显示断线提示 */
    public showDisconnectTip(show: boolean): void {
        if (this.disconnectTip) {
            this.disconnectTip.active = show;
        }
        if (show) {
            this.callbacks.onDisconnect?.();
        }
    }

    /** 处理重连数据 */
    public handleReconnect(data: any): void {
        console.log('[RoomBase] Handling reconnect data');
        this.showDisconnectTip(false);

        // 根据重连数据恢复房间状态
        if (data.roomState) {
            this.currentState = data.roomState as RoomState;
        }
        if (data.players) {
            for (const p of data.players) {
                this.playerMap.set(p.playerId, p);
            }
        }

        this.callbacks.onReconnect?.();
    }

    // ==================== 解散投票 ====================

    /** 显示解散投票面板 */
    public showDissolveVote(initiatorId: string): void {
        if (this.dissolvePanel) {
            this.dissolvePanel.active = true;
        }
    }

    /** 投票响应 */
    public voteDissolve(agree: boolean): void {
        WsEventRouter.Instance.dissolveVote(agree);
        if (this.dissolvePanel) {
            this.dissolvePanel.active = false;
        }
    }

    // ==================== 聊天入口 ====================

    /** 打开聊天面板 */
    public openChat(): void {
        console.log('[RoomBase] Open chat');
        // 子类可覆写以打开具体聊天UI
    }

    // ==================== 退出房间 ====================

    /** 返回大厅 */
    public backToHall(): void {
        // 通知服务端离开
        WsEventRouter.Instance.send(ClientEventType.ROOM_JOIN, { action: 'leave' }, true);

        // 清理资源
        this.cleanup();

        // 切换回大厅场景/界面
        const { Client } = require('../Game/Client');
        Client.Instance.backToGameHall();
    }

    /** 清理资源 */
    protected cleanup(): void {
        this.stopCountdown();
        this.hideAllPanels();
        this.seatNodes.clear();
        this.playerMap.clear();
        this.roomInfo = null;
        WsEventRouter.Instance.removeAllHandlers();
    }

    // ==================== 事件监听 ====================

    /** 设置 WS 事件监听 */
    protected setupEventListeners(): void {
        // 注册房间相关事件处理
        WsEventRouter.Instance.on(ServerEventType.ROOM_UPDATE, {
            handleEvent: (type, data) => this.handleRoomUpdate(data),
        });

        WsEventRouter.Instance.on(ServerEventType.GAME_START, {
            handleEvent: (type, data) => this.handleGameStart(data),
        });

        WsEventRouter.Instance.on(ServerEventType.GAME_SETTLEMENT, {
            handleEvent: (type, data) => this.handleRoundSettlement(data),
        });

        WsEventRouter.Instance.on(ServerEventType.ROOM_FINAL_SETTLEMENT, {
            handleEvent: (type, data) => this.handleFinalSettlement(data),
        });

        WsEventRouter.Instance.on(ServerEventType.USER_RECONNECT, {
            handleEvent: (type, data) => this.handleReconnect(data),
        });
    }

    /** 处理房间更新事件 */
    protected handleRoomUpdate(data: any): boolean {
        console.log('[RoomBase] Room update:', data);

        if (data.state) {
            this.currentState = data.state as RoomState;
            this.callbacks.onRoomStateChanged?.(this.currentState);
        }

        // 处理玩家变化
        if (data.players) {
            for (const pData of data.players) {
                const existing = this.playerMap.get(pData.playerId);
                if (!existing) {
                    // 新玩家加入
                    const playerInfo: RoomPlayerInfo = {
                        playerId: pData.playerId,
                        nickname: pData.nickname,
                        avatar: pData.avatar,
                        seatIndex: pData.seatIndex,
                        seatPosition: this.indexToPosition(pData.seatIndex),
                        state: pData.state || PlayerRoomState.NotReady,
                        isOwner: pData.isOwner || false,
                    };
                    this.playerMap.set(playerInfo.playerId, playerInfo);
                    this.updateSeatPlayer(pData.seatIndex, playerInfo);
                    this.callbacks.onPlayerJoined?.(playerInfo);
                } else {
                    // 更新现有玩家
                    Object.assign(existing, pData);
                    if (pData.state !== undefined) {
                        existing.state = pData.state as PlayerRoomState;
                        this.callbacks.onPlayerReadyChanged?.(existing.playerId, existing.state === PlayerRoomState.Ready);
                    }
                    this.updateSeatPlayer(existing.seatIndex, existing);
                }
            }
        }

        return true;
    }

    /** 处理游戏开始事件 */
    protected handleGameStart(data: any): boolean {
        this.currentState = RoomState.Playing;
        this.stopCountdown();
        console.log('[RoomBase] Game started');
        this.callbacks.onGameStart?.();
        return true;
    }

    /** 处理单局结算事件 */
    protected handleRoundSettlement(data: any): boolean {
        this.currentState = RoomState.RoundSettlement;
        this.stopCountdown();
        const settlement: RoundSettlementData = data as RoundSettlementData;
        console.log(`[RoomBase] Round ${settlement.roundNumber} settlement`);
        this.callbacks.onRoundSettlement?.(settlement);
        return true;
    }

    /** 处理总结算事件 */
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
