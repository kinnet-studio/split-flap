// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

import { FlapBoard, type RowValues } from '../../src/core/board';
import { textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { useFlapBoard, type UseFlapBoardOptions } from '../../src/vue';

const schema = {
    text: textField({
        sequence: FlapSequence.chars(CHARSETS.alphanumeric),
        length: 1,
    }),
};
type Rows = RowValues<typeof schema>[];

afterEach(() => {
    vi.restoreAllMocks();
});

function inScope(options: UseFlapBoardOptions<typeof schema>) {
    const scope = effectScope();
    const board = scope.run(() => useFlapBoard(options)) as FlapBoard<
        typeof schema
    >;
    return { board, scope };
}

const target = (board: FlapBoard<typeof schema>) =>
    board.field(0, 'text').units[0].target;

describe('useFlapBoard (Vue)', () => {
    it('creates a board and shows a plain value immediately', () => {
        const { board, scope } = inScope({
            rows: 1,
            schema,
            value: [{ text: 'A' }],
        });
        expect(board).toBeInstanceOf(FlapBoard);
        expect(target(board)).toBe('A');
        scope.stop();
    });

    it('shows a ref value when its content changes, not for equal content', async () => {
        const show = vi.spyOn(FlapBoard.prototype, 'show');
        const value = ref<Rows>([{ text: 'A' }]);
        const { board, scope } = inScope({ rows: 1, schema, value });
        expect(show).toHaveBeenCalledTimes(1);
        value.value = [{ text: 'A' }];
        await nextTick();
        expect(show).toHaveBeenCalledTimes(1);
        value.value = [{ text: 'B' }];
        await nextTick();
        expect(target(board)).toBe('B');
        scope.stop();
    });

    it('tracks nested mutations and getters', async () => {
        const value = ref<Rows>([{ text: 'A' }]);
        const { board, scope } = inScope({
            rows: 1,
            schema,
            value: () => value.value,
        });
        value.value[0].text = 'C';
        await nextTick();
        expect(target(board)).toBe('C');
        scope.stop();
    });

    it('leaves the board alone without a value', () => {
        const show = vi.spyOn(FlapBoard.prototype, 'show');
        inScope({ rows: 1, schema }).scope.stop();
        expect(show).not.toHaveBeenCalled();
    });
});
