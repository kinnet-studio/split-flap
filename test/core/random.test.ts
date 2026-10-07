import { describe, expect, it } from 'vitest';

import { fnv1a, mulberry32 } from '../../src/core/random';

describe('mulberry32', () => {
    it('is deterministic per seed and stays in [0, 1)', () => {
        const a = mulberry32(42);
        const b = mulberry32(42);
        const values = Array.from({ length: 100 }, () => a());
        expect(values).toEqual(Array.from({ length: 100 }, () => b()));
        expect(values.every(v => v >= 0 && v < 1)).toBe(true);
        expect(mulberry32(43)()).not.toBe(values[0]);
    });
});

describe('fnv1a', () => {
    it('matches the reference 32-bit FNV-1a values', () => {
        expect(fnv1a('')).toBe(0x811c9dc5);
        expect(fnv1a('a')).toBe(0xe40c292c);
        expect(fnv1a('foobar')).toBe(0xbf9cf968);
    });
});
