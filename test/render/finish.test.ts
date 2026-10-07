import { describe, expect, it, vi } from 'vitest';

import { FaceCache } from '../../src/render/face-cache';
import type { FacePainter } from '../../src/render/faces';
import { finishFace } from '../../src/render/finish';
import { FINISH_PRESETS, resolveStyle } from '../../src/render/style';
import {
    asCtx,
    FakeContext,
    type FakeCanvas,
    fakeCanvasFactory,
    type FakeGradient,
} from '../helpers/fake-canvas';

describe('finish presets', () => {
    it('defaults to gloss: the original look', () => {
        const style = resolveStyle();
        expect(style).toMatchObject({
            finish: 'gloss',
            shade: 0.5,
            shadow: 0.35,
            grain: 0,
            light: 0,
        });
    });

    it('applies each preset', () => {
        for (const finish of ['matte', 'satin', 'gloss'] as const) {
            expect(resolveStyle({ finish })).toMatchObject({
                finish,
                ...FINISH_PRESETS[finish],
            });
        }
        expect(FINISH_PRESETS.matte).toEqual({
            shade: 0.15,
            shadow: 0.1,
            grain: 0.06,
            light: 0.1,
        });
    });

    it('lets explicit values override the preset', () => {
        expect(
            resolveStyle({ finish: 'matte', shade: 0.25, grain: undefined })
        ).toMatchObject({ shade: 0.25, shadow: 0.1, grain: 0.06 });
    });

    it('is stable when a resolved style is resolved again', () => {
        const matte = resolveStyle({ finish: 'matte', shadow: 0.2 });
        expect(resolveStyle(matte)).toEqual(matte);
    });

    it('rejects unknown finishes and out-of-range grain or light', () => {
        expect(() =>
            resolveStyle({ finish: 'shiny' as unknown as 'matte' })
        ).toThrow(RangeError);
        for (const bad of [-0.1, 1.5, NaN]) {
            expect(() => resolveStyle({ grain: bad })).toThrow(RangeError);
            expect(() => resolveStyle({ light: bad })).toThrow(RangeError);
        }
    });
});

function fills(ctx: FakeContext) {
    return ctx.callsNamed('fillRect');
}

describe('finishFace', () => {
    it('draws nothing when grain and light are 0', () => {
        const ctx = new FakeContext();
        finishFace(asCtx(ctx), 40, 60, { grain: 0, light: 0 }, 'A');
        expect(ctx.calls).toHaveLength(0);
    });

    it('draws one light gradient over the face, source-atop', () => {
        const ctx = new FakeContext();
        finishFace(asCtx(ctx), 40, 60, { grain: 0, light: 0.1 }, 'A');
        expect(ctx.callsNamed('createLinearGradient')[0].args).toEqual([
            0, 0, 0, 60,
        ]);
        const [fill] = fills(ctx);
        expect(fill.args).toEqual([0, 0, 40, 60]);
        expect(fill.composite).toBe('source-atop');
        expect((fill.fillStyle as FakeGradient).stops).toEqual([
            [0, 'rgba(255, 255, 255, 0.05)'],
            [0.5, 'rgba(255, 255, 255, 0)'],
            [1, 'rgba(0, 0, 0, 0.1)'],
        ]);
        expect(ctx.globalCompositeOperation).toBe('source-over');
    });

    it('draws seeded grain specks that differ between flaps', () => {
        const draw = (key: string) => {
            const ctx = new FakeContext();
            finishFace(asCtx(ctx), 40, 60, { grain: 0.06, light: 0 }, key);
            return fills(ctx);
        };
        const a = draw('A');
        expect(a).toHaveLength(300); // 40 × 60 / 8
        expect(a.every(call => call.composite === 'source-atop')).toBe(true);
        expect(
            a.every(call =>
                ['rgba(255, 255, 255, 0.06)', 'rgba(0, 0, 0, 0.06)'].includes(
                    String(call.fillStyle)
                )
            )
        ).toBe(true);
        expect(draw('A').map(call => call.args)).toEqual(
            a.map(call => call.args)
        );
        expect(draw('B').map(call => call.args)).not.toEqual(
            a.map(call => call.args)
        );
    });
});

describe('FaceCache finish and context', () => {
    it('passes the context to the painter', () => {
        const painter = vi.fn<FacePainter<string>>();
        const cache = new FaceCache<string>({
            key: flap => flap,
            painter,
            width: 40,
            height: 60,
            createCanvas: fakeCanvasFactory,
            context: { row: 3, field: 'dest' },
        });
        cache.get('A');
        expect(painter.mock.calls[0][4]).toEqual({ row: 3, field: 'dest' });
    });

    it('bakes the finish in after the painter, inside the clip', () => {
        const cache = new FaceCache<string>({
            key: flap => flap,
            painter: (ctx, _flap, width, height) => {
                ctx.fillStyle = '#123';
                ctx.fillRect(0, 0, width, height);
            },
            width: 40,
            height: 60,
            radius: 4,
            grain: 0.06,
            light: 0.1,
            createCanvas: fakeCanvasFactory,
        });
        const face = cache.get('A') as unknown as FakeCanvas;
        const names = face.context.calls.map(call => call.name);
        expect(names.indexOf('clip')).toBeLessThan(names.indexOf('fillRect'));
        const fillCalls = face.context.callsNamed('fillRect');
        expect(fillCalls[0].fillStyle).toBe('#123');
        // painter fill + light gradient fill + 300 grain specks
        expect(fillCalls).toHaveLength(302);
    });
});
