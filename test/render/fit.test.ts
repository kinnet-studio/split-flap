import { describe, expect, it } from 'vitest';

import { fitScale } from '../../src/render/fit';

const size = { width: 80, height: 60 };

describe('fitScale', () => {
    it('fills the width by default', () => {
        expect(fitScale(size, { width: 200, height: 0 })).toBe(2.5);
        expect(fitScale(size, { width: 40, height: 1000 }, 'width')).toBe(0.5);
    });

    it('fits both dimensions in contain mode', () => {
        expect(fitScale(size, { width: 200, height: 90 }, 'contain')).toBe(1.5);
        expect(fitScale(size, { width: 40, height: 600 }, 'contain')).toBe(0.5);
    });

    it('returns null when the box or the content has no size', () => {
        expect(fitScale(size, { width: 0, height: 100 })).toBeNull();
        expect(fitScale(size, { width: 100, height: 0 }, 'contain')).toBeNull();
        expect(
            fitScale({ width: 0, height: 0 }, { width: 100, height: 100 })
        ).toBeNull();
        expect(fitScale(size, { width: NaN, height: 100 })).toBeNull();
    });
});
