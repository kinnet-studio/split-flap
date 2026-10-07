import { describe, expect, it, vi } from 'vitest';

import {
    CanvasFlapRenderer,
    type CanvasFlapRendererOptions,
    type FrameScheduler,
} from '../../src/canvas/renderer';
import { FlapBoard } from '../../src/core/board';
import { FlapField, textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { textFace } from '../../src/render/faces';
import type { RenderTarget } from '../../src/render/layout';
import {
    asCanvasElement,
    FakeCanvas,
    fakeCanvasFactory,
} from '../helpers/fake-canvas';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const painter = textFace({
    font: '20px sans-serif',
    color: '#fff',
    background: '#000',
});

function fakeScheduler() {
    const callbacks = new Map<number, (time: number) => void>();
    const cancelled: number[] = [];
    let nextId = 1;
    const scheduler: FrameScheduler = {
        request: callback => {
            const id = nextId++;
            callbacks.set(id, callback);
            return id;
        },
        cancel: id => {
            cancelled.push(id);
            callbacks.delete(id);
        },
    };
    const tick = (time: number) => {
        const pending = [...callbacks.values()];
        callbacks.clear();
        pending.forEach(callback => callback(time));
    };
    return { scheduler, callbacks, cancelled, tick };
}

function setup(
    target: RenderTarget,
    extra: Partial<CanvasFlapRendererOptions> = {}
) {
    const canvas = new FakeCanvas();
    const frames = fakeScheduler();
    const renderer = new CanvasFlapRenderer({
        canvas: asCanvasElement(canvas),
        target,
        face: painter,
        cell: { w: 40, h: 60 },
        dpr: 2,
        createCanvas: fakeCanvasFactory,
        scheduler: frames.scheduler,
        ...extra,
    });
    return { canvas, ctx: canvas.context, frames, renderer };
}

const field = (length: number) =>
    new FlapField(
        textField({ sequence: alnum, length, unit: { flipDuration: 10 } })
    );

const twoFieldBoard = () =>
    new FlapBoard({
        rows: 1,
        schema: {
            a: textField({ sequence: alnum, length: 1 }),
            b: textField({ sequence: alnum, length: 1 }),
        },
    });

describe('CanvasFlapRenderer', () => {
    it('sizes the canvas to the layout at the device pixel ratio', () => {
        const { canvas, ctx, renderer } = setup(
            new FlapUnit({ sequence: alnum })
        );
        expect([canvas.width, canvas.height]).toEqual([80, 120]);
        expect(canvas.style).toMatchObject({ width: '40px', height: '60px' });
        expect(ctx.callsNamed('setTransform')[0].args).toEqual([
            2, 0, 0, 2, 0, 0,
        ]);
        expect([renderer.width, renderer.height]).toEqual([40, 60]);
    });

    it('draws every unit on construction', () => {
        const { ctx } = setup(field(3));
        expect(ctx.callsNamed('clearRect')).toHaveLength(3);
        expect(ctx.callsNamed('drawImage')).toHaveLength(6);
    });

    it('redraws only the units that changed', () => {
        const target = field(2);
        const { ctx, renderer } = setup(target);
        ctx.reset();
        renderer.render();
        expect(ctx.callsNamed('clearRect')).toHaveLength(0);

        target.units[1].setTarget('A');
        target.update(5);
        ctx.reset();
        renderer.render();
        expect(ctx.callsNamed('clearRect').map(call => call.args)).toEqual([
            [40, 0, 40, 60],
        ]);
    });

    it('paints one face per distinct flap at device resolution', () => {
        const createCanvas = vi.fn(fakeCanvasFactory);
        setup(field(3), { createCanvas });
        expect(createCanvas).toHaveBeenCalledTimes(1);
        expect(createCanvas).toHaveBeenCalledWith(80, 120);
    });

    it('uses a painter per field for boards', () => {
        const a = vi.fn(painter);
        const b = vi.fn(painter);
        setup(twoFieldBoard(), { face: { a, b } });
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
    });

    it('throws when a field has no painter', () => {
        expect(() => setup(twoFieldBoard(), { face: { a: painter } })).toThrow(
            'no face painter for field "b"'
        );
    });

    it('drives update with frame deltas capped at 250 ms', () => {
        const unit = new FlapUnit({ sequence: alnum });
        const update = vi.spyOn(unit, 'update');
        const { frames, renderer } = setup(unit);
        renderer.start();
        frames.tick(1000);
        expect(update).not.toHaveBeenCalled();
        frames.tick(1016);
        expect(update).toHaveBeenLastCalledWith(16);
        frames.tick(3000);
        expect(update).toHaveBeenLastCalledWith(250);
    });

    it('stops and restarts the frame loop', () => {
        const { frames, renderer } = setup(field(1));
        renderer.start();
        renderer.stop();
        expect(frames.cancelled).toHaveLength(1);
        expect(frames.callbacks.size).toBe(0);
        renderer.start();
        expect(frames.callbacks.size).toBe(1);
    });

    it('redraws everything on resize', () => {
        const { ctx, renderer } = setup(field(2));
        ctx.reset();
        renderer.resize();
        expect(ctx.callsNamed('clearRect')).toHaveLength(2);
        expect(ctx.callsNamed('setTransform')).toHaveLength(1);
    });

    it('stops the loop on destroy', () => {
        const { frames, renderer } = setup(field(1));
        renderer.start();
        renderer.destroy();
        expect(frames.callbacks.size).toBe(0);
    });

    it('throws when the canvas has no 2D context', () => {
        const canvas = {
            getContext: () => null,
        } as unknown as HTMLCanvasElement;
        expect(
            () =>
                new CanvasFlapRenderer({
                    canvas,
                    target: field(1),
                    face: painter,
                    cell: { w: 1, h: 1 },
                })
        ).toThrow(/2D canvas context/);
    });

    it('can start again after the frame loop threw', () => {
        const target = field(1);
        const { frames, renderer } = setup(target);
        renderer.start();
        frames.tick(0);
        vi.spyOn(target, 'update').mockImplementation(() => {
            throw new Error('boom');
        });
        expect(() => frames.tick(16)).toThrow('boom');
        expect(frames.callbacks.size).toBe(0);
        renderer.start();
        expect(frames.callbacks.size).toBe(1);
    });

    it('does nothing after destroy', () => {
        const { frames, renderer } = setup(field(1));
        renderer.destroy();
        renderer.start();
        expect(frames.callbacks.size).toBe(0);
    });
});
