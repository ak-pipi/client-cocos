/**
 * 协议适配器
 * 负责 MsgXXX 风格与业务事件风格的消息映射与转换
 *
 * 主要职责：
 * - 旧消息类型到新事件类型的映射
 * - 消息体格式转换
 * - 游戏特定协议扩展点
 *
 * Author: AI Assistant
 */

import { ServerEventType, WsEvent } from './WsEventRouter';

// ==================== 消息映射定义 ====================

/** 旧协议消息到新事件的完整映射配置 */
interface MessageMapping {
    /** 旧消息类型 */
    legacyType: string;
    /** 新事件类型 */
    newEventType: ServerEventType;
    /** 数据转换函数 (可选) */
    transform?: (data: any) => any;
    /** 描述 */
    description: string;
}

/** 游戏特定的操作码映射 */
interface ActionCodeMap {
    [legacyAction: string]: string; // 旧操作码 -> 新操作名
}

// ==================== 默认映射表 ====================

const DEFAULT_MESSAGE_MAPPINGS: MessageMapping[] = [
    // ===== 房间生命周期 =====
    { legacyType: 'MsgRoomInfo', newEventType: ServerEventType.ROOM_UPDATE, description: '房间信息更新' },
    { legacyType: 'MsgRoomStateChange', newEventType: ServerEventType.ROOM_UPDATE, description: '房间状态变更' },
    { legacyType: 'MsgPlayerJoin', newEventType: ServerEventType.ROOM_UPDATE, description: '玩家加入房间' },
    { legacyType: 'MsgPlayerLeave', newEventType: ServerEventType.ROOM_UPDATE, description: '玩家离开房间' },

    // ===== 游戏流程 =====
    { legacyType: 'MsgGameStart', newEventType: ServerEventType.GAME_START, description: '游戏开始' },
    { legacyType: 'MsgGameDeal', newEventType: ServerEventType.GAME_DEAL, description: '发牌' },
    { legacyType: 'MsgPlayerTurn', newEventType: ServerEventType.GAME_TURN, description: '轮转通知' },
    { legacyType: 'MsgActionNotify', newEventType: ServerEventType.GAME_ACTION_RESULT, description: '操作结果通知' },

    // ===== 结算 =====
    { legacyType: 'MsgRoundSettlement', newEventType: ServerEventType.GAME_SETTLEMENT, description: '单局结算' },
    { legacyType: 'MsgFinalSettlement', newEventType: ServerEventType.ROOM_FINAL_SETTLEMENT, description: '总结算' },

    // ===== 重连 =====
    { legacyType: 'MsgReconnectData', newEventType: ServerEventType.USER_RECONNECT, description: '重连数据' },

    // ===== 系统消息 =====
    { legacyType: 'MsgKickOut', newEventType: ServerEventType.RISK_NOTICE, description: '踢出/风控' },
];

/** 掼蛋专用操作码映射 */
const GUANDAN_ACTION_MAP: ActionCodeMap = {
    '1': 'play',       // 出牌
    '2': 'pass',       // 不出/过
    '3': 'hint',       // 提示
};

/** 麻将通用操作码映射 */
const MAHJONG_ACTION_MAP: ActionCodeMap = {
    '1': 'draw',       // 摸牌
    '2': 'discard',    // 出牌
    '3': 'chi',        // 吃
    '4': 'peng',       // 碰
    '5': 'gang',       // 杠
    '6': 'hu',         // 胡
    '7': 'pass',       // 过
    '8': 'ting',       // 听
    '9': 'trust',      // 托管
};

/** 扑克通用操作码映射 */
const POKER_ACTION_MAP: ActionCodeMap = {
    '1': 'play',       // 出牌
    '2': 'pass',       // 不要
    '3': 'hint',       // 提示
    '4': 'trust',      // 托管
};

/** 字牌（歪胡子）操作码映射 */
const ZIPAI_ACTION_MAP: ActionCodeMap = {
    '1': 'play',       // 出牌
    '2': 'chi',        // 吃
    '3': 'peng',       // 碰
    '4': 'wei',        // 偎
    '5': 'pao',        // 跑
    '6': 'ti',         // 提
    '7': 'hu',         // 胡
    '8': 'pass',       // 过
};

// ==================== 主类 ====================

export class ProtoAdapter {
    private static _instance: ProtoAdapter | null = null;

    public static get Instance(): ProtoAdapter {
        if (!ProtoAdapter._instance) {
            ProtoAdapter._instance = new ProtoAdapter();
        }
        return ProtoAdapter._instance;
    }

    /** 自定义映射表 (可追加或覆盖默认) */
    private customMappings: Map<string, MessageMapping> = new Map();

    /** 当前使用的游戏动作映射 */
    private currentActionMap: ActionCodeMap | null = null;

    constructor() {
        // 初始化默认映射
        for (const mapping of DEFAULT_MESSAGE_MAPPINGS) {
            this.customMappings.set(mapping.legacyType, mapping);
        }
    }

    // ==================== 消息类型转换 ====================

    /**
     * 将旧消息类型转换为新事件类型
     * @param legacyType 旧 MsgXXX 类型
     * @returns 新事件类型，未找到则返回原值
     */
    toNewEvent(legacyType: string): ServerEventType | string {
        const mapping = this.customMappings.get(legacyType);
        return mapping ? mapping.newEventType : legacyType;
    }

    /**
     * 将新事件类型转换为旧消息类型（反向查找）
     */
    toLegacyType(newEventType: string): string | null {
        for (const [, mapping] of this.customMappings) {
            if (mapping.newEventType === newEventType) {
                return mapping.legacyType;
            }
        }
        return null;
    }

    // ==================== 数据转换 ====================

    /**
     * 转换消息数据格式
     * @param legacyType 旧消息类型
     * @param data 原始数据
     * @returns 转换后的数据
     */
    transformData(legacyType: string, data: any): any {
        const mapping = this.customMappings.get(legacyType);
        if (mapping?.transform) {
            return mapping.transform(data);
        }
        return data;
    }

    /**
     * 完整转换：将旧协议消息转为统一 WsEvent 格式
     */
    convertLegacyToEvent(msgType: string, msgData: any): WsEvent {
        const eventType = this.toNewEvent(msgType);
        const transformedData = this.transformData(msgType, msgData);

        return {
            type: eventType,
            data: transformedData,
            source: 'legacy',
        };
    }

    // ==================== 动作码映射 ====================

    /**
     * 设置当前游戏类型，自动选择对应的动作映射
     * @param gameType 游戏类型 ('guandan' | 'mahjong' | 'poker' | 'zipai')
     */
    setGameType(gameType: string): void {
        switch (gameType) {
            case 'guandan':
                this.currentActionMap = GUANDAN_ACTION_MAP;
                break;
            case 'mahjong':
                this.currentActionMap = MAHJONG_ACTION_MAP;
                break;
            case 'poker':
                this.currentActionMap = POKER_ACTION_MAP;
                break;
            case 'zipai':
                this.currentActionMap = ZIPAI_ACTION_MAP;
                break;
            default:
                this.currentActionMap = null;
        }
        console.log(`[ProtoAdapter] Game type set to: ${gameType}`);
    }

    /**
     * 将旧操作码转换为新的操作名称
     * @param actionCode 旧操作码
     * @returns 新操作名称，未找到则返回原始值
     */
    mapActionCode(actionCode: string | number): string {
        const codeStr = String(actionCode);
        if (this.currentActionMap && this.currentActionMap[codeStr]) {
            return this.currentActionMap[codeStr];
        }
        return codeStr;
    }

    /**
     * 反向映射：将新操作名称转为旧操作码
     */
    reverseMapAction(actionName: string): string | undefined {
        if (!this.currentActionMap) return undefined;
        for (const [code, name] of Object.entries(this.currentActionMap)) {
            if (name === actionName) {
                return code;
            }
        }
        return undefined;
    }

    // ==================== 自定义映射注册 ====================

    /**
     * 注册自定义消息映射
     */
    registerMapping(mapping: MessageMapping): void {
        this.customMappings.set(mapping.legacyType, mapping);
    }

    /**
     * 批量注册自定义消息映射
     */
    registerMappings(mappings: MessageMapping[]): void {
        for (const mapping of mappings) {
            this.registerMapping(mapping);
        }
    }

    /**
     * 注册自定义动作映射
     */
    registerActionMap(gameType: string, actionMap: ActionCodeMap): void {
        console.log(`[ProtoAdapter] Custom action map registered for: ${gameType}`);
        // 可以存储多个游戏类型的映射
    }

    // ==================== 查询方法 ====================

    /**
     * 检查是否已注册指定类型的映射
     */
    hasMapping(legacyType: string): boolean {
        return this.customMappings.has(legacyType);
    }

    /**
     * 获取所有已注册的映射
     */
    getAllMappings(): MessageMapping[] {
        return Array.from(this.customMappings.values());
    }

    /**
     * 清除所有自定义映射（恢复默认）
     */
    resetToDefault(): void {
        this.customMappings.clear();
        for (const mapping of DEFAULT_MESSAGE_MAPPINGS) {
            this.customMappings.set(mapping.legacyType, mapping);
        }
        this.currentActionMap = null;
        console.log('[ProtoAdapter] Reset to default mappings');
    }
}
