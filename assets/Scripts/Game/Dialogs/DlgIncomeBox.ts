import { _decorator, BlockInputEvents, Button, Color, Component, EditBox, EventTouch, Label, Node, UITransform } from 'cc';
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

interface IncomeBoxSummary {
    balance?: number;
    pendingAmount?: number;
    pendingLedgerAmount?: number;
    depositSettledAmount?: number;
    prepaidAmount?: number;
    legacyReward?: number;
    todayCommission?: number;
    todayIncomeAmount?: number;
    todayPendingCommission?: number;
    todayDepositSettledAmount?: number;
    availableTodayCommission?: number;
    todayAvailableAmount?: number;
    todayWithdrawableAmount?: number;
    totalCommission?: number;
    claimedAmount?: number;
    gold?: number;
    deposit?: number;
    records?: IncomeBoxRecord[];
    withdrawRecords?: IncomeBoxRecord[];
    incomeDetails?: IncomeBoxRecord[];
}

interface IncomeBoxRecord {
    createTime?: string | number;
    extractTime?: string | number;
    withdrawTime?: string | number;
    time?: string | number;
    amount?: number;
    value?: number;
    score?: number;
    changeAmount?: number;
    commissionAmount?: number;
    availableAmount?: number;
    gameType?: number;
    gameName?: string;
    sourceTypeText?: string;
    sourceInfo?: string;
    sourcePlayerId?: string;
    sourcePlayerName?: string;
    roomId?: string;
    feePlayerId?: string;
    feePlayerNickname?: string;
    statusText?: string;
    remark?: string;
}

type IncomeBoxTab = 'withdraw' | 'detail';

const COLORS = {
    overlay: new Color(0, 0, 0, 150),
    panel: new Color(37, 56, 78, 250),
    panelLight: new Color(248, 232, 196, 248),
    titleBand: new Color(84, 76, 102, 255),
    cardA: new Color(255, 248, 224, 250),
    cardB: new Color(235, 246, 238, 250),
    cardC: new Color(232, 240, 255, 250),
    text: new Color(70, 56, 52, 255),
    muted: new Color(130, 104, 96, 255),
    title: new Color(255, 242, 206, 255),
    accent: new Color(252, 194, 67, 255),
    green: new Color(38, 154, 112, 255),
    teal: new Color(26, 174, 164, 255),
    danger: new Color(154, 78, 78, 255),
};

@ccclass('DlgIncomeBox')
export class DlgIncomeBox extends Component {
    private balanceLabel: Label | null = null;
    private todayLabel: Label | null = null;
    private totalLabel: Label | null = null;
    private claimedLabel: Label | null = null;
    private goldLabel: Label | null = null;
    private statusLabel: Label | null = null;
    private withdrawButton: Node | null = null;
    private quickWithdrawButton: Node | null = null;
    private amountInput: EditBox | null = null;
    private withdrawTabButton: Node | null = null;
    private detailTabButton: Node | null = null;
    private recordsContent: Node | null = null;
    private recordsStatusLabel: Label | null = null;
    private currentTab: IncomeBoxTab = 'detail';
    private withdrawRecords: IncomeBoxRecord[] = [];
    private incomeDetails: IncomeBoxRecord[] = [];
    private loading = false;
    private withdrawing = false;
    private currentBalance = 0;

    onLoad(): void {
        this.buildUI();
    }

    onEnable(): void {
        this.loadSummary();
    }

    private buildUI(): void {
        this.node.addComponent(UITransform).setContentSize(1920, 1080);

        const overlay = new Node('Overlay');
        overlay.parent = this.node;
        overlay.addComponent(UITransform).setContentSize(1920, 1080);
        overlay.addComponent(BlockInputEvents);
        fillRoundRect(overlay, 1920, 1080, COLORS.overlay, 0);

        const panel = new Node('Panel');
        panel.parent = this.node;
        panel.addComponent(UITransform).setContentSize(860, 620);
        fillRoundRect(panel, 860, 620, COLORS.panelLight, 18);

        const titleBand = new Node('TitleBand');
        titleBand.parent = panel;
        titleBand.setPosition(0, 254, 0);
        titleBand.addComponent(UITransform).setContentSize(820, 70);
        fillRoundRect(titleBand, 820, 70, COLORS.titleBand, 16);

        const title = createLabel(titleBand, '收益箱', 36, COLORS.title, 240, 52);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.node.setPosition(0, 0, 0);

        createButton(titleBand, 'X', 48, 48, COLORS.danger, this.node, 'DlgIncomeBox', 'onCloseClicked')
            .setPosition(370, 0, 0);

        this.todayLabel = this.createMetric(panel, '今日收益', '0', -210, 164, COLORS.cardB);
        this.balanceLabel = this.createMetric(panel, '剩余未提取收益', '0', 210, 164, COLORS.cardA);

        const table = new Node('WithdrawRecordTable');
        table.parent = panel;
        table.setPosition(0, -38, 0);
        table.addComponent(UITransform).setContentSize(760, 300);
        fillRoundRect(table, 760, 300, new Color(255, 250, 235, 248), 12);

        const tabBar = new Node('TabBar');
        tabBar.parent = table;
        tabBar.setPosition(0, 126, 0);
        tabBar.addComponent(UITransform).setContentSize(720, 44);

        this.withdrawTabButton = createButton(tabBar, '提取记录', 150, 38, COLORS.teal, this.node, 'DlgIncomeBox', 'onWithdrawTabClicked');
        this.withdrawTabButton.setPosition(-86, 0, 0);
        this.resetButtonClickEvents(this.withdrawTabButton);
        this.bindButtonTouch(this.withdrawTabButton, () => this.switchTab('withdraw'));

        this.detailTabButton = createButton(tabBar, '明细', 120, 38, COLORS.titleBand, this.node, 'DlgIncomeBox', 'onDetailTabClicked');
        this.detailTabButton.setPosition(72, 0, 0);
        this.resetButtonClickEvents(this.detailTabButton);
        this.bindButtonTouch(this.detailTabButton, () => this.switchTab('detail'));

        const header = new Node('Header');
        header.parent = table;
        header.setPosition(0, 82, 0);
        header.addComponent(UITransform).setContentSize(720, 38);
        fillRoundRect(header, 720, 38, new Color(95, 86, 112, 255), 10);

        const timeHeader = createLabel(header, '信息', 20, COLORS.title, 420, 32);
        timeHeader.horizontalAlign = Label.HorizontalAlign.CENTER;
        timeHeader.node.setPosition(-140, 0, 0);
        const valueHeader = createLabel(header, '数值', 20, COLORS.title, 240, 32);
        valueHeader.horizontalAlign = Label.HorizontalAlign.CENTER;
        valueHeader.node.setPosition(220, 0, 0);

        const { content } = createScrollArea(table, 720, 166, -54);
        this.recordsContent = content;
        this.recordsStatusLabel = createLabel(table, '暂无提取记录', 22, COLORS.muted, 500, 36);
        this.recordsStatusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.recordsStatusLabel.node.setPosition(0, -54, 0);

        this.goldLabel = createLabel(panel, '当前积分 0', 22, COLORS.text, 260, 34);
        this.goldLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.goldLabel.node.setPosition(-255, -258, 0);

        const amountRow = new Node('AmountSelector');
        amountRow.parent = panel;
        amountRow.setPosition(0, -208, 0);
        amountRow.addComponent(UITransform).setContentSize(720, 46);

        const amountTitle = createLabel(amountRow, '提取数量', 21, COLORS.text, 110, 34);
        amountTitle.horizontalAlign = Label.HorizontalAlign.CENTER;
        amountTitle.node.setPosition(-266, 0, 0);

        this.amountInput = this.createAmountEditBox(amountRow, 250, 44);
        this.amountInput.node.setPosition(-96, 0, 0);

        const fillAmountButton = createButton(amountRow, '全部', 84, 42, COLORS.titleBand, this.node, 'DlgIncomeBox', 'onFillAmountClicked');
        fillAmountButton.setPosition(74, 0, 0);
        this.resetButtonClickEvents(fillAmountButton);
        this.bindButtonTouch(fillAmountButton, () => this.onFillAmountClicked());

        this.withdrawButton = createButton(panel, '提取', 150, 52, COLORS.teal, this.node, 'DlgIncomeBox', 'onWithdrawClicked');
        this.withdrawButton.setPosition(120, -258, 0);
        this.resetButtonClickEvents(this.withdrawButton);
        this.bindButtonTouch(this.withdrawButton, () => this.onWithdrawClicked());

        this.quickWithdrawButton = createButton(panel, '一键提取', 170, 52, COLORS.green, this.node, 'DlgIncomeBox', 'onWithdrawAllClicked');
        this.quickWithdrawButton.setPosition(300, -258, 0);
        this.resetButtonClickEvents(this.quickWithdrawButton);
        this.bindButtonTouch(this.quickWithdrawButton, () => this.onWithdrawAllClicked());

        this.statusLabel = createLabel(panel, '', 22, COLORS.muted, 520, 36);
        this.statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.statusLabel.node.setPosition(0, -300, 0);
        this.updateTabs();
        this.scrubEditBoxLabels();
    }

    private createMetric(parent: Node, name: string, value: string, x: number, y: number, color: Color): Label {
        const card = new Node(name);
        card.parent = parent;
        card.setPosition(x, y, 0);
        card.addComponent(UITransform).setContentSize(320, 104);
        fillRoundRect(card, 320, 104, color, 12);

        const nameLabel = createLabel(card, name, 22, COLORS.muted, 260, 34);
        nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameLabel.node.setPosition(0, 24, 0);

        const valueLabel = createLabel(card, value, 34, COLORS.text, 280, 46);
        valueLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        valueLabel.node.setPosition(0, -20, 0);
        return valueLabel;
    }

    private createAmountEditBox(parent: Node, width: number, height: number): EditBox {
        const node = new Node('AmountInput');
        node.parent = parent;
        node.addComponent(UITransform).setContentSize(width, height);
        fillRoundRect(node, width, height, new Color(255, 252, 242, 255), 8);

        const textLabel = createLabel(node, '', 24, COLORS.text, width - 28, height - 4);
        textLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        textLabel.node.setPosition(0, 0, 0);
        const placeholderLabel = createLabel(node, '请输入数量', 20, COLORS.muted, width - 28, height - 4);
        placeholderLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        placeholderLabel.node.setPosition(0, 0, 0);

        const editBox = node.addComponent(EditBox);
        editBox.textLabel = textLabel;
        editBox.placeholderLabel = placeholderLabel;
        editBox.placeholder = '请输入数量';
        editBox.inputMode = EditBox.InputMode.NUMERIC;
        editBox.maxLength = 12;
        editBox.string = '';
        sanitizeEditBoxDefaultLabels(editBox, [textLabel, placeholderLabel]);
        return editBox;
    }

    private async loadSummary(): Promise<void> {
        if (this.loading) return;
        this.loading = true;
        this.setStatus('加载中...');
        try {
            const dto = await GameManager.Instance.authGet('/player/agency/income-box');
            if (!this.isSuccess(dto)) {
                this.setStatus(dto?.msg || '收益箱加载失败');
                return;
            }
            this.applySummary(dto);
            this.setStatus('');
        } catch (err) {
            this.setStatus('收益箱加载失败');
            console.log('Load income box failed: ', err);
        } finally {
            this.loading = false;
        }
    }

    public async onWithdrawAllClicked(): Promise<void> {
        await this.withdrawIncomeBox('/player/agency/income-box/withdraw-all', null);
    }

    public async onWithdrawClicked(): Promise<void> {
        const amount = this.getSelectedWithdrawAmount();
        if (amount <= 0) {
            Client.Instance.showPromptTip('请输入提取数量', 2.0);
            return;
        }
        if (amount > this.currentBalance) {
            Client.Instance.showPromptTip('提取数量不能超过可提取收益', 2.0);
            return;
        }
        await this.withdrawIncomeBox(`/player/agency/income-box/withdraw?amount=${encodeURIComponent(String(amount))}`, amount);
    }

    public onFillAmountClicked(): void {
        if (this.amountInput) {
            this.amountInput.string = this.currentBalance > 0 ? this.formatAmount(this.currentBalance) : '';
        }
    }

    private async withdrawIncomeBox(endpoint: string, amount: number | null): Promise<void> {
        if (this.withdrawing) return;
        if (this.currentBalance <= 0) {
            Client.Instance.showPromptTip('收益箱暂无可提取积分', 2.0);
            return;
        }
        this.withdrawing = true;
        this.setStatus('提取中...');
        try {
            const dto = await GameManager.Instance.authPost(endpoint, amount !== null ? { amount } : {});
            if (!this.isSuccess(dto)) {
                Client.Instance.showPromptDialog('提取失败：' + (dto?.msg || '未知错误'));
                this.setStatus('');
                return;
            }
            this.syncCapital(dto);
            this.applySummary(dto);
            const withdrawnAmount = this.toNumber(dto?.withdrawnAmount ?? dto?.amount);
            Client.Instance.showPromptTip(withdrawnAmount > 0 ? `已提取${withdrawnAmount}积分到账户` : '收益箱暂无可提取积分', 2.0);
            this.setStatus('');
        } catch (err) {
            const msg = err?.msg || err?.message || String(err);
            Client.Instance.showPromptDialog('提取失败：' + msg);
            this.setStatus('');
        } finally {
            this.withdrawing = false;
        }
    }

    public onCloseClicked(): void {
        this.node.active = false;
    }

    public onWithdrawTabClicked(): void {
        this.switchTab('withdraw');
    }

    public onDetailTabClicked(): void {
        this.switchTab('detail');
    }

    private applySummary(dto: IncomeBoxSummary): void {
        const balance = this.resolveWithdrawableBalance(dto);
        this.currentBalance = balance;
        if (this.balanceLabel) this.balanceLabel.string = this.formatAmount(balance);
        if (this.amountInput && !this.withdrawing) {
            this.amountInput.string = balance > 0 ? this.formatAmount(balance) : '';
        }
        if (this.todayLabel) {
            this.todayLabel.string = this.formatAmount(
                Math.max(
                    this.toNumber(dto?.todayIncomeAmount),
                    this.toNumber(dto?.todayPendingCommission) + this.toNumber(dto?.todayDepositSettledAmount),
                    this.toNumber(dto?.todayCommission),
                )
            );
        }
        if (this.totalLabel) this.totalLabel.string = this.formatAmount(dto?.totalCommission);
        if (this.claimedLabel) this.claimedLabel.string = this.formatAmount(dto?.claimedAmount);
        if (this.goldLabel) this.goldLabel.string = `当前积分 ${this.formatAmount(dto?.gold ?? GameManager.Instance.Gold)}`;
        const buttons = [this.withdrawButton?.getComponent(Button), this.quickWithdrawButton?.getComponent(Button)];
        buttons.forEach((button) => {
            if (button) button.interactable = true;
        });
        this.withdrawRecords = Array.isArray(dto?.records) ? dto.records : dto?.withdrawRecords || [];
        this.incomeDetails = Array.isArray(dto?.incomeDetails) ? dto.incomeDetails : [];
        this.renderRecords();
    }

    private resolveWithdrawableBalance(dto: IncomeBoxSummary): number {
        const ledgerTotal = this.toNumber(dto?.pendingLedgerAmount)
            + Math.max(this.toNumber(dto?.depositSettledAmount), this.toNumber(dto?.prepaidAmount))
            + this.toNumber(dto?.legacyReward);
        const todayAvailable = this.toNumber(dto?.availableTodayCommission)
            || this.toNumber(dto?.todayAvailableAmount)
            || this.toNumber(dto?.todayWithdrawableAmount)
            || (this.toNumber(dto?.todayPendingCommission) + this.toNumber(dto?.todayDepositSettledAmount));
        return Math.max(
            this.toNumber(dto?.balance),
            this.toNumber(dto?.pendingAmount),
            ledgerTotal,
            todayAvailable,
        );
    }

    private renderRecords(): void {
        if (!this.recordsContent) return;
        this.recordsContent.removeAllChildren();
        const rows = this.buildDisplayRows();
        if (this.recordsStatusLabel) {
            this.recordsStatusLabel.string = this.currentTab === 'detail' ? '暂无收益明细' : '暂无提取记录';
            this.recordsStatusLabel.node.active = rows.length === 0;
        }
        if (rows.length === 0) return;

        const width = 720;
        const rowHeight = this.currentTab === 'detail' ? 70 : 52;
        const gap = 6;
        resizeScrollContent(this.recordsContent, width, rows.length, rowHeight, gap);
        for (let i = 0; i < rows.length; i++) {
            const row = new Node(`Record${i}`);
            row.parent = this.recordsContent;
            row.addComponent(UITransform).setContentSize(width, rowHeight);
            row.setPosition(0, -i * (rowHeight + gap) - rowHeight / 2, 0);
            fillRoundRect(row, width, rowHeight, i % 2 === 0 ? new Color(255, 246, 225, 255) : new Color(248, 238, 215, 255), 8);

            const titleLabel = createLabel(row, rows[i].title, this.currentTab === 'detail' ? 18 : 20, COLORS.text, 500, 30);
            titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
            titleLabel.node.setPosition(-78, rows[i].subtitle ? 14 : 0, 0);

            if (rows[i].subtitle) {
                const subLabel = createLabel(row, rows[i].subtitle || '', 16, COLORS.muted, 500, 28);
                subLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
                subLabel.node.setPosition(-78, -16, 0);
            }

            const amountLabel = createLabel(row, rows[i].amount, 20, rows[i].positive ? COLORS.green : COLORS.danger, 180, 34);
            amountLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            amountLabel.node.setPosition(235, 0, 0);
        }
    }

    private buildDisplayRows(): Array<{ title: string; subtitle?: string; amount: string; positive: boolean }> {
        const rows: Array<{ title: string; subtitle?: string; amount: string; positive: boolean }> = [];
        if (this.currentTab === 'withdraw') {
            this.withdrawRecords.forEach((record) => {
                rows.push({
                    title: `提取时间 ${this.formatRecordTime(record)}`,
                    subtitle: record?.remark || record?.statusText || '',
                    amount: `+${this.formatAmount(record?.amount ?? record?.value ?? record?.score ?? record?.changeAmount)}`,
                    positive: true,
                });
            });
            return rows;
        }
        this.incomeDetails.forEach((record) => {
            const gameName = record?.gameName || this.extractGameName(record?.sourceInfo) || '未知游戏';
            const sourceType = record?.sourceTypeText || '收益';
            const player = record?.sourcePlayerName || record?.feePlayerNickname || record?.sourcePlayerId || record?.feePlayerId || '-';
            const time = this.formatRecordTime(record);
            const amount = this.toNumber(record?.commissionAmount ?? record?.amount ?? record?.value ?? record?.availableAmount);
            rows.push({
                title: `${gameName} | ${sourceType} | ${record?.statusText || ''}`,
                subtitle: `来源玩家 ${player} | 房间 ${record?.roomId || '-'} | ${time}`,
                amount: `+${this.formatAmount(amount)}`,
                positive: true,
            });
        });
        return rows;
    }

    private switchTab(tab: IncomeBoxTab): void {
        if (this.currentTab === tab) return;
        this.currentTab = tab;
        this.updateTabs();
        this.renderRecords();
    }

    private updateTabs(): void {
        this.paintTab(this.withdrawTabButton, this.currentTab === 'withdraw');
        this.paintTab(this.detailTabButton, this.currentTab === 'detail');
    }

    private paintTab(node: Node | null, active: boolean): void {
        if (!node) return;
        const transform = node.getComponent(UITransform);
        fillRoundRect(node, transform?.width || 120, transform?.height || 38, active ? COLORS.teal : COLORS.titleBand, 8);
        const label = node.getChildByName('Label')?.getComponent(Label);
        if (label) label.color = active ? COLORS.title : new Color(215, 210, 226, 255);
    }

    private bindButtonTouch(node: Node | null, handler: () => void): void {
        if (!node) return;
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            handler();
        }, this);
    }

    private resetButtonClickEvents(node: Node | null): void {
        const button = node?.getComponent(Button);
        if (button) button.clickEvents.length = 0;
    }

    private formatRecordTime(record: IncomeBoxRecord): string {
        const value = record?.extractTime || record?.withdrawTime || record?.createTime || record?.time || '';
        if (!value) return '--';
        if (typeof value === 'number') {
            const date = new Date(value);
            return isNaN(date.getTime()) ? String(value) : this.formatDate(date);
        }
        return String(value).replace('T', ' ').slice(0, 19);
    }

    private extractGameName(sourceInfo?: string): string {
        if (!sourceInfo) return '';
        const match = /游戏:([^|]+)/.exec(sourceInfo);
        return match ? match[1].trim() : '';
    }

    private formatDate(date: Date): string {
        const pad = (num: number) => num < 10 ? `0${num}` : String(num);
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    private syncCapital(dto: any): void {
        if (dto?.gold !== undefined && dto?.gold !== null) {
            GameManager.Instance.Gold = this.toNumber(dto.gold);
        }
        if (dto?.deposit !== undefined && dto?.deposit !== null) {
            GameManager.Instance.Deposit = this.toNumber(dto.deposit);
        }
        if (dto?.gold !== undefined || dto?.deposit !== undefined) {
            GameManager.Instance.updatePlayerInfoTime();
        }
    }

    private getSelectedWithdrawAmount(): number {
        const value = (this.amountInput?.string || '').replace(/[^\d]/g, '');
        return Math.floor(this.toNumber(value));
    }

    private scrubEditBoxLabels(): void {
        sanitizeAllEditBoxDefaultLabels(this.node);
    }

    private setStatus(text: string): void {
        if (this.statusLabel) this.statusLabel.string = text;
    }

    private isSuccess(dto: any): boolean {
        return dto?.code === '00000000' || dto?.code === 200 || dto?.code === '200';
    }

    private toNumber(value: any): number {
        const num = Number(value);
        return isFinite(num) ? num : 0;
    }

    private formatAmount(value: any): string {
        return Math.floor(this.toNumber(value)).toString();
    }
}
