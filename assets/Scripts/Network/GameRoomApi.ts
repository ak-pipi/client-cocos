/**
 * 游戏房间 HTTP API
 * 对接 web-server /player/game/* 接口（见 COCOS_API_GUIDE.md）
 */

import { GameId } from '../App/GameEnums';
import { GameType as ServerGameType } from '../Common/ConstDefines';
import { GameManager } from '../Manager/GameManager';
import { Client } from '../Game/Client';
import { CommonUtils } from '../Utils/CommonUtils';

/** 进入场地接口返回 */
export interface EnterVenueResult {
    address?: string;
    wsAddress: string;
    venueId: string;
    number?: string;
}

/** GameId → 服务端 gameType */
export const GAME_ID_TO_SERVER_TYPE: Record<string, number> = {
    [GameId.TaojiangMahjong]: ServerGameType.TaojiangMahjong,
    [GameId.HongzhongMahjong]: ServerGameType.HongzhongMahjong,
    [GameId.ChangshaMahjong]: ServerGameType.ChangShaMahjong,
    [GameId.Doudizhu]: ServerGameType.DouDiZhu,
    [GameId.Paodekuai]: ServerGameType.PaoDeKuai,
    [GameId.Waihuzi]: ServerGameType.YiYangWaiHuZi,
    [GameId.Qianfen]: ServerGameType.YuanJiangQianFen,
};

const SUCCESS_CODES = new Set<string | number>(['00000000', 200, '200']);

export function isGameApiSuccess(code: string | number | undefined | null): boolean {
    return code != null && SUCCESS_CODES.has(code);
}

/** 解析创建/加入房间响应（兼容根级字段与 data 嵌套） */
export function parseEnterVenueResponse(dto: any): EnterVenueResult | null {
    if (!dto || !isGameApiSuccess(dto.code)) {
        return null;
    }
    const payload = dto.data && typeof dto.data === 'object' ? dto.data : dto;
    if (!payload?.wsAddress || !payload?.venueId) {
        return null;
    }
    return {
        address: payload.address,
        wsAddress: payload.wsAddress,
        venueId: payload.venueId,
        number: payload.number != null ? String(payload.number) : undefined,
    };
}

export function getServerGameType(gameId: GameId | string): number {
    return GAME_ID_TO_SERVER_TYPE[gameId] || 0;
}

/** 公开房列表项 */
export interface PublicRoomItem {
    venueId: string;
    number: string;
    gameType: number;
    ownerId?: string;
    ownerName?: string;
    ownerHeadUrl?: string;
    mode?: number;
    diZhu?: number;
    deposit?: number;
    playerCount?: number;
    maxPlayerNums?: number;
    base64?: string;
}

/** 区域可加入房间列表项（选桌） */
export interface DistrictVenueItem {
    venueId: string;
    playerCount: number;
    maxPlayerNums: number;
}

/** 麻将战绩项 */
export interface MahjongRecordItem {
    id: number;
    venueId: string;
    number: string;
    roundNo: number;
    banker: number;
    players: Array<{ playerId: string; nickname: string; headUrl?: string }>;
    scores: number[];
    winGolds: number[];
    time: string;
}

/** 分页结果 */
export interface PageResult<T> {
    code: string | number;
    msg?: string;
    pageNum: number;
    total: number;
    records: T[];
}

export class GameRoomApi {
    private static _instance: GameRoomApi | null = null;
    private districtPlayerCountUnavailable = false;

    public static get Instance(): GameRoomApi {
        if (!GameRoomApi._instance) {
            GameRoomApi._instance = new GameRoomApi();
        }
        return GameRoomApi._instance;
    }

    /**
     * 创建房间
     * POST /player/game/create
     */
    async createRoom(gameType: number, params?: Record<string, any>): Promise<EnterVenueResult | null> {
        const roomParams = params || { level: 1 };
        const base64 = CommonUtils.encodeBase64(JSON.stringify(roomParams));
        const dto = await GameManager.Instance.authPost('/player/game/create', {
            gameType,
            base64,
        });
        return this.handleResponse(dto, '创建房间失败');
    }

    /**
     * 通过 6 位房间号加入
     * POST /player/game/enter/number
     */
    async joinByNumber(number: string, gameType: number): Promise<EnterVenueResult | null> {
        const dto = await GameManager.Instance.authPost('/player/game/enter/number', {
            number,
            gameType,
        });
        return this.handleResponse(dto, '加入房间失败');
    }

    /**
     * 通过 venueId 加入
     * POST /player/game/enter
     */
    async joinByVenueId(venueId: string, gameType: number): Promise<EnterVenueResult | null> {
        const dto = await GameManager.Instance.authPost('/player/game/enter', {
            venueId,
            gameType,
        });
        return this.handleResponse(dto, '加入房间失败');
    }

    /**
     * 区域匹配进入
     * POST /player/game/enter/district?districtId={id}
     */
    async joinByDistrict(districtId: number): Promise<EnterVenueResult | null> {
        const url = `/player/game/enter/district?districtId=${districtId}`;
        const dto = await GameManager.Instance.authPost(url, null);
        return this.handleResponse(dto, '加入房间失败');
    }

    /**
     * 查询区域内玩家数量
     * GET /player/game/district/player/count?districtId={id}
     */
    async getDistrictPlayerCount(districtId: number): Promise<number | null> {
        if (this.districtPlayerCountUnavailable) return null;
        const url = `/player/game/district/player/count?districtId=${districtId}`;
        const dto = await GameManager.Instance.authGet(url);
        if (dto?.status === 404 || dto?.code === 404 || dto?.error === 'Not Found') {
            this.districtPlayerCountUnavailable = true;
            return null;
        }
        if (!dto || !isGameApiSuccess(dto.code)) {
            return null;
        }
        const count = dto.data ?? dto.count ?? dto.playerCount;
        const parsed = typeof count === 'number' ? count : Number(count);
        return isFinite(parsed) ? parsed : null;
    }

    /**
     * 批量查询多个 district 的玩家人数
     * 并行调用已有 getDistrictPlayerCount 接口
     */
    async getDistrictPlayerCounts(districtIds: number[]): Promise<Map<number, number>> {
        const results = new Map<number, number>();
        for (const id of districtIds) {
            if (this.districtPlayerCountUnavailable) break;
            try {
                const count = await this.getDistrictPlayerCount(id);
                if (count !== null) results.set(id, count);
            } catch (e) {
                if (String(e).includes('404')) {
                    this.districtPlayerCountUnavailable = true;
                    break;
                }
                console.warn(`[GameRoomApi] Failed to get district ${id} player count`, e);
            }
        }
        return results;
    }

    /**
     * 查询区域内可加入的房间列表（选桌）
     * GET /player/game/district/venues?districtId={id}
     * 返回有空位的房间，满员房间不返回
     */
    async getDistrictVenues(districtId: number): Promise<DistrictVenueItem[]> {
        const url = `/player/game/district/venues?districtId=${districtId}`;
        const dto = await GameManager.Instance.authGet(url);
        if (!dto || !isGameApiSuccess(dto.code)) {
            return [];
        }
        const items = dto.items || [];
        return items as DistrictVenueItem[];
    }

    /**
     * 六安比鸡公开房列表
     * GET /player/game/bi-ji/public
     */
    async getBiJiPublicRooms(): Promise<PublicRoomItem[]> {
        const dto = await GameManager.Instance.authGet('/player/game/bi-ji/public');
        return this.parsePublicRooms(dto);
    }

    /**
     * 百人牛牛公开房列表
     * GET /player/game/niu100/public
     */
    async getNiu100PublicRooms(): Promise<PublicRoomItem[]> {
        const dto = await GameManager.Instance.authGet('/player/game/niu100/public');
        return this.parsePublicRooms(dto);
    }

    /**
     * 麻将游戏记录
     * POST /player/game/mahjong/record
     */
    async getMahjongRecords(pageNum = 1, pageSize = 10): Promise<PageResult<MahjongRecordItem> | null> {
        const dto = await GameManager.Instance.authPost('/player/game/mahjong/record', {
            pageNum,
            pageSize,
        });
        if (!dto) {
            Client.Instance.showPromptDialog('查询战绩失败，服务器无响应');
            return null;
        }
        if (!isGameApiSuccess(dto.code)) {
            Client.Instance.showPromptDialog(`查询战绩失败: ${dto.msg || '未知错误'}`);
            return null;
        }
        return {
            code: dto.code,
            msg: dto.msg,
            pageNum: dto.pageNum ?? pageNum,
            total: dto.total ?? 0,
            records: (dto.records || []) as MahjongRecordItem[],
        };
    }

    /**
     * 进入场地：连接 WebSocket 并发送 MsgEnterVenue
     */
    enterVenue(result: EnterVenueResult, gameType: number, onEnterVenue: () => void): void {
        Client.Instance.showConnecting(true);
        GameManager.Instance.enterVenue(result.wsAddress, result.venueId, gameType, () => {
            Client.Instance.showConnecting(false);
            onEnterVenue();
        });
    }

    private parsePublicRooms(dto: any): PublicRoomItem[] {
        if (!dto || !isGameApiSuccess(dto.code)) {
            const errMsg = dto?.msg || '加载公开房失败';
            Client.Instance.showPromptDialog(errMsg);
            return [];
        }
        return (dto.items || []) as PublicRoomItem[];
    }

    private handleResponse(dto: any, defaultError: string): EnterVenueResult | null {
        if (!dto) {
            Client.Instance.showPromptDialog(`${defaultError}，服务器无响应`);
            return null;
        }
        const result = parseEnterVenueResponse(dto);
        if (result) {
            return result;
        }
        const errCode = dto.code != null ? String(dto.code) : '';
        let errMsg = dto.msg || defaultError;
        if (errCode === '00110003') {
            Client.Instance.showPromptTip('检测到你仍在游戏中，正在尝试重连', 2.0);
            GameManager.Instance.requestHeartbeatAndAutoReenter();
            return null;
        }
        if (errCode === '00120001' || errMsg === 'Venue not exist') {
            errMsg = '房间不存在或已解散';
        }
        Client.Instance.showPromptDialog(`${defaultError}: ${errMsg}`);
        return null;
    }
}
