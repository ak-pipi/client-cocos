/**
 * 长沙麻将 (Changsha Mahjong) - P1 优先级
 *
 * 长沙麻将规则特点：
 * - 4人麻将
 * - 可以吃碰杠胡
 * - "二五八"做将(必须258做将牌)
 * - 支持碰碰胡、七小对、将将胡等特殊牌型
 * - 有"扎鸟"玩法（最后一张牌额外计分）
 * - 15张手牌起手
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label } from 'cc';
import { MahjongRoomBase, MahjongTile, AvailableActions, MahjongEventCallbacks } from '../../GameCommon/MahjongRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../../GameCommon/GameTypes';

const { ccclass, property } = _decorator;

// ==================== 类型定义 ====================

/** 长沙麻将番型 */
export enum ChangshaFanType {
    PingHu = 'pinghu',           // 平胡
    ZiMo = 'zimo',               // 自摸
    JiangJiangHu = 'jiangjiang', // 将将胡(全是258)
    QiXiaoDui = 'qixiaodui',     // 七小对
    PengPengHu = 'pengpeng',     // 碰碰胡
    HaoHua = 'haohua',           // 豪华七对(有四张一样的)
    QingYise = 'qingyise',       // 清一色
    HunYise = 'hunyise',         // 混一色
    ZhaNiao = 'zhaniao',          // 扎鸟(中鸟加分)
}

/** 扎鸟结果 */
export interface ZhaNiaoResult {
    niaoTiles: MahjongTile[];     // 鸟牌列表
    hitCount: number;             // 中了几只
    extraScore: number;           // 额外得分
}

/** 长沙麻将结算 */
export interface ChangshaRoundSettlement extends RoundSettlementData {
    fanTypes: ChangshaFanType[];
    zhaNiao?: ZhaNiaoResult;
    totalScore: number;
    jiangRequired: boolean;       // 是否要求二五八做将
}

@ccclass('ChangshaMahjongRoom')
export class ChangshaMahjongRoom extends MahjongRoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected niaoDisplayArea: Node = null;    // 扎鸟展示区

    @property({ type: Label })
    public scoreLabel: Label = null;           // 分数

    // ==================== 内部状态 ====================

    protected myScore: number = 0;

    /** 是否需要二五八将 */
    protected requireJiang258: boolean = true;

    // ==================== 二五八常量 ====================

    static readonly JIANG_VALUES = [2, 5, 8];

    // ==================== 初始化 ====================

    start(): void {
        super.start();
        this.gameId = 'changsha_mahjong';
    }

    protected getSeatCount(): number { return 4; }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        this.requireJiang258 = roomInfo.ruleConfig?.requireJiang258 !== false;
    }

    // ==================== 工具方法 ====================

    /** 检查是否为二五八将值 */
    static isJiangValue(value: number): boolean {
        return ChangshaMahjongRoom.JIANG_VALUES.includes(value);
    }

    // ==================== 结算与扎鸟 ====================

    public showRoundSettlement(data: ChangshaRoundSettlement): void {
        console.log(`[ChangshaRoom] Round settlement: fans=${data.fanTypes.join(',')} score=${data.totalScore}`);

        // 展示扎鸟结果
        if (data.zhaNiao) {
            this.renderZhaNiao(data.zhaNiao);
        }

        // 更新分数
        const myResult = data.players.find(() => true); // 实际应匹配自己
        if (myResult) {
            this.updateScore(myResult.score);
        }

        this.handleRoundSettlement(data);
    }

    /** 渲染扎鸟展示 */
    protected renderZhaNiao(niao: ZhaNiaoResult): void {
        if (!this.niaoDisplayArea) return;
        this.niaoDisplayArea.removeAllChildren();
        for (const tile of niao.niaoTiles) {
            const node = this.createTileNode(tile, false);
            if (this.niaoDisplayArea) {
                node.parent = this.niaoDisplayArea;
            }
        }
        console.log(`[ChangshaRoom] Zha niao: ${nioa.hitCount}/${nioa.niaoTiles.length} birds`);
    }

    protected updateScore(delta: number): void {
        this.myScore += delta;
        if (this.scoreLabel) {
            this.scoreLabel.string = String(this.myScore);
        }
    }

    public showFinalSettlement(data: FinalSettlementData): void {
        this.handleFinalSettlement(data);
    }

    protected resetRoundState(): void {
        super.resetRoundState();
        if (this.niaoDisplayArea) {
            this.niaoDisplayArea.removeAllChildren();
        }
    }
}
