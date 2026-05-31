import { _decorator, Component, Label, Node, Prefab, tween, math } from 'cc';
import { MahjongRoomBase, MahjongActionType } from '../Common/MahjongRoomBase';
import { BaseRoom, RoomLevel, GameState } from '../Common/BaseRoom';
import { NetMsgManager } from '../../Manager/NetMsgManager';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';
import { ResourceLoader } from '../../Manager/ResourceLoader';
import { MahjongTileLayout } from '../Common/MahjongTileLayout';
import { MahjongPlayedOut } from '../Common/MahjongPlayedOut';
import { DlgDisbandBase } from '../Common/DlgDisbandBase';
import { ChangShaMahjongPlayer } from './ChangShaMahjongPlayer';
import { ChangShaMahjongSeatPanel } from './ChangShaMahjongSeatPanel';
import { AudioControl } from './AudioControl';
import { DlgCSResult } from './DlgCSResult';

const { ccclass, property } = _decorator;

@ccclass('ChangShaMahjongRoom')
export class ChangShaMahjongRoom extends MahjongRoomBase {

    // ==================== 必须实现的抽象属性 ====================

    protected playerCount: number = 4;
    protected roomBundleName: string = "ChangShaMahjongRoomMain";

    protected getSyncMsgType(): string {
        return "ChangSha.Sync";
    }

    // ==================== 长沙麻将专属 UI 属性 ====================

    @property({ type: AudioControl })
    private audioCtrl: AudioControl = null;

    @property({ type: MahjongTileLayout })
    private layout: MahjongTileLayout = null;

    @property({ type: MahjongPlayedOut })
    private playedOut: MahjongPlayedOut = null;

    @property({ type: [ChangShaMahjongSeatPanel] })
    private seatPanels: ChangShaMahjongSeatPanel[] = [];

    @property({ type: [ChangShaMahjongPlayer] })
    private players: ChangShaMahjongPlayer[] = [];

    @property({ type: [Node] })
    private playerBodySlots: Node[] = [];

    @property({ type: [Node] })
    private readyFlags: Node[] = [];

    @property({ type: DlgDisbandBase })
    private dlgDisband: DlgDisbandBase = null;

    @property({ type: Node })
    private dlgResult: Node = null;

    // 起手胡动画组
    @property({ type: Node })
    private qiShouHuGroup: Node = null;

    @property({ type: Label })
    private qiShouHuText: Label = null;

    // 翻鸟显示组
    @property({ type: Node })
    private birdGroup: Node = null;

    @property({ type: Label })
    private birdText: Label = null;

    @property({ type: Label })
    private multipleText: Label = null;

    // 长沙麻将状态
    private birdMultiple: number = 1;

    private qiShouHuTimer: number = 0.0;
    private qiShouHuShowing: boolean = false;

    private birdTimer: number = 0.0;
    private birdShowing: boolean = false;

    private dlgResultComp: DlgCSResult = null;

    // ==================== 生命周期 ====================

    start() {
        if (this.layout) this.layout.clear();
        if (this.playedOut) this.playedOut.clear();
        for (let i: number = 0; i < this.playerCount; i++) {
            if (this.seatPanels[i]) this.seatPanels[i].setData(i, this);
        }
        if (this.dlgResult) {
            this.dlgResultComp = this.dlgResult.getComponent(DlgCSResult);
            if (this.dlgResultComp) this.dlgResultComp.setRoom(this);
        }
        // 设置解散对话框回调
        if (this.dlgDisband) {
            this.dlgDisband.setCallback((choice: number) => {
                this.sendDisbandChoice(choice);
            });
        }
        this.loadPromptPrefabs();
        // 请求同步长沙麻将游戏数据
        NetworkManager.Instance.sendInnerMessage("ChangSha.Sync");
    }

    update(deltaTime: number) {
        this.updateClock(deltaTime);
        this.updateQiShouHu(deltaTime);
        this.updateBird(deltaTime);
    }

    // ==================== 消息处理 ====================

    protected onMahjongGameMessage(msgType: string, msg: any): boolean {
        if (msgType === "MsgChangShaSyncResp") { this.onSyncResp(msg); return true; }
        if (msgType === "MsgChangShaStartRound") { this.onStartRound(msg); return true; }
        if (msgType === "MsgChangShaSettlement") { this.onSettlement(msg); return true; }
        if (msgType === "MsgChangShaQiShouHu") { this.onQiShouHu(msg); return true; }
        if (msgType === "MsgChangShaBird") { this.onBird(msg); return true; }
        if (msgType === "MsgChangShaDisbandVote") { this.onChangShaDisbandVote(msg); return true; }
        return false;
    }

    // ==================== S->C 消息处理 ====================

    /**
     * 同步响应 - 恢复完整游戏状态
     */
    protected onSyncResp(msg: any): void {
        if (!msg) return;
        this.clearChangShaRoom();

        this.roomNumber = msg.number;
        this.level = msg.level;
        this.ownerSeat = msg.ownerSeat;
        this.gameState = msg.gameState;
        this.seat = msg.seat;
        this.banker = msg.banker;

        // 设置等级文字
        this.setLevelText();

        // 切换入座/游戏界面
        let isSitting: boolean = (this.gameState === GameState.Sitting);
        this.switchLayers(isSitting);

        // 观众在游戏进行中不能停留
        if (!isSitting && this.seat === -1) {
            this.exitRoom();
            return;
        }

        // 恢复玩家信息
        if (msg.avatars) {
            for (let i: number = 0; i < msg.avatars.length; i++) {
                this.onAddAvatar(msg.avatars[i]);
            }
        }

        // 如果游戏正在进行中，恢复手牌
        if (msg.gameState === GameState.Playing && msg.handTiles) {
            this.handTiles = msg.handTiles;
            this.setMahjongHandTiles(this.handTiles);
        }

        // 恢复剩余牌数
        if (msg.leftTiles !== undefined) {
            this.leftTiles = msg.leftTiles;
            if (this.leftTilesLabel) {
                this.leftTilesLabel.string = this.leftTiles.toString();
            }
        }

        // 恢复等待状态
        if (this.gameState === GameState.Waiting) {
            if (this.readyGroup) this.readyGroup.active = true;
        }
    }

    /**
     * 开始新一局
     */
    protected onStartRound(msg: any): void {
        if (!msg) return;
        this.clearChangShaRoom();
        this.banker = msg.banker;
        this.gameState = GameState.Playing;
        this.handTiles = [];
        this.playedTiles = [[], [], [], []];
        this.chapters = [[], [], [], []];
        this.fetchTile = null;
        this.leftTiles = 0;
        this.actionOptions = [];
        this.birdMultiple = 1;

        if (this.leftTilesLabel) {
            this.leftTilesLabel.string = "0";
        }
        if (this.readyGroup) this.readyGroup.active = false;
        if (this.layout) this.layout.clear();
        if (this.playedOut) this.playedOut.clear();

        // 播放开局音效
        if (this.audioCtrl) {
            this.audioCtrl.playStart();
        }

        // 显示庄家提示
        let bankerClientSeat: number = this.server2ClientSeat(this.banker);
        if (msg.banker === this.seat) {
            Client.Instance.showPromptTip("你是庄家", 2.0);
        } else {
            let name: string = "";
            if (this.playerInfos[msg.banker]) {
                name = this.playerInfos[msg.banker].nickname;
            }
            Client.Instance.showPromptTip("庄家: " + name, 2.0);
        }
    }

    /**
     * 结算
     */
    protected onSettlement(msg: any): void {
        if (!msg) return;
        this.gameState = GameState.Settling;
        this.showResult = true;

        // 隐藏操作按钮
        if (this.actionGroup) this.actionGroup.active = false;

        // 播放结算音效
        if (this.audioCtrl) {
            if (msg.kick === this.seat) {
                this.audioCtrl.playResult(1);
            } else {
                this.audioCtrl.playResult(0);
            }
        }

        // 显示结算弹窗
        if (this.dlgResult && this.dlgResultComp) {
            this.dlgResultComp.show(true);

            // 设置翻鸟倍数
            if (msg.data && msg.data.multiple) {
                this.dlgResultComp.setBirdText("翻鸟倍数: x" + msg.data.multiple.toString());
            } else {
                this.dlgResultComp.setBirdText("翻鸟倍数: x1");
            }

            // 设置玩家数据
            let playerCount: number = msg.seats ? msg.seats.length : 4;
            for (let i: number = 0; i < playerCount; i++) {
                let seat: number = msg.seats[i];
                let clientSeat: number = this.server2ClientSeat(seat);
                let playerData: any = {};
                playerData["isWin"] = (seat === msg.kick);
                playerData["isKicked"] = false;

                if (this.players[clientSeat]) {
                    playerData["headTexture"] = this.players[clientSeat].getTexture();
                }
                if (this.playerInfos[seat]) {
                    playerData["nickname"] = this.playerInfos[seat].nickname;
                    playerData["gold"] = this.playerInfos[seat].gold;
                }
                if (msg.golds && msg.golds[i] !== undefined) {
                    playerData["gold"] = msg.golds[i];
                }
                if (msg.winGolds && msg.winGolds[i] !== undefined) {
                    playerData["winGold"] = msg.winGolds[i];
                }
                if (msg.data && msg.data.fanInfo) {
                    playerData["fanInfo"] = msg.data.fanInfo[i];
                }
                this.dlgResultComp.setPlayer(i, playerData, (this.seat === seat));
            }

            // 设置番数
            if (msg.data && msg.data.fanText) {
                this.dlgResultComp.setFanText(msg.data.fanText);
            }

            this.dlgResultComp.startCountDown();
        }
    }

    /**
     * 起手胡通知（长沙麻将特有）
     */
    protected onQiShouHu(msg: any): void {
        if (!msg) return;
        let clientSeat: number = this.server2ClientSeat(msg.seat);
        let huType: string = msg.huType || "起手胡";
        let score: number = msg.score || 0;

        // 播放起手胡音效
        if (this.audioCtrl) {
            this.audioCtrl.playQiShouHu(clientSeat);
        }

        // 显示起手胡提示
        if (msg.seat === this.seat) {
            Client.Instance.showPromptTip("起手胡! " + huType + " +" + score + "分", 3.0);
        } else {
            let name: string = "";
            if (this.playerInfos[msg.seat]) {
                name = this.playerInfos[msg.seat].nickname;
            }
            Client.Instance.showPromptTip("玩家【" + name + "】起手胡! " + huType + " +" + score + "分", 3.0);
        }

        // 显示起手胡动画
        if (this.qiShouHuGroup) {
            if (this.qiShouHuText) {
                this.qiShouHuText.string = "起手胡: " + huType + " +" + score + "分";
            }
            this.qiShouHuGroup.active = true;
            this.qiShouHuGroup.scale = new math.Vec3(0, 0, 1);
            tween(this.qiShouHuGroup)
                .to(0.2, { scale: new math.Vec3(1, 1, 1) }, { easing: 'backOut' })
                .start();
            this.qiShouHuShowing = true;
            this.qiShouHuTimer = 0.0;
        }
    }

    /**
     * 翻鸟结果通知（长沙麻将特有）
     */
    protected onBird(msg: any): void {
        if (!msg) return;

        // 更新翻鸟倍数
        this.birdMultiple = msg.multiple || 1;

        // 播放翻鸟音效
        if (this.audioCtrl) {
            this.audioCtrl.playBird();
        }

        // 构造翻鸟信息文本
        let tileNames: string[] = [];
        if (msg.birdTiles) {
            for (let i: number = 0; i < msg.birdTiles.length; i++) {
                let tile: any = msg.birdTiles[i];
                if (tile && tile.tile) {
                    tileNames.push(this.getTileDisplayName(tile.tile.pattern, tile.tile.number));
                }
            }
        }
        let tilesStr: string = tileNames.length > 0 ? tileNames.join(", ") : "无";

        let hitSeats: string[] = [];
        if (msg.hitSeats) {
            for (let i: number = 0; i < msg.hitSeats.length; i++) {
                let seat: number = msg.hitSeats[i];
                if (this.playerInfos[seat]) {
                    hitSeats.push(this.playerInfos[seat].nickname);
                }
            }
        }
        let hitStr: string = hitSeats.length > 0 ? hitSeats.join(", ") : "无";

        // 显示翻鸟提示
        Client.Instance.showPromptTip("翻鸟: " + tilesStr + ", 命中: " + hitStr + ", 倍数: x" + this.birdMultiple, 4.0);

        // 显示翻鸟动画
        if (this.birdGroup) {
            if (this.birdText) {
                this.birdText.string = "翻鸟: " + tilesStr + ", 命中: " + hitStr;
            }
            if (this.multipleText) {
                this.multipleText.string = "倍数: x" + this.birdMultiple.toString();
            }
            this.birdGroup.active = true;
            this.birdGroup.scale = new math.Vec3(0, 0, 1);
            tween(this.birdGroup)
                .to(0.2, { scale: new math.Vec3(1, 1, 1) }, { easing: 'backOut' })
                .start();
            this.birdShowing = true;
            this.birdTimer = 0.0;
        }
    }

    // ==================== 解散消息处理 ====================

    protected onMsgDisbandVote(msg: any): void {
        // 使用长沙麻将自定义解散投票消息
    }

    protected onMsgDisbandChoice(msg: any): void {
        if (this.dlgDisband) {
            this.dlgDisband.onDisbandChoice(msg.seat, msg.choice);
        }
    }

    protected onMsgDisbandObsolete(): void {
        if (this.dlgDisband) {
            this.dlgDisband.show(false);
        }
    }

    /**
     * 长沙麻将解散投票
     */
    protected onChangShaDisbandVote(msg: any): void {
        if (!msg || !this.dlgDisband) return;

        let names: string[] = new Array(this.playerCount);
        let choices: number[] = new Array(this.playerCount);
        for (let i: number = 0; i < this.playerCount; i++) {
            if (this.playerInfos[i]) {
                names[i] = this.playerInfos[i].nickname;
            }
            choices[i] = 0;
        }
        // 解析已有选择
        if (msg.choices) {
            for (let i: number = 0; i < msg.choices.length; i++) {
                let c: any = msg.choices[i];
                if (c.seat !== undefined && c.choice !== undefined) {
                    choices[c.seat] = c.choice;
                }
            }
        }
        this.dlgDisband.show(true);
        this.dlgDisband.onDisbandVote(msg.disbander, msg.remainTime, names, choices, this.seat);
    }

    // ==================== 手牌操作 ====================

    protected setMahjongHandTiles(tiles: any[]): void {
        if (this.layout) {
            this.layout.setHandTiles(tiles);
        }
    }

    // ==================== C->S 消息发送 ====================

    /**
     * 发送解散选择（长沙麻将使用 ChangSha.Disband）
     */
    private sendDisbandChoice(choice: number): void {
        let msg = {
            venueId: GameManager.Instance.VenueId,
            choice: choice
        };
        NetworkManager.Instance.sendMessage("ChangSha.Disband", msg, true);
    }

    /**
     * 点击准备按钮 - 长沙麻将使用 ChangSha.Ready
     */
    public onReadyClick(): void {
        if (this.seat === -1) return;
        NetworkManager.Instance.sendInnerMessage("ChangSha.Ready");
    }

    // ==================== UI 辅助 ====================

    /**
     * 切换入座界面和游戏界面
     */
    private switchLayers(isSitting: boolean): void {
        if (this.seatLayer) this.seatLayer.active = isSitting;
        if (this.desktopLayer) this.desktopLayer.active = !isSitting;
        if (this.desktopUILayer) this.desktopUILayer.active = !isSitting;
        if (this.btnChat) this.btnChat.active = (this.seat !== -1) && !isSitting;
        if (this.btnVoice) this.btnVoice.active = (this.seat !== -1) && !isSitting;
        if (this.spectatorFlag) this.spectatorFlag.active = (this.seat === -1) && isSitting;

        if (isSitting) {
            if (this.level === RoomLevel.Friend && this.btnStartGame) {
                this.btnStartGame.active = (this.seat === this.ownerSeat);
            }
        }
    }

    /**
     * 清理长沙麻将房间状态
     */
    private clearChangShaRoom(): void {
        this.clearRoom();

        // 清理手牌
        this.handTiles = [];
        this.playedTiles = [[], [], [], []];
        this.chapters = [[], [], [], []];
        this.fetchTile = null;
        this.leftTiles = 0;
        this.actionOptions = [];
        this.birdMultiple = 1;

        if (this.layout) this.layout.clear();
        if (this.playedOut) this.playedOut.clear();
        if (this.qiShouHuGroup) this.qiShouHuGroup.active = false;
        if (this.birdGroup) this.birdGroup.active = false;
        this.qiShouHuShowing = false;
        this.birdShowing = false;

        if (this.leftTilesLabel) this.leftTilesLabel.string = "0";
        if (this.actionGroup) this.actionGroup.active = false;
        if (this.dlgResult) this.dlgResult.active = false;
    }

    // ==================== 动画更新 ====================

    private updateQiShouHu(deltaTime: number): void {
        if (!this.qiShouHuShowing) return;
        this.qiShouHuTimer += deltaTime;
        if (this.qiShouHuTimer >= 3.0) {
            this.qiShouHuShowing = false;
            if (this.qiShouHuGroup) {
                tween(this.qiShouHuGroup)
                    .to(0.2, { scale: new math.Vec3(0, 0, 1) }, { easing: 'backIn' })
                    .call(() => { this.qiShouHuGroup.active = false; })
                    .start();
            }
        }
    }

    private updateBird(deltaTime: number): void {
        if (!this.birdShowing) return;
        this.birdTimer += deltaTime;
        if (this.birdTimer >= 3.0) {
            this.birdShowing = false;
            if (this.birdGroup) {
                tween(this.birdGroup)
                    .to(0.2, { scale: new math.Vec3(0, 0, 1) }, { easing: 'backIn' })
                    .call(() => { this.birdGroup.active = false; })
                    .start();
            }
        }
    }
}
