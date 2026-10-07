import { describe, expect, it, vi } from 'vitest';

import {
    CanvasFlapRenderer,
    type CanvasFlapRendererOptions,
} from '../../src/canvas/renderer';
import { FlapBoard } from '../../src/core/board';
import { FlapField, textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { textFace } from '../../src/render/faces';
import type { RenderTarget } from '../../src/render/layout';
import {
    asCanvasElement,
    FakeCanvas,
    fakeCanvasFactory,
} from '../helpers/fake-canvas';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const painter = textFace({ font: '20px sans-serif' });

/** Two 40 × 60 units, both on the blank flap, so one face is painted. */
function setup(extra: Partial<CanvasFlapRendererOptions> = {}) {
    const canvas = new FakeCanvas();
    const createCanvas = vi.fn(fakeCanvasFactory);
    const target: RenderTarget = new FlapField(
        textField({ sequence: alnum, length: 2 })
    );
    const renderer = new CanvasFlapRenderer({
        canvas: asCanvasElement(canvas),
        target,
        face: painter,
        cell: { w: 40, h: 60 },
        dpr: 1,
        createCanvas,
        scheduler: { request: () => 0, cancel: () => {} },
        ...extra,
    });
    return { ctx: canvas.context, createCanvas, renderer };
}

const lastFace = (createCanvas: ReturnType<typeof setup>['createCanvas']) =>
    createCanvas.mock.results.at(-1)?.value as FakeCanvas;

describe('CanvasFlapRenderer.setStyle', () => {
    it('exposes the resolved style', () => {
        const { renderer } = setup({ style: { radius: 0 } });
        expect(renderer.style).toMatchObject({
            finish: 'gloss',
            radius: 0,
            shade: 0.5,
        });
    });

    it('replaces the style, repaints faces and redraws every unit', () => {
        const { ctx, createCanvas, renderer } = setup({ style: { radius: 0 } });
        ctx.reset();
        createCanvas.mockClear();
        renderer.setStyle({ finish: 'matte' });
        expect(renderer.style).toMatchObject({ finish: 'matte', radius: 4 });
        expect(ctx.callsNamed('clearRect')).toHaveLength(2);
        expect(createCanvas).toHaveBeenCalledTimes(1);
        // background + light gradient + 300 grain specks
        expect(
            lastFace(createCanvas).context.callsNamed('fillRect')
        ).toHaveLength(302);
    });

    it('merges when given the current style', () => {
        const { renderer } = setup({ style: { radius: 0 } });
        renderer.setStyle({ ...renderer.style, shade: 0.2 });
        expect(renderer.style).toMatchObject({ radius: 0, shade: 0.2 });
    });

    it('shrinks the faces when a stack is switched on', () => {
        const { createCanvas, renderer } = setup();
        renderer.setStyle({ stack: { count: 3, step: 2 } });
        expect(createCanvas).toHaveBeenLastCalledWith(40, 54);
    });
});

describe('CanvasFlapRenderer.setFace', () => {
    it('repaints with the new painter and redraws', () => {
        const { ctx, renderer } = setup();
        const next = vi.fn(
            textFace({ font: '20px sans-serif', theme: 'cream' })
        );
        ctx.reset();
        renderer.setFace(next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(ctx.callsNamed('clearRect')).toHaveLength(2);
    });

    it('rejects a face map without a painter for every field', () => {
        const board = new FlapBoard({
            rows: 1,
            schema: {
                a: textField({ sequence: alnum, length: 1 }),
                b: textField({ sequence: alnum, length: 1 }),
            },
        });
        const { renderer } = setup({
            target: board,
            face: { a: painter, b: painter },
        });
        expect(() => renderer.setFace({ a: painter })).toThrow(
            'no face painter for field "b"'
        );
        expect(() => renderer.render()).not.toThrow();
    });
});
