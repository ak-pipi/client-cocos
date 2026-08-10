/**
 * HTTP API 服务层
 * 统一封装 HTTP 接口，兼容旧 /player/... 和新 /api/... 风格
 *
 * Author: AI Assistant
 */

import { GameManager } from '../Manager/GameManager';
import { CommonUtils } from '../Utils/CommonUtils';
import { GameRoomApi } from './GameRoomApi';

/** API 响应通用结构 */
export interface ApiResponse<T = any> {
    code: string | number;
    msg?: string;
    data?: T;
}

/** API 配置选项 */
export interface ApiOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
    useAuth?: boolean;
    /** 是否使用新 API 路径前缀 */
    useNewApi?: boolean;
}

export class ApiService {
    private static _instance: ApiService | null = null;

    public static get Instance(): ApiService {
        if (!ApiService._instance) {
            ApiService._instance = new ApiService();
        }
        return ApiService._instance;
    }

    /** 新版 API 前缀 */
    private readonly NEW_API_PREFIX = '/api';

    /** 旧版 API 前缀 */
    private readonly OLD_API_PREFIX = '/player';

    /**
     * 发送请求
     */
    async request<T = any>(path: string, options: ApiOptions = {}): Promise<ApiResponse<T>> {
        const {
            method = 'POST',
            body,
            headers = {},
            useAuth = true,
            useNewApi = false,
        } = options;

        const url = this.buildUrl(path, useNewApi);

        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json;charset=utf-8',
            ...headers,
        };

        // 添加鉴权头
        if (useAuth && !CommonUtils.isStringEmpty(GameManager.Instance.Token)) {
            requestHeaders['Authorization'] = `Bearer ${GameManager.Instance.Token}`;
            // 兼容旧鉴权头
            requestHeaders['PLAYER-AUTHORIZATION'] = GameManager.Instance.Token;
        }

        try {
            const response = await fetch(url, {
                method,
                headers: requestHeaders,
                body: method !== 'GET' ? JSON.stringify(body) : undefined,
            });

            const data = await response.json();
            return data as ApiResponse<T>;
        } catch (error) {
            console.error(`[ApiService] Request failed [${method}] ${url}:`, error);
            return {
                code: -1,
                msg: String(error),
            };
        }
    }

    /**
     * GET 请求
     */
    async get<T = any>(path: string, useNewApi = false): Promise<ApiResponse<T>> {
        return this.request<T>(path, { method: 'GET', useNewApi });
    }

    /**
     * POST 请求
     */
    async post<T = any>(path: string, body?: any, useNewApi = false): Promise<ApiResponse<T>> {
        return this.request<T>(path, { method: 'POST', body, useNewApi });
    }

    // ==================== 新版 API 接口 ====================

    /** 统一登录 */
    async authLogin(data: { phone: string; code: string }) {
        return this.post('/auth/login', data, true);
    }

    /** 游戏列表 */
    async getGames() {
        return this.get('/lobby/games', true);
    }

    /** 创建房间（新版 API） */
    async createRoom(data: { gameId: string; ruleConfig: any }) {
        return this.post('/rooms', data, true);
    }

    /** 加入房间（新版 API） */
    async joinRoom(roomNo: string) {
        return this.post(`/rooms/${roomNo}/join`, null, true);
    }

    // ==================== 游戏房间 API（web-server /player/game/*） ====================

    /** 创建游戏房间 */
    async createGameRoom(gameType: number, params?: Record<string, any>, carryScore?: number) {
        return GameRoomApi.Instance.createRoom(gameType, params, carryScore);
    }

    /** 通过房间号加入 */
    async joinGameRoomByNumber(number: string, gameType: number, carryScore?: number) {
        return GameRoomApi.Instance.joinByNumber(number, gameType, carryScore);
    }

    /** 通过 venueId 加入 */
    async joinGameRoomByVenueId(venueId: string, gameType: number, carryScore?: number) {
        return GameRoomApi.Instance.joinByVenueId(venueId, gameType, carryScore);
    }

    /** 区域匹配进入 */
    async joinGameRoomByDistrict(districtId: number, carryScore?: number) {
        return GameRoomApi.Instance.joinByDistrict(districtId, carryScore);
    }

    /** 查询区域玩家数量 */
    async getDistrictPlayerCount(districtId: number) {
        return GameRoomApi.Instance.getDistrictPlayerCount(districtId);
    }

    /** 六安比鸡公开房列表 */
    async getBiJiPublicRooms() {
        return GameRoomApi.Instance.getBiJiPublicRooms();
    }

    /** 百人牛牛公开房列表 */
    async getNiu100PublicRooms() {
        return GameRoomApi.Instance.getNiu100PublicRooms();
    }

    /** 麻将战绩 */
    async getMahjongRecords(pageNum = 1, pageSize = 10) {
        return GameRoomApi.Instance.getMahjongRecords(pageNum, pageSize);
    }

    /** 战绩查询 */
    async getRecords(params?: { page?: number; limit?: number }) {
        const query = params ? `?page=${params.page || 1}&limit=${params.limit || 20}` : '';
        return this.get(`/users/me/records${query}`, true);
    }

    /** 版本检测 */
    async checkVersion(data: {
        app_version: string;
        hotfix_version: string;
        res_version: string;
        device_info: any;
    }) {
        return this.post('/app/version/check', data, true);
    }

    /** 音效特效配置获取 */
    async getResourceConfig() {
        return this.get('/app/resource-config', true);
    }

    // ==================== 旧版 API 兼容接口 ====================
    // 这些方法直接调用 GameManager 的现有实现

    /** 玩家心跳 (旧) */
    async heartbeatOld() {
        return GameManager.Instance.authGet('/player/heartbeat');
    }

    /** 登出 (旧) */
    async logoutOld() {
        return GameManager.Instance.authPost('/player/logout', null);
    }

    /** 获取资产 (旧) */
    async getCapitalOld() {
        return GameManager.Instance.authGet('/player/capital/get');
    }

    // ==================== 工具方法 ====================

    private buildUrl(path: string, useNewApi: boolean): string {
        const prefix = useNewApi ? this.NEW_API_PREFIX : '';
        let fullPath = path.startsWith('/') ? path : '/' + path;
        fullPath = prefix + fullPath;

        const httpHost = GameManager.Instance.HttpHost;
        if (!httpHost) {
            console.warn('[ApiService] HttpHost is not set');
            return fullPath;
        }
        return httpHost + fullPath;
    }
}
