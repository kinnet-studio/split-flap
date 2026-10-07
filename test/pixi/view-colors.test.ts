import { describe, expect, it, vi } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { textField } from '../../src/core/field';
import { FlapSequence } from '../../src/core/sequence';
import { PixiFlapView, type PixiFlapViewOptions } from '../../src/pixi';
import { textFace } from '../../src/render/faces';
import { type FakeCanvas, fakeCanvasFactory } from '../helpers/fake-canvas';

const seq = FlapSequence.chars('-AB');
const font = '20px sans-serif';

function setup(extra: Partial<PixiFlapViewOptions> = {}) {
    const createCanvas = vi.fn(fakeCanvasFactory);
    new PixiFlapView({
        target: new FlapBoard({
            rows: 2,
            schema: { text: textField({ sequence: seq, length: 1 }) },
        }),
        face: textFace({ font }),
        cell: { w: 40, h: 60 },
        resolution: 1,
        createCanvas,
        ...extra,
    });
    return { createCanvas };
}

describe('PixiFlapView colours and finish', () => {
    it('shares faces across rows for ordinary painters', () => {
        expect(setup().createCanvas).toHaveBeenCalledTimes(1);
    });

    it('paints perRow faces once per row, with the real row', () => {
        const rows = vi.fn(() => undefined);
        const { createCanvas } = setup({ face: textFace({ font, rows }) });
        expect(createCanvas).toHaveBeenCalledTimes(2);
        expect(rows.mock.calls).toEqual([[0], [1]]);
    });

    it('bakes the finish into painted faces', () => {
        const { createCanvas } = setup({ style: { finish: 'satin' } });
        const face = createCanvas.mock.results[0].value as FakeCanvas;
        expect(face.context.callsNamed('createLinearGradient')).toHaveLength(1);
        expect(face.context.callsNamed('fillRect')).toHaveLength(302);
    });
});
