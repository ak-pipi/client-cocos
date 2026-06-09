/**
 * 长沙麻将 (ChangshaMahjongRoom) - v2 完整版
 *
 * 长沙沙麻将规则：
 * - 4人麻将，可以吃碰杠胡
 * - "二五八"做将（必须258做将牌）
 * - 番型：平胡/自摸/将将胡/七小对/碰碰胡/豪华七对/清一色/混一色
 * - 扎鸟玩法（最后一张牌额外计分）
 *
 * Author: AI Assistant
 */

import { _decorator, Node, Label, Color } from 'cc';
import { MahjongRoomBase, MahjongTile } from '../../GameCommon/MahjongRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../../GameCommon/GameTypes';

const { ccclass } = _decorator;

// ==================== 类型定义 ====================

export enum ChangshaFanType {
    PingHu = 'pinghu', ZiMo = 'zimo', JiangJiangHu = 'jiangjiang',
    QiXiaoDui = 'qixiaodui', PengPengHu = 'pengpeng',
    HaoHua = 'haohua', QingYise = 'qingyise',
    HunYise = 'hunyise', ZhaNiao = 'zhaniao',
}

export interface ZhaNiaoResult {
    niaoTiles: MahjongTile[];
    hitCount: number;
    extraScore: number;
}

export interface ChangshaRoundSettlement extends RoundSettlementData {
    fanTypes: ChangshaFanType[];
    zhaNiao?: ZhaNiaoResult;
    totalScore: number;
    jiangRequired: boolean;
}

@ccclass('ChangshaMahjongRoom')
export class ChangshaMahjongRoom extends MahjongRoomBase {
    // ==================== 内部状态 ====================

    protected specialHudRoot: Node = null;
    protected niaoDisplayArea: Node = null;
    protected scoreLabel: Label = null;
    protected jiangRuleLabel: Label = null;
    protected zhaNiaoLabel: Label = null;
    protected myScore: number = 0;
    protected requireJiang258: boolean = true;

    static readonly JIANG_VALUES = [2, 5, 8];

    // ==================== 消息前缀 ====================

    protected get mjMsgPrefix(): string { return "MsgChangshaMahjong"; }

    // ==================== 初始化 ====================

    start(): void {
        super.start();
        this.gameId = 'changsha_mahjong';
        this.buildChangshaHud();
        this.refreshChangshaHud();
    }

    protected getSeatCount(): number { return 4; }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        this.requireJiang258 = roomInfo.ruleConfig?.requireJiang258 !== false;
        this.updateHudInfo();
    }

    // ==================== 工具方法 ====================

    static isJiangValue(value: number): boolean {
        return ChangshaMahjongRoom.JIANG_VALUES.indexOf(value) !== -1;
    }

    protected getRuleHintText(): string {
        return this.requireJiang258 ? '长沙麻将 · 258将 · 扎鸟' : '长沙麻将 · 扎鸟玩法';
    }

    // ==================== 扎鸟系统 ====================

    public showRoundSettlement(data: ChangshaRoundSettlement): void {
        console.log(`[ChangshaRoom] Round: fans=${data.fanTypes.join(',')} score=${data.totalScore}`);

        if (data.zhaNiao) this.renderZhaNiao(data.zhaNiao);

        const myResult = data.players.find(() => true);
        if (myResult) this.updateScore(myResult.score);

        super.handleRoundSettlement(data);
    }

    protected renderZhaNiao(niao: ZhaNiaoResult): void {
        if (!this.niaoDisplayArea) return;
        this.niaoDisplayArea.removeAllChildren();
        if (this.zhaNiaoLabel) {
            this.zhaNiaoLabel.string = `扎鸟 ${niao.hitCount} 中  加分 ${niao.extraScore >= 0 ? '+' : ''}${niao.extraScore}`;
        }
        for (const tile of niao.niaoTiles) {
            const node = this.createTileNodeForSeat(tile, 3, false);
            node.parent = this.niaoDisplayArea;
        }
        this.playMahjongActionEffect(0, 'zimo', '扎鸟');
        console.log(`[ChangshaRoom] Zha niao: ${niao.hitCount}/${niao.niaoTiles.length}`);
    }

    protected updateScore(delta: number): void {
        this.myScore += delta;
        if (this.scoreLabel) this.scoreLabel.string = `本局积分 ${this.myScore >= 0 ? '+' : ''}${this.myScore}`;
    }

    public showFinalSettlement(data: FinalSettlementData): void {
        super.handleFinalSettlement(data);
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        if (this.niaoDisplayArea) this.niaoDisplayArea.removeAllChildren();
        if (this.zhaNiaoLabel) this.zhaNiaoLabel.string = '扎鸟未结算';
        this.refreshChangshaHud();
    }

    protected buildChangshaHud(): void {
        if (this.specialHudRoot) return;
        this.specialHudRoot = this.createUIChild(this.node, 'ChangshaHud', 360, 164, -560, 356, 120);
        this.paintRect(this.specialHudRoot, 360, 164, new Color(27, 35, 49, 210), new Color(232, 194, 112, 255), 18);

        const title = this.createUIChild(this.specialHudRoot, 'Title', 280, 30, 0, 52, 1);
        const titleLabel = title.addComponent(Label);
        titleLabel.string = '长沙麻将';
        titleLabel.fontSize = 26;
        titleLabel.lineHeight = 30;
        titleLabel.horizontalAlign = 1;
        titleLabel.color = new Color(255, 235, 188, 255);

        const scoreNode = this.createUIChild(this.specialHudRoot, 'Score', 300, 28, 0, 16, 1);
        this.scoreLabel = scoreNode.addComponent(Label);
        this.scoreLabel.fontSize = 22;
        this.scoreLabel.lineHeight = 26;
        this.scoreLabel.horizontalAlign = 1;
        this.scoreLabel.color = new Color(255, 255, 255, 255);

        const jiangNode = this.createUIChild(this.specialHudRoot, 'JiangRule', 300, 26, 0, -18, 1);
        this.jiangRuleLabel = jiangNode.addComponent(Label);
        this.jiangRuleLabel.fontSize = 20;
        this.jiangRuleLabel.lineHeight = 24;
        this.jiangRuleLabel.horizontalAlign = 1;
        this.jiangRuleLabel.color = new Color(255, 220, 146, 255);

        const zhaNode = this.createUIChild(this.specialHudRoot, 'ZhaNiaoLabel', 300, 24, 0, -48, 1);
        this.zhaNiaoLabel = zhaNode.addComponent(Label);
        this.zhaNiaoLabel.fontSize = 18;
        this.zhaNiaoLabel.lineHeight = 22;
        this.zhaNiaoLabel.horizontalAlign = 1;
        this.zhaNiaoLabel.color = new Color(185, 226, 255, 255);

        this.niaoDisplayArea = this.createUIChild(this.node, 'ChangshaNiaoArea', 330, 70, 524, 364, 120);
        this.paintRect(this.niaoDisplayArea, 330, 70, new Color(27, 35, 49, 196), new Color(117, 184, 248, 255), 16);
    }

    protected refreshChangshaHud(): void {
        if (this.scoreLabel) {
            this.scoreLabel.string = `本局积分 ${this.myScore >= 0 ? '+' : ''}${this.myScore}`;
        }
        if (this.jiangRuleLabel) {
            this.jiangRuleLabel.string = this.requireJiang258 ? '将牌要求：2/5/8' : '将牌要求：不限';
        }
        if (this.zhaNiaoLabel) {
            this.zhaNiaoLabel.string = '扎鸟未结算';
        }
    }
}
