import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { defineField, textField } from '../../src/core/field';
import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { renderClick } from '../../src/sound/click';
import { FlapSound, type FlapSoundOptions } from '../../src/sound/flap-sound';
import {
    asAudioContext,
    FakeAudioContext,
    type FakeBuffer,
} from '../helpers/fake-audio';

const seq = FlapSequence.chars('-AB');

function setup(options: Partial<FlapSoundOptions> = {}) {
    const unit = new FlapUnit({ sequence: seq, flipDuration: 10 });
    const context = new FakeAudioContext();
    const sound = new FlapSound({
        target: unit,
        context: asAudioContext(context),
        random: () => 0.5,
        ...options,
    });
    return { unit, context, sound };
}

/** A random source that returns the given values in order, then repeats. */
function sequenceOf(...values: number[]): () => number {
    let index = 0;
    return () => values[index++ % values.length];
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('FlapSound', () => {
    it('is silent before unlock', () => {
        const { unit, context, sound } = setup();
        unit.setTarget('A');
        unit.update(10);
        expect(context.sources).toHaveLength(0);
        expect(sound.unlocked).toBe(false);
    });

    it('builds a master gain and the synth click on unlock', async () => {
        const { context, sound } = setup();
        await sound.unlock();
        expect(sound.unlocked).toBe(true);
        expect(context.resumed).toBe(1);
        const [master] = context.gains;
        expect(master.gain.value).toBe(0.5);
        expect(master.connections).toEqual([context.destination]);
        sound.play();
        const buffer = context.sources[0].buffer as FakeBuffer;
        expect(buffer.length).toBe(2400);
        expect(Array.from(buffer.getChannelData(0).slice(0, 5))).toEqual(
            Array.from(renderClick(48000).slice(0, 5))
        );
    });

    it('shares one unlock between repeated calls', async () => {
        const { context, sound } = setup();
        await Promise.all([sound.unlock(), sound.unlock()]);
        expect(context.resumed).toBe(1);
    });

    it('plays one click per landing, routed source → gain → pan → master', async () => {
        const { unit, context, sound } = setup();
        await sound.unlock();
        unit.setTarget('B');
        unit.update(20);
        expect(context.sources).toHaveLength(2);
        const [source] = context.sources;
        const [master, gain] = context.gains;
        const [panner] = context.panners;
        expect(source.connections).toEqual([gain]);
        expect(gain.connections).toEqual([panner]);
        expect(panner.connections).toEqual([master]);
        expect(source.startedAt).toBe(1.5);
        expect(panner.pan.value).toBe(0);
    });

    it('varies pitch and volume with the random source', async () => {
        const { context, sound } = setup({ random: sequenceOf(1, 0) });
        await sound.unlock();
        sound.play();
        expect(context.sources[0].playbackRate.value).toBeCloseTo(1.06);
        expect(context.gains[1].gain.value).toBe(1);
    });

    it('caps overlapping clicks and frees a voice when one ends', async () => {
        const { unit, context, sound } = setup({ maxVoices: 2 });
        await sound.unlock();
        unit.spin();
        unit.update(50); // 5 landings
        expect(context.sources).toHaveLength(2);
        context.sources[0].end();
        unit.update(10);
        expect(context.sources).toHaveLength(3);
        expect(context.sources[0].disconnected).toBe(true);
    });

    it('creates nothing while muted and restores the volume after', async () => {
        const { unit, context, sound } = setup();
        await sound.unlock();
        sound.muted = true;
        expect(context.gains[0].gain.value).toBe(0);
        unit.setTarget('A');
        unit.update(10);
        expect(context.sources).toHaveLength(0);
        sound.muted = false;
        expect(context.gains[0].gain.value).toBe(0.5);
    });

    it('updates the master gain from the volume setter and validates it', async () => {
        const { context, sound } = setup();
        await sound.unlock();
        sound.volume = 0.2;
        expect(context.gains[0].gain.value).toBe(0.2);
        expect(() => (sound.volume = 2)).toThrow(RangeError);
        expect(sound.volume).toBe(0.2);
    });

    it('clamps a manual pan to -1..1', async () => {
        const { context, sound } = setup();
        await sound.unlock();
        sound.play(5);
        expect(context.panners[0].pan.value).toBe(1);
    });

    it('pans board landings by column', async () => {
        const board = new FlapBoard({
            rows: 1,
            schema: {
                time: textField({
                    sequence: seq,
                    length: 2,
                    unit: { flipDuration: 10 },
                }),
                dest: defineField({
                    sequence: seq,
                    length: 1,
                    cells: 3,
                    unit: { flipDuration: 10 },
                }),
            },
        });
        const context = new FakeAudioContext();
        const sound = new FlapSound({
            target: board,
            context: asAudioContext(context),
            random: () => 0.5,
        });
        await sound.unlock();
        board.row(0).set({ dest: 'A' });
        board.update(10);
        expect(context.panners[0].pan.value).toBeCloseTo(0.5 * 0.6);
    });

    it('stops listening on destroy and leaves an injected context open', async () => {
        const { unit, context, sound } = setup();
        await sound.unlock();
        sound.destroy();
        unit.setTarget('A');
        unit.update(10);
        expect(context.sources).toHaveLength(0);
        expect(context.closed).toBe(false);
    });

    it('creates and later closes its own context', async () => {
        const created: FakeAudioContext[] = [];
        vi.stubGlobal(
            'AudioContext',
            class extends FakeAudioContext {
                constructor() {
                    super();
                    created.push(this);
                }
            }
        );
        const sound = new FlapSound({
            target: new FlapUnit({ sequence: seq }),
        });
        await sound.unlock();
        expect(created).toHaveLength(1);
        sound.destroy();
        expect(created[0].closed).toBe(true);
    });

    it('rejects unlock when Web Audio is missing', async () => {
        vi.stubGlobal('AudioContext', undefined);
        const sound = new FlapSound({
            target: new FlapUnit({ sequence: seq }),
        });
        await expect(sound.unlock()).rejects.toThrow(
            'Web Audio is not available'
        );
    });

    it('validates its options', () => {
        const target = new FlapUnit({ sequence: seq });
        for (const options of [
            { volume: 1.5 },
            { pan: -0.1 },
            { maxVoices: 0 },
            { maxVoices: 1.5 },
            { variation: { pitch: -1 } },
            { variation: { volume: NaN } },
            { synth: { brightness: 0 } },
        ]) {
            expect(() => new FlapSound({ target, ...options })).toThrow(
                RangeError
            );
        }
    });
});
