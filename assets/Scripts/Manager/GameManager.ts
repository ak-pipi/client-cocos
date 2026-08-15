// 游戏数据及状态管理者
// Author wujian
// Email 393817707@qq.com
// Date 2025.10.22

import { sys, assetManager, ImageAsset, Texture2D, SpriteFrame, Prefab } from "cc";
import { CommonUtils } from "../Utils/CommonUtils";
import { EnterVenueState, GameType as ServerGameType } from "../Common/ConstDefines";
import { NetworkManager } from "./NetworkManager";
import { Client } from "../Game/Client";
import { ResourceLoader } from "./ResourceLoader";
import { GameFactory } from "../App/GameFactory";
import { GameId, GameType } from "../App/GameEnums";

type HttpRequestOptions = {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string | null;
};

type HttpJsonResponse = {
    status: number;
    data: any;
};

export class GameManager {
    private static _instance: GameManager = null;

    public static get Instance(): GameManager {
        if (GameManager._instance == null) {
            GameManager._instance = new GameManager();
        }
        return GameManager._instance;
    }

    // HTTP服务器地址
    private httpHost: string = null;

    public get HttpHost(): string {
        return this.httpHost;
    }

    public set HttpHost(url: string) {
        this.httpHost = url;
    }

    // 背景音乐音量
    private musicVolume: number = 1.0;

    public get MusicVolume(): number {
        return this.musicVolume;
    }

    public set MusicVolume(vol: number) {
        this.musicVolume = vol;
    }

    // 音效音量
    private soundVolume: number = 1.0;

    public get SoundVolume(): number {
        return this.soundVolume;
    }

    public set SoundVolume(vol: number) {
        this.soundVolume = vol;
    }

    // 背景音乐是否静音
    private musicMute: boolean = false;

    public get MusicMute(): boolean {
        return this.musicMute;
    }

    public set MusicMute(mute: boolean) {
        this.musicMute = mute;
    }

    // 音效是否静音
    private soundMute: boolean = false;

    public get SoundMute(): boolean {
        return this.soundMute;
    }

    public set SoundMute(mute: boolean) {
        this.soundMute = mute;
    }

    public loadSetting() {
        let text = sys.localStorage.getItem("setting");
        let data: any = null;
        if (!text) return;
        data = JSON.parse(text);
        if (!data) return;
        this.musicVolume = data.musicVolume;
        this.soundVolume = data.soundVolume;
        this.musicMute = data.musicMute;
        this.soundMute = data.soundMute;

        //console.log(CommonUtils.generateRandomCode(10));
        //console.log(CommonUtils.encodeMD5("wujian"));
        //console.log(CommonUtils.encodeBase64("wujian"));
    }

    public saveSetting() {
        let data = {
            musicVolume: this.musicVolume,
            soundVolume: this.soundVolume,
            musicMute: this.musicMute,
            soundMute: this.soundMute
        };
        let text = JSON.stringify(data);
        sys.localStorage.setItem("setting", text);
    }

    // token
    private token: string = null;

    public get Token(): string {
        return this.token;
    }

    public set Token(token: string) {
        this.token = token;
    }

    // 是否已完成登录（拿到有效玩家信息）
    private loggedIn: boolean = false;

    public get LoggedIn(): boolean {
        return this.loggedIn;
    }

    // 玩家ID
    private playerId: string = null;

    public get PlayerId(): string {
        return this.playerId;
    }

     // 昵称
    private nickName: string = null;

    public get NickName(): string {
        return this.nickName;
    }

    // 电话
    private phone: string = null;

    public get Phone(): string {
        return this.phone;
    }

    // 0未知，1为男性，2为女性
    private sex: number = 0;

    public get Sex(): number {
        return this.sex;
    }

    // 头像url
    private avatar: string = null;

    public get Avatar(): string {
        return this.avatar;
    }

    // 消息密钥
    private secret: string = null;

    // 金币数量
    private gold: number = 0;

    public get Gold(): number {
        return this.gold;
    }

    public set Gold(gold: number) {
        this.gold = gold;
    }

    // 银行存款
    private deposit: number = 0;

    public get Deposit(): number {
        return this.deposit;
    }

    public set Deposit(deposit: number) {
        this.deposit = deposit;
    }

    // 钻石数量
    private diamond: number = 0;

    public get Diamond(): number {
        return this.diamond;
    }

    public set Diamond(diamond: number) {
        this.diamond = diamond;
    }

    // 是否为代理
    private isAgency: boolean = false;
    public get IsAgency(): boolean {
        return this.isAgency;
    }

    // 是否为超级管理员玩家态
    private isSuperAdmin: boolean = false;
    public get IsSuperAdmin(): boolean {
        return this.isSuperAdmin;
    }

    // 是否已经被邀请绑定
    private isBound: boolean = false;
    public get IsBound(): boolean {
        return this.isBound;
    }

    // 是否可进入游戏房间创建/游戏列表
    private canCreateRoom: boolean = false;
    public get CanCreateRoom(): boolean {
        return this.canCreateRoom;
    }

    // 是否可使用成员/邀请/统计等代理管理功能
    private canAgencyManage: boolean = false;
    public get CanAgencyManage(): boolean {
        return this.canAgencyManage;
    }

    // 代理玩家id
    private agencyId: string = null;
    public get AgencyId(): string {
        return this.agencyId;
    }

    // 设置玩家信息的时间戳
    private playerInfoTime: number = 0;

    public get PlayerInfoTime(): number {
        return this.playerInfoTime;
    }

    public updatePlayerInfoTime(): void {
        this.playerInfoTime = sys.now();
    }

    private capitalListeners: Array<(capital: any) => void> = [];

    public addCapitalListener(listener: (capital: any) => void): void {
        if (!listener) return;
        if (this.capitalListeners.indexOf(listener) !== -1) return;
        this.capitalListeners.push(listener);
    }

    public removeCapitalListener(listener: (capital: any) => void): void {
        const index = this.capitalListeners.indexOf(listener);
        if (index !== -1) this.capitalListeners.splice(index, 1);
    }

    private notifyCapitalChanged(payload: any): void {
        const capital = {
            ...(payload || {}),
            playerId: payload?.playerId != null ? String(payload.playerId) : this.playerId,
            gold: this.gold,
            deposit: this.deposit,
            diamond: this.diamond,
        };
        const listeners = this.capitalListeners.slice();
        for (const listener of listeners) {
            try {
                listener(capital);
            } catch (err) {
                console.log("Notify capital change error: ", err);
            }
        }
    }

    private toSafeNumber(value: any): number {
        const num = Number(value);
        return isFinite(num) ? num : 0;
    }

    private toSafeBoolean(value: any): boolean {
        return value === true || value === 1 || value === '1' || value === 'true';
    }

    private applyCapital(dto: any): boolean {
        const payload = dto?.data && typeof dto.data === 'object' ? dto.data : dto;
        if (!payload || typeof payload !== 'object') return false;
        let changed = false;
        if (payload.gold !== undefined && payload.gold !== null) {
            this.gold = this.toSafeNumber(payload.gold);
            changed = true;
        }
        if (payload.deposit !== undefined && payload.deposit !== null) {
            this.deposit = this.toSafeNumber(payload.deposit);
            changed = true;
        }
        if (payload.diamond !== undefined && payload.diamond !== null) {
            this.diamond = this.toSafeNumber(payload.diamond);
            changed = true;
        }
        if (changed) {
            this.playerInfoTime = sys.now();
            this.notifyCapitalChanged(payload);
        }
        return changed;
    }

    private applyPlayerPermissions(dto: any): boolean {
        const payload = dto?.data && typeof dto.data === 'object' ? dto.data : dto;
        if (!payload || typeof payload !== 'object') return false;
        const hasPermissionFields = payload.isAgency !== undefined
            || payload.isSuperAdmin !== undefined
            || payload.isBound !== undefined
            || payload.canCreateRoom !== undefined
            || payload.canAgencyManage !== undefined
            || payload.agencyId !== undefined;
        if (!hasPermissionFields) return false;
        this.agencyId = payload.agencyId;
        this.isAgency = this.toSafeBoolean(payload.isAgency);
        this.isSuperAdmin = this.toSafeBoolean(payload.isSuperAdmin);
        this.isBound = this.toSafeBoolean(payload.isBound) || !CommonUtils.isStringEmpty(payload.agencyId);
        this.canCreateRoom = this.toSafeBoolean(payload.canCreateRoom) || this.isSuperAdmin || this.isAgency || this.isBound;
        this.canAgencyManage = this.toSafeBoolean(payload.canAgencyManage) || this.isSuperAdmin || this.isAgency;
        this.playerInfoTime = sys.now();
        return true;
    }

    public setPlayerInfo(dto: any) {
        this.playerId = dto.playerId;
        this.secret = dto.secret != null ? String(dto.secret).trim() : null;
        this.nickName = dto.nickName || dto.nickname;
        this.phone = dto.phone;
        this.sex = dto.sex;
        this.avatar = dto.avatar;
        this.applyCapital(dto);
        this.applyPlayerPermissions(dto);
        this.playerInfoTime = sys.now();
        this.loggedIn = true;
        this.lastHeartbeat = sys.now();
    }

    private clearPlayerInfo() {
        this.loggedIn = false;
        this.lastHeartbeat = sys.now();
        this.token = null;
        this.playerId = null;
        this.secret = null;
        this.nickName = null;
        this.phone = null;
        this.sex = 0;
        this.avatar = null;
        this.gold = 0;
        this.deposit = 0;
        this.diamond = 0;
        this.isAgency = false;
        this.isSuperAdmin = false;
        this.isBound = false;
        this.canCreateRoom = false;
        this.canAgencyManage = false;
        this.agencyId = null;
        this.playerInfoTime = 0;
    }

    // 上次心跳时间，时间戳，单位毫秒
    private lastHeartbeat: number = 0;
    private lastAutoReenterTry: number = 0;
    private autoReentering: boolean = false;

    public heartbeat() {
        if (!this.loggedIn || CommonUtils.isStringEmpty(this.token)) return;
        let nowTime: number = sys.now();
        let delta: number = nowTime - this.lastHeartbeat;
        if (delta < 15000) return;
        // 每15秒发送一次心跳
        this.lastHeartbeat = nowTime;
        let url = this.getUrl("/player/heartbeat");
        this.requestJsonResponse(url, {
            method: 'GET',
            headers: { 'PLAYER-AUTHORIZATION': this.Token }
        }).then((response: HttpJsonResponse) => {
            if (response.status === 401) {
                this.handleSessionExpired();
                return null;
            }
            return response.data;
        }).then((dto: any) => {
            if (!dto) return;
            this.applyCapital(dto);
            this.applyPlayerPermissions(dto);
            this.tryAutoReenterFromHeartbeat(dto);
        }).catch((err) => {
            console.log("Heartbeat error: ", err);
        });
    }

    public requestHeartbeatAndAutoReenter(): void {
        if (!this.loggedIn || CommonUtils.isStringEmpty(this.token)) return;
        const now = sys.now();
        if (now - this.lastAutoReenterTry < 3000) return;
        this.lastAutoReenterTry = now;
        this.authGet("/player/heartbeat").then((dto) => {
            if (!dto) return;
            this.applyCapital(dto);
            this.applyPlayerPermissions(dto);
            this.tryAutoReenterFromHeartbeat(dto);
        }).catch(() => {});
    }

    private tryAutoReenterFromHeartbeat(dto: any): void {
        const payload = dto?.data && typeof dto.data === 'object' ? dto.data : dto;
        const inRoom = !!payload?.inRoom;
        const venueId = payload?.venueId ? String(payload.venueId) : '';
        const wsAddress = payload?.wsAddress ? String(payload.wsAddress) : '';
        const gameType = typeof payload?.gameType === 'number' ? payload.gameType : Number(payload?.gameType);
        const number = payload?.number != null ? String(payload.number) : null;

        if (!inRoom || CommonUtils.isStringEmpty(venueId) || CommonUtils.isStringEmpty(wsAddress) || !gameType) return;
        if (this.EnterVenueState !== EnterVenueState.Leaved) return;
        if (this.autoReentering) return;

        const now = sys.now();
        if (now - this.lastAutoReenterTry < 8000) return;
        this.lastAutoReenterTry = now;
        this.autoReentering = true;

        const gameId = this.mapServerGameTypeToGameId(gameType);
        if (!gameId) {
            this.autoReentering = false;
            return;
        }

        this.enterVenue(wsAddress, venueId, gameType, () => {
            const meta = GameFactory.getGameMeta(gameId);
            GameFactory.ensureRoomClassLoaded(gameId).then(() => {
                if (meta?.type === GameType.Mahjong || gameId === GameId.Paodekuai) {
                    Client.Instance.initGameRoom(null);
                    const room = GameFactory.Instance.createRoom(gameId, Client.Instance.getGameRoomNode() || undefined, undefined);
                    room.presetRoomNumber(number);
                    this.autoReentering = false;
                    return;
                }

                ResourceLoader.Instance.loadAsset('GuanDanRoomMain', 'Room', Prefab, (prefab: Prefab) => {
                    if (!prefab) {
                        this.autoReentering = false;
                        Client.Instance.showPromptDialog('游戏房间加载失败');
                        return;
                    }
                    Client.Instance.initGameRoom(prefab);
                    const room = GameFactory.Instance.createRoom(gameId, undefined, Client.Instance.getGameRoomNode());
                    room.presetRoomNumber(number);
                    this.autoReentering = false;
                });
            }).catch((err) => {
                console.error('[GameManager] Load room script error:', err);
                this.autoReentering = false;
                Client.Instance.showPromptDialog('游戏房间加载失败');
            });
        });
    }

    private mapServerGameTypeToGameId(gameType: number): GameId | null {
        switch (gameType) {
            case ServerGameType.TaojiangMahjong: return GameId.TaojiangMahjong;
            case ServerGameType.HongzhongMahjong: return GameId.HongzhongMahjong;
            case ServerGameType.ChangShaMahjong: return GameId.ChangshaMahjong;
            case ServerGameType.PaoDeKuai: return GameId.Paodekuai;
            case ServerGameType.YiYangWaiHuZi: return GameId.Waihuzi;
            case ServerGameType.YuanJiangQianFen: return GameId.Qianfen;
            default: return null;
        }
    }

    private handleSessionExpired() {
        if (!this.loggedIn) return;
        this.clearPlayerInfo();
        let logoutFunc: (() => void) = () => {
            Client.Instance.logout();
        };
        Client.Instance.showPromptDialog("登录已失效，请重新登录", logoutFunc, logoutFunc);
    }

    public logout() {
        this.authPost("/player/logout", null);
        this.clearPlayerInfo();
        //sys.localStorage.removeItem('userData');
    }

    private getUrl(path): string {
        let url = null;
        if (path.startsWith('/')) {
            url = this.HttpHost + path;
        } else {
            url = this.HttpHost + '/' + path;
        }
        return url;
    }

    private parseHttpResponse(response: Response): Promise<any> {
        if (response.status === 429) {
            return response.json().catch(() => ({
                code: 429,
                msg: '请求过于频繁，请稍后再试',
            }));
        }
        if (!response.ok) {
            return response.json()
                .catch(() => null)
                .then((json) => {
                    if (json && typeof json === 'object') {
                        return json;
                    }
                    return response.text().then((text) => {
                        throw new Error(text || `HTTP ${response.status}`);
                    });
                });
        }
        return response.json();
    }

    private requestJsonResponse(url: string, options: HttpRequestOptions = {}): Promise<HttpJsonResponse> {
        const method = options.method || 'GET';
        const headers = options.headers || {};
        const body = options.body ?? null;

        if (typeof fetch === 'function') {
            return fetch(url, {
                method,
                headers,
                body: body ?? undefined,
            }).then(async (response: Response) => {
                if (response.status === 401) {
                    return { status: response.status, data: null };
                }
                const data = await this.parseHttpResponse(response);
                return { status: response.status, data };
            });
        }

        return this.requestJsonWithXhr(url, method, headers, body);
    }

    private requestJson(url: string, options: HttpRequestOptions = {}): Promise<any> {
        return this.requestJsonResponse(url, options).then((response) => response.data);
    }

    private requestJsonWithXhr(
        url: string,
        method: 'GET' | 'POST',
        headers: Record<string, string>,
        body: string | null,
    ): Promise<HttpJsonResponse> {
        return new Promise((resolve, reject) => {
            if (typeof XMLHttpRequest === 'undefined') {
                reject(new Error('HTTP is unavailable in this runtime'));
                return;
            }

            const xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.timeout = 15000;
            Object.keys(headers).forEach((key) => {
                xhr.setRequestHeader(key, headers[key]);
            });
            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) return;

                const status = xhr.status || 0;
                const responseText = xhr.responseText || '';
                let data: any = null;
                if (responseText) {
                    try {
                        data = JSON.parse(responseText);
                    } catch {
                        data = responseText;
                    }
                }

                if (status === 429) {
                    resolve({
                        status,
                        data: data || { code: 429, msg: '请求过于频繁，请稍后再试' },
                    });
                    return;
                }

                if (status >= 200 && status < 300) {
                    resolve({ status, data });
                    return;
                }

                if (data && typeof data === 'object') {
                    resolve({ status, data });
                    return;
                }

                reject(new Error(responseText || `HTTP ${status}`));
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.ontimeout = () => reject(new Error('Request timeout'));
            xhr.send(body);
        });
    }

    // 非鉴权Get请求
    public get(path): Promise<any> {
        if (CommonUtils.isStringEmpty(this.HttpHost)) return;
        let url = this.getUrl(path);
        return this.requestJson(url);
    }

    // 非鉴权Post请求
    public post(path, data): Promise<any> {
        if (CommonUtils.isStringEmpty(this.HttpHost)) return;
        let url = this.getUrl(path);
        return this.requestJson(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;charset=utf-8' },
            body: JSON.stringify(data)
        });
    }

    private getAuthHeaders(contentType = false): Record<string, string> {
        const headers: Record<string, string> = {
            'PLAYER-AUTHORIZATION': this.Token,
            'Authorization': `Bearer ${this.Token}`,
        };
        if (contentType) {
            headers['Content-Type'] = 'application/json;charset=utf-8';
        }
        return headers;
    }

    // 鉴权Get请求
    public authGet(path, token?: string): Promise<any> {
        if (CommonUtils.isStringEmpty(this.HttpHost)) return;
        const authToken = token || this.Token;
        if (CommonUtils.isStringEmpty(authToken)) return;
        let url = this.getUrl(path);
        const headers = this.getAuthHeaders();
        headers['PLAYER-AUTHORIZATION'] = authToken;
        headers['Authorization'] = `Bearer ${authToken}`;
        return this.requestJson(url, {
            method: 'GET',
            headers: headers
        });
    }

    // 鉴权Post请求
    public authPost(path, data): Promise<any> {
        if (CommonUtils.isStringEmpty(this.HttpHost)) return;
        if (CommonUtils.isStringEmpty(this.Token)) return;
        let url = this.getUrl(path);
        return this.requestJson(url, {
            method: 'POST',
            headers: this.getAuthHeaders(true),
            body: data ? JSON.stringify(data) : null
        });
    }

    // 远程图像缓存表，例如头像图片，最多仅缓存10张图像
    private spriteMap: Map<string, SpriteFrame> = new Map<string, SpriteFrame>();

    // 远程图像加载顺序表
    private spriteUrls: Array<string> = new Array<string>();

    // 加载网络图片为SpriteFrame
    public loadSpriteFrame(url, onComplete: ((spriteFrame: SpriteFrame) => void)) {
        if (!url) return;
        if (this.spriteMap.has(url)) {
            this.moveUrlToEnd(url);
            onComplete(this.spriteMap.get(url));
            return;
        }
        assetManager.loadRemote(url, (err, image) => {
            if (err) {
                console.error(err);
                return;
            }
            if (image instanceof ImageAsset) {
                let texture = new Texture2D();
                texture.image = image;
                let spriteFrame = new SpriteFrame();
                spriteFrame.texture = texture as Texture2D;
                this.addSpriteFrame(url, spriteFrame);
                onComplete(spriteFrame);
            } else {
                console.log("The specified url is not image asset, ", url);
                console.log(image);
            }
        });
    }

    private addSpriteFrame(url: string, sf: SpriteFrame) {
        this.spriteMap.set(url, sf);
        this.spriteUrls.push(url);
        if (this.spriteUrls.length > 10) {
            // 缓存图像超过10张，删除最久不使用的那张
            for (let i = 0; i < this.spriteUrls.length; i++) {
                let tmpUrl: string = this.spriteUrls[i];
                if (tmpUrl === this.Avatar) continue;
                this.spriteMap.delete(tmpUrl);
                this.spriteUrls.splice(i, 1);
                break;
            }
        }
    }

    private moveUrlToEnd(url: string) {
        let index: number = this.spriteUrls.indexOf(url);
        if (index === -1 || index === (this.spriteUrls.length - 1)) return;
        this.spriteUrls.splice(index, 1);
        this.spriteUrls.push(url);
    }

    // 当前的进入场地状态
    private enterVenueState: EnterVenueState = EnterVenueState.Leaved;

    public get EnterVenueState(): EnterVenueState {
        return this.enterVenueState;
    }

    // 当前已进入的场地id，成功进入场地后该字段才会被设置
    private venueId: string = null;

    public get VenueId(): string {
        return this.venueId;
    }

    public set VenueId(venueId: string | null) {
        this.venueId = venueId;
    }

    // 当前正在进入的场地
    private enteringVenueId: string = null;

    // 当前正在进入的场地游戏类型
    private enteringGameType: number = 0;

    // 本次进入场地的额外参数，服务端用于读取携带积分
    private enteringVenueBase64: string = '';

    // 进入场地成功后的回调函数
    private enterCallback: (() => void) | null = null;
    /** 进场响应的完整数据（可能包含房间快照），供房间组件读取 */
    private enterVenueData: any = null;

    public get EnterVenueData(): any { return this.enterVenueData; }
    public set EnterVenueData(v: any) { this.enterVenueData = v; }

    // 本次进房流程锁定的签名密钥，避免刷新前后 Connect/Enter 不一致
    private enterVenueSigningSecret: string | null = null;

    public get EnterVenueSigningSecret(): string | null {
        return this.enterVenueSigningSecret;
    }

    private beginEnterVenueSigning(): void {
        this.enterVenueSigningSecret = this.secret;
    }

    private clearEnterVenueSigning(): void {
        this.enterVenueSigningSecret = null;
    }

    private normalizeWebSocketAddress(address: string): string {
        if (CommonUtils.isStringEmpty(address)) return address;
        const normalized = String(address).trim();
        if (normalized.toLowerCase().startsWith('ws://')) {
            return `wss://${normalized.substring(5)}`;
        }
        return normalized;
    }

    /**
     * 进入场地
     * @param address 服务器地址
     * @param venueId 场地id
     * @param gameType 游戏类型
     * @param onEnterVenue 进入成功回调
     */
    public enterVenue(address: string, venueId: string, gameType: number, onEnterVenue: (() => void), base64: string = '') {
        const wsAddress = this.normalizeWebSocketAddress(address);
        console.log("Enter venue, server address: ", wsAddress, ", game type: ", gameType, ", id: ", venueId);
        this.enteringVenueId = venueId;
        this.enteringGameType = gameType;
        this.enteringVenueBase64 = base64 || '';
        this.enterCallback = onEnterVenue;
        this.enterVenueState = EnterVenueState.Entering;
        this.syncMessageSecret().then((ok) => {
            if (!ok) {
                this.onEnterFailed(venueId, "进入游戏失败: 获取消息密钥失败，请重新登录");
                return;
            }
            this.beginEnterVenueSigning();
            console.log("Message secret synced, length: ", this.secret?.length ?? 0);
            NetworkManager.Instance.connect(wsAddress, false);
        });
    }

    /**
     * 在 MsgPlayerConnectResp 之后发送进入场地消息
     */
    public sendEnterVenueMessage(): void {
        if (this.enterVenueState !== EnterVenueState.Entering) return;
        if (!this.enteringVenueId) return;
        const signingSecret = this.enterVenueSigningSecret || this.secret;
        if (CommonUtils.isStringEmpty(this.playerId) || CommonUtils.isStringEmpty(signingSecret)) {
            console.error("Enter venue aborted: missing playerId or secret");
            NetworkManager.Instance.abandon();
            this.onEnterFailed(this.enteringVenueId, "进入游戏失败: 登录信息不完整，请重新登录");
            return;
        }
        console.log("Enter venue: ", this.enteringVenueId, ", playerId: ", this.playerId);
        const msg = {
            venueId: this.enteringVenueId,
            gameType: this.enteringGameType,
            base64: this.enteringVenueBase64 || ""
        };
        NetworkManager.Instance.sendMessage("MsgEnterVenue", msg, true, signingSecret);
    }

    /**
     * 进房前同步消息签名密钥（与 Redis 一致，不主动轮换）
     */
    public syncMessageSecret(): Promise<boolean> {
        if (!this.loggedIn || CommonUtils.isStringEmpty(this.Token)) {
            return Promise.resolve(false);
        }
        return this.authGet("/player/message/secret").then((dto) => {
            if (dto?.code === '00000000' && dto?.secret) {
                this.secret = String(dto.secret).trim();
                return true;
            }
            console.warn("Sync message secret failed:", dto);
            return false;
        }).catch((err) => {
            console.warn("Sync message secret error:", err);
            return false;
        });
    }

    public onEnterVenue(venueId: string, data?: any) {
        if (this.enterVenueState !== EnterVenueState.Entering) return;
        if (venueId !== this.enteringVenueId) return;

        console.log("Enter venue success, id: ", venueId, ", game type: ", this.enteringGameType);
        this.enterVenueState = EnterVenueState.Entered;
        this.venueId = venueId;
        this.enteringVenueId = null;
        this.enteringGameType = 0;
        this.enteringVenueBase64 = '';
        this.enterVenueData = data || null;
        this.clearEnterVenueSigning();
        if (this.enterCallback) {
            this.enterCallback();
            this.enterCallback = null;
        }
    }

    public onEnterFailed(venueId: string, errMsg: string) {
        if (this.enterVenueState !== EnterVenueState.Entering) return;
        if (venueId && this.enteringVenueId && venueId !== this.enteringVenueId) {
            console.warn("Enter venue failed with mismatched venueId:", venueId, this.enteringVenueId);
        }
        this.enterVenueState = EnterVenueState.Leaved;
        this.enteringVenueId = null;
        this.enteringGameType = 0;
        this.enteringVenueBase64 = '';
        this.enterCallback = null;
        this.enterVenueData = null;
        this.clearEnterVenueSigning();
        Client.Instance.showPromptDialog(errMsg || "进入游戏失败");
    }

    public leaveVenue() {
        this.enterVenueState = EnterVenueState.Leaved;
        this.enteringVenueId = null;
        this.enteringGameType = 0;
        this.enteringVenueBase64 = '';
        this.enterCallback = null;
        this.enterVenueData = null;
        this.clearEnterVenueSigning();
        NetworkManager.Instance.abandon();
        Client.Instance.backToGameHall();
    }

    // 一分钟内生产的Nonce序列
    private nonceSequence: { timestamp: number, nonce: string }[] = [];

    // 一分钟内生产的Nonce表
    private nonces: Set<string> = new Set<string>();
    
    private generateNonce(timestamp: number): string {
        let delta: number = 0;
        let count: number = this.nonceSequence.length;
        while (count > 0) {
            let item = this.nonceSequence[0];
            delta = timestamp - item.timestamp;
            if (delta < 60) {
                break;
            }
            this.nonces.delete(item.nonce);
            this.nonceSequence.shift();
            count--;
        }
        let nonce: string = null;
        while (true) {
            nonce = CommonUtils.generateRandomCode(10);
            if (this.nonces.has(nonce)) {
                continue;
            }
            this.nonces.add(nonce);
            this.nonceSequence.push({ timestamp: timestamp, nonce: nonce });
            break;
        }
        return nonce;
    }

    /**
     * 消息签名
     * @param msg 未签名的消息体
     * @return 签名后的消息体
     */
    public signatureMessage(msg: any, secretOverride?: string): any {
        if (!msg) return null;
        const secret = secretOverride || this.enterVenueSigningSecret || this.secret;
        if (CommonUtils.isStringEmpty(secret)) return null;
        const nowMs = typeof Date !== 'undefined' ? Date.now() : sys.now();
        let timestamp: number = Math.floor(nowMs / 1000);
        let nonce: string = this.generateNonce(timestamp);
        let text = this.playerId + '&' + timestamp.toString() + '&' + nonce + '&' + secret;
        const signature = CommonUtils.encodeMD5(text, false, false);
        let signedMsg = {
            ...msg,
            playerId: this.playerId,
            timestamp: String(timestamp),
            nonce: nonce,
            signature: signature
        };
        return signedMsg;
    }

    // 玩家消息签名失败
    public onPlayerSignatureError(msg: any) {
        const outdate = msg?.outdate === true || msg?.outdate === 1 || msg?.outdate === '1';
        if (this.enterVenueState === EnterVenueState.Entering) {
            NetworkManager.Instance.abandon();
            const hint = outdate ? "签名已过期" : "消息签名验证失败";
            this.onEnterFailed(this.enteringVenueId, `进入游戏失败: ${hint}，请重新登录后再试`);
            return;
        }
        this.handleSessionExpired();
    }

    public onWalletSync(msg: any): void {
        const playerId = msg?.playerId != null ? String(msg.playerId) : '';
        if (playerId && this.playerId && playerId !== this.playerId)
            return;
        this.applyCapital(msg);
    }

    public refreshCapital(): Promise<boolean> {
        const request = this.authGet("/player/capital/get");
        if (!request) return Promise.resolve(false);
        return request.then((dto) => {
            if (dto?.code === '00000000') {
                this.applyCapital(dto);
                return true;
            }
            console.log("Get capital error: ", dto?.msg);
            return false;
        }).catch((err) => {
            console.log("Get capital error: ", err);
            return false;
        });
    }

    public getCapital() {
        this.refreshCapital();
    }
}
