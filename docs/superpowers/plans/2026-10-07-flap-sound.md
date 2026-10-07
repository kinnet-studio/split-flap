# Flap Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@kinnet-studio/split-flaps/sound`. `FlapSound` plays a synthesized (or sampled) click for every flap that lands on a board, field or unit, with a voice cap, random variation and stereo panning by column.

**Architecture:** `src/sound/` is a new, renderer-agnostic entry point that imports only from `src/core`. It is made of three modules:
- `click.ts`: pure synthesis, `renderClick()`.
- `pan.ts`: a column-based pan lookup.
- `flap-sound.ts`: subscribes to `flipend`, unlocks Web Audio, mixes clicks through per-click gain and pan nodes into a master gain, and caps the number of overlapping voices.

Packaging adds a `./sound` export, a build entry and a dist check.

**Tech Stack:** TypeScript 5.9 strict, Web Audio API (`lib.dom` types), Vitest 5 in the node environment with a recording fake `AudioContext`, Bun 1.3.

**Spec:** `docs/superpowers/specs/2026-10-07-flap-sound-design.md`

## Global Constraints

- Work in `/Users/vincent.yy.chang/dev/split-flop/main` on branch `feat/sound`. It is already checked out and holds the spec commit.
- `src/sound/**` imports only from `src/core/**`: no `src/render`, no `pixi.js`, no `@ue-too/animate`. No new dependencies.
- Relative imports inside `src/` use explicit `.js` extensions (e.g. `from './click.js'`). Test imports stay extensionless.
- Defaults are fixed: `volume` 0.5, `pan` 0.6, `maxVoices` 12, `variation` pitch 0.06 and volume 0.15. Synth defaults are frequency 2200, decay 0.012, duration 0.05, noise 0.6, brightness 0.5. The default seed is `0x5f1a95` (mulberry32), and the peak is normalized to 0.9.
- Bun for everything. Tests run in Vitest's `node` environment. Prettier settings: 4 spaces, single quotes, trailing comma es5, `arrowParens: avoid`, width 80. Run `bunx prettier --write` on touched files before each commit.
- One conventional commit per task, ending with your harness's `Co-Authored-By:` attribution line.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/sound/click.ts` | `renderClick`, `resolveSynthClick`, `mulberry32`, `DEFAULT_SYNTH_CLICK`, `SynthClickOptions` |
| `src/sound/pan.ts` | `panTable`, `SoundTarget`, `FlipPosition`, `PanLookup` |
| `src/sound/flap-sound.ts` | `FlapSound`, `FlapSoundOptions` |
| `src/sound/index.ts` | `/sound` entry exports |
| `test/helpers/fake-audio.ts` | Recording fake `AudioContext`, nodes and buffers |
| `test/sound/*.test.ts` | Unit tests |
| `package.json`, `scripts/build.ts`, `scripts/check-dist.ts`, `tsconfig.json`, `examples/*`, `README.md`, `test/index.test.ts` | Packaging, demo, docs |

---

### Task 1: Synth click

**Files:**
- Create: `src/sound/click.ts`
- Test: `test/sound/click.test.ts`

**Interfaces:**
- Produces:
  - `renderClick(sampleRate: number, options?: SynthClickOptions, random?: () => number): Float32Array`
  - `resolveSynthClick(options?): Required<SynthClickOptions>`, which throws `RangeError`
  - `mulberry32(seed): () => number`
  - `DEFAULT_SYNTH_CLICK`

- [ ] **Step 1: Write the failing test** at `test/sound/click.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
    DEFAULT_SYNTH_CLICK,
    mulberry32,
    renderClick,
} from '../../src/sound/click';

const RATE = 48000;

function energy(samples: Float32Array, from: number, to: number): number {
    let sum = 0;
    for (let i = from; i < to; i++) {
        sum += samples[i] * samples[i];
    }
    return sum;
}

describe('renderClick', () => {
    it('is duration × sampleRate samples long', () => {
        expect(renderClick(RATE)).toHaveLength(2400);
        expect(renderClick(RATE, { duration: 0.01 })).toHaveLength(480);
        expect(renderClick(10, { duration: 0.01 })).toHaveLength(1);
    });

    it('hits hard at the start and decays towards the end', () => {
        const click = renderClick(RATE);
        const fifth = click.length / 5;
        expect(energy(click, click.length - fifth, click.length)).toBeLessThan(
            energy(click, 0, fifth) * 0.05
        );
    });

    it('is normalized to a 0.9 peak', () => {
        const click = renderClick(RATE);
        const peak = click.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
        expect(peak).toBeCloseTo(0.9, 5);
    });

    it('renders the same default click every time', () => {
        expect(renderClick(RATE)).toEqual(renderClick(RATE));
    });

    it('is a decaying sine with no noise and no filtering', () => {
        const options = { noise: 0, brightness: 1 };
        const click = renderClick(RATE, options);
        const { frequency, decay } = DEFAULT_SYNTH_CLICK;
        const expected = Array.from(
            click,
            (_, i) =>
                Math.sin((2 * Math.PI * frequency * i) / RATE) *
                Math.exp(-i / RATE / decay)
        );
        const scale =
            0.9 / expected.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
        for (const i of [1, 10, 100, 1000]) {
            expect(click[i]).toBeCloseTo(expected[i] * scale, 5);
        }
    });

    it('uses the given random source for noise', () => {
        const a = renderClick(RATE, {}, mulberry32(1));
        const b = renderClick(RATE, {}, mulberry32(2));
        expect(a).not.toEqual(b);
    });

    it('validates its options', () => {
        for (const options of [
            { frequency: 0 },
            { decay: -1 },
            { duration: NaN },
            { noise: 1.5 },
            { brightness: 0 },
            { brightness: 1.1 },
        ]) {
            expect(() => renderClick(RATE, options)).toThrow(RangeError);
        }
        expect(() => renderClick(0)).toThrow(RangeError);
    });
});
```

- [ ] **Step 2: Run it and see it fail.** Run: `bunx vitest run test/sound/click.test.ts`. Expected: FAIL, cannot resolve `../../src/sound/click`.

- [ ] **Step 3: Implement** `src/sound/click.ts`:

```ts
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

/** Small seeded PRNG (mulberry32) returning numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

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
```

- [ ] **Step 4: Run it and see it pass.** Run: `bunx vitest run test/sound/click.test.ts && bun run typecheck`. Expected: 7 tests PASS, and `tsc` exits 0.

- [ ] **Step 5: Commit.** Run `bunx prettier --write src/sound test/sound`, then `git add -A && git commit` with the message `feat(sound): synthesize the split-flap click` followed by your trailer.

---

### Task 2: Pan table

**Files:**
- Create: `src/sound/pan.ts`
- Test: `test/sound/pan.test.ts`

**Interfaces:**
- Consumes: from the core, `FlapBoard` (`fieldNames`, `schema[name].length/cells`), `FlapField` (`length`, `cells`) and `FlapUnit`.
- Produces:
  - `type SoundTarget`
  - `interface FlipPosition { field?: string; unit?: number }`
  - `type PanLookup = (position: FlipPosition) => number`
  - `panTable(target: SoundTarget, width: number): PanLookup`

- [ ] **Step 1: Write the failing test** at `test/sound/pan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { defineField, FlapField, textField } from '../../src/core/field';
import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { panTable } from '../../src/sound/pan';

const chars = FlapSequence.chars(' AB');
const cities = new FlapSequence(['', 'TOKYO']);

// columns: time 0 and 1, dest spans 2..4 (centre 3) → last column 4
const board = new FlapBoard({
    rows: 2,
    schema: {
        time: textField({ sequence: chars, length: 2 }),
        dest: defineField({ sequence: cities, length: 1, cells: 3 }),
    },
});

describe('panTable', () => {
    it('pans board units by centre column, ignoring rows', () => {
        const pan = panTable(board, 1);
        expect(pan({ field: 'time', unit: 0 })).toBe(-1);
        expect(pan({ field: 'time', unit: 1 })).toBe(-0.5);
        expect(pan({ field: 'dest', unit: 0 })).toBe(0.5);
    });

    it('scales by width', () => {
        expect(panTable(board, 0.6)({ field: 'time', unit: 0 })).toBeCloseTo(
            -0.6
        );
    });

    it('centres unknown fields', () => {
        expect(panTable(board, 1)({ field: 'nope', unit: 0 })).toBe(0);
    });

    it('pans field units across the field', () => {
        const field = new FlapField(textField({ sequence: chars, length: 3 }));
        const pan = panTable(field, 1);
        expect([0, 1, 2].map(unit => pan({ unit }))).toEqual([-1, 0, 1]);
    });

    it('centres a single unit, a single column, and width 0', () => {
        expect(panTable(new FlapUnit({ sequence: chars }), 1)({})).toBe(0);
        const wide = new FlapField(
            defineField({ sequence: cities, length: 1, cells: 5 })
        );
        expect(panTable(wide, 1)({ unit: 0 })).toBe(0);
        expect(panTable(board, 0)({ field: 'time', unit: 0 })).toBe(0);
    });
});
```

- [ ] **Step 2: Run it and see it fail.** Run: `bunx vitest run test/sound/pan.test.ts`. Expected: FAIL, cannot resolve `../../src/sound/pan`.

- [ ] **Step 3: Implement** `src/sound/pan.ts`:

```ts
import { FlapBoard } from '../core/board.js';
import { FlapField } from '../core/field.js';
import type { FlapUnit } from '../core/unit.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SoundTarget = FlapBoard<any> | FlapField<any, any> | FlapUnit<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Where a landed flap is, as carried by board/field `flipend` events. */
export interface FlipPosition {
    field?: string;
    unit?: number;
}

/** Maps a landed flap's position to a stereo pan in [-width, width]. */
export type PanLookup = (position: FlipPosition) => number;

/**
 * Builds a pan lookup from the target's columns: a unit's centre column
 * mapped across [-width, width]. Rows don't affect pan; a single unit, a
 * single column or `width` 0 is centred.
 */
export function panTable(target: SoundTarget, width: number): PanLookup {
    if (width === 0) {
        return () => 0;
    }
    if (target instanceof FlapBoard) {
        const fields = new Map<string, { start: number; cells: number }>();
        let columns = 0;
        for (const name of target.fieldNames) {
            const spec = target.schema[name];
            const cells = spec.cells ?? 1;
            fields.set(name, { start: columns, cells });
            columns += spec.length * cells;
        }
        return position => {
            const field =
                position.field === undefined
                    ? undefined
                    : fields.get(position.field);
            if (!field) {
                return 0;
            }
            const centre =
                field.start +
                (position.unit ?? 0) * field.cells +
                (field.cells - 1) / 2;
            return spread(centre, columns - 1, width);
        };
    }
    if (target instanceof FlapField) {
        const { cells, length } = target;
        return position =>
            spread(
                (position.unit ?? 0) * cells + (cells - 1) / 2,
                length * cells - 1,
                width
            );
    }
    return () => 0;
}

function spread(centre: number, lastColumn: number, width: number): number {
    return lastColumn <= 0 ? 0 : ((centre / lastColumn) * 2 - 1) * width;
}
```

- [ ] **Step 4: Run it and see it pass.** Run: `bunx vitest run test/sound/pan.test.ts && bun run typecheck`. Expected: 5 tests PASS, and `tsc` exits 0.

- [ ] **Step 5: Commit** with the message `feat(sound): pan landings by board column`.

---

### Task 3: FlapSound

**Files:**
- Create: `test/helpers/fake-audio.ts`, `src/sound/flap-sound.ts`
- Test: `test/sound/flap-sound.test.ts`, `test/sound/sample.test.ts`

**Interfaces:**
- Consumes:
  - `renderClick`, `resolveSynthClick` and `SynthClickOptions` (Task 1)
  - `panTable`, `FlipPosition`, `PanLookup` and `SoundTarget` (Task 2)
  - `on('flipend', listener)` from `FlapUnit`, `FlapField` and `FlapBoard`
- Produces:
  - `class FlapSound`, constructed with `new FlapSound(options: FlapSoundOptions)`
  - its members: `unlock(): Promise<void>`, `play(pan?: number): void`, `volume` (get/set), `muted` (get/set), `readonly unlocked` and `destroy()`
  - `interface FlapSoundOptions`
  - Test helpers: `FakeAudioContext`, `FakeBuffer`, `FakeSource`, `FakeGain`, `FakePanner`, `FakeNode`, `FakeParam` and `asAudioContext`

- [ ] **Step 1: Create the test fakes** at `test/helpers/fake-audio.ts`:

```ts
/** Minimal recording fakes for the parts of Web Audio FlapSound uses. */

export class FakeParam {
    value = 0;
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

export class FakeSource extends FakeNode {
    buffer: unknown = null;
    readonly playbackRate = new FakeParam();
    onended: (() => void) | null = null;
    startedAt: number | null = null;

    start(when = 0): void {
        this.startedAt = when;
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
```

- [ ] **Step 2: Write the failing tests.** First `test/sound/flap-sound.test.ts`:

```ts
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
```

Then `test/sound/sample.test.ts`:

```ts
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
        expect((context.sources[0].buffer as FakeBuffer).length).toBe(2400);
    });

    it('falls back to the synth click when decoding fails', async () => {
        stubFetch({ ok: true, status: 200 });
        const { context, sound } = setup('/broken.wav');
        context.decodeError = new Error('bad audio');
        await expect(sound.unlock()).rejects.toThrow('bad audio');
        sound.play();
        expect((context.sources[0].buffer as FakeBuffer).length).toBe(2400);
    });
});
```

- [ ] **Step 3: Run them and see them fail.** Run: `bunx vitest run test/sound/flap-sound.test.ts test/sound/sample.test.ts`. Expected: FAIL, cannot resolve `../../src/sound/flap-sound`.

- [ ] **Step 4: Implement** `src/sound/flap-sound.ts`:

```ts
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
    private silenced = false;

    constructor(options: FlapSoundOptions) {
        this.level = checkUnitRange(options.volume ?? 0.5, 'volume');
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
```

- [ ] **Step 5: Run them and see them pass.** Run: `bunx vitest run test/sound && bun run typecheck`. Expected: all sound tests PASS (14 FlapSound, 4 samples, plus Tasks 1–2), and `tsc` exits 0.

- [ ] **Step 6: Commit** with the message `feat(sound): play clicks for landed flaps with FlapSound`.

---

### Task 4: Entry point, packaging, examples and README

**Files:**
- Create: `src/sound/index.ts`
- Modify: `package.json`, `scripts/build.ts`, `scripts/check-dist.ts`, `tsconfig.json`, `examples/vite.config.ts`, `examples/index.html`, `examples/main.ts`, `test/index.test.ts`, `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: the `@kinnet-studio/split-flaps/sound` entry, which exports `FlapSound`, `renderClick`, `DEFAULT_SYNTH_CLICK` and `panTable`, plus the types `FlapSoundOptions`, `SynthClickOptions`, `FlipPosition`, `PanLookup` and `SoundTarget`.

- [ ] **Step 1: Write the failing entry-point test.** Apply this diff to `test/index.test.ts`:

```diff
--- a/test/index.test.ts
+++ b/test/index.test.ts
@@ -3,6 +3,7 @@ import { describe, expect, it } from 'vitest';
 import * as canvas from '../src/canvas';
 import * as core from '../src/core';
 import * as pixi from '../src/pixi';
+import * as sound from '../src/sound';
 
 describe('entry points', () => {
     it('exports the core runtime API', () => {
@@ -60,4 +61,15 @@ describe('entry points', () => {
             ])
         );
     });
+
+    it('exports the sound entry', () => {
+        expect(Object.keys(sound).sort()).toEqual(
+            [
+                'DEFAULT_SYNTH_CLICK',
+                'FlapSound',
+                'panTable',
+                'renderClick',
+            ].sort()
+        );
+    });
 });

```

Run: `bunx vitest run test/index.test.ts`. Expected: FAIL, cannot resolve `../src/sound`.

- [ ] **Step 2: Create** `src/sound/index.ts`:

```ts
export { FlapSound, type FlapSoundOptions } from './flap-sound.js';
export {
    DEFAULT_SYNTH_CLICK,
    renderClick,
    type SynthClickOptions,
} from './click.js';
export {
    panTable,
    type FlipPosition,
    type PanLookup,
    type SoundTarget,
} from './pan.js';
```

- [ ] **Step 3: Wire up the packaging** with these diffs:

`package.json`:
```diff
--- a/package.json
+++ b/package.json
@@ -43,6 +43,10 @@
             "types": "./dist/pixi/index.d.ts",
             "import": "./dist/pixi/index.js"
         },
+        "./sound": {
+            "types": "./dist/sound/index.d.ts",
+            "import": "./dist/sound/index.js"
+        },
         "./package.json": "./package.json"
     },
     "publishConfig": {

```

`scripts/build.ts`:
```diff
--- a/scripts/build.ts
+++ b/scripts/build.ts
@@ -10,6 +10,7 @@ const result = await Bun.build({
         './src/core/index.ts',
         './src/canvas/index.ts',
         './src/pixi/index.ts',
+        './src/sound/index.ts',
     ],
     root: './src',
     outdir: './dist',

```

`scripts/check-dist.ts`:
```diff
--- a/scripts/check-dist.ts
+++ b/scripts/check-dist.ts
@@ -26,6 +26,7 @@ try {
     const core = await import('../dist/core/index.js');
     const canvasEntry = await import('../dist/canvas/index.js');
     const pixi = await import('../dist/pixi/index.js');
+    const sound = await import('../dist/sound/index.js');
 
     const keys = Object.keys(core).sort();
     const expected = [...EXPECTED_CORE_EXPORTS].sort();
@@ -47,6 +48,11 @@ try {
         typeof pixi.PixiFlapView === 'function',
         'pixi entry does not export PixiFlapView as a function'
     );
+
+    check(
+        typeof sound.FlapSound === 'function',
+        'sound entry does not export FlapSound as a function'
+    );
 } catch (error) {
     failures.push(`failed to load dist: ${String(error)}`);
 }

```

`tsconfig.json`:
```diff
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -13,7 +13,8 @@
         "paths": {
             "@kinnet-studio/split-flaps": ["./src/core/index.ts"],
             "@kinnet-studio/split-flaps/canvas": ["./src/canvas/index.ts"],
-            "@kinnet-studio/split-flaps/pixi": ["./src/pixi/index.ts"]
+            "@kinnet-studio/split-flaps/pixi": ["./src/pixi/index.ts"],
+            "@kinnet-studio/split-flaps/sound": ["./src/sound/index.ts"]
         }
     },
     "include": ["src", "test", "examples"],

```

- [ ] **Step 4: Add the Sound toggle to the examples:**

`examples/vite.config.ts`:
```diff
--- a/examples/vite.config.ts
+++ b/examples/vite.config.ts
@@ -12,6 +12,10 @@ export default defineConfig({
                 find: /^@kinnet-studio\/split-flaps\/canvas$/,
                 replacement: fromHere('../src/canvas/index.ts'),
             },
+            {
+                find: /^@kinnet-studio\/split-flaps\/sound$/,
+                replacement: fromHere('../src/sound/index.ts'),
+            },
             {
                 find: /^@kinnet-studio\/split-flaps\/pixi$/,
                 replacement: fromHere('../src/pixi/index.ts'),

```

`examples/index.html`:
```diff
--- a/examples/index.html
+++ b/examples/index.html
@@ -60,6 +60,7 @@
                 <button id="play">Play playlist</button>
                 <button id="spin">Spin</button>
                 <button id="stop">Stop</button>
+                <button id="sound">Sound: off</button>
             </div>
             <div class="boards">
                 <canvas id="departures-canvas"></canvas>

```

`examples/main.ts`:
```diff
--- a/examples/main.ts
+++ b/examples/main.ts
@@ -14,6 +14,7 @@ import {
     textFace,
 } from '@kinnet-studio/split-flaps/canvas';
 import { PixiFlapView } from '@kinnet-studio/split-flaps/pixi';
+import { FlapSound } from '@kinnet-studio/split-flaps/sound';
 import { Application } from 'pixi.js';
 
 const chars = FlapSequence.chars(`${CHARSETS.alphanumeric}:`);
@@ -122,6 +123,19 @@ async function departures(): Promise<void> {
     onClick('play', () => board.play(messages, { hold: 4000 }));
     onClick('spin', () => board.spin());
     onClick('stop', () => board.stop());
+
+    // Sound starts muted; the first click unlocks audio (browsers require a
+    // user gesture) and toggles it on.
+    const sound = new FlapSound({ target: board, volume: 0.4 });
+    sound.muted = true;
+    const soundButton = document.getElementById('sound');
+    onClick('sound', () => {
+        sound.unlock().catch(error => console.error(error));
+        sound.muted = !sound.muted;
+        if (soundButton) {
+            soundButton.textContent = sound.muted ? 'Sound: off' : 'Sound: on';
+        }
+    });
 }
 
 function grid(): void {

```

- [ ] **Step 5: Document it in `README.md`:**

```diff
--- a/README.md
+++ b/README.md
@@ -151,6 +151,28 @@ shrinks by `count × step`, and layout and canvas size stay the same. The edges
 are the real earlier flaps on the drum, so colour faces show the previous
 colours.
 
+## Sound
+
+`/sound` plays a short click for every flap that lands, through the Web Audio
+API. It listens to the core, so it works with any renderer (or none):
+
+```ts
+import { FlapSound } from '@kinnet-studio/split-flaps/sound';
+
+const sound = new FlapSound({ target: board, volume: 0.5 });
+// Browsers only allow audio after a user gesture:
+addEventListener('pointerdown', () => sound.unlock(), { once: true });
+
+sound.muted = true; // or sound.volume = 0.2
+```
+
+The default click is synthesized (no audio files); pass `synth` to tune it, or
+`sample` (an `AudioBuffer` or a URL) to use your own recording. Each click gets
+a small random pitch and volume change (`variation`), overlapping clicks are
+capped at `maxVoices` (default 12), and board clicks are panned left to right
+by column (`pan`, 0..1 width). If a sample URL fails to load, `unlock()`
+rejects but the synth click keeps playing.
+
 ## Speed
 
 `flipDuration` (per unit, or per field via `unit: { flipDuration }`) sets how

```

- [ ] **Step 6: Verify everything.** Run each and check the result:

| Command | Expected |
| --- | --- |
| `bun run test` | 214 passing |
| `bun run typecheck` | exits 0 |
| `bun run format:check` | clean |
| `bun run build` | ends with `check-dist ok` |
| `ls dist/sound` | shows `index.js` and `index.d.ts` |
| `bunx vite build --config examples/vite.config.ts` | builds |
| `grep -c "pixi.js\|@ue-too/animate" dist/sound/index.js` | prints `0` |

- [ ] **Step 7: Commit** with the message `feat(sound): add the /sound entry point, examples toggle and docs`.

- [ ] **Step 8: Listening check (manual, for the user).** Run `bun run dev`, click **Sound: off**, and the button turns on. Then **Next message** should give a rippling stack of clicks, panned left to right.
