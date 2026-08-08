/**
 * 游戏加载器 (GameLoader) - v2 完整版
 *
 * 统一的游戏加载入口，支持：
 * - 新游戏（桃江麻将/红中麻将/长沙麻将/跑得快/千分/歪胡子）
 *   - 复用 GuanDan 的资源 Bundle 作为默认资源
 *   - 通过动态 import() 加载 Room 模块 + GameFactory 创建房间实例
 *   - 统一的 HTTP API 创建/加入房间
 *
 * 关键设计：Cocos Creator packer-driver 对 @ccclass 类的跨 chunk 访问有限制，
 * 因此使用 dynamic import() 确保 Room 模块完全加载后再通过全局注册表查找类。
 */

import { _decorator, Component, Node, Label, Prefab, ProgressBar, Sprite, SpriteFrame, AudioClip } from 'cc';
import { Client } from './Client';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { GameManager } from '../Manager/GameManager';
// 从独立文件导入枚举（避免循环依赖）
import { GameId, GameType } from '../App/GameEnums';
import { GameFactory } from '../App/GameFactory';

const { ccclass, property } = _decorator;

/** gameId → 显示名称映射 */
const GAME_DISPLAY_NAMES: Record<string, string> = {
    [GameId.TaojiangMahjong]: '桃江麻将',
    [GameId.HongzhongMahjong]: '红中麻将',
    [GameId.ChangshaMahjong]: '长沙麻将',
    [GameId.Paodekuai]: '跑得快',
    [GameId.Waihuzi]: '益阳歪胡子',
    [GameId.Qianfen]: '沅江千分',
};

/** 默认资源 Bundle 配置 (复用 GuanDan 资源) */
const DEFAULT_ASSETS: any[] = [
    // 公共 UI 素材（复用 GuanDanCommon）
    { bundleName: "GuanDanCommon", assetList: [{ assetType: SpriteFrame, paths: ["bottom_bar/spriteFrame"] }] },
    // 音效（复用 GuanDanAudio）
    { bundleName: "GuanDanAudio", assetList: [{ assetType: AudioClip, paths: ["bg"] }] },
    // 房间背景（复用 GuanDanRoomBackground）
    { bundleName: "GuanDanRoomBackground", assetList: [{ assetType: SpriteFrame, paths: ["bg/spriteFrame"] }] },
    // 房间主预制体（复用 GuanDanRoomMain）
    {
        bundleName: "GuanDanRoomMain",
        assetList: [
            { assetType: Prefab, paths: ["PlayerBoy", "PlayerGirl", "CardColumn", "CardPlayedOut", "CardSlot", "SignPass", "Room"] },
            { assetType: Prefab, paths: ["PromptDialog", "PromptTip"] },
        ]
    },
];

@ccclass('GameLoader')
export class GameLoader extends Component {
    @property({ type: Sprite })
    private bg: Sprite = null;

    @property({ type: ProgressBar })
    private progressBar: ProgressBar = null;

    @property({ type: Label })
    private progress: Label = null;

    start() {}

    update(_deltaTime: number) {}

    /**
     * 加载游戏（统一入口）
     */
    public loadGame(name: string): void {
        const gameMeta = GameFactory.getGameMeta(name as GameId);
        if (!gameMeta) {
            Client.Instance.showPromptTip("游戏尚未开放", 2.0);
            return;
        }

        console.log(`[GameLoader] Loading game: ${gameMeta.name} (${name})`);
        this.loadNewGame(name as GameId, gameMeta);
    }

    /**
     * 加载新游戏（复用 GuanDan 资源 + 动态 import Room 模块 + GameFactory 创建房间）
     */
    private loadNewGame(gameId: GameId, gameMeta: { id: GameId; name: string; type: GameType }): void {
        const displayName = GAME_DISPLAY_NAMES[gameId] || gameMeta.name;

        ResourceLoader.Instance.loadAsset("GameLoader", "guan_dan/spriteFrame", SpriteFrame, (sf: SpriteFrame) => {
            if (sf && this.bg) this.bg.spriteFrame = sf;
        });

        console.log(`[GameLoader] Loading resources for ${displayName}...`);

        const assetsToLoad = gameMeta.type === GameType.Mahjong ? [] : DEFAULT_ASSETS;
        ResourceLoader.Instance.loadAssets(assetsToLoad, (current: number, total: number) => {
            let percent = total > 0 ? (current / total) : 1;
            if (this.progressBar) this.progressBar.progress = percent;
            percent *= 100;
            if (this.progress) {
                this.progress.string = `加载${displayName}... ${percent.toFixed(1)}%`;
            }
        }, () => {
            console.log(`[GameLoader] Resources loaded for ${displayName}, creating room...`);
            this.showNewGameHall(gameId);
        });
    }

    /**
     * 通过 GameFactory 创建游戏房间实例
     */
    private showNewGameHall(gameId: GameId): void {
        const displayName = GAME_DISPLAY_NAMES[gameId] || gameId;
        console.log(`[GameLoader] Showing game hall for ${displayName}`);
        Client.Instance.showNewGameHall(gameId, displayName);
        this.backToHall();
    }

    private backToHall(): void {
        this.node.destroy();
    }
}
