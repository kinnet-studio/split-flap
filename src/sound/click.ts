import { mulberry32 } from '../core/random.js';

export { mulberry32 };

export interface SynthClickOptions {
    /**
     * Hz the click resonates around: the noise is band-passed here and the
     * tone sits here. Default 1100.
     */
    frequency?: number;
    /** Seconds for the strike to fall by about 63%. Default 0.004. */
    decay?: number;
    /** Seconds of audio. Default 0.14. */
    duration?: number;
    /** 0..1 mix: 0 = pure tone, 1 = pure noise. Default 0.91. */
    noise?: number;
    /**
     * (0, 1] low-pass amount (two one-pole stages); 1 = no filtering.
     * Default 0.5.
     */
    brightness?: number;
    /**
     * Seconds to fade in, so the click starts without a pop; 0 = instant.
     * Default 0.003.
     */
    attack?: number;
    /**
     * 0..1 level of the flap and housing ringing on after the strike.
     * Default 0.15.
     */
    body?: number;
    /** Seconds for the body to fall by about 63%. Default 0.022. */
    bodyDecay?: number;
    /**
     * 0..1 level of the flap bouncing once after it lands; 0 = none.
     * Default 0.3.
     */
    bounce?: number;
    /** Seconds from the strike to the bounce. Default 0.022. */
    bounceDelay?: number;
}

export const DEFAULT_SYNTH_CLICK: Required<SynthClickOptions> = {
    frequency: 1100,
    decay: 0.004,
    duration: 0.14,
    noise: 0.91,
    brightness: 0.5,
    attack: 0.003,
    body: 0.15,
    bodyDecay: 0.022,
    bounce: 0.3,
    bounceDelay: 0.022,
};

const DEFAULT_SEED = 0x5f1a95;

/** Q of the band-pass on the noise: wide, so the click stays unpitched. */
const RESONANCE_Q = 0.6;

/** Fills in defaults and validates synth options. */
export function resolveSynthClick(
    options: SynthClickOptions = {}
): Required<SynthClickOptions> {
    const resolved = { ...DEFAULT_SYNTH_CLICK, ...options };
    for (const name of [
        'frequency',
        'decay',
        'duration',
        'bodyDecay',
    ] as const) {
        const value = resolved[name];
        if (!(value > 0) || !Number.isFinite(value)) {
            throw new RangeError(
                `renderClick: ${name} must be a positive number, got ${value}`
            );
        }
    }
    for (const name of ['noise', 'body', 'bounce'] as const) {
        const value = resolved[name];
        if (!(value >= 0 && value <= 1)) {
            throw new RangeError(
                `renderClick: ${name} must be between 0 and 1, got ${value}`
            );
        }
    }
    if (!(resolved.brightness > 0 && resolved.brightness <= 1)) {
        throw new RangeError(
            `renderClick: brightness must be in (0, 1], got ${resolved.brightness}`
        );
    }
    for (const name of ['attack', 'bounceDelay'] as const) {
        const value = resolved[name];
        if (!(value >= 0) || !Number.isFinite(value)) {
            throw new RangeError(
                `renderClick: ${name} must be a number >= 0, got ${value}`
            );
        }
    }
    return resolved;
}

/**
 * Synthesizes one split-flap click: a strike, the body ringing on after it
 * and one smaller bounce. The sound is noise band-passed around `frequency`
 * mixed with a tone there, through a two-stage low-pass, normalized to a 0.9
 * peak. The default `random` is a fixed-seed PRNG, so the default click
 * never changes.
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
    const {
        frequency,
        decay,
        duration,
        noise,
        brightness,
        attack,
        body,
        bodyDecay,
        bounce,
        bounceDelay,
    } = resolveSynthClick(options);
    const samples = new Float32Array(
        Math.max(1, Math.round(duration * sampleRate))
    );
    // Band-pass biquad (constant 0 dB peak) centred on `frequency`, kept
    // below Nyquist so the filter stays stable at any sample rate.
    const w0 =
        (2 * Math.PI * Math.min(frequency, sampleRate * 0.45)) / sampleRate;
    const alpha = Math.sin(w0) / (2 * RESONANCE_Q);
    const gain = alpha / (1 + alpha);
    const a1 = (-2 * Math.cos(w0)) / (1 + alpha);
    const a2 = (1 - alpha) / (1 + alpha);
    const rise = (t: number) => (attack > 0 ? Math.min(1, t / attack) : 1);
    let in1 = 0;
    let in2 = 0;
    let out1 = 0;
    let out2 = 0;
    let smoothed = 0;
    let filtered = 0;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const t = i / sampleRate;
        const white = random() * 2 - 1;
        const band = gain * (white - in2) - a1 * out1 - a2 * out2;
        in2 = in1;
        in1 = white;
        out2 = out1;
        out1 = band;
        const raw =
            noise * band + (1 - noise) * Math.sin(2 * Math.PI * frequency * t);
        let envelope =
            rise(t) * (Math.exp(-t / decay) + body * Math.exp(-t / bodyDecay));
        const sinceBounce = t - bounceDelay;
        if (bounce > 0 && sinceBounce >= 0) {
            envelope +=
                bounce * rise(sinceBounce) * Math.exp(-sinceBounce / decay);
        }
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
