import { _decorator, Component, Node, AudioClip, AudioSource } from 'cc';
import { ResourceLoader } from '../../Manager/ResourceLoader';
import { GameManager } from '../../Manager/GameManager';
import { Client } from '../Client';
import { MahjongPattern } from '../Common/MahjongRoomBase';

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
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", "bg", AudioClip, (clip: AudioClip) => {
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
    public playStart(): void {
        if (GameManager.Instance.SoundMute) return;
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", "gamestart", AudioClip, (clip: AudioClip) => {
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
    private playDeal(): void {
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", "dealcard", AudioClip, (clip: AudioClip) => {
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
    public playFetch(male: boolean, clientSeat: number): void {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[clientSeat]) return;
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", "fetch", AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[clientSeat].stop();
                this.gameSources[clientSeat].clip = clip;
                this.gameSources[clientSeat].play();
            }
        });
    }

    // 播放出牌声音
    public playPlay(male: boolean, clientSeat: number, pattern: number, number: number): void {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[clientSeat]) return;
        let clipName: string = null;
        let path: string = male ? "ChuPai/Male/" : "ChuPai/Female/";
        // 根据花色和数字生成音效名
        if (pattern >= 1 && pattern <= 3) {
            // 万、条、筒
            clipName = path + pattern + "_" + number.toString();
        } else if (pattern >= 4 && pattern <= 7) {
            // 风牌
            clipName = path + "feng_" + pattern.toString();
        } else if (pattern >= 8 && pattern <= 10) {
            // 箭牌
            clipName = path + "jian_" + pattern.toString();
        } else {
            clipName = path + "play";
        }
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[clientSeat].stop();
                this.gameSources[clientSeat].clip = clip;
                this.gameSources[clientSeat].play();
            }
        });
    }

    // 播放碰牌声音
    public playPeng(male: boolean, clientSeat: number): void {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[clientSeat]) return;
        let clipName: string = male ? "Action/Male/peng" : "Action/Female/peng";
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[clientSeat].stop();
                this.gameSources[clientSeat].clip = clip;
                this.gameSources[clientSeat].play();
            }
        });
    }

    // 播放杠牌声音
    public playGang(male: boolean, clientSeat: number): void {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[clientSeat]) return;
        let clipName: string = male ? "Action/Male/gang" : "Action/Female/gang";
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[clientSeat].stop();
                this.gameSources[clientSeat].clip = clip;
                this.gameSources[clientSeat].play();
            }
        });
    }

    // 播放胡牌声音
    public playHu(male: boolean, clientSeat: number): void {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[clientSeat]) return;
        let clipName: string = male ? "Action/Male/hu" : "Action/Female/hu";
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[clientSeat].stop();
                this.gameSources[clientSeat].clip = clip;
                this.gameSources[clientSeat].play();
            }
        });
    }

    // 播放过牌声音
    public playPass(male: boolean, clientSeat: number): void {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[clientSeat]) return;
        let clipName: string = male ? "Action/Male/pass" : "Action/Female/pass";
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[clientSeat].stop();
                this.gameSources[clientSeat].clip = clip;
                this.gameSources[clientSeat].play();
            }
        });
    }

    // 播放起手胡声音（长沙麻将特有）
    public playQiShouHu(clientSeat: number): void {
        if (GameManager.Instance.SoundMute) return;
        if (!this.shareSource) return;
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", "Special/qishouhu", AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.shareSource.stop();
                this.shareSource.clip = clip;
                this.shareSource.play();
            }
        });
    }

    // 播放翻鸟声音（长沙麻将特有）
    public playBird(): void {
        if (GameManager.Instance.SoundMute) return;
        if (!this.shareSource) return;
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", "Special/bird", AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.shareSource.stop();
                this.shareSource.clip = clip;
                this.shareSource.play();
            }
        });
    }

    // 播放告警声音
    public playAlert(): void {
        if (GameManager.Instance.SoundMute) return;
        if (!this.shareSource) return;
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", "warning", AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.shareSource.stop();
                this.shareSource.clip = clip;
                this.shareSource.play();
            }
        });
    }

    // 播放倒计时声音
    public playCountdown(cnt: number): void {
        if (GameManager.Instance.SoundMute) return;
        if (!this.gameSources[0]) return;
        if (cnt < 0 || cnt > 5) return;
        let clipName: string = "Clock/warning" + cnt.toString();
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.gameSources[0].stop();
                this.gameSources[0].clip = clip;
                this.gameSources[0].play();
            }
        });
    }

    // 播放输赢结局声音
    public playResult(winOrLose: number): void {
        if (GameManager.Instance.SoundMute) return;
        if (!this.shareSource) return;
        let clipName: string = (winOrLose === 1) ? "Game/win" : "Game/lose";
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.shareSource.stop();
                this.shareSource.clip = clip;
                this.shareSource.play();
            }
        });
    }

    // 播放常用语声音
    public playPhrase(male: boolean, clientSeat: number, phrase: number): void {
        if (GameManager.Instance.SoundMute) return;
        if (phrase < 0 || phrase > 8) return;
        if (!this.phraseSources[clientSeat]) return;
        phrase = phrase + 1;
        let clipName: string = null;
        if (phrase < 10) clipName = male ? "Phrase/Male/phrase0" : "Phrase/Female/phrase0";
        else clipName = male ? "Phrase/Male/phrase" : "Phrase/Female/phrase";
        clipName = clipName + phrase.toString();
        ResourceLoader.Instance.loadAsset("ChangShaMahjongAudio", clipName, AudioClip, (clip: AudioClip) => {
            if (clip) {
                this.phraseSources[clientSeat].stop();
                this.phraseSources[clientSeat].clip = clip;
                this.phraseSources[clientSeat].play();
            }
        });
    }

    // 音量变化回调
    public onSoundVolumeChanged(event: Event, customEventData: any | null): void {
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
