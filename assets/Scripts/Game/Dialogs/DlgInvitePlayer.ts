import { _decorator, BlockInputEvents, Color, Component, EditBox, Label, Node, UITransform } from 'cc';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';
import { createButton, createLabel, fillRoundRect, sanitizeAllEditBoxDefaultLabels, sanitizeEditBoxDefaultLabels } from '../../UI/UiKit';

const { ccclass } = _decorator;

const COLORS = {
    overlay: new Color(0, 0, 0, 150),
    panel: new Color(32, 58, 88, 250),
    title: new Color(255, 226, 122, 255),
    text: new Color(255, 255, 255, 255),
    input: new Color(246, 241, 220, 255),
    inputText: new Color(70, 54, 30, 255),
    placeholder: new Color(140, 124, 102, 255),
    confirm: new Color(236, 178, 62, 255),
    close: new Color(132, 72, 72, 255),
};

@ccclass('DlgInvitePlayer')
export class DlgInvitePlayer extends Component {
    private input: EditBox = null;
    private submitting = false;

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
        panel.addComponent(UITransform).setContentSize(560, 320);
        fillRoundRect(panel, 560, 320, COLORS.panel, 12);

        const title = createLabel(panel, '邀请玩家', 32, COLORS.title, 260, 52);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.node.setPosition(0, 106, 0);

        const label = createLabel(panel, '玩家ID', 26, COLORS.text, 120, 42);
        label.horizontalAlign = Label.HorizontalAlign.RIGHT;
        label.node.setPosition(-168, 36, 0);

        this.input = this.createEditBox(panel, '请输入玩家ID', 260, 48);
        this.input.node.setPosition(52, 36, 0);

        const confirm = createButton(panel, '确认', 124, 48, COLORS.confirm, this.node, 'DlgInvitePlayer', 'onConfirmClicked');
        confirm.setPosition(-76, -78, 0);
        const close = createButton(panel, '关闭', 124, 48, COLORS.close, this.node, 'DlgInvitePlayer', 'onCloseClicked');
        close.setPosition(76, -78, 0);
        this.scrubEditBoxLabels();
    }

    private createEditBox(parent: Node, placeholder: string, width: number, height: number): EditBox {
        const node = new Node('PlayerIdInput');
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
        editBox.maxLength = 8;
        sanitizeEditBoxDefaultLabels(editBox, [textLabel, placeholderLabel]);
        return editBox;
    }

    public onConfirmClicked(): void {
        if (this.submitting) return;
        const playerId = (this.input?.string || '').trim();
        if (!/^\d{6,8}$/.test(playerId)) {
            Client.Instance.showPromptTip('请输入6-8位数字玩家ID');
            return;
        }
        this.submitting = true;
        GameManager.Instance.authPost('/player/agency/bind-player', { playerId }).then((dto) => {
            if (dto?.code === '00000000') {
                Client.Instance.showPromptTip(dto.alreadyBound ? '玩家已在当前名下' : '邀请绑定成功');
                this.node.active = false;
            } else {
                Client.Instance.showPromptDialog('邀请失败：' + (dto?.msg || '未知错误'));
            }
            this.submitting = false;
        }, (err) => {
            const msg = err?.msg || err?.message || String(err);
            Client.Instance.showPromptDialog('邀请失败：' + msg);
            this.submitting = false;
        });
    }

    public onCloseClicked(): void {
        this.node.active = false;
    }

    private scrubEditBoxLabels(): void {
        sanitizeAllEditBoxDefaultLabels(this.node);
    }
}
