import { _decorator, Component, Label, Node } from 'cc';
import { DlgCSResultPlayer } from './DlgCSResultPlayer';
import { ChangShaMahjongRoom } from './ChangShaMahjongRoom';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';

const { ccclass, property } = _decorator;

@ccclass('DlgCSResult')
export class DlgCSResult extends Component {

    @property({ type: [DlgCSResultPlayer] })
    private players: DlgCSResultPlayer[] = [];

    // 倒计时秒数
    @property({ type: Label })
    private second: Label = null;

    @property({ type: Node })
    private btnNext: Node = null;

    @property({ type: Node })
    private titleWin: Node = null;

    @property({ type: Node })
    private titleLose: Node = null;

    // 番数信息
    @property({ type: Label })
    private fanText: Label = null;

    // 翻鸟倍数信息
    @property({ type: Label })
    private birdText: Label = null;

    private room: ChangShaMahjongRoom = null;

    // 倒计时
    private countDown = 0.0;

    start() {}

    update(deltaTime: number) {
        if (!this.second) return;
        if (this.countDown < 1.0) return;
        this.countDown = this.countDown - deltaTime;
        let text: string = null;
        if (this.countDown < 0.0) text = "0";
        else text = (Math.floor(this.countDown)).toString();
        this.second.string = text;
        if (this.countDown < 1.0) {
            this.onNextClick();
        }
    }

    public setRoom(room: ChangShaMahjongRoom): void {
        this.room = room;
    }

    public show(s: boolean): void {
        this.node.active = s;
    }

    public setPlayer(idx: number, playerData: any, isSelf: boolean): void {
        let player: DlgCSResultPlayer = this.players[idx];
        if (!player) return;
        if (player.headTexture) player.headTexture.spriteFrame = playerData.headTexture;
        if (player.nickname) player.nickname.string = playerData.nickname;
        if (player.textGold) {
            if (playerData.winGold !== undefined) {
                player.textGold.string = playerData.winGold.toString();
            } else if (playerData.gold !== undefined) {
                player.textGold.string = playerData.gold.toString();
            }
        }
        if (player.flagWin) player.flagWin.active = playerData.isWin;
        if (player.flagLose) player.flagLose.active = !playerData.isWin;
        if (player.fanInfo) {
            player.fanInfo.string = playerData.fanInfo || "";
        }
        if (isSelf) {
            if (this.titleWin) this.titleWin.active = playerData.isWin;
            if (this.titleLose) this.titleLose.active = !playerData.isWin;
        }
    }

    public setFanText(text: string): void {
        if (this.fanText) {
            this.fanText.string = text;
        }
    }

    public setBirdText(text: string): void {
        if (this.birdText) {
            this.birdText.string = text;
        }
    }

    public startCountDown(): void {
        this.countDown = 10.99;
    }

    public onNextClick(): void {
        this.show(false);
        if (this.room) this.room.showResult = false;
        // 请求同步长沙麻将游戏数据
        NetworkManager.Instance.sendInnerMessage("ChangSha.Sync");
        // 准备就绪（长沙麻将使用 ChangSha.Ready）
        NetworkManager.Instance.sendInnerMessage("ChangSha.Ready");
    }

    public onExitClick(): void {
        // 请求退出房间
        if (NetworkManager.Instance.isConnected()) {
            NetworkManager.Instance.sendInnerMessage("MsgLeaveVenue");
        }
        GameManager.Instance.leaveVenue();
        Client.Instance.backToGameHall();
    }
}
