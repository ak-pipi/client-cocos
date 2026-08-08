import { _decorator, Component, Node, Label, UITransform, Color, Event } from 'cc';
import { GameId } from '../../App/GameEnums';
import { GameManager } from '../../Manager/GameManager';
import { GameRoomApi, MahjongRecordItem, getRecordGameName, getSupportedRecordGames } from '../../Network/GameRoomApi';
import {
    UI_COLORS, createOverlayRoot, createLabel, createButton,
    createScrollArea, fillRoundRect, resizeScrollContent,
} from '../../UI/UiKit';
import { ReplayDialogManager } from './ReplayDialogManager';

const { ccclass } = _decorator;

const PAGE_SIZE = 8;

@ccclass('DlgMahjongRecords')
export class DlgMahjongRecords extends Component {
    private panel: Node | null = null;
    private titleLabel: Label | null = null;
    private listContent: Node | null = null;
    private statusLabel: Label | null = null;
    private pageLabel: Label | null = null;
    private tabRoot: Node | null = null;
    private gameTabNodes: Map<string, Node> = new Map<string, Node>();

    private gameId: GameId | string = GameId.TaojiangMahjong;
    private gameName = '桃江麻将';
    private allowGameSwitch = false;
    private pageNum = 1;
    private total = 0;
    private records: MahjongRecordItem[] = [];
    private loading = false;

    onLoad() {
        this.buildUI();
    }

    onEnable() {
        this.loadPage(this.pageNum || 1);
    }

    public setup(gameId: GameId | string, allowGameSwitch = false): void {
        this.allowGameSwitch = allowGameSwitch;
        this.gameId = gameId || GameId.TaojiangMahjong;
        this.gameName = getRecordGameName(this.gameId);
        this.pageNum = 1;
        this.records = [];
        this.total = 0;
        if (this.titleLabel) {
            this.titleLabel.string = `${this.gameName}战绩`;
        }
        this.updateGameTabs();
    }

    private buildUI(): void {
        const root = createOverlayRoot(this.node, 'MahjongRecordsRoot');
        this.panel = root.getChildByName('Panel');

        this.titleLabel = createLabel(this.panel, `${this.gameName}战绩`, 34, UI_COLORS.accent, 300, 48);
        this.titleLabel.node.setPosition(0, 270, 0);

        this.createGameTabs();

        this.statusLabel = createLabel(this.panel, '加载中...', 22, UI_COLORS.subText, 800, 36);
        this.statusLabel.node.setPosition(0, 178, 0);
        this.statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

        const scroll = createScrollArea(this.panel, 860, 390, -40);
        this.listContent = scroll.content;

        this.pageLabel = createLabel(this.panel, '第 1 页', 22, UI_COLORS.text, 200, 36);
        this.pageLabel.node.setPosition(0, -285, 0);
        this.pageLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

        createButton(this.panel, '上一页', 110, 40, UI_COLORS.primary, this.node, 'DlgMahjongRecords', 'onPrevPage')
            .setPosition(-130, -285, 0);
        createButton(this.panel, '下一页', 110, 40, UI_COLORS.primary, this.node, 'DlgMahjongRecords', 'onNextPage')
            .setPosition(130, -285, 0);
        createButton(this.panel, '关闭', 100, 40, new Color(120, 70, 70, 255), this.node, 'DlgMahjongRecords', 'onCloseClicked')
            .setPosition(380, -285, 0);
        this.updateGameTabs();
    }

    private createGameTabs(): void {
        if (!this.panel) return;
        const games = getSupportedRecordGames();
        const totalWidth = games.length * 128 + Math.max(0, games.length - 1) * 12;
        let x = -totalWidth / 2 + 64;
        this.tabRoot = new Node('RecordGameTabs');
        this.tabRoot.parent = this.panel;
        this.tabRoot.addComponent(UITransform).setContentSize(totalWidth, 42);
        this.tabRoot.setPosition(0, 222, 0);
        this.gameTabNodes.clear();
        games.forEach((game) => {
            const node = createButton(
                this.tabRoot!,
                game.name,
                128,
                38,
                UI_COLORS.tabIdle,
                this.node,
                'DlgMahjongRecords',
                'onGameTabClicked',
                String(game.gameId),
            );
            node.setPosition(x, 0, 0);
            this.gameTabNodes.set(String(game.gameId), node);
            x += 140;
        });
    }

    public onPrevPage(): void {
        if (this.pageNum <= 1 || this.loading) return;
        this.loadPage(this.pageNum - 1);
    }

    public onNextPage(): void {
        const maxPage = Math.max(1, Math.ceil(this.total / PAGE_SIZE));
        if (this.pageNum >= maxPage || this.loading) return;
        this.loadPage(this.pageNum + 1);
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
        this.records = [];
        if (this.titleLabel) this.titleLabel.string = `${this.gameName}战绩`;
        this.updateGameTabs();
        this.loadPage(1);
    }

    public async onReplayClicked(_event: Event, customEventData: string): Promise<void> {
        const recordId = Number(customEventData);
        if (!isFinite(recordId) || recordId <= 0 || this.loading) return;
        this.loading = true;
        if (this.statusLabel) this.statusLabel.string = '加载回放中...';
        try {
            const playback = await GameRoomApi.Instance.getGamePlayback(this.gameId, recordId);
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

    private async loadPage(pageNum: number): Promise<void> {
        if (this.loading) return;
        this.loading = true;
        if (this.statusLabel) this.statusLabel.string = '加载中...';
        this.clearList();

        try {
            const result = await GameRoomApi.Instance.getGameRecords(this.gameId, pageNum, PAGE_SIZE);
            if (!result) {
                if (this.statusLabel) this.statusLabel.string = '加载失败';
                return;
            }
            this.pageNum = result.pageNum || pageNum;
            this.total = result.total || 0;
            this.records = result.records || [];
            this.renderRecords();
        } catch (err) {
            console.error('[DlgMahjongRecords] load error:', err);
            if (this.statusLabel) this.statusLabel.string = '加载失败，请重试';
        } finally {
            this.loading = false;
        }
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
            fillRoundRect(node, 128, 38, active ? UI_COLORS.tabActive : UI_COLORS.tabIdle, 8);
            const label = node.getChildByName('Label')?.getComponent(Label);
            if (label) {
                label.color = active ? UI_COLORS.text : UI_COLORS.subText;
            }
        });
    }

    private getMyResult(record: MahjongRecordItem): { score: number; gold: number; nickname: string } {
        const playerId = GameManager.Instance.PlayerId;
        const players = record.players || [];
        const index = players.findIndex((p) => !!p && p.playerId === playerId);
        if (index < 0) {
            return { score: 0, gold: 0, nickname: GameManager.Instance.NickName || '我' };
        }
        return {
            score: record.scores?.[index] ?? 0,
            gold: Number(record.winGolds?.[index] ?? 0),
            nickname: players[index]?.nickname || '我',
        };
    }

    private formatPlayers(record: MahjongRecordItem): string {
        const players = record.players || [];
        if (players.length === 0) return '暂无玩家信息';
        return players.map((p) => p ? (p.nickname || p.playerId) : '-').join(' / ');
    }

    private renderRecords(): void {
        if (!this.listContent || !this.statusLabel || !this.pageLabel) return;

        const maxPage = Math.max(1, Math.ceil(this.total / PAGE_SIZE));
        this.pageLabel.string = `第 ${this.pageNum} / ${maxPage} 页`;

        if (this.records.length === 0) {
            this.statusLabel.string = '暂无数据';
            resizeScrollContent(this.listContent, 860, 0, 108, 12);
            return;
        }

        this.statusLabel.string = `共 ${this.total} 条战绩`;
        const itemHeight = 108;
        const gap = 12;
        const width = 840;

        this.records.forEach((record, index) => {
            const mine = this.getMyResult(record);
            const scoreColor = mine.score >= 0 ? UI_COLORS.success : new Color(220, 100, 100, 255);
            const goldText = mine.gold >= 0 ? `+${mine.gold}` : `${mine.gold}`;

            const card = new Node(`Record_${index}`);
            card.parent = this.listContent;
            card.setPosition(0, -(index * (itemHeight + gap) + itemHeight / 2), 0);
            card.addComponent(UITransform).setContentSize(width, itemHeight);
            fillRoundRect(card, width, itemHeight, UI_COLORS.card, 12);

            const title = createLabel(card, `房间 ${record.number || '-'}`, 26, UI_COLORS.accent, 220, 34);
            title.node.setPosition(-300, 28, 0);

            const round = createLabel(card, `第 ${record.roundNo ?? '-'} 局`, 22, UI_COLORS.text, 140, 30);
            round.node.setPosition(-70, 28, 0);

            const time = createLabel(card, record.time || '', 20, UI_COLORS.subText, 180, 28);
            time.node.setPosition(300, 28, 0);
            time.horizontalAlign = Label.HorizontalAlign.RIGHT;

            const players = createLabel(card, this.formatPlayers(record), 20, UI_COLORS.subText, 520, 28);
            players.node.setPosition(-220, -6, 0);

            const score = createLabel(card, `得分 ${mine.score}`, 24, scoreColor, 140, 32);
            score.node.setPosition(250, -6, 0);
            score.horizontalAlign = Label.HorizontalAlign.RIGHT;

            const gold = createLabel(card, `金币 ${goldText}`, 22, scoreColor, 140, 30);
            gold.node.setPosition(250, -34, 0);
            gold.horizontalAlign = Label.HorizontalAlign.RIGHT;

            const replayColor = record.hasReplay === false ? new Color(86, 92, 104, 255) : UI_COLORS.primary;
            const replay = createButton(card, '回放', 86, 36, replayColor, this.node, 'DlgMahjongRecords', 'onReplayClicked', String(record.id));
            replay.setPosition(360, -30, 0);
            replay.active = record.hasReplay !== false;
        });

        resizeScrollContent(this.listContent, width, this.records.length, itemHeight, gap);
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
        if (!value) return null;
        const normalized = String(value).replace(' ', 'T');
        const date = new Date(normalized);
        return isNaN(date.getTime()) ? null : date;
    }

    private formatDateTime(date: Date): string {
        const pad = (num: number) => num < 10 ? `0${num}` : String(num);
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }
}
