import { _decorator, Button, Color, Component, EditBox, Event, EventHandler, Label, Node, UITransform } from 'cc';
import { GameId } from '../../App/GameEnums';
import { GameManager } from '../../Manager/GameManager';
import { ALL_RECORD_GAME_ID, GameRoomApi, MahjongRecordItem, getRecordGameName, getSupportedRecordGames } from '../../Network/GameRoomApi';
import {
    createButton,
    createLabel,
    createOverlayRoot,
    createScrollArea,
    fillRoundRect,
    resizeScrollContent,
    sanitizeAllEditBoxDefaultLabels,
    sanitizeEditBoxDefaultLabels,
} from '../../UI/UiKit';
import { Client } from '../Client';
import { ReplayDialogManager } from './ReplayDialogManager';

const { ccclass } = _decorator;

const PAGE_SIZE = 7;
const SNAPSHOT_LIMIT = 1000;
const PANEL_W = 1540;
const PANEL_H = 760;
const TABLE_W = 1460;
const ROW_H = 54;
const ROW_GAP = 6;
const RECORD_RANGE_DAYS = 3;

const COLORS = {
    overlay: new Color(0, 0, 0, 150),
    panel: new Color(117, 75, 58, 248),
    titleBand: new Color(222, 159, 82, 255),
    titleBandDark: new Color(191, 111, 48, 255),
    controlBand: new Color(177, 135, 108, 250),
    header: new Color(91, 54, 45, 255),
    row: new Color(119, 78, 62, 252),
    rowAlt: new Color(107, 68, 54, 252),
    input: new Color(88, 57, 48, 245),
    inputText: new Color(255, 245, 223, 255),
    muted: new Color(190, 158, 138, 255),
    text: new Color(255, 238, 206, 255),
    white: new Color(255, 255, 255, 255),
    accent: new Color(255, 214, 80, 255),
    danger: new Color(172, 70, 64, 255),
    blue: new Color(65, 143, 198, 255),
    teal: new Color(34, 178, 154, 255),
    green: new Color(68, 198, 102, 255),
    gray: new Color(116, 103, 92, 255),
    negative: new Color(255, 140, 140, 255),
};

@ccclass('DlgMahjongRecords')
export class DlgMahjongRecords extends Component {
    private panel: Node | null = null;
    private titleLabel: Label | null = null;
    private totalScoreLabel: Label | null = null;
    private totalRoundsLabel: Label | null = null;
    private listContent: Node | null = null;
    private statusLabel: Label | null = null;
    private pageLabel: Label | null = null;
    private dateLabel: Label | null = null;
    private tabRoot: Node | null = null;
    private roomInput: EditBox | null = null;
    private playerInput: EditBox | null = null;
    private replayInput: EditBox | null = null;
    private ownToggleNode: Node | null = null;
    private ownCheckLabel: Label | null = null;
    private gameTabNodes: Map<string, Node> = new Map<string, Node>();

    private gameId: GameId | string = GameId.TaojiangMahjong;
    private gameName = '桃江麻将';
    private allowGameSwitch = false;
    private pageNum = 1;
    private total = 0;
    private totalScore = 0;
    private records: MahjongRecordItem[] = [];
    private snapshotRecords: MahjongRecordItem[] = [];
    private filteredRecords: MahjongRecordItem[] = [];
    private loading = false;
    private ownOnly = true;
    private selectedStartDate = this.formatDate(this.addDays(new Date(), -RECORD_RANGE_DAYS));
    private selectedEndDate = this.formatDate(new Date());

    onLoad() {
        this.buildUI();
    }

    onEnable() {
        this.resetDefaultDateRange();
        this.loadPage(1, true);
        this.scrubEditBoxLabels();
    }

    public setup(gameId: GameId | string, allowGameSwitch = false): void {
        this.allowGameSwitch = allowGameSwitch;
        this.gameId = allowGameSwitch ? ALL_RECORD_GAME_ID : (gameId || GameId.TaojiangMahjong);
        this.gameName = getRecordGameName(this.gameId);
        this.pageNum = 1;
        this.records = [];
        this.snapshotRecords = [];
        this.filteredRecords = [];
        this.total = 0;
        this.totalScore = 0;
        if (this.titleLabel) {
            this.titleLabel.string = this.titleText();
        }
        this.updateSummaryLabels();
        this.updateGameTabs();
    }

    private buildUI(): void {
        const root = createOverlayRoot(this.node, 'MahjongRecordsRoot');
        const mask = root.getChildByName('Mask');
        if (mask) fillRoundRect(mask, 1920, 1080, COLORS.overlay, 0);
        this.panel = root.getChildByName('Panel');
        this.panel!.getComponent(UITransform)!.setContentSize(PANEL_W, PANEL_H);
        fillRoundRect(this.panel!, PANEL_W, PANEL_H, COLORS.panel, 14);

        this.createTitleBand();
        this.createGameTabs();
        this.createQueryBar();
        this.createTableHeader();

        const scroll = createScrollArea(this.panel!, TABLE_W, 410, -78);
        this.listContent = scroll.content;

        this.statusLabel = createLabel(this.panel!, '加载中...', 26, COLORS.white, 500, 46);
        this.statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.statusLabel.node.setPosition(0, -78, 0);

        createButton(this.panel!, '<', 48, 44, COLORS.accent, this.node, 'DlgMahjongRecords', 'onPrevPage')
            .setPosition(-94, -344, 0);
        this.pageLabel = createLabel(this.panel!, '1/1', 24, COLORS.white, 86, 40);
        this.pageLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.pageLabel.node.setPosition(0, -344, 0);
        createButton(this.panel!, '>', 48, 44, COLORS.accent, this.node, 'DlgMahjongRecords', 'onNextPage')
            .setPosition(94, -344, 0);

        this.updateSummaryLabels();
        this.updateGameTabs();
        this.updateOwnToggle();
        this.scrubEditBoxLabels();
    }

    private createTitleBand(): void {
        const band = new Node('TitleBand');
        band.parent = this.panel!;
        band.addComponent(UITransform).setContentSize(PANEL_W, 72);
        band.setPosition(0, 344, 0);
        fillRoundRect(band, PANEL_W, 72, COLORS.titleBand, 8);

        const titleBg = new Node('TitleBg');
        titleBg.parent = band;
        titleBg.addComponent(UITransform).setContentSize(360, 66);
        titleBg.setPosition(0, 0, 0);
        fillRoundRect(titleBg, 360, 66, COLORS.titleBandDark, 30);

        const family = createLabel(band, `亲友圈ID:${GameManager.Instance.PlayerId || '-'}`, 24, COLORS.white, 310, 38);
        family.node.setPosition(-612, 0, 0);

        this.totalScoreLabel = createLabel(band, '总分:0', 26, COLORS.danger, 170, 40);
        this.totalScoreLabel.node.setPosition(-382, 0, 0);

        this.totalRoundsLabel = createLabel(band, '共 0 局', 30, COLORS.danger, 150, 44);
        this.totalRoundsLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.totalRoundsLabel.node.setPosition(-230, 0, 0);

        this.titleLabel = createLabel(titleBg, this.titleText(), 34, COLORS.white, 320, 56);
        this.titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.titleLabel.node.setPosition(0, 0, 0);

        this.replayInput = this.createEditBox(band, '输入回放码', 250, 46, true);
        this.replayInput.node.setPosition(476, 0, 0);
        createButton(band, '查看', 116, 48, COLORS.blue, this.node, 'DlgMahjongRecords', 'onReplayCodeSearchClicked')
            .setPosition(280, 0, 0);
        createButton(band, 'X', 54, 54, COLORS.danger, this.node, 'DlgMahjongRecords', 'onCloseClicked')
            .setPosition(718, 0, 0);
    }

    private createGameTabs(): void {
        if (!this.panel) return;
        const games = getSupportedRecordGames(true);
        const totalWidth = games.length * 112 + Math.max(0, games.length - 1) * 10;
        let x = -totalWidth / 2 + 56;
        this.tabRoot = new Node('RecordGameTabs');
        this.tabRoot.parent = this.panel;
        this.tabRoot.addComponent(UITransform).setContentSize(totalWidth, 38);
        this.tabRoot.setPosition(0, 288, 0);
        this.gameTabNodes.clear();
        games.forEach((game) => {
            const node = createButton(
                this.tabRoot!,
                game.name,
                112,
                36,
                COLORS.input,
                this.node,
                'DlgMahjongRecords',
                'onGameTabClicked',
                String(game.gameId),
            );
            node.setPosition(x, 0, 0);
            this.gameTabNodes.set(String(game.gameId), node);
            x += 122;
        });
    }

    private createQueryBar(): void {
        const bar = new Node('QueryBar');
        bar.parent = this.panel!;
        bar.addComponent(UITransform).setContentSize(PANEL_W, 66);
        bar.setPosition(0, 232, 0);
        fillRoundRect(bar, PANEL_W, 66, COLORS.controlBand, 2);

        this.roomInput = this.createEditBox(bar, '输入房号', 250, 46, true);
        this.roomInput.node.setPosition(-575, 0, 0);

        this.playerInput = this.createEditBox(bar, '输入玩家ID', 250, 46, true);
        this.playerInput.node.setPosition(-300, 0, 0);

        this.ownToggleNode = new Node('OwnToggle');
        this.ownToggleNode.parent = bar;
        this.ownToggleNode.addComponent(UITransform).setContentSize(120, 48);
        this.ownToggleNode.setPosition(-74, 0, 0);
        const box = new Node('CheckBox');
        box.parent = this.ownToggleNode;
        box.addComponent(UITransform).setContentSize(42, 42);
        box.setPosition(-34, 0, 0);
        fillRoundRect(box, 42, 42, COLORS.input, 6);
        this.ownCheckLabel = createLabel(box, '√', 32, COLORS.green, 38, 38);
        this.ownCheckLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.ownCheckLabel.node.setPosition(0, 2, 0);
        const ownText = createLabel(this.ownToggleNode, '自己', 24, COLORS.danger, 64, 40);
        ownText.node.setPosition(28, 0, 0);
        this.bindButton(this.ownToggleNode, 'onOwnToggleClicked');

        createButton(bar, '<', 48, 48, COLORS.accent, this.node, 'DlgMahjongRecords', 'onPrevDateClicked')
            .setPosition(90, 0, 0);
        const dateNode = new Node('DateRange');
        dateNode.parent = bar;
        dateNode.addComponent(UITransform).setContentSize(340, 48);
        dateNode.setPosition(292, 0, 0);
        fillRoundRect(dateNode, 340, 48, new Color(197, 176, 139, 255), 22);
        this.dateLabel = createLabel(dateNode, this.dateText(), 26, COLORS.white, 320, 42);
        this.dateLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.dateLabel.node.setPosition(0, 0, 0);
        createButton(bar, '>', 48, 48, COLORS.accent, this.node, 'DlgMahjongRecords', 'onNextDateClicked')
            .setPosition(494, 0, 0);
        createButton(bar, '查询', 112, 46, COLORS.blue, this.node, 'DlgMahjongRecords', 'onSearchClicked')
            .setPosition(622, 0, 0);
    }

    private createTableHeader(): void {
        const header = new Node('TableHeader');
        header.parent = this.panel!;
        header.addComponent(UITransform).setContentSize(TABLE_W, 48);
        header.setPosition(0, 166, 0);
        fillRoundRect(header, TABLE_W, 48, COLORS.header, 2);
        [
            { text: '序号', x: -678, w: 70 },
            { text: '时间', x: -565, w: 170 },
            { text: '房号', x: -426, w: 106 },
            { text: '玩法/包厢', x: -278, w: 170 },
            { text: '解散状态', x: -118, w: 116 },
            { text: '成员', x: 105, w: 300 },
            { text: '积分', x: 356, w: 110 },
            { text: '比赛分', x: 478, w: 112 },
            { text: '回放', x: 635, w: 110 },
        ].forEach((item) => this.tableLabel(header, item.text, item.x, item.w, 22, COLORS.muted));
    }

    public onPrevPage(): void {
        if (this.pageNum <= 1 || this.loading) return;
        this.showPage(this.pageNum - 1);
    }

    public onNextPage(): void {
        const maxPage = Math.max(1, Math.ceil(this.total / PAGE_SIZE));
        if (this.pageNum >= maxPage || this.loading) return;
        this.showPage(this.pageNum + 1);
    }

    public onPrevDateClicked(): void {
        this.shiftDate(-1);
    }

    public onNextDateClicked(): void {
        this.shiftDate(1);
    }

    public onSearchClicked(): void {
        this.loadPage(1, true);
    }

    public onOwnToggleClicked(): void {
        this.ownOnly = !this.ownOnly;
        this.updateOwnToggle();
        this.loadPage(1, true);
    }

    public onCloseClicked(): void {
        this.node.active = false;
    }

    public onGameTabClicked(_event: Event, customEventData: string): void {
        if (!customEventData || customEventData === String(this.gameId) || this.loading) return;
        this.gameId = customEventData;
        this.gameName = getRecordGameName(this.gameId);
        this.pageNum = 1;
        this.total = 0;
        this.totalScore = 0;
        this.records = [];
        this.snapshotRecords = [];
        this.filteredRecords = [];
        if (this.titleLabel) this.titleLabel.string = this.titleText();
        this.updateSummaryLabels();
        this.updateGameTabs();
        this.loadPage(1, true);
    }

    public async onReplayCodeSearchClicked(): Promise<void> {
        const raw = (this.replayInput?.string || '').trim();
        const recordId = Number(raw);
        if (!isFinite(recordId) || recordId <= 0) {
            Client.Instance.showPromptDialog('请输入正确的回放码');
            return;
        }
        const candidates = this.snapshotRecords.filter((record) => Number(record.id) === recordId);
        if (candidates.length === 0 && this.snapshotRecords.length === 0) {
            await this.loadPage(1, true);
        }
        const record = (candidates[0] || this.snapshotRecords.find((item) => Number(item.id) === recordId)) as MahjongRecordItem | undefined;
        if (!record && this.gameId === ALL_RECORD_GAME_ID) {
            Client.Instance.showPromptDialog('全部战绩下请先查询到对应记录后再输入回放码，或直接点击列表中的查看');
            return;
        }
        await this.openReplay(record?.gameId || this.gameId, recordId);
    }

    public async onReplayClicked(_event: Event, customEventData: string): Promise<void> {
        const { gameId, recordId } = this.parseReplayEventData(customEventData);
        if (!isFinite(recordId) || recordId <= 0) return;
        await this.openReplay(gameId, recordId);
    }

    private async openReplay(gameId: GameId | string, recordId: number): Promise<void> {
        if (this.loading) return;
        this.loading = true;
        if (this.statusLabel) this.statusLabel.string = '加载回放中...';
        try {
            const playback = await GameRoomApi.Instance.getGamePlayback(gameId, recordId);
            if (!playback || !playback.hasReplay) {
                if (this.statusLabel) this.statusLabel.string = '回放已超过追溯期';
                return;
            }
            ReplayDialogManager.openPlayback(this.node, playback);
            const size = playback.rawSize || playback.compressedSize || playback.base64?.length || 0;
            const sizeText = size > 0 ? `${Math.ceil(size / 1024)}KB` : '-';
            const actionText = playback.actionCount != null ? `，${playback.actionCount}步` : '';
            const playerText = playback.playerCount != null ? `，${playback.playerCount}人` : '';
            const traceText = this.buildTraceText(playback);
            if (this.statusLabel) this.statusLabel.string = `回放已加载（${sizeText}${actionText}${playerText}${traceText}）`;
        } catch (err) {
            console.error('[DlgMahjongRecords] replay load error:', err);
            if (this.statusLabel) this.statusLabel.string = '加载回放失败';
        } finally {
            this.loading = false;
        }
    }

    private async loadPage(pageNum: number, refresh: boolean): Promise<void> {
        if (this.loading) return;
        this.loading = true;
        if (this.statusLabel) this.statusLabel.string = '加载中...';
        this.clearList();

        try {
            if (refresh || this.snapshotRecords.length === 0) {
                this.snapshotRecords = await GameRoomApi.Instance.getGameRecordSnapshot(this.gameId, SNAPSHOT_LIMIT, 100);
                this.applyFilters();
            }
            this.showPage(pageNum);
        } catch (err) {
            console.error('[DlgMahjongRecords] load error:', err);
            this.records = [];
            this.filteredRecords = [];
            this.total = 0;
            this.totalScore = 0;
            if (this.statusLabel) this.statusLabel.string = '加载失败，请重试';
            this.renderRecords();
        } finally {
            this.loading = false;
        }
    }

    private applyFilters(): void {
        const roomKeyword = (this.roomInput?.string || '').trim();
        const playerKeyword = (this.playerInput?.string || '').trim();
        this.filteredRecords = this.snapshotRecords.filter((record) => {
            if (!this.matchDate(record)) return false;
            if (this.ownOnly && !this.hasCurrentPlayer(record)) return false;
            if (roomKeyword && !this.matchRoom(record, roomKeyword)) return false;
            if (playerKeyword && !this.matchPlayer(record, playerKeyword)) return false;
            return true;
        });
        this.total = this.filteredRecords.length;
        this.totalScore = this.filteredRecords.reduce((sum, record) => sum + this.getMyResult(record).gold, 0);
        this.updateSummaryLabels();
    }

    private showPage(pageNum: number): void {
        const maxPage = Math.max(1, Math.ceil(this.total / PAGE_SIZE));
        this.pageNum = Math.min(Math.max(1, pageNum), maxPage);
        const start = (this.pageNum - 1) * PAGE_SIZE;
        this.records = this.filteredRecords.slice(start, start + PAGE_SIZE);
        this.renderRecords();
    }

    private clearList(): void {
        if (!this.listContent) return;
        this.listContent.removeAllChildren();
    }

    private updateGameTabs(): void {
        if (this.tabRoot) {
            this.tabRoot.active = this.allowGameSwitch;
        }
        this.gameTabNodes.forEach((node, gameId) => {
            const active = gameId === String(this.gameId);
            fillRoundRect(node, 112, 36, active ? COLORS.accent : COLORS.input, 8);
            const label = node.getChildByName('Label')?.getComponent(Label);
            if (label) {
                label.color = active ? COLORS.header : COLORS.text;
            }
        });
    }

    private updateOwnToggle(): void {
        if (this.ownCheckLabel) {
            this.ownCheckLabel.string = this.ownOnly ? '√' : '';
        }
        if (this.ownToggleNode) {
            const box = this.ownToggleNode.getChildByName('CheckBox');
            if (box) fillRoundRect(box, 42, 42, this.ownOnly ? new Color(255, 236, 176, 255) : COLORS.input, 6);
        }
    }

    private updateSummaryLabels(): void {
        if (this.totalScoreLabel) this.totalScoreLabel.string = `总分:${this.formatScore(this.totalScore)}`;
        if (this.totalRoundsLabel) this.totalRoundsLabel.string = `共 ${this.total} 局`;
    }

    private getMyResult(record: MahjongRecordItem): { score: number; gold: number; nickname: string } {
        const playerId = String(GameManager.Instance.PlayerId || '');
        const players = record.players || [];
        const index = players.findIndex((p) => !!p && String(p.playerId || '') === playerId);
        if (index < 0) {
            return { score: 0, gold: 0, nickname: GameManager.Instance.NickName || '我' };
        }
        return {
            score: this.scaleRecordValue(record, record.scores?.[index] ?? 0),
            gold: this.scaleRecordValue(record, Number(record.winGolds?.[index] ?? 0)),
            nickname: players[index]?.nickname || '我',
        };
    }

    private scaleRecordValue(record: MahjongRecordItem, value: number): number {
        return (Number(value) || 0) / this.getRecordScoreScale(record);
    }

    private getRecordScoreScale(record: MahjongRecordItem): number {
        const isPaodekuai = record.gameId === GameId.Paodekuai ||
            Number(record.gameType) === 1033 ||
            record.gameName === '跑得快';
        if (!isPaodekuai) return 1;
        const scale = Number(record.scoreScale || 1);
        return isFinite(scale) && scale > 0 ? scale : 1;
    }

    private hasCurrentPlayer(record: MahjongRecordItem): boolean {
        const playerId = String(GameManager.Instance.PlayerId || '');
        if (!playerId) return true;
        return (record.players || []).some((p) => !!p && String(p.playerId || '') === playerId);
    }

    private matchRoom(record: MahjongRecordItem, keyword: string): boolean {
        const text = keyword.toLowerCase();
        return String(record.number || '').toLowerCase().includes(text)
            || String(record.venueId || '').toLowerCase().includes(text)
            || String(record.id || '').toLowerCase().includes(text);
    }

    private matchPlayer(record: MahjongRecordItem, keyword: string): boolean {
        const text = keyword.toLowerCase();
        return (record.players || []).some((player) => {
            if (!player) return false;
            return String(player.playerId || '').toLowerCase().includes(text)
                || String(player.nickname || '').toLowerCase().includes(text);
        });
    }

    private matchDate(record: MahjongRecordItem): boolean {
        const date = this.parseRecordDate(record.time);
        if (!date) return false;
        const start = this.startOfDay(this.parseDate(this.selectedStartDate)).getTime();
        const end = this.addDays(this.startOfDay(this.parseDate(this.selectedEndDate)), 1).getTime();
        const time = date.getTime();
        return time >= start && time < end;
    }

    private formatPlayers(record: MahjongRecordItem): string {
        const players = record.players || [];
        if (players.length === 0) return '-';
        return players.map((p) => p ? `${p.nickname || '-'}(${p.playerId || '-'})` : '-').join(' / ');
    }

    private renderRecords(): void {
        if (!this.listContent || !this.statusLabel || !this.pageLabel) return;

        const maxPage = Math.max(1, Math.ceil(this.total / PAGE_SIZE));
        this.pageLabel.string = `${this.pageNum}/${maxPage}`;

        if (this.records.length === 0) {
            this.statusLabel.string = '';
            this.clearList();
            const empty = createLabel(this.listContent, '暂无数据', 42, COLORS.white, 500, 70);
            empty.horizontalAlign = Label.HorizontalAlign.CENTER;
            empty.node.setPosition(0, -155, 0);
            resizeScrollContent(this.listContent, TABLE_W, 1, ROW_H, ROW_GAP);
            return;
        }

        this.statusLabel.string = '';
        this.clearList();
        this.records.forEach((record, index) => {
            const mine = this.getMyResult(record);
            const rowIndex = (this.pageNum - 1) * PAGE_SIZE + index + 1;
            const scoreColor = mine.gold >= 0 ? COLORS.green : COLORS.negative;

            const row = new Node(`Record_${index}`);
            row.parent = this.listContent!;
            row.setPosition(0, -(index * (ROW_H + ROW_GAP) + ROW_H / 2), 0);
            row.addComponent(UITransform).setContentSize(TABLE_W - 18, ROW_H);
            fillRoundRect(row, TABLE_W - 18, ROW_H, index % 2 === 0 ? COLORS.row : COLORS.rowAlt, 6);

            this.tableLabel(row, String(rowIndex), -678, 70, 19);
            this.tableLabel(row, this.formatShortTime(record.time), -565, 170, 18);
            this.tableLabel(row, record.number || '-', -426, 106, 18);
            this.tableLabel(row, this.formatMode(record), -278, 170, 18);
            this.tableLabel(row, record.hasReplay === false ? '无回放' : '正常', -118, 116, 18, record.hasReplay === false ? COLORS.muted : COLORS.text);
            this.tableLabel(row, this.formatPlayers(record), 105, 300, 16);
            this.tableLabel(row, this.formatScore(mine.score), 356, 110, 20, mine.score >= 0 ? COLORS.green : COLORS.negative);
            this.tableLabel(row, this.formatScore(mine.gold), 478, 112, 20, scoreColor);

            const replayGameId = record.gameId || this.gameId;
            const replayText = record.hasReplay === false ? '过期' : '查看';
            const replay = createButton(row, replayText, 82, 34, record.hasReplay === false ? COLORS.gray : COLORS.blue, this.node, 'DlgMahjongRecords', 'onReplayClicked', `${replayGameId}:${record.id}`);
            replay.setPosition(635, 0, 0);
            const button = replay.getComponent(Button);
            if (button) button.interactable = record.hasReplay !== false;
        });

        resizeScrollContent(this.listContent, TABLE_W, this.records.length, ROW_H, ROW_GAP);
    }

    private createEditBox(parent: Node, placeholderText: string, width: number, height: number, numeric = false): EditBox {
        const node = new Node('Input');
        node.parent = parent;
        node.addComponent(UITransform).setContentSize(width, height);
        fillRoundRect(node, width, height, COLORS.input, 8);

        const textNode = new Node('InputText');
        textNode.parent = node;
        textNode.addComponent(UITransform).setContentSize(width - 24, height - 6);
        textNode.setPosition(0, 0, 0);
        const textLabel = textNode.addComponent(Label);
        textLabel.string = '';
        textLabel.fontSize = 22;
        textLabel.lineHeight = 28;
        textLabel.color = COLORS.inputText;
        textLabel.overflow = Label.Overflow.CLAMP;
        textLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        textLabel.verticalAlign = Label.VerticalAlign.CENTER;

        const placeholderNode = new Node('Placeholder');
        placeholderNode.parent = node;
        placeholderNode.addComponent(UITransform).setContentSize(width - 24, height - 6);
        placeholderNode.setPosition(0, 0, 0);
        const placeholder = placeholderNode.addComponent(Label);
        placeholder.string = placeholderText;
        placeholder.fontSize = 22;
        placeholder.lineHeight = 28;
        placeholder.color = COLORS.muted;
        placeholder.overflow = Label.Overflow.SHRINK;
        placeholder.horizontalAlign = Label.HorizontalAlign.LEFT;
        placeholder.verticalAlign = Label.VerticalAlign.CENTER;

        const editBox = node.addComponent(EditBox);
        editBox.textLabel = textLabel;
        editBox.placeholderLabel = placeholder;
        editBox.placeholder = placeholderText;
        editBox.string = '';
        editBox.maxLength = 32;
        if (numeric) editBox.inputMode = EditBox.InputMode.NUMERIC;
        sanitizeEditBoxDefaultLabels(editBox, [textLabel, placeholder]);
        return editBox;
    }

    private tableLabel(parent: Node, text: string, x: number, width: number, fontSize = 20, color: Color = COLORS.text): Label {
        const label = createLabel(parent, text, fontSize, color, width, ROW_H - 8);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.node.setPosition(x, 0, 0);
        return label;
    }

    private bindButton(node: Node, handler: string, customData = ''): void {
        const button = node.getComponent(Button) || node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 1.04;
        const evt = new EventHandler();
        evt.target = this.node;
        evt.component = 'DlgMahjongRecords';
        evt.handler = handler;
        evt.customEventData = customData;
        button.clickEvents.push(evt);
    }

    private parseReplayEventData(value: string): { gameId: GameId | string; recordId: number } {
        const text = String(value || '');
        const index = text.indexOf(':');
        if (index < 0) {
            return { gameId: this.gameId, recordId: Number(text) };
        }
        const gameId = text.slice(0, index) || this.gameId;
        const recordId = Number(text.slice(index + 1));
        return { gameId, recordId };
    }

    private titleText(): string {
        return this.gameId === ALL_RECORD_GAME_ID ? '亲友圈战绩' : `${this.gameName}战绩`;
    }

    private formatMode(record: MahjongRecordItem): string {
        const name = record.gameName || getRecordGameName(record.gameId || this.gameId);
        const round = record.roundNo != null ? ` ${record.roundNo}局` : '';
        return `${name}${round}`;
    }

    private formatScore(value: number): string {
        const rounded = Math.round((Number(value) || 0) * 10) / 10;
        const normalized = Object.is(rounded, -0) ? 0 : rounded;
        const text = Number.isInteger(normalized)
            ? String(normalized)
            : normalized.toFixed(1).replace(/\.0$/, '');
        return normalized > 0 ? `+${text}` : text;
    }

    private shiftDate(days: number): void {
        const offset = days * RECORD_RANGE_DAYS;
        this.selectedStartDate = this.formatDate(this.addDays(this.parseDate(this.selectedStartDate), offset));
        this.selectedEndDate = this.formatDate(this.addDays(this.parseDate(this.selectedEndDate), offset));
        if (this.dateLabel) this.dateLabel.string = this.dateText();
        this.loadPage(1, true);
    }

    private dateText(): string {
        return `${this.formatDateText(this.selectedStartDate)} -- ${this.formatDateText(this.selectedEndDate)}`;
    }

    private resetDefaultDateRange(): void {
        const end = new Date();
        this.selectedEndDate = this.formatDate(end);
        this.selectedStartDate = this.formatDate(this.addDays(end, -RECORD_RANGE_DAYS));
        if (this.dateLabel) this.dateLabel.string = this.dateText();
    }

    private addDays(date: Date, days: number): Date {
        const next = new Date(date.getTime());
        next.setDate(next.getDate() + days);
        return next;
    }

    private startOfDay(date: Date): Date {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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

    private formatShortTime(value?: string): string {
        const date = this.parseRecordDate(value);
        if (!date) return value || '-';
        const pad = (num: number) => num < 10 ? `0${num}` : String(num);
        return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    private parseRecordDate(value?: string): Date | null {
        if (!value) return null;
        const text = String(value).trim();
        const withYear = /^\d{2}-\d{2}/.test(text) ? `${new Date().getFullYear()}-${text}` : text;
        const normalized = withYear.replace(' ', 'T');
        const date = new Date(normalized);
        return isNaN(date.getTime()) ? null : date;
    }

    private buildTraceText(playback: any): string {
        const range = this.resolveTraceRange(playback);
        return range ? `，追溯 ${range.start} 至 ${range.end}` : '';
    }

    private resolveTraceRange(playback: any): { start: string; end: string } | null {
        const retentionDays = Number(playback?.retentionDays || 3);
        const now = new Date();
        const fallbackEnd = now;
        const fallbackStart = new Date(now.getTime() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000);
        let start = this.parseDateTime(playback?.traceStartTime);
        let end = this.parseDateTime(playback?.traceEndTime);
        if (!start || !end || start.getTime() > end.getTime() || start.getTime() > now.getTime() + 60 * 1000) {
            start = fallbackStart;
            end = fallbackEnd;
        }
        return {
            start: this.formatDateTime(start),
            end: this.formatDateTime(end),
        };
    }

    private parseDateTime(value?: string): Date | null {
        return this.parseRecordDate(value);
    }

    private formatDateTime(date: Date): string {
        const pad = (num: number) => num < 10 ? `0${num}` : String(num);
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    private scrubEditBoxLabels(): void {
        sanitizeAllEditBoxDefaultLabels(this.node);
    }
}
