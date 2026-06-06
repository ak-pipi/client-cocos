import { _decorator, Component, Node, Label, Color, Graphics, Button, EventHandler, UITransform, EditBox, Prefab } from 'cc';
import { Client } from './Client';
import { GameFactory } from '../App/GameFactory';
import { GameId, GameType } from '../App/GameEnums';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { GameRoomApi, getServerGameType } from '../Network/GameRoomApi';
import { DlgMahjongRecords } from './Dialogs/DlgMahjongRecords';

const { ccclass } = _decorator;

@ccclass('NewGameHall')
export class NewGameHall extends Component {
    private gameId: GameId = '' as GameId;
    private gameName: string = '';

    private titleLabel: Label | null = null;
    private joinPopup: Node | null = null;
    private joinEditBox: EditBox | null = null;
    private dlgMahjongRecords: Node | null = null;

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
        this.createJoinPopup();
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
        ];
        const meta = GameFactory.getGameMeta(this.gameId);
        if (meta?.type === GameType.Mahjong) {
            buttons.push({ text: '麻将战绩', action: 'onMahjongRecords' });
        }
        buttons.push({ text: '返回大厅', action: 'onBack' });

        const startY = 120;
        const gapY = 82;
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

    private createJoinPopup(): void {
        const popup = new Node('JoinPopup');
        popup.parent = this.node;
        popup.active = false;
        this.joinPopup = popup;

        const mask = new Node('Mask');
        mask.parent = popup;
        const maskTransform = mask.addComponent(UITransform);
        maskTransform.setContentSize(1920, 1080);
        const maskGraphics = mask.addComponent(Graphics);
        maskGraphics.fillColor = new Color(0, 0, 0, 160);
        maskGraphics.roundRect(-960, -540, 1920, 1080, 0);
        maskGraphics.fill();

        const panel = new Node('Panel');
        panel.parent = popup;
        const panelTransform = panel.addComponent(UITransform);
        panelTransform.setContentSize(500, 280);
        const panelGraphics = panel.addComponent(Graphics);
        panelGraphics.fillColor = new Color(30, 70, 110, 255);
        panelGraphics.roundRect(-250, -140, 500, 280, 12);
        panelGraphics.fill();

        const titleNode = new Node('Title');
        titleNode.parent = panel;
        const titleTransform = titleNode.addComponent(UITransform);
        titleTransform.setContentSize(460, 40);
        titleNode.setPosition(0, 90, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = '输入6位房间号';
        titleLabel.fontSize = 28;
        titleLabel.horizontalAlign = 1;
        titleLabel.color = new Color(255, 255, 255, 255);

        const inputNode = new Node('Input');
        inputNode.parent = panel;
        const inputTransform = inputNode.addComponent(UITransform);
        inputTransform.setContentSize(360, 50);
        inputNode.setPosition(0, 20, 0);
        const inputGraphics = inputNode.addComponent(Graphics);
        inputGraphics.fillColor = new Color(255, 255, 255, 255);
        inputGraphics.roundRect(-180, -25, 360, 50, 8);
        inputGraphics.fill();

        const editBox = inputNode.addComponent(EditBox);
        editBox.maxLength = 6;
        editBox.inputMode = EditBox.InputMode.NUMERIC;
        editBox.placeholder = '请输入房间号';
        editBox.string = '';
        this.joinEditBox = editBox;

        this.createPopupButton(panel, '确认', -80, new Color(46, 139, 87, 255), 'onJoinConfirm');
        this.createPopupButton(panel, '取消', -80, new Color(160, 82, 45, 255), 'onJoinCancel', 120);
    }

    private createPopupButton(
        parent: Node,
        text: string,
        y: number,
        color: Color,
        handler: string,
        offsetX = -120
    ): void {
        const btnNode = new Node(handler);
        btnNode.parent = parent;
        const btnTransform = btnNode.addComponent(UITransform);
        btnTransform.setContentSize(120, 44);
        btnNode.setPosition(offsetX, y, 0);

        const graphics = btnNode.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.roundRect(-60, -22, 120, 44, 8);
        graphics.fill();

        const labelNode = new Node('Label');
        labelNode.parent = btnNode;
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 22;
        label.horizontalAlign = 1;
        label.color = new Color(255, 255, 255, 255);

        const button = btnNode.addComponent(Button);
        const clickEvent = new EventHandler();
        clickEvent.target = this.node;
        clickEvent.component = 'NewGameHall';
        clickEvent.handler = handler;
        button.clickEvents.push(clickEvent);
    }

    public onCreateRoom(_event: Event, _customEventData: any | null) {
        const gameType = getServerGameType(this.gameId);
        if (!gameType) {
            Client.Instance.showPromptDialog('不支持的游戏类型');
            return;
        }

        GameRoomApi.Instance.createRoom(gameType, { level: 1 }).then((result) => {
            if (!result) return;
            GameRoomApi.Instance.enterVenue(result, gameType, () => this.onEnterVenue());
        }).catch((err) => {
            console.error('[NewGameHall] Create room error:', err);
            Client.Instance.showPromptDialog('创建房间失败，请重试');
        });
    }

    public onJoinRoom(_event: Event, _customEventData: any | null) {
        if (this.joinPopup) {
            this.joinPopup.active = true;
            if (this.joinEditBox) {
                this.joinEditBox.string = '';
            }
        }
    }

    public onJoinCancel(_event: Event, _customEventData: any | null) {
        if (this.joinPopup) {
            this.joinPopup.active = false;
        }
    }

    public onJoinConfirm(_event: Event, _customEventData: any | null) {
        const roomNumber = this.joinEditBox?.string?.trim() || '';
        if (!/^\d{6}$/.test(roomNumber)) {
            Client.Instance.showPromptTip('请输入6位数字房间号');
            return;
        }

        const gameType = getServerGameType(this.gameId);
        if (!gameType) {
            Client.Instance.showPromptDialog('不支持的游戏类型');
            return;
        }

        GameRoomApi.Instance.joinByNumber(roomNumber, gameType).then((result) => {
            if (!result) return;
            if (this.joinPopup) {
                this.joinPopup.active = false;
            }
            GameRoomApi.Instance.enterVenue(result, gameType, () => this.onEnterVenue());
        }).catch((err) => {
            console.error('[NewGameHall] Join room error:', err);
            Client.Instance.showPromptDialog('加入房间失败，请重试');
        });
    }

    public onMahjongRecords(_event: Event, _customEventData: any | null) {
        if (this.dlgMahjongRecords) {
            this.dlgMahjongRecords.active = true;
            return;
        }
        this.dlgMahjongRecords = new Node('DlgMahjongRecords');
        this.dlgMahjongRecords.parent = this.node;
        this.dlgMahjongRecords.addComponent(DlgMahjongRecords);
    }

    public onBack(_event: Event, _customEventData: any | null) {
        Client.Instance.backToHall();
    }

    private onEnterVenue(): void {
        ResourceLoader.Instance.loadAsset('GuanDanRoomMain', 'Room', Prefab, (prefab: Prefab) => {
            if (!prefab) {
                Client.Instance.showPromptDialog('游戏房间加载失败');
                return;
            }
            Client.Instance.initGameRoom(prefab);
            GameFactory.Instance.createRoom(this.gameId);
        });
    }
}
