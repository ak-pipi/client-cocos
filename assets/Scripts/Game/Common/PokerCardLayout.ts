import { _decorator, Component, Node, Vec3, Prefab, instantiate } from 'cc';
import { PokerCardSlot } from './PokerCardSlot';
import { Poker } from '../../Common/Poker';
const { ccclass, property } = _decorator;

/**
 * 扑克手牌布局类
 * 牌从左到右排列在一行中，按点数降序、花色降序排列
 */
@ccclass('PokerCardLayout')
export class PokerCardLayout extends Component {

    private static readonly SPACING: number = 45;

    @property({ type: Prefab })
    private prefabCardSlot: Prefab = null;

    @property({ type: Node })
    private cardZone: Node = null;

    // 牌槽数组，从左到右排列（已排序）
    private cardSlots: PokerCardSlot[] = [];

    // 牌ID到牌槽的映射
    private cardSlotMap: Map<number, PokerCardSlot> = new Map();

    // 当前选中的牌ID集合
    private selectedCardIds: Set<number> = new Set();

    // 延迟重定位数据
    private relocateData: any = null;

    // 延迟帧计数
    private relocateFrames: number = 0;

    start() {}

    update(deltaTime: number) {
        this.updateRelocate(deltaTime);
    }

    private updateRelocate(deltaTime: number): void {
        if (!this.relocateData) return;
        if (this.relocateFrames < 2) {
            this.relocateFrames = this.relocateFrames + 1;
            return;
        }
        // 两帧之后执行，确保场景树节点调整后重新定位可生效
        this.relocateFrames = 0;
        this.relocateCards();
        this.relocateData = null;
    }

    /**
     * 比较两张牌的排序（降序：先按点数降序，再按花色降序）
     */
    private compareCards(a: any, b: any): number {
        if (a.point > b.point) return -1;
        if (a.point < b.point) return 1;
        if (a.suit > b.suit) return -1;
        if (a.suit < b.suit) return 1;
        return 0;
    }

    /**
     * 将整数ID数组转换为牌对象数组
     */
    private convertCards(cardIds: number[]): any[] {
        let cards: any[] = [];
        for (let i: number = 0; i < cardIds.length; i++) {
            let c: any = Poker.fromInt32(cardIds[i]);
            c.id = cardIds[i];
            cards.push(c);
        }
        return cards;
    }

    /**
     * 设置手牌
     * @param cards 牌数据数组，支持整数ID数组或 {point, suit, id} 对象数组
     */
    public setHandCards(cards: any[]): void {
        this.clear();
        if (!cards || cards.length === 0) return;
        if (!this.cardZone) return;
        if (!this.prefabCardSlot) return;

        // 如果传入的是整数ID数组，先转换为牌对象
        let cardObjects: any[] = [];
        if (typeof cards[0] === 'number') {
            cardObjects = this.convertCards(cards);
        } else {
            cardObjects = cards;
        }

        // 按点数降序、花色降序排序
        cardObjects.sort((a: any, b: any) => this.compareCards(a, b));

        for (let i: number = 0; i < cardObjects.length; i++) {
            let slotNode: Node = instantiate(this.prefabCardSlot);
            if (!slotNode) continue;
            slotNode.parent = this.cardZone;
            let idx: number = i + 1;
            if (idx < 10) slotNode.name = "PokerCard0" + idx.toString();
            else slotNode.name = "PokerCard" + idx.toString();

            let slot: PokerCardSlot = slotNode.getComponent(PokerCardSlot);
            if (!slot) continue;
            slot.setCard(cardObjects[i]);
            this.cardSlots.push(slot);
            this.cardSlotMap.set(cardObjects[i].id, slot);
        }

        // 延迟一帧后重新定位
        this.relocateData = {};
    }

    /**
     * 删除指定ID的牌
     * @param cardIds 要删除的牌ID数组
     */
    public removeCards(cardIds: number[]): void {
        if (!cardIds || cardIds.length === 0) return;
        let needRelocate: boolean = false;
        for (let i: number = 0; i < cardIds.length; i++) {
            let cardId: number = cardIds[i];
            let slot: PokerCardSlot = this.cardSlotMap.get(cardId);
            if (!slot) continue;
            // 从数组中移除
            let idx: number = this.cardSlots.indexOf(slot);
            if (idx !== -1) {
                this.cardSlots.splice(idx, 1);
            }
            slot.node.destroy();
            this.cardSlotMap.delete(cardId);
            this.selectedCardIds.delete(cardId);
            needRelocate = true;
        }
        if (needRelocate) {
            this.relocateData = {};
        }
    }

    /**
     * 清空所有手牌
     */
    public clear(): void {
        for (let i: number = 0; i < this.cardSlots.length; i++) {
            this.cardSlots[i].node.destroy();
        }
        this.cardSlots = [];
        this.cardSlotMap = new Map<number, PokerCardSlot>();
        this.selectedCardIds = new Set<number>();
        this.relocateData = null;
        this.relocateFrames = 0;
    }

    /**
     * 设置选中的牌ID列表
     * @param cardIds 要选中的牌ID数组
     */
    public setSelectedCardIds(cardIds: number[]): void {
        if (!cardIds) return;
        let newSet: Set<number> = new Set();
        for (let i: number = 0; i < cardIds.length; i++) {
            let cardId: number = cardIds[i];
            newSet.add(cardId);
            if (!this.selectedCardIds.has(cardId)) {
                let slot: PokerCardSlot = this.cardSlotMap.get(cardId);
                if (slot) slot.setSelected(true);
            }
        }
        for (let cardId of this.selectedCardIds) {
            if (!newSet.has(cardId)) {
                let slot: PokerCardSlot = this.cardSlotMap.get(cardId);
                if (slot) slot.setSelected(false);
            }
        }
        this.selectedCardIds = newSet;
    }

    /**
     * 取消所有选中
     */
    public unselectAll(): void {
        for (let cardId of this.selectedCardIds) {
            let slot: PokerCardSlot = this.cardSlotMap.get(cardId);
            if (slot) slot.setSelected(false);
        }
        this.selectedCardIds = new Set<number>();
    }

    /**
     * 获取当前选中的牌ID数组
     * @returns 选中的牌ID数组
     */
    public getSelectedCardIds(): number[] {
        let result: number[] = [];
        for (let cardId of this.selectedCardIds) {
            result.push(cardId);
        }
        return result;
    }

    /**
     * 点击一张牌
     */
    public onCardClick(cardId: number): void {
        if (this.selectedCardIds.has(cardId)) {
            this.selectedCardIds.delete(cardId);
            let slot: PokerCardSlot = this.cardSlotMap.get(cardId);
            if (slot) slot.setSelected(false);
        } else {
            this.selectedCardIds.add(cardId);
            let slot: PokerCardSlot = this.cardSlotMap.get(cardId);
            if (slot) slot.setSelected(true);
        }
    }

    /**
     * 获取手牌数量
     */
    public getCardCount(): number {
        return this.cardSlots.length;
    }

    /**
     * 重新定位所有牌槽
     */
    private relocateCards(): void {
        let count: number = this.cardSlots.length;
        if (count === 0) return;
        let totalWidth: number = (count - 1) * PokerCardLayout.SPACING;
        let startX: number = -totalWidth * 0.5;
        for (let i: number = 0; i < count; i++) {
            let posX: number = startX + i * PokerCardLayout.SPACING;
            this.cardSlots[i].node.position = new Vec3(posX, 0, 0);
            this.cardSlots[i].setOriginalPosY(0);
            // 如果是选中状态，保持上移
            if (this.selectedCardIds.has(this.cardSlots[i].getCardId())) {
                this.cardSlots[i].node.position = new Vec3(posX, PokerCardSlot.SELECT_OFFSET_Y, 0);
            }
        }
    }
}
