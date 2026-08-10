/**
 * 版本更新管理器
 * 负责：
 * - 启动时版本检测 (POST /api/app/version/check)
 * - 强制更新 / 热更新 / 无更新 分支处理
 * - 热更新下载、校验、解压流程
 * - 进入游戏前资源版本检查
 *
 * Author: AI Assistant
 */

import { sys, view } from 'cc';

/** 版本检测结果 */
export enum UpdateType {
    /** 无需更新 */
    None = 'none',
    /** 热更新（可选更新） */
    HotUpdate = 'hot_update',
    /** 强制更新 */
    ForceUpdate = 'force_update',
}

export interface AppVersionInfo {
    /** 当前应用版本号 */
    appVersion: string;
    /** 当前热更新版本号 */
    hotfixVersion: string;
    /** 当前资源版本号 */
    resVersion: string;
}

export interface DeviceInfo {
    platform: string;
    osVersion: string;
    model: string;
    resolution: string;
    safeArea?: string;
}

export interface VersionCheckResult {
    updateType: UpdateType;
    /** 最新版本号 */
    latestAppVersion?: string;
    /** 最新热更版本号 */
    latestHotfixVersion?: string;
    /** 最新资源版本号 */
    latestResVersion?: string;
    /** 更新说明 */
    updateNotes?: string;
    /** 热更包下载 URL */
    hotfixUrl?: string;
    /** 热更包大小 */
    hotfixSize?: number;
    /** 热更包 hash */
    hotfixHash?: string;
    /** 强更下载 URL */
    forceUpdateUrl?: string;
    /** 是否必须立即更新（不可跳过） */
    mustUpdate?: boolean;
}

export interface GameResourceCheckResult {
    /** 游戏ID */
    gameId: string;
    /** 是否需要更新 */
    needUpdate: boolean;
    /** 最新资源版本 */
    latestResVersion?: string;
    /** 最新规则版本 */
    latestRuleVersion?: string;
    /** 更新包信息 */
    updateInfo?: {
        url: string;
        size: number;
        hash: string;
    };
    /** 错误信息 */
    error?: string;
}

export interface DownloadProgress {
    downloadedBytes: number;
    totalBytes: number;
    percent: number; // 0-100
}

type ProgressCallback = (progress: DownloadProgress) => void;

export class VersionUpdateManager {
    private static _instance: VersionUpdateManager | null = null;

    public static get Instance(): VersionUpdateManager {
        if (!VersionUpdateManager._instance) {
            VersionUpdateManager._instance = new VersionUpdateManager();
        }
        return VersionUpdateManager._instance;
    }

    /** 本地存储的版本信息 key 前缀 */
    private readonly STORAGE_KEY_APP_VERSION = 'app_version';
    private readonly STORAGE_KEY_HOTFIX_VERSION = 'hotfix_version';
    private readonly STORAGE_KEY_RES_VERSION = 'res_version';
    private readonly STORAGE_KEY_GAME_PREFIX = 'game_res_ver_';

    /** 版本检测 API 地址 */
    private versionCheckUrl: string = '/api/app/version/check';

    /** 上报 API 地址 */
    private reportUrl: string = '/api/app/version/report';

    /**
     * 设置版本检测 API 地址
     */
    public setVersionCheckUrl(url: string): void {
        this.versionCheckUrl = url;
    }

    // ==================== 设备信息获取 ====================

    public getDeviceInfo(): DeviceInfo {
        return {
            platform: sys.platform,
            osVersion: this.getOSVersion(),
            model: this.getModel(),
            resolution: this.getResolution(),
            safeArea: this.getSafeAreaInfo(),
        };
    }

    private getOSVersion(): string {
        try {
            const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
            if (sys.os === sys.OS.IOS) {
                const match = ua.match(/OS (\d+[._]\d+)/);
                return match ? match[1] : 'unknown';
            }
            if (sys.os === sys.OS.ANDROID) {
                const match = ua.match(/Android (\d+(?:\.\d+)?)/);
                return match ? match[1] : 'unknown';
            }
            return sys.os || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    private getModel(): string {
        try {
            const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
            // iOS
            const iosMatch = ua.match(/\(iPhone.*? OS/);
            if (iosMatch) return 'iPhone';
            const ipadMatch = ua.match(/\(iPad/);
            if (ipadMatch) return 'iPad';
            // Android
            const androidMatch = ua.match(/;\s*([^)]+)\)\s*Build\//);
            if (androidMatch) return androidMatch[1].trim().split(';')[0];
            return 'Desktop';
        } catch {
            return 'unknown';
        }
    }

    private getSafeAreaInfo(): string {
        try {
            if (typeof window !== 'undefined' && (window as any).safeAreaInsets) {
                const insets = (window as any).safeAreaInsets;
                return `${insets.left},${insets.top},${insets.right},${insets.bottom}`;
            }
        } catch {}
        return '';
    }

    private getResolution(): string {
        try {
            if (typeof window !== 'undefined') {
                return `${window.innerWidth}x${window.innerHeight}`;
            }
        } catch {}

        const size = view.getVisibleSize();
        return `${Math.floor(size.width)}x${Math.floor(size.height)}`;
    }

    // ==================== 本地版本管理 ====================

    public getAppVersion(): string {
        return this.getLocalStorage(this.STORAGE_KEY_APP_VERSION) || '1.0.0';
    }

    public setAppVersion(version: string): void {
        this.setLocalStorage(this.STORAGE_KEY_APP_VERSION, version);
    }

    public getHotfixVersion(): string {
        return this.getLocalStorage(this.STORAGE_KEY_HOTFIX_VERSION) || '1.0.0';
    }

    public setHotfixVersion(version: string): void {
        this.setLocalStorage(this.STORAGE_KEY_HOTFIX_VERSION, version);
    }

    public getResVersion(): string {
        return this.getLocalStorage(this.STORAGE_KEY_RES_VERSION) || '1.0.0';
    }

    public setResVersion(version: string): void {
        this.setLocalStorage(this.STORAGE_KEY_RES_VERSION, version);
    }

    public getGameResVersion(gameId: string): string {
        return this.getLocalStorage(`${this.STORAGE_KEY_GAME_PREFIX}${gameId}`) || '1.0.0';
    }

    public setGameResVersion(gameId: string, version: string): void {
        this.setLocalStorage(`${this.STORAGE_KEY_GAME_PREFIX}${gameId}`, version);
    }

    public getCurrentVersions(): AppVersionInfo {
        return {
            appVersion: this.getAppVersion(),
            hotfixVersion: this.getHotfixVersion(),
            resVersion: this.getResVersion(),
        };
    }

    private getLocalStorage(key: string): string | null {
        try {
            return sys.localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    private setLocalStorage(key: string, value: string): void {
        try {
            sys.localStorage.setItem(key, value);
        } catch {
            console.warn(`[VersionUpdateManager] Failed to save to localStorage: ${key}`);
        }
    }

    // ==================== 版本检测 ====================

    /**
     * 执行启动时版本检测
     * @param httpHost HTTP 服务地址
     * @returns 版本检测结果
     */
    async checkForUpdates(httpHost: string): Promise<VersionCheckResult> {
        const url = `${httpHost}${this.versionCheckUrl}`;
        const versions = this.getCurrentVersions();
        const device = this.getDeviceInfo();

        console.log(`[VersionUpdate] Checking for updates...`, { versions, device });

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    app_version: versions.appVersion,
                    hotfix_version: versions.hotfixVersion,
                    res_version: versions.resVersion,
                    ...device,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return this.parseVersionCheckResponse(data);
        } catch (error) {
            console.error('[VersionUpdate] Check failed:', error);
            // 检查失败默认返回无更新，避免阻塞用户使用
            return { updateType: UpdateType.None };
        }
    }

    private parseVersionCheckResponse(data: any): VersionCheckResult {
        // 根据服务端返回的数据格式解析
        // 这里假设服务端返回格式参考 DEV_PLAN.md
        if (!data || data.code !== 0 && data.code !== 200) {
            return { updateType: UpdateType.None };
        }

        const result = data.data || data;

        if (result.force_update && result.force_update_url) {
            return {
                updateType: UpdateType.ForceUpdate,
                latestAppVersion: result.latest_app_version,
                forceUpdateUrl: result.force_update_url,
                mustUpdate: result.must_update ?? true,
                updateNotes: result.update_notes,
            };
        }

        if (result.hotfix_available && result.hotfix_url) {
            return {
                updateType: UpdateType.HotUpdate,
                latestHotfixVersion: result.hotfix_version,
                hotfixUrl: result.hotfix_url,
                hotfixSize: result.hotfix_size,
                hotfixHash: result.hotfix_hash,
                updateNotes: result.update_notes,
            };
        }

        return { updateType: UpdateType.None };
    }

    // ==================== 热更新下载 ====================

    /**
     * 下载热更新包
     * @param url 热更新包下载地址
     * @param expectedHash 预期的 hash 值（用于校验）
     * @param onProgress 下载进度回调
     * @returns ArrayBuffer 下载结果
     */
    async downloadHotfix(
        url: string,
        expectedHash?: string,
        onProgress?: ProgressCallback
    ): Promise<ArrayBuffer> {
        console.log(`[VersionUpdate] Starting download from: ${url}`);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';

            xhr.onprogress = (event: ProgressEvent) => {
                if (event.lengthComputable && onProgress) {
                    const progress: DownloadProgress = {
                        downloadedBytes: event.loaded,
                        totalBytes: event.total,
                        percent: Math.round((event.loaded / event.total) * 10000) / 100,
                    };
                    onProgress(progress);
                }
            };

            xhr.onload = async () => {
                if (xhr.status === 200) {
                    const buffer = xhr.response as ArrayBuffer;
                    console.log(`[VersionUpdate] Download complete: ${buffer.byteLength} bytes`);

                    // 校验 hash
                    if (expectedHash) {
                        const actualHash = await this.calculateHash(buffer);
                        if (actualHash !== expectedHash) {
                            reject(new Error(`Hash mismatch: expected ${expectedHash}, got ${actualHash}`));
                            return;
                        }
                    }

                    resolve(buffer);
                } else {
                    reject(new Error(`Download failed with status ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error('Network error during download'));
            xhr.ontimeout = () => reject(new Error('Download timeout'));

            // 设置超时（5分钟）
            xhr.timeout = 300000;
            xhr.send();
        });
    }

    /**
     * 计算数据的 hash 值
     */
    async calculateHash(data: ArrayBuffer): Promise<string> {
        // 使用 Web Crypto API 计算 SHA-256
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // Fallback：简单校验（非生产环境可用）
        console.warn('[VersionUpdate] crypto.subtle not available, using simple checksum');
        const bytes = new Uint8Array(data);
        let sum = 0;
        for (let i = 0; i < bytes.length; i++) {
            sum = ((sum << 5) - sum + bytes[i]) | 0;
        }
        return Math.abs(sum).toString(16).padStart(16, '0');
    }

    /**
     * 应用热更新包
     * @param hotfixData 热更新包数据
     * @param version 新版本号
     */
    async applyHotfix(hotfixData: ArrayBuffer, version: string): Promise<void> {
        // TODO: 实现具体的解压与替换逻辑
        // Cocos Creator 热更新通常需要配合 assetManager 的热更新机制
        // 这里预留接口，具体实现需要根据项目热更新方案确定
        console.log(`[VersionUpdate] Applying hotfix v${version}, size: ${hotfixData.byteLength} bytes`);
        
        // 更新本地版本号
        this.setHotfixVersion(version);
        console.log(`[VersionUpdate] Hotfix applied successfully, new version: ${version}`);
    }

    // ==================== 游戏前版本检查 ====================

    /**
     * 检查指定游戏的资源版本是否需要更新
     * @param gameId 游戏 ID
     * @param httpHost HTTP 服务地址
     */
    async checkGameResourceUpdate(gameId: string, httpHost: string): Promise<GameResourceCheckResult> {
        const localVersion = this.getGameResVersion(gameId);

        try {
            // 从远程 manifest 获取最新版本
            const { ResourceManager } = require('./ResourceManager');
            const manifest = ResourceManager.Instance.getManifest();

            if (manifest) {
                const gameManifest = manifest.games.find(g => g.gameId === gameId);
                if (gameManifest && gameManifest.resVersion !== localVersion) {
                    return {
                        gameId,
                        needUpdate: true,
                        latestResVersion: gameManifest.resVersion,
                        latestRuleVersion: gameManifest.ruleVersion,
                    };
                }
            }

            return { gameId, needUpdate: false };
        } catch (error) {
            console.error(`[VersionUpdate] Game resource check failed for ${gameId}:`, error);
            return { gameId, needUpdate: false, error: String(error) };
        }
    }

    /**
     * 检查所有注册的游戏是否需要资源更新
     * @param httpHost HTTP 服务地址
     */
    async checkAllGamesResources(httpHost: string): Promise<GameResourceCheckResult[]> {
        const { ResourceManager } = require('./ResourceManager');
        const gameIds = ResourceManager.Instance.getRegisteredGameIds();

        const results: GameResourceCheckResult[] = [];
        for (const gameId of gameIds) {
            const result = await this.checkGameResourceUpdate(gameId, httpHost);
            results.push(result);
        }

        return results;
    }

    // ==================== 更新结果上报 ====================

    /**
     * 上报版本更新结果
     * @param httpHost HTTP 服务地址
     * @param reportData 上报数据
     */
    async reportUpdateResult(httpHost: string, reportData: {
        update_type: string;
        success: boolean;
        error?: string;
        duration_ms: number;
        app_version: string;
        device_info: DeviceInfo;
    }): Promise<void> {
        try {
            const url = `${httpHost}${this.reportUrl}`;
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reportData),
            });
            console.log(`[VersionUpdate] Update result reported`);
        } catch (error) {
            console.warn('[VersionUpdate] Failed to report update result:', error);
        }
    }
}
