import { describe, expect, it } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { defineField, FlapField, textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { layout, SINGLE_FIELD } from '../../src/render/layout';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const cities = new FlapSequence(['', 'TOKYO']);
const cell = { w: 40, h: 60 };

describe('layout', () => {
    it('lays out a single unit', () => {
        const unit = new FlapUnit({ sequence: alnum });
        const result = layout(unit, { cell });
        expect(result.width).toBe(40);
        expect(result.height).toBe(60);
        expect(result.slots).toEqual([
            {
                unit,
                sequence: alnum,
                rect: { x: 0, y: 0, w: 40, h: 60 },
                row: 0,
                field: SINGLE_FIELD,
                index: 0,
            },
        ]);
    });

    it('spaces field units by the unit gap', () => {
        const field = new FlapField(textField({ sequence: alnum, length: 3 }));
        const result = layout(field, { cell, gap: { unit: 4 } });
        expect(result.slots.map(slot => slot.rect.x)).toEqual([0, 44, 88]);
        expect(result.width).toBe(128);
    });

    it('widens units that span several cells', () => {
        const field = new FlapField(
            defineField({ sequence: cities, length: 2, cells: 2 })
        );
        const result = layout(field, { cell, gap: { unit: 4 } });
        expect(result.slots.map(slot => slot.rect)).toEqual([
            { x: 0, y: 0, w: 84, h: 60 },
            { x: 88, y: 0, w: 84, h: 60 },
        ]);
        expect(result.width).toBe(172);
    });

    it('lays out board rows of fields with field and row gaps', () => {
        const board = new FlapBoard({
            rows: 2,
            schema: {
                time: textField({ sequence: alnum, length: 2 }),
                dest: { sequence: cities, length: 1, cells: 3 },
            },
        });
        const result = layout(board, {
            cell: { w: 20, h: 30 },
            gap: { unit: 2, field: 10, row: 6 },
        });
        expect(
            result.slots.map(slot => [
                slot.row,
                slot.field,
                slot.index,
                slot.rect.x,
                slot.rect.y,
                slot.rect.w,
            ])
        ).toEqual([
            [0, 'time', 0, 0, 0, 20],
            [0, 'time', 1, 22, 0, 20],
            [0, 'dest', 0, 52, 0, 64],
            [1, 'time', 0, 0, 36, 20],
            [1, 'time', 1, 22, 36, 20],
            [1, 'dest', 0, 52, 36, 64],
        ]);
        expect(result.width).toBe(116);
        expect(result.height).toBe(66);
        expect(result.slots[2].unit).toBe(board.field(0, 'dest').units[0]);
        expect(result.slots[2].sequence).toBe(cities);
    });
});
