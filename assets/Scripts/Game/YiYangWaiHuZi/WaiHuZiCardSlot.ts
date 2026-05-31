import { _decorator, Component, Sprite, SpriteFrame, Label, Color, Vec3, tween } from 'cc';
const { ccclass, property } = _decorator;

/**
 * 歪胡子单张字牌组件
 * 每张字牌有 point (1-20) 和 id (唯一标识)
 */
@ccclass('WaiHuZiCardSlot')
export class WaiHuZiCardSlot extends Component {

    @property({ type: Sprite })
    public cardSprite: Sprite = null;

    @property({ type: Label })
    public cardLabel: Label = null;

    private cardId: number = -1;

    private point: number = 0;

    private isSelected: boolean = false;

    static readonly SELECT_OFFSET_Y: number = 20;

    private originalPosY: number = 0;

    start() {}

    update(deltaTime: number) {}

    /**
     * 设置字牌数据
     * @param card 牌数据，支持 {point, id} 格式或整数ID格式
     */
    public setCard(card: any): void {
        if (!card) return;
        if (typeof card === 'number') {
            this.cardId = card;
            this.point = card;  // 字牌的id和point相同
        } else {
            this.point = card.point;
            this.cardId = card.id !== undefined ? card.id : card.point;
        }
        if (this.cardLabel) {
            this.cardLabel.string = WaiHuZiCardSlot.getPointName(this.point);
        }
    }

    /**
     * 获取字牌面值名称
     */
    public static getPointName(point: number): string {
        if (point >= 1 && point <= 10) {
            const names = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
            return names[point];
        } else if (point >= 11 && point <= 20) {
            const names = ["", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖", "拾"];
            return names[point - 10];
        }
        return "";
    }

    /**
     * 判断是否为大字
     */
    public static isBig(point: number): boolean {
        return point >= 11 && point <= 20;
    }

    /**
     * 获取面值（大字和小字相同面值返回相同数）
     * 例如：小五(5)和大五(15)都返回5
     */
    public static getFaceValue(point: number): number {
        if (point >= 1 && point <= 10) return point;
        if (point >= 11 && point <= 20) return point - 10;
        return 0;
    }

    /**
     * 设置选中状态
     */
    public setSelected(selected: boolean): void {
        if (this.isSelected === selected) return;
        this.isSelected = selected;
        let targetY: number = this.originalPosY;
        if (this.isSelected) {
            targetY = this.originalPosY + WaiHuZiCardSlot.SELECT_OFFSET_Y;
        }
        tween(this.node)
            .to(0.15, { position: new Vec3(this.node.position.x, targetY, 0) }, { easing: 'linear' })
            .start();
    }

    /**
     * 获取牌ID
     */
    public getCardId(): number {
        return this.cardId;
    }

    /**
     * 获取牌点数
     */
    public getPoint(): number {
        return this.point;
    }

    /**
     * 设置颜色
     */
    public setColor(clr: Color): void {
        if (this.cardSprite) {
            this.cardSprite.color = clr;
        }
    }

    /**
     * 获取当前颜色
     */
    public getColor(): Color {
        if (this.cardSprite) return this.cardSprite.color.clone();
        return new Color(255, 255, 255, 255);
    }

    /**
     * 记录原始Y坐标
     */
    public setOriginalPosY(y: number): void {
        this.originalPosY = y;
    }
}
