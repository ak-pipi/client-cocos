/**
 * 通用游戏类型定义
 * 所有六款游戏共享的类型与枚举
 *
 * Author: AI Assistant
 */

// ==================== 房间状态 ====================

/** 房间状态 */
export enum RoomState {
    /** 空闲 */
    Idle = 'idle',
    /** 等待中 (玩家加入后等待开始) */
    Waiting = 'waiting',
    /** 游戏进行中 */
    Playing = 'playing',
    /** 单局结算 */
    RoundSettlement = 'round_settlement',
    /** 总结算 */
    FinalSettlement = 'final_settlement',
    /** 已解散 */
    Dissolved = 'dissolved',
}

// ==================== 玩家状态 ====================

/** 房间内玩家状态 */
export enum PlayerRoomState {
    /** 未准备 */
    NotReady = 'not_ready',
    /** 已准备 */
    Ready = 'ready',
    /** 已离线 */
    Offline = 'offline',
    /** 托管中 */
    Trustee = 'trustee',
}

/** 座位位置 */
export enum SeatPosition {
    Self = 'self',       // 自己（底部）
    Left = 'left',       // 左边对手
    Right = 'right',     // 右边对手
    Top = 'top',         // 对面（3-4人时）
}

// ==================== 操作类型 ====================

/** 通用操作按钮 */
export enum GameAction {
    Pass = 'pass',
    Hint = 'hint',
    Trust = 'trust',
    CancelTrust = 'cancel_trust',
}

/** 麻将特有操作 */
export enum MahjongAction {
    Chi = 'chi',
    Peng = 'peng',
    Gang = 'gang',
    Hu = 'hu',
    Ting = 'ting',
}

/** 扑克牌型 */
export enum PokerPattern {
    Single = 'single',
    Pair = 'pair',
    Triple = 'triple',
    TripleWithOne = 'triple_one',
    TripleWithPair = 'triple_pair',
    Straight = 'straight',
    ConsecutivePairs = 'consecutive_pairs',
    Airplane = 'airplane',
    AirplaneWithSingles = 'airplane_singles',
    AirplaneWithPairs = 'airplane_pairs',
    FourWithTwo = 'four_two',
    FourWithTwoPairs = 'four_two_pairs',
    Bomb = 'bomb',
    Rocket = 'rocket',
}

// ==================== 结算数据结构 ====================

/** 单个玩家结算信息 */
export interface PlayerSettlementInfo {
    playerId: string;
    nickname: string;
    avatar: string;
    score: number;           // 本局得分（正负）
    totalScore: number;      // 累计得分
    isWinner?: boolean;
    specialHands?: string[]; // 特殊牌型描述
}

/** 单局结算数据 */
export interface RoundSettlementData {
    roundNumber: number;         // 局数
    winnerId: string;            // 赢家ID
    winType: string;             // 胡牌/获胜方式
    players: PlayerSettlementInfo[];
    baseScore: number;           // 基础分
    multiplier: number;          // 番数/倍率
}

/** 总结算数据 */
export interface FinalSettlementData {
    roomId: string;
    roomNo: string;
    totalRounds: number;
    players: Array<{
        playerId: string;
        nickname: string;
        avatar: string;
        totalScore: number;
        roundsWon: number;
        maxSingleWin: number;
    }>;
}

// ==================== 玩家数据 ====================

/** 房间内玩家信息 */
export interface RoomPlayerInfo {
    playerId: string;
    nickname: string;
    avatar: string;
    seatIndex: number;
    seatPosition: SeatPosition;
    state: PlayerRoomState;
    isOwner: boolean;
    readyTime?: number;
    offlineTime?: number;
}

// ==================== 房间配置 ====================

/** 创建房间参数 */
export interface CreateRoomOptions {
    gameId: string;
    gameMode: string;          // 如 "8rounds", "1round", etc.
    ruleConfig: Record<string, any>;
    feeMode: 'owner' | 'aa' | 'winner'; // 房费模式
}

/** 房间信息 */
export interface RoomInfo {
    roomId: string;
    roomNo: string;
    ownerId: string;
    gameState: RoomState;
    currentRound: number;
    totalRounds: number;
    ruleConfig: Record<string, any>;
    players: RoomPlayerInfo[];
    createTime: number;
}
