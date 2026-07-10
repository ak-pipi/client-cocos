/**
 * 游戏枚举定义 (GameEnums)
 * 独立文件，避免循环依赖
 *
 * 注意：此文件不导入任何本地模块，仅依赖 Cocos Creator 基础类型
 *
 * Author: AI Assistant
 */

// ==================== 游戏ID ====================

/** 支持的所有游戏ID */
export enum GameId {
    TaojiangMahjong = 'taojiang_mahjong',
    HongzhongMahjong = 'hongzhong_mahjong',
    ChangshaMahjong = 'changsha_mahjong',
    Doudizhu = 'doudizhu_poker',
    Paodekuai = 'paodekuai_poker',
    Waihuzi = 'yiyangwaihuzi_zipai',
    Qianfen = 'yuanjiangqianfen_poker',
}

// ==================== 游戏类型 ====================

/** 游戏类型分类 */
export enum GameType {
    Mahjong = 'mahjong',   // 麻将类
    Poker = 'poker',       // 扑克类
    Zipai = 'zipai',       // 字牌类
}

// ==================== 元信息接口 ====================

/** 游戏元信息 */
export interface GameMetaInfo {
    id: GameId;
    name: string;          // 中文名称
    type: GameType;        // 类型分类
    playerCount: number;   // 玩家数量
    priority: number;      // 优先级(P0=0, P1=1, P2=2)
}

// ==================== 倍数配置 ====================

/** 底注+局数组合选项 */
export interface StakeOption {
    baseScore: number;      // 底注
    roundCount: number;      // 局数
    districtId: number;      // 对应的 district ID
    label: string;          // 显示文本，如 "底注1 · 4局"
}

/** 每种游戏的倍数选项列表 */
export const GAME_STAKE_OPTIONS: Record<GameId, StakeOption[]> = {
    [GameId.TaojiangMahjong]: [
        { baseScore: 5, roundCount: 1, districtId: 9, label: '台桌5 · 单局' },
        { baseScore: 10, roundCount: 1, districtId: 10, label: '台桌10 · 单局' },
        { baseScore: 25, roundCount: 1, districtId: 11, label: '台桌25 · 单局' },
        { baseScore: 1, roundCount: 8, districtId: 12, label: '台桌1 · 8局' },
        { baseScore: 2, roundCount: 8, districtId: 13, label: '台桌2 · 8局' },
        { baseScore: 5, roundCount: 8, districtId: 14, label: '台桌5 · 8局' },
        { baseScore: 10, roundCount: 8, districtId: 15, label: '台桌10 · 8局' },
        { baseScore: 20, roundCount: 8, districtId: 16, label: '台桌20 · 8局' },
    ],
    [GameId.HongzhongMahjong]: [
        { baseScore: 1, roundCount: 8, districtId: 17, label: '底注1 · 8局' },
        { baseScore: 2, roundCount: 8, districtId: 18, label: '底注2 · 8局' },
        { baseScore: 5, roundCount: 8, districtId: 19, label: '底注5 · 8局' },
        { baseScore: 10, roundCount: 8, districtId: 20, label: '底注10 · 8局' },
    ],
    [GameId.ChangshaMahjong]: [
        { baseScore: 1, roundCount: 8, districtId: 21, label: '底注1 · 8局' },
        { baseScore: 2, roundCount: 8, districtId: 22, label: '底注2 · 8局' },
        { baseScore: 5, roundCount: 8, districtId: 23, label: '底注5 · 8局' },
        { baseScore: 10, roundCount: 8, districtId: 24, label: '底注10 · 8局' },
    ],
    [GameId.Doudizhu]: [
        { baseScore: 1, roundCount: 8, districtId: 37, label: '底注1 · 8局' },
        { baseScore: 2, roundCount: 8, districtId: 38, label: '底注2 · 8局' },
        { baseScore: 5, roundCount: 8, districtId: 39, label: '底注5 · 8局' },
        { baseScore: 10, roundCount: 8, districtId: 40, label: '底注10 · 8局' },
    ],
    [GameId.Paodekuai]: [
        { baseScore: 1, roundCount: 8, districtId: 25, label: '底注1 · 8局' },
        { baseScore: 2, roundCount: 8, districtId: 26, label: '底注2 · 8局' },
        { baseScore: 5, roundCount: 8, districtId: 27, label: '底注5 · 8局' },
        { baseScore: 10, roundCount: 8, districtId: 28, label: '底注10 · 8局' },
    ],
    [GameId.Waihuzi]: [
        { baseScore: 1, roundCount: 8, districtId: 29, label: '底注1 · 8局' },
        { baseScore: 2, roundCount: 8, districtId: 30, label: '底注2 · 8局' },
        { baseScore: 5, roundCount: 8, districtId: 31, label: '底注5 · 8局' },
        { baseScore: 10, roundCount: 8, districtId: 32, label: '底注10 · 8局' },
    ],
    [GameId.Qianfen]: [
        { baseScore: 1, roundCount: 8, districtId: 33, label: '底注1 · 8局' },
        { baseScore: 2, roundCount: 8, districtId: 34, label: '底注2 · 8局' },
        { baseScore: 5, roundCount: 8, districtId: 35, label: '底注5 · 8局' },
        { baseScore: 10, roundCount: 8, districtId: 36, label: '底注10 · 8局' },
    ],
};
