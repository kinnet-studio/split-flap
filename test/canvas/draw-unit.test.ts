import { describe, expect, it } from 'vitest';

import { drawUnit } from '../../src/canvas/draw-unit';
import type { UnitState } from '../../src/core/unit';
import type { FaceCanvas } from '../../src/render/face-cache';
import type { FlapStyle } from '../../src/render/style';
import {
    asCtx,
    FakeCanvas,
    FakeContext,
    type RecordedCall,
} from '../helpers/fake-canvas';

const faceA = new FakeCanvas(80, 120);
const faceB = new FakeCanvas(80, 120);
const faces = {
    get: (flap: string) =>
        (flap === 'A' ? faceA : faceB) as unknown as FaceCanvas,
};
const linear = (progress: number) => progress * 180;
const rect = { x: 10, y: 20, w: 40, h: 60 };
const COS45 = Math.cos(Math.PI / 4);

function flipping(progress: number, direction: 1 | -1 = 1): UnitState<string> {
    return { current: 'A', next: 'B', progress, direction };
}

function draw(
    state: UnitState<string>,
    options: { style?: FlapStyle; flipCurve?: (p: number) => number } = {}
): FakeContext {
    const ctx = new FakeContext();
    drawUnit(asCtx(ctx), state, rect, { faces, flipCurve: linear, ...options });
    return ctx;
}

function images(ctx: FakeContext) {
    return ctx.callsNamed('drawImage').map(call => {
        const [image, , sy, , , dx, dy, dw, dh] = call.args as [
            unknown,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
        ];
        return {
            face: image === faceA ? 'A' : 'B',
            half: sy === 0 ? 'top' : 'bottom',
            dx,
            dy,
            dw,
            dh,
        };
    });
}

function alphaOf(call: RecordedCall): number {
    const match = /rgba\(0, 0, 0, ([\d.e-]+)\)/.exec(String(call.fillStyle));
    if (!match) {
        throw new Error(`not a black rgba fill: ${String(call.fillStyle)}`);
    }
    return Number(match[1]);
}

describe('drawUnit', () => {
    it('draws both halves of the current flap when settled', () => {
        const ctx = draw({
            current: 'A',
            next: null,
            progress: 0,
            direction: 1,
        });
        expect(images(ctx)).toEqual([
            { face: 'A', half: 'top', dx: 10, dy: 20, dw: 40, dh: 30 },
            { face: 'A', half: 'bottom', dx: 10, dy: 50, dw: 40, dh: 30 },
        ]);
        const fills = ctx.callsNamed('fillRect');
        expect(fills).toHaveLength(1);
        expect(fills[0].args).toEqual([10, 49.5, 40, 1]);
        expect(fills[0].fillStyle).toBe('rgba(0, 0, 0, 0.6)');
    });

    it('folds the top of the current flap down during the first half', () => {
        const [staticTop, staticBottom, flap] = images(draw(flipping(0.25)));
        expect(staticTop).toMatchObject({
            face: 'B',
            half: 'top',
            dy: 20,
            dh: 30,
        });
        expect(staticBottom).toMatchObject({
            face: 'A',
            half: 'bottom',
            dy: 50,
            dh: 30,
        });
        expect(flap).toMatchObject({ face: 'A', half: 'top', dx: 10, dw: 40 });
        expect(flap.dh).toBeCloseTo(30 * COS45);
        expect(flap.dy).toBeCloseTo(50 - 30 * COS45);
    });

    it('casts a shadow on the bottom half and shades the flap', () => {
        const ctx = draw(flipping(0.25));
        const [shadow, shade, hinge] = ctx.callsNamed('fillRect');
        expect(shadow.args).toEqual([10, 50, 40, 30]);
        expect(shadow.composite).toBe('source-atop');
        expect(alphaOf(shadow)).toBeCloseTo(Math.sin(Math.PI / 4) * 0.35);
        expect(shade.composite).toBe('source-atop');
        expect(alphaOf(shade)).toBeCloseTo((1 - COS45) * 0.5);
        expect(hinge.composite).toBe('source-over');
    });

    it('unfolds the bottom of the next flap during the second half', () => {
        const flap = images(draw(flipping(0.75)))[2];
        expect(flap).toMatchObject({ face: 'B', half: 'bottom', dy: 50 });
        expect(flap.dh).toBeCloseTo(30 * COS45);
    });

    it('mirrors the flip when travelling backward', () => {
        const ctx = draw(flipping(0.25, -1));
        const [staticTop, staticBottom, flap] = images(ctx);
        expect(staticTop).toMatchObject({ face: 'A', half: 'top' });
        expect(staticBottom).toMatchObject({ face: 'B', half: 'bottom' });
        expect(flap).toMatchObject({ face: 'A', half: 'bottom', dy: 50 });
        expect(ctx.callsNamed('fillRect')[0].args).toEqual([10, 20, 40, 30]);
    });

    it('skips the flap when it is edge-on', () => {
        expect(images(draw(flipping(0.5)))).toHaveLength(2);
    });

    it('skips shading, shadow and hinge when the style turns them off', () => {
        const ctx = draw(flipping(0.25), {
            style: { shade: 0, shadow: 0, hingeGap: 0 },
        });
        expect(ctx.callsNamed('fillRect')).toHaveLength(0);
    });

    it('uses the default flip curve when none is given', () => {
        const ctx = new FakeContext();
        drawUnit(asCtx(ctx), flipping(0.4), rect, { faces });
        expect(images(ctx)[2].dh).toBeCloseTo(30 * COS45);
    });
});
