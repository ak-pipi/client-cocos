/**
 * 游戏事件映射表 (GameEventMap)
 * 
 * 定义所有六款游戏的服务端WS事件 → 游戏房间方法映射
 * 用于 WsEventRouter 初始化时自动注册
 *
 * Author: AI Assistant
 */

import { GameFactory, GameId } from './GameFactory';

// ==================== 事件类型常量 ====================

/** 服务端推送的事件类型 */
export enum ServerGameEventType {
    // ---- 通用(所有游戏共用) ----
    ROOM_UPDATE = 'room_update',           // 房间状态更新
    GAME_START = 'game_start',             // 游戏开始
    ROUND_SETTLEMENT = 'round_settlement', // 单局结算
    FINAL_SETTLEMENT = 'final_settlement', // 总结算
    PLAYER_JOIN = 'player_join',           // 玩家加入
    PLAYER_LEAVE = 'player_leave',         // 玩家离开
    PLAYER_READY = 'player_ready',         // 玩家准备
    DISSOLVE_VOTE = 'dissolve_vote',       // 解散投票
    DISSOLVE_RESULT = 'dissolve_result',   // 投票结果
    RECONNECT_DATA = 'reconnect_data',     // 重连数据
    COUNTDOWN = 'countdown',               // 倒计时同步
    TRUSTEE_CHANGE = 'trustee_change',     // 托管状态变化
    ERROR = 'error',                       // 错误消息
    KICK = 'kick',                         // 被踢出房间

    // ---- 麻将特有 (桃江/红中/长沙) ----
    MJ_DEAL = 'mj_deal',                   // 发牌
    MJ_DRAW = 'mj_draw',                   // 摸牌
    MJ_DISCARD = 'mj_discard',             // 出牌
    MJ_REQUEST_ACTIONS = 'mj_request_actions', // 请求操作(吃碰杠胡)
    MJ_ACTION_RESULT = 'mj_action_result',     // 操作结果通知
    MJ_MELD_SHOW = 'mj_meld_show',         // 组合展示(碰杠吃)
    MJ_TING_HINT = 'mj_ting_hint',         // 听牌提示
    MJ_HU = 'mj_hu',                       // 胡牌通知
    MJ_GANG_BONUS = 'mj_gang_bonus',       // 杠分奖励

    // ---- 扑克特有 (跑得快) ----
    PK_DEAL = 'pk_deal',                   // 发牌
    PK_PLAY = 'pk_play',                   // 出牌
    PK_PASS = 'pk_pass',                   // 不出
    PK_ROUND_END = 'pk_round_end',         // 一轮结束(比大小)
    PK_GAME_OVER = 'pk_game_over',         // 游戏结束(有人出完)
    PK_REQUEST_PLAY = 'pk_request_play',   // 请求出牌

    // ---- 字牌特有 (歪胡子) ----
    ZP_DEAL = 'zp_deal',                   // 发牌
    ZP_DISCARD = 'zp_discard',             // 出牌
    ZP_REQUEST_ACTIONS = 'zp_request_actions', // 请求操作(偎提碰跑吃胡)
    ZP_MELD_SHOW = 'zp_meld_show',         // 组合展示
    ZP_HU = 'zp_hu',                       // 胡牌

    // ---- 千分特有 ----
    QF_BID = 'qf_bid',                     // 叫分/抢庄
    QF_DIPAI = 'qf_dipai',                 // 底牌
    QF_TRICK_END = 'qf_trick_end',         // 一墩结束
    QF_PHASE_CHANGE = 'qf_phase_change',   // 阶段变化
}

// ==================== 事件处理器注册 ====================

/** 事件处理器定义 */
export interface GameEventHandler {
    eventType: ServerGameEventType;
    handler: (data: any) => boolean;
}

/**
 * 获取所有游戏事件的处理器列表
 * 用于在进入游戏房间时自动注册到 WsEventRouter
 */
export function getGameEventHandlers(): GameEventHandler[] {
    return [
        // ====== 通用事件 ======
        {
            eventType: ServerGameEventType.ROOM_UPDATE,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('room_update', data),
        },
        {
            eventType: ServerGameEventType.GAME_START,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('game_start', data),
        },
        {
            eventType: ServerGameEventType.ROUND_SETTLEMENT,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('round_settlement', data),
        },
        {
            eventType: ServerGameEventType.FINAL_SETTLEMENT,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('final_settlement', data),
        },
        {
            eventType: ServerGameEventType.PLAYER_JOIN,
            handler: (data) => {
                console.log('[GameEvent] Player joined:', data);
                return true;
            },
        },
        {
            eventType: ServerGameEventType.PLAYER_LEAVE,
            handler: (data) => {
                console.log('[GameEvent] Player left:', data);
                return true;
            },
        },
        {
            eventType: ServerGameEventType.DISSOLVE_VOTE,
            handler: (data) => {
                const room = GameFactory.Instance.getCurrentRoom();
                if (room) room.showDissolveVote(data.initiatorId);
                return true;
            },
        },
        {
            eventType: ServerGameEventType.RECONNECT_DATA,
            handler: (data) => {
                const room = GameFactory.Instance.getCurrentRoom();
                if (room) room.handleReconnect(data);
                return true;
            },
        },

        // ====== 麻将事件 ======
        {
            eventType: ServerGameEventType.MJ_DEAL,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('deal', data),
        },
        {
            eventType: ServerGameEventType.MJ_DRAW,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('draw_tile', data),
        },
        {
            eventType: ServerGameEventType.MJ_DISCARD,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('player_discard', data),
        },
        {
            eventType: ServerGameEventType.MJ_REQUEST_ACTIONS,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('request_actions', data),
        },
        {
            eventType: ServerGameEventType.MJ_HU,
            handler: (data) => {
                console.log('[GameEvent] Mahjong hu:', data);
                return true;
            },
        },

        // ====== 扑克事件 ======
        {
            eventType: ServerGameEventType.PK_DEAL,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('deal_cards', data),
        },
        {
            eventType: ServerGameEventType.PK_PLAY,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('player_play', data),
        },
        {
            eventType: ServerGameEventType.PK_REQUEST_PLAY,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('request_play', data),
        },
        {
            eventType: ServerGameEventType.PK_ROUND_END,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('round_end', data),
        },
        {
            eventType: ServerGameEventType.PK_GAME_OVER,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('game_over', data),
        },

        // ====== 字牌事件 ======
        {
            eventType: ServerGameEventType.ZP_DEAL,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('zipai_deal', data),
        },
        {
            eventType: ServerGameEventType.ZP_DISCARD,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('zipai_deal', data),
        }, // 复用 deal
        {
            eventType: ServerGameEventType.ZP_REQUEST_ACTIONS,
            handler: (data) => GameFactory.Instance.dispatchServerEvent('request_zipai_actions', data),
        },
        {
            eventType: ServerGameEventType.ZP_HU,
            handler: (data) => {
                console.log('[GameEvent] Zipai hu:', data);
                return true;
            },
        },

        // ====== 千分事件 ======
        {
            eventType: ServerGameEventType.QF_PHASE_CHANGE,
            handler: (data) => {
                console.log('[GameEvent] Qianfen phase change:', data);
                return true;
            },
        },
        {
            eventType: ServerGameEventType.QF_TRICK_END,
            handler: (data) => {
                console.log('[GameEvent] Qianfen trick end:', data);
                return true;
            },
        },
    ];
}
