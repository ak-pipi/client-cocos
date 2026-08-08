import { _decorator, BlockInputEvents, Color, Component, EditBox, Label, Node, UITransform } from 'cc';
import { Client } from '../Client';
import { GameManager } from '../../Manager/GameManager';
import { createButton, createLabel, fillRoundRect, sanitizeAllEditBoxDefaultLabels, sanitizeEditBoxDefaultLabels } from '../../UI/UiKit';

const { ccclass } = _decorator;

const COLORS = {
    overlay: new Color(0, 0, 0, 230),
    panel: new Color(34, 62, 82, 250),
    title: new Color(255, 226, 122, 255),
    input: new Color(246, 241, 220, 255),
    inputText: new Color(70, 54, 30, 255),
    placeholder: new Color(140, 124, 102, 255),
    confirm: new Color(236, 178, 62, 255),
    close: new Color(132, 72, 72, 255),
};

@ccclass('DlgFamilyInvite')
export class DlgFamilyInvite extends Component {
    private input: EditBox = null;

    onLoad(): void {
        this.build();
    }

    onEnable(): void {
        this.scrubEditBoxLabels();
    }

    private build(): void {
        this.node.addComponent(UITransform).setContentSize(1920, 1080);

        const mask = new Node('Mask');
        mask.parent = this.node;
        mask.addComponent(UITransform).setContentSize(1920, 1080);
        mask.addComponent(BlockInputEvents);
        fillRoundRect(mask, 1920, 1080, COLORS.overlay, 0);

        const panel = new Node('Panel');
        panel.parent = this.node;
        panel.addComponent(UITransform).setContentSize(560, 300);
        fillRoundRect(panel, 560, 300, COLORS.panel, 12);

        const title = createLabel(panel, '亲友圈', 32, COLORS.title, 260, 52);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.node.setPosition(0, 96, 0);

        createButton(panel, 'X', 44, 44, COLORS.close, this.node, 'DlgFamilyInvite', 'onCloseClicked')
            .setPosition(242, 114, 0);

        this.input = this.createEditBox(panel, '请输入邀请码', 320, 48);
        this.input.node.setPosition(0, 28, 0);

        const confirm = createButton(panel, '确认', 124, 48, COLORS.confirm, this.node, 'DlgFamilyInvite', 'onConfirmClicked');
        confirm.setPosition(-76, -78, 0);
        const close = createButton(panel, '退出', 124, 48, COLORS.close, this.node, 'DlgFamilyInvite', 'onCloseClicked');
        close.setPosition(76, -78, 0);
        this.scrubEditBoxLabels();
    }

    private createEditBox(parent: Node, placeholder: string, width: number, height: number): EditBox {
        const node = new Node('InviteCodeInput');
        node.parent = parent;
        node.addComponent(UITransform).setContentSize(width, height);
        fillRoundRect(node, width, height, COLORS.input, 8);

        const textLabel = createLabel(node, '', 24, COLORS.inputText, width - 28, height - 4);
        textLabel.node.setPosition(0, 0, 0);
        const placeholderLabel = createLabel(node, placeholder, 22, COLORS.placeholder, width - 28, height - 4);
        placeholderLabel.node.setPosition(0, 0, 0);

        const editBox = node.addComponent(EditBox);
        editBox.textLabel = textLabel;
        editBox.placeholderLabel = placeholderLabel;
        editBox.placeholder = placeholder;
        editBox.string = '';
        editBox.maxLength = 16;
        sanitizeEditBoxDefaultLabels(editBox, [textLabel, placeholderLabel]);
        return editBox;
    }

    public onConfirmClicked(): void {
        const inviteCode = this.input ? this.input.string.trim() : '';
        if (!inviteCode) {
            Client.Instance.showPromptTip('请输入邀请码');
            return;
        }
        GameManager.Instance.authPost('/player/agency/bind-code', { inviteCode }).then((dto) => {
            if (dto && dto.code !== '00000000') {
                Client.Instance.showPromptDialog('绑定失败：' + (dto.msg || '邀请码不可用'));
                return;
            }
            this.input.string = '';
            GameManager.Instance.requestHeartbeatAndAutoReenter();
            Client.Instance.showPromptTip('绑定成功');
            this.node.active = false;
        }).catch((err) => {
            const msg = err && (err.msg || err.message) ? (err.msg || err.message) : String(err);
            Client.Instance.showPromptDialog('绑定失败：' + msg);
        });
    }

    public onCloseClicked(): void {
        this.node.active = false;
    }

    private scrubEditBoxLabels(): void {
        sanitizeAllEditBoxDefaultLabels(this.node);
    }
}
