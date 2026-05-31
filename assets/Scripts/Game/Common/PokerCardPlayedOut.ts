import { _decorator, Component, Node, Label, instantiate, Vec3, Prefab, Sprite, SpriteFrame } from 'cc';
import { PokerPoint, PokerSuit } from '../../Common/ConstDefines';
import { Poker } from '../../Common/Poker';
const { ccclass, property } = _decorator;

/**
 * 扑克出牌展示区域
 * 四个方向（下/右/上/左）显示各玩家打出的牌
 */
@ccclass('PokerCardPlayedOut')
export class PokerCardPlayedOut extends Component {

    @property({ type: [Node] })
    private cardZones: Node[] = [];

    @property({ type: Prefab })
    private prefabPlayedCard: Prefab = null;

    @property({ type: Prefab })
    private signPass: Prefab = null;

    @property({ type: [SpriteFrame] })
    private spriteList: SpriteFrame[] = [];

    private static readonly CARD_SPACING: number = 25;

    // 各方向已显示的牌节点数组
    private bottomCards: Node[] = [];

    private rightCards: Node[] = [];

    private topCards: Node[] = [];

    private leftCards: Node[] = [];

    // 旗标节点
    private flagNodes: Node[] = [null, null, null, null];

    start() {}

    update(deltaTime: number) {}

    /**
     * 获取指定方向的牌数组
     */
    private getCardArray(clientSeat: number): Node[] {
        if (clientSeat === 0) return this.bottomCards;
        else if (clientSeat === 1) return this.rightCards;
        else if (clientSeat === 2) return this.topCards;
        else if (clientSeat === 3) return this.leftCards;
        return null;
    }

    /**
     * 设置指定方向的牌数组
     */
    private setCardArray(clientSeat: number, arr: Node[]): void {
        if (clientSeat === 0) this.bottomCards = arr;
        else if (clientSeat === 1) this.rightCards = arr;
        else if (clientSeat === 2) this.topCards = arr;
        else if (clientSeat === 3) this.leftCards = arr;
    }

    /**
     * 获取牌面SpriteFrame
     */
    private getCardSprite(card: any): SpriteFrame {
        if (!card || !this.spriteList || this.spriteList.length === 0) return null;
        let index: number = (card.point - PokerPoint.Ace) * 4;
        if (card.point === PokerPoint.Joker) {
            index = index + (card.suit - PokerSuit.Little);
        } else {
            index = index + (card.suit - PokerSuit.Diamond);
        }
        if (index < 0 || index >= this.spriteList.length) return null;
        return this.spriteList[index];
    }

    /**
     * 在指定方向显示打出的牌
     * @param clientSeat 客户端座位号 (0=下, 1=右, 2=上, 3=左)
     * @param cards 打出的牌数据数组，支持整数ID数组或 {point, suit, id} 对象数组
     */
    public playCards(clientSeat: number, cards: any[]): void {
        this.clearCards(clientSeat);
        if (!cards || cards.length === 0) return;
        let cardZone: Node = this.cardZones[clientSeat];
        if (!cardZone) return;

        // 将整数ID转换为牌对象
        let cardObjects: any[] = [];
        if (typeof cards[0] === 'number') {
            for (let i: number = 0; i < cards.length; i++) {
                let c: any = Poker.fromInt32(cards[i]);
                c.id = cards[i];
                cardObjects.push(c);
            }
        } else {
            cardObjects = cards;
        }

        let arr: Node[] = [];
        let startX: number = this.getStartX(cardObjects.length);
        for (let i: number = 0; i < cardObjects.length; i++) {
            let cardNode: Node = null;
            if (this.prefabPlayedCard) {
                cardNode = instantiate(this.prefabPlayedCard);
            }
            if (!cardNode) {
                // 无预制体时创建简单Label节点
                cardNode = new Node("Card");
                let label: Label = cardNode.addComponent(Label);
                if (label) {
                    label.string = Poker.getPointName(cardObjects[i].point);
                    label.fontSize = 22;
                    label.lineHeight = 22;
                }
            } else {
                // 有预制体时设置Sprite
                let sprite: Sprite = cardNode.getComponent(Sprite);
                if (sprite) {
                    sprite.spriteFrame = this.getCardSprite(cardObjects[i]);
                }
            }
            cardNode.parent = cardZone;
            let sn: number = i + 1;
            if (sn < 10) cardNode.name = "PlayedCard0" + sn.toString();
            else cardNode.name = "PlayedCard" + sn.toString();
            cardNode.position = new Vec3(startX, 0, 0);
            startX = startX + PokerCardPlayedOut.CARD_SPACING;
            arr.push(cardNode);
        }
        this.setCardArray(clientSeat, arr);
    }

    /**
     * 显示旗标（Pass等）
     * @param clientSeat 客户端座位号
     * @param flag 旗标类型 (1=Pass/不要, 2=其他)
     */
    public showFlag(clientSeat: number, flag: number): void {
        this.clearCards(clientSeat);
        let cardZone: Node = this.cardZones[clientSeat];
        if (!cardZone) return;

        let flagNode: Node = null;
        if (flag === 1 && this.signPass) {
            flagNode = instantiate(this.signPass);
        }
        if (!flagNode) {
            // 无预制体时创建简单Label节点
            flagNode = new Node("Flag");
            let label: Label = flagNode.addComponent(Label);
            if (label) {
                if (flag === 1) label.string = "不要";
                else label.string = "Pass";
                label.fontSize = 30;
                label.lineHeight = 30;
            }
        }
        flagNode.parent = cardZone;
        let arr: Node[] = [];
        arr.push(flagNode);
        this.setCardArray(clientSeat, arr);
        this.flagNodes[clientSeat] = flagNode;
    }

    /**
     * 清除指定方向的牌
     * @param clientSeat 客户端座位号
     */
    public clearCards(clientSeat: number): void {
        let arr: Node[] = this.getCardArray(clientSeat);
        if (!arr) return;
        for (let i: number = 0; i < arr.length; i++) {
            arr[i].destroy();
        }
        this.setCardArray(clientSeat, null);
        this.flagNodes[clientSeat] = null;
    }

    /**
     * 清除所有方向的牌
     */
    public clear(): void {
        for (let i: number = 0; i < 4; i++) {
            this.clearCards(i);
        }
    }

    /**
     * 计算起始X坐标，使牌居中显示
     */
    private getStartX(num: number): number {
        return (1 - num) * PokerCardPlayedOut.CARD_SPACING * 0.5;
    }
}
