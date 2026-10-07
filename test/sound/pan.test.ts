import { describe, expect, it } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { defineField, FlapField, textField } from '../../src/core/field';
import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { panTable } from '../../src/sound/pan';

const chars = FlapSequence.chars(' AB');
const cities = new FlapSequence(['', 'TOKYO']);

// columns: time 0 and 1, dest spans 2..4 (centre 3) → last column 4
const board = new FlapBoard({
    rows: 2,
    schema: {
        time: textField({ sequence: chars, length: 2 }),
        dest: defineField({ sequence: cities, length: 1, cells: 3 }),
    },
});

describe('panTable', () => {
    it('pans board units by centre column, ignoring rows', () => {
        const pan = panTable(board, 1);
        expect(pan({ field: 'time', unit: 0 })).toBe(-1);
        expect(pan({ field: 'time', unit: 1 })).toBe(-0.5);
        expect(pan({ field: 'dest', unit: 0 })).toBe(0.5);
    });

    it('scales by width', () => {
        expect(panTable(board, 0.6)({ field: 'time', unit: 0 })).toBeCloseTo(
            -0.6
        );
    });

    it('centres unknown fields', () => {
        expect(panTable(board, 1)({ field: 'nope', unit: 0 })).toBe(0);
    });

    it('pans field units across the field', () => {
        const field = new FlapField(textField({ sequence: chars, length: 3 }));
        const pan = panTable(field, 1);
        expect([0, 1, 2].map(unit => pan({ unit }))).toEqual([-1, 0, 1]);
    });

    it('centres a single unit, a single column, and width 0', () => {
        expect(panTable(new FlapUnit({ sequence: chars }), 1)({})).toBe(0);
        const wide = new FlapField(
            defineField({ sequence: cities, length: 1, cells: 5 })
        );
        expect(panTable(wide, 1)({ unit: 0 })).toBe(0);
        expect(panTable(board, 0)({ field: 'time', unit: 0 })).toBe(0);
    });
});
