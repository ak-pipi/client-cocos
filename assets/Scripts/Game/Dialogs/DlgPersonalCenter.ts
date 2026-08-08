import { _decorator, Component, EditBox, Label, Node, Sprite, SpriteFrame, sys } from 'cc';
import { Client } from '../Client';
import { GameManager } from '../../Manager/GameManager';
import { DlgBase } from './DlgBase';
import { sanitizeEditBoxDefaultLabels } from '../../UI/UiKit';
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

    private bindButton: Node = null;

    private playerInfoTime: number = 0;

    start() {
        super.start();
        if (this.labelDiamond) {
            this.labelDiamond.node.active = false;
        }
        this.ensureInviteInput();
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
        if (!GameManager.Instance.Avatar) return;
        GameManager.Instance.loadSpriteFrame(GameManager.Instance.Avatar, (spriteFrame: SpriteFrame) => {
            this.spriteHead.spriteFrame = spriteFrame;
        });
        GameManager.Instance.authGet("/player/personal/data").then((dto) => {
            this.labelLoginDate.string = dto.loginDate;
            this.labelLoginIp.string = dto.loginIp;
            const hasAgency = !!dto.agencyId;
            if (hasAgency) {
                this.labelAgencyId.string = dto.agencyId;
            }
            else {
                this.labelAgencyId.string = "";
            }
            this.setInviteInputEnabled(!hasAgency);
            if (dto.agencyName) {
                this.labelAgencyName.string = dto.agencyName;
            }
            else {
                this.labelAgencyName.string = null;
            }
        });
    }

    public onBindClicked(): void {
        this.ensureInviteInput();
        const inviteCode = this.editInviteCode ? this.editInviteCode.string.trim() : "";
        if (!inviteCode) {
            Client.Instance.showPromptTip("请输入邀请码");
            return;
        }
        GameManager.Instance.authPost("/player/agency/bind-code", { inviteCode }).then((dto) => {
            if (dto && dto.code !== "00000000") {
                Client.Instance.showPromptDialog("绑定失败：" + (dto.msg || "邀请码不可用"));
                return;
            }
            Client.Instance.showPromptTip("绑定成功");
            GameManager.Instance.requestHeartbeatAndAutoReenter();
            this.updatePlayerInfo();
        }).catch((err) => {
            const msg = err && (err.msg || err.message) ? (err.msg || err.message) : String(err);
            Client.Instance.showPromptDialog("绑定失败：" + msg);
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

    private ensureInviteInput(): void {
        if (this.editInviteCode || !this.labelAgencyId) {
            return;
        }
        const inputNode = this.labelAgencyId.node;
        this.editInviteCode = inputNode.getComponent(EditBox) || inputNode.addComponent(EditBox);
        this.editInviteCode.textLabel = this.labelAgencyId;
        this.editInviteCode.maxLength = 32;
        sanitizeEditBoxDefaultLabels(this.editInviteCode, [this.labelAgencyId]);
        this.bindButton = inputNode.parent?.getChildByName("BtnBind") || null;
    }

    private setInviteInputEnabled(enabled: boolean): void {
        this.ensureInviteInput();
        if (!this.editInviteCode || !this.labelAgencyId) {
            return;
        }
        const titleNode = this.labelAgencyId.node.parent?.getChildByName("LabelAgencyId");
        const title = titleNode ? titleNode.getComponent(Label) : null;
        if (title) {
            title.string = enabled ? "邀请码：" : "代理ID：";
        }
        this.editInviteCode.enabled = enabled;
        if (this.bindButton) {
            this.bindButton.active = enabled;
        }
    }
}
