import { _decorator, Component, Label, Node, Prefab, math, Quat, SpriteFrame, Sprite, tween } from 'cc';
import { BaseRoom, GameState } from './BaseRoom';
import { NetMsgManager } from '../../Manager/NetMsgManager';
import { NetworkManager } from '../../Manager/NetworkManager';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';
import { Poker } from '../../Common/Poker';

const { ccclass, property } = _decorator;

/**
 * 扑克类游戏的抽象基类
 * 提供通用的扑克游戏状态和辅助方法
 */
@ccclass('PokerRoomBase')
export abstract class PokerRoomBase extends BaseRoom {

    // ==================== 扑克游戏状态 ====================

    // 手牌ID数组
    protected myCards: number[] = [];

    // 当前出牌的玩家（服务端座位号）
    protected currentPlayer: number = -1;

    // 上一手打出的牌ID数组
    protected lastPlayCards: number[] = [];

    // 上一手出牌的座位号（服务端座位号）
    protected lastPlaySeat: number = -1;

    // ==================== 抽象方法 ====================

    /**
     * 处理扑克游戏特定的消息
     * @param msgType 消息类型
     * @param msg 消息数据
     * @returns 是否处理了该消息
     */
    protected abstract onPokerGameMessage(msgType: string, msg: any): boolean;

    // ==================== BaseRoom 抽象方法 ====================

    protected abstract playerCount: number;
    protected abstract roomBundleName: string;
    protected abstract getSyncMsgType(): string;

    // ==================== 消息处理 ====================

    protected onGameMessage(msgType: string, msg: any): boolean {
        // 处理解散消息（扑克通用）
        if (msgType === "MsgDisbandVote") { this.onMsgDisbandVote(msg); return true; }
        if (msgType === "MsgDisbandChoice") { this.onMsgDisbandChoice(msg); return true; }
        if (msgType === "MsgDisbandObsolete") { this.onMsgDisbandObsolete(); return true; }
        if (msgType === "MsgDisband") { this.onMsgDisband(); return true; }

        // 子类处理扑克特定消息
        return this.onPokerGameMessage(msgType, msg);
    }

    // ==================== 解散消息处理 ====================

    protected onMsgDisbandVote(msg: any): void {
        // 子类应重写此方法以处理解散投票
        if (!msg) return;
        let name: string = "";
        if (this.playerInfos[msg.disbander]) {
            name = this.playerInfos[msg.disbander].nickname;
        }
        Client.Instance.showPromptTip("玩家【" + name + "】请求解散房间", 3.0);
    }

    protected onMsgDisbandChoice(msg: any): void {
        // 子类应重写此方法以更新投票状态
    }

    protected onMsgDisbandObsolete(): void {
        // 子类应重写此方法以取消解散投票
    }

    protected onMsgDisband(): void {
        // 房间已解散
        Client.Instance.showPromptDialog("房间已解散，请返回大厅。", () => { this.exitRoom(); }, () => { this.exitRoom(); });
    }

    // ==================== 辅助方法 ====================

    /**
     * 将整数牌ID数组转换为扑克牌对象数组
     * @param cardIds 整数牌ID数组
     * @returns 扑克牌对象数组 [{point, suit}, ...]
     */
    protected convertCardIds(cardIds: number[]): any[] {
        if (!cardIds || cardIds.length === 0) return [];
        let cards: any[] = [];
        for (let i: number = 0; i < cardIds.length; i++) {
            let c: any = Poker.fromInt32(cardIds[i]);
            c.id = cardIds[i];
            cards.push(c);
        }
        return cards;
    }

    /**
     * 将扑克牌对象数组转换为整数ID数组
     * @param cards 扑克牌对象数组
     * @returns 整数牌ID数组
     */
    protected convertToCardIds(cards: any[]): number[] {
        if (!cards || cards.length === 0) return [];
        let cardIds: number[] = [];
        for (let i: number = 0; i < cards.length; i++) {
            if (typeof cards[i] === 'number') {
                cardIds.push(cards[i]);
            } else if (cards[i].id !== undefined) {
                cardIds.push(cards[i].id);
            }
        }
        return cardIds;
    }
}
