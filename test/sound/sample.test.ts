import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { type FlapSample, FlapSound } from '../../src/sound/flap-sound';
import {
    asAudioContext,
    FakeAudioContext,
    FakeBuffer,
} from '../helpers/fake-audio';

const seq = FlapSequence.chars('-AB');

function setup(
    sample: FlapSample | readonly FlapSample[],
    random: () => number = () => 0.5
) {
    const context = new FakeAudioContext();
    const sound = new FlapSound({
        target: new FlapUnit({ sequence: seq }),
        context: asAudioContext(context),
        sample,
        random,
    });
    return { context, sound };
}

const fakeBuffer = (length: number) =>
    new FakeBuffer(1, length, 48000) as unknown as AudioBuffer;

/** A random source that returns the given values in order, then repeats. */
function sequenceOf(...values: number[]): () => number {
    let index = 0;
    return () => values[index++ % values.length];
}

function stubFetch(response: { ok: boolean; status: number }) {
    const bytes = new ArrayBuffer(8);
    const fetch = vi.fn(async () => ({
        ...response,
        arrayBuffer: async () => bytes,
    }));
    vi.stubGlobal('fetch', fetch);
    return { fetch, bytes };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('FlapSound samples', () => {
    it('plays an AudioBuffer sample as-is', async () => {
        const sample = new FakeBuffer(1, 100, 48000);
        const { context, sound } = setup(sample as unknown as AudioBuffer);
        await sound.unlock();
        sound.play();
        expect(context.sources[0].buffer).toBe(sample);
    });

    it('fetches and decodes a sample URL on unlock', async () => {
        const { fetch, bytes } = stubFetch({ ok: true, status: 200 });
        const { context, sound } = setup('/clack.wav');
        await sound.unlock();
        expect(fetch).toHaveBeenCalledWith('/clack.wav');
        expect(context.decoded).toEqual([bytes]);
        sound.play();
        expect(context.sources[0].buffer).toBe(context.decodeResult);
    });

    it('stays silent instead of using the synth when the URL fails', async () => {
        stubFetch({ ok: false, status: 404 });
        const { context, sound } = setup('/missing.wav');
        await expect(sound.unlock()).rejects.toThrow('HTTP 404');
        expect(sound.unlocked).toBe(true);
        sound.play();
        expect(context.sources).toHaveLength(0);
    });

    it('stays silent instead of using the synth when decoding fails', async () => {
        stubFetch({ ok: true, status: 200 });
        const { context, sound } = setup('/broken.wav');
        context.decodeError = new Error('bad audio');
        await expect(sound.unlock()).rejects.toThrow('bad audio');
        sound.play();
        expect(context.sources).toHaveLength(0);
    });

    it('plays one of several samples at random per landing', async () => {
        const samples = [fakeBuffer(100), fakeBuffer(200), fakeBuffer(300)];
        const { context, sound } = setup(
            samples,
            sequenceOf(0.5, 0.5, 0.5, 0, 0.5, 0.5, 0.5, 0.99)
        );
        await sound.unlock();
        sound.play();
        sound.play();
        expect(context.sources.map(source => source.buffer)).toEqual([
            samples[0],
            samples[2],
        ]);
    });

    it('plays the samples that loaded when others fail', async () => {
        stubFetch({ ok: false, status: 404 });
        const good = fakeBuffer(100);
        const { context, sound } = setup([good, '/missing.wav']);
        await expect(sound.unlock()).rejects.toThrow('HTTP 404');
        sound.play();
        expect(context.sources[0].buffer).toBe(good);
    });

    it('is silent while samples load, never playing the synth', async () => {
        let respond: () => void = () => {};
        vi.stubGlobal(
            'fetch',
            vi.fn(
                () =>
                    new Promise(resolve => {
                        respond = () =>
                            resolve({
                                ok: true,
                                status: 200,
                                arrayBuffer: async () => new ArrayBuffer(8),
                            });
                    })
            )
        );
        const { context, sound } = setup('/clack.wav');
        const unlocking = sound.unlock();
        await vi.waitFor(() => expect(sound.unlocked).toBe(true));
        sound.play();
        expect(context.sources).toHaveLength(0);
        respond();
        await unlocking;
        sound.play();
        expect(context.sources[0].buffer).toBe(context.decodeResult);
    });
});
