import { _decorator, Component, Sprite, SpriteFrame, Label, Color, Vec3, tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('MahjongTileSlot')
export class MahjongTileSlot extends Component {

    @property({ type: Sprite })
    public tileSprite: Sprite = null;

    @property({ type: Label })
    public labelNumber: Label = null;

    private tileId: number = -1;

    private pattern: number = 0;

    private number: number = 0;

    private isSelected: boolean = false;

    static readonly SELECT_OFFSET_Y: number = 20;

    private originalPosY: number = 0;

    start() {}

    update(deltaTime: number) {}

    /**
     * 设置麻将牌数据
     * @param tile 服务端牌数据，格式: {id: number, tile: {pattern: number, number: number}}
     */
    public setTile(tile: any): void {
        if (!tile) return;
        this.tileId = tile.id;
        if (tile.tile) {
            this.pattern = tile.tile.pattern;
            this.number = tile.tile.number;
        }
        if (this.labelNumber) {
            this.labelNumber.string = MahjongTileSlot.getTileName(this.pattern, this.number);
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
            targetY = this.originalPosY + MahjongTileSlot.SELECT_OFFSET_Y;
        }
        tween(this.node)
            .to(0.15, { position: new Vec3(this.node.position.x, targetY, 0) }, { easing: 'linear' })
            .start();
    }

    /**
     * 获取牌ID
     */
    public getTileId(): number {
        return this.tileId;
    }

    /**
     * 获取当前颜色
     */
    public getColor(): Color {
        if (this.tileSprite) return this.tileSprite.color.clone();
        return new Color(255, 255, 255, 255);
    }

    /**
     * 设置颜色
     * @param clr 目标颜色
     */
    public setColor(clr: Color): void {
        if (this.tileSprite) {
            this.tileSprite.color = clr;
        }
    }

    /**
     * 记录原始Y坐标（用于选中上移的基准）
     */
    public setOriginalPosY(y: number): void {
        this.originalPosY = y;
    }

    /**
     * 获取花色
     */
    public getPattern(): number {
        return this.pattern;
    }

    /**
     * 获取牌面数字
     */
    public getNumber(): number {
        return this.number;
    }

    /**
     * 获取麻将牌的显示名称
     * @param pattern 花色 (1=筒子, 2=条子, 3=万子, 4-7=风牌, 8=红中, 9=发财, 10=白板)
     * @param number 数字 (1-9)
     * @returns 牌面显示名称
     */
    public static getTileName(pattern: number, number: number): string {
        let prefix: string = "";
        switch (pattern) {
            case 1:
                prefix = number + "筒";
                break;
            case 2:
                prefix = number + "条";
                break;
            case 3:
                prefix = number + "万";
                break;
            case 4:
                prefix = "东";
                break;
            case 5:
                prefix = "南";
                break;
            case 6:
                prefix = "西";
                break;
            case 7:
                prefix = "北";
                break;
            case 8:
                prefix = "中";
                break;
            case 9:
                prefix = "发";
                break;
            case 10:
                prefix = "白板";
                break;
            default:
                prefix = "未知";
                break;
        }
        return prefix;
    }
}
