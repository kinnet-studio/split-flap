// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasFlapRenderer } from '../../src/canvas/renderer';
import { FlapField, textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { SplitFlapCanvas, type SplitFlapCanvasProps } from '../../src/react';
import { textFace } from '../../src/render/faces';
import { FakeResizeObserver, stubCanvasContext } from '../helpers/dom-canvas';
import { fakeCanvasFactory } from '../helpers/fake-canvas';
import { fakeScheduler } from '../helpers/fake-scheduler';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const painter = textFace({ font: '20px sans-serif' });

let contextOf: ReturnType<typeof stubCanvasContext>;
let frames: ReturnType<typeof fakeScheduler>;
let target: FlapField<string, string>;

beforeEach(() => {
    contextOf = stubCanvasContext();
    frames = fakeScheduler();
    target = new FlapField(textField({ sequence: alnum, length: 2 }));
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeResizeObserver.instances = [];
});

/** Props for a 2-unit, 40 × 60 field at dpr 1 with a hand-driven loop. */
function props(
    extra: Partial<SplitFlapCanvasProps> = {}
): SplitFlapCanvasProps {
    return {
        target,
        face: painter,
        cell: { w: 40, h: 60 },
        dpr: 1,
        createCanvas: fakeCanvasFactory,
        scheduler: frames.scheduler,
        ...extra,
    };
}

const canvasOf = (container: HTMLElement) =>
    container.querySelector('canvas') as HTMLCanvasElement;

describe('SplitFlapCanvas (React)', () => {
    it('draws the target into its canvas and starts the loop', () => {
        const { container } = render(createElement(SplitFlapCanvas, props()));
        const canvas = canvasOf(container);
        expect(canvas.width).toBe(80);
        expect(
            contextOf(canvas).callsNamed('drawImage').length
        ).toBeGreaterThan(0);
        expect(frames.callbacks.size).toBe(1);
    });

    it('destroys the renderer on unmount', () => {
        const destroy = vi.spyOn(CanvasFlapRenderer.prototype, 'destroy');
        const { unmount } = render(createElement(SplitFlapCanvas, props()));
        unmount();
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(frames.callbacks.size).toBe(0);
    });

    it('keeps exactly one live renderer under StrictMode', () => {
        render(
            createElement(
                StrictMode,
                null,
                createElement(SplitFlapCanvas, props())
            )
        );
        expect(frames.callbacks.size).toBe(1);
    });

    it('applies cell and gap changes with setLayout, by content', () => {
        const setLayout = vi.spyOn(CanvasFlapRenderer.prototype, 'setLayout');
        const { container, rerender } = render(
            createElement(SplitFlapCanvas, props())
        );
        rerender(
            createElement(SplitFlapCanvas, props({ cell: { w: 40, h: 60 } }))
        );
        expect(setLayout).not.toHaveBeenCalled();
        rerender(
            createElement(SplitFlapCanvas, props({ cell: { w: 20, h: 30 } }))
        );
        expect(setLayout).toHaveBeenCalledTimes(1);
        expect(canvasOf(container).width).toBe(40);
    });

    it('applies flapStyle changes with setStyle, by content', () => {
        const setStyle = vi.spyOn(CanvasFlapRenderer.prototype, 'setStyle');
        const { rerender } = render(
            createElement(
                SplitFlapCanvas,
                props({ flapStyle: { finish: 'matte' } })
            )
        );
        rerender(
            createElement(
                SplitFlapCanvas,
                props({ flapStyle: { finish: 'matte' } })
            )
        );
        expect(setStyle).not.toHaveBeenCalled();
        rerender(
            createElement(
                SplitFlapCanvas,
                props({ flapStyle: { finish: 'satin' } })
            )
        );
        expect(setStyle).toHaveBeenCalledWith({ finish: 'satin' });
    });

    it('applies face changes with setFace, by identity', () => {
        const setFace = vi.spyOn(CanvasFlapRenderer.prototype, 'setFace');
        const { rerender } = render(createElement(SplitFlapCanvas, props()));
        rerender(createElement(SplitFlapCanvas, props()));
        expect(setFace).not.toHaveBeenCalled();
        const next = textFace({ font: '20px sans-serif', theme: 'cream' });
        rerender(createElement(SplitFlapCanvas, props({ face: next })));
        expect(setFace).toHaveBeenCalledWith(next);
    });

    it('recreates the renderer for a new target', () => {
        const destroy = vi.spyOn(CanvasFlapRenderer.prototype, 'destroy');
        const { container, rerender } = render(
            createElement(SplitFlapCanvas, props())
        );
        const other = new FlapField(textField({ sequence: alnum, length: 3 }));
        rerender(createElement(SplitFlapCanvas, props({ target: other })));
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(canvasOf(container).width).toBe(120);
    });

    it('only renders, without advancing the target, when drive is false', () => {
        const start = vi.spyOn(CanvasFlapRenderer.prototype, 'start');
        render(createElement(SplitFlapCanvas, props({ drive: false })));
        expect(start).toHaveBeenCalledWith({ update: false });
    });

    it('fits the canvas to its wrapper', () => {
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        const { container } = render(
            createElement(SplitFlapCanvas, props({ fit: 'width' }))
        );
        const [observer] = FakeResizeObserver.instances;
        expect(observer.observed).toEqual([container.firstChild]);
        observer.resize(160, 0);
        expect(canvasOf(container).style.width).toBe('160px');
    });

    it('passes className and style to the wrapper', () => {
        const { container } = render(
            createElement(
                SplitFlapCanvas,
                props({ className: 'board', style: { maxWidth: '720px' } })
            )
        );
        const wrapper = container.firstChild as HTMLDivElement;
        expect(wrapper.className).toBe('board');
        expect(wrapper.style.maxWidth).toBe('720px');
        expect(wrapper.style.display).toBe('block');
    });
});
