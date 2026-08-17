import { _decorator, BlockInputEvents, Button, Color, Component, Graphics, Label, Node, UITransform } from 'cc';

const { ccclass } = _decorator;

/**
 * 首页首次进入时展示的公告。
 * 视觉尺寸以大厅的 1600 x 900 设计分辨率为基准，父节点会负责整体适配。
 */
@ccclass('HomeNoticeDialog')
export class HomeNoticeDialog extends Component {
    private static readonly DESIGN_WIDTH = 1600;
    private static readonly DESIGN_HEIGHT = 900;

    protected onLoad(): void {
        this.build();
    }

    public close(): void {
        this.node.destroy();
    }

    private build(): void {
        const rootTransform = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
        rootTransform.setContentSize(HomeNoticeDialog.DESIGN_WIDTH, HomeNoticeDialog.DESIGN_HEIGHT);
        if (!this.node.getComponent(BlockInputEvents)) {
            this.node.addComponent(BlockInputEvents);
        }

        this.createOverlay();
        this.createPanel();
    }

    private createOverlay(): void {
        const overlay = new Node('Overlay');
        overlay.parent = this.node;
        overlay.addComponent(UITransform).setContentSize(
            HomeNoticeDialog.DESIGN_WIDTH,
            HomeNoticeDialog.DESIGN_HEIGHT,
        );
        const graphics = overlay.addComponent(Graphics);
        graphics.fillColor = new Color(0, 0, 0, 166);
        graphics.fillRect(
            -HomeNoticeDialog.DESIGN_WIDTH / 2,
            -HomeNoticeDialog.DESIGN_HEIGHT / 2,
            HomeNoticeDialog.DESIGN_WIDTH,
            HomeNoticeDialog.DESIGN_HEIGHT,
        );
    }

    private createPanel(): void {
        const panel = new Node('NoticePanel');
        panel.parent = this.node;
        panel.addComponent(UITransform).setContentSize(970, 778);

        this.drawPanelShadow(panel);
        this.drawPanelBackground(panel);
        this.drawContentArea(panel);
        // 标题牌必须压在内容区上方，才能保留参考图中的弧形下沿。
        this.drawTitleTab(panel);
        this.createNoticeText(panel);
        this.createCloseButton(panel);
    }

    private drawPanelShadow(panel: Node): void {
        const shadow = new Node('Shadow');
        shadow.parent = panel;
        const graphics = shadow.addComponent(Graphics);
        graphics.fillColor = new Color(47, 36, 25, 210);
        graphics.roundRect(-485, -389, 970, 778, 27);
        graphics.fill();
    }

    private drawPanelBackground(panel: Node): void {
        const outer = new Node('OuterFrame');
        outer.parent = panel;
        const outerGraphics = outer.addComponent(Graphics);
        outerGraphics.fillColor = new Color(255, 253, 229, 255);
        outerGraphics.roundRect(-478, -382, 956, 764, 22);
        outerGraphics.fill();

        const border = new Node('InnerBorder');
        border.parent = panel;
        const borderGraphics = border.addComponent(Graphics);
        borderGraphics.fillColor = new Color(221, 213, 173, 255);
        borderGraphics.roundRect(-468, -372, 936, 744, 18);
        borderGraphics.fill();

        const surface = new Node('Surface');
        surface.parent = panel;
        const surfaceGraphics = surface.addComponent(Graphics);
        surfaceGraphics.fillColor = new Color(255, 254, 239, 255);
        surfaceGraphics.roundRect(-463, -367, 926, 734, 14);
        surfaceGraphics.fill();
    }

    private drawTitleTab(panel: Node): void {
        const tab = new Node('TitleTab');
        tab.parent = panel;
        const graphics = tab.addComponent(Graphics);
        graphics.fillColor = new Color(186, 128, 43, 130);
        graphics.moveTo(-166, 371);
        graphics.lineTo(166, 371);
        graphics.lineTo(166, 296);
        graphics.bezierCurveTo(166, 273, 147, 258, 122, 258);
        graphics.lineTo(-122, 258);
        graphics.bezierCurveTo(-147, 258, -166, 273, -166, 296);
        graphics.close();
        graphics.fill();

        const face = new Node('TitleTabFace');
        face.parent = panel;
        const faceGraphics = face.addComponent(Graphics);
        faceGraphics.fillColor = new Color(255, 225, 151, 255);
        faceGraphics.moveTo(-160, 368);
        faceGraphics.lineTo(160, 368);
        faceGraphics.lineTo(160, 298);
        faceGraphics.bezierCurveTo(160, 278, 143, 265, 120, 265);
        faceGraphics.lineTo(-120, 265);
        faceGraphics.bezierCurveTo(-143, 265, -160, 278, -160, 298);
        faceGraphics.close();
        faceGraphics.fill();

        const titleShadow = this.createLabel(
            panel,
            '公告',
            56,
            new Color(140, 84, 28, 255),
            220,
            72,
            Label.HorizontalAlign.CENTER,
        );
        titleShadow.node.setPosition(0, 309, 0);

        const title = this.createLabel(
            panel,
            '公告',
            50,
            new Color(255, 238, 181, 255),
            220,
            68,
            Label.HorizontalAlign.CENTER,
        );
        title.node.setPosition(0, 312, 0);
    }

    private drawContentArea(panel: Node): void {
        const content = new Node('ContentArea');
        content.parent = panel;
        const graphics = content.addComponent(Graphics);
        // 与标题牌下沿保留 13px 的白色空隙，避免内容背景贴住顶部。
        graphics.fillColor = new Color(230, 228, 213, 255);
        graphics.roundRect(-445, -358, 890, 603, 13);
        graphics.fill();
    }

    private createNoticeText(panel: Node): void {
        const notice = this.createLabel(
            panel,
            '本平台为公平公正绿色平台！请代理玩家不信谣，\n不传谣。所有玩法设置，一切以系统为准。',
            45,
            new Color(102, 61, 53, 255),
            860,
            140,
            Label.HorizontalAlign.LEFT,
        );
        notice.lineHeight = 54;
        notice.overflow = Label.Overflow.SHRINK;
        // 文案相对于内容背景顶部额外留出 16px，避免贴边。
        notice.node.setPosition(0, 159, 0);
    }

    private createCloseButton(panel: Node): void {
        const buttonNode = new Node('CloseButton');
        buttonNode.parent = panel;
        buttonNode.addComponent(UITransform).setContentSize(84, 84);
        buttonNode.setPosition(421, 310, 0);

        const graphics = buttonNode.addComponent(Graphics);
        graphics.fillColor = new Color(90, 73, 53, 72);
        graphics.circle(2, -2, 41);
        graphics.fill();
        graphics.fillColor = new Color(255, 254, 236, 255);
        graphics.circle(0, 0, 39);
        graphics.fill();
        graphics.lineWidth = 2;
        graphics.strokeColor = new Color(201, 192, 157, 255);
        graphics.circle(0, 0, 36);
        graphics.stroke();
        graphics.fillColor = new Color(247, 166, 10, 255);
        graphics.circle(0, 0, 30);
        graphics.fill();

        const closeSymbol = this.createLabel(
            buttonNode,
            '×',
            70,
            new Color(255, 255, 248, 255),
            64,
            62,
            Label.HorizontalAlign.CENTER,
        );
        closeSymbol.lineHeight = 62;
        closeSymbol.node.setPosition(0, 2, 0);

        const button = buttonNode.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 1.08;
        buttonNode.on(Node.EventType.TOUCH_END, this.close, this);
    }

    private createLabel(
        parent: Node,
        text: string,
        fontSize: number,
        color: Color,
        width: number,
        height: number,
        horizontalAlign: Label.HorizontalAlign,
    ): Label {
        const labelNode = new Node('Label');
        labelNode.parent = parent;
        labelNode.addComponent(UITransform).setContentSize(width, height);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 6;
        label.color = color;
        label.horizontalAlign = horizontalAlign;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return label;
    }
}
