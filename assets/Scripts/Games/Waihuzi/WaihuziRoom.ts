/**
 * 益阳歪胡子 (Yiyang Waihuzi / Run Hu Zi) - P2 优先级
 *
 * 益阳歪胡子规则特点（湖南地方字牌）：
 * - 2人对战，每人起手20张牌，共80张牌
 * - 牌组：大壹~大拾(红)、小一~小十(黑)，每种4张 = 80张
 * - 操作：偎、碰、提、跑、吃、胡
 * - 吃牌组合：一二三、二七十、一二三四五六七八九十(顺子)
 * - 特殊：大贰(红贰)是关键牌
 * - 跑胡子计分：根据组合类型(偎/提/碰/跑/胡)分别计分
 * - "歪胡子"名称来源：当地特色称谓
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label } from 'cc';
import { ZipaiRoomBase, ZipaiTile, ZipaiRank, ZipaiSuit, ZipaiAction, ZipaiAvailableActions, MeldType, ZipaiMeld, ZipaiEventCallbacks } from '../GameCommon/ZipaiRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../GameCommon/GameTypes';

const { ccclass, property } = _decorator;

// ==================== 类型定义 ====================

/** 歪胡子计分单位 */
export enum WaihuScoreUnit {
    Wei = 1,       // 偎: 1分
    Peng = 1,      // 碰: 1分
    Ti = 3,        // 提: 3分(等于偎+碰+偎)
    Pao = 6,       // 跑: 6分(等于提+偎)
    Chi = 0,       // 吃: 0分(不计分，仅凑牌型)
    Hu = 'base',   // 胡: 所有组合总分之和 + 特殊加成
}

/** 歪胡子和牌类型 */
export enum WaihuWinType {
    ZiMo = 'zimo',           // 自摸
    DianHu = 'dianhu',       // 点胡(别人打的)
    TianHu = 'tianhu',       // 天胡(起手即胡)
    DiHu = 'dihu',           // 地胡
    HongHu = 'honghu',       // 红胡(全红色牌胡)
    WuHu = 'wuhu',           // 乌胡(全黑色牌胡)
}

/** 歪胡子结算数据 */
export interface WaihuRoundSettlement extends RoundSettlementData {
    winType: WaihuWinType;
    meldScores: MeldType[];  // 所有组合及其分值
    totalScore: number;      // 总得分
    specialBonus: string[];  // 特殊加成描述
}

@ccclass('WaihuziRoom')
export class WaihuziRoom extends ZipaiRoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Label })
    public scoreLabel: Label = null;           // 分数显示

    @property({ type: Node })
    protected meldScoreArea: Node = null;      // 组合计分展示区

    // ==================== 内部状态 ====================

    protected myTotalScore: number = 0;

    /** 当前局组合计分明细 */
    protected meldScoreDetails: Array<{ meld: MeldType; score: number }> = [];

    // ==================== 初始化 ====================

    start(): void {
        super.start();
        this.gameId = 'yiyangwaihuzi_zipai';
    }

    protected getSeatCount(): number {
        return 2; // 歪胡子是2人游戏
    }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        console.log('[WaihuRoom] Initialized');
    }

    // ==================== 组合计分 ====================

    /**
     * 记录一个组合并计分
     */
    public recordMeldScore(meld: MeldType): void {
        let score = 0;
        switch (meld) {
            case MeldType.Wei:
                score = WaiScoreUnit.Wei;
                break;
            case MeldType.Peng:
                score = WaiScoreUnit.Peng;
                break;
            case MeldType.Ti:
                score = WaiScoreUnit.Ti;
                break;
            case MeldType.Pao:
                score = WaiScoreUnit.Pao;
                break;
            case MeldType.Chi:
                score = WaiScoreUnit.Chi;
                break;
        }
        this.meldScoreDetails.push({ meld, score });
        console.log(`[WaihuRoom] Meld recorded: ${meld} = ${score}分`);

        // 更新UI
        this.renderMeldScoreDetail(meld, score);
    }

    /**
     * 渲染组合计分明细
     */
    protected renderMeldScoreDetail(meld: MeldType, score: number): void {
        if (!this.meldScoreArea) return;
        // 子类可实现具体的计分条目UI
        console.log(`[WaihuRoom] Score detail: ${meld} → ${score}分`);
    }

    // ==================== 结算 ====================

    /**
     * 显示单局结算
     */
    public showRoundSettlement(data: WaihuRoundSettlement): void {
        console.log(`[WaihuRoom] Round settlement: type=${data.winType} score=${data.totalScore}` +
            ` bonus=[${data.specialBonus.join(',')}]`);

        // 更新自己的分数
        const myResult = data.players.find(() => true);
        if (myResult) {
            this.updateScore(myResult.score);
        }

        this.handleRoundSettlement(data);
    }

    protected updateScore(delta: number): void {
        this.myTotalScore += delta;
        if (this.scoreLabel) {
            this.scoreLabel.string = String(this.myTotalScore);
        }
    }

    public showFinalSettlement(data: FinalSettlementData): void {
        this.handleFinalSettlement(data);
    }

    // ==================== 大贰特殊处理 ====================

    /**
     * 检查是否为大贰牌(关键牌)
     */
    static isDaEr(tile: ZipaiTile): boolean {
        return tile.rank === ZipaiRank.DaEr && tile.suit === ZipaiSuit.Red;
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        this.meldScoreDetails = [];
    }
}
