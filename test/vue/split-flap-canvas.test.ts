// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasFlapRenderer } from '../../src/canvas/renderer';
import { FlapField, textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { textFace } from '../../src/render/faces';
import { SplitFlapCanvas } from '../../src/vue';
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeResizeObserver.instances = [];
});

function mountCanvas(
    props: Record<string, unknown> = {},
    attrs: Record<string, unknown> = {}
) {
    return mount(SplitFlapCanvas, {
        props: {
            target,
            face: painter,
            cell: { w: 40, h: 60 },
            dpr: 1,
            createCanvas: fakeCanvasFactory,
            scheduler: frames.scheduler,
            ...props,
        },
        attrs,
        attachTo: document.body,
    });
}

const canvasOf = (wrapper: ReturnType<typeof mountCanvas>) =>
    wrapper.find('canvas').element as HTMLCanvasElement;

describe('SplitFlapCanvas (Vue)', () => {
    it('draws the target into its canvas and starts the loop', () => {
        const wrapper = mountCanvas();
        const canvas = canvasOf(wrapper);
        expect(canvas.width).toBe(80);
        expect(
            contextOf(canvas).callsNamed('drawImage').length
        ).toBeGreaterThan(0);
        expect(frames.callbacks.size).toBe(1);
        wrapper.unmount();
    });

    it('destroys the renderer on unmount', () => {
        const destroy = vi.spyOn(CanvasFlapRenderer.prototype, 'destroy');
        mountCanvas().unmount();
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(frames.callbacks.size).toBe(0);
    });

    it('applies cell and gap changes with setLayout, by content', async () => {
        const setLayout = vi.spyOn(CanvasFlapRenderer.prototype, 'setLayout');
        const wrapper = mountCanvas();
        await wrapper.setProps({ cell: { w: 40, h: 60 } });
        expect(setLayout).not.toHaveBeenCalled();
        await wrapper.setProps({ cell: { w: 20, h: 30 } });
        expect(setLayout).toHaveBeenCalledTimes(1);
        expect(canvasOf(wrapper).width).toBe(40);
        wrapper.unmount();
    });

    it('applies flapStyle by content and face by identity', async () => {
        const setStyle = vi.spyOn(CanvasFlapRenderer.prototype, 'setStyle');
        const setFace = vi.spyOn(CanvasFlapRenderer.prototype, 'setFace');
        const wrapper = mountCanvas({ flapStyle: { finish: 'matte' } });
        await wrapper.setProps({ flapStyle: { finish: 'matte' } });
        expect(setStyle).not.toHaveBeenCalled();
        await wrapper.setProps({ flapStyle: { finish: 'satin' } });
        expect(setStyle).toHaveBeenCalledWith({ finish: 'satin' });
        const next = textFace({ font: '20px sans-serif', theme: 'cream' });
        await wrapper.setProps({ face: next });
        expect(setFace).toHaveBeenCalledWith(next);
        wrapper.unmount();
    });

    it('recreates the renderer for a new target', async () => {
        const destroy = vi.spyOn(CanvasFlapRenderer.prototype, 'destroy');
        const wrapper = mountCanvas();
        await wrapper.setProps({
            target: new FlapField(textField({ sequence: alnum, length: 3 })),
        });
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(canvasOf(wrapper).width).toBe(120);
        wrapper.unmount();
    });

    it('only renders, without advancing the target, when drive is false', () => {
        const start = vi.spyOn(CanvasFlapRenderer.prototype, 'start');
        mountCanvas({ drive: false }).unmount();
        expect(start).toHaveBeenCalledWith({ update: false });
    });

    it('fits the canvas to its wrapper', () => {
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        const wrapper = mountCanvas({ fit: 'width' });
        const [observer] = FakeResizeObserver.instances;
        expect(observer.observed).toEqual([wrapper.element]);
        observer.resize(160, 0);
        expect(canvasOf(wrapper).style.width).toBe('160px');
        wrapper.unmount();
    });

    it('applies class and style attributes to the wrapper', () => {
        const wrapper = mountCanvas(
            {},
            { class: 'board', style: 'max-width: 720px' }
        );
        const element = wrapper.element as HTMLDivElement;
        expect(element.className).toBe('board');
        expect(element.style.maxWidth).toBe('720px');
        expect(element.style.display).toBe('block');
        wrapper.unmount();
    });
});
