/**
 * 游戏房间工厂 (GameFactory)
 * 统一的游戏实例创建与路由入口
 * 
 * 职责：
 * - 根据 gameId 创建对应游戏房间实例
 * - 管理当前活跃的游戏实例
 * - 游戏生命周期管理(创建/销毁/切换)
 * - 统一的事件分发入口
 *
 * Author: AI Assistant
 */

import { Node, director } from 'cc';
import { RoomBase, RoomInfo } from '../GameCommon/RoomBase';
import { MahjongRoomBase, MahjongTile, AvailableActions as MjActions } from '../GameCommon/MahjongRoomBase';
import { PokerRoomBase, PokerCard, PokerAvailableActions as PkActions } from '../GameCommon/PokerRoomBase';
import { ZipaiRoomBase, ZipaiTile, ZipaiAvailableActions as ZpActions } from '../GameCommon/ZipaiRoomBase';

// 具体游戏导入
import { TaojiangMahjongRoom } from '../Games/TaojiangMahjong/TaojiangMahjongRoom';
import { HongzhongMahjongRoom } from '../Games/HongzhongMahjong/HongzhongMahjongRoom';
import { ChangshaMahjongRoom } from '../Games/ChangshaMahjong/ChangshaMahjongRoom';
import { PaodekuaiRoom } from '../Games/Paodekuai/PaodekuaiRoom';
import { WaihuziRoom } from '../Games/Waihuzi/WaihuziRoom';
import { QianfenRoom } from '../Games/Qianfen/QianfenRoom';

// ==================== 游戏注册表 ====================

/** 支持的所有游戏ID */
export enum GameId {
    TaojiangMahjong = 'taojiang_mahjong',
    HongzhongMahjong = 'hongzhong_mahjong',
    ChangshaMahjong = 'changsha_mahjong',
    Paodekuai = 'paodekuai_poker',
    Waihuzi = 'yiyangwaihuzi_zipai',
    Qianfen = 'yuanjiangqianfen_poker',
}

/** 游戏类型分类 */
export enum GameType {
    Mahjong = 'mahjong',   // 麻将类
    Poker = 'poker',       // 扑克类
    Zipai = 'zipai',       // 字牌类
}

/** 游戏元信息 */
export interface GameMetaInfo {
    id: GameId;
    name: string;          // 中文名称
    type: GameType;        // 类型分类
    playerCount: number;   // 玩家数量
    priority: number;      // 优先级(P0=0, P1=1, P2=2)
}

// ==================== 注册表 ====================

const GAME_REGISTRY: Map<GameId, GameMetaInfo> = new Map([
    [GameId.TaojiangMahjong, {
        id: GameId.TaojiangMahjong,
        name: '桃江麻将',
        type: GameType.Mahjong,
        playerCount: 4,
        priority: 0,
    }],
    [GameId.HongzhongMahjong, {
        id: GameId.HongzhongMahjong,
        name: '红中麻将',
        type: GameType.Mahjong,
        playerCount: 4,
        priority: 0,
    }],
    [GameId.ChangshaMahjong, {
        id: GameId.ChangshaMahjong,
        name: '长沙麻将',
        type: GameType.Mahjong,
        playerCount: 4,
        priority: 1,
    }],
    [GameId.Paodekuai, {
        id: GameId.Paodekuai,
        name: '跑得快',
        type: GameType.Poker,
        playerCount: 3,
        priority: 1,
    }],
    [GameId.Waihuzi, {
        id: GameId.Waihuzi,
        name: '益阳歪胡子',
        type: GameType.Zipai,
        playerCount: 2,
        priority: 2,
    }],
    [GameId.Qianfen, {
        id: GameId.Qianfen,
        name: '沅江千分',
        type: GameType.Poker,
        playerCount: 4,
        priority: 2,
    }],
]);

export class GameFactory {
    private static _instance: GameFactory | null = null;

    /** 当前活跃的游戏房间实例 */
    private currentRoom: RoomBase | null = null;

    /** 当前游戏ID */
    private currentGameId: GameId | null = null;

    /** 单例 */
    public static get Instance(): GameFactory {
        if (!GameFactory._instance) {
            GameFactory._instance = new GameFactory();
        }
        return GameFactory._instance;
    }

    private constructor() {}

    // ==================== 查询接口 ====================

    /**
     * 获取所有支持的游戏列表
     */
    public static getAllGames(): GameMetaInfo[] {
        return [...GAME_REGISTRY.values()].sort((a, b) => a.priority - b.priority);
    }

    /**
     * 获取游戏元信息
     */
    public static getGameMeta(gameId: GameId): GameMetaInfo | undefined {
        return GAME_REGISTRY.get(gameId);
    }

    /**
     * 根据类型获取游戏列表
     */
    public static getGamesByType(type: GameType): GameMetaInfo[] {
        return GameFactory.getAllGames().filter(g => g.type === type);
    }

    // ==================== 房间实例管理 ====================

    /**
     * 创建游戏房间
     * @param gameId 游戏ID
     * @param parentNode 父节点(挂载到场景中)
     * @returns 房间实例
     */
    public createRoom(gameId: GameId, parentNode?: Node): RoomBase {
        // 先销毁已有房间
        this.destroyCurrentRoom();

        let roomNode: Node;
        let room: RoomBase;

        switch (gameId) {
            case GameId.TaojiangMahjong:
                roomNode = new Node('TaojiangMahjongRoom');
                if (parentNode) roomNode.parent = parentNode;
                room = roomNode.addComponent(TaojiangMahjongRoom);
                break;

            case GameId.HongzhongMahjong:
                roomNode = new Node('HongzhongMahjongRoom');
                if (parentNode) roomNode.parent = parentNode;
                room = roomNode.addComponent(HongzhongMahjongRoom);
                break;

            case GameId.ChangshaMahjong:
                roomNode = new Node('ChangshaMahjongRoom');
                if (parentNode) roomNode.parent = parentNode;
                room = roomNode.addComponent(ChangshaMahjongRoom);
                break;

            case GameId.Paodekuai:
                roomNode = new Node('PaodekuaiRoom');
                if (parentNode) roomNode.parent = parentNode;
                room = roomNode.addComponent(PaodekuaiRoom);
                break;

            case GameId.Waihuzi:
                roomNode = new Node('WaihuziRoom');
                if (parentNode) roomNode.parent = parentNode;
                room = roomNode.addComponent(WaihuziRoom);
                break;

            case GameId.Qianfen:
                roomNode = new Node('QianfenRoom');
                if (parentNode) roomNode.parent = parentNode;
                room = roomNode.addComponent(QianfenRoom);
                break;

            default:
                throw new Error(`[GameFactory] Unknown game ID: ${gameId}`);
        }

        this.currentRoom = room;
        this.currentGameId = gameId;
        console.log(`[GameFactory] Created room for ${GAME_REGISTRY.get(gameId)?.name || gameId}`);

        return room;
    }

    /**
     * 获取当前房间实例
     */
    public getCurrentRoom(): RoomBase | null {
        return this.currentRoom;
    }

    /**
     * 获取当前游戏ID
     */
    public getCurrentGameId(): GameId | null {
        return this.currentGameId;
    }

    /**
     * 获取当前游戏类型
     */
    public getCurrentGameType(): GameType | null {
        if (!this.currentGameId) return null;
        const meta = GAME_REGISTRY.get(this.currentGameId);
        return meta?.type || null;
    }

    /**
     * 销毁当前房间
     */
    public destroyCurrentRoom(): void {
        if (this.currentRoom) {
            this.currentRoom.cleanup();
            if (this.currentRoom.node) {
                this.currentRoom.node.destroy();
            }
            this.currentRoom = null;
            this.currentGameId = null;
            console.log('[GameFactory] Current room destroyed');
        }
    }

    // ==================== 类型安全访问器 ====================

    /**
     * 获取麻将房间(类型安全)
     */
    public getAsMahjongRoom(): MahjongRoomBase | null {
        if (this.currentRoom instanceof MahjongRoomBase) {
            return this.currentRoom as MahjongRoomBase;
        }
        return null;
    }

    /**
     * 获取扑克房间(类型安全)
     */
    public getAsPokerRoom(): PokerRoomBase | null {
        if (this.currentRoom instanceof PokerRoomBase) {
            return this.currentRoom as PokerRoomBase;
        }
        return null;
    }

    /**
     * 获取字牌房间(类型安全)
     */
    public getAsZipaiRoom(): ZipaiRoomBase | null {
        if (this.currentRoom instanceof ZipaiRoomBase) {
            return this.currentRoom as ZipaiRoomBase;
        }
        return null;
    }

    // ==================== 统一事件分发 ====================

    /**
     * 将服务端WS事件分发到当前游戏房间
     * 这是网络层与游戏层之间的桥梁
     *
     * @param eventType 事件类型
     * @param data 事件数据
     * @returns 是否成功处理
     */
    public dispatchServerEvent(eventType: string, data: any): boolean {
        if (!this.currentRoom) {
            console.warn('[GameFactory] No active room to dispatch event:', eventType);
            return false;
        }

        const gameType = this.getCurrentGameType();
        
        switch (eventType) {
            // ---- 通用事件 ----
            case 'room_update':
                return (this.currentRoom as any).handleRoomUpdate?.(data) ?? false;

            case 'game_start':
                return (this.currentRoom as any).handleGameStart?.(data) ?? false;

            case 'round_settlement':
                return (this.currentRoom as any).handleRoundSettlement?.(data) ?? false;

            case 'final_settlement':
                return (this.currentRoom as any).handleFinalSettlement?.(data) ?? false;

            // ---- 麻将特有事件 ----
            case 'deal':
                if (gameType === GameType.Mahjong && this.currentRoom instanceof MahjongRoomBase) {
                    this.currentRoom.onServerDeal(data.tiles || [], data.xing);
                    return true;
                }
                break;

            case 'draw_tile':
                if (gameType === GameType.Mahjong && this.currentRoom instanceof MahjongRoomBase) {
                    this.currentRoom.drawTile(data.tile);
                    return true;
                }
                break;

            case 'request_actions':
                if (this.currentRoom instanceof MahjongRoomBase) {
                    this.currentRoom.onRequestActions(data as MjActions);
                    return true;
                }
                break;

            case 'player_discard':
                if (gameType === GameType.Mahjong && this.currentRoom instanceof MahjongRoomBase) {
                    this.currentRoom.onPlayerDiscord(data.seatIndex, data.tile);
                    return true;
                }
                break;

            // ---- 扑克特有事件 ----
            case 'deal_cards':
                if (gameType === GameType.Poker && this.currentRoom instanceof PokerRoomBase) {
                    this.currentRoom.dealCards(data.cards || []);
                    return true;
                }
                break;

            case 'request_play':
                if (this.currentRoom instanceof PokerRoomBase) {
                    this.currentRoom.showPokerActionPanel(data as PkActions);
                    return true;
                }
                break;

            case 'player_play':
                if (gameType === GameType.Poker && this.currentRoom instanceof PokerRoomBase) {
                    this.currentRoom.onOtherPlayerPlay(data.seatIndex, data.play);
                    return true;
                }
                break;

            case 'round_end':
                if (this.currentRoom instanceof PaodekuaiRoom) {
                    this.currentRoom.onPlayRoundEnd(data.winnerSeat, data.plays);
                    return true;
                }
                break;

            case 'game_over':
                if (this.currentRoom instanceof PaodekuaiRoom) {
                    this.currentRoom.onGameOver(data.rankings);
                    return true;
                }
                break;

            // ---- 字牌特有事件 ----
            case 'zipai_deal':
                if (gameType === GameType.Zipai && this.currentRoom instanceof ZipaiRoomBase) {
                    this.currentRoom.dealTiles(data.tiles || []);
                    return true;
                }
                break;

            case 'request_zipai_actions':
                if (this.currentRoom instanceof ZipaiRoomBase) {
                    this.currentRoom.showActionPanel(data as ZpActions);
                    return true;
                }
                break;

            default:
                // 尝试通过基类的通用处理
                console.log(`[GameFactory] Unhandled event type: ${eventType}, trying base handler`);
                return false;
        }

        return false;
    }
}
