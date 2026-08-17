import { Node } from 'cc';
import { Client } from './Client';
import { GameManager } from '../Manager/GameManager';
import { GameId, resolveMinCarryScore } from '../App/GameEnums';

export class CarryScorePrompt {
    private static readonly DECIMAL_DIGITS = 1;

    public static getMinCarryScore(baseScore: any, gameId?: GameId | string | null, roundCount?: any): number {
        return resolveMinCarryScore(gameId, baseScore, roundCount);
    }

    public static requestByBaseScore(parent: Node, baseScore: any): Promise<number | null> {
        return this.request(parent, this.getMinCarryScore(baseScore));
    }

    public static requestByRule(
        parent: Node,
        gameId: GameId | string | null | undefined,
        baseScore: any,
        roundCount?: any,
        explicitMinCarry?: any,
    ): Promise<number | null> {
        const explicit = this.normalizeScore(explicitMinCarry);
        return this.request(parent, explicit > 0 ? explicit : this.getMinCarryScore(baseScore, gameId, roundCount));
    }

    public static async request(parent: Node, minCarry: number): Promise<number | null> {
        try {
            await GameManager.Instance.refreshCapital();
        } catch (err) {
            console.warn('[CarryScorePrompt] Refresh capital failed:', err);
        }

        const available = this.normalizeScore(GameManager.Instance.Gold);
        const min = this.normalizeScore(minCarry);
        if (available < min) {
            const safeBox = this.normalizeScore(GameManager.Instance.Deposit);
            Client.Instance.showPromptDialog(
                `积分不足，加入本局至少需要${this.formatScore(min)}积分。\n当前背包${this.formatScore(available)}积分，保险柜${this.formatScore(safeBox)}积分不参与游戏结算，请先从保险柜取出积分。`
            );
            return null;
        }

        return available;
    }

    private static normalizeScore(value: any): number {
        const numberValue = Number(value);
        if (!isFinite(numberValue) || numberValue <= 0) return 0;
        const scale = Math.pow(10, this.DECIMAL_DIGITS);
        return Math.round(numberValue * scale) / scale;
    }

    private static formatScore(value: any): string {
        const score = this.normalizeScore(value);
        return Number.isInteger(score) ? String(score) : score.toFixed(this.DECIMAL_DIGITS);
    }
}
