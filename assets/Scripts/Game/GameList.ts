import { _decorator, Component, Node, Button, UITransform, EventHandler, Label, Color, Sprite, Graphics } from 'cc';
import { Client } from './Client';
// 从独立文件导入枚举（避免循环依赖）
import { GameId } from '../App/GameEnums';
import { GameFactory } from '../App/GameFactory';
const { ccclass, property } = _decorator;

/** 游戏项布局参数 */
interface GameItemLayout {
    width: number;
    height: number;
    gapX: number;
    gapY: number;
    cols: number;
}

@ccclass('GameList')
export class GameList extends Component {

    @property({ type: Node })
    private content: Node = null;

    /** 游戏项模板(预制体中已有的 Game01) */
    private templateNode: Node = null;

    /** 布局配置 */
    private layout: GameItemLayout = {
        width: 250,
        height: 180,
        gapX: 30,
        gapY: 20,
        cols: 3,
    };

    start() {
        this.buildGameList();
    }

    /**
     * 递归深度查找子节点（按名称）
     */
    private findDeepChild(parent: Node, name: string): Node | null {
        for (const child of parent.children) {
            if (child.name === name) return child;
            const found = this.findDeepChild(child, name);
            if (found) return found;
        }
        return null;
    }

    /**
     * 从 GameFactory 动态构建游戏列表
     */
    private buildGameList() {
        if (!this.content) {
            // 深度查找 content 节点 (层级: GameList → view → content)
            this.content = this.findDeepChild(this.node, 'content');
        }
        if (!this.content) {
            console.warn('[GameList] Content node not found!');
            return;
        }

        // 收集模板节点（第一个子节点作为模板）
        const children = this.content.children;
        if (children.length > 0) {
            this.templateNode = children[0];
            // 记录模板尺寸
            const transform = this.templateNode.getComponent(UITransform);
            if (transform) {
                this.layout.width = transform.contentSize.width;
                this.layout.height = transform.contentSize.height;
            }
            // 清除所有现有子节点
            for (const child of children) {
                child.destroy();
            }
        }

        // 从 GameFactory 获取全部游戏
        const allGames = GameFactory.getAllGames();
        console.log(`[GameList] Building game list with ${allGames.length} games`);

        // 创建游戏项
        allGames.forEach((gameMeta, index) => {
            const itemNode = this.createGameItem(gameMeta.id, gameMeta.name, index);
            itemNode.parent = this.content;
        });

        // 更新 content 尺寸以适应所有游戏项
        this.adjustContentSize(allGames.length);
    }

    /**
     * 创建单个游戏项节点（含背景色 + 名称文字 + 点击按钮）
     */
    private createGameItem(gameId: string, gameName: string, index: number): Node {
        const node = new Node(`Game_${gameId}`);
        const uiTransform = node.addComponent(UITransform);
        uiTransform.setContentSize(this.layout.width, this.layout.height);

        // 计算位置 (网格布局)
        const col = index % this.layout.cols;
        const row = Math.floor(index / this.layout.cols);
        const startX = -(this.layout.cols - 1) * (this.layout.width + this.layout.gapX) / 2;
        const startY = this.layout.height / 2 + 10;
        node.setPosition(
            startX + col * (this.layout.width + this.layout.gapX),
            startY - row * (this.layout.height + this.layout.gapY),
            0
        );

        // --- 添加背景（Graphics 绘制圆角矩形） ---
        const bgGraphics = node.addComponent(Graphics);
        bgGraphics.fillColor = this.getGameBgColor(index);
        const w = this.layout.width;
        const h = this.layout.height;
        const r = 12; // 圆角半径
        bgGraphics.roundRect(-w / 2, -h / 2, w, h, r);
        bgGraphics.fill();

        // --- 添加游戏名称标签 ---
        const labelNode = new Node('Label');
        labelNode.parent = node;
        const labelTransform = labelNode.addComponent(UITransform);
        labelTransform.setContentSize(this.layout.width - 16, 36);
        labelNode.setPosition(0, -h / 2 + 24, 0);

        const label = labelNode.addComponent(Label);
        label.string = gameName;
        label.fontSize = 24;
        label.lineHeight = 30;
        label.overflow = 2; // CLAMP
        label.horizontalAlign = 1; // CENTER
        label.verticalAlign = 1;   // CENTER
        label.color = new Color(255, 255, 255, 255);
        label.enableBold = true;
        // 添加描边使文字在背景上更清晰
        label.isCustomRender = true;
        label.isSystemFontUsed = true;

        // --- 添加点击按钮 ---
        const btn = node.addComponent(Button);
        btn.transition = 1; // SCALE 变化
        btn.zoomScale = 1.08;
        btn.duration = 0.1;

        // 绑定点击事件 → onGameClicked
        const clickEvent = new EventHandler();
        clickEvent.target = this.node;
        clickEvent.component = 'GameList';
        clickEvent.handler = 'onGameClicked';
        clickEvent.customEventData = gameId;
        btn.clickEvents.push(clickEvent);

        console.log(`[GameList] Created game item: ${gameName} (${gameId}) at [${col},${row}]`);
        return node;
    }

    /**
     * 根据索引获取游戏卡片背景颜色
     */
    private getGameBgColor(index: number): Color {
        const colors = [
            new Color(64, 128, 216, 230),   // 蓝 - 麻将类
            new Color(46, 139, 87, 230),    // 绿 - 麻将类
            new Color(70, 130, 180, 230),   // 钢蓝 - 麻将类
            new Color(205, 92, 80, 230),    // 印度红 - 扑克类
            new Color(148, 103, 189, 230),  // 紫罗兰 - 字牌类
            new Color(218, 135, 60, 230),   // 金橙 - 扑克类
        ];
        return colors[index % colors.length];
    }

    /**
     * 调整 content 容器大小
     */
    private adjustContentSize(gameCount: number): void {
        const rows = Math.ceil(gameCount / this.layout.cols);
        const totalWidth = this.layout.cols * this.layout.width + (this.layout.cols - 1) * this.layout.gapX;
        const totalHeight = rows * this.layout.height + ((rows > 1 ? rows - 1 : 0)) * this.layout.gapY;

        if (this.content) {
            const contentTransform = this.content.getComponent(UITransform);
            if (contentTransform) {
                contentTransform.setContentSize(totalWidth, totalHeight);
            }
        }
    }

    public onGameClicked(event: Event, customEventData: any | null) {
        let name: string = String(customEventData);
        console.log("Game clicked: ", name);
        if (name) {
            Client.Instance.loadGame(name);
        }
    }
}
