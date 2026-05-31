import { _decorator, Component, Sprite, SpriteFrame, Color, Vec3, tween } from 'cc';
import { PokerPoint, PokerSuit } from '../../Common/ConstDefines';
import { Poker } from '../../Common/Poker';
const { ccclass, property } = _decorator;

@ccclass('PokerCardSlot')
export class PokerCardSlot extends Component {

    @property({ type: Sprite })
    public cardSprite: Sprite = null;

    private cardId: number = -1;

    private point: number = 0;

    private suit: number = 0;

    private isSelected: boolean = false;

    static readonly SELECT_OFFSET_Y: number = 20;

    private originalPosY: number = 0;

    start() {}

    update(deltaTime: number) {}

    /**
     * 设置扑克牌数据
     * @param card 牌数据，支持 {point, suit, id} 格式或整数ID格式
     */
    public setCard(card: any): void {
        if (!card) return;
        if (typeof card === 'number') {
            // 整数ID格式，通过Poker.fromInt32转换
            let c: any = Poker.fromInt32(card);
            this.point = c.point;
            this.suit = c.suit;
            this.cardId = card;
        } else {
            // 对象格式
            this.point = card.point;
            this.suit = card.suit;
            this.cardId = card.id;
        }
    }

    /**
     * 设置选中状态
     * @param selected 是否选中
     */
    public setSelected(selected: boolean): void {
        if (this.isSelected === selected) return;
        this.isSelected = selected;
        let targetY: number = this.originalPosY;
        if (this.isSelected) {
            targetY = this.originalPosY + PokerCardSlot.SELECT_OFFSET_Y;
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
     * 获取牌点
     */
    public getPoint(): number {
        return this.point;
    }

    /**
     * 获取牌花色
     */
    public getSuit(): number {
        return this.suit;
    }

    /**
     * 设置颜色
     * @param clr 目标颜色
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
     * 记录原始Y坐标（用于选中上移的基准）
     */
    public setOriginalPosY(y: number): void {
        this.originalPosY = y;
    }

    /**
     * 计算牌面图片索引
     * 正常牌: index = (point - 1) * 4 + (suit - 1)
     * 大小王: index = (Joker-1)*4 + (suit-5)
     */
    public static getSpriteIndex(point: number, suit: number): number {
        if (point === PokerPoint.Joker) {
            return (PokerPoint.Joker - 1) * 4 + (suit - PokerSuit.Little);
        }
        return (point - PokerPoint.Ace) * 4 + (suit - PokerSuit.Diamond);
    }
}
