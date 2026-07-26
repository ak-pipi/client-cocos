// 资源加载界面
// Author wujian
// Email 393817707@qq.com
// Date 2025.10.22

import { _decorator, Component, Label, Node, Prefab, Sprite, ProgressBar, sys, assetManager, AudioClip } from 'cc';
import { GameManager } from '../Manager/GameManager';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { Client } from './Client';
const { ccclass, property } = _decorator;

interface RuntimeConfig {
    apiBaseUrl?: string;
}

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
        GameManager.Instance.HttpHost = await this.resolveHttpHost();
        console.log("Http host: ", GameManager.Instance.HttpHost);
        this.loadResources();
    }

    /**
     * 浏览器发布包从与 index.html 同级的 config.json 读取 API 地址。
     * 该文件由 deploy/aws/scripts/publish-web-client.sh 在上传前生成，
     * 因此可以切换环境而无需重新编译 Cocos 资源。
     */
    private async resolveHttpHost(): Promise<string> {
        const localApiBaseUrl = 'http://127.0.0.1:18080';
        const productionApiBaseUrl = 'https://api-jinniu-game.com';
        const isBrowser = typeof window !== 'undefined' && typeof window.fetch === 'function';
        const hostname = isBrowser ? window.location.hostname : '';
        const isLocalDevelopment = hostname === 'localhost' || hostname === '127.0.0.1';

        if (!isBrowser || isLocalDevelopment) {
            return localApiBaseUrl;
        }

        try {
            const response = await fetch('./config.json', { cache: 'no-store' });
            if (response.ok) {
                const config = await response.json() as RuntimeConfig;
                if (typeof config.apiBaseUrl === 'string' && /^https:\/\//.test(config.apiBaseUrl)) {
                    return config.apiBaseUrl.replace(/\/+$/, '');
                }
            }
            console.warn(`[Load] config.json is unavailable or invalid (${response.status}); using production fallback.`);
        } catch (error) {
            console.warn('[Load] Failed to load config.json; using production fallback.', error);
        }

        return productionApiBaseUrl;
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
            { bundleName: "Shop", assetList: [{ assetType: Prefab, paths: ["DlgShop"] }] },
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
