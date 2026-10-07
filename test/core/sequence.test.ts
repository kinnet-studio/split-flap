import { describe, expect, it } from 'vitest';

import { CHARSETS, FlapSequence } from '../../src/core/sequence';

describe('FlapSequence', () => {
    it('stores flaps in order', () => {
        const seq = new FlapSequence(['a', 'b', 'c']);
        expect(seq.length).toBe(3);
        expect(seq.at(0)).toBe('a');
        expect(seq.at(2)).toBe('c');
    });

    it('finds flaps by key', () => {
        const seq = new FlapSequence(['a', 'b', 'c']);
        expect(seq.indexOf('b')).toBe(1);
        expect(seq.indexOf('z')).toBe(-1);
    });

    it('uses a custom key for object flaps', () => {
        const red = { id: 'red' };
        const blue = { id: 'blue' };
        const seq = new FlapSequence([red, blue], { key: c => c.id });
        expect(seq.indexOf({ id: 'blue' })).toBe(1);
        expect(seq.key(red)).toBe('red');
    });

    it('throws on an empty list', () => {
        expect(() => new FlapSequence([])).toThrow(RangeError);
    });

    it('throws on duplicate keys and hints at the key option', () => {
        expect(() => new FlapSequence(['x', 'x'])).toThrow(/duplicate/);
        expect(() => new FlapSequence([{ a: 1 }, { a: 2 }])).toThrow(/`key`/);
    });

    it('throws on an out-of-range index', () => {
        const seq = new FlapSequence(['a']);
        expect(() => seq.at(1)).toThrow(RangeError);
        expect(() => seq.at(-1)).toThrow(RangeError);
    });

    it('splits charsets with Array.from so CJK and emoji stay whole', () => {
        const seq = FlapSequence.chars(' 東京🚄');
        expect(seq.length).toBe(4);
        expect(seq.at(3)).toBe('🚄');
    });

    it('ships charsets that start with a blank pad flap', () => {
        const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
        expect(alnum.at(0)).toBe(' ');
        expect(alnum.length).toBe(37);
        expect(FlapSequence.chars(CHARSETS.digits).length).toBe(11);
    });
});
