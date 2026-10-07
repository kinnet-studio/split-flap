import { describe, expect, it } from 'vitest';

import { FLAP_THEMES, textFace } from '../../src/render/faces';
import { asCtx, FakeContext } from '../helpers/fake-canvas';

const font = '20px sans-serif';

/** Paints `flap` and returns [background, text colour]. */
function paint(
    painter: ReturnType<typeof textFace>,
    flap = 'A',
    row = 0
): [unknown, unknown] {
    const ctx = new FakeContext();
    painter(asCtx(ctx), flap, 40, 60, { row, field: 'dest' });
    return [
        ctx.callsNamed('fillRect')[0].fillStyle,
        ctx.callsNamed('fillText')[0].fillStyle,
    ];
}

describe('textFace colours', () => {
    it('defaults to the classic theme', () => {
        expect(paint(textFace({ font }))).toEqual([
            FLAP_THEMES.classic.background,
            FLAP_THEMES.classic.color,
        ]);
    });

    it('uses named and custom themes', () => {
        expect(paint(textFace({ font, theme: 'airport' }))).toEqual([
            '#f5c400',
            '#141414',
        ]);
        expect(
            paint(
                textFace({ font, theme: { color: '#fff', background: '#00f' } })
            )
        ).toEqual(['#00f', '#fff']);
    });

    it('lets explicit colours override the theme', () => {
        expect(
            paint(textFace({ font, theme: 'cream', color: '#c00' }))
        ).toEqual([FLAP_THEMES.cream.background, '#c00']);
    });

    it('colours individual flaps', () => {
        const painter = textFace({
            font,
            colors: flap =>
                flap === 'DELAYED' ? { color: '#ff5a4f' } : undefined,
        });
        expect(paint(painter, 'DELAYED')[1]).toBe('#ff5a4f');
        expect(paint(painter, 'TOKYO')[1]).toBe(FLAP_THEMES.classic.color);
    });

    it('colours rows and marks the painter perRow', () => {
        const painter = textFace({
            font,
            rows: row => (row % 2 ? { background: '#2b2b30' } : undefined),
        });
        expect(painter.perRow).toBe(true);
        expect(paint(painter, 'A', 1)[0]).toBe('#2b2b30');
        expect(paint(painter, 'A', 2)[0]).toBe(FLAP_THEMES.classic.background);
        expect(textFace({ font }).perRow).toBeUndefined();
    });

    it('ranks flap over row over explicit over theme', () => {
        const painter = textFace({
            font,
            theme: 'solari',
            background: '#111',
            rows: () => ({ background: '#222', color: '#333' }),
            colors: flap => (flap === 'X' ? { color: '#444' } : undefined),
        });
        expect(paint(painter, 'X')).toEqual(['#222', '#444']);
        expect(paint(painter, 'Y')).toEqual(['#222', '#333']);
    });

    it('rejects unknown theme names', () => {
        expect(() =>
            textFace({ font, theme: 'neon' as unknown as 'classic' })
        ).toThrow(RangeError);
    });
});
