import { mulberry32 } from '../core/random.js';

export { mulberry32 };

export interface SynthClickOptions {
    /** Hz of the tonal tick. Default 2200. */
    frequency?: number;
    /** Seconds for the envelope to fall by about 63%. Default 0.012. */
    decay?: number;
    /** Seconds of audio. Default 0.05. */
    duration?: number;
    /** 0..1 mix: 0 = pure tone, 1 = pure noise. Default 0.6. */
    noise?: number;
    /** (0, 1] one-pole low-pass amount; 1 = no filtering. Default 0.5. */
    brightness?: number;
}

export const DEFAULT_SYNTH_CLICK: Required<SynthClickOptions> = {
    frequency: 2200,
    decay: 0.012,
    duration: 0.05,
    noise: 0.6,
    brightness: 0.5,
};

const DEFAULT_SEED = 0x5f1a95;

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
    return resolved;
}

/**
 * Synthesizes one split-flap click: a noise/tone mix under an exponential
 * decay, through a one-pole low-pass, normalized to a 0.9 peak. The default
 * `random` is a fixed-seed PRNG, so the default click never changes.
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
    const { frequency, decay, duration, noise, brightness } =
        resolveSynthClick(options);
    const samples = new Float32Array(
        Math.max(1, Math.round(duration * sampleRate))
    );
    let filtered = 0;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const t = i / sampleRate;
        const raw =
            noise * (random() * 2 - 1) +
            (1 - noise) * Math.sin(2 * Math.PI * frequency * t);
        filtered += brightness * (raw * Math.exp(-t / decay) - filtered);
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
