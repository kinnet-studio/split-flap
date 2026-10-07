import { Texture, TextureSource, type Ticker } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { FlapField, textField } from '../../src/core/field';
import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { PixiFlapView, textureFace, UnitSprite } from '../../src/pixi';
import { textFace } from '../../src/render/faces';
import { fakeCanvasFactory } from '../helpers/fake-canvas';

const seq = FlapSequence.chars('-AB');
const linear = (progress: number) => progress * 180;
const COS45 = Math.cos(Math.PI / 4);

function placeholderFaces() {
    const sources = new Map<string, TextureSource>();
    const sourceOf = (flap: string): TextureSource => {
        let source = sources.get(flap);
        if (!source) {
            source = new TextureSource({ width: 40, height: 60 });
            sources.set(flap, source);
        }
        return source;
    };
    const face = textureFace(
        (flap: string) => new Texture({ source: sourceOf(flap) })
    );
    return { sourceOf, face };
}

function setupUnit() {
    const unit = new FlapUnit({ sequence: seq, flipDuration: 100 });
    const { sourceOf, face } = placeholderFaces();
    const view = new PixiFlapView({
        target: unit,
        face,
        cell: { w: 40, h: 60 },
        flipCurve: linear,
    });
    const sprite = view.children[0] as UnitSprite;
    return { unit, view, sprite, sourceOf };
}

function fakeTicker() {
    const ticker = { add: vi.fn(), remove: vi.fn() };
    return { ticker, asTicker: ticker as unknown as Ticker };
}

describe('PixiFlapView', () => {
    it('creates one UnitSprite per unit at its layout position', () => {
        const field = new FlapField(textField({ sequence: seq, length: 2 }));
        const view = new PixiFlapView({
            target: field,
            face: placeholderFaces().face,
            cell: { w: 40, h: 60 },
            gap: { unit: 4 },
        });
        expect(view.children).toHaveLength(2);
        expect(view.children[1]).toBeInstanceOf(UnitSprite);
        expect(view.children[1].x).toBe(44);
    });

    it('shows both halves of the current flap when settled', () => {
        const { sprite, sourceOf } = setupUnit();
        expect(sprite.top.texture.source).toBe(sourceOf('-'));
        expect(sprite.top.texture.frame.height).toBe(30);
        expect(sprite.bottom.texture.frame.y).toBe(30);
        expect(sprite.bottom.y).toBe(30);
        expect(sprite.top.height).toBeCloseTo(30);
        expect(sprite.flap.visible).toBe(false);
        expect(sprite.shadow.visible).toBe(false);
    });

    it('folds the current top down during the first half', () => {
        const { unit, view, sprite, sourceOf } = setupUnit();
        unit.setTarget('A');
        view.update(25);
        expect(sprite.top.texture.source).toBe(sourceOf('A'));
        expect(sprite.bottom.texture.source).toBe(sourceOf('-'));
        expect(sprite.flap.visible).toBe(true);
        expect(sprite.flap.texture.source).toBe(sourceOf('-'));
        expect(sprite.flap.texture.frame.y).toBe(0);
        expect(sprite.flap.anchor.y).toBe(1);
        expect(sprite.flap.y).toBe(30);
        expect(sprite.flap.height).toBeCloseTo(30 * COS45);
        const gray = Math.round(255 * (1 - (1 - COS45) * 0.5));
        expect(sprite.flap.tint).toBe((gray << 16) | (gray << 8) | gray);
        expect(sprite.shadow.visible).toBe(true);
        expect(sprite.shadow.y).toBe(30);
        expect(sprite.shadow.alpha).toBeCloseTo(Math.sin(Math.PI / 4) * 0.35);
    });

    it('unfolds the next bottom during the second half', () => {
        const { unit, view, sprite, sourceOf } = setupUnit();
        unit.setTarget('A');
        view.update(75);
        expect(sprite.flap.texture.source).toBe(sourceOf('A'));
        expect(sprite.flap.texture.frame.y).toBe(30);
        expect(sprite.flap.anchor.y).toBe(0);
        expect(sprite.flap.height).toBeCloseTo(30 * COS45);
    });

    it('hides the flap when it is edge-on', () => {
        const { unit, view, sprite } = setupUnit();
        unit.setTarget('A');
        view.update(50);
        expect(sprite.flap.visible).toBe(false);
    });

    it('turns painted faces into textures at the given resolution', () => {
        const view = new PixiFlapView({
            target: new FlapUnit({ sequence: seq }),
            face: textFace({
                font: '20px sans-serif',
                color: '#fff',
                background: '#000',
            }),
            cell: { w: 40, h: 60 },
            resolution: 2,
            createCanvas: fakeCanvasFactory,
        });
        const sprite = view.children[0] as UnitSprite;
        expect(sprite.top.texture.frame.width).toBe(80);
        expect(sprite.top.texture.frame.height).toBe(60);
        expect(sprite.top.width).toBeCloseTo(40);
    });

    it('has no stack sprites when the stack is off', () => {
        const { sprite } = setupUnit();
        expect(sprite.stack).toHaveLength(0);
    });

    it('stacks earlier flaps under the bottom half when the stack is on', () => {
        const { sourceOf, face } = placeholderFaces();
        const view = new PixiFlapView({
            target: new FlapUnit({ sequence: seq }),
            face,
            cell: { w: 40, h: 60 },
            style: { stack: { count: 2, step: 3 } },
        });
        const sprite = view.children[0] as UnitSprite;
        // face is 60 - 2 × 3 = 54 px, so each half is 27 px
        expect(sprite.top.height).toBeCloseTo(27);
        expect(sprite.bottom.y).toBe(27);
        // '-' is showing; the flaps before it on the drum are B, then A
        const [first, second] = sprite.stack;
        expect(first.texture.source).toBe(sourceOf('B'));
        expect(first.y).toBe(30);
        expect(first.height).toBeCloseTo(27);
        expect(second.texture.source).toBe(sourceOf('A'));
        expect(second.y).toBe(33);
        const gray = (k: number) => Math.round(255 * (1 - k * 0.15));
        expect(first.tint).toBe((gray(1) << 16) | (gray(1) << 8) | gray(1));
        expect(second.tint).toBe((gray(2) << 16) | (gray(2) << 8) | gray(2));
        // drawn behind the halves, deepest first
        expect(sprite.getChildIndex(second)).toBeLessThan(
            sprite.getChildIndex(first)
        );
        expect(sprite.getChildIndex(first)).toBeLessThan(
            sprite.getChildIndex(sprite.bottom)
        );
    });

    it('advances with a ticker, capping the frame delta at 250 ms', () => {
        const { unit, view } = setupUnit();
        const { ticker, asTicker } = fakeTicker();
        view.attach(asTicker);
        const tick = ticker.add.mock.calls[0][0] as (t: Ticker) => void;
        unit.spin();
        tick({ deltaMS: 25 } as Ticker);
        expect(unit.state.progress).toBeCloseTo(0.25);
        tick({ deltaMS: 1000 } as Ticker);
        expect(unit.state).toMatchObject({ current: 'B', next: '-' });
        expect(unit.state.progress).toBeCloseTo(0.75);
        view.detach();
        expect(ticker.remove).toHaveBeenCalledWith(tick);
    });

    it('detaches from its ticker when destroyed', () => {
        const { view } = setupUnit();
        const { ticker, asTicker } = fakeTicker();
        view.attach(asTicker);
        view.destroy();
        expect(ticker.remove).toHaveBeenCalledTimes(1);
        expect(view.destroyed).toBe(true);
    });

    it('keeps shared and user-supplied textures alive when destroyed', () => {
        const { view, sourceOf } = setupUnit();
        view.destroy(true);
        expect(view.destroyed).toBe(true);
        expect(Texture.WHITE.destroyed).toBe(false);
        expect(sourceOf('-').destroyed).toBe(false);
    });

    it('destroys the textures it painted itself when destroyed', () => {
        const view = new PixiFlapView({
            target: new FlapUnit({ sequence: seq }),
            face: textFace({
                font: '20px sans-serif',
                color: '#fff',
                background: '#000',
            }),
            cell: { w: 40, h: 60 },
            createCanvas: fakeCanvasFactory,
        });
        const source = (view.children[0] as UnitSprite).top.texture.source;
        expect(source.destroyed).toBe(false);
        view.destroy();
        expect(source.destroyed).toBe(true);
    });

    it('throws when a board field has no face', () => {
        const board = new FlapBoard({
            rows: 1,
            schema: {
                a: textField({ sequence: seq, length: 1 }),
                b: textField({ sequence: seq, length: 1 }),
            },
        });
        expect(
            () =>
                new PixiFlapView({
                    target: board,
                    face: { a: placeholderFaces().face },
                    cell: { w: 40, h: 60 },
                })
        ).toThrow('no face for field "b"');
    });
});
