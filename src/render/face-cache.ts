import type { Ctx2D, FaceContext, FacePainter } from './faces.js';
import { finishFace } from './finish.js';

/** The parts of HTMLCanvasElement / OffscreenCanvas the cache needs. */
export interface FaceCanvas {
    width: number;
    height: number;
    getContext(contextId: '2d'): Ctx2D | null;
}

export type CanvasFactory = (width: number, height: number) => FaceCanvas;

export const defaultCanvasFactory: CanvasFactory = (width, height) => {
    if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(width, height);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
};

export interface FaceCacheOptions<T> {
    key: (flap: T) => string;
    painter: FacePainter<T>;
    /** Face size in CSS px. */
    width: number;
    height: number;
    /** Device pixel ratio. Default 1. */
    dpr?: number;
    /** Corner radius in CSS px. Default 0. */
    radius?: number;
    createCanvas?: CanvasFactory;
    /** 0..1 grain baked into each face. Default 0. */
    grain?: number;
    /** 0..1 light falloff baked into each face. Default 0. */
    light?: number;
    /** Passed to the painter. Default `{ row: 0, field: '' }`. */
    context?: FaceContext;
}

/** Paints each flap face once into an offscreen canvas and reuses it. */
export class FaceCache<T> {
    private readonly faces = new Map<string, FaceCanvas>();
    private readonly key: (flap: T) => string;
    private readonly painter: FacePainter<T>;
    private readonly radius: number;
    private readonly createCanvas: CanvasFactory;
    private readonly grain: number;
    private readonly light: number;
    private readonly context: FaceContext;
    private width: number;
    private height: number;
    private dpr: number;

    constructor(options: FaceCacheOptions<T>) {
        this.key = options.key;
        this.painter = options.painter;
        this.width = options.width;
        this.height = options.height;
        this.dpr = options.dpr ?? 1;
        this.radius = options.radius ?? 0;
        this.createCanvas = options.createCanvas ?? defaultCanvasFactory;
        this.grain = options.grain ?? 0;
        this.light = options.light ?? 0;
        this.context = options.context ?? { row: 0, field: '' };
    }

    get size(): number {
        return this.faces.size;
    }

    get(flap: T): FaceCanvas {
        const key = this.key(flap);
        const cached = this.faces.get(key);
        if (cached) {
            return cached;
        }
        const face = this.paint(flap, key);
        this.faces.set(key, face);
        return face;
    }

    resize(width: number, height: number, dpr: number): void {
        this.width = width;
        this.height = height;
        this.dpr = dpr;
        this.clear();
    }

    clear(): void {
        this.faces.clear();
    }

    private paint(flap: T, key: string): FaceCanvas {
        const canvas = this.createCanvas(
            Math.max(1, Math.round(this.width * this.dpr)),
            Math.max(1, Math.round(this.height * this.dpr))
        );
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('FaceCache: 2D canvas context is unavailable');
        }
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        if (this.radius > 0) {
            ctx.beginPath();
            ctx.roundRect(0, 0, this.width, this.height, this.radius);
            ctx.clip();
        }
        this.painter(ctx, flap, this.width, this.height, this.context);
        finishFace(
            ctx,
            this.width,
            this.height,
            { grain: this.grain, light: this.light },
            key
        );
        return canvas;
    }
}
