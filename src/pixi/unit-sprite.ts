import { Color, Container, Sprite, Texture } from 'pixi.js';

import type { FlapSequence } from '../core/sequence.js';
import type { UnitState } from '../core/unit.js';
import type { FlipCurve } from '../render/flip-curve.js';
import { type FaceRef, flipGeometry } from '../render/flip-geometry.js';
import { stackDepth, stackFlaps } from '../render/stack.js';
import type { ResolvedFlapStyle } from '../render/style.js';
import type { HalfTextures } from './textures.js';

/**
 * Scene graph for one unit: covered-flap stack, static halves, moving flap,
 * shadow and hinge.
 */
export class UnitSprite extends Container {
    /** Covered flaps under the bottom half, nearest first. Empty when off. */
    readonly stack: Sprite[];
    readonly top = new Sprite();
    readonly bottom = new Sprite();
    readonly shadow = new Sprite(Texture.WHITE);
    readonly flap = new Sprite();
    readonly hinge = new Sprite(Texture.WHITE);
    /** Height of the face: the cell minus the covered-flap stack. */
    private readonly faceHeight: number;

    constructor(
        private readonly unitWidth: number,
        private readonly unitHeight: number,
        private readonly style: ResolvedFlapStyle
    ) {
        super();
        this.faceHeight = unitHeight - stackDepth(style);
        const half = this.faceHeight / 2;
        this.stack = Array.from(
            { length: style.stack?.count ?? 0 },
            () => new Sprite()
        );
        this.shadow.tint = 0x000000;
        this.shadow.visible = false;
        this.flap.visible = false;
        this.flap.position.set(0, half);
        const hingeColor = new Color(style.hingeColor);
        this.hinge.tint = hingeColor.toNumber();
        this.hinge.alpha = hingeColor.alpha;
        this.hinge.position.set(0, half - style.hingeGap / 2);
        this.hinge.setSize(unitWidth, style.hingeGap);
        this.hinge.visible = style.hingeGap > 0;
        this.addChild(
            ...[...this.stack].reverse(),
            this.top,
            this.bottom,
            this.shadow,
            this.flap,
            this.hinge
        );
    }

    /**
     * Applies a unit's state to the sprites. `sequence` is needed to show the
     * covered-flap stack; without it the stack sprites are hidden.
     */
    apply<T>(
        state: UnitState<T>,
        faces: { get(flap: T): HalfTextures },
        curve: FlipCurve,
        sequence?: FlapSequence<T>
    ): void {
        const half = this.faceHeight / 2;
        const geometry =
            state.next === null
                ? null
                : flipGeometry(curve(state.progress), state.direction);
        const base =
            geometry?.staticBottom === 'next' && state.next !== null
                ? state.next
                : state.current;
        this.applyStack(base, faces, half, sequence);
        const current = faces.get(state.current);
        if (state.next === null || geometry === null) {
            this.setHalf(this.top, current.top, 0, half);
            this.setHalf(this.bottom, current.bottom, half, half);
            this.flap.visible = false;
            this.shadow.visible = false;
            return;
        }
        const next = faces.get(state.next);
        const pick = (ref: FaceRef): HalfTextures =>
            ref === 'current' ? current : next;
        this.setHalf(this.top, pick(geometry.staticTop).top, 0, half);
        this.setHalf(
            this.bottom,
            pick(geometry.staticBottom).bottom,
            half,
            half
        );

        const shadowAlpha = geometry.castShadow * this.style.shadow;
        this.shadow.visible = shadowAlpha > 0.001;
        this.shadow.position.set(0, geometry.shadowHalf === 'top' ? 0 : half);
        this.shadow.setSize(this.unitWidth, half);
        this.shadow.alpha = shadowAlpha;

        const flapHeight = half * geometry.flap.scaleY;
        this.flap.visible = flapHeight > 0.01;
        if (!this.flap.visible) {
            return;
        }
        const halves = pick(geometry.flap.face);
        const isTop = geometry.flap.half === 'top';
        this.flap.texture = isTop ? halves.top : halves.bottom;
        this.flap.anchor.set(0, isTop ? 1 : 0);
        this.flap.setSize(this.unitWidth, flapHeight);
        const gray = Math.round(
            255 * (1 - geometry.flapShade * this.style.shade)
        );
        this.flap.tint = (gray << 16) | (gray << 8) | gray;
    }

    private applyStack<T>(
        base: T,
        faces: { get(flap: T): HalfTextures },
        half: number,
        sequence: FlapSequence<T> | undefined
    ): void {
        const stack = this.style.stack;
        if (!stack || this.stack.length === 0) {
            return;
        }
        const covered = sequence ? stackFlaps(sequence, base, stack.count) : [];
        this.stack.forEach((sprite, index) => {
            const layer = index + 1;
            const flap = covered[index];
            sprite.visible = flap !== undefined;
            if (flap === undefined) {
                return;
            }
            this.setHalf(
                sprite,
                faces.get(flap).bottom,
                half + layer * stack.step,
                half
            );
            const gray = Math.round(
                255 * (1 - Math.min(1, layer * stack.shade))
            );
            sprite.tint = (gray << 16) | (gray << 8) | gray;
        });
    }

    private setHalf(
        sprite: Sprite,
        texture: Texture,
        y: number,
        height: number
    ): void {
        sprite.texture = texture;
        sprite.position.set(0, y);
        sprite.setSize(this.unitWidth, height);
    }
}
