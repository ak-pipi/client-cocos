import { _decorator, BlockInputEvents, Button, Color, Component, Graphics, Label, Node, ScrollView, UITransform } from 'cc';
import { createScrollArea, resizeScrollContent } from '../../UI/UiKit';

const { ccclass } = _decorator;

type RuleCategory = 'all' | 'poker' | 'mahjong' | 'zipai' | 'frequent';

interface GameplayRule {
    name: string;
    typeName: string;
    category: Exclude<RuleCategory, 'all' | 'frequent'>;
    details: string;
}

/**
 * 当前大厅实际注册的六款游戏说明。
 * 默认规则来自各游戏房间与服务端 ruleConfig；开房后的实时房间规则拥有最高优先级。
 */
const GAMEPLAY_RULES: GameplayRule[] = [
    {
        name: '桃江麻将',
        typeName: '桃江麻将',
        category: 'mahjong',
        details: '玩法：2人108张，可吃、碰、杠、胡；明子同花色的下一张为赖子，可报听。\n胡牌/倍数：平胡、自摸、点炮、杠上开花、七对、碰碰胡、清一色可叠加计番；默认18分封顶。\n房费：整场结束结算；净赢达阈值者承担，无人达标时由真实玩家均摊，金额以房间规则为准。',
    },
    {
        name: '红中麻将',
        typeName: '红中麻将',
        category: 'mahjong',
        details: '玩法：2人112张，红中作赖子；不可吃、可碰杠，支持点炮和抢杠胡。\n胡牌/倍数：普通胡、七对、碰碰胡、清一色等按牌型结算；默认胡后翻1鸟，命中按鸟牌倍数 xN 结算。\n房费：整场结束结算；净赢达阈值者承担，无人达标时由真实玩家均摊，金额以房间规则为准。',
    },
    {
        name: '长沙麻将',
        typeName: '长沙麻将',
        category: 'mahjong',
        details: '玩法：4人108张，258作将，可吃、碰、杠、胡；支持缺一色、板板胡等起手胡。\n胡牌/倍数：大四喜、六六顺、节节高、三同、一枝花等参与计番；默认8番封顶，默认翻2鸟并按命中倍数结算。\n房费：整场结束结算；净赢达阈值者承担，无人达标时由真实玩家均摊，金额以房间规则为准。',
    },
    {
        name: '跑得快',
        typeName: '跑得快',
        category: 'poker',
        details: '玩法：2人各15张，先出完手牌获胜；可出单张、对子、三带、顺子、连对、飞机和炸弹，能管必须管。\n计分/倍数：按底分×当前倍数结算；扎鸟场红桃10命中默认 x2，炸弹默认另计10分，具体以桌内展示为准。\n房费：整场结束结算；净赢达阈值者承担，无人达标时由真实玩家均摊，金额以房间规则为准。',
    },
    {
        name: '益阳歪胡子',
        typeName: '益阳歪胡子',
        category: 'zipai',
        details: '玩法：2人80张字牌，可吃、碰、偎、跑、提、胡；吃牌可选一二三、二七十等组合。\n胡牌/倍数：自摸、点胡、天胡、地胡、红胡、乌胡按房规结算；偎/碰1分、提3分、跑6分并累计胡息。\n房费：整场结束结算；净赢达阈值者承担，无人达标时由真实玩家均摊，金额以房间规则为准。',
    },
    {
        name: '沅江千分',
        typeName: '沅江千分',
        category: 'poker',
        details: '玩法：4人双副牌、两两组队；叫分定庄后埋底，按主牌和牌型进行对抗。\n计分/倍数：5、10、K为分牌，庄闲按抓分与目标分决定升级；叫分、底分及倍数以房间实时配置为准。\n房费：整场结束结算；净赢达阈值者承担，无人达标时由真实玩家均摊，金额以房间规则为准。',
    },
];

const CATEGORY_ITEMS: Array<{ key: RuleCategory; text: string }> = [
    { key: 'all', text: '全部' },
    { key: 'poker', text: '扑克' },
    { key: 'mahjong', text: '麻将' },
    { key: 'zipai', text: '字牌' },
    { key: 'frequent', text: '常玩' },
];

const PANEL_WIDTH = 1300;
const PANEL_HEIGHT = 880;
const CARD_WIDTH = 920;
const CARD_HEIGHT = 154;
const CARD_GAP = 12;

/**
 * 仅复刻“快速组局”中央弹框的视觉结构；弹框本身不绘制背景遮罩，外部背景保持透明。
 */
@ccclass('GameplayIntroductionDialog')
export class GameplayIntroductionDialog extends Component {
    private static readonly DESIGN_WIDTH = 1600;
    private static readonly DESIGN_HEIGHT = 900;

    private activeCategory: RuleCategory = 'all';
    private navRoot: Node | null = null;
    private ruleRoot: Node | null = null;
    private ruleScroll: ScrollView | null = null;

    protected onLoad(): void {
        const transform = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
        transform.setContentSize(GameplayIntroductionDialog.DESIGN_WIDTH, GameplayIntroductionDialog.DESIGN_HEIGHT);
        if (!this.node.getComponent(BlockInputEvents)) {
            this.node.addComponent(BlockInputEvents);
        }
        this.createDialogFrame();
    }

    public close(): void {
        this.node.active = false;
    }

    private createDialogFrame(): void {
        const panel = new Node('GameplayIntroductionPanel');
        panel.parent = this.node;
        panel.addComponent(UITransform).setContentSize(PANEL_WIDTH, PANEL_HEIGHT);

        this.drawPanelFrame(panel);
        this.createHeader(panel);
        this.createSidebar(panel);
        this.createRuleArea(panel);
        this.createCloseButton(panel);
        this.renderCategory();
    }

    private drawPanelFrame(panel: Node): void {
        const shadow = new Node('Shadow');
        shadow.parent = panel;
        const shadowGraphics = shadow.addComponent(Graphics);
        shadowGraphics.fillColor = new Color(72, 47, 30, 230);
        shadowGraphics.roundRect(-650, -440, 1300, 880, 36);
        shadowGraphics.fill();

        const outer = new Node('OuterGoldFrame');
        outer.parent = panel;
        const outerGraphics = outer.addComponent(Graphics);
        outerGraphics.fillColor = new Color(255, 228, 162, 255);
        outerGraphics.roundRect(-643, -433, 1286, 866, 30);
        outerGraphics.fill();

        const highlight = new Node('FrameHighlight');
        highlight.parent = panel;
        const highlightGraphics = highlight.addComponent(Graphics);
        highlightGraphics.lineWidth = 3;
        highlightGraphics.strokeColor = new Color(255, 247, 210, 255);
        highlightGraphics.roundRect(-636, -426, 1272, 852, 25);
        highlightGraphics.stroke();

        const inner = new Node('InnerBrownFrame');
        inner.parent = panel;
        const innerGraphics = inner.addComponent(Graphics);
        innerGraphics.fillColor = new Color(117, 75, 47, 255);
        innerGraphics.roundRect(-628, -418, 1256, 836, 20);
        innerGraphics.fill();

        const body = new Node('BodyBase');
        body.parent = panel;
        const bodyGraphics = body.addComponent(Graphics);
        bodyGraphics.fillColor = new Color(219, 181, 125, 255);
        bodyGraphics.roundRect(-620, -410, 1240, 754, 14);
        bodyGraphics.fill();
    }

    private createHeader(panel: Node): void {
        const header = new Node('GoldHeader');
        header.parent = panel;
        const graphics = header.addComponent(Graphics);
        graphics.fillColor = new Color(213, 141, 62, 255);
        graphics.roundRect(-620, 343, 1240, 67, 13);
        graphics.fill();
        graphics.fillColor = new Color(255, 214, 145, 255);
        graphics.roundRect(-617, 369, 1234, 38, 11);
        graphics.fill();
        graphics.fillColor = new Color(247, 183, 101, 255);
        graphics.rect(-617, 346, 1234, 25);
        graphics.fill();
        graphics.lineWidth = 2;
        graphics.strokeColor = new Color(255, 237, 188, 255);
        graphics.roundRect(-617, 346, 1234, 61, 11);
        graphics.stroke();

        const titleTabShadow = new Node('TitleTabShadow');
        titleTabShadow.parent = panel;
        const shadowGraphics = titleTabShadow.addComponent(Graphics);
        shadowGraphics.fillColor = new Color(172, 94, 32, 155);
        this.drawTitleTab(shadowGraphics, 0, -3);
        shadowGraphics.fill();

        const titleTab = new Node('TitleTab');
        titleTab.parent = panel;
        const tabGraphics = titleTab.addComponent(Graphics);
        tabGraphics.fillColor = new Color(240, 164, 74, 255);
        this.drawTitleTab(tabGraphics, 0, 0);
        tabGraphics.fill();
        tabGraphics.lineWidth = 2;
        tabGraphics.strokeColor = new Color(255, 208, 133, 255);
        this.drawTitleTab(tabGraphics, 0, 0);
        tabGraphics.stroke();

        const titleShadow = this.createLabel(
            panel,
            '玩法介绍',
            49,
            new Color(125, 74, 30, 255),
            350,
            62,
            Label.HorizontalAlign.CENTER,
        );
        titleShadow.node.setPosition(2, 378, 0);
        const title = this.createLabel(
            panel,
            '玩法介绍',
            45,
            new Color(255, 251, 224, 255),
            350,
            58,
            Label.HorizontalAlign.CENTER,
        );
        title.node.setPosition(0, 382, 0);
    }

    private drawTitleTab(graphics: Graphics, xOffset: number, yOffset: number): void {
        graphics.moveTo(-232 + xOffset, 412 + yOffset);
        graphics.lineTo(232 + xOffset, 412 + yOffset);
        graphics.lineTo(198 + xOffset, 356 + yOffset);
        graphics.bezierCurveTo(188 + xOffset, 340 + yOffset, 170 + xOffset, 332 + yOffset, 146 + xOffset, 332 + yOffset);
        graphics.lineTo(-146 + xOffset, 332 + yOffset);
        graphics.bezierCurveTo(-170 + xOffset, 332 + yOffset, -188 + xOffset, 340 + yOffset, -198 + xOffset, 356 + yOffset);
        graphics.close();
    }

    private createSidebar(panel: Node): void {
        const sidebar = new Node('Sidebar');
        sidebar.parent = panel;
        sidebar.addComponent(UITransform).setContentSize(260, 740);
        sidebar.setPosition(-490, -36, 0);
        const graphics = sidebar.addComponent(Graphics);
        graphics.fillColor = new Color(180, 137, 95, 255);
        graphics.roundRect(-130, -370, 260, 740, 14);
        graphics.fill();
        graphics.lineWidth = 2;
        graphics.strokeColor = new Color(244, 206, 149, 255);
        graphics.roundRect(-128, -368, 256, 736, 12);
        graphics.stroke();

        this.navRoot = new Node('CategoryButtons');
        this.navRoot.parent = sidebar;
        this.navRoot.addComponent(UITransform).setContentSize(244, 706);
    }

    private createRuleArea(panel: Node): void {
        const area = new Node('RuleArea');
        area.parent = panel;
        area.addComponent(UITransform).setContentSize(950, 740);
        area.setPosition(125, -36, 0);
        const graphics = area.addComponent(Graphics);
        graphics.fillColor = new Color(106, 70, 45, 255);
        graphics.roundRect(-475, -370, 950, 740, 14);
        graphics.fill();
        graphics.lineWidth = 2;
        graphics.strokeColor = new Color(243, 209, 151, 255);
        graphics.roundRect(-473, -368, 946, 736, 11);
        graphics.stroke();

        const scroll = createScrollArea(area, CARD_WIDTH + 4, 708, 0);
        this.ruleRoot = scroll.content;
        this.ruleScroll = scroll.scrollView;
    }

    private createCloseButton(panel: Node): void {
        const closeButton = new Node('CloseButton');
        closeButton.parent = panel;
        closeButton.addComponent(UITransform).setContentSize(84, 84);
        closeButton.setPosition(577, 380, 0);

        const graphics = closeButton.addComponent(Graphics);
        graphics.fillColor = new Color(138, 84, 38, 155);
        graphics.circle(2, -3, 41);
        graphics.fill();
        graphics.fillColor = new Color(255, 244, 179, 255);
        graphics.circle(0, 0, 40);
        graphics.fill();
        graphics.lineWidth = 3;
        graphics.strokeColor = new Color(255, 225, 111, 255);
        graphics.circle(0, 0, 36);
        graphics.stroke();
        graphics.fillColor = new Color(226, 172, 35, 255);
        graphics.circle(0, 0, 31);
        graphics.fill();

        const closeMark = this.createLabel(
            closeButton,
            '×',
            71,
            new Color(255, 255, 248, 255),
            64,
            64,
            Label.HorizontalAlign.CENTER,
        );
        closeMark.node.setPosition(0, 2, 0);

        const button = closeButton.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 1.08;
        closeButton.on(Node.EventType.TOUCH_END, this.close, this);
    }

    private renderCategory(): void {
        this.renderCategoryButtons();
        this.renderRuleCards();
    }

    private renderCategoryButtons(): void {
        if (!this.navRoot) return;
        this.navRoot.removeAllChildren();

        CATEGORY_ITEMS.forEach((item, index) => {
            const selected = item.key === this.activeCategory;
            const buttonNode = new Node(`Category_${item.key}`);
            buttonNode.parent = this.navRoot;
            buttonNode.addComponent(UITransform).setContentSize(226, 112);
            buttonNode.setPosition(0, 282 - index * 137, 0);

            const graphics = buttonNode.addComponent(Graphics);
            graphics.fillColor = selected ? new Color(211, 143, 31, 200) : new Color(130, 91, 58, 120);
            graphics.roundRect(-113, -56, 226, 112, 17);
            graphics.fill();
            graphics.fillColor = selected ? new Color(255, 196, 17, 255) : new Color(222, 181, 119, 255);
            graphics.roundRect(-110, -53, 220, 106, 15);
            graphics.fill();
            graphics.fillColor = selected ? new Color(255, 216, 50, 255) : new Color(235, 198, 143, 255);
            graphics.roundRect(-107, 4, 214, 46, 13);
            graphics.fill();
            graphics.lineWidth = 2;
            graphics.strokeColor = selected ? new Color(255, 235, 112, 255) : new Color(246, 219, 178, 255);
            graphics.roundRect(-108, -51, 216, 102, 13);
            graphics.stroke();

            const label = this.createLabel(
                buttonNode,
                selected && item.key === 'all' ? '全部  ›' : item.text,
                40,
                selected ? new Color(255, 255, 229, 255) : new Color(115, 76, 42, 255),
                198,
                68,
                Label.HorizontalAlign.CENTER,
            );
            label.node.setPosition(0, -4, 0);

            const button = buttonNode.addComponent(Button);
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 1.04;
            buttonNode.on(Node.EventType.TOUCH_END, () => {
                this.activeCategory = item.key;
                this.renderCategory();
            }, this);
        });
    }

    private renderRuleCards(): void {
        if (!this.ruleRoot) return;
        this.ruleRoot.removeAllChildren();
        const rules = this.activeCategory === 'all' || this.activeCategory === 'frequent'
            ? GAMEPLAY_RULES
            : GAMEPLAY_RULES.filter((item) => item.category === this.activeCategory);
        resizeScrollContent(this.ruleRoot, CARD_WIDTH + 4, rules.length, CARD_HEIGHT, CARD_GAP);
        rules.forEach((rule, index) => this.createRuleCard(rule, index));
        this.ruleScroll?.scrollToTop(0);
    }

    private createRuleCard(rule: GameplayRule, index: number): void {
        if (!this.ruleRoot) return;
        const card = new Node(`Rule_${rule.name}`);
        card.parent = this.ruleRoot;
        card.addComponent(UITransform).setContentSize(CARD_WIDTH, CARD_HEIGHT);
        card.setPosition(0, -(index * (CARD_HEIGHT + CARD_GAP) + CARD_HEIGHT / 2), 0);

        const graphics = card.addComponent(Graphics);
        graphics.fillColor = new Color(83, 52, 33, 190);
        graphics.roundRect(-460, -79, 920, 154, 15);
        graphics.fill();
        graphics.fillColor = new Color(247, 202, 129, 255);
        graphics.roundRect(-460, -77, 920, 154, 14);
        graphics.fill();
        graphics.fillColor = new Color(255, 221, 156, 255);
        graphics.roundRect(-457, 18, 914, 56, 11);
        graphics.fill();
        graphics.lineWidth = 2;
        graphics.strokeColor = new Color(255, 232, 178, 255);
        graphics.roundRect(-458, -75, 916, 150, 12);
        graphics.stroke();

        const indexShape = new Node('IndexShape');
        indexShape.parent = card;
        const indexGraphics = indexShape.addComponent(Graphics);
        indexGraphics.fillColor = new Color(255, 226, 169, 255);
        this.drawIndexDiamond(indexGraphics, -390, 0, 42);
        indexGraphics.fill();
        indexGraphics.lineWidth = 3;
        indexGraphics.strokeColor = new Color(233, 195, 128, 255);
        this.drawIndexDiamond(indexGraphics, -390, 0, 42);
        indexGraphics.stroke();

        const number = this.createLabel(
            card,
            String(index + 1),
            39,
            new Color(129, 87, 43, 255),
            58,
            54,
            Label.HorizontalAlign.CENTER,
        );
        number.node.setPosition(-390, 0, 0);

        const name = this.createLabel(
            card,
            rule.name,
            28,
            new Color(111, 55, 39, 255),
            270,
            36,
            Label.HorizontalAlign.LEFT,
        );
        name.node.setPosition(-290, 44, 0);

        const type = this.createLabel(
            card,
            `玩法类型：${rule.typeName}`,
            26,
            new Color(111, 55, 39, 255),
            350,
            36,
            Label.HorizontalAlign.LEFT,
        );
        type.node.setPosition(85, 44, 0);

        const details = this.createLabel(
            card,
            rule.details,
            17,
            new Color(151, 71, 46, 255),
            800,
            90,
            Label.HorizontalAlign.LEFT,
        );
        details.lineHeight = 23;
        details.overflow = Label.Overflow.SHRINK;
        details.verticalAlign = Label.VerticalAlign.TOP;
        details.node.setPosition(35, -22, 0);
    }

    private drawIndexDiamond(graphics: Graphics, x: number, y: number, radius: number): void {
        graphics.moveTo(x - radius, y);
        graphics.lineTo(x, y + radius);
        graphics.lineTo(x + radius, y);
        graphics.lineTo(x, y - radius);
        graphics.close();
    }

    private createLabel(
        parent: Node,
        text: string,
        fontSize: number,
        color: Color,
        width: number,
        height: number,
        align: Label.HorizontalAlign,
    ): Label {
        const labelNode = new Node('Label');
        labelNode.parent = parent;
        labelNode.addComponent(UITransform).setContentSize(width, height);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 4;
        label.color = color;
        label.horizontalAlign = align;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return label;
    }
}
