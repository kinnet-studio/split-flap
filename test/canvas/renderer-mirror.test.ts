import { describe, expect, it, vi } from 'vitest';

import { CanvasFlapRenderer } from '../../src/canvas/renderer';
import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { textFace } from '../../src/render/faces';
import {
    asCanvasElement,
    FakeCanvas,
    fakeCanvasFactory,
} from '../helpers/fake-canvas';
import { fakeScheduler } from '../helpers/fake-scheduler';

describe('CanvasFlapRenderer.start({ update: false })', () => {
    it('renders every frame without advancing the target', () => {
        const unit = new FlapUnit({ sequence: FlapSequence.chars(' A') });
        const update = vi.spyOn(unit, 'update');
        const frames = fakeScheduler();
        const renderer = new CanvasFlapRenderer({
            canvas: asCanvasElement(new FakeCanvas()),
            target: unit,
            face: textFace({ font: '20px sans-serif' }),
            cell: { w: 40, h: 60 },
            dpr: 1,
            createCanvas: fakeCanvasFactory,
            scheduler: frames.scheduler,
        });
        const render = vi.spyOn(renderer, 'render');
        renderer.start({ update: false });
        frames.tick(1000);
        frames.tick(1016);
        expect(update).not.toHaveBeenCalled();
        expect(render).toHaveBeenCalledTimes(2);
    });
});
