import { _decorator, Color, Component, Label, Node, UITransform } from 'cc';
import { DlgResultPlayer } from './DlgResultPlayer';
import { GuanDanRoom } from './GuanDanRoom';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';
import { createButton } from '../../UI/UiKit';

const { ccclass, property } = _decorator;

@ccclass('DlgResult')
export class DlgResult extends Component {
    @property({ type: [DlgResultPlayer] })
    private players: DlgResultPlayer[] = [];

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
    private gradePointText: Label = null;

    private roomFeeText: Label = null;
    private shuffleButton: Node = null;
    private shuffleVisible = false;

    private room: GuanDanRoom = null;

    // 是否为房主
    private isOwner: boolean = false;

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

    public setRoom(room: GuanDanRoom) {
        this.room = room;
    }

    public show(s: boolean) {
        this.node.active = s;
        if (!s) this.setShuffleVisible(false);
    }

    public setOwner(flag: boolean) {
        this.isOwner = flag;
    }

    public setPlayer(idx: number, playerData: any, isSelf: boolean) {
        if (isSelf) {
            if (this.btnNextGroup) {
                this.btnNextGroup.active = !playerData.isKicked;
            }
            if (this.shuffleButton) {
                this.shuffleButton.active = this.shuffleVisible && !playerData.isKicked;
            }
        }
        let player: DlgResultPlayer = this.players[idx];
        if (!player) return;
        if (player.headTexture) player.headTexture.spriteFrame = playerData.headTexture;
        if (player.nickname) player.nickname.string = playerData.nickname;
        if (player.textGold) player.textGold.string = playerData.gold.toString();
        if (player.flagWin) player.flagWin.active = playerData.isWin;
        if (player.flagLose) player.flagLose.active = !playerData.isWin;
        if (player.flagFriend) player.flagFriend.active = playerData.isFriend;
        if (player.flagEnemy) player.flagEnemy.active = !playerData.isFriend;
        if (player.btnKickOut) {
            if (!(this.isOwner) || isSelf) {
                player.btnKickOut.active = false;
            }
            else {
                player.btnKickOut.active = !(playerData.isKicked);
            }
        }
        if (player.flagKickOut) player.flagKickOut.active = playerData.isKicked;
        if (isSelf) {
            if (this.titleWin) this.titleWin.active = playerData.isWin;
            if (this.titleLose) this.titleLose.active = !(playerData.isWin);
        }
    }

    public setPlayerKickOut(idx: number, isSelf: boolean) {
        if (isSelf) {
            if (this.btnNextGroup) this.btnNextGroup.active = false;
        }
        let player: DlgResultPlayer = this.players[idx];
        if (!player) return;
        if (player.btnKickOut) player.btnKickOut.active = false;
        if (player.flagKickOut) player.flagKickOut.active = true;
    }

    public setGradePoint(text: string) {
        if (this.gradePointText) {
            this.gradePointText.string = text;
        }
    }

    public setRoomFeeInfo(text: string) {
        this.ensureRoomFeeText();
        if (!this.roomFeeText) return;
        this.roomFeeText.string = text || '';
        this.roomFeeText.node.active = !!text;
    }

    public setShuffleVisible(flag: boolean) {
        this.shuffleVisible = flag;
        this.ensureShuffleButton();
        if (!this.shuffleButton) return;
        this.shuffleButton.active = flag && (!this.btnNextGroup || this.btnNextGroup.active);
    }

    private ensureRoomFeeText() {
        if (this.roomFeeText) return;
        const node = new Node('RoomFeeInfo');
        node.layer = this.node.layer;
        node.parent = this.node;
        node.setPosition(0, -238, 0);
        node.addComponent(UITransform).setContentSize(760, 56);
        const label = node.addComponent(Label);
        label.fontSize = 20;
        label.lineHeight = 24;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.color = new Color(255, 207, 128, 255);
        node.active = false;
        this.roomFeeText = label;
    }

    private ensureShuffleButton() {
        if (this.shuffleButton) return;
        const parent = this.btnNextGroup?.parent || this.node;
        const button = createButton(parent, '洗牌', 132, 48, new Color(135, 93, 40, 255), this.node, 'DlgResult', 'onShuffleClick');
        if (this.btnNextGroup && this.btnNextGroup.parent === parent) {
            const pos = this.btnNextGroup.position;
            button.setPosition(pos.x - 150, pos.y, pos.z);
        } else {
            button.setPosition(-150, -292, 0);
        }
        button.active = false;
        this.shuffleButton = button;
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
        // 请求同步掼蛋游戏数据
        NetworkManager.Instance.sendInnerMessage("MsgGuanDanSync");
        // 准备就绪
        NetworkManager.Instance.sendInnerMessage("MsgPlayerReady");
    }

    public onShuffleClick() {
        NetworkManager.Instance.sendInnerMessage("MsgShuffleCards");
    }
}
