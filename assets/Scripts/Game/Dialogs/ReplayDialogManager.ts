import { Node } from 'cc';
import { GameId } from '../../App/GameEnums';
import { Client } from '../Client';
import { GameRoomApi, MahjongPlaybackResult, MahjongRecordItem } from '../../Network/GameRoomApi';
import { DlgReplayPlayer } from './DlgReplayPlayer';
import { DlgReplayRoundChooser, SettlementReplayOptions } from './DlgReplayRoundChooser';

export class ReplayDialogManager {
    public static openPlayback(parent: Node, playback: MahjongPlaybackResult): DlgReplayPlayer {
        const node = new Node('DlgReplayPlayer');
        node.parent = parent;
        const comp = node.addComponent(DlgReplayPlayer);
        comp.setup(playback);
        return comp;
    }

    public static async openRecordPlayback(parent: Node, gameId: GameId | string, recordId: number): Promise<void> {
        const playback = await GameRoomApi.Instance.getGamePlayback(gameId, recordId);
        if (!playback || !playback.hasReplay) return;
        ReplayDialogManager.openPlayback(parent, playback);
    }

    public static async openSettlementReplay(parent: Node, gameId: GameId | string, options: SettlementReplayOptions): Promise<void> {
        const roundNo = Number(options.roundNo || 0);
        const totalRounds = Number(options.totalRounds || 0);
        if (totalRounds <= 1) {
            const record = await ReplayDialogManager.findRoomRoundRecord(gameId, roundNo, options);
            if (!record) {
                Client.Instance.showPromptDialog('没有找到本局可回放记录');
                return;
            }
            await ReplayDialogManager.openRecordPlayback(parent, gameId, record.id);
            return;
        }

        if (roundNo > 0) {
            await ReplayDialogManager.findRoomRoundRecord(gameId, roundNo, options);
        }
        const node = new Node('DlgReplayRoundChooser');
        node.parent = parent;
        const comp = node.addComponent(DlgReplayRoundChooser);
        comp.setup(gameId, options);
    }

    private static async findRoomRoundRecord(gameId: GameId | string, roundNo: number, options: SettlementReplayOptions): Promise<MahjongRecordItem | null> {
        const maxAttempts = 8;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const record = await GameRoomApi.Instance.findGameRecordForRoomRound(gameId, roundNo, options.venueId, options.number);
            if (record) return record;
            if (attempt < maxAttempts - 1) await new Promise((resolve) => setTimeout(resolve, 700));
        }
        return null;
    }
}
