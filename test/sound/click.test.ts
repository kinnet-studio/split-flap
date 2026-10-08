import { describe, expect, it } from 'vitest';

import {
    DEFAULT_SYNTH_CLICK,
    mulberry32,
    renderClick,
    renderClickVariants,
} from '../../src/sound/click';

const RATE = 48000;

function energy(samples: Float32Array, from: number, to: number): number {
    let sum = 0;
    for (let i = from; i < to; i++) {
        sum += samples[i] * samples[i];
    }
    return sum;
}

/** Kurtosis: 3 for smooth noise, higher when energy comes in sparse spikes. */
function kurtosis(samples: Float32Array): number {
    const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
    let square = 0;
    let fourth = 0;
    for (const v of samples) {
        square += (v - mean) ** 2;
        fourth += (v - mean) ** 4;
    }
    square /= samples.length;
    fourth /= samples.length;
    return fourth / (square * square);
}

/** Power per DFT bin of the first 2048 samples (the strike), as [Hz, power]. */
function strikeSpectrum(samples: Float32Array): [number, number][] {
    const strike = samples.subarray(0, 2048);
    const n = strike.length;
    const bins: [number, number][] = [];
    for (let k = 1; k < n / 2; k++) {
        let re = 0;
        let im = 0;
        for (let i = 0; i < n; i++) {
            const phase = (2 * Math.PI * k * i) / n;
            re += strike[i] * Math.cos(phase);
            im -= strike[i] * Math.sin(phase);
        }
        bins.push([(k * RATE) / n, re * re + im * im]);
    }
    return bins;
}

/** Share of the spectrum's power between `low` and `high` Hz. */
function share(bins: [number, number][], low: number, high: number): number {
    let total = 0;
    let inside = 0;
    for (const [hz, power] of bins) {
        total += power;
        if (hz >= low && hz < high) {
            inside += power;
        }
    }
    return inside / total;
}

/** The largest share of power in any 200 Hz band: high means pitched. */
function pitchiness(bins: [number, number][]): number {
    let most = 0;
    for (let low = 0; low < RATE / 2; low += 100) {
        most = Math.max(most, share(bins, low, low + 200));
    }
    return most;
}

describe('renderClick', () => {
    it('is duration × sampleRate samples long', () => {
        expect(renderClick(RATE)).toHaveLength(7680);
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

    it('is crisp noise above 4 kHz with no low thump', () => {
        const bins = strikeSpectrum(renderClick(RATE));
        expect(share(bins, 4000, RATE / 2)).toBeGreaterThan(0.6);
        expect(share(bins, 0, 600)).toBeLessThan(0.03);
        const soft = { frequency: 1100, resonance: 0.6, brightness: 0.5 };
        const softBins = strikeSpectrum(renderClick(RATE, soft));
        expect(share(softBins, 4000, RATE / 2)).toBeLessThan(0.2);
    });

    it('has no pitched ring', () => {
        expect(pitchiness(strikeSpectrum(renderClick(RATE)))).toBeLessThan(0.1);
        const tone = {
            noise: 0,
            brightness: 1,
            decay: 0.012,
            body: 0,
            bounce: 0,
        };
        expect(
            pitchiness(strikeSpectrum(renderClick(RATE, tone)))
        ).toBeGreaterThan(0.5);
    });

    it('rattles on after the strike and bounces once', () => {
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

    it('rattles as scattered impacts rather than a smooth hiss', () => {
        const body = (click: Float32Array) =>
            click.subarray(Math.round(0.003 * RATE), Math.round(0.03 * RATE));
        for (const click of renderClickVariants(RATE, {}, 8)) {
            expect(kurtosis(body(click))).toBeGreaterThan(4);
        }
        for (const click of renderClickVariants(RATE, { rattle: 0 }, 8)) {
            expect(kurtosis(body(click))).toBeLessThan(4);
        }
    });

    it('renders different takes of the same click', () => {
        const takes = renderClickVariants(RATE, {}, 3);
        expect(takes[0]).toEqual(renderClick(RATE));
        expect(takes[1]).toHaveLength(takes[0].length);
        expect(takes[1]).not.toEqual(takes[0]);
        expect(takes[2]).not.toEqual(takes[1]);
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
        const frequency = 2200;
        const decay = 0.012;
        const options = {
            frequency,
            decay,
            noise: 0,
            brightness: 1,
            attack: 0,
            body: 0,
            bounce: 0,
        };
        const click = renderClick(RATE, options);
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
            { resonance: 0 },
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
            { rattle: -1 },
        ]) {
            expect(() => renderClick(RATE, options)).toThrow(RangeError);
        }
        expect(() => renderClick(0)).toThrow(RangeError);
        const aboveNyquist = renderClick(RATE, { frequency: RATE * 0.75 });
        expect(aboveNyquist.every(Number.isFinite)).toBe(true);
    });
});
