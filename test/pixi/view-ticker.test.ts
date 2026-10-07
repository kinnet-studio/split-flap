import { Ticker } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { PixiFlapView } from '../../src/pixi';
import { textFace } from '../../src/render/faces';
import { fakeCanvasFactory } from '../helpers/fake-canvas';

function setup() {
    const unit = new FlapUnit({ sequence: FlapSequence.chars('-AB') });
    const view = new PixiFlapView({
        target: unit,
        face: textFace({ font: '20px sans-serif' }),
        cell: { w: 40, h: 60 },
        resolution: 1,
        createCanvas: fakeCanvasFactory,
    });
    return { unit, view };
}

describe('PixiFlapView ticker handling', () => {
    it('only syncs on each tick with attach(ticker, { update: false })', () => {
        const { unit, view } = setup();
        const update = vi.spyOn(unit, 'update');
        const sync = vi.spyOn(view, 'sync');
        const ticker = { add: vi.fn(), remove: vi.fn() };
        view.attach(ticker as unknown as Ticker, { update: false });
        const tick = ticker.add.mock.calls[0][0] as (t: Ticker) => void;
        tick({ deltaMS: 16 } as Ticker);
        expect(update).not.toHaveBeenCalled();
        expect(sync).toHaveBeenCalledTimes(1);
        view.detach();
        expect(ticker.remove).toHaveBeenCalledWith(tick);
    });

    it('detaches and destroys cleanly after its ticker was destroyed', () => {
        const { view } = setup();
        const ticker = new Ticker();
        view.attach(ticker);
        ticker.destroy();
        expect(() => view.detach()).not.toThrow();
        const second = new Ticker();
        view.attach(second);
        second.destroy();
        expect(() => view.destroy()).not.toThrow();
        expect(view.destroyed).toBe(true);
    });
});
