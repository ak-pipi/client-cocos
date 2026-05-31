import { _decorator, Component, Node, Vec3, Sprite, SpriteFrame, Prefab, instantiate } from 'cc';
import { MahjongTileSlot } from './MahjongTileSlot';
const { ccclass, property } = _decorator;

/**
 * 麻将手牌布局类
 * 牌从左到右排列在一行中
 */
@ccclass('MahjongTileLayout')
export class MahjongTileLayout extends Component {

    private static readonly SPACING: number = 30;

    @property({ type: Prefab })
    private prefabTileSlot: Prefab = null;

    @property({ type: Node })
    private tileZone: Node = null;

    // 牌槽数组，从左到右排列
    private tileSlots: MahjongTileSlot[] = [];

    // 牌ID到牌槽的映射
    private tileSlotMap: Map<number, MahjongTileSlot> = new Map();

    // 当前选中的牌ID集合
    private selectedTileIds: Set<number> = new Set();

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
        this.relocateTiles();
        this.relocateData = null;
    }

    /**
     * 设置手牌
     * @param tiles 服务端牌数据数组，格式: [{id, tile: {pattern, number}}, ...]
     */
    public setHandTiles(tiles: any[]): void {
        this.clear();
        if (!tiles || tiles.length === 0) return;
        if (!this.tileZone) return;
        if (!this.prefabTileSlot) return;

        for (let i: number = 0; i < tiles.length; i++) {
            let slotNode: Node = instantiate(this.prefabTileSlot);
            if (!slotNode) continue;
            slotNode.parent = this.tileZone;
            let idx: number = i + 1;
            if (idx < 10) slotNode.name = "MahjongTile0" + idx.toString();
            else slotNode.name = "MahjongTile" + idx.toString();

            let slot: MahjongTileSlot = slotNode.getComponent(MahjongTileSlot);
            if (!slot) continue;
            slot.setTile(tiles[i]);
            this.tileSlots.push(slot);
            this.tileSlotMap.set(tiles[i].id, slot);
        }

        // 延迟一帧后重新定位
        this.relocateData = {};
    }

    /**
     * 删除指定ID的牌
     * @param tileIds 要删除的牌ID数组
     */
    public removeTiles(tileIds: number[]): void {
        if (!tileIds || tileIds.length === 0) return;
        let needRelocate: boolean = false;
        for (let i: number = 0; i < tileIds.length; i++) {
            let tileId: number = tileIds[i];
            let slot: MahjongTileSlot = this.tileSlotMap.get(tileId);
            if (!slot) continue;
            // 从数组中移除
            let idx: number = this.tileSlots.indexOf(slot);
            if (idx !== -1) {
                this.tileSlots.splice(idx, 1);
            }
            slot.node.destroy();
            this.tileSlotMap.delete(tileId);
            this.selectedTileIds.delete(tileId);
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
        for (let i: number = 0; i < this.tileSlots.length; i++) {
            this.tileSlots[i].node.destroy();
        }
        this.tileSlots = [];
        this.tileSlotMap = new Map<number, MahjongTileSlot>();
        this.selectedTileIds = new Set<number>();
        this.relocateData = null;
        this.relocateFrames = 0;
    }

    /**
     * 根据牌ID查找牌槽
     * @param tileId 牌ID
     * @returns 牌槽组件，未找到返回null
     */
    public getTileSlot(tileId: number): MahjongTileSlot {
        return this.tileSlotMap.get(tileId);
    }

    /**
     * 设置选中的牌ID列表
     * @param tileIds 要选中的牌ID数组
     */
    public setSelectedTileIds(tileIds: number[]): void {
        if (!tileIds) return;
        let newSet: Set<number> = new Set();
        for (let i: number = 0; i < tileIds.length; i++) {
            let tileId: number = tileIds[i];
            newSet.add(tileId);
            if (!this.selectedTileIds.has(tileId)) {
                let slot: MahjongTileSlot = this.tileSlotMap.get(tileId);
                if (slot) slot.setSelected(true);
            }
        }
        for (let tileId of this.selectedTileIds) {
            if (!newSet.has(tileId)) {
                let slot: MahjongTileSlot = this.tileSlotMap.get(tileId);
                if (slot) slot.setSelected(false);
            }
        }
        this.selectedTileIds = newSet;
    }

    /**
     * 取消所有选中
     */
    public unselectAll(): void {
        for (let tileId of this.selectedTileIds) {
            let slot: MahjongTileSlot = this.tileSlotMap.get(tileId);
            if (slot) slot.setSelected(false);
        }
        this.selectedTileIds = new Set<number>();
    }

    /**
     * 获取当前选中的牌ID数组
     * @returns 选中的牌ID数组
     */
    public getSelectedTileIds(): number[] {
        let result: number[] = [];
        for (let tileId of this.selectedTileIds) {
            result.push(tileId);
        }
        return result;
    }

    /**
     * 点击一张牌
     */
    public onTileClick(tileId: number): void {
        if (this.selectedTileIds.has(tileId)) {
            this.selectedTileIds.delete(tileId);
            let slot: MahjongTileSlot = this.tileSlotMap.get(tileId);
            if (slot) slot.setSelected(false);
        } else {
            this.selectedTileIds.add(tileId);
            let slot: MahjongTileSlot = this.tileSlotMap.get(tileId);
            if (slot) slot.setSelected(true);
        }
    }

    /**
     * 获取手牌数量
     */
    public getTileCount(): number {
        return this.tileSlots.length;
    }

    /**
     * 重新定位所有牌槽
     */
    private relocateTiles(): void {
        let count: number = this.tileSlots.length;
        if (count === 0) return;
        let totalWidth: number = (count - 1) * MahjongTileLayout.SPACING;
        let startX: number = -totalWidth * 0.5;
        for (let i: number = 0; i < count; i++) {
            let posX: number = startX + i * MahjongTileLayout.SPACING;
            this.tileSlots[i].node.position = new Vec3(posX, 0, 0);
            this.tileSlots[i].setOriginalPosY(0);
            // 如果是选中状态，保持上移
            if (this.selectedTileIds.has(this.tileSlots[i].getTileId())) {
                this.tileSlots[i].node.position = new Vec3(posX, MahjongTileSlot.SELECT_OFFSET_Y, 0);
            }
        }
    }
}
