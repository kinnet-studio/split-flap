/** Validates a `timeScale`: a finite number >= 0, where 0 pauses. */
export function checkTimeScale(value: number, owner: string): number {
    if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(
            `${owner}: timeScale must be a finite number >= 0, got ${value}`
        );
    }
    return value;
}
