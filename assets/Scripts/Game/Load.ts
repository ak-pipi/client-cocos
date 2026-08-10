// 资源加载界面
// Author wujian
// Email 393817707@qq.com
// Date 2025.10.22

import { _decorator, Component, Label, Node, Prefab, Sprite, ProgressBar, sys, assetManager, AudioClip } from 'cc';
import { PREVIEW } from 'cc/env';
import { GameManager } from '../Manager/GameManager';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { Client } from './Client';
const { ccclass, property } = _decorator;

interface RuntimeConfig {
    environment?: string;
    apiBaseUrl?: string;
}

const LOCAL_API_BASE_URL = 'http://127.0.0.1:18080';
const AWS_API_BASE_URL = 'https://api-jinniu-game.com';
const LOCAL_RUNTIME_CONFIG: RuntimeConfig = {
    environment: 'local',
    apiBaseUrl: LOCAL_API_BASE_URL,
};
const AWS_RUNTIME_CONFIG: RuntimeConfig = {
    environment: 'aws',
    apiBaseUrl: AWS_API_BASE_URL,
};

@ccclass('Load')
export class Load extends Component {
    @property({ type: Label })
    private progress: Label = null;

    @property({ type: ProgressBar })
    private progressBar: ProgressBar = null;

    start() {
        console.log("Load start.");
        void this.loadConfig();
    }

    update(deltaTime: number) { }
    
    private async loadConfig(): Promise<void> {
        const runtimeConfig = await this.resolveRuntimeConfig();
        GameManager.Instance.HttpHost = this.resolveApiBaseUrl(runtimeConfig, LOCAL_API_BASE_URL);
        console.log(`[Load] environment: ${runtimeConfig.environment || 'unknown'}, http host: `, GameManager.Instance.HttpHost);
        this.loadResources();
    }

    /**
     * 浏览器发布包从与 index.html 同级的 config.json 读取 API 地址。
     * 该文件由 deploy/aws/scripts/publish-web-client.sh 在上传前生成，
     * 因此可以切换环境而无需重新编译 Cocos 资源。
     */
    private async resolveRuntimeConfig(): Promise<RuntimeConfig> {
        const isBrowser = typeof window !== 'undefined' && typeof window.fetch === 'function';
        const hostname = isBrowser ? window.location.hostname : '';
        const isLocalDevelopment = this.isLocalDevelopmentHost(hostname);

        if (PREVIEW || isLocalDevelopment) {
            return LOCAL_RUNTIME_CONFIG;
        }

        if (!isBrowser || sys.isNative) {
            return AWS_RUNTIME_CONFIG;
        }

        try {
            const response = await fetch('./config.json', { cache: 'no-store' });
            if (response.ok) {
                const config = await response.json() as RuntimeConfig;
                if (this.isValidApiBaseUrl(config.apiBaseUrl)) {
                    return config;
                }
            }
            console.warn(`[Load] config.json is unavailable or invalid (${response.status}); using aws fallback.`);
        } catch (error) {
            console.warn('[Load] Failed to load config.json; using aws fallback.', error);
        }

        return AWS_RUNTIME_CONFIG;
    }

    private resolveApiBaseUrl(config: RuntimeConfig, fallback: string): string {
        const apiBaseUrl = typeof config.apiBaseUrl === 'string' ? config.apiBaseUrl.trim() : '';
        if (this.isValidApiBaseUrl(apiBaseUrl)) {
            return apiBaseUrl.replace(/\/+$/, '');
        }

        return fallback;
    }

    private isValidApiBaseUrl(apiBaseUrl: string | undefined): boolean {
        return typeof apiBaseUrl === 'string' && /^https?:\/\//.test(apiBaseUrl);
    }

    private isLocalDevelopmentHost(hostname: string): boolean {
        return hostname === ''
            || hostname === 'localhost'
            || hostname === '127.0.0.1'
            || hostname === '0.0.0.0'
            || /^10\./.test(hostname)
            || /^192\.168\./.test(hostname)
            || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
    }

    private loadResources() {
        let assets: any = [
            { bundleName: "Login", assetList: [{ assetType: Prefab, paths: ["Login"] }, { assetType: AudioClip, paths: ["bg_login"] }] },
            { bundleName: "Prompt", assetList: [{ assetType: Prefab, paths: ["PromptDialog", "PromptTip"] }] },
            { bundleName: "Hall", assetList: [{ assetType: Prefab, paths: ["Hall"] }, { assetType: AudioClip, paths: ["bg_hall"] }] },
            { bundleName: "GameList", assetList: [{ assetType: Prefab, paths: ["GameList"] }] },
            { bundleName: "GameLoader", assetList: [{ assetType: Prefab, paths: ["GameLoader"] }] },
            { bundleName: "Bank", assetList: [{ assetType: Prefab, paths: ["DlgBank"] }] },
            { bundleName: "Dialog", assetList: [{ assetType: Prefab, paths: ["DlgEmail", "DlgService"] }] },
            { bundleName: "PersonalCenter", assetList: [{ assetType: Prefab, paths: ["DlgPersonalCenter"] }] },
            { bundleName: "Setting", assetList: [{ assetType: Prefab, paths: ["DlgSetting"] }] },
        ];
        ResourceLoader.Instance.loadAssets(assets, (current: number, total: number) => {
            let percent = current / total;
            if (this.progressBar) {
                this.progressBar.progress = percent;
            }
            percent *= 100;
            if (this.progress) {
                this.progress.string = "加载进度：" + percent.toFixed(2); + "%";
            }
        }, () => {
            this.onLoadComplete();
        });
    }

    private onLoadComplete() {
        Client.Instance.onLoadComplete();
    }
}
