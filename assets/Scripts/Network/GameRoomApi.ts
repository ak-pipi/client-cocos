/**
 * 游戏房间 HTTP API
 * 对接 web-server /player/game/* 接口（见 COCOS_API_GUIDE.md）
 */

import { decode } from '@msgpack/msgpack/dist.esm/decode.mjs';
import { inflate } from 'pako';
import * as Base64 from 'js-base64';
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

const GAME_RECORD_API: Record<string, { record: string; playback: string; name: string }> = {
    [GameId.TaojiangMahjong]: {
        record: '/player/game/taojiang-mahjong/record',
        playback: '/player/game/taojiang-mahjong/playback',
        name: '桃江麻将',
    },
    [GameId.HongzhongMahjong]: {
        record: '/player/game/hongzhong-mahjong/record',
        playback: '/player/game/hongzhong-mahjong/playback',
        name: '红中麻将',
    },
    [GameId.Paodekuai]: {
        record: '/player/game/paodekuai/record',
        playback: '/player/game/paodekuai/playback',
        name: '跑得快',
    },
    [GameId.ChangshaMahjong]: {
        record: '/player/game/changsha-mahjong/record',
        playback: '/player/game/changsha-mahjong/playback',
        name: '长沙麻将',
    },
};

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

export function getRecordGameName(gameId: GameId | string): string {
    return GAME_RECORD_API[gameId]?.name || '麻将';
}

export function isGameRecordSupported(gameId: GameId | string): boolean {
    return !!GAME_RECORD_API[gameId];
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
    districtId?: number;
    gameType?: number;
    number?: string;
    playerCount: number;
    maxPlayerNums: number;
    baseScore?: number;
    roundCount?: number;
}

/** 麻将战绩项 */
export interface MahjongRecordItem {
    id: number;
    venueId: string;
    number: string;
    roundNo: number;
    banker: number;
    gameType?: number;
    gameName?: string;
    players: Array<{ playerId: string; nickname: string; headUrl?: string } | null>;
    scores: number[];
    winGolds: number[];
    time: string;
    hasReplay?: boolean;
    expireTime?: string;
}

/** 麻将回放数据 */
export interface MahjongPlaybackResult {
    venueId?: string;
    number?: string;
    roundNo?: number;
    banker?: number;
    gameType?: number;
    gameName?: string;
    players?: Array<{ playerId: string; nickname: string; headUrl?: string } | null>;
    base64?: string;
    hasReplay: boolean;
    retentionDays?: number;
    expireTime?: string;
    format?: string;
    codec?: string;
    time?: string;
    replay?: any;
    compressedSize?: number;
    rawSize?: number;
    actionCount?: number;
    actorCount?: number;
    playerCount?: number;
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
        return this.parseRecordPage(dto, pageNum, '查询战绩失败');
    }

    async getTaojiangMahjongRecords(pageNum = 1, pageSize = 10): Promise<PageResult<MahjongRecordItem> | null> {
        return this.getGameRecords(GameId.TaojiangMahjong, pageNum, pageSize);
    }

    async getHongzhongMahjongRecords(pageNum = 1, pageSize = 10): Promise<PageResult<MahjongRecordItem> | null> {
        return this.getGameRecords(GameId.HongzhongMahjong, pageNum, pageSize);
    }

    async getPaodekuaiRecords(pageNum = 1, pageSize = 10): Promise<PageResult<MahjongRecordItem> | null> {
        return this.getGameRecords(GameId.Paodekuai, pageNum, pageSize);
    }

    async getChangshaMahjongRecords(pageNum = 1, pageSize = 10): Promise<PageResult<MahjongRecordItem> | null> {
        return this.getGameRecords(GameId.ChangshaMahjong, pageNum, pageSize);
    }

    async getGameRecords(gameId: GameId | string, pageNum = 1, pageSize = 10): Promise<PageResult<MahjongRecordItem> | null> {
        const api = GAME_RECORD_API[gameId];
        if (!api) {
            Client.Instance.showPromptDialog('当前游戏暂未开放回放战绩');
            return null;
        }
        const dto = await GameManager.Instance.authPost(api.record, {
            pageNum,
            pageSize,
        });
        return this.parseRecordPage(dto, pageNum, `查询${api.name}战绩失败`);
    }

    async getGameRecordsForRoom(gameId: GameId | string, venueId?: string, number?: string): Promise<MahjongRecordItem[]> {
        const records: MahjongRecordItem[] = [];
        const pageSize = 50;
        const maxPages = 8;
        for (let page = 1; page <= maxPages; page++) {
            const result = await this.getGameRecords(gameId, page, pageSize);
            if (!result) break;
            const pageRecords = result.records || [];
            for (const record of pageRecords) {
                const sameVenue = !!venueId && String(record.venueId) === String(venueId);
                const sameNumber = !!number && String(record.number) === String(number);
                if (sameVenue || sameNumber) records.push(record);
            }
            if (page * pageSize >= (result.total || 0) || pageRecords.length === 0) break;
        }
        const map = new Map<number, MahjongRecordItem>();
        for (const record of records) map.set(record.id, record);
        return Array.from(map.values()).sort((a, b) => (a.roundNo || 0) - (b.roundNo || 0));
    }

    async findGameRecordForRoomRound(gameId: GameId | string, roundNo: number, venueId?: string, number?: string): Promise<MahjongRecordItem | null> {
        const records = await this.getGameRecordsForRoom(gameId, venueId, number);
        if (records.length === 0) return null;
        const exact = records.find((r) => Number(r.roundNo) === Number(roundNo));
        return exact || records[records.length - 1] || null;
    }

    private parseRecordPage(dto: any, pageNum: number, defaultError: string): PageResult<MahjongRecordItem> | null {
        if (!dto) {
            Client.Instance.showPromptDialog(`${defaultError}，服务器无响应`);
            return null;
        }
        if (!isGameApiSuccess(dto.code)) {
            Client.Instance.showPromptDialog(`${defaultError}: ${dto.msg || '未知错误'}`);
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
     * 麻将牌局回放
     * GET /player/game/mahjong/playback?id={recordId}
     */
    async getMahjongPlayback(recordId: number): Promise<MahjongPlaybackResult | null> {
        const dto = await GameManager.Instance.authGet(`/player/game/mahjong/playback?id=${recordId}`);
        return this.parsePlaybackResponse(dto, '加载回放失败');
    }

    async getTaojiangMahjongPlayback(recordId: number): Promise<MahjongPlaybackResult | null> {
        return this.getGamePlayback(GameId.TaojiangMahjong, recordId);
    }

    async getHongzhongMahjongPlayback(recordId: number): Promise<MahjongPlaybackResult | null> {
        return this.getGamePlayback(GameId.HongzhongMahjong, recordId);
    }

    async getPaodekuaiPlayback(recordId: number): Promise<MahjongPlaybackResult | null> {
        return this.getGamePlayback(GameId.Paodekuai, recordId);
    }

    async getChangshaMahjongPlayback(recordId: number): Promise<MahjongPlaybackResult | null> {
        return this.getGamePlayback(GameId.ChangshaMahjong, recordId);
    }

    async getGamePlayback(gameId: GameId | string, recordId: number): Promise<MahjongPlaybackResult | null> {
        const api = GAME_RECORD_API[gameId];
        if (!api) {
            Client.Instance.showPromptDialog('当前游戏暂未开放回放');
            return null;
        }
        const dto = await GameManager.Instance.authGet(`${api.playback}?id=${recordId}`);
        return this.parsePlaybackResponse(dto, `加载${api.name}回放失败`);
    }

    private parsePlaybackResponse(dto: any, defaultError: string): MahjongPlaybackResult | null {
        if (!dto) {
            Client.Instance.showPromptDialog(`${defaultError}，服务器无响应`);
            return null;
        }
        if (!isGameApiSuccess(dto.code)) {
            Client.Instance.showPromptDialog(`${defaultError}: ${dto.msg || '未知错误'}`);
            return null;
        }
        const payload = dto.data && typeof dto.data === 'object' ? dto.data : dto;
        const base64 = payload.base64 ?? dto.base64 ?? (typeof dto.data === 'string' ? dto.data : undefined);
        const hasReplay = Boolean(payload.hasReplay ?? dto.hasReplay ?? base64);
        if (!hasReplay || !base64) {
            const msg = dto.msg && dto.msg !== '操作成功' ? dto.msg : '牌局回放数据不存在或已超过追溯期';
            Client.Instance.showPromptDialog(msg);
            return {
                ...payload,
                hasReplay: false,
                retentionDays: payload.retentionDays ?? dto.retentionDays,
                expireTime: payload.expireTime ?? dto.expireTime,
                format: payload.format ?? dto.format,
                codec: payload.codec ?? dto.codec,
            };
        }
        const decoded = this.decodeGameReplay(base64);
        return {
            ...payload,
            base64,
            hasReplay: true,
            replay: decoded?.replay,
            compressedSize: decoded?.compressedSize,
            rawSize: decoded?.rawSize,
            actionCount: decoded?.actionCount,
            actorCount: decoded?.actorCount,
            playerCount: decoded?.playerCount || payload.players?.length,
        } as MahjongPlaybackResult;
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

    private decodeGameReplay(base64: string): {
        replay: any;
        compressedSize: number;
        rawSize: number;
        actionCount: number;
        actorCount: number;
        playerCount: number;
    } | null {
        try {
            const compressed = (Base64 as any).Base64.toUint8Array(base64);
            const raw = inflate(compressed);
            const replay = decode(raw);
            const actions = this.getReplayField(replay, 'actions', 2);
            const steps = this.getReplayField(replay, 'steps', 7);
            const actors = this.getReplayField(replay, 'actors', 3);
            const dealedTiles = this.getReplayField(replay, 'dealedTiles', 0);
            const replayPlayerCount = Number(this.getReplayField(replay, 'playerCount', 3));
            return {
                replay,
                compressedSize: compressed.length,
                rawSize: raw.length,
                actionCount: Array.isArray(actions) ? actions.length : (Array.isArray(steps) ? steps.length : 0),
                actorCount: Array.isArray(actors) ? actors.length : 0,
                playerCount: Array.isArray(dealedTiles) ? dealedTiles.length : (isFinite(replayPlayerCount) ? replayPlayerCount : 0),
            };
        } catch (err) {
            console.error('[GameRoomApi] decode replay failed:', err);
            return null;
        }
    }

    private getReplayField(replay: any, key: string, index: number): any {
        if (replay == null) return null;
        if (Array.isArray(replay)) return replay[index];
        return replay[key] ?? replay[String(index)] ?? replay[index];
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
        if (this.isInsufficientCarryError(errCode, errMsg)) {
            errMsg = '携带积分不足，保险柜中的积分不参与游戏结算，请先从保险柜取出积分后再加入';
        }
        Client.Instance.showPromptDialog(`${defaultError}: ${errMsg}`);
        return null;
    }

    private isInsufficientCarryError(errCode: string, errMsg: string): boolean {
        if (errCode === '00120002' || errCode === '00120005') return true;
        const text = String(errMsg || '').toLowerCase();
        return text.includes('金币不足')
            || text.includes('余额不足')
            || text.includes('积分不足')
            || text.includes('gold insufficient')
            || text.includes('insufficient gold')
            || text.includes('insufficient balance');
    }
}
