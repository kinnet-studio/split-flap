import { describe, expect, it, vi } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { textField } from '../../src/core/field';
import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import {
    PixiFlapView,
    type PixiFlapViewOptions,
    UnitSprite,
} from '../../src/pixi';
import { textFace } from '../../src/render/faces';
import { fakeCanvasFactory } from '../helpers/fake-canvas';

const seq = FlapSequence.chars('-AB');
const painter = textFace({ font: '20px sans-serif' });

function setup(extra: Partial<PixiFlapViewOptions> = {}) {
    const createCanvas = vi.fn(fakeCanvasFactory);
    const view = new PixiFlapView({
        target: new FlapUnit({ sequence: seq }),
        face: painter,
        cell: { w: 40, h: 60 },
        resolution: 1,
        createCanvas,
        ...extra,
    });
    return { view, createCanvas };
}

const sprite = (view: PixiFlapView) => view.children[0] as UnitSprite;

describe('PixiFlapView.setStyle', () => {
    it('exposes the resolved style', () => {
        expect(setup().view.flapStyle).toMatchObject({
            finish: 'gloss',
            stack: null,
        });
    });

    it('rebuilds the sprites for the new style', () => {
        const { view, createCanvas } = setup();
        expect(sprite(view).stack).toHaveLength(0);
        view.setStyle({ stack: { count: 2, step: 3 } });
        expect(view.children).toHaveLength(1);
        expect(sprite(view).stack).toHaveLength(2);
        expect(view.flapStyle.stack).toMatchObject({ count: 2, step: 3 });
        expect(createCanvas).toHaveBeenLastCalledWith(40, 54);
    });
});

describe('PixiFlapView.setFace', () => {
    it('swaps in textures from the new painter', () => {
        const { view } = setup();
        const before = sprite(view).top.texture;
        const next = vi.fn(
            textFace({ font: '20px sans-serif', theme: 'airport' })
        );
        view.setFace(next);
        expect(next).toHaveBeenCalled();
        expect(sprite(view).top.texture).not.toBe(before);
    });

    it('rejects a face map without a face for every field', () => {
        const { view } = setup({
            target: new FlapBoard({
                rows: 1,
                schema: {
                    a: textField({ sequence: seq, length: 1 }),
                    b: textField({ sequence: seq, length: 1 }),
                },
            }),
            face: { a: painter, b: painter },
        });
        expect(() => view.setFace({ a: painter })).toThrow(
            'no face for field "b"'
        );
        expect(() => view.sync()).not.toThrow();
    });
});
