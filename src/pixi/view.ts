import { Container, type DestroyOptions, type Ticker } from 'pixi.js';

import type { CanvasFactory } from '../render/face-cache.js';
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
import { FaceTextures, isTextureFace, type PixiFace } from './textures.js';
import { UnitSprite } from './unit-sprite.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PixiFlapViewOptions extends LayoutOptions {
    target: RenderTarget;
    /** One face for every field, or one per board field name. */
    face: PixiFace<any> | Record<string, PixiFace<any>>;
    style?: FlapStyle;
    flipCurve?: FlipCurve;
    /** Resolution of painted faces. Default `globalThis.devicePixelRatio ?? 1`. */
    resolution?: number;
    createCanvas?: CanvasFactory;
}

/** A Pixi Container that draws a board, field or unit. */
export class PixiFlapView extends Container {
    readonly target: RenderTarget;
    private readonly viewOptions: PixiFlapViewOptions;
    private boardLayout: BoardLayout;
    private layoutOptions: LayoutOptions;
    private resolvedStyle: ResolvedFlapStyle;
    private face: PixiFlapViewOptions['face'];
    private readonly curve: FlipCurve;
    private sprites: UnitSprite[] = [];
    private faceTextures = new Map<string, FaceTextures<any>>();
    private zoom = 1;
    private ticker: Ticker | null = null;
    private listener: ((ticker: Ticker) => void) | null = null;
    private readonly onTick = (ticker: Ticker): void => {
        this.update(Math.min(MAX_FRAME_DT, ticker.deltaMS));
    };
    private readonly onSync = (): void => {
        this.sync();
    };

    constructor(options: PixiFlapViewOptions) {
        super();
        this.viewOptions = options;
        this.target = options.target;
        this.resolvedStyle = resolveStyle(options.style);
        this.face = options.face;
        this.curve = options.flipCurve ?? defaultFlipCurve();
        this.layoutOptions = { cell: options.cell, gap: options.gap };
        this.boardLayout = layout(options.target, this.layoutOptions);
        this.buildSprites();
        this.sync();
    }

    /** Unscaled layout width in px (the view's local units). */
    get layoutWidth(): number {
        return this.boardLayout.width;
    }

    /** Unscaled layout height in px (the view's local units). */
    get layoutHeight(): number {
        return this.boardLayout.height;
    }

    /**
     * Changes the cell size and/or gaps at runtime (merged with the current
     * values), then rebuilds the unit sprites and their textures.
     */
    setLayout(options: Partial<LayoutOptions>): void {
        this.layoutOptions = {
            cell: options.cell ?? this.layoutOptions.cell,
            gap: { ...this.layoutOptions.gap, ...options.gap },
        };
        this.boardLayout = layout(this.target, this.layoutOptions);
        this.rebuild();
    }

    /** The resolved style in use. */
    get flapStyle(): ResolvedFlapStyle {
        return this.resolvedStyle;
    }

    /**
     * Replaces the style (like the constructor option; spread `view.flapStyle`
     * to change a single value), then rebuilds the unit sprites and textures.
     */
    setStyle(style: FlapStyle): void {
        this.resolvedStyle = resolveStyle(style);
        this.rebuild();
    }

    /**
     * Replaces the face (one for every field, or one per field name), then
     * repaints the textures. A map must cover every field.
     */
    setFace(face: PixiFlapViewOptions['face']): void {
        if (typeof face !== 'function' && !isTextureFace(face)) {
            for (const slot of this.boardLayout.slots) {
                faceFrom(face, slot.field);
            }
        }
        this.face = face;
        this.refreshTextures();
    }

    /**
     * Scales the view to fit a `width × height` box and repaints faces at
     * `resolution × scale` so text stays sharp. Empty boxes are ignored.
     */
    fitTo(width: number, height: number, mode: FitMode = 'width'): void {
        const scale = fitScale(this.boardLayout, { width, height }, mode);
        if (scale === null) {
            return;
        }
        this.zoom = scale;
        this.scale.set(scale);
        this.refreshTextures();
    }

    /**
     * Drives `update` from a Pixi ticker (frame delta capped at 250 ms). With
     * `update: false` it only syncs each tick, mirroring a target that
     * something else advances.
     */
    attach(ticker: Ticker, options: { update?: boolean } = {}): void {
        this.detach();
        const listener = (options.update ?? true) ? this.onTick : this.onSync;
        ticker.add(listener);
        this.ticker = ticker;
        this.listener = listener;
    }

    detach(): void {
        const { ticker, listener } = this;
        this.ticker = null;
        this.listener = null;
        if (!ticker || !listener) {
            return;
        }
        try {
            ticker.remove(listener);
        } catch {
            // The ticker was destroyed first (e.g. with its Application), so
            // there is no listener left to remove.
        }
    }

    /** Advances the target by `dt` ms, then syncs the scene graph. */
    update(dt: number): void {
        this.target.update(dt);
        this.sync();
    }

    /** Applies the target's current state to the scene graph. */
    sync(): void {
        this.boardLayout.slots.forEach((slot, index) =>
            this.sprites[index].apply(
                slot.unit.state,
                this.texturesFor(slot),
                this.curve,
                slot.sequence
            )
        );
    }

    override destroy(options?: DestroyOptions): void {
        this.detach();
        super.destroy({
            ...(typeof options === 'object' ? options : {}),
            children: true,
            texture: false,
            textureSource: false,
        });
        for (const textures of this.faceTextures.values()) {
            textures.destroy();
        }
        this.faceTextures.clear();
    }

    /** Replaces the unit sprites (style or layout changed) and textures. */
    private rebuild(): void {
        for (const sprite of this.removeChildren()) {
            sprite.destroy({ children: true, texture: false });
        }
        this.buildSprites();
        this.refreshTextures();
    }

    private buildSprites(): void {
        this.sprites = this.boardLayout.slots.map(slot => {
            const sprite = new UnitSprite(
                slot.rect.w,
                slot.rect.h,
                this.flapStyle
            );
            sprite.position.set(slot.rect.x, slot.rect.y);
            this.addChild(sprite);
            return sprite;
        });
    }

    /** Re-creates face textures for the current layout and scale. */
    private refreshTextures(): void {
        const previous = this.faceTextures;
        this.faceTextures = new Map();
        this.sync();
        // Destroy after sync() has pointed the sprites at the new textures.
        for (const textures of previous.values()) {
            textures.destroy();
        }
    }

    private texturesFor(slot: UnitSlot): FaceTextures<any> {
        const face = this.faceFor(slot.field);
        // A perRow painter's faces differ by row, so they get textures per row.
        const perRow = !isTextureFace(face) && face.perRow === true;
        const cacheKey = perRow ? `${slot.field}\u0000${slot.row}` : slot.field;
        const cached = this.faceTextures.get(cacheKey);
        if (cached) {
            return cached;
        }
        const textures = new FaceTextures<any>(
            flap => slot.sequence.key(flap),
            face,
            {
                width: slot.rect.w,
                // Faces fill the cell minus the covered-flap stack.
                height: slot.rect.h - stackDepth(this.flapStyle),
                resolution:
                    (this.viewOptions.resolution ??
                        globalThis.devicePixelRatio ??
                        1) * this.zoom,
                radius: this.flapStyle.radius,
                createCanvas: this.viewOptions.createCanvas,
                grain: this.flapStyle.grain,
                light: this.flapStyle.light,
                context: { row: perRow ? slot.row : 0, field: slot.field },
            }
        );
        this.faceTextures.set(cacheKey, textures);
        return textures;
    }

    private faceFor(field: string): PixiFace<any> {
        return faceFrom(this.face, field);
    }
}
function faceFrom(
    face: PixiFlapViewOptions['face'],
    field: string
): PixiFace<any> {
    if (typeof face === 'function' || isTextureFace(face)) {
        return face as PixiFace<any>;
    }
    const fieldFace = face[field];
    if (!fieldFace) {
        throw new Error(`PixiFlapView: no face for field "${field}"`);
    }
    return fieldFace;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
