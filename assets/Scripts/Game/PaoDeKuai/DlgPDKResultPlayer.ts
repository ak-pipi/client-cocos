import { _decorator, CCInteger, Component, Label, Node, Sprite } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DlgPDKResultPlayer')
export class DlgPDKResultPlayer extends Component {
    @property({ type: Sprite })
    public headTexture: Sprite = null;

    @property({ type: Label })
    public nickname: Label = null;

    @property({ type: Label })
    public textGold: Label = null;

    @property({ type: Node })
    public flagWin: Node = null;

    @property({ type: Node })
    public flagLose: Node = null;

    public onKickOutClick(event: Event, customEventData: any | null) {

    }
}
