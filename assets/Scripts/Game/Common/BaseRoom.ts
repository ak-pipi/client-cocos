import { _decorator, Component, Label, Node, Prefab, SpriteFrame, math, Quat } from 'cc';
import { NetMsgHandler, NetMsgManager } from '../../Manager/NetMsgManager';
import { ConnectionHandler, NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { VoiceRecord, VoiceManager } from '../../Manager/VoiceManager';
import { Base64 } from 'js-base64';
import { Client } from '../Client';
import { CommonUtils } from '../../Utils/CommonUtils';
import { ResourceLoader } from '../../Manager/ResourceLoader';

const { ccclass, property } = _decorator;

export enum RoomLevel {
    Invalid = 0,
    Friend = 1,
    Practice = 2,
    Beginner = 3,
    Moderate = 4,
    Advanced = 5,
    Master = 6
}

export enum GameState {
    Sitting = 0,
    Waiting = 1,
    Dealing = 2,
    Playing = 3,
    Settling = 4
}

/**
 * 所有游戏房间的抽象基类
 * 实现 NetMsgHandler + ConnectionHandler，处理通用消息
 */
@ccclass('BaseRoom')
export abstract class BaseRoom extends Component implements NetMsgHandler, ConnectionHandler {

    @property({ type: Label })
    protected labelLevel: Label = null;

    @property({ type: Node })
    protected seatLayer: Node = null;

    @property({ type: Node })
    protected desktopLayer: Node = null;

    @property({ type: Node })
    protected desktopUILayer: Node = null;

    @property({ type: Node })
    protected btnChat: Node = null;

    @property({ type: Node })
    protected btnVoice: Node = null;

    @property({ type: Node })
    protected btnReady: Node = null;

    @property({ type: Node })
    protected readyGroup: Node = null;

    @property({ type: Node })
    protected autoGroup: Node = null;

    @property({ type: Node })
    protected spectatorFlag: Node = null;

    @property({ type: Node })
    protected btnStartGame: Node = null;

    @property({ type: Node })
    protected dlgChat: Node = null;

    @property({ type: Node })
    protected dlgSetting: Node = null;

    @property({ type: [SpriteFrame] })
    protected memeImages: SpriteFrame[] = [];

    // 通用状态
    protected roomNumber: string = null;
    protected level: number = 0;
    protected ownerSeat: number = 0;
    protected gameState: number = GameState.Sitting;
    protected seat: number = -1;
    protected playerInfos: any[] = [];
    protected playerBodies: Node[] = [];
    public showResult: boolean = false;
    protected clockFlag: boolean = false;
    protected clockSelf: boolean = false;
    protected clockElapsed: number = 0.0;
    protected dlgDisbanding: boolean = false;

    // 子类必须设置
    protected abstract playerCount: number;
    protected abstract roomBundleName: string;
    protected abstract getSyncMsgType(): string;
    protected abstract onGameMessage(msgType: string, msg: any): boolean;

    protected onLoad(): void {
        NetMsgManager.Instance.registerHandler(this);
        NetworkManager.Instance.registerHandler(this);
    }

    protected onDestroy(): void {
        NetMsgManager.Instance.unregisterHandler(this);
        NetworkManager.Instance.unregisterHandler(this);
    }

    public onDisconnect(): void {}

    public onReconnect(): void {
        NetworkManager.Instance.sendInnerMessage(this.getSyncMsgType());
    }

    public onMessage(msgType: string, msg: any): boolean {
        if (msgType === "MsgAddAvatar") { this.onAddAvatar(msg); return true; }
        if (msgType === "MsgRemoveAvatar") { this.onRemoveAvatar(msg); return true; }
        if (msgType === "MsgAvatarConnect") { this.onAvatarConnect(msg); return true; }
        if (msgType === "MsgAddSpectator") { this.onAddSpectator(msg); return true; }
        if (msgType === "MsgRemoveSpectator") { this.onRemoveSpectator(msg); return true; }
        if (msgType === "MsgPlayerReadyResp") { this.onPlayerReady(msg); return true; }
        if (msgType === "MsgPlayerAuthorizeResp") { this.onPlayerAuthorize(msg); return true; }
        if (msgType === "MsgTipText") { this.onTipText(msg); return true; }
        if (msgType === "MsgJoinGameResp") { this.onJoinGame(msg); return true; }
        if (msgType === "MsgBecomeSpectatorResp") { this.onBecomeSpectator(msg); return true; }
        if (msgType === "MsgChatServer") { this.onChatServer(msg); return true; }
        if (msgType === "MsgVoiceServer") { this.onVoiceServer(msg); return true; }
        if (msgType === "MsgLeaveVenueResp") { this.onLeaveVenueResp(msg); return true; }
        if (msgType === "MsgPlayerDiamonds") { this.onPlayerDiamonds(msg); return true; }
        // 子类处理游戏特定消息
        return this.onGameMessage(msgType, msg);
    }

    // ==================== 座位转换 ====================

    protected server2ClientSeat(s: number): number {
        if (this.seat === -1) return s;
        if (this.gameState === GameState.Sitting) return s;
        return (s + this.playerCount - this.seat) % this.playerCount;
    }

    protected client2ServerSeat(s: number): number {
        if (this.seat === -1) return s;
        if (this.gameState === GameState.Sitting) return s;
        return (s + this.seat) % this.playerCount;
    }

    // ==================== 通用消息处理 ====================

    protected onAddSpectator(msg: any) {}

    protected onRemoveSpectator(msg: any) {}

    protected onAddAvatar(msg: any) {
        if (!msg) return;
        let count: number = msg.avatars.length;
        let isWaiting: boolean = (this.gameState === GameState.Waiting);
        for (let i: number = 0; i < count; i++) {
            let info = msg.avatars[i];
            let text: string = CommonUtils.decodeBase64(info.base64);
            let extraInfo = JSON.parse(text);
            let total: number = extraInfo.winNum + extraInfo.loseNum + extraInfo.drawNum;
            let winRate: number = 100.0;
            if (total > 0) winRate = (extraInfo.winNum + extraInfo.drawNum) * 100.0 / total;
            let playerInfo = {
                playerId: info.playerId,
                nickname: info.nickname,
                sex: info.sex,
                gold: extraInfo.gold,
                headUrl: info.headUrl,
                offline: info.offline,
                ready: info.ready,
                authorize: extraInfo.authorize,
                ip: extraInfo.ip,
                winNum: extraInfo.winNum,
                loseNum: extraInfo.loseNum,
                drawNum: extraInfo.drawNum,
                winRate: winRate
            };
            this.playerInfos[info.seat] = playerInfo;
            this.onAvatarAdded(info, playerInfo, isWaiting);
        }
    }

    /** 子类可重写以自定义入座后的 UI 处理 */
    protected onAvatarAdded(info: any, playerInfo: any, isWaiting: boolean) {
        // 默认实现：加载 PlayerBody prefab
        if (this.gameState === GameState.Sitting) {
            if (info.seat < this.playerCount && this["seatPanels"] && this["seatPanels"][info.seat]) {
                let isSelf: boolean = (info.seat === this.seat);
                let isOwner: boolean = (info.seat === this.ownerSeat);
                this["seatPanels"][info.seat].setPlayerInfo(playerInfo, isSelf, isOwner);
            }
        } else {
            let clientSeat: number = this.server2ClientSeat(info.seat);
            if (this["playerBodySlots"] && this["playerBodySlots"][clientSeat]) {
                let prefabName: string = (info.sex === 1) ? "PlayerBoy" : "PlayerGirl";
                ResourceLoader.Instance.loadAsset(this.roomBundleName, prefabName, Prefab, (prefab: Prefab) => {
                    if (!prefab) return;
                    this.playerBodies[clientSeat] = prefab.instantiate();
                    this.playerBodies[clientSeat].parent = this["playerBodySlots"][clientSeat];
                });
            }
            if (this["players"] && this["players"][clientSeat]) {
                this["players"][clientSeat].show(true);
                this["players"][clientSeat].setPlayerInfo(playerInfo);
            }
            if (isWaiting && this["readyFlags"] && this["readyFlags"][clientSeat]) {
                this["readyFlags"][clientSeat].active = info.ready;
            }
            if (clientSeat === 0) {
                if (isWaiting && this.btnReady) this.btnReady.active = !info.ready;
                if (this.autoGroup) this.autoGroup.active = playerInfo.authorize;
            }
        }
    }

    protected onRemoveAvatar(msg: any) {
        if (!msg) return;
        if (msg.seat === this.seat) this.seat = -1;
        this.playerInfos[msg.seat] = null;
        if (this.gameState === GameState.Sitting) {
            if (this["seatPanels"] && msg.seat < this.playerCount && this["seatPanels"][msg.seat])
                this["seatPanels"][msg.seat].setEmpty();
        } else {
            let clientSeat: number = this.server2ClientSeat(msg.seat);
            if (this.playerBodies[clientSeat]) {
                this.playerBodies[clientSeat].destroy();
                this.playerBodies[clientSeat] = null;
            }
            if (this["players"] && this["players"][clientSeat]) {
                this["players"][clientSeat].clear();
                this["players"][clientSeat].show(false);
            }
            if (this["readyFlags"] && this["readyFlags"][clientSeat])
                this["readyFlags"][clientSeat].active = false;
        }
    }

    protected onAvatarConnect(msg: any) {
        if (!msg) return;
        if (this.playerInfos[msg.seat]) this.playerInfos[msg.seat].offline = msg.offline;
        if (this.gameState === GameState.Sitting) {
            if (this["seatPanels"] && msg.seat < this.playerCount && this["seatPanels"][msg.seat])
                this["seatPanels"][msg.seat].setOffline(msg.offline);
        } else {
            let clientSeat: number = this.server2ClientSeat(msg.seat);
            if (this["players"] && this["players"][clientSeat])
                this["players"][clientSeat].setOffline(msg.offline);
        }
    }

    protected onPlayerReady(msg: any) {
        if (!msg) return;
        if (this.playerInfos[msg.seat]) this.playerInfos[msg.seat].ready = true;
        if (this.gameState === GameState.Sitting) {
            if (this["seatPanels"] && msg.seat < this.playerCount && this["seatPanels"][msg.seat])
                this["seatPanels"][msg.seat].setReady(true);
        } else {
            let clientSeat: number = this.server2ClientSeat(msg.seat);
            if (this["readyFlags"] && this["readyFlags"][clientSeat]) this["readyFlags"][clientSeat].active = true;
            if (clientSeat === 0 && this.btnReady) this.btnReady.active = false;
        }
    }

    protected onPlayerAuthorize(msg: any) {
        if (!msg) return;
        if (this.playerInfos[msg.seat]) this.playerInfos[msg.seat].authorize = msg.authorize;
        if (this.gameState !== GameState.Sitting) {
            let clientSeat: number = this.server2ClientSeat(msg.seat);
            if (this["players"] && this["players"][clientSeat])
                this["players"][clientSeat].setAuto(msg.authorize);
            if (clientSeat === 0 && this.autoGroup) this.autoGroup.active = msg.authorize;
        }
    }

    protected onTipText(msg: any) {
        if (msg) Client.Instance.showPromptTip(msg.tip, 3.0);
    }

    protected onJoinGame(msg: any) {
        if (!msg) return;
        if (msg.success) {
            this.seat = msg.seat;
            if (this.spectatorFlag) this.spectatorFlag.active = false;
            if (this.btnChat) this.btnChat.active = true;
            if (this.btnVoice) this.btnVoice.active = true;
        } else {
            Client.Instance.showPromptTip(msg.errMsg, 2.0);
        }
    }

    protected onBecomeSpectator(msg: any) {
        if (!msg) return;
        if (msg.result === 0) {
            this.seat = -1;
            if (this.spectatorFlag) this.spectatorFlag.active = true;
            if (this.btnStartGame) this.btnStartGame.active = false;
            if (this.btnChat) this.btnChat.active = false;
            if (this.btnVoice) this.btnVoice.active = false;
        } else {
            Client.Instance.showPromptTip(msg.errMsg, 3.0);
        }
    }

    protected onChatServer(msg: any) {
        if (!msg) return;
        let clientSeat: number = this.server2ClientSeat(msg.seat);
        let target: any = null;
        if (this.gameState === GameState.Sitting) {
            if (this["seatPanels"] && clientSeat < this.playerCount)
                target = this["seatPanels"][clientSeat];
        } else {
            if (this["players"] && clientSeat < this.playerCount)
                target = this["players"][clientSeat];
        }
        if (!target) return;
        if (msg.type === 1) target.setChatEmoji(msg.index);
        else if (msg.type === 2) target.setChatPhrase(msg.index);
        else if (msg.type === 3) target.setChatText(msg.text);
        else if (msg.type === 4) target.setChatMeme(this.memeImages[msg.index]);
    }

    protected onVoiceServer(msg: any) {
        if (!msg) return;
        let rec: VoiceRecord = new VoiceRecord();
        rec.data = Base64.toUint8Array(msg.base64);
        rec.onPlayStart = () => {
            let clientSeat = this.server2ClientSeat(msg.seat);
            let target: any = null;
            if (this.gameState === GameState.Sitting) {
                if (this["seatPanels"] && clientSeat < this.playerCount)
                    target = this["seatPanels"][clientSeat];
            } else {
                if (this["players"] && clientSeat < this.playerCount)
                    target = this["players"][clientSeat];
            }
            if (target) target.showChatTalk(true);
        };
        rec.onPlayEnd = () => {
            let clientSeat = this.server2ClientSeat(msg.seat);
            let target: any = null;
            if (this.gameState === GameState.Sitting) {
                if (this["seatPanels"] && clientSeat < this.playerCount)
                    target = this["seatPanels"][clientSeat];
            } else {
                if (this["players"] && clientSeat < this.playerCount)
                    target = this["players"][clientSeat];
            }
            if (target) target.showChatTalk(false);
        };
        VoiceManager.Instance.addRecord(rec);
    }

    protected onLeaveVenueResp(msg: any) {
        if (!msg) return;
        if (msg.result === 0) {
            this.exitRoom();
        } else if (msg.result === 1) {
            NetworkManager.Instance.sendInnerMessage("MsgDisbandRequest");
        } else {
            Client.Instance.showPromptTip(msg.errMsg, 3.0);
        }
    }

    protected onPlayerDiamonds(msg: any) {}

    // ==================== 通用 UI 操作 ====================

    public onReadyClick() {
        if (this.seat === -1) return;
        NetworkManager.Instance.sendInnerMessage("MsgPlayerReady");
    }

    public onAutoClick() {
        NetworkManager.Instance.sendInnerMessage("MsgPlayerAuthorize");
    }

    public onBackClick() {
        if (NetworkManager.Instance.isConnected()) {
            NetworkManager.Instance.sendInnerMessage("MsgLeaveVenue");
        } else {
            this.exitRoom();
        }
    }

    public onSettingClick() {
        if (this.dlgSetting) this.dlgSetting.active = true;
    }

    public onChatClicked() {
        if (this.dlgChat) this.dlgChat.active = true;
    }

    public onChangeSeatClick() {
        NetworkManager.Instance.sendInnerMessage("MsgBecomeSpectator");
    }

    protected exitRoom() {
        GameManager.Instance.leaveVenue();
        GameManager.Instance.getCapital();
        Client.Instance.backToGameHall();
    }

    public OnSeatPanelClick(event: Event, customEventData: any | null) {
        let idx: number = Number(customEventData);
        if (isNaN(idx) || idx < 0 || idx >= this.playerCount) return;
        if (!this.playerInfos[idx]) {
            if (this.seat === -1) {
                let msg = { venueId: GameManager.Instance.VenueId, seat: idx };
                NetworkManager.Instance.sendMessage("MsgJoinGame", msg, true);
            }
        } else if (this["seatPanels"] && this["seatPanels"][idx]) {
            this["seatPanels"][idx].showMenu(true);
        }
    }

    protected clearRoom() {
        for (let i: number = 0; i < this.playerCount; i++) {
            if (this["seatPanels"] && this["seatPanels"][i]) this["seatPanels"][i].setEmpty();
            if (this.playerBodies[i]) {
                this.playerBodies[i].destroy();
                this.playerBodies[i] = null;
            }
            if (this["players"] && this["players"][i]) {
                this["players"][i].clear();
                this["players"][i].show(false);
            }
            if (this["readyFlags"] && this["readyFlags"][i]) this["readyFlags"][i].active = false;
        }
        if (this.btnReady) this.btnReady.active = false;
        this.clockFlag = false;
        this.clockElapsed = 0.0;
    }

    protected updateClock(deltaTime: number) {
        if (!this.clockFlag) return;
        if (this.clockElapsed < 15.0) {
            this.clockElapsed += deltaTime;
            let sec = 15.0 - this.clockElapsed;
            if (sec < 0) sec = 0;
            if (this["clockSecond"]) this["clockSecond"].string = Math.floor(sec).toString();
        } else {
            this.clockFlag = false;
            if (this["clockSecond"]) this["clockSecond"].string = "0";
        }
    }

    protected loadPromptPrefabs() {
        ResourceLoader.Instance.loadAsset(this.roomBundleName, "PromptDialog", Prefab, (prefab: Prefab) => {
            Client.Instance.setPromptDialogPrefab(prefab);
        });
        ResourceLoader.Instance.loadAsset(this.roomBundleName, "PromptTip", Prefab, (prefab: Prefab) => {
            Client.Instance.setPromptTipPrefab(prefab);
        });
    }

    protected showClock(clientSeat: number, elapsed: number) {
        let rotateAngles = [90.0, 180.0, 270.0, 0.0];
        if (this["clockArrow"]) {
            this["clockArrow"].active = true;
            this.clockFlag = true;
            this.clockSelf = (clientSeat === 0);
            this.clockElapsed = elapsed;
            if (this["clockDirection1"]) {
                let quat = new Quat();
                math.Quat.fromAngleZ(quat, rotateAngles[clientSeat]);
                this["clockDirection1"].rotation = quat;
            }
        }
    }

    protected setLevelText() {
        if (!this.labelLevel) return;
        if (this.level === RoomLevel.Friend) this.labelLevel.string = "好友房(" + this.roomNumber + ")";
        else if (this.level === RoomLevel.Practice) this.labelLevel.string = "练习房";
        else if (this.level === RoomLevel.Beginner) this.labelLevel.string = "初级房";
        else if (this.level === RoomLevel.Moderate) this.labelLevel.string = "中级房";
        else if (this.level === RoomLevel.Advanced) this.labelLevel.string = "高级房";
        else if (this.level === RoomLevel.Master) this.labelLevel.string = "大师房";
        else this.labelLevel.string = null;
    }
}
