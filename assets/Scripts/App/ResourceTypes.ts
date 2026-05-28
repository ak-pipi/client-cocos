/**
 * 资源版本清单条目
 * 用于资源校验与增量更新
 */
export interface ManifestEntry {
    /** 资源路径 (相对路径) */
    path: string;
    /** 资源大小 (字节) */
    size: number;
    /** 资源 hash 值 (MD5 或 SHA256) */
    hash: string;
    /** 资源版本号 */
    version: string;
}

/**
 * 游戏 Bundle 资源清单
 */
export interface GameBundleManifest {
    /** 游戏 ID (如 taojiang-mahjong, hongzhong-mahjong) */
    gameId: string;
    /** 游戏显示名称 */
    gameName: string;
    /** Bundle 名称 */
    bundleName: string;
    /** 资源版本号 */
    resVersion: string;
    /** 规则版本号 */
    ruleVersion: string;
    /** 引擎插件版本号 (如有) */
    pluginVersion?: string;
    /** 资源条目列表 */
    entries: ManifestEntry[];
}

/**
 * 全局资源版本清单
 * 启动时或进入游戏前加载，用于资源校验与增量更新
 */
export interface ResourceVersionManifest {
    /** 清单版本号 */
    manifestVersion: string;
    /** 平台层通用资源版本 */
    appCommonVersion: string;
    /** 热更版本号 */
    hotfixVersion?: string;
    /** 各游戏资源清单 */
    games: GameBundleManifest[];
    /** 清单生成时间戳 */
    timestamp: number;
}

/**
 * 资源加载结果
 */
export interface AssetLoadResult<T> {
    success: boolean;
    asset: T | null;
    error?: string;
}

/**
 * 游戏资源包配置
 * 用于按游戏组织资源加载
 */
export interface GameAssetConfig {
    /** 游戏 ID */
    gameId: string;
    /** 显示名称 */
    gameName: string;
    /** 主 Bundle 名称 */
    bundleName: string;
    /** 依赖的 Bundle 列表 */
    dependencies?: string[];
    /** 入口预制体路径 */
    entryPrefab?: string;
    /** 加载页预制体路径 */
    loadingPrefab?: string;
    /** 大厅预制体路径 */
    hallPrefab?: string;
    /** 房间/牌桌预制体路径 */
    roomPrefab?: string;
    /** 单局结算预制体路径 */
    roundSettlementPrefab?: string;
    /** 总结算预制体路径 */
    finalSettlementPrefab?: string;
    /** 必需的资源列表 (启动时预加载) */
    essentialAssets?: Array<{
        type: new (...args: any[]) => any;
        paths: string[];
    }>;
}
