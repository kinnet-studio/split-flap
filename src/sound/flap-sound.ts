import {
    renderClick,
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
    /** Clicks allowed to overlap; extra landings are skipped. Default 12. */
    maxVoices?: number;
    /** ± random spread per click. Defaults: pitch 0.06, volume 0.15. */
    variation?: { pitch?: number; volume?: number };
    /** 0..1 stereo width by column. Default 0.6. */
    pan?: number;
    /** Shared AudioContext; otherwise one is created on unlock(). */
    context?: AudioContext;
    /** Random source for variation. Default Math.random. */
    random?: () => number;
}

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
    private readonly panFor: PanLookup;
    private readonly random: () => number;
    private readonly ownsContext: boolean;
    private readonly unsubscribe: () => void;
    private context: AudioContext | null;
    private master: GainNode | null = null;
    private buffer: AudioBuffer | null = null;
    private unlocking: Promise<void> | null = null;
    private ready = false;
    private destroyed = false;
    private active = 0;
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
            options.variation?.volume ?? 0.15,
            'variation.volume'
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

    /** Plays one click now (pan -1..1). No-op before unlock or when muted. */
    play(pan = 0): void {
        const { context, master, buffer } = this;
        if (
            !this.ready ||
            this.destroyed ||
            this.silenced ||
            !context ||
            !master ||
            !buffer ||
            this.active >= this.maxVoices
        ) {
            return;
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value =
            1 + (this.random() * 2 - 1) * this.pitchVariation;
        const gain = context.createGain();
        gain.gain.value = Math.max(0, 1 - this.random() * this.volumeVariation);
        const panner = context.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        source.connect(gain);
        gain.connect(panner);
        panner.connect(master);
        this.active++;
        source.onended = () => {
            this.active--;
            source.disconnect();
            gain.disconnect();
            panner.disconnect();
        };
        source.start(context.currentTime);
    }

    /** Stops listening and releases audio; closes only a context it created. */
    destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.unsubscribe();
        this.master?.disconnect();
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
        master.connect(context.destination);
        this.master = master;
        this.applyMasterGain();
        this.buffer = this.synthBuffer(context);
        this.ready = true;
        if (this.sample !== undefined) {
            this.buffer = await loadSample(context, this.sample);
        }
    }

    private synthBuffer(context: AudioContext): AudioBuffer {
        const samples = renderClick(context.sampleRate, this.synth);
        const buffer = context.createBuffer(
            1,
            samples.length,
            context.sampleRate
        );
        buffer.getChannelData(0).set(samples);
        return buffer;
    }

    private applyMasterGain(): void {
        if (this.master) {
            this.master.gain.value = this.silenced ? 0 : this.level;
        }
    }
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
