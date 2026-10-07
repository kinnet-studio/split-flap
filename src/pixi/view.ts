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
    private readonly flapStyle: ResolvedFlapStyle;
    private readonly curve: FlipCurve;
    private sprites: UnitSprite[] = [];
    private faceTextures = new Map<string, FaceTextures<any>>();
    private zoom = 1;
    private ticker: Ticker | null = null;
    private readonly onTick = (ticker: Ticker): void => {
        this.update(Math.min(MAX_FRAME_DT, ticker.deltaMS));
    };

    constructor(options: PixiFlapViewOptions) {
        super();
        this.viewOptions = options;
        this.target = options.target;
        this.flapStyle = resolveStyle(options.style);
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
        for (const sprite of this.removeChildren()) {
            sprite.destroy({ children: true, texture: false });
        }
        this.buildSprites();
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

    /** Drives `update` from a Pixi ticker (frame delta capped at 250 ms). */
    attach(ticker: Ticker): void {
        this.detach();
        ticker.add(this.onTick);
        this.ticker = ticker;
    }

    detach(): void {
        this.ticker?.remove(this.onTick);
        this.ticker = null;
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
        const cached = this.faceTextures.get(slot.field);
        if (cached) {
            return cached;
        }
        const textures = new FaceTextures<any>(
            flap => slot.sequence.key(flap),
            this.faceFor(slot.field),
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
            }
        );
        this.faceTextures.set(slot.field, textures);
        return textures;
    }

    private faceFor(field: string): PixiFace<any> {
        const { face } = this.viewOptions;
        if (typeof face === 'function' || isTextureFace(face)) {
            return face as PixiFace<any>;
        }
        const fieldFace = face[field];
        if (!fieldFace) {
            throw new Error(`PixiFlapView: no face for field "${field}"`);
        }
        return fieldFace;
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
