import { _decorator, Component, Label, Node, Sprite, SpriteFrame, Prefab, instantiate } from 'cc';
import { ResourceLoader } from '../../Manager/ResourceLoader';
import { GameManager } from '../../Manager/GameManager';
import { ChatText } from '../ChatText';

const { ccclass, property } = _decorator;

@ccclass('ChangShaMahjongPlayer')
export class ChangShaMahjongPlayer extends Component {

    @property({ type: Node })
    private head: Node = null;

    @property({ type: Sprite })
    private headSprite: Sprite = null;

    @property({ type: Node })
    private readyFlag: Node = null;

    @property({ type: Node })
    private offlineFlag: Node = null;

    @property({ type: Node })
    private autoFlag: Node = null;

    @property({ type: Label })
    private textName: Label = null;

    @property({ type: Label })
    private textGold: Label = null;

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

    private spriteFrame: SpriteFrame = null;

    private chating: boolean = false;

    private chatElapsed: number = 0.0;

    private emojiObj: Node = null;

    private emojiPrefabs: Prefab[] = new Array(27);

    start() {}

    update(deltaTime: number) {
        this.updateChat(deltaTime);
    }

    public show(show: boolean): void {
        this.node.active = show;
    }

    public setPlayerInfo(playerInfo: any): void {
        if (!playerInfo) return;
        if (this.head) this.head.active = true;
        this.setHeadImgUrl(playerInfo.headUrl);
        if (this.textName) this.textName.string = playerInfo.nickname;
        if (this.textGold) this.textGold.string = playerInfo.gold.toString();
        if (this.offlineFlag) this.offlineFlag.active = playerInfo.offline;
        if (this.autoFlag) this.autoFlag.active = playerInfo.authorize;
    }

    private setHeadImgUrl(url: string): void {
        if (!url) return;
        if (!this.headSprite) return;
        GameManager.Instance.loadSpriteFrame(url, (spriteFrame: SpriteFrame) => {
            this.spriteFrame = spriteFrame;
            this.headSprite.spriteFrame = spriteFrame;
        });
    }

    public setHeadTexture(tex: SpriteFrame): void {
        this.spriteFrame = tex;
        if (this.headSprite) this.headSprite.spriteFrame = tex;
    }

    public getTexture(): SpriteFrame {
        return this.spriteFrame;
    }

    public clear(): void {
        this.spriteFrame = null;
        if (this.headSprite) this.headSprite.spriteFrame = null;
        if (this.readyFlag) this.readyFlag.active = false;
        if (this.offlineFlag) this.offlineFlag.active = false;
        if (this.autoFlag) this.autoFlag.active = false;
        if (this.textName) this.textName.string = null;
        if (this.textGold) this.textGold.string = null;
        if (this.chatMeme) this.chatMeme.active = false;
        if (this.chatText) this.chatText.show(false);
        if (this.chatEmoji) this.chatEmoji.active = false;
        if (this.chatTalk) this.chatTalk.active = false;
        this.chating = false;
    }

    public setOffline(offline: boolean): void {
        if (this.offlineFlag) this.offlineFlag.active = offline;
    }

    public setReady(ready: boolean): void {
        if (this.readyFlag) this.readyFlag.active = ready;
    }

    public setAuto(auto: boolean): void {
        if (this.autoFlag) this.autoFlag.active = auto;
    }

    public setChatMeme(image: SpriteFrame): void {
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

    public setChatEmoji(idx: number): void {
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

    private setChatEmojiPrefab(prefab: Prefab): void {
        this.emojiObj = instantiate(prefab);
        if (this.emojiObj) {
            this.chatEmoji.active = true;
            this.emojiObj.parent = this.chatEmoji;
            this.chating = true;
            this.chatElapsed = 0.0;
        } else {
            this.chatEmoji.active = false;
        }
    }

    private phrases: string[] = [
        "快点吧，等到花儿都谢了",
        "你的牌打得太好了",
        "真是一个悲剧啊",
        "这牌太烂了",
        "你家里是开银行的吧",
        "不要吵啦，专心玩牌吧",
        "大清早，鸡都还没叫慌什么",
        "再见了，我会想念大家的",
        "别磨叽，快点出牌"
    ];

    public setChatPhrase(idx: number): void {
        if (idx < 0 || idx > 8) return;
        this.setChatText(this.phrases[idx]);
    }

    public setChatText(text: string): void {
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

    private updateChat(deltaTime: number): void {
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

    public showChatTalk(show: boolean): void {
        if (this.chatTalk) this.chatTalk.active = show;
    }
}
