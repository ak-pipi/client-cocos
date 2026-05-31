import { _decorator, Component, Node, Vec3, Prefab, instantiate } from 'cc';
import { WaiHuZiCardSlot } from './WaiHuZiCardSlot';
const { ccclass, property } = _decorator;

/**
 * 歪胡子手牌布局类
 * 字牌从左到右排列，按大小字分类、面值降序排列
 * 大字在前，小字在后
 */
@ccclass('WaiHuZiCardLayout')
export class WaiHuZiCardLayout extends Component {

    private static readonly SPACING: number = 45;

    @property({ type: Prefab })
    private prefabCardSlot: Prefab = null;

    @property({ type: Node })
    private cardZone: Node = null;

    // 牌槽数组，从左到右排列（已排序）
    private cardSlots: WaiHuZiCardSlot[] = [];

    // 牌ID到牌槽的映射
    private cardSlotMap: Map<number, WaiHuZiCardSlot> = new Map();

    // 当前选中的牌ID
    private selectedCardId: number = -1;

    // 延迟重定位数据
    private relocateData: any = null;

    // 延迟帧计数
    private relocateFrames: number = 0;

    // 关联的Room
    private room: any = null;

    start() {}

    update(deltaTime: number) {
        this.updateRelocate(deltaTime);
    }

    /**
     * 设置关联的Room
     */
    public setRoom(room: any): void {
        this.room = room;
    }

    private updateRelocate(deltaTime: number): void {
        if (!this.relocateData) return;
        if (this.relocateFrames < 2) {
            this.relocateFrames = this.relocateFrames + 1;
            return;
        }
        this.relocateFrames = 0;
        this.relocateCards();
        this.relocateData = null;
    }

    /**
     * 比较两张字牌的排序（大字在前降序，小字在后降序）
     */
    private compareCards(a: number, b: number): number {
        let aBig: boolean = a >= 11;
        let bBig: boolean = b >= 11;
        if (aBig && !bBig) return -1;
        if (!aBig && bBig) return 1;
        // 同类型内按面值降序
        let aFace: number = WaiHuZiCardSlot.getFaceValue(a);
        let bFace: number = WaiHuZiCardSlot.getFaceValue(b);
        if (aFace > bFace) return -1;
        if (aFace < bFace) return 1;
        return 0;
    }

    /**
     * 设置手牌（整数ID数组）
     */
    public setCards(cardIds: number[]): void {
        this.clear();
        if (!cardIds || cardIds.length === 0) return;
        if (!this.cardZone) return;
        if (!this.prefabCardSlot) return;

        // 排序
        cardIds.sort((a: number, b: number) => this.compareCards(a, b));

        for (let i: number = 0; i < cardIds.length; i++) {
            let slotNode: Node = instantiate(this.prefabCardSlot);
            if (!slotNode) continue;
            slotNode.parent = this.cardZone;
            let idx: number = i + 1;
            if (idx < 10) slotNode.name = "WHZCard0" + idx.toString();
            else slotNode.name = "WHZCard" + idx.toString();

            let slot: WaiHuZiCardSlot = slotNode.getComponent(WaiHuZiCardSlot);
            if (!slot) continue;
            slot.setCard(cardIds[i]);
            this.cardSlots.push(slot);
            this.cardSlotMap.set(cardIds[i], slot);
        }

        this.relocateData = {};
    }

    /**
     * 删除指定ID的牌
     */
    public removeCards(cardIds: number[]): void {
        if (!cardIds || cardIds.length === 0) return;
        let needRelocate: boolean = false;
        for (let i: number = 0; i < cardIds.length; i++) {
            let cardId: number = cardIds[i];
            let slot: WaiHuZiCardSlot = this.cardSlotMap.get(cardId);
            if (!slot) continue;
            let idx: number = this.cardSlots.indexOf(slot);
            if (idx !== -1) {
                this.cardSlots.splice(idx, 1);
            }
            slot.node.destroy();
            this.cardSlotMap.delete(cardId);
            if (this.selectedCardId === cardId) {
                this.selectedCardId = -1;
            }
            needRelocate = true;
        }
        if (needRelocate) {
            this.relocateData = {};
        }
    }

    /**
     * 添加一张摸到的牌
     */
    public addCard(cardId: number): void {
        if (cardId < 0) return;
        if (!this.cardZone) return;
        if (!this.prefabCardSlot) return;
        if (this.cardSlotMap.has(cardId)) return;

        // 找到插入位置（保持排序）
        let insertIdx: number = this.cardSlots.length;
        for (let i: number = 0; i < this.cardSlots.length; i++) {
            if (this.compareCards(cardId, this.cardSlots[i].getCardId()) < 0) {
                insertIdx = i;
                break;
            }
        }

        let slotNode: Node = instantiate(this.prefabCardSlot);
        if (!slotNode) return;
        slotNode.parent = this.cardZone;
        let idx: number = this.cardSlots.length + 1;
        if (idx < 10) slotNode.name = "WHZCard0" + idx.toString();
        else slotNode.name = "WHZCard" + idx.toString();

        let slot: WaiHuZiCardSlot = slotNode.getComponent(WaiHuZiCardSlot);
        if (!slot) return;
        slot.setCard(cardId);
        this.cardSlots.splice(insertIdx, 0, slot);
        this.cardSlotMap.set(cardId, slot);

        this.relocateData = {};
    }

    /**
     * 清空所有手牌
     */
    public clear(): void {
        for (let i: number = 0; i < this.cardSlots.length; i++) {
            this.cardSlots[i].node.destroy();
        }
        this.cardSlots = [];
        this.cardSlotMap = new Map<number, WaiHuZiCardSlot>();
        this.selectedCardId = -1;
        this.relocateData = null;
        this.relocateFrames = 0;
    }

    /**
     * 点击一张牌（单选模式，同时只能选中一张用于出牌）
     */
    public onCardClick(cardId: number): void {
        if (this.selectedCardId === cardId) {
            // 取消选中
            let slot: WaiHuZiCardSlot = this.cardSlotMap.get(cardId);
            if (slot) slot.setSelected(false);
            this.selectedCardId = -1;
        } else {
            // 取消之前选中的
            if (this.selectedCardId >= 0) {
                let oldSlot: WaiHuZiCardSlot = this.cardSlotMap.get(this.selectedCardId);
                if (oldSlot) oldSlot.setSelected(false);
            }
            // 选中新的
            this.selectedCardId = cardId;
            let slot: WaiHuZiCardSlot = this.cardSlotMap.get(cardId);
            if (slot) slot.setSelected(true);
        }
    }

    /**
     * 取消所有选中
     */
    public unselectAll(): void {
        if (this.selectedCardId >= 0) {
            let slot: WaiHuZiCardSlot = this.cardSlotMap.get(this.selectedCardId);
            if (slot) slot.setSelected(false);
        }
        this.selectedCardId = -1;
    }

    /**
     * 获取当前选中的牌ID（单张，出牌用）
     */
    public getSelectedCardId(): number {
        return this.selectedCardId;
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
        let totalWidth: number = (count - 1) * WaiHuZiCardLayout.SPACING;
        let startX: number = -totalWidth * 0.5;
        for (let i: number = 0; i < count; i++) {
            let posX: number = startX + i * WaiHuZiCardLayout.SPACING;
            this.cardSlots[i].node.position = new Vec3(posX, 0, 0);
            this.cardSlots[i].setOriginalPosY(0);
            if (this.selectedCardId === this.cardSlots[i].getCardId()) {
                this.cardSlots[i].node.position = new Vec3(posX, WaiHuZiCardSlot.SELECT_OFFSET_Y, 0);
            }
        }
    }
}
