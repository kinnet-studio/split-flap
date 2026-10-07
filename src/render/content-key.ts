/**
 * A key for comparing props by content rather than identity, so inline
 * literals don't count as changes: the JSON text when the value serializes,
 * otherwise the value itself (compared by identity).
 */
export function contentKey(value: unknown): unknown {
    try {
        return JSON.stringify(value);
    } catch {
        return value;
    }
}
