/**
 * 六款游戏资源配置
 * 按开发计划 DEV_PLAN.md 注册所有新增游戏
 */

import { GameAssetConfig } from './ResourceTypes';

/**
 * 所有游戏配置列表
 */
export const GAME_ASSET_CONFIGS: GameAssetConfig[] = [
    // ========== 麻将类游戏 ==========

    {
        gameId: 'taojiang-mahjong',
        gameName: '桃江麻将',
        bundleName: 'TaoJiangMahjong',
        dependencies: ['Common'],
        entryPrefab: 'TaoJiangMahjong/Entry',
        loadingPrefab: 'TaoJiangMahjong/Loading',
        hallPrefab: 'TaoJiangMahjong/Hall',
        roomPrefab: 'TaoJiangMahjong/Room',
        roundSettlementPrefab: 'TaoJiangMahjong/RoundSettlement',
        finalSettlementPrefab: 'TaoJiangMahjong/FinalSettlement',
    },
    {
        gameId: 'hongzhong-mahjong',
        gameName: '红中麻将',
        bundleName: 'HongZhongMahjong',
        dependencies: ['Common'],
        entryPrefab: 'HongZhongMahjong/Entry',
        loadingPrefab: 'HongZhongMahjong/Loading',
        hallPrefab: 'HongZhongMahjong/Hall',
        roomPrefab: 'HongZhongMahjong/Room',
        roundSettlementPrefab: 'HongZhongMahjong/RoundSettlement',
        finalSettlementPrefab: 'HongZhongMahjong/FinalSettlement',
    },
    {
        gameId: 'changsha-mahjong',
        gameName: '长沙麻将',
        bundleName: 'ChangShaMahjong',
        dependencies: ['Common'],
        entryPrefab: 'ChangShaMahjong/Entry',
        loadingPrefab: 'ChangShaMahjong/Loading',
        hallPrefab: 'ChangShaMahjong/Hall',
        roomPrefab: 'ChangShaMahjong/Room',
        roundSettlementPrefab: 'ChangShaMahjong/RoundSettlement',
        finalSettlementPrefab: 'ChangShaMahjong/FinalSettlement',
    },

    // ========== 扑克类游戏 ==========

    {
        gameId: 'paodekuai',
        gameName: '跑得快',
        bundleName: 'PaoDeKuai',
        dependencies: ['Common'],
        entryPrefab: 'PaoDeKuai/Entry',
        loadingPrefab: 'PaoDeKuai/Loading',
        hallPrefab: 'PaoDeKuai/Hall',
        roomPrefab: 'PaoDeKuai/Room',
        roundSettlementPrefab: 'PaoDeKuai/RoundSettlement',
        finalSettlementPrefab: 'PaoDeKuai/FinalSettlement',
    },
    {
        gameId: 'yuanjiang-qianfen',
        gameName: '沅江千分',
        bundleName: 'YuanJiangQianFen',
        dependencies: ['Common'],
        entryPrefab: 'YuanJiangQianFen/Entry',
        loadingPrefab: 'YuanJiangQianFen/Loading',
        hallPrefab: 'YuanJiangQianFen/Hall',
        roomPrefab: 'YuanJiangQianFen/Room',
        roundSettlementPrefab: 'YuanJiangQianFen/RoundSettlement',
        finalSettlementPrefab: 'YuanJiangQianFen/FinalSettlement',
    },

    // ========== 字牌类游戏 ==========

    {
        gameId: 'yiyang-waihuzi',
        gameName: '益阳歪胡子',
        bundleName: 'YiYangWaiHuZi',
        dependencies: ['Common'],
        entryPrefab: 'YiYangWaiHuZi/Entry',
        loadingPrefab: 'YiYangWaiHuZi/Loading',
        hallPrefab: 'YiYangWaiHuZi/Hall',
        roomPrefab: 'YiYangWaiHuZi/Room',
        roundSettlementPrefab: 'YiYangWaiHuZi/RoundSettlement',
        finalSettlementPrefab: 'YiYangWaiHuZi/FinalSettlement',
    },
];

/**
 * 初始化并注册所有游戏配置到 ResourceManager
 */
export function registerAllGames(): void {
    const { ResourceManager } = require('./ResourceManager');
    ResourceManager.Instance.registerGames(GAME_ASSET_CONFIGS);
}
