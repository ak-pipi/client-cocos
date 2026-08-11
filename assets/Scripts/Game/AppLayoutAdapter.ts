import { _decorator, Component, director, game, Node, ResolutionPolicy, screen, sys, view } from 'cc';
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
    public designWidth: number = 1600;

    @property
    public designHeight: number = 900;

    private static _instance: AppLayoutAdapter | null = null;

    public static get Instance(): AppLayoutAdapter | null {
        return AppLayoutAdapter._instance;
    }

    private _snapshot: LayoutSnapshot | null = null;

    private _canvas: Node | null = null;
    private _canvasBaseScaleX = 1;
    private _canvasBaseScaleY = 1;

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
        this.applyStretchLayout();
    }

    protected onEnable(): void {
        view.on('canvas-resize', this.onLayoutChanged, this);
        game.on(game.EVENT_SHOW, this.onLayoutChanged, this);
        game.on(game.EVENT_HIDE, this.onLayoutChanged, this);
        this.onLayoutChanged();
    }

    protected onDisable(): void {
        view.off('canvas-resize', this.onLayoutChanged, this);
        game.off(game.EVENT_SHOW, this.onLayoutChanged, this);
        game.off(game.EVENT_HIDE, this.onLayoutChanged, this);
    }

    protected start(): void {
        // Canvas and Widget finish their first layout before start. Apply the
        // stretch once more so that their initial layout cannot reset it.
        this.applyStretchLayout();
    }

    protected onDestroy(): void {
        if (AppLayoutAdapter._instance === this) {
            AppLayoutAdapter._instance = null;
        }
    }

    public recalculate(): void {
        const frame = { width: screen.windowSize.width, height: screen.windowSize.height };
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

    private onLayoutChanged(): void {
        this.applyStretchLayout();
        this.recalculate();
    }

    /**
     * Cocos Canvas keeps its camera projection proportional to the physical
     * screen, even when EXACT_FIT is selected. Therefore the policy alone still
     * leaves a 16:9 UI canvas centred inside a wider screen. Scale the Canvas
     * itself by the aspect-ratio difference to deliberately stretch all game UI
     * into the complete viewport without cropping it.
     */
    private applyStretchLayout(): void {
        view.setDesignResolutionSize(
            this.designWidth,
            this.designHeight,
            ResolutionPolicy.EXACT_FIT,
        );

        const canvas = this.getCanvas();
        if (!canvas) return;

        const frame = screen.windowSize;
        if (frame.width <= 0 || frame.height <= 0) return;

        const designAspect = this.designWidth / this.designHeight;
        const frameAspect = frame.width / frame.height;
        const stretchX = frameAspect / designAspect;

        canvas.setScale(
            this._canvasBaseScaleX * stretchX,
            this._canvasBaseScaleY,
            canvas.scale.z,
        );
    }

    private getCanvas(): Node | null {
        if (this._canvas?.isValid) return this._canvas;

        const canvas = director.getScene()?.getChildByName('Canvas') ?? null;
        if (!canvas) return null;

        this._canvas = canvas;
        this._canvasBaseScaleX = canvas.scale.x;
        this._canvasBaseScaleY = canvas.scale.y;
        return canvas;
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
        const frame = { width: screen.windowSize.width, height: screen.windowSize.height };
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
