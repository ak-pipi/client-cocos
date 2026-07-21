import { _decorator, Component, Node, Label, Color, Event, UITransform, BlockInputEvents } from 'cc';
import { GameId } from '../../App/GameEnums';
import { GameRoomApi, MahjongRecordItem, getRecordGameName } from '../../Network/GameRoomApi';
import {
    UI_COLORS, createOverlayRoot, createLabel, createButton,
    createScrollArea, fillRoundRect, resizeScrollContent,
} from '../../UI/UiKit';
import { DlgReplayPlayer } from './DlgReplayPlayer';

const { ccclass } = _decorator;

export interface SettlementReplayOptions {
    venueId?: string;
    number?: string;
    roundNo?: number;
    totalRounds?: number;
}

@ccclass('DlgReplayRoundChooser')
export class DlgReplayRoundChooser extends Component {
    private gameId: GameId | string = GameId.TaojiangMahjong;
    private options: SettlementReplayOptions = {};
    private panel: Node | null = null;
    private content: Node | null = null;
    private statusLabel: Label | null = null;
    private titleLabel: Label | null = null;
    private records: MahjongRecordItem[] = [];
    private loading = false;
    private initialized = false;
    private configured = false;

    onLoad(): void {
        this.buildUI();
        this.initialized = true;
        if (this.configured) this.loadRecords();
    }

    public setup(gameId: GameId | string, options: SettlementReplayOptions): void {
        this.gameId = gameId || GameId.TaojiangMahjong;
        this.options = options || {};
        this.configured = true;
        if (this.titleLabel) this.titleLabel.string = `${getRecordGameName(this.gameId)}回放选择`;
        if (this.initialized && this.panel) this.loadRecords();
    }

    public onCloseClicked(): void {
        this.node.destroy();
    }

    public async onRoundClicked(_event: Event, customEventData: string): Promise<void> {
        const recordId = Number(customEventData);
        if (!isFinite(recordId) || recordId <= 0 || this.loading) return;
        const playback = await GameRoomApi.Instance.getGamePlayback(this.gameId, recordId);
        if (!playback || !playback.hasReplay) return;
        const node = new Node('DlgReplayPlayer');
        node.parent = this.node;
        const comp = node.addComponent(DlgReplayPlayer);
        comp.setup(playback);
    }

    private buildUI(): void {
        const root = createOverlayRoot(this.node, 'ReplayRoundChooserRoot');
        root.addComponent(BlockInputEvents);
        this.panel = root.getChildByName('Panel');
        if (!this.panel) return;
        this.titleLabel = createLabel(this.panel, `${getRecordGameName(this.gameId)}回放选择`, 32, UI_COLORS.accent, 360, 46);
        this.titleLabel.node.setPosition(-250, 270, 0);
        this.statusLabel = createLabel(this.panel, '加载中...', 22, UI_COLORS.subText, 760, 36);
        this.statusLabel.node.setPosition(0, 220, 0);
        this.statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        const scroll = createScrollArea(this.panel, 820, 410, -20);
        this.content = scroll.content;
        createButton(this.panel, '关闭', 110, 40, new Color(120, 70, 70, 255), this.node, 'DlgReplayRoundChooser', 'onCloseClicked')
            .setPosition(380, -285, 0);
    }

    private async loadRecords(): Promise<void> {
        if (this.loading || !this.content) return;
        this.loading = true;
        this.content.removeAllChildren();
        if (this.statusLabel) this.statusLabel.string = '加载中...';
        try {
            this.records = await GameRoomApi.Instance.getGameRecordsForRoom(this.gameId, this.options.venueId, this.options.number);
            this.renderRecords();
        } finally {
            this.loading = false;
        }
    }

    private renderRecords(): void {
        if (!this.content || !this.statusLabel) return;
        const playable = this.records.filter((r) => r.hasReplay !== false);
        if (playable.length === 0) {
            this.statusLabel.string = '暂无可回放局';
            resizeScrollContent(this.content, 820, 0, 76, 10);
            return;
        }
        this.statusLabel.string = `可选择 ${playable.length} 局回放`;
        const itemHeight = 76;
        const gap = 10;
        const width = 790;
        playable.forEach((record, index) => {
            const row = new Node(`Round_${record.roundNo || index}`);
            row.parent = this.content;
            row.addComponent(UITransform).setContentSize(width, itemHeight);
            row.setPosition(0, -(index * (itemHeight + gap) + itemHeight / 2), 0);
            fillRoundRect(row, width, itemHeight, UI_COLORS.card, 8);

            const isCurrent = Number(record.roundNo) === Number(this.options.roundNo || 0);
            const title = createLabel(row, `${isCurrent ? '当前局  ' : ''}第 ${record.roundNo || '-'} 局`, 24, isCurrent ? UI_COLORS.accent : UI_COLORS.text, 220, 32);
            title.node.setPosition(-260, 13, 0);
            const detail = createLabel(row, `${record.time || ''}  房间 ${record.number || '-'}`, 19, UI_COLORS.subText, 380, 28);
            detail.node.setPosition(-110, -18, 0);
            detail.horizontalAlign = Label.HorizontalAlign.CENTER;
            createButton(row, '回放', 90, 38, UI_COLORS.success, this.node, 'DlgReplayRoundChooser', 'onRoundClicked', String(record.id))
                .setPosition(320, -1, 0);
        });
        resizeScrollContent(this.content, width, playable.length, itemHeight, gap);
    }
}
