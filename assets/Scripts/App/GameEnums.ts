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
    minCarryScore?: number; // 最低入场积分
    zhaNiao?: boolean;      // 跑得快扎鸟局
}

/** 每种游戏的倍数选项列表 */
export const GAME_STAKE_OPTIONS: Record<GameId, StakeOption[]> = {
    [GameId.TaojiangMahjong]: [
        { baseScore: 5, roundCount: 1, districtId: 9, label: '单局桃麻5' },
        { baseScore: 10, roundCount: 1, districtId: 10, label: '单局桃麻10' },
        { baseScore: 25, roundCount: 1, districtId: 11, label: '单局桃麻25' },
        { baseScore: 1, roundCount: 8, districtId: 12, label: '8局桃麻1' },
        { baseScore: 2, roundCount: 8, districtId: 13, label: '8局桃麻2' },
        { baseScore: 5, roundCount: 8, districtId: 14, label: '8局桃麻5' },
        { baseScore: 10, roundCount: 8, districtId: 15, label: '8局桃麻10' },
        { baseScore: 20, roundCount: 8, districtId: 16, label: '8局桃麻20' },
    ],
    [GameId.HongzhongMahjong]: [
        { baseScore: 1, roundCount: 1, districtId: 43, label: '单局红中1' },
        { baseScore: 5, roundCount: 1, districtId: 41, label: '单局红中5' },
        { baseScore: 10, roundCount: 1, districtId: 42, label: '单局红中10' },
        { baseScore: 1, roundCount: 8, districtId: 17, label: '8局红中1' },
        { baseScore: 2, roundCount: 8, districtId: 18, label: '8局红中2' },
        { baseScore: 5, roundCount: 8, districtId: 19, label: '8局红中5' },
        { baseScore: 10, roundCount: 8, districtId: 20, label: '8局红中10' },
        { baseScore: 20, roundCount: 8, districtId: 44, label: '8局红中20' },
    ],
    [GameId.ChangshaMahjong]: [
        { baseScore: 5, roundCount: 1, districtId: 45, label: '台桌5 · 单局' },
        { baseScore: 10, roundCount: 1, districtId: 46, label: '台桌10 · 单局' },
        { baseScore: 25, roundCount: 1, districtId: 47, label: '台桌25 · 单局' },
        { baseScore: 1, roundCount: 8, districtId: 21, label: '台桌1 · 8局' },
        { baseScore: 2, roundCount: 8, districtId: 22, label: '台桌2 · 8局' },
        { baseScore: 5, roundCount: 8, districtId: 23, label: '台桌5 · 8局' },
        { baseScore: 10, roundCount: 8, districtId: 24, label: '台桌10 · 8局' },
        { baseScore: 20, roundCount: 8, districtId: 48, label: '台桌20 · 8局' },
    ],
    [GameId.Doudizhu]: [],
    [GameId.Paodekuai]: [
        { baseScore: 3, roundCount: 8, districtId: 25, label: '3毛跑得快', minCarryScore: 30 },
        { baseScore: 5, roundCount: 8, districtId: 26, label: '5毛跑得快', minCarryScore: 50 },
        { baseScore: 10, roundCount: 8, districtId: 27, label: '1块跑的快', minCarryScore: 100 },
        { baseScore: 10, roundCount: 8, districtId: 28, label: '1块跑扎鸟', minCarryScore: 200, zhaNiao: true },
        { baseScore: 20, roundCount: 8, districtId: 52, label: '2块跑扎鸟', minCarryScore: 400, zhaNiao: true },
        { baseScore: 50, roundCount: 1, districtId: 49, label: '单局5块跑', minCarryScore: 300 },
        { baseScore: 100, roundCount: 1, districtId: 50, label: '单局10块跑', minCarryScore: 600 },
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

/** 大厅台桌名称显示规则。 */
export function formatStakeDisplayLabel(
    gameId: GameId | string | null | undefined,
    stake: Pick<StakeOption, 'baseScore' | 'roundCount' | 'label'> | null | undefined,
    fallbackName = '快速场',
): string {
    if (!stake) return fallbackName;
    const baseScore = Number(stake.baseScore) || 0;
    const roundCount = Number(stake.roundCount) || 0;

    if (gameId === GameId.TaojiangMahjong && baseScore > 0) {
        if (roundCount === 1) return `单局桃麻${baseScore}`;
        if (roundCount === 8) return `桃麻必中${baseScore}`;
    }

    return stake.label || fallbackName;
}

const MIN_CARRY_SCORE_MULTIPLIER = 8;

function resolveDefaultMinCarryScore(baseScore: number): number {
    return baseScore > 0 ? Math.ceil(baseScore * MIN_CARRY_SCORE_MULTIPLIER) : 0;
}

function matchCarryScore(baseScore: number, rules: Record<number, number>): number | null {
    const score = rules[baseScore];
    return score != null ? score : null;
}

/** 入场积分限制规则，需与 web_server GameServiceImpl 保持一致。 */
export function resolveMinCarryScore(gameId: GameId | string | null | undefined, baseScore: any, roundCount?: any): number {
    const base = Number(baseScore);
    if (!isFinite(base) || base <= 0) return 0;
    const round = Number(roundCount) || 8;

    if (gameId === GameId.TaojiangMahjong) {
        if (round === 1) {
            const matched = matchCarryScore(base, { 5: 260, 10: 500, 25: 1500 });
            if (matched != null) return matched;
        } else if (round === 8) {
            const matched = matchCarryScore(base, { 1: 50, 2: 100, 5: 380, 10: 1000, 20: 2000 });
            if (matched != null) return matched;
        }
    } else if (gameId === GameId.HongzhongMahjong && round === 1) {
        const matched = matchCarryScore(base, { 1: 40, 2: 80, 3: 120, 5: 200, 10: 400, 20: 800, 25: 1200, 30: 1200 });
        if (matched != null) return matched;
    } else if (gameId === GameId.Paodekuai) {
        if (round === 1) {
            const matched = matchCarryScore(base, { 50: 300, 100: 600 });
            if (matched != null) return matched;
        } else if (round === 8) {
            const matched = matchCarryScore(base, { 3: 30, 5: 50, 10: 100, 20: 400 });
            if (matched != null) return matched;
        }
    }

    return resolveDefaultMinCarryScore(base);
}
