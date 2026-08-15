import { Button, Color, EditBox, Graphics, Label, Node, UITransform, Widget } from 'cc';
import { Client } from './Client';
import { GameManager } from '../Manager/GameManager';
import { blockInputOnNode, makeModalLayer, sanitizeAllEditBoxDefaultLabels, sanitizeEditBoxDefaultLabels } from '../UI/UiKit';
import { GameId, resolveMinCarryScore } from '../App/GameEnums';

export class CarryScorePrompt {
    private static activePopup: Node | null = null;
    private static readonly DECIMAL_DIGITS = 1;

    public static getMinCarryScore(baseScore: any, gameId?: GameId | string | null, roundCount?: any): number {
        return resolveMinCarryScore(gameId, baseScore, roundCount);
    }

    public static requestByBaseScore(parent: Node, baseScore: any): Promise<number | null> {
        return this.request(parent, this.getMinCarryScore(baseScore));
    }

    public static requestByRule(
        parent: Node,
        gameId: GameId | string | null | undefined,
        baseScore: any,
        roundCount?: any,
        explicitMinCarry?: any,
    ): Promise<number | null> {
        const explicit = this.normalizeScore(explicitMinCarry);
        return this.request(parent, explicit > 0 ? explicit : this.getMinCarryScore(baseScore, gameId, roundCount));
    }

    public static async request(parent: Node, minCarry: number): Promise<number | null> {
        try {
            await GameManager.Instance.refreshCapital();
        } catch (err) {
            console.warn('[CarryScorePrompt] Refresh capital failed:', err);
        }

        const available = this.normalizeScore(GameManager.Instance.Gold);
        const min = this.normalizeScore(minCarry);
        if (available < min) {
            const safeBox = this.normalizeScore(GameManager.Instance.Deposit);
            Client.Instance.showPromptDialog(
                `携带积分不足，加入本局至少需要${this.formatScore(min)}积分。\n当前可用${this.formatScore(available)}积分，保险柜${this.formatScore(safeBox)}积分不参与游戏结算，请先从保险柜取出积分。`
            );
            return null;
        }

        this.destroyActivePopup();

        return new Promise<number | null>((resolve) => {
            const popup = new Node('CarryScorePopup');
            popup.parent = parent;
            makeModalLayer(popup);
            this.activePopup = popup;

            const mask = new Node('Mask');
            mask.parent = popup;
            blockInputOnNode(mask, 1920, 1080);
            const maskGraphics = mask.addComponent(Graphics);
            maskGraphics.fillColor = new Color(0, 0, 0, 170);
            maskGraphics.roundRect(-960, -540, 1920, 1080, 0);
            maskGraphics.fill();

            const panel = new Node('Panel');
            panel.parent = popup;
            panel.addComponent(UITransform).setContentSize(520, 320);
            blockInputOnNode(panel);
            const panelGraphics = panel.addComponent(Graphics);
            panelGraphics.fillColor = new Color(30, 70, 110, 255);
            panelGraphics.roundRect(-260, -160, 520, 320, 12);
            panelGraphics.fill();

            this.createLabel(panel, '携带积分', 28, 0, 112, 460, 38, new Color(255, 255, 255, 255));
            this.createLabel(
                panel,
                min > 0 ? `最低 ${this.formatScore(min)}，当前可用 ${this.formatScore(available)}` : `当前可用 ${this.formatScore(available)}`,
                21,
                0,
                62,
                460,
                54,
                new Color(235, 214, 156, 255),
            );

            const editBox = this.createInput(panel, min > 0 ? min : Math.max(1, Math.min(available, 100)));

            const finish = (value: number | null) => {
                if (this.activePopup === popup)
                    this.activePopup = null;
                popup.destroy();
                resolve(value);
            };

            const confirm = () => {
                const value = this.parseScoreInput(editBox.string);
                if (!isFinite(value) || value <= 0) {
                    Client.Instance.showPromptTip('请输入携带积分');
                    return;
                }
                if (value < min) {
                    Client.Instance.showPromptTip(`至少携带${this.formatScore(min)}积分`);
                    return;
                }
                if (value > available) {
                    Client.Instance.showPromptTip('携带积分不能超过当前可用积分');
                    return;
                }
                finish(this.normalizeScore(value));
            };

            this.createButton(panel, '确认', -92, -92, new Color(46, 139, 87, 255), confirm);
            this.createButton(panel, '取消', 92, -92, new Color(160, 82, 45, 255), () => finish(null));
        });
    }

    private static destroyActivePopup(): void {
        if (this.activePopup && this.activePopup.isValid)
            this.activePopup.destroy();
        this.activePopup = null;
    }

    private static createLabel(parent: Node, text: string, fontSize: number, x: number, y: number, width: number, height: number, color: Color): Label {
        const node = new Node('Label');
        node.parent = parent;
        node.addComponent(UITransform).setContentSize(width, height);
        node.setPosition(x, y, 0);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 6;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.color = color;
        return label;
    }

    private static createInput(parent: Node, defaultValue: number): EditBox {
        const inputNode = new Node('CarryInput');
        inputNode.parent = parent;
        inputNode.addComponent(UITransform).setContentSize(360, 54);
        inputNode.setPosition(0, 4, 0);

        const inputBg = new Node('InputBg');
        inputBg.parent = inputNode;
        inputBg.addComponent(UITransform).setContentSize(360, 54);
        const inputGraphics = inputBg.addComponent(Graphics);
        inputGraphics.fillColor = new Color(255, 255, 255, 255);
        inputGraphics.roundRect(-180, -27, 360, 54, 8);
        inputGraphics.fill();

        const textLabel = this.createEditLabel(inputNode, 'Text', '', new Color(20, 20, 20, 255), 26);
        const placeholderLabel = this.createEditLabel(inputNode, 'Placeholder', '输入本房间携带积分', new Color(120, 120, 120, 255), 22);

        const editBox = inputNode.addComponent(EditBox);
        editBox.maxLength = 12;
        editBox.inputMode = (EditBox.InputMode as any).DECIMAL ?? EditBox.InputMode.ANY;
        editBox.textLabel = textLabel;
        editBox.placeholderLabel = placeholderLabel;
        editBox.placeholder = placeholderLabel.string;
        editBox.string = this.formatScore(defaultValue);
        sanitizeEditBoxDefaultLabels(editBox, [textLabel, placeholderLabel]);
        sanitizeAllEditBoxDefaultLabels(parent);
        return editBox;
    }

    private static normalizeScore(value: any): number {
        const numberValue = Number(value);
        if (!isFinite(numberValue) || numberValue <= 0) return 0;
        const scale = Math.pow(10, this.DECIMAL_DIGITS);
        return Math.round(numberValue * scale) / scale;
    }

    private static parseScoreInput(text: string): number {
        const normalizedText = String(text || '').trim();
        if (!/^\d+(\.\d{1})?$/.test(normalizedText)) return NaN;
        return this.normalizeScore(Number(normalizedText));
    }

    private static formatScore(value: any): string {
        const score = this.normalizeScore(value);
        return Number.isInteger(score) ? String(score) : score.toFixed(this.DECIMAL_DIGITS);
    }

    private static createEditLabel(parent: Node, name: string, text: string, color: Color, fontSize: number): Label {
        const node = new Node(name);
        node.parent = parent;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(330, 54);
        transform.anchorX = 0;
        transform.anchorY = 0.5;
        const widget = node.addComponent(Widget);
        widget.isAlignLeft = true;
        widget.left = 15;
        widget.isAlignVerticalCenter = true;
        widget.verticalCenter = -2;
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 6;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.CLAMP;
        label.color = color;
        return label;
    }

    private static createButton(parent: Node, text: string, x: number, y: number, color: Color, onClick: () => void): void {
        const btnNode = new Node(text);
        btnNode.parent = parent;
        btnNode.addComponent(UITransform).setContentSize(130, 46);
        btnNode.setPosition(x, y, 0);
        const graphics = btnNode.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.roundRect(-65, -23, 130, 46, 8);
        graphics.fill();
        this.createLabel(btnNode, text, 22, 0, 0, 118, 40, new Color(255, 255, 255, 255));
        btnNode.addComponent(Button);
        btnNode.on(Node.EventType.TOUCH_END, onClick);
    }
}
