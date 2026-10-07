import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { FlapSound } from '../../src/sound/flap-sound';
import {
    asAudioContext,
    FakeAudioContext,
    FakeBuffer,
} from '../helpers/fake-audio';

const seq = FlapSequence.chars('-AB');

function setup(sample: AudioBuffer | string) {
    const context = new FakeAudioContext();
    const sound = new FlapSound({
        target: new FlapUnit({ sequence: seq }),
        context: asAudioContext(context),
        sample,
    });
    return { context, sound };
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

    it('falls back to the synth click when the URL fails to load', async () => {
        stubFetch({ ok: false, status: 404 });
        const { context, sound } = setup('/missing.wav');
        await expect(sound.unlock()).rejects.toThrow('HTTP 404');
        expect(sound.unlocked).toBe(true);
        sound.play();
        expect((context.sources[0].buffer as FakeBuffer).length).toBe(7680);
    });

    it('falls back to the synth click when decoding fails', async () => {
        stubFetch({ ok: true, status: 200 });
        const { context, sound } = setup('/broken.wav');
        context.decodeError = new Error('bad audio');
        await expect(sound.unlock()).rejects.toThrow('bad audio');
        sound.play();
        expect((context.sources[0].buffer as FakeBuffer).length).toBe(7680);
    });
});
