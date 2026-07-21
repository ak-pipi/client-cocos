import { _decorator, Component, Node, Label, Color, UITransform, BlockInputEvents } from 'cc';
import { MahjongPlaybackResult } from '../../Network/GameRoomApi';
import {
    UI_COLORS, createOverlayRoot, createLabel, createButton, fillRoundRect,
} from '../../UI/UiKit';

const { ccclass } = _decorator;

type ReplayKind = 'mahjong' | 'poker';

interface ReplayTile {
    id: number;
    text: string;
}

interface SeatViewState {
    name: string;
    hand: ReplayTile[];
    discards: ReplayTile[];
    melds: string[];
    lastAction: string;
}

const MAHJONG_ACTION_NAMES: Record<number, string> = {
    1: '摸牌',
    2: '出牌',
    3: '吃',
    4: '碰',
    5: '直杠',
    6: '加杠',
    7: '暗杠',
    8: '点炮胡',
    9: '自摸',
};

@ccclass('DlgReplayPlayer')
export class DlgReplayPlayer extends Component {
    private panel: Node | null = null;
    private titleLabel: Label | null = null;
    private statusLabel: Label | null = null;
    private stepLabel: Label | null = null;
    private playLabel: Label | null = null;
    private seatPanels: Node[] = [];
    private seatNameLabels: Label[] = [];
    private seatHandLabels: Label[] = [];
    private seatDiscardLabels: Label[] = [];
    private seatMeldLabels: Label[] = [];
    private centerActionLabel: Label | null = null;
    private actionLogLabel: Label | null = null;

    private playback: MahjongPlaybackResult | null = null;
    private replayData: any = null;
    private kind: ReplayKind = 'mahjong';
    private playerCount = 4;
    private currentStep = -1;
    private maxStep = 0;
    private playing = false;
    private elapsed = 0;
    private stepInterval = 0.85;
    private actionLog: string[] = [];

    onLoad(): void {
        this.buildUI();
        this.render();
    }

    update(deltaTime: number): void {
        if (!this.playing || this.maxStep <= 0) return;
        this.elapsed += deltaTime;
        if (this.elapsed < this.stepInterval) return;
        this.elapsed = 0;
        if (this.currentStep >= this.maxStep - 1) {
            this.playing = false;
            this.updatePlayLabel();
            return;
        }
        this.currentStep++;
        this.render();
    }

    public setup(playback: MahjongPlaybackResult): void {
        this.playback = playback;
        this.replayData = playback.replay;
        this.kind = this.isPokerReplay(this.replayData, playback) ? 'poker' : 'mahjong';
        this.playerCount = this.resolvePlayerCount(playback, this.replayData);
        this.currentStep = -1;
        this.playing = false;
        this.elapsed = 0;
        this.maxStep = this.kind === 'poker'
            ? this.toArray(this.getField(this.replayData, 'steps', 7)).length
            : this.toArray(this.getField(this.replayData, 'actions', 2)).length;
        if (this.titleLabel) {
            const gameName = playback.gameName || '牌局';
            const round = playback.roundNo ? ` 第${playback.roundNo}局` : '';
            this.titleLabel.string = `${gameName}${round}回放`;
        }
        this.render();
    }

    public onPrevClicked(): void {
        if (this.currentStep < 0) return;
        this.currentStep--;
        this.playing = false;
        this.render();
    }

    public onNextClicked(): void {
        if (this.currentStep >= this.maxStep - 1) return;
        this.currentStep++;
        this.render();
    }

    public onPlayClicked(): void {
        if (this.maxStep <= 0) return;
        if (this.currentStep >= this.maxStep - 1) this.currentStep = -1;
        this.playing = !this.playing;
        this.elapsed = 0;
        this.updatePlayLabel();
        this.render();
    }

    public onRestartClicked(): void {
        this.currentStep = -1;
        this.playing = false;
        this.render();
    }

    public onCloseClicked(): void {
        this.node.destroy();
    }

    private buildUI(): void {
        const root = createOverlayRoot(this.node, 'ReplayPlayerRoot');
        root.addComponent(BlockInputEvents);
        this.panel = root.getChildByName('Panel');
        if (!this.panel) return;
        this.panel.getComponent(UITransform)?.setContentSize(1160, 720);
        fillRoundRect(this.panel, 1160, 720, UI_COLORS.panel, 14);

        this.titleLabel = createLabel(this.panel, '牌局回放', 32, UI_COLORS.accent, 420, 46);
        this.titleLabel.node.setPosition(-340, 320, 0);

        this.statusLabel = createLabel(this.panel, '准备播放', 22, UI_COLORS.text, 560, 36);
        this.statusLabel.node.setPosition(210, 320, 0);
        this.statusLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;

        const table = new Node('ReplayTable');
        table.parent = this.panel;
        table.addComponent(UITransform).setContentSize(760, 480);
        table.setPosition(-160, 25, 0);
        fillRoundRect(table, 760, 480, new Color(24, 86, 78, 238), 16);

        this.buildSeatPanel(table, 0, 0, -172, 670, 118);
        this.buildSeatPanel(table, 1, -292, 36, 170, 320);
        this.buildSeatPanel(table, 2, 0, 172, 670, 118);
        this.buildSeatPanel(table, 3, 292, 36, 170, 320);

        const center = new Node('CenterAction');
        center.parent = table;
        center.addComponent(UITransform).setContentSize(330, 118);
        center.setPosition(0, 12, 0);
        fillRoundRect(center, 330, 118, new Color(16, 45, 48, 215), 10);
        this.stepLabel = createLabel(center, '第 0 / 0 步', 24, UI_COLORS.accent, 300, 34);
        this.stepLabel.node.setPosition(0, 26, 0);
        this.stepLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.centerActionLabel = createLabel(center, '', 20, UI_COLORS.text, 300, 62);
        this.centerActionLabel.node.setPosition(0, -22, 0);
        this.centerActionLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

        const logPanel = new Node('ReplayLog');
        logPanel.parent = this.panel;
        logPanel.addComponent(UITransform).setContentSize(320, 480);
        logPanel.setPosition(405, 25, 0);
        fillRoundRect(logPanel, 320, 480, new Color(20, 38, 58, 238), 10);
        createLabel(logPanel, '动作记录', 24, UI_COLORS.accent, 280, 34).node.setPosition(-130, 210, 0);

        const actions = createLabel(logPanel, '', 18, UI_COLORS.text, 286, 400);
        actions.node.name = 'ActionList';
        actions.node.setPosition(0, -18, 0);
        actions.horizontalAlign = Label.HorizontalAlign.LEFT;
        actions.verticalAlign = Label.VerticalAlign.TOP;
        this.actionLogLabel = actions;

        createButton(this.panel, '上一步', 110, 42, UI_COLORS.primary, this.node, 'DlgReplayPlayer', 'onPrevClicked')
            .setPosition(-330, -320, 0);
        const playButton = createButton(this.panel, '播放', 110, 42, UI_COLORS.success, this.node, 'DlgReplayPlayer', 'onPlayClicked');
        playButton.setPosition(-190, -320, 0);
        this.playLabel = playButton.getChildByName('Label')?.getComponent(Label) || null;
        createButton(this.panel, '下一步', 110, 42, UI_COLORS.primary, this.node, 'DlgReplayPlayer', 'onNextClicked')
            .setPosition(-50, -320, 0);
        createButton(this.panel, '重播', 110, 42, new Color(116, 98, 180, 255), this.node, 'DlgReplayPlayer', 'onRestartClicked')
            .setPosition(90, -320, 0);
        createButton(this.panel, '关闭', 110, 42, new Color(120, 70, 70, 255), this.node, 'DlgReplayPlayer', 'onCloseClicked')
            .setPosition(455, -320, 0);
    }

    private buildSeatPanel(parent: Node, seat: number, x: number, y: number, w: number, h: number): void {
        const node = new Node(`Seat${seat}`);
        node.parent = parent;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(x, y, 0);
        fillRoundRect(node, w, h, new Color(20, 37, 58, 225), 8);
        this.seatPanels[seat] = node;

        const name = createLabel(node, `玩家${seat + 1}`, 19, UI_COLORS.accent, w - 18, 26);
        name.node.setPosition(0, h / 2 - 17, 0);
        name.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.seatNameLabels[seat] = name;

        const hand = createLabel(node, '', 17, UI_COLORS.text, w - 18, Math.max(30, h * 0.36));
        hand.node.setPosition(0, h * 0.13, 0);
        hand.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.seatHandLabels[seat] = hand;

        const discard = createLabel(node, '', 16, new Color(206, 230, 220, 255), w - 18, Math.max(28, h * 0.28));
        discard.node.setPosition(0, -h * 0.16, 0);
        discard.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.seatDiscardLabels[seat] = discard;

        const meld = createLabel(node, '', 15, UI_COLORS.subText, w - 18, 24);
        meld.node.setPosition(0, -h / 2 + 16, 0);
        meld.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.seatMeldLabels[seat] = meld;
    }

    private render(): void {
        if (!this.panel || !this.playback || !this.replayData) return;
        const states = this.kind === 'poker' ? this.buildPokerState() : this.buildMahjongState();
        for (let i = 0; i < 4; i++) {
            const visible = i < this.playerCount;
            if (this.seatPanels[i]) this.seatPanels[i].active = visible;
            if (!visible) continue;
            const state = states[i] || this.emptySeatState(i);
            this.seatNameLabels[i].string = state.name;
            this.seatHandLabels[i].string = this.formatHand(state.hand);
            this.seatDiscardLabels[i].string = state.discards.length > 0
                ? `出牌 ${this.formatTiles(state.discards, 16)}`
                : (state.lastAction || '等待动作');
            this.seatMeldLabels[i].string = state.melds.length > 0 ? state.melds.slice(-3).join('  ') : '';
        }
        const progress = this.maxStep > 0 ? `${Math.max(0, this.currentStep + 1)} / ${this.maxStep}` : '0 / 0';
        if (this.stepLabel) this.stepLabel.string = `第 ${progress} 步`;
        if (this.statusLabel) {
            const codec = this.playback.codec ? `  ${this.playback.codec}` : '';
            this.statusLabel.string = `${this.kind === 'poker' ? '扑克' : '麻将'}回放${codec}`;
        }
        if (this.centerActionLabel) {
            const latest = this.actionLog.length > 0 ? this.actionLog[this.actionLog.length - 1] : '初始牌面';
            this.centerActionLabel.string = latest.replace(/^\d+\.\s*/, '');
        }
        if (this.actionLogLabel) {
            const logs = this.actionLog.slice(-18);
            this.actionLogLabel.string = logs.length > 0 ? logs.join('\n') : '初始牌面';
        }
        this.updatePlayLabel();
    }

    private buildMahjongState(): SeatViewState[] {
        const dealedTiles = this.toArray(this.getField(this.replayData, 'dealedTiles', 0));
        const actions = this.toArray(this.getField(this.replayData, 'actions', 2));
        const actors = this.toArray(this.getField(this.replayData, 'actors', 3));
        const lookup = this.buildMahjongTileLookup(dealedTiles);
        const states = this.createInitialStates(dealedTiles.map((tiles: any) => this.toArray(tiles).map((t: any) => this.parseMahjongTile(t))));
        this.actionLog = [];

        const end = Math.min(this.currentStep, actions.length - 1);
        for (let i = 0; i <= end; i++) {
            const action = actions[i];
            const type = this.toNumber(this.getField(action, 'type', 0));
            const slot = this.toNumber(this.getField(action, 'slot', 1));
            const tileId = this.toNumber(this.getField(action, 'tile', 2));
            const actor = actors[slot];
            const seat = this.toNumber(this.getField(actor, 'player', 0));
            const safeSeat = seat >= 0 && seat < states.length ? seat : 0;
            const tile = lookup.get(tileId) || this.parseMahjongTileId(tileId);
            const actionName = MAHJONG_ACTION_NAMES[type] || '动作';
            const text = tile.text ? `${actionName} ${tile.text}` : actionName;
            states[safeSeat].lastAction = text;
            if (type === 1) {
                states[safeSeat].hand.push(tile);
            } else if (type === 2) {
                this.removeTile(states[safeSeat].hand, tileId);
                states[safeSeat].discards.push(tile);
            } else if (type >= 3 && type <= 7) {
                this.removeLastMatchingDiscard(states, tileId);
                if (type >= 5 && type <= 7) this.removeTile(states[safeSeat].hand, tileId);
                states[safeSeat].melds.push(tile.text ? `${actionName}${tile.text}` : actionName);
            } else if (type === 8 || type === 9) {
                states[safeSeat].melds.push(tile.text ? `${actionName}${tile.text}` : actionName);
            }
            this.actionLog.push(`${i + 1}. ${states[safeSeat].name} ${text}`);
        }
        return states;
    }

    private buildPokerState(): SeatViewState[] {
        const initCards = this.toArray(this.getField(this.replayData, 'initCards', 5));
        const steps = this.toArray(this.getField(this.replayData, 'steps', 7));
        const states = this.createInitialStates(initCards.map((cards: any) => this.toArray(cards).map((id: any) => this.parsePokerCardId(this.toNumber(id)))));
        this.actionLog = [];

        const end = Math.min(this.currentStep, steps.length - 1);
        for (let i = 0; i <= end; i++) {
            const step = steps[i];
            const action = this.toNumber(this.getField(step, 'action', 0));
            const seat = this.toNumber(this.getField(step, 'seat', 1));
            const cardIds = this.toArray(this.getField(step, 'cardIds', 2)).map((id: any) => this.toNumber(id));
            const safeSeat = seat >= 0 && seat < states.length ? seat : 0;
            if (action === 1 || cardIds.length === 0) {
                states[safeSeat].lastAction = '过牌';
                this.actionLog.push(`${i + 1}. ${states[safeSeat].name} 过牌`);
                continue;
            }
            const cards = cardIds.map((id) => this.parsePokerCardId(id));
            for (const card of cards) this.removeTile(states[safeSeat].hand, card.id);
            states[safeSeat].discards = cards;
            states[safeSeat].lastAction = `出牌 ${this.formatTiles(cards, 20)}`;
            this.actionLog.push(`${i + 1}. ${states[safeSeat].name} 出牌 ${this.formatTiles(cards, 20)}`);
        }
        return states;
    }

    private createInitialStates(hands: ReplayTile[][]): SeatViewState[] {
        const players = this.playback?.players || [];
        const states: SeatViewState[] = [];
        for (let i = 0; i < this.playerCount; i++) {
            const player = players[i];
            states.push({
                name: player?.nickname || `玩家${i + 1}`,
                hand: [...(hands[i] || [])],
                discards: [],
                melds: [],
                lastAction: '',
            });
        }
        return states;
    }

    private emptySeatState(seat: number): SeatViewState {
        return { name: `玩家${seat + 1}`, hand: [], discards: [], melds: [], lastAction: '' };
    }

    private buildMahjongTileLookup(dealedTiles: any[]): Map<number, ReplayTile> {
        const map = new Map<number, ReplayTile>();
        for (const rawSeatTiles of dealedTiles) {
            for (const rawTile of this.toArray(rawSeatTiles)) {
                const tile = this.parseMahjongTile(rawTile);
                if (tile.id > 0) map.set(tile.id, tile);
            }
        }
        return map;
    }

    private parseMahjongTile(raw: any): ReplayTile {
        const id = this.toNumber(this.getField(raw, 'id', 0));
        const tile = this.getField(raw, 'tile', 1);
        const pattern = this.toNumber(this.getField(tile, 'pattern', 0));
        const number = this.toNumber(this.getField(tile, 'number', 1));
        const text = pattern > 0 ? this.mahjongTileText(pattern, number) : this.parseMahjongTileId(id).text;
        return { id, text };
    }

    private parseMahjongTileId(id: number): ReplayTile {
        if (id < 0) return { id, text: '' };
        if (id < 108) {
            const pattern = 1 + Math.floor(id / 36);
            const number = 1 + Math.floor((id % 36) / 4);
            return { id, text: this.mahjongTileText(pattern, number) };
        }
        if (id < 136) {
            const pattern = 4 + Math.floor((id - 108) / 4);
            return { id, text: this.mahjongTileText(pattern, 0) };
        }
        if (id < 144) {
            const pattern = 11 + (id - 136);
            return { id, text: this.mahjongTileText(pattern, 0) };
        }
        return { id, text: `#${id}` };
    }

    private mahjongTileText(pattern: number, number: number): string {
        const numberNames: Record<number, string> = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九' };
        const patternNames: Record<number, string> = {
            1: '筒', 2: '条', 3: '万', 4: '东风', 5: '南风', 6: '西风', 7: '北风',
            8: '红中', 9: '发财', 10: '白板', 11: '春', 12: '夏', 13: '秋', 14: '冬',
            15: '梅', 16: '兰', 17: '菊', 18: '竹',
        };
        if (pattern >= 1 && pattern <= 3) return `${numberNames[number] || number}${patternNames[pattern]}`;
        return patternNames[pattern] || `牌${pattern}-${number}`;
    }

    private parsePokerCardId(id: number): ReplayTile {
        const deck = this.buildPaoDeKuaiDeck();
        const card = deck[id];
        return { id, text: card || `#${id}` };
    }

    private buildPaoDeKuaiDeck(): string[] {
        const deck: string[] = [];
        const pointText = (point: number): string => {
            if (point === 1) return 'A';
            if (point === 11) return 'J';
            if (point === 12) return 'Q';
            if (point === 13) return 'K';
            return String(point);
        };
        const suitText = (suit: number): string => {
            if (suit === 4) return '黑桃';
            if (suit === 3) return '红桃';
            if (suit === 2) return '梅花';
            return '方块';
        };
        const removed = (point: number, suit: number): boolean => {
            if (point === 2) return suit !== 4;
            if (point === 1) return suit !== 4;
            if (point === 13) return suit === 1;
            return false;
        };
        for (let point = 1; point <= 13; point++) {
            for (let suit = 1; suit <= 4; suit++) {
                if (!removed(point, suit)) deck.push(`${suitText(suit)}${pointText(point)}`);
            }
        }
        return deck;
    }

    private removeTile(tiles: ReplayTile[], tileId: number): void {
        const idx = tiles.findIndex((t) => t.id === tileId);
        if (idx >= 0) tiles.splice(idx, 1);
    }

    private removeLastMatchingDiscard(states: SeatViewState[], tileId: number): void {
        for (const state of states) {
            const idx = state.discards.findIndex((t) => t.id === tileId);
            if (idx >= 0) {
                state.discards.splice(idx, 1);
                return;
            }
        }
    }

    private formatHand(tiles: ReplayTile[]): string {
        if (tiles.length === 0) return '手牌 0 张';
        return `手牌 ${tiles.length} 张\n${this.formatTiles(tiles, 34)}`;
    }

    private formatTiles(tiles: ReplayTile[], maxChars: number): string {
        const text = tiles.map((t) => t.text).join(' ');
        return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
    }

    private updatePlayLabel(): void {
        if (this.playLabel) this.playLabel.string = this.playing ? '暂停' : '播放';
    }

    private isPokerReplay(replay: any, playback: MahjongPlaybackResult): boolean {
        if (playback.gameName === '跑得快') return true;
        if (!replay || typeof replay !== 'object') return false;
        if (Array.isArray(replay)) {
            return typeof replay[0] === 'string' && Array.isArray(replay[5]) && Array.isArray(replay[7]);
        }
        if (Array.isArray(replay.steps) || Array.isArray(replay.initCards)) return true;
        return typeof replay['0'] === 'string' && Array.isArray(replay['5']) && Array.isArray(replay['7']);
    }

    private resolvePlayerCount(playback: MahjongPlaybackResult, replay: any): number {
        const replayCount = this.toNumber(this.getField(replay, 'playerCount', 3));
        if (replayCount > 0) return Math.min(4, replayCount);
        if (Array.isArray(playback.players) && playback.players.length > 0) return Math.min(4, playback.players.length);
        return this.kind === 'poker' ? 2 : 4;
    }

    private getField(value: any, key: string, index: number): any {
        if (value == null) return null;
        if (Array.isArray(value)) return value[index];
        return value[key] ?? value[String(index)] ?? value[index];
    }

    private toArray(value: any): any[] {
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'object') return [];
        const keys = Object.keys(value).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
        return keys.map((k) => value[k]);
    }

    private toNumber(value: any): number {
        const n = Number(value);
        return isFinite(n) ? n : 0;
    }
}
