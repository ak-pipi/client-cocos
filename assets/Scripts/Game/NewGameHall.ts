import { _decorator, Component, Node, Label, Color, Graphics, Button, EventHandler, UITransform, EditBox } from 'cc';
import { Client } from './Client';
import { GameFactory } from '../App/GameFactory';
import { GameId, GameType } from '../App/GameEnums';
import { GameManager } from '../Manager/GameManager';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { CommonUtils } from '../Utils/CommonUtils';
import { Prefab, instantiate } from 'cc';

const { ccclass, property } = _decorator;

const GAME_TYPE_MAP: Record<string, number> = {
    [GameId.TaojiangMahjong]: 1031,
    [GameId.HongzhongMahjong]: 1032,
    [GameId.Paodekuai]: 1033,
    [GameId.ChangshaMahjong]: 1034,
    [GameId.Waihuzi]: 1035,
    [GameId.Qianfen]: 1036,
};

@ccclass('NewGameHall')
export class NewGameHall extends Component {
    private gameId: GameId = '' as GameId;
    private gameName: string = '';

    private titleLabel: Label | null = null;
    private joinPopup: Node | null = null;
    private joinEditBox: EditBox | null = null;

    public init(gameId: string, gameName: string): void {
        this.gameId = gameId as GameId;
        this.gameName = gameName;
        this.buildUI();
    }

    private buildUI(): void {
        const uiTransform = this.node.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setContentSize(1920, 1080);
        }

        this.createBackground();
        this.createTitle();
        this.createButtons();
    }

    private createBackground(): void {
        const bg = new Node('Background');
        bg.parent = this.node;
        const bgTransform = bg.addComponent(UITransform);
        bgTransform.setContentSize(1920, 1080);
        bg.setPosition(0, 0, 0);

        const bgGraphics = bg.addComponent(Graphics);
        bgGraphics.fillColor = new Color(20, 60, 100, 230);
        bgGraphics.roundRect(-960, -540, 1920, 1080, 0);
        bgGraphics.fill();

        const titleBg = new Node('TitleBg');
        titleBg.parent = this.node;
        const titleBgTransform = titleBg.addComponent(UITransform);
        titleBgTransform.setContentSize(600, 80);
        titleBg.setPosition(0, 350, 0);

        const titleBgGraphics = titleBg.addComponent(Graphics);
        titleBgGraphics.fillColor = new Color(40, 90, 140, 200);
        titleBgGraphics.roundRect(-300, -40, 600, 80, 12);
        titleBgGraphics.fill();
    }

    private createTitle(): void {
        const labelNode = new Node('TitleLabel');
        labelNode.parent = this.node;
        const labelTransform = labelNode.addComponent(UITransform);
        labelTransform.setContentSize(560, 60);
        labelNode.setPosition(0, 350, 0);

        const label = labelNode.addComponent(Label);
        label.string = this.gameName;
        label.fontSize = 36;
        label.lineHeight = 44;
        label.overflow = 2;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.color = new Color(255, 220, 100, 255);
        label.isBold = true;

        this.titleLabel = label;
    }

    private createButtons(): void {
        const buttons = [
            { text: '创建房间', action: 'onCreateRoom' },
            { text: '加入房间', action: 'onJoinRoom' },
            { text: '返回大厅', action: 'onBack' },
        ];

        const startY = 100;
        const gapY = 90;
        const btnWidth = 300;
        const btnHeight = 60;

        buttons.forEach((btnInfo, index) => {
            const btnNode = new Node(btnInfo.action);
            btnNode.parent = this.node;
            const btnTransform = btnNode.addComponent(UITransform);
            btnTransform.setContentSize(btnWidth, btnHeight);
            btnNode.setPosition(0, startY - index * gapY, 0);

            const graphics = btnNode.addComponent(Graphics);
            const colors = [
                new Color(46, 139, 87, 230),
                new Color(70, 130, 180, 230),
                new Color(160, 82, 45, 230),
            ];
            graphics.fillColor = colors[index];
            graphics.roundRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 10);
            graphics.fill();

            const labelNode = new Node('Label');
            labelNode.parent = btnNode;
            const labelTransform = labelNode.addComponent(UITransform);
            labelTransform.setContentSize(btnWidth - 20, btnHeight - 10);
            labelNode.setPosition(0, 0, 0);

            const label = labelNode.addComponent(Label);
            label.string = btnInfo.text;
            label.fontSize = 26;
            label.lineHeight = 32;
            label.overflow = 2;
            label.horizontalAlign = 1;
            label.verticalAlign = 1;
            label.color = new Color(255, 255, 255, 255);

            const button = btnNode.addComponent(Button);
            button.transition = 1;
            button.zoomScale = 1.05;
            button.duration = 0.1;

            const clickEvent = new EventHandler();
            clickEvent.target = this.node;
            clickEvent.component = 'NewGameHall';
            clickEvent.handler = btnInfo.action;
            clickEvent.customEventData = this.gameId;
            button.clickEvents.push(clickEvent);
        });
    }

    public onCreateRoom(event: Event, customEventData: any | null) {
        const gameType = GAME_TYPE_MAP[this.gameId] || 0;
        const data = { level: 1, gameType: gameType };
        const base64 = CommonUtils.encodeBase64(JSON.stringify(data));
        const msg = { gameType: gameType, base64: base64 };

        GameManager.Instance.authPost("/player/game/create", msg).then((dto: any) => {
            if (dto.code !== "00000000") {
                Client.Instance.showPromptDialog("创建房间失败: " + dto.msg);
                return;
            }
            GameManager.Instance.enterVenue(dto.wsAddress, dto.venueId, gameType, () => {
                this.onEnterVenue();
            });
        }).catch((err: any) => {
            console.log("[NewGameHall] Create room error:", err);
            Client.Instance.showPromptDialog("创建房间失败，请重试");
        });
    }

    public onJoinRoom(event: Event, customEventData: any | null) {
        Client.Instance.showPromptTip("加入房间功能开发中...");
    }

    public onBack(event: Event, customEventData: any | null) {
        Client.Instance.backToHall();
    }

    private onEnterVenue(): void {
        ResourceLoader.Instance.loadAsset("GuanDanRoomMain", "Room", Prefab, (prefab: Prefab) => {
            if (!prefab) {
                Client.Instance.showPromptDialog("游戏房间加载失败");
                return;
            }
            Client.Instance.initGameRoom(prefab);
            GameFactory.Instance.createRoom(this.gameId);
        });
    }
}
