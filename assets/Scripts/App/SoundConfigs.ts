/**
 * 六款游戏完整音效定义表
 * 
 * 定义每款游戏的所有音效资源路径和分类
 * 用于 AudioManager 的预加载和快捷播放
 *
 * Author: AI Assistant
 */

import { AudioPreloadItem, AudioChannel } from './AudioManager';

// ==================== 通用 UI 音效 ====================

export const COMMON_UI_SOUNDS: AudioPreloadItem[] = [
    { path: 'audio/ui/click', channel: AudioChannel.SFX },
    { path: 'audio/ui/click_heavy', channel: AudioChannel.SFX },
    { path: 'audio/ui/open_panel', channel: AudioChannel.SFX },
    { path: 'audio/ui/close_panel', channel: AudioChannel.SFX },
    { path: 'audio/ui/toggle_on', channel: AudioChannel.SFX },
    { path: 'audio/ui/toggle_off', channel: AudioChannel.SFX },
    { path: 'audio/ui/countdown_tick', channel: AudioChannel.SFX },
    { path: 'audio/ui/countdown_last', channel: AudioChannel.StrongFeedback },
    { path: 'audio/ui/countdown_timeout', channel: AudioChannel.StrongFeedback },
    { path: 'audio/ui/error', channel: AudioChannel.StrongFeedback },
    { path: 'audio/ui/success', channel: AudioChannel.Reward },
    { path: 'audio/ui/notice', channel: AudioChannel.Voice },
];

// ==================== 麻将类音效 (桃江/红中/长沙共用) ====================

export const MAHJONG_SOUND_LIST: AudioPreloadItem[] = [
    // ---- 发牌/洗牌 ----
    { path: 'audio/mahjong/shuffle', channel: AudioChannel.SFX },
    { path: 'audio/mahjong/deal_one', channel: AudioChannel.SFX },
    { path: 'audio/mahjong/deal_finish', channel: AudioChannel.SFX },

    // ---- 出牌/摸牌 ----
    { path: 'audio/mahjong/draw', channel: AudioChannel.SFX },
    { path: 'audio/mahjong/discard', channel: AudioChannel.SFX },
    { path: 'audio/mahjong/discord_other', channel: AudioChannel.SFX },

    // ---- 吃碰杠 ----
    { path: 'audio/mahjong/chi', channel: AudioChannel.SFX },
    { path: 'audio/mahjong/peng', channel: AudioChannel.SFX },
    { path: 'audio/mahjong/gang_ming', channel: AudioChannel.SFX },
    { path: 'audio/mahjong/gang_an', channel: AudioChannel.SFX },
    { path: 'audio/mahjong/gang_bugang', channel: AudioChannel.SFX },
    { path: 'audio/mahjong/gang_diagang', channel: AudioChannel.SFX },

    // ---- 听/胡 (强反馈) ----
    { path: 'audio/mahjong/ting', channel: AudioChannel.SFX },
    { path: 'audio/mahjong/hu', channel: AudioChannel.StrongFeedback },
    { path: 'audio/mahjong/hu_zimo', channel: AudioChannel.StrongFeedback },
    { path: 'audio/mahjong/hu_dianpao', channel: AudioChannel.StrongFeedback },
    { path: 'audio/mahjong/hu_gangshanghua', channel: AudioChannel.StrongFeedback },
    { path: 'audio/mahjong/hu_haidilaoyue', channel: AudioChannel.StrongFeedback },

    // ---- 大牌型 (强反馈) ----
    { path: 'audio/mahjong/fan_qidui', channel: AudioChannel.StrongFeedback },
    { path: 'audio/mahjong/fan_pengpeng', channel: AudioChannel.StrongFeedback },
    { path: 'audio/mahjong/fan_qingyise', channel: AudioChannel.StrongFeedback },
    { path: 'audio/mahjong/fan_haohua', channel: AudioChannel.StrongFeedback },
    { path: 'audio/mahjong/fan_jiangjiang', channel: AudioChannel.StrongFeedback },
    { path: 'audio/mahjong/fan_tianhu', channel: AudioChannel.StrongFeedback },
    { path: 'audio/mahjong/fan_dihu', channel: AudioChannel.StrongFeedback },
    { path: 'audio/mahjong/fan_honghu', channel: AudioChannel.StrongFeedback },
    { path: 'audio/mahjong/fan_wuhu', channel: AudioChannel.StrongFeedback },

    // ---- 过 ----
    { path: 'audio/mahjong/pass', channel: AudioChannel.SFX },
    { path: 'audio/mahjong/pass_auto', channel: AudioChannel.SFX },

    // ---- 其他 ----
    { path: 'audio/mahjong/xing_reveal', channel: AudioChannel.SFX },       // 翻醒
    { path: 'audio/mahjong/niao_open', channel: AudioChannel.SFX },          // 开鸟
    { path: 'audio/mahjong/round_start', channel: AudioChannel.Environment },
    { path: 'audio/mahjong/round_end', channel: AudioChannel.SFX },

    // ---- 语音词条 (湖南方言) ----
    // 桃江/红中/长沙方言播报
    { path: 'audio/mahjong/voice_chi', channel: AudioChannel.Voice },
    { path: 'audio/mahjong/voice_peng', channel: AudioChannel.Voice },
    { path: 'audio/mahjong/voice_gang', channel: AudioChannel.Voice },
    { path: 'audio/mahjong/voice_hu', channel: AudioChannel.Voice },
    { path: 'audio/mahjong/voice_zimo', channel: AudioChannel.Voice },
    { path: 'audio/mahjong/voice_haidi', channel: AudioChannel.Voice },
    { path: 'audio/mahjong/voice_qidui', channel: AudioChannel.Voice },
    { path: 'audio/mahjong/voice_pengpeng', channel: AudioChannel.Voice },
    { path: 'audio/mahjong/voice_qingyise', channel: AudioChannel.Voice },
    { path: 'audio/mahjong/voice_tianhu', channel: AudioChannel.Voice },

    // ---- BGM ----
    { path: 'audio/bgm/mahjong_lobby', channel: AudioChannel.BGM },
    { path: 'audio/bgm/mahjong_playing', channel: AudioChannel.BGM },
    { path: 'audio/bgm/mahjong_settlement', channel: AudioChannel.BGM },
];

// ==================== 扑克类音效 (跑得快/千分共用) ====================

export const POKER_SOUND_LIST: AudioPreloadItem[] = [
    // ---- 洗牌/发牌 ----
    { path: 'audio/poker/shuffle', channel: AudioChannel.SFX },
    { path: 'audio/poker/deal', channel: AudioChannel.SFX },
    { path: 'audio/poker/deal_fast', channel: AudioChannel.SFX },

    // ---- 选牌/出牌 ----
    { path: 'audio/poker/select_card', channel: AudioChannel.SFX },
    { path: 'audio/poker/deselect_card', channel: AudioChannel.SFX },
    { path: 'audio/poker/play_single', channel: AudioChannel.SFX },
    { path: 'audio/poker/play_pair', channel: AudioChannel.SFX },
    { path: 'audio/poker/play_triple', channel: AudioChannel.SFX },
    { path: 'audio/poker/play_straight', channel: AudioChannel.SFX },
    { path: 'audio/poker/play_double_straight', channel: AudioChannel.SFX },
    { path: 'audio/poker/play_airplane', channel: AudioChannel.SFX },
    { path: 'audio/poker/play_bomb', channel: AudioChannel.StrongFeedback },
    { path: 'audio/poker/play_rocket', channel: AudioChannel.StrongFeedback },

    // ---- 不要/过 ----
    { path: 'audio/poker/pass', channel: AudioChannel.SFX },
    { path: 'audio/poker/pass_yao_deqi', channel: AudioChannel.Voice },
    { path: 'audio/poker/pass_buyao', channel: AudioChannel.Voice },

    // ---- 结算/结果 ----
    { path: 'audio/poker/win', channel: AudioChannel.StrongFeedback },
    { path: 'audio/poker/lose', channel: AudioChannel.SFX },
    { path: 'audio/poker/victory', channel: AudioChannel.StrongFeedback },
    { path: 'audio/poker/defeat', channel: AudioChannel.SFX },

    // ---- 千分特有 ----
    { path: 'audio/poker/qf_bid', channel: AudioChannel.SFX },
    { path: 'audio/poker/qf_dipai', channel: AudioChannel.SFX },
    { path: 'audio/poker/qf_upgrade', channel: AudioChannel.StrongFeedback },
    { path: 'audio/poker/qf_trick_win', channel: AudioChannel.SFX },
    { path: 'audio/poker/qf_double', channel: AudioChannel.StrongFeedback },
    { path: 'audio/poker/qf_trump', channel: AudioChannel.SFX },

    // ---- 语音 ----
    { path: 'audio/poker/voice_single', channel: AudioChannel.Voice },
    { path: 'audio/poker/voice_pair', channel: AudioChannel.Voice },
    { path: 'audio/poker/voice_triple', channel: AudioChannel.Voice },
    { path: 'audio/poker/voice_straight', channel: AudioChannel.Voice },
    { path: 'audio/poker/voice_bomb', channel: AudioChannel.Voice },
    { path: 'audio/poker/voice_rocket', channel: AudioChannel.Voice },
    { path: 'audio/poker/voice_win', channel: AudioChannel.Voice },
    { path: 'audio/poker/voice_lose', channel: AudioChannel.Voice },

    // ---- BGM ----
    { path: 'audio/bgm/poker_lobby', channel: AudioChannel.BGM },
    { path: 'audio/bgm/poker_playing', channel: AudioChannel.BGM },
    { path: 'audio/bgm/qianfen_playing', channel: AudioChannel.BGM },
];

// ==================== 字牌类音效 (歪胡子) ====================

export const ZIPAI_SOUND_LIST: AudioPreloadItem[] = [
    // ---- 发牌/出牌 ----
    { path: 'audio/zipai/deal', channel: AudioChannel.SFX },
    { path: 'audio/zipai/draw', channel: AudioChannel.SFX },
    { path: 'audio/zipai/discard', channel: AudioChannel.SFX },

    // ---- 操作 ----
    { path: 'audio/zipai/chi', channel: AudioChannel.SFX },
    { path: 'audio/zipai/peng', channel: AudioChannel.SFX },
    { path: 'audio/zipai/wei', channel: AudioChannel.SFX },
    { path: 'audio/zipai/ti', channel: AudioChannel.SFX },
    { path: 'audio/zipai/pao', channel: AudioChannel.StrongFeedback },
    { path: 'audio/zipai/hu', channel: AudioChannel.StrongFeedback },
    { path: 'audio/zipai/hu_zimo', channel: AudioChannel.StrongFeedback },
    { path: 'audio/zipai/hu_dianhu', channel: AudioChannel.StrongFeedback },
    { path: 'audio/zipai/pass', channel: AudioChannel.SFX },

    // ---- 特殊胡型 ----
    { path: 'audio/zipai/hu_tianhu', channel: AudioChannel.StrongFeedback },
    { path: 'audio/zipai/hu_dihu', channel: AudioChannel.StrongFeedback },
    { path: 'audio/zipai/hu_honghu', channel: AudioChannel.StrongFeedback },
    { path: 'audio/zipai/hu_wuhu', channel: AudioChannel.StrongFeedback },

    // ---- 语音 (益阳方言) ----
    { path: 'audio/zipai/voice_chi', channel: AudioChannel.Voice },
    { path: 'audio/zipai/voice_peng', channel: AudioChannel.Voice },
    { path: 'audio/zipai/voice_wei', channel: AudioChannel.Voice },
    { path: 'audio/zipai/voice_ti', channel: AudioChannel.Voice },
    { path: 'audio/zipai/voice_pao', channel: AudioChannel.Voice },
    { path: 'audio/zipai/voice_hu', channel: AudioChannel.Voice },
    { path: 'audio/zipai/voice_zimo', channel: AudioChannel.Voice },
    { path: 'audio/zipai/voice_daer', channel: AudioChannel.Voice },  // "大贰!"

    // ---- BGM ----
    { path: 'audio/bgm/zipai_lobby', channel: AudioChannel.BGM },
    { path: 'audio/bgm/zipai_playing', channel: AudioChannel.BGM },
];

// ==================== 奖励音效 (全游戏通用) ====================

export const REWARD_SOUNDS: AudioPreloadItem[] = [
    { path: 'audio/reward/coin_l1', channel: AudioChannel.Reward },
    { path: 'audio/reward/coin_l2', channel: AudioChannel.Reward },
    { path: 'audio/reward/coin_l3', channel: AudioChannel.Reward },
    { path: 'audio/reward/coin_l4', channel: AudioChannel.Reward },
    { path: 'audio/reward/coin_l5', channel: AudioChannel.Reward },
    { path: 'audio/reward/big_win', channel: AudioChannel.StrongFeedback },
    { path: 'audio/reward/jackpot', channel: AudioChannel.StrongFeedback },
    { path: 'audio/reward/level_up', channel: AudioChannel.Reward },
];

// ==================== 操作 → 音效映射表 ====================

/**
 * 将游戏内操作名映射为音效资源路径
 * 供各游戏房间直接调用
 */

/** 麻将操作→音效映射 */
export const MAHJONG_ACTION_SOUND_MAP: Record<string, string> = {
    discard: 'audio/mahjong/discard',
    draw: 'audio/mahjong/draw',
    chi: 'audio/mahjong/chi',
    peng: 'audio/mahjong/peng',
    gang_ming: 'audio/mahjong/gang_ming',
    gang_an: 'audio/mahjong/gang_an',
    gang_bugang: 'audio/mahjong/gang_bugang',
    ting: 'audio/mahjong/ting',
    hu: 'audio/mahjong/hu',
    hu_zimo: 'audio/mahjong/hu_zimo',
    hu_dianpao: 'audio/mahjong/hu_dianpao',
    hu_gangshanghua: 'audio/mahjong/hu_gangshanghua',
    pass: 'audio/mahjong/pass',
    xing_reveal: 'audio/mahjong/xing_reveal',
    niao_open: 'audio/mahjong/niao_open',
};

/** 扑克操作→音效映射 */
export const POKER_ACTION_SOUND_MAP: Record<string, string> = {
    play_single: 'audio/poker/play_single',
    play_pair: 'audio/poker/play_pair',
    play_triple: 'audio/poker/play_triple',
    play_straight: 'audio/poker/play_straight',
    play_double_straight: 'audio/poker/play_double_straight',
    play_airplane: 'audio/poker/play_airplane',
    play_bomb: 'audio/poker/play_bomb',
    play_rocket: 'audio/poker/play_rocket',
    select: 'audio/poker/select_card',
    deselect: 'audio/poker/deselect_card',
    pass: 'audio/poker/pass',
    win: 'audio/poker/win',
    lose: 'audio/poker/lose',
};

/** 字牌操作→音效映射 */
export const ZIPAI_ACTION_SOUND_MAP: Record<string, string> = {
    discard: 'audio/zipai/discard',
    draw: 'audio/zipai/draw',
    chi: 'audio/zipai/chi',
    peng: 'audio/zipai/peng',
    wei: 'audio/zipai/wei',
    ti: 'audio/zipai/ti',
    pao: 'audio/zipai/pao',
    hu: 'audio/zipai/hu',
    hu_zimo: 'audio/zipai/hu_zimo',
    pass: 'audio/zipai/pass',
};
