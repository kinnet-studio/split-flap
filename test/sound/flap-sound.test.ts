import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { defineField, textField } from '../../src/core/field';
import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { renderClick } from '../../src/sound/click';
import {
    CLIP_KNEE,
    CLIP_RANGE,
    FlapSound,
    type FlapSoundOptions,
    softClipCurve,
} from '../../src/sound/flap-sound';
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

    it('builds master gain → soft clipper and the synth click on unlock', async () => {
        const { context, sound } = setup();
        await sound.unlock();
        expect(sound.unlocked).toBe(true);
        expect(context.resumed).toBe(1);
        const [master, headroom] = context.gains;
        const [clipper] = context.shapers;
        expect(master.gain.value).toBe(0.5);
        expect(master.connections).toEqual([headroom]);
        expect(headroom.gain.value).toBe(1 / CLIP_RANGE);
        expect(headroom.connections).toEqual([clipper]);
        expect(clipper.curve).toEqual(softClipCurve());
        expect(clipper.oversample).toBe('none');
        expect(clipper.connections).toEqual([context.destination]);
        sound.play();
        const buffer = context.sources[0].buffer as FakeBuffer;
        expect(buffer.length).toBe(7680);
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
        const [master, , gain] = context.gains;
        const [panner] = context.panners;
        expect(source.connections).toEqual([gain]);
        expect(gain.connections).toEqual([panner]);
        expect(panner.connections).toEqual([master]);
        expect(source.startedAt).toBeCloseTo(1.5 + 0.5 * 0.012);
        expect(panner.pan.value).toBe(0);
    });

    it('varies pitch, volume and timing with the random source', async () => {
        const { context, sound } = setup({ random: sequenceOf(1, 0, 1) });
        await sound.unlock();
        sound.play();
        expect(context.sources[0].playbackRate.value).toBeCloseTo(1.06);
        expect(context.gains[2].gain.value).toBe(1);
        expect(context.sources[0].startedAt).toBeCloseTo(1.512);
    });

    it('plays on time when timing variation is 0', async () => {
        const { context, sound } = setup({ variation: { timing: 0 } });
        await sound.unlock();
        sound.play();
        expect(context.sources[0].startedAt).toBe(1.5);
    });

    it('fades out the oldest click when every voice is busy', async () => {
        const { unit, context, sound } = setup({ maxVoices: 2 });
        await sound.unlock();
        unit.spin();
        unit.update(30); // 3 landings
        expect(context.sources).toHaveLength(3);
        const [oldest, second, newest] = context.sources;
        expect(context.gains[2].gain.targets).toEqual([
            { target: 0, at: 1.5, timeConstant: 0.004 },
        ]);
        expect(oldest.stoppedAt).toBeCloseTo(1.52);
        expect(second.stoppedAt).toBeNull();
        expect(newest.stoppedAt).toBeNull();
    });

    it('frees a voice when its click ends', async () => {
        const { unit, context, sound } = setup({ maxVoices: 2 });
        await sound.unlock();
        unit.spin();
        unit.update(20); // 2 landings
        context.sources[0].end();
        expect(context.sources[0].disconnected).toBe(true);
        unit.update(10);
        expect(context.sources).toHaveLength(3);
        expect(context.sources[1].stoppedAt).toBeNull();
    });

    it('can start muted from the constructor', async () => {
        const { unit, context, sound } = setup({ muted: true });
        expect(sound.muted).toBe(true);
        await sound.unlock();
        expect(context.gains[0].gain.value).toBe(0);
        unit.setTarget('A');
        unit.update(10);
        expect(context.sources).toHaveLength(0);
        sound.muted = false;
        expect(context.gains[0].gain.value).toBe(0.5);
    });

    it('starts unmuted by default', () => {
        expect(setup().sound.muted).toBe(false);
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
        expect(context.gains[0].disconnected).toBe(true);
        expect(context.shapers[0].disconnected).toBe(true);
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
            { variation: { timing: -0.01 } },
            { synth: { brightness: 0 } },
        ]) {
            expect(() => new FlapSound({ target, ...options })).toThrow(
                RangeError
            );
        }
    });
});

describe('softClipCurve', () => {
    const curve = softClipCurve();
    const inputAt = (index: number) =>
        ((2 * index) / (curve.length - 1) - 1) * CLIP_RANGE;
    const at = (input: number) =>
        curve[((input / CLIP_RANGE + 1) / 2) * (curve.length - 1)];

    it('passes levels up to the knee through unchanged', () => {
        let checked = 0;
        curve.forEach((output, index) => {
            const input = inputAt(index);
            if (Math.abs(input) <= CLIP_KNEE) {
                expect(output).toBeCloseTo(input, 6);
                checked++;
            }
        });
        expect(checked).toBeGreaterThan(300);
    });

    it('rounds louder peaks off below full scale', () => {
        expect(at(1)).toBeGreaterThan(CLIP_KNEE);
        expect(at(1)).toBeLessThan(1);
        expect(at(CLIP_RANGE)).toBeLessThanOrEqual(1);
        expect(at(CLIP_RANGE)).toBeGreaterThan(0.99);
        expect(at(-CLIP_RANGE)).toBe(-at(CLIP_RANGE));
    });

    it('never folds back: louder input is never quieter output', () => {
        for (let i = 1; i < curve.length; i++) {
            expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
        }
    });
});
