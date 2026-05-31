import { _decorator, Component, Label, Node, Prefab, math, Quat, SpriteFrame, Sprite, tween, AnimationController } from 'cc';
import { BaseRoom, RoomLevel, GameState } from './BaseRoom';
import { NetMsgManager } from '../../Manager/NetMsgManager';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';

const { ccclass, property } = _decorator;

/**
 * 麻将动作类型
 */
export enum MahjongActionType {
    Invalid = 0,
    Fetch = 1,
    Play = 2,
    Chi = 3,
    Peng = 4,
    ZhiGang = 5,
    JiaGang = 6,
    AnGang = 7,
    DianPao = 8,
    ZiMo = 9
}

/**
 * 麻将花色类型
 */
export enum MahjongPattern {
    Tong = 1,
    Tiao = 2,
    Wan = 3,
    FengDong = 4,
    FengNan = 5,
    FengXi = 6,
    FengBei = 7,
    Zhong = 8,
    Fa = 9,
    Bai = 10
}

@ccclass('MahjongRoomBase')
export abstract class MahjongRoomBase extends BaseRoom {

    // ==================== 麻将 UI 属性 ====================

    @property({ type: Label })
    protected leftTilesLabel: Label = null;

    @property({ type: Node })
    protected actionGroup: Node = null;

    @property({ type: Node })
    protected clockDirection1: Node = null;

    @property({ type: Node })
    protected clockDirection2: Node = null;

    @property({ type: Label })
    protected clockSecond: Label = null;

    @property({ type: Node })
    protected clockArrow: Node = null;

    // ==================== 麻将游戏状态 ====================

    // 手牌
    protected handTiles: any[] = [];

    // 各玩家打出的牌（索引为客户端座位号）
    protected playedTiles: any[][] = [[], [], [], []];

    // 各玩家的副露（吃碰杠）数据（索引为客户端座位号）
    protected chapters: any[][] = [[], [], [], []];

    // 最新摸到的牌
    protected fetchTile: any = null;

    // 剩余牌数
    protected leftTiles: number = 0;

    // 庄家座位号（服务端座位号）
    protected banker: number = 0;

    // 解散投票状态
    protected disbandState: number = 0;

    // 当前等待操作的玩家（服务端座位号）
    protected waitActor: number = -1;

    // 当前可选操作列表
    protected actionOptions: any[] = [];

    // ==================== 抽象方法 ====================

    /**
     * 处理麻将游戏特定的消息
     * @param msgType 消息类型
     * @param msg 消息数据
     * @returns 是否处理了该消息
     */
    protected abstract onMahjongGameMessage(msgType: string, msg: any): boolean;

    /**
     * 设置麻将手牌（子类使用MahjongTileLayout实现）
     * @param tiles 服务端牌数据数组
     */
    protected abstract setMahjongHandTiles(tiles: any[]): void;

    // ==================== BaseRoom 抽象方法 ====================

    protected abstract playerCount: number;
    protected abstract roomBundleName: string;
    protected abstract getSyncMsgType(): string;

    // ==================== 消息处理 ====================

    protected onGameMessage(msgType: string, msg: any): boolean {
        // 处理麻将通用消息
        if (msgType === "MsgMahjongTiles") { this.onMsgMahjongTiles(msg); return true; }
        if (msgType === "MsgActorUpdated") { this.onMsgActorUpdated(msg); return true; }
        if (msgType === "MsgWaitAction") { this.onMsgWaitAction(msg); return true; }
        if (msgType === "MsgFetchTile") { this.onMsgFetchTile(msg); return true; }
        if (msgType === "MsgActionOption") { this.onMsgActionOption(msg); return true; }
        if (msgType === "MsgActionOptionFinish") { this.onMsgActionOptionFinish(msg); return true; }
        if (msgType === "MsgPlayTile") { this.onMsgPlayTile(msg); return true; }
        if (msgType === "MsgGangTile") { this.onMsgGangTile(msg); return true; }
        if (msgType === "MsgPengChiTile") { this.onMsgPengChiTile(msg); return true; }
        if (msgType === "MsgTingTile") { this.onMsgTingTile(msg); return true; }
        if (msgType === "MsgHuTile") { this.onMsgHuTile(msg); return true; }
        if (msgType === "MsgShowTiles") { this.onMsgShowTiles(msg); return true; }
        if (msgType === "MsgPassTip") { this.onMsgPassTip(msg); return true; }

        // 处理解散消息
        if (msgType === "MsgDisbandVote") { this.onMsgDisbandVote(msg); return true; }
        if (msgType === "MsgDisbandChoice") { this.onMsgDisbandChoice(msg); return true; }
        if (msgType === "MsgDisbandObsolete") { this.onMsgDisbandObsolete(); return true; }
        if (msgType === "MsgDisband") { this.onMsgDisband(); return true; }

        // 子类处理游戏特定消息
        return this.onMahjongGameMessage(msgType, msg);
    }

    // ==================== S->C 消息处理 ====================

    /**
     * 设置初始手牌
     */
    protected onMsgMahjongTiles(msg: any): void {
        if (!msg) return;
        this.handTiles = msg.tiles;
        this.setMahjongHandTiles(this.handTiles);
    }

    /**
     * 更新当前操作玩家
     */
    protected onMsgActorUpdated(msg: any): void {
        if (!msg) return;
        this.waitActor = msg.actor;
    }

    /**
     * 等待玩家操作（显示时钟）
     */
    protected onMsgWaitAction(msg: any): void {
        if (!msg) return;
        let clientSeat: number = this.server2ClientSeat(msg.actor);
        this.showClock(clientSeat, msg.elapsed);
        this.waitActor = msg.actor;
    }

    /**
     * 摸牌
     */
    protected onMsgFetchTile(msg: any): void {
        if (!msg) return;
        this.leftTiles = msg.leftTiles;
        this.fetchTile = msg.tile;
        if (this.leftTilesLabel) {
            this.leftTilesLabel.string = this.leftTiles.toString();
        }
        // 如果是自己摸的牌，加入手牌
        if (msg.actor === this.seat) {
            this.handTiles.push(msg.tile);
            this.setMahjongHandTiles(this.handTiles);
        }
    }

    /**
     * 可选操作（胡、杠、碰、吃）
     */
    protected onMsgActionOption(msg: any): void {
        if (!msg) return;
        this.actionOptions = msg.options;
        // 只有轮到自己才显示操作按钮
        if (this.actionGroup) {
            this.actionGroup.active = false;
        }
        if (msg.player === this.seat && msg.options) {
            this.showActionButtons(msg.options);
        }
    }

    /**
     * 操作选择结束（隐藏操作按钮）
     */
    protected onMsgActionOptionFinish(msg: any): void {
        this.actionOptions = [];
        if (this.actionGroup) {
            this.actionGroup.active = false;
        }
    }

    /**
     * 出牌
     */
    protected onMsgPlayTile(msg: any): void {
        if (!msg) return;
        let clientSeat: number = this.server2ClientSeat(msg.actor);
        // 更新打出牌的显示
        if (!this.playedTiles[clientSeat]) {
            this.playedTiles[clientSeat] = [];
        }
        this.playedTiles[clientSeat].push(msg.tile);

        // 如果是自己出的牌，从手牌中移除
        if (msg.actor === this.seat) {
            this.removeHandTile(msg.tile.id);
        }
    }

    /**
     * 杠牌
     */
    protected onMsgGangTile(msg: any): void {
        if (!msg) return;
        let clientSeat: number = this.server2ClientSeat(msg.actor);
        // 更新副露
        if (!this.chapters[clientSeat]) {
            this.chapters[clientSeat] = [];
        }
        this.chapters[clientSeat].push({
            types: msg.chapter.types,
            actionIds: msg.chapter.actionIds,
            targetPlayer: msg.chapter.targetPlayer,
            targetTile: msg.chapter.targetTile,
            tiles: msg.chapter.tiles
        });

        // 更新剩余牌数
        if (msg.leftTiles !== undefined) {
            this.leftTiles = msg.leftTiles;
            if (this.leftTilesLabel) {
                this.leftTilesLabel.string = this.leftTiles.toString();
            }
        }

        // 如果是自己杠的牌，从手牌中移除相关牌
        if (msg.actor === this.seat && msg.handTiles) {
            this.handTiles = msg.handTiles;
            this.setMahjongHandTiles(this.handTiles);
        }
    }

    /**
     * 碰牌/吃牌
     */
    protected onMsgPengChiTile(msg: any): void {
        if (!msg) return;
        let clientSeat: number = this.server2ClientSeat(msg.actor);
        // 更新副露
        if (!this.chapters[clientSeat]) {
            this.chapters[clientSeat] = [];
        }
        this.chapters[clientSeat].push({
            types: msg.chapter.types,
            actionIds: msg.chapter.actionIds,
            targetPlayer: msg.chapter.targetPlayer,
            targetTile: msg.chapter.targetTile,
            tiles: msg.chapter.tiles
        });

        // 如果是自己碰/吃的牌，从手牌中移除相关牌并返回手牌
        if (msg.actor === this.seat && msg.handTiles) {
            this.handTiles = msg.handTiles;
            this.setMahjongHandTiles(this.handTiles);
        }
    }

    /**
     * 听牌提示
     */
    protected onMsgTingTile(msg: any): void {
        if (!msg) return;
        // 子类可重写以显示听牌提示UI
    }

    /**
     * 胡牌
     */
    protected onMsgHuTile(msg: any): void {
        if (!msg) return;
        // 显示胡牌通知
        let clientSeat: number = this.server2ClientSeat(msg.actor);
        if (msg.actor === this.seat) {
            Client.Instance.showPromptTip("胡了！", 3.0);
        } else {
            let name: string = "";
            if (this.playerInfos[msg.actor]) {
                name = this.playerInfos[msg.actor].nickname;
            }
            Client.Instance.showPromptTip("玩家【" + name + "】胡了！", 3.0);
        }
        // 过渡到结算状态
        this.gameState = GameState.Settling;
        // 隐藏操作按钮
        if (this.actionGroup) {
            this.actionGroup.active = false;
        }
    }

    /**
     * 显示所有手牌（回合结束时展示）
     */
    protected onMsgShowTiles(msg: any): void {
        if (!msg) return;
        // 子类可重写以展示所有玩家的手牌
    }

    /**
     * 过牌提示
     */
    protected onMsgPassTip(msg: any): void {
        if (!msg) return;
        // 子类可重写以显示过牌提示
    }

    // ==================== 解散消息处理 ====================

    protected onMsgDisbandVote(msg: any): void {
        // 子类应重写此方法以处理解散投票
        // 默认实现：显示提示
        if (!msg) return;
        let name: string = "";
        if (this.playerInfos[msg.disbander]) {
            name = this.playerInfos[msg.disbander].nickname;
        }
        Client.Instance.showPromptTip("玩家【" + name + "】请求解散房间", 3.0);
    }

    protected onMsgDisbandChoice(msg: any): void {
        // 子类应重写此方法以更新投票状态
    }

    protected onMsgDisbandObsolete(): void {
        // 子类应重写此方法以取消解散投票
    }

    protected onMsgDisband(): void {
        // 房间已解散
        Client.Instance.showPromptDialog("房间已解散，请返回大厅。", () => { this.exitRoom(); }, () => { this.exitRoom(); });
    }

    // ==================== C->S 消息发送 ====================

    /**
     * 发送操作选择（胡、杠、碰、吃等）
     * @param actionId 操作选项ID
     * @param tileId 相关牌ID
     */
    public sendDoActionOption(actionId: number, tileId: number): void {
        let msg = {
            venueId: GameManager.Instance.VenueId,
            actionId: actionId,
            tileId: tileId
        };
        NetworkManager.Instance.sendMessage("MsgDoActionOption", msg, true);
    }

    /**
     * 发送过牌操作
     */
    public sendPassActionOption(): void {
        let msg = {
            venueId: GameManager.Instance.VenueId
        };
        NetworkManager.Instance.sendMessage("MsgPassActionOption", msg, true);
    }

    // ==================== 操作按钮处理 ====================

    /**
     * 显示操作按钮（胡/杠/碰/吃/过）
     */
    protected showActionButtons(options: any[]): void {
        if (!this.actionGroup || !options || options.length === 0) {
            return;
        }
        this.actionGroup.active = true;
        // 子类应重写此方法以根据具体UI结构设置按钮
        // 通用逻辑：遍历options，根据type显示对应按钮
        for (let i: number = 0; i < options.length; i++) {
            let option: any = options[i];
            this.setActionButtonVisible(option, true);
        }
        // 始终显示过牌按钮
        this.setPassButtonVisible(true);
    }

    /**
     * 设置操作按钮可见性（子类重写）
     */
    protected setActionButtonVisible(option: any, visible: boolean): void {
        // 子类根据具体UI结构实现
    }

    /**
     * 设置过牌按钮可见性（子类重写）
     */
    protected setPassButtonVisible(visible: boolean): void {
        // 子类根据具体UI结构实现
    }

    /**
     * 点击胡按钮
     */
    public onHuClick(): void {
        if (!this.actionOptions || this.actionOptions.length === 0) return;
        let option: any = this.findActionByType(MahjongActionType.DianPao) || this.findActionByType(MahjongActionType.ZiMo);
        if (option) {
            this.sendDoActionOption(option.id, option.tile1);
        }
    }

    /**
     * 点击杠按钮
     */
    public onGangClick(): void {
        if (!this.actionOptions || this.actionOptions.length === 0) return;
        let option: any = this.findActionByType(MahjongActionType.ZhiGang)
            || this.findActionByType(MahjongActionType.JiaGang)
            || this.findActionByType(MahjongActionType.AnGang);
        if (option) {
            this.sendDoActionOption(option.id, option.tile1);
        }
    }

    /**
     * 点击碰按钮
     */
    public onPengClick(): void {
        if (!this.actionOptions || this.actionOptions.length === 0) return;
        let option: any = this.findActionByType(MahjongActionType.Peng);
        if (option) {
            this.sendDoActionOption(option.id, option.tile1);
        }
    }

    /**
     * 点击吃按钮
     */
    public onChiClick(tileId: number): void {
        if (!this.actionOptions || this.actionOptions.length === 0) return;
        let option: any = this.findActionByType(MahjongActionType.Chi);
        if (option) {
            this.sendDoActionOption(option.id, tileId);
        }
    }

    /**
     * 点击过按钮
     */
    public onPassClick(): void {
        this.sendPassActionOption();
        if (this.actionGroup) {
            this.actionGroup.active = false;
        }
    }

    // ==================== 辅助方法 ====================

    /**
     * 根据操作类型查找选项
     */
    private findActionByType(type: number): any {
        if (!this.actionOptions) return null;
        for (let i: number = 0; i < this.actionOptions.length; i++) {
            if (this.actionOptions[i].type === type) {
                return this.actionOptions[i];
            }
        }
        return null;
    }

    /**
     * 从手牌中移除指定ID的牌
     */
    protected removeHandTile(tileId: number): void {
        for (let i: number = 0; i < this.handTiles.length; i++) {
            if (this.handTiles[i].id === tileId) {
                this.handTiles.splice(i, 1);
                break;
            }
        }
    }

    /**
     * 获取牌面显示名称
     */
    protected getTileDisplayName(pattern: number, number: number): string {
        switch (pattern) {
            case 1: return number + "筒";
            case 2: return number + "条";
            case 3: return number + "万";
            case 4: return "东";
            case 5: return "南";
            case 6: return "西";
            case 7: return "北";
            case 8: return "中";
            case 9: return "发";
            case 10: return "白板";
            default: return "未知";
        }
    }

    /**
     * 获取麻将动作类型名称
     */
    protected getActionTypeName(type: number): string {
        switch (type) {
            case MahjongActionType.Chi: return "吃";
            case MahjongActionType.Peng: return "碰";
            case MahjongActionType.ZhiGang: return "直杠";
            case MahjongActionType.JiaGang: return "加杠";
            case MahjongActionType.AnGang: return "暗杠";
            case MahjongActionType.DianPao: return "点炮";
            case MahjongActionType.ZiMo: return "自摸";
            default: return "";
        }
    }
}
