/**
 * 红中麻将 (HongzhongMahjongRoom) - v2 完整版
 *
 * 红中麻将规则：
 * - 4人麻将，84张牌（万条筒各1-9 + 红中x4）
 * - 红中可当任意牌（赖子/百搭）
 * - 可碰、可杠（红中不能吃）
 * - 番型：平胡/自摸/红中炮/全起人/海底捞/杠上开花/混一色
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label } from 'cc';
import { MahjongRoomBase, MahjongTile, AvailableActions } from '../../GameCommon/MahjongRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../../GameCommon/GameTypes';
import { NetworkManager } from '../../Manager/NetworkManager';

const { ccclass, property } = _decorator;

// ==================== 红中麻将特有类型 ====================

export enum HongzhongFanType {
    PingHu = 'pinghu', ZiMo = 'zimo', HongZhongPao = 'hzpao',
    QuanQiRen = 'quanqiren', HaiDiLao = 'haidilao',
    GangHua = 'ganghua', HunYiSe = 'hunyise',
}

export interface HongzhongRoundSettlement extends RoundSettlementData {
    fanType: HongzhongFanType;
    hongzhongCount: number;
    totalScore: number;
}

@ccclass('HongzhongMahjongRoom')
export class HongzhongMahjongRoom extends MahjongRoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected hongzhongIndicator: Node = null;

    @property({ type: Label })
    protected hzCountLabel: Label = null;

    @property({ type: Label })
    public scoreLabel: Label = null;

    // ==================== 内部状态 ====================

    protected myHongzhongs: MahjongTile[] = [];
    protected myScore: number = 0;
    protected hongzhongIsJoker: boolean = true;

    static readonly HONGZHONG_VALUE = 10;
    static readonly HONGZHONG_SUIT = 3;

    // ==================== 消息前缀 ====================

    protected get mjMsgPrefix(): string { return "MsgHongzhongMahjong"; }

    // ==================== 初始化 ====================

    start(): void {
        super.start();
        this.gameId = 'hongzhong_mahjong';
    }

    protected getSeatCount(): number { return 4; }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        this.hongzhongIsJoker = roomInfo.ruleConfig?.hongzhongAsJoker !== false;
        console.log(`[HongzhongRoom] Init, joker mode: ${this.hongzhongIsJoker}`);
    }

    // ==================== 红中管理 ====================

    static isHongzhong(tile: MahjongTile): boolean {
        return tile.suit === HongzhongMahjongRoom.HONGZHONG_SUIT &&
               tile.value === HongzhongMahjongRoom.HONGZHONG_VALUE;
    }

    protected countHongzhongs(): number {
        return this.myHandTiles.filter(t => HongzhongMahjongRoom.isHongzhong(t)).length;
    }

    protected updateHzCountDisplay(): void {
        const count = this.countHongzhongs();
        if (this.hzCountLabel) this.hzCountLabel.string = `红中: ${count}`;
        if (this.hongzhongIndicator) this.hongzhongIndicator.active = count > 0;
    }

    // ==================== 手牌管理覆写 ====================

    public dealTiles(tiles: MahjongTile[]): void {
        super.dealTiles(tiles);
        this.myHongzhongs = tiles.filter(t => HongzhongMahjongRoom.isHongzhong(t));
        this.updateHzCountDisplay();
        console.log(`[HongzhongRoom] Dealt with ${this.myHongzhongs.length} hongzhongs`);
    }

    public drawTile(tile: MahjongTile): void {
        super.drawTile(tile);
        if (HongzhongMahjongRoom.isHongzhong(tile)) {
            this.myHongzhongs.push(tile);
            this.updateHzCountDisplay();
        }
    }

    // ==================== 操作覆写 ====================

    /** 红中麻将不支持"吃" */
    public doActionChi(_tiles?: MahjongTile[]): void {
        console.warn('[HongzhongRoom] Chi not supported in Hongzhong mahjong');
    }

    public selectAndDiscard(tileIndex: number): void {
        const tile = this.myHandTiles[tileIndex];
        super.selectAndDiscard(tileIndex);

        if (tile && HongzhongMahjongRoom.isHongzhong(tile)) {
            const idx = this.myHongzhongs.indexOf(tile);
            if (idx >= 0) this.myHongzhongs.splice(idx, 1);
            this.updateHzCountDisplay();
        }
    }

    // ==================== 分数 ====================

    public updateScore(delta: number): void {
        this.myScore += delta;
        if (this.scoreLabel) this.scoreLabel.string = String(this.myScore);
    }

    public showRoundSettlement(data: HongzhongRoundSettlement): void {
        console.log(`[HongzhongRoom] Round: type=${data.fanType} hz=${data.hongzhongCount} score=${data.totalScore}`);
        const myResult = data.players.find(() => true);
        if (myResult) this.updateScore(myResult.score);
        super.handleRoundSettlement(data);
    }

    public showFinalSettlement(data: FinalSettlementData): void {
        console.log('[HongzhongRoom] Final settlement');
        super.handleFinalSettlement(data);
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        this.myHongzhongs = [];
        this.updateHzCountDisplay();
    }
}
