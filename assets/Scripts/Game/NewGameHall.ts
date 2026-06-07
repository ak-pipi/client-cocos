import { _decorator, Component, Node, Label, Color, Graphics, Button, EventHandler, UITransform, EditBox, Prefab, sys } from 'cc';
import { Client } from './Client';
import { GameFactory } from '../App/GameFactory';
import { GameId, GameType } from '../App/GameEnums';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { GameRoomApi, EnterVenueResult, getServerGameType } from '../Network/GameRoomApi';
import { DlgMahjongRecords } from './Dialogs/DlgMahjongRecords';

const { ccclass } = _decorator;

// 桃江麻将默认规则配置
const TAOJIANG_DEFAULT_RULES = {
    base_score: 1,
    max_score: 0,
    round_count: 8,
    allow_chi: false,
    allow_peng: true,
    allow_gang: true,
    allow_zimo: true,
    allow_dianpao: true,
};

@ccclass('NewGameHall')
export class NewGameHall extends Component {
    private gameId: GameId = '' as GameId;
    private gameName: string = '';

    private titleLabel: Label | null = null;
    private joinPopup: Node | null = null;
    private joinEditBox: EditBox | null = null;
    private dlgMahjongRecords: Node | null = null;
    private createConfigPopup: Node | null = null;
    private createRules: Record<string, any> = {};

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
        this.createMahjongConfigPopup();
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
        const meta = GameFactory.getGameMeta(this.gameId);
        if (meta?.type === GameType.Mahjong) {
            // 麻将游戏显示规则配置弹窗
            if (this.createConfigPopup) {
                this.resetCreateRules();
                this.createConfigPopup.active = true;
            }
        } else {
            // 非麻将游戏直接创建
            this.doCreateRoom({});
        }
    }

    private resetCreateRules(): void {
        this.createRules = { ...TAOJIANG_DEFAULT_RULES };
    }

    /** 创建麻将规则配置弹窗 */
    private createMahjongConfigPopup(): void {
        const popup = new Node('CreateConfigPopup');
        popup.parent = this.node;
        popup.active = false;
        this.createConfigPopup = popup;

        // 遮罩
        const mask = new Node('Mask');
        mask.parent = popup;
        mask.addComponent(UITransform).setContentSize(1920, 1080);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 160);
        mg.roundRect(-960, -540, 1920, 1080, 0);
        mg.fill();
        mask.on(Node.EventType.TOUCH_END, () => { /* 点击遮罩不关闭 */ });

        // 面板
        const panel = new Node('Panel');
        panel.parent = popup;
        const pw = 550, ph = 520;
        panel.addComponent(UITransform).setContentSize(pw, ph);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(30, 55, 85, 255);
        pg.roundRect(-pw / 2, -ph / 2, pw, ph, 12);
        pg.fill();

        // 标题
        this.addLabel(panel, '创建房间 - 规则设置', 24, new Color(255, 220, 100, 255), 0, ph / 2 - 35);

        let y = ph / 2 - 80;
        // 底注选项
        y = this.addOptionRow(panel, '底注', y, [
            { text: '1', value: 1 },
            { text: '2', value: 2 },
            { text: '5', value: 5 },
            { text: '10', value: 10 },
        ], 'base_score');

        // 封顶分选项
        y = this.addOptionRow(panel, '封顶', y, [
            { text: '不限', value: 0 },
            { text: '100', value: 100 },
            { text: '200', value: 200 },
            { text: '500', value: 500 },
        ], 'max_score');

        // 局数选项
        y = this.addOptionRow(panel, '局数', y, [
            { text: '4局', value: 4 },
            { text: '8局', value: 8 },
            { text: '16局', value: 16 },
        ], 'round_count');

        y -= 15;
        // 分割线
        const sep = new Node('Sep');
        sep.parent = panel;
        sep.addComponent(UITransform).setContentSize(pw - 40, 2);
        sep.setPosition(0, y, 0);
        const sg = sep.addComponent(Graphics);
        sg.fillColor = new Color(80, 110, 140, 200);
        sg.rect(-(pw - 40) / 2, -1, pw - 40, 2);
        sg.fill();
        y -= 25;

        // 开关选项标签
        this.addLabel(panel, '玩法选项', 20, new Color(200, 200, 200, 255), -pw / 2 + 50, y);
        y -= 30;

        // 开关选项
        y = this.addToggleRow(panel, '允许吃牌', y, 'allow_chi');
        y = this.addToggleRow(panel, '允许碰牌', y, 'allow_peng');
        y = this.addToggleRow(panel, '允许杠牌', y, 'allow_gang');
        y = this.addToggleRow(panel, '允许自摸', y, 'allow_zimo');
        y = this.addToggleRow(panel, '允许点炮', y, 'allow_dianpao');

        // 按钮
        y = -ph / 2 + 40;
        this.createPopupButton(panel, '创建', y, new Color(46, 139, 87, 255), 'onCreateConfirm', -100);
        this.createPopupButton(panel, '取消', y, new Color(160, 82, 45, 255), 'onCreateCancel', 100);
    }

    /** 添加选项行（单选按钮组） */
    private addOptionRow(parent: Node, labelText: string, y: number, options: Array<{text: string, value: number}>, ruleKey: string): number {
        // 标签
        const labelNode = new Node(`Label_${ruleKey}`);
        labelNode.parent = parent;
        labelNode.addComponent(UITransform).setContentSize(120, 30);
        labelNode.setPosition(-180, y, 0);
        const label = labelNode.addComponent(Label);
        label.string = labelText;
        label.fontSize = 20;
        label.color = new Color(200, 200, 200, 255);
        label.horizontalAlign = 0;

        const startX = -80;
        const gap = 110;
        const defaultVal = this.createRules[ruleKey] ?? options[0].value;

        options.forEach((opt, idx) => {
            const isSelected = (opt.value === defaultVal);
            const btnNode = new Node(`Opt_${ruleKey}_${idx}`);
            btnNode.parent = parent;
            btnNode.addComponent(UITransform).setContentSize(100, 32);
            btnNode.setPosition(startX + idx * gap, y, 0);

            const g = btnNode.addComponent(Graphics);
            g.fillColor = isSelected ? new Color(70, 150, 220, 255) : new Color(60, 80, 100, 255);
            g.roundRect(-50, -16, 100, 32, 6);
            g.fill();

            const l = new Node('L');
            l.parent = btnNode;
            l.addComponent(UITransform).setContentSize(90, 28);
            const lc = l.addComponent(Label);
            lc.string = opt.text;
            lc.fontSize = 18;
            lc.color = isSelected ? new Color(255, 255, 255, 255) : new Color(160, 160, 160, 255);
            lc.horizontalAlign = 1;
            lc.verticalAlign = 1;

            btnNode.on(Node.EventType.TOUCH_END, () => {
                this.createRules[ruleKey] = opt.value;
                this.refreshOptionRow(parent, ruleKey, options);
            });
        });

        return y - 42;
    }

    /** 刷新选项行显示 */
    private refreshOptionRow(parent: Node, ruleKey: string, options: Array<{text: string, value: number}>): void {
        options.forEach((opt, idx) => {
            const btnNode = parent.getChildByName(`Opt_${ruleKey}_${idx}`);
            if (!btnNode) return;
            const isSelected = (opt.value === this.createRules[ruleKey]);
            const g = btnNode.getComponent(Graphics);
            if (g) g.fillColor = isSelected ? new Color(70, 150, 220, 255) : new Color(60, 80, 100, 255);
            const l = btnNode.getChildByName('L');
            if (l) {
                const lc = l.getComponent(Label);
                if (lc) lc.color = isSelected ? new Color(255, 255, 255, 255) : new Color(160, 160, 160, 255);
            }
        });
    }

    /** 添加开关行 */
    private addToggleRow(parent: Node, labelText: string, y: number, ruleKey: string): number {
        const defaultVal = this.createRules[ruleKey] ?? true;

        const labelNode = new Node(`ToggleLabel_${ruleKey}`);
        labelNode.parent = parent;
        labelNode.addComponent(UITransform).setContentSize(160, 28);
        labelNode.setPosition(-100, y, 0);
        const label = labelNode.addComponent(Label);
        label.string = labelText;
        label.fontSize = 20;
        label.color = new Color(200, 200, 200, 255);
        label.horizontalAlign = 0;

        const btnNode = new Node(`Toggle_${ruleKey}`);
        btnNode.parent = parent;
        btnNode.addComponent(UITransform).setContentSize(80, 30);
        btnNode.setPosition(60, y, 0);

        const g = btnNode.addComponent(Graphics);
        g.fillColor = defaultVal ? new Color(46, 180, 80, 255) : new Color(120, 50, 50, 255);
        g.roundRect(-40, -15, 80, 30, 6);
        g.fill();

        const statusLabel = new Node('Status');
        statusLabel.parent = btnNode;
        statusLabel.addComponent(UITransform).setContentSize(70, 26);
        const sl = statusLabel.addComponent(Label);
        sl.string = defaultVal ? '开' : '关';
        sl.fontSize = 18;
        sl.color = new Color(255, 255, 255, 255);
        sl.horizontalAlign = 1;
        sl.verticalAlign = 1;

        btnNode.on(Node.EventType.TOUCH_END, () => {
            this.createRules[ruleKey] = !this.createRules[ruleKey];
            const isOn = this.createRules[ruleKey];
            g.fillColor = isOn ? new Color(46, 180, 80, 255) : new Color(120, 50, 50, 255);
            sl.string = isOn ? '开' : '关';
        });

        return y - 35;
    }

    private addLabel(parent: Node, text: string, fontSize: number, color: Color, x: number, y: number): void {
        const node = new Node('Lbl');
        node.parent = parent;
        node.addComponent(UITransform).setContentSize(400, 30);
        node.setPosition(x, y, 0);
        const l = node.addComponent(Label);
        l.string = text;
        l.fontSize = fontSize;
        l.color = color;
        l.horizontalAlign = 0;
        l.verticalAlign = 1;
    }

    public onCreateConfirm(_event: Event, _customEventData: any | null) {
        if (this.createConfigPopup) this.createConfigPopup.active = false;
        this.doCreateRoom(this.createRules);
    }

    public onCreateCancel(_event: Event, _customEventData: any | null) {
        if (this.createConfigPopup) this.createConfigPopup.active = false;
    }

    private doCreateRoom(rules: Record<string, any>): void {
        const gameType = getServerGameType(this.gameId);
        if (!gameType) {
            Client.Instance.showPromptDialog('不支持的游戏类型');
            return;
        }

        const params: Record<string, any> = { level: 1, ...rules };
        GameRoomApi.Instance.createRoom(gameType, params).then((result) => {
            if (!result) return;
            GameRoomApi.Instance.enterVenue(result, gameType, () => this.onEnterVenue(result));
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
            GameRoomApi.Instance.enterVenue(result, gameType, () => this.onEnterVenue(result));
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

    private onEnterVenue(result: EnterVenueResult): void {
        ResourceLoader.Instance.loadAsset('GuanDanRoomMain', 'Room', Prefab, (prefab: Prefab) => {
            if (!prefab) {
                Client.Instance.showPromptDialog('游戏房间加载失败');
                return;
            }
            Client.Instance.initGameRoom(prefab);
            const room = GameFactory.Instance.createRoom(this.gameId, undefined, Client.Instance.getGameRoomNode());
            room.presetRoomNumber(result?.number || null);
        });
    }
}
