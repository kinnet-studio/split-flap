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

/** Share of the energy between `low` and `high` Hz, from a plain DFT. */
function shareBetween(
    samples: Float32Array,
    low: number,
    high: number
): number {
    const n = samples.length;
    let total = 0;
    let inside = 0;
    for (let k = 1; k < n / 2; k++) {
        let re = 0;
        let im = 0;
        for (let i = 0; i < n; i++) {
            const phase = (2 * Math.PI * k * i) / n;
            re += samples[i] * Math.cos(phase);
            im -= samples[i] * Math.sin(phase);
        }
        const power = re * re + im * im;
        total += power;
        const hz = (k * RATE) / n;
        if (hz >= low && hz < high) {
            inside += power;
        }
    }
    return inside / total;
}

describe('renderClick', () => {
    it('is duration × sampleRate samples long', () => {
        expect(renderClick(RATE)).toHaveLength(6720);
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

    it('fades in from silence instead of starting with a pop', () => {
        expect(renderClick(RATE)[0]).toBe(0);
        expect(renderClick(RATE, { attack: 0 })[0]).not.toBe(0);
    });

    it('centres its energy between 1 and 2 kHz', () => {
        const strike = (options = {}) =>
            renderClick(RATE, options).subarray(0, 2048);
        expect(shareBetween(strike(), 1000, 2000)).toBeGreaterThan(0.4);
        const shrill = { frequency: 3500, brightness: 1 };
        expect(shareBetween(strike(shrill), 1000, 2000)).toBeLessThan(0.2);
    });

    it('rings on after the strike and bounces once', () => {
        const ms = (value: number) => Math.round((value * RATE) / 1000);
        const strikeOnly = renderClick(RATE, { body: 0, bounce: 0 });
        const full = renderClick(RATE);
        expect(energy(full, ms(30), ms(60))).toBeGreaterThan(
            energy(strikeOnly, ms(30), ms(60)) * 10
        );
        const bounced = renderClick(RATE, { body: 0 });
        const { bounceDelay } = DEFAULT_SYNTH_CLICK;
        const at = ms(bounceDelay * 1000);
        expect(energy(bounced, at, at + ms(5))).toBeGreaterThan(
            energy(bounced, at - ms(5), at) * 10
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
        const options = {
            noise: 0,
            brightness: 1,
            attack: 0,
            body: 0,
            bounce: 0,
        };
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
            { attack: -1 },
            { attack: Infinity },
            { body: 1.5 },
            { bodyDecay: 0 },
            { bounce: -0.1 },
            { bounceDelay: -1 },
        ]) {
            expect(() => renderClick(RATE, options)).toThrow(RangeError);
        }
        expect(() => renderClick(0)).toThrow(RangeError);
        const aboveNyquist = renderClick(RATE, { frequency: RATE * 0.75 });
        expect(aboveNyquist.every(Number.isFinite)).toBe(true);
    });
});
