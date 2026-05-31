import { _decorator, Component, Label, Node } from 'cc';
import { DlgWHZResultPlayer } from './DlgWHZResultPlayer';
import { WaiHuZiRoom } from './WaiHuZiRoom';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';

const { ccclass, property } = _decorator;

@ccclass('DlgWHZResult')
export class DlgWHZResult extends Component {
    @property({ type: [DlgWHZResultPlayer] })
    private players: DlgWHZResultPlayer[] = [];

    // 倒计时秒数
    @property({ type: Label })
    private second: Label = null;

    @property({ type: Node })
    private btnNextGroup: Node = null;

    @property({ type: Node })
    private titleWin: Node = null;

    @property({ type: Node })
    private titleLose: Node = null;

    @property({ type: Label })
    private scoreText: Label = null;

    @property({ type: Label })
    private huXiText: Label = null;

    private room: WaiHuZiRoom = null;

    // 倒计时
    private countDown = 0.0;

    start() { }

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

    public setRoom(room: WaiHuZiRoom) {
        this.room = room;
    }

    public show(s: boolean) {
        this.node.active = s;
    }

    public setPlayer(idx: number, playerData: any, isSelf: boolean) {
        if (isSelf) {
            if (this.btnNextGroup) {
                this.btnNextGroup.active = true;
            }
        }
        let player: DlgWHZResultPlayer = this.players[idx];
        if (!player) return;
        if (player.headTexture) player.headTexture.spriteFrame = playerData.headTexture;
        if (player.nickname) player.nickname.string = playerData.nickname;
        if (player.textGold) player.textGold.string = playerData.winGold.toString();
        if (player.textHuXi) player.textHuXi.string = playerData.huXi !== undefined ? ("胡息:" + playerData.huXi.toString()) : "";
        if (player.flagWin) player.flagWin.active = playerData.isWin;
        if (player.flagLose) player.flagLose.active = !playerData.isWin;
        if (isSelf) {
            if (this.titleWin) this.titleWin.active = playerData.isWin;
            if (this.titleLose) this.titleLose.active = !(playerData.isWin);
        }
    }

    public setScoreText(text: string) {
        if (this.scoreText) {
            this.scoreText.string = text;
        }
    }

    public setHuXiText(text: string) {
        if (this.huXiText) {
            this.huXiText.string = text;
        }
    }

    public startCountDown() {
        this.countDown = 10.99;
    }

    public onExitClick() {
        if (NetworkManager.Instance.isConnected()) {
            NetworkManager.Instance.sendInnerMessage("MsgLeaveVenue");
        }
        GameManager.Instance.leaveVenue();
        Client.Instance.backToGameHall();
    }

    public onNextClick() {
        this.show(false);
        if (this.room) this.room.showResult = false;
        NetworkManager.Instance.sendInnerMessage("WaiHuZi.Sync");
        NetworkManager.Instance.sendInnerMessage("WaiHuZi.Ready");
    }
}
