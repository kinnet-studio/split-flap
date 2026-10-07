import { type CanvasFactory, FaceCache } from '../render/face-cache.js';
import type { FacePainter } from '../render/faces.js';
import { defaultFlipCurve, type FlipCurve } from '../render/flip-curve.js';
import { MAX_FRAME_DT } from '../render/frame.js';
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
}

/** Draws a board, field or unit into a 2D canvas. */
export class CanvasFlapRenderer {
    readonly target: RenderTarget;
    private readonly options: CanvasFlapRendererOptions;
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly boardLayout: BoardLayout;
    private readonly style: ResolvedFlapStyle;
    private readonly curve: FlipCurve;
    private readonly scheduler: FrameScheduler;
    private readonly caches = new Map<string, FaceCache<any>>();
    private readonly drawn = new Map<number, string>();
    private dpr = 1;
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
        this.boardLayout = layout(options.target, options);
        this.style = resolveStyle(options.style);
        this.curve = options.flipCurve ?? defaultFlipCurve();
        this.scheduler = options.scheduler ?? browserScheduler;
        this.resize();
    }

    /** Layout width in CSS px. */
    get width(): number {
        return this.boardLayout.width;
    }

    /** Layout height in CSS px. */
    get height(): number {
        return this.boardLayout.height;
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
            });
            this.drawn.set(index, signature);
        });
    }

    /** Runs a frame loop: update the target by the frame delta, then render. */
    start(): void {
        if (this.destroyed || this.frame !== null) {
            return;
        }
        const loop = (time: number): void => {
            // This frame has fired; a throw below must not leave a stale id.
            this.frame = null;
            try {
                if (this.lastTime !== null) {
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
        this.canvas.width = Math.round(width * this.dpr);
        this.canvas.height = Math.round(height * this.dpr);
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.caches.clear();
        this.drawn.clear();
        this.render();
    }

    destroy(): void {
        this.stop();
        this.destroyed = true;
        this.caches.clear();
        this.drawn.clear();
    }

    private facesFor(slot: UnitSlot): FaceCache<any> {
        const cached = this.caches.get(slot.field);
        if (cached) {
            return cached;
        }
        const cache = new FaceCache<any>({
            key: flap => slot.sequence.key(flap),
            painter: this.painterFor(slot.field),
            width: slot.rect.w,
            height: slot.rect.h,
            dpr: this.dpr,
            radius: this.style.radius,
            createCanvas: this.options.createCanvas,
        });
        this.caches.set(slot.field, cache);
        return cache;
    }

    private painterFor(field: string): FacePainter<any> {
        const { face } = this.options;
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
}
/* eslint-enable @typescript-eslint/no-explicit-any */
