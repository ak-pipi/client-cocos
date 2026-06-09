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

import { _decorator, Node, Label, Color } from 'cc';
import { MahjongRoomBase, MahjongTile } from '../../GameCommon/MahjongRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData } from '../../GameCommon/GameTypes';

const { ccclass } = _decorator;

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
    // ==================== 内部状态 ====================

    protected hzHudRoot: Node = null;
    protected hongzhongIndicator: Node = null;
    protected hzCountLabel: Label = null;
    protected scoreLabel: Label = null;
    protected hzRuleLabel: Label = null;
    protected myHongzhongs: MahjongTile[] = [];
    protected myScore: number = 0;
    protected hongzhongIsJoker: boolean = true;

    // ==================== 消息前缀 ====================

    protected get mjMsgPrefix(): string { return "MsgHongzhongMahjong"; }

    // ==================== 初始化 ====================

    start(): void {
        super.start();
        this.gameId = 'hongzhong_mahjong';
        this.buildHongzhongHud();
        this.refreshHongzhongHud();
    }

    protected getSeatCount(): number { return 4; }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        this.hongzhongIsJoker = roomInfo.ruleConfig?.hongzhongAsJoker !== false;
        this.updateHudInfo();
        console.log(`[HongzhongRoom] Init, joker mode: ${this.hongzhongIsJoker}`);
    }

    // ==================== 红中管理 ====================

    static isHongzhong(tile: MahjongTile): boolean {
        return !!tile?.tile && tile.tile.pattern >= 4 && tile.tile.number === 5;
    }

    protected countHongzhongs(): number {
        return this.myHandTiles.filter(t => HongzhongMahjongRoom.isHongzhong(t)).length;
    }

    protected updateHzCountDisplay(): void {
        const count = this.countHongzhongs();
        if (this.hzCountLabel) this.hzCountLabel.string = `红中: ${count}`;
        if (this.hongzhongIndicator) this.hongzhongIndicator.active = count > 0;
        if (this.scoreLabel) this.scoreLabel.string = `本局积分 ${this.myScore >= 0 ? '+' : ''}${this.myScore}`;
        if (this.hongzhongIndicator) {
            this.paintRect(this.hongzhongIndicator, 112, 44, count > 0 ? new Color(149, 36, 42, 220) : new Color(48, 62, 74, 220), new Color(255, 214, 168, 255), 14);
        }
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
        if (this.scoreLabel) this.scoreLabel.string = `本局积分 ${this.myScore >= 0 ? '+' : ''}${this.myScore}`;
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

    protected getRuleHintText(): string {
        return this.hongzhongIsJoker ? '红中麻将 · 红中癞子 · 红中不可吃' : '红中麻将 · 红中常规牌';
    }

    protected buildHongzhongHud(): void {
        if (this.hzHudRoot) return;
        this.hzHudRoot = this.createUIChild(this.node, 'HongzhongHud', 330, 154, 560, 356, 120);
        this.paintRect(this.hzHudRoot, 330, 154, new Color(36, 27, 30, 212), new Color(255, 198, 146, 255), 18);

        const title = this.createUIChild(this.hzHudRoot, 'Title', 260, 30, 0, 50, 1);
        const titleLabel = title.addComponent(Label);
        titleLabel.string = '红中麻将';
        titleLabel.fontSize = 26;
        titleLabel.lineHeight = 30;
        titleLabel.horizontalAlign = 1;
        titleLabel.color = new Color(255, 232, 205, 255);

        const scoreNode = this.createUIChild(this.hzHudRoot, 'Score', 260, 26, 0, 14, 1);
        this.scoreLabel = scoreNode.addComponent(Label);
        this.scoreLabel.fontSize = 22;
        this.scoreLabel.lineHeight = 26;
        this.scoreLabel.horizontalAlign = 1;
        this.scoreLabel.color = new Color(255, 255, 255, 255);

        const ruleNode = this.createUIChild(this.hzHudRoot, 'Rule', 280, 24, 0, -16, 1);
        this.hzRuleLabel = ruleNode.addComponent(Label);
        this.hzRuleLabel.fontSize = 18;
        this.hzRuleLabel.lineHeight = 22;
        this.hzRuleLabel.horizontalAlign = 1;
        this.hzRuleLabel.color = new Color(255, 220, 182, 255);

        this.hongzhongIndicator = this.createUIChild(this.hzHudRoot, 'HzIndicator', 112, 44, 0, -52, 1);
        this.paintRect(this.hongzhongIndicator, 112, 44, new Color(149, 36, 42, 220), new Color(255, 214, 168, 255), 14);
        this.hzCountLabel = this.hongzhongIndicator.addComponent(Label);
        this.hzCountLabel.fontSize = 22;
        this.hzCountLabel.lineHeight = 24;
        this.hzCountLabel.horizontalAlign = 1;
        this.hzCountLabel.verticalAlign = 1;
        this.hzCountLabel.color = new Color(255, 245, 224, 255);
    }

    protected refreshHongzhongHud(): void {
        if (this.hzRuleLabel) {
            this.hzRuleLabel.string = this.hongzhongIsJoker ? '红中作为癞子' : '红中为常规牌';
        }
        this.updateHzCountDisplay();
    }
}
