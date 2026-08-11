import { _decorator, Button, Component, director, game, Node, ResolutionPolicy, screen, Sprite, sys, UITransform, Vec3, view } from 'cc';
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

    @property
    public foregroundSafePaddingX: number = 15;

    @property
    public foregroundSafePaddingY: number = 15;

    private static _instance: AppLayoutAdapter | null = null;

    public static get Instance(): AppLayoutAdapter | null {
        return AppLayoutAdapter._instance;
    }

    private _snapshot: LayoutSnapshot | null = null;

    /** 受安全边界约束的前景面板的初始位置。 */
    private _foregroundBasePositions = new WeakMap<Node, Vec3>();

    /** 独立背景节点的初始缩放，用于只对背景做非等比填充。 */
    private _backgroundBaseScales = new WeakMap<Node, Vec3>();

    /** 根背景的原始尺寸，供独立背景层使用。 */
    private _backgroundBaseSizes = new WeakMap<Node, { width: number; height: number }>();

    private _refreshScheduled = false;
    private _refreshPassesRemaining = 0;
    private _layoutWidth = 1600;
    private _layoutHeight = 900;
    private _safetyScanElapsed = 0;

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
        this.applyLayout();
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
        // Canvas、Widget 以及游戏房间的 start 会在首帧完成；首帧后再刷新一次，
        // 以便处理运行时创建的游戏背景。
        this.refreshLayout();
    }

    protected onDestroy(): void {
        if (AppLayoutAdapter._instance === this) {
            AppLayoutAdapter._instance = null;
        }
    }

    protected lateUpdate(deltaTime: number): void {
        this._safetyScanElapsed += deltaTime;
        if (this._safetyScanElapsed < 0.1) return;
        this._safetyScanElapsed = 0;

        const canvas = director.getScene()?.getChildByName('Canvas') ?? null;
        if (!canvas) return;
        this.keepForegroundPanelsInsideGameBounds(canvas);
    }

    public recalculate(): void {
        const frame = this.getFrameSize();
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
        this.applyLayout();
        this.recalculate();
    }

    /**
     * 供游戏房间挂载完成后调用。背景通常在房间的 start 中动态创建，
     * 因此需要在下一帧重新扫描一次。
     */
    public refreshLayout(): void {
        this._refreshPassesRemaining = Math.max(this._refreshPassesRemaining, 3);
        this.onLayoutChanged();
        this.scheduleRefreshPass();
    }

    /**
     * 运行时不把 1600×900 当成最终屏幕，而是按真实窗口比例动态扩展
     * 逻辑画布。这样 Canvas 和前景 UI 不需要额外非等比缩放，按钮命中区域
     * 与视觉位置可以保持一致。
     *
     * - Canvas 使用和窗口相同宽高比的逻辑尺寸，负责铺满窗口；
     * - 仅大尺寸背景按实际窗口宽高比补偿缩放，从而填满整个画布。
     */
    private applyLayout(): void {
        const frame = this.getFrameSize();
        if (frame.width <= 0 || frame.height <= 0) return;

        const layout = this.getAdaptiveDesignSize(frame.width, frame.height);
        this._layoutWidth = layout.width;
        this._layoutHeight = layout.height;

        const canvas = director.getScene()?.getChildByName('Canvas') ?? null;

        view.setResolutionPolicy(ResolutionPolicy.NO_BORDER);
        view.setDesignResolutionSize(
            layout.width,
            layout.height,
            ResolutionPolicy.NO_BORDER,
        );

        if (!canvas) return;

        // 逻辑画布本身已经匹配窗口比例，不再拉伸前景节点。
        canvas.getComponent(UITransform)?.setContentSize(layout.width, layout.height);
        canvas.setScale(1, 1, canvas.scale.z);

        this.removeLegacyFullscreenBackground(canvas);
        this.stretchBackgrounds(canvas);
        this.keepForegroundPanelsInsideGameBounds(canvas);
    }

    private removeLegacyFullscreenBackground(canvas: Node): void {
        const legacy = canvas.getChildByName('__FullscreenBackground');
        if (legacy) {
            legacy.destroy();
        }
    }

    private scheduleRefreshPass(): void {
        if (this._refreshScheduled) return;
        this._refreshScheduled = true;
        this.scheduleOnce(() => {
            this._refreshScheduled = false;
            if (this._refreshPassesRemaining <= 0) return;
            this._refreshPassesRemaining--;
            this.onLayoutChanged();
            this.scheduleRefreshPass();
        }, 0);
    }

    private getAdaptiveDesignSize(frameWidth: number, frameHeight: number): { width: number; height: number } {
        const designAspect = this.designWidth / this.designHeight;
        const frameAspect = frameWidth / frameHeight;
        if (frameAspect >= designAspect) {
            return {
                width: this.designHeight * frameAspect,
                height: this.designHeight,
            };
        }
        return {
            width: this.designWidth,
            height: this.designWidth / frameAspect,
        };
    }

    private stretchBackgrounds(canvas: Node): void {
        const queue: Node[] = [...canvas.children];
        while (queue.length > 0) {
            const node = queue.shift()!;
            if (this.isStretchableBackground(node)) {
                const transform = node.getComponent(UITransform)!;
                const baseSize = this.getBaseSize(node, transform);
                const baseScale = this.getBaseScale(this._backgroundBaseScales, node);
                const sprite = node.getComponent(Sprite);
                if (sprite) {
                    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                    transform.setContentSize(this._layoutWidth, this._layoutHeight);
                }

                // 只让背景跟随动态逻辑画布铺满，前景 UI 不参与拉伸。
                // 如果是独立背景节点，优先通过 contentSize 铺满；保留 scale 作为
                // 兼容没有 Sprite 或自绘背景的兜底。
                node.setScale(
                    sprite ? baseScale.x : baseScale.x * this._layoutWidth / baseSize.width,
                    sprite ? baseScale.y : baseScale.y * this._layoutHeight / baseSize.height,
                    baseScale.z,
                );
            }
            for (const child of node.children) queue.push(child);
        }
    }

    /**
     * 部分游戏沿用了 1920×1080 的前景坐标，而房间本身是 1600×900。
     * 这会让左上 HUD、顶部栏或返回按钮的上缘跑到 Room 之外。
     *
     * 只约束承载信息或操作的面板本身；不会缩放、裁切或移动它们的子控件，
     * 因此按钮的视觉和点击范围始终保持一致。
     */
    private keepForegroundPanelsInsideGameBounds(canvas: Node): void {
        const panels = this.findForegroundSafetyPanels(canvas);
        for (const panel of panels) {
            const panelTransform = panel.getComponent(UITransform);
            if (!panelTransform) continue;

            // 容器类 UI 从游戏定义的位置重新计算，避免窗口反复变化时累积位移。
            // 具体按钮可能会被房间逻辑动态摆放，不强制恢复旧坐标。
            if (!this.isRoomChromeButton(panel)) {
                panel.setPosition(this.getBasePosition(panel));
            }

            const boundsTransform = this.findPlacementBoundsTransform(panel, canvas);
            if (!boundsTransform) continue;

            const panelBounds = panelTransform.getBoundingBoxToWorld();
            const placementBounds = boundsTransform.getBoundingBoxToWorld();
            const paddingX = Math.max(0, this.foregroundSafePaddingX);
            const paddingY = Math.max(0, this.foregroundSafePaddingY);
            const minX = placementBounds.x + paddingX;
            const maxX = placementBounds.x + placementBounds.width - paddingX;
            const minY = placementBounds.y + paddingY;
            const maxY = placementBounds.y + placementBounds.height - paddingY;

            let deltaX = 0;
            let deltaY = 0;
            if (panelBounds.width <= maxX - minX) {
                if (panelBounds.x < minX) {
                    deltaX = minX - panelBounds.x;
                } else if (panelBounds.x + panelBounds.width > maxX) {
                    deltaX = maxX - (panelBounds.x + panelBounds.width);
                }
            }
            if (panelBounds.height <= maxY - minY) {
                if (panelBounds.y < minY) {
                    deltaY = minY - panelBounds.y;
                } else if (panelBounds.y + panelBounds.height > maxY) {
                    deltaY = maxY - (panelBounds.y + panelBounds.height);
                }
            }

            if (deltaX !== 0 || deltaY !== 0) {
                const worldPosition = panel.worldPosition;
                panel.setWorldPosition(
                    worldPosition.x + deltaX,
                    worldPosition.y + deltaY,
                    worldPosition.z,
                );
            }
        }
    }

    private findForegroundSafetyPanels(canvas: Node): Node[] {
        const panels: Node[] = [];
        const queue: Node[] = [...canvas.children];
        while (queue.length > 0) {
            const node = queue.shift()!;
            if (!node.activeInHierarchy) continue;

            if (this.isForegroundSafetyPanel(node)) {
                panels.push(node);
                // 已找到容器面板时，不需要再约束其内部的标签和按钮。
                continue;
            }
            for (const child of node.children) queue.push(child);
        }
        return panels;
    }

    private isForegroundSafetyPanel(node: Node): boolean {
        if (!/(?:hud|topbar|backbutton|exitbutton)$/i.test(node.name)
            && !/^(?:UpRightPanel|TopButtonPanel|TopButtons|MahjongControlBar)$/i.test(node.name)
            && !this.isRoomChromeButton(node)) {
            return false;
        }
        const transform = node.getComponent(UITransform);
        return !!transform && transform.width > 0 && transform.height > 0;
    }

    private isRoomChromeButton(node: Node): boolean {
        if (!node.getComponent(Button)) return false;
        return /^(?:BtnBack|BtnMore|BtnVoice|BtnSetting|BtnAuto|BtnJPQ|BtnCapture|BtnShowDesktop|ReadyBtn|StartBtn|SeatBtn|MahjongFallbackBack)$/i.test(node.name);
    }

    private findPlacementBoundsTransform(_node: Node, canvas: Node): UITransform | null {
        return canvas.getComponent(UITransform);
    }

    private getBasePosition(node: Node): Vec3 {
        const cached = this._foregroundBasePositions.get(node);
        if (cached) return cached;
        const position = node.position.clone();
        this._foregroundBasePositions.set(node, position);
        return position;
    }

    private isStretchableBackground(node: Node): boolean {
        const transform = node.getComponent(UITransform);
        if (!transform) return false;
        const sprite = node.getComponent(Sprite);
        if (!sprite) return false;

        // 页面根节点（Login/Hall/GameLoader/Load/Room）本身经常同时挂背景 Sprite
        // 和 UI 子节点。调整根节点的 UITransform 尺寸只会改变该节点 Sprite 的渲染尺寸，
        // 不会改变子按钮/输入框自己的 UITransform 和点击区域，因此不能因为包含按钮就排除。
        const isPageRootBackground = /^(?:Load|Login|Hall|Room|GameLoader)$/i.test(node.name);
        const isStandaloneBackground = /^(?:tablebackground|background|desktop|bg)$/i.test(node.name);
        const isLargeBackground = transform.width >= this.designWidth * 0.7
            && transform.height >= this.designHeight * 0.7;

        if (isPageRootBackground) {
            return isLargeBackground;
        }

        return isStandaloneBackground
            && isLargeBackground
            && !this.hasButtonComponent(node);
    }

    private hasButtonComponent(root: Node): boolean {
        const queue: Node[] = [root];
        while (queue.length > 0) {
            const node = queue.shift()!;
            if (node.getComponent(Button)) {
                return true;
            }
            for (const child of node.children) queue.push(child);
        }
        return false;
    }

    private getBaseScale(cache: WeakMap<Node, Vec3>, node: Node): Vec3 {
        const cached = cache.get(node);
        if (cached) return cached;
        const baseScale = node.scale.clone();
        cache.set(node, baseScale);
        return baseScale;
    }

    private getBaseSize(node: Node, transform: UITransform): { width: number; height: number } {
        const cached = this._backgroundBaseSizes.get(node);
        if (cached) return cached;
        const width = Math.max(1, transform.width);
        const height = Math.max(1, transform.height);
        const baseSize = { width, height };
        this._backgroundBaseSizes.set(node, baseSize);
        return baseSize;
    }

    private getFrameSize(): { width: number; height: number } {
        const screenSize = screen.windowSize;
        const frameSize = view.getFrameSize();
        const width = frameSize.width > 0 ? frameSize.width : screenSize.width;
        const height = frameSize.height > 0 ? frameSize.height : screenSize.height;
        return { width, height };
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
        const frame = this.getFrameSize();
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
