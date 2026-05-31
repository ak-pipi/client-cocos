import { _decorator, CCInteger, Component, Label, Node, Sprite } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('DlgTJResultPlayer')
export class DlgTJResultPlayer extends Component {
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

    @property({ type: Label })
    public fanInfo: Label = null;
}
