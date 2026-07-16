/**
 * 游戏房间工厂 (GameFactory)
 * 统一的游戏实例创建与路由入口
 *
 * 设计说明（v3 - 彻底解决 Cocos Creator packer-driver 跨 chunk 问题）：
 * - Cocos Creator 3.x 的 packer-driver 将 @ccclass 类做特殊处理
 *   跨 chunk 静态 import + addComponent(Class) 会导致 "is not defined"
 *   静态 import Room 模块会导致循环依赖 (GameLoader → Room → RoomBase → Client → GameLoader)
 * - 解决方案：通过 cc.js.getClassByName 字符串查找已注册的 @ccclass 类
 *   不直接 import Room 模块，避免循环依赖和跨 chunk 符号访问问题
 *   Cocos Creator 编辑器预览时 packer-driver 会自动加载所有脚本模块
 *
 * Author: AI Assistant
 */

import { Node, Button, js } from 'cc';
import { RoomBase } from '../GameCommon/RoomBase';
import { MahjongRoomBase } from '../GameCommon/MahjongRoomBase';
import { PokerRoomBase } from '../GameCommon/PokerRoomBase';
import { ZipaiRoomBase } from '../GameCommon/ZipaiRoomBase';
import { NetMsgManager } from '../Manager/NetMsgManager';
import { NetworkManager } from '../Manager/NetworkManager';

import { GameId, GameType, GameMetaInfo } from './GameEnums';

export type { GameId, GameType, GameMetaInfo } from './GameEnums';

/** 房间组件类型 */
type RoomComponentCtor = new () => RoomBase;

/** gameId → @ccclass 名称映射 */
const GAME_CLASS_NAMES: Record<GameId, string> = {
    [GameId.TaojiangMahjong]: 'TaojiangMahjongRoom',
    [GameId.HongzhongMahjong]: 'HongzhongMahjongRoom',
    [GameId.ChangshaMahjong]: 'ChangshaMahjongRoom',
    [GameId.Doudizhu]: 'DoudizhuRoom',
    [GameId.Paodekuai]: 'PaodekuaiRoom',
    [GameId.Waihuzi]: 'WaihuziRoom',
    [GameId.Qianfen]: 'QianfenRoom',
};

// ==================== 注册表 ====================

const GAME_REGISTRY: Map<GameId, GameMetaInfo> = new Map([
    [GameId.TaojiangMahjong, {
        id: GameId.TaojiangMahjong,
        name: '桃江麻将',
        type: GameType.Mahjong,
        playerCount: 2,
        priority: 0,
    }],
    [GameId.HongzhongMahjong, {
        id: GameId.HongzhongMahjong,
        name: '红中麻将',
        type: GameType.Mahjong,
        playerCount: 2,
        priority: 0,
    }],
    [GameId.ChangshaMahjong, {
        id: GameId.ChangshaMahjong,
        name: '长沙麻将',
        type: GameType.Mahjong,
        playerCount: 4,
        priority: 1,
    }],
    [GameId.Doudizhu, {
        id: GameId.Doudizhu,
        name: '斗地主',
        type: GameType.Poker,
        playerCount: 2,
        priority: 1,
    }],
    [GameId.Paodekuai, {
        id: GameId.Paodekuai,
        name: '跑得快',
        type: GameType.Poker,
        playerCount: 2,
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
     * 获取房间组件类（通过 cc.js.getClassByName 查找 @ccclass 注册的类）
     * 这种方式不依赖跨 chunk 的变量引用，避免 packer-driver 的符号访问问题
     */
    private static getRoomClass(gameId: GameId): RoomComponentCtor {
        const className = GAME_CLASS_NAMES[gameId];
        if (!className) {
            throw new Error(`[GameFactory] No class name mapped for game: ${gameId}`);
        }

        const ctor = js.getClassByName(className) as RoomComponentCtor;
        if (!ctor) {
            throw new Error(`[GameFactory] Class "${className}" not found via cc.js.getClassByName. Ensure the Room script is included in the project and has @ccclass('${className}') decorator.`);
        }
        return ctor;
    }

    public static async ensureRoomClassLoaded(gameId: GameId): Promise<void> {
        const className = GAME_CLASS_NAMES[gameId];
        if (!className) {
            throw new Error(`[GameFactory] No class name mapped for game: ${gameId}`);
        }
        if (js.getClassByName(className)) return;

        switch (gameId) {
            case GameId.TaojiangMahjong:
                await import('../Games/TaojiangMahjong/TaojiangMahjongRoom');
                break;
            case GameId.HongzhongMahjong:
                await import('../Games/HongzhongMahjong/HongzhongMahjongRoom');
                break;
            case GameId.ChangshaMahjong:
                await import('../Games/ChangshaMahjong/ChangshaMahjongRoom');
                break;
            case GameId.Doudizhu:
                await import('../Games/Doudizhu/DoudizhuRoom');
                break;
            case GameId.Paodekuai:
                await import('../Games/Paodekuai/PaodekuaiRoom');
                break;
            case GameId.Waihuzi:
                await import('../Games/Waihuzi/WaihuziRoom');
                break;
            case GameId.Qianfen:
                await import('../Games/Qianfen/QianfenRoom');
                break;
        }

        if (!js.getClassByName(className)) {
            throw new Error(`[GameFactory] Class "${className}" still not registered after dynamic import.`);
        }
    }

    /**
     * 创建游戏房间
     * @param gameId 游戏ID
     * @param parentNode 父节点(挂载到场景中)
     * @param prefabNode 已实例化的 GuanDan Room.prefab 节点（可选，复用其 UI）
     * @returns 房间实例
     */
    public createRoom(gameId: GameId, parentNode?: Node, prefabNode?: Node): RoomBase {
        // 先销毁已有房间
        this.destroyCurrentRoom();

        // 通过 cc.js.getClassByName 获取房间组件类
        const RoomCtor = GameFactory.getRoomClass(gameId);

        let roomNode: Node;
        if (prefabNode) {
            // 复用已有 prefab 节点：禁用所有已有的 NetMsgHandler 组件避免消息冲突
            roomNode = prefabNode;
            // 遍历节点上所有组件，找到实现了 onMessage 的（即 NetMsgHandler）并禁用
            const comps = roomNode.components;
            for (let i = 0; i < comps.length; i++) {
                const comp = comps[i] as any;
                if (comp && typeof comp.onMessage === 'function') {
                    NetMsgManager.Instance.unregisterHandler(comp);
                    NetworkManager.Instance.unregisterHandler(comp);
                    comp.enabled = false;
                    console.log('[GameFactory] Disabled existing handler:', comp.constructor?.name || comp.name);
                }
            }
        } else {
            // 无 prefab 时创建空节点（兼容旧路径）
            const nodeName = GAME_REGISTRY.get(gameId)?.name || String(gameId);
            roomNode = new Node(`${nodeName}Room`);
            if (parentNode) roomNode.parent = parentNode;
        }

        const room = roomNode.addComponent(RoomCtor) as RoomBase;

        // 触发 prefab UI 节点绑定
        if (prefabNode) {
            (room as any).bindPrefabNodes?.();
            this.rebindPrefabButtonHandlers(roomNode, room);
        }

        this.currentRoom = room;
        this.currentGameId = gameId;
        console.log(`[GameFactory] Created room for ${GAME_REGISTRY.get(gameId)?.name || gameId}`);

        return room;
    }

    /**
     * 复用旧 prefab 时，将可兼容的按钮事件转发到新房间组件。
     * 只重绑新组件中确实存在的方法，避免误改旧房间专属按钮。
     */
    private rebindPrefabButtonHandlers(root: Node, room: RoomBase): void {
        const componentName = js.getClassName(room);
        if (!componentName) return;

        let reboundCount = 0;
        const queue: Node[] = [root];
        while (queue.length > 0) {
            const node = queue.shift()!;
            const button = node.getComponent(Button);
            if (button?.clickEvents?.length) {
                for (const evt of button.clickEvents) {
                    if (!evt || evt.target !== root) continue;
                    if (!evt.handler || typeof (room as any)[evt.handler] !== 'function') continue;
                    evt.target = root;
                    evt.component = componentName;
                    (evt as any)._componentId = '';
                    reboundCount++;
                }
            }
            queue.push(...node.children);
        }

        if (reboundCount > 0) {
            console.log(`[GameFactory] Rebound ${reboundCount} prefab button events to ${componentName}`);
        }
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
            (this.currentRoom as any).cleanup?.();
            // 移除游戏组件但不销毁节点（Client 拥有 prefab 节点生命周期）
            if (this.currentRoom.node) {
                this.currentRoom.node.removeComponent(this.currentRoom.constructor as any);
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
                    (this.currentRoom as any).onServerDeal?.(data.tiles || [], data.xing);
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
                    (this.currentRoom as any).onRequestActions?.(data);
                    return true;
                }
                break;

            case 'player_discard':
                if (gameType === GameType.Mahjong && this.currentRoom instanceof MahjongRoomBase) {
                    (this.currentRoom as any).onPlayerDiscard?.(data.seatIndex, data.tile);
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
                    this.currentRoom.showPokerActionPanel(data);
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
                if (this.currentGameId === GameId.Paodekuai) {
                    (this.currentRoom as any).onPlayRoundEnd?.(data.winnerSeat, data.plays);
                    return true;
                }
                break;

            case 'game_over':
                if (this.currentGameId === GameId.Paodekuai) {
                    (this.currentRoom as any).onGameOver?.(data.rankings);
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
                    this.currentRoom.showActionPanel(data);
                    return true;
                }
                break;

            default:
                console.log(`[GameFactory] Unhandled event type: ${eventType}, trying base handler`);
                return false;
        }

        return false;
    }
}
