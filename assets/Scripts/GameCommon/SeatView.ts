/**
 * 玩家位视图 (SeatView)
 * 通用玩家座位 UI 组件，包含头像、昵称、状态指示等
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, Sprite, Color } from 'cc';
import { RoomPlayerInfo, PlayerRoomState, SeatPosition } from './GameTypes';

const { ccclass, property } = _decorator;

@ccclass('SeatView')
export class SeatView extends Component {
    // ==================== UI 引用 ====================

    @property({ type: Sprite })
    avatarSprite: Sprite = null;        // 头像

    @property({ type: Label })
    nicknameLabel: Label = null;         // 昵称

    @property({ type: Label })
    stateLabel: Label = null;            // 状态文字（准备/托管/离线）

    @property({ type: Node })
    readyFlag: Node = null;              // 准备标记

    @property({ type: Node })
    ownerCrown: Node = null;             // 房主皇冠

    @property({ type: Node })
    onlineIndicator: Node = null;        // 在线状态指示灯

    @property({ type: Node })
    voiceIndicator: Node = null;         // 语音播放指示器

    @property({ type: Label })
    scoreLabel: Label = null;            // 分数显示（牌桌时使用）

    @property({ type: Label })
    cardCountLabel: Label = null;        // 剩余牌数

    // ==================== 内部状态 ====================

    protected playerInfo: RoomPlayerInfo | null = null;
    protected seatPosition: SeatPosition = SeatPosition.Self;

    onLoad(): void {
        this.setEmpty();
    }

    // ==================== 公共方法 ====================

    /**
     * 设置玩家信息
     */
    setPlayer(player: RoomPlayerInfo): void {
        this.playerInfo = player;
        this.seatPosition = player.seatPosition;
        this.updateDisplay();
    }

    /**
     * 清空座位
     */
    setEmpty(): void {
        this.playerInfo = null;
        this.node.active = false; // 隐藏空座位
    }

    /** 显示座位 */
    showSeat(): void {
        this.node.active = true;
    }

    /**
     * 更新玩家状态
     */
    updateState(state: PlayerRoomState): void {
        if (!this.playerInfo) return;
        this.playerInfo.state = state;
        this.updateStateDisplay(state);
    }

    /**
     * 更新分数
     */
    updateScore(score: number): void {
        if (this.scoreLabel) {
            this.scoreLabel.string = String(score >= 0 ? `+${score}` : score);
            this.scoreLabel.color = score >= 0 ? new Color(255, 215, 0) : new Color(255, 80, 80); // 金色/红色
        }
    }

    /**
     * 更新剩余牌数
     */
    updateCardCount(count: number): void {
        if (this.cardCountLabel) {
            this.cardCountLabel.string = count > 0 ? String(count) : '';
        }
    }

    /**
     * 显示语音动画
     */
    showVoiceAnim(show: boolean): void {
        if (this.voiceIndicator) {
            this.voiceIndicator.active = show;
        }
    }

    // ==================== 私有方法 ====================

    protected updateDisplay(): void {
        if (!this.playerInfo) return;
        this.showSeat();

        // 昵称
        if (this.nicknameLabel) {
            this.nicknameLabel.string = this.truncateName(this.playerInfo.nickname);
        }

        // 房主标记
        if (this.ownerCrown) {
            this.ownerCrown.active = this.playerInfo.isOwner;
        }

        // 在线状态
        if (this.onlineIndicator) {
            const isOnline = this.playerInfo.state !== PlayerRoomState.Offline;
            this.onlineIndicator.active = true;
            // 可以通过颜色区分在线/离线
        }

        // 状态
        this.updateStateDisplay(this.playerInfo.state);

        // 头像（需要异步加载）
        this.loadAvatar(this.playerInfo.avatar);
    }

    protected updateStateDisplay(state: PlayerRoomState): void {
        if (this.stateLabel) {
            const stateTexts: Record<PlayerRoomState, string> = {
                [PlayerRoomState.NotReady]: '',
                [PlayerRoomState.Ready]: '已准备',
                [PlayerRoomState.Offline]: '离线',
                [PlayerRoomState.Trustee]: '托管中',
            };
            this.stateLabel.string = stateTexts[state] || '';
        }

        if (this.readyFlag) {
            this.readyFlag.active = state === PlayerRoomState.Ready;
        }
    }

    protected async loadAvatar(url: string): void {
        if (!url || !this.avatarSprite) return;

        try {
            const { GameManager } = require('../Manager/GameManager');
            GameManager.Instance.loadAvatar(url, (spriteFrame) => {
                if (this.avatarSprite && spriteFrame) {
                    this.avatarSprite.spriteFrame = spriteFrame;
                }
            });
        } catch (err) {
            console.warn('[SeatView] Failed to load avatar:', err);
        }
    }

    protected truncateName(name: string): string {
        if (!name) return '';
        const maxLen = 6;
        return name.length > maxLen ? name.slice(0, maxLen) + '...' : name;
    }
}
