// 网络消息管理者
import { decode } from "@msgpack/msgpack/dist.esm/decode.mjs";
import * as Base64 from 'js-base64';

export class MsgWrapper {
    public msgType: string = null;
    public msg: any = null;
}

export interface NetMsgHandler {
    onMessage(msgType: string, msg: any): boolean;
}

export class NetMsgManager {
    private static _instance: NetMsgManager = null;

    public static get Instance(): NetMsgManager {
        if (NetMsgManager._instance == null) {
            NetMsgManager._instance = new NetMsgManager();
        }
        return NetMsgManager._instance;
    }

    // 初始化标志
    private inited = false;

    // 缓存数据
    private cachedData: Uint8Array = null;

    // 消息队列
    private msgQueue: MsgWrapper[] = [];

    private handlers: NetMsgHandler[] = [];

    public init() {
        if (this.inited) return;
        this.inited = true;
    }

    public receiveData(buf: Uint8Array) {
        try {
            let msg: any = decode(buf);
            if (!(msg && msg.msgType)) {
                this.cacheData(buf);
                return;
            }
            this.onDecode(msg);
        }
        catch (err) {
            this.cacheData(buf);
        }
    }

    private cacheData(buf: Uint8Array) {
        if (this.cachedData && (this.cachedData.length > 2097152)) {
            // 最大只缓存2MB数据
            console.error("Cached data discarded.");
            this.cachedData = null;
        }
        let test: boolean = false;
        if (this.cachedData) {
            let newBuffer = new Uint8Array(this.cachedData.length + buf.length);
            newBuffer.set(this.cachedData);
            newBuffer.set(buf, this.cachedData.length);
            this.cachedData = newBuffer;
        } else {
            test = true;
            this.cachedData = buf;
        }
        if (test) return;
        try {
            let msg: any = decode(this.cachedData);
            if (!(msg && msg.msgType)) return;
            this.onDecode(msg);
            console.log("Cached data size: ", this.cachedData.length);
            this.cachedData = null;
        }
        catch (err) { }
    }

    private onDecode(data: any) {
        try {
            let buf: Uint8Array = (Base64 as any).Base64.toUint8Array(data.msgPack);
            let mw = new MsgWrapper();
            mw.msgType = data.msgType;
            mw.msg = decode(buf);
            this.pushMessage(mw);
        } catch (err) {
            console.log(data);
            console.log(data.msgType);
            console.log(data.msgPack);
            console.log("Unpack message error: ", err);
        }
    }

    private pushMessage(mw: MsgWrapper) {
        this.msgQueue.push(mw);
    }

    private popMessage() {
        if (this.msgQueue.length === 0) return null;
        return this.msgQueue.shift();
    }

    public registerHandler(handler: NetMsgHandler) {
        if (!handler) return;
        this.handlers.push(handler);
    }

    public unregisterHandler(handler: NetMsgHandler) {
        // 找到元素的索引
        let index = this.handlers.findIndex((item) => { return (item === handler); });
        if (index !== -1) {
            // 检查是否找到了元素
            // 从找到的索引处删除1个元素
            this.handlers.splice(index, 1); 
        }
    }

    public handleMessages() {
        let mw: MsgWrapper = this.popMessage();
        while (mw != null) {
            this.onMessage(mw);
            mw = this.popMessage();
        }
    }

    private onMessage(mw: MsgWrapper) {
        try {
            let test = false;
            for (let handler of this.handlers) {
                if (handler.onMessage(mw.msgType, mw.msg)) {
                    test = true;
                    break;
                }
            }
            if (!test && (mw.msgType !== "MsgAvatarConnect")) {
                console.error("Message(type: ", mw.msgType, ") has no handler");
            }
        }
        catch (err) {
            let tip: string = "Handle message(type: " + mw.msgType + ") error: ";
            console.log(tip, err);
        }
    }
}

