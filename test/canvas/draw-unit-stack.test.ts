import { describe, expect, it } from 'vitest';

import { drawUnit } from '../../src/canvas/draw-unit';
import { FlapSequence } from '../../src/core/sequence';
import type { UnitState } from '../../src/core/unit';
import type { FaceCanvas } from '../../src/render/face-cache';
import type { FlapStyle } from '../../src/render/style';
import {
    asCtx,
    FakeCanvas,
    FakeContext,
    type RecordedCall,
} from '../helpers/fake-canvas';

const seq = FlapSequence.chars('ABCD');
const faceCanvases = new Map(
    Array.from('ABCD').map(flap => [flap, new FakeCanvas(80, 120)])
);
const faces = {
    get: (flap: string) => faceCanvases.get(flap) as unknown as FaceCanvas,
};
const linear = (progress: number) => progress * 180;
// 3 edges × 2 px = 6 px of stack; face is 60 px tall, hinge at y = 50
const rect = { x: 10, y: 20, w: 40, h: 66 };
const stacked: FlapStyle = { stack: { count: 3, step: 2, shade: 0.1 } };

function draw(
    state: UnitState<string>,
    options: { style?: FlapStyle; withSequence?: boolean } = {}
): FakeContext {
    const ctx = new FakeContext();
    drawUnit(asCtx(ctx), state, rect, {
        faces,
        flipCurve: linear,
        style: options.style ?? stacked,
        sequence: options.withSequence === false ? undefined : seq,
    });
    return ctx;
}

function nameOf(image: unknown): string {
    for (const [flap, canvas] of faceCanvases) {
        if (canvas === image) {
            return flap;
        }
    }
    return '?';
}

function images(ctx: FakeContext) {
    return ctx.callsNamed('drawImage').map(call => {
        const [image, , sy, , , , dy, , dh] = call.args as number[];
        return `${nameOf(image)} ${sy === 0 ? 'top' : 'bottom'} y${dy} h${dh}`;
    });
}

function alphaOf(call: RecordedCall): number {
    const match = /rgba\(0, 0, 0, ([\d.e-]+)\)/.exec(String(call.fillStyle));
    return match ? Number(match[1]) : NaN;
}

const settled = (current: string): UnitState<string> => ({
    current,
    next: null,
    progress: 0,
    direction: 1,
});

describe('drawUnit with a covered-flap stack', () => {
    it('draws the earlier flaps deepest first, then the shrunk face', () => {
        expect(images(draw(settled('D')))).toEqual([
            'A bottom y56 h30',
            'B bottom y54 h30',
            'C bottom y52 h30',
            'D top y20 h30',
            'D bottom y50 h30',
        ]);
    });

    it('darkens deeper edges more', () => {
        const fills = draw(settled('D')).callsNamed('fillRect');
        expect(fills.slice(0, 3).map(call => call.args)).toEqual([
            [10, 56, 40, 30],
            [10, 54, 40, 30],
            [10, 52, 40, 30],
        ]);
        expect(alphaOf(fills[0])).toBeCloseTo(0.3);
        expect(alphaOf(fills[1])).toBeCloseTo(0.2);
        expect(alphaOf(fills[2])).toBeCloseTo(0.1);
        expect(fills[0].composite).toBe('source-atop');
    });

    it('stacks under the current flap during a forward flip', () => {
        const state: UnitState<string> = {
            current: 'B',
            next: 'C',
            progress: 0.25,
            direction: 1,
        };
        // the static bottom shows B, so the stack is A, D, C
        expect(images(draw(state)).slice(0, 3)).toEqual([
            'C bottom y56 h30',
            'D bottom y54 h30',
            'A bottom y52 h30',
        ]);
    });

    it('stacks under the flap the bottom half shows during a backward flip', () => {
        const state: UnitState<string> = {
            current: 'D',
            next: 'C',
            progress: 0.25,
            direction: -1,
        };
        // the static bottom shows C, so the stack is B, A, D
        expect(images(draw(state)).slice(0, 3)).toEqual([
            'D bottom y56 h30',
            'A bottom y54 h30',
            'B bottom y52 h30',
        ]);
    });

    it('draws no stack and uses the full cell without a sequence', () => {
        expect(images(draw(settled('D'), { withSequence: false }))).toEqual([
            'D top y20 h33',
            'D bottom y53 h33',
        ]);
    });

    it('draws no stack when the style has none', () => {
        expect(images(draw(settled('D'), { style: {} }))).toEqual([
            'D top y20 h33',
            'D bottom y53 h33',
        ]);
    });
});
