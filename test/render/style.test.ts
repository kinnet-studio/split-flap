import { describe, expect, it } from 'vitest';

import { DEFAULT_STYLE, resolveStyle } from '../../src/render/style';

describe('resolveStyle', () => {
    it('fills in defaults', () => {
        expect(resolveStyle()).toEqual(DEFAULT_STYLE);
        expect(DEFAULT_STYLE).toEqual({
            radius: 4,
            hingeGap: 1,
            hingeColor: 'rgba(0, 0, 0, 0.6)',
            shade: 0.5,
            shadow: 0.35,
        });
    });

    it('keeps overrides', () => {
        expect(resolveStyle({ radius: 0, shade: 0.2 })).toEqual({
            ...DEFAULT_STYLE,
            radius: 0,
            shade: 0.2,
        });
    });
});
