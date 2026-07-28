import { _decorator, Button, Component, Node } from 'cc';
import { DlgBase } from './DlgBase';
import { Client } from '../Client';
const { ccclass, property } = _decorator;

@ccclass('DlgShop')
export class DlgShop extends DlgBase {
    start() {
        super.start();
    }

    update(deltaTime: number) {}

    public onBuyClicked(button: Button, customEventData: any) {
        Client.Instance.showPromptTip("钻石功能已下线", 2.0);
    }
}
