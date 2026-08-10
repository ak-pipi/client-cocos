/**
 * 轻量 UI 构建工具（纯代码生成面板，无需预制体）
 */
import {
    _decorator, Component, Node, Label, Color, Graphics, UITransform, Button, EventHandler,
    ScrollView, Mask, BlockInputEvents, EditBox,
} from 'cc';

const { ccclass } = _decorator;

export const UI_COLORS = {
    overlay: new Color(0, 0, 0, 150),
    panel: new Color(18, 42, 72, 250),
    card: new Color(32, 68, 108, 240),
    cardHover: new Color(42, 88, 138, 255),
    accent: new Color(255, 204, 90, 255),
    primary: new Color(58, 140, 200, 255),
    success: new Color(52, 168, 110, 255),
    text: new Color(235, 242, 255, 255),
    subText: new Color(150, 175, 205, 255),
    tabActive: new Color(70, 140, 210, 255),
    tabIdle: new Color(40, 72, 108, 220),
    divider: new Color(80, 120, 160, 120),
};

export function fillRoundRect(node: Node, w: number, h: number, color: Color, radius = 10): Graphics {
    const g = node.getComponent(Graphics) || node.addComponent(Graphics);
    g.clear();
    g.fillColor = color;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.fill();
    return g;
}

export function createLabel(
    parent: Node,
    text: string,
    fontSize: number,
    color: Color = UI_COLORS.text,
    width = 200,
    height = 36,
): Label {
    const node = new Node('Label');
    node.parent = parent;
    node.addComponent(UITransform).setContentSize(width, height);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 6;
    label.color = color;
    label.overflow = Label.Overflow.SHRINK;
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    return label;
}

export function sanitizeEditBoxDefaultLabels(editBox: EditBox, keepLabels: Array<Label | null | undefined> = []): void {
    installEditBoxLabelScrubber(editBox?.node || null);
    scrubEditBoxDefaultLabels(editBox, keepLabels, true);
}

function scrubEditBoxDefaultLabels(editBox: EditBox, keepLabels: Array<Label | null | undefined> = [], repeat = false): void {
    const explicitKeep = new Set<Label>();
    keepLabels.forEach((label) => {
        if (label) explicitKeep.add(label);
    });

    const buildKeep = () => {
        const keep = new Set<Label>(explicitKeep);
        if (editBox.textLabel && !isDefaultEditBoxLabel(editBox.textLabel)) keep.add(editBox.textLabel);
        if (editBox.placeholderLabel && !isDefaultEditBoxLabel(editBox.placeholderLabel)) keep.add(editBox.placeholderLabel);
        return keep;
    };

    const scrub = () => {
        if (!editBox || !editBox.node || !editBox.node.isValid) {
            return;
        }
        const keep = buildKeep();
        const preferredText = keepLabels[0];
        const preferredPlaceholder = keepLabels[1];
        if (preferredText && preferredText.node && preferredText.node.isValid) {
            editBox.textLabel = preferredText;
        }
        if (preferredPlaceholder && preferredPlaceholder.node && preferredPlaceholder.node.isValid) {
            editBox.placeholderLabel = preferredPlaceholder;
            editBox.placeholder = '';
        }
        if ((editBox.string || '').trim().toLowerCase() === 'label') {
            editBox.string = '';
        }
        keep.forEach((label) => {
            if (!label || !label.node || !label.node.isValid) {
                return;
            }
            if ((label.string || '').trim().toLowerCase() === 'label') {
                label.string = '';
            }
        });
        stripDefaultLabelNodes(editBox.node, keep, true);
    };

    scrub();
    if (repeat) {
        setTimeout(scrub, 0);
        setTimeout(scrub, 50);
        setTimeout(scrub, 100);
        setTimeout(scrub, 500);
        setTimeout(scrub, 1000);
        setTimeout(scrub, 2000);
    }
}

export function sanitizeAllEditBoxDefaultLabels(root: Node): void {
    installEditBoxLabelScrubber(root);
    scrubDefaultEditBoxLabels(root);
}

function scrubDefaultEditBoxLabels(root: Node): void {
    const walk = (node: Node) => {
        const editBox = node.getComponent(EditBox);
        if (editBox) {
            scrubEditBoxDefaultLabels(editBox);
        }
        stripDefaultLabelNodes(node, new Set<Label>());
        node.children.forEach(walk);
    };
    if (root && root.isValid) {
        walk(root);
    }
}

function installEditBoxLabelScrubber(root: Node | null): void {
    if (!root || !root.isValid || root.getComponent(EditBoxLabelScrubber)) {
        return;
    }
    root.addComponent(EditBoxLabelScrubber);
}

@ccclass('EditBoxLabelScrubber')
class EditBoxLabelScrubber extends Component {
    protected onEnable(): void {
        this.scrub();
        this.schedule(this.scrub, 0.1);
    }

    protected onDisable(): void {
        this.unschedule(this.scrub);
    }

    protected onDestroy(): void {
        this.unschedule(this.scrub);
    }

    public scrubNow(): void {
        this.scrub();
    }

    private scrub = (): void => {
        if (!this.node || !this.node.isValid) {
            return;
        }
        scrubDefaultEditBoxLabels(this.node);
    };
}

function isDefaultEditBoxLabel(label: Label): boolean {
    return (label.string || '').trim().toLowerCase() === 'label';
}

function isGeneratedEditBoxLabel(label: Label): boolean {
    return label.node.name === 'TEXT_LABEL' || label.node.name === 'PLACEHOLDER_LABEL';
}

function stripDefaultLabelNodes(node: Node, keep: Set<Label>, stripGenerated = false): void {
    const label = node.getComponent(Label);
    if (label && !keep.has(label) && (isDefaultEditBoxLabel(label) || (stripGenerated && isGeneratedEditBoxLabel(label)))) {
        label.string = '';
        label.fontSize = 0;
        label.lineHeight = 0;
        label.enabled = false;
        label.node.active = false;
        label.color = new Color(0, 0, 0, 0);
        const transform = label.node.getComponent(UITransform);
        if (transform) {
            transform.setContentSize(0, 0);
        }
    }
    node.children.forEach((child) => stripDefaultLabelNodes(child, keep, stripGenerated));
}

export function createButton(
    parent: Node,
    text: string,
    width: number,
    height: number,
    color: Color,
    target: Node,
    component: string,
    handler: string,
    customData = '',
): Node {
    const btnNode = new Node(handler);
    btnNode.parent = parent;
    btnNode.addComponent(UITransform).setContentSize(width, height);
    fillRoundRect(btnNode, width, height, color, 8);

    const label = createLabel(btnNode, text, 22, UI_COLORS.text, width - 8, height - 4);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.node.setPosition(0, 0, 0);

    const button = btnNode.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 1.04;
    const evt = new EventHandler();
    evt.target = target;
    evt.component = component;
    evt.handler = handler;
    evt.customEventData = customData;
    button.clickEvents.push(evt);
    return btnNode;
}

export function blockInputOnNode(node: Node | null, width?: number, height?: number): void {
    if (!node || !node.isValid) return;
    if (width != null && height != null) {
        const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
        transform.setContentSize(width, height);
    } else if (!node.getComponent(UITransform)) {
        node.addComponent(UITransform);
    }
    if (!node.getComponent(BlockInputEvents)) {
        node.addComponent(BlockInputEvents);
    }
}

export function makeModalLayer(root: Node | null, width = 1920, height = 1080): void {
    blockInputOnNode(root, width, height);
    if (root?.parent) {
        root.setSiblingIndex(root.parent.children.length - 1);
    }
}

export function createOverlayRoot(parent: Node, name: string): Node {
    const root = new Node(name);
    root.parent = parent;
    makeModalLayer(root);

    const mask = new Node('Mask');
    mask.parent = root;
    blockInputOnNode(mask, 1920, 1080);
    fillRoundRect(mask, 1920, 1080, UI_COLORS.overlay, 0);

    const panel = new Node('Panel');
    panel.parent = root;
    panel.addComponent(UITransform).setContentSize(920, 640);
    blockInputOnNode(panel);
    fillRoundRect(panel, 920, 640, UI_COLORS.panel, 16);
    return root;
}

export function createScrollArea(
    parent: Node,
    width: number,
    height: number,
    y = 0,
): { scrollNode: Node; content: Node; scrollView: ScrollView } {
    const scrollNode = new Node('ScrollView');
    scrollNode.parent = parent;
    scrollNode.setPosition(0, y, 0);
    scrollNode.addComponent(UITransform).setContentSize(width, height);
    scrollNode.addComponent(Mask);
    const scrollView = scrollNode.addComponent(ScrollView);
    scrollView.horizontal = false;
    scrollView.vertical = true;
    scrollView.brake = 0.75;
    scrollView.elastic = true;

    const content = new Node('Content');
    content.parent = scrollNode;
    const contentTransform = content.addComponent(UITransform);
    contentTransform.setContentSize(width, height);
    contentTransform.setAnchorPoint(0.5, 1);
    content.setPosition(0, height / 2, 0);
    scrollView.content = content;
    return { scrollNode, content, scrollView };
}

export function resizeScrollContent(content: Node, width: number, itemCount: number, itemHeight: number, gap: number): void {
    const totalHeight = Math.max(itemCount * (itemHeight + gap) - gap, 0);
    const transform = content.getComponent(UITransform);
    const viewHeight = content.parent?.getComponent(UITransform)?.height || totalHeight;
    transform.setContentSize(width, Math.max(totalHeight, viewHeight));
}
