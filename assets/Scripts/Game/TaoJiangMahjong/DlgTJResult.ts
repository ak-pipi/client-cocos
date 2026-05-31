import { _decorator, Component, Label, Node } from 'cc';
import { DlgTJResultPlayer } from './DlgTJResultPlayer';
import { TaoJiangMahjongRoom } from './TaoJiangMahjongRoom';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';

const { ccclass, property } = _decorator;

@ccclass('DlgTJResult')
export class DlgTJResult extends Component {
    @property({ type: [DlgTJResultPlayer] })
    private players: DlgTJResultPlayer[] = [];

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

    private room: TaoJiangMahjongRoom = null;

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

    public setRoom(room: TaoJiangMahjongRoom) {
        this.room = room;
    }

    public show(s: boolean) {
        this.node.active = s;
    }

    public setPlayer(idx: number, playerData: any, isSelf: boolean) {
        let player: DlgTJResultPlayer = this.players[idx];
        if (!player) return;
        if (player.headTexture && playerData.headTexture) {
            player.headTexture.spriteFrame = playerData.headTexture;
        }
        if (player.nickname) player.nickname.string = playerData.nickname;
        if (player.textGold) {
            let goldStr: string = playerData.gold !== undefined ? playerData.gold.toString() : "0";
            if (playerData.winGold !== undefined) {
                if (playerData.winGold > 0) {
                    goldStr = goldStr + " (+" + playerData.winGold.toString() + ")";
                } else if (playerData.winGold < 0) {
                    goldStr = goldStr + " (" + playerData.winGold.toString() + ")";
                }
            }
            player.textGold.string = goldStr;
        }
        if (player.flagWin) player.flagWin.active = playerData.isWin;
        if (player.flagLose) player.flagLose.active = !playerData.isWin;
        if (player.fanInfo && playerData.fanText) {
            player.fanInfo.string = playerData.fanText;
        }
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
        if (this.room) {
            this.room.onResultNextClick();
        }
    }

    public onExitClick() {
        if (NetworkManager.Instance.isConnected()) {
            NetworkManager.Instance.sendInnerMessage("MsgLeaveVenue");
        }
        GameManager.Instance.leaveVenue();
        Client.Instance.backToGameHall();
    }
}
