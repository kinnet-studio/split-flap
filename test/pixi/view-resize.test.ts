import { describe, expect, it, vi } from 'vitest';

import { FlapField, textField } from '../../src/core/field';
import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { PixiFlapView, UnitSprite } from '../../src/pixi';
import { textFace } from '../../src/render/faces';
import type { RenderTarget } from '../../src/render/layout';
import { fakeCanvasFactory } from '../helpers/fake-canvas';

const seq = FlapSequence.chars('-AB');
const painter = textFace({
    font: '20px sans-serif',
    color: '#fff',
    background: '#000',
});

function setup(target: RenderTarget = new FlapUnit({ sequence: seq })) {
    const createCanvas = vi.fn(fakeCanvasFactory);
    const view = new PixiFlapView({
        target,
        face: painter,
        cell: { w: 40, h: 60 },
        resolution: 1,
        createCanvas,
    });
    return { view, createCanvas };
}

describe('PixiFlapView.setLayout', () => {
    it('rebuilds the units at the new cell size', () => {
        const { view, createCanvas } = setup();
        view.setLayout({ cell: { w: 20, h: 30 } });
        expect(view.children).toHaveLength(1);
        const sprite = view.children[0] as UnitSprite;
        expect(sprite.top.height).toBeCloseTo(15);
        expect([view.layoutWidth, view.layoutHeight]).toEqual([20, 30]);
        expect(createCanvas).toHaveBeenLastCalledWith(20, 30);
    });

    it('merges gaps with the current layout', () => {
        const { view } = setup(
            new FlapField(textField({ sequence: seq, length: 2 }))
        );
        view.setLayout({ gap: { unit: 10 } });
        expect(view.children).toHaveLength(2);
        expect(view.children[1].x).toBe(50);
        expect(view.layoutWidth).toBe(90);
    });
});

describe('PixiFlapView.fitTo', () => {
    it('scales the view and repaints faces at resolution × scale', () => {
        const { view, createCanvas } = setup();
        view.fitTo(80, 0);
        expect(view.scale.x).toBe(2);
        expect(view.scale.y).toBe(2);
        expect(createCanvas).toHaveBeenLastCalledWith(80, 120);
        const sprite = view.children[0] as UnitSprite;
        expect(sprite.top.width).toBeCloseTo(40);
        expect([view.layoutWidth, view.layoutHeight]).toEqual([40, 60]);
    });

    it('fits both dimensions in contain mode and ignores empty boxes', () => {
        const { view } = setup();
        view.fitTo(400, 30, 'contain');
        expect(view.scale.x).toBe(0.5);
        view.fitTo(0, 0);
        expect(view.scale.x).toBe(0.5);
    });
});
