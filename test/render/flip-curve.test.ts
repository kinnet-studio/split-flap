import { describe, expect, it } from 'vitest';

import { createFlipCurve, defaultFlipCurve } from '../../src/render/flip-curve';

describe('createFlipCurve', () => {
    it('follows the default keyframes: ease-in fall, bounce, settle', () => {
        const curve = createFlipCurve();
        expect(curve(0)).toBe(0);
        expect(curve(0.4)).toBeCloseTo(45);
        expect(curve(0.8)).toBe(180);
        expect(curve(0.85)).toBeCloseTo(168.75);
        expect(curve(0.9)).toBe(165);
        expect(curve(1)).toBe(180);
    });

    it('stays within 0..180 and only rises before the bounce', () => {
        const curve = createFlipCurve();
        let previous = -1;
        for (let i = 0; i <= 100; i++) {
            const angle = curve(i / 100);
            expect(angle).toBeGreaterThanOrEqual(0);
            expect(angle).toBeLessThanOrEqual(180);
            if (i <= 80) {
                expect(angle).toBeGreaterThanOrEqual(previous);
                previous = angle;
            }
        }
    });

    it('clamps progress and output', () => {
        const curve = createFlipCurve();
        expect(curve(-1)).toBe(0);
        expect(curve(2)).toBe(180);
        expect(curve(NaN)).toBe(0);
        const overshoot = createFlipCurve([
            { percentage: 0, value: 0 },
            { percentage: 0.5, value: 200 },
            { percentage: 1, value: 180 },
        ]);
        expect(overshoot(0.5)).toBe(180);
    });

    it('samples custom keyframes', () => {
        const linear = createFlipCurve([
            { percentage: 0, value: 0 },
            { percentage: 1, value: 180 },
        ]);
        expect(linear(0.5)).toBeCloseTo(90);
    });

    it('validates keyframes', () => {
        expect(() => createFlipCurve([{ percentage: 0, value: 0 }])).toThrow(
            RangeError
        );
        expect(() =>
            createFlipCurve([
                { percentage: 0.1, value: 0 },
                { percentage: 1, value: 180 },
            ])
        ).toThrow(RangeError);
        expect(() =>
            createFlipCurve([
                { percentage: 0, value: 0 },
                { percentage: 0.9, value: 180 },
            ])
        ).toThrow(RangeError);
        expect(() =>
            createFlipCurve([
                { percentage: 0, value: 0 },
                { percentage: 0.6, value: 90 },
                { percentage: 0.4, value: 120 },
                { percentage: 1, value: 180 },
            ])
        ).toThrow(RangeError);
    });

    it('shares one default curve', () => {
        expect(defaultFlipCurve()).toBe(defaultFlipCurve());
    });
});
