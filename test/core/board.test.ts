import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type BoardStagger,
    FlapBoard,
    type RowValues,
} from '../../src/core/board';
import { FlapField, textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const cities = new FlapSequence(['', 'TOKYO', 'OSAKA']);
const fast = { flipDuration: 10 };

function makeBoard(stagger?: BoardStagger) {
    return new FlapBoard({
        rows: 2,
        stagger,
        schema: {
            time: textField({ sequence: alnum, length: 4, unit: fast }),
            dest: { sequence: cities, length: 1, cells: 6, unit: fast },
            plat: textField({
                sequence: alnum,
                length: 2,
                align: 'right',
                unit: fast,
            }),
        },
    });
}

function shown<V>(field: FlapField<string, V>): string {
    return field.units.map(unit => unit.state.current).join('');
}

describe('FlapBoard', () => {
    it('validates rows and schema', () => {
        expect(
            () =>
                new FlapBoard({
                    rows: 0,
                    schema: { t: textField({ sequence: alnum, length: 1 }) },
                })
        ).toThrow(RangeError);
        expect(() => new FlapBoard({ rows: 1, schema: {} })).toThrow(
            RangeError
        );
    });

    it('shows rows of named fields', () => {
        const board = makeBoard();
        board.show([{ time: '0915', dest: 'TOKYO', plat: '3' }]);
        board.update(10_000);
        expect(shown(board.field(0, 'time'))).toBe('0915');
        expect(board.field(0, 'dest').units[0].state.current).toBe('TOKYO');
        expect(shown(board.field(0, 'plat'))).toBe(' 3');
        expect(shown(board.field(1, 'time'))).toBe('    ');
    });

    it('blanks missing fields and rows on show', () => {
        const board = makeBoard();
        board.show([
            { time: '0915', dest: 'TOKYO', plat: '3' },
            { time: '1000' },
        ]);
        board.update(10_000);
        board.show([{ dest: 'OSAKA' }]);
        board.update(10_000);
        expect(shown(board.field(0, 'time'))).toBe('    ');
        expect(board.field(0, 'dest').units[0].state.current).toBe('OSAKA');
        expect(shown(board.field(1, 'time'))).toBe('    ');
    });

    it('ignores rows beyond the board', () => {
        const board = makeBoard();
        expect(() => board.show([{}, {}, { time: '9999' }])).not.toThrow();
    });

    it('updates only the named fields of a row', () => {
        const board = makeBoard();
        board.show([{ time: '0915', dest: 'TOKYO', plat: '3' }]);
        board.update(10_000);
        board.row(0).set({ plat: '4' });
        board.update(10_000);
        expect(shown(board.field(0, 'time'))).toBe('0915');
        expect(shown(board.field(0, 'plat'))).toBe(' 4');
    });

    it('rejects out-of-range rows', () => {
        const board = makeBoard();
        expect(() => board.row(2)).toThrow(RangeError);
        expect(() => board.field(-1, 'time')).toThrow(RangeError);
    });

    it('emits settled once when every unit settles', () => {
        const board = makeBoard();
        let settled = 0;
        board.on('settled', () => settled++);
        board.show([{ time: '0915' }]);
        expect(board.isSettled).toBe(false);
        board.update(10_000);
        board.update(10_000);
        expect(board.isSettled).toBe(true);
        expect(settled).toBe(1);
    });

    it('emits settled once when a field is driven directly', () => {
        const board = makeBoard();
        let settled = 0;
        board.on('settled', () => settled++);
        board.field(0, 'plat').set('AB');
        board.update(1000);
        board.update(1000);
        expect(board.isSettled).toBe(true);
        expect(settled).toBe(1);
    });

    it('rejects names that are not in the schema', () => {
        const board = makeBoard();
        expect(() => board.field(0, 'toString' as never)).toThrow(RangeError);
    });

    it('does not consume random for fields a row update leaves alone', () => {
        let calls = 0;
        const board = makeBoard({
            order: 'random',
            step: 10,
            random: () => {
                calls++;
                return 0.5;
            },
        });
        board.row(0).set({ plat: 'A' });
        expect(calls).toBe(2);
    });

    it('emits flipend with row, field and unit', () => {
        const board = makeBoard();
        const flips: unknown[] = [];
        board.on('flipend', event => flips.push(event));
        board.row(1).set({ dest: 'TOKYO' });
        board.update(10);
        expect(flips).toEqual([
            {
                from: '',
                to: 'TOKYO',
                direction: 1,
                unit: 0,
                row: 1,
                field: 'dest',
            },
        ]);
    });

    it('staggers by cell column across the row', () => {
        const board = makeBoard({ order: 'column', step: 100 });
        board.show([{ time: 'AAAA', dest: 'TOKYO', plat: 'AA' }]);
        board.update(10);
        expect(board.field(0, 'time').units[0].state.current).toBe('A');
        expect(board.field(0, 'time').units[1].state.current).toBe(' ');
        board.update(400);
        // dest is at cell column 4 → 400 ms delay; plat starts at column 10
        expect(board.field(0, 'dest').units[0].state.current).toBe('TOKYO');
        expect(board.field(0, 'plat').units[0].state.current).toBe(' ');
    });

    it('staggers by row', () => {
        const board = makeBoard({ order: 'row', step: 100 });
        board.show([{ time: 'A' }, { time: 'A' }]);
        board.update(10);
        expect(shown(board.field(0, 'time'))).toBe('A   ');
        expect(shown(board.field(1, 'time'))).toBe('    ');
    });

    it('staggers diagonally', () => {
        const board = makeBoard({ order: 'diagonal', step: 100 });
        board.show([{}, { time: ' A' }]);
        board.update(199);
        expect(board.field(1, 'time').units[1].state.current).toBe(' ');
        board.update(11);
        expect(board.field(1, 'time').units[1].state.current).toBe('A');
    });

    it('staggers randomly up to the last cell column', () => {
        // last column is 11 (plat's second unit) → 0.5 * 11 * 10 = 55 ms
        const board = makeBoard({
            order: 'random',
            step: 10,
            random: () => 0.5,
        });
        board.show([{ time: 'A' }]);
        board.update(54);
        expect(board.field(0, 'time').units[0].state.current).toBe(' ');
        board.update(11);
        expect(board.field(0, 'time').units[0].state.current).toBe('A');
    });

    it("lets a field's own stagger replace the board stagger", () => {
        const board = new FlapBoard({
            rows: 1,
            stagger: { order: 'column', step: 100 },
            schema: {
                time: textField({
                    sequence: alnum,
                    length: 2,
                    unit: fast,
                    stagger: { order: 'none', step: 0 },
                }),
            },
        });
        board.show([{ time: 'AA' }]);
        board.update(10);
        expect(shown(board.field(0, 'time'))).toBe('AA');
    });

    it('spins and stops every field', () => {
        const board = makeBoard();
        board.spin();
        board.update(25);
        expect(board.isSettled).toBe(false);
        board.stop();
        board.update(100);
        expect(board.isSettled).toBe(true);
    });

    it('infers row value types from the schema', () => {
        const board = makeBoard();
        expectTypeOf(board.field(0, 'dest')).toEqualTypeOf<
            FlapField<string, string | string[]>
        >();
        expectTypeOf<RowValues<typeof board.schema>>().toEqualTypeOf<{
            time?: string;
            dest?: string | string[];
            plat?: string;
        }>();
    });
});
