import { describe, expect, it, vi } from 'vitest';

import { FaceCache, type FaceCacheOptions } from '../../src/render/face-cache';
import type { FacePainter } from '../../src/render/faces';
import { type FakeCanvas, fakeCanvasFactory } from '../helpers/fake-canvas';

function makeCache(overrides: Partial<FaceCacheOptions<string>> = {}) {
    const painter = vi.fn<FacePainter<string>>();
    const createCanvas = vi.fn(fakeCanvasFactory);
    const cache = new FaceCache<string>({
        key: flap => flap,
        painter,
        width: 40,
        height: 60,
        dpr: 2,
        createCanvas,
        ...overrides,
    });
    return { cache, painter, createCanvas };
}

describe('FaceCache', () => {
    it('paints each face once', () => {
        const { cache, painter } = makeCache();
        const first = cache.get('A');
        expect(cache.get('A')).toBe(first);
        expect(painter).toHaveBeenCalledTimes(1);
        expect(cache.size).toBe(1);
    });

    it('paints at device-pixel resolution in CSS pixel units', () => {
        const { cache, painter, createCanvas } = makeCache();
        const face = cache.get('A') as unknown as FakeCanvas;
        expect(createCanvas).toHaveBeenCalledWith(80, 120);
        expect(face.context.callsNamed('setTransform')[0].args).toEqual([
            2, 0, 0, 2, 0, 0,
        ]);
        expect(painter).toHaveBeenCalledWith(face.context, 'A', 40, 60);
    });

    it('clips to a rounded rect when radius > 0', () => {
        const { cache } = makeCache({ radius: 6 });
        const face = cache.get('A') as unknown as FakeCanvas;
        expect(face.context.callsNamed('roundRect')[0].args).toEqual([
            0, 0, 40, 60, 6,
        ]);
        expect(face.context.callsNamed('clip')).toHaveLength(1);
    });

    it('does not clip when radius is 0', () => {
        const { cache } = makeCache();
        const face = cache.get('A') as unknown as FakeCanvas;
        expect(face.context.callsNamed('roundRect')).toHaveLength(0);
    });

    it('keys faces with the key function', () => {
        const { cache, painter } = makeCache({
            key: flap => flap.toLowerCase(),
        });
        cache.get('a');
        cache.get('A');
        expect(painter).toHaveBeenCalledTimes(1);
    });

    it('clears and repaints at the new size after resize', () => {
        const { cache, painter, createCanvas } = makeCache();
        cache.get('A');
        cache.resize(20, 30, 1);
        expect(cache.size).toBe(0);
        cache.get('A');
        expect(painter).toHaveBeenCalledTimes(2);
        expect(createCanvas).toHaveBeenLastCalledWith(20, 30);
    });

    it('propagates painter errors and caches nothing', () => {
        const { cache } = makeCache({
            painter: () => {
                throw new Error('boom');
            },
        });
        expect(() => cache.get('A')).toThrow('boom');
        expect(cache.size).toBe(0);
    });

    it('throws when a 2D context is unavailable', () => {
        const { cache } = makeCache({
            createCanvas: () => ({
                width: 1,
                height: 1,
                getContext: () => null,
            }),
        });
        expect(() => cache.get('A')).toThrow(/2D canvas context/);
    });
});
