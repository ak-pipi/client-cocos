/**
 * 轻量 UI 构建工具（纯代码生成面板，无需预制体）
 */
import {
    Node, Label, Color, Graphics, UITransform, Button, EventHandler,
    ScrollView, Mask,
} from 'cc';

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

export function createOverlayRoot(parent: Node, name: string): Node {
    const root = new Node(name);
    root.parent = parent;
    const transform = root.addComponent(UITransform);
    transform.setContentSize(1920, 1080);

    const mask = new Node('Mask');
    mask.parent = root;
    mask.addComponent(UITransform).setContentSize(1920, 1080);
    fillRoundRect(mask, 1920, 1080, UI_COLORS.overlay, 0);

    const panel = new Node('Panel');
    panel.parent = root;
    panel.addComponent(UITransform).setContentSize(920, 640);
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
