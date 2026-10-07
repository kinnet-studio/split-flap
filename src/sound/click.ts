import { mulberry32 } from '../core/random.js';

export { mulberry32 };

export interface SynthClickOptions {
    /** Hz of the tonal knock under the noise. Default 800. */
    frequency?: number;
    /** Seconds for the envelope to fall by about 63%. Default 0.005. */
    decay?: number;
    /** Seconds of audio. Default 0.035. */
    duration?: number;
    /** 0..1 mix: 0 = pure tone, 1 = pure noise. Default 0.92. */
    noise?: number;
    /**
     * (0, 1] low-pass amount (two one-pole stages); 1 = no filtering.
     * Default 0.22.
     */
    brightness?: number;
    /**
     * Seconds to fade in, so the click starts without a pop; 0 = instant.
     * Default 0.001.
     */
    attack?: number;
}

export const DEFAULT_SYNTH_CLICK: Required<SynthClickOptions> = {
    frequency: 800,
    decay: 0.005,
    duration: 0.035,
    noise: 0.92,
    brightness: 0.22,
    attack: 0.001,
};

const DEFAULT_SEED = 0x5f1a95;

/** Hz below which the noise is cut, so the click has no low thump. */
const NOISE_HIGH_PASS = 250;

/** Fills in defaults and validates synth options. */
export function resolveSynthClick(
    options: SynthClickOptions = {}
): Required<SynthClickOptions> {
    const resolved = { ...DEFAULT_SYNTH_CLICK, ...options };
    for (const name of ['frequency', 'decay', 'duration'] as const) {
        const value = resolved[name];
        if (!(value > 0) || !Number.isFinite(value)) {
            throw new RangeError(
                `renderClick: ${name} must be a positive number, got ${value}`
            );
        }
    }
    if (!(resolved.noise >= 0 && resolved.noise <= 1)) {
        throw new RangeError(
            `renderClick: noise must be between 0 and 1, got ${resolved.noise}`
        );
    }
    if (!(resolved.brightness > 0 && resolved.brightness <= 1)) {
        throw new RangeError(
            `renderClick: brightness must be in (0, 1], got ${resolved.brightness}`
        );
    }
    if (!(resolved.attack >= 0) || !Number.isFinite(resolved.attack)) {
        throw new RangeError(
            `renderClick: attack must be a number >= 0, got ${resolved.attack}`
        );
    }
    return resolved;
}

/**
 * Synthesizes one split-flap click: high-passed noise mixed with a tone,
 * under a short fade-in and an exponential decay, through a two-stage
 * low-pass, normalized to a 0.9 peak. The default `random` is a fixed-seed
 * PRNG, so the default click never changes.
 */
export function renderClick(
    sampleRate: number,
    options: SynthClickOptions = {},
    random: () => number = mulberry32(DEFAULT_SEED)
): Float32Array {
    if (!(sampleRate > 0) || !Number.isFinite(sampleRate)) {
        throw new RangeError(
            `renderClick: sampleRate must be a positive number, got ${sampleRate}`
        );
    }
    const { frequency, decay, duration, noise, brightness, attack } =
        resolveSynthClick(options);
    const samples = new Float32Array(
        Math.max(1, Math.round(duration * sampleRate))
    );
    const pole = Math.exp((-2 * Math.PI * NOISE_HIGH_PASS) / sampleRate);
    let white = 0;
    let hiss = 0;
    let smoothed = 0;
    let filtered = 0;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const t = i / sampleRate;
        const next = random() * 2 - 1;
        hiss = pole * (hiss + next - white);
        white = next;
        const raw =
            noise * hiss + (1 - noise) * Math.sin(2 * Math.PI * frequency * t);
        const envelope =
            Math.exp(-t / decay) * (attack > 0 ? Math.min(1, t / attack) : 1);
        smoothed += brightness * (raw * envelope - smoothed);
        filtered += brightness * (smoothed - filtered);
        samples[i] = filtered;
        peak = Math.max(peak, Math.abs(filtered));
    }
    if (peak > 0) {
        const scale = 0.9 / peak;
        for (let i = 0; i < samples.length; i++) {
            samples[i] *= scale;
        }
    }
    return samples;
}
