import { _decorator, Component, Label, Node, Prefab } from 'cc';
import { MahjongRoomBase } from '../Common/MahjongRoomBase';
import { MahjongTileLayout } from '../Common/MahjongTileLayout';
import { MahjongPlayedOut } from '../Common/MahjongPlayedOut';
import { DlgDisbandBase } from '../Common/DlgDisbandBase';
import { GameState, RoomLevel } from '../Common/BaseRoom';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';
import { HongZhongMahjongPlayer } from './HongZhongMahjongPlayer';
import { HongZhongMahjongSeatPanel } from './HongZhongMahjongSeatPanel';
import { AudioControl } from './AudioControl';
import { DlgHZResult } from './DlgHZResult';

const { ccclass, property } = _decorator;

@ccclass('HongZhongMahjongRoom')
export class HongZhongMahjongRoom extends MahjongRoomBase {

    protected playerCount = 4;
    protected roomBundleName = "HongZhongMahjongRoomMain";

    @property({ type: AudioControl })
    private audioCtrl: AudioControl = null;

    @property({ type: MahjongTileLayout })
    private layout: MahjongTileLayout = null;

    @property({ type: MahjongPlayedOut })
    private playedOut: MahjongPlayedOut = null;

    @property({ type: [HongZhongMahjongSeatPanel] })
    private seatPanels: HongZhongMahjongSeatPanel[] = [];

    @property({ type: [HongZhongMahjongPlayer] })
    private players: HongZhongMahjongPlayer[] = [];

    @property({ type: [Node] })
    private playerBodySlots: Node[] = [];

    @property({ type: [Node] })
    private readyFlags: Node[] = [];

    @property({ type: DlgDisbandBase })
    private dlgDisband: DlgDisbandBase = null;

    @property({ type: Node })
    private dlgResult: Node = null;

    protected getSyncMsgType(): string {
        return "MsgHZSync";
    }

    protected onMahjongGameMessage(msgType: string, msg: any): boolean {
        if (msgType === "MsgHZSyncResp") { this.onSyncResp(msg); return true; }
        if (msgType === "MsgHZStartRound") { this.onHZStartRound(msg); return true; }
        if (msgType === "MsgHZSettlement") { this.onHZSettlement(msg); return true; }
        if (msgType === "MsgHZSitting") { this.onHZSitting(msg); return true; }
        if (msgType === "MsgHZDisbandVote") { this.onMsgDisbandVote(msg); return true; }
        return false;
    }

    start() {
        if (this.layout) this.layout.setRoom(this);
        for (let i: number = 0; i < this.playerCount; i++) {
            if (this.seatPanels[i]) this.seatPanels[i].setData(i, this);
        }
        let dlgResultComp = this.dlgResult ? this.dlgResult.getComponent(DlgHZResult) : null;
        if (dlgResultComp) dlgResultComp.setRoom(this);
        this.loadPromptPrefabs();
        // 请求同步红中麻将游戏数据
        NetworkManager.Instance.sendInnerMessage("MsgHZSync");
    }

    update(deltaTime: number) {
        this.updateClock(deltaTime);
    }

    // ==================== 红中麻将消息处理 ====================

    private onSyncResp(msg: any) {
        if (!msg) return;
        this.clearHongZhongRoom();

        // 解析同步数据
        this.roomNumber = msg.number;
        this.level = msg.level;
        this.ownerSeat = msg.ownerSeat;
        this.gameState = msg.gameState;
        this.seat = msg.seat;
        this.banker = msg.banker;
        this.leftTiles = msg.leftTiles;
        this.disbandState = msg.disbandState;

        // 设置等级文本
        this.setLevelText();

        // 设置剩余牌数
        if (this.leftTilesLabel) {
            this.leftTilesLabel.string = this.leftTiles.toString();
        }

        // 恢复手牌
        if (msg.handTiles) {
            this.handTiles = msg.handTiles;
            this.setMahjongHandTiles(this.handTiles);
        }

        // 恢复各玩家出牌
        if (msg.playedTiles) {
            for (let i: number = 0; i < this.playerCount; i++) {
                let serverSeat: number = i;
                let clientSeat: number = this.server2ClientSeat(serverSeat);
                if (msg.playedTiles[i]) {
                    this.playedTiles[clientSeat] = msg.playedTiles[i];
                    if (this.playedOut) {
                        this.playedOut.playTiles(clientSeat, msg.playedTiles[i]);
                    }
                }
            }
        }

        // 恢复各玩家副露
        if (msg.chapters) {
            for (let i: number = 0; i < this.playerCount; i++) {
                let serverSeat: number = i;
                let clientSeat: number = this.server2ClientSeat(serverSeat);
                if (msg.chapters[i]) {
                    this.chapters[clientSeat] = msg.chapters[i];
                }
            }
        }

        // 恢复摸牌
        if (msg.fetchTile && msg.hasFetch) {
            this.fetchTile = msg.fetchTile;
        }

        // 如果有解散投票，显示
        if (this.disbandState > 0 && this.dlgDisband) {
            this.dlgDisbanding = true;
            this.dlgDisband.show(true);
        }

        // 切换层级
        this.switchLayers();

        // 等待状态显示准备按钮
        if (this.gameState === GameState.Waiting) {
            if (this.readyGroup) this.readyGroup.active = true;
            if (this.seat >= 0 && this.btnReady) {
                let isReady: boolean = false;
                if (this.playerInfos[this.seat]) {
                    isReady = this.playerInfos[this.seat].ready;
                }
                this.btnReady.active = !isReady;
            }
        }

        // 恢复等待操作的玩家
        if (msg.waitActor && msg.waitActor >= 0) {
            this.waitActor = msg.waitActor;
        }
    }

    private onHZStartRound(msg: any) {
        if (!msg) return;
        this.clearHongZhongRoom();
        this.banker = msg.banker;

        // 设置游戏状态为游戏中
        this.gameState = GameState.Playing;
        if (this.readyGroup) this.readyGroup.active = false;
        if (this.btnReady) this.btnReady.active = false;

        // 播放开局音效
        if (this.audioCtrl) {
            this.audioCtrl.playStart();
        }

        // 清除桌面出牌区域
        if (this.playedOut) {
            this.playedOut.clear();
        }

        // 切换层级
        this.switchLayers();
    }

    private onHZSettlement(msg: any) {
        if (!msg) return;
        this.gameState = GameState.Settling;
        this.showResult = true;

        // 隐藏操作按钮
        if (this.actionGroup) this.actionGroup.active = false;
        this.clockFlag = false;

        // 显示结算对话框
        if (!this.dlgResult) return;
        let dlgResultComp = this.dlgResult.getComponent(DlgHZResult);
        if (!dlgResultComp) return;
        dlgResultComp.show(true);

        // 设置玩家数据
        let golds: number[] = msg.golds;
        let winGolds: number[] = msg.winGolds;
        let data: any = msg.data;

        for (let i: number = 0; i < this.playerCount; i++) {
            let serverSeat: number = i;
            let clientSeat: number = this.server2ClientSeat(serverSeat);
            let playerData: any = {};

            if (this.players[clientSeat]) {
                playerData["headTexture"] = this.players[clientSeat].getTexture();
            }
            if (this.playerInfos[serverSeat]) {
                playerData["nickname"] = this.playerInfos[serverSeat].nickname;
            }
            playerData["isWin"] = (winGolds[serverSeat] > 0);
            playerData["gold"] = golds[serverSeat];
            playerData["winGold"] = winGolds[serverSeat];

            if (data && data[serverSeat]) {
                playerData["fanInfo"] = data[serverSeat].fanText || "";
            } else {
                playerData["fanInfo"] = "";
            }

            dlgResultComp.setPlayer(i, playerData, (this.seat === serverSeat));
        }

        // 设置番数文本
        if (data && data[this.seat]) {
            let fanText: string = data[this.seat].fanText || "";
            dlgResultComp.setFanText(fanText);
        }

        // 播放结果音效
        if (this.audioCtrl) {
            let isWin: boolean = (winGolds[this.seat] > 0);
            this.audioCtrl.playResult(isWin ? 1 : 0);
        }

        dlgResultComp.startCountDown();
    }

    private onHZSitting(msg: any) {
        if (this.showResult) return;
        if (!msg) return;
        this.gameState = msg.gameState;
        this.switchLayers();
        this.resetPlayers();

        if (this.gameState === GameState.Sitting) {
            if (this.spectatorFlag) this.spectatorFlag.active = (this.seat === -1);
        }
    }

    // ==================== 麻将手牌 ====================

    protected setMahjongHandTiles(tiles: any[]): void {
        if (this.layout) {
            this.layout.setHandTiles(tiles);
        }
    }

    // ==================== 解散消息重写 ====================

    protected onMsgDisbandVote(msg: any): void {
        if (!(msg && this.dlgDisband)) return;
        this.dlgDisbanding = true;
        this.dlgDisband.show(true);
        let names: string[] = new Array(this.playerCount);
        let choices: number[] = new Array(this.playerCount);
        for (let i: number = 0; i < this.playerCount; i++) {
            if (this.playerInfos[i]) {
                names[i] = this.playerInfos[i].nickname;
            }
            choices[i] = 0;
        }
        if (msg.choices) {
            for (let i: number = 0; i < msg.choices.length; i++) {
                let c: any = msg.choices[i];
                if (c.seat !== undefined && c.choice !== undefined) {
                    choices[c.seat] = c.choice;
                }
            }
        }
        this.dlgDisband.onDisbandVote(msg.disbander, msg.elapsed, names, choices, this.seat);
    }

    protected onMsgDisbandChoice(msg: any): void {
        if (!(msg && this.dlgDisband)) return;
        console.log(msg);
        this.dlgDisband.onDisbandChoice(msg.seat, msg.choice);
    }

    protected onMsgDisbandObsolete(): void {
        this.dlgDisbanding = false;
        if (this.dlgDisband) {
            this.dlgDisband.show(false);
        }
    }

    // ==================== UI 操作 ====================

    private switchLayers() {
        let isSitting: boolean = (this.gameState === GameState.Sitting);
        if (this.seatLayer) this.seatLayer.active = isSitting;
        if (this.desktopLayer) this.desktopLayer.active = !isSitting;
        if (this.desktopUILayer) this.desktopUILayer.active = !isSitting;
        if (this.btnChat) this.btnChat.active = (this.seat !== -1);
        if (this.btnVoice) this.btnVoice.active = (this.seat !== -1);

        // 好友房显示开始按钮
        if (this.level === RoomLevel.Friend && this.seat >= 0) {
            if (this.btnStartGame) {
                this.btnStartGame.active = (this.seat === this.ownerSeat);
            }
        }
    }

    private resetPlayers() {
        if (this.gameState === GameState.Sitting) {
            for (let i: number = 0; i < this.playerCount; i++) {
                if (!this.seatPanels[i]) continue;
                if (this.playerInfos[i]) {
                    let isSelf: boolean = (i === this.seat);
                    let isOwner: boolean = (i === this.ownerSeat);
                    this.seatPanels[i].setPlayerInfo(this.playerInfos[i], isSelf, isOwner);
                } else {
                    this.seatPanels[i].setEmpty();
                }
            }
        } else {
            let isWaiting: boolean = (this.gameState === GameState.Waiting);
            for (let i: number = 0; i < this.playerCount; i++) {
                if (this.playerBodies[i]) {
                    this.playerBodies[i].destroy();
                    this.playerBodies[i] = null;
                }
                let serverSeat: number = this.client2ServerSeat(i);
                let playerInfo: any = this.playerInfos[serverSeat];
                if (this.playerBodySlots[i] && playerInfo) {
                    let prefabName: string = (playerInfo.sex === 1) ? "PlayerBoy" : "PlayerGirl";
                    ResourceLoader.Instance.loadAsset(this.roomBundleName, prefabName, Prefab, (prefab: Prefab) => {
                        if (!prefab) return;
                        this.playerBodies[i] = prefab.instantiate();
                        this.playerBodies[i].parent = this.playerBodySlots[i];
                    });
                }
                if (this.players[i]) {
                    if (playerInfo) {
                        this.players[i].show(true);
                        this.players[i].setPlayerInfo(playerInfo);
                        this.players[i].setReady(isWaiting && playerInfo.ready);
                    } else {
                        this.players[i].clear();
                        this.players[i].show(false);
                    }
                }
                if (i === 0 && this.autoGroup) {
                    let authorize = false;
                    if (playerInfo) authorize = playerInfo.authorize;
                    this.autoGroup.active = authorize;
                }
            }
        }
    }

    private clearHongZhongRoom() {
        this.clearRoom();
        // 清除麻将特有UI
        if (this.playedOut) this.playedOut.clear();
        if (this.layout) this.layout.clear();
        // 重置手牌和出牌数据
        this.handTiles = [];
        this.playedTiles = [[], [], [], []];
        this.chapters = [[], [], [], []];
        this.fetchTile = null;
        this.leftTiles = 0;
        this.waitActor = -1;
        this.actionOptions = [];
        this.disbandState = 0;
        if (this.leftTilesLabel) this.leftTilesLabel.string = "0";
        if (this.actionGroup) this.actionGroup.active = false;
    }

    // ==================== 公共接口 ====================

    public showPlayerInfo(seat: number) {
        // 玩家信息展示
    }

    public kickOutPlayer(seat: number) {
        // 踢出玩家
    }
}
