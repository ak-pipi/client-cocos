/**
 * 倒计时控制器 (CountdownController)
 * 通用倒计时 UI 组件，支持不同倒计时场景
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, ProgressBar, tween, Ease } from 'cc';

const { ccclass, property } = _decorator;

/** 倒计时类型 */
export enum CountdownType {
    /** 准备倒计时 */
    Ready = 'ready',
    /** 操作倒计时（出牌/吃碰杠胡等） */
    Action = 'action',
    /** 解散投票倒计时 */
    DissolveVote = 'dissolve_vote',
    /** 等待其他玩家 */
    Waiting = 'waiting',
}

@ccclass('CountdownController')
export class CountdownController extends Component {
    @property({ type: Label })
    secondsLabel: Label = null;          // 秒数文字

    @property({ type: ProgressBar })
    progressBar: ProgressBar = null;      // 进度条

    @property({ type: Node })
    warningNode: Node = null;            // 警告效果（最后3秒）

    @property({ type: Node })
    urgentNode: Node = null;             // 紧急效果（最后1秒）

    // 内部状态
    private totalSeconds: number = 0;
    private remainingSeconds: number = 0;
    private elapsed: number = 0;
    private isActive: boolean = false;
    private countdownType: CountdownType = CountdownType.Action;

    /** 倒计时结束回调 */
    onExpired: (() => void) | null = null;

    /** 每秒回调 (用于音效等) */
    onTick: ((seconds: number) => void) | null = null;

    start(): void {
        this.setActive(false);
    }

    update(deltaTime: number): void {
        if (!this.isActive || this.remainingSeconds <= 0) return;

        this.elapsed += deltaTime;
        if (this.elapsed >= 1.0) {
            this.elapsed -= 1.0;
            this.remainingSeconds--;
            this.updateDisplay();

            this.onTick?.(this.remainingSeconds);

            if (this.remainingSeconds <= 0) {
                this.stop();
                this.onExpired?.();
            }
        }
    }

    /**
     * 开始倒计时
     * @param seconds 总秒数
     * @param type 倒计时类型
     */
    public startCountdown(seconds: number, type: CountdownType = CountdownType.Action): void {
        this.totalSeconds = seconds;
        this.remainingSeconds = seconds;
        this.elapsed = 0;
        this.countdownType = type;
        this.isActive = true;
        this.setActive(true);
        this.updateDisplay();
    }

    /**
     * 停止倒计时
     */
    public stop(): void {
        this.isActive = false;
        this.remainingSeconds = 0;
        this.setActive(false);
    }

    /**
     * 设置剩余时间（重连恢复时用）
     */
    public setRemaining(seconds: number): void {
        this.remainingSeconds = Math.max(0, Math.min(seconds, this.totalSeconds));
        this.updateDisplay();
    }

    public get isActive(): boolean {
        return this.isActive;
    }

    public get remaining(): number {
        return this.remainingSeconds;
    }

    public get type(): CountdownType {
        return this.countdownType;
    }

    // ==================== 私有方法 ====================

    private setActive(active: boolean): void {
        this.node.active = active;
        if (!active && this.warningNode) this.warningNode.active = false;
        if (!active && this.urgentNode) this.urgentNode.active = false;
    }

    private updateDisplay(): void {
        // 更新数字
        if (this.secondsLabel) {
            this.secondsLabel.string = String(Math.max(0, this.remainingSeconds));
        }

        // 更新进度条
        if (this.progressBar && this.totalSeconds > 0) {
            this.progressBar.progress = this.remainingSeconds / this.totalSeconds;
        }

        // 更新警告效果
        if (this.warningNode) {
            this.warningNode.active = this.remainingSeconds <= 3 && this.remainingSeconds > 1;
        }
        if (this.urgentNode) {
            this.urgentNode.active = this.remainingSeconds <= 1;
        }
    }
}
