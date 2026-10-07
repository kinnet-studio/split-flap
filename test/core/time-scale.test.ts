import { describe, expect, it } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { FlapField, textField } from '../../src/core/field';
import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';

const seq = FlapSequence.chars('-ABCDE');

function shown<V>(field: FlapField<string, V>): string {
    return field.units.map(unit => unit.state.current).join('');
}

function textBoard(flipDuration: number) {
    return new FlapBoard({
        rows: 1,
        schema: {
            text: textField({
                sequence: seq,
                length: 1,
                unit: { flipDuration },
            }),
        },
    });
}

describe('timeScale', () => {
    it('defaults to 1 everywhere', () => {
        const board = textBoard(100);
        expect(board.timeScale).toBe(1);
        expect(board.field(0, 'text').timeScale).toBe(1);
        expect(board.field(0, 'text').units[0].timeScale).toBe(1);
    });

    it('speeds up and slows down a unit', () => {
        const fast = new FlapUnit({ sequence: seq, flipDuration: 100 });
        fast.timeScale = 2;
        fast.setTarget('A');
        fast.update(25);
        expect(fast.state.progress).toBe(0.5);

        const slow = new FlapUnit({ sequence: seq, flipDuration: 100 });
        slow.timeScale = 0.5;
        slow.setTarget('A');
        slow.update(100);
        expect(slow.state.progress).toBe(0.5);
    });

    it('pauses at 0 and resumes', () => {
        const unit = new FlapUnit({ sequence: seq, flipDuration: 100 });
        unit.setTarget('A');
        unit.update(50);
        unit.timeScale = 0;
        unit.update(1000);
        expect(unit.state.progress).toBe(0.5);
        unit.timeScale = 1;
        unit.update(50);
        expect(unit.state.current).toBe('A');
    });

    it('rejects negative and non-finite scales', () => {
        const unit = new FlapUnit({ sequence: seq });
        const field = new FlapField(textField({ sequence: seq, length: 1 }));
        const board = textBoard(100);
        for (const bad of [-1, NaN, Infinity]) {
            expect(() => (unit.timeScale = bad)).toThrow(RangeError);
            expect(() => (field.timeScale = bad)).toThrow(RangeError);
            expect(() => (board.timeScale = bad)).toThrow(RangeError);
        }
        expect(unit.timeScale).toBe(1);
    });

    it('scales flips and stagger delays of a field', () => {
        const field = new FlapField(
            textField({
                sequence: seq,
                length: 2,
                stagger: { order: 'sequential', step: 100 },
                unit: { flipDuration: 10 },
            })
        );
        field.timeScale = 2;
        field.set('AA');
        field.update(54); // 108 ms scaled: unit 1 waited 100, flipping 8/10
        expect(shown(field)).toBe('A-');
        field.update(1); // 110 ms scaled
        expect(shown(field)).toBe('AA');
    });

    it('compounds board, field and unit scales', () => {
        const board = textBoard(100);
        board.timeScale = 2;
        board.field(0, 'text').timeScale = 2;
        board.field(0, 'text').units[0].timeScale = 0.5;
        board.show([{ text: 'A' }]);
        board.update(25); // 25 × 2 × 2 × 0.5 = 50 ms
        expect(board.field(0, 'text').units[0].state.progress).toBe(0.5);
    });

    it('scales playlist holds with the board', () => {
        const board = textBoard(10);
        const changes: number[] = [];
        board.on('messagechange', event => changes.push(event.index));
        board.timeScale = 2;
        board.play([[{ text: 'A' }], [{ text: 'B' }]], { hold: 100 });
        board.update(5); // A settles (10 ms scaled); hold starts
        board.update(49); // 98 ms held
        expect(changes).toEqual([0]);
        board.update(1); // 100 ms held
        expect(changes).toEqual([0, 1]);
    });
});
