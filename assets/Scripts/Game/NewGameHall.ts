import { _decorator, Component, Node, Label, Color, Graphics, Button, EventHandler, UITransform, EditBox, Prefab, sys, Widget, math } from 'cc';
import { Client } from './Client';
import { GameFactory } from '../App/GameFactory';
import { GameId, GameType, StakeOption, GAME_STAKE_OPTIONS } from '../App/GameEnums';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { GameRoomApi, EnterVenueResult, getServerGameType, DistrictVenueItem } from '../Network/GameRoomApi';
import { DlgMahjongRecords } from './Dialogs/DlgMahjongRecords';

const { ccclass } = _decorator;

// 桃江麻将默认规则配置
const TAOJIANG_DEFAULT_RULES = {
    base_score: 1,
    max_score: 18,
    round_count: 8,
    allow_chi: true,
    allow_peng: true,
    allow_gang: true,
    allow_zimo: true,
    allow_dianpao: true,
    laizi_enabled: true,
    hongzhong_enabled: false,
    bao_ting_enabled: true,
    dissolve_vote: true,
};

const TAOJIANG_BASE_OPTIONS = [
    { text: '1', value: 1 },
    { text: '2', value: 2 },
    { text: '5', value: 5 },
    { text: '10', value: 10 },
    { text: '20', value: 20 },
    { text: '25', value: 25 },
];

const TAOJIANG_ROUND_OPTIONS = [
    { text: '单局', value: 1 },
    { text: '8局', value: 8 },
];

const TAOJIANG_MAX_SCORE_OPTIONS = [
    { text: '18倍', value: 18 },
    { text: '24倍', value: 24 },
    { text: '36倍', value: 36 },
];

@ccclass('NewGameHall')
export class NewGameHall extends Component {
    private gameId: GameId = '' as GameId;
    private gameName: string = '';

    // 倍数配置
    private stakeOptions: StakeOption[] = [];
    private playerCounts: Map<number, number> = new Map();
    private _refreshTimer: number = 0;

    // UI 节点
    private titleLabel: Label | null = null;
    private joinPopup: Node | null = null;
    private joinEditBox: EditBox | null = null;
    private dlgMahjongRecords: Node | null = null;
    private createConfigPopup: Node | null = null;
    private createRules: Record<string, any> = {};
    private tableCardContainer: Node | null = null;
    private tableCardLabels: Map<number, Label> = new Map();  // districtId -> 在线人数 Label
    private selectTablePopup: Node | null = null;

    public init(gameId: string, gameName: string): void {
        this.gameId = gameId as GameId;
        this.gameName = gameName;
        this.stakeOptions = GAME_STAKE_OPTIONS[this.gameId] || [];
        this.buildUI();
        // 初始化后立即刷新一次在线人数
        this.refreshPlayerCounts();
    }

    protected start(): void {
        // 每 10 秒刷新在线人数
        this._refreshTimer = 10;
    }

    protected update(dt: number): void {
        if (this._refreshTimer > 0) {
            this._refreshTimer -= dt;
            if (this._refreshTimer <= 0) {
                this._refreshTimer = 10;
                this.refreshPlayerCounts();
            }
        }
    }

    protected onDestroy(): void {
        this._refreshTimer = 0;
    }

    private buildUI(): void {
        const uiTransform = this.node.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setContentSize(1920, 1080);
        }

        this.createBackground();
        this.createTitle();
        this.createTopBar();
        this.createTableGrid();
        this.createBottomButtons();
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
    }

    private createTitle(): void {
        const titleBg = new Node('TitleBg');
        titleBg.parent = this.node;
        const titleBgTransform = titleBg.addComponent(UITransform);
        titleBgTransform.setContentSize(600, 70);
        titleBg.setPosition(0, 420, 0);

        const titleBgGraphics = titleBg.addComponent(Graphics);
        titleBgGraphics.fillColor = new Color(40, 90, 140, 200);
        titleBgGraphics.roundRect(-300, -35, 600, 70, 12);
        titleBgGraphics.fill();

        const labelNode = new Node('TitleLabel');
        labelNode.parent = this.node;
        const labelTransform = labelNode.addComponent(UITransform);
        labelTransform.setContentSize(560, 50);
        labelNode.setPosition(0, 420, 0);

        const label = labelNode.addComponent(Label);
        label.string = this.gameName;
        label.fontSize = 34;
        label.lineHeight = 42;
        label.overflow = 2;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.color = new Color(255, 220, 100, 255);
        label.isBold = true;

        this.titleLabel = label;
    }

    private createTopBar(): void {
        const barY = 340;

        // 操作栏：加入房间 + 返回大厅
        const btnWidth = 140;
        const btnHeight = 44;
        const btnGap = 20;
        const totalWidth = btnWidth * 2 + btnGap;
        const startX = -totalWidth / 2 + btnWidth / 2;

        this.createTopBarButton('加入房间', startX, barY, new Color(70, 130, 180, 230), 'onJoinRoom');
        this.createTopBarButton('返回大厅', startX + btnWidth + btnGap, barY, new Color(160, 82, 45, 230), 'onBack');
    }

    private createTopBarButton(text: string, x: number, y: number, color: Color, handler: string): void {
        const btnWidth = 140;
        const btnHeight = 44;

        const btnNode = new Node(handler);
        btnNode.parent = this.node;
        btnNode.addComponent(UITransform).setContentSize(btnWidth, btnHeight);
        btnNode.setPosition(x, y, 0);

        const g = btnNode.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 8);
        g.fill();

        const labelNode = new Node('Label');
        labelNode.parent = btnNode;
        labelNode.addComponent(UITransform).setContentSize(btnWidth - 10, btnHeight - 6);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 22;
        label.lineHeight = 28;
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
        clickEvent.handler = handler;
        button.clickEvents.push(clickEvent);
    }

    // ==================== 桌子网格 ====================

    private createTableGrid(): void {
        this.tableCardContainer = new Node('TableGrid');
        this.tableCardContainer.parent = this.node;

        const cols = 4;
        const cardW = 380;
        const cardH = 200;
        const gapX = 30;
        const gapY = 25;
        const totalW = cols * cardW + (cols - 1) * gapX;
        const startX = -totalW / 2 + cardW / 2;
        const startY = 210;

        this.stakeOptions.forEach((stake, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = startX + col * (cardW + gapX);
            const y = startY - row * (cardH + gapY);
            this.createTableCard(x, y, cardW, cardH, stake);
        });
    }

    private createTableCard(x: number, y: number, w: number, h: number, stake: StakeOption): void {
        const card = new Node(`TableCard_${stake.districtId}`);
        card.parent = this.tableCardContainer!;
        card.addComponent(UITransform).setContentSize(w, h);
        card.setPosition(x, y, 0);

        // 卡片背景
        const g = card.addComponent(Graphics);
        g.fillColor = new Color(30, 70, 110, 240);
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.fill();

        // 顶部装饰条
        const topBar = new Node('TopBar');
        topBar.parent = card;
        topBar.addComponent(UITransform).setContentSize(w - 4, 4);
        topBar.setPosition(0, h / 2 - 3, 0);
        const tg = topBar.addComponent(Graphics);
        tg.fillColor = new Color(255, 200, 60, 200);
        tg.rect(-(w - 4) / 2, -2, w - 4, 4);
        tg.fill();

        // 倍数标签
        const stakeLabel = new Node('StakeLabel');
        stakeLabel.parent = card;
        stakeLabel.addComponent(UITransform).setContentSize(w - 30, 40);
        stakeLabel.setPosition(0, h / 2 - 35, 0);
        const sl = stakeLabel.addComponent(Label);
        sl.string = stake.label;
        sl.fontSize = 26;
        sl.lineHeight = 34;
        sl.overflow = 2;
        sl.horizontalAlign = 1;
        sl.verticalAlign = 1;
        sl.color = new Color(255, 220, 100, 255);
        sl.isBold = true;

        // 分隔线
        const sep = new Node('Sep');
        sep.parent = card;
        sep.addComponent(UITransform).setContentSize(w - 40, 1);
        sep.setPosition(0, h / 2 - 58, 0);
        const sg = sep.addComponent(Graphics);
        sg.fillColor = new Color(60, 100, 140, 150);
        sg.rect(-(w - 40) / 2, -0.5, w - 40, 1);
        sg.fill();

        // 在线人数
        const countLabel = new Node('CountLabel');
        countLabel.parent = card;
        countLabel.addComponent(UITransform).setContentSize(w - 30, 30);
        countLabel.setPosition(0, h / 2 - 82, 0);
        const cl = countLabel.addComponent(Label);
        cl.string = '在线 --';
        cl.fontSize = 20;
        cl.lineHeight = 26;
        cl.overflow = 2;
        cl.horizontalAlign = 1;
        cl.verticalAlign = 1;
        cl.color = new Color(180, 200, 220, 255);
        this.tableCardLabels.set(stake.districtId, cl);

        // 快速游戏按钮
        const quickBtnW = 140;
        const quickBtnH = 40;
        const quickBtn = new Node(`QuickJoin_${stake.districtId}`);
        quickBtn.parent = card;
        quickBtn.addComponent(UITransform).setContentSize(quickBtnW, quickBtnH);
        quickBtn.setPosition(-quickBtnW / 2 - 15, -h / 2 + 35, 0);

        const qg = quickBtn.addComponent(Graphics);
        qg.fillColor = new Color(46, 139, 87, 230);
        qg.roundRect(-quickBtnW / 2, -quickBtnH / 2, quickBtnW, quickBtnH, 8);
        qg.fill();

        const ql = new Node('L');
        ql.parent = quickBtn;
        ql.addComponent(UITransform).setContentSize(quickBtnW - 10, quickBtnH - 6);
        const qll = ql.addComponent(Label);
        qll.string = '快速游戏';
        qll.fontSize = 20;
        qll.horizontalAlign = 1;
        qll.verticalAlign = 1;
        qll.color = new Color(255, 255, 255, 255);

        const qButton = quickBtn.addComponent(Button);
        qButton.transition = 1;
        qButton.zoomScale = 1.05;
        qButton.duration = 0.1;
        const qClick = new EventHandler();
        qClick.target = this.node;
        qClick.component = 'NewGameHall';
        qClick.handler = 'onQuickJoin';
        qClick.customEventData = String(stake.districtId);
        qButton.clickEvents.push(qClick);

        // 选桌按钮
        const selBtn = new Node(`SelectTable_${stake.districtId}`);
        selBtn.parent = card;
        selBtn.addComponent(UITransform).setContentSize(quickBtnW, quickBtnH);
        selBtn.setPosition(quickBtnW / 2 + 15, -h / 2 + 35, 0);

        const sgg = selBtn.addComponent(Graphics);
        sgg.fillColor = new Color(70, 130, 180, 230);
        sgg.roundRect(-quickBtnW / 2, -quickBtnH / 2, quickBtnW, quickBtnH, 8);
        sgg.fill();

        const sll = new Node('L');
        sll.parent = selBtn;
        sll.addComponent(UITransform).setContentSize(quickBtnW - 10, quickBtnH - 6);
        const sl2 = sll.addComponent(Label);
        sl2.string = '选桌进入';
        sl2.fontSize = 20;
        sl2.horizontalAlign = 1;
        sl2.verticalAlign = 1;
        sl2.color = new Color(255, 255, 255, 255);

        const sButton = selBtn.addComponent(Button);
        sButton.transition = 1;
        sButton.zoomScale = 1.05;
        sButton.duration = 0.1;
        const sClick = new EventHandler();
        sClick.target = this.node;
        sClick.component = 'NewGameHall';
        sClick.handler = 'onSelectTable';
        sClick.customEventData = String(stake.districtId);
        sButton.clickEvents.push(sClick);
    }

    private refreshPlayerCounts(): void {
        if (this.stakeOptions.length === 0) return;
        const districtIds = this.stakeOptions.map(s => s.districtId);
        GameRoomApi.Instance.getDistrictPlayerCounts(districtIds).then((counts) => {
            this.playerCounts = counts;
            // 更新 UI
            this.stakeOptions.forEach(stake => {
                const label = this.tableCardLabels.get(stake.districtId);
                if (label) {
                    const count = counts.get(stake.districtId);
                    label.string = count !== undefined ? `在线 ${count} 人` : '在线 --';
                }
            });
        }).catch((err) => {
            console.warn('[NewGameHall] Refresh player counts failed:', err);
        });
    }

    // ==================== 底部按钮 ====================

    private createBottomButtons(): void {
        const btnWidth = 300;
        const btnHeight = 56;
        const btnGap = 40;
        const btnY = -340;

        const buttons: Array<{ text: string, action: string, color: Color }> = [
            { text: '创建房间(自定规则)', action: 'onCreateRoom', color: new Color(180, 120, 40, 230) },
        ];
        const meta = GameFactory.getGameMeta(this.gameId);
        if (meta?.type === GameType.Mahjong) {
            buttons.push({ text: '麻将战绩', action: 'onMahjongRecords', color: new Color(100, 60, 130, 230) });
        }

        const totalWidth = buttons.length * btnWidth + (buttons.length - 1) * btnGap;
        const startX = -totalWidth / 2 + btnWidth / 2;

        buttons.forEach((btnInfo, index) => {
            const btnNode = new Node(btnInfo.action);
            btnNode.parent = this.node;
            btnNode.addComponent(UITransform).setContentSize(btnWidth, btnHeight);
            btnNode.setPosition(startX + index * (btnWidth + btnGap), btnY, 0);

            const g = btnNode.addComponent(Graphics);
            g.fillColor = btnInfo.color;
            g.roundRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 10);
            g.fill();

            const labelNode = new Node('Label');
            labelNode.parent = btnNode;
            labelNode.addComponent(UITransform).setContentSize(btnWidth - 20, btnHeight - 10);
            labelNode.setPosition(0, 0, 0);
            const label = labelNode.addComponent(Label);
            label.string = btnInfo.text;
            label.fontSize = 22;
            label.lineHeight = 28;
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

    // ==================== 快速游戏/选桌 ====================

    public onQuickJoin(_event: Event, customEventData: any | null) {
        const districtId = Number(customEventData);
        if (!districtId) return;

        const gameType = getServerGameType(this.gameId);
        if (!gameType) {
            Client.Instance.showPromptDialog('不支持的游戏类型');
            return;
        }

        Client.Instance.showConnecting(true);
        GameRoomApi.Instance.joinByDistrict(districtId).then((result) => {
            if (!result) {
                Client.Instance.showConnecting(false);
                return;
            }
            GameRoomApi.Instance.enterVenue(result, gameType, () => this.onEnterVenue(result));
        }).catch((err) => {
            console.error('[NewGameHall] Quick join error:', err);
            Client.Instance.showConnecting(false);
            Client.Instance.showPromptDialog('加入失败，请重试');
        });
    }

    // ==================== 选桌进入 ====================

    public onSelectTable(_event: Event, customEventData: any | null) {
        const districtId = Number(customEventData);
        if (!districtId) return;
        this.showSelectTablePopup(districtId);
    }

    /** 显示选桌弹窗 */
    private async showSelectTablePopup(districtId: number): Promise<void> {
        // 销毁旧弹窗
        if (this.selectTablePopup) {
            this.selectTablePopup.destroy();
            this.selectTablePopup = null;
        }

        const popup = new Node('SelectTablePopup');
        popup.parent = this.node;
        this.selectTablePopup = popup;

        // 遮罩
        const mask = new Node('Mask');
        mask.parent = popup;
        mask.addComponent(UITransform).setContentSize(1920, 1080);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 160);
        mg.roundRect(-960, -540, 1920, 1080, 0);
        mg.fill();

        // 面板
        const panelW = 500;
        const panelH = 420;
        const panel = new Node('Panel');
        panel.parent = popup;
        panel.addComponent(UITransform).setContentSize(panelW, panelH);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(29, 35, 52, 255);
        pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 18);
        pg.fill();
        pg.strokeColor = new Color(238, 198, 116, 255);
        pg.lineWidth = 2;
        pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 18);
        pg.stroke();

        // 标题
        const titleNode = new Node('Title');
        titleNode.parent = panel;
        titleNode.addComponent(UITransform).setContentSize(panelW - 40, 36);
        titleNode.setPosition(0, panelH / 2 - 30, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = '选桌进入';
        titleLabel.fontSize = 26;
        titleLabel.lineHeight = 32;
        titleLabel.horizontalAlign = 1;
        titleLabel.verticalAlign = 1;
        titleLabel.color = new Color(255, 210, 116, 255);

        // 关闭按钮
        const closeBtn = new Node('CloseBtn');
        closeBtn.parent = panel;
        closeBtn.addComponent(UITransform).setContentSize(32, 32);
        closeBtn.setPosition(panelW / 2 - 24, panelH / 2 - 24, 0);
        const cbg = closeBtn.addComponent(Graphics);
        cbg.fillColor = new Color(180, 60, 60, 220);
        cbg.roundRect(-16, -16, 32, 32, 6);
        cbg.fill();
        const clNode = new Node('L');
        clNode.parent = closeBtn;
        clNode.addComponent(UITransform).setContentSize(28, 28);
        const cll = clNode.addComponent(Label);
        cll.string = '×';
        cll.fontSize = 24;
        cll.horizontalAlign = 1;
        cll.verticalAlign = 1;
        cll.color = new Color(255, 255, 255, 255);
        const cButton = closeBtn.addComponent(Button);
        cButton.transition = 1;
        cButton.zoomScale = 1.1;
        closeBtn.on(Node.EventType.TOUCH_END, () => {
            if (this.selectTablePopup) {
                this.selectTablePopup.destroy();
                this.selectTablePopup = null;
            }
        });

        // 加载提示
        const loadingNode = new Node('Loading');
        loadingNode.parent = panel;
        loadingNode.addComponent(UITransform).setContentSize(panelW - 40, 40);
        loadingNode.setPosition(0, 0, 0);
        const loadingLabel = loadingNode.addComponent(Label);
        loadingLabel.string = '正在加载房间列表...';
        loadingLabel.fontSize = 20;
        loadingLabel.horizontalAlign = 1;
        loadingLabel.color = new Color(200, 200, 200, 255);

        // 拉取房间列表
        let venues: DistrictVenueItem[] = [];
        try {
            venues = await GameRoomApi.Instance.getDistrictVenues(districtId);
        } catch (err) {
            console.error('[NewGameHall] Get district venues error:', err);
        }

        loadingNode.destroy();

        if (venues.length === 0) {
            const emptyNode = new Node('Empty');
            emptyNode.parent = panel;
            emptyNode.addComponent(UITransform).setContentSize(panelW - 40, 40);
            emptyNode.setPosition(0, 20, 0);
            const emptyLabel = emptyNode.addComponent(Label);
            emptyLabel.string = '当前没有可加入的房间';
            emptyLabel.fontSize = 22;
            emptyLabel.horizontalAlign = 1;
            emptyLabel.color = new Color(200, 180, 120, 255);

            // 快速创建按钮
            const createBtn = new Node('QuickCreateBtn');
            createBtn.parent = panel;
            createBtn.addComponent(UITransform).setContentSize(180, 44);
            createBtn.setPosition(0, -40, 0);
            const cg2 = createBtn.addComponent(Graphics);
            cg2.fillColor = new Color(46, 139, 87, 230);
            cg2.roundRect(-90, -22, 180, 44, 8);
            cg2.fill();
            const cl2 = new Node('L');
            cl2.parent = createBtn;
            cl2.addComponent(UITransform).setContentSize(170, 36);
            const cll2 = cl2.addComponent(Label);
            cll2.string = '创建新房间';
            cll2.fontSize = 20;
            cll2.horizontalAlign = 1;
            cll2.verticalAlign = 1;
            cll2.color = new Color(255, 255, 255, 255);
            const crtBtn = createBtn.addComponent(Button);
            crtBtn.transition = 1;
            crtBtn.zoomScale = 1.05;
            createBtn.on(Node.EventType.TOUCH_END, () => {
                if (this.selectTablePopup) {
                    this.selectTablePopup.destroy();
                    this.selectTablePopup = null;
                }
                // 走快速游戏流程（会自动创建新房间）
                const fakeEvent = { } as Event;
                this.onQuickJoin(fakeEvent, String(districtId));
            });
            return;
        }

        // 房间列表容器
        const listNode = new Node('RoomList');
        listNode.parent = panel;
        listNode.addComponent(UITransform).setContentSize(panelW - 40, panelH - 100);
        listNode.setPosition(0, -20, 0);

        const itemH = 56;
        const itemGap = 8;
        const listW = panelW - 60;
        const startY = (venues.length * (itemH + itemGap)) / 2 - itemH / 2;

        venues.forEach((venue, index) => {
            const itemNode = new Node(`Room_${index}`);
            itemNode.parent = listNode;
            itemNode.addComponent(UITransform).setContentSize(listW, itemH);
            itemNode.setPosition(0, startY - index * (itemH + itemGap), 0);

            const ig = itemNode.addComponent(Graphics);
            ig.fillColor = new Color(40, 55, 80, 240);
            ig.roundRect(-listW / 2, -itemH / 2, listW, itemH, 10);
            ig.fill();
            ig.strokeColor = new Color(80, 110, 150, 200);
            ig.lineWidth = 1;
            ig.roundRect(-listW / 2, -itemH / 2, listW, itemH, 10);
            ig.stroke();

            // 房间号/序号
            const nameNode = new Node('Name');
            nameNode.parent = itemNode;
            nameNode.addComponent(UITransform).setContentSize(160, itemH - 10);
            nameNode.setPosition(-listW / 2 + 90, 0, 0);
            const nameLabel = nameNode.addComponent(Label);
            nameLabel.string = `房间 ${index + 1}`;
            nameLabel.fontSize = 20;
            nameLabel.horizontalAlign = 1;
            nameLabel.verticalAlign = 1;
            nameLabel.color = new Color(255, 245, 223, 255);

            // 人数信息
            const countNode = new Node('Count');
            countNode.parent = itemNode;
            countNode.addComponent(UITransform).setContentSize(120, itemH - 10);
            countNode.setPosition(20, 0, 0);
            const countLabel = countNode.addComponent(Label);
            countLabel.string = `${venue.playerCount}/${venue.maxPlayerNums} 人`;
            countLabel.fontSize = 18;
            countLabel.horizontalAlign = 1;
            countLabel.verticalAlign = 1;
            countLabel.color = new Color(180, 220, 180, 255);

            // 加入按钮
            const joinBtn = new Node('JoinBtn');
            joinBtn.parent = itemNode;
            joinBtn.addComponent(UITransform).setContentSize(90, 36);
            joinBtn.setPosition(listW / 2 - 60, 0, 0);
            const jbg = joinBtn.addComponent(Graphics);
            jbg.fillColor = new Color(46, 139, 87, 230);
            jbg.roundRect(-45, -18, 90, 36, 8);
            jbg.fill();
            const jl = new Node('L');
            jl.parent = joinBtn;
            jl.addComponent(UITransform).setContentSize(80, 30);
            const jll = jl.addComponent(Label);
            jll.string = '加入';
            jll.fontSize = 18;
            jll.horizontalAlign = 1;
            jll.verticalAlign = 1;
            jll.color = new Color(255, 255, 255, 255);
            const jButton = joinBtn.addComponent(Button);
            jButton.transition = 1;
            jButton.zoomScale = 1.05;
            joinBtn.on(Node.EventType.TOUCH_END, () => {
                if (this.selectTablePopup) {
                    this.selectTablePopup.destroy();
                    this.selectTablePopup = null;
                }
                this.joinVenueById(venue.venueId);
            });
        });
    }

    /** 通过 venueId 加入房间 */
    private joinVenueById(venueId: string): void {
        const gameType = getServerGameType(this.gameId);
        if (!gameType) {
            Client.Instance.showPromptDialog('不支持的游戏类型');
            return;
        }
        Client.Instance.showConnecting(true);
        GameRoomApi.Instance.joinByVenueId(venueId, gameType).then((result) => {
            if (!result) {
                Client.Instance.showConnecting(false);
                return;
            }
            GameRoomApi.Instance.enterVenue(result, gameType, () => this.onEnterVenue(result));
        }).catch((err) => {
            console.error('[NewGameHall] Join by venueId error:', err);
            Client.Instance.showConnecting(false);
            Client.Instance.showPromptDialog('加入失败，请重试');
        });
    }

    // ==================== 创建房间 ====================

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
        const pw = 550, ph = 450;
        panel.addComponent(UITransform).setContentSize(pw, ph);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(30, 55, 85, 255);
        pg.roundRect(-pw / 2, -ph / 2, pw, ph, 12);
        pg.fill();

        // 标题
        this.addLabel(panel, '创建房间 - 规则设置', 24, new Color(255, 220, 100, 255), 0, ph / 2 - 35);

        let y = ph / 2 - 80;
        // 台桌分选项
        y = this.addOptionRow(panel, '台桌分', y, TAOJIANG_BASE_OPTIONS, 'base_score');

        // 封顶倍率选项
        y = this.addOptionRow(panel, '封顶', y, TAOJIANG_MAX_SCORE_OPTIONS, 'max_score');

        // 局数选项
        y = this.addOptionRow(panel, '局数', y, TAOJIANG_ROUND_OPTIONS, 'round_count');

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

        const compact = options.length > 4;
        const buttonWidth = compact ? 68 : 100;
        const buttonGap = compact ? 72 : 110;
        const startX = compact ? -120 : -80;
        const defaultVal = this.createRules[ruleKey] ?? options[0].value;

        options.forEach((opt, idx) => {
            const isSelected = (opt.value === defaultVal);
            const btnNode = new Node(`Opt_${ruleKey}_${idx}`);
            btnNode.parent = parent;
            btnNode.addComponent(UITransform).setContentSize(buttonWidth, 32);
            btnNode.setPosition(startX + idx * buttonGap, y, 0);

            const g = btnNode.addComponent(Graphics);
            g.fillColor = isSelected ? new Color(70, 150, 220, 255) : new Color(60, 80, 100, 255);
            g.roundRect(-buttonWidth / 2, -16, buttonWidth, 32, 6);
            g.fill();

            const l = new Node('L');
            l.parent = btnNode;
            l.addComponent(UITransform).setContentSize(buttonWidth - 8, 28);
            const lc = l.addComponent(Label);
            lc.string = opt.text;
            lc.fontSize = compact ? 16 : 18;
            lc.color = isSelected ? new Color(255, 255, 255, 255) : new Color(160, 160, 160, 255);
            lc.horizontalAlign = 1;
            lc.verticalAlign = 1;

            btnNode.on(Node.EventType.TOUCH_END, () => {
                this.createRules[ruleKey] = opt.value;
                if (ruleKey === 'base_score' || ruleKey === 'round_count') {
                    this.normalizeTaojiangCreateRules(ruleKey);
                    this.refreshOptionRow(parent, 'base_score', TAOJIANG_BASE_OPTIONS);
                    this.refreshOptionRow(parent, 'round_count', TAOJIANG_ROUND_OPTIONS);
                } else {
                    this.refreshOptionRow(parent, ruleKey, options);
                }
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

    private normalizeTaojiangCreateRules(changedKey: string): void {
        const baseScore = Number(this.createRules.base_score) || 1;
        const roundCount = Number(this.createRules.round_count) || 8;
        const singleScores = [5, 10, 25];
        const eightRoundScores = [1, 2, 5, 10, 20];

        if (changedKey === 'base_score') {
            if (baseScore === 25) {
                this.createRules.round_count = 1;
            } else if (baseScore === 1 || baseScore === 2 || baseScore === 20) {
                this.createRules.round_count = 8;
            } else if (roundCount !== 1 && roundCount !== 8) {
                this.createRules.round_count = 8;
            }
            return;
        }

        if (changedKey === 'round_count') {
            if (roundCount === 1 && singleScores.indexOf(baseScore) < 0) {
                this.createRules.base_score = 5;
            } else if (roundCount === 8 && eightRoundScores.indexOf(baseScore) < 0) {
                this.createRules.base_score = 1;
            }
        }
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

    // ==================== 加入房间弹窗 ====================

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
        titleLabel.string = '输入房间号';
        titleLabel.fontSize = 28;
        titleLabel.horizontalAlign = 1;
        titleLabel.color = new Color(255, 255, 255, 255);

        const inputNode = new Node('Input');
        inputNode.parent = panel;
        const inputTransform = inputNode.addComponent(UITransform);
        inputTransform.setContentSize(360, 50);
        inputNode.setPosition(0, 20, 0);

        const inputBgNode = new Node('InputBg');
        inputBgNode.parent = inputNode;
        const inputBgTransform = inputBgNode.addComponent(UITransform);
        inputBgTransform.setContentSize(360, 50);
        const inputGraphics = inputBgNode.addComponent(Graphics);
        inputGraphics.fillColor = new Color(255, 255, 255, 255);
        inputGraphics.roundRect(-180, -25, 360, 50, 8);
        inputGraphics.fill();

        const textNode = new Node('Text');
        textNode.parent = inputNode;
        const textTransform = textNode.addComponent(UITransform);
        textTransform.setContentSize(332, 50);
        textTransform.anchorX = 0;
        textTransform.anchorY = 0.5;
        textNode.setPosition(0, 0, 0);
        const textWidget = textNode.addComponent(Widget);
        textWidget.isAlignLeft = true;
        textWidget.left = 14;
        textWidget.isAlignVerticalCenter = true;
        textWidget.verticalCenter = -2;
        const textLabel = textNode.addComponent(Label);
        textLabel.string = '';
        textLabel.fontSize = 26;
        textLabel.lineHeight = 30;
        textLabel.overflow = Label.Overflow.CLAMP;
        textLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        textLabel.verticalAlign = Label.VerticalAlign.CENTER;
        textLabel.color = new Color(20, 20, 20, 255);

        const placeholderNode = new Node('Placeholder');
        placeholderNode.parent = inputNode;
        const placeholderTransform = placeholderNode.addComponent(UITransform);
        placeholderTransform.setContentSize(332, 50);
        placeholderTransform.anchorX = 0;
        placeholderTransform.anchorY = 0.5;
        placeholderNode.setPosition(0, 0, 0);
        const placeholderWidget = placeholderNode.addComponent(Widget);
        placeholderWidget.isAlignLeft = true;
        placeholderWidget.left = 14;
        placeholderWidget.isAlignVerticalCenter = true;
        placeholderWidget.verticalCenter = -2;
        const placeholderLabel = placeholderNode.addComponent(Label);
        placeholderLabel.string = '请输入6位数字房间号';
        placeholderLabel.fontSize = 22;
        placeholderLabel.lineHeight = 28;
        placeholderLabel.overflow = Label.Overflow.CLAMP;
        placeholderLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        placeholderLabel.verticalAlign = Label.VerticalAlign.CENTER;
        placeholderLabel.color = new Color(120, 120, 120, 255);

        const editBox = inputNode.addComponent(EditBox);
        editBox.maxLength = 6;
        editBox.inputMode = EditBox.InputMode.NUMERIC;
        editBox.placeholder = placeholderLabel.string;
        editBox.string = '';
        (editBox as any).textLabel = textLabel;
        (editBox as any).placeholderLabel = placeholderLabel;
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

    // ==================== 事件处理 ====================

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
        const input = this.joinEditBox?.string?.trim() || '';
        if (!input) {
            Client.Instance.showPromptTip('请输入房间号或ID');
            return;
        }
        if (!/^[A-Za-z0-9]+$/.test(input)) {
            Client.Instance.showPromptTip('仅支持字母和数字');
            return;
        }

        const gameType = getServerGameType(this.gameId);
        if (!gameType) {
            Client.Instance.showPromptDialog('不支持的游戏类型');
            return;
        }

        const joinPromise = /^\d{6}$/.test(input)
            ? GameRoomApi.Instance.joinByNumber(input, gameType)
            : GameRoomApi.Instance.joinByVenueId(input, gameType);

        joinPromise.then((result) => {
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
        const meta = GameFactory.getGameMeta(this.gameId);
        if (meta?.type === GameType.Mahjong) {
            Client.Instance.initGameRoom(null);
            const room = GameFactory.Instance.createRoom(this.gameId, Client.Instance.getGameRoomNode() || undefined, undefined);
            room.presetRoomNumber(result?.number || null);
            return;
        }

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
