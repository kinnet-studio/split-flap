import { useEffect, useState } from 'react';

import {
    type BoardOptions,
    FlapBoard,
    type RowValues,
    type Schema,
} from '../core/board.js';
import { contentKey } from '../render/content-key.js';

export interface UseFlapBoardOptions<S extends Schema> extends BoardOptions<S> {
    /**
     * Shown with `board.show()` on creation and whenever its content changes.
     * Content is compared as JSON: use plain data (a class whose data lives
     * in getters serializes as `{}`), and memoize values JSON can't hold
     * (a `BigInt`), which are compared by identity instead.
     */
    value?: readonly RowValues<S>[];
}

/**
 * Creates one stable FlapBoard. `rows`, `schema` and `stagger` are read only
 * on the first render (remount with a new `key` to change them). `value` is
 * compared by content, so an inline array with the same rows does nothing.
 */
export function useFlapBoard<S extends Schema>(
    options: UseFlapBoardOptions<S>
): FlapBoard<S> {
    const [board] = useState(
        () =>
            new FlapBoard<S>({
                rows: options.rows,
                schema: options.schema,
                stagger: options.stagger,
            })
    );
    const { value } = options;
    const valueKey = value === undefined ? undefined : contentKey(value);
    useEffect(() => {
        if (value !== undefined) {
            board.show(value);
        }
        // Keyed by content: a new array with the same rows is not a change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [board, valueKey]);
    return board;
}
