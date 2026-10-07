/** Minimal recording fakes for the parts of Web Audio FlapSound uses. */

export class FakeParam {
    value = 0;
    readonly targets: { target: number; at: number; timeConstant: number }[] =
        [];

    setTargetAtTime(target: number, at: number, timeConstant: number): void {
        this.targets.push({ target, at, timeConstant });
    }
}

export class FakeNode {
    readonly connections: unknown[] = [];
    disconnected = false;

    connect(target: unknown): unknown {
        this.connections.push(target);
        return target;
    }

    disconnect(): void {
        this.disconnected = true;
    }
}

export class FakeGain extends FakeNode {
    readonly gain = new FakeParam();
}

export class FakePanner extends FakeNode {
    readonly pan = new FakeParam();
}

export class FakeShaper extends FakeNode {
    curve: Float32Array | null = null;
    oversample: OverSampleType = 'none';
}

export class FakeSource extends FakeNode {
    buffer: unknown = null;
    readonly playbackRate = new FakeParam();
    onended: (() => void) | null = null;
    startedAt: number | null = null;
    stoppedAt: number | null = null;

    start(when = 0): void {
        this.startedAt = when;
    }

    stop(when = 0): void {
        this.stoppedAt = when;
    }

    /** Simulates the click finishing. */
    end(): void {
        this.onended?.();
    }
}

export class FakeBuffer {
    private readonly channels: Float32Array[];

    constructor(
        readonly numberOfChannels: number,
        readonly length: number,
        readonly sampleRate: number
    ) {
        this.channels = Array.from(
            { length: numberOfChannels },
            () => new Float32Array(length)
        );
    }

    getChannelData(channel: number): Float32Array {
        return this.channels[channel];
    }
}

export class FakeAudioContext {
    sampleRate = 48000;
    currentTime = 1.5;
    readonly destination = new FakeNode();
    readonly sources: FakeSource[] = [];
    readonly gains: FakeGain[] = [];
    readonly panners: FakePanner[] = [];
    readonly shapers: FakeShaper[] = [];
    readonly decoded: ArrayBuffer[] = [];
    decodeResult: unknown = new FakeBuffer(1, 10, 48000);
    decodeError: Error | null = null;
    resumed = 0;
    closed = false;

    async resume(): Promise<void> {
        this.resumed++;
    }

    async close(): Promise<void> {
        this.closed = true;
    }

    createGain(): FakeGain {
        const gain = new FakeGain();
        gain.gain.value = 1;
        this.gains.push(gain);
        return gain;
    }

    createStereoPanner(): FakePanner {
        const panner = new FakePanner();
        this.panners.push(panner);
        return panner;
    }

    createWaveShaper(): FakeShaper {
        const shaper = new FakeShaper();
        this.shapers.push(shaper);
        return shaper;
    }

    createBufferSource(): FakeSource {
        const source = new FakeSource();
        source.playbackRate.value = 1;
        this.sources.push(source);
        return source;
    }

    createBuffer(
        channels: number,
        length: number,
        sampleRate: number
    ): FakeBuffer {
        return new FakeBuffer(channels, length, sampleRate);
    }

    async decodeAudioData(data: ArrayBuffer): Promise<unknown> {
        this.decoded.push(data);
        if (this.decodeError) {
            throw this.decodeError;
        }
        return this.decodeResult;
    }
}

export const asAudioContext = (fake: FakeAudioContext): AudioContext =>
    fake as unknown as AudioContext;
