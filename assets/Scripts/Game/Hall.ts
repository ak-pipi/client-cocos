// 大厅界面脚本
// Author wujian
// Email 393817707@qq.com
// Date 2025.11.03

import { _decorator, Component, Label, Node, Sprite, sys, AudioClip, SpriteFrame, Prefab, instantiate, Color, UITransform, Graphics, Button, EventHandler } from 'cc';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { GameManager } from '../Manager/GameManager';
import { Client } from './Client';
import { GameId } from '../App/GameEnums';
import { DlgPublicRooms } from './Dialogs/DlgPublicRooms';
import { DlgMahjongRecords } from './Dialogs/DlgMahjongRecords';
import { DlgMembers } from './Dialogs/DlgMembers';
import { DlgInvitePlayer } from './Dialogs/DlgInvitePlayer';
import { DlgFamilyInvite } from './Dialogs/DlgFamilyInvite';
import { DlgStats } from './Dialogs/DlgStats';
import { DlgMatchSettings } from './Dialogs/DlgMatchSettings';
import { DlgIncomeBox } from './Dialogs/DlgIncomeBox';
import { sanitizeAllEditBoxDefaultLabels } from '../UI/UiKit';
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

    private dlgMembers: Node = null;

    private dlgStats: Node = null;

    private dlgIncomeBox: Node = null;

    private dlgMatchSettings: Node = null;

    private dlgInvitePlayer: Node = null;

    private dlgFamilyInvite: Node = null;

    private guestEntryRoot: Node = null;

    private incomeBoxButton: Node = null;

    private agencyMenuButtons: Map<string, Node> = new Map<string, Node>();

    private playerInfoTime: number = 0;

    start() {
        this.playBackgroundMusic();
        this.hideDiamondFeature();
        this.hideDownloadQRCodeModule();
        this.renameBankButtonText();
        this.loadGameList();
        this.createShortcutButtons();
        this.createIncomeBoxButton();
        this.createGuestEntryPanel();
        this.refreshPermissionViews();
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
            this.gameList.setPosition(0, 60, 0);
            this.gameList.active = GameManager.Instance.CanCreateRoom;
            this.refreshPermissionViews();
        });
    }

    private updatePlayerInfo() {
        this.playerInfoTime = sys.now();
        this.labelName.string = GameManager.Instance.NickName;
        this.labelPlayerId.string = GameManager.Instance.PlayerId;
        this.labelGold.string = GameManager.Instance.Gold.toString();
        this.refreshPermissionViews();
        if (!GameManager.Instance.Avatar) return;
        GameManager.Instance.loadSpriteFrame(GameManager.Instance.Avatar, (spriteFrame: SpriteFrame) => {
            this.spriteHead.spriteFrame = spriteFrame;
        });
    }

    public onHeadClicked() {
        if (this.dlgPersonalCenter) {
            this.showDialogNode(this.dlgPersonalCenter);
            return;
        }
        ResourceLoader.Instance.loadAsset("PersonalCenter", "DlgPersonalCenter", Prefab, (prefab: Prefab) => {
            this.dlgPersonalCenter = instantiate(prefab);
            this.dlgPersonalCenter.parent = this.getDialogParent();
            this.showDialogNode(this.dlgPersonalCenter);
        });
    }

    public onBankClicked() {
        if (this.dlgBank) {
            this.showDialogNode(this.dlgBank);
            return;
        }
        ResourceLoader.Instance.loadAsset("Bank", "DlgBank", Prefab, (prefab: Prefab) => {
            this.dlgBank = instantiate(prefab);
            this.dlgBank.parent = this.getDialogParent();
            this.showDialogNode(this.dlgBank);
        });
    }

    public onIncomeBoxClicked() {
        if (!GameManager.Instance.CanAgencyManage) {
            Client.Instance.showPromptTip("暂无权限", 2.0);
            return;
        }
        if (this.dlgIncomeBox) {
            this.showDialogNode(this.dlgIncomeBox);
            return;
        }
        this.dlgIncomeBox = new Node('DlgIncomeBox');
        this.dlgIncomeBox.parent = this.getDialogParent();
        this.dlgIncomeBox.addComponent(DlgIncomeBox);
        this.showDialogNode(this.dlgIncomeBox);
    }

    public onShopClicked() {
        Client.Instance.showPromptTip("钻石功能已下线", 2.0);
    }

    private hideDiamondFeature() {
        if (this.labelDiamond) {
            this.labelDiamond.node.active = false;
            if (this.labelDiamond.node.parent?.name === 'Diamond') {
                this.labelDiamond.node.parent.active = false;
            }
        }
    }

    private hideDownloadQRCodeModule(): void {
        const slideAdvertisement = this.node.getChildByName('SlideAdvertisement');
        if (slideAdvertisement) {
            slideAdvertisement.active = false;
        }
    }

    private renameBankButtonText(): void {
        const btnBank = this.node.getChildByName('Buttons')?.getChildByName('BtnBank');
        if (!btnBank || btnBank.getChildByName('SafeBoxLabel')) return;

        const bgNode = new Node('SafeBoxLabel');
        bgNode.parent = btnBank;
        bgNode.addComponent(UITransform).setContentSize(82, 26);
        bgNode.setPosition(0, -29, 0);

        const graphics = bgNode.addComponent(Graphics);
        graphics.fillColor = new Color(20, 62, 118, 235);
        graphics.roundRect(-41, -13, 82, 26, 8);
        graphics.fill();

        const labelNode = new Node('Label');
        labelNode.parent = bgNode;
        labelNode.addComponent(UITransform).setContentSize(78, 24);
        const label = labelNode.addComponent(Label);
        label.string = '保险箱';
        label.fontSize = 18;
        label.lineHeight = 22;
        label.overflow = Label.Overflow.SHRINK;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(255, 255, 255, 255);
        labelNode.setPosition(0, 0, 0);
    }

    public onUpClicked() {
        if (!this.menu) return;
        this.menu.active = true;
    }

    public onMailClicked() {
        if (this.dlgEmail) {
            this.showDialogNode(this.dlgEmail);
            return;
        }
        ResourceLoader.Instance.loadAsset("Dialog", "DlgEmail", Prefab, (prefab: Prefab) => {
            this.dlgEmail = instantiate(prefab);
            this.dlgEmail.parent = this.getDialogParent();
            this.showDialogNode(this.dlgEmail);
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
            this.showDialogNode(this.dlgSetting);
            return;
        }
        ResourceLoader.Instance.loadAsset("Setting", "DlgSetting", Prefab, (prefab: Prefab) => {
            this.dlgSetting = instantiate(prefab);
            this.dlgSetting.parent = this.getDialogParent();
            this.showDialogNode(this.dlgSetting);
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
            this.showDialogNode(this.dlgService);
            return;
        }
        ResourceLoader.Instance.loadAsset("Dialog", "DlgService", Prefab, (prefab: Prefab) => {
            this.dlgService = instantiate(prefab);
            this.dlgService.parent = this.getDialogParent();
            this.showDialogNode(this.dlgService);
        });
    }

    public onPublicRoomsClicked() {
        this.showPublicRooms();
    }

    public onMahjongRecordsClicked() {
        this.showMahjongRecords();
    }

    public onMembersClicked() {
        if (!GameManager.Instance.CanAgencyManage) {
            Client.Instance.showPromptTip("暂无权限", 2.0);
            return;
        }
        if (this.dlgMembers) {
            this.showDialogNode(this.dlgMembers);
            return;
        }
        this.dlgMembers = new Node('DlgMembers');
        this.dlgMembers.parent = this.getDialogParent();
        this.dlgMembers.addComponent(DlgMembers);
        this.showDialogNode(this.dlgMembers);
    }

    public onInviteClicked() {
        if (!GameManager.Instance.CanAgencyManage) {
            Client.Instance.showPromptTip("暂无权限", 2.0);
            return;
        }
        if (this.dlgInvitePlayer) {
            this.showDialogNode(this.dlgInvitePlayer);
            return;
        }
        this.dlgInvitePlayer = new Node('DlgInvitePlayer');
        this.dlgInvitePlayer.parent = this.getDialogParent();
        this.dlgInvitePlayer.addComponent(DlgInvitePlayer);
        this.showDialogNode(this.dlgInvitePlayer);
    }

    public onStatsClicked() {
        if (!GameManager.Instance.CanAgencyManage) {
            Client.Instance.showPromptTip("暂无权限", 2.0);
            return;
        }
        if (this.dlgStats) {
            this.showDialogNode(this.dlgStats);
            return;
        }
        this.dlgStats = new Node('DlgStats');
        this.dlgStats.parent = this.getDialogParent();
        this.dlgStats.addComponent(DlgStats);
        this.showDialogNode(this.dlgStats);
    }

    public onMatchSettingsClicked() {
        if (!GameManager.Instance.CanAgencyManage) {
            Client.Instance.showPromptTip("暂无权限", 2.0);
            return;
        }
        if (this.dlgMatchSettings) {
            this.showDialogNode(this.dlgMatchSettings);
            return;
        }
        this.dlgMatchSettings = new Node('DlgMatchSettings');
        this.dlgMatchSettings.parent = this.getDialogParent();
        this.dlgMatchSettings.addComponent(DlgMatchSettings);
        this.showDialogNode(this.dlgMatchSettings);
    }

    public onRecordsClicked() {
        this.showMahjongRecords();
    }

    public onGuestCreateRoomClicked() {
        Client.Instance.showPromptTip("暂未开放", 2.0);
    }

    public onGuestJoinRoomClicked() {
        Client.Instance.showPromptTip("暂未开放", 2.0);
    }

    public onFamilyCircleClicked() {
        if (this.dlgFamilyInvite) {
            this.showDialogNode(this.dlgFamilyInvite);
            return;
        }
        this.dlgFamilyInvite = new Node('DlgFamilyInvite');
        this.dlgFamilyInvite.parent = this.getDialogParent();
        this.dlgFamilyInvite.addComponent(DlgFamilyInvite);
        this.showDialogNode(this.dlgFamilyInvite);
    }

    private getDialogParent(): Node {
        const parent = this.popup || this.node;
        if (parent !== this.node) {
            parent.active = true;
            const transform = parent.getComponent(UITransform) || parent.addComponent(UITransform);
            if (transform.width <= 0 || transform.height <= 0) {
                transform.setContentSize(1920, 1080);
            }
        }
        this.bringNodeToFront(parent);
        return parent;
    }

    private showDialogNode(dialog: Node): void {
        dialog.active = true;
        this.bringNodeToFront(dialog.parent);
        this.bringNodeToFront(dialog);
        sanitizeAllEditBoxDefaultLabels(dialog);
    }

    private bringNodeToFront(node: Node | null): void {
        if (!node || !node.parent) return;
        node.setSiblingIndex(node.parent.children.length - 1);
    }

    private showPublicRooms() {
        if (this.dlgPublicRooms) {
            this.showDialogNode(this.dlgPublicRooms);
            return;
        }
        this.dlgPublicRooms = new Node('DlgPublicRooms');
        this.dlgPublicRooms.parent = this.getDialogParent();
        this.dlgPublicRooms.addComponent(DlgPublicRooms);
        this.showDialogNode(this.dlgPublicRooms);
    }

    private showMahjongRecords() {
        if (this.dlgMahjongRecords) {
            const comp = this.dlgMahjongRecords.getComponent(DlgMahjongRecords);
            if (comp) comp.setup(GameId.TaojiangMahjong, true);
            this.showDialogNode(this.dlgMahjongRecords);
            return;
        }
        this.dlgMahjongRecords = new Node('DlgMahjongRecords');
        this.dlgMahjongRecords.active = false;
        this.dlgMahjongRecords.parent = this.getDialogParent();
        const comp = this.dlgMahjongRecords.addComponent(DlgMahjongRecords);
        comp.setup(GameId.TaojiangMahjong, true);
        this.showDialogNode(this.dlgMahjongRecords);
    }

    private createShortcutButtons() {
        this.createMatchSettingsButton();
        this.createAgencyMenuButtons();
    }

    private createIncomeBoxButton(): void {
        if (this.incomeBoxButton && this.incomeBoxButton.isValid) return;
        const goldNode = this.labelGold?.node?.parent || this.node.getChildByName('Gold') || this.node;
        const exists = goldNode.getChildByName('IncomeBoxButton');
        if (exists) {
            this.incomeBoxButton = exists;
            return;
        }

        const btnNode = new Node('IncomeBoxButton');
        btnNode.parent = goldNode;
        btnNode.setPosition(205, 0, 0);
        btnNode.addComponent(UITransform).setContentSize(132, 42);

        const graphics = btnNode.addComponent(Graphics);
        graphics.fillColor = new Color(26, 118, 98, 245);
        graphics.roundRect(-66, -21, 132, 42, 18);
        graphics.fill();

        const labelNode = new Node('Label');
        labelNode.parent = btnNode;
        labelNode.addComponent(UITransform).setContentSize(118, 34);
        const label = labelNode.addComponent(Label);
        label.string = '收益箱';
        label.fontSize = 22;
        label.lineHeight = 28;
        label.overflow = Label.Overflow.SHRINK;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(255, 240, 178, 255);
        labelNode.setPosition(0, 0, 0);

        const button = btnNode.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 1.08;
        const evt = new EventHandler();
        evt.target = this.node;
        evt.component = 'Hall';
        evt.handler = 'onIncomeBoxClicked';
        button.clickEvents.push(evt);
        this.incomeBoxButton = btnNode;
    }

    private createMatchSettingsButton(): void {
        const host = this.node;
        const exists = host.getChildByName('onMatchSettingsClicked');
        if (exists) {
            this.agencyMenuButtons.set('onMatchSettingsClicked', exists);
            return;
        }

        const btnNode = new Node('onMatchSettingsClicked');
        btnNode.parent = host;
        btnNode.setPosition(555, 400, 0);
        btnNode.addComponent(UITransform).setContentSize(104, 72);

        const graphics = btnNode.addComponent(Graphics);
        graphics.fillColor = new Color(226, 124, 58, 250);
        graphics.roundRect(-52, -36, 104, 72, 34);
        graphics.fill();

        const labelNode = new Node('Label');
        labelNode.parent = btnNode;
        labelNode.addComponent(UITransform).setContentSize(88, 56);
        const label = labelNode.addComponent(Label);
        label.string = '比赛\n设置';
        label.fontSize = 24;
        label.lineHeight = 27;
        label.color = new Color(255, 255, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        labelNode.setPosition(0, 0, 0);

        const button = btnNode.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 1.08;
        const evt = new EventHandler();
        evt.target = this.node;
        evt.component = 'Hall';
        evt.handler = 'onMatchSettingsClicked';
        button.clickEvents.push(evt);
        this.agencyMenuButtons.set('onMatchSettingsClicked', btnNode);
    }

    private createAgencyMenuButtons() {
        const host = this.node.getChildByName('Buttons') || this.node;
        const buttons = [
            { text: '成员', handler: 'onMembersClicked', x: -360, color: new Color(252, 196, 66, 245) },
            { text: '邀请', handler: 'onInviteClicked', x: -260, color: new Color(34, 188, 168, 235) },
            { text: '统计', handler: 'onStatsClicked', x: -160, color: new Color(88, 142, 202, 235) },
            { text: '战绩', handler: 'onRecordsClicked', x: -60, color: new Color(172, 112, 188, 235) },
        ];

        buttons.forEach((item) => {
            const exists = host.getChildByName(item.handler);
            if (exists) {
                this.agencyMenuButtons.set(item.handler, exists);
                return;
            }
            const btnNode = new Node(item.handler);
            btnNode.parent = host;
            btnNode.setPosition(item.x, -400, 0);
            btnNode.addComponent(UITransform).setContentSize(78, 78);

            const graphics = btnNode.addComponent(Graphics);
            graphics.fillColor = item.color;
            graphics.roundRect(-39, -39, 78, 78, 14);
            graphics.fill();

            const labelNode = new Node('Label');
            labelNode.parent = btnNode;
            const label = labelNode.addComponent(Label);
            label.string = item.text;
            label.fontSize = 22;
            label.color = new Color(255, 255, 255, 255);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            labelNode.addComponent(UITransform).setContentSize(72, 42);
            labelNode.setPosition(0, 0, 0);

            const button = btnNode.addComponent(Button);
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 1.12;
            const evt = new EventHandler();
            evt.target = this.node;
            evt.component = 'Hall';
            evt.handler = item.handler;
            button.clickEvents.push(evt);
            this.agencyMenuButtons.set(item.handler, btnNode);
        });
    }

    private createGuestEntryPanel() {
        if (this.guestEntryRoot) return;
        const root = new Node('GuestEntryPanel');
        root.parent = this.node;
        root.addComponent(UITransform).setContentSize(1120, 320);
        root.setPosition(0, -36, 0);
        this.guestEntryRoot = root;

        const modules = [
            { text: '创建房间', handler: 'onGuestCreateRoomClicked', x: -360, color: new Color(224, 118, 64, 242) },
            { text: '加入房间', handler: 'onGuestJoinRoomClicked', x: 0, color: new Color(68, 148, 196, 242) },
            { text: '亲友圈', handler: 'onFamilyCircleClicked', x: 360, color: new Color(70, 170, 128, 242) },
        ];

        modules.forEach((item) => {
            const card = new Node(item.handler);
            card.parent = root;
            card.setPosition(item.x, 0, 0);
            card.addComponent(UITransform).setContentSize(280, 180);

            const graphics = card.addComponent(Graphics);
            graphics.fillColor = item.color;
            graphics.roundRect(-140, -90, 280, 180, 18);
            graphics.fill();

            const labelNode = new Node('Label');
            labelNode.parent = card;
            labelNode.addComponent(UITransform).setContentSize(250, 70);
            const label = labelNode.addComponent(Label);
            label.string = item.text;
            label.fontSize = 38;
            label.lineHeight = 44;
            label.color = new Color(255, 255, 255, 255);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;

            const button = card.addComponent(Button);
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 1.04;
            const evt = new EventHandler();
            evt.target = this.node;
            evt.component = 'Hall';
            evt.handler = item.handler;
            button.clickEvents.push(evt);
        });

        if (this.popup) {
            this.bringNodeToFront(this.popup);
        }
    }

    private refreshPermissionViews() {
        const canCreateRoom = GameManager.Instance.CanCreateRoom;
        const canAgencyManage = GameManager.Instance.CanAgencyManage;

        if (this.gameListSlot) {
            this.gameListSlot.active = canCreateRoom;
        }
        if (this.gameList) {
            this.gameList.active = canCreateRoom;
        }
        if (this.guestEntryRoot) {
            this.guestEntryRoot.active = !canCreateRoom;
        }

        this.setBuiltinBottomButtonsVisible(canAgencyManage, canCreateRoom, GameManager.Instance.LoggedIn);
        this.setAgencyMenuButtonVisible('onMembersClicked', canAgencyManage);
        this.setAgencyMenuButtonVisible('onInviteClicked', canAgencyManage);
        this.setAgencyMenuButtonVisible('onStatsClicked', canAgencyManage);
        this.setAgencyMenuButtonVisible('onRecordsClicked', canCreateRoom);
        this.setAgencyMenuButtonVisible('onMatchSettingsClicked', canAgencyManage);
        if (this.incomeBoxButton) {
            this.incomeBoxButton.active = canAgencyManage;
        }
    }

    private setBuiltinBottomButtonsVisible(canAgencyManage: boolean, canUsePlayerFeatures: boolean, canUseSettings: boolean) {
        const host = this.node.getChildByName('Buttons');
        if (!host) return;
        const btnBank = host.getChildByName('BtnBank');
        if (btnBank) btnBank.active = canUsePlayerFeatures || canAgencyManage;
        const btnUp = host.getChildByName('BtnUp');
        if (btnUp) btnUp.active = canUseSettings || canAgencyManage;
        ['BtnMail', 'BtnShop'].forEach((name) => {
            const node = host.getChildByName(name);
            if (node) node.active = canAgencyManage;
        });
    }

    private setAgencyMenuButtonVisible(handler: string, visible: boolean) {
        const node = this.agencyMenuButtons.get(handler);
        if (node) node.active = visible;
    }
}
