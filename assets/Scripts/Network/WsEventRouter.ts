/**
 * WebSocket 事件路由器
 * 屏蔽底层消息差异（MsgXXX vs 新事件协议），
 * 提供统一的事件分发机制。
 *
 * 支持的客户端发送事件：
 *   - room.join / room.ready / game.action / game.chat / room.dissolve_vote / heartbeat
 *
 * 支持的服务端推送事件：
 *   - room.update / game.start / game.deal / game.turn / game.action_result
 *   - game.settlement / room.final_settlement / user.reconnect / risk.notice
 *
 * Author: AI Assistant
 */

import { NetworkManager } from '../Manager/NetworkManager';
import msgpack from 'msgpack-lite/dist/msgpack.min.js';
import { Base64 } from 'js-base64';

// ==================== 事件类型定义 ====================

/** 客户端发送事件类型 */
export enum ClientEventType {
    /** 加入房间 */
    ROOM_JOIN = 'room.join',
    /** 准备 */
    ROOM_READY = 'room.ready',
    /** 游戏操作 */
    GAME_ACTION = 'game.action',
    /** 聊天 */
    GAME_CHAT = 'game.chat',
    /** 解散投票 */
    ROOM_DISSOLVE_VOTE = 'room.dissolve_vote',
    /** 心跳 */
    HEARTBEAT = 'heartbeat',
}

/** 服务端推送事件类型 */
export enum ServerEventType {
    /** 房间状态更新 */
    ROOM_UPDATE = 'room.update',
    /** 游戏开始 */
    GAME_START = 'game.start',
    /** 发牌 */
    GAME_DEAL = 'game.deal',
    /** 轮转 */
    GAME_TURN = 'game.turn',
    /** 操作结果 */
    GAME_ACTION_RESULT = 'game.action_result',
    /** 单局结算 */
    GAME_SETTLEMENT = 'game.settlement',
    /** 总结算 */
    ROOM_FINAL_SETTLEMENT = 'room.final_settlement',
    /** 重连数据 */
    USER_RECONNECT = 'user.reconnect',
    /** 风控通知 */
    RISK_NOTICE = 'risk.notice',
}

/** 事件处理器接口 */
export interface WsEventHandler {
    handleEvent(eventType: string, data: any): boolean;
}

/** 统一事件结构 */
export interface WsEvent {
    type: string;
    data: any;
    timestamp?: number;
    source: 'new' | 'legacy';
}

// ==================== 协议适配映射 ====================

/** 旧 MsgXXX 到新事件类型的映射 */
const LEGACY_TO_NEW_MAP: Record<string, ServerEventType> = {
    // 房间相关
    'MsgRoomInfo': ServerEventType.ROOM_UPDATE,
    'MsgRoomStateChange': ServerEventType.ROOM_UPDATE,
    // 游戏流程
    'MsgGameStart': ServerEventType.GAME_START,
    'MsgGameDeal': ServerEventType.GAME_DEAL,
    'MsgPlayerTurn': ServerEventType.GAME_TURN,
    'MsgActionNotify': ServerEventType.GAME_ACTION_RESULT,
    // 结算
    'MsgRoundSettlement': ServerEventType.GAME_SETTLEMENT,
    'MsgFinalSettlement': ServerEventType.ROOM_FINAL_SETTLEMENT,
    // 重连
    'MsgReconnectData': ServerEventType.USER_RECONNECT,
};

// ==================== 主类 ====================

export class WsEventRouter {
    private static _instance: WsEventRouter | null = null;

    public static get Instance(): WsEventRouter {
        if (!WsEventRouter._instance) {
            WsEventRouter._instance = new WsEventRouter();
        }
        return WsEventRouter._instance;
    }

    /** 是否使用新协议模式 */
    private useNewProtocol: boolean = false;

    /** 事件处理器注册表 (按事件类型) */
    private eventHandlers: Map<string, WsEventHandler[]> = new Map();

    /** 全局事件监听器 */
    private globalListeners: Array<(event: WsEvent) => void> = [];

    /**
     * 设置协议模式
     * @param useNew true 使用新事件协议，false 使用旧 MsgXXX 协议
     */
    setProtocolMode(useNew: boolean): void {
        this.useNewProtocol = useNew;
        console.log(`[WsEventRouter] Protocol mode: ${useNew ? 'NEW (event-based)' : 'LEGACY (MsgXXX)'}`);
    }

    /**
     * 获取当前协议模式
     */
    get isUsingNewProtocol(): boolean {
        return this.useNewProtocol;
    }

    // ==================== 发送事件 ====================

    /**
     * 发送事件到服务端
     * @param eventType 事件类型
     * @param data 事件数据
     * @param needSignature 是否需要签名
     */
    send(eventType: ClientEventType | string, data: any, needSignature: boolean = false): void {
        if (this.useNewProtocol) {
            this.sendNewProtocol(eventType, data);
        } else {
            this.sendLegacyProtocol(eventType, data, needSignature);
        }
    }

    /**
     * 使用新协议格式发送
     * 格式：{ event: "room.join", payload: {...}, ts: 1234567890 }
     */
    private sendNewProtocol(eventType: string, data: any): void {
        const message = {
            event: eventType,
            payload: data || {},
            ts: Date.now(),
        };
        this.sendRaw(message);
    }

    /**
     * 使用旧协议格式发送
     * 格式：{ msgType: "MsgXXX", msgPack: Base64(msgpack) }
     */
    private sendLegacyProtocol(eventType: string, data: any, needSignature: boolean): void {
        const legacyType = this.clientEventToLegacy(eventType);
        if (!legacyType) {
            console.warn(`[WsEventRouter] No legacy mapping for event: ${eventType}`);
            return;
        }
        NetworkManager.Instance.sendMessage(legacyType, data, needSignature);
    }

    /**
     * 将新客户端事件映射为旧 Msg 类型
     */
    private clientEventToLegacy(eventType: string): string | null {
        const map: Record<string, string> = {
            [ClientEventType.ROOM_JOIN]: 'MsgJoinRoom',
            [ClientEventType.ROOM_READY]: 'MsgReady',
            [ClientEventType.GAME_ACTION]: 'MsgPlayAction',
            [ClientEventType.GAME_CHAT]: 'MsgChat',
            [ClientEventType.ROOM_DISSOLVE_VOTE]: 'MsgDissolveVote',
            [ClientEventType.HEARTBEAT]: 'MsgHeartbeat',
        };
        return map[eventType] || null;
    }

    /**
     * 原始消息发送 (新协议用)
     */
    private sendRaw(message: any): void {
        try {
            const buf = msgpack.encode(message);
            if (!buf) return;

            // 包装成兼容格式发送
            const wrappedData = {
                msgType: '__event__',
                msgPack: Base64.fromUint8Array(buf),
            };
            const finalBuf = msgpack.encode(wrappedData);

            // 直接通过底层连接发送
            NetworkManager.Instance.sendRaw(finalBuf);
        } catch (err) {
            console.error('[WsEventRouter] Send error:', err);
        }
    }

    // ==================== 接收事件处理 ====================

    /**
     * 处理接收到的消息（从 NetMsgManager 调用）
     * @param msgType 消息类型 (旧) 或 事件名 (新)
     * @param msg 消息体
     * @returns 是否已处理
     */
    handleMessage(msgType: string, msg: any): boolean {
        let event: WsEvent;

        // 判断是新协议还是旧协议
        if (this.isNewProtocolMessage(msgType)) {
            event = {
                type: msg.event || msgType,
                data: msg.payload || msg,
                timestamp: msg.ts,
                source: 'new',
            };
        } else {
            // 旧协议，尝试转换为新事件类型
            const mappedType = LEGACY_TO_NEW_MAP[msgType];
            event = {
                type: mappedType || msgType,
                data: msg,
                source: 'legacy',
            };
        }

        // 调用全局监听器
        for (const listener of this.globalListeners) {
            try {
                listener(event);
            } catch (err) {
                console.error('[WsEventRouter] Global listener error:', err);
            }
        }

        // 分发到具体事件处理器
        return this.dispatchToHandlers(event);
    }

    /**
     * 判断是否为新协议消息
     */
    private isNewProtocolMessage(msgType: string): boolean {
        // 新协议消息特征：
        // 1. 以 __event__ 为标识
        // 2. 或者直接是事件名称（不含 Msg 前缀）
        return (
            msgType === '__event__' ||
            (msgType && !msgType.startsWith('Msg') && !msgType.includes('.'))
        );
    }

    /**
     * 分发事件到注册的处理器
     */
    private dispatchToHandlers(event: WsEvent): boolean {
        const handlers = this.eventHandlers.get(event.type);
        if (!handlers || handlers.length === 0) {
            return false;
        }

        for (const handler of handlers) {
            try {
                const handled = handler.handleEvent(event.type, event.data);
                if (handled) {
                    return true;
                }
            } catch (err) {
                console.error(`[WsEventRouter] Handler error for ${event.type}:`, err);
            }
        }
        return true;
    }

    // ==================== 事件订阅 ====================

    /**
     * 注册事件处理器
     * @param eventType 事件类型
     * @param handler 处理器
     */
    on(eventType: string, handler: WsEventHandler): void {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    /**
     * 移除事件处理器
     */
    off(eventType: string, handler: WsEventHandler): void {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * 注册全局事件监听器（所有事件都会触发）
     */
    addGlobalListener(listener: (event: WsEvent) => void): void {
        this.globalListeners.push(listener);
    }

    /**
     * 移除全局事件监听器
     */
    removeGlobalListener(listener: (event: WsEvent) => void): void {
        const index = this.globalListeners.indexOf(listener);
        if (index !== -1) {
            this.globalListeners.splice(index, 1);
        }
    }

    /**
     * 移除指定事件的所有处理器
     */
    removeAllHandlers(eventType?: string): void {
        if (eventType) {
            this.eventHandlers.delete(eventType);
        } else {
            this.eventHandlers.clear();
        }
    }

    // ==================== 便捷方法 ====================

    /** 加入房间 */
    joinRoom(roomId: string): void {
        this.send(ClientEventType.ROOM_JOIN, { roomId }, true);
    }

    /** 准备 */
    ready(): void {
        this.send(ClientEventType.ROOM_READY, {}, true);
    }

    /** 游戏操作 */
    action(actionType: string, actionData: any): void {
        this.send(ClientEventType.GAME_ACTION, { type: actionType, ...actionData }, true);
    }

    /** 发送聊天 */
    chat(chatType: string, content: string): void {
        this.send(ClientEventType.GAME_CHAT, { type: chatType, content });
    }

    /** 解散投票 */
    dissolveVote(agree: boolean): void {
        this.send(ClientEventType.ROOM_DISSOLVE_VOTE, { agree }, true);
    }

    /** 发送心跳 */
    heartbeat(counter: number): void {
        this.send(ClientEventType.HEARTBEAT, { counter }, true);
    }
}
