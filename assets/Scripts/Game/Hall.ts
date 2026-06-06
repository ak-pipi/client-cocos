// 大厅界面脚本
// Author wujian
// Email 393817707@qq.com
// Date 2025.11.03

import { _decorator, Component, Label, Node, Sprite, sys, AudioClip, SpriteFrame, Prefab, instantiate, Color, UITransform, Graphics, Button, EventHandler } from 'cc';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { GameManager } from '../Manager/GameManager';
import { Client } from './Client';
import { DlgPublicRooms } from './Dialogs/DlgPublicRooms';
import { DlgMahjongRecords } from './Dialogs/DlgMahjongRecords';
const { ccclass, property } = _decorator;

@ccclass('Hall')
export class Hall extends Component {
    @property({ type: Label })
    private labelName: Label = null;

    @property({ type: Label })
    private labelPlayerId: Label = null;

    @property({ type: Label })
    private labelGold: Label = null;

    @property({ type: Label })
    private labelDiamond: Label = null;

    @property({ type: Sprite })
    private spriteHead: Sprite = null;

    @property({ type: Node })
    private gameListSlot: Node = null;

    private gameList: Node = null;

    @property({ type: Node })
    private menu: Node = null;

    @property({ type: Node })
    private popup: Node = null;

    private dlgPersonalCenter: Node = null;

    private dlgBank: Node = null;

    private dlgShop: Node = null;

    private dlgSetting: Node = null;

    private dlgEmail: Node = null;

    private dlgService: Node = null;

    private dlgPublicRooms: Node = null;

    private dlgMahjongRecords: Node = null;

    private playerInfoTime: number = 0;

    start() {
        this.playBackgroundMusic();
        this.loadGameList();
        this.createShortcutButtons();
    }

    update(deltaTime: number) {
        if (GameManager.Instance.PlayerInfoTime === 0) return;
        if (GameManager.Instance.PlayerInfoTime > this.playerInfoTime) {
            this.updatePlayerInfo();
        }
    }

    public playBackgroundMusic() {
        ResourceLoader.Instance.loadAsset("Hall", "bg_hall", AudioClip, (clip: AudioClip) => {
            Client.Instance.playBackgroundMusic(clip);
        });
    }

    private loadGameList() {
        ResourceLoader.Instance.loadAsset("GameList", "GameList", Prefab, (gameList: Prefab) => {
            this.gameList = instantiate(gameList);
            this.gameList.parent = this.gameListSlot;
        });
    }

    private updatePlayerInfo() {
        this.playerInfoTime = sys.now();
        this.labelName.string = GameManager.Instance.NickName;
        this.labelPlayerId.string = GameManager.Instance.PlayerId;
        this.labelGold.string = GameManager.Instance.Gold.toString();
        this.labelDiamond.string = GameManager.Instance.Diamond.toString();
        if (!GameManager.Instance.Avatar) return;
        GameManager.Instance.loadSpriteFrame(GameManager.Instance.Avatar, (spriteFrame: SpriteFrame) => {
            this.spriteHead.spriteFrame = spriteFrame;
        });
    }

    public onHeadClicked() {
        if (this.dlgPersonalCenter) {
            this.dlgPersonalCenter.active = true;
            return;
        }
        ResourceLoader.Instance.loadAsset("PersonalCenter", "DlgPersonalCenter", Prefab, (prefab: Prefab) => {
            this.dlgPersonalCenter = instantiate(prefab);
            this.dlgPersonalCenter.parent = this.popup;
        });
    }

    public onBankClicked() {
        if (this.dlgBank) {
            this.dlgBank.active = true;
            return;
        }
        ResourceLoader.Instance.loadAsset("Bank", "DlgBank", Prefab, (prefab: Prefab) => {
            this.dlgBank = instantiate(prefab);
            this.dlgBank.parent = this.popup;
        });
    }

    public onShopClicked() {
        if (this.dlgShop) {
            this.dlgShop.active = true;
            return;
        }
        ResourceLoader.Instance.loadAsset("Shop", "DlgShop", Prefab, (prefab: Prefab) => {
            this.dlgShop = instantiate(prefab);
            this.dlgShop.parent = this.popup;
        });
    }

    public onUpClicked() {
        if (!this.menu) return;
        this.menu.active = true;
    }

    public onMailClicked() {
        if (this.dlgEmail) {
            this.dlgEmail.active = true;
            return;
        }
        ResourceLoader.Instance.loadAsset("Dialog", "DlgEmail", Prefab, (prefab: Prefab) => {
            this.dlgEmail = instantiate(prefab);
            this.dlgEmail.parent = this.popup;
        });
    }

    public onMenuBlankClicked() {
        if (!this.menu) return;
        this.menu.active = false;
    }

    public onSettingClicked() {
        if (this.menu) {
            this.menu.active = false;
        }
        if (this.dlgSetting) {
            this.dlgSetting.active = true;
            return;
        }
        ResourceLoader.Instance.loadAsset("Setting", "DlgSetting", Prefab, (prefab: Prefab) => {
            this.dlgSetting = instantiate(prefab);
            this.dlgSetting.parent = this.popup;
        });
    }

    public onShareClicked() {
        if (this.menu) {
            this.menu.active = false;
        }
        Client.Instance.showPromptTip("未实现", 2.0);
    }

    public onServiceClicked() {
        if (this.menu) {
            this.menu.active = false;
        }
        if (this.dlgService) {
            this.dlgService.active = true;
            return;
        }
        ResourceLoader.Instance.loadAsset("Dialog", "DlgService", Prefab, (prefab: Prefab) => {
            this.dlgService = instantiate(prefab);
            this.dlgService.parent = this.popup;
        });
    }

    public onPublicRoomsClicked() {
        this.showPublicRooms();
    }

    public onMahjongRecordsClicked() {
        this.showMahjongRecords();
    }

    private getDialogParent(): Node {
        return this.popup || this.node;
    }

    private showPublicRooms() {
        if (this.dlgPublicRooms) {
            this.dlgPublicRooms.active = true;
            return;
        }
        this.dlgPublicRooms = new Node('DlgPublicRooms');
        this.dlgPublicRooms.parent = this.getDialogParent();
        this.dlgPublicRooms.addComponent(DlgPublicRooms);
    }

    private showMahjongRecords() {
        if (this.dlgMahjongRecords) {
            this.dlgMahjongRecords.active = true;
            return;
        }
        this.dlgMahjongRecords = new Node('DlgMahjongRecords');
        this.dlgMahjongRecords.parent = this.getDialogParent();
        this.dlgMahjongRecords.addComponent(DlgMahjongRecords);
    }

    private createShortcutButtons() {
        const shortcuts = [
            { text: '公开房', handler: 'onPublicRoomsClicked', x: -860, color: new Color(58, 130, 190, 230) },
            { text: '麻将战绩', handler: 'onMahjongRecordsClicked', x: -700, color: new Color(52, 150, 110, 230) },
        ];

        shortcuts.forEach((item) => {
            const btnNode = new Node(item.handler);
            btnNode.parent = this.node;
            btnNode.setPosition(item.x, -470, 0);
            btnNode.addComponent(UITransform).setContentSize(140, 44);

            const graphics = btnNode.addComponent(Graphics);
            graphics.fillColor = item.color;
            graphics.roundRect(-70, -22, 140, 44, 10);
            graphics.fill();

            const labelNode = new Node('Label');
            labelNode.parent = btnNode;
            const label = labelNode.addComponent(Label);
            label.string = item.text;
            label.fontSize = 22;
            label.color = new Color(255, 255, 255, 255);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            labelNode.addComponent(UITransform).setContentSize(130, 40);

            const button = btnNode.addComponent(Button);
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 1.05;
            const evt = new EventHandler();
            evt.target = this.node;
            evt.component = 'Hall';
            evt.handler = item.handler;
            button.clickEvents.push(evt);
        });
    }
}

