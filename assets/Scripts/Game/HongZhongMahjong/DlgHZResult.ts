import { _decorator, Component, Label, Node } from 'cc';
import { DlgHZResultPlayer } from './DlgHZResultPlayer';
import { HongZhongMahjongRoom } from './HongZhongMahjongRoom';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';

const { ccclass, property } = _decorator;

@ccclass('DlgHZResult')
export class DlgHZResult extends Component {
    @property({ type: [DlgHZResultPlayer] })
    private players: DlgHZResultPlayer[] = [];

    // 倒计时秒数
    @property({ type: Label })
    private second: Label = null;

    @property({ type: Node })
    private btnNext: Node = null;

    @property({ type: Node })
    private titleWin: Node = null;

    @property({ type: Node })
    private titleLose: Node = null;

    @property({ type: Label })
    private fanText: Label = null;

    private room: HongZhongMahjongRoom = null;

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

    public setRoom(room: HongZhongMahjongRoom) {
        this.room = room;
    }

    public show(s: boolean) {
        this.node.active = s;
    }

    public setPlayer(idx: number, playerData: any, isSelf: boolean) {
        if (isSelf) {
            if (this.btnNext) {
                this.btnNext.active = true;
            }
        }
        let player: DlgHZResultPlayer = this.players[idx];
        if (!player) return;
        if (player.headTexture) player.headTexture.spriteFrame = playerData.headTexture;
        if (player.nickname) player.nickname.string = playerData.nickname;
        if (player.textGold) player.textGold.string = playerData.gold.toString();
        if (player.flagWin) player.flagWin.active = playerData.isWin;
        if (player.flagLose) player.flagLose.active = !playerData.isWin;
        if (player.fanInfo) player.fanInfo.string = playerData.fanInfo || "";
        if (isSelf) {
            if (this.titleWin) this.titleWin.active = playerData.isWin;
            if (this.titleLose) this.titleLose.active = !(playerData.isWin);
        }
    }

    public setFanText(text: string) {
        if (this.fanText) {
            this.fanText.string = text;
        }
    }

    public startCountDown() {
        this.countDown = 10.99;
    }

    public onNextClick() {
        this.show(false);
        if (this.room) this.room.showResult = false;
        // 发送准备消息
        NetworkManager.Instance.sendInnerMessage("MsgPlayerReady");
    }

    public onExitClick() {
        // 请求退出房间
        if (NetworkManager.Instance.isConnected()) {
            NetworkManager.Instance.sendInnerMessage("MsgLeaveVenue");
        }
        GameManager.Instance.leaveVenue();
        Client.Instance.backToGameHall();
    }
}
