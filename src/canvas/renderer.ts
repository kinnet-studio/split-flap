import { type CanvasFactory, FaceCache } from '../render/face-cache.js';
import type { FacePainter } from '../render/faces.js';
import { defaultFlipCurve, type FlipCurve } from '../render/flip-curve.js';
import { type FitMode, fitScale } from '../render/fit.js';
import { MAX_FRAME_DT } from '../render/frame.js';
import { stackDepth } from '../render/stack.js';
import {
    type BoardLayout,
    layout,
    type LayoutOptions,
    type RenderTarget,
    type UnitSlot,
} from '../render/layout.js';
import {
    type FlapStyle,
    resolveStyle,
    type ResolvedFlapStyle,
} from '../render/style.js';
import { drawUnit } from './draw-unit.js';

export interface FrameScheduler {
    request(callback: (time: number) => void): number;
    cancel(id: number): void;
}

const browserScheduler: FrameScheduler = {
    request: callback => requestAnimationFrame(callback),
    cancel: id => cancelAnimationFrame(id),
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CanvasFlapRendererOptions extends LayoutOptions {
    canvas: HTMLCanvasElement;
    target: RenderTarget;
    /** One painter for every field, or one per board field name. */
    face: FacePainter<any> | Record<string, FacePainter<any>>;
    style?: FlapStyle;
    flipCurve?: FlipCurve;
    /** Default `globalThis.devicePixelRatio ?? 1`, re-read on resize(). */
    dpr?: number;
    /** Creates offscreen face canvases. */
    createCanvas?: CanvasFactory;
    /** Frame loop used by start(). Default requestAnimationFrame. */
    scheduler?: FrameScheduler;
    /**
     * Keep the board fitted to `element` (via ResizeObserver) by setting
     * {@link CanvasFlapRenderer.scale}. Default mode `'width'`.
     */
    fit?: { element: Element; mode?: FitMode };
}

/** Draws a board, field or unit into a 2D canvas. */
export class CanvasFlapRenderer {
    readonly target: RenderTarget;
    private readonly options: CanvasFlapRendererOptions;
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private boardLayout: BoardLayout;
    private layoutOptions: LayoutOptions;
    private resolvedStyle: ResolvedFlapStyle;
    private face: CanvasFlapRendererOptions['face'];
    private readonly curve: FlipCurve;
    private readonly scheduler: FrameScheduler;
    private readonly caches = new Map<string, FaceCache<any>>();
    private readonly drawn = new Map<number, string>();
    private dpr = 1;
    private zoom = 1;
    private observer: ResizeObserver | null = null;
    private frame: number | null = null;
    private lastTime: number | null = null;
    private destroyed = false;

    constructor(options: CanvasFlapRendererOptions) {
        const ctx = options.canvas.getContext('2d');
        if (!ctx) {
            throw new Error(
                'CanvasFlapRenderer: 2D canvas context is unavailable'
            );
        }
        this.options = options;
        this.target = options.target;
        this.canvas = options.canvas;
        this.ctx = ctx;
        this.layoutOptions = { cell: options.cell, gap: options.gap };
        this.boardLayout = layout(options.target, this.layoutOptions);
        this.resolvedStyle = resolveStyle(options.style);
        this.face = options.face;
        this.curve = options.flipCurve ?? defaultFlipCurve();
        this.scheduler = options.scheduler ?? browserScheduler;
        this.resize();
        if (options.fit) {
            this.observe(options.fit.element, options.fit.mode ?? 'width');
        }
    }

    /** The resolved style in use. */
    get style(): ResolvedFlapStyle {
        return this.resolvedStyle;
    }

    /**
     * Replaces the style (like the constructor option; spread `renderer.style`
     * to change a single value), then repaints faces and redraws.
     */
    setStyle(style: FlapStyle): void {
        this.resolvedStyle = resolveStyle(style);
        this.repaint();
    }

    /**
     * Replaces the face painter (one for every field, or one per field name),
     * then repaints faces and redraws. A map must cover every field.
     */
    setFace(face: CanvasFlapRendererOptions['face']): void {
        if (typeof face !== 'function') {
            for (const slot of this.boardLayout.slots) {
                painterFrom(face, slot.field);
            }
        }
        this.face = face;
        this.repaint();
    }

    /** Displayed width in CSS px (layout width × scale). */
    get width(): number {
        return this.boardLayout.width * this.zoom;
    }

    /** Displayed height in CSS px (layout height × scale). */
    get height(): number {
        return this.boardLayout.height * this.zoom;
    }

    /**
     * Uniform zoom (default 1). Faces and the backing store are painted at
     * `dpr × scale`, so text stays sharp. Must be a positive finite number.
     */
    get scale(): number {
        return this.zoom;
    }

    set scale(value: number) {
        if (!(value > 0) || !Number.isFinite(value)) {
            throw new RangeError(
                `CanvasFlapRenderer: scale must be a positive number, got ${value}`
            );
        }
        this.zoom = value;
        this.resize();
    }

    /**
     * Changes the cell size and/or gaps at runtime (merged with the current
     * values), then re-lays out, repaints faces and redraws.
     */
    setLayout(options: Partial<LayoutOptions>): void {
        this.layoutOptions = {
            cell: options.cell ?? this.layoutOptions.cell,
            gap: { ...this.layoutOptions.gap, ...options.gap },
        };
        this.boardLayout = layout(this.target, this.layoutOptions);
        this.resize();
    }

    /** Sets {@link scale} so the board fits a `width × height` box. */
    fitTo(width: number, height: number, mode: FitMode = 'width'): void {
        const scale = fitScale(this.boardLayout, { width, height }, mode);
        if (scale !== null) {
            this.scale = scale;
        }
    }

    /** Draws every unit whose visible state changed since the last render. */
    render(): void {
        if (this.destroyed) {
            return;
        }
        this.boardLayout.slots.forEach((slot, index) => {
            const state = slot.unit.state;
            const key = slot.sequence.key(state.current);
            const signature =
                state.next === null
                    ? key
                    : `${key}|${slot.sequence.key(state.next)}|${state.direction}|${this.curve(state.progress).toFixed(2)}`;
            if (this.drawn.get(index) === signature) {
                return;
            }
            const { x, y, w, h } = slot.rect;
            this.ctx.clearRect(x, y, w, h);
            drawUnit(this.ctx, state, slot.rect, {
                faces: this.facesFor(slot),
                style: this.style,
                flipCurve: this.curve,
                sequence: slot.sequence,
            });
            this.drawn.set(index, signature);
        });
    }

    /**
     * Runs a frame loop: update the target by the frame delta, then render.
     * With `update: false` it only renders, mirroring a target that something
     * else advances (e.g. another renderer's loop).
     */
    start(options: { update?: boolean } = {}): void {
        const update = options.update ?? true;
        if (this.destroyed || this.frame !== null) {
            return;
        }
        const loop = (time: number): void => {
            // This frame has fired; a throw below must not leave a stale id.
            this.frame = null;
            try {
                if (update && this.lastTime !== null) {
                    const dt = Math.min(MAX_FRAME_DT, time - this.lastTime);
                    if (dt > 0) {
                        this.target.update(dt);
                    }
                }
                this.lastTime = time;
                this.render();
            } catch (error) {
                this.lastTime = null;
                throw error;
            }
            this.frame = this.scheduler.request(loop);
        };
        this.frame = this.scheduler.request(loop);
    }

    stop(): void {
        if (this.frame !== null) {
            this.scheduler.cancel(this.frame);
        }
        this.frame = null;
        this.lastTime = null;
    }

    /** Re-reads the pixel ratio, resizes the backing store and redraws. */
    resize(): void {
        this.dpr = this.options.dpr ?? globalThis.devicePixelRatio ?? 1;
        const { width, height } = this.boardLayout;
        const pixels = this.dpr * this.zoom;
        this.canvas.width = Math.round(width * pixels);
        this.canvas.height = Math.round(height * pixels);
        this.canvas.style.width = `${width * this.zoom}px`;
        this.canvas.style.height = `${height * this.zoom}px`;
        this.ctx.setTransform(pixels, 0, 0, pixels, 0, 0);
        this.caches.clear();
        this.drawn.clear();
        this.render();
    }

    private repaint(): void {
        this.caches.clear();
        this.drawn.clear();
        this.render();
    }

    destroy(): void {
        this.stop();
        this.observer?.disconnect();
        this.observer = null;
        this.destroyed = true;
        this.caches.clear();
        this.drawn.clear();
    }

    private facesFor(slot: UnitSlot): FaceCache<any> {
        const painter = this.painterFor(slot.field);
        // A perRow painter's faces differ by row, so they get a cache per row.
        const cacheKey = painter.perRow
            ? `${slot.field}\u0000${slot.row}`
            : slot.field;
        const cached = this.caches.get(cacheKey);
        if (cached) {
            return cached;
        }
        const cache = new FaceCache<any>({
            key: flap => slot.sequence.key(flap),
            painter,
            width: slot.rect.w,
            // Faces fill the cell minus the covered-flap stack.
            height: slot.rect.h - stackDepth(this.style),
            dpr: this.dpr * this.zoom,
            radius: this.style.radius,
            createCanvas: this.options.createCanvas,
            grain: this.style.grain,
            light: this.style.light,
            context: {
                row: painter.perRow ? slot.row : 0,
                field: slot.field,
            },
        });
        this.caches.set(cacheKey, cache);
        return cache;
    }

    private observe(element: Element, mode: FitMode): void {
        if (typeof ResizeObserver === 'undefined') {
            throw new Error(
                'CanvasFlapRenderer: the fit option needs ResizeObserver'
            );
        }
        this.observer = new ResizeObserver(entries => {
            const box = entries[entries.length - 1]?.contentRect;
            if (box) {
                this.fitTo(box.width, box.height, mode);
            }
        });
        this.observer.observe(element);
    }

    private painterFor(field: string): FacePainter<any> {
        return painterFrom(this.face, field);
    }
}

function painterFrom(
    face: CanvasFlapRendererOptions['face'],
    field: string
): FacePainter<any> {
    if (typeof face === 'function') {
        return face;
    }
    const painter = face[field];
    if (!painter) {
        throw new Error(
            `CanvasFlapRenderer: no face painter for field "${field}"`
        );
    }
    return painter;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
