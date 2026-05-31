import { _decorator, Component, Node, AudioClip, AudioSource } from 'cc';
import { ResourceLoader } from '../../Manager/ResourceLoader';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';

const { ccclass, property } = _decorator;

@ccclass('AudioControl')
export class AudioControl extends Component {
    // 各位玩家的游戏音效
    @property({ type: [AudioSource] })
    private gameSources: AudioSource[] = [];

    // 各位玩家的常用语音效
    @property({ type: [AudioSource] })
    private phraseSources: AudioSource[] = [];

    // 共用音效
    @property({ type: AudioSource })
    private shareSource: AudioSource = null;

    // 共用循环音效
    @property({ type: AudioSource })
    private loopSource: AudioSource = null;

    // 是否正在播放发牌声音
    private dealing: boolean = false;

    // 等待播放发牌声音已过了多久，单位秒
    private dealElapsed: number = 0.0;

    // 是否正在播放循环音效
    private looping: boolean = false;

    // 播放循环音效剩余多少时间，单位秒
    private loopTime: number = 0.0;

    start() {
        this.onSoundVolumeChanged(null, null);
        ResourceLoader.Instance.loadAsset("TaoJiangMahjongAudio", "bg", AudioClip, (clip: AudioClip) => {
            Client.Instance.playBackgroundMusic(clip);
        });
    }

    update(deltaTime: number) {
        if (this.dealing) {
            this.dealElapsed = this.dealElapsed + deltaTime;
            if (this.dealElapsed > 0.5) {
                this.dealing = false;
                this.playDeal();
            }
        }
        if (this.looping) {
            this.loopTime = this.loopTime - deltaTime;
            if (this.loopTime <= 0.0) {
                this.looping = false;
                if (this.loopSource) {
                    this.loopSource.stop();
                }
            }
        }
    }

    // 播放开始新一局声音
    public playStart() {
        if (GameManager.Instance.SoundMute) return;
        ResourceLoader.Instance.loadAsset("TaoJiangMahjongAudio", "gamestart", AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.shareSource.stop();
                this.shareSource.clip = clip;
                this.shareSource.play();
            }
        });
        this.dealing = true;
        this.dealElapsed = 0.0;
    }

    // 播放发牌声音
    private playDeal() {
        ResourceLoader.Instance.loadAsset("TaoJiangMahjongAudio", "dealcard", AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.loopSource.stop();
                this.loopSource.clip = clip;
                this.loopSource.play();
                this.looping = true;
                this.loopTime = 1;
            }
        });
    }

    // 播放摸牌声音
    public playFetch(clientSeat: number) {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[clientSeat]) return;
        let clipName: string = "mopai";
        ResourceLoader.Instance.loadAsset("TaoJiangMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[clientSeat].stop();
                this.gameSources[clientSeat].clip = clip;
                this.gameSources[clientSeat].play();
            }
        });
    }

    // 播放出牌声音
    public playPlay(male: boolean, clientSeat: number) {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[clientSeat]) return;
        let clipName: string = "chupai";
        let path: string = male ? "Male/" : "Female/";
        clipName = path + clipName;
        ResourceLoader.Instance.loadAsset("TaoJiangMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[clientSeat].stop();
                this.gameSources[clientSeat].clip = clip;
                this.gameSources[clientSeat].play();
            }
        });
    }

    // 播放碰牌声音
    public playPeng(male: boolean, clientSeat: number) {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[clientSeat]) return;
        let clipName: string = "peng";
        let path: string = male ? "Male/" : "Female/";
        clipName = path + clipName;
        ResourceLoader.Instance.loadAsset("TaoJiangMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[clientSeat].stop();
                this.gameSources[clientSeat].clip = clip;
                this.gameSources[clientSeat].play();
            }
        });
    }

    // 播放杠牌声音
    public playGang(male: boolean, clientSeat: number) {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[clientSeat]) return;
        let clipName: string = "gang";
        let path: string = male ? "Male/" : "Female/";
        clipName = path + clipName;
        ResourceLoader.Instance.loadAsset("TaoJiangMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[clientSeat].stop();
                this.gameSources[clientSeat].clip = clip;
                this.gameSources[clientSeat].play();
            }
        });
    }

    // 播放胡牌声音
    public playHu(male: boolean, clientSeat: number) {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[clientSeat]) return;
        let clipName: string = "hu";
        let path: string = male ? "Male/" : "Female/";
        clipName = path + clipName;
        ResourceLoader.Instance.loadAsset("TaoJiangMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[clientSeat].stop();
                this.gameSources[clientSeat].clip = clip;
                this.gameSources[clientSeat].play();
            }
        });
    }

    // 播放过牌声音
    public playPass(male: boolean, clientSeat: number) {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[clientSeat]) return;
        let clipName: string = "guo";
        let path: string = male ? "Male/" : "Female/";
        clipName = path + clipName;
        ResourceLoader.Instance.loadAsset("TaoJiangMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[clientSeat].stop();
                this.gameSources[clientSeat].clip = clip;
                this.gameSources[clientSeat].play();
            }
        });
    }

    // 播放告警声音
    public playAlert() {
        if (GameManager.Instance.SoundMute) return;
        if (!this.shareSource) return;
        ResourceLoader.Instance.loadAsset("TaoJiangMahjongAudio", "warning", AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.shareSource.stop();
                this.shareSource.clip = clip;
                this.shareSource.play();
            }
        });
    }

    // 播放倒计时声音
    public playCountdown(cnt: number) {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[0]) return;
        if (cnt < 0 || cnt > 5) return;
        let clipName: string = "Clock/warning" + cnt.toString();
        ResourceLoader.Instance.loadAsset("TaoJiangMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[0].stop();
                this.gameSources[0].clip = clip;
                this.gameSources[0].play();
            }
        });
    }

    // 播放输赢结局声音
    public playResult(winOrLose: number) {
        if (GameManager.Instance.SoundMute) return;
        if (!this.shareSource) return;
        let clipName: string = (winOrLose === 1) ? "Game/win" : "Game/lose";
        ResourceLoader.Instance.loadAsset("TaoJiangMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.shareSource.stop();
                this.shareSource.clip = clip;
                this.shareSource.play();
            }
        });
    }

    // 播放常用语声音
    public playPhrase(male: boolean, clientSeat: number, phrase: number) {
        if (GameManager.Instance.SoundMute) return;
        if (phrase < 0 || phrase > 8) return;
        if (!this.phraseSources[clientSeat]) return;
        phrase = phrase + 1;
        let clipName: string = null;
        if (phrase < 10) clipName = male ? "Phrase/Male/phrase0" : "Phrase/Female/phrase0";
        else clipName = male ? "Phrase/Male/phrase" : "Phrase/Female/phrase";
        clipName = clipName + phrase.toString();
        ResourceLoader.Instance.loadAsset("TaoJiangMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.phraseSources[clientSeat].stop();
                this.phraseSources[clientSeat].clip = clip;
                this.phraseSources[clientSeat].play();
            }
        });
    }

    public onSoundVolumeChanged(event: Event, customEventData: any | null) {
        let volume: number = GameManager.Instance.SoundVolume;
        if (GameManager.Instance.SoundMute)
            volume = 0;
        for (let i: number = 0; i < this.gameSources.length; i++) {
            let src: AudioSource = this.gameSources[i];
            if (src) src.volume = volume;
        }
        for (let i: number = 0; i < this.phraseSources.length; i++) {
            let src: AudioSource = this.phraseSources[i];
            if (src) src.volume = volume;
        }
        if (this.shareSource) this.shareSource.volume = volume;
        if (this.loopSource) this.loopSource.volume = volume;
    }
}
