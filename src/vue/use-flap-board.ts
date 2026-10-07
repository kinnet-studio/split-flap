import { markRaw, type MaybeRefOrGetter, toValue, watch } from 'vue';

import {
    type BoardOptions,
    FlapBoard,
    type RowValues,
    type Schema,
} from '../core/board.js';
import { contentKey } from '../render/content-key.js';

export interface UseFlapBoardOptions<S extends Schema> extends BoardOptions<S> {
    /**
     * Shown with `board.show()` immediately and whenever its content changes.
     * May be an array, a ref or a getter; nested changes are tracked.
     */
    value?: MaybeRefOrGetter<readonly RowValues<S>[] | undefined>;
}

/**
 * Creates one FlapBoard (kept out of Vue's reactivity). `rows`, `schema` and
 * `stagger` are read once; `value` is watched by content.
 */
export function useFlapBoard<S extends Schema>(
    options: UseFlapBoardOptions<S>
): FlapBoard<S> {
    const board = markRaw(
        new FlapBoard<S>({
            rows: options.rows,
            schema: options.schema,
            stagger: options.stagger,
        })
    );
    if (options.value !== undefined) {
        // Serializing reads every nested value, so deep changes are tracked.
        watch(
            () => contentKey(toValue(options.value)),
            () => {
                const value = toValue(options.value);
                if (value !== undefined) {
                    board.show(value);
                }
            },
            { immediate: true }
        );
    }
    return board;
}
