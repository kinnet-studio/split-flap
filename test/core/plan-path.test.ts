import { describe, expect, it } from 'vitest';

import { planPath } from '../../src/core/plan-path';

const forwardAll = { cycle: 'all', direction: 'forward' } as const;
const shortestAll = { cycle: 'all', direction: 'shortest' } as const;

describe('planPath', () => {
    it('returns no steps when already at the target', () => {
        expect(planPath(5, 2, 2, forwardAll)).toEqual({
            steps: [],
            direction: 1,
        });
    });

    it('steps forward through every flap', () => {
        expect(planPath(5, 1, 3, forwardAll)).toEqual({
            steps: [2, 3],
            direction: 1,
        });
    });

    it('wraps around going forward', () => {
        expect(planPath(5, 3, 1, forwardAll)).toEqual({
            steps: [4, 0, 1],
            direction: 1,
        });
    });

    it('goes backward when that is shorter', () => {
        expect(planPath(5, 3, 1, shortestAll)).toEqual({
            steps: [2, 1],
            direction: -1,
        });
    });

    it('wraps around going backward', () => {
        expect(planPath(6, 1, 5, shortestAll)).toEqual({
            steps: [0, 5],
            direction: -1,
        });
    });

    it('prefers forward on a tie', () => {
        expect(planPath(4, 0, 2, shortestAll)).toEqual({
            steps: [1, 2],
            direction: 1,
        });
    });

    it('flips once in direct mode', () => {
        expect(
            planPath(5, 0, 3, { cycle: 'direct', direction: 'forward' })
        ).toEqual({ steps: [3], direction: 1 });
    });

    it('keeps the shortest direction in direct mode', () => {
        expect(
            planPath(5, 0, 4, { cycle: 'direct', direction: 'shortest' })
        ).toEqual({ steps: [4], direction: -1 });
    });

    it('rejects invalid lengths and indices', () => {
        expect(() => planPath(0, 0, 0, forwardAll)).toThrow(RangeError);
        expect(() => planPath(5, 5, 0, forwardAll)).toThrow(RangeError);
        expect(() => planPath(5, 0, -1, forwardAll)).toThrow(RangeError);
    });
});
