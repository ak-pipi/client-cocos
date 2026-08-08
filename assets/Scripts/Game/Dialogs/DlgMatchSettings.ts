import { _decorator, BlockInputEvents, Button, Color, Component, EditBox, Event, EventHandler, Label, Node, UITransform } from 'cc';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';
import {
    createButton,
    createLabel,
    createScrollArea,
    fillRoundRect,
    resizeScrollContent,
    sanitizeAllEditBoxDefaultLabels,
    sanitizeEditBoxDefaultLabels,
} from '../../UI/UiKit';

const { ccclass } = _decorator;

type MatchTab = 'manage' | 'share' | 'shuffleShare' | 'detail' | 'log' | 'gift';
type DetailFilter = 'all' | 'wash' | 'transfer' | 'gift' | 'winlose';
type LogFilter = 'all' | 'admin_up' | 'admin_down';

interface MatchPlayerRow {
    playerId: string;
    nickname?: string;
    account?: string;
    avatar?: string;
    identity?: string;
    role?: string;
    roleText?: string;
    juniorCount?: number;
    parentPlayerId?: string;
    parentNickname?: string;
    score?: number;
    commissionRateBp?: number;
    feeAmount?: number;
    commissionAmount?: number;
}

interface MatchLedgerRow {
    playerId?: string;
    nickname?: string;
    matchScore?: number;
    balanceAfter?: number;
    changeType?: string;
    bizTypeText?: string;
    gameName?: string;
    time?: string;
}

interface MatchLogRow {
    operatorPlayerId?: string;
    operatorNickname?: string;
    targetPlayerId?: string;
    targetNickname?: string;
    changeAmount?: number;
    changeType?: string;
    time?: string;
}

interface MatchGiftRow {
    playerId: string;
    nickname?: string;
    account?: string;
    identity?: string;
    role?: string;
    juniorCount?: number;
    giftTimes?: number;
    giftScore?: number;
}

const COLORS = {
    overlay: new Color(0, 0, 0, 150),
    panel: new Color(117, 75, 58, 248),
    panelLight: new Color(178, 139, 101, 248),
    panelDark: new Color(86, 51, 42, 255),
    leftIdle: new Color(205, 174, 126, 255),
    leftActive: new Color(255, 194, 34, 255),
    header: new Color(91, 54, 45, 255),
    row: new Color(255, 226, 166, 255),
    rowAlt: new Color(244, 209, 145, 255),
    text: new Color(98, 42, 36, 255),
    muted: new Color(126, 95, 78, 255),
    title: new Color(255, 248, 226, 255),
    white: new Color(255, 255, 255, 255),
    accent: new Color(255, 210, 70, 255),
    teal: new Color(18, 200, 145, 255),
    orange: new Color(238, 138, 70, 255),
    danger: new Color(168, 82, 76, 255),
    input: new Color(88, 57, 48, 245),
};

@ccclass('DlgMatchSettings')
export class DlgMatchSettings extends Component {
    private panel: Node | null = null;
    private leftTabs: Record<MatchTab, Node | null> = { manage: null, share: null, shuffleShare: null, detail: null, log: null, gift: null };
    private controlNode: Node | null = null;
    private tableNode: Node | null = null;
    private content: Node | null = null;
    private statusLabel: Label | null = null;
    private pageLabel: Label | null = null;
    private dateLabel: Label | null = null;
    private searchInput: EditBox | null = null;
    private adjustDialog: Node | null = null;
    private adjustDismissLayer: Node | null = null;
    private adjustInput: EditBox | null = null;

    private currentTab: MatchTab = 'manage';
    private detailMode = false;
    private detailPlayer: MatchPlayerRow | null = null;
    private detailFilter: DetailFilter = 'all';
    private logFilter: LogFilter = 'all';
    private selectedDate = this.formatDate(new Date());
    private rows: any[] = [];
    private pageNum = 1;
    private pageSize = 5;
    private total = 0;
    private loading = false;
    private adjustTarget: MatchPlayerRow | null = null;
    private adjustMode: 'increase' | 'decrease' = 'increase';

    onLoad(): void {
        this.buildUI();
    }

    onEnable(): void {
        this.loadPage(true);
        this.scrubEditBoxLabels();
    }

    private buildUI(): void {
        const root = new Node('MatchSettingsRoot');
        root.parent = this.node;
        root.addComponent(UITransform).setContentSize(1920, 1080);

        const overlay = new Node('Overlay');
        overlay.parent = root;
        overlay.addComponent(UITransform).setContentSize(1920, 1080);
        overlay.addComponent(BlockInputEvents);
        fillRoundRect(overlay, 1920, 1080, COLORS.overlay, 0);

        this.panel = new Node('Panel');
        this.panel.parent = root;
        this.panel.addComponent(UITransform).setContentSize(1540, 780);
        fillRoundRect(this.panel, 1540, 780, COLORS.panel, 8);

        const titleBand = new Node('TitleBand');
        titleBand.parent = this.panel;
        titleBand.setPosition(0, 352, 0);
        titleBand.addComponent(UITransform).setContentSize(1540, 76);
        fillRoundRect(titleBand, 1540, 76, COLORS.panelLight, 4);

        const family = createLabel(titleBand, `亲友圈ID:${GameManager.Instance.PlayerId || '-'}`, 24, COLORS.title, 300, 38);
        family.node.setPosition(-610, 0, 0);
        const title = createLabel(titleBand, '比赛房设置', 36, COLORS.title, 260, 54);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.node.setPosition(0, 0, 0);
        createButton(titleBand, 'X', 52, 52, COLORS.danger, this.node, 'DlgMatchSettings', 'onCloseClicked')
            .setPosition(712, 0, 0);

        this.createProfileBlock();
        this.createLeftTabs();
        this.createMainArea();
        this.scrubEditBoxLabels();
    }

    private createProfileBlock(): void {
        const profile = new Node('Profile');
        profile.parent = this.panel!;
        profile.setPosition(-640, 265, 0);
        profile.addComponent(UITransform).setContentSize(230, 98);
        fillRoundRect(profile, 230, 98, new Color(255, 230, 171, 245), 4);
        const name = createLabel(profile, GameManager.Instance.NickName || '玩家', 24, COLORS.text, 150, 32);
        name.node.setPosition(32, 20, 0);
        const id = createLabel(profile, `ID:${GameManager.Instance.PlayerId || '-'}`, 22, COLORS.danger, 150, 30);
        id.node.setPosition(32, -16, 0);
        const avatar = new Node('Avatar');
        avatar.parent = profile;
        avatar.setPosition(-74, 0, 0);
        avatar.addComponent(UITransform).setContentSize(72, 72);
        fillRoundRect(avatar, 72, 72, COLORS.accent, 6);
        const initial = createLabel(avatar, (GameManager.Instance.NickName || '玩').charAt(0), 28, COLORS.white, 64, 64);
        initial.horizontalAlign = Label.HorizontalAlign.CENTER;
        initial.node.setPosition(0, 0, 0);
    }

    private createLeftTabs(): void {
        const tabs: Array<{ key: MatchTab; text: string; y: number }> = [
            { key: 'manage', text: '比赛分管理', y: 170 },
            { key: 'share', text: '比赛分分成', y: 70 },
            { key: 'shuffleShare', text: '洗牌分分成', y: -30 },
            { key: 'detail', text: '比赛分明细', y: -130 },
            { key: 'log', text: '操作日志', y: -230 },
            { key: 'gift', text: '赠送统计', y: -330 },
        ];
        tabs.forEach((tab) => {
            const node = new Node(`Tab_${tab.key}`);
            node.parent = this.panel!;
            node.setPosition(-640, tab.y, 0);
            node.addComponent(UITransform).setContentSize(230, 94);
            fillRoundRect(node, 230, 94, tab.key === this.currentTab ? COLORS.leftActive : COLORS.leftIdle, 2);
            const label = createLabel(node, tab.text + (tab.key === this.currentTab ? '>' : ''), 30, tab.key === this.currentTab ? COLORS.white : COLORS.muted, 208, 62);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.node.setPosition(0, 0, 0);
            this.bindClick(node, 'onTabClicked', tab.key);
            this.leftTabs[tab.key] = node;
        });
    }

    private createMainArea(): void {
        this.controlNode = new Node('Controls');
        this.controlNode.parent = this.panel!;
        this.controlNode.setPosition(120, 276, 0);
        this.controlNode.addComponent(UITransform).setContentSize(1140, 70);

        this.tableNode = new Node('Table');
        this.tableNode.parent = this.panel!;
        this.tableNode.setPosition(140, -38, 0);
        this.tableNode.addComponent(UITransform).setContentSize(1200, 560);
        fillRoundRect(this.tableNode, 1200, 560, COLORS.panel, 4);

        this.statusLabel = createLabel(this.tableNode, '加载中...', 24, COLORS.title, 460, 40);
        this.statusLabel.node.setPosition(-330, 214, 0);

        createButton(this.panel!, '<', 48, 48, COLORS.accent, this.node, 'DlgMatchSettings', 'onPrevPageClicked')
            .setPosition(-285, -354, 0);
        this.pageLabel = createLabel(this.panel!, '1/1', 24, COLORS.title, 86, 40);
        this.pageLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.pageLabel.node.setPosition(-220, -354, 0);
        createButton(this.panel!, '>', 48, 48, COLORS.accent, this.node, 'DlgMatchSettings', 'onNextPageClicked')
            .setPosition(-155, -354, 0);

        this.renderControls();
    }

    private renderControls(): void {
        if (!this.controlNode) return;
        this.controlNode.removeAllChildren();
        createButton(this.controlNode, '<', 38, 38, COLORS.panelLight, this.node, 'DlgMatchSettings', 'onPrevDateClicked')
            .setPosition(-520, 0, 0);
        const dateNode = new Node('Date');
        dateNode.parent = this.controlNode;
        dateNode.addComponent(UITransform).setContentSize(this.currentTab === 'detail' && this.detailMode ? 250 : 150, 42);
        dateNode.setPosition(this.currentTab === 'detail' && this.detailMode ? -374 : -414, 0, 0);
        fillRoundRect(dateNode, dateNode.getComponent(UITransform)!.width, 42, new Color(166, 143, 118, 245), 20);
        this.dateLabel = createLabel(dateNode, this.dateText(), 23, COLORS.title, dateNode.getComponent(UITransform)!.width - 14, 36);
        this.dateLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.dateLabel.node.setPosition(0, 0, 0);
        createButton(this.controlNode, '>', 38, 38, COLORS.panelLight, this.node, 'DlgMatchSettings', 'onNextDateClicked')
            .setPosition(this.currentTab === 'detail' && this.detailMode ? -228 : -308, 0, 0);

        let x = -160;
        if (this.currentTab === 'detail' && this.detailMode) {
            const filters: Array<{ key: DetailFilter; text: string }> = [
                { key: 'wash', text: '洗牌分' },
                { key: 'all', text: '全部' },
                { key: 'transfer', text: '转移分' },
                { key: 'gift', text: '赠送分' },
                { key: 'winlose', text: '输赢分' },
            ];
            filters.forEach((filter) => {
                createButton(this.controlNode!, filter.text, 116, 42, this.detailFilter === filter.key ? COLORS.accent : COLORS.panelLight, this.node, 'DlgMatchSettings', 'onDetailFilterClicked', filter.key)
                    .setPosition(x, 0, 0);
                x += 124;
            });
        } else if (this.currentTab === 'log') {
            const filters: Array<{ key: LogFilter; text: string }> = [
                { key: 'all', text: '全部' },
                { key: 'admin_up', text: '积分上分' },
                { key: 'admin_down', text: '积分下分' },
            ];
            filters.forEach((filter) => {
                createButton(this.controlNode!, filter.text, 116, 42, this.logFilter === filter.key ? COLORS.accent : COLORS.panelLight, this.node, 'DlgMatchSettings', 'onLogFilterClicked', filter.key)
                    .setPosition(x, 0, 0);
                x += 124;
            });
        }

        this.searchInput = this.createEditBox(this.controlNode, 210, 42);
        this.searchInput.node.setPosition(350, 0, 0);
        createButton(this.controlNode, this.currentTab === 'gift' ? '快速查询' : '查询', 112, 42, COLORS.orange, this.node, 'DlgMatchSettings', 'onSearchClicked')
            .setPosition(520, 0, 0);
        this.scrubEditBoxLabels();
    }

    private renderTable(headers: Array<{ text: string; x: number; w: number }>): void {
        if (!this.tableNode) return;
        this.tableNode.children.slice().forEach((child) => child.destroy());

        this.statusLabel = createLabel(this.tableNode, '', 24, COLORS.title, 460, 40);
        this.statusLabel.node.setPosition(-330, 214, 0);

        const header = new Node('Header');
        header.parent = this.tableNode;
        header.setPosition(0, 205, 0);
        header.addComponent(UITransform).setContentSize(1160, 46);
        fillRoundRect(header, 1160, 46, COLORS.header, 2);
        headers.forEach((item) => {
            const label = createLabel(header, item.text, 22, COLORS.title, item.w, 34);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.node.setPosition(item.x, 0, 0);
        });

        const scroll = createScrollArea(this.tableNode, 1160, 398, -34);
        this.content = scroll.content;
    }

    public onCloseClicked(): void {
        this.hideAdjustDialog();
        this.node.active = false;
    }

    public onTabClicked(_event: Event, tab: MatchTab): void {
        if (this.currentTab === tab) return;
        this.currentTab = tab;
        this.detailMode = false;
        this.detailPlayer = null;
        this.detailFilter = 'all';
        this.logFilter = 'all';
        this.pageNum = 1;
        this.hideAdjustDialog();
        this.updateTabs();
        this.renderControls();
        this.loadPage(true);
    }

    public onPrevDateClicked(): void {
        this.shiftDate(-1);
    }

    public onNextDateClicked(): void {
        this.shiftDate(1);
    }

    public onSearchClicked(): void {
        this.hideAdjustDialog();
        this.loadPage(true);
    }

    public onDetailFilterClicked(_event: Event, filter: DetailFilter): void {
        this.detailFilter = filter;
        this.hideAdjustDialog();
        this.renderControls();
        this.loadPage(true);
    }

    public onLogFilterClicked(_event: Event, filter: LogFilter): void {
        this.logFilter = filter;
        this.hideAdjustDialog();
        this.renderControls();
        this.loadPage(true);
    }

    public onPrevPageClicked(): void {
        if (this.pageNum <= 1) return;
        this.pageNum -= 1;
        this.hideAdjustDialog();
        this.loadPage(false);
    }

    public onNextPageClicked(): void {
        const max = Math.max(1, Math.ceil(this.total / this.pageSize));
        if (this.pageNum >= max) return;
        this.pageNum += 1;
        this.hideAdjustDialog();
        this.loadPage(false);
    }

    public onDetailClicked(_event: Event, index: string): void {
        const row = this.rows[Number(index)] as MatchPlayerRow;
        if (!row) return;
        this.hideAdjustDialog();
        this.detailMode = true;
        this.detailPlayer = row;
        this.detailFilter = 'all';
        this.renderControls();
        this.loadPage(true);
    }

    public onBackDetailClicked(): void {
        this.detailMode = false;
        this.detailPlayer = null;
        this.hideAdjustDialog();
        this.renderControls();
        this.loadPage(true);
    }

    public onAdjustClicked(_event: Event, index: string): void {
        const row = this.rows[Number(index)] as MatchPlayerRow;
        if (!row) return;
        this.showAdjustDialog(row);
    }

    public onAdjustModeClicked(_event: Event, mode: 'increase' | 'decrease'): void {
        this.adjustMode = mode;
        if (this.adjustDialog && this.adjustTarget) {
            this.showAdjustDialog(this.adjustTarget);
        }
    }

    public onCancelAdjustClicked(): void {
        this.hideAdjustDialog();
    }

    public onConfirmAdjustClicked(): void {
        const target = this.adjustTarget;
        if (!target) return;
        const rawAmount = Number(this.adjustInput?.string || '0');
        if (!isFinite(rawAmount) || rawAmount <= 0) {
            Client.Instance.showPromptDialog('请输入大于0的比赛分');
            return;
        }
        const amount = this.adjustMode === 'decrease' ? -Math.abs(Math.floor(rawAmount)) : Math.abs(Math.floor(rawAmount));
        this.hideAdjustDialog(false);
        this.adjustScore(target, amount);
    }

    private async loadPage(resetPage: boolean): Promise<void> {
        if (this.loading) return;
        if (resetPage) this.pageNum = 1;
        this.hideAdjustDialog();
        this.loading = true;
        this.rows = [];
        this.renderCurrentTable();
        this.setStatus('加载中...');
        try {
            const dto = await GameManager.Instance.authPost(this.currentEndpoint(), this.currentRequest());
            if (!this.isSuccess(dto)) {
                this.total = 0;
                this.setStatus(dto?.msg || '数据加载失败');
                this.renderCurrentRows();
                this.updatePageLabel();
                return;
            }
            this.rows = dto.records || [];
            this.total = dto.total || 0;
            this.setStatus(this.total > 0 ? '' : '暂无数据');
            this.renderCurrentRows();
            this.updatePageLabel();
        } catch (err) {
            console.error('[DlgMatchSettings] load page error:', err);
            this.total = 0;
            this.setStatus('数据加载失败');
            this.renderCurrentRows();
            this.updatePageLabel();
        } finally {
            this.loading = false;
        }
    }

    private currentEndpoint(): string {
        if (this.currentTab === 'detail' && this.detailMode) return '/player/agency/match/ledger/page';
        if (this.currentTab === 'log') return '/player/agency/match/operation-log/page';
        if (this.currentTab === 'gift') return '/player/agency/match/gift-stat/page';
        return '/player/agency/match/player/page';
    }

    private currentRequest(): any {
        const request: any = {
            pageNum: this.pageNum,
            pageSize: this.pageSize,
            viewType: this.currentTab,
            date: this.selectedDate,
            keyword: this.getKeyword(),
        };
        if (this.currentTab === 'detail' && this.detailMode && this.detailPlayer) {
            request.playerId = this.detailPlayer.playerId;
            request.changeType = this.detailFilter;
        }
        if (this.currentTab === 'log') {
            request.changeType = this.logFilter;
        }
        return request;
    }

    private renderCurrentTable(): void {
        if (this.currentTab === 'manage') {
            this.renderTable([
                { text: '身份', x: -470, w: 110 },
                { text: '信息', x: -260, w: 260 },
                { text: '线下人数', x: -35, w: 120 },
                { text: '比赛分', x: 160, w: 130 },
                { text: '管理', x: 420, w: 180 },
            ]);
        } else if (this.currentTab === 'share' || this.currentTab === 'shuffleShare') {
            this.renderTable([
                { text: '身份', x: -470, w: 110 },
                { text: '信息', x: -260, w: 260 },
                { text: '人数', x: -35, w: 120 },
                { text: this.currentTab === 'shuffleShare' ? '洗牌分' : '比赛分', x: 160, w: 130 },
                { text: '分佣比例', x: 410, w: 160 },
            ]);
        } else if (this.currentTab === 'detail' && !this.detailMode) {
            this.renderTable([
                { text: '玩家', x: -380, w: 320 },
                { text: '比赛分', x: -60, w: 130 },
                { text: '上级信息', x: 190, w: 240 },
                { text: '管理', x: 450, w: 160 },
            ]);
        } else if (this.currentTab === 'detail') {
            this.renderTable([
                { text: '比赛分', x: -430, w: 150 },
                { text: '剩余比赛分', x: -190, w: 170 },
                { text: '增减类型', x: 50, w: 180 },
                { text: '玩法名称', x: 275, w: 170 },
                { text: '时间', x: 470, w: 190 },
            ]);
        } else if (this.currentTab === 'log') {
            this.renderTable([
                { text: '操作人', x: -360, w: 260 },
                { text: '操作分数', x: -90, w: 150 },
                { text: '被操作人', x: 180, w: 260 },
                { text: '操作时间', x: 450, w: 210 },
            ]);
        } else {
            this.renderTable([
                { text: '身份', x: -470, w: 110 },
                { text: '信息', x: -260, w: 260 },
                { text: '人数', x: -40, w: 120 },
                { text: '赠送次数', x: 180, w: 150 },
                { text: '赠送分', x: 420, w: 150 },
            ]);
        }
    }

    private renderCurrentRows(): void {
        if (!this.content) return;
        this.content.removeAllChildren();
        if (this.rows.length === 0) {
            const empty = createLabel(this.content, '暂无数据', 30, COLORS.title, 500, 56);
            empty.horizontalAlign = Label.HorizontalAlign.CENTER;
            empty.node.setPosition(0, -150, 0);
            resizeScrollContent(this.content, 1160, 1, 72, 8);
            return;
        }
        if (this.currentTab === 'detail' && this.detailMode) {
            this.renderLedgerRows();
        } else if (this.currentTab === 'log') {
            this.renderLogRows();
        } else if (this.currentTab === 'gift') {
            this.renderGiftRows();
        } else {
            this.renderPlayerRows();
        }
    }

    private renderPlayerRows(): void {
        this.rows.forEach((row: MatchPlayerRow, index) => {
            const item = this.createRow(index);
            if (this.currentTab === 'detail') {
                this.infoLabel(item, row, -380, 300);
                this.centerLabel(item, this.amountText(row.score), -60, 130);
                this.centerLabel(item, `${row.parentNickname || '-'}\n${row.parentPlayerId || '-'}`, 190, 230, 18);
                createButton(item, '明细', 110, 42, COLORS.teal, this.node, 'DlgMatchSettings', 'onDetailClicked', String(index))
                    .setPosition(450, 0, 0);
                return;
            }
            this.centerLabel(item, row.identity || row.roleText || '-', -470, 110);
            this.infoLabel(item, row, -260, 250);
            this.centerLabel(item, String(row.juniorCount || 0), -35, 120);
            const scoreText = this.currentTab === 'share' || this.currentTab === 'shuffleShare'
                ? `${this.amountText(row.score)}\n分成${this.amountText(row.commissionAmount)}`
                : this.amountText(row.score);
            const isShareTab = this.currentTab === 'share' || this.currentTab === 'shuffleShare';
            this.centerLabel(item, scoreText, 160, 130, isShareTab ? 18 : 22);
            if (isShareTab) {
                this.centerLabel(item, this.rateText(row.commissionRateBp), 410, 160);
            } else {
                createButton(item, '上下分', 120, 42, COLORS.accent, this.node, 'DlgMatchSettings', 'onAdjustClicked', String(index))
                    .setPosition(420, 0, 0);
            }
        });
        resizeScrollContent(this.content!, 1160, this.rows.length, 72, 8);
    }

    private renderLedgerRows(): void {
        if (this.detailPlayer) {
            createButton(this.tableNode!, '返回列表', 110, 38, COLORS.panelLight, this.node, 'DlgMatchSettings', 'onBackDetailClicked')
                .setPosition(-505, 258, 0);
        }
        this.rows.forEach((row: MatchLedgerRow, index) => {
            const item = this.createRow(index);
            this.centerLabel(item, this.amountText(row.matchScore), -430, 150);
            this.centerLabel(item, this.amountText(row.balanceAfter), -190, 170);
            this.centerLabel(item, row.bizTypeText || row.changeType || '-', 50, 180);
            this.centerLabel(item, row.gameName || '-', 275, 170);
            this.centerLabel(item, this.formatTime(row.time), 470, 190, 18);
        });
        resizeScrollContent(this.content!, 1160, this.rows.length, 72, 8);
    }

    private renderLogRows(): void {
        this.rows.forEach((row: MatchLogRow, index) => {
            const item = this.createRow(index);
            this.centerLabel(item, `${row.operatorNickname || '-'}\n${row.operatorPlayerId || '-'}`, -360, 250, 18);
            this.centerLabel(item, `${row.changeType || '-'}\n${this.amountText(row.changeAmount)}`, -90, 150, 18);
            this.centerLabel(item, `${row.targetNickname || '-'}\n${row.targetPlayerId || '-'}`, 180, 250, 18);
            this.centerLabel(item, this.formatTime(row.time), 450, 210, 18);
        });
        resizeScrollContent(this.content!, 1160, this.rows.length, 72, 8);
    }

    private renderGiftRows(): void {
        this.rows.forEach((row: MatchGiftRow, index) => {
            const item = this.createRow(index);
            this.centerLabel(item, row.identity || row.role || '-', -470, 110);
            this.infoLabel(item, row, -260, 250);
            this.centerLabel(item, String(row.juniorCount || 0), -40, 120);
            this.centerLabel(item, this.amountText(row.giftTimes), 180, 150);
            this.centerLabel(item, this.amountText(row.giftScore), 420, 150);
        });
        resizeScrollContent(this.content!, 1160, this.rows.length, 72, 8);
    }

    private createRow(index: number): Node {
        const item = new Node(`Row_${index}`);
        item.parent = this.content!;
        item.setPosition(0, -(index * 80 + 36), 0);
        item.addComponent(UITransform).setContentSize(1128, 72);
        fillRoundRect(item, 1128, 72, index % 2 === 0 ? COLORS.row : COLORS.rowAlt, 8);
        return item;
    }

    private infoLabel(parent: Node, row: { nickname?: string; account?: string; playerId?: string }, x: number, w: number): void {
        const name = createLabel(parent, row.nickname || row.account || '-', 23, COLORS.text, w, 30);
        name.node.setPosition(x, 14, 0);
        const id = createLabel(parent, `ID:${row.playerId || '-'}`, 20, COLORS.danger, w, 28);
        id.node.setPosition(x, -16, 0);
    }

    private centerLabel(parent: Node, text: string, x: number, w: number, fontSize = 22): void {
        const label = createLabel(parent, text, fontSize, COLORS.text, w, 54);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.node.setPosition(x, 0, 0);
    }

    private showAdjustDialog(row: MatchPlayerRow): void {
        this.hideAdjustDialog(false);
        this.adjustTarget = row;
        const dismissLayer = new Node('AdjustDismissLayer');
        dismissLayer.parent = this.panel!;
        dismissLayer.addComponent(UITransform).setContentSize(1540, 780);
        dismissLayer.setPosition(0, 0, 0);
        dismissLayer.addComponent(BlockInputEvents);
        this.bindClick(dismissLayer, 'onCancelAdjustClicked');
        this.adjustDismissLayer = dismissLayer;

        const dialog = new Node('AdjustDialog');
        dialog.parent = this.panel!;
        dialog.addComponent(UITransform).setContentSize(420, 250);
        dialog.setPosition(210, 25, 0);
        fillRoundRect(dialog, 420, 250, new Color(86, 51, 42, 252), 12);
        this.adjustDialog = dialog;

        const title = createLabel(dialog, `上下分：${row.nickname || row.playerId}`, 24, COLORS.title, 340, 38);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.node.setPosition(0, 92, 0);

        createButton(dialog, '上分', 110, 40, this.adjustMode === 'increase' ? COLORS.accent : COLORS.panelLight, this.node, 'DlgMatchSettings', 'onAdjustModeClicked', 'increase')
            .setPosition(-70, 48, 0);
        createButton(dialog, '下分', 110, 40, this.adjustMode === 'decrease' ? COLORS.accent : COLORS.panelLight, this.node, 'DlgMatchSettings', 'onAdjustModeClicked', 'decrease')
            .setPosition(70, 48, 0);

        this.adjustInput = this.createEditBox(dialog, 220, 44);
        this.adjustInput.string = '100';
        this.adjustInput.node.setPosition(0, -6, 0);
        this.scrubEditBoxLabels();

        createButton(dialog, '取消', 116, 42, COLORS.panelLight, this.node, 'DlgMatchSettings', 'onCancelAdjustClicked')
            .setPosition(-72, -82, 0);
        createButton(dialog, '确定', 116, 42, COLORS.teal, this.node, 'DlgMatchSettings', 'onConfirmAdjustClicked')
            .setPosition(72, -82, 0);
        dismissLayer.setSiblingIndex(this.panel!.children.length - 2);
        dialog.setSiblingIndex(this.panel!.children.length - 1);
        this.scrubEditBoxLabels();
    }

    private hideAdjustDialog(clearTarget = true): void {
        if (this.adjustDismissLayer) {
            this.adjustDismissLayer.destroy();
            this.adjustDismissLayer = null;
        }
        if (this.adjustDialog) {
            this.adjustDialog.destroy();
            this.adjustDialog = null;
            this.adjustInput = null;
        }
        if (clearTarget) {
            this.adjustTarget = null;
        }
    }

    private async adjustScore(row: MatchPlayerRow, amount: number): Promise<void> {
        try {
            const dto = await GameManager.Instance.authPost('/player/agency/match/score/adjust', {
                playerId: row.playerId,
                walletType: 'gold',
                amount,
                reason: 'Cocos比赛分上下分',
            });
            if (!this.isSuccess(dto)) {
                Client.Instance.showPromptDialog(dto?.msg || '上下分失败');
                return;
            }
            Client.Instance.showPromptTip('上下分成功', 2.0);
            this.loadPage(false);
        } catch (err) {
            const msg = err?.msg || err?.message || String(err);
            Client.Instance.showPromptDialog('上下分失败：' + msg);
        }
    }

    private createEditBox(parent: Node, width: number, height: number): EditBox {
        const node = new Node('Input');
        node.parent = parent;
        node.addComponent(UITransform).setContentSize(width, height);
        fillRoundRect(node, width, height, COLORS.input, 8);

        const textNode = new Node('InputText');
        textNode.parent = node;
        textNode.addComponent(UITransform).setContentSize(width - 22, height - 4);
        const textLabel = textNode.addComponent(Label);
        textLabel.string = '';
        textLabel.fontSize = 22;
        textLabel.lineHeight = 28;
        textLabel.color = COLORS.title;
        textLabel.overflow = Label.Overflow.CLAMP;
        textLabel.verticalAlign = Label.VerticalAlign.CENTER;
        textNode.setPosition(0, 0, 0);

        const placeholder = createLabel(node, '', 20, new Color(0, 0, 0, 0), width - 22, height - 4);
        placeholder.node.active = false;

        const editBox = node.addComponent(EditBox);
        editBox.textLabel = textLabel;
        editBox.placeholderLabel = placeholder;
        editBox.placeholder = '';
        editBox.string = '';
        editBox.maxLength = 32;
        textLabel.string = '';
        placeholder.string = '';
        sanitizeEditBoxDefaultLabels(editBox, [textLabel, placeholder]);
        return editBox;
    }

    private bindClick(node: Node, handler: string, customData = ''): void {
        const button = node.getComponent(Button) || node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 1.04;
        const evt = new EventHandler();
        evt.target = this.node;
        evt.component = 'DlgMatchSettings';
        evt.handler = handler;
        evt.customEventData = customData;
        button.clickEvents.push(evt);
    }

    private updateTabs(): void {
        (['manage', 'share', 'shuffleShare', 'detail', 'log', 'gift'] as MatchTab[]).forEach((tab) => {
            const node = this.leftTabs[tab];
            if (!node) return;
            fillRoundRect(node, 230, 94, tab === this.currentTab ? COLORS.leftActive : COLORS.leftIdle, 2);
            const label = node.getChildByName('Label')?.getComponent(Label);
            if (label) {
                const textMap: Record<MatchTab, string> = {
                    manage: '比赛分管理',
                    share: '比赛分分成',
                    shuffleShare: '洗牌分分成',
                    detail: '比赛分明细',
                    log: '操作日志',
                    gift: '赠送统计',
                };
                label.string = textMap[tab] + (tab === this.currentTab ? '>' : '');
                label.color = tab === this.currentTab ? COLORS.white : COLORS.muted;
            }
        });
    }

    private shiftDate(days: number): void {
        const date = this.parseDate(this.selectedDate);
        date.setDate(date.getDate() + days);
        this.selectedDate = this.formatDate(date);
        if (this.dateLabel) this.dateLabel.string = this.dateText();
        this.hideAdjustDialog();
        this.loadPage(true);
    }

    private getKeyword(): string {
        return this.searchInput ? this.searchInput.string.trim() : '';
    }

    private setStatus(text: string): void {
        if (this.statusLabel) this.statusLabel.string = text;
    }

    private updatePageLabel(): void {
        if (!this.pageLabel) return;
        this.pageLabel.string = `${this.pageNum}/${Math.max(1, Math.ceil(this.total / this.pageSize))}`;
    }

    private isSuccess(dto: any): boolean {
        return !!dto && (!dto.code || dto.code === '00000000' || dto.code === 200 || dto.code === '200');
    }

    private amountText(value: number | undefined): string {
        if (value == null || isNaN(Number(value))) return '0';
        return String(Math.floor(Number(value)));
    }

    private rateText(value: number | undefined): string {
        const rate = value == null || isNaN(Number(value)) ? 0 : Number(value);
        return `${(rate / 100).toFixed(2)}%`;
    }

    private formatTime(value?: string): string {
        if (!value) return '-';
        const normalized = value.replace('T', ' ');
        return normalized.length > 16 ? normalized.substring(0, 16) : normalized;
    }

    private dateText(): string {
        const text = this.formatDateText(this.selectedDate);
        if (this.currentTab === 'detail' && this.detailMode) {
            return `${text} -- ${text}`;
        }
        return text;
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

    private scrubEditBoxLabels(): void {
        sanitizeAllEditBoxDefaultLabels(this.node);
    }
}
