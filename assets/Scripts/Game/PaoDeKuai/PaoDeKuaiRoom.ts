import { _decorator, Component, Label, Node, Prefab, instantiate, Sprite, SpriteFrame, math, tween, Quat } from 'cc';
import { PokerRoomBase } from '../Common/PokerRoomBase';
import { PokerCardLayout } from '../Common/PokerCardLayout';
import { PokerCardPlayedOut } from '../Common/PokerCardPlayedOut';
import { DlgDisbandBase } from '../Common/DlgDisbandBase';
import { NetMsgHandler, NetMsgManager } from '../../Manager/NetMsgManager';
import { ConnectionHandler, NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { ResourceLoader } from '../../Manager/ResourceLoader';
import { Client } from '../Client';
import { PaoDeKuaiPlayer } from './PaoDeKuaiPlayer';
import { PaoDeKuaiSeatPanel } from './PaoDeKuaiSeatPanel';
import { AudioControl } from './AudioControl';
import { DlgPDKResult } from './DlgPDKResult';

const { ccclass, property } = _decorator;

@ccclass('PaoDeKuaiRoom')
export class PaoDeKuaiRoom extends PokerRoomBase {
    protected playerCount = 2;
    protected roomBundleName = "PaoDeKuaiRoomMain";

    @property({ type: AudioControl })
    private audioCtrl: AudioControl = null;

    @property({ type: PokerCardLayout })
    private layout: PokerCardLayout = null;

    @property({ type: PokerCardPlayedOut })
    private playedOut: PokerCardPlayedOut = null;

    @property({ type: [PaoDeKuaiSeatPanel] })
    private seatPanels: PaoDeKuaiSeatPanel[] = [];

    @property({ type: [PaoDeKuaiPlayer] })
    private players: PaoDeKuaiPlayer[] = [];

    @property({ type: [Node] })
    private playerBodySlots: Node[] = [];

    @property({ type: [Node] })
    private readyFlags: Node[] = [];

    @property({ type: Node })
    private clockArrow: Node = null;

    @property({ type: Node })
    private clockDirection1: Node = null;

    @property({ type: Label })
    private clockSecond: Label = null;

    @property({ type: Node })
    private passGroup: Node = null;

    @property({ type: Node })
    private playGroup: Node = null;

    @property({ type: DlgDisbandBase })
    private dlgDisband: DlgDisbandBase = null;

    @property({ type: Node })
    private dlgResult: Node = null;

    @property({ type: Label })
    private roundNoText: Label = null;

    @property({ type: Label })
    private bankerText: Label = null;

    // 跑得快游戏状态
    // None(0) -> Ready(1) -> Playing(2) -> Settling(3)
    protected pdkGameState: number = 0;

    // 当前出牌的服务器座位号
    private currentPlayer: number = -1;

    // 本局庄家服务器座位号
    private banker: number = -1;

    // 是否为第一手出牌
    private isFirstPlay: boolean = false;

    // 上一手出牌的服务器座位号
    private lastPlaySeat: number = -1;

    // 上一手出牌牌型
    private lastPlayGenre: number = -1;

    // 局数
    private roundNo: number = 0;

    // 上次音频倒计时阈值
    private lastClockThreshold: number = -1;

    protected getSyncMsgType(): string {
        return "PaoDeKuai.Sync";
    }

    protected onPokerGameMessage(msgType: string, msg: any): boolean {
        if (msgType === "PaoDeKuai.SyncResp") { this.onSyncResp(msg); return true; }
        if (msgType === "PaoDeKuai.Deal") { this.onDeal(msg); return true; }
        if (msgType === "PaoDeKuai.PlayNotify") { this.onPlayNotify(msg); return true; }
        if (msgType === "PaoDeKuai.PlayFailed") { this.onPlayFailed(msg); return true; }
        if (msgType === "PaoDeKuai.Settlement") { this.onSettlement(msg); return true; }
        if (msgType === "MsgDisbandVote") { this.onDisbandVote(msg); return true; }
        if (msgType === "MsgDisbandChoice") { this.onDisbandChoice(msg); return true; }
        if (msgType === "MsgDisbandObsolete") { this.onDisbandObsolete(); return true; }
        if (msgType === "MsgDisband") { this.onDisband(); return true; }
        return false;
    }

    start() {
        if (this.layout) this.layout.setRoom(this);
        for (let i: number = 0; i < this.playerCount; i++) {
            if (this.seatPanels[i]) this.seatPanels[i].setData(i, this);
        }
        let dlgResultComp = this.dlgResult ? this.dlgResult.getComponent(DlgPDKResult) : null;
        if (dlgResultComp) dlgResultComp.setRoom(this);
        this.loadPromptPrefabs();
        // 请求同步跑得快游戏数据
        NetworkManager.Instance.sendInnerMessage("PaoDeKuai.Sync");
    }

    update(deltaTime: number) {
        this.updateClock(deltaTime);
    }

    private updateClock(deltaTime: number) {
        if (!this.clockFlag) return;
        if (this.clockElapsed < 15.0) {
            let tmp: number = this.clockElapsed;
            this.clockElapsed = this.clockElapsed + deltaTime;
            let sec = 15.0 - this.clockElapsed;
            if (sec < 0) {
                sec = 0.0;
            }
            sec = Math.floor(sec);
            if (this.clockSecond) {
                this.clockSecond.string = sec.toString();
            }
            if (this.clockSelf && this.audioCtrl) {
                let count: number = -1;
                if (tmp < 9.0 && this.clockElapsed >= 9.0) count = 5;
                else if (tmp < 10.0 && this.clockElapsed >= 10.0) count = 4;
                else if (tmp < 11.0 && this.clockElapsed >= 11.0) count = 3;
                else if (tmp < 12.0 && this.clockElapsed >= 12.0) count = 2;
                else if (tmp < 13.0 && this.clockElapsed >= 13.0) count = 1;
                else if (tmp < 14.0 && this.clockElapsed >= 14.0) count = 0;
                if (count !== -1 && count !== this.lastClockThreshold) {
                    this.lastClockThreshold = count;
                    this.audioCtrl.playCountdown(count);
                }
            }
        }
        else {
            this.clockFlag = false;
            this.lastClockThreshold = -1;
            if (this.clockSecond) this.clockSecond.string = "0";
        }
    }

    // ==================== 跑得快消息处理 ====================

    private onSyncResp(msg: any) {
        if (!msg) return;
        this.clearPaoDeKuaiRoom();

        // 解析同步数据
        this.seat = msg.mySeat;
        this.pdkGameState = msg.gameState;
        this.currentPlayer = msg.currentPlayer;
        this.banker = msg.banker;
        this.roundNo = msg.roundNo;
        this.isFirstPlay = msg.isFirstPlay;
        this.lastPlaySeat = msg.lastPlaySeat;
        this.lastPlayGenre = msg.lastPlayGenre;

        // 显示局数
        if (this.roundNoText) {
            this.roundNoText.string = "第" + this.roundNo.toString() + "局";
        }

        // 显示庄家
        if (this.bankerText && this.banker >= 0) {
            let bankerClientSeat = this.server2ClientSeat(this.banker);
            if (bankerClientSeat === 0) {
                this.bankerText.string = "你为庄家";
            } else {
                this.bankerText.string = "对方为庄家";
            }
        }

        // 设置手牌
        if (this.layout && msg.myCards) {
            this.layout.setCards(msg.myCards);
        }

        // 显示上一手出牌
        if (this.playedOut && msg.lastPlayCards && msg.lastPlayCards.length > 0) {
            let lastPlayClientSeat = this.server2ClientSeat(msg.lastPlaySeat);
            this.playedOut.playCards(lastPlayClientSeat, msg.lastPlayCards);
        }

        // 根据游戏状态显示UI
        if (this.pdkGameState === 1) {
            // Ready状态
            this.gameState = GameState.Waiting;
            if (this.readyGroup) this.readyGroup.active = true;
            if (this.btnReady) {
                this.btnReady.active = (this.seat !== -1);
            }
        } else if (this.pdkGameState === 2) {
            // Playing状态
            this.gameState = GameState.Playing;
            if (this.readyGroup) this.readyGroup.active = false;
            this.showCurrentPlayerUI();
        } else if (this.pdkGameState === 3) {
            // Settling状态，等Settlement消息
            this.gameState = GameState.Waiting;
        }

        // 座位层/桌面层切换
        this.switchLayers();
    }

    private onDeal(msg: any) {
        if (!msg) return;
        this.clearPaoDeKuaiRoom();
        this.pdkGameState = 2;
        this.gameState = GameState.Playing;
        this.banker = msg.banker;
        this.roundNo = msg.roundNo;
        this.isFirstPlay = true;
        this.lastPlaySeat = -1;
        this.lastPlayGenre = -1;

        if (this.roundNoText) {
            this.roundNoText.string = "第" + this.roundNo.toString() + "局";
        }
        if (this.bankerText && this.banker >= 0) {
            let bankerClientSeat = this.server2ClientSeat(this.banker);
            if (bankerClientSeat === 0) {
                this.bankerText.string = "你为庄家";
            } else {
                this.bankerText.string = "对方为庄家";
            }
        }
        if (this.readyGroup) this.readyGroup.active = false;

        // 设置手牌
        if (this.layout && msg.cards) {
            this.layout.setCards(msg.cards);
        }

        // 设置当前出牌玩家
        this.currentPlayer = msg.firstPlayer;
        this.showCurrentPlayerUI();

        // 播放发牌音效
        if (this.audioCtrl) {
            this.audioCtrl.playStart();
        }
    }

    private onPlayNotify(msg: any) {
        if (!msg) return;
        let clientSeat: number = this.server2ClientSeat(msg.seat);

        // 显示出牌或不出
        if (this.playedOut) {
            if (msg.cardIds && msg.cardIds.length > 0) {
                this.playedOut.playCards(clientSeat, msg.cardIds);
            } else {
                // 不出
                this.playedOut.showFlag(clientSeat, 1);
            }
        }

        // 如果是自己出的牌，从手牌中移除
        if (msg.seat === this.seat && msg.cardIds && msg.cardIds.length > 0) {
            if (this.layout) {
                this.layout.removeCards(msg.cardIds);
            }
        }

        // 更新状态
        this.lastPlaySeat = msg.seat;
        this.lastPlayGenre = msg.genre;
        this.currentPlayer = msg.nextPlayer;

        if (msg.cardIds && msg.cardIds.length > 0 && this.lastPlaySeat === this.currentPlayer) {
            // 回到出牌者自己出牌，说明新一轮开始
            this.isFirstPlay = true;
        } else {
            this.isFirstPlay = false;
        }

        // 播放音效
        if (this.audioCtrl && this.playerInfos[msg.seat]) {
            let sex: number = this.playerInfos[msg.seat].sex;
            if (msg.cardIds && msg.cardIds.length > 0) {
                this.audioCtrl.playGenre((sex === 1), clientSeat, msg.genre, msg.cardIds[0], this.isFirstPlay);
            } else {
                this.audioCtrl.playPass((sex === 1), clientSeat);
            }
        }

        // 隐藏操作按钮
        if (this.passGroup) this.passGroup.active = false;
        if (this.playGroup) this.playGroup.active = false;

        // 显示下一玩家操作UI
        this.showCurrentPlayerUI();
    }

    private onPlayFailed(msg: any) {
        if (!msg) return;
        Client.Instance.showPromptTip(msg.errMsg, 4.0);
    }

    private onSettlement(msg: any) {
        if (!msg) return;
        this.gameState = GameState.Waiting;
        this.pdkGameState = 3;

        // 隐藏操作按钮
        if (this.passGroup) this.passGroup.active = false;
        if (this.playGroup) this.playGroup.active = false;
        this.clockFlag = false;
        if (this.clockArrow) this.clockArrow.active = false;

        // 显示结果对话框
        if (!this.dlgResult) return;
        let dlgResultComp = this.dlgResult.getComponent(DlgPDKResult);
        if (!dlgResultComp) return;
        this.showResult = true;
        dlgResultComp.show(true);

        let winnerSeat: number = msg.winnerSeat;
        let scores: number[] = msg.scores;
        let winGolds: number[] = msg.winGolds;
        let remainCards: number[][] = msg.remainCards;

        for (let i: number = 0; i < this.playerCount; i++) {
            let serverSeat: number = this.client2ServerSeat(i);
            let clientSeat: number = i;
            let playerData: any = {};

            if (this.players[clientSeat]) {
                playerData["headTexture"] = this.players[clientSeat].getTexture();
            }
            if (this.playerInfos[serverSeat]) {
                playerData["nickname"] = this.playerInfos[serverSeat].nickname;
            }
            playerData["isWin"] = (serverSeat === winnerSeat);
            playerData["winGold"] = winGolds[i];

            dlgResultComp.setPlayer(i, playerData, (this.seat === serverSeat));
        }

        // 显示分数文字
        let scoreStr: string = "";
        for (let i: number = 0; i < this.playerCount; i++) {
            if (i > 0) scoreStr += " | ";
            scoreStr += scores[i].toString();
        }
        dlgResultComp.setScoreText(scoreStr);

        // 播放结果音效
        if (this.audioCtrl) {
            let isWin: boolean = (this.seat === winnerSeat);
            this.audioCtrl.playResult(isWin ? 1 : 0);
        }

        dlgResultComp.startCountDown();
    }

    // ==================== 解散房间 ====================

    private onDisbandVote(msg: any) {
        if (!(msg && this.dlgDisband)) return;
        this.dlgDisbanding = true;
        this.dlgDisband.show(true);
        let names: string[] = new Array(this.playerCount);
        for (let i: number = 0; i < this.playerCount; i++) {
            if (this.playerInfos[i]) {
                names[i] = this.playerInfos[i].nickname;
            }
        }
        this.dlgDisband.onDisbandVote(msg, names, this.seat);
    }

    private onDisbandChoice(msg: any) {
        if (!(msg && this.dlgDisband)) return;
        console.log(msg);
        this.dlgDisband.onDisbandChoice(msg.seat, this.seat, msg.choice);
    }

    private onDisbandObsolete() {
        this.dlgDisbanding = false;
        if (this.dlgDisband) {
            this.dlgDisband.show(false);
        }
    }

    private onDisband() {
        Client.Instance.showPromptDialog("房间已解散，请返回大厅。", () => { this.exitRoom(); }, () => { this.exitRoom(); });
    }

    // ==================== UI 操作 ====================

    private showCurrentPlayerUI() {
        if (this.currentPlayer < 0) return;
        let clientSeat: number = this.server2ClientSeat(this.currentPlayer);

        // 显示倒计时
        let rotateAngles = [90.0, 180.0, 270.0, 0.0];
        if (this.clockArrow) {
            this.clockArrow.active = true;
            this.clockFlag = true;
            this.clockSelf = (clientSeat === 0);
            this.clockElapsed = 0.0;
            this.lastClockThreshold = -1;
            if (this.clockDirection1 && clientSeat < rotateAngles.length) {
                let quat = new Quat();
                math.Quat.fromAngleZ(quat, rotateAngles[clientSeat]);
                this.clockDirection1.rotation = quat;
            }
        }

        // 显示/隐藏操作按钮
        if (clientSeat === 0) {
            if (this.passGroup) {
                this.passGroup.active = !this.isFirstPlay;
            }
            if (this.playGroup) {
                this.playGroup.active = true;
            }
            if (this.layout) this.layout.unselectAll();
        } else {
            if (this.passGroup) this.passGroup.active = false;
            if (this.playGroup) this.playGroup.active = false;
        }
    }

    private clearPaoDeKuaiRoom() {
        if (this.playedOut) this.playedOut.clear();
        if (this.layout) this.layout.clear();
        if (this.passGroup) this.passGroup.active = false;
        if (this.playGroup) this.playGroup.active = false;
        if (this.clockArrow) this.clockArrow.active = false;
        this.clockFlag = false;
        this.clockElapsed = 0.0;
        this.lastClockThreshold = -1;
        this.currentPlayer = -1;
        this.isFirstPlay = false;
        this.lastPlaySeat = -1;
        this.lastPlayGenre = -1;
        if (this.roundNoText) this.roundNoText.string = "";
        if (this.bankerText) this.bankerText.string = "";
    }

    private switchLayers() {
        let isSitting: boolean = (this.gameState === GameState.Sitting);
        if (this.seatLayer) this.seatLayer.active = isSitting;
        if (this.desktopLayer) this.desktopLayer.active = !isSitting;
        if (this.desktopUILayer) this.desktopUILayer.active = !isSitting;
        if (this.btnChat) this.btnChat.active = (this.seat !== -1);
        if (this.btnVoice) this.btnVoice.active = (this.seat !== -1);
    }

    // ==================== 按钮点击事件 ====================

    public onPlayClick() {
        if (!this.layout) return;
        let cardIds: number[] = this.layout.getSelectedCardIds();
        if (cardIds.length === 0) {
            Client.Instance.showPromptTip("未选中任何牌", 3.0);
            return;
        }
        let msg = {
            venueId: GameManager.Instance.VenueId,
            cardIds: cardIds
        };
        NetworkManager.Instance.sendMessage("PaoDeKuai.Play", msg, true);
    }

    public onPassClick() {
        let msg = {
            venueId: GameManager.Instance.VenueId,
            cardIds: []
        };
        NetworkManager.Instance.sendMessage("PaoDeKuai.Play", msg, true);
    }

    public onReadyClick() {
        NetworkManager.Instance.sendInnerMessage("PaoDeKuai.Ready");
    }

    public showPlayerInfo(seat: number) {

    }

    public kickOutPlayer(seat: number) {

    }
}
