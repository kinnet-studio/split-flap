import { CanvasSource, type ICanvas, Rectangle, Texture } from 'pixi.js';

import { type CanvasFactory, FaceCache } from '../render/face-cache.js';
import type { FacePainter } from '../render/faces.js';

/** A face backed by ready-made Pixi textures instead of a painter. */
export interface TextureFace<T> {
    readonly kind: 'split-flaps/texture-face';
    texture(flap: T): Texture;
}

export type PixiFace<T> = FacePainter<T> | TextureFace<T>;

/** Wraps a texture lookup so it can be told apart from a face painter. */
export function textureFace<T>(texture: (flap: T) => Texture): TextureFace<T> {
    return { kind: 'split-flaps/texture-face', texture };
}

export function isTextureFace(value: unknown): value is TextureFace<unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as { kind?: unknown }).kind === 'split-flaps/texture-face'
    );
}

export interface HalfTextures {
    top: Texture;
    bottom: Texture;
}

export interface FaceTexturesOptions {
    /** Face size in CSS px. */
    width: number;
    height: number;
    /** Painted face resolution (device pixel ratio). */
    resolution: number;
    /** Corner radius baked into painted faces. */
    radius: number;
    createCanvas?: CanvasFactory;
}

type Source<T> =
    | { kind: 'texture'; face: TextureFace<T> }
    | { kind: 'painter'; faces: FaceCache<T> };

interface Entry extends HalfTextures {
    /** Full texture created here (painted faces) and destroyed with it. */
    owned: Texture | null;
}

/** Caches top and bottom half textures for each flap of one field. */
export class FaceTextures<T> {
    private readonly entries = new Map<string, Entry>();
    private readonly source: Source<T>;

    constructor(
        private readonly key: (flap: T) => string,
        face: PixiFace<T>,
        options: FaceTexturesOptions
    ) {
        this.source = isTextureFace(face)
            ? { kind: 'texture', face }
            : {
                  kind: 'painter',
                  faces: new FaceCache({
                      key,
                      painter: face,
                      width: options.width,
                      height: options.height,
                      dpr: options.resolution,
                      radius: options.radius,
                      createCanvas: options.createCanvas,
                  }),
              };
    }

    get(flap: T): HalfTextures {
        const key = this.key(flap);
        const cached = this.entries.get(key);
        if (cached) {
            return cached;
        }
        let full: Texture;
        let owned: Texture | null = null;
        if (this.source.kind === 'texture') {
            full = this.source.face.texture(flap);
        } else {
            const canvas = this.source.faces.get(flap);
            full = new Texture({
                source: new CanvasSource({
                    resource: canvas as unknown as ICanvas,
                }),
            });
            owned = full;
        }
        const { x, y, width, height } = full.frame;
        const half = height / 2;
        const entry: Entry = {
            top: new Texture({
                source: full.source,
                frame: new Rectangle(x, y, width, half),
            }),
            bottom: new Texture({
                source: full.source,
                frame: new Rectangle(x, y + half, width, half),
            }),
            owned,
        };
        this.entries.set(key, entry);
        return entry;
    }

    destroy(): void {
        for (const entry of this.entries.values()) {
            entry.top.destroy(false);
            entry.bottom.destroy(false);
            entry.owned?.destroy(true);
        }
        this.entries.clear();
        if (this.source.kind === 'painter') {
            this.source.faces.clear();
        }
    }
}
