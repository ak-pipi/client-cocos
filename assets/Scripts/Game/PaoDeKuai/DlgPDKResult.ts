import { _decorator, Component, Label, Node } from 'cc';
import { DlgPDKResultPlayer } from './DlgPDKResultPlayer';
import { PaoDeKuaiRoom } from './PaoDeKuaiRoom';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';

const { ccclass, property } = _decorator;

@ccclass('DlgPDKResult')
export class DlgPDKResult extends Component {
    @property({ type: [DlgPDKResultPlayer] })
    private players: DlgPDKResultPlayer[] = [];

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

    private room: PaoDeKuaiRoom = null;

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

    public setRoom(room: PaoDeKuaiRoom) {
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
        let player: DlgPDKResultPlayer = this.players[idx];
        if (!player) return;
        if (player.headTexture) player.headTexture.spriteFrame = playerData.headTexture;
        if (player.nickname) player.nickname.string = playerData.nickname;
        if (player.textGold) player.textGold.string = playerData.winGold.toString();
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

    public startCountDown() {
        this.countDown = 10.99;
    }

    public onExitClick() {
        // 请求退出房间
        if (NetworkManager.Instance.isConnected()) {
            NetworkManager.Instance.sendInnerMessage("MsgLeaveVenue");
        }
        GameManager.Instance.leaveVenue();
        Client.Instance.backToGameHall();
    }

    public onNextClick() {
        this.show(false);
        if (this.room) this.room.showResult = false;
        // 请求同步跑得快游戏数据
        NetworkManager.Instance.sendInnerMessage("PaoDeKuai.Sync");
        // 准备就绪
        NetworkManager.Instance.sendInnerMessage("PaoDeKuai.Ready");
    }
}
