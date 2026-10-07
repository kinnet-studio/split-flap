import type { UnitState } from '../core/unit.js';
import type { FaceCanvas } from '../render/face-cache.js';
import type { Ctx2D } from '../render/faces.js';
import { defaultFlipCurve, type FlipCurve } from '../render/flip-curve.js';
import { type FaceRef, flipGeometry, type Half } from '../render/flip-geometry.js';
import type { Rect } from '../render/layout.js';
import { type FlapStyle, resolveStyle } from '../render/style.js';

/** Anything that returns a painted face for a flap, e.g. a FaceCache. */
export interface FaceSource<T> {
    get(flap: T): FaceCanvas;
}

export interface DrawUnitOptions<T> {
    faces: FaceSource<T>;
    style?: FlapStyle;
    flipCurve?: FlipCurve;
}

/**
 * Draws one unit into `rect` (CSS px). Does not clear first. Shadows use
 * `source-atop` so they only darken pixels already drawn.
 */
export function drawUnit<T>(
    ctx: Ctx2D,
    state: UnitState<T>,
    rect: Rect,
    options: DrawUnitOptions<T>
): void {
    const style = resolveStyle(options.style);
    const half = rect.h / 2;
    const hingeY = rect.y + half;
    const current = options.faces.get(state.current);
    if (state.next === null) {
        drawHalf(ctx, current, 'top', rect.x, rect.y, rect.w, half);
        drawHalf(ctx, current, 'bottom', rect.x, hingeY, rect.w, half);
    } else {
        const next = options.faces.get(state.next);
        const pick = (ref: FaceRef): FaceCanvas =>
            ref === 'current' ? current : next;
        const curve = options.flipCurve ?? defaultFlipCurve();
        const geometry = flipGeometry(curve(state.progress), state.direction);
        drawHalf(
            ctx,
            pick(geometry.staticTop),
            'top',
            rect.x,
            rect.y,
            rect.w,
            half
        );
        drawHalf(
            ctx,
            pick(geometry.staticBottom),
            'bottom',
            rect.x,
            hingeY,
            rect.w,
            half
        );
        const shadowAlpha = geometry.castShadow * style.shadow;
        if (shadowAlpha > 0.001) {
            const shadowY = geometry.shadowHalf === 'top' ? rect.y : hingeY;
            darken(ctx, shadowAlpha, rect.x, shadowY, rect.w, half);
        }
        const flapHeight = half * geometry.flap.scaleY;
        if (flapHeight > 0.01) {
            const flapY =
                geometry.flap.half === 'top' ? hingeY - flapHeight : hingeY;
            drawHalf(
                ctx,
                pick(geometry.flap.face),
                geometry.flap.half,
                rect.x,
                flapY,
                rect.w,
                flapHeight
            );
            const shadeAlpha = geometry.flapShade * style.shade;
            if (shadeAlpha > 0.001) {
                darken(ctx, shadeAlpha, rect.x, flapY, rect.w, flapHeight);
            }
        }
    }
    if (style.hingeGap > 0) {
        ctx.fillStyle = style.hingeColor;
        ctx.fillRect(
            rect.x,
            hingeY - style.hingeGap / 2,
            rect.w,
            style.hingeGap
        );
    }
}

function drawHalf(
    ctx: Ctx2D,
    face: FaceCanvas,
    half: Half,
    x: number,
    y: number,
    w: number,
    h: number
): void {
    const sourceHalf = face.height / 2;
    ctx.drawImage(
        face as unknown as CanvasImageSource,
        0,
        half === 'top' ? 0 : sourceHalf,
        face.width,
        sourceHalf,
        x,
        y,
        w,
        h
    );
}

function darken(
    ctx: Ctx2D,
    alpha: number,
    x: number,
    y: number,
    w: number,
    h: number
): void {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
}
