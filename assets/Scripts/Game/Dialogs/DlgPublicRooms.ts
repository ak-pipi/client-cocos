import { _decorator, Component, Node, Label, UITransform, Color } from 'cc';
import { Client } from '../Client';
import { GameRoomApi, PublicRoomItem } from '../../Network/GameRoomApi';
import { GameType } from '../../Common/ConstDefines';
import {
    UI_COLORS, createOverlayRoot, createLabel, createButton,
    createScrollArea, fillRoundRect, resizeScrollContent,
} from '../../UI/UiKit';

const { ccclass } = _decorator;

type PublicTab = 'biji' | 'niu100';

const TAB_CONFIG: Record<PublicTab, { title: string; gameType: number }> = {
    biji: { title: '六安比鸡', gameType: GameType.LiuAnBiJi },
    niu100: { title: '百人牛牛', gameType: GameType.NiuNiu100 },
};

@ccclass('DlgPublicRooms')
export class DlgPublicRooms extends Component {
    private panel: Node | null = null;
    private listContent: Node | null = null;
    private statusLabel: Label | null = null;
    private tabLabels: Record<PublicTab, Label | null> = { biji: null, niu100: null };

    private currentTab: PublicTab = 'biji';
    private rooms: PublicRoomItem[] = [];
    private loading = false;

    onLoad() {
        this.buildUI();
    }

    onEnable() {
        this.switchTab(this.currentTab || 'biji');
    }

    private buildUI(): void {
        const root = createOverlayRoot(this.node, 'PublicRoomsRoot');
        this.panel = root.getChildByName('Panel');

        createLabel(this.panel, '公开房', 34, UI_COLORS.accent, 300, 48)
            .node.setPosition(0, 270, 0);

        this.statusLabel = createLabel(this.panel, '加载中...', 22, UI_COLORS.subText, 800, 36);
        this.statusLabel.node.setPosition(0, 220, 0);
        this.statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

        this.createTabs();
        const scroll = createScrollArea(this.panel, 860, 430, -20);
        this.listContent = scroll.content;

        createButton(this.panel, '刷新', 100, 40, UI_COLORS.primary, this.node, 'DlgPublicRooms', 'onRefreshClicked')
            .setPosition(-380, -285, 0);
        createButton(this.panel, '关闭', 100, 40, new Color(120, 70, 70, 255), this.node, 'DlgPublicRooms', 'onCloseClicked')
            .setPosition(380, -285, 0);
    }

    private createTabs(): void {
        const tabs: PublicTab[] = ['biji', 'niu100'];
        const startX = -110;
        tabs.forEach((tab, index) => {
            const tabNode = new Node(`Tab_${tab}`);
            tabNode.parent = this.panel;
            tabNode.setPosition(startX + index * 220, 170, 0);
            tabNode.addComponent(UITransform).setContentSize(200, 44);
            fillRoundRect(tabNode, 200, 44, UI_COLORS.tabIdle, 10);

            const label = createLabel(tabNode, TAB_CONFIG[tab].title, 24, UI_COLORS.text, 180, 40);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.node.setPosition(0, 0, 0);
            this.tabLabels[tab] = label;

            createButton(tabNode, '', 200, 44, new Color(0, 0, 0, 0), this.node, 'DlgPublicRooms', 'onTabClicked', tab)
                .setPosition(0, 0, 0);
        });
    }

    public onTabClicked(_event: Event, tab: PublicTab): void {
        this.switchTab(tab);
    }

    public onRefreshClicked(): void {
        this.loadRooms(this.currentTab);
    }

    public onCloseClicked(): void {
        this.node.active = false;
    }

    public onJoinClicked(_event: Event, index: string): void {
        const room = this.rooms[Number(index)];
        if (!room) return;

        GameRoomApi.Instance.joinByVenueId(room.venueId, room.gameType).then((result) => {
            if (!result) return;
            GameRoomApi.Instance.enterVenue(result, room.gameType, () => {
                Client.Instance.showPromptTip(`已进入房间 ${room.number}`);
                this.onCloseClicked();
            });
        });
    }

    private switchTab(tab: PublicTab): void {
        this.currentTab = tab;
        (['biji', 'niu100'] as PublicTab[]).forEach((key) => {
            const tabNode = this.panel.getChildByName(`Tab_${key}`);
            if (tabNode) {
                fillRoundRect(tabNode, 200, 44, key === tab ? UI_COLORS.tabActive : UI_COLORS.tabIdle, 10);
            }
        });
        this.loadRooms(tab);
    }

    private async loadRooms(tab: PublicTab): Promise<void> {
        if (this.loading) return;
        this.loading = true;
        if (this.statusLabel) {
            this.statusLabel.string = '加载中...';
        }
        this.clearList();

        try {
            this.rooms = tab === 'biji'
                ? await GameRoomApi.Instance.getBiJiPublicRooms()
                : await GameRoomApi.Instance.getNiu100PublicRooms();
            this.renderRooms();
        } catch (err) {
            console.error('[DlgPublicRooms] load error:', err);
            if (this.statusLabel) this.statusLabel.string = '加载失败，请重试';
        } finally {
            this.loading = false;
        }
    }

    private clearList(): void {
        if (!this.listContent) return;
        this.listContent.removeAllChildren();
    }

    private renderRooms(): void {
        if (!this.listContent || !this.statusLabel) return;

        if (this.rooms.length === 0) {
            this.statusLabel.string = '暂无数据';
            resizeScrollContent(this.listContent, 860, 0, 96, 12);
            return;
        }

        this.statusLabel.string = `共 ${this.rooms.length} 间公开房`;
        const itemHeight = 96;
        const gap = 12;
        const width = 840;

        this.rooms.forEach((room, index) => {
            const card = new Node(`Room_${index}`);
            card.parent = this.listContent;
            card.setPosition(0, -(index * (itemHeight + gap) + itemHeight / 2), 0);
            card.addComponent(UITransform).setContentSize(width, itemHeight);
            fillRoundRect(card, width, itemHeight, UI_COLORS.card, 12);

            const title = createLabel(card, `${room.gameName || TAB_CONFIG[this.currentTab].title} · 房间 ${room.number}`, 26, UI_COLORS.accent, 260, 34);
            title.node.setPosition(-300, 22, 0);

            const owner = createLabel(card, `房主: ${room.ownerName || '未知'}`, 22, UI_COLORS.text, 260, 30);
            owner.node.setPosition(-80, 22, 0);

            const players = `${room.playerCount ?? 0}/${room.maxPlayerNums ?? '-'}`;
            const playerLabel = createLabel(card, `人数 ${players}`, 22, UI_COLORS.success, 120, 30);
            playerLabel.node.setPosition(300, 22, 0);
            playerLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;

            const modeText = room.gameModeText || `${room.mode ?? 0}局 · 底注 ${room.diZhu ?? 0}`;
            const typeText = room.gameTypeText ? `${room.gameTypeText} · ` : '';
            const detail = `${typeText}${modeText}  ·  押金 ${room.deposit ?? 0}`;
            const detailLabel = createLabel(card, detail, 20, UI_COLORS.subText, 520, 28);
            detailLabel.node.setPosition(-220, -18, 0);

            createButton(card, '加入', 96, 40, UI_COLORS.success, this.node, 'DlgPublicRooms', 'onJoinClicked', String(index))
                .setPosition(330, -18, 0);
        });

        resizeScrollContent(this.listContent, width, this.rooms.length, itemHeight, gap);
    }
}
