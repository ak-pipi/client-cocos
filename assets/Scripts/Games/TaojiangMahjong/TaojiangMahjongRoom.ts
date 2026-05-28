/**
 * 桃江麻将 (Taojiang Mahjong) - P0 优先级
 * 
 * 桃江麻将规则特点：
 * - 4人麻将，108张牌（无东南西北中发白/花）
 * - 可吃、可碰、可杠、可胡
 * - 支持自摸、放炮、杠上开花等番型
 * - 起手翻醒（翻一张牌作为"醒"牌，可胡该牌的上下相邻）
 * - 特殊牌型：碰碰胡、七对、清一色等
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, Prefab, instantiate } from 'cc';
import { MahjongRoomBase, MahjongTile, AvailableActions, DiscardResult, MahjongEventCallbacks } from '../../GameCommon/MahjongRoomBase';
import { RoomInfo, RoundSettlementData, FinalSettlementData, PlayerSettlementInfo } from '../../GameCommon/GameTypes';

const { ccclass, property } = _decorator;

// ==================== 桃江麻将特有类型 ====================

/** 桃江麻将番型 */
export enum TaojiangFanType {
    PingHu = 'pinghu',           // 平胡(1番)
    ZiMo = 'zimo',               // 自摸(+1番)
    DianPao = 'dianpao',         // 点炮
    GangShangKaiHua = 'gangkai', // 杠上开花
    Qidui = 'qidui',             // 七对(5番)
    PengPengHu = 'pengpeng',     // 碰碰胡(3番)
    QingYise = 'qingyise',       // 清一色(5番)
    HunYise = 'hunyise',         // 混一色(2番)
}

/** 醒牌信息 */
export interface XingTile {
    /** 翻开的牌 */
    tile: MahjongTile;
    /** 醒牌可胡的目标值列表 */
    targetValues: number[];
}

/** 桃江麻将结算扩展 */
export interface TaojiangRoundSettlement extends RoundSettlementData {
    fanType: TaojiangFanType;
    totalFans: number;
    isZimo: boolean;
    isGangKai: boolean;
    xingTile?: MahjongTile;
}

@ccclass('TaojiangMahjongRoom')
export class TaojiangMahjongRoom extends MahjongRoomBase {
    // ==================== UI 引用 ====================

    @property({ type: Node })
    protected xingTileDisplay: Node = null;     // 醒牌展示区

    @property({ type: Label })
    protected fanLabel: Label = null;           // 当前番数显示

    @property({ type: Node })
    protected tingHintPanel: Node = null;       // 听牌提示面板

    // ==================== 内部状态 ====================

    /** 当前局的醒牌 */
    protected currentXingTile: XingTile | null = null;

    /** 当前累计番数 */
    protected totalFans: number = 0;

    /** 是否已翻醒 */
    protected hasXingRevealed: boolean = false;

    // ==================== 初始化覆写 ====================

    start(): void {
        super.start();
        this.gameId = 'taojiang_mahjong';
    }

    protected getSeatCount(): number {
        return 4; // 桃江麻将固定4人
    }

    init(roomInfo: RoomInfo): void {
        super.init(roomInfo);
        console.log('[TaojiangRoom] Initialized with rules:', JSON.stringify(roomInfo.ruleConfig));
    }

    // ==================== 醒牌系统 ====================

    /**
     * 设置开局翻醒
     * @param xing 翻开的醒牌信息
     */
    public setXingTile(xing: XingTile): void {
        this.currentXingTile = xing;
        this.hasXingRevealed = true;
        this.renderXingTile(xing);
        console.log(`[TaojiangRoom] Xing set: ${xing.tile.suit}-${xing.tile.value}, targets:`, xing.targetValues);
    }

    /**
     * 渲染醒牌展示
     */
    protected renderXingTile(xing: XingTile): void {
        if (!this.xingTileDisplay) return;
        this.xingTileDisplay.removeAllChildren();
        const node = this.createTileNode(xing.tile, false);
        if (this.xingTileDisplay) {
            node.parent = this.xingTileDisplay;
        }
        // 醒牌通常有特殊高亮效果
        node.setScale(new Vec3(1.2, 1.2, 1)); // 放大显示
    }

    /**
     * 检查某张牌是否为可胡的醒牌目标
     */
    public canHuWithXing(tile: MahjongTile): boolean {
        if (!this.currentXingTile) return true; // 无醒牌限制
        return this.currentXingTile.targetValues.includes(tile.value);
    }

    // ==================== 发牌与游戏流程 ====================

    /**
     * 服务端发牌回调
     * @param tiles 手牌
     * @param xing 醒牌信息(可选)
     */
    public onServerDeal(tiles: MahjongTile[], xing?: XingTile): void {
        super.dealTiles(tiles);
        if (xing) {
            this.setXingTile(xing);
        }
    }

    /**
     * 处理服务端操作请求
     * @param actions 可用操作
     */
    public onRequestActions(actions: AvailableActions): void {
        this.showActionPanel(actions);
        // 启动倒计时
        const timeout = actions.canHu ? 15 : (actions.canGang || actions.canPeng ? 10 : 8);
        super.startCountdown(timeout);
    }

    /**
     * 处理其他玩家出牌
     */
    public onPlayerDiscard(seatIndex: number, tile: MahjongTile): void {
        super.onOtherPlayerDiscard(seatIndex, tile);

        // 检查是否可以吃碰杠胡（服务端会主动推送操作请求）
        console.log(`[TaojiangRoom] Player ${seatIndex} discarded: ${tile.suit}-${tile.value}`);
    }

    // ==================== 结算 ====================

    /**
     * 显示单局结算
     */
    public showRoundSettlement(data: TaojiangRoundSettlement): void {
        console.log(`[TaojiangRoom] Round ${data.roundNumber} settlement:` +
            ` winner=${data.winnerId} fans=${data.totalFans} type=${data.fanType}`);

        // 更新番数显示
        this.updateFanDisplay(data.totalFans);

        // 调用基类结算处理
        this.handleRoundSettlement(data);
    }

    /**
     * 更新番数显示
     */
    protected updateFanDisplay(fans: number): void {
        this.totalFans += fans;
        if (this.fanLabel) {
            this.fanLabel.string = `${this.totalFans}番`;
        }
    }

    /**
     * 显示总结算
     */
    public showFinalSettlement(data: FinalSettlementData): void {
        console.log('[TaojiangRoom] Final settlement:', data.players.map(p => `${p.nickname}: ${p.totalScore}`));
        this.handleFinalSettlement(data);
    }

    // ==================== 听牌提示 ====================

    /**
     * 显示听牌提示
     * @param tingTiles 可以胡的牌列表
     */
    public showTingHint(tingTiles: MahjongTile[]): void {
        if (this.tingHintPanel) {
            this.tingHintPanel.active = true;
            // 渲染可胡的牌
            this.tingHintPanel.removeAllChildren();
            for (const t of tingTiles) {
                const node = this.createTileNode(t, false);
                if (this.tingHintPanel) {
                    node.parent = this.tingHintPanel;
                }
            }
        }
    }

    public hideTingHint(): void {
        if (this.tingHintPanel) {
            this.tingHintPanel.active = false;
        }
    }

    // ==================== 重置 ====================

    protected resetRoundState(): void {
        super.resetRoundState();
        this.currentXingTile = null;
        this.hasXingRevealed = false;
        this.hideTingHint();
        if (this.fanLabel) {
            this.fanLabel.string = '0番';
        }
        if (this.xingTileDisplay) {
            this.xingTileDisplay.removeAllChildren();
        }
    }
}
