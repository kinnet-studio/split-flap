// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlapBoard, type RowValues } from '../../src/core/board';
import { textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { useFlapBoard } from '../../src/react';

const schema = {
    text: textField({
        sequence: FlapSequence.chars(CHARSETS.alphanumeric),
        length: 1,
    }),
};
type Rows = RowValues<typeof schema>[];

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('useFlapBoard (React)', () => {
    it('returns one stable board', () => {
        const { result, rerender } = renderHook(() =>
            useFlapBoard({ rows: 1, schema })
        );
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
        expect(first).toBeInstanceOf(FlapBoard);
    });

    it('shows value on mount and when its content changes', () => {
        const show = vi.spyOn(FlapBoard.prototype, 'show');
        const { result, rerender } = renderHook(
            ({ value }: { value: Rows }) =>
                useFlapBoard({ rows: 1, schema, value }),
            { initialProps: { value: [{ text: 'A' }] } }
        );
        expect(show).toHaveBeenCalledTimes(1);
        rerender({ value: [{ text: 'A' }] });
        expect(show).toHaveBeenCalledTimes(1);
        rerender({ value: [{ text: 'B' }] });
        expect(show).toHaveBeenCalledTimes(2);
        expect(result.current.field(0, 'text').units[0].target).toBe('B');
    });

    it('leaves the board alone without a value', () => {
        const show = vi.spyOn(FlapBoard.prototype, 'show');
        renderHook(() => useFlapBoard({ rows: 1, schema }));
        expect(show).not.toHaveBeenCalled();
    });
});
