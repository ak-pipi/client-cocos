import { Component, Node } from 'cc';
import { sanitizeAllEditBoxDefaultLabels } from '../../UI/UiKit';

export class DlgBase extends Component {
    protected onLoad(): void {
        this.node.on(Node.EventType.ACTIVE_CHANGED, this.onActiveChanged, this);
        this.node.on(Node.EventType.ACTIVE_CHANGED, this.scrubEditBoxLabels, this);
    }

    protected start(): void {
        this.onActiveChanged();
        this.scrubEditBoxLabels();
    }

    protected onActiveChanged(): void {}

    public onCloseClicked() {
        this.beforeClose();
        this.node.active = false;
    }

    protected beforeClose(): void {}

    private scrubEditBoxLabels(): void {
        sanitizeAllEditBoxDefaultLabels(this.node);
    }
}
