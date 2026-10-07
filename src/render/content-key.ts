/**
 * A key for comparing props by content rather than identity, so inline
 * literals don't count as changes: the JSON text when the value serializes,
 * otherwise the value itself (compared by identity).
 *
 * Lossy by design: values that serialize the same are equal (a class
 * instance whose data lives in getters is `{}`, and `undefined` entries in
 * objects disappear), and a value JSON can't hold (a `BigInt`, a cycle) falls
 * back to identity, so a fresh one counts as a change every time.
 */
export function contentKey(value: unknown): unknown {
    try {
        return JSON.stringify(value);
    } catch {
        return value;
    }
}
