import { _decorator, Component, EditBox, Label, Node, Sprite, SpriteFrame, sys } from 'cc';
import { Client } from '../Client';
import { GameManager } from '../../Manager/GameManager';
import { DlgBase } from './DlgBase';
const { ccclass, property } = _decorator;

@ccclass('DlgPersonalCenter')
export class DlgPersonalCenter extends DlgBase {
    @property({ type: Sprite })
    private spriteHead: Sprite = null;

    @property({ type: Label })
    private labelNickname: Label = null;

    @property({ type: Label })
    private labelPlayerId: Label = null;

    @property({ type: Label })
    private labelAgencyId: Label = null;

    @property({ type: Label })
    private labelAgencyName: Label = null;

    @property({ type: Label })
    private labelLoginDate: Label = null;

    @property({ type: Label })
    private labelLoginIp: Label = null;

    @property({ type: Label })
    private labelGold: Label = null;

    @property({ type: Label })
    private labelDiamond: Label = null;

    @property({ type: EditBox })
    private editInviteCode: EditBox = null;

    private playerInfoTime: number = 0;

    start() {
        super.start();
    }

    update(deltaTime: number) {
        if (GameManager.Instance.PlayerInfoTime > this.playerInfoTime) {
            this.updatePlayerInfo();
        }
    }

    private updatePlayerInfo() {
        this.playerInfoTime = sys.now();
        this.labelNickname.string = GameManager.Instance.NickName;
        this.labelPlayerId.string = GameManager.Instance.PlayerId;
        this.labelGold.string = GameManager.Instance.Gold.toString();
        this.labelDiamond.string = GameManager.Instance.Diamond.toString();
        if (!GameManager.Instance.Avatar) return;
        GameManager.Instance.loadSpriteFrame(GameManager.Instance.Avatar, (spriteFrame: SpriteFrame) => {
            this.spriteHead.spriteFrame = spriteFrame;
        });
        GameManager.Instance.authGet("/player/personal/data").then((dto) => {
            this.labelLoginDate.string = dto.loginDate;
            this.labelLoginIp.string = dto.loginIp;
            if (dto.agencyId) {
                this.labelAgencyId.string = dto.agencyId;
            }
            else {
                this.labelAgencyId.string = null;
            }
            if (dto.agencyName) {
                this.labelAgencyName.string = dto.agencyName;
            }
            else {
                this.labelAgencyName.string = null;
            }
        });
    }

    public onBindClicked(): void {
        if (!this.editInviteCode) {
            Client.Instance.showPromptTip("请先配置邀请码输入框", 2.0);
            return;
        }
        let inviteCode = this.editInviteCode.string.trim();
        if (!inviteCode) {
            Client.Instance.showPromptTip("请输入邀请码", 2.0);
            return;
        }
        GameManager.Instance.authPost("/player/agency/bind-code", { inviteCode: inviteCode }).then((dto) => {
            if (dto && dto.code === "00000000") {
                Client.Instance.showPromptTip("绑定成功", 2.0);
                this.editInviteCode.string = "";
                this.updatePlayerInfo();
            }
            else {
                Client.Instance.showPromptTip("绑定失败: " + (dto?.msg || "未知错误"), 3.0);
            }
        }).catch((err) => {
            Client.Instance.showPromptTip("绑定失败: " + err.toString(), 3.0);
        });
    }

    public onLogoutClicked(): void {
        GameManager.Instance.logout();
        Client.Instance.logout();
    }

    public onCopyMyIdClicked() {
        Client.Instance.showPromptTip("未支持", 2.0);
    }

    public onCopyAgencyIdClicked() {
        Client.Instance.showPromptTip("未支持", 2.0);
    }
}
