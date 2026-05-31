import { _decorator, Component, Label, Node, Prefab, Sprite, SpriteFrame, math, Quat } from 'cc';
import { BaseRoom, GameState, RoomLevel } from '../Common/BaseRoom';
import { WaiHuZiCardLayout } from './WaiHuZiCardLayout';
import { WaiHuZiCardSlot } from './WaiHuZiCardSlot';
import { DlgDisbandBase } from '../Common/DlgDisbandBase';
import { NetMsgManager } from '../../Manager/NetMsgManager';
import { ConnectionHandler, NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { ResourceLoader } from '../../Manager/ResourceLoader';
import { Client } from '../Client';
import { WaiHuZiAction } from '../../Common/ConstDefines';
import { WaiHuZiPlayer } from './WaiHuZiPlayer';
import { WaiHuZiSeatPanel } from './WaiHuZiSeatPanel';
import { AudioControl } from './AudioControl';
import { DlgWHZResult } from './DlgWHZResult';

const { ccclass, property } = _decorator;

// 歪胡子内部游戏状态
enum WHZGameState {
    // 无
    None = 0,
    // 准备
    Ready = 1,
    // 出牌阶段
    Playing = 2,
    // 结算
    Settling = 3
}

// 歪胡子操作选项
export class WHZActionOption {
    public action: number = WaiHuZiAction.None;
    public cardIds: number[] = [];
}

@ccclass('WaiHuZiRoom')
export class WaiHuZiRoom extends BaseRoom {
    protected playerCount = 3;
    protected roomBundleName = "WaiHuZiRoomMain";

    @property({ type: AudioControl })
    private audioCtrl: AudioControl = null;

    @property({ type: WaiHuZiCardLayout })
    private layout: WaiHuZiCardLayout = null;

    @property({ type: [WaiHuZiSeatPanel] })
    private seatPanels: WaiHuZiSeatPanel[] = [];

    @property({ type: [WaiHuZiPlayer] })
    private players: WaiHuZiPlayer[] = [];

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

    @property({ type: Label })
    private remainCountLabel: Label = null;

    @property({ type: Node })
    private discardGroup: Node = null;

    @property({ type: Node })
    private actionGroup: Node = null;

    @property({ type: Node })
    private btnHu: Node = null;

    @property({ type: Node })
    private btnChi: Node = null;

    @property({ type: Node })
    private btnPeng: Node = null;

    @property({ type: Node })
    private btnWei: Node = null;

    @property({ type: Node })
    private btnPao: Node = null;

    @property({ type: Node })
    private btnTi: Node = null;

    @property({ type: Node })
    private btnPass: Node = null;

    @property({ type: [Node] })
    private playedOutAreas: Node[] = [];

    @property({ type: [Node] })
    private chapterAreas: Node[] = [];

    @property({ type: DlgDisbandBase })
    private dlgDisband: DlgDisbandBase = null;

    @property({ type: Node })
    private dlgResult: Node = null;

    @property({ type: Label })
    private roundNoText: Label = null;

    @property({ type: Label })
    private bankerText: Label = null;

    // 歪胡子游戏状态
    private whzGameState: number = WHZGameState.None;

    // 当前操作玩家（服务端座位号）
    private currentPlayer: number = -1;

    // 庄家（服务端座位号）
    private banker: number = -1;

    // 上一张出的牌ID
    private lastDiscardId: number = -1;

    // 上一张出的牌的座位号（服务端）
    private lastDiscardSeat: number = -1;

    // 局数
    private roundNo: number = 0;

    // 剩余牌数
    private remainCount: number = 0;

    // 手牌ID数组
    private myCards: number[] = [];

    // 当前可选操作列表
    private actionOptions: WHZActionOption[] = [];

    // 副露数据（各玩家的碰/吃/偎/跑/提组合）
    private chapters: any[][] = [[], [], []];

    // 上次音频倒计时阈值
    private lastClockThreshold: number = -1;

    protected getSyncMsgType(): string {
        return "WaiHuZi.Sync";
    }

    protected onGameMessage(msgType: string, msg: any): boolean {
        // 歪胡子专有消息
        if (msgType === "WaiHuZi.SyncResp") { this.onSyncResp(msg); return true; }
        if (msgType === "WaiHuZi.Deal") { this.onDeal(msg); return true; }
        if (msgType === "WaiHuZi.DrawNotify") { this.onDrawNotify(msg); return true; }
        if (msgType === "WaiHuZi.DiscardNotify") { this.onDiscardNotify(msg); return true; }
        if (msgType === "WaiHuZi.ActionNotify") { this.onActionNotify(msg); return true; }
        if (msgType === "WaiHuZi.Settlement") { this.onSettlement(msg); return true; }

        // 解散消息
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
        let dlgResultComp = this.dlgResult ? this.dlgResult.getComponent(DlgWHZResult) : null;
        if (dlgResultComp) dlgResultComp.setRoom(this);
        this.loadPromptPrefabs();
        // 请求同步歪胡子游戏数据
        NetworkManager.Instance.sendInnerMessage("WaiHuZi.Sync");
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

    // ==================== 歪胡子消息处理 ====================

    private onSyncResp(msg: any) {
        if (!msg) return;
        this.clearWaiHuZiRoom();

        // 解析同步数据
        this.seat = msg.mySeat;
        this.whzGameState = msg.gameState;
        this.currentPlayer = msg.currentPlayer;
        this.banker = msg.banker;
        this.roundNo = msg.roundNo;
        this.lastDiscardId = msg.lastDiscardId || -1;
        this.lastDiscardSeat = msg.lastDiscardSeat || -1;

        // 设置手牌
        if (msg.myCards) {
            this.myCards = msg.myCards;
            if (this.layout) {
                this.layout.setCards(this.myCards);
            }
        }

        // 显示局数
        if (this.roundNoText) {
            this.roundNoText.string = "第" + this.roundNo.toString() + "局";
        }

        // 显示庄家
        this.updateBankerText();

        // 显示上一张出的牌
        if (this.lastDiscardId >= 0 && this.lastDiscardSeat >= 0) {
            this.showLastDiscard(this.lastDiscardSeat, this.lastDiscardId);
        }

        // 根据游戏状态显示UI
        if (this.whzGameState === WHZGameState.Ready) {
            this.gameState = GameState.Waiting;
            if (this.readyGroup) this.readyGroup.active = true;
            if (this.btnReady) {
                this.btnReady.active = (this.seat !== -1);
            }
        } else if (this.whzGameState === WHZGameState.Playing) {
            this.gameState = GameState.Playing;
            if (this.readyGroup) this.readyGroup.active = false;
            this.showCurrentPlayerUI();
        } else if (this.whzGameState === WHZGameState.Settling) {
            this.gameState = GameState.Waiting;
        }

        // 座位层/桌面层切换
        this.switchLayers();
    }

    private onDeal(msg: any) {
        if (!msg) return;
        this.clearWaiHuZiRoom();
        this.whzGameState = WHZGameState.Playing;
        this.gameState = GameState.Playing;
        this.banker = msg.banker;
        this.roundNo = msg.roundNo;
        this.currentPlayer = msg.firstPlayer;
        this.lastDiscardId = -1;
        this.lastDiscardSeat = -1;

        if (this.roundNoText) {
            this.roundNoText.string = "第" + this.roundNo.toString() + "局";
        }
        this.updateBankerText();
        if (this.readyGroup) this.readyGroup.active = false;

        // 设置手牌
        if (msg.cards) {
            this.myCards = msg.cards;
            if (this.layout) {
                this.layout.setCards(this.myCards);
            }
        }

        // 庄家先摸第一张牌
        // DrawNotify 会处理摸牌后的逻辑
        this.showCurrentPlayerUI();

        // 播放发牌音效
        if (this.audioCtrl) {
            this.audioCtrl.playStart();
        }
    }

    private onDrawNotify(msg: any) {
        if (!msg) return;
        let clientSeat: number = this.server2ClientSeat(msg.seat);

        // 更新剩余牌数
        if (msg.remainCount !== undefined) {
            this.remainCount = msg.remainCount;
            if (this.remainCountLabel) {
                this.remainCountLabel.string = "余" + this.remainCount.toString() + "张";
            }
        }

        // 如果是自己摸的牌，加入手牌
        if (msg.seat === this.seat && msg.cardId > 0) {
            this.myCards.push(msg.cardId);
            if (this.layout) {
                this.layout.addCard(msg.cardId);
            }
        }

        // 更新当前出牌玩家
        this.currentPlayer = msg.seat;
        this.showCurrentPlayerUI();
    }

    private onDiscardNotify(msg: any) {
        if (!msg) return;
        let clientSeat: number = this.server2ClientSeat(msg.seat);

        // 显示出的牌
        this.showPlayedCard(clientSeat, msg.cardId);

        // 如果是自己出的牌，从手牌中移除
        if (msg.seat === this.seat) {
            if (this.layout) {
                this.layout.removeCards([msg.cardId]);
            }
            // 从myCards中移除
            let idx = this.myCards.indexOf(msg.cardId);
            if (idx !== -1) this.myCards.splice(idx, 1);
        }

        // 更新最后出的牌
        this.lastDiscardId = msg.cardId;
        this.lastDiscardSeat = msg.seat;

        // 更新下一个出牌玩家
        this.currentPlayer = msg.nextPlayer;

        // 隐藏操作按钮
        this.hideActionButtons();
        this.hideDiscardGroup();

        // 播放出牌音效
        if (this.audioCtrl && this.playerInfos[msg.seat]) {
            let sex: number = this.playerInfos[msg.seat].sex;
            this.audioCtrl.playDiscard((sex === 1), clientSeat);
        }

        // 显示下一玩家操作UI（下一玩家需要摸牌）
        this.showCurrentPlayerUI();
    }

    private onActionNotify(msg: any) {
        if (!msg) return;
        let clientSeat: number = this.server2ClientSeat(msg.seat);

        // 更新副露显示
        if (msg.cardIds && msg.cardIds.length > 0) {
            this.addChapter(clientSeat, msg.action, msg.cardIds);
        }

        // 如果是自己操作的，从手牌中移除相关牌
        if (msg.seat === this.seat && msg.cardIds && msg.cardIds.length > 0) {
            if (this.layout) {
                this.layout.removeCards(msg.cardIds);
            }
            for (let i: number = 0; i < msg.cardIds.length; i++) {
                let idx = this.myCards.indexOf(msg.cardIds[i]);
                if (idx !== -1) this.myCards.splice(idx, 1);
            }
        }

        // 更新当前出牌玩家
        this.currentPlayer = msg.nextPlayer;

        // 隐藏操作按钮
        this.hideActionButtons();
        this.hideDiscardGroup();

        // 播放操作音效
        if (this.audioCtrl && this.playerInfos[msg.seat]) {
            let sex: number = this.playerInfos[msg.seat].sex;
            switch (msg.action) {
                case WaiHuZiAction.Chi:
                    this.audioCtrl.playChi((sex === 1), clientSeat);
                    break;
                case WaiHuZiAction.Peng:
                    this.audioCtrl.playPeng((sex === 1), clientSeat);
                    break;
                case WaiHuZiAction.Wei:
                    this.audioCtrl.playWei((sex === 1), clientSeat);
                    break;
                case WaiHuZiAction.Pao:
                    this.audioCtrl.playPao((sex === 1), clientSeat);
                    break;
                case WaiHuZiAction.Ti:
                    this.audioCtrl.playTi((sex === 1), clientSeat);
                    break;
                case WaiHuZiAction.Hu:
                    this.audioCtrl.playHu((sex === 1), clientSeat);
                    break;
                case WaiHuZiAction.Pass:
                    this.audioCtrl.playPass((sex === 1), clientSeat);
                    break;
            }
        }

        // 显示操作提示
        if (msg.action === WaiHuZiAction.Hu) {
            let name: string = "";
            if (this.playerInfos[msg.seat]) {
                name = this.playerInfos[msg.seat].nickname;
            }
            Client.Instance.showPromptTip("玩家【" + name + "】胡了！", 3.0);
        }

        // 显示下一玩家操作UI
        this.showCurrentPlayerUI();
    }

    private onSettlement(msg: any) {
        if (!msg) return;
        this.gameState = GameState.Waiting;
        this.whzGameState = WHZGameState.Settling;

        // 隐藏所有操作按钮
        this.hideActionButtons();
        this.hideDiscardGroup();
        this.clockFlag = false;
        if (this.clockArrow) this.clockArrow.active = false;

        // 显示结果对话框
        if (!this.dlgResult) return;
        let dlgResultComp = this.dlgResult.getComponent(DlgWHZResult);
        if (!dlgResultComp) return;
        this.showResult = true;
        dlgResultComp.show(true);

        let huSeat: number = msg.huSeat;
        let huXi: number = msg.huXi;
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
            playerData["isWin"] = (serverSeat === huSeat);
            playerData["winGold"] = winGolds[i];
            // 只有胡的玩家显示胡息
            playerData["huXi"] = (serverSeat === huSeat) ? huXi : 0;

            dlgResultComp.setPlayer(i, playerData, (this.seat === serverSeat));
        }

        // 显示分数文字
        let scoreStr: string = "";
        if (scores) {
            for (let i: number = 0; i < scores.length; i++) {
                if (i > 0) scoreStr += " | ";
                scoreStr += scores[i].toString();
            }
        }
        dlgResultComp.setScoreText(scoreStr);
        dlgResultComp.setHuXiText("胡息: " + huXi.toString());

        // 播放结果音效
        if (this.audioCtrl) {
            let isWin: boolean = (this.seat === huSeat);
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

        // 显示/隐藏出牌按钮
        if (clientSeat === 0) {
            if (this.discardGroup) {
                this.discardGroup.active = true;
            }
            if (this.layout) this.layout.unselectAll();
        } else {
            if (this.discardGroup) this.discardGroup.active = false;
        }
    }

    /**
     * 显示操作按钮（吃/碰/偎/跑/提/胡/过）
     * @param options 服务端返回的可选操作列表
     */
    private showActionButtons(options: WHZActionOption[]) {
        this.actionOptions = options;
        if (!this.actionGroup) return;
        this.actionGroup.active = true;

        // 隐藏所有按钮
        if (this.btnHu) this.btnHu.active = false;
        if (this.btnChi) this.btnChi.active = false;
        if (this.btnPeng) this.btnPeng.active = false;
        if (this.btnWei) this.btnWei.active = false;
        if (this.btnPao) this.btnPao.active = false;
        if (this.btnTi) this.btnTi.active = false;
        if (this.btnPass) this.btnPass.active = false;

        // 遍历可选操作，显示对应按钮
        for (let i: number = 0; i < options.length; i++) {
            let opt: WHZActionOption = options[i];
            switch (opt.action) {
                case WaiHuZiAction.Hu:
                    if (this.btnHu) this.btnHu.active = true;
                    break;
                case WaiHuZiAction.Chi:
                    if (this.btnChi) this.btnChi.active = true;
                    break;
                case WaiHuZiAction.Peng:
                    if (this.btnPeng) this.btnPeng.active = true;
                    break;
                case WaiHuZiAction.Wei:
                    if (this.btnWei) this.btnWei.active = true;
                    break;
                case WaiHuZiAction.Pao:
                    if (this.btnPao) this.btnPao.active = true;
                    break;
                case WaiHuZiAction.Ti:
                    if (this.btnTi) this.btnTi.active = true;
                    break;
            }
        }

        // 始终显示过牌按钮
        if (this.btnPass) this.btnPass.active = true;

        // 隐藏出牌按钮（操作期间不能直接出牌）
        if (this.discardGroup) this.discardGroup.active = false;
    }

    private hideActionButtons() {
        this.actionOptions = [];
        if (this.actionGroup) this.actionGroup.active = false;
        if (this.btnHu) this.btnHu.active = false;
        if (this.btnChi) this.btnChi.active = false;
        if (this.btnPeng) this.btnPeng.active = false;
        if (this.btnWei) this.btnWei.active = false;
        if (this.btnPao) this.btnPao.active = false;
        if (this.btnTi) this.btnTi.active = false;
        if (this.btnPass) this.btnPass.active = false;
    }

    private hideDiscardGroup() {
        if (this.discardGroup) this.discardGroup.active = false;
    }

    /**
     * 在出牌区域显示一张牌
     */
    private showPlayedCard(clientSeat: number, cardId: number) {
        if (clientSeat >= 0 && clientSeat < this.playedOutAreas.length) {
            if (this.playedOutAreas[clientSeat]) {
                let label: Label = this.playedOutAreas[clientSeat].getComponent(Label);
                if (label) {
                    label.string = WaiHuZiCardSlot.getPointName(cardId);
                }
            }
        }
    }

    /**
     * 显示最后一张出的牌
     */
    private showLastDiscard(serverSeat: number, cardId: number) {
        let clientSeat: number = this.server2ClientSeat(serverSeat);
        this.showPlayedCard(clientSeat, cardId);
    }

    /**
     * 添加副露
     */
    private addChapter(clientSeat: number, action: number, cardIds: number[]) {
        if (clientSeat >= 0 && clientSeat < this.chapters.length) {
            this.chapters[clientSeat].push({
                action: action,
                cardIds: cardIds
            });
        }
    }

    private clearWaiHuZiRoom() {
        if (this.layout) this.layout.clear();
        this.hideActionButtons();
        this.hideDiscardGroup();
        if (this.clockArrow) this.clockArrow.active = false;
        this.clockFlag = false;
        this.clockElapsed = 0.0;
        this.lastClockThreshold = -1;
        this.currentPlayer = -1;
        this.lastDiscardId = -1;
        this.lastDiscardSeat = -1;
        this.myCards = [];
        this.actionOptions = [];
        this.chapters = [[], [], []];
        if (this.roundNoText) this.roundNoText.string = "";
        if (this.bankerText) this.bankerText.string = "";
        if (this.remainCountLabel) this.remainCountLabel.string = "";
        // 清空副露区域
        for (let i: number = 0; i < this.chapterAreas.length; i++) {
            if (this.chapterAreas[i]) {
                // 清除子节点
                this.chapterAreas[i].removeAllChildren();
            }
        }
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

    /**
     * 点击出牌按钮
     */
    public onDiscardClick() {
        if (!this.layout) return;
        let cardId: number = this.layout.getSelectedCardId();
        if (cardId < 0) {
            Client.Instance.showPromptTip("未选中任何牌", 3.0);
            return;
        }
        let msg = {
            venueId: GameManager.Instance.VenueId,
            cardId: cardId
        };
        NetworkManager.Instance.sendMessage("WaiHuZi.Discard", msg, true);
    }

    /**
     * 点击操作按钮（吃/碰/偎/跑/提/胡）
     */
    public onActionClick(event: Event, customEventData: any | null) {
        let action: number = Number(customEventData);
        if (isNaN(action)) return;

        // 查找对应的操作选项，获取需要的牌
        let option: WHZActionOption = null;
        for (let i: number = 0; i < this.actionOptions.length; i++) {
            if (this.actionOptions[i].action === action) {
                option = this.actionOptions[i];
                break;
            }
        }
        if (!option) return;

        let msg = {
            venueId: GameManager.Instance.VenueId,
            action: action,
            cardIds: option.cardIds
        };
        NetworkManager.Instance.sendMessage("WaiHuZi.Action", msg, true);

        // 隐藏操作按钮
        this.hideActionButtons();
    }

    /**
     * 点击过牌按钮
     */
    public onPassClick() {
        let msg = {
            venueId: GameManager.Instance.VenueId,
            action: WaiHuZiAction.Pass,
            cardIds: []
        };
        NetworkManager.Instance.sendMessage("WaiHuZi.Action", msg, true);
        this.hideActionButtons();
        // 显示出牌按钮
        if (this.discardGroup) this.discardGroup.active = true;
    }

    /**
     * 重写准备按钮，发送歪胡子专用Ready消息
     */
    public onReadyClick() {
        if (this.seat === -1) return;
        NetworkManager.Instance.sendInnerMessage("WaiHuZi.Ready");
    }

    public showPlayerInfo(seat: number) {

    }

    public kickOutPlayer(seat: number) {

    }
}
