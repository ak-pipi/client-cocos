/**
 * 红中麻将 (Hongzhong Mahjong / 长沙红中) - P0 优先级
 *
 * 红中麻将规则特点：
 * - 4人麻将，84张牌（万条筒各1-9 + 红中x4）
 * - 红中可当任意牌（赖子/百搭）
 * - 可碰、可杠（红中不能吃）
 * - 必须包含红中才能胡牌（部分规则变体）
 * - 基础番型：红中数量决定基础分
 * - 特殊：红中炮（打出的红中被胡）
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, Prefab, instantiate, Vec3, Color } from 'cc';
import { MahjongRoomBase, MahjongTile, AvailableActions, DiscardResult, MahjongEventCallbacks } from '../GameCommon/MahjongRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../GameCommon/GameTypes';

const { ccclass, property } = _decorator;

// ==================== 红中麻将特有类型 ====================

/** 红中麻将番型 */
export enum HongzhongFanType {
    PingHu = 'pinghu',           // 平胡
    ZiMo = 'zimo',               // 自摸
    HongZhongPao = 'hzpao',      // 红中炮
    QuanQiRen = 'quanqiren',     // 全起人(起手胡)
    HaiDiLao = 'haidilao',       // 海底捞
    GangHua = 'ganghua',         // 杠后开花
    HunYiSe = 'hunyise',         // 混一色
}

/** 红中麻将结算 */
export interface HongzhongRoundSettlement extends RoundSettlementData {
    fanType: HongzhongFanType;
    hongzhongCount: number;      // 手中红中数(用于计分)
    totalScore: number;          // 本局得分
}

@ccclass('HongzhongMahjongRoom')
export class HongzhongMahjongRoom extends MahjongRoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected hongzhongIndicator: Node = null;   // 红中指示器(手中红中数)

    @property({ type: Label })
    protected hzCountLabel: Label = null;        // 红中数量标签

    @property({ type: Label })
    public scoreLabel: Label = null;             // 分数显示

    // ==================== 内部状态 ====================

    /** 手中的红中牌列表 */
    protected myHongzhongs: MahjongTile[] = [];

    /** 当前分数 */
    protected myScore: number = 0;

    /** 红中是否当赖子使用 */
    protected hongzhongIsJoker: boolean = true;

    // ==================== 常量 ====================

    /** 红中的 suit+value 标识 */
    static readonly HONGZHONG_VALUE = 10;
    static readonly HONGZHONG_SUIT = 3;

    // ==================== 初始化覆写 ====================

    start(): void {
        super.start();
        this.gameId = 'hongzhong_mahjong';
    }

    protected getSeatCount(): number {
        return 4;
    }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        this.hongzhongIsJoker = roomInfo.ruleConfig?.hongzhongAsJoker !== false;
        console.log(`[HongzhongRoom] Init, joker mode: ${this.hongzhongIsJoker}`);
    }

    // ==================== 红中管理 ====================

    /**
     * 检查是否为红中牌
     */
    static isHongzhong(tile: MahjongTile): boolean {
        return tile.suit === HongzhongMahjongRoom.HONGZHONG_SUIT &&
               tile.value === HongzhongMahjongRoom.HONGZHONG_VALUE;
    }

    /**
     * 统计手中的红中数量
     */
    protected countHongzhongs(): number {
        return this.myHandTiles.filter(t => HongzhongMahjongRoom.isHongzhong(t)).length;
    }

    /**
     * 更新红中数量显示
     */
    protected updateHzCountDisplay(): void {
        const count = this.countHongzhongs();
        if (this.hzCountLabel) {
            this.hzCountLabel.string = `红中: ${count}`;
        }
        if (this.hongzhongIndicator) {
            this.hongzhongIndicator.active = count > 0;
        }
    }

    // ==================== 发牌与手牌覆写 ====================

    public dealTiles(tiles: MahjongTile[]): void {
        super.dealTiles(tiles);
        this.myHongzhongs = tiles.filter(t => HongzhongMahjongRoom.isHongzhong(t));
        this.updateHzCountDisplay();
        console.log(`[HongzhongRoom] Dealt with ${this.myHongzhongs.length} hongzhongs`);
    }

    protected renderMyHand(): void {
        super.renderMyHand();
        // 红中牌可以特殊高亮显示
        // 子类可在渲染时给红中添加特殊效果
    }

    /**
     * 摸到红中时的特殊处理
     */
    public drawTile(tile: MahjongTile): void {
        super.drawTile(tile);
        if (HongzhongMahjongRoom.isHongzhong(tile)) {
            this.myHongzhongs.push(tile);
            this.updateHzCountDisplay();
        }
    }

    // ==================== 操作覆写 ====================

    /**
     * 红中麻将不支持"吃"
     */
    public doActionChi(_tiles?: MahjongTile[]): void {
        console.warn('[HongzhongRoom] Chi not supported in Hongzhong mahjong');
    }

    /**
     * 出牌时更新红中统计
     */
    public selectAndDiscard(tileIndex: number): void {
        const tile = this.myHandTiles[tileIndex];
        super.selectAndDiscard(tileIndex);

        // 如果打出的是红中，更新计数
        if (tile && HongzhongMahjongRoom.isHongzhong(tile)) {
            const idx = this.myHongzhongs.indexOf(tile);
            if (idx >= 0) this.myHongzhongs.splice(idx, 1);
            this.updateHzCountDisplay();
        }
    }

    // ==================== 分数管理 ====================

    /**
     * 更新分数
     */
    public updateScore(delta: number): void {
        this.myScore += delta;
        if (this.scoreLabel) {
            this.scoreLabel.string = String(this.myScore);
        }
    }

    /**
     * 显示红中麻将结算
     */
    public showRoundSettlement(data: HongzhongRoundSettlement): void {
        console.log(`[HongzhongRoom] Round settlement: type=${data.fanType} hz=${data.hongzhongCount} score=${data.totalScore}`);
        
        // 更新分数
        const myResult = data.players.find(p => /* 匹配自己 */ true);
        if (myResult) {
            this.updateScore(myResult.score);
        }

        this.handleRoundSettlement(data);
    }

    public showFinalSettlement(data: FinalSettlementData): void {
        console.log('[HongzhongRoom] Final settlement');
        this.handleFinalSettlement(data);
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        this.myHongzhongs = [];
        this.updateHzCountDisplay();
    }
}
