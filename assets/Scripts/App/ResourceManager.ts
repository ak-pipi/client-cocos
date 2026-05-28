/**
 * 增强型资源管理器
 * 在 ResourceLoader 基础上增加：
 * - 按游戏加载资源包
 * - 资源版本校验 (hash/版本号)
 * - 失败重试机制
 * - 加载状态与错误回调
 *
 * Author: AI Assistant
 */

import { Asset, assetManager, __private } from 'cc';
import { ResourceLoader } from '../Manager/ResourceLoader';
import {
    GameAssetConfig,
    ResourceVersionManifest,
    GameBundleManifest,
    ManifestEntry,
    AssetLoadResult,
} from './ResourceTypes';

/** 默认重试次数 */
const DEFAULT_RETRY_COUNT = 3;

/** 重试延迟 (毫秒) */
const RETRY_DELAY_MS = 1000;

/**
 * 资源包加载状态
 */
export enum BundleLoadState {
    /** 未加载 */
    None = 'none',
    /** 加载中 */
    Loading = 'loading',
    /** 已加载完成 */
    Loaded = 'loaded',
    /** 加载失败 */
    Failed = 'failed',
}

interface PendingCallback<T> {
    resolve: (result: T) => void;
    reject?: (error: string) => void;
}

export class ResourceManager {
    private static _instance: ResourceManager | null = null;

    public static get Instance(): ResourceManager {
        if (!ResourceManager._instance) {
            ResourceManager._instance = new ResourceManager();
        }
        return ResourceManager._instance;
    }

    /** 已注册的游戏资源配置 */
    private gameConfigs: Map<string, GameAssetConfig> = new Map();

    /** Bundle 加载状态缓存 */
    private bundleStates: Map<string, BundleLoadState> = new Map();

    /** 已加载的 Bundle 缓存 */
    private loadedBundles: Map<string, assetManager.Bundle> = new Map();

    /** 当前资源版本清单 */
    private currentManifest: ResourceVersionManifest | null = null;

    /** 等待中的 Bundle 加载回调 */
    private pendingCallbacks: Map<string, Array<PendingCallback<assetManager.Bundle>>> = new Map();

    // ==================== 游戏配置注册 ====================

    /**
     * 注册游戏资源配置
     * @param config 游戏资源配置
     */
    public registerGame(config: GameAssetConfig): void {
        this.gameConfigs.set(config.gameId, config);
    }

    /**
     * 批量注册游戏配置
     */
    public registerGames(configs: GameAssetConfig[]): void {
        for (const config of configs) {
            this.registerGame(config);
        }
    }

    /**
     * 获取已注册的游戏配置
     */
    public getGameConfig(gameId: string): GameAssetConfig | undefined {
        return this.gameConfigs.get(gameId);
    }

    /**
     * 获取所有已注册的游戏 ID 列表
     */
    public getRegisteredGameIds(): string[] {
        return Array.from(this.gameConfigs.keys());
    }

    // ==================== 版本清单管理 ====================

    /**
     * 设置当前资源版本清单
     */
    public setManifest(manifest: ResourceVersionManifest): void {
        this.currentManifest = manifest;
    }

    /**
     * 获取当前资源版本清单
     */
    public getManifest(): ResourceVersionManifest | null {
        return this.currentManifest;
    }

    /**
     * 从远程加载资源版本清单
     * @param manifestUrl 清单 URL
     */
    public async loadRemoteManifest(manifestUrl: string): Promise<ResourceVersionManifest> {
        return new Promise((resolve, reject) => {
            fetch(manifestUrl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    return response.json();
                })
                .then((manifest: ResourceVersionManifest) => {
                    this.currentManifest = manifest;
                    resolve(manifest);
                })
                .catch(err => reject(err.message || 'Failed to load manifest'));
        });
    }

    /**
     * 获取指定游戏的资源清单
     */
    public getGameManifest(gameId: string): GameBundleManifest | undefined {
        if (!this.currentManifest) return undefined;
        return this.currentManifest.games.find(g => g.gameId === gameId);
    }

    // ==================== Bundle 加载（带重试） ====================

    /**
     * 加载 Bundle (带重试和状态管理)
     * @param bundleName Bundle 名称
     * @param retryCount 重试次数，默认 3 次
     */
    public loadBundle(bundleName: string, retryCount: number = DEFAULT_RETRY_COUNT): Promise<assetManager.Bundle> {
        const state = this.bundleStates.get(bundleName);

        // 已加载完成，直接返回缓存
        if (state === BundleLoadState.Loaded) {
            const cached = this.loadedBundles.get(bundleName);
            if (cached) {
                return Promise.resolve(cached);
            }
        }

        // 正在加载中，加入等待队列
        if (state === BundleLoadState.Loading) {
            return new Promise((resolve, reject) => {
                const callbacks = this.pendingCallbacks.get(bundleName) || [];
                callbacks.push({ resolve, reject });
                this.pendingCallbacks.set(bundleName, callbacks);
            });
        }

        // 开始加载
        this.bundleStates.set(bundleName, BundleLoadState.Loading);

        return new Promise((resolve, reject) => {
            this.doLoadBundle(bundleName, retryCount)
                .then(bundle => {
                    this.bundleStates.set(bundleName, BundleLoadState.Loaded);
                    this.loadedBundles.set(bundleName, bundle);
                    resolve(bundle);
                    this.notifyPendingCallbacks(bundleName, bundle);
                })
                .catch(error => {
                    this.bundleStates.set(bundleName, BundleLoadState.Failed);
                    reject(error);
                    this.rejectPendingCallbacks(bundleName, error);
                });
        });
    }

    private doLoadBundle(bundleName: string, retriesLeft: number): Promise<assetManager.Bundle> {
        return new Promise((resolve, reject) => {
            assetManager.loadBundle(bundleName, (err: Error | null, bundle: assetManager.Bundle) => {
                if (err) {
                    console.warn(`[ResourceManager] Load bundle '${bundleName}' failed:`, err.message);
                    if (retriesLeft > 0) {
                        console.log(`[ResourceManager] Retrying (${retriesLeft} left)...`);
                        setTimeout(() => {
                            this.doLoadBundle(bundleName, retriesLeft - 1).then(resolve, reject);
                        }, RETRY_DELAY_MS);
                    } else {
                        reject(new Error(`Failed to load bundle '${bundleName}' after ${DEFAULT_RETRY_COUNT} attempts`));
                    }
                } else {
                    resolve(bundle);
                }
            });
        });
    }

    private notifyPendingCallbacks(bundleName: string, bundle: assetManager.Bundle): void {
        const callbacks = this.pendingCallbacks.get(bundleName);
        if (callbacks) {
            for (const cb of callbacks) {
                cb.resolve(bundle);
            }
            this.pendingCallbacks.delete(bundleName);
        }
    }

    private rejectPendingCallbacks(bundleName: string, error: string): void {
        const callbacks = this.pendingCallbacks.get(bundleName);
        if (callbacks) {
            for (const cb of callbacks) {
                if (cb.reject) {
                    cb.reject(error);
                }
            }
            this.pendingCallbacks.delete(bundleName);
        }
    }

    // ==================== 按游戏加载资源 ====================

    /**
     * 加载指定游戏的所有依赖 Bundle
     * @param gameId 游戏 ID
     * @param onProgress 进度回调 (current, total)
     */
    public async loadGameBundles(
        gameId: string,
        onProgress?: (current: number, total: number) => void
    ): Promise<Map<string, assetManager.Bundle>> {
        const config = this.gameConfigs.get(gameId);
        if (!config) {
            throw new Error(`Game '${gameId}' not registered`);
        }

        // 收集需要加载的 Bundle：主 Bundle + 依赖 Bundle
        const bundlesToLoad: string[] = [config.bundleName];
        if (config.dependencies) {
            for (const dep of config.dependencies) {
                if (!bundlesToLoad.includes(dep)) {
                    bundlesToLoad.push(dep);
                }
            }
        }

        const loadedBundles = new Map<string, assetManager.Bundle>();
        let loadedCount = 0;

        for (let i = 0; i < bundlesToLoad.length; i++) {
            try {
                const bundle = await this.loadBundle(bundlesToLoad[i]);
                loadedBundles.set(bundlesToLoad[i], bundle);
                loadedCount++;
                if (onProgress) {
                    onProgress(loadedCount, bundlesToLoad.length);
                }
            } catch (error) {
                console.error(`[ResourceManager] Failed to load bundle '${bundlesToLoad[i]}':`, error);
                throw error;
            }
        }

        return loadedBundles;
    }

    /**
     * 加载游戏入口资源
     * @param gameId 游戏 ID
     */
    public async loadGameEntry<T extends Asset>(
        gameId: string,
        type: new (...args: any[]) => any
    ): Promise<AssetLoadResult<T>> {
        const config = this.gameConfigs.get(gameId);
        if (!config?.entryPrefab) {
            return { success: false, asset: null, error: `Game '${gameId}' has no entry prefab configured` };
        }

        try {
            const bundle = await this.loadBundle(config.bundleName);
            const asset = await this.loadAssetFromBundle(bundle, config.entryPrefab, type);
            return { success: true, asset };
        } catch (error) {
            return { success: false, asset: null, error: String(error) };
        }
    }

    // ==================== 单个资源加载 ====================

    /**
     * 从已加载的 Bundle 中加载单个资源
     */
    public loadAssetFromBundle<T extends Asset>(
        bundle: assetManager.Bundle,
        path: string,
        type: new (...args: any[]) => any
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            bundle.load(path, type, (err: Error | null, asset: T) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(asset);
                }
            });
        });
    }

    /**
     * 通过 Bundle 名称加载资源 (兼容旧接口风格)
     */
    public loadAsset<T extends Asset>(
        bundleName: string,
        path: string,
        type: __private.__types_globals__Constructor<T>
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            this.loadBundle(bundleName)
                .then(bundle => {
                    return this.loadAssetFromBundle(bundle, path, type as any);
                })
                .then(resolve)
                .catch(reject);
        });
    }

    // ==================== 版本校验 ====================

    /**
     * 校验游戏资源版本是否一致
     * @param gameId 游戏 ID
     * @param localVersion 本地版本号
     * @returns 是否需要更新
     */
    public checkGameResourceVersion(gameId: string, localVersion: string): boolean {
        const gameManifest = this.getGameManifest(gameId);
        if (!gameManifest) {
            console.warn(`[ResourceManager] No manifest found for game '${gameId}', skip version check`);
            return false;
        }
        return gameManifest.resVersion !== localVersion;
    }

    /**
     * 获取指定游戏的最新资源版本号
     */
    public getLatestResVersion(gameId: string): string | null {
        const gameManifest = this.getGameManifest(gameId);
        return gameManifest ? gameManifest.resVersion : null;
    }

    // ==================== 状态查询 ====================

    /**
     * 获取 Bundle 加载状态
     */
    public getBundleState(bundleName: string): BundleLoadState {
        return this.bundleStates.get(bundleName) || BundleLoadState.None;
    }

    /**
     * 检查 Bundle 是否已加载
     */
    public isBundleLoaded(bundleName: string): boolean {
        return this.bundleStates.get(bundleName) === BundleLoadState.Loaded;
    }

    /**
     * 获取已加载的 Bundle 实例
     */
    public getLoadedBundle(bundleName: string): assetManager.Bundle | undefined {
        return this.loadedBundles.get(bundleName);
    }

    /**
     * 卸载指定 Bundle
     */
    public unloadBundle(bundleName: string): void {
        const bundle = this.loadedBundles.get(bundleName);
        if (bundle) {
            assetManager.releaseBundle(bundle);
            this.loadedBundles.delete(bundleName);
            this.bundleStates.delete(bundleName);
        }
    }

    /**
     * 清理所有已加载的 Bundle (退出游戏时调用)
     */
    public cleanupGameBundles(keepCommon: boolean = true): void {
        const commonBundles = new Set([
            'Login', 'Hall', 'Prompt', 'Dialog', 'Setting', 'Shop',
            'Bank', 'PersonalCenter', 'GameList', 'GameLoader', 'Common', 'Font'
        ]);

        for (const [name, bundle] of this.loadedBundles) {
            if (!keepCommon || !commonBundles.has(name)) {
                assetManager.releaseBundle(bundle);
                this.loadedBundles.delete(name);
                this.bundleStates.delete(name);
            }
        }
    }
}
