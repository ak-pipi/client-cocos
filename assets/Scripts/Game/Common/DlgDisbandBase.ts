import { _decorator, Component, Node, Label, math } from 'cc';
import { GameManager } from '../../Manager/GameManager';
import { NetworkManager } from '../../Manager/NetworkManager';
const { ccclass, property } = _decorator;

/**
 * 通用解散对话框基类
 * 支持回调模式和默认消息发送模式
 */
@ccclass('DlgDisbandBase')
export class DlgDisbandBase extends Component {

    @property({ type: Node })
    public content: Node = null;

    @property({ type: Node })
    public btnAgree: Node = null;

    @property({ type: Node })
    public btnRefuse: Node = null;

    @property({ type: Label })
    public textCountDown: Label = null;

    // 回调函数，用于处理解散选择
    private onChoiceCallback: ((choice: number) => void) = null;

    // 倒计时（秒）
    private countdown: number = 0.0;

    // 是否正在倒计时
    private countingdown: boolean = false;

    // 发起解散的玩家（服务端座位号）
    private disbander: number = 0;

    // 解散超时时间（秒）
    private static readonly DISBAND_TIMEOUT: number = 300;

    start() {}

    update(deltaTime: number) {
        if (!this.countingdown) return;
        this.countdown = this.countdown - deltaTime;
        if (this.countdown > 0) {
            let sec: number = Math.floor(this.countdown + 0.5);
            if (this.textCountDown) {
                this.textCountDown.string = sec.toString();
            }
        } else {
            // 超时，自动隐藏
            this.countingdown = false;
            this.show(false);
        }
    }

    /**
     * 设置解散选择回调
     * @param cb 回调函数，参数为选择值 (1=同意, 2=拒绝)
     */
    public setCallback(cb: (choice: number) => void): void {
        this.onChoiceCallback = cb;
    }

    /**
     * 显示/隐藏对话框
     * @param visible 是否显示
     */
    public show(visible: boolean): void {
        this.node.active = visible;
        if (!visible) {
            this.countingdown = false;
        }
    }

    /**
     * 初始化解散投票UI
     * @param disbander 发起解散的玩家座位号（服务端）
     * @param elapsed 已经过的时间（毫秒）
     * @param names 所有玩家昵称数组，索引为服务端座位号
     * @param choices 各玩家选择数组，索引为服务端座位号 (0=未选, 1=同意, 2=拒绝)
     * @param mySeat 本机玩家座位号（服务端）
     */
    public onDisbandVote(disbander: number, elapsed: number, names: string[], choices: number[], mySeat: number): void {
        this.disbander = disbander;

        // 计算剩余倒计时
        let elapsedSec: number = elapsed / 1000;
        this.countdown = DlgDisbandBase.DISBAND_TIMEOUT - elapsedSec;
        if (this.countdown < 0) this.countdown = 0;
        this.countingdown = true;

        // 设置按钮可见性
        if (this.btnAgree) {
            this.btnAgree.active = (choices[mySeat] === 0);
        }
        if (this.btnRefuse) {
            this.btnRefuse.active = (choices[mySeat] === 0);
        }
    }

    /**
     * 更新某个玩家的投票选择
     * @param seat 投票的玩家座位号（服务端）
     * @param choice 选择值 (1=同意, 2=拒绝)
     */
    public onDisbandChoice(seat: number, choice: number): void {
        // 子类可重写以更新具体的投票UI显示
        // 如果是自己的投票，隐藏按钮
        if (this.btnAgree) this.btnAgree.active = false;
        if (this.btnRefuse) this.btnRefuse.active = false;
    }

    /**
     * 点击同意按钮
     */
    public onAgreeClick(): void {
        this.show(false);
        if (this.onChoiceCallback) {
            this.onChoiceCallback(1);
        } else {
            // 默认行为：发送MsgDisbandChoice消息
            this.sendDisbandChoice(1);
        }
    }

    /**
     * 点击拒绝按钮
     */
    public onRefuseClick(): void {
        this.show(false);
        if (this.onChoiceCallback) {
            this.onChoiceCallback(2);
        } else {
            // 默认行为：发送MsgDisbandChoice消息
            this.sendDisbandChoice(2);
        }
    }

    /**
     * 是否正在显示
     */
    public isVisible(): boolean {
        return this.node.active;
    }

    /**
     * 发送解散选择消息（向后兼容）
     */
    private sendDisbandChoice(choice: number): void {
        let msg = {
            venueId: GameManager.Instance.VenueId,
            choice: choice
        };
        NetworkManager.Instance.sendMessage("MsgDisbandChoice", msg, true);
    }
}
