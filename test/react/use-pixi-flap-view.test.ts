// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { type Application, Container, type Ticker } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { PixiFlapView } from '../../src/pixi';
import {
    usePixiFlapView,
    type UsePixiFlapViewOptions,
} from '../../src/react-pixi';
import { textFace } from '../../src/render/faces';
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
    cleanup();
    vi.restoreAllMocks();
});

describe('usePixiFlapView (React)', () => {
    it('returns null until there is an app', () => {
        const { result } = renderHook(() => usePixiFlapView(null, options()));
        expect(result.current).toBeNull();
    });

    it('adds a view to the stage and drives it on the ticker', () => {
        const { app, ticker, stage } = fakeApp();
        const attach = vi.spyOn(PixiFlapView.prototype, 'attach');
        const { result } = renderHook(() => usePixiFlapView(app, options()));
        expect(result.current).toBeInstanceOf(PixiFlapView);
        expect(stage.children).toEqual([result.current]);
        expect(attach).toHaveBeenCalledWith(app.ticker);
        expect(ticker.add).toHaveBeenCalledTimes(1);
    });

    it('only mirrors the target when drive is false', () => {
        const { app, ticker } = fakeApp();
        const sync = vi.spyOn(PixiFlapView.prototype, 'sync');
        renderHook(() => usePixiFlapView(app, options({ drive: false })));
        sync.mockClear();
        const tick = ticker.add.mock.calls[0][0] as (t: Ticker) => void;
        tick({ deltaMS: 16 } as Ticker);
        expect(sync).toHaveBeenCalledTimes(1);
    });

    it('applies flapStyle by content and face by identity', () => {
        const { app } = fakeApp();
        const setStyle = vi.spyOn(PixiFlapView.prototype, 'setStyle');
        const setFace = vi.spyOn(PixiFlapView.prototype, 'setFace');
        const { rerender } = renderHook(
            (opts: UsePixiFlapViewOptions) => usePixiFlapView(app, opts),
            { initialProps: options({ flapStyle: { finish: 'matte' } }) }
        );
        rerender(options({ flapStyle: { finish: 'matte' } }));
        expect(setStyle).not.toHaveBeenCalled();
        rerender(options({ flapStyle: { finish: 'gloss' } }));
        expect(setStyle).toHaveBeenCalledWith({ finish: 'gloss' });
        const next = textFace({ font: '20px sans-serif', theme: 'airport' });
        rerender(options({ flapStyle: { finish: 'gloss' }, face: next }));
        expect(setFace).toHaveBeenCalledWith(next);
    });

    it('removes and destroys the view on unmount', () => {
        const { app, ticker, stage } = fakeApp();
        const { result, unmount } = renderHook(() =>
            usePixiFlapView(app, options())
        );
        const view = result.current as PixiFlapView;
        unmount();
        expect(ticker.remove).toHaveBeenCalledTimes(1);
        expect(stage.children).toHaveLength(0);
        expect(view.destroyed).toBe(true);
    });
});
