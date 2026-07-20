import { _decorator, Component, EditBox, Label, Node, Slider, Toggle } from 'cc';
import { DlgBase } from './DlgBase';
import { GameManager } from '../../Manager/GameManager';
import { SliderFill } from '../SliderFill';
import { Client } from '../Client';
import { AesUtils } from '../../Utils/AesUtils';
const { ccclass, property } = _decorator;

@ccclass('DlgBank')
export class DlgBank extends DlgBase {
    @property({ type: Node })
    private debitNode: Node = null;

    @property({ type: Node })
    private depositNode: Node = null;

    @property({ type: Node })
    private passwordNode: Node = null;

    @property({ type: Label })
    private labelGold1: Label = null;

    @property({ type: Label })
    private labelDeposit1: Label = null;

    @property({ type: EditBox })
    private editAmount1: EditBox = null;

    @property({ type: EditBox })
    private editPassword: EditBox = null;

    @property({ type: Slider })
    private slider1: Slider = null;

    @property({ type: Label })
    private labelGold2: Label = null;

    @property({ type: Label })
    private labelDeposit2: Label = null;

    @property({ type: EditBox })
    private editAmount2: EditBox = null;

    @property({ type: Slider })
    private slider2: Slider = null;

    @property({ type: EditBox })
    private editPasswordOld: EditBox = null;

    @property({ type: EditBox })
    private editPasswordNew: EditBox = null;

    @property({ type: EditBox })
    private editPasswordVerify: EditBox = null;

    start() {
        super.start();
    }

    update(deltaTime: number) {}

    protected onActiveChanged(): void {
        if (!this.node.active) return;
        this.refresh();
    }

    private refresh() {
        this.refreshLabels();
        GameManager.Instance.refreshCapital().then(() => {
            if (this.node && this.node.active) {
                this.refreshLabels();
            }
        });
    }

    private refreshLabels() {
        this.labelGold1.string = GameManager.Instance.Gold.toString();
        this.labelGold2.string = GameManager.Instance.Gold.toString();
        this.labelDeposit1.string = GameManager.Instance.Deposit.toString();
        this.labelDeposit2.string = GameManager.Instance.Deposit.toString();
    }

    private isSuccess(dto: any): boolean {
        return dto?.code === "00000000" || dto?.code === 200 || dto?.code === "200";
    }

    private async syncCapitalAfterAction(dto: any): Promise<void> {
        if (dto?.gold !== undefined || dto?.deposit !== undefined || dto?.diamond !== undefined) {
            if (dto.gold !== undefined) GameManager.Instance.Gold = Number(dto.gold) || 0;
            if (dto.deposit !== undefined) GameManager.Instance.Deposit = Number(dto.deposit) || 0;
            if (dto.diamond !== undefined) GameManager.Instance.Diamond = Number(dto.diamond) || 0;
            GameManager.Instance.updatePlayerInfoTime();
        } else {
            await GameManager.Instance.refreshCapital();
        }
        this.refreshLabels();
    }

    public onDebitToggle(toggle: Toggle) {
        if (!toggle.isChecked) return;
        this.debitNode.active = true;
        this.depositNode.active = false;
    }

    public onDepositToggle(toggle: Toggle) {
        if (!toggle.isChecked) return;
        this.debitNode.active = false;
        this.depositNode.active = true;
    }

    public onEditDidEnded1(editBox: EditBox, customEventData: any | null) {
        let num: number = parseInt(editBox.string);
        if (isNaN(num)) return;
        if (num < 0) num = 0;
        if (num > GameManager.Instance.Deposit) num = GameManager.Instance.Deposit;
        let ratio = 0.0;
        if (GameManager.Instance.Deposit > 0) {
            ratio = num / GameManager.Instance.Deposit;
        }
        this.slider1.progress = ratio;
        let fill: SliderFill = this.slider1.node.getComponent(SliderFill);
        if (fill) {
            fill.onSliderEvent(this.slider1, null);
        }
    }

    public onEditDidEnded2(editBox: EditBox, customEventData: any | null) {
        let num: number = parseInt(editBox.string);
        if (isNaN(num)) return;
        if (num < 0) num = 0;
        if (num > GameManager.Instance.Gold) num = GameManager.Instance.Gold;
        let ratio = 0.0;
        if (GameManager.Instance.Gold > 0) {
            ratio = num / GameManager.Instance.Gold;
        }
        this.slider2.progress = ratio;
        let fill: SliderFill = this.slider2.node.getComponent(SliderFill);
        if (fill) {
            fill.onSliderEvent(this.slider2, null);
        }
    }

    public onSliderChanged1(slider: Slider, customEventData: any | null) {
        let num: number = Math.floor(slider.progress * GameManager.Instance.Deposit);
        this.editAmount1.string = num.toString();
    }

    public onSliderChanged2(slider: Slider, customEventData: any | null) {
        let num: number = Math.floor(slider.progress * GameManager.Instance.Gold);
        this.editAmount2.string = num.toString();
    }

    public onDebitClicked() {
        let num: number = parseInt(this.editAmount1.string);
        if (isNaN(num) || (num < 1)) {
            Client.Instance.showPromptTip("请输入合法数字");
            return;
        }
        if (num > GameManager.Instance.Deposit) {
            Client.Instance.showPromptTip("取出数量不能大于保险柜积分");
            return;
        }
        let password: string = null;
        if (this.editPassword.string) {
            password = AesUtils.encrypt1(this.editPassword.string);
        }
        let data = {
            amount: num,
            password: password
        };
        GameManager.Instance.authPost("/player/capital/debit", data).then(async (dto) => {
            if (!this.isSuccess(dto)) {
                Client.Instance.showPromptTip("从保险柜取出失败: " + (dto?.msg || "未知错误"), 3.0);
                console.log(dto?.msg);
                return;
            }
            await this.syncCapitalAfterAction(dto);
            Client.Instance.showPromptTip("取出积分成功", 2.0);
        }).catch((err) => {
            console.log("Debit failed: ", err);
        });
    }

    public onDepositClicked() {
        let num: number = parseInt(this.editAmount2.string);
        if (isNaN(num) || (num < 1)) {
            Client.Instance.showPromptTip("请输入合法数字");
            return;
        }
        if (num > GameManager.Instance.Gold) {
            Client.Instance.showPromptTip("存入数量大于当前携带积分", 2.0);
            return;
        }
        let data = {
            amount: num
        };
        GameManager.Instance.authPost("/player/capital/deposit", data).then(async (dto) => {
            if (!this.isSuccess(dto)) {
                Client.Instance.showPromptTip("存入保险柜失败: " + (dto?.msg || "未知错误"), 3.0);
                console.log(dto?.msg);
                return;
            }
            await this.syncCapitalAfterAction(dto);
            Client.Instance.showPromptTip("存入保险柜成功", 2.0);
        }).catch((err) => {
            console.log("Deposit failed: ", err);
        });
    }

    public onPasswordClicked() {
        this.passwordNode.active = true;
    }

    public onPwdOkClicked() {
        if (this.editPasswordNew.string !== this.editPasswordVerify.string) {
            Client.Instance.showPromptTip("两次输入的密码不相同", 2.0);
            return;
        }
        if (!this.editPasswordNew.string) {
            Client.Instance.showPromptTip("请输入新密码", 2.0);
            return;
        }
        let oldPwd: string = null;
        if (this.editPasswordOld.string) {
            oldPwd = AesUtils.encrypt1(this.editPasswordOld.string);
        }
        let data = {
            oldPassword: oldPwd,
            newPassword: AesUtils.encrypt1(this.editPasswordNew.string),
        };
        GameManager.Instance.authPost("/player/capital/bank/password", data).then((dto) => {
            if (!this.isSuccess(dto)) {
                Client.Instance.showPromptTip("修改保险柜密码失败: " + (dto?.msg || "未知错误"), 3.0);
                console.log(dto?.msg);
                return;
            }
            Client.Instance.showPromptTip("修改保险柜密码成功", 2.0);
        }).catch((err) => {
            console.log("Set bank password error: ", err);
        });
    }

    public onPwdCancelClicked() {
        this.passwordNode.active = false;
    }
}
