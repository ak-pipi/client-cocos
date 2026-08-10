import { _decorator, Button, Color, Component, Event, EventHandler, Graphics, Label, Node, Prefab, Sprite, UITransform } from 'cc';
import { Client } from './Client';
import { GAME_STAKE_OPTIONS, GameId, GameType } from '../App/GameEnums';
import type { GameMetaInfo, StakeOption } from '../App/GameEnums';
import { GameFactory } from '../App/GameFactory';
import { GameManager } from '../Manager/GameManager';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { GameRoomApi, getServerGameType } from '../Network/GameRoomApi';
import type { DistrictVenueItem, EnterVenueResult } from '../Network/GameRoomApi';
import { CarryScorePrompt } from './CarryScorePrompt';

const { ccclass, property } = _decorator;

interface TabItem {
    key: string;
    text: string;
    width: number;
    x: number;
}

interface RoomOptionItem {
    text: string;
    subText: string;
    gameId: GameId;
    districtId?: number;
    baseScore?: number;
    roundCount?: number;
}

interface RoomPlayerInfo {
    playerId?: string;
    nickname?: string;
    headUrl?: string;
    avatar?: string;
}

interface TableItem {
    gameId: GameId;
    gameName: string;
    roomType: string;
    subText: string;
    districtId?: number;
    venueId?: string;
    number?: string;
    playerCount: number;
    maxPlayerNums: number;
    players: RoomPlayerInfo[];
}

const COLORS = {
    tabIdle: new Color(232, 218, 196, 210),
    tabActive: new Color(255, 206, 86, 250),
    tabText: new Color(126, 40, 42, 255),
    dropdown: new Color(68, 48, 50, 225),
    optionIdle: new Color(248, 183, 78, 250),
    optionText: new Color(84, 44, 40, 255),
    optionSubText: new Color(116, 70, 52, 255),
    tableA: new Color(38, 132, 116, 245),
    tableB: new Color(124, 44, 120, 245),
    tableEdge: new Color(33, 36, 64, 255),
    tableText: new Color(238, 250, 255, 255),
    tableSubText: new Color(255, 220, 96, 255),
    seat: new Color(244, 236, 218, 255),
    seatEmpty: new Color(118, 104, 104, 220),
    seatText: new Color(245, 245, 245, 255),
};

@ccclass('GameList')
export class GameList extends Component {
    @property({ type: Node })
    private content: Node = null;

    private viewNode: Node | null = null;
    private games: GameMetaInfo[] = [];
    private activeTabKey = '';
    private selectedDistrictId: number | null = null;
    private dropdownOpen = false;
    private tabItems: TabItem[] = [];
    private tabNodes: Map<string, Node> = new Map<string, Node>();
    private dropdownNode: Node | null = null;
    private tableGridNode: Node | null = null;
    private statusLabel: Label | null = null;
    private tableLoadSeq = 0;
    private entering = false;

    private readonly viewWidth = 1600;
    private readonly viewHeight = 520;
    private readonly tabHeight = 52;
    private readonly tabGap = 10;

    start(): void {
        this.buildGameList();
    }

    private findDeepChild(parent: Node, name: string): Node | null {
        for (const child of parent.children) {
            if (child.name === name) return child;
            const found = this.findDeepChild(child, name);
            if (found) return found;
        }
        return null;
    }

    private buildGameList(): void {
        if (!this.content) this.content = this.findDeepChild(this.node, 'content');
        this.viewNode = this.findDeepChild(this.node, 'view');
        if (!this.content) {
            console.warn('[GameList] Content node not found!');
            return;
        }

        this.resizeRuntimeLayout();
        this.content.children.slice().forEach((child) => child.destroy());

        this.games = GameFactory.getAllGames();
        if (this.games.length === 0) {
            this.createCenteredLabel(this.content, '暂无可用玩法', 26, COLORS.tabText, 360, 56).node.setPosition(0, 0, 0);
            return;
        }

        this.activeTabKey = this.games[0].id;
        this.createTabs();
        this.createTableLayer();
        this.renderDropdown();
        this.loadTables();
    }

    private resizeRuntimeLayout(): void {
        [this.node, this.viewNode, this.content].forEach((node) => {
            const transform = node?.getComponent(UITransform);
            if (transform) transform.setContentSize(this.viewWidth, this.viewHeight);
        });
    }

    private createTabs(): void {
        this.tabItems = this.buildTabItems();
        this.tabNodes.clear();
        this.tabItems.forEach((tab) => {
            const tabNode = new Node(`Tab_${tab.key}`);
            tabNode.parent = this.content;
            tabNode.addComponent(UITransform).setContentSize(tab.width, this.tabHeight);
            tabNode.setPosition(tab.x, 208, 0);
            this.drawRoundRect(tabNode, tab.width, this.tabHeight, this.getTabColor(tab.key), 12);

            const label = this.createCenteredLabel(tabNode, tab.text, 21, COLORS.tabText, tab.width - 16, this.tabHeight - 8);
            label.node.setPosition(0, 0, 0);
            label.isBold = tab.key === this.activeTabKey;

            this.bindClick(tabNode, 'onGameTabClicked', tab.key);
            this.tabNodes.set(tab.key, tabNode);
        });
    }

    private buildTabItems(): TabItem[] {
        const items: Array<{ key: string; text: string; width: number }> = [
            { key: 'all', text: '全部玩法', width: 124 },
            ...this.games.map((game) => ({
                key: game.id,
                text: game.name,
                width: this.getTabWidth(game.name),
            })),
        ];
        const totalWidth = items.reduce((sum, item) => sum + item.width, 0) + (items.length - 1) * this.tabGap;
        let cursor = -totalWidth / 2;
        return items.map((item) => {
            const tab: TabItem = { ...item, x: cursor + item.width / 2 };
            cursor += item.width + this.tabGap;
            return tab;
        });
    }

    private getTabWidth(text: string): number {
        return Math.min(188, Math.max(128, text.length * 26 + 50));
    }

    private refreshTabStyles(): void {
        this.tabNodes.forEach((node, key) => {
            const tab = this.tabItems.find((item) => item.key === key);
            if (!tab) return;
            this.drawRoundRect(node, tab.width, this.tabHeight, this.getTabColor(key), 12);
            const label = node.getChildByName('Label')?.getComponent(Label);
            if (label) label.isBold = key === this.activeTabKey;
        });
    }

    private getTabColor(key: string): Color {
        return key === this.activeTabKey ? COLORS.tabActive : COLORS.tabIdle;
    }

    private createTableLayer(): void {
        this.tableGridNode = new Node('TableGrid');
        this.tableGridNode.parent = this.content;
        this.tableGridNode.addComponent(UITransform).setContentSize(this.viewWidth, 390);
        this.tableGridNode.setPosition(0, -12, 0);

        const status = this.createCenteredLabel(this.tableGridNode, '', 22, COLORS.optionSubText, 640, 38);
        status.node.setPosition(0, 130, 0);
        this.statusLabel = status;
    }

    private renderDropdown(): void {
        if (this.dropdownNode) {
            this.dropdownNode.destroy();
            this.dropdownNode = null;
        }
        if (!this.dropdownOpen) return;

        const options = this.getDropdownOptions();
        if (options.length === 0 || !this.content) return;

        const tabX = this.tabItems.find((item) => item.key === this.activeTabKey)?.x || 0;
        const layout = this.buildDropdownLayout(options);
        const panelW = layout.panelW;
        const panelH = layout.panelH;
        const dropdownX = this.clamp(tabX, -this.viewWidth / 2 + panelW / 2, this.viewWidth / 2 - panelW / 2);

        const dropdown = new Node('RoomOptionDropdown');
        dropdown.parent = this.content;
        dropdown.addComponent(UITransform).setContentSize(panelW, panelH);
        dropdown.setPosition(dropdownX, 174 - panelH / 2, 0);
        this.drawRoundRect(dropdown, panelW, panelH, COLORS.dropdown, 10);
        this.dropdownNode = dropdown;

        layout.items.forEach((item) => {
            this.createRoomOption(dropdown, item.option, item.x, item.y, item.width, item.height);
        });
        dropdown.setSiblingIndex(this.content.children.length - 1);
    }

    private buildDropdownLayout(options: RoomOptionItem[]): {
        panelW: number;
        panelH: number;
        items: Array<{ option: RoomOptionItem; x: number; y: number; width: number; height: number }>;
    } {
        const optionH = 44;
        const gapX = 10;
        const gapY = 6;
        const padding = 12;
        const groupedSingles = options.filter((option) => option.roundCount === 1);
        const groupedRounds = options.filter((option) => option.roundCount !== 1);

        if (options.length > 6 && groupedSingles.length > 0 && groupedRounds.length > 0) {
            const optionW = 230;
            const cols = 2;
            const rows = Math.max(groupedSingles.length, groupedRounds.length);
            const panelW = cols * optionW + gapX + padding * 2;
            const panelH = rows * optionH + (rows - 1) * gapY + padding * 2;
            const items: Array<{ option: RoomOptionItem; x: number; y: number; width: number; height: number }> = [];
            [groupedSingles, groupedRounds].forEach((column, col) => {
                column.forEach((option, row) => {
                    items.push({
                        option,
                        x: -panelW / 2 + padding + optionW / 2 + col * (optionW + gapX),
                        y: panelH / 2 - padding - optionH / 2 - row * (optionH + gapY),
                        width: optionW,
                        height: optionH,
                    });
                });
            });
            return { panelW, panelH, items };
        }

        const cols = options.length > 6 ? 2 : 1;
        const rows = Math.ceil(options.length / cols);
        const optionW = cols === 1 ? 258 : 230;
        const panelW = cols * optionW + (cols - 1) * gapX + padding * 2;
        const panelH = rows * optionH + (rows - 1) * gapY + padding * 2;
        return {
            panelW,
            panelH,
            items: options.map((option, index) => {
                const col = Math.floor(index / rows);
                const row = index % rows;
                return {
                    option,
                    x: -panelW / 2 + padding + optionW / 2 + col * (optionW + gapX),
                    y: panelH / 2 - padding - optionH / 2 - row * (optionH + gapY),
                    width: optionW,
                    height: optionH,
                };
            }),
        };
    }

    private getDropdownOptions(): RoomOptionItem[] {
        if (this.activeTabKey === 'all') {
            return [];
        }

        const game = this.games.find((item) => item.id === this.activeTabKey);
        if (!game) return [];
        const stakes = GAME_STAKE_OPTIONS[game.id] || [];
        return stakes
            .filter((stake) => stake.districtId > 0)
            .map((stake) => ({
                text: stake.label,
                subText: this.getStakeSubText(stake),
                gameId: game.id,
                districtId: stake.districtId,
                baseScore: stake.baseScore,
                roundCount: stake.roundCount,
            }));
    }

    private getTableSourceOptions(): RoomOptionItem[] {
        if (this.activeTabKey === 'all') {
            return this.games.map((game) => {
                const stake = (GAME_STAKE_OPTIONS[game.id] || [])[0];
                return {
                    text: stake?.label || game.name,
                    subText: `${game.playerCount}人玩法`,
                    gameId: game.id,
                    districtId: stake?.districtId,
                    baseScore: stake?.baseScore,
                    roundCount: stake?.roundCount,
                };
            });
        }

        const game = this.games.find((item) => item.id === this.activeTabKey);
        if (!game) return [];
        const stakes = GAME_STAKE_OPTIONS[game.id] || [];
        return stakes
            .filter((stake) => this.selectedDistrictId == null || stake.districtId === this.selectedDistrictId)
            .map((stake) => ({
                text: stake.label,
                subText: this.getStakeSubText(stake),
                gameId: game.id,
                districtId: stake.districtId,
                baseScore: stake.baseScore,
                roundCount: stake.roundCount,
            }));
    }

    private getStakeSubText(stake: StakeOption): string {
        const rounds = stake.roundCount === 1 ? '单局' : `${stake.roundCount}局`;
        return `底分${stake.baseScore} · ${rounds}`;
    }

    private createRoomOption(parent: Node, option: RoomOptionItem, x: number, y: number, width: number, height: number): void {
        const node = new Node(`RoomOption_${option.gameId}_${option.districtId || 0}`);
        node.parent = parent;
        node.addComponent(UITransform).setContentSize(width, height);
        node.setPosition(x, y, 0);
        this.drawRoundRect(node, width, height, COLORS.optionIdle, 8);

        const title = this.createCenteredLabel(node, option.text, 20, COLORS.optionText, width - 20, 24);
        title.node.setPosition(0, 7, 0);
        title.isBold = true;

        const sub = this.createCenteredLabel(node, option.subText, 15, COLORS.optionSubText, width - 20, 20);
        sub.node.setPosition(0, -13, 0);

        const payload = `${option.gameId}|${option.districtId || 0}`;
        this.bindClick(node, 'onRoomOptionClicked', payload);
    }

    private async loadTables(): Promise<void> {
        const seq = ++this.tableLoadSeq;
        const sources = this.getTableSourceOptions();
        if (!this.tableGridNode || sources.length === 0) return;
        this.setStatus('加载桌子中...');

        const tables: TableItem[] = [];
        for (const source of sources) {
            if (seq !== this.tableLoadSeq) return;
            const game = this.games.find((item) => item.id === source.gameId);
            if (!game) continue;

            const venues = source.districtId ? await this.getVenues(source.districtId) : [];
            if (seq !== this.tableLoadSeq) return;
            if (venues.length > 0) {
                const limit = Math.max(1, Math.ceil(8 / sources.length));
                venues.slice(0, limit).forEach((venue) => tables.push(this.toTableItem(game, source, venue)));
            } else {
                tables.push(this.createPlaceholderTable(game, source));
            }
        }

        this.renderTables(tables.slice(0, 8));
    }

    private async getVenues(districtId: number): Promise<DistrictVenueItem[]> {
        try {
            return await GameRoomApi.Instance.getDistrictVenues(districtId);
        } catch (err) {
            console.warn('[GameList] load district venues failed:', districtId, err);
            return [];
        }
    }

    private toTableItem(game: GameMetaInfo, source: RoomOptionItem, venue: DistrictVenueItem): TableItem {
        const anyVenue = venue as any;
        const players = this.normalizePlayers(anyVenue.players || anyVenue.playerList || anyVenue.avatars || []);
        const playerCount = Number(venue.playerCount || players.length || 0);
        return {
            gameId: game.id,
            gameName: game.name,
            roomType: source.text,
            subText: venue.number ? `房号 ${venue.number}` : source.subText,
            districtId: source.districtId,
            venueId: venue.venueId,
            number: venue.number,
            playerCount,
            maxPlayerNums: Number(venue.maxPlayerNums || game.playerCount || Math.max(playerCount, 2)),
            players,
        };
    }

    private createPlaceholderTable(game: GameMetaInfo, source: RoomOptionItem): TableItem {
        return {
            gameId: game.id,
            gameName: game.name,
            roomType: source.text,
            subText: source.subText,
            districtId: source.districtId,
            playerCount: 0,
            maxPlayerNums: game.playerCount || 2,
            players: [],
        };
    }

    private normalizePlayers(players: any[]): RoomPlayerInfo[] {
        if (!Array.isArray(players)) return [];
        return players.filter(Boolean).map((player) => ({
            playerId: player.playerId != null ? String(player.playerId) : undefined,
            nickname: player.nickname || player.name || player.account,
            headUrl: player.headUrl || player.avatar || player.head,
            avatar: player.avatar,
        }));
    }

    private renderTables(tables: TableItem[]): void {
        if (!this.tableGridNode) return;
        this.tableGridNode.children.slice().forEach((child) => {
            if (child.getComponent(Label) === this.statusLabel) return;
            child.destroy();
        });

        if (tables.length === 0) {
            this.setStatus('暂无可展示桌子');
            return;
        }
        this.setStatus('');

        const cols = 4;
        const cardW = 320;
        const cardH = 178;
        const gapX = 64;
        const gapY = 36;
        const totalW = cols * cardW + (cols - 1) * gapX;
        const startX = -totalW / 2 + cardW / 2;
        const startY = 96;

        tables.forEach((table, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = startX + col * (cardW + gapX);
            const y = startY - row * (cardH + gapY);
            this.createTableCard(table, index, x, y, cardW, cardH);
        });
    }

    private createTableCard(table: TableItem, index: number, x: number, y: number, width: number, height: number): void {
        const card = new Node(`Table_${index}`);
        card.parent = this.tableGridNode!;
        card.addComponent(UITransform).setContentSize(width, height);
        card.setPosition(x, y, 0);

        const shadow = card.addComponent(Graphics);
        shadow.fillColor = new Color(18, 16, 22, 72);
        shadow.roundRect(-width / 2 + 8, -height / 2 + 6, width - 16, height - 12, 18);
        shadow.fill();

        const tableNode = new Node('Desk');
        tableNode.parent = card;
        tableNode.addComponent(UITransform).setContentSize(250, 112);
        tableNode.setPosition(0, 26, 0);
        const desk = tableNode.addComponent(Graphics);
        desk.fillColor = COLORS.tableEdge;
        desk.ellipse(0, 0, 128, 58);
        desk.fill();
        desk.fillColor = index % 2 === 0 ? COLORS.tableA : COLORS.tableB;
        desk.ellipse(0, 4, 118, 50);
        desk.fill();

        const title = this.createCenteredLabel(tableNode, table.roomType, 25, COLORS.tableText, 220, 34);
        title.node.setPosition(0, 15, 0);
        title.isBold = true;
        const count = this.createCenteredLabel(tableNode, `${table.playerCount}/${table.maxPlayerNums}`, 21, COLORS.tableSubText, 110, 28);
        count.node.setPosition(0, -18, 0);

        const sub = this.createCenteredLabel(card, table.subText || table.gameName, 16, COLORS.optionSubText, 260, 24);
        sub.node.setPosition(0, -54, 0);

        const seats = [
            { x: -116, y: -42 },
            { x: 116, y: -42 },
            { x: -116, y: 84 },
            { x: 116, y: 84 },
        ];
        const maxSeats = Math.min(Math.max(table.maxPlayerNums, 2), seats.length);
        for (let i = 0; i < maxSeats; i++) {
            const player = table.players[i];
            const occupied = !!player || i < table.playerCount;
            const name = player?.nickname || (occupied ? `玩家${i + 1}` : '空位');
            this.createSeat(card, seats[i].x, seats[i].y, name, player?.headUrl || player?.avatar, occupied);
        }

        const payload = `${table.gameId}|${table.districtId || 0}|${table.venueId || ''}|${table.playerCount}|${table.maxPlayerNums}`;
        this.bindClick(card, 'onRoomTableClicked', payload);
    }

    private createSeat(parent: Node, x: number, y: number, name: string, avatarUrl: string | undefined, occupied: boolean): void {
        const seat = new Node('Seat');
        seat.parent = parent;
        seat.setPosition(x, y, 0);

        const avatar = new Node('Avatar');
        avatar.parent = seat;
        avatar.addComponent(UITransform).setContentSize(44, 44);
        avatar.setPosition(0, 9, 0);
        const bg = avatar.addComponent(Graphics);
        bg.fillColor = occupied ? COLORS.seat : COLORS.seatEmpty;
        bg.ellipse(0, 0, 22, 22);
        bg.fill();

        const initial = this.createCenteredLabel(avatar, occupied ? name.charAt(0) || '玩' : '', 18, COLORS.optionText, 38, 38);
        initial.node.setPosition(0, 0, 0);
        if (avatarUrl) {
            const sprite = avatar.addComponent(Sprite);
            GameManager.Instance.loadSpriteFrame(avatarUrl, (spriteFrame) => {
                if (!avatar.isValid || !spriteFrame) return;
                sprite.spriteFrame = spriteFrame;
                initial.node.active = false;
            });
        }

        const label = this.createCenteredLabel(seat, name, 14, COLORS.seatText, 84, 22);
        label.node.setPosition(0, -25, 0);
    }

    public onGameTabClicked(_event: Event, customEventData: string): void {
        if (!customEventData) return;
        if (customEventData === this.activeTabKey) {
            this.dropdownOpen = !this.dropdownOpen;
            this.renderDropdown();
            return;
        }
        this.activeTabKey = customEventData;
        this.selectedDistrictId = null;
        this.dropdownOpen = true;
        this.refreshTabStyles();
        this.renderDropdown();
        this.loadTables();
    }

    public async onRoomOptionClicked(_event: Event, customEventData: string): Promise<void> {
        const [gameId, districtRaw] = String(customEventData || '').split('|');
        const game = this.games.find((item) => item.id === gameId);
        if (!game) {
            Client.Instance.showPromptTip('游戏尚未开放', 2.0);
            return;
        }
        if (gameId !== this.activeTabKey) {
            this.activeTabKey = game.id;
            this.refreshTabStyles();
        }
        const districtId = Number(districtRaw) || 0;
        if (districtId <= 0) {
            Client.Instance.showPromptTip('请选择具体房间类型', 2.0);
            return;
        }
        this.selectedDistrictId = districtId;
        this.dropdownOpen = false;
        this.renderDropdown();
        await this.enterDistrictForGame(game, districtId);
    }

    public async onRoomTableClicked(_event: Event, customEventData: string): Promise<void> {
        const [gameIdRaw, districtRaw, venueIdRaw, playerCountRaw, maxPlayerRaw] = String(customEventData || '').split('|');
        const gameId = gameIdRaw as GameId;
        const game = this.games.find((item) => item.id === gameId);
        if (!game) {
            Client.Instance.showPromptTip('游戏尚未开放', 2.0);
            return;
        }
        const districtId = Number(districtRaw) || 0;
        if (districtId <= 0) {
            Client.Instance.showPromptTip('请选择具体房间类型', 2.0);
            return;
        }
        const venueId = String(venueIdRaw || '');
        const playerCount = Number(playerCountRaw) || 0;
        const maxPlayers = Number(maxPlayerRaw) || game.playerCount || 2;
        if (venueId && playerCount > 0 && playerCount < maxPlayers) {
            await this.enterVenueForGame(game, venueId, districtId);
        } else {
            await this.enterDistrictForGame(game, districtId);
        }
    }

    public async onGameClicked(_event: Event, customEventData: string | null): Promise<void> {
        if (!customEventData) return;
        const game = this.games.find((item) => item.id === String(customEventData));
        if (!game) {
            Client.Instance.showPromptTip('游戏尚未开放', 2.0);
            return;
        }
        const stake = (GAME_STAKE_OPTIONS[game.id] || []).find((item) => item.districtId > 0);
        if (!stake) {
            Client.Instance.showPromptTip('暂无可用房间区域', 2.0);
            return;
        }
        await this.enterDistrictForGame(game, stake.districtId);
    }

    private async enterDistrictForGame(game: GameMetaInfo, districtId: number): Promise<void> {
        if (this.entering) return;
        const gameType = getServerGameType(game.id);
        if (!gameType) {
            Client.Instance.showPromptDialog('不支持的游戏类型');
            return;
        }
        const stake = this.findStakeByDistrictId(districtId);
        const carryScore = await CarryScorePrompt.requestByRule(this.node, game.id, stake?.baseScore || 0, stake?.roundCount || 8);
        if (carryScore == null) return;

        this.entering = true;
        Client.Instance.showConnecting(true);
        try {
            const result = await GameRoomApi.Instance.joinByDistrict(districtId, carryScore);
            if (!result) {
                Client.Instance.showConnecting(false);
                return;
            }
            GameRoomApi.Instance.enterVenue(result, gameType, () => this.onEnterVenue(game, result));
        } catch (err) {
            console.error('[GameList] Enter district error:', err);
            Client.Instance.showConnecting(false);
            Client.Instance.showPromptDialog('加入失败，请重试');
        } finally {
            this.entering = false;
        }
    }

    private async enterVenueForGame(game: GameMetaInfo, venueId: string, districtId: number): Promise<void> {
        if (this.entering) return;
        const gameType = getServerGameType(game.id);
        if (!gameType) {
            Client.Instance.showPromptDialog('不支持的游戏类型');
            return;
        }
        const stake = this.findStakeByDistrictId(districtId);
        const carryScore = await CarryScorePrompt.requestByRule(this.node, game.id, stake?.baseScore || 0, stake?.roundCount || 8);
        if (carryScore == null) return;

        this.entering = true;
        Client.Instance.showConnecting(true);
        try {
            const result = await GameRoomApi.Instance.joinByVenueId(venueId, gameType, carryScore);
            if (!result) {
                Client.Instance.showConnecting(false);
                return;
            }
            GameRoomApi.Instance.enterVenue(result, gameType, () => this.onEnterVenue(game, result));
        } catch (err) {
            console.error('[GameList] Enter venue error:', err);
            Client.Instance.showConnecting(false);
            Client.Instance.showPromptDialog('加入失败，请重试');
        } finally {
            this.entering = false;
        }
    }

    private findStakeByDistrictId(districtId: number): StakeOption | undefined {
        for (const gameId of Object.keys(GAME_STAKE_OPTIONS)) {
            const stake = (GAME_STAKE_OPTIONS[gameId as GameId] || []).find((item) => item.districtId === districtId);
            if (stake) return stake;
        }
        return undefined;
    }

    private onEnterVenue(game: GameMetaInfo, result: EnterVenueResult): void {
        GameFactory.ensureRoomClassLoaded(game.id)
            .then(() => this.createEnteredRoom(game, result))
            .catch((err) => {
                console.error('[GameList] Load room script error:', err);
                Client.Instance.showPromptDialog('游戏房间加载失败');
            });
    }

    private createEnteredRoom(game: GameMetaInfo, result: EnterVenueResult): void {
        if (game.type === GameType.Mahjong) {
            Client.Instance.initGameRoom(null);
            const room = GameFactory.Instance.createRoom(game.id, Client.Instance.getGameRoomNode() || undefined, undefined);
            room.presetRoomNumber(result?.number || null);
            return;
        }

        ResourceLoader.Instance.loadAsset('GuanDanRoomMain', 'Room', Prefab, (prefab: Prefab) => {
            if (!prefab) {
                Client.Instance.showPromptDialog('游戏房间加载失败');
                return;
            }
            Client.Instance.initGameRoom(prefab, (roomNode) => {
                const room = GameFactory.Instance.createRoom(game.id, undefined, roomNode);
                room.presetRoomNumber(result?.number || null);
            });
        });
    }

    private bindClick(node: Node, handler: string, customData = ''): void {
        const button = node.getComponent(Button) || node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 1.04;
        button.duration = 0.1;

        const clickEvent = new EventHandler();
        clickEvent.target = this.node;
        clickEvent.component = 'GameList';
        clickEvent.handler = handler;
        clickEvent.customEventData = customData;
        button.clickEvents.push(clickEvent);
    }

    private createCenteredLabel(parent: Node, text: string, fontSize: number, color: Color, width: number, height: number): Label {
        const labelNode = new Node('Label');
        labelNode.parent = parent;
        labelNode.addComponent(UITransform).setContentSize(width, height);

        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 4;
        label.overflow = Label.Overflow.SHRINK;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = color;
        return label;
    }

    private drawRoundRect(node: Node, width: number, height: number, color: Color, radius: number): void {
        const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = color;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.fill();
    }

    private setStatus(text: string): void {
        if (this.statusLabel) this.statusLabel.string = text;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }
}
