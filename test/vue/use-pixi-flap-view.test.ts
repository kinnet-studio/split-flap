// @vitest-environment jsdom
import { type Application, Container, type Ticker } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive, shallowRef } from 'vue';

import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { PixiFlapView } from '../../src/pixi';
import { type FacePainter, textFace } from '../../src/render/faces';
import type { FlapStyle } from '../../src/render/style';
import {
    usePixiFlapView,
    type UsePixiFlapViewOptions,
} from '../../src/vue-pixi';
import { fakeCanvasFactory } from '../helpers/fake-canvas';

const painter = textFace({ font: '20px sans-serif' });
const target = new FlapUnit({ sequence: FlapSequence.chars('-AB') });

function fakeApp() {
    const ticker = { add: vi.fn(), remove: vi.fn() };
    const stage = new Container();
    return { app: { stage, ticker } as unknown as Application, ticker, stage };
}

function options(
    extra: Partial<UsePixiFlapViewOptions> = {}
): UsePixiFlapViewOptions {
    return {
        target,
        face: painter,
        cell: { w: 40, h: 60 },
        resolution: 1,
        createCanvas: fakeCanvasFactory,
        ...extra,
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('usePixiFlapView (Vue)', () => {
    it('waits for the app ref, then adds a driven view', async () => {
        const { app, ticker, stage } = fakeApp();
        const appRef = shallowRef<Application | null>(null);
        const scope = effectScope();
        const view = scope.run(() => usePixiFlapView(appRef, options()))!;
        expect(view.value).toBeNull();
        appRef.value = app;
        await nextTick();
        expect(view.value).toBeInstanceOf(PixiFlapView);
        expect(stage.children).toEqual([view.value]);
        expect(ticker.add).toHaveBeenCalledTimes(1);
        scope.stop();
    });

    it('only mirrors the target when drive is false', () => {
        const { app, ticker } = fakeApp();
        const sync = vi.spyOn(PixiFlapView.prototype, 'sync');
        const scope = effectScope();
        scope.run(() => usePixiFlapView(app, options({ drive: false })));
        sync.mockClear();
        const tick = ticker.add.mock.calls[0][0] as (t: Ticker) => void;
        tick({ deltaMS: 16 } as Ticker);
        expect(sync).toHaveBeenCalledTimes(1);
        scope.stop();
    });

    it('applies reactive flapStyle by content and face by identity', async () => {
        const { app } = fakeApp();
        const setStyle = vi.spyOn(PixiFlapView.prototype, 'setStyle');
        const setFace = vi.spyOn(PixiFlapView.prototype, 'setFace');
        // Reactive state read through a getter; core objects stay plain.
        const state = reactive({
            flapStyle: { finish: 'matte' } as FlapStyle,
            face: painter as FacePainter<string>,
        });
        const scope = effectScope();
        scope.run(() =>
            usePixiFlapView(app, () =>
                options({ flapStyle: state.flapStyle, face: state.face })
            )
        );
        state.flapStyle = { finish: 'matte' };
        await nextTick();
        expect(setStyle).not.toHaveBeenCalled();
        state.flapStyle = { finish: 'gloss' };
        await nextTick();
        expect(setStyle).toHaveBeenCalledWith({ finish: 'gloss' });
        const next = textFace({ font: '20px sans-serif', theme: 'airport' });
        state.face = next;
        await nextTick();
        expect(setFace).toHaveBeenCalledWith(next);
        scope.stop();
    });

    it('removes and destroys the view when the scope is disposed', () => {
        const { app, ticker, stage } = fakeApp();
        const scope = effectScope();
        const view = scope.run(() => usePixiFlapView(app, options()))!;
        const created = view.value as PixiFlapView;
        scope.stop();
        expect(ticker.remove).toHaveBeenCalledTimes(1);
        expect(stage.children).toHaveLength(0);
        expect(created.destroyed).toBe(true);
        expect(view.value).toBeNull();
    });
});
