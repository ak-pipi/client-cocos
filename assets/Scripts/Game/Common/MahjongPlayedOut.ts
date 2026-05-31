import { _decorator, Component, Node, Label, instantiate, Vec3, Color } from 'cc';
const { ccclass, property } = _decorator;

/**
 * 麻将出牌展示区域
 * 四个方向（下/右/上/左）显示各玩家打出的牌
 */
@ccclass('MahjongPlayedOut')
export class MahjongPlayedOut extends Component {

    private static readonly TILE_SPACING: number = 25;

    @property({ type: [Node] })
    private cardZones: Node[] = [];

    // 各方向已显示的牌节点数组
    private bottomTiles: Node[] = [];

    private rightTiles: Node[] = [];

    private topTiles: Node[] = [];

    private leftTiles: Node[] = [];

    // 旗标节点（Pass、Hu等文字提示）
    private flagNodes: Node[] = [null, null, null, null];

    start() {}

    update(deltaTime: number) {}

    /**
     * 获取指定方向的牌数组
     */
    private getTileArray(clientSeat: number): Node[] {
        if (clientSeat === 0) return this.bottomTiles;
        else if (clientSeat === 1) return this.rightTiles;
        else if (clientSeat === 2) return this.topTiles;
        else if (clientSeat === 3) return this.leftTiles;
        return null;
    }

    /**
     * 设置指定方向的牌数组
     */
    private setTileArray(clientSeat: number, arr: Node[]): void {
        if (clientSeat === 0) this.bottomTiles = arr;
        else if (clientSeat === 1) this.rightTiles = arr;
        else if (clientSeat === 2) this.topTiles = arr;
        else if (clientSeat === 3) this.leftTiles = arr;
    }

    /**
     * 在指定方向显示打出的牌
     * @param clientSeat 客户端座位号 (0=下, 1=右, 2=上, 3=左)
     * @param tiles 打出的牌数据数组，格式: [{id, tile: {pattern, number}}, ...]
     */
    public playTiles(clientSeat: number, tiles: any[]): void {
        this.clearTiles(clientSeat);
        if (!tiles || tiles.length === 0) return;
        let cardZone: Node = this.cardZones[clientSeat];
        if (!cardZone) return;

        let arr: Node[] = [];
        let startX: number = this.getStartX(tiles.length);
        for (let i: number = 0; i < tiles.length; i++) {
            let tileNode: Node = instantiate(this.createTileNode(tiles[i]));
            if (!tileNode) continue;
            tileNode.parent = cardZone;
            let sn: number = i + 1;
            if (sn < 10) tileNode.name = "PlayedTile0" + sn.toString();
            else tileNode.name = "PlayedTile" + sn.toString();
            tileNode.position = new Vec3(startX, 0, 0);
            startX = startX + MahjongPlayedOut.TILE_SPACING;
            arr.push(tileNode);
        }
        this.setTileArray(clientSeat, arr);
    }

    /**
     * 显示旗标文字（Pass、Hu等）
     * @param clientSeat 客户端座位号
     * @param flag 旗标类型 (1=Pass/过, 2=Hu/胡, 3= Gang/杠, 4= Peng/碰, 5= Chi/吃)
     */
    public showFlag(clientSeat: number, flag: number): void {
        this.clearTiles(clientSeat);
        let cardZone: Node = this.cardZones[clientSeat];
        if (!cardZone) return;

        let flagText: string = "";
        if (flag === 1) flagText = "过";
        else if (flag === 2) flagText = "胡";
        else if (flag === 3) flagText = "杠";
        else if (flag === 4) flagText = "碰";
        else if (flag === 5) flagText = "吃";
        else return;

        let flagNode: Node = new Node("Flag" + flagText);
        flagNode.parent = cardZone;
        let label: Label = flagNode.addComponent(Label);
        if (label) {
            label.string = flagText;
            label.fontSize = 30;
            label.lineHeight = 30;
        }
        let arr: Node[] = [];
        arr.push(flagNode);
        this.setTileArray(clientSeat, arr);
        this.flagNodes[clientSeat] = flagNode;
    }

    /**
     * 清除指定方向的牌
     * @param clientSeat 客户端座位号
     */
    public clearTiles(clientSeat: number): void {
        let arr: Node[] = this.getTileArray(clientSeat);
        if (!arr) return;
        for (let i: number = 0; i < arr.length; i++) {
            arr[i].destroy();
        }
        this.setTileArray(clientSeat, null);
        this.flagNodes[clientSeat] = null;
    }

    /**
     * 清除所有方向的牌
     */
    public clear(): void {
        for (let i: number = 0; i < 4; i++) {
            this.clearTiles(i);
        }
    }

    /**
     * 创建一个出牌显示节点
     * 使用Label显示牌面名称
     */
    private createTileNode(tile: any): Node {
        let node: Node = new Node("MahjongPlayedTile");
        let label: Label = node.addComponent(Label);
        if (label && tile && tile.tile) {
            let pattern: number = tile.tile.pattern;
            let number: number = tile.tile.number;
            let name: string = this.getTileDisplayName(pattern, number);
            label.string = name;
            label.fontSize = 22;
            label.lineHeight = 22;
        }
        return node;
    }

    /**
     * 获取牌面显示名称
     */
    private getTileDisplayName(pattern: number, number: number): string {
        switch (pattern) {
            case 1: return number + "筒";
            case 2: return number + "条";
            case 3: return number + "万";
            case 4: return "东";
            case 5: return "南";
            case 6: return "西";
            case 7: return "北";
            case 8: return "中";
            case 9: return "发";
            case 10: return "白";
            default: return "?";
        }
    }

    /**
     * 计算起始X坐标，使牌居中显示
     */
    private getStartX(num: number): number {
        return (1 - num) * MahjongPlayedOut.TILE_SPACING * 0.5;
    }
}
