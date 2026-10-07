import { describe, expect, it, vi } from 'vitest';

import {
    CanvasFlapRenderer,
    type CanvasFlapRendererOptions,
} from '../../src/canvas/renderer';
import { FlapBoard } from '../../src/core/board';
import { textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { textFace } from '../../src/render/faces';
import {
    asCanvasElement,
    FakeCanvas,
    fakeCanvasFactory,
} from '../helpers/fake-canvas';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const font = '20px sans-serif';

/** A 2-row, 1-unit board; every unit starts on the blank flap. */
function setup(extra: Partial<CanvasFlapRendererOptions> = {}) {
    const createCanvas = vi.fn(fakeCanvasFactory);
    new CanvasFlapRenderer({
        canvas: asCanvasElement(new FakeCanvas()),
        target: new FlapBoard({
            rows: 2,
            schema: { text: textField({ sequence: alnum, length: 1 }) },
        }),
        face: textFace({ font }),
        cell: { w: 40, h: 60 },
        dpr: 1,
        createCanvas,
        scheduler: { request: () => 0, cancel: () => {} },
        ...extra,
    });
    return { createCanvas };
}

const faceCanvases = (createCanvas: ReturnType<typeof setup>['createCanvas']) =>
    createCanvas.mock.results.map(result => result.value as FakeCanvas);

describe('CanvasFlapRenderer colours and finish', () => {
    it('shares faces across rows for ordinary painters', () => {
        const { createCanvas } = setup();
        expect(createCanvas).toHaveBeenCalledTimes(1);
    });

    it('paints perRow faces once per row, with the real row', () => {
        const rows = vi.fn(() => undefined);
        const { createCanvas } = setup({ face: textFace({ font, rows }) });
        expect(createCanvas).toHaveBeenCalledTimes(2);
        expect(rows.mock.calls).toEqual([[0], [1]]);
    });

    it('bakes the finish into painted faces', () => {
        const { createCanvas } = setup({ style: { finish: 'matte' } });
        const [face] = faceCanvases(createCanvas);
        expect(face.context.callsNamed('createLinearGradient')).toHaveLength(1);
        // background + gradient + 300 grain specks (40 × 60 / 8)
        expect(face.context.callsNamed('fillRect')).toHaveLength(302);
    });

    it('adds nothing with the default gloss finish', () => {
        const { createCanvas } = setup();
        const [face] = faceCanvases(createCanvas);
        expect(face.context.callsNamed('createLinearGradient')).toHaveLength(0);
        expect(face.context.callsNamed('fillRect')).toHaveLength(1);
    });
});
