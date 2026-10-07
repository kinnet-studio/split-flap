import { describe, expect, it } from 'vitest';

import { contentKey } from '../../src/render/content-key';

describe('contentKey', () => {
    it('is equal for equal content', () => {
        expect(contentKey([{ a: 1 }, 'b'])).toBe(contentKey([{ a: 1 }, 'b']));
        expect(contentKey({ a: 1 })).not.toBe(contentKey({ a: 2 }));
        expect(contentKey(undefined)).toBe(contentKey(undefined));
    });

    it('falls back to identity for values JSON cannot serialize', () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(contentKey(cyclic)).toBe(cyclic);
    });
});
