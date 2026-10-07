/** `all` shows every flap in between; `direct` flips once straight to the target. */
export type Cycle = 'all' | 'direct';

/** `forward` only travels +1 with wrap-around; `shortest` may travel backward. */
export type Direction = 'forward' | 'shortest';

export interface PlanOptions {
    cycle: Cycle;
    direction: Direction;
}

export interface PlannedPath {
    /** Indices to show in order, ending at the target. Excludes the start. */
    steps: number[];
    direction: 1 | -1;
}

/** Computes which flap indices a unit shows on its way from `from` to `to`. */
export function planPath(
    length: number,
    from: number,
    to: number,
    options: PlanOptions
): PlannedPath {
    if (!Number.isInteger(length) || length < 1) {
        throw new RangeError(
            `planPath: length must be an integer >= 1, got ${length}`
        );
    }
    for (const [name, value] of [
        ['from', from],
        ['to', to],
    ] as const) {
        if (!Number.isInteger(value) || value < 0 || value >= length) {
            throw new RangeError(
                `planPath: ${name} ${value} is out of range (0..${length - 1})`
            );
        }
    }
    if (from === to) {
        return { steps: [], direction: 1 };
    }
    const forward = (to - from + length) % length;
    const backward = length - forward;
    const direction: 1 | -1 =
        options.direction === 'shortest' && backward < forward ? -1 : 1;
    if (options.cycle === 'direct') {
        return { steps: [to], direction };
    }
    const distance = direction === 1 ? forward : backward;
    const steps: number[] = [];
    for (let i = 1; i <= distance; i++) {
        steps.push((((from + direction * i) % length) + length) % length);
    }
    return { steps, direction };
}
