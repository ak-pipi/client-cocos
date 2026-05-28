/**
 * 结算面板基类 (SettlementPanelBase)
 * 通用单局结算和总结算 UI 基类
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, Sprite, Button, ScrollView } from 'cc';
import { RoundSettlementData, FinalSettlementData, PlayerSettlementInfo } from './GameTypes';

const { ccclass, property } = _decorator;

@ccclass('SettlementPanelBase')
export class SettlementPanelBase extends Component {
    // ==================== UI 引用 ====================

    @property({ type: Label })
    titleLabel: Label = null;            // 标题（"本局结算"/"游戏结束"）

    @property({ type: Label })
    roundInfoLabel: Label = null;        // 局数信息

    @property({ type: Label })
    winTypeLabel: Label = null;          // 胡牌类型描述

    @property({ type: Node })
    playersContainer: Node = null;       // 玩家结算列表容器

    @property({ type: Node })
    winnerHighlight: Node = null;        // 赢家高亮效果

    @property({ type: Button })
    continueButton: Button = null;       // 继续按钮

    @property({ type: Button })
    shareButton: Button = null;          // 分享按钮

    @property({ type: Button })
    replayButton: Button = null;         // 回放按钮

    @property({ type: Button })
    backButton: Button = null;           // 返回大厅按钮

    // 内部状态
    protected isFinal: boolean = false;

    onLoad(): void {
        this.node.active = false;
    }

    // ==================== 单局结算 ====================

    /**
     * 显示单局结算
     */
    public showRoundSettlement(data: RoundSettlementData): void {
        this.isFinal = false;
        this.node.active = true;
        this.renderRoundSettlement(data);
    }

    protected renderRoundSettlement(data: RoundSettlementData): void {
        // 标题
        if (this.titleLabel) {
            this.titleLabel.string = '本局结算';
        }

        // 局数
        if (this.roundInfoLabel) {
            this.roundInfoLabel.string = `第 ${data.roundNumber} 局`;
        }

        // 胜利方式
        if (this.winTypeLabel) {
            this.winTypeLabel.string = data.winType || '';
        }

        // 玩家列表
        this.renderPlayers(data.players);

        // 按钮状态
        if (this.continueButton) this.continueButton.node.active = true;
        if (this.backButton) this.backButton.node.active = false;
    }

    // ==================== 总结算 ====================

    /**
     * 显示总结算
     */
    public showFinalSettlement(data: FinalSettlementData): void {
        this.isFinal = true;
        this.node.active = true;
        this.renderFinalSettlement(data);
    }

    protected renderFinalSettlement(data: FinalSettlementData): void {
        // 标题
        if (this.titleLabel) {
            this.titleLabel.string = '游戏结束';
        }

        // 房号信息
        if (this.roundInfoLabel) {
            this.roundInfoLabel.string = `房号: ${data.roomNo}  共 ${data.totalRounds} 局`;
        }

        // 清空胜利方式
        if (this.winTypeLabel) {
            this.winTypeLabel.string = '';
        }

        // 玩家列表（按分数排序）
        const sorted = [...data.players].sort((a, b) => b.totalScore - a.totalScore);
        this.renderPlayers(sorted);

        // 按钮状态
        if (this.continueButton) this.continueButton.node.active = false;
        if (this.backButton) this.backButton.node.active = true;
    }

    // ==================== 玩家列表渲染 ====================

    protected renderPlayers(players: PlayerSettlementInfo[] | Array<{
        playerId: string;
        nickname: string;
        avatar: string;
        score?: number;
        totalScore: number;
        isWinner?: boolean;
        roundsWon?: number;
        maxSingleWin?: number;
    }>): void {
        if (!this.playersContainer) return;

        // 清空旧内容
        this.playersContainer.removeAllChildren();

        for (const player of players) {
            const itemNode = this.createPlayerItem(player);
            if (itemNode) {
                itemNode.parent = this.playersContainer;
            }
        }
    }

    /**
     * 创建单个玩家结算项 (子类覆写以自定义样式)
     */
    protected createPlayerItem(player: any): Node | null {
        // 基本实现：创建简单节点
        const node = new Node(`Player_${player.playerId}`);
        
        // 子类应通过预制体实例化来创建更丰富的 UI
        console.log('[Settlement] Player:', player.nickname, 'score:', player.score ?? player.totalScore);
        
        return node;
    }

    // ==================== 按钮事件 ====================

    public onContinue(): void {
        this.hide();
        // 通知房间继续下一局
    }

    public onShare(): void {
        console.log('[Settlement] Share clicked');
        // 实现分享功能
    }

    public onReplay(): void {
        console.log('[Settlement] Replay clicked');
        // 打开回放页面
    }

    public onBack(): void {
        this.hide();
        const { Client } = require('../Game/Client');
        Client.Instance.backToHall();
    }

    public hide(): void {
        this.node.active = false;
    }
}
