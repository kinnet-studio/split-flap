import type { FlapSequence } from '../core/sequence.js';
import type { ResolvedFlapStyle } from './style.js';

/** Px the covered-flap stack takes from the bottom of a unit's cell. */
export function stackDepth(style: Pick<ResolvedFlapStyle, 'stack'>): number {
    return style.stack ? style.stack.count * style.stack.step : 0;
}

/**
 * The `count` flaps covered by `base`, nearest first: the flaps before it
 * on the drum, wrapping around.
 */
export function stackFlaps<T>(
    sequence: FlapSequence<T>,
    base: T,
    count: number
): T[] {
    const index = sequence.indexOf(base);
    if (index === -1) {
        return [];
    }
    const length = sequence.length;
    return Array.from({ length: count }, (_, layer) =>
        sequence.at((((index - 1 - layer) % length) + length) % length)
    );
}
