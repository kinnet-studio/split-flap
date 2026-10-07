import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    CanvasFlapRenderer,
    type CanvasFlapRendererOptions,
} from '../../src/canvas/renderer';
import { FlapField, textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { textFace } from '../../src/render/faces';
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

/** Two 40 × 60 units at dpr 2: an 80 × 60 board. */
function setup(extra: Partial<CanvasFlapRendererOptions> = {}) {
    const canvas = new FakeCanvas();
    const createCanvas = vi.fn(fakeCanvasFactory);
    const renderer = new CanvasFlapRenderer({
        canvas: asCanvasElement(canvas),
        target: new FlapField(textField({ sequence: alnum, length: 2 })),
        face: painter,
        cell: { w: 40, h: 60 },
        dpr: 2,
        createCanvas,
        scheduler: { request: () => 0, cancel: () => {} },
        ...extra,
    });
    return { canvas, ctx: canvas.context, createCanvas, renderer };
}

class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    observed: unknown[] = [];
    disconnected = false;

    constructor(
        readonly callback: (
            entries: { contentRect: { width: number; height: number } }[]
        ) => void
    ) {
        FakeResizeObserver.instances.push(this);
    }

    observe(element: unknown): void {
        this.observed.push(element);
    }

    disconnect(): void {
        this.disconnected = true;
    }

    resize(width: number, height: number): void {
        this.callback([{ contentRect: { width, height } }]);
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
    FakeResizeObserver.instances = [];
});

describe('CanvasFlapRenderer.setLayout', () => {
    it('re-lays out, resizes, repaints faces and redraws everything', () => {
        const { canvas, ctx, createCanvas, renderer } = setup();
        ctx.reset();
        renderer.setLayout({ cell: { w: 20, h: 30 } });
        expect([canvas.width, canvas.height]).toEqual([80, 60]);
        expect(canvas.style).toMatchObject({ width: '40px', height: '30px' });
        expect([renderer.width, renderer.height]).toEqual([40, 30]);
        expect(createCanvas).toHaveBeenLastCalledWith(40, 60);
        expect(ctx.callsNamed('clearRect')).toHaveLength(2);
    });

    it('merges gaps with the current layout', () => {
        const { renderer } = setup({ gap: { row: 5 } });
        renderer.setLayout({ gap: { unit: 4 } });
        expect(renderer.width).toBe(84);
        expect(renderer.height).toBe(60);
    });
});

describe('CanvasFlapRenderer.scale', () => {
    it('zooms the canvas and paints at dpr × scale', () => {
        const { canvas, ctx, createCanvas, renderer } = setup();
        renderer.scale = 1.5;
        expect([canvas.width, canvas.height]).toEqual([240, 180]);
        expect(canvas.style).toMatchObject({ width: '120px', height: '90px' });
        expect(ctx.callsNamed('setTransform').at(-1)?.args).toEqual([
            3, 0, 0, 3, 0, 0,
        ]);
        expect(createCanvas).toHaveBeenLastCalledWith(120, 180);
        expect([renderer.width, renderer.height]).toEqual([120, 90]);
    });

    it('rejects non-positive or non-finite scales', () => {
        const { renderer } = setup();
        for (const bad of [0, -1, NaN, Infinity]) {
            expect(() => (renderer.scale = bad)).toThrow(RangeError);
        }
        expect(renderer.scale).toBe(1);
    });
});

describe('CanvasFlapRenderer.fitTo', () => {
    it('fills the width by default', () => {
        const { renderer } = setup();
        renderer.fitTo(200, 0);
        expect(renderer.scale).toBe(2.5);
    });

    it('fits both dimensions in contain mode', () => {
        const { renderer } = setup();
        renderer.fitTo(200, 90, 'contain');
        expect(renderer.scale).toBe(1.5);
    });

    it('ignores an empty box', () => {
        const { renderer } = setup();
        renderer.fitTo(0, 0);
        expect(renderer.scale).toBe(1);
    });
});

describe('CanvasFlapRenderer fit option', () => {
    it('follows the element with a ResizeObserver until destroyed', () => {
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        const element = {} as Element;
        const { renderer } = setup({ fit: { element } });
        const [observer] = FakeResizeObserver.instances;
        expect(observer.observed).toEqual([element]);
        observer.resize(160, 0);
        expect(renderer.scale).toBe(2);
        renderer.destroy();
        expect(observer.disconnected).toBe(true);
    });

    it('uses the requested fit mode', () => {
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        const { renderer } = setup({
            fit: { element: {} as Element, mode: 'contain' },
        });
        FakeResizeObserver.instances[0].resize(800, 30);
        expect(renderer.scale).toBe(0.5);
    });

    it('throws when ResizeObserver is unavailable', () => {
        vi.stubGlobal('ResizeObserver', undefined);
        expect(() => setup({ fit: { element: {} as Element } })).toThrow(
            /ResizeObserver/
        );
    });
});
