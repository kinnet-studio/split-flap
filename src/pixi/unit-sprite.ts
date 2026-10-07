import { Color, Container, Sprite, Texture } from 'pixi.js';

import type { UnitState } from '../core/unit.js';
import type { FlipCurve } from '../render/flip-curve.js';
import { type FaceRef, flipGeometry } from '../render/flip-geometry.js';
import type { ResolvedFlapStyle } from '../render/style.js';
import type { HalfTextures } from './textures.js';

/** Scene graph for one unit: static halves, moving flap, shadow and hinge. */
export class UnitSprite extends Container {
    readonly top = new Sprite();
    readonly bottom = new Sprite();
    readonly shadow = new Sprite(Texture.WHITE);
    readonly flap = new Sprite();
    readonly hinge = new Sprite(Texture.WHITE);

    constructor(
        private readonly unitWidth: number,
        private readonly unitHeight: number,
        private readonly style: ResolvedFlapStyle
    ) {
        super();
        const half = unitHeight / 2;
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
            this.top,
            this.bottom,
            this.shadow,
            this.flap,
            this.hinge
        );
    }

    /** Applies a unit's state to the sprites. */
    apply<T>(
        state: UnitState<T>,
        faces: { get(flap: T): HalfTextures },
        curve: FlipCurve
    ): void {
        const half = this.unitHeight / 2;
        const current = faces.get(state.current);
        if (state.next === null) {
            this.setHalf(this.top, current.top, 0, half);
            this.setHalf(this.bottom, current.bottom, half, half);
            this.flap.visible = false;
            this.shadow.visible = false;
            return;
        }
        const next = faces.get(state.next);
        const pick = (ref: FaceRef): HalfTextures =>
            ref === 'current' ? current : next;
        const geometry = flipGeometry(curve(state.progress), state.direction);
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
