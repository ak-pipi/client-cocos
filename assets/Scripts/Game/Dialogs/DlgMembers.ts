import { _decorator, BlockInputEvents, Button, Color, Component, EditBox, EventHandler, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { GameManager } from '../../Manager/GameManager';
import { GameFactory } from '../../App/GameFactory';
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

type MemberTab = 'agent' | 'player';

interface AgencyMember {
    playerId: string;
    nickname?: string;
    account?: string;
    avatar?: string;
    remark?: string;
    role?: string;
    roleText?: string;
    agentType?: number;
    level?: number;
    juniorCount?: number;
    superiorId?: string;
    superiorNickname?: string;
    commissionRateBp?: number;
    banned?: number;
    loginTime?: string;
}

const COLORS = {
    overlay: new Color(0, 0, 0, 150),
    panel: new Color(245, 224, 184, 248),
    panelDark: new Color(104, 78, 86, 255),
    panelMid: new Color(135, 101, 102, 255),
    row: new Color(255, 252, 238, 250),
    rowAlt: new Color(246, 239, 220, 250),
    leftIdle: new Color(238, 220, 190, 255),
    leftActive: new Color(255, 219, 86, 255),
    title: new Color(255, 248, 226, 255),
    text: new Color(78, 58, 56, 255),
    muted: new Color(128, 96, 92, 255),
    white: new Color(255, 255, 255, 255),
    accent: new Color(255, 199, 61, 255),
    teal: new Color(22, 196, 176, 255),
    green: new Color(48, 159, 104, 255),
    danger: new Color(160, 82, 76, 255),
    input: new Color(94, 76, 92, 245),
};

@ccclass('DlgMembers')
export class DlgMembers extends Component {
    private panel: Node | null = null;
    private partnerContent: Node | null = null;
    private memberContent: Node | null = null;
    private statusLabel: Label | null = null;
    private titleLabel: Label | null = null;
    private pageLabel: Label | null = null;
    private partnerInput: EditBox | null = null;
    private memberInput: EditBox | null = null;
    private commissionInput: EditBox | null = null;
    private remarkInput: EditBox | null = null;
    private actionMenu: Node | null = null;
    private commissionDialog: Node | null = null;
    private remarkDialog: Node | null = null;
    private playLimitDialog: Node | null = null;
    private playLimitContent: Node | null = null;
    private activeActionMember: AgencyMember | null = null;
    private playLimitGameTypes: Set<number> = new Set<number>();
    private tabNodes: Record<MemberTab, Node | null> = { agent: null, player: null };

    private currentTab: MemberTab = 'agent';
    private partners: AgencyMember[] = [];
    private members: AgencyMember[] = [];
    private selectedPartnerId = '';
    private pageNum = 1;
    private pageSize = 5;
    private total = 0;
    private loadingPartners = false;
    private loadingMembers = false;
    private operatingMember = false;

    onLoad(): void {
        this.buildUI();
    }

    onEnable(): void {
        this.refreshAll();
        this.scrubEditBoxLabels();
    }

    private buildUI(): void {
        const root = new Node('MembersRoot');
        root.parent = this.node;
        root.addComponent(UITransform).setContentSize(1920, 1080);

        const overlay = new Node('Overlay');
        overlay.parent = root;
        overlay.addComponent(UITransform).setContentSize(1920, 1080);
        overlay.addComponent(BlockInputEvents);
        fillRoundRect(overlay, 1920, 1080, COLORS.overlay, 0);

        this.panel = new Node('Panel');
        this.panel.parent = root;
        this.panel.addComponent(UITransform).setContentSize(1360, 740);
        fillRoundRect(this.panel, 1360, 740, COLORS.panel, 18);

        const titleBand = new Node('TitleBand');
        titleBand.parent = this.panel;
        titleBand.setPosition(0, 325, 0);
        titleBand.addComponent(UITransform).setContentSize(1320, 72);
        fillRoundRect(titleBand, 1320, 72, COLORS.panelDark, 16);

        this.titleLabel = createLabel(titleBand, '成员管理', 38, COLORS.title, 280, 54);
        this.titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.titleLabel.node.setPosition(440, 0, 0);

        createLabel(titleBand, `玩家ID:${GameManager.Instance.PlayerId || '-'}`, 22, COLORS.accent, 260, 38)
            .node.setPosition(-500, 8, 0);

        createButton(titleBand, 'X', 48, 48, COLORS.danger, this.node, 'DlgMembers', 'onCloseClicked')
            .setPosition(615, 0, 0);

        this.createSearchArea();
        this.createTabs();
        this.createPartnerPanel();
        this.createMemberPanel();
        this.scrubEditBoxLabels();
    }

    private createSearchArea(): void {
        const panel = this.panel!;
        this.partnerInput = this.createEditBox(panel, '查询合伙人ID/名称/备注', 230, 42);
        this.partnerInput.node.setPosition(-430, 260, 0);
        const partnerSearch = createButton(panel, '查询', 78, 42, COLORS.panelDark, this.node, 'DlgMembers', 'onPartnerSearchClicked');
        partnerSearch.setPosition(-275, 260, 0);
        this.setButtonLabelColor(partnerSearch, COLORS.accent);

        this.memberInput = this.createEditBox(panel, '查询成员ID/名称/备注', 230, 42);
        this.memberInput.node.setPosition(-80, 260, 0);
        const memberSearch = createButton(panel, '查询', 78, 42, COLORS.panelDark, this.node, 'DlgMembers', 'onMemberSearchClicked');
        memberSearch.setPosition(75, 260, 0);
        this.setButtonLabelColor(memberSearch, COLORS.accent);

        createButton(panel, '刷新', 88, 42, COLORS.teal, this.node, 'DlgMembers', 'onRefreshClicked')
            .setPosition(205, 260, 0);
    }

    private createTabs(): void {
        const tabs: Array<{ key: MemberTab; text: string; x: number }> = [
            { key: 'agent', text: '代理(合伙人)', x: -520 },
            { key: 'player', text: '直邀玩家', x: -330 },
        ];
        tabs.forEach((tab) => {
            const node = new Node(`Tab_${tab.key}`);
            node.parent = this.panel;
            node.setPosition(tab.x, 205, 0);
            node.addComponent(UITransform).setContentSize(170, 46);
            fillRoundRect(node, 170, 46, tab.key === this.currentTab ? COLORS.leftActive : COLORS.leftIdle, 12);

            const label = createLabel(node, tab.text, 22, COLORS.text, 156, 40);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.node.setPosition(0, 0, 0);
            this.bindClick(node, 'onTabClicked', tab.key);
            this.tabNodes[tab.key] = node;
        });
    }

    private createPartnerPanel(): void {
        const panel = this.panel!;
        const left = new Node('PartnerPanel');
        left.parent = panel;
        left.setPosition(-500, -60, 0);
        left.addComponent(UITransform).setContentSize(300, 500);
        fillRoundRect(left, 300, 500, new Color(250, 236, 205, 248), 12);

        createLabel(left, '合伙人列表', 24, COLORS.text, 250, 36).node.setPosition(-8, 218, 0);
        const scroll = createScrollArea(left, 276, 424, -15);
        this.partnerContent = scroll.content;
    }

    private createMemberPanel(): void {
        const panel = this.panel!;
        const right = new Node('MemberPanel');
        right.parent = panel;
        right.setPosition(160, -60, 0);
        right.addComponent(UITransform).setContentSize(980, 500);
        fillRoundRect(right, 980, 500, new Color(250, 236, 205, 248), 12);

        this.statusLabel = createLabel(right, '加载中...', 22, COLORS.muted, 540, 34);
        this.statusLabel.node.setPosition(-165, 225, 0);

        const header = new Node('TableHeader');
        header.parent = right;
        header.setPosition(0, 180, 0);
        header.addComponent(UITransform).setContentSize(930, 44);
        fillRoundRect(header, 930, 44, COLORS.panelDark, 8);
        this.createHeaderLabel(header, '头像/ID/名称', -330, 250);
        this.createHeaderLabel(header, '备注', -150, 116);
        this.createHeaderLabel(header, '身份', -42, 86);
        this.createHeaderLabel(header, '上级信息', 130, 190);
        this.createHeaderLabel(header, '最近登录', 310, 140);
        this.createHeaderLabel(header, '操作', 424, 78);

        const scroll = createScrollArea(right, 930, 370, -30);
        this.memberContent = scroll.content;

        createButton(right, '<', 44, 38, COLORS.accent, this.node, 'DlgMembers', 'onPrevPageClicked')
            .setPosition(300, -232, 0);
        this.pageLabel = createLabel(right, '1/1', 22, COLORS.text, 82, 34);
        this.pageLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.pageLabel.node.setPosition(360, -232, 0);
        createButton(right, '>', 44, 38, COLORS.accent, this.node, 'DlgMembers', 'onNextPageClicked')
            .setPosition(420, -232, 0);
    }

    private createHeaderLabel(parent: Node, text: string, x: number, width: number): void {
        const label = createLabel(parent, text, 20, COLORS.title, width, 34);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.node.setPosition(x, 0, 0);
    }

    private createEditBox(parent: Node, placeholder: string, width: number, height: number): EditBox {
        const node = new Node('SearchInput');
        node.parent = parent;
        node.addComponent(UITransform).setContentSize(width, height);
        fillRoundRect(node, width, height, COLORS.input, 8);

        const textNode = new Node('InputText');
        textNode.parent = node;
        textNode.addComponent(UITransform).setContentSize(width - 24, height - 4);
        textNode.setPosition(0, 0, 0);
        const textLabel = textNode.addComponent(Label);
        textLabel.string = '';
        textLabel.fontSize = 20;
        textLabel.lineHeight = 26;
        textLabel.overflow = Label.Overflow.CLAMP;
        textLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        textLabel.verticalAlign = Label.VerticalAlign.CENTER;
        textLabel.color = COLORS.text;

        const placeholderLabel = createLabel(node, placeholder, 18, COLORS.muted, width - 24, height - 4);
        placeholderLabel.node.setPosition(0, 0, 0);

        const editBox = node.addComponent(EditBox);
        editBox.textLabel = textLabel;
        editBox.placeholderLabel = placeholderLabel;
        editBox.placeholder = placeholder;
        editBox.string = '';
        editBox.maxLength = 32;
        textLabel.string = '';
        placeholderLabel.string = placeholder;
        placeholderLabel.node.active = placeholder.length > 0;
        sanitizeEditBoxDefaultLabels(editBox, [textLabel, placeholderLabel]);
        return editBox;
    }

    private setButtonLabelColor(buttonNode: Node, color: Color): void {
        const label = buttonNode.getChildByName('Label')?.getComponent(Label);
        if (label) label.color = color;
    }

    private bindClick(node: Node, handler: string, customData = ''): void {
        const button = node.getComponent(Button) || node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 1.04;
        const evt = new EventHandler();
        evt.target = this.node;
        evt.component = 'DlgMembers';
        evt.handler = handler;
        evt.customEventData = customData;
        button.clickEvents.push(evt);
    }

    public onCloseClicked(): void {
        this.hideActionMenu();
        this.hideCommissionDialog();
        this.hideRemarkDialog();
        this.hidePlayLimitDialog();
        this.node.active = false;
    }

    public onRefreshClicked(): void {
        this.refreshAll();
    }

    public onPartnerSearchClicked(): void {
        this.selectedPartnerId = '';
        this.loadPartners(true);
    }

    public onMemberSearchClicked(): void {
        this.loadMembers(true);
    }

    public onPrevPageClicked(): void {
        if (this.pageNum <= 1) return;
        this.pageNum -= 1;
        this.loadMembers(false);
    }

    public onNextPageClicked(): void {
        const maxPage = Math.max(1, Math.ceil(this.total / this.pageSize));
        if (this.pageNum >= maxPage) return;
        this.pageNum += 1;
        this.loadMembers(false);
    }

    public onTabClicked(_event: Event, tab: MemberTab): void {
        if (this.currentTab === tab) return;
        this.currentTab = tab;
        this.updateTabs();
        this.loadMembers(true);
    }

    public onPartnerClicked(_event: Event, index: string): void {
        const partner = this.partners[Number(index)];
        if (!partner) return;
        this.currentTab = 'agent';
        this.selectedPartnerId = partner.playerId;
        this.updateTabs();
        this.renderPartners();
        this.loadMembers(true);
    }

    public onSetupClicked(_event: Event, index: string): void {
        const member = this.members[Number(index)];
        if (!member || this.operatingMember) return;
        this.showActionMenu(member);
    }

    public onActionOptionClicked(_event: Event, action: string): void {
        const member = this.activeActionMember;
        if (!member || this.operatingMember) return;
        this.hideActionMenu(false);
        if (action === 'setAgent') {
            this.showCommissionDialog(member);
            return;
        }
        if (action === 'remove') {
            this.confirmMemberAction(member, '确定踢出该成员吗？', '/player/agency/member/remove', '踢出成员成功');
            return;
        }
        if (action === 'demote') {
            this.confirmMemberAction(member, '确定将该合伙人降为普通成员吗？', '/player/agency/member/demote', '已降为普通成员');
            return;
        }
        if (action === 'toggleGame') {
            const banned = member.banned === 1 ? 0 : 1;
            const text = banned === 1 ? '禁用该玩家游戏权限' : '解除该玩家游戏禁用';
            this.confirmMemberAction(
                member,
                `确定${text}吗？`,
                '/player/agency/member/game-status',
                banned === 1 ? '已禁用游戏' : '已解除游戏禁用',
                { banned },
            );
            return;
        }
        if (action === 'remark') {
            this.showRemarkDialog(member);
            return;
        }
        if (action === 'playLimit') {
            this.showPlayLimitDialog(member);
        }
    }

    public onCancelActionMenuClicked(): void {
        this.hideActionMenu();
    }

    public onConfirmCommissionClicked(): void {
        const member = this.activeActionMember;
        if (!member) return;
        const percent = Number(this.commissionInput?.string || '0');
        if (!isFinite(percent) || percent < 0 || percent > 100) {
            Client.Instance.showPromptDialog('分佣比例请输入 0-100 之间的百分比');
            return;
        }
        this.hideCommissionDialog(false);
        this.setMemberAgent(member, Math.round(percent * 100));
    }

    public onCancelCommissionClicked(): void {
        this.hideCommissionDialog();
    }

    public onConfirmRemarkClicked(): void {
        const member = this.activeActionMember;
        if (!member) return;
        const remark = (this.remarkInput?.string || '').trim();
        if (Array.from(remark).length > 10) {
            Client.Instance.showPromptDialog('备注不能超过10个字');
            return;
        }
        this.saveRemark(member, remark);
    }

    public onCancelRemarkClicked(): void {
        this.hideRemarkDialog();
    }

    public onPlayLimitGameClicked(_event: Event, gameTypeRaw: string): void {
        const gameType = Number(gameTypeRaw);
        if (!isFinite(gameType)) return;
        if (this.playLimitGameTypes.has(gameType)) {
            this.playLimitGameTypes.delete(gameType);
        } else {
            this.playLimitGameTypes.add(gameType);
        }
        this.renderPlayLimitOptions();
    }

    public onCancelPlayLimitClicked(): void {
        this.hidePlayLimitDialog();
    }

    public onConfirmPlayLimitClicked(): void {
        const member = this.activeActionMember;
        if (!member) return;
        this.savePlayLimit(member);
    }

    private async setMemberAgent(member: AgencyMember, commissionRateBp: number): Promise<void> {
        if (this.operatingMember) return;
        this.operatingMember = true;
        try {
            const dto = await GameManager.Instance.authPost('/player/agency/member/set-agent', {
                playerId: member.playerId,
                commissionRateBp,
            });
            if (!this.isSuccess(dto)) {
                const msg = dto?.msg || '未知错误';
                Client.Instance.showPromptDialog(msg === '不能设置超过当前被设置的佣金比例' ? msg : '设置合伙人失败：' + msg);
                return;
            }
            Client.Instance.showPromptTip(dto?.alreadyAgent ? '该成员已是合伙人' : '设置合伙人成功', 2.0);
            this.refreshAll();
        } catch (err) {
            const msg = err?.msg || err?.message || String(err);
            Client.Instance.showPromptDialog(msg === '不能设置超过当前被设置的佣金比例' ? msg : '设置合伙人失败：' + msg);
        } finally {
            this.operatingMember = false;
        }
    }

    private confirmMemberAction(
        member: AgencyMember,
        confirmText: string,
        url: string,
        successText: string,
        extra: any = {},
    ): void {
        const name = this.displayName(member);
        Client.Instance.showPromptDialog(`${confirmText}\n${name}（ID:${member.playerId || '-'}）`, () => {
            this.runMemberAction(url, {
                playerId: member.playerId,
                reason: 'Cocos成员管理操作',
                ...extra,
            }, successText);
        });
    }

    private async runMemberAction(url: string, payload: any, successText: string): Promise<void> {
        if (this.operatingMember) return;
        this.operatingMember = true;
        try {
            const dto = await GameManager.Instance.authPost(url, payload);
            if (!this.isSuccess(dto)) {
                Client.Instance.showPromptDialog((dto?.msg || '操作失败'));
                return;
            }
            Client.Instance.showPromptTip(successText, 2.0);
            this.refreshAll();
        } catch (err) {
            const msg = err?.msg || err?.message || String(err);
            Client.Instance.showPromptDialog('操作失败：' + msg);
        } finally {
            this.operatingMember = false;
        }
    }

    private refreshAll(): void {
        this.loadPartners(true);
    }

    private async loadPartners(loadRight = false): Promise<void> {
        if (this.loadingPartners) return;
        this.loadingPartners = true;
        try {
            const dto = await GameManager.Instance.authPost('/player/agency/member/page', {
                pageNum: 1,
                pageSize: 100,
                memberType: 'agent',
                keyword: this.getPartnerKeyword(),
            });
            if (!this.isSuccess(dto)) {
                this.partners = [];
                this.selectedPartnerId = '';
                this.setStatus(dto?.msg || '当前账号暂无代理权限');
                this.renderPartners();
                this.renderMembers();
                return;
            }
            this.partners = dto.records || [];
            if (!this.selectedPartnerId || !this.partners.some((item) => item.playerId === this.selectedPartnerId)) {
                this.selectedPartnerId = this.partners.length > 0 ? this.partners[0].playerId : '';
            }
            this.renderPartners();
            if (loadRight) {
                this.loadMembers(true);
            }
        } catch (err) {
            console.error('[DlgMembers] load partners error:', err);
            this.partners = [];
            this.selectedPartnerId = '';
            this.setStatus('成员数据加载失败');
            this.renderPartners();
            this.renderMembers();
        } finally {
            this.loadingPartners = false;
        }
    }

    private async loadMembers(resetPage: boolean): Promise<void> {
        if (this.loadingMembers) return;
        if (resetPage) {
            this.pageNum = 1;
        }
        this.loadingMembers = true;
        this.setStatus('加载中...');
        this.members = [];
        this.renderMembers();

        const parentPlayerId = this.currentTab === 'agent' ? this.selectedPartnerId : '';
        if (this.currentTab === 'agent' && !parentPlayerId) {
            this.total = 0;
            this.setStatus('暂无数据');
            this.renderMembers();
            this.updatePageLabel();
            this.loadingMembers = false;
            return;
        }

        try {
            const dto = await GameManager.Instance.authPost('/player/agency/member/page', {
                pageNum: this.pageNum,
                pageSize: this.pageSize,
                parentPlayerId,
                memberType: this.currentTab === 'agent' ? 'all' : 'player',
                keyword: this.getMemberKeyword(),
            });
            if (!this.isSuccess(dto)) {
                this.total = 0;
                this.setStatus(dto?.msg || '成员数据加载失败');
                this.renderMembers();
                this.updatePageLabel();
                return;
            }
            this.members = dto.records || [];
            this.total = dto.total || 0;
            const title = this.currentTab === 'agent'
                ? `${this.selectedPartnerName()} 的直邀人员`
                : '当前账号直邀玩家';
            this.setStatus(`${title}：${this.total} 人`);
            this.renderMembers();
            this.updatePageLabel();
        } catch (err) {
            console.error('[DlgMembers] load members error:', err);
            this.total = 0;
            this.setStatus('成员数据加载失败');
            this.renderMembers();
            this.updatePageLabel();
        } finally {
            this.loadingMembers = false;
        }
    }

    private renderPartners(): void {
        if (!this.partnerContent) return;
        this.partnerContent.removeAllChildren();
        const width = 260;
        const itemHeight = 78;
        const gap = 10;

        if (this.partners.length === 0) {
            const empty = createLabel(this.partnerContent, '暂无数据', 22, COLORS.muted, width, 42);
            empty.horizontalAlign = Label.HorizontalAlign.CENTER;
            empty.node.setPosition(0, -30, 0);
            resizeScrollContent(this.partnerContent, 276, 1, itemHeight, gap);
            return;
        }

        this.partners.forEach((partner, index) => {
            const active = partner.playerId === this.selectedPartnerId;
            const item = new Node(`Partner_${index}`);
            item.parent = this.partnerContent;
            item.setPosition(0, -(index * (itemHeight + gap) + itemHeight / 2), 0);
            item.addComponent(UITransform).setContentSize(width, itemHeight);
            fillRoundRect(item, width, itemHeight, active ? COLORS.leftActive : COLORS.leftIdle, 10);

            const name = createLabel(item, this.displayName(partner), 22, COLORS.text, 160, 30);
            name.node.setPosition(-34, 18, 0);

            const id = createLabel(item, `ID:${partner.playerId || '-'}`, 18, COLORS.muted, 178, 26);
            id.node.setPosition(-25, -4, 0);

            const remark = createLabel(item, `备注:${this.remarkText(partner)}`, 16, COLORS.muted, 178, 24);
            remark.node.setPosition(-25, -27, 0);

            const role = createLabel(item, this.roleTitle(partner), 18, COLORS.text, 70, 28);
            role.horizontalAlign = Label.HorizontalAlign.CENTER;
            role.node.setPosition(82, 18, 0);

            const juniors = createLabel(item, `${partner.juniorCount || 0}人`, 18, COLORS.muted, 70, 26);
            juniors.horizontalAlign = Label.HorizontalAlign.CENTER;
            juniors.node.setPosition(82, -14, 0);

            this.bindClick(item, 'onPartnerClicked', String(index));
        });
        resizeScrollContent(this.partnerContent, 276, this.partners.length, itemHeight, gap);
    }

    private renderMembers(): void {
        if (!this.memberContent) return;
        this.memberContent.removeAllChildren();
        const width = 930;
        const itemHeight = 66;
        const gap = 8;

        if (this.members.length === 0) {
            const empty = createLabel(this.memberContent, '暂无数据', 22, COLORS.muted, width, 42);
            empty.horizontalAlign = Label.HorizontalAlign.CENTER;
            empty.node.setPosition(0, -40, 0);
            resizeScrollContent(this.memberContent, 930, 1, itemHeight, gap);
            return;
        }

        this.members.forEach((member, index) => {
            const row = new Node(`Member_${index}`);
            row.parent = this.memberContent;
            row.setPosition(0, -(index * (itemHeight + gap) + itemHeight / 2), 0);
            row.addComponent(UITransform).setContentSize(width, itemHeight);
            fillRoundRect(row, width, itemHeight, index % 2 === 0 ? COLORS.row : COLORS.rowAlt, 8);

            this.createAvatar(row, member, -430, 0);

            const name = createLabel(row, this.displayName(member), 20, COLORS.text, 210, 28);
            name.node.setPosition(-315, 15, 0);
            const id = createLabel(row, `ID:${member.playerId || '-'}`, 18, COLORS.muted, 210, 24);
            id.node.setPosition(-315, -13, 0);

            const remark = createLabel(row, this.remarkText(member), 18, COLORS.muted, 116, 36);
            remark.horizontalAlign = Label.HorizontalAlign.CENTER;
            remark.node.setPosition(-150, 0, 0);

            const role = createLabel(row, this.roleTitle(member), 20, COLORS.text, 86, 36);
            role.horizontalAlign = Label.HorizontalAlign.CENTER;
            role.node.setPosition(-42, 0, 0);

            const superior = createLabel(row, this.superiorText(member), 18, COLORS.muted, 190, 44);
            superior.horizontalAlign = Label.HorizontalAlign.CENTER;
            superior.node.setPosition(130, 0, 0);

            const login = createLabel(row, this.formatTime(member.loginTime), 18, COLORS.text, 140, 46);
            login.horizontalAlign = Label.HorizontalAlign.CENTER;
            login.node.setPosition(310, 0, 0);

            const setup = createButton(
                row,
                '设置',
                80,
                38,
                COLORS.teal,
                this.node,
                'DlgMembers',
                'onSetupClicked',
                String(index),
            );
            setup.setPosition(424, 0, 0);
        });
        resizeScrollContent(this.memberContent, 930, this.members.length, itemHeight, gap);
    }

    private showActionMenu(member: AgencyMember): void {
        this.hideActionMenu(false);
        this.hideCommissionDialog(false);
        this.hideRemarkDialog(false);
        this.hidePlayLimitDialog(false);
        this.activeActionMember = member;
        const options = this.actionOptions(member);
        const menuHeight = 146 + options.length * 46;

        const menu = new Node('MemberActionMenu');
        menu.parent = this.panel;
        menu.addComponent(UITransform).setContentSize(300, menuHeight);
        menu.setPosition(450, 98, 0);
        fillRoundRect(menu, 300, menuHeight, new Color(96, 70, 72, 250), 12);
        this.actionMenu = menu;

        const title = createLabel(menu, this.displayName(member), 22, COLORS.title, 260, 32);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.node.setPosition(0, menuHeight / 2 - 42, 0);

        options.forEach((option, index) => {
            const btn = createButton(menu, option.text, 236, 38, option.color, this.node, 'DlgMembers', 'onActionOptionClicked', option.action);
            btn.setPosition(0, menuHeight / 2 - 88 - index * 46, 0);
        });
        createButton(menu, '取消', 236, 38, COLORS.panelMid, this.node, 'DlgMembers', 'onCancelActionMenuClicked')
            .setPosition(0, -menuHeight / 2 + 36, 0);
        menu.setSiblingIndex(this.panel!.children.length - 1);
    }

    private actionOptions(member: AgencyMember): Array<{ text: string; action: string; color: Color }> {
        const toggleText = member.banned === 1 ? '解禁游戏' : '禁游戏';
        if (member.role === 'agent') {
            return [
                { text: '踢出成员', action: 'remove', color: COLORS.danger },
                { text: '降为成员', action: 'demote', color: COLORS.accent },
                { text: toggleText, action: 'toggleGame', color: COLORS.panelMid },
                { text: '设置备注', action: 'remark', color: COLORS.teal },
                { text: '玩法限制', action: 'playLimit', color: COLORS.panelMid },
            ];
        }
        return [
            { text: '设为合伙人', action: 'setAgent', color: COLORS.accent },
            { text: '踢出成员', action: 'remove', color: COLORS.danger },
            { text: toggleText, action: 'toggleGame', color: COLORS.panelMid },
            { text: '设置备注', action: 'remark', color: COLORS.teal },
            { text: '玩法限制', action: 'playLimit', color: COLORS.panelMid },
        ];
    }

    private hideActionMenu(clearMember = true): void {
        if (this.actionMenu) {
            this.actionMenu.destroy();
            this.actionMenu = null;
        }
        if (clearMember) {
            this.activeActionMember = null;
        }
    }

    private showCommissionDialog(member: AgencyMember): void {
        this.hideCommissionDialog(false);
        this.activeActionMember = member;
        const dialog = new Node('CommissionDialog');
        dialog.parent = this.panel;
        dialog.addComponent(UITransform).setContentSize(360, 210);
        dialog.setPosition(338, 75, 0);
        fillRoundRect(dialog, 360, 210, new Color(96, 70, 72, 252), 12);
        this.commissionDialog = dialog;

        const title = createLabel(dialog, '设置分佣比例', 24, COLORS.title, 280, 34);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.node.setPosition(0, 76, 0);

        const tip = createLabel(dialog, '请输入百分比，最多不能超过上级比例', 18, COLORS.accent, 300, 28);
        tip.horizontalAlign = Label.HorizontalAlign.CENTER;
        tip.node.setPosition(0, 42, 0);

        this.commissionInput = this.createEditBox(dialog, '', 210, 42);
        this.commissionInput.string = this.ratePercentText(member.commissionRateBp);
        this.commissionInput.node.setPosition(0, 0, 0);
        this.scrubEditBoxLabels();

        createButton(dialog, '取消', 110, 38, COLORS.panelMid, this.node, 'DlgMembers', 'onCancelCommissionClicked')
            .setPosition(-68, -68, 0);
        createButton(dialog, '确定', 110, 38, COLORS.teal, this.node, 'DlgMembers', 'onConfirmCommissionClicked')
            .setPosition(68, -68, 0);
        dialog.setSiblingIndex(this.panel!.children.length - 1);
        this.scrubEditBoxLabels();
    }

    private hideCommissionDialog(clearMember = true): void {
        if (this.commissionDialog) {
            this.commissionDialog.destroy();
            this.commissionDialog = null;
            this.commissionInput = null;
        }
        if (clearMember) {
            this.activeActionMember = null;
        }
    }

    private showRemarkDialog(member: AgencyMember): void {
        this.hideRemarkDialog(false);
        this.activeActionMember = member;
        const dialog = new Node('RemarkDialog');
        dialog.parent = this.panel;
        dialog.addComponent(UITransform).setContentSize(400, 230);
        dialog.setPosition(330, 58, 0);
        fillRoundRect(dialog, 400, 230, new Color(96, 70, 72, 252), 12);
        this.remarkDialog = dialog;

        const title = createLabel(dialog, `设置备注：${this.displayName(member)}`, 24, COLORS.title, 330, 34);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.node.setPosition(0, 84, 0);

        const tip = createLabel(dialog, '最多10个字，留空可清除备注', 18, COLORS.accent, 330, 28);
        tip.horizontalAlign = Label.HorizontalAlign.CENTER;
        tip.node.setPosition(0, 48, 0);

        this.remarkInput = this.createEditBox(dialog, '', 240, 42);
        this.remarkInput.maxLength = 10;
        this.remarkInput.string = member.remark || '';
        this.remarkInput.node.setPosition(0, 4, 0);
        this.scrubEditBoxLabels();

        createButton(dialog, '取消', 118, 38, COLORS.panelMid, this.node, 'DlgMembers', 'onCancelRemarkClicked')
            .setPosition(-74, -76, 0);
        createButton(dialog, '保存', 118, 38, COLORS.teal, this.node, 'DlgMembers', 'onConfirmRemarkClicked')
            .setPosition(74, -76, 0);
        dialog.setSiblingIndex(this.panel!.children.length - 1);
        this.scrubEditBoxLabels();
    }

    private async saveRemark(member: AgencyMember, remark: string): Promise<void> {
        if (this.operatingMember) return;
        this.operatingMember = true;
        try {
            const dto = await GameManager.Instance.authPost('/player/agency/member/remark', {
                playerId: member.playerId,
                remark,
            });
            if (!this.isSuccess(dto)) {
                Client.Instance.showPromptDialog(dto?.msg || '备注保存失败');
                return;
            }
            const normalized = dto?.remark || remark;
            this.updateLocalRemark(member.playerId, normalized);
            this.hideRemarkDialog();
            this.renderPartners();
            this.renderMembers();
            Client.Instance.showPromptTip('备注已保存', 2.0);
        } catch (err) {
            const msg = err?.msg || err?.message || String(err);
            Client.Instance.showPromptDialog('备注保存失败：' + msg);
        } finally {
            this.operatingMember = false;
        }
    }

    private hideRemarkDialog(clearMember = true): void {
        if (this.remarkDialog) {
            this.remarkDialog.destroy();
            this.remarkDialog = null;
            this.remarkInput = null;
        }
        if (clearMember) {
            this.activeActionMember = null;
        }
    }

    private async showPlayLimitDialog(member: AgencyMember): Promise<void> {
        this.hidePlayLimitDialog(false);
        this.activeActionMember = member;
        this.playLimitGameTypes = new Set<number>();

        const dialog = new Node('PlayLimitDialog');
        dialog.parent = this.panel;
        dialog.addComponent(UITransform).setContentSize(520, 430);
        dialog.setPosition(260, 4, 0);
        fillRoundRect(dialog, 520, 430, new Color(96, 70, 72, 252), 12);
        this.playLimitDialog = dialog;

        const title = createLabel(dialog, `玩法限制：${this.displayName(member)}`, 24, COLORS.title, 430, 36);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.node.setPosition(0, 180, 0);

        const tip = createLabel(dialog, '选中的玩法将禁止该玩家进入', 18, COLORS.accent, 430, 28);
        tip.horizontalAlign = Label.HorizontalAlign.CENTER;
        tip.node.setPosition(0, 148, 0);

        const scroll = createScrollArea(dialog, 460, 250, 5);
        this.playLimitContent = scroll.content;
        this.renderPlayLimitOptions();

        createButton(dialog, '取消', 120, 40, COLORS.panelMid, this.node, 'DlgMembers', 'onCancelPlayLimitClicked')
            .setPosition(-80, -176, 0);
        createButton(dialog, '保存', 120, 40, COLORS.teal, this.node, 'DlgMembers', 'onConfirmPlayLimitClicked')
            .setPosition(80, -176, 0);
        dialog.setSiblingIndex(this.panel!.children.length - 1);

        try {
            const dto = await GameManager.Instance.authPost('/player/agency/member/play-limit/get', {
                playerId: member.playerId,
            });
            if (this.isSuccess(dto) && Array.isArray(dto.gameTypes)) {
                this.playLimitGameTypes = new Set<number>(dto.gameTypes.map((item: any) => Number(item)).filter((item: number) => isFinite(item)));
                this.renderPlayLimitOptions();
            }
        } catch (err) {
            console.warn('[DlgMembers] load play limit failed:', err);
        }
    }

    private renderPlayLimitOptions(): void {
        if (!this.playLimitContent) return;
        this.playLimitContent.removeAllChildren();
        const games = GameFactory.getAllGames();
        const itemW = 206;
        const itemH = 42;
        const gapX = 18;
        const gapY = 12;
        games.forEach((game, index) => {
            const gameType = Number(game.id);
            const selected = this.playLimitGameTypes.has(gameType);
            const col = index % 2;
            const row = Math.floor(index / 2);
            const node = createButton(
                this.playLimitContent!,
                `${selected ? '禁 ' : '允 '}${game.name}`,
                itemW,
                itemH,
                selected ? COLORS.danger : COLORS.green,
                this.node,
                'DlgMembers',
                'onPlayLimitGameClicked',
                String(gameType),
            );
            node.setPosition(-itemW / 2 - gapX / 2 + col * (itemW + gapX), -(row * (itemH + gapY) + itemH / 2), 0);
        });
        resizeScrollContent(this.playLimitContent, 460, Math.ceil(games.length / 2), itemH, gapY);
    }

    private async savePlayLimit(member: AgencyMember): Promise<void> {
        if (this.operatingMember) return;
        this.operatingMember = true;
        try {
            const dto = await GameManager.Instance.authPost('/player/agency/member/play-limit/update', {
                playerId: member.playerId,
                gameTypes: Array.from(this.playLimitGameTypes),
                reason: 'Cocos玩法限制',
            });
            if (!this.isSuccess(dto)) {
                Client.Instance.showPromptDialog(dto?.msg || '玩法限制保存失败');
                return;
            }
            Client.Instance.showPromptTip('玩法限制已保存', 2.0);
            this.hidePlayLimitDialog();
        } catch (err) {
            const msg = err?.msg || err?.message || String(err);
            Client.Instance.showPromptDialog('玩法限制保存失败：' + msg);
        } finally {
            this.operatingMember = false;
        }
    }

    private hidePlayLimitDialog(clearMember = true): void {
        if (this.playLimitDialog) {
            this.playLimitDialog.destroy();
            this.playLimitDialog = null;
            this.playLimitContent = null;
            this.playLimitGameTypes.clear();
        }
        if (clearMember) {
            this.activeActionMember = null;
        }
    }

    private createAvatar(parent: Node, member: AgencyMember, x: number, y: number): void {
        const avatar = new Node('Avatar');
        avatar.parent = parent;
        avatar.setPosition(x, y, 0);
        avatar.addComponent(UITransform).setContentSize(50, 50);
        fillRoundRect(avatar, 50, 50, member.role === 'agent' ? COLORS.accent : COLORS.green, 8);

        const initial = createLabel(avatar, this.displayName(member).charAt(0) || '员', 22, COLORS.white, 44, 44);
        initial.horizontalAlign = Label.HorizontalAlign.CENTER;
        initial.node.setPosition(0, 0, 0);

        if (!member.avatar) return;
        const sprite = avatar.addComponent(Sprite);
        GameManager.Instance.loadSpriteFrame(member.avatar, (spriteFrame: SpriteFrame) => {
            if (!avatar.isValid || !spriteFrame) return;
            sprite.spriteFrame = spriteFrame;
            initial.node.active = false;
        });
    }

    private updateTabs(): void {
        (['agent', 'player'] as MemberTab[]).forEach((tab) => {
            const node = this.tabNodes[tab];
            if (node) {
                fillRoundRect(node, 170, 46, tab === this.currentTab ? COLORS.leftActive : COLORS.leftIdle, 12);
            }
        });
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

    private getPartnerKeyword(): string {
        return this.partnerInput ? this.partnerInput.string.trim() : '';
    }

    private getMemberKeyword(): string {
        return this.memberInput ? this.memberInput.string.trim() : '';
    }

    private isSuccess(dto: any): boolean {
        return dto?.code === '00000000' || dto?.code === 200 || dto?.code === '200';
    }

    private selectedPartnerName(): string {
        const partner = this.partners.find((item) => item.playerId === this.selectedPartnerId);
        return partner ? this.displayName(partner) : '合伙人';
    }

    private displayName(member: AgencyMember): string {
        return member.nickname || member.account || member.playerId || '-';
    }

    private remarkText(member: AgencyMember): string {
        const remark = (member.remark || '').trim();
        return remark.length > 0 ? remark : '-';
    }

    private roleTitle(member: AgencyMember): string {
        if (member.role === 'agent') {
            const type = member.agentType || member.level || '';
            return type ? `合伙人${type}` : (member.roleText || '代理');
        }
        return member.roleText || '成员';
    }

    private superiorText(member: AgencyMember): string {
        const name = member.superiorNickname || '-';
        const id = member.superiorId || '-';
        return `${name}\n${id}`;
    }

    private updateLocalRemark(playerId: string, remark: string): void {
        const apply = (member: AgencyMember) => {
            if (member.playerId === playerId) {
                member.remark = remark;
            }
        };
        this.partners.forEach(apply);
        this.members.forEach(apply);
    }

    private formatTime(value?: string): string {
        if (!value) return '-';
        const normalized = value.replace('T', ' ');
        if (normalized.length <= 16) return normalized;
        return normalized.substring(0, 16);
    }

    private ratePercentText(rateBp?: number): string {
        const rate = rateBp == null || isNaN(Number(rateBp)) ? 0 : Number(rateBp) / 100;
        return Number.isInteger(rate) ? String(rate) : rate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    }

    private scrubEditBoxLabels(): void {
        sanitizeAllEditBoxDefaultLabels(this.node);
    }
}
