import { describe, expect, it } from 'vitest';

import {
    DEFAULT_SYNTH_CLICK,
    mulberry32,
    renderClick,
} from '../../src/sound/click';

const RATE = 48000;

function energy(samples: Float32Array, from: number, to: number): number {
    let sum = 0;
    for (let i = from; i < to; i++) {
        sum += samples[i] * samples[i];
    }
    return sum;
}

describe('renderClick', () => {
    it('is duration × sampleRate samples long', () => {
        expect(renderClick(RATE)).toHaveLength(2400);
        expect(renderClick(RATE, { duration: 0.01 })).toHaveLength(480);
        expect(renderClick(10, { duration: 0.01 })).toHaveLength(1);
    });

    it('hits hard at the start and decays towards the end', () => {
        const click = renderClick(RATE);
        const fifth = click.length / 5;
        expect(energy(click, click.length - fifth, click.length)).toBeLessThan(
            energy(click, 0, fifth) * 0.05
        );
    });

    it('is normalized to a 0.9 peak', () => {
        const click = renderClick(RATE);
        const peak = click.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
        expect(peak).toBeCloseTo(0.9, 5);
    });

    it('renders the same default click every time', () => {
        expect(renderClick(RATE)).toEqual(renderClick(RATE));
    });

    it('is a decaying sine with no noise and no filtering', () => {
        const options = { noise: 0, brightness: 1 };
        const click = renderClick(RATE, options);
        const { frequency, decay } = DEFAULT_SYNTH_CLICK;
        const expected = Array.from(
            click,
            (_, i) =>
                Math.sin((2 * Math.PI * frequency * i) / RATE) *
                Math.exp(-i / RATE / decay)
        );
        const scale =
            0.9 / expected.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
        for (const i of [1, 10, 100, 1000]) {
            expect(click[i]).toBeCloseTo(expected[i] * scale, 5);
        }
    });

    it('uses the given random source for noise', () => {
        const a = renderClick(RATE, {}, mulberry32(1));
        const b = renderClick(RATE, {}, mulberry32(2));
        expect(a).not.toEqual(b);
    });

    it('validates its options', () => {
        for (const options of [
            { frequency: 0 },
            { decay: -1 },
            { duration: NaN },
            { noise: 1.5 },
            { brightness: 0 },
            { brightness: 1.1 },
        ]) {
            expect(() => renderClick(RATE, options)).toThrow(RangeError);
        }
        expect(() => renderClick(0)).toThrow(RangeError);
    });
});
