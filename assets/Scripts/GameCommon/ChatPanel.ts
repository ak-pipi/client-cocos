/**
 * 聊天面板 (ChatPanel)
 * 通用游戏内聊天与表情组件
 *
 * Author: AI Assistant
 */

import { _decorator, Component, Node, Label, ScrollView, Prefab, instantiate, EditBox } from 'cc';
import { WsEventRouter, ClientEventType } from '../Network/WsEventRouter';

const { ccclass, property } = _decorator;

/** 聊天消息类型 */
export enum ChatMessageType {
    Text = 'text',
    Emoji = 'emoji',
    QuickPhrase = 'quick_phrase',
}

interface ChatMessage {
    type: ChatMessageType;
    senderId: string;
    senderName: string;
    content: string;
    timestamp: number;
}

@ccclass('ChatPanel')
export class ChatPanel extends Component {
    @property({ type: Node })
    chatContainer: Node = null;         // 聊天气泡容器

    @property({ type: ScrollView })
    scrollView: ScrollView = null;       // 滚动视图

    @property({ type: EditBox })
    inputField: EditBox = null;          // 文字输入框

    @property({ type: Node })
    emojiGrid: Node = null;             // 表情网格

    @property({ type: Node })
    quickPhrasePanel: Node = null;      // 快捷语面板

    // 内部状态
    private messages: ChatMessage[] = [];
    private maxMessages: number = 50;

    start(): void {
        this.hide();
    }

    // ==================== 公共方法 ====================

    /** 显示聊天面板 */
    public show(): void {
        this.node.active = true;
        this.scrollToBottom();
    }

    /** 隐藏聊天面板 */
    public hide(): void {
        this.node.active = false;
        if (this.emojiGrid) this.emojiGrid.active = false;
        if (this.quickPhrasePanel) this.quickPhrasePanel.active = false;
    }

    /** 切换显示 */
    public toggle(): void {
        if (this.node.active) {
            this.hide();
        } else {
            this.show();
        }
    }

    // ==================== 发送消息 ====================

    /** 发送文字消息 */
    public sendText(text: string): void {
        if (!text || !text.trim()) return;
        WsEventRouter.Instance.chat(ChatMessageType.Text, text.trim());
        if (this.inputField) this.inputField.string = '';
    }

    /** 发送表情 */
    public sendEmoji(emojiId: string): void {
        WsEventRouter.Instance.chat(ChatMessageType.Emoji, emojiId);
    }

    /** 发送快捷语 */
    public sendQuickPhrase(phraseId: string): void {
        WsEventRouter.Instance.chat(ChatMessageType.QuickPhrase, phraseId);
        if (this.quickPhrasePanel) this.quickPhrasePanel.active = false;
    }

    // ==================== 接收消息 ====================

    /** 收到新消息 */
    public receiveMessage(message: ChatMessage): void {
        this.messages.push(message);
        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
        }
        this.addMessageBubble(message);
        this.scrollToBottom();
    }

    /** 清空消息 */
    public clearMessages(): void {
        this.messages = [];
        if (this.chatContainer) {
            this.chatContainer.removeAllChildren();
        }
    }

    // ==================== UI 操作 ====================

    /** 切换表情面板 */
    public toggleEmoji(): void {
        if (this.emojiGrid) {
            this.emojiGrid.active = !this.emojiGrid.active;
            if (this.quickPhrasePanel) this.quickPhrasePanel.active = false;
        }
    }

    /** 切换快捷语面板 */
    public toggleQuickPhrases(): void {
        if (this.quickPhrasePanel) {
            this.quickPhrasePanel.active = !this.quickPhrasePanel.active;
            if (this.emojiGrid) this.emojiGrid.active = false;
        }
    }

    // ==================== 私有方法 ====================

    private addMessageBubble(message: ChatMessage): void {
        // 基本实现：子类或预制体应覆写此方法以自定义气泡样式
        console.log(`[ChatPanel] [${message.senderName}]: ${message.content}`);
    }

    private scrollToBottom(): void {
        // 基本实现：滚动到底部
        // 实际使用时需要配合 ScrollView 组件
    }
}
