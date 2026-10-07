import {
    renderClickVariants,
    resolveSynthClick,
    type SynthClickOptions,
} from './click.js';
import {
    type FlipPosition,
    panTable,
    type PanLookup,
    type SoundTarget,
} from './pan.js';

export interface FlapSoundOptions {
    /** Board, field or unit whose `flipend` events trigger clicks. */
    target: SoundTarget;
    /** 0..1 master volume. Default 0.5. */
    volume?: number;
    /** Start muted; toggle later with the `muted` property. Default false. */
    muted?: boolean;
    /** AudioBuffer used as-is, or a URL fetched and decoded on unlock(). */
    sample?: AudioBuffer | string;
    /** Synth click tuning; ignored once a sample has loaded. */
    synth?: SynthClickOptions;
    /**
     * Clicks allowed to overlap; a landing past this fades out the oldest
     * click to make room. Default 12.
     */
    maxVoices?: number;
    /**
     * Random spread per click: ± pitch and volume, and up to `timing`
     * seconds of delay so flaps landing together don't hit in unison.
     * Defaults: pitch 0.06, volume 0.5, timing 0.012.
     */
    variation?: { pitch?: number; volume?: number; timing?: number };
    /** 0..1 stereo width by column. Default 0.6. */
    pan?: number;
    /** Shared AudioContext; otherwise one is created on unlock(). */
    context?: AudioContext;
    /** Random source for variation. Default Math.random. */
    random?: () => number;
}

interface Voice {
    source: AudioBufferSourceNode;
    gain: GainNode;
}

/** Seconds for a stolen voice to fade out before it stops. */
const STEAL_FADE = 0.004;

/** Takes of the synth click; each landing plays one at random. */
export const SYNTH_VARIANTS = 8;

interface FlipSource {
    on(event: 'flipend', listener: (event: FlipPosition) => void): () => void;
}

/**
 * Plays a short click for every flap that lands on `target`, through the
 * Web Audio API. Silent until {@link unlock} succeeds, which browsers only
 * allow from a user gesture.
 */
export class FlapSound {
    private readonly synth: Required<SynthClickOptions>;
    private readonly sample: AudioBuffer | string | undefined;
    private readonly maxVoices: number;
    private readonly pitchVariation: number;
    private readonly volumeVariation: number;
    private readonly timingVariation: number;
    private readonly panFor: PanLookup;
    private readonly random: () => number;
    private readonly ownsContext: boolean;
    private readonly unsubscribe: () => void;
    private context: AudioContext | null;
    private master: GainNode | null = null;
    private clipper: WaveShaperNode | null = null;
    /** Clicks to choose from: the synth takes, or the one loaded sample. */
    private buffers: AudioBuffer[] = [];
    private unlocking: Promise<void> | null = null;
    private ready = false;
    private destroyed = false;
    /** Playing clicks, oldest first. */
    private readonly voices: Voice[] = [];
    private level: number;
    private silenced: boolean;

    constructor(options: FlapSoundOptions) {
        this.level = checkUnitRange(options.volume ?? 0.5, 'volume');
        this.silenced = options.muted ?? false;
        const panWidth = checkUnitRange(options.pan ?? 0.6, 'pan');
        const maxVoices = options.maxVoices ?? 12;
        if (!Number.isInteger(maxVoices) || maxVoices < 1) {
            throw new RangeError(
                `FlapSound: maxVoices must be a whole number >= 1, got ${maxVoices}`
            );
        }
        this.maxVoices = maxVoices;
        this.pitchVariation = checkNonNegative(
            options.variation?.pitch ?? 0.06,
            'variation.pitch'
        );
        this.volumeVariation = checkNonNegative(
            options.variation?.volume ?? 0.5,
            'variation.volume'
        );
        this.timingVariation = checkNonNegative(
            options.variation?.timing ?? 0.012,
            'variation.timing'
        );
        this.synth = resolveSynthClick(options.synth);
        this.sample = options.sample;
        this.random = options.random ?? Math.random;
        this.context = options.context ?? null;
        this.ownsContext = options.context === undefined;
        this.panFor = panTable(options.target, panWidth);
        const source = options.target as FlipSource;
        this.unsubscribe = source.on('flipend', event =>
            this.play(this.panFor(event))
        );
    }

    /** True once unlock() has created the audio graph. */
    get unlocked(): boolean {
        return this.ready;
    }

    get volume(): number {
        return this.level;
    }

    set volume(value: number) {
        this.level = checkUnitRange(value, 'volume');
        this.applyMasterGain();
    }

    get muted(): boolean {
        return this.silenced;
    }

    set muted(value: boolean) {
        this.silenced = value;
        this.applyMasterGain();
    }

    /**
     * Creates or resumes the AudioContext and builds the click. Call it from
     * a user gesture. Repeated calls share the first call's promise. If a
     * sample URL fails to load, this rejects but the synth click is used.
     */
    unlock(): Promise<void> {
        this.unlocking ??= this.start();
        return this.unlocking;
    }

    /**
     * Plays one click within `variation.timing` seconds (pan -1..1). No-op
     * before unlock or when muted.
     */
    play(pan = 0): void {
        const { context, master, buffers } = this;
        if (
            !this.ready ||
            this.destroyed ||
            this.silenced ||
            !context ||
            !master ||
            buffers.length === 0
        ) {
            return;
        }
        while (this.voices.length >= this.maxVoices) {
            this.release(this.voices[0], context.currentTime);
        }
        const rate = 1 + (this.random() * 2 - 1) * this.pitchVariation;
        const level = Math.max(0, 1 - this.random() * this.volumeVariation);
        const delay = this.random() * this.timingVariation;
        const take =
            buffers.length === 1
                ? 0
                : Math.min(
                      buffers.length - 1,
                      Math.floor(this.random() * buffers.length)
                  );
        const source = context.createBufferSource();
        source.buffer = buffers[take];
        source.playbackRate.value = rate;
        const gain = context.createGain();
        gain.gain.value = level;
        const panner = context.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        source.connect(gain);
        gain.connect(panner);
        panner.connect(master);
        const voice = { source, gain };
        this.voices.push(voice);
        source.onended = () => {
            this.forget(voice);
            source.disconnect();
            gain.disconnect();
            panner.disconnect();
        };
        source.start(context.currentTime + delay);
    }

    /** Stops listening and releases audio; closes only a context it created. */
    destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.unsubscribe();
        this.master?.disconnect();
        this.clipper?.disconnect();
        if (this.ownsContext && this.context) {
            void this.context.close();
        }
    }

    private async start(): Promise<void> {
        let context = this.context;
        if (!context) {
            if (typeof AudioContext === 'undefined') {
                throw new Error('FlapSound: Web Audio is not available');
            }
            context = new AudioContext();
            this.context = context;
        }
        await context.resume();
        const master = context.createGain();
        const headroom = context.createGain();
        headroom.gain.value = 1 / CLIP_RANGE;
        const clipper = context.createWaveShaper();
        clipper.curve = softClipCurve();
        // No oversampling: its resampling filter rings past 1.0 on crisp
        // clicks.
        clipper.oversample = 'none';
        master.connect(headroom);
        headroom.connect(clipper);
        clipper.connect(context.destination);
        this.master = master;
        this.clipper = clipper;
        this.applyMasterGain();
        this.buffers = this.synthBuffers(context);
        this.ready = true;
        if (this.sample !== undefined) {
            this.buffers = [await loadSample(context, this.sample)];
        }
    }

    private synthBuffers(context: AudioContext): AudioBuffer[] {
        const { sampleRate } = context;
        return renderClickVariants(sampleRate, this.synth, SYNTH_VARIANTS).map(
            samples => {
                const buffer = context.createBuffer(
                    1,
                    samples.length,
                    sampleRate
                );
                buffer.getChannelData(0).set(samples);
                return buffer;
            }
        );
    }

    private applyMasterGain(): void {
        if (this.master) {
            this.master.gain.value = this.silenced ? 0 : this.level;
        }
    }

    /** Fades a voice out and stops it, freeing its slot now. */
    private release(voice: Voice, now: number): void {
        this.forget(voice);
        voice.gain.gain.setTargetAtTime(0, now, STEAL_FADE);
        voice.source.stop(now + STEAL_FADE * 5);
    }

    private forget(voice: Voice): void {
        const index = this.voices.indexOf(voice);
        if (index >= 0) {
            this.voices.splice(index, 1);
        }
    }
}

/** Peaks up to this level reach the soft clipper's curve; louder hold at 1. */
export const CLIP_RANGE = 4;
/** Level where the soft clipper starts rounding peaks off. */
export const CLIP_KNEE = 0.7;

/**
 * WaveShaper curve for input scaled down by {@link CLIP_RANGE}: unchanged up
 * to {@link CLIP_KNEE}, then a tanh shoulder that never passes 1. Many flaps
 * landing together can sum well past full scale; this rounds those peaks off
 * instead of letting the output clip.
 */
export function softClipCurve(points = 2049): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(points);
    for (let i = 0; i < points; i++) {
        const x = ((2 * i) / (points - 1) - 1) * CLIP_RANGE;
        const over = Math.abs(x) - CLIP_KNEE;
        curve[i] =
            over <= 0
                ? x
                : Math.sign(x) *
                  (CLIP_KNEE +
                      (1 - CLIP_KNEE) * Math.tanh(over / (1 - CLIP_KNEE)));
    }
    return curve;
}

async function loadSample(
    context: AudioContext,
    sample: AudioBuffer | string
): Promise<AudioBuffer> {
    if (typeof sample !== 'string') {
        return sample;
    }
    const response = await fetch(sample);
    if (!response.ok) {
        throw new Error(
            `FlapSound: could not load sample ${sample} (HTTP ${response.status})`
        );
    }
    return context.decodeAudioData(await response.arrayBuffer());
}

function checkUnitRange(value: number, name: string): number {
    if (!(value >= 0 && value <= 1)) {
        throw new RangeError(
            `FlapSound: ${name} must be between 0 and 1, got ${value}`
        );
    }
    return value;
}

function checkNonNegative(value: number, name: string): number {
    if (!(value >= 0) || !Number.isFinite(value)) {
        throw new RangeError(
            `FlapSound: ${name} must be a number >= 0, got ${value}`
        );
    }
    return value;
}
