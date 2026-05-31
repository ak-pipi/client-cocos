import { _decorator, Component, Label, Node } from 'cc';
import { DlgYJQFResultPlayer } from './DlgYJQFResultPlayer';
import { YuanJiangQianFenRoom } from './YuanJiangQianFenRoom';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';

const { ccclass, property } = _decorator;

@ccclass('DlgYJQFFinalResult')
export class DlgYJQFFinalResult extends Component {
    @property({ type: [DlgYJQFResultPlayer] })
    private players: DlgYJQFResultPlayer[] = [];

    // 倒计时秒数
    @property({ type: Label })
    private second: Label = null;

    @property({ type: Node })
    private btnExit: Node = null;

    @property({ type: Node })
    private titleWin: Node = null;

    @property({ type: Node })
    private titleLose: Node = null;

    @property({ type: Label })
    private totalScoreText: Label = null;

    private room: YuanJiangQianFenRoom = null;

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
            this.onExitClick();
        }
    }

    public setRoom(room: YuanJiangQianFenRoom) {
        this.room = room;
    }

    public show(s: boolean) {
        this.node.active = s;
    }

    public setPlayer(idx: number, playerData: any, isSelf: boolean) {
        let player: DlgYJQFResultPlayer = this.players[idx];
        if (!player) return;
        if (player.headTexture) player.headTexture.spriteFrame = playerData.headTexture;
        if (player.nickname) player.nickname.string = playerData.nickname;
        if (player.textGold) player.textGold.string = playerData.totalGold.toString();
        if (player.flagWin) player.flagWin.active = playerData.isWin;
        if (player.flagLose) player.flagLose.active = !playerData.isWin;
        if (player.flagFriend) player.flagFriend.active = playerData.isFriend;
        if (player.flagEnemy) player.flagEnemy.active = !playerData.isFriend;
        if (isSelf) {
            if (this.titleWin) this.titleWin.active = playerData.isWin;
            if (this.titleLose) this.titleLose.active = !(playerData.isWin);
        }
    }

    public setTotalScoreText(text: string) {
        if (this.totalScoreText) {
            this.totalScoreText.string = text;
        }
    }

    public startCountDown() {
        this.countDown = 10.99;
    }

    public onExitClick() {
        this.show(false);
        if (this.room) this.room.showResult = false;
        // 请求退出房间
        if (NetworkManager.Instance.isConnected()) {
            NetworkManager.Instance.sendInnerMessage("MsgLeaveVenue");
        }
        GameManager.Instance.leaveVenue();
        Client.Instance.backToGameHall();
    }
}
