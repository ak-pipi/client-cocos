import { _decorator, Component, Label, Node, Prefab, instantiate, SpriteFrame } from 'cc';
import { MahjongRoomBase } from '../Common/MahjongRoomBase';
import { MahjongTileLayout } from '../Common/MahjongTileLayout';
import { MahjongPlayedOut } from '../Common/MahjongPlayedOut';
import { DlgDisbandBase } from '../Common/DlgDisbandBase';
import { DlgTJResult } from './DlgTJResult';
import { TaoJiangMahjongPlayer } from './TaoJiangMahjongPlayer';
import { TaoJiangMahjongSeatPanel } from './TaoJiangMahjongSeatPanel';
import { AudioControl } from './AudioControl';
import { ResourceLoader } from '../../Manager/ResourceLoader';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';
import { RoomLevel, GameState } from '../Common/BaseRoom';

const { ccclass, property } = _decorator;

@ccclass('TaoJiangMahjongRoom')
export class TaoJiangMahjongRoom extends MahjongRoomBase {

    // ==================== 抽象属性实现 ====================

    protected playerCount: number = 2;

    protected roomBundleName: string = "TaoJiangMahjongRoomMain";

    protected getSyncMsgType(): string {
        return "MsgTJSync";
    }

    // ==================== UI 属性 ====================

    @property({ type: AudioControl })
    private audioCtrl: AudioControl = null;

    @property({ type: MahjongTileLayout })
    private layout: MahjongTileLayout = null;

    @property({ type: MahjongPlayedOut })
    private playedOut: MahjongPlayedOut = null;

    @property({ type: [TaoJiangMahjongSeatPanel] })
    private seatPanels: TaoJiangMahjongSeatPanel[] = [];

    @property({ type: [TaoJiangMahjongPlayer] })
    private players: TaoJiangMahjongPlayer[] = [];

    @property({ type: [Node] })
    private playerBodySlots: Node[] = [];

    @property({ type: [Node] })
    private readyFlags: Node[] = [];

    @property({ type: DlgDisbandBase })
    private dlgDisband: DlgDisbandBase = null;

    @property({ type: Node })
    private dlgResult: Node = null;

    // ==================== 结果对话框组件 ====================

    private dlgResultComp: DlgTJResult = null;

    // ==================== 状态 ====================

    private isKick: boolean = false;

    // ==================== 生命周期 ====================

    start() {
        for (let i: number = 0; i < this.playerCount; i++) {
            if (this.seatPanels[i]) this.seatPanels[i].setData(i, this);
        }
        if (this.dlgResult) {
            this.dlgResultComp = this.dlgResult.getComponent(DlgTJResult);
            if (this.dlgResultComp) this.dlgResultComp.setRoom(this);
        }
        this.loadPromptPrefabs();
        // 请求同步桃江麻将游戏数据
        NetworkManager.Instance.sendInnerMessage(this.getSyncMsgType());
    }

    update(deltaTime: number) {
        this.updateClock(deltaTime);
    }

    // ==================== 抽象方法实现 ====================

    protected onMahjongGameMessage(msgType: string, msg: any): boolean {
        if (msgType === "MsgTJSyncResp") { this.onSyncResp(msg); return true; }
        if (msgType === "MsgTJStartRound") { this.onTJStartRound(msg); return true; }
        if (msgType === "MsgTJSettlement") { this.onTJSettlement(msg); return true; }
        if (msgType === "MsgTJSitting") { this.onSitting(msg); return true; }
        return false;
    }

    protected setMahjongHandTiles(tiles: any[]): void {
        if (this.layout) {
            this.layout.setHandTiles(tiles);
        }
    }

    // ==================== 同步消息处理 ====================

    private onSyncResp(msg: any) {
        if (!msg) return;
        this.clearTaoJiangRoom();
        this.roomNumber = msg.number;
        this.level = msg.level;
        this.ownerSeat = msg.ownerSeat;
        this.gameState = msg.gameState;
        this.seat = msg.seat;
        this.banker = msg.banker;
        this.leftTiles = msg.leftTiles;
        this.fetchTile = msg.fetchTile;
        if (msg.disbandState !== undefined) {
            this.disbandState = msg.disbandState;
        }

        // 设置等级文字
        this.setLevelText();

        // 切换图层
        let sitting: boolean = (this.gameState === GameState.Sitting);
        this.switchLayers(sitting);

        // 观众检测
        if (!sitting && (this.seat === -1)) {
            this.exitRoom();
            return;
        }
        if (this.spectatorFlag) this.spectatorFlag.active = (this.seat === -1);
        if (this.btnChat) this.btnChat.active = (this.seat !== -1);
        if (this.btnVoice) this.btnVoice.active = (this.seat !== -1);
        if (this.readyGroup) this.readyGroup.active = (this.gameState === GameState.Waiting);

        // 好友房开始按钮
        if (this.level === RoomLevel.Friend && this.btnStartGame && (this.seat !== -1)) {
            this.btnStartGame.active = (this.seat === this.ownerSeat);
        }

        // 恢复手牌
        if (msg.handTiles && msg.handTiles.length > 0) {
            this.handTiles = msg.handTiles;
            this.setMahjongHandTiles(this.handTiles);
        }

        // 恢复出牌区
        if (msg.playedTiles) {
            for (let i: number = 0; i < msg.playedTiles.length; i++) {
                let clientSeat: number = this.server2ClientSeat(i);
                if (this.playedOut && msg.playedTiles[i]) {
                    this.playedOut.playTiles(clientSeat, msg.playedTiles[i]);
                }
            }
        }

        // 设置剩余牌数
        if (this.leftTilesLabel) {
            this.leftTilesLabel.string = this.leftTiles.toString();
        }
    }

    // ==================== 开始新一局 ====================

    private onTJStartRound(msg: any) {
        if (!msg) return;
        this.banker = msg.banker;
        this.clearTaoJiangRoom();
        this.gameState = GameState.Playing;
        if (this.readyGroup) this.readyGroup.active = false;
        if (this.leftTilesLabel) this.leftTilesLabel.string = "";
        // 播放开始声音
        if (this.audioCtrl) {
            this.audioCtrl.playStart();
        }
    }

    // ==================== 结算 ====================

    private onTJSettlement(msg: any) {
        if (!msg) return;
        this.gameState = GameState.Waiting;
        this.showResult = true;
        if (this.audioCtrl) {
            // 判断本玩家是否赢了
            let isWin: boolean = false;
            if (msg.winGolds && msg.winGolds[this.seat]) {
                isWin = (msg.winGolds[this.seat] > 0);
            }
            this.audioCtrl.playResult(isWin ? 1 : 0);
        }
        if (!this.dlgResultComp) return;
        this.dlgResultComp.show(true);
        this.isKick = (msg.kick === 1);

        // 设置玩家数据
        for (let i: number = 0; i < this.playerCount; i++) {
            let playerData: any = {};
            let serverSeat: number = i;
            let clientSeat: number = this.server2ClientSeat(serverSeat);
            if (this.players[clientSeat]) {
                playerData["headTexture"] = this.players[clientSeat].getTexture();
            }
            if (this.playerInfos[serverSeat]) {
                playerData["nickname"] = this.playerInfos[serverSeat].nickname;
                playerData["gold"] = this.playerInfos[serverSeat].gold;
            }
            if (msg.golds && msg.golds[i] !== undefined) {
                playerData["gold"] = msg.golds[i];
            }
            let isWin: boolean = false;
            if (msg.winGolds && msg.winGolds[i] !== undefined) {
                isWin = (msg.winGolds[i] > 0);
                playerData["winGold"] = msg.winGolds[i];
            }
            playerData["isWin"] = isWin;
            this.dlgResultComp.setPlayer(i, playerData, (this.seat === serverSeat));
        }

        // 设置番型信息
        if (msg.data) {
            this.dlgResultComp.setFanText(msg.data);
        }

        this.dlgResultComp.startCountDown();
    }

    // ==================== 入座状态 ====================

    private onSitting(msg: any) {
        if (this.showResult) return;
        if (!msg) return;
        this.gameState = msg.gameState;
        this.level = msg.level;
        let sitting: boolean = (this.gameState === GameState.Sitting);

        if (!sitting && this.seat === -1) {
            Client.Instance.showPromptDialog("游戏已开始，未入座玩家被请出房间。", () => { this.exitRoom(); }, () => { this.exitRoom(); });
            return;
        }

        this.switchLayers(sitting);
        this.resetPlayers();
    }

    // ==================== 图层切换 ====================

    private switchLayers(sitting: boolean) {
        if (this.seatLayer) this.seatLayer.active = sitting;
        if (this.desktopLayer) this.desktopLayer.active = !sitting;
        if (this.desktopUILayer) this.desktopUILayer.active = !sitting;
    }

    // ==================== 清理 ====================

    private clearTaoJiangRoom() {
        // 清理麻将相关UI
        if (this.layout) this.layout.clear();
        if (this.playedOut) this.playedOut.clear();
        this.handTiles = [];
        this.playedTiles = [[], [], [], []];
        this.chapters = [[], [], [], []];
        this.fetchTile = null;
        this.leftTiles = 0;
        this.actionOptions = [];
        if (this.actionGroup) this.actionGroup.active = false;
        this.clockFlag = false;
        this.clockElapsed = 0.0;
        if (this.clockDirection1) this.clockDirection1.active = false;
        if (this.clockDirection2) this.clockDirection2.active = false;
        if (this.clockArrow) this.clockArrow.active = false;
        if (this.clockSecond) this.clockSecond.string = "";
    }

    // ==================== 解散消息重写 ====================

    protected onMsgDisbandVote(msg: any): void {
        if (!msg || !this.dlgDisband) return;
        this.dlgDisbanding = true;
        let names: string[] = [];
        for (let i: number = 0; i < this.playerCount; i++) {
            if (this.playerInfos[i]) {
                names[i] = this.playerInfos[i].nickname;
            } else {
                names[i] = "";
            }
        }
        this.dlgDisband.show(true);
        this.dlgDisband.onDisbandVote(msg.disbander, msg.elapsed, names, msg.choices, this.seat);
    }

    protected onMsgDisbandChoice(msg: any): void {
        if (!msg || !this.dlgDisband) return;
        this.dlgDisband.onDisbandChoice(msg.seat, msg.choice);
    }

    protected onMsgDisbandObsolete(): void {
        this.dlgDisbanding = false;
        if (this.dlgDisband) this.dlgDisband.show(false);
    }

    // ==================== 开始游戏 ====================

    public onStartGameClick() {
        NetworkManager.Instance.sendInnerMessage("MsgTJStartGame");
    }

    // ==================== 结算对话框回调 ====================

    public onResultNextClick() {
        if (this.dlgResultComp) this.dlgResultComp.show(false);
        this.showResult = false;
        NetworkManager.Instance.sendInnerMessage(this.getSyncMsgType());
        NetworkManager.Instance.sendInnerMessage("MsgPlayerReady");
    }

    public onResultExitClick() {
        if (NetworkManager.Instance.isConnected()) {
            NetworkManager.Instance.sendInnerMessage("MsgLeaveVenue");
        }
        GameManager.Instance.leaveVenue();
        Client.Instance.backToGameHall();
    }
}
