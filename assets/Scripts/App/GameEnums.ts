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
