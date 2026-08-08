import { _decorator, BlockInputEvents, Button, Color, Component, EventHandler, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';
import {
    createButton,
    createLabel,
    createScrollArea,
    fillRoundRect,
    resizeScrollContent,
} from '../../UI/UiKit';

const { ccclass } = _decorator;

type StatsTab = 'group' | 'member';

interface AgencyStatsRow {
    playerId: string;
    nickname?: string;
    account?: string;
    avatar?: string;
    identity?: string;
    role?: string;
    roleText?: string;
    agentType?: number;
    level?: number;
    juniorCount?: number;
    parentPlayerId?: string;
    parentNickname?: string;
    score?: number;
    totalConsume?: number;
    giftReceived?: number;
    hasChildren?: boolean;
}

const COLORS = {
    overlay: new Color(0, 0, 0, 150),
    panel: new Color(244, 221, 178, 248),
    panelDark: new Color(102, 74, 82, 255),
    header: new Color(128, 91, 94, 255),
    row: new Color(255, 252, 238, 250),
    rowAlt: new Color(247, 238, 218, 250),
    tabIdle: new Color(235, 214, 185, 255),
    tabActive: new Color(255, 219, 86, 255),
    title: new Color(255, 248, 226, 255),
    text: new Color(76, 56, 52, 255),
    muted: new Color(130, 96, 90, 255),
    white: new Color(255, 255, 255, 255),
    accent: new Color(255, 198, 58, 255),
    teal: new Color(24, 188, 172, 255),
    danger: new Color(156, 76, 72, 255),
};

@ccclass('DlgStats')
export class DlgStats extends Component {
    private panel: Node | null = null;
    private content: Node | null = null;
    private statusLabel: Label | null = null;
    private pageLabel: Label | null = null;
    private contextLabel: Label | null = null;
    private dateLabel: Label | null = null;
    private backButton: Node | null = null;
    private tabNodes: Record<StatsTab, Node | null> = { group: null, member: null };

    private currentTab: StatsTab = 'group';
    private parentPlayerId = '';
    private parentName = '';
    private selectedDate = this.formatDate(new Date());
    private rows: AgencyStatsRow[] = [];
    private pageNum = 1;
    private pageSize = 5;
    private total = 0;
    private loading = false;

    onLoad(): void {
        this.buildUI();
    }

    onEnable(): void {
        this.parentPlayerId = '';
        this.parentName = '';
        this.currentTab = 'group';
        this.pageNum = 1;
        this.updateTabs();
        this.updateContext();
        this.loadStats(true);
    }

    private buildUI(): void {
        const root = new Node('StatsRoot');
        root.parent = this.node;
        root.addComponent(UITransform).setContentSize(1920, 1080);

        const overlay = new Node('Overlay');
        overlay.parent = root;
        overlay.addComponent(UITransform).setContentSize(1920, 1080);
        overlay.addComponent(BlockInputEvents);
        fillRoundRect(overlay, 1920, 1080, COLORS.overlay, 0);

        this.panel = new Node('Panel');
        this.panel.parent = root;
        this.panel.addComponent(UITransform).setContentSize(1360, 720);
        fillRoundRect(this.panel, 1360, 720, COLORS.panel, 18);

        const titleBand = new Node('TitleBand');
        titleBand.parent = this.panel;
        titleBand.setPosition(0, 315, 0);
        titleBand.addComponent(UITransform).setContentSize(1320, 72);
        fillRoundRect(titleBand, 1320, 72, COLORS.panelDark, 16);

        const title = createLabel(titleBand, '统计', 38, COLORS.title, 240, 54);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.node.setPosition(450, 0, 0);

        this.contextLabel = createLabel(titleBand, '', 22, COLORS.accent, 520, 38);
        this.contextLabel.node.setPosition(-350, 0, 0);

        createButton(titleBand, 'X', 48, 48, COLORS.danger, this.node, 'DlgStats', 'onCloseClicked')
            .setPosition(615, 0, 0);

        this.createTabs();
        this.createTable();
        this.createPager();
        this.updateContext();
    }

    private createTabs(): void {
        const tabs: Array<{ key: StatsTab; text: string; x: number }> = [
            { key: 'group', text: '群统计', x: -510 },
            { key: 'member', text: '成员统计', x: -350 },
        ];
        tabs.forEach((tab) => {
            const node = new Node(`Tab_${tab.key}`);
            node.parent = this.panel;
            node.setPosition(tab.x, 245, 0);
            node.addComponent(UITransform).setContentSize(140, 46);
            fillRoundRect(node, 140, 46, tab.key === this.currentTab ? COLORS.tabActive : COLORS.tabIdle, 10);
            const label = createLabel(node, tab.text, 23, COLORS.text, 126, 40);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.node.setPosition(0, 0, 0);
            this.bindClick(node, 'onTabClicked', tab.key);
            this.tabNodes[tab.key] = node;
        });

        this.backButton = createButton(this.panel!, '返回上级', 110, 42, COLORS.panelDark, this.node, 'DlgStats', 'onBackClicked');
        this.backButton.setPosition(-190, 245, 0);
        this.backButton.active = false;

        createButton(this.panel!, '刷新', 90, 42, COLORS.teal, this.node, 'DlgStats', 'onRefreshClicked')
            .setPosition(-70, 245, 0);

        createButton(this.panel!, '<', 38, 38, COLORS.panelDark, this.node, 'DlgStats', 'onPrevDateClicked')
            .setPosition(34, 245, 0);
        const dateNode = new Node('DateControl');
        dateNode.parent = this.panel!;
        dateNode.setPosition(128, 245, 0);
        dateNode.addComponent(UITransform).setContentSize(150, 40);
        fillRoundRect(dateNode, 150, 40, new Color(174, 154, 138, 235), 18);
        this.dateLabel = createLabel(dateNode, this.formatDateText(this.selectedDate), 20, COLORS.title, 138, 34);
        this.dateLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.dateLabel.node.setPosition(0, 0, 0);
        createButton(this.panel!, '>', 38, 38, COLORS.panelDark, this.node, 'DlgStats', 'onNextDateClicked')
            .setPosition(222, 245, 0);
    }

    private createTable(): void {
        const table = new Node('StatsTable');
        table.parent = this.panel;
        table.setPosition(0, -45, 0);
        table.addComponent(UITransform).setContentSize(1240, 510);
        fillRoundRect(table, 1240, 510, new Color(250, 236, 205, 248), 12);

        this.statusLabel = createLabel(table, '加载中...', 22, COLORS.muted, 520, 34);
        this.statusLabel.node.setPosition(-310, 220, 0);

        const header = new Node('Header');
        header.parent = table;
        header.setPosition(0, 178, 0);
        header.addComponent(UITransform).setContentSize(1180, 44);
        fillRoundRect(header, 1180, 44, COLORS.header, 8);
        this.headerLabel(header, '身份', -505, 110);
        this.headerLabel(header, '信息', -325, 250);
        this.headerLabel(header, '积分', -90, 130);
        this.headerLabel(header, '总消耗', 95, 150);
        this.headerLabel(header, '获得赠送', 285, 150);
        this.headerLabel(header, '操作', 485, 150);

        const scroll = createScrollArea(table, 1180, 365, -30);
        this.content = scroll.content;
    }

    private createPager(): void {
        createButton(this.panel!, '<', 44, 38, COLORS.accent, this.node, 'DlgStats', 'onPrevPageClicked')
            .setPosition(465, -315, 0);
        this.pageLabel = createLabel(this.panel!, '1/1', 22, COLORS.text, 82, 34);
        this.pageLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.pageLabel.node.setPosition(525, -315, 0);
        createButton(this.panel!, '>', 44, 38, COLORS.accent, this.node, 'DlgStats', 'onNextPageClicked')
            .setPosition(585, -315, 0);
    }

    private headerLabel(parent: Node, text: string, x: number, width: number): void {
        const label = createLabel(parent, text, 20, COLORS.title, width, 34);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.node.setPosition(x, 0, 0);
    }

    private bindClick(node: Node, handler: string, customData = ''): void {
        const button = node.getComponent(Button) || node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 1.04;
        const evt = new EventHandler();
        evt.target = this.node;
        evt.component = 'DlgStats';
        evt.handler = handler;
        evt.customEventData = customData;
        button.clickEvents.push(evt);
    }

    public onCloseClicked(): void {
        this.node.active = false;
    }

    public onRefreshClicked(): void {
        this.loadStats(true);
    }

    public onPrevDateClicked(): void {
        this.shiftDate(-1);
    }

    public onNextDateClicked(): void {
        this.shiftDate(1);
    }

    public onBackClicked(): void {
        this.parentPlayerId = '';
        this.parentName = '';
        this.currentTab = 'group';
        this.updateTabs();
        this.updateContext();
        this.loadStats(true);
    }

    public onTabClicked(_event: Event, tab: StatsTab): void {
        if (this.currentTab === tab) return;
        this.currentTab = tab;
        this.updateTabs();
        this.loadStats(true);
    }

    public onPrevPageClicked(): void {
        if (this.pageNum <= 1) return;
        this.pageNum -= 1;
        this.loadStats(false);
    }

    public onNextPageClicked(): void {
        const maxPage = Math.max(1, Math.ceil(this.total / this.pageSize));
        if (this.pageNum >= maxPage) return;
        this.pageNum += 1;
        this.loadStats(false);
    }

    public onViewJuniorClicked(_event: Event, index: string): void {
        const row = this.rows[Number(index)];
        if (!row) return;
        this.parentPlayerId = row.playerId || '';
        this.parentName = this.displayName(row);
        this.currentTab = 'member';
        this.updateTabs();
        this.updateContext();
        this.loadStats(true);
    }

    private async loadStats(resetPage: boolean): Promise<void> {
        if (this.loading) return;
        if (resetPage) {
            this.pageNum = 1;
        }
        this.loading = true;
        this.rows = [];
        this.setStatus('加载中...');
        this.renderRows();
        try {
            const request: any = {
                pageNum: this.pageNum,
                pageSize: this.pageSize,
                statType: this.currentTab,
                date: this.selectedDate,
            };
            if (this.parentPlayerId) {
                request.parentPlayerId = this.parentPlayerId;
            }
            const dto = await GameManager.Instance.authPost('/player/agency/stat/page', request);
            if (!this.isSuccess(dto)) {
                this.total = 0;
                this.setStatus(dto?.msg || '统计数据加载失败');
                this.updatePageLabel();
                this.renderRows();
                return;
            }
            this.rows = dto.records || [];
            this.total = dto.total || 0;
            this.setStatus(`${this.formatDateText(this.selectedDate)} ${this.currentTab === 'group' ? '群统计' : '成员统计'}：${this.total} 人`);
            this.renderRows();
            this.updatePageLabel();
        } catch (err) {
            console.error('[DlgStats] load stats error:', err);
            this.total = 0;
            this.setStatus('统计数据加载失败');
            this.updatePageLabel();
            this.renderRows();
        } finally {
            this.loading = false;
        }
    }

    private renderRows(): void {
        if (!this.content) return;
        this.content.removeAllChildren();
        const width = 1160;
        const itemHeight = 66;
        const gap = 8;
        if (this.rows.length === 0) {
            const empty = createLabel(this.content, '暂无数据', 22, COLORS.muted, width, 42);
            empty.horizontalAlign = Label.HorizontalAlign.CENTER;
            empty.node.setPosition(0, -40, 0);
            resizeScrollContent(this.content, 1180, 1, itemHeight, gap);
            return;
        }

        this.rows.forEach((row, index) => {
            const item = new Node(`Stats_${index}`);
            item.parent = this.content!;
            item.setPosition(0, -(index * (itemHeight + gap) + itemHeight / 2), 0);
            item.addComponent(UITransform).setContentSize(width, itemHeight);
            fillRoundRect(item, width, itemHeight, index % 2 === 0 ? COLORS.row : COLORS.rowAlt, 8);

            const identity = createLabel(item, row.identity || row.roleText || '-', 21, COLORS.text, 104, 36);
            identity.horizontalAlign = Label.HorizontalAlign.CENTER;
            identity.node.setPosition(-505, 0, 0);

            this.createAvatar(item, row, -420, 0);
            const name = createLabel(item, this.displayName(row), 20, COLORS.text, 190, 28);
            name.node.setPosition(-315, 15, 0);
            const id = createLabel(item, `ID:${row.playerId || '-'}`, 18, COLORS.muted, 190, 24);
            id.node.setPosition(-315, -13, 0);

            this.amountLabel(item, row.score, -90, 130);
            this.amountLabel(item, row.totalConsume, 95, 150);
            this.amountLabel(item, row.giftReceived, 285, 150);

            if (this.currentTab === 'group') {
                createButton(item, '查看下级', 106, 38, COLORS.teal, this.node, 'DlgStats', 'onViewJuniorClicked', String(index))
                    .setPosition(485, 0, 0);
            } else {
                const dash = createLabel(item, '-', 22, COLORS.muted, 110, 36);
                dash.horizontalAlign = Label.HorizontalAlign.CENTER;
                dash.node.setPosition(485, 0, 0);
            }
        });
        resizeScrollContent(this.content, 1180, this.rows.length, itemHeight, gap);
    }

    private createAvatar(parent: Node, row: AgencyStatsRow, x: number, y: number): void {
        const avatar = new Node('Avatar');
        avatar.parent = parent;
        avatar.setPosition(x, y, 0);
        avatar.addComponent(UITransform).setContentSize(50, 50);
        fillRoundRect(avatar, 50, 50, this.currentTab === 'group' ? COLORS.accent : COLORS.teal, 8);

        const initial = createLabel(avatar, this.displayName(row).charAt(0) || '员', 22, COLORS.white, 44, 44);
        initial.horizontalAlign = Label.HorizontalAlign.CENTER;
        initial.node.setPosition(0, 0, 0);

        if (!row.avatar) return;
        const sprite = avatar.addComponent(Sprite);
        GameManager.Instance.loadSpriteFrame(row.avatar, (spriteFrame: SpriteFrame) => {
            if (!avatar.isValid || !spriteFrame) return;
            sprite.spriteFrame = spriteFrame;
            initial.node.active = false;
        });
    }

    private amountLabel(parent: Node, value: number | undefined, x: number, width: number): void {
        const label = createLabel(parent, this.amountText(value), 21, COLORS.text, width, 36);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.node.setPosition(x, 0, 0);
    }

    private updateTabs(): void {
        (['group', 'member'] as StatsTab[]).forEach((tab) => {
            const node = this.tabNodes[tab];
            if (node) {
                fillRoundRect(node, 140, 46, tab === this.currentTab ? COLORS.tabActive : COLORS.tabIdle, 10);
            }
        });
    }

    private updateContext(): void {
        if (this.contextLabel) {
            const target = this.parentPlayerId ? `${this.parentName || this.parentPlayerId} 的直邀` : '当前账号直邀';
            this.contextLabel.string = target;
        }
        if (this.dateLabel) {
            this.dateLabel.string = this.formatDateText(this.selectedDate);
        }
        if (this.backButton) {
            this.backButton.active = !!this.parentPlayerId;
        }
    }

    private shiftDate(days: number): void {
        const date = this.parseDate(this.selectedDate);
        date.setDate(date.getDate() + days);
        this.selectedDate = this.formatDate(date);
        this.updateContext();
        this.loadStats(true);
    }

    private updatePageLabel(): void {
        if (!this.pageLabel) return;
        const maxPage = Math.max(1, Math.ceil(this.total / this.pageSize));
        this.pageLabel.string = `${this.pageNum}/${maxPage}`;
    }

    private setStatus(text: string): void {
        if (this.statusLabel) {
            this.statusLabel.string = text;
        }
    }

    private displayName(row: AgencyStatsRow): string {
        return row.nickname || row.account || row.playerId || '-';
    }

    private amountText(value: number | undefined): string {
        if (value == null || isNaN(Number(value))) {
            return '0';
        }
        return String(Math.floor(Number(value)));
    }

    private parseDate(value: string): Date {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
        if (!match) return new Date();
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }

    private formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private formatDateText(value: string): string {
        const date = this.parseDate(value);
        return `${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`;
    }

    private isSuccess(dto: any): boolean {
        return !!dto && (!dto.code || dto.code === '00000000');
    }
}
