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
import { YuanJiangQianFenPlayer } from './YuanJiangQianFenPlayer';
import { YuanJiangQianFenSeatPanel } from './YuanJiangQianFenSeatPanel';
import { AudioControl } from './AudioControl';
import { DlgYJQFRoundResult } from './DlgYJQFRoundResult';
import { DlgYJQFFinalResult } from './DlgYJQFFinalResult';

const { ccclass, property } = _decorator;

// 沅江千分游戏内部状态
enum QFGameState {
    // 无
    None = 0,
    // 准备
    Ready = 1,
    // 叫分阶段
    CallScore = 2,
    // 出牌阶段
    Playing = 3,
    // 结算
    Settling = 4
}

@ccclass('YuanJiangQianFenRoom')
export class YuanJiangQianFenRoom extends PokerRoomBase {
    protected playerCount = 4;
    protected roomBundleName = "YuanJiangQianFenRoomMain";

    @property({ type: AudioControl })
    private audioCtrl: AudioControl = null;

    @property({ type: PokerCardLayout })
    private layout: PokerCardLayout = null;

    @property({ type: PokerCardPlayedOut })
    private playedOut: PokerCardPlayedOut = null;

    @property({ type: [YuanJiangQianFenSeatPanel] })
    private seatPanels: YuanJiangQianFenSeatPanel[] = [];

    @property({ type: [YuanJiangQianFenPlayer] })
    private players: YuanJiangQianFenPlayer[] = [];

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

    @property({ type: Node })
    private scoreGroup: Node = null;

    @property({ type: [Node] })
    private scoreButtons: Node[] = [];

    @property({ type: DlgDisbandBase })
    private dlgDisband: DlgDisbandBase = null;

    @property({ type: Node })
    private dlgRoundResult: Node = null;

    @property({ type: Node })
    private dlgFinalResult: Node = null;

    @property({ type: Label })
    private roundNoText: Label = null;

    @property({ type: Label })
    private bankerText: Label = null;

    // 千分游戏内部状态
    private qfGameState: number = QFGameState.None;

    // 当前出牌的服务器座位号
    private currentPlayer: number = -1;

    // 本局庄家服务器座位号
    private banker: number = -1;

    // 当前轮叫分的座位号
    private callScoreSeat: number = -1;

    // 是否正在叫分阶段
    private callScorePhase: boolean = false;

    // 是否为第一手出牌
    private isFirstPlay: boolean = false;

    // 局数
    private roundNo: number = 0;

    // 上次音频倒计时阈值
    private lastClockThreshold: number = -1;

    protected getSyncMsgType(): string {
        return "QianFen.Sync";
    }

    protected onPokerGameMessage(msgType: string, msg: any): boolean {
        if (msgType === "QianFen.SyncResp") { this.onSyncResp(msg); return true; }
        if (msgType === "QianFen.Deal") { this.onDeal(msg); return true; }
        if (msgType === "QianFen.CallScoreNotify") { this.onCallScoreNotify(msg); return true; }
        if (msgType === "QianFen.PlayNotify") { this.onPlayNotify(msg); return true; }
        if (msgType === "QianFen.RoundResult") { this.onRoundResult(msg); return true; }
        if (msgType === "QianFen.FinalResult") { this.onFinalResult(msg); return true; }
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
        let dlgRoundResultComp = this.dlgRoundResult ? this.dlgRoundResult.getComponent(DlgYJQFRoundResult) : null;
        if (dlgRoundResultComp) dlgRoundResultComp.setRoom(this);
        let dlgFinalResultComp = this.dlgFinalResult ? this.dlgFinalResult.getComponent(DlgYJQFFinalResult) : null;
        if (dlgFinalResultComp) dlgFinalResultComp.setRoom(this);
        this.loadPromptPrefabs();
        // 请求同步沅江千分游戏数据
        NetworkManager.Instance.sendInnerMessage("QianFen.Sync");
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

    // ==================== 沅江千分消息处理 ====================

    private onSyncResp(msg: any) {
        if (!msg) return;
        this.clearQianFenRoom();

        // 解析同步数据
        this.seat = msg.mySeat;
        this.qfGameState = msg.gameState;
        this.currentPlayer = msg.currentPlayer;
        this.banker = msg.bankerSeat;
        this.roundNo = msg.roundNo;

        // 判断叫分阶段
        this.callScorePhase = (this.qfGameState === QFGameState.CallScore);
        if (this.callScorePhase) {
            this.callScoreSeat = msg.nextCallScoreSeat || this.currentPlayer;
        }

        // 显示局数
        if (this.roundNoText) {
            this.roundNoText.string = "第" + this.roundNo.toString() + "局";
        }

        // 显示庄家
        this.updateBankerText();

        // 设置手牌
        if (this.layout && msg.myCards) {
            this.layout.setCards(msg.myCards);
        }

        // 根据游戏状态显示UI
        if (this.qfGameState === QFGameState.Ready) {
            this.gameState = GameState.Waiting;
            if (this.readyGroup) this.readyGroup.active = true;
            if (this.btnReady) {
                this.btnReady.active = (this.seat !== -1);
            }
        } else if (this.qfGameState === QFGameState.CallScore) {
            this.gameState = GameState.Playing;
            if (this.readyGroup) this.readyGroup.active = false;
            this.showCallScoreUI();
        } else if (this.qfGameState === QFGameState.Playing) {
            this.gameState = GameState.Playing;
            if (this.readyGroup) this.readyGroup.active = false;
            this.showCurrentPlayerUI();
        } else if (this.qfGameState === QFGameState.Settling) {
            this.gameState = GameState.Waiting;
        }

        // 座位层/桌面层切换
        this.switchLayers();
    }

    private onDeal(msg: any) {
        if (!msg) return;
        this.clearQianFenRoom();
        this.qfGameState = QFGameState.CallScore;
        this.gameState = GameState.Playing;
        this.banker = msg.banker;
        this.roundNo = msg.roundNo;
        this.currentPlayer = msg.banker;
        this.callScoreSeat = msg.banker;
        this.callScorePhase = true;
        this.isFirstPlay = false;

        if (this.roundNoText) {
            this.roundNoText.string = "第" + this.roundNo.toString() + "局";
        }
        this.updateBankerText();
        if (this.readyGroup) this.readyGroup.active = false;

        // 设置手牌
        if (this.layout && msg.cards) {
            this.layout.setCards(msg.cards);
        }

        // 显示叫分UI
        this.showCallScoreUI();

        // 播放发牌音效
        if (this.audioCtrl) {
            this.audioCtrl.playStart();
        }
    }

    private onCallScoreNotify(msg: any) {
        if (!msg) return;
        let clientSeat: number = this.server2ClientSeat(msg.seat);

        // 显示叫分信息
        if (msg.score > 0 && this.playerInfos[msg.seat]) {
            let name: string = this.playerInfos[msg.seat].nickname;
            let text: string = "玩家【" + name + "】叫" + msg.score + "分";
            Client.Instance.showPromptTip(text, 3.0);
        }

        // 播放叫分音效
        if (this.audioCtrl && msg.score > 0) {
            this.audioCtrl.playCallScore(clientSeat);
        }

        // 更新庄家（叫分后庄家可能变化）
        if (msg.bankerSeat !== undefined && msg.bankerSeat >= 0) {
            this.banker = msg.bankerSeat;
            this.updateBankerText();
        }

        // 更新下一个叫分座位
        this.callScoreSeat = msg.nextSeat;
        this.currentPlayer = msg.nextSeat;

        // 检查叫分阶段是否结束
        if (msg.nextSeat === -1 || msg.callScoreEnd) {
            // 叫分结束，进入出牌阶段
            this.callScorePhase = false;
            this.hideCallScoreUI();
        } else {
            // 继续叫分
            this.showCallScoreUI();
        }
    }

    private onPlayNotify(msg: any) {
        if (!msg) return;
        // 叫分阶段结束后的出牌通知，确保叫分UI隐藏
        if (this.callScorePhase) {
            this.callScorePhase = false;
            this.hideCallScoreUI();
        }

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

        // 更新当前出牌玩家
        this.currentPlayer = msg.nextPlayer;

        // 判断是否回到出牌者（新一轮开始）
        if (msg.cardIds && msg.cardIds.length > 0 && msg.seat === msg.nextPlayer) {
            this.isFirstPlay = true;
        } else {
            this.isFirstPlay = false;
        }

        // 播放音效
        if (this.audioCtrl && this.playerInfos[msg.seat]) {
            let sex: number = this.playerInfos[msg.seat].sex;
            if (msg.cardIds && msg.cardIds.length > 0) {
                this.audioCtrl.playGenre((sex === 1), clientSeat, msg.genre || 0, msg.cardIds[0], this.isFirstPlay);
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

    private onRoundResult(msg: any) {
        if (!msg) return;
        this.gameState = GameState.Waiting;
        this.qfGameState = QFGameState.Settling;

        // 隐藏操作按钮
        if (this.passGroup) this.passGroup.active = false;
        if (this.playGroup) this.playGroup.active = false;
        this.hideCallScoreUI();
        this.clockFlag = false;
        if (this.clockArrow) this.clockArrow.active = false;

        // 显示单局结果对话框
        if (!this.dlgRoundResult) return;
        let dlgComp = this.dlgRoundResult.getComponent(DlgYJQFRoundResult);
        if (!dlgComp) return;
        this.showResult = true;
        dlgComp.show(true);

        let scores: number[] = msg.scores;
        let winGolds: number[] = msg.winGolds;

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
            playerData["isWin"] = (winGolds[i] > 0);
            playerData["isFriend"] = this.isFriend(this.seat, serverSeat);
            playerData["winGold"] = winGolds[i];

            dlgComp.setPlayer(i, playerData, (this.seat === serverSeat));
        }

        // 显示分数文字
        let scoreStr: string = "";
        if (scores) {
            for (let i: number = 0; i < scores.length; i++) {
                if (i > 0) scoreStr += " | ";
                scoreStr += scores[i].toString();
            }
        }
        dlgComp.setScoreText(scoreStr);

        // 播放结果音效
        if (this.audioCtrl) {
            let isWin: boolean = false;
            if (this.seat >= 0 && winGolds[this.seat]) {
                isWin = (winGolds[this.seat] > 0);
            }
            this.audioCtrl.playResult(isWin ? 1 : 0);
        }

        dlgComp.startCountDown();
    }

    private onFinalResult(msg: any) {
        if (!msg) return;
        this.gameState = GameState.Waiting;
        this.qfGameState = QFGameState.Settling;

        // 隐藏操作按钮
        if (this.passGroup) this.passGroup.active = false;
        if (this.playGroup) this.playGroup.active = false;
        this.hideCallScoreUI();
        this.clockFlag = false;
        if (this.clockArrow) this.clockArrow.active = false;

        // 显示最终结果对话框
        if (!this.dlgFinalResult) return;
        let dlgComp = this.dlgFinalResult.getComponent(DlgYJQFFinalResult);
        if (!dlgComp) return;
        this.showResult = true;
        dlgComp.show(true);

        let totalScores: number[] = msg.totalScores;
        let totalGolds: number[] = msg.totalGolds;
        let playerIds: string[] = msg.playerIds;

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
            playerData["isWin"] = (totalGolds[i] > 0);
            playerData["isFriend"] = this.isFriend(this.seat, serverSeat);
            playerData["totalGold"] = totalGolds[i];

            dlgComp.setPlayer(i, playerData, (this.seat === serverSeat));
        }

        // 显示总分文字
        let scoreStr: string = "";
        if (totalScores) {
            for (let i: number = 0; i < totalScores.length; i++) {
                if (i > 0) scoreStr += " | ";
                scoreStr += totalScores[i].toString();
            }
        }
        dlgComp.setTotalScoreText(scoreStr);

        // 播放结果音效
        if (this.audioCtrl) {
            let isWin: boolean = false;
            if (this.seat >= 0 && totalGolds[this.seat]) {
                isWin = (totalGolds[this.seat] > 0);
            }
            this.audioCtrl.playResult(isWin ? 1 : 0);
        }

        dlgComp.startCountDown();
    }

    // ==================== 叫分UI ====================

    private showCallScoreUI() {
        if (!this.callScorePhase) return;
        // 判断是否轮到自己叫分
        let isMyTurn: boolean = (this.callScoreSeat === this.seat);
        if (isMyTurn) {
            if (this.scoreGroup) this.scoreGroup.active = true;
            // 显示叫分按钮(1分、2分、3分)
            for (let i: number = 0; i < this.scoreButtons.length; i++) {
                if (this.scoreButtons[i]) {
                    this.scoreButtons[i].active = true;
                }
            }
        } else {
            if (this.scoreGroup) this.scoreGroup.active = false;
        }
        // 隐藏出牌/不出按钮
        if (this.passGroup) this.passGroup.active = false;
        if (this.playGroup) this.playGroup.active = false;

        // 显示倒计时
        let clientSeat: number = this.server2ClientSeat(this.callScoreSeat);
        this.showClock(clientSeat, 0.0);
    }

    private hideCallScoreUI() {
        if (this.scoreGroup) this.scoreGroup.active = false;
        for (let i: number = 0; i < this.scoreButtons.length; i++) {
            if (this.scoreButtons[i]) {
                this.scoreButtons[i].active = false;
            }
        }
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
        this.dlgDisband.onDisbandVote(msg.disbander, msg.elapsed, names, msg.choices, this.seat);
    }

    private onDisbandChoice(msg: any) {
        if (!(msg && this.dlgDisband)) return;
        console.log(msg);
        this.dlgDisband.onDisbandChoice(msg.seat, msg.choice);
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

    private updateBankerText() {
        if (!this.bankerText || this.banker < 0) return;
        let bankerClientSeat = this.server2ClientSeat(this.banker);
        if (bankerClientSeat === 0) {
            this.bankerText.string = "你为庄家";
        } else {
            let name: string = "";
            if (this.playerInfos[this.banker]) {
                name = this.playerInfos[this.banker].nickname;
            }
            this.bankerText.string = "庄家:" + name;
        }
    }

    private showCurrentPlayerUI() {
        if (this.currentPlayer < 0) return;
        let clientSeat: number = this.server2ClientSeat(this.currentPlayer);

        // 显示倒计时
        this.showClock(clientSeat, 0.0);

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

    private clearQianFenRoom() {
        if (this.playedOut) this.playedOut.clear();
        if (this.layout) this.layout.clear();
        if (this.passGroup) this.passGroup.active = false;
        if (this.playGroup) this.playGroup.active = false;
        this.hideCallScoreUI();
        if (this.clockArrow) this.clockArrow.active = false;
        this.clockFlag = false;
        this.clockElapsed = 0.0;
        this.lastClockThreshold = -1;
        this.currentPlayer = -1;
        this.isFirstPlay = false;
        this.callScorePhase = false;
        this.callScoreSeat = -1;
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

    /**
     * 获取指定服务端座位号的友家座位号
     */
    private getFriendSeat(seat: number): number {
        return (seat + 2) % 4;
    }

    /**
     * 判定两个服务端座位号是否为友家
     */
    private isFriend(seat1: number, seat2: number): boolean {
        if (seat1 === seat2) return true;
        return (seat2 === this.getFriendSeat(seat1));
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
        NetworkManager.Instance.sendMessage("QianFen.Play", msg, true);
    }

    public onPassClick() {
        let msg = {
            venueId: GameManager.Instance.VenueId,
            cardIds: []
        };
        NetworkManager.Instance.sendMessage("QianFen.Play", msg, true);
    }

    public onReadyClick() {
        NetworkManager.Instance.sendInnerMessage("QianFen.Ready");
    }

    public onCallScoreClick(event: Event, customEventData: any | null) {
        let score: number = Number(customEventData);
        if (isNaN(score) || score < 1 || score > 3) return;
        let msg = {
            venueId: GameManager.Instance.VenueId,
            score: score
        };
        NetworkManager.Instance.sendMessage("QianFen.CallScore", msg, true);
        // 隐藏叫分按钮
        this.hideCallScoreUI();
    }

    public showPlayerInfo(seat: number) {

    }

    public kickOutPlayer(seat: number) {

    }
}
