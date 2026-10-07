import { describe, expect, it } from 'vitest';

import { FlapSequence } from '../../src/core/sequence';
import { stackDepth, stackFlaps } from '../../src/render/stack';
import { resolveStyle } from '../../src/render/style';

const seq = FlapSequence.chars('-ABCDE');

describe('stackDepth', () => {
    it('is 0 when the stack is off', () => {
        expect(stackDepth(resolveStyle())).toBe(0);
    });

    it('is count × step', () => {
        expect(stackDepth(resolveStyle({ stack: { count: 3, step: 2 } }))).toBe(
            6
        );
    });
});

describe('stackFlaps', () => {
    it('lists the flaps before the base on the drum, nearest first', () => {
        expect(stackFlaps(seq, 'C', 2)).toEqual(['B', 'A']);
    });

    it('wraps around the drum', () => {
        expect(stackFlaps(seq, 'A', 3)).toEqual(['-', 'E', 'D']);
    });

    it('returns nothing for a count of 0', () => {
        expect(stackFlaps(seq, 'C', 0)).toEqual([]);
    });
});

describe('resolveStyle stack', () => {
    it('is off by default', () => {
        expect(resolveStyle().stack).toBeNull();
    });

    it('fills in the default shade', () => {
        expect(resolveStyle({ stack: { count: 3, step: 2 } }).stack).toEqual({
            count: 3,
            step: 2,
            shade: 0.15,
        });
    });

    it('rejects invalid stacks', () => {
        for (const stack of [
            { count: -1, step: 2 },
            { count: 1.5, step: 2 },
            { count: 3, step: 0 },
            { count: 3, step: NaN },
            { count: 3, step: 2, shade: -0.1 },
            { count: 3, step: 2, shade: NaN },
        ]) {
            expect(() => resolveStyle({ stack })).toThrow(RangeError);
        }
    });
});
