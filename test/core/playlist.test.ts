import { describe, expect, it, vi } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);

function makeBoard() {
    const board = new FlapBoard({
        rows: 1,
        schema: {
            text: textField({
                sequence: alnum,
                length: 1,
                unit: { flipDuration: 10 },
            }),
        },
    });
    const changes: number[] = [];
    board.on('messagechange', event => changes.push(event.index));
    return { board, changes };
}

const msg = (text: string) => [{ text }];
const current = (board: ReturnType<typeof makeBoard>['board']) =>
    board.field(0, 'text').units[0].state.current;
const target = (board: ReturnType<typeof makeBoard>['board']) =>
    board.field(0, 'text').units[0].target;

describe('FlapBoard.play', () => {
    it('shows the first message immediately', () => {
        const { board, changes } = makeBoard();
        board.play([msg('A'), msg('B')], { hold: 100 });
        expect(changes).toEqual([0]);
        board.update(10);
        expect(current(board)).toBe('A');
    });

    it('starts the hold once the board settles', () => {
        const { board, changes } = makeBoard();
        board.play([msg('C'), msg('A')], { hold: 100 });
        board.update(30); // three flips: ' ' → A → B → C; settle observed
        board.update(99);
        expect(changes).toEqual([0]);
        board.update(1);
        expect(changes).toEqual([0, 1]);
        expect(target(board)).toBe('A');
    });

    it('uses a per-message hold', () => {
        const { board, changes } = makeBoard();
        board.play([{ rows: msg('A'), hold: 50 }, msg('B')], { hold: 1000 });
        board.update(10);
        board.update(50);
        expect(changes).toEqual([0, 1]);
    });

    it('loops back to the first message', () => {
        const { board, changes } = makeBoard();
        board.play([msg('A'), msg('B')], { hold: 10 });
        board.update(10); // A settles
        board.update(10); // hold done → B
        board.update(10); // B settles
        board.update(10); // hold done → A
        expect(changes).toEqual([0, 1, 0]);
    });

    it('ends without looping and keeps the last message', () => {
        const { board } = makeBoard();
        const ended = vi.fn();
        board.on('playlistend', ended);
        board.play([msg('A')], { hold: 10, loop: false });
        board.update(10);
        board.update(10);
        board.update(1000);
        expect(ended).toHaveBeenCalledTimes(1);
        expect(current(board)).toBe('A');
    });

    it('is cancelled by show()', () => {
        const { board, changes } = makeBoard();
        board.play([msg('A'), msg('B')], { hold: 10 });
        board.update(10);
        board.show(msg('C'));
        board.update(1000);
        expect(changes).toEqual([0]);
        expect(current(board)).toBe('C');
    });

    it('is cancelled by spin()', () => {
        const { board, changes } = makeBoard();
        board.play([msg('A'), msg('B')], { hold: 10 });
        board.spin();
        board.update(1000);
        expect(changes).toEqual([0]);
        expect(board.isSettled).toBe(false);
    });

    it('is not cancelled by row().set()', () => {
        const { board, changes } = makeBoard();
        board.play([msg('A'), msg('B')], { hold: 10 });
        board.update(10);
        board.row(0).set({ text: 'Z' });
        board.update(10);
        expect(changes).toEqual([0, 1]);
        expect(target(board)).toBe('B');
    });

    it('rejects an empty playlist', () => {
        const { board } = makeBoard();
        expect(() => board.play([])).toThrow(RangeError);
    });
});
