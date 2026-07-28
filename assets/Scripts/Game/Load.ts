// 资源加载界面
// Author wujian
// Email 393817707@qq.com
// Date 2025.10.22

import { _decorator, Component, Label, Node, Prefab, Sprite, ProgressBar, sys, assetManager, AudioClip } from 'cc';
import { GameManager } from '../Manager/GameManager';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { Client } from './Client';
const { ccclass, property } = _decorator;

@ccclass('Load')
export class Load extends Component {
    @property({ type: Label })
    private progress: Label = null;

    @property({ type: ProgressBar })
    private progressBar: ProgressBar = null;

    start() {
        console.log("Load start.");
        this.loadConfig();
    }

    update(deltaTime: number) { }
    
    private async loadConfig() {
        let httpHost = "http://127.0.0.1:18080";
        if (typeof fetch !== 'undefined') {
            try {
                const response = await fetch("config.json", { cache: "no-store" });
                if (response.ok) {
                    const config = await response.json();
                    const apiBaseUrl = typeof config?.apiBaseUrl === 'string' ? config.apiBaseUrl.trim() : '';
                    if (apiBaseUrl.length > 0) {
                        httpHost = apiBaseUrl.replace(/\/+$/, '');
                    }
                }
            } catch (err) {
                console.warn("Load runtime config failed: ", err);
            }
        }
        GameManager.Instance.HttpHost = httpHost;
        console.log("Http host: ", GameManager.Instance.HttpHost);
        this.loadResources();
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
