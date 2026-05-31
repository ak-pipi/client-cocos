import { _decorator, Component, Node, Label, Sprite, SpriteFrame, Prefab, instantiate } from 'cc';
import { GameManager } from '../../Manager/GameManager';
import { ResourceLoader } from '../../Manager/ResourceLoader';
import { TaoJiangMahjongRoom } from './TaoJiangMahjongRoom';
import { ChatText } from '../ChatText';

const { ccclass, property } = _decorator;

@ccclass('TaoJiangMahjongSeatPanel')
export class TaoJiangMahjongSeatPanel extends Component {
    @property({ type: Node })
    private head: Node = null;

    @property({ type: Sprite })
    private headSprite: Sprite = null;

    @property({ type: Node })
    private readyFlag: Node = null;

    @property({ type: Node })
    private offlineFlag: Node = null;

    @property({ type: Node })
    private ownerFlag: Node = null;

    @property({ type: Label })
    private textName: Label = null;

    @property({ type: Label })
    private textWinRate: Label = null;

    @property({ type: Node })
    private btnSit: Node = null;

    @property({ type: Node })
    private menuNode: Node = null;

    @property({ type: Node })
    private menuKick: Node = null;

    @property({ type: Node })
    private menuDetail: Node = null;

    @property({ type: Node })
    private chatMeme: Node = null;

    @property({ type: ChatText })
    private chatText: ChatText = null;

    @property({ type: Node })
    private chatEmoji: Node = null;

    @property({ type: Node })
    private chatTalk: Node = null;

    @property({ type: Sprite })
    private chatMemeImage: Sprite = null;

    private emojiObj: Node = null;

    private seat: number = -1;

    private room: TaoJiangMahjongRoom = null;

    private chating: boolean = false;

    private chatElapsed: number = 0.0;

    private emojiPrefabs: Prefab[] = new Array(27);

    start() {}

    update(deltaTime: number) {
        this.updateChat(deltaTime);
    }

    public setData(seat: number, room: TaoJiangMahjongRoom) {
        this.seat = seat;
        this.room = room;
    }

    public showMenu(show: boolean) {
        if (this.menuNode) this.menuNode.active = show;
    }

    public setPlayerInfo(playerInfo: any, isSelf: boolean, isOwner: boolean) {
        if (!playerInfo) return;
        if (this.head) this.head.active = true;
        this.setHeadImgUrl(playerInfo.headUrl);
        if (this.textName) this.textName.string = playerInfo.nickname;
        if (this.textWinRate) this.textWinRate.string = playerInfo.winRate.toFixed(2);
        if (this.readyFlag) this.readyFlag.active = playerInfo.ready;
        if (this.offlineFlag) this.offlineFlag.active = playerInfo.offline;
        if (this.ownerFlag) this.ownerFlag.active = isOwner;
        if (this.btnSit) this.btnSit.active = false;
    }

    private setHeadImgUrl(url: string) {
        if (!url) return;
        if (!this.headSprite) return;
        GameManager.Instance.loadSpriteFrame(url, (spriteFrame: SpriteFrame) => {
            this.headSprite.spriteFrame = spriteFrame;
        });
    }

    public setEmpty() {
        if (this.head) this.head.active = false;
        if (this.readyFlag) this.readyFlag.active = false;
        if (this.offlineFlag) this.offlineFlag.active = false;
        if (this.ownerFlag) this.ownerFlag.active = false;
        if (this.textName) this.textName.string = "";
        if (this.textWinRate) this.textWinRate.string = "";
        if (this.btnSit) this.btnSit.active = true;
        this.showMenu(false);
        if (this.chatMeme) this.chatMeme.active = false;
        if (this.chatText) this.chatText.show(false);
        if (this.chatEmoji) this.chatEmoji.active = false;
        if (this.chatTalk) this.chatTalk.active = false;
        this.chating = false;
    }

    public setReady(ready: boolean) {
        if (this.readyFlag) this.readyFlag.active = ready;
    }

    public setOffline(offline: boolean) {
        if (this.offlineFlag) this.offlineFlag.active = offline;
    }

    public setOwnerSeat(setting: boolean) {
        if (this.ownerFlag) this.ownerFlag.active = setting;
    }

    public setWinRate(winRate: number) {
        if (this.textWinRate) this.textWinRate.string = winRate.toFixed(2);
    }

    public setChatMeme(image: SpriteFrame) {
        if (this.emojiObj) {
            this.emojiObj.destroy();
            this.emojiObj = null;
        }
        if (this.chatText) this.chatText.show(false);
        if (this.chatEmoji) this.chatEmoji.active = false;
        if (this.chatMeme) this.chatMeme.active = true;
        else return;
        if (this.chatMemeImage) this.chatMemeImage.spriteFrame = image;
        else return;
        this.chating = true;
        this.chatElapsed = 0.0;
    }

    public setChatEmoji(idx: number) {
        if (idx < 0 || idx > 26) return;
        if (this.chatMeme) this.chatMeme.active = false;
        if (this.emojiObj) {
            this.emojiObj.destroy();
            this.emojiObj = null;
        }
        if (this.chatText) this.chatText.show(false);
        if (!this.chatEmoji) return;
        let prefab: Prefab = this.emojiPrefabs[idx];
        if (!prefab) {
            let sn: number = idx + 1;
            let tmp: string = (sn < 10) ? ("0" + sn.toString()) : sn.toString();
            let prefabName: string = tmp + "/Emoji" + tmp;
            ResourceLoader.Instance.loadAsset("GameEmoji", prefabName, Prefab, (prefab: Prefab) => {
                if (!prefab) return;
                this.emojiPrefabs[idx] = prefab;
                this.setChatEmojiPrefab(prefab);
            });
        } else {
            this.setChatEmojiPrefab(prefab);
        }
    }

    private setChatEmojiPrefab(prefab: Prefab) {
        this.emojiObj = instantiate(prefab);
        if (this.emojiObj) {
            this.chatEmoji.active = true;
            this.emojiObj.parent = this.chatEmoji;
            this.chating = true;
            this.chatElapsed = 0.0;
        }
        else {
            this.chatEmoji.active = false;
        }
    }

    private phrases: string[] = [
        "快点儿吧，等到花儿都谢了",
        "你的牌打得太好啦",
        "整个一个悲剧啊",
        "一手烂牌臭到底",
        "你家里是开银行的吧",
        "不要吵啦，专心玩牌吧",
        "大清早，鸡都还没叫慌什么",
        "再见了，我会想念大家的",
        "别墨迹，快点出牌"
    ];

    public setChatPhrase(idx: number) {
        if (idx < 0 || idx > 8) return;
        this.setChatText(this.phrases[idx]);
    }

    public setChatText(text: string) {
        if (!text) return;
        if (this.chatMeme) this.chatMeme.active = false;
        if (this.emojiObj) {
            this.emojiObj.destroy();
            this.emojiObj = null;
        }
        if (this.chatEmoji) this.chatEmoji.active = false;
        if (this.chatText) {
            this.chatText.show(true);
            this.chatText.setChatText(text);
        }
        this.chating = true;
        this.chatElapsed = 0.0;
    }

    private updateChat(deltaTime: number) {
        if (!this.chating) return;
        this.chatElapsed = this.chatElapsed + deltaTime;
        if (this.chatElapsed > 5.0) {
            this.chating = false;
            if (this.chatMeme) this.chatMeme.active = false;
            if (this.chatText) this.chatText.show(false);
            if (this.emojiObj) {
                this.emojiObj.destroy();
                this.emojiObj = null;
            }
            if (this.chatEmoji) this.chatEmoji.active = false;
        }
    }

    public showChatTalk(show: boolean) {
        if (this.chatTalk) this.chatTalk.active = show;
    }

    public onSitClick(event: Event, customEventData: any | null) {
        if (this.room) this.room.OnSeatPanelClick(event, customEventData);
    }

    public onKickClick(event: Event, customEventData: any | null) {
        if (this.room && this.menuNode) this.menuNode.active = false;
    }

    public onDetailClick(event: Event, customEventData: any | null) {
        if (this.room && this.menuNode) this.menuNode.active = false;
    }

    public onCloseClick() {
        this.showMenu(false);
    }
}
