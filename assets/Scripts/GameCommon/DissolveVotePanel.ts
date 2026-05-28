/**
 * 解散投票面板 (DissolveVotePanel)
 * 通用房间解散投票 UI
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, Button } from 'cc';

const { ccclass, property } = _decorator;

/** 投票状态 */
export enum VoteState {
    /** 等待投票 */
    Pending = 'pending',
    /** 已同意 */
    Agreed = 'agreed',
    /** 已拒绝 */
    Rejected = 'rejected',
}

interface VoterInfo {
    playerId: string;
    nickname: string;
    state: VoteState;
}

@ccclass('DissolveVotePanel')
export class DissolveVotePanel extends Component {
    @property({ type: Label })
    titleLabel: Label = null;           // 标题（"xxx 申请解散房间"）

    @property({ type: Label })
    countdownLabel: Label = null;        // 倒计时文字

    @property({ type: Button })
    agreeButton: Button = null;          // 同意按钮

    @property({ type: Button })
    rejectButton: Button = null;         // 拒绝按钮

    @property({ type: Node })
    votersContainer: Node = null;        // 投票者状态容器

    // 内部状态
    private initiatorId: string = '';
    private initiatorName: string = '';
    private totalSeconds: number = 60;
    private remainingSeconds: number = 60;
    private elapsed: number = 0;
    private isActive: boolean = false;
    private voters: Map<string, VoterInfo> = new Map();

    /** 投票结果回调 */
    onVoted: ((agree: boolean) => void) | null = null;

    /** 超时回调 (自动拒绝) */
    onTimeout: (() => void) | null = null;

    onLoad(): void {
        this.node.active = false;
    }

    update(deltaTime: number): void {
        if (!this.isActive || this.remainingSeconds <= 0) return;

        this.elapsed += deltaTime;
        if (this.elapsed >= 1.0) {
            this.elapsed -= 1.0;
            this.remainingSeconds--;
            this.updateCountdownDisplay();

            if (this.remainingSeconds <= 0) {
                this.onExpire();
            }
        }
    }

    // ==================== 公共方法 ====================

    /**
     * 显示解散投票
     */
    public show(initiatorId: string, initiatorName: string, timeout: number = 60): void {
        this.initiatorId = initiatorId;
        this.initiatorName = initiatorName;
        this.totalSeconds = timeout;
        this.remainingSeconds = timeout;
        this.elapsed = 0;
        this.isActive = true;
        this.voters.clear();
        this.node.active = true;

        if (this.titleLabel) {
            this.titleLabel.string = `${initiatorName} 申请解散房间`;
        }

        this.updateCountdownDisplay();
        this.updateButtons(true);
    }

    /**
     * 隐藏面板
     */
    public hide(): void {
        this.isActive = false;
        this.node.active = false;
        this.voters.clear();
    }

    /**
     * 添加投票者信息
     */
    public addVoter(playerId: string, nickname: string): void {
        this.voters.set(playerId, { playerId, nickname, state: VoteState.Pending });
        this.renderVoters();
    }

    /**
     * 更新投票者状态
     */
    public updateVoterState(playerId: string, agreed: boolean): void {
        const voter = this.voters.get(playerId);
        if (voter) {
            voter.state = agreed ? VoteState.Agreed : VoteState.Rejected;
            this.renderVoters();
        }
        this.checkVoteComplete();
    }

    // ==================== 用户操作 ====================

    public onAgreeClick(): void {
        if (!this.isActive) return;
        this.updateMyVote(VoteState.Agreed);
        this.updateButtons(false);
        this.onVoted?.(true);
    }

    public onRejectClick(): void {
        if (!this.isActive) return;
        this.updateMyVote(VoteState.Rejected);
        this.updateButtons(false);
        this.onVoted?.(false);
    }

    // ==================== 私有方法 ====================

    private updateCountdownDisplay(): void {
        if (this.countdownLabel) {
            this.countdownLabel.string = `(${Math.max(0, this.remainingSeconds)}s)`;
        }
    }

    private updateButtons(interactive: boolean): void {
        if (this.agreeButton) this.agreeButton.interactable = interactive;
        if (this.rejectButton) this.rejectButton.interactable = interactive;
    }

    private renderVoters(): void {
        // 基本实现：子类应覆写以自定义渲染
        console.log('[DissolveVotePanel] Voters:', Array.from(this.voters.values()));
    }

    private updateMyVote(state: VoteState): void {
        const { GameManager } = require('../Manager/GameManager');
        const myId = GameManager.Instance.PlayerId;
        const myVoter = this.voters.get(myId);
        if (myVoter) {
            myVoter.state = state;
            this.renderVoters();
        }
    }

    private checkVoteComplete(): void {
        let allVoted = true;
        let allAgreed = true;

        for (const [, voter] of this.voters) {
            if (voter.state === VoteState.Pending) {
                allVoted = false;
                break;
            }
            if (voter.state === VoteState.Rejected) {
                allAgreed = false;
            }
        }

        if (allVoted) {
            this.isActive = false;
            // 结果由服务端最终确认，这里只是 UI 状态更新
        }
    }

    private onExpire(): void {
        this.isActive = false;
        this.updateButtons(false);
        this.onTimeout?.();
    }
}
