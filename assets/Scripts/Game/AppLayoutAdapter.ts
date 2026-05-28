import { _decorator, Component, game, sys, view } from 'cc';
const { ccclass, property } = _decorator;

export type LayoutSnapshot = {
    frameWidth: number;
    frameHeight: number;
    visibleWidth: number;
    visibleHeight: number;
    dpr: number;
    safeLeft: number;
    safeRight: number;
    safeTop: number;
    safeBottom: number;
    safeWidth: number;
    safeHeight: number;
    layoutScale: number;
    orientation: 'landscape' | 'portrait';
};

@ccclass('AppLayoutAdapter')
export class AppLayoutAdapter extends Component {
    @property
    public designWidth: number = 1920;

    @property
    public designHeight: number = 1080;

    private static _instance: AppLayoutAdapter | null = null;

    public static get Instance(): AppLayoutAdapter | null {
        return AppLayoutAdapter._instance;
    }

    private _snapshot: LayoutSnapshot | null = null;

    public get Snapshot(): LayoutSnapshot | null {
        return this._snapshot;
    }

    protected onLoad(): void {
        if (!AppLayoutAdapter._instance) {
            AppLayoutAdapter._instance = this;
        } else if (AppLayoutAdapter._instance !== this) {
            this.destroy();
            return;
        }
        this.node.name = 'AppLayoutAdapter';
    }

    protected onEnable(): void {
        view.on('canvas-resize', this.recalculate, this);
        game.on(game.EVENT_SHOW, this.recalculate, this);
        game.on(game.EVENT_HIDE, this.recalculate, this);
        this.recalculate();
    }

    protected onDisable(): void {
        view.off('canvas-resize', this.recalculate, this);
        game.off(game.EVENT_SHOW, this.recalculate, this);
        game.off(game.EVENT_HIDE, this.recalculate, this);
    }

    protected onDestroy(): void {
        if (AppLayoutAdapter._instance === this) {
            AppLayoutAdapter._instance = null;
        }
    }

    public recalculate(): void {
        const frame = view.getFrameSize();
        const visible = view.getVisibleSize();
        const dpr = this.getDevicePixelRatio();
        const orientation: 'landscape' | 'portrait' = frame.width >= frame.height ? 'landscape' : 'portrait';

        const safe = this.getSafeArea();

        const safeLeft = Math.max(0, safe.x);
        const safeBottom = Math.max(0, safe.y);
        const safeRight = Math.max(0, frame.width - (safe.x + safe.width));
        const safeTop = Math.max(0, frame.height - (safe.y + safe.height));

        const safeWidth = Math.max(0, frame.width - safeLeft - safeRight);
        const safeHeight = Math.max(0, frame.height - safeTop - safeBottom);

        const scaleX = visible.width > 0 ? visible.width / this.designWidth : 1;
        const scaleY = visible.height > 0 ? visible.height / this.designHeight : 1;
        const layoutScale = Math.min(scaleX, scaleY);

        this._snapshot = {
            frameWidth: frame.width,
            frameHeight: frame.height,
            visibleWidth: visible.width,
            visibleHeight: visible.height,
            dpr,
            safeLeft,
            safeRight,
            safeTop,
            safeBottom,
            safeWidth,
            safeHeight,
            layoutScale,
            orientation,
        };
    }

    private getDevicePixelRatio(): number {
        try {
            const anyWindow = window as any;
            const dpr = typeof anyWindow?.devicePixelRatio === 'number' ? anyWindow.devicePixelRatio : 1;
            return dpr > 0 ? dpr : 1;
        } catch {
            return 1;
        }
    }

    private getSafeArea(): { x: number; y: number; width: number; height: number } {
        const frame = view.getFrameSize();
        if (!sys.isMobile) {
            return { x: 0, y: 0, width: frame.width, height: frame.height };
        }
        try {
            const anyView = view as any;
            if (typeof anyView.getSafeAreaRect === 'function') {
                const rect = anyView.getSafeAreaRect();
                if (rect && typeof rect.x === 'number') {
                    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                }
            }
        } catch {}
        return { x: 0, y: 0, width: frame.width, height: frame.height };
    }
}

