import { describe, expect, it } from 'vitest';

import { flipGeometry } from '../../src/render/flip-geometry';

const COS45 = Math.cos(Math.PI / 4);

describe('flipGeometry, forward', () => {
    it('shows the whole current top at 0°', () => {
        const g = flipGeometry(0, 1);
        expect(g.staticTop).toBe('next');
        expect(g.staticBottom).toBe('current');
        expect(g.flap).toEqual({
            face: 'current',
            half: 'top',
            anchor: 'hinge',
            scaleY: 1,
        });
        expect(g.flapShade).toBe(0);
        expect(g.castShadow).toBe(0);
        expect(g.shadowHalf).toBe('bottom');
    });

    it('squashes the current top toward the hinge at 45°', () => {
        const g = flipGeometry(45, 1);
        expect(g.flap.face).toBe('current');
        expect(g.flap.half).toBe('top');
        expect(g.flap.scaleY).toBeCloseTo(COS45);
        expect(g.flapShade).toBeCloseTo(1 - COS45);
        expect(g.castShadow).toBeCloseTo(Math.sin(Math.PI / 4));
    });

    it('is edge-on at 90°', () => {
        const g = flipGeometry(90, 1);
        expect(g.flap.face).toBe('next');
        expect(g.flap.half).toBe('bottom');
        expect(g.flap.scaleY).toBeCloseTo(0);
        expect(g.flapShade).toBeCloseTo(1);
        expect(g.castShadow).toBeCloseTo(1);
    });

    it('unfolds the next bottom at 135°', () => {
        const g = flipGeometry(135, 1);
        expect(g.flap.face).toBe('next');
        expect(g.flap.half).toBe('bottom');
        expect(g.flap.scaleY).toBeCloseTo(COS45);
    });

    it('fully covers the bottom at 180°', () => {
        const g = flipGeometry(180, 1);
        expect(g.flap.face).toBe('next');
        expect(g.flap.scaleY).toBeCloseTo(1);
        expect(g.flapShade).toBeCloseTo(0);
        expect(g.castShadow).toBeCloseTo(0);
    });

    it('clamps angles to 0..180', () => {
        expect(flipGeometry(-10, 1)).toEqual(flipGeometry(0, 1));
        expect(flipGeometry(200, 1)).toEqual(flipGeometry(180, 1));
    });
});

describe('flipGeometry, backward', () => {
    it('mirrors the halves', () => {
        const first = flipGeometry(45, -1);
        expect(first.staticTop).toBe('current');
        expect(first.staticBottom).toBe('next');
        expect(first.flap.face).toBe('current');
        expect(first.flap.half).toBe('bottom');
        expect(first.shadowHalf).toBe('top');

        const second = flipGeometry(135, -1);
        expect(second.flap.face).toBe('next');
        expect(second.flap.half).toBe('top');
    });
});
