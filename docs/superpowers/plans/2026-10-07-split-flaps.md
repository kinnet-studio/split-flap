# @kinnet-studio/split-flaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@kinnet-studio/split-flaps`, a renderer-agnostic split-flap display engine (units → fields → boards, idle spin, playlist) with Canvas 2D and Pixi v8 renderers.

**Architecture:** The core (`src/core`) owns all time through `update(dt)` using a deterministic accumulator and exposes each unit's linear flip state `{ current, next, progress, direction }`. Pure, shared render helpers (`src/render`) turn that state into geometry (flip angle via `@ue-too/animate` keyframes, layout, cached faces). `src/canvas` and `src/pixi` are thin samplers that draw the state. One package, three entry points, bundled with `Bun.build` using code splitting so core classes are shared between entry points.

**Tech Stack:** Bun 1.3, TypeScript 5.9 (strict), Vitest 5, Vite 8 (examples app), pixi.js 8.20.1 (optional peer), @ue-too/animate ^0.19.0, Prettier 3.8.1.

**Spec:** `docs/superpowers/specs/2026-10-07-split-flaps-design.md`

## Global Constraints

- Working directory for every command: `/Users/vincent.yy.chang/dev/split-flop/main` (already a git repo on branch `main`).
- Package name `@kinnet-studio/split-flaps`, version `0.1.0`, license MIT, ESM only (`"type": "module"`).
- Entry points: `.` → core, `./canvas` → Canvas 2D renderer, `./pixi` → Pixi v8 renderer.
- `src/core/**` imports nothing outside `src/core` — no `@ue-too/animate`, no `pixi.js`, no DOM APIs.
- `@ue-too/animate` is imported only from `src/render/**`; `pixi.js` only from `src/pixi/**`.
- `pixi.js` is an optional peer dependency `^8.0.0` (dev dependency pinned to `8.20.1`).
- Use Bun for everything (`bun install`, `bun run …`, `bunx …`); never npm, yarn, or pnpm.
- TypeScript `strict` and `verbatimModuleSyntax`: type-only imports use `import type` or the inline `type` modifier.
- Prettier: 4-space indent, single quotes, trailing comma `es5`, `arrowParens: avoid`, `printWidth: 80`. Run `bunx prettier --write <files>` on touched files before each commit.
- Tests live in `test/`, mirroring `src/`, and run in Vitest's `node` environment (no jsdom). Canvas and Pixi interactions use the fakes in `test/helpers/fake-canvas.ts` (created in Task 9).
- All times are milliseconds. Renderers cap the frame `dt` they feed to `update()` at 250 ms (`MAX_FRAME_DT`).
- Commit after every task with a conventional-commit message whose last line is `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
| --- | --- |
| `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `.prettierrc`, `.prettierignore`, `.gitignore` | Tooling |
| `scripts/build.ts` | `Bun.build` for the three entry points |
| `src/core/sequence.ts` | `FlapSequence<T>` drum + `CHARSETS` |
| `src/core/plan-path.ts` | Pure `planPath()` |
| `src/core/emitter.ts` | Tiny typed event emitter (internal) |
| `src/core/unit.ts` | `FlapUnit<T>`: timing, targets, spin, events |
| `src/core/field.ts` | `FlapField<T, V>`, `defineField`, `textField`, `fieldStaggerDelays` |
| `src/core/board.ts` | `FlapBoard<S>`, schema typing, board stagger |
| `src/core/playlist.ts` | `Playlist` used by `FlapBoard.play` |
| `src/core/index.ts` | Core public exports |
| `src/render/style.ts` | `FlapStyle`, defaults, `resolveStyle` |
| `src/render/frame.ts` | `MAX_FRAME_DT` |
| `src/render/flip-geometry.ts` | Pure `flipGeometry(angle, direction)` |
| `src/render/flip-curve.ts` | `createFlipCurve` on `@ue-too/animate` keyframes |
| `src/render/layout.ts` | `layout(target, options)` → unit rects |
| `src/render/faces.ts` | `FacePainter`, `textFace`, `colorFace` |
| `src/render/face-cache.ts` | `FaceCache` of painted offscreen faces |
| `src/canvas/draw-unit.ts` | `drawUnit()` for one unit |
| `src/canvas/renderer.ts` | `CanvasFlapRenderer` |
| `src/canvas/index.ts` | Canvas entry exports (+ shared render exports) |
| `src/pixi/textures.ts` | `textureFace`, `FaceTextures` (half textures) |
| `src/pixi/unit-sprite.ts` | `UnitSprite` container for one unit |
| `src/pixi/view.ts` | `PixiFlapView` |
| `src/pixi/index.ts` | Pixi entry exports (+ shared render exports) |
| `test/helpers/fake-canvas.ts` | Recording fake 2D context and canvas |
| `examples/*` | Vite demo app (departures board, grid, colours) |
| `README.md` | Usage docs |

---

### Task 1: Package scaffold and FlapSequence

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.prettierrc`, `.prettierignore`, `.gitignore`
- Create: `src/core/sequence.ts`, `src/core/index.ts`
- Test: `test/core/sequence.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class FlapSequence<T>` with `constructor(flaps: readonly T[], options?: FlapSequenceOptions<T>)`, `static chars(charset: string): FlapSequence<string>`, `readonly length: number`, `at(index: number): T`, `indexOf(flap: T): number` (−1 if absent), `key(flap: T): string`.
  - `interface FlapSequenceOptions<T> { key?: (flap: T) => string }`
  - `const CHARSETS: { alphanumeric: ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; digits: ' 0123456789' }`

- [ ] **Step 1: Create the tooling files**

`package.json`:

```json
{
    "name": "@kinnet-studio/split-flaps",
    "version": "0.1.0",
    "description": "Renderer-agnostic split-flap display engine with Canvas 2D and Pixi renderers",
    "license": "MIT",
    "type": "module",
    "sideEffects": false,
    "files": ["dist"],
    "scripts": {
        "test": "vitest run",
        "test:watch": "vitest",
        "typecheck": "tsc -p tsconfig.json",
        "format": "prettier --write .",
        "format:check": "prettier --check ."
    },
    "dependencies": {
        "@ue-too/animate": "^0.19.0"
    },
    "peerDependencies": {
        "pixi.js": "^8.0.0"
    },
    "peerDependenciesMeta": {
        "pixi.js": {
            "optional": true
        }
    },
    "devDependencies": {
        "pixi.js": "8.20.1",
        "prettier": "3.8.1",
        "typescript": "^5.9.3",
        "vite": "^8.3.3",
        "vitest": "^5.0.3"
    }
}
```

`tsconfig.json`:

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "lib": ["ES2022", "DOM"],
        "strict": true,
        "noEmit": true,
        "skipLibCheck": true,
        "isolatedModules": true,
        "verbatimModuleSyntax": true,
        "types": []
    },
    "include": ["src", "test"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        environment: 'node',
    },
});
```

`.prettierrc`:

```json
{
    "arrowParens": "avoid",
    "printWidth": 80,
    "semi": true,
    "singleQuote": true,
    "tabWidth": 4,
    "trailingComma": "es5"
}
```

`.prettierignore`:

```
dist
node_modules
bun.lock
docs
examples/dist
```

`.gitignore`:

```
node_modules
dist
examples/dist
.DS_Store
```

- [ ] **Step 2: Install dependencies**

Run: `bun install`
Expected: creates `bun.lock` and `node_modules/`, exit code 0.

- [ ] **Step 3: Write the failing test**

`test/core/sequence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { CHARSETS, FlapSequence } from '../../src/core/sequence';

describe('FlapSequence', () => {
    it('stores flaps in order', () => {
        const seq = new FlapSequence(['a', 'b', 'c']);
        expect(seq.length).toBe(3);
        expect(seq.at(0)).toBe('a');
        expect(seq.at(2)).toBe('c');
    });

    it('finds flaps by key', () => {
        const seq = new FlapSequence(['a', 'b', 'c']);
        expect(seq.indexOf('b')).toBe(1);
        expect(seq.indexOf('z')).toBe(-1);
    });

    it('uses a custom key for object flaps', () => {
        const red = { id: 'red' };
        const blue = { id: 'blue' };
        const seq = new FlapSequence([red, blue], { key: c => c.id });
        expect(seq.indexOf({ id: 'blue' })).toBe(1);
        expect(seq.key(red)).toBe('red');
    });

    it('throws on an empty list', () => {
        expect(() => new FlapSequence([])).toThrow(RangeError);
    });

    it('throws on duplicate keys and hints at the key option', () => {
        expect(() => new FlapSequence(['x', 'x'])).toThrow(/duplicate/);
        expect(() => new FlapSequence([{ a: 1 }, { a: 2 }])).toThrow(/`key`/);
    });

    it('throws on an out-of-range index', () => {
        const seq = new FlapSequence(['a']);
        expect(() => seq.at(1)).toThrow(RangeError);
        expect(() => seq.at(-1)).toThrow(RangeError);
    });

    it('splits charsets with Array.from so CJK and emoji stay whole', () => {
        const seq = FlapSequence.chars(' 東京🚄');
        expect(seq.length).toBe(4);
        expect(seq.at(3)).toBe('🚄');
    });

    it('ships charsets that start with a blank pad flap', () => {
        const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
        expect(alnum.at(0)).toBe(' ');
        expect(alnum.length).toBe(37);
        expect(FlapSequence.chars(CHARSETS.digits).length).toBe(11);
    });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `bunx vitest run test/core/sequence.test.ts`
Expected: FAIL — cannot resolve `../../src/core/sequence`.

- [ ] **Step 5: Implement FlapSequence**

`src/core/sequence.ts`:

```ts
/** Options for {@link FlapSequence}. */
export interface FlapSequenceOptions<T> {
    /**
     * Maps a flap to a unique string key. Defaults to `String(flap)`.
     * Object flaps must provide this.
     */
    key?: (flap: T) => string;
}

/** Common character sets. Each starts with a blank so index 0 is the pad flap. */
export const CHARSETS = {
    alphanumeric: ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    digits: ' 0123456789',
} as const;

/** The ordered flaps on one drum. */
export class FlapSequence<T> {
    readonly length: number;
    private readonly flaps: readonly T[];
    private readonly keyOf: (flap: T) => string;
    private readonly indexByKey = new Map<string, number>();

    constructor(flaps: readonly T[], options: FlapSequenceOptions<T> = {}) {
        if (flaps.length === 0) {
            throw new RangeError('FlapSequence: flaps must not be empty');
        }
        this.flaps = [...flaps];
        this.keyOf = options.key ?? (flap => String(flap));
        this.flaps.forEach((flap, index) => {
            const key = this.keyOf(flap);
            if (this.indexByKey.has(key)) {
                throw new Error(
                    `FlapSequence: duplicate flap key "${key}" at index ${index}. Object flaps need a \`key\` option.`
                );
            }
            this.indexByKey.set(key, index);
        });
        this.length = this.flaps.length;
    }

    /** Builds a sequence of single characters (CJK and emoji safe). */
    static chars(charset: string): FlapSequence<string> {
        return new FlapSequence(Array.from(charset));
    }

    at(index: number): T {
        if (!Number.isInteger(index) || index < 0 || index >= this.length) {
            throw new RangeError(
                `FlapSequence: index ${index} is out of range (0..${this.length - 1})`
            );
        }
        return this.flaps[index];
    }

    /** Index of the flap with the same key, or -1. */
    indexOf(flap: T): number {
        return this.indexByKey.get(this.keyOf(flap)) ?? -1;
    }

    key(flap: T): string {
        return this.keyOf(flap);
    }
}
```

`src/core/index.ts`:

```ts
export { CHARSETS, FlapSequence, type FlapSequenceOptions } from './sequence';
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `bunx vitest run test/core/sequence.test.ts && bun run typecheck`
Expected: 8 tests PASS; `tsc` exits 0 with no output.

- [ ] **Step 7: Commit**

```bash
bunx prettier --write package.json tsconfig.json vitest.config.ts .prettierrc src test
git add -A
git commit -m "feat(core): scaffold package and add FlapSequence

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: planPath

**Files:**
- Create: `src/core/plan-path.ts`
- Modify: `src/core/index.ts`
- Test: `test/core/plan-path.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Cycle = 'all' | 'direct'`; `type Direction = 'forward' | 'shortest'`
  - `interface PlanOptions { cycle: Cycle; direction: Direction }`
  - `interface PlannedPath { steps: number[]; direction: 1 | -1 }`
  - `function planPath(length: number, from: number, to: number, options: PlanOptions): PlannedPath` — throws `RangeError` for `length < 1` or indices out of range.

- [ ] **Step 1: Write the failing test**

`test/core/plan-path.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { planPath } from '../../src/core/plan-path';

const forwardAll = { cycle: 'all', direction: 'forward' } as const;
const shortestAll = { cycle: 'all', direction: 'shortest' } as const;

describe('planPath', () => {
    it('returns no steps when already at the target', () => {
        expect(planPath(5, 2, 2, forwardAll)).toEqual({
            steps: [],
            direction: 1,
        });
    });

    it('steps forward through every flap', () => {
        expect(planPath(5, 1, 3, forwardAll)).toEqual({
            steps: [2, 3],
            direction: 1,
        });
    });

    it('wraps around going forward', () => {
        expect(planPath(5, 3, 1, forwardAll)).toEqual({
            steps: [4, 0, 1],
            direction: 1,
        });
    });

    it('goes backward when that is shorter', () => {
        expect(planPath(5, 3, 1, shortestAll)).toEqual({
            steps: [2, 1],
            direction: -1,
        });
    });

    it('wraps around going backward', () => {
        expect(planPath(6, 1, 5, shortestAll)).toEqual({
            steps: [0, 5],
            direction: -1,
        });
    });

    it('prefers forward on a tie', () => {
        expect(planPath(4, 0, 2, shortestAll)).toEqual({
            steps: [1, 2],
            direction: 1,
        });
    });

    it('flips once in direct mode', () => {
        expect(
            planPath(5, 0, 3, { cycle: 'direct', direction: 'forward' })
        ).toEqual({ steps: [3], direction: 1 });
    });

    it('keeps the shortest direction in direct mode', () => {
        expect(
            planPath(5, 0, 4, { cycle: 'direct', direction: 'shortest' })
        ).toEqual({ steps: [4], direction: -1 });
    });

    it('rejects invalid lengths and indices', () => {
        expect(() => planPath(0, 0, 0, forwardAll)).toThrow(RangeError);
        expect(() => planPath(5, 5, 0, forwardAll)).toThrow(RangeError);
        expect(() => planPath(5, 0, -1, forwardAll)).toThrow(RangeError);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run test/core/plan-path.test.ts`
Expected: FAIL — cannot resolve `../../src/core/plan-path`.

- [ ] **Step 3: Implement planPath**

`src/core/plan-path.ts`:

```ts
/** `all` shows every flap in between; `direct` flips once straight to the target. */
export type Cycle = 'all' | 'direct';

/** `forward` only travels +1 with wrap-around; `shortest` may travel backward. */
export type Direction = 'forward' | 'shortest';

export interface PlanOptions {
    cycle: Cycle;
    direction: Direction;
}

export interface PlannedPath {
    /** Indices to show in order, ending at the target. Excludes the start. */
    steps: number[];
    direction: 1 | -1;
}

/** Computes which flap indices a unit shows on its way from `from` to `to`. */
export function planPath(
    length: number,
    from: number,
    to: number,
    options: PlanOptions
): PlannedPath {
    if (!Number.isInteger(length) || length < 1) {
        throw new RangeError(
            `planPath: length must be an integer >= 1, got ${length}`
        );
    }
    for (const [name, value] of [
        ['from', from],
        ['to', to],
    ] as const) {
        if (!Number.isInteger(value) || value < 0 || value >= length) {
            throw new RangeError(
                `planPath: ${name} ${value} is out of range (0..${length - 1})`
            );
        }
    }
    if (from === to) {
        return { steps: [], direction: 1 };
    }
    const forward = (to - from + length) % length;
    const backward = length - forward;
    const direction: 1 | -1 =
        options.direction === 'shortest' && backward < forward ? -1 : 1;
    if (options.cycle === 'direct') {
        return { steps: [to], direction };
    }
    const distance = direction === 1 ? forward : backward;
    const steps: number[] = [];
    for (let i = 1; i <= distance; i++) {
        steps.push((((from + direction * i) % length) + length) % length);
    }
    return { steps, direction };
}
```

Append to `src/core/index.ts`:

```ts
export {
    planPath,
    type Cycle,
    type Direction,
    type PlannedPath,
    type PlanOptions,
} from './plan-path';
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `bunx vitest run test/core && bun run typecheck`
Expected: all tests PASS; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
bunx prettier --write src test
git add -A
git commit -m "feat(core): add planPath

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Emitter and FlapUnit

**Files:**
- Create: `src/core/emitter.ts`, `src/core/unit.ts`
- Modify: `src/core/index.ts`
- Test: `test/core/emitter.test.ts`, `test/core/unit.test.ts`

**Interfaces:**
- Consumes: `FlapSequence<T>` (Task 1); `planPath`, `Cycle`, `Direction` (Task 2).
- Produces:
  - `class Emitter<Events extends object>` with `on<K>(event: K, listener: (payload: Events[K]) => void): () => void` and `emit<K>(event: K, payload: Events[K]): void`. Internal; not exported from the package.
  - `const DEFAULT_FLIP_DURATION = 80`
  - `interface UnitOptions<T> { flipDuration?: number; cycle?: Cycle; direction?: Direction; unknownFlap?: 'pad' | 'throw'; pad?: T }`
  - `interface FlapUnitOptions<T> extends UnitOptions<T> { sequence: FlapSequence<T>; initial?: T }`
  - `interface UnitState<T> { current: T; next: T | null; progress: number; direction: 1 | -1 }`
  - `interface FlipEvent<T> { from: T; to: T; direction: 1 | -1 }`
  - `interface UnitEvents<T> { flipstart: FlipEvent<T>; flipend: FlipEvent<T>; settled: { flap: T } }`
  - `class FlapUnit<T>`: `readonly sequence`, `state`, `target: T | null`, `isSettled`, `on()`, `setTarget(flap, { delay? })`, `spin()`, `stop()`, `snapTo(flap)`, `update(dt)`.

- [ ] **Step 1: Write the failing emitter test**

`test/core/emitter.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { Emitter } from '../../src/core/emitter';

describe('Emitter', () => {
    it('calls listeners with the payload in subscription order', () => {
        const emitter = new Emitter<{ ping: number }>();
        const calls: string[] = [];
        emitter.on('ping', n => calls.push(`a${n}`));
        emitter.on('ping', n => calls.push(`b${n}`));
        emitter.emit('ping', 1);
        expect(calls).toEqual(['a1', 'b1']);
    });

    it('stops calling a listener after it unsubscribes', () => {
        const emitter = new Emitter<{ ping: number }>();
        const listener = vi.fn();
        const off = emitter.on('ping', listener);
        off();
        emitter.emit('ping', 1);
        expect(listener).not.toHaveBeenCalled();
    });

    it('ignores events nobody listens to', () => {
        const emitter = new Emitter<{ ping: number }>();
        expect(() => emitter.emit('ping', 1)).not.toThrow();
    });
});
```

- [ ] **Step 2: Write the failing unit test**

`test/core/unit.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit, type FlapUnitOptions } from '../../src/core/unit';

// Index: '-'=0, A=1, B=2, C=3, D=4, E=5
const seq = FlapSequence.chars('-ABCDE');

function makeUnit(options: Partial<FlapUnitOptions<string>> = {}) {
    return new FlapUnit<string>({
        sequence: seq,
        flipDuration: 100,
        ...options,
    });
}

function record(unit: FlapUnit<string>): string[] {
    const log: string[] = [];
    unit.on('flipstart', e => log.push(`start ${e.from}>${e.to}`));
    unit.on('flipend', e => log.push(`end ${e.from}>${e.to}`));
    unit.on('settled', e => log.push(`settled ${e.flap}`));
    return log;
}

describe('FlapUnit', () => {
    it('starts settled on the first flap', () => {
        const unit = makeUnit();
        expect(unit.state).toEqual({
            current: '-',
            next: null,
            progress: 0,
            direction: 1,
        });
        expect(unit.isSettled).toBe(true);
        expect(unit.target).toBe('-');
    });

    it('starts on the initial flap', () => {
        expect(makeUnit({ initial: 'C' }).state.current).toBe('C');
    });

    it('validates its options', () => {
        expect(() => makeUnit({ flipDuration: 0 })).toThrow(RangeError);
        expect(() => makeUnit({ flipDuration: NaN })).toThrow(RangeError);
        expect(() => makeUnit({ initial: 'Z' })).toThrow(RangeError);
        expect(() => makeUnit({ pad: 'Z' })).toThrow(RangeError);
    });

    it('flips through every intermediate flap', () => {
        const unit = makeUnit();
        const log = record(unit);
        unit.setTarget('B');
        expect(unit.isSettled).toBe(false);
        expect(unit.target).toBe('B');

        unit.update(50);
        expect(unit.state).toEqual({
            current: '-',
            next: 'A',
            progress: 0.5,
            direction: 1,
        });

        unit.update(50);
        expect(unit.state).toEqual({
            current: 'A',
            next: 'B',
            progress: 0,
            direction: 1,
        });

        unit.update(100);
        expect(unit.state).toEqual({
            current: 'B',
            next: null,
            progress: 0,
            direction: 1,
        });
        expect(unit.isSettled).toBe(true);
        expect(log).toEqual([
            'start ->A',
            'end ->A',
            'start A>B',
            'end A>B',
            'settled B',
        ]);
    });

    it('carries overshoot into the next flip', () => {
        const unit = makeUnit();
        unit.setTarget('C');
        unit.update(250);
        expect(unit.state).toEqual({
            current: 'B',
            next: 'C',
            progress: 0.5,
            direction: 1,
        });
    });

    it('completes several flips in one large dt', () => {
        const unit = makeUnit();
        const log = record(unit);
        unit.setTarget('E');
        unit.update(10_000);
        expect(unit.state.current).toBe('E');
        expect(unit.isSettled).toBe(true);
        expect(log.filter(l => l.startsWith('end'))).toHaveLength(5);
        expect(log.at(-1)).toBe('settled E');
    });

    it('ignores non-positive and non-finite dt', () => {
        const unit = makeUnit();
        unit.setTarget('A');
        unit.update(0);
        unit.update(-5);
        unit.update(NaN);
        unit.update(Infinity);
        expect(unit.state).toEqual({
            current: '-',
            next: null,
            progress: 0,
            direction: 1,
        });
    });

    it('wraps around going forward', () => {
        const unit = makeUnit({ initial: 'D' });
        const log = record(unit);
        unit.setTarget('A');
        unit.update(1000);
        expect(log.filter(l => l.startsWith('end'))).toEqual([
            'end D>E',
            'end E>-',
            'end ->A',
        ]);
    });

    it('takes the shortest way, backward when shorter', () => {
        const unit = makeUnit({ initial: 'A', direction: 'shortest' });
        const log = record(unit);
        unit.setTarget('E');
        unit.update(50);
        expect(unit.state).toEqual({
            current: 'A',
            next: '-',
            progress: 0.5,
            direction: -1,
        });
        unit.update(150);
        expect(log).toEqual([
            'start A>-',
            'end A>-',
            'start ->E',
            'end ->E',
            'settled E',
        ]);
    });

    it('flips once in direct mode', () => {
        const unit = makeUnit({ cycle: 'direct' });
        const log = record(unit);
        unit.setTarget('D');
        unit.update(100);
        expect(log).toEqual(['start ->D', 'end ->D', 'settled D']);
    });

    it('finishes the current flip before following a new target', () => {
        const unit = makeUnit({ direction: 'shortest' });
        const log = record(unit);
        unit.setTarget('C');
        unit.update(50);
        unit.setTarget('-');
        expect(unit.state).toEqual({
            current: '-',
            next: 'A',
            progress: 0.5,
            direction: 1,
        });
        unit.update(50);
        unit.update(100);
        expect(log).toEqual([
            'start ->A',
            'end ->A',
            'start A>-',
            'end A>-',
            'settled -',
        ]);
    });

    it('settles after the current flip when retargeted to its landing flap', () => {
        const unit = makeUnit();
        const log = record(unit);
        unit.setTarget('B');
        unit.update(50);
        unit.setTarget('A');
        unit.update(50);
        expect(unit.state.current).toBe('A');
        expect(log).toEqual(['start ->A', 'end ->A', 'settled A']);
    });

    it('waits for the delay before flipping', () => {
        const unit = makeUnit();
        unit.setTarget('A', { delay: 30 });
        unit.update(20);
        expect(unit.state.next).toBeNull();
        unit.update(20);
        expect(unit.state).toEqual({
            current: '-',
            next: 'A',
            progress: 0.1,
            direction: 1,
        });
    });

    it('starts a delay set mid-flip after that flip lands', () => {
        const unit = makeUnit();
        unit.setTarget('A');
        unit.update(50);
        unit.setTarget('B', { delay: 40 });
        unit.update(50);
        expect(unit.state).toEqual({
            current: 'A',
            next: null,
            progress: 0,
            direction: 1,
        });
        unit.update(40);
        expect(unit.state.next).toBe('B');
        expect(unit.state.progress).toBe(0);
    });

    it('treats a target equal to the settled flap as a no-op', () => {
        const unit = makeUnit();
        const log = record(unit);
        unit.setTarget('-');
        unit.update(100);
        expect(log).toEqual([]);
        expect(unit.isSettled).toBe(true);
    });

    it('pads unknown targets by default', () => {
        const unit = makeUnit({ initial: 'B' });
        unit.setTarget('Z');
        expect(unit.target).toBe('-');
        unit.update(1000);
        expect(unit.state.current).toBe('-');
    });

    it('pads with a custom pad flap', () => {
        const unit = makeUnit({ pad: 'E' });
        unit.setTarget('Z');
        expect(unit.target).toBe('E');
    });

    it('throws on unknown targets when asked to', () => {
        const unit = makeUnit({ unknownFlap: 'throw' });
        expect(() => unit.setTarget('Z')).toThrow(/not in the sequence/);
    });

    it('spins until stopped, then settles where the flip lands', () => {
        const unit = makeUnit();
        const log = record(unit);
        unit.spin();
        expect(unit.target).toBeNull();
        expect(unit.isSettled).toBe(false);
        unit.update(250);
        expect(unit.state).toEqual({
            current: 'B',
            next: 'C',
            progress: 0.5,
            direction: 1,
        });
        unit.stop();
        expect(unit.target).toBe('C');
        unit.update(50);
        expect(unit.isSettled).toBe(true);
        unit.update(500);
        expect(unit.state.current).toBe('C');
        expect(log.at(-1)).toBe('settled C');
    });

    it('spins forward regardless of cycle and direction', () => {
        const unit = makeUnit({ cycle: 'direct', direction: 'shortest' });
        unit.spin();
        unit.update(150);
        expect(unit.state).toEqual({
            current: 'A',
            next: 'B',
            progress: 0.5,
            direction: 1,
        });
    });

    it('ends a spin when given a target', () => {
        const unit = makeUnit();
        unit.spin();
        unit.update(150);
        unit.setTarget('B');
        unit.update(50);
        expect(unit.state.current).toBe('B');
        expect(unit.isSettled).toBe(true);
    });

    it('snaps instantly without events', () => {
        const unit = makeUnit();
        const log = record(unit);
        unit.setTarget('C');
        unit.update(150);
        unit.snapTo('E');
        expect(unit.state).toEqual({
            current: 'E',
            next: null,
            progress: 0,
            direction: 1,
        });
        expect(unit.isSettled).toBe(true);
        expect(unit.target).toBe('E');
        unit.update(100);
        expect(log.filter(l => l.startsWith('settled'))).toEqual([]);
    });

    it('stops calling unsubscribed listeners', () => {
        const unit = makeUnit();
        const listener = vi.fn();
        const off = unit.on('flipend', listener);
        off();
        unit.setTarget('A');
        unit.update(100);
        expect(listener).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bunx vitest run test/core/emitter.test.ts test/core/unit.test.ts`
Expected: FAIL — cannot resolve `../../src/core/emitter` and `../../src/core/unit`.

- [ ] **Step 4: Implement the emitter**

`src/core/emitter.ts`:

```ts
export type Listener<P> = (payload: P) => void;

/** Minimal typed event emitter. Listeners run synchronously in subscription order. */
export class Emitter<Events extends object> {
    private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

    on<K extends keyof Events>(
        event: K,
        listener: Listener<Events[K]>
    ): () => void {
        const existing = this.listeners.get(event);
        const set = existing ?? new Set<Listener<never>>();
        if (!existing) {
            this.listeners.set(event, set);
        }
        set.add(listener as Listener<never>);
        return () => {
            set.delete(listener as Listener<never>);
        };
    }

    emit<K extends keyof Events>(event: K, payload: Events[K]): void {
        const set = this.listeners.get(event);
        if (!set) {
            return;
        }
        for (const listener of [...set]) {
            (listener as Listener<Events[K]>)(payload);
        }
    }
}
```

- [ ] **Step 5: Implement FlapUnit**

`src/core/unit.ts`:

```ts
import { Emitter } from './emitter';
import { type Cycle, type Direction, planPath } from './plan-path';
import type { FlapSequence } from './sequence';

export const DEFAULT_FLIP_DURATION = 80;

export interface UnitOptions<T> {
    /** Milliseconds per flip. Default 80. Must be > 0. */
    flipDuration?: number;
    /** Default `'all'`. */
    cycle?: Cycle;
    /** Default `'forward'`. */
    direction?: Direction;
    /** What to do with a target that is not in the sequence. Default `'pad'`. */
    unknownFlap?: 'pad' | 'throw';
    /** Flap substituted for unknown targets. Default `sequence.at(0)`. */
    pad?: T;
}

export interface FlapUnitOptions<T> extends UnitOptions<T> {
    sequence: FlapSequence<T>;
    /** Starting flap. Default `sequence.at(0)`. */
    initial?: T;
}

export interface UnitState<T> {
    current: T;
    /** Flap being revealed, or `null` when not flipping. */
    next: T | null;
    /** Linear 0..1 progress of the current flip; 0 when not flipping. */
    progress: number;
    direction: 1 | -1;
}

export interface FlipEvent<T> {
    from: T;
    to: T;
    direction: 1 | -1;
}

export interface UnitEvents<T> {
    flipstart: FlipEvent<T>;
    flipend: FlipEvent<T>;
    settled: { flap: T };
}

interface ActiveFlip {
    to: number;
    direction: 1 | -1;
    elapsed: number;
}

/** One split-flap drum. All time advances through {@link FlapUnit.update}. */
export class FlapUnit<T> {
    readonly sequence: FlapSequence<T>;
    private readonly flipDuration: number;
    private readonly cycle: Cycle;
    private readonly direction: Direction;
    private readonly unknownFlap: 'pad' | 'throw';
    private readonly padIndex: number;
    private readonly emitter = new Emitter<UnitEvents<T>>();
    private currentIndex: number;
    private flip: ActiveFlip | null = null;
    private queue: number[] = [];
    private queueDirection: 1 | -1 = 1;
    private delay = 0;
    private spinning = false;
    private targetIndex: number | null;
    private wasSettled = true;

    constructor(options: FlapUnitOptions<T>) {
        const flipDuration = options.flipDuration ?? DEFAULT_FLIP_DURATION;
        if (!(flipDuration > 0) || !Number.isFinite(flipDuration)) {
            throw new RangeError(
                `FlapUnit: flipDuration must be a positive number, got ${flipDuration}`
            );
        }
        this.sequence = options.sequence;
        this.flipDuration = flipDuration;
        this.cycle = options.cycle ?? 'all';
        this.direction = options.direction ?? 'forward';
        this.unknownFlap = options.unknownFlap ?? 'pad';
        this.padIndex =
            options.pad === undefined
                ? 0
                : this.requireIndex(options.pad, 'pad');
        this.currentIndex =
            options.initial === undefined
                ? 0
                : this.requireIndex(options.initial, 'initial');
        this.targetIndex = this.currentIndex;
    }

    get state(): UnitState<T> {
        const current = this.sequence.at(this.currentIndex);
        if (this.flip === null) {
            return { current, next: null, progress: 0, direction: 1 };
        }
        return {
            current,
            next: this.sequence.at(this.flip.to),
            progress: this.flip.elapsed / this.flipDuration,
            direction: this.flip.direction,
        };
    }

    /** Where the unit is heading or last settled; `null` while spinning. */
    get target(): T | null {
        return this.targetIndex === null
            ? null
            : this.sequence.at(this.targetIndex);
    }

    get isSettled(): boolean {
        return (
            this.flip === null && this.queue.length === 0 && !this.spinning
        );
    }

    on<K extends keyof UnitEvents<T>>(
        event: K,
        listener: (payload: UnitEvents<T>[K]) => void
    ): () => void {
        return this.emitter.on(event, listener);
    }

    /**
     * Heads for `flap`. A flip in progress always completes first; the path
     * is planned from the flap it lands on. `delay` (ms) is waited before the
     * first new flip starts.
     */
    setTarget(flap: T, options: { delay?: number } = {}): void {
        const to = this.resolve(flap);
        const from = this.flip === null ? this.currentIndex : this.flip.to;
        const path = planPath(this.sequence.length, from, to, {
            cycle: this.cycle,
            direction: this.direction,
        });
        const delay = options.delay ?? 0;
        this.spinning = false;
        this.targetIndex = to;
        this.queue = path.steps;
        this.queueDirection = path.direction;
        this.delay = Number.isFinite(delay) && delay > 0 ? delay : 0;
        this.markUnsettled();
    }

    /** Flips forward continuously until {@link setTarget} or {@link stop}. */
    spin(): void {
        this.spinning = true;
        this.queue = [];
        this.delay = 0;
        this.targetIndex = null;
        this.markUnsettled();
    }

    /** Finishes the flip in progress, then holds. */
    stop(): void {
        this.spinning = false;
        this.queue = [];
        this.delay = 0;
        this.targetIndex =
            this.flip === null ? this.currentIndex : this.flip.to;
    }

    /** Shows `flap` immediately, with no animation and no events. */
    snapTo(flap: T): void {
        const index = this.resolve(flap);
        this.currentIndex = index;
        this.flip = null;
        this.queue = [];
        this.delay = 0;
        this.spinning = false;
        this.targetIndex = index;
        this.wasSettled = true;
    }

    /** Advances time by `dt` ms. Overshoot carries into the next flip. */
    update(dt: number): void {
        if (!(dt > 0) || !Number.isFinite(dt)) {
            return;
        }
        let remaining = dt;
        for (;;) {
            let flip = this.flip;
            if (flip === null) {
                if (this.queue.length === 0 && !this.spinning) {
                    break;
                }
                if (this.delay > 0) {
                    const used = Math.min(this.delay, remaining);
                    this.delay -= used;
                    remaining -= used;
                    if (this.delay > 0) {
                        break;
                    }
                }
                flip = this.startFlip();
            }
            const needed = this.flipDuration - flip.elapsed;
            if (remaining < needed) {
                flip.elapsed += remaining;
                break;
            }
            remaining -= needed;
            this.land(flip);
        }
        if (this.isSettled && !this.wasSettled) {
            this.wasSettled = true;
            this.emitter.emit('settled', {
                flap: this.sequence.at(this.currentIndex),
            });
        }
    }

    private startFlip(): ActiveFlip {
        const queued = this.queue.shift();
        const to =
            queued ?? (this.currentIndex + 1) % this.sequence.length;
        const direction: 1 | -1 =
            queued === undefined ? 1 : this.queueDirection;
        const flip: ActiveFlip = { to, direction, elapsed: 0 };
        this.flip = flip;
        this.emitter.emit('flipstart', {
            from: this.sequence.at(this.currentIndex),
            to: this.sequence.at(to),
            direction,
        });
        return flip;
    }

    private land(flip: ActiveFlip): void {
        const from = this.currentIndex;
        this.currentIndex = flip.to;
        this.flip = null;
        this.emitter.emit('flipend', {
            from: this.sequence.at(from),
            to: this.sequence.at(flip.to),
            direction: flip.direction,
        });
    }

    private markUnsettled(): void {
        if (!this.isSettled) {
            this.wasSettled = false;
        }
    }

    private resolve(flap: T): number {
        const index = this.sequence.indexOf(flap);
        if (index !== -1) {
            return index;
        }
        if (this.unknownFlap === 'throw') {
            throw new RangeError(
                `FlapUnit: flap "${this.sequence.key(flap)}" is not in the sequence`
            );
        }
        return this.padIndex;
    }

    private requireIndex(flap: T, label: string): number {
        const index = this.sequence.indexOf(flap);
        if (index === -1) {
            throw new RangeError(
                `FlapUnit: ${label} flap "${this.sequence.key(flap)}" is not in the sequence`
            );
        }
        return index;
    }
}
```

Append to `src/core/index.ts`:

```ts
export {
    DEFAULT_FLIP_DURATION,
    FlapUnit,
    type FlapUnitOptions,
    type FlipEvent,
    type UnitEvents,
    type UnitOptions,
    type UnitState,
} from './unit';
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `bunx vitest run test/core && bun run typecheck`
Expected: all tests PASS (emitter 3, unit 23, plus earlier tasks); `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
bunx prettier --write src test
git add -A
git commit -m "feat(core): add FlapUnit with deterministic flip timing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: FlapField

**Files:**
- Create: `src/core/field.ts`
- Modify: `src/core/index.ts`
- Test: `test/core/field.test.ts`

**Interfaces:**
- Consumes: `FlapSequence<T>`, `FlapUnit<T>`, `UnitOptions<T>`, `FlipEvent<T>`, `Emitter`.
- Produces:
  - `interface FieldStagger { order: 'sequential' | 'reverse' | 'random' | 'none'; step: number; random?: () => number }`
  - `interface FieldSpec<T, V> { sequence; length; toFlaps?; align?; overflow?; pad?; cells?; stagger?; unit?: Omit<UnitOptions<T>, 'pad'> }`
  - `interface FieldSetOptions { delays?: readonly number[] }`
  - `interface FieldEvents<T> { flipend: FlipEvent<T> & { unit: number }; settled: Record<string, never> }`
  - `function defineField<T, V = T | T[]>(spec: FieldSpec<T, V>): FieldSpec<T, V>`
  - `function textField(spec: Omit<FieldSpec<string, string>, 'toFlaps'>): FieldSpec<string, string>`
  - `function fieldStaggerDelays(stagger: FieldStagger | undefined, count: number): number[]`
  - `class FlapField<T, V = T | T[]>` with `readonly spec`, `sequence`, `length`, `cells`, `units: readonly FlapUnit<T>[]`, `isSettled`, `on()`, `set(value, opts?)`, `clear(opts?)`, `snap(value)`, `spin()`, `stop()`, `update(dt)`, `staggerDelays()`.

- [ ] **Step 1: Write the failing test**

`test/core/field.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
    defineField,
    fieldStaggerDelays,
    FlapField,
    textField,
} from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const cities = new FlapSequence(['', 'TOKYO', 'OSAKA']);
const fast = { flipDuration: 10 };

function shown<V>(field: FlapField<string, V>): string {
    return field.units.map(unit => unit.state.current).join('');
}

function text(length: number, extra: Partial<Parameters<typeof textField>[0]> = {}) {
    return new FlapField(
        textField({ sequence: alnum, length, unit: fast, ...extra })
    );
}

describe('FlapField', () => {
    it('starts with every unit on the pad flap', () => {
        expect(shown(text(3))).toBe('   ');
    });

    it('splits text across units, left-aligned and padded', () => {
        const field = text(3);
        field.set('AB');
        field.update(10_000);
        expect(shown(field)).toBe('AB ');
        expect(field.isSettled).toBe(true);
    });

    it('aligns right', () => {
        const field = text(4, { align: 'right' });
        field.set('AB');
        field.update(10_000);
        expect(shown(field)).toBe('  AB');
    });

    it('aligns center with the extra space on the right', () => {
        const field = text(5, { align: 'center' });
        field.set('AB');
        field.update(10_000);
        expect(shown(field)).toBe(' AB  ');
    });

    it('truncates overflow by default', () => {
        const field = text(2);
        field.set('ABC');
        field.update(10_000);
        expect(shown(field)).toBe('AB');
    });

    it('throws on overflow when asked to', () => {
        const field = text(2, { overflow: 'throw' });
        expect(() => field.set('ABC')).toThrow(RangeError);
    });

    it('pads with a custom pad flap', () => {
        const field = text(3, { pad: 'X' });
        expect(shown(field)).toBe('XXX');
        field.set('A');
        field.update(10_000);
        expect(shown(field)).toBe('AXX');
    });

    it('accepts a single flap or a flap array by default', () => {
        const single = new FlapField(
            defineField({ sequence: cities, length: 1, unit: fast })
        );
        single.set('OSAKA');
        single.update(10_000);
        expect(single.units[0].state.current).toBe('OSAKA');

        const pair = new FlapField(
            defineField({ sequence: cities, length: 2, unit: fast })
        );
        pair.set(['TOKYO', 'OSAKA']);
        pair.update(10_000);
        expect(pair.units.map(u => u.state.current)).toEqual([
            'TOKYO',
            'OSAKA',
        ]);
    });

    it('clears back to the pad flap', () => {
        const field = text(3);
        field.set('AB');
        field.update(10_000);
        field.clear();
        field.update(10_000);
        expect(shown(field)).toBe('   ');
    });

    it('snaps instantly', () => {
        const field = text(3);
        field.snap('AB');
        expect(shown(field)).toBe('AB ');
        expect(field.isSettled).toBe(true);
    });

    it('staggers unit start times', () => {
        const field = text(3, { stagger: { order: 'sequential', step: 50 } });
        field.set('AAA');
        field.update(10);
        expect(shown(field)).toBe('A  ');
    });

    it('lets explicit delays override the stagger', () => {
        const field = text(3, { stagger: { order: 'sequential', step: 50 } });
        field.set('AAA', { delays: [0, 0, 0] });
        field.update(10);
        expect(shown(field)).toBe('AAA');
    });

    it('emits flipend with the unit index and settled once', () => {
        const field = text(2);
        const flips: unknown[] = [];
        let settled = 0;
        field.on('flipend', event => flips.push(event));
        field.on('settled', () => settled++);
        field.set('A');
        field.update(10);
        field.update(10);
        expect(flips).toEqual([{ from: ' ', to: 'A', direction: 1, unit: 0 }]);
        expect(settled).toBe(1);
    });

    it('spins and stops', () => {
        const field = text(2);
        field.spin();
        field.update(25);
        expect(field.isSettled).toBe(false);
        field.stop();
        field.update(100);
        expect(field.isSettled).toBe(true);
    });

    it('validates its length', () => {
        expect(() => text(0)).toThrow(RangeError);
        expect(() => text(1.5)).toThrow(RangeError);
    });

    it('exposes its sequence, length and cells', () => {
        const field = new FlapField(
            defineField({ sequence: cities, length: 1, cells: 6 })
        );
        expect(field.sequence).toBe(cities);
        expect(field.length).toBe(1);
        expect(field.cells).toBe(6);
        expect(text(2).cells).toBe(1);
    });
});

describe('fieldStaggerDelays', () => {
    it('computes delays for each order', () => {
        expect(fieldStaggerDelays({ order: 'sequential', step: 50 }, 3)).toEqual(
            [0, 50, 100]
        );
        expect(fieldStaggerDelays({ order: 'reverse', step: 50 }, 3)).toEqual([
            100, 50, 0,
        ]);
        expect(
            fieldStaggerDelays(
                { order: 'random', step: 50, random: () => 0.5 },
                3
            )
        ).toEqual([50, 50, 50]);
        expect(fieldStaggerDelays({ order: 'none', step: 50 }, 3)).toEqual([
            0, 0, 0,
        ]);
        expect(fieldStaggerDelays(undefined, 2)).toEqual([0, 0]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run test/core/field.test.ts`
Expected: FAIL — cannot resolve `../../src/core/field`.

- [ ] **Step 3: Implement FlapField**

`src/core/field.ts`:

```ts
import { Emitter } from './emitter';
import type { FlapSequence } from './sequence';
import { FlapUnit, type FlipEvent, type UnitOptions } from './unit';

export interface FieldStagger {
    order: 'sequential' | 'reverse' | 'random' | 'none';
    /** Milliseconds between consecutive units. */
    step: number;
    /** Random source for `order: 'random'`. Default `Math.random`. */
    random?: () => number;
}

/** Describes a run of units that share a sequence and are set by one value. */
export interface FieldSpec<T, V> {
    sequence: FlapSequence<T>;
    /** Number of units, >= 1. */
    length: number;
    /** Converts a value to flaps. Default: `T | T[]` → `[value]` or `value`. */
    toFlaps?: (value: V) => T[];
    /** Default `'left'`. */
    align?: 'left' | 'right' | 'center';
    /** Default `'truncate'`. */
    overflow?: 'truncate' | 'throw';
    /** Fills unused units and replaces unknown flaps. Default `sequence.at(0)`. */
    pad?: T;
    /** Layout width of each unit, in cells. Default 1. */
    cells?: number;
    stagger?: FieldStagger;
    /** Applied to every unit; the field's `pad` is used as each unit's pad. */
    unit?: Omit<UnitOptions<T>, 'pad'>;
}

export interface FieldSetOptions {
    /** Per-unit start delays (ms). Overrides the field's stagger. */
    delays?: readonly number[];
}

export interface FieldEvents<T> {
    flipend: FlipEvent<T> & { unit: number };
    settled: Record<string, never>;
}

/** Identity helper that keeps `T` and `V` inferred. */
export function defineField<T, V = T | T[]>(
    spec: FieldSpec<T, V>
): FieldSpec<T, V> {
    return spec;
}

/** A field set by a string, split into one character per unit. */
export function textField(
    spec: Omit<FieldSpec<string, string>, 'toFlaps'>
): FieldSpec<string, string> {
    return { ...spec, toFlaps: value => Array.from(value) };
}

export function fieldStaggerDelays(
    stagger: FieldStagger | undefined,
    count: number
): number[] {
    const order = stagger?.order ?? 'none';
    const step = stagger?.step ?? 0;
    const random = stagger?.random ?? Math.random;
    return Array.from({ length: count }, (_, index): number => {
        switch (order) {
            case 'sequential':
                return index * step;
            case 'reverse':
                return (count - 1 - index) * step;
            case 'random':
                return random() * (count - 1) * step;
            default:
                return 0;
        }
    });
}

/** A group of units that share one sequence and are set with one value. */
export class FlapField<T, V = T | T[]> {
    readonly spec: FieldSpec<T, V>;
    readonly sequence: FlapSequence<T>;
    readonly length: number;
    readonly cells: number;
    readonly units: readonly FlapUnit<T>[];
    private readonly padFlap: T;
    private readonly toFlaps: (value: V) => T[];
    private readonly emitter = new Emitter<FieldEvents<T>>();
    private wasSettled = true;

    constructor(spec: FieldSpec<T, V>) {
        if (!Number.isInteger(spec.length) || spec.length < 1) {
            throw new RangeError(
                `FlapField: length must be an integer >= 1, got ${spec.length}`
            );
        }
        this.spec = spec;
        this.sequence = spec.sequence;
        this.length = spec.length;
        this.cells = spec.cells ?? 1;
        this.padFlap = spec.pad ?? spec.sequence.at(0);
        this.toFlaps =
            spec.toFlaps ??
            ((value: V) =>
                (Array.isArray(value) ? value : [value]) as unknown as T[]);
        this.units = Array.from({ length: spec.length }, (_, index) => {
            const unit = new FlapUnit<T>({
                ...spec.unit,
                sequence: spec.sequence,
                initial: this.padFlap,
                pad: this.padFlap,
            });
            unit.on('flipend', event =>
                this.emitter.emit('flipend', { ...event, unit: index })
            );
            return unit;
        });
    }

    get isSettled(): boolean {
        return this.units.every(unit => unit.isSettled);
    }

    on<K extends keyof FieldEvents<T>>(
        event: K,
        listener: (payload: FieldEvents<T>[K]) => void
    ): () => void {
        return this.emitter.on(event, listener);
    }

    set(value: V, options: FieldSetOptions = {}): void {
        this.apply(this.arrange(value), options.delays);
    }

    /** Sends every unit to the pad flap. */
    clear(options: FieldSetOptions = {}): void {
        this.apply(
            this.units.map(() => this.padFlap),
            options.delays
        );
    }

    snap(value: V): void {
        this.arrange(value).forEach((flap, index) =>
            this.units[index].snapTo(flap)
        );
        this.wasSettled = true;
    }

    spin(): void {
        this.units.forEach(unit => unit.spin());
        this.markUnsettled();
    }

    stop(): void {
        this.units.forEach(unit => unit.stop());
    }

    update(dt: number): void {
        this.units.forEach(unit => unit.update(dt));
        if (this.isSettled && !this.wasSettled) {
            this.wasSettled = true;
            this.emitter.emit('settled', {});
        }
    }

    /** Start delays produced by this field's own stagger. */
    staggerDelays(): number[] {
        return fieldStaggerDelays(this.spec.stagger, this.length);
    }

    private arrange(value: V): T[] {
        let flaps = this.toFlaps(value);
        if (flaps.length > this.length) {
            if (this.spec.overflow === 'throw') {
                throw new RangeError(
                    `FlapField: value has ${flaps.length} flaps but the field has ${this.length} units`
                );
            }
            flaps = flaps.slice(0, this.length);
        }
        const free = this.length - flaps.length;
        const align = this.spec.align ?? 'left';
        const start =
            align === 'left' ? 0 : align === 'right' ? free : Math.floor(free / 2);
        return Array.from({ length: this.length }, (_, index) =>
            index >= start && index < start + flaps.length
                ? flaps[index - start]
                : this.padFlap
        );
    }

    private apply(
        flaps: T[],
        delays: readonly number[] = this.staggerDelays()
    ): void {
        flaps.forEach((flap, index) =>
            this.units[index].setTarget(flap, { delay: delays[index] ?? 0 })
        );
        this.markUnsettled();
    }

    private markUnsettled(): void {
        if (!this.isSettled) {
            this.wasSettled = false;
        }
    }
}
```

Append to `src/core/index.ts`:

```ts
export {
    defineField,
    fieldStaggerDelays,
    FlapField,
    textField,
    type FieldEvents,
    type FieldSetOptions,
    type FieldSpec,
    type FieldStagger,
} from './field';
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `bunx vitest run test/core && bun run typecheck`
Expected: all tests PASS; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
bunx prettier --write src test
git add -A
git commit -m "feat(core): add FlapField with alignment, overflow and stagger

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: FlapBoard

**Files:**
- Create: `src/core/board.ts`
- Modify: `src/core/index.ts`
- Test: `test/core/board.test.ts`

**Interfaces:**
- Consumes: `FlapField`, `FieldSpec`, `fieldStaggerDelays`, `FlipEvent`, `Emitter`, `FlapSequence`.
- Produces:
  - `type Schema = Record<string, FieldSpec<any, any>>`
  - `type FlapOf<F>`, `type ValueOf<F>` (a spec without `toFlaps` → `T | T[]`), `type RowValues<S> = { [K in keyof S]?: ValueOf<S[K]> }`, `type BoardField<S, K> = FlapField<FlapOf<S[K]>, ValueOf<S[K]>>`
  - `interface BoardStagger { order: 'column' | 'row' | 'diagonal' | 'random' | 'none'; step: number; random?: () => number }`
  - `interface BoardOptions<S> { rows: number; schema: S; stagger?: BoardStagger }`
  - `interface BoardFlipEvent<S>` (= `FlipEvent` + `row`, `field`, `unit`), `interface BoardEvents<S> { flipend; settled; messagechange: { index: number }; playlistend }`
  - `class FlapBoard<S extends Schema>` with `readonly schema`, `rowCount`, `fieldNames`, `isSettled`, `on()`, `field(row, name)`, `row(i).set(values)`, `show(rows)`, `spin()`, `stop()`, `update(dt)`. (`play()` is added in Task 6.)

- [ ] **Step 1: Write the failing test**

`test/core/board.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type BoardStagger,
    FlapBoard,
    type RowValues,
} from '../../src/core/board';
import { FlapField, textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const cities = new FlapSequence(['', 'TOKYO', 'OSAKA']);
const fast = { flipDuration: 10 };

function makeBoard(stagger?: BoardStagger) {
    return new FlapBoard({
        rows: 2,
        stagger,
        schema: {
            time: textField({ sequence: alnum, length: 4, unit: fast }),
            dest: { sequence: cities, length: 1, cells: 6, unit: fast },
            plat: textField({
                sequence: alnum,
                length: 2,
                align: 'right',
                unit: fast,
            }),
        },
    });
}

function shown<V>(field: FlapField<string, V>): string {
    return field.units.map(unit => unit.state.current).join('');
}

describe('FlapBoard', () => {
    it('validates rows and schema', () => {
        expect(
            () =>
                new FlapBoard({
                    rows: 0,
                    schema: { t: textField({ sequence: alnum, length: 1 }) },
                })
        ).toThrow(RangeError);
        expect(() => new FlapBoard({ rows: 1, schema: {} })).toThrow(
            RangeError
        );
    });

    it('shows rows of named fields', () => {
        const board = makeBoard();
        board.show([{ time: '0915', dest: 'TOKYO', plat: '3' }]);
        board.update(10_000);
        expect(shown(board.field(0, 'time'))).toBe('0915');
        expect(board.field(0, 'dest').units[0].state.current).toBe('TOKYO');
        expect(shown(board.field(0, 'plat'))).toBe(' 3');
        expect(shown(board.field(1, 'time'))).toBe('    ');
    });

    it('blanks missing fields and rows on show', () => {
        const board = makeBoard();
        board.show([
            { time: '0915', dest: 'TOKYO', plat: '3' },
            { time: '1000' },
        ]);
        board.update(10_000);
        board.show([{ dest: 'OSAKA' }]);
        board.update(10_000);
        expect(shown(board.field(0, 'time'))).toBe('    ');
        expect(board.field(0, 'dest').units[0].state.current).toBe('OSAKA');
        expect(shown(board.field(1, 'time'))).toBe('    ');
    });

    it('ignores rows beyond the board', () => {
        const board = makeBoard();
        expect(() => board.show([{}, {}, { time: '9999' }])).not.toThrow();
    });

    it('updates only the named fields of a row', () => {
        const board = makeBoard();
        board.show([{ time: '0915', dest: 'TOKYO', plat: '3' }]);
        board.update(10_000);
        board.row(0).set({ plat: '4' });
        board.update(10_000);
        expect(shown(board.field(0, 'time'))).toBe('0915');
        expect(shown(board.field(0, 'plat'))).toBe(' 4');
    });

    it('rejects out-of-range rows', () => {
        const board = makeBoard();
        expect(() => board.row(2)).toThrow(RangeError);
        expect(() => board.field(-1, 'time')).toThrow(RangeError);
    });

    it('emits settled once when every unit settles', () => {
        const board = makeBoard();
        let settled = 0;
        board.on('settled', () => settled++);
        board.show([{ time: '0915' }]);
        expect(board.isSettled).toBe(false);
        board.update(10_000);
        board.update(10_000);
        expect(board.isSettled).toBe(true);
        expect(settled).toBe(1);
    });

    it('emits flipend with row, field and unit', () => {
        const board = makeBoard();
        const flips: unknown[] = [];
        board.on('flipend', event => flips.push(event));
        board.row(1).set({ dest: 'TOKYO' });
        board.update(10);
        expect(flips).toEqual([
            {
                from: '',
                to: 'TOKYO',
                direction: 1,
                unit: 0,
                row: 1,
                field: 'dest',
            },
        ]);
    });

    it('staggers by cell column across the row', () => {
        const board = makeBoard({ order: 'column', step: 100 });
        board.show([{ time: 'AAAA', dest: 'TOKYO', plat: 'AA' }]);
        board.update(10);
        expect(board.field(0, 'time').units[0].state.current).toBe('A');
        expect(board.field(0, 'time').units[1].state.current).toBe(' ');
        board.update(400);
        // dest is at cell column 4 → 400 ms delay; plat starts at column 10
        expect(board.field(0, 'dest').units[0].state.current).toBe('TOKYO');
        expect(board.field(0, 'plat').units[0].state.current).toBe(' ');
    });

    it('staggers by row', () => {
        const board = makeBoard({ order: 'row', step: 100 });
        board.show([{ time: 'A' }, { time: 'A' }]);
        board.update(10);
        expect(shown(board.field(0, 'time'))).toBe('A   ');
        expect(shown(board.field(1, 'time'))).toBe('    ');
    });

    it('staggers diagonally', () => {
        const board = makeBoard({ order: 'diagonal', step: 100 });
        board.show([{}, { time: ' A' }]);
        board.update(199);
        expect(board.field(1, 'time').units[1].state.current).toBe(' ');
        board.update(11);
        expect(board.field(1, 'time').units[1].state.current).toBe('A');
    });

    it('staggers randomly up to the last cell column', () => {
        // last column is 11 (plat's second unit) → 0.5 * 11 * 10 = 55 ms
        const board = makeBoard({ order: 'random', step: 10, random: () => 0.5 });
        board.show([{ time: 'A' }]);
        board.update(54);
        expect(board.field(0, 'time').units[0].state.current).toBe(' ');
        board.update(11);
        expect(board.field(0, 'time').units[0].state.current).toBe('A');
    });

    it("lets a field's own stagger replace the board stagger", () => {
        const board = new FlapBoard({
            rows: 1,
            stagger: { order: 'column', step: 100 },
            schema: {
                time: textField({
                    sequence: alnum,
                    length: 2,
                    unit: fast,
                    stagger: { order: 'none', step: 0 },
                }),
            },
        });
        board.show([{ time: 'AA' }]);
        board.update(10);
        expect(shown(board.field(0, 'time'))).toBe('AA');
    });

    it('spins and stops every field', () => {
        const board = makeBoard();
        board.spin();
        board.update(25);
        expect(board.isSettled).toBe(false);
        board.stop();
        board.update(100);
        expect(board.isSettled).toBe(true);
    });

    it('infers row value types from the schema', () => {
        const board = makeBoard();
        expectTypeOf(board.field(0, 'dest')).toEqualTypeOf<
            FlapField<string, string | string[]>
        >();
        expectTypeOf<RowValues<typeof board.schema>>().toEqualTypeOf<{
            time?: string;
            dest?: string | string[];
            plat?: string;
        }>();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run test/core/board.test.ts`
Expected: FAIL — cannot resolve `../../src/core/board`.

- [ ] **Step 3: Implement FlapBoard**

`src/core/board.ts`:

```ts
import { Emitter } from './emitter';
import { type FieldSpec, fieldStaggerDelays, FlapField } from './field';
import type { FlipEvent } from './unit';

/** A board schema: field name → field spec. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Schema = Record<string, FieldSpec<any, any>>;

/** Flap type of a field spec. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FlapOf<F> = F extends FieldSpec<infer T, any> ? T : never;

/** Value type accepted by a field spec; specs without `toFlaps` take `T | T[]`. */
export type ValueOf<F> =
    F extends FieldSpec<infer T, infer V>
        ? unknown extends V
            ? T | T[]
            : V
        : never;

export type RowValues<S extends Schema> = { [K in keyof S]?: ValueOf<S[K]> };

export type BoardField<S extends Schema, K extends keyof S> = FlapField<
    FlapOf<S[K]>,
    ValueOf<S[K]>
>;

export interface BoardStagger {
    order: 'column' | 'row' | 'diagonal' | 'random' | 'none';
    /** Milliseconds per step. */
    step: number;
    /** Random source for `order: 'random'`. Default `Math.random`. */
    random?: () => number;
}

export interface BoardOptions<S extends Schema> {
    rows: number;
    schema: S;
    stagger?: BoardStagger;
}

export interface BoardFlipEvent<S extends Schema>
    extends FlipEvent<FlapOf<S[keyof S]>> {
    row: number;
    field: keyof S & string;
    unit: number;
}

export interface BoardEvents<S extends Schema> {
    flipend: BoardFlipEvent<S>;
    settled: Record<string, never>;
    messagechange: { index: number };
    playlistend: Record<string, never>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyField = FlapField<any, any>;

/** Rows that share one schema of named fields. */
export class FlapBoard<S extends Schema> {
    readonly schema: S;
    readonly rowCount: number;
    readonly fieldNames: readonly (keyof S & string)[];
    private readonly stagger: BoardStagger | undefined;
    private readonly rows: Record<string, AnyField>[];
    private readonly columnStart = new Map<string, number>();
    private readonly maxColumn: number;
    private readonly emitter = new Emitter<BoardEvents<S>>();
    private wasSettled = true;

    constructor(options: BoardOptions<S>) {
        if (!Number.isInteger(options.rows) || options.rows < 1) {
            throw new RangeError(
                `FlapBoard: rows must be an integer >= 1, got ${options.rows}`
            );
        }
        const names = Object.keys(options.schema) as (keyof S & string)[];
        if (names.length === 0) {
            throw new RangeError(
                'FlapBoard: schema must have at least one field'
            );
        }
        this.schema = options.schema;
        this.rowCount = options.rows;
        this.fieldNames = names;
        this.stagger = options.stagger;

        let column = 0;
        let maxColumn = 0;
        for (const name of names) {
            const spec = options.schema[name];
            const cells = spec.cells ?? 1;
            this.columnStart.set(name, column);
            maxColumn = column + (spec.length - 1) * cells;
            column += spec.length * cells;
        }
        this.maxColumn = maxColumn;

        this.rows = Array.from({ length: options.rows }, (_, row) => {
            const fields: Record<string, AnyField> = {};
            for (const name of names) {
                const field: AnyField = new FlapField(options.schema[name]);
                field.on('flipend', event =>
                    this.emitter.emit('flipend', { ...event, row, field: name })
                );
                fields[name] = field;
            }
            return fields;
        });
    }

    get isSettled(): boolean {
        return this.rows.every(fields =>
            this.fieldNames.every(name => fields[name].isSettled)
        );
    }

    on<K extends keyof BoardEvents<S>>(
        event: K,
        listener: (payload: BoardEvents<S>[K]) => void
    ): () => void {
        return this.emitter.on(event, listener);
    }

    field<K extends keyof S & string>(row: number, name: K): BoardField<S, K> {
        const field = this.rowFields(row)[name];
        if (!field) {
            throw new RangeError(`FlapBoard: unknown field "${name}"`);
        }
        return field as BoardField<S, K>;
    }

    /** Partial updates for one row; fields not named keep their content. */
    row(index: number): { set(values: RowValues<S>): void } {
        this.rowFields(index);
        return {
            set: values => {
                this.applyRow(index, values, false);
                this.markUnsettled();
            },
        };
    }

    /** Sets the whole board. Missing fields and rows go to their pad flap. */
    show(rows: readonly RowValues<S>[]): void {
        this.applyRows(rows);
    }

    spin(): void {
        this.eachField(field => field.spin());
        this.markUnsettled();
    }

    stop(): void {
        this.eachField(field => field.stop());
    }

    update(dt: number): void {
        if (!(dt > 0) || !Number.isFinite(dt)) {
            return;
        }
        this.eachField(field => field.update(dt));
        if (this.isSettled && !this.wasSettled) {
            this.wasSettled = true;
            this.emitter.emit('settled', {});
        }
    }

    private applyRows(rows: readonly RowValues<S>[]): void {
        for (let row = 0; row < this.rowCount; row++) {
            this.applyRow(row, rows[row] ?? {}, true);
        }
        this.markUnsettled();
    }

    private applyRow(
        row: number,
        values: RowValues<S>,
        clearMissing: boolean
    ): void {
        const fields = this.rows[row];
        for (const name of this.fieldNames) {
            const value = values[name];
            const delays = this.delaysFor(row, name);
            if (value !== undefined) {
                fields[name].set(value, { delays });
            } else if (clearMissing) {
                fields[name].clear({ delays });
            }
        }
    }

    private delaysFor(row: number, name: keyof S & string): number[] {
        const spec = this.schema[name];
        if (spec.stagger) {
            return fieldStaggerDelays(spec.stagger, spec.length);
        }
        const cells = spec.cells ?? 1;
        const start = this.columnStart.get(name) ?? 0;
        const order = this.stagger?.order ?? 'none';
        const step = this.stagger?.step ?? 0;
        const random = this.stagger?.random ?? Math.random;
        return Array.from({ length: spec.length }, (_, index): number => {
            const column = start + index * cells;
            switch (order) {
                case 'column':
                    return column * step;
                case 'row':
                    return row * step;
                case 'diagonal':
                    return (row + column) * step;
                case 'random':
                    return random() * this.maxColumn * step;
                default:
                    return 0;
            }
        });
    }

    private rowFields(index: number): Record<string, AnyField> {
        if (!Number.isInteger(index) || index < 0 || index >= this.rowCount) {
            throw new RangeError(
                `FlapBoard: row ${index} is out of range (0..${this.rowCount - 1})`
            );
        }
        return this.rows[index];
    }

    private eachField(callback: (field: AnyField) => void): void {
        for (const fields of this.rows) {
            for (const name of this.fieldNames) {
                callback(fields[name]);
            }
        }
    }

    private markUnsettled(): void {
        if (!this.isSettled) {
            this.wasSettled = false;
        }
    }
}
```

Append to `src/core/index.ts`:

```ts
export {
    FlapBoard,
    type BoardEvents,
    type BoardField,
    type BoardFlipEvent,
    type BoardOptions,
    type BoardStagger,
    type FlapOf,
    type RowValues,
    type Schema,
    type ValueOf,
} from './board';
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `bunx vitest run test/core && bun run typecheck`
Expected: all tests PASS; `tsc` exits 0 (this also verifies the `expectTypeOf` assertions).

- [ ] **Step 5: Commit**

```bash
bunx prettier --write src test
git add -A
git commit -m "feat(core): add FlapBoard with schema typing and board stagger

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Playlist

**Files:**
- Create: `src/core/playlist.ts`
- Modify: `src/core/board.ts` (full replacement below), `src/core/index.ts`
- Test: `test/core/playlist.test.ts`

**Interfaces:**
- Consumes: `FlapBoard`, `RowValues`, `Schema` (Task 5).
- Produces:
  - `type Message<S> = readonly RowValues<S>[] | { rows: readonly RowValues<S>[]; hold?: number }`
  - `interface PlayOptions { hold?: number; loop?: boolean }`; `const DEFAULT_HOLD = 5000`
  - `class Playlist<S>` (internal) driven by `FlapBoard`.
  - `FlapBoard.play(messages: readonly Message<S>[], options?: PlayOptions): void`. `show()`, `spin()`, `stop()` and another `play()` cancel the playlist; `row(i).set()` does not.

- [ ] **Step 1: Write the failing test**

`test/core/playlist.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);

function makeBoard() {
    const board = new FlapBoard({
        rows: 1,
        schema: {
            text: textField({
                sequence: alnum,
                length: 1,
                unit: { flipDuration: 10 },
            }),
        },
    });
    const changes: number[] = [];
    board.on('messagechange', event => changes.push(event.index));
    return { board, changes };
}

const msg = (text: string) => [{ text }];
const current = (board: ReturnType<typeof makeBoard>['board']) =>
    board.field(0, 'text').units[0].state.current;
const target = (board: ReturnType<typeof makeBoard>['board']) =>
    board.field(0, 'text').units[0].target;

describe('FlapBoard.play', () => {
    it('shows the first message immediately', () => {
        const { board, changes } = makeBoard();
        board.play([msg('A'), msg('B')], { hold: 100 });
        expect(changes).toEqual([0]);
        board.update(10);
        expect(current(board)).toBe('A');
    });

    it('starts the hold once the board settles', () => {
        const { board, changes } = makeBoard();
        board.play([msg('C'), msg('A')], { hold: 100 });
        board.update(30); // three flips: ' ' → A → B → C; settle observed
        board.update(99);
        expect(changes).toEqual([0]);
        board.update(1);
        expect(changes).toEqual([0, 1]);
        expect(target(board)).toBe('A');
    });

    it('uses a per-message hold', () => {
        const { board, changes } = makeBoard();
        board.play([{ rows: msg('A'), hold: 50 }, msg('B')], { hold: 1000 });
        board.update(10);
        board.update(50);
        expect(changes).toEqual([0, 1]);
    });

    it('loops back to the first message', () => {
        const { board, changes } = makeBoard();
        board.play([msg('A'), msg('B')], { hold: 10 });
        board.update(10); // A settles
        board.update(10); // hold done → B
        board.update(10); // B settles
        board.update(10); // hold done → A
        expect(changes).toEqual([0, 1, 0]);
    });

    it('ends without looping and keeps the last message', () => {
        const { board } = makeBoard();
        const ended = vi.fn();
        board.on('playlistend', ended);
        board.play([msg('A')], { hold: 10, loop: false });
        board.update(10);
        board.update(10);
        board.update(1000);
        expect(ended).toHaveBeenCalledTimes(1);
        expect(current(board)).toBe('A');
    });

    it('is cancelled by show()', () => {
        const { board, changes } = makeBoard();
        board.play([msg('A'), msg('B')], { hold: 10 });
        board.update(10);
        board.show(msg('C'));
        board.update(1000);
        expect(changes).toEqual([0]);
        expect(current(board)).toBe('C');
    });

    it('is cancelled by spin()', () => {
        const { board, changes } = makeBoard();
        board.play([msg('A'), msg('B')], { hold: 10 });
        board.spin();
        board.update(1000);
        expect(changes).toEqual([0]);
        expect(board.isSettled).toBe(false);
    });

    it('is not cancelled by row().set()', () => {
        const { board, changes } = makeBoard();
        board.play([msg('A'), msg('B')], { hold: 10 });
        board.update(10);
        board.row(0).set({ text: 'Z' });
        board.update(10);
        expect(changes).toEqual([0, 1]);
        expect(target(board)).toBe('B');
    });

    it('rejects an empty playlist', () => {
        const { board } = makeBoard();
        expect(() => board.play([])).toThrow(RangeError);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run test/core/playlist.test.ts`
Expected: FAIL — `board.play is not a function`.

- [ ] **Step 3: Implement the playlist**

`src/core/playlist.ts`:

```ts
import type { RowValues, Schema } from './board';

export type Message<S extends Schema> =
    | readonly RowValues<S>[]
    | { rows: readonly RowValues<S>[]; hold?: number };

export interface PlayOptions {
    /** Milliseconds to hold each settled message. Default 5000. */
    hold?: number;
    /** Restart from the first message after the last. Default true. */
    loop?: boolean;
}

export const DEFAULT_HOLD = 5000;

/** What a playlist needs from its board. */
export interface PlaylistHost<S extends Schema> {
    applyRows(rows: readonly RowValues<S>[]): void;
    isSettled(): boolean;
    messageChanged(index: number): void;
    ended(): void;
}

function isRowList<S extends Schema>(
    message: Message<S>
): message is readonly RowValues<S>[] {
    return Array.isArray(message);
}

/** Steps through messages, holding each one once the board has settled. */
export class Playlist<S extends Schema> {
    private readonly hold: number;
    private readonly loop: boolean;
    private index = 0;
    private holding = false;
    private held = 0;

    constructor(
        private readonly host: PlaylistHost<S>,
        private readonly messages: readonly Message<S>[],
        options: PlayOptions = {}
    ) {
        if (messages.length === 0) {
            throw new RangeError('FlapBoard.play: messages must not be empty');
        }
        this.hold = options.hold ?? DEFAULT_HOLD;
        this.loop = options.loop ?? true;
    }

    start(): void {
        this.show(0);
    }

    /** Called by the board after its units have advanced by `dt`. */
    update(dt: number): void {
        if (!this.holding) {
            if (this.host.isSettled()) {
                this.holding = true;
                this.held = 0;
            }
            return;
        }
        this.held += dt;
        if (this.held < this.holdFor(this.messages[this.index])) {
            return;
        }
        const next = this.index + 1;
        if (next < this.messages.length) {
            this.show(next);
        } else if (this.loop) {
            this.show(0);
        } else {
            this.host.ended();
        }
    }

    private show(index: number): void {
        this.index = index;
        this.holding = false;
        this.held = 0;
        const message = this.messages[index];
        this.host.applyRows(isRowList(message) ? message : message.rows);
        this.host.messageChanged(index);
    }

    private holdFor(message: Message<S>): number {
        return isRowList(message) ? this.hold : (message.hold ?? this.hold);
    }
}
```

- [ ] **Step 4: Wire the playlist into the board**

Replace `src/core/board.ts` with this version. Compared with Task 5 it adds the `Playlist` import, the `playlist` field, `play()`, cancellation in `show()`/`spin()`/`stop()`, and `this.playlist?.update(dt)` in `update()`.

```ts
import { Emitter } from './emitter';
import { type FieldSpec, fieldStaggerDelays, FlapField } from './field';
import { type Message, type PlayOptions, Playlist } from './playlist';
import type { FlipEvent } from './unit';

/** A board schema: field name → field spec. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Schema = Record<string, FieldSpec<any, any>>;

/** Flap type of a field spec. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FlapOf<F> = F extends FieldSpec<infer T, any> ? T : never;

/** Value type accepted by a field spec; specs without `toFlaps` take `T | T[]`. */
export type ValueOf<F> =
    F extends FieldSpec<infer T, infer V>
        ? unknown extends V
            ? T | T[]
            : V
        : never;

export type RowValues<S extends Schema> = { [K in keyof S]?: ValueOf<S[K]> };

export type BoardField<S extends Schema, K extends keyof S> = FlapField<
    FlapOf<S[K]>,
    ValueOf<S[K]>
>;

export interface BoardStagger {
    order: 'column' | 'row' | 'diagonal' | 'random' | 'none';
    /** Milliseconds per step. */
    step: number;
    /** Random source for `order: 'random'`. Default `Math.random`. */
    random?: () => number;
}

export interface BoardOptions<S extends Schema> {
    rows: number;
    schema: S;
    stagger?: BoardStagger;
}

export interface BoardFlipEvent<S extends Schema>
    extends FlipEvent<FlapOf<S[keyof S]>> {
    row: number;
    field: keyof S & string;
    unit: number;
}

export interface BoardEvents<S extends Schema> {
    flipend: BoardFlipEvent<S>;
    settled: Record<string, never>;
    messagechange: { index: number };
    playlistend: Record<string, never>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyField = FlapField<any, any>;

/** Rows that share one schema of named fields. */
export class FlapBoard<S extends Schema> {
    readonly schema: S;
    readonly rowCount: number;
    readonly fieldNames: readonly (keyof S & string)[];
    private readonly stagger: BoardStagger | undefined;
    private readonly rows: Record<string, AnyField>[];
    private readonly columnStart = new Map<string, number>();
    private readonly maxColumn: number;
    private readonly emitter = new Emitter<BoardEvents<S>>();
    private wasSettled = true;
    private playlist: Playlist<S> | null = null;

    constructor(options: BoardOptions<S>) {
        if (!Number.isInteger(options.rows) || options.rows < 1) {
            throw new RangeError(
                `FlapBoard: rows must be an integer >= 1, got ${options.rows}`
            );
        }
        const names = Object.keys(options.schema) as (keyof S & string)[];
        if (names.length === 0) {
            throw new RangeError(
                'FlapBoard: schema must have at least one field'
            );
        }
        this.schema = options.schema;
        this.rowCount = options.rows;
        this.fieldNames = names;
        this.stagger = options.stagger;

        let column = 0;
        let maxColumn = 0;
        for (const name of names) {
            const spec = options.schema[name];
            const cells = spec.cells ?? 1;
            this.columnStart.set(name, column);
            maxColumn = column + (spec.length - 1) * cells;
            column += spec.length * cells;
        }
        this.maxColumn = maxColumn;

        this.rows = Array.from({ length: options.rows }, (_, row) => {
            const fields: Record<string, AnyField> = {};
            for (const name of names) {
                const field: AnyField = new FlapField(options.schema[name]);
                field.on('flipend', event =>
                    this.emitter.emit('flipend', { ...event, row, field: name })
                );
                fields[name] = field;
            }
            return fields;
        });
    }

    get isSettled(): boolean {
        return this.rows.every(fields =>
            this.fieldNames.every(name => fields[name].isSettled)
        );
    }

    on<K extends keyof BoardEvents<S>>(
        event: K,
        listener: (payload: BoardEvents<S>[K]) => void
    ): () => void {
        return this.emitter.on(event, listener);
    }

    field<K extends keyof S & string>(row: number, name: K): BoardField<S, K> {
        const field = this.rowFields(row)[name];
        if (!field) {
            throw new RangeError(`FlapBoard: unknown field "${name}"`);
        }
        return field as BoardField<S, K>;
    }

    /** Partial updates for one row; fields not named keep their content. */
    row(index: number): { set(values: RowValues<S>): void } {
        this.rowFields(index);
        return {
            set: values => {
                this.applyRow(index, values, false);
                this.markUnsettled();
            },
        };
    }

    /** Sets the whole board and cancels any playlist. */
    show(rows: readonly RowValues<S>[]): void {
        this.playlist = null;
        this.applyRows(rows);
    }

    /** Cycles through messages, holding each one after the board settles. */
    play(messages: readonly Message<S>[], options: PlayOptions = {}): void {
        const playlist = new Playlist<S>(
            {
                applyRows: rows => this.applyRows(rows),
                isSettled: () => this.isSettled,
                messageChanged: index =>
                    this.emitter.emit('messagechange', { index }),
                ended: () => {
                    this.playlist = null;
                    this.emitter.emit('playlistend', {});
                },
            },
            messages,
            options
        );
        this.playlist = playlist;
        playlist.start();
    }

    spin(): void {
        this.playlist = null;
        this.eachField(field => field.spin());
        this.markUnsettled();
    }

    stop(): void {
        this.playlist = null;
        this.eachField(field => field.stop());
    }

    update(dt: number): void {
        if (!(dt > 0) || !Number.isFinite(dt)) {
            return;
        }
        this.eachField(field => field.update(dt));
        this.playlist?.update(dt);
        if (this.isSettled && !this.wasSettled) {
            this.wasSettled = true;
            this.emitter.emit('settled', {});
        }
    }

    private applyRows(rows: readonly RowValues<S>[]): void {
        for (let row = 0; row < this.rowCount; row++) {
            this.applyRow(row, rows[row] ?? {}, true);
        }
        this.markUnsettled();
    }

    private applyRow(
        row: number,
        values: RowValues<S>,
        clearMissing: boolean
    ): void {
        const fields = this.rows[row];
        for (const name of this.fieldNames) {
            const value = values[name];
            const delays = this.delaysFor(row, name);
            if (value !== undefined) {
                fields[name].set(value, { delays });
            } else if (clearMissing) {
                fields[name].clear({ delays });
            }
        }
    }

    private delaysFor(row: number, name: keyof S & string): number[] {
        const spec = this.schema[name];
        if (spec.stagger) {
            return fieldStaggerDelays(spec.stagger, spec.length);
        }
        const cells = spec.cells ?? 1;
        const start = this.columnStart.get(name) ?? 0;
        const order = this.stagger?.order ?? 'none';
        const step = this.stagger?.step ?? 0;
        const random = this.stagger?.random ?? Math.random;
        return Array.from({ length: spec.length }, (_, index): number => {
            const column = start + index * cells;
            switch (order) {
                case 'column':
                    return column * step;
                case 'row':
                    return row * step;
                case 'diagonal':
                    return (row + column) * step;
                case 'random':
                    return random() * this.maxColumn * step;
                default:
                    return 0;
            }
        });
    }

    private rowFields(index: number): Record<string, AnyField> {
        if (!Number.isInteger(index) || index < 0 || index >= this.rowCount) {
            throw new RangeError(
                `FlapBoard: row ${index} is out of range (0..${this.rowCount - 1})`
            );
        }
        return this.rows[index];
    }

    private eachField(callback: (field: AnyField) => void): void {
        for (const fields of this.rows) {
            for (const name of this.fieldNames) {
                callback(fields[name]);
            }
        }
    }

    private markUnsettled(): void {
        if (!this.isSettled) {
            this.wasSettled = false;
        }
    }
}
```

Append to `src/core/index.ts`:

```ts
export { DEFAULT_HOLD, type Message, type PlayOptions } from './playlist';
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `bunx vitest run test/core && bun run typecheck`
Expected: all core tests PASS, including the 15 board tests from Task 5 and 9 playlist tests; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
bunx prettier --write src test
git add -A
git commit -m "feat(core): add board playlist with hold-after-settle

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Style, flip geometry and flip curve

**Files:**
- Create: `src/render/style.ts`, `src/render/frame.ts`, `src/render/flip-geometry.ts`, `src/render/flip-curve.ts`
- Test: `test/render/style.test.ts`, `test/render/flip-geometry.test.ts`, `test/render/flip-curve.test.ts`

**Interfaces:**
- Consumes: `@ue-too/animate` (`Animation`, `Keyframe`, `numberHelperFunctions`).
- Produces:
  - `interface FlapStyle { radius?; hingeGap?; hingeColor?; shade?; shadow? }`, `type ResolvedFlapStyle = Required<FlapStyle>`, `const DEFAULT_STYLE: ResolvedFlapStyle` (`radius 4, hingeGap 1, hingeColor 'rgba(0, 0, 0, 0.6)', shade 0.5, shadow 0.35`), `function resolveStyle(style?: FlapStyle): ResolvedFlapStyle`
  - `const MAX_FRAME_DT = 250`
  - `type FaceRef = 'current' | 'next'`, `type Half = 'top' | 'bottom'`, `interface FlipGeometry { staticTop: FaceRef; staticBottom: FaceRef; flap: { face: FaceRef; half: Half; anchor: 'hinge'; scaleY: number }; flapShade: number; castShadow: number; shadowHalf: Half }`, `function flipGeometry(angle: number, direction: 1 | -1): FlipGeometry`
  - `type FlipCurve = (progress: number) => number`, `const DEFAULT_FLIP_KEYFRAMES: readonly Keyframe<number>[]`, `function createFlipCurve(keyframes?): FlipCurve`, `function defaultFlipCurve(): FlipCurve` (shared lazily-created default)

- [ ] **Step 1: Write the failing tests**

`test/render/style.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_STYLE, resolveStyle } from '../../src/render/style';

describe('resolveStyle', () => {
    it('fills in defaults', () => {
        expect(resolveStyle()).toEqual(DEFAULT_STYLE);
        expect(DEFAULT_STYLE).toEqual({
            radius: 4,
            hingeGap: 1,
            hingeColor: 'rgba(0, 0, 0, 0.6)',
            shade: 0.5,
            shadow: 0.35,
        });
    });

    it('keeps overrides', () => {
        expect(resolveStyle({ radius: 0, shade: 0.2 })).toEqual({
            ...DEFAULT_STYLE,
            radius: 0,
            shade: 0.2,
        });
    });
});
```

`test/render/flip-geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { flipGeometry } from '../../src/render/flip-geometry';

const COS45 = Math.cos(Math.PI / 4);

describe('flipGeometry, forward', () => {
    it('shows the whole current top at 0°', () => {
        const g = flipGeometry(0, 1);
        expect(g.staticTop).toBe('next');
        expect(g.staticBottom).toBe('current');
        expect(g.flap).toEqual({
            face: 'current',
            half: 'top',
            anchor: 'hinge',
            scaleY: 1,
        });
        expect(g.flapShade).toBe(0);
        expect(g.castShadow).toBe(0);
        expect(g.shadowHalf).toBe('bottom');
    });

    it('squashes the current top toward the hinge at 45°', () => {
        const g = flipGeometry(45, 1);
        expect(g.flap.face).toBe('current');
        expect(g.flap.half).toBe('top');
        expect(g.flap.scaleY).toBeCloseTo(COS45);
        expect(g.flapShade).toBeCloseTo(1 - COS45);
        expect(g.castShadow).toBeCloseTo(Math.sin(Math.PI / 4));
    });

    it('is edge-on at 90°', () => {
        const g = flipGeometry(90, 1);
        expect(g.flap.face).toBe('next');
        expect(g.flap.half).toBe('bottom');
        expect(g.flap.scaleY).toBeCloseTo(0);
        expect(g.flapShade).toBeCloseTo(1);
        expect(g.castShadow).toBeCloseTo(1);
    });

    it('unfolds the next bottom at 135°', () => {
        const g = flipGeometry(135, 1);
        expect(g.flap.face).toBe('next');
        expect(g.flap.half).toBe('bottom');
        expect(g.flap.scaleY).toBeCloseTo(COS45);
    });

    it('fully covers the bottom at 180°', () => {
        const g = flipGeometry(180, 1);
        expect(g.flap.face).toBe('next');
        expect(g.flap.scaleY).toBeCloseTo(1);
        expect(g.flapShade).toBeCloseTo(0);
        expect(g.castShadow).toBeCloseTo(0);
    });

    it('clamps angles to 0..180', () => {
        expect(flipGeometry(-10, 1)).toEqual(flipGeometry(0, 1));
        expect(flipGeometry(200, 1)).toEqual(flipGeometry(180, 1));
    });
});

describe('flipGeometry, backward', () => {
    it('mirrors the halves', () => {
        const first = flipGeometry(45, -1);
        expect(first.staticTop).toBe('current');
        expect(first.staticBottom).toBe('next');
        expect(first.flap.face).toBe('current');
        expect(first.flap.half).toBe('bottom');
        expect(first.shadowHalf).toBe('top');

        const second = flipGeometry(135, -1);
        expect(second.flap.face).toBe('next');
        expect(second.flap.half).toBe('top');
    });
});
```

`test/render/flip-curve.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createFlipCurve, defaultFlipCurve } from '../../src/render/flip-curve';

describe('createFlipCurve', () => {
    it('follows the default keyframes: ease-in fall, bounce, settle', () => {
        const curve = createFlipCurve();
        expect(curve(0)).toBe(0);
        expect(curve(0.4)).toBeCloseTo(45);
        expect(curve(0.8)).toBe(180);
        expect(curve(0.85)).toBeCloseTo(168.75);
        expect(curve(0.9)).toBe(165);
        expect(curve(1)).toBe(180);
    });

    it('stays within 0..180 and only rises before the bounce', () => {
        const curve = createFlipCurve();
        let previous = -1;
        for (let i = 0; i <= 100; i++) {
            const angle = curve(i / 100);
            expect(angle).toBeGreaterThanOrEqual(0);
            expect(angle).toBeLessThanOrEqual(180);
            if (i <= 80) {
                expect(angle).toBeGreaterThanOrEqual(previous);
                previous = angle;
            }
        }
    });

    it('clamps progress and output', () => {
        const curve = createFlipCurve();
        expect(curve(-1)).toBe(0);
        expect(curve(2)).toBe(180);
        expect(curve(NaN)).toBe(0);
        const overshoot = createFlipCurve([
            { percentage: 0, value: 0 },
            { percentage: 0.5, value: 200 },
            { percentage: 1, value: 180 },
        ]);
        expect(overshoot(0.5)).toBe(180);
    });

    it('samples custom keyframes', () => {
        const linear = createFlipCurve([
            { percentage: 0, value: 0 },
            { percentage: 1, value: 180 },
        ]);
        expect(linear(0.5)).toBeCloseTo(90);
    });

    it('validates keyframes', () => {
        expect(() => createFlipCurve([{ percentage: 0, value: 0 }])).toThrow(
            RangeError
        );
        expect(() =>
            createFlipCurve([
                { percentage: 0.1, value: 0 },
                { percentage: 1, value: 180 },
            ])
        ).toThrow(RangeError);
        expect(() =>
            createFlipCurve([
                { percentage: 0, value: 0 },
                { percentage: 0.9, value: 180 },
            ])
        ).toThrow(RangeError);
        expect(() =>
            createFlipCurve([
                { percentage: 0, value: 0 },
                { percentage: 0.6, value: 90 },
                { percentage: 0.4, value: 120 },
                { percentage: 1, value: 180 },
            ])
        ).toThrow(RangeError);
    });

    it('shares one default curve', () => {
        expect(defaultFlipCurve()).toBe(defaultFlipCurve());
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run test/render`
Expected: FAIL — cannot resolve `../../src/render/style`, `flip-geometry`, `flip-curve`.

- [ ] **Step 3: Implement style and frame constants**

`src/render/style.ts`:

```ts
export interface FlapStyle {
    /** Corner radius in px, baked into cached faces. */
    radius?: number;
    /** Height in px of the line drawn at the hinge. */
    hingeGap?: number;
    hingeColor?: string;
    /** 0..1 maximum darkening of the moving flap. */
    shade?: number;
    /** 0..1 maximum opacity of the shadow cast by the moving flap. */
    shadow?: number;
}

export type ResolvedFlapStyle = Required<FlapStyle>;

export const DEFAULT_STYLE: ResolvedFlapStyle = {
    radius: 4,
    hingeGap: 1,
    hingeColor: 'rgba(0, 0, 0, 0.6)',
    shade: 0.5,
    shadow: 0.35,
};

export function resolveStyle(style: FlapStyle = {}): ResolvedFlapStyle {
    return { ...DEFAULT_STYLE, ...style };
}
```

`src/render/frame.ts`:

```ts
/**
 * Largest frame delta (ms) the built-in render loops pass to `update()`, so a
 * backgrounded tab does not resume with a flood of flips.
 */
export const MAX_FRAME_DT = 250;
```

- [ ] **Step 4: Implement flip geometry**

`src/render/flip-geometry.ts`:

```ts
export type FaceRef = 'current' | 'next';
export type Half = 'top' | 'bottom';

export interface FlipGeometry {
    /** Face shown in the static top half. */
    staticTop: FaceRef;
    /** Face shown in the static bottom half. */
    staticBottom: FaceRef;
    /** The moving flap, anchored at the hinge and scaled vertically. */
    flap: { face: FaceRef; half: Half; anchor: 'hinge'; scaleY: number };
    /** 0..1 darkening of the moving flap; peaks edge-on at 90°. */
    flapShade: number;
    /** 0..1 shadow strength on the half the flap is moving toward. */
    castShadow: number;
    shadowHalf: Half;
}

/**
 * Describes what to draw for a flap at `angle` degrees (0..180).
 * Forward flips fold the top down; backward flips fold the bottom up.
 */
export function flipGeometry(angle: number, direction: 1 | -1): FlipGeometry {
    const clamped = Math.min(180, Math.max(0, angle));
    const radians = (clamped * Math.PI) / 180;
    const cos = Math.cos(radians);
    const firstHalf = clamped < 90;
    const forward = direction === 1;
    const leadingHalf: Half = forward ? 'top' : 'bottom';
    const trailingHalf: Half = forward ? 'bottom' : 'top';
    return {
        staticTop: forward ? 'next' : 'current',
        staticBottom: forward ? 'current' : 'next',
        flap: {
            face: firstHalf ? 'current' : 'next',
            half: firstHalf ? leadingHalf : trailingHalf,
            anchor: 'hinge',
            scaleY: Math.abs(cos),
        },
        flapShade: 1 - Math.abs(cos),
        castShadow: Math.sin(radians),
        shadowHalf: trailingHalf,
    };
}
```

- [ ] **Step 5: Implement the flip curve**

`src/render/flip-curve.ts`:

```ts
import {
    Animation,
    type Keyframe,
    numberHelperFunctions,
} from '@ue-too/animate';

/** Maps linear flip progress (0..1) to the flap angle in degrees (0..180). */
export type FlipCurve = (progress: number) => number;

const easeInQuad = (t: number): number => t * t;
const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);

/** Ease-in fall to 180° by 80% of the flip, bounce to 165°, settle at 180°. */
export const DEFAULT_FLIP_KEYFRAMES: readonly Keyframe<number>[] = [
    { percentage: 0, value: 0, easingFn: easeInQuad },
    { percentage: 0.8, value: 180, easingFn: easeOutQuad },
    { percentage: 0.9, value: 165, easingFn: easeInQuad },
    { percentage: 1, value: 180 },
];

/**
 * Builds a flip curve from `@ue-too/animate` keyframes. Each keyframe's
 * `easingFn` shapes the segment that starts at it.
 */
export function createFlipCurve(
    keyframes: readonly Keyframe<number>[] = DEFAULT_FLIP_KEYFRAMES
): FlipCurve {
    if (keyframes.length < 2) {
        throw new RangeError('createFlipCurve: need at least 2 keyframes');
    }
    if (
        keyframes[0].percentage !== 0 ||
        keyframes[keyframes.length - 1].percentage !== 1
    ) {
        throw new RangeError(
            'createFlipCurve: keyframes must start at percentage 0 and end at 1'
        );
    }
    for (let i = 1; i < keyframes.length; i++) {
        if (keyframes[i].percentage <= keyframes[i - 1].percentage) {
            throw new RangeError(
                'createFlipCurve: keyframe percentages must increase'
            );
        }
    }
    const frames = keyframes.map(frame => ({ ...frame }));
    // Never started: only used to sample the keyframes via findValue.
    const sampler = new Animation<number>(
        frames,
        () => {},
        numberHelperFunctions,
        1
    );
    return progress => {
        const p = Number.isFinite(progress)
            ? Math.min(1, Math.max(0, progress))
            : 0;
        const angle = sampler.findValue(p, frames, numberHelperFunctions);
        return Math.min(180, Math.max(0, angle));
    };
}

let sharedDefault: FlipCurve | undefined;

/** The default curve, created on first use and shared. */
export function defaultFlipCurve(): FlipCurve {
    sharedDefault ??= createFlipCurve();
    return sharedDefault;
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `bunx vitest run test/render && bun run typecheck`
Expected: all render tests PASS; `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
bunx prettier --write src test
git add -A
git commit -m "feat(render): add flip geometry, flip curve and style defaults

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Layout

**Files:**
- Create: `src/render/layout.ts`
- Test: `test/render/layout.test.ts`

**Interfaces:**
- Consumes: `FlapBoard` (`rowCount`, `fieldNames`, `field()`), `FlapField` (`units`, `cells`, `sequence`), `FlapUnit` (`sequence`), `FlapSequence`.
- Produces:
  - `interface Rect { x: number; y: number; w: number; h: number }`
  - `interface LayoutOptions { cell: { w: number; h: number }; gap?: { unit?: number; field?: number; row?: number } }`
  - `type RenderTarget = FlapBoard<any> | FlapField<any, any> | FlapUnit<any>`
  - `interface UnitSlot { unit; sequence; rect: Rect; row: number; field: string; index: number }`
  - `interface BoardLayout { slots: UnitSlot[]; width: number; height: number }`
  - `const SINGLE_FIELD = ''` (field name for unit and field targets)
  - `function layout(target: RenderTarget, options: LayoutOptions): BoardLayout`

- [ ] **Step 1: Write the failing test**

`test/render/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { defineField, FlapField, textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { layout, SINGLE_FIELD } from '../../src/render/layout';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const cities = new FlapSequence(['', 'TOKYO']);
const cell = { w: 40, h: 60 };

describe('layout', () => {
    it('lays out a single unit', () => {
        const unit = new FlapUnit({ sequence: alnum });
        const result = layout(unit, { cell });
        expect(result.width).toBe(40);
        expect(result.height).toBe(60);
        expect(result.slots).toEqual([
            {
                unit,
                sequence: alnum,
                rect: { x: 0, y: 0, w: 40, h: 60 },
                row: 0,
                field: SINGLE_FIELD,
                index: 0,
            },
        ]);
    });

    it('spaces field units by the unit gap', () => {
        const field = new FlapField(textField({ sequence: alnum, length: 3 }));
        const result = layout(field, { cell, gap: { unit: 4 } });
        expect(result.slots.map(slot => slot.rect.x)).toEqual([0, 44, 88]);
        expect(result.width).toBe(128);
    });

    it('widens units that span several cells', () => {
        const field = new FlapField(
            defineField({ sequence: cities, length: 2, cells: 2 })
        );
        const result = layout(field, { cell, gap: { unit: 4 } });
        expect(result.slots.map(slot => slot.rect)).toEqual([
            { x: 0, y: 0, w: 84, h: 60 },
            { x: 88, y: 0, w: 84, h: 60 },
        ]);
        expect(result.width).toBe(172);
    });

    it('lays out board rows of fields with field and row gaps', () => {
        const board = new FlapBoard({
            rows: 2,
            schema: {
                time: textField({ sequence: alnum, length: 2 }),
                dest: { sequence: cities, length: 1, cells: 3 },
            },
        });
        const result = layout(board, {
            cell: { w: 20, h: 30 },
            gap: { unit: 2, field: 10, row: 6 },
        });
        expect(
            result.slots.map(slot => [
                slot.row,
                slot.field,
                slot.index,
                slot.rect.x,
                slot.rect.y,
                slot.rect.w,
            ])
        ).toEqual([
            [0, 'time', 0, 0, 0, 20],
            [0, 'time', 1, 22, 0, 20],
            [0, 'dest', 0, 52, 0, 64],
            [1, 'time', 0, 0, 36, 20],
            [1, 'time', 1, 22, 36, 20],
            [1, 'dest', 0, 52, 36, 64],
        ]);
        expect(result.width).toBe(116);
        expect(result.height).toBe(66);
        expect(result.slots[2].unit).toBe(board.field(0, 'dest').units[0]);
        expect(result.slots[2].sequence).toBe(cities);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run test/render/layout.test.ts`
Expected: FAIL — cannot resolve `../../src/render/layout`.

- [ ] **Step 3: Implement layout**

`src/render/layout.ts`:

```ts
import { FlapBoard } from '../core/board';
import { FlapField } from '../core/field';
import type { FlapSequence } from '../core/sequence';
import { FlapUnit } from '../core/unit';

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface LayoutOptions {
    /** Size of one cell in CSS px. A unit spans `cells` cells horizontally. */
    cell: { w: number; h: number };
    /** Gaps in CSS px between units, fields and rows. Default 0. */
    gap?: { unit?: number; field?: number; row?: number };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RenderTarget =
    | FlapBoard<any>
    | FlapField<any, any>
    | FlapUnit<any>;

export interface UnitSlot {
    unit: FlapUnit<any>;
    sequence: FlapSequence<any>;
    rect: Rect;
    row: number;
    /** Field name; {@link SINGLE_FIELD} for unit and field targets. */
    field: string;
    /** Index of the unit within its field. */
    index: number;
}

interface FieldRun {
    name: string;
    units: readonly FlapUnit<any>[];
    cells: number;
    sequence: FlapSequence<any>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface BoardLayout {
    slots: UnitSlot[];
    width: number;
    height: number;
}

/** Field name used for the slots of a FlapField or FlapUnit target. */
export const SINGLE_FIELD = '';

function rowsOf(target: RenderTarget): FieldRun[][] {
    if (target instanceof FlapUnit) {
        return [
            [
                {
                    name: SINGLE_FIELD,
                    units: [target],
                    cells: 1,
                    sequence: target.sequence,
                },
            ],
        ];
    }
    if (target instanceof FlapField) {
        return [
            [
                {
                    name: SINGLE_FIELD,
                    units: target.units,
                    cells: target.cells,
                    sequence: target.sequence,
                },
            ],
        ];
    }
    return Array.from({ length: target.rowCount }, (_, row) =>
        target.fieldNames.map(name => {
            const field = target.field(row, name);
            return {
                name,
                units: field.units,
                cells: field.cells,
                sequence: field.sequence,
            };
        })
    );
}

/** Computes the rect of every unit of `target`, in CSS px. */
export function layout(
    target: RenderTarget,
    options: LayoutOptions
): BoardLayout {
    const { cell } = options;
    const unitGap = options.gap?.unit ?? 0;
    const fieldGap = options.gap?.field ?? 0;
    const rowGap = options.gap?.row ?? 0;
    const slots: UnitSlot[] = [];
    let width = 0;
    let y = 0;
    rowsOf(target).forEach((runs, row) => {
        if (row > 0) {
            y += rowGap;
        }
        let x = 0;
        runs.forEach((run, runIndex) => {
            if (runIndex > 0) {
                x += fieldGap;
            }
            const w = run.cells * cell.w + (run.cells - 1) * unitGap;
            run.units.forEach((unit, index) => {
                if (index > 0) {
                    x += unitGap;
                }
                slots.push({
                    unit,
                    sequence: run.sequence,
                    rect: { x, y, w, h: cell.h },
                    row,
                    field: run.name,
                    index,
                });
                x += w;
            });
        });
        width = Math.max(width, x);
        y += cell.h;
    });
    return { slots, width, height: y };
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `bunx vitest run test/render && bun run typecheck`
Expected: all render tests PASS; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
bunx prettier --write src test
git add -A
git commit -m "feat(render): add layout for units, fields and boards

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Faces, face cache and canvas test fakes

**Files:**
- Create: `src/render/faces.ts`, `src/render/face-cache.ts`, `test/helpers/fake-canvas.ts`
- Test: `test/render/faces.test.ts`, `test/render/face-cache.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D`
  - `type FacePainter<T> = (ctx: Ctx2D, flap: T, width: number, height: number) => void`
  - `interface TextFaceOptions { font: string; color: string; background: string }`, `function textFace(options): FacePainter<string>`, `function colorFace(): FacePainter<string>`
  - `interface FaceCanvas { width: number; height: number; getContext(contextId: '2d'): Ctx2D | null }`, `type CanvasFactory = (width: number, height: number) => FaceCanvas`, `const defaultCanvasFactory: CanvasFactory`
  - `interface FaceCacheOptions<T> { key; painter; width; height; dpr?; radius?; createCanvas? }`, `class FaceCache<T>` with `get(flap): FaceCanvas`, `resize(width, height, dpr)`, `clear()`, `size`
  - Test helpers: `FakeContext` (records `{ name, args, fillStyle, composite }`; `callsNamed(name)`, `reset()`), `FakeCanvas`, `fakeCanvasFactory`, `asCtx`, `asCanvasElement`, `type RecordedCall`

- [ ] **Step 1: Create the test fakes**

`test/helpers/fake-canvas.ts`:

```ts
import type { FaceCanvas } from '../../src/render/face-cache';
import type { Ctx2D } from '../../src/render/faces';

export interface RecordedCall {
    name: string;
    args: unknown[];
    /** `fillStyle` at the time of the call. */
    fillStyle: unknown;
    /** `globalCompositeOperation` at the time of the call. */
    composite: string;
}

/** Records 2D context calls; implements only what this package uses. */
export class FakeContext {
    readonly calls: RecordedCall[] = [];
    fillStyle: unknown = '#000000';
    font = '10px sans-serif';
    textAlign = 'start';
    textBaseline = 'alphabetic';
    globalCompositeOperation = 'source-over';
    private readonly stack: { fillStyle: unknown; composite: string }[] = [];

    save(): void {
        this.stack.push({
            fillStyle: this.fillStyle,
            composite: this.globalCompositeOperation,
        });
        this.record('save', []);
    }

    restore(): void {
        const saved = this.stack.pop();
        if (saved) {
            this.fillStyle = saved.fillStyle;
            this.globalCompositeOperation = saved.composite;
        }
        this.record('restore', []);
    }

    beginPath(): void {
        this.record('beginPath', []);
    }

    roundRect(...args: unknown[]): void {
        this.record('roundRect', args);
    }

    clip(): void {
        this.record('clip', []);
    }

    setTransform(...args: unknown[]): void {
        this.record('setTransform', args);
    }

    fillRect(...args: unknown[]): void {
        this.record('fillRect', args);
    }

    clearRect(...args: unknown[]): void {
        this.record('clearRect', args);
    }

    fillText(...args: unknown[]): void {
        this.record('fillText', args);
    }

    drawImage(...args: unknown[]): void {
        this.record('drawImage', args);
    }

    callsNamed(name: string): RecordedCall[] {
        return this.calls.filter(call => call.name === name);
    }

    reset(): void {
        this.calls.length = 0;
    }

    private record(name: string, args: unknown[]): void {
        this.calls.push({
            name,
            args,
            fillStyle: this.fillStyle,
            composite: this.globalCompositeOperation,
        });
    }
}

export class FakeCanvas {
    width: number;
    height: number;
    readonly style: Record<string, string> = {};
    readonly context = new FakeContext();

    constructor(width = 0, height = 0) {
        this.width = width;
        this.height = height;
    }

    getContext(contextId: '2d'): FakeContext {
        void contextId;
        return this.context;
    }
}

export const fakeCanvasFactory = (width: number, height: number): FaceCanvas =>
    new FakeCanvas(width, height) as unknown as FaceCanvas;

export const asCtx = (ctx: FakeContext): Ctx2D => ctx as unknown as Ctx2D;

export const asCanvasElement = (canvas: FakeCanvas): HTMLCanvasElement =>
    canvas as unknown as HTMLCanvasElement;
```

- [ ] **Step 2: Write the failing tests**

`test/render/faces.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { colorFace, textFace } from '../../src/render/faces';
import { asCtx, FakeContext } from '../helpers/fake-canvas';

describe('textFace', () => {
    it('fills the background and centres the text', () => {
        const ctx = new FakeContext();
        textFace({
            font: 'bold 32px sans-serif',
            color: '#fff',
            background: '#111',
        })(asCtx(ctx), 'A', 40, 60);
        const [fill] = ctx.callsNamed('fillRect');
        expect(fill.args).toEqual([0, 0, 40, 60]);
        expect(fill.fillStyle).toBe('#111');
        const [text] = ctx.callsNamed('fillText');
        expect(text.args).toEqual(['A', 20, 30]);
        expect(text.fillStyle).toBe('#fff');
        expect(ctx.font).toBe('bold 32px sans-serif');
        expect(ctx.textAlign).toBe('center');
        expect(ctx.textBaseline).toBe('middle');
    });
});

describe('colorFace', () => {
    it('fills the face with the flap colour', () => {
        const ctx = new FakeContext();
        colorFace()(asCtx(ctx), '#e4572e', 40, 60);
        const [fill] = ctx.callsNamed('fillRect');
        expect(fill.args).toEqual([0, 0, 40, 60]);
        expect(fill.fillStyle).toBe('#e4572e');
    });
});
```

`test/render/face-cache.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { FaceCache, type FaceCacheOptions } from '../../src/render/face-cache';
import type { FacePainter } from '../../src/render/faces';
import { type FakeCanvas, fakeCanvasFactory } from '../helpers/fake-canvas';

function makeCache(overrides: Partial<FaceCacheOptions<string>> = {}) {
    const painter = vi.fn<FacePainter<string>>();
    const createCanvas = vi.fn(fakeCanvasFactory);
    const cache = new FaceCache<string>({
        key: flap => flap,
        painter,
        width: 40,
        height: 60,
        dpr: 2,
        createCanvas,
        ...overrides,
    });
    return { cache, painter, createCanvas };
}

describe('FaceCache', () => {
    it('paints each face once', () => {
        const { cache, painter } = makeCache();
        const first = cache.get('A');
        expect(cache.get('A')).toBe(first);
        expect(painter).toHaveBeenCalledTimes(1);
        expect(cache.size).toBe(1);
    });

    it('paints at device-pixel resolution in CSS pixel units', () => {
        const { cache, painter, createCanvas } = makeCache();
        const face = cache.get('A') as unknown as FakeCanvas;
        expect(createCanvas).toHaveBeenCalledWith(80, 120);
        expect(face.context.callsNamed('setTransform')[0].args).toEqual([
            2, 0, 0, 2, 0, 0,
        ]);
        expect(painter).toHaveBeenCalledWith(face.context, 'A', 40, 60);
    });

    it('clips to a rounded rect when radius > 0', () => {
        const { cache } = makeCache({ radius: 6 });
        const face = cache.get('A') as unknown as FakeCanvas;
        expect(face.context.callsNamed('roundRect')[0].args).toEqual([
            0, 0, 40, 60, 6,
        ]);
        expect(face.context.callsNamed('clip')).toHaveLength(1);
    });

    it('does not clip when radius is 0', () => {
        const { cache } = makeCache();
        const face = cache.get('A') as unknown as FakeCanvas;
        expect(face.context.callsNamed('roundRect')).toHaveLength(0);
    });

    it('keys faces with the key function', () => {
        const { cache, painter } = makeCache({ key: flap => flap.toLowerCase() });
        cache.get('a');
        cache.get('A');
        expect(painter).toHaveBeenCalledTimes(1);
    });

    it('clears and repaints at the new size after resize', () => {
        const { cache, painter, createCanvas } = makeCache();
        cache.get('A');
        cache.resize(20, 30, 1);
        expect(cache.size).toBe(0);
        cache.get('A');
        expect(painter).toHaveBeenCalledTimes(2);
        expect(createCanvas).toHaveBeenLastCalledWith(20, 30);
    });

    it('propagates painter errors and caches nothing', () => {
        const { cache } = makeCache({
            painter: () => {
                throw new Error('boom');
            },
        });
        expect(() => cache.get('A')).toThrow('boom');
        expect(cache.size).toBe(0);
    });

    it('throws when a 2D context is unavailable', () => {
        const { cache } = makeCache({
            createCanvas: () => ({
                width: 1,
                height: 1,
                getContext: () => null,
            }),
        });
        expect(() => cache.get('A')).toThrow(/2D canvas context/);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bunx vitest run test/render/faces.test.ts test/render/face-cache.test.ts`
Expected: FAIL — cannot resolve `../../src/render/faces` and `../../src/render/face-cache`.

- [ ] **Step 4: Implement faces**

`src/render/faces.ts`:

```ts
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draws one full flap face in CSS px. Used by both renderers. */
export type FacePainter<T> = (
    ctx: Ctx2D,
    flap: T,
    width: number,
    height: number
) => void;

export interface TextFaceOptions {
    /** CSS font shorthand, e.g. `'600 26px ui-monospace, monospace'`. */
    font: string;
    color: string;
    background: string;
}

/** Fills the background and draws the flap text centred on the hinge. */
export function textFace(options: TextFaceOptions): FacePainter<string> {
    return (ctx, flap, width, height) => {
        ctx.fillStyle = options.background;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = options.color;
        ctx.font = options.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(flap, width / 2, height / 2);
    };
}

/** Fills the face with the flap, which is a CSS colour. */
export function colorFace(): FacePainter<string> {
    return (ctx, flap, width, height) => {
        ctx.fillStyle = flap;
        ctx.fillRect(0, 0, width, height);
    };
}
```

- [ ] **Step 5: Implement the face cache**

`src/render/face-cache.ts`:

```ts
import type { Ctx2D, FacePainter } from './faces';

/** The parts of HTMLCanvasElement / OffscreenCanvas the cache needs. */
export interface FaceCanvas {
    width: number;
    height: number;
    getContext(contextId: '2d'): Ctx2D | null;
}

export type CanvasFactory = (width: number, height: number) => FaceCanvas;

export const defaultCanvasFactory: CanvasFactory = (width, height) => {
    if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(width, height);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
};

export interface FaceCacheOptions<T> {
    key: (flap: T) => string;
    painter: FacePainter<T>;
    /** Face size in CSS px. */
    width: number;
    height: number;
    /** Device pixel ratio. Default 1. */
    dpr?: number;
    /** Corner radius in CSS px. Default 0. */
    radius?: number;
    createCanvas?: CanvasFactory;
}

/** Paints each flap face once into an offscreen canvas and reuses it. */
export class FaceCache<T> {
    private readonly faces = new Map<string, FaceCanvas>();
    private readonly key: (flap: T) => string;
    private readonly painter: FacePainter<T>;
    private readonly radius: number;
    private readonly createCanvas: CanvasFactory;
    private width: number;
    private height: number;
    private dpr: number;

    constructor(options: FaceCacheOptions<T>) {
        this.key = options.key;
        this.painter = options.painter;
        this.width = options.width;
        this.height = options.height;
        this.dpr = options.dpr ?? 1;
        this.radius = options.radius ?? 0;
        this.createCanvas = options.createCanvas ?? defaultCanvasFactory;
    }

    get size(): number {
        return this.faces.size;
    }

    get(flap: T): FaceCanvas {
        const key = this.key(flap);
        const cached = this.faces.get(key);
        if (cached) {
            return cached;
        }
        const face = this.paint(flap);
        this.faces.set(key, face);
        return face;
    }

    resize(width: number, height: number, dpr: number): void {
        this.width = width;
        this.height = height;
        this.dpr = dpr;
        this.clear();
    }

    clear(): void {
        this.faces.clear();
    }

    private paint(flap: T): FaceCanvas {
        const canvas = this.createCanvas(
            Math.max(1, Math.round(this.width * this.dpr)),
            Math.max(1, Math.round(this.height * this.dpr))
        );
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('FaceCache: 2D canvas context is unavailable');
        }
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        if (this.radius > 0) {
            ctx.beginPath();
            ctx.roundRect(0, 0, this.width, this.height, this.radius);
            ctx.clip();
        }
        this.painter(ctx, flap, this.width, this.height);
        return canvas;
    }
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `bunx vitest run test/render && bun run typecheck`
Expected: all render tests PASS; `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
bunx prettier --write src test
git add -A
git commit -m "feat(render): add face painters and face cache

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: drawUnit

**Files:**
- Create: `src/canvas/draw-unit.ts`
- Test: `test/canvas/draw-unit.test.ts`

**Interfaces:**
- Consumes: `UnitState<T>`; `FaceCanvas`; `Ctx2D`; `FlipCurve`, `defaultFlipCurve`; `flipGeometry`, `FaceRef`, `Half`; `Rect`; `FlapStyle`, `resolveStyle`.
- Produces:
  - `interface FaceSource<T> { get(flap: T): FaceCanvas }` (a `FaceCache<T>` satisfies it)
  - `interface DrawUnitOptions<T> { faces: FaceSource<T>; style?: FlapStyle; flipCurve?: FlipCurve }`
  - `function drawUnit<T>(ctx: Ctx2D, state: UnitState<T>, rect: Rect, options: DrawUnitOptions<T>): void` — draws without clearing; shadow and shade use `source-atop`.

- [ ] **Step 1: Write the failing test**

`test/canvas/draw-unit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { drawUnit } from '../../src/canvas/draw-unit';
import type { UnitState } from '../../src/core/unit';
import type { FaceCanvas } from '../../src/render/face-cache';
import type { FlapStyle } from '../../src/render/style';
import {
    asCtx,
    FakeCanvas,
    FakeContext,
    type RecordedCall,
} from '../helpers/fake-canvas';

const faceA = new FakeCanvas(80, 120);
const faceB = new FakeCanvas(80, 120);
const faces = {
    get: (flap: string) =>
        (flap === 'A' ? faceA : faceB) as unknown as FaceCanvas,
};
const linear = (progress: number) => progress * 180;
const rect = { x: 10, y: 20, w: 40, h: 60 };
const COS45 = Math.cos(Math.PI / 4);

function flipping(progress: number, direction: 1 | -1 = 1): UnitState<string> {
    return { current: 'A', next: 'B', progress, direction };
}

function draw(
    state: UnitState<string>,
    options: { style?: FlapStyle; flipCurve?: (p: number) => number } = {}
): FakeContext {
    const ctx = new FakeContext();
    drawUnit(asCtx(ctx), state, rect, { faces, flipCurve: linear, ...options });
    return ctx;
}

function images(ctx: FakeContext) {
    return ctx.callsNamed('drawImage').map(call => {
        const [image, , sy, , , dx, dy, dw, dh] = call.args as [
            unknown,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
        ];
        return {
            face: image === faceA ? 'A' : 'B',
            half: sy === 0 ? 'top' : 'bottom',
            dx,
            dy,
            dw,
            dh,
        };
    });
}

function alphaOf(call: RecordedCall): number {
    const match = /rgba\(0, 0, 0, ([\d.e-]+)\)/.exec(String(call.fillStyle));
    if (!match) {
        throw new Error(`not a black rgba fill: ${String(call.fillStyle)}`);
    }
    return Number(match[1]);
}

describe('drawUnit', () => {
    it('draws both halves of the current flap when settled', () => {
        const ctx = draw({ current: 'A', next: null, progress: 0, direction: 1 });
        expect(images(ctx)).toEqual([
            { face: 'A', half: 'top', dx: 10, dy: 20, dw: 40, dh: 30 },
            { face: 'A', half: 'bottom', dx: 10, dy: 50, dw: 40, dh: 30 },
        ]);
        const fills = ctx.callsNamed('fillRect');
        expect(fills).toHaveLength(1);
        expect(fills[0].args).toEqual([10, 49.5, 40, 1]);
        expect(fills[0].fillStyle).toBe('rgba(0, 0, 0, 0.6)');
    });

    it('folds the top of the current flap down during the first half', () => {
        const [staticTop, staticBottom, flap] = images(draw(flipping(0.25)));
        expect(staticTop).toMatchObject({ face: 'B', half: 'top', dy: 20, dh: 30 });
        expect(staticBottom).toMatchObject({
            face: 'A',
            half: 'bottom',
            dy: 50,
            dh: 30,
        });
        expect(flap).toMatchObject({ face: 'A', half: 'top', dx: 10, dw: 40 });
        expect(flap.dh).toBeCloseTo(30 * COS45);
        expect(flap.dy).toBeCloseTo(50 - 30 * COS45);
    });

    it('casts a shadow on the bottom half and shades the flap', () => {
        const ctx = draw(flipping(0.25));
        const [shadow, shade, hinge] = ctx.callsNamed('fillRect');
        expect(shadow.args).toEqual([10, 50, 40, 30]);
        expect(shadow.composite).toBe('source-atop');
        expect(alphaOf(shadow)).toBeCloseTo(Math.sin(Math.PI / 4) * 0.35);
        expect(shade.composite).toBe('source-atop');
        expect(alphaOf(shade)).toBeCloseTo((1 - COS45) * 0.5);
        expect(hinge.composite).toBe('source-over');
    });

    it('unfolds the bottom of the next flap during the second half', () => {
        const flap = images(draw(flipping(0.75)))[2];
        expect(flap).toMatchObject({ face: 'B', half: 'bottom', dy: 50 });
        expect(flap.dh).toBeCloseTo(30 * COS45);
    });

    it('mirrors the flip when travelling backward', () => {
        const ctx = draw(flipping(0.25, -1));
        const [staticTop, staticBottom, flap] = images(ctx);
        expect(staticTop).toMatchObject({ face: 'A', half: 'top' });
        expect(staticBottom).toMatchObject({ face: 'B', half: 'bottom' });
        expect(flap).toMatchObject({ face: 'A', half: 'bottom', dy: 50 });
        expect(ctx.callsNamed('fillRect')[0].args).toEqual([10, 20, 40, 30]);
    });

    it('skips the flap when it is edge-on', () => {
        expect(images(draw(flipping(0.5)))).toHaveLength(2);
    });

    it('skips shading, shadow and hinge when the style turns them off', () => {
        const ctx = draw(flipping(0.25), {
            style: { shade: 0, shadow: 0, hingeGap: 0 },
        });
        expect(ctx.callsNamed('fillRect')).toHaveLength(0);
    });

    it('uses the default flip curve when none is given', () => {
        const ctx = new FakeContext();
        drawUnit(asCtx(ctx), flipping(0.4), rect, { faces });
        expect(images(ctx)[2].dh).toBeCloseTo(30 * COS45);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run test/canvas/draw-unit.test.ts`
Expected: FAIL — cannot resolve `../../src/canvas/draw-unit`.

- [ ] **Step 3: Implement drawUnit**

`src/canvas/draw-unit.ts`:

```ts
import type { UnitState } from '../core/unit';
import type { FaceCanvas } from '../render/face-cache';
import type { Ctx2D } from '../render/faces';
import { defaultFlipCurve, type FlipCurve } from '../render/flip-curve';
import { type FaceRef, flipGeometry, type Half } from '../render/flip-geometry';
import type { Rect } from '../render/layout';
import { type FlapStyle, resolveStyle } from '../render/style';

/** Anything that returns a painted face for a flap, e.g. a FaceCache. */
export interface FaceSource<T> {
    get(flap: T): FaceCanvas;
}

export interface DrawUnitOptions<T> {
    faces: FaceSource<T>;
    style?: FlapStyle;
    flipCurve?: FlipCurve;
}

/**
 * Draws one unit into `rect` (CSS px). Does not clear first. Shadows use
 * `source-atop` so they only darken pixels already drawn.
 */
export function drawUnit<T>(
    ctx: Ctx2D,
    state: UnitState<T>,
    rect: Rect,
    options: DrawUnitOptions<T>
): void {
    const style = resolveStyle(options.style);
    const half = rect.h / 2;
    const hingeY = rect.y + half;
    const current = options.faces.get(state.current);
    if (state.next === null) {
        drawHalf(ctx, current, 'top', rect.x, rect.y, rect.w, half);
        drawHalf(ctx, current, 'bottom', rect.x, hingeY, rect.w, half);
    } else {
        const next = options.faces.get(state.next);
        const pick = (ref: FaceRef): FaceCanvas =>
            ref === 'current' ? current : next;
        const curve = options.flipCurve ?? defaultFlipCurve();
        const geometry = flipGeometry(curve(state.progress), state.direction);
        drawHalf(ctx, pick(geometry.staticTop), 'top', rect.x, rect.y, rect.w, half);
        drawHalf(
            ctx,
            pick(geometry.staticBottom),
            'bottom',
            rect.x,
            hingeY,
            rect.w,
            half
        );
        const shadowAlpha = geometry.castShadow * style.shadow;
        if (shadowAlpha > 0.001) {
            const shadowY = geometry.shadowHalf === 'top' ? rect.y : hingeY;
            darken(ctx, shadowAlpha, rect.x, shadowY, rect.w, half);
        }
        const flapHeight = half * geometry.flap.scaleY;
        if (flapHeight > 0.01) {
            const flapY =
                geometry.flap.half === 'top' ? hingeY - flapHeight : hingeY;
            drawHalf(
                ctx,
                pick(geometry.flap.face),
                geometry.flap.half,
                rect.x,
                flapY,
                rect.w,
                flapHeight
            );
            const shadeAlpha = geometry.flapShade * style.shade;
            if (shadeAlpha > 0.001) {
                darken(ctx, shadeAlpha, rect.x, flapY, rect.w, flapHeight);
            }
        }
    }
    if (style.hingeGap > 0) {
        ctx.fillStyle = style.hingeColor;
        ctx.fillRect(
            rect.x,
            hingeY - style.hingeGap / 2,
            rect.w,
            style.hingeGap
        );
    }
}

function drawHalf(
    ctx: Ctx2D,
    face: FaceCanvas,
    half: Half,
    x: number,
    y: number,
    w: number,
    h: number
): void {
    const sourceHalf = face.height / 2;
    ctx.drawImage(
        face as unknown as CanvasImageSource,
        0,
        half === 'top' ? 0 : sourceHalf,
        face.width,
        sourceHalf,
        x,
        y,
        w,
        h
    );
}

function darken(
    ctx: Ctx2D,
    alpha: number,
    x: number,
    y: number,
    w: number,
    h: number
): void {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `bunx vitest run test/canvas && bun run typecheck`
Expected: 8 drawUnit tests PASS; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
bunx prettier --write src test
git add -A
git commit -m "feat(canvas): add drawUnit

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: CanvasFlapRenderer and the canvas entry point

**Files:**
- Create: `src/canvas/renderer.ts`, `src/canvas/index.ts`
- Test: `test/canvas/renderer.test.ts`, `test/index.test.ts`

**Interfaces:**
- Consumes: `drawUnit` (Task 10); `FaceCache`, `CanvasFactory`; `FacePainter`; `defaultFlipCurve`, `FlipCurve`; `layout`, `BoardLayout`, `LayoutOptions`, `RenderTarget`, `UnitSlot`; `resolveStyle`, `FlapStyle`, `ResolvedFlapStyle`; `MAX_FRAME_DT`.
- Produces:
  - `interface FrameScheduler { request(callback: (time: number) => void): number; cancel(id: number): void }`
  - `interface CanvasFlapRendererOptions extends LayoutOptions { canvas: HTMLCanvasElement; target: RenderTarget; face: FacePainter<any> | Record<string, FacePainter<any>>; style?; flipCurve?; dpr?; createCanvas?; scheduler? }`
  - `class CanvasFlapRenderer` with `readonly target`, `width`, `height`, `render()`, `start()`, `stop()`, `resize()`, `destroy()`
  - `@kinnet-studio/split-flaps/canvas` entry exports (see `src/canvas/index.ts` below)

- [ ] **Step 1: Write the failing tests**

`test/canvas/renderer.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import {
    CanvasFlapRenderer,
    type CanvasFlapRendererOptions,
    type FrameScheduler,
} from '../../src/canvas/renderer';
import { FlapBoard } from '../../src/core/board';
import { FlapField, textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { textFace } from '../../src/render/faces';
import type { RenderTarget } from '../../src/render/layout';
import {
    asCanvasElement,
    FakeCanvas,
    fakeCanvasFactory,
} from '../helpers/fake-canvas';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const painter = textFace({
    font: '20px sans-serif',
    color: '#fff',
    background: '#000',
});

function fakeScheduler() {
    const callbacks = new Map<number, (time: number) => void>();
    const cancelled: number[] = [];
    let nextId = 1;
    const scheduler: FrameScheduler = {
        request: callback => {
            const id = nextId++;
            callbacks.set(id, callback);
            return id;
        },
        cancel: id => {
            cancelled.push(id);
            callbacks.delete(id);
        },
    };
    const tick = (time: number) => {
        const pending = [...callbacks.values()];
        callbacks.clear();
        pending.forEach(callback => callback(time));
    };
    return { scheduler, callbacks, cancelled, tick };
}

function setup(
    target: RenderTarget,
    extra: Partial<CanvasFlapRendererOptions> = {}
) {
    const canvas = new FakeCanvas();
    const frames = fakeScheduler();
    const renderer = new CanvasFlapRenderer({
        canvas: asCanvasElement(canvas),
        target,
        face: painter,
        cell: { w: 40, h: 60 },
        dpr: 2,
        createCanvas: fakeCanvasFactory,
        scheduler: frames.scheduler,
        ...extra,
    });
    return { canvas, ctx: canvas.context, frames, renderer };
}

const field = (length: number) =>
    new FlapField(
        textField({ sequence: alnum, length, unit: { flipDuration: 10 } })
    );

const twoFieldBoard = () =>
    new FlapBoard({
        rows: 1,
        schema: {
            a: textField({ sequence: alnum, length: 1 }),
            b: textField({ sequence: alnum, length: 1 }),
        },
    });

describe('CanvasFlapRenderer', () => {
    it('sizes the canvas to the layout at the device pixel ratio', () => {
        const { canvas, ctx, renderer } = setup(new FlapUnit({ sequence: alnum }));
        expect([canvas.width, canvas.height]).toEqual([80, 120]);
        expect(canvas.style).toMatchObject({ width: '40px', height: '60px' });
        expect(ctx.callsNamed('setTransform')[0].args).toEqual([
            2, 0, 0, 2, 0, 0,
        ]);
        expect([renderer.width, renderer.height]).toEqual([40, 60]);
    });

    it('draws every unit on construction', () => {
        const { ctx } = setup(field(3));
        expect(ctx.callsNamed('clearRect')).toHaveLength(3);
        expect(ctx.callsNamed('drawImage')).toHaveLength(6);
    });

    it('redraws only the units that changed', () => {
        const target = field(2);
        const { ctx, renderer } = setup(target);
        ctx.reset();
        renderer.render();
        expect(ctx.callsNamed('clearRect')).toHaveLength(0);

        target.units[1].setTarget('A');
        target.update(5);
        ctx.reset();
        renderer.render();
        expect(ctx.callsNamed('clearRect').map(call => call.args)).toEqual([
            [40, 0, 40, 60],
        ]);
    });

    it('paints one face per distinct flap at device resolution', () => {
        const createCanvas = vi.fn(fakeCanvasFactory);
        setup(field(3), { createCanvas });
        expect(createCanvas).toHaveBeenCalledTimes(1);
        expect(createCanvas).toHaveBeenCalledWith(80, 120);
    });

    it('uses a painter per field for boards', () => {
        const a = vi.fn(painter);
        const b = vi.fn(painter);
        setup(twoFieldBoard(), { face: { a, b } });
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
    });

    it('throws when a field has no painter', () => {
        expect(() => setup(twoFieldBoard(), { face: { a: painter } })).toThrow(
            'no face painter for field "b"'
        );
    });

    it('drives update with frame deltas capped at 250 ms', () => {
        const unit = new FlapUnit({ sequence: alnum });
        const update = vi.spyOn(unit, 'update');
        const { frames, renderer } = setup(unit);
        renderer.start();
        frames.tick(1000);
        expect(update).not.toHaveBeenCalled();
        frames.tick(1016);
        expect(update).toHaveBeenLastCalledWith(16);
        frames.tick(3000);
        expect(update).toHaveBeenLastCalledWith(250);
    });

    it('stops and restarts the frame loop', () => {
        const { frames, renderer } = setup(field(1));
        renderer.start();
        renderer.stop();
        expect(frames.cancelled).toHaveLength(1);
        expect(frames.callbacks.size).toBe(0);
        renderer.start();
        expect(frames.callbacks.size).toBe(1);
    });

    it('redraws everything on resize', () => {
        const { ctx, renderer } = setup(field(2));
        ctx.reset();
        renderer.resize();
        expect(ctx.callsNamed('clearRect')).toHaveLength(2);
        expect(ctx.callsNamed('setTransform')).toHaveLength(1);
    });

    it('stops the loop on destroy', () => {
        const { frames, renderer } = setup(field(1));
        renderer.start();
        renderer.destroy();
        expect(frames.callbacks.size).toBe(0);
    });

    it('throws when the canvas has no 2D context', () => {
        const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
        expect(
            () =>
                new CanvasFlapRenderer({
                    canvas,
                    target: field(1),
                    face: painter,
                    cell: { w: 1, h: 1 },
                })
        ).toThrow(/2D canvas context/);
    });
});
```

`test/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import * as canvas from '../src/canvas';
import * as core from '../src/core';

describe('entry points', () => {
    it('exports the core runtime API', () => {
        expect(Object.keys(core).sort()).toEqual(
            [
                'CHARSETS',
                'DEFAULT_FLIP_DURATION',
                'DEFAULT_HOLD',
                'FlapBoard',
                'FlapField',
                'FlapSequence',
                'FlapUnit',
                'defineField',
                'fieldStaggerDelays',
                'planPath',
                'textField',
            ].sort()
        );
    });

    it('exports the canvas renderer and shared render helpers', () => {
        expect(Object.keys(canvas)).toEqual(
            expect.arrayContaining([
                'CanvasFlapRenderer',
                'DEFAULT_FLIP_KEYFRAMES',
                'DEFAULT_STYLE',
                'FaceCache',
                'MAX_FRAME_DT',
                'colorFace',
                'createFlipCurve',
                'drawUnit',
                'flipGeometry',
                'layout',
                'textFace',
            ])
        );
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run test/canvas/renderer.test.ts test/index.test.ts`
Expected: FAIL — cannot resolve `../../src/canvas/renderer` and `../src/canvas`.

- [ ] **Step 3: Implement the renderer**

`src/canvas/renderer.ts`:

```ts
import { type CanvasFactory, FaceCache } from '../render/face-cache';
import type { FacePainter } from '../render/faces';
import { defaultFlipCurve, type FlipCurve } from '../render/flip-curve';
import { MAX_FRAME_DT } from '../render/frame';
import {
    type BoardLayout,
    layout,
    type LayoutOptions,
    type RenderTarget,
    type UnitSlot,
} from '../render/layout';
import {
    type FlapStyle,
    resolveStyle,
    type ResolvedFlapStyle,
} from '../render/style';
import { drawUnit } from './draw-unit';

export interface FrameScheduler {
    request(callback: (time: number) => void): number;
    cancel(id: number): void;
}

const browserScheduler: FrameScheduler = {
    request: callback => requestAnimationFrame(callback),
    cancel: id => cancelAnimationFrame(id),
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CanvasFlapRendererOptions extends LayoutOptions {
    canvas: HTMLCanvasElement;
    target: RenderTarget;
    /** One painter for every field, or one per board field name. */
    face: FacePainter<any> | Record<string, FacePainter<any>>;
    style?: FlapStyle;
    flipCurve?: FlipCurve;
    /** Default `globalThis.devicePixelRatio ?? 1`, re-read on resize(). */
    dpr?: number;
    /** Creates offscreen face canvases. */
    createCanvas?: CanvasFactory;
    /** Frame loop used by start(). Default requestAnimationFrame. */
    scheduler?: FrameScheduler;
}

/** Draws a board, field or unit into a 2D canvas. */
export class CanvasFlapRenderer {
    readonly target: RenderTarget;
    private readonly options: CanvasFlapRendererOptions;
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly boardLayout: BoardLayout;
    private readonly style: ResolvedFlapStyle;
    private readonly curve: FlipCurve;
    private readonly scheduler: FrameScheduler;
    private readonly caches = new Map<string, FaceCache<any>>();
    private readonly drawn = new Map<number, string>();
    private dpr = 1;
    private frame: number | null = null;
    private lastTime: number | null = null;

    constructor(options: CanvasFlapRendererOptions) {
        const ctx = options.canvas.getContext('2d');
        if (!ctx) {
            throw new Error(
                'CanvasFlapRenderer: 2D canvas context is unavailable'
            );
        }
        this.options = options;
        this.target = options.target;
        this.canvas = options.canvas;
        this.ctx = ctx;
        this.boardLayout = layout(options.target, options);
        this.style = resolveStyle(options.style);
        this.curve = options.flipCurve ?? defaultFlipCurve();
        this.scheduler = options.scheduler ?? browserScheduler;
        this.resize();
    }

    /** Layout width in CSS px. */
    get width(): number {
        return this.boardLayout.width;
    }

    /** Layout height in CSS px. */
    get height(): number {
        return this.boardLayout.height;
    }

    /** Draws every unit whose visible state changed since the last render. */
    render(): void {
        this.boardLayout.slots.forEach((slot, index) => {
            const state = slot.unit.state;
            const key = slot.sequence.key(state.current);
            const signature =
                state.next === null
                    ? key
                    : `${key}|${slot.sequence.key(state.next)}|${state.direction}|${this.curve(state.progress).toFixed(2)}`;
            if (this.drawn.get(index) === signature) {
                return;
            }
            const { x, y, w, h } = slot.rect;
            this.ctx.clearRect(x, y, w, h);
            drawUnit(this.ctx, state, slot.rect, {
                faces: this.facesFor(slot),
                style: this.style,
                flipCurve: this.curve,
            });
            this.drawn.set(index, signature);
        });
    }

    /** Runs a frame loop: update the target by the frame delta, then render. */
    start(): void {
        if (this.frame !== null) {
            return;
        }
        const loop = (time: number): void => {
            if (this.lastTime !== null) {
                const dt = Math.min(MAX_FRAME_DT, time - this.lastTime);
                if (dt > 0) {
                    this.target.update(dt);
                }
            }
            this.lastTime = time;
            this.render();
            this.frame = this.scheduler.request(loop);
        };
        this.frame = this.scheduler.request(loop);
    }

    stop(): void {
        if (this.frame !== null) {
            this.scheduler.cancel(this.frame);
        }
        this.frame = null;
        this.lastTime = null;
    }

    /** Re-reads the pixel ratio, resizes the backing store and redraws. */
    resize(): void {
        this.dpr = this.options.dpr ?? globalThis.devicePixelRatio ?? 1;
        const { width, height } = this.boardLayout;
        this.canvas.width = Math.round(width * this.dpr);
        this.canvas.height = Math.round(height * this.dpr);
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.caches.clear();
        this.drawn.clear();
        this.render();
    }

    destroy(): void {
        this.stop();
        this.caches.clear();
        this.drawn.clear();
    }

    private facesFor(slot: UnitSlot): FaceCache<any> {
        const cached = this.caches.get(slot.field);
        if (cached) {
            return cached;
        }
        const cache = new FaceCache<any>({
            key: flap => slot.sequence.key(flap),
            painter: this.painterFor(slot.field),
            width: slot.rect.w,
            height: slot.rect.h,
            dpr: this.dpr,
            radius: this.style.radius,
            createCanvas: this.options.createCanvas,
        });
        this.caches.set(slot.field, cache);
        return cache;
    }

    private painterFor(field: string): FacePainter<any> {
        const { face } = this.options;
        if (typeof face === 'function') {
            return face;
        }
        const painter = face[field];
        if (!painter) {
            throw new Error(
                `CanvasFlapRenderer: no face painter for field "${field}"`
            );
        }
        return painter;
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
```

- [ ] **Step 4: Create the canvas entry point**

`src/canvas/index.ts`:

```ts
export {
    CanvasFlapRenderer,
    type CanvasFlapRendererOptions,
    type FrameScheduler,
} from './renderer';
export { drawUnit, type DrawUnitOptions, type FaceSource } from './draw-unit';
export {
    colorFace,
    textFace,
    type Ctx2D,
    type FacePainter,
    type TextFaceOptions,
} from '../render/faces';
export {
    defaultCanvasFactory,
    FaceCache,
    type CanvasFactory,
    type FaceCacheOptions,
    type FaceCanvas,
} from '../render/face-cache';
export {
    createFlipCurve,
    DEFAULT_FLIP_KEYFRAMES,
    defaultFlipCurve,
    type FlipCurve,
} from '../render/flip-curve';
export {
    flipGeometry,
    type FaceRef,
    type FlipGeometry,
    type Half,
} from '../render/flip-geometry';
export {
    layout,
    SINGLE_FIELD,
    type BoardLayout,
    type LayoutOptions,
    type Rect,
    type RenderTarget,
    type UnitSlot,
} from '../render/layout';
export {
    DEFAULT_STYLE,
    resolveStyle,
    type FlapStyle,
    type ResolvedFlapStyle,
} from '../render/style';
export { MAX_FRAME_DT } from '../render/frame';
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `bun run test && bun run typecheck`
Expected: every test file PASSES; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
bunx prettier --write src test
git add -A
git commit -m "feat(canvas): add CanvasFlapRenderer and canvas entry point

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Pixi renderer

**Files:**
- Create: `src/pixi/textures.ts`, `src/pixi/unit-sprite.ts`, `src/pixi/view.ts`, `src/pixi/index.ts`
- Modify: `test/index.test.ts` (full replacement below)
- Test: `test/pixi/view.test.ts`

**Interfaces:**
- Consumes: `FaceCache`, `CanvasFactory`; `FacePainter`; `flipGeometry`, `FaceRef`; `FlipCurve`, `defaultFlipCurve`; `layout`, `BoardLayout`, `LayoutOptions`, `RenderTarget`, `UnitSlot`; `resolveStyle`, `FlapStyle`, `ResolvedFlapStyle`; `MAX_FRAME_DT`; `UnitState`; pixi.js `CanvasSource`, `Color`, `Container`, `Rectangle`, `Sprite`, `Texture`, `Ticker`, `ICanvas`, `DestroyOptions`.
- Produces:
  - `interface TextureFace<T> { readonly kind: 'split-flaps/texture-face'; texture(flap: T): Texture }`, `function textureFace<T>(texture: (flap: T) => Texture): TextureFace<T>`, `function isTextureFace(value: unknown): value is TextureFace<unknown>`, `type PixiFace<T> = FacePainter<T> | TextureFace<T>`
  - `interface HalfTextures { top: Texture; bottom: Texture }`, `class FaceTextures<T>` with `get(flap): HalfTextures`, `destroy()`
  - `class UnitSprite extends Container` with sprites `top`, `bottom`, `shadow`, `flap`, `hinge` and `apply(state, faces, curve)`
  - `interface PixiFlapViewOptions extends LayoutOptions { target; face: PixiFace<any> | Record<string, PixiFace<any>>; style?; flipCurve?; resolution?; createCanvas? }`
  - `class PixiFlapView extends Container` with `readonly target`, `attach(ticker)`, `detach()`, `update(dt)`, `sync()`, `destroy(options?)`

- [ ] **Step 1: Write the failing test**

`test/pixi/view.test.ts`:

```ts
import { Texture, TextureSource, type Ticker } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { FlapField, textField } from '../../src/core/field';
import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { PixiFlapView, textureFace, UnitSprite } from '../../src/pixi';
import { textFace } from '../../src/render/faces';
import { fakeCanvasFactory } from '../helpers/fake-canvas';

const seq = FlapSequence.chars('-AB');
const linear = (progress: number) => progress * 180;
const COS45 = Math.cos(Math.PI / 4);

function placeholderFaces() {
    const sources = new Map<string, TextureSource>();
    const sourceOf = (flap: string): TextureSource => {
        let source = sources.get(flap);
        if (!source) {
            source = new TextureSource({ width: 40, height: 60 });
            sources.set(flap, source);
        }
        return source;
    };
    const face = textureFace(
        (flap: string) => new Texture({ source: sourceOf(flap) })
    );
    return { sourceOf, face };
}

function setupUnit() {
    const unit = new FlapUnit({ sequence: seq, flipDuration: 100 });
    const { sourceOf, face } = placeholderFaces();
    const view = new PixiFlapView({
        target: unit,
        face,
        cell: { w: 40, h: 60 },
        flipCurve: linear,
    });
    const sprite = view.children[0] as UnitSprite;
    return { unit, view, sprite, sourceOf };
}

function fakeTicker() {
    const ticker = { add: vi.fn(), remove: vi.fn() };
    return { ticker, asTicker: ticker as unknown as Ticker };
}

describe('PixiFlapView', () => {
    it('creates one UnitSprite per unit at its layout position', () => {
        const field = new FlapField(textField({ sequence: seq, length: 2 }));
        const view = new PixiFlapView({
            target: field,
            face: placeholderFaces().face,
            cell: { w: 40, h: 60 },
            gap: { unit: 4 },
        });
        expect(view.children).toHaveLength(2);
        expect(view.children[1]).toBeInstanceOf(UnitSprite);
        expect(view.children[1].x).toBe(44);
    });

    it('shows both halves of the current flap when settled', () => {
        const { sprite, sourceOf } = setupUnit();
        expect(sprite.top.texture.source).toBe(sourceOf('-'));
        expect(sprite.top.texture.frame.height).toBe(30);
        expect(sprite.bottom.texture.frame.y).toBe(30);
        expect(sprite.bottom.y).toBe(30);
        expect(sprite.top.height).toBeCloseTo(30);
        expect(sprite.flap.visible).toBe(false);
        expect(sprite.shadow.visible).toBe(false);
    });

    it('folds the current top down during the first half', () => {
        const { unit, view, sprite, sourceOf } = setupUnit();
        unit.setTarget('A');
        view.update(25);
        expect(sprite.top.texture.source).toBe(sourceOf('A'));
        expect(sprite.bottom.texture.source).toBe(sourceOf('-'));
        expect(sprite.flap.visible).toBe(true);
        expect(sprite.flap.texture.source).toBe(sourceOf('-'));
        expect(sprite.flap.texture.frame.y).toBe(0);
        expect(sprite.flap.anchor.y).toBe(1);
        expect(sprite.flap.y).toBe(30);
        expect(sprite.flap.height).toBeCloseTo(30 * COS45);
        const gray = Math.round(255 * (1 - (1 - COS45) * 0.5));
        expect(sprite.flap.tint).toBe((gray << 16) | (gray << 8) | gray);
        expect(sprite.shadow.visible).toBe(true);
        expect(sprite.shadow.y).toBe(30);
        expect(sprite.shadow.alpha).toBeCloseTo(Math.sin(Math.PI / 4) * 0.35);
    });

    it('unfolds the next bottom during the second half', () => {
        const { unit, view, sprite, sourceOf } = setupUnit();
        unit.setTarget('A');
        view.update(75);
        expect(sprite.flap.texture.source).toBe(sourceOf('A'));
        expect(sprite.flap.texture.frame.y).toBe(30);
        expect(sprite.flap.anchor.y).toBe(0);
        expect(sprite.flap.height).toBeCloseTo(30 * COS45);
    });

    it('hides the flap when it is edge-on', () => {
        const { unit, view, sprite } = setupUnit();
        unit.setTarget('A');
        view.update(50);
        expect(sprite.flap.visible).toBe(false);
    });

    it('turns painted faces into textures at the given resolution', () => {
        const view = new PixiFlapView({
            target: new FlapUnit({ sequence: seq }),
            face: textFace({
                font: '20px sans-serif',
                color: '#fff',
                background: '#000',
            }),
            cell: { w: 40, h: 60 },
            resolution: 2,
            createCanvas: fakeCanvasFactory,
        });
        const sprite = view.children[0] as UnitSprite;
        expect(sprite.top.texture.frame.width).toBe(80);
        expect(sprite.top.texture.frame.height).toBe(60);
        expect(sprite.top.width).toBeCloseTo(40);
    });

    it('advances with a ticker, capping the frame delta at 250 ms', () => {
        const { unit, view } = setupUnit();
        const { ticker, asTicker } = fakeTicker();
        view.attach(asTicker);
        const tick = ticker.add.mock.calls[0][0] as (t: Ticker) => void;
        unit.spin();
        tick({ deltaMS: 25 } as Ticker);
        expect(unit.state.progress).toBeCloseTo(0.25);
        tick({ deltaMS: 1000 } as Ticker);
        expect(unit.state).toMatchObject({ current: 'B', next: '-' });
        expect(unit.state.progress).toBeCloseTo(0.75);
        view.detach();
        expect(ticker.remove).toHaveBeenCalledWith(tick);
    });

    it('detaches from its ticker when destroyed', () => {
        const { view } = setupUnit();
        const { ticker, asTicker } = fakeTicker();
        view.attach(asTicker);
        view.destroy();
        expect(ticker.remove).toHaveBeenCalledTimes(1);
        expect(view.destroyed).toBe(true);
    });

    it('throws when a board field has no face', () => {
        const board = new FlapBoard({
            rows: 1,
            schema: {
                a: textField({ sequence: seq, length: 1 }),
                b: textField({ sequence: seq, length: 1 }),
            },
        });
        expect(
            () =>
                new PixiFlapView({
                    target: board,
                    face: { a: placeholderFaces().face },
                    cell: { w: 40, h: 60 },
                })
        ).toThrow('no face for field "b"');
    });
});
```

Replace `test/index.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';

import * as canvas from '../src/canvas';
import * as core from '../src/core';
import * as pixi from '../src/pixi';

describe('entry points', () => {
    it('exports the core runtime API', () => {
        expect(Object.keys(core).sort()).toEqual(
            [
                'CHARSETS',
                'DEFAULT_FLIP_DURATION',
                'DEFAULT_HOLD',
                'FlapBoard',
                'FlapField',
                'FlapSequence',
                'FlapUnit',
                'defineField',
                'fieldStaggerDelays',
                'planPath',
                'textField',
            ].sort()
        );
    });

    it('exports the canvas renderer and shared render helpers', () => {
        expect(Object.keys(canvas)).toEqual(
            expect.arrayContaining([
                'CanvasFlapRenderer',
                'DEFAULT_FLIP_KEYFRAMES',
                'DEFAULT_STYLE',
                'FaceCache',
                'MAX_FRAME_DT',
                'colorFace',
                'createFlipCurve',
                'drawUnit',
                'flipGeometry',
                'layout',
                'textFace',
            ])
        );
    });

    it('exports the pixi renderer and shared render helpers', () => {
        expect(Object.keys(pixi)).toEqual(
            expect.arrayContaining([
                'FaceTextures',
                'MAX_FRAME_DT',
                'PixiFlapView',
                'UnitSprite',
                'colorFace',
                'createFlipCurve',
                'layout',
                'textFace',
                'textureFace',
            ])
        );
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run test/pixi test/index.test.ts`
Expected: FAIL — cannot resolve `../../src/pixi` / `../src/pixi`.

- [ ] **Step 3: Implement texture faces**

`src/pixi/textures.ts`:

```ts
import { CanvasSource, type ICanvas, Rectangle, Texture } from 'pixi.js';

import { type CanvasFactory, FaceCache } from '../render/face-cache';
import type { FacePainter } from '../render/faces';

/** A face backed by ready-made Pixi textures instead of a painter. */
export interface TextureFace<T> {
    readonly kind: 'split-flaps/texture-face';
    texture(flap: T): Texture;
}

export type PixiFace<T> = FacePainter<T> | TextureFace<T>;

/** Wraps a texture lookup so it can be told apart from a face painter. */
export function textureFace<T>(
    texture: (flap: T) => Texture
): TextureFace<T> {
    return { kind: 'split-flaps/texture-face', texture };
}

export function isTextureFace(value: unknown): value is TextureFace<unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as { kind?: unknown }).kind === 'split-flaps/texture-face'
    );
}

export interface HalfTextures {
    top: Texture;
    bottom: Texture;
}

export interface FaceTexturesOptions {
    /** Face size in CSS px. */
    width: number;
    height: number;
    /** Painted face resolution (device pixel ratio). */
    resolution: number;
    /** Corner radius baked into painted faces. */
    radius: number;
    createCanvas?: CanvasFactory;
}

type Source<T> =
    | { kind: 'texture'; face: TextureFace<T> }
    | { kind: 'painter'; faces: FaceCache<T> };

interface Entry extends HalfTextures {
    /** Full texture created here (painted faces) and destroyed with it. */
    owned: Texture | null;
}

/** Caches top and bottom half textures for each flap of one field. */
export class FaceTextures<T> {
    private readonly entries = new Map<string, Entry>();
    private readonly source: Source<T>;

    constructor(
        private readonly key: (flap: T) => string,
        face: PixiFace<T>,
        options: FaceTexturesOptions
    ) {
        this.source = isTextureFace(face)
            ? { kind: 'texture', face }
            : {
                  kind: 'painter',
                  faces: new FaceCache({
                      key,
                      painter: face,
                      width: options.width,
                      height: options.height,
                      dpr: options.resolution,
                      radius: options.radius,
                      createCanvas: options.createCanvas,
                  }),
              };
    }

    get(flap: T): HalfTextures {
        const key = this.key(flap);
        const cached = this.entries.get(key);
        if (cached) {
            return cached;
        }
        let full: Texture;
        let owned: Texture | null = null;
        if (this.source.kind === 'texture') {
            full = this.source.face.texture(flap);
        } else {
            const canvas = this.source.faces.get(flap);
            full = new Texture({
                source: new CanvasSource({
                    resource: canvas as unknown as ICanvas,
                }),
            });
            owned = full;
        }
        const { x, y, width, height } = full.frame;
        const half = height / 2;
        const entry: Entry = {
            top: new Texture({
                source: full.source,
                frame: new Rectangle(x, y, width, half),
            }),
            bottom: new Texture({
                source: full.source,
                frame: new Rectangle(x, y + half, width, half),
            }),
            owned,
        };
        this.entries.set(key, entry);
        return entry;
    }

    destroy(): void {
        for (const entry of this.entries.values()) {
            entry.top.destroy(false);
            entry.bottom.destroy(false);
            entry.owned?.destroy(true);
        }
        this.entries.clear();
        if (this.source.kind === 'painter') {
            this.source.faces.clear();
        }
    }
}
```

- [ ] **Step 4: Implement the unit sprite**

`src/pixi/unit-sprite.ts`:

```ts
import { Color, Container, Sprite, Texture } from 'pixi.js';

import type { UnitState } from '../core/unit';
import type { FlipCurve } from '../render/flip-curve';
import { type FaceRef, flipGeometry } from '../render/flip-geometry';
import type { ResolvedFlapStyle } from '../render/style';
import type { HalfTextures } from './textures';

/** Scene graph for one unit: static halves, moving flap, shadow and hinge. */
export class UnitSprite extends Container {
    readonly top = new Sprite();
    readonly bottom = new Sprite();
    readonly shadow = new Sprite(Texture.WHITE);
    readonly flap = new Sprite();
    readonly hinge = new Sprite(Texture.WHITE);

    constructor(
        private readonly unitWidth: number,
        private readonly unitHeight: number,
        private readonly style: ResolvedFlapStyle
    ) {
        super();
        const half = unitHeight / 2;
        this.shadow.tint = 0x000000;
        this.shadow.visible = false;
        this.flap.visible = false;
        this.flap.position.set(0, half);
        const hingeColor = new Color(style.hingeColor);
        this.hinge.tint = hingeColor.toNumber();
        this.hinge.alpha = hingeColor.alpha;
        this.hinge.position.set(0, half - style.hingeGap / 2);
        this.hinge.setSize(unitWidth, style.hingeGap);
        this.hinge.visible = style.hingeGap > 0;
        this.addChild(this.top, this.bottom, this.shadow, this.flap, this.hinge);
    }

    /** Applies a unit's state to the sprites. */
    apply<T>(
        state: UnitState<T>,
        faces: { get(flap: T): HalfTextures },
        curve: FlipCurve
    ): void {
        const half = this.unitHeight / 2;
        const current = faces.get(state.current);
        if (state.next === null) {
            this.setHalf(this.top, current.top, 0, half);
            this.setHalf(this.bottom, current.bottom, half, half);
            this.flap.visible = false;
            this.shadow.visible = false;
            return;
        }
        const next = faces.get(state.next);
        const pick = (ref: FaceRef): HalfTextures =>
            ref === 'current' ? current : next;
        const geometry = flipGeometry(curve(state.progress), state.direction);
        this.setHalf(this.top, pick(geometry.staticTop).top, 0, half);
        this.setHalf(this.bottom, pick(geometry.staticBottom).bottom, half, half);

        const shadowAlpha = geometry.castShadow * this.style.shadow;
        this.shadow.visible = shadowAlpha > 0.001;
        this.shadow.position.set(0, geometry.shadowHalf === 'top' ? 0 : half);
        this.shadow.setSize(this.unitWidth, half);
        this.shadow.alpha = shadowAlpha;

        const flapHeight = half * geometry.flap.scaleY;
        this.flap.visible = flapHeight > 0.01;
        if (!this.flap.visible) {
            return;
        }
        const halves = pick(geometry.flap.face);
        const isTop = geometry.flap.half === 'top';
        this.flap.texture = isTop ? halves.top : halves.bottom;
        this.flap.anchor.set(0, isTop ? 1 : 0);
        this.flap.setSize(this.unitWidth, flapHeight);
        const gray = Math.round(
            255 * (1 - geometry.flapShade * this.style.shade)
        );
        this.flap.tint = (gray << 16) | (gray << 8) | gray;
    }

    private setHalf(
        sprite: Sprite,
        texture: Texture,
        y: number,
        height: number
    ): void {
        sprite.texture = texture;
        sprite.position.set(0, y);
        sprite.setSize(this.unitWidth, height);
    }
}
```

- [ ] **Step 5: Implement the view**

`src/pixi/view.ts`:

```ts
import { Container, type DestroyOptions, type Ticker } from 'pixi.js';

import type { CanvasFactory } from '../render/face-cache';
import { defaultFlipCurve, type FlipCurve } from '../render/flip-curve';
import { MAX_FRAME_DT } from '../render/frame';
import {
    type BoardLayout,
    layout,
    type LayoutOptions,
    type RenderTarget,
    type UnitSlot,
} from '../render/layout';
import {
    type FlapStyle,
    resolveStyle,
    type ResolvedFlapStyle,
} from '../render/style';
import { FaceTextures, isTextureFace, type PixiFace } from './textures';
import { UnitSprite } from './unit-sprite';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PixiFlapViewOptions extends LayoutOptions {
    target: RenderTarget;
    /** One face for every field, or one per board field name. */
    face: PixiFace<any> | Record<string, PixiFace<any>>;
    style?: FlapStyle;
    flipCurve?: FlipCurve;
    /** Resolution of painted faces. Default `globalThis.devicePixelRatio ?? 1`. */
    resolution?: number;
    createCanvas?: CanvasFactory;
}

/** A Pixi Container that draws a board, field or unit. */
export class PixiFlapView extends Container {
    readonly target: RenderTarget;
    private readonly viewOptions: PixiFlapViewOptions;
    private readonly boardLayout: BoardLayout;
    private readonly flapStyle: ResolvedFlapStyle;
    private readonly curve: FlipCurve;
    private readonly sprites: UnitSprite[];
    private readonly faceTextures = new Map<string, FaceTextures<any>>();
    private ticker: Ticker | null = null;
    private readonly onTick = (ticker: Ticker): void => {
        this.update(Math.min(MAX_FRAME_DT, ticker.deltaMS));
    };

    constructor(options: PixiFlapViewOptions) {
        super();
        this.viewOptions = options;
        this.target = options.target;
        this.flapStyle = resolveStyle(options.style);
        this.curve = options.flipCurve ?? defaultFlipCurve();
        this.boardLayout = layout(options.target, options);
        this.sprites = this.boardLayout.slots.map(slot => {
            const sprite = new UnitSprite(
                slot.rect.w,
                slot.rect.h,
                this.flapStyle
            );
            sprite.position.set(slot.rect.x, slot.rect.y);
            this.addChild(sprite);
            return sprite;
        });
        this.sync();
    }

    /** Drives `update` from a Pixi ticker (frame delta capped at 250 ms). */
    attach(ticker: Ticker): void {
        this.detach();
        ticker.add(this.onTick);
        this.ticker = ticker;
    }

    detach(): void {
        this.ticker?.remove(this.onTick);
        this.ticker = null;
    }

    /** Advances the target by `dt` ms, then syncs the scene graph. */
    update(dt: number): void {
        this.target.update(dt);
        this.sync();
    }

    /** Applies the target's current state to the scene graph. */
    sync(): void {
        this.boardLayout.slots.forEach((slot, index) =>
            this.sprites[index].apply(
                slot.unit.state,
                this.texturesFor(slot),
                this.curve
            )
        );
    }

    override destroy(options?: DestroyOptions): void {
        this.detach();
        super.destroy(options ?? { children: true });
        for (const textures of this.faceTextures.values()) {
            textures.destroy();
        }
        this.faceTextures.clear();
    }

    private texturesFor(slot: UnitSlot): FaceTextures<any> {
        const cached = this.faceTextures.get(slot.field);
        if (cached) {
            return cached;
        }
        const textures = new FaceTextures<any>(
            flap => slot.sequence.key(flap),
            this.faceFor(slot.field),
            {
                width: slot.rect.w,
                height: slot.rect.h,
                resolution:
                    this.viewOptions.resolution ??
                    globalThis.devicePixelRatio ??
                    1,
                radius: this.flapStyle.radius,
                createCanvas: this.viewOptions.createCanvas,
            }
        );
        this.faceTextures.set(slot.field, textures);
        return textures;
    }

    private faceFor(field: string): PixiFace<any> {
        const { face } = this.viewOptions;
        if (typeof face === 'function' || isTextureFace(face)) {
            return face as PixiFace<any>;
        }
        const fieldFace = face[field];
        if (!fieldFace) {
            throw new Error(`PixiFlapView: no face for field "${field}"`);
        }
        return fieldFace;
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
```

- [ ] **Step 6: Create the pixi entry point**

`src/pixi/index.ts`:

```ts
export { PixiFlapView, type PixiFlapViewOptions } from './view';
export { UnitSprite } from './unit-sprite';
export {
    FaceTextures,
    isTextureFace,
    textureFace,
    type FaceTexturesOptions,
    type HalfTextures,
    type PixiFace,
    type TextureFace,
} from './textures';
export {
    colorFace,
    textFace,
    type Ctx2D,
    type FacePainter,
    type TextFaceOptions,
} from '../render/faces';
export {
    defaultCanvasFactory,
    FaceCache,
    type CanvasFactory,
    type FaceCacheOptions,
    type FaceCanvas,
} from '../render/face-cache';
export {
    createFlipCurve,
    DEFAULT_FLIP_KEYFRAMES,
    defaultFlipCurve,
    type FlipCurve,
} from '../render/flip-curve';
export {
    flipGeometry,
    type FaceRef,
    type FlipGeometry,
    type Half,
} from '../render/flip-geometry';
export {
    layout,
    SINGLE_FIELD,
    type BoardLayout,
    type LayoutOptions,
    type Rect,
    type RenderTarget,
    type UnitSlot,
} from '../render/layout';
export {
    DEFAULT_STYLE,
    resolveStyle,
    type FlapStyle,
    type ResolvedFlapStyle,
} from '../render/style';
export { MAX_FRAME_DT } from '../render/frame';
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `bun run test && bun run typecheck`
Expected: every test file PASSES (including 9 Pixi tests and 3 entry-point tests); `tsc` exits 0.

- [ ] **Step 8: Commit**

```bash
bunx prettier --write src test
git add -A
git commit -m "feat(pixi): add PixiFlapView renderer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Build, package exports, examples app and README

**Files:**
- Create: `scripts/build.ts`, `tsconfig.build.json`, `examples/vite.config.ts`, `examples/index.html`, `examples/main.ts`, `README.md`
- Modify: `package.json` (exports, entry fields, `build` and `dev` scripts), `tsconfig.json` (include examples, paths)

**Interfaces:**
- Consumes: every public export from the three entry points.
- Produces: `dist/core/index.{js,d.ts}`, `dist/canvas/index.{js,d.ts}`, `dist/pixi/index.{js,d.ts}` plus shared chunks; `bun run build`; `bun run dev` (examples on Vite).

- [ ] **Step 1: Add the build script and declaration config**

`scripts/build.ts`:

```ts
const result = await Bun.build({
    entrypoints: [
        './src/core/index.ts',
        './src/canvas/index.ts',
        './src/pixi/index.ts',
    ],
    root: './src',
    outdir: './dist',
    format: 'esm',
    target: 'browser',
    // Shared modules go into chunks so the core classes exist once and
    // `instanceof` works across entry points.
    splitting: true,
    sourcemap: 'external',
    external: ['pixi.js', '@ue-too/animate'],
});

if (!result.success) {
    for (const log of result.logs) {
        console.error(log);
    }
    process.exit(1);
}

for (const output of result.outputs) {
    console.log(output.path);
}
```

`tsconfig.build.json`:

```json
{
    "extends": "./tsconfig.json",
    "compilerOptions": {
        "noEmit": false,
        "declaration": true,
        "emitDeclarationOnly": true,
        "outDir": "dist",
        "rootDir": "src"
    },
    "include": ["src"]
}
```

- [ ] **Step 2: Add exports and scripts to package.json**

In `package.json`, add these top-level fields after `"files"`:

```json
    "main": "./dist/core/index.js",
    "types": "./dist/core/index.d.ts",
    "exports": {
        ".": {
            "types": "./dist/core/index.d.ts",
            "import": "./dist/core/index.js"
        },
        "./canvas": {
            "types": "./dist/canvas/index.d.ts",
            "import": "./dist/canvas/index.js"
        },
        "./pixi": {
            "types": "./dist/pixi/index.d.ts",
            "import": "./dist/pixi/index.js"
        },
        "./package.json": "./package.json"
    },
```

and replace the `"scripts"` block with:

```json
    "scripts": {
        "build": "rm -rf dist && bun scripts/build.ts && tsc -p tsconfig.build.json",
        "dev": "vite --config examples/vite.config.ts",
        "test": "vitest run",
        "test:watch": "vitest",
        "typecheck": "tsc -p tsconfig.json",
        "format": "prettier --write .",
        "format:check": "prettier --check ."
    },
```

- [ ] **Step 3: Build and verify the output**

Run: `bun run build`
Expected: prints paths including `dist/core/index.js`, `dist/canvas/index.js`, `dist/pixi/index.js` and at least one `dist/chunk-*.js`; exit code 0.

Run: `ls dist/core/index.d.ts dist/canvas/index.d.ts dist/pixi/index.d.ts`
Expected: all three files listed.

Run: `grep -rl "class FlapUnit" dist --include=*.js`
Expected: exactly one file (a shared chunk), proving the core is not duplicated per entry point.

Run: `grep -rl "@ue-too/animate" dist --include=*.js` and `grep -o 'from *"[^"]*"' dist/core/index.js`
Expected: none of the files imported by `dist/core/index.js` appear in the `@ue-too/animate` list (the core entry stays dependency-free).

Run: `bun -e "const m = await import('./dist/core/index.js'); console.log(Object.keys(m).sort().join(','))"`
Expected: `CHARSETS,DEFAULT_FLIP_DURATION,DEFAULT_HOLD,FlapBoard,FlapField,FlapSequence,FlapUnit,defineField,fieldStaggerDelays,planPath,textField`

Run: `bun -e "const m = await import('./dist/pixi/index.js'); console.log(typeof m.PixiFlapView, typeof m.textFace)"`
Expected: `function function`

- [ ] **Step 4: Point the examples at the sources**

Update `tsconfig.json` so examples are typechecked against the sources:

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "lib": ["ES2022", "DOM"],
        "strict": true,
        "noEmit": true,
        "skipLibCheck": true,
        "isolatedModules": true,
        "verbatimModuleSyntax": true,
        "types": [],
        "paths": {
            "@kinnet-studio/split-flaps": ["./src/core/index.ts"],
            "@kinnet-studio/split-flaps/canvas": ["./src/canvas/index.ts"],
            "@kinnet-studio/split-flaps/pixi": ["./src/pixi/index.ts"]
        }
    },
    "include": ["src", "test", "examples"],
    "exclude": ["examples/vite.config.ts", "examples/dist"]
}
```

`examples/vite.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
    root: fromHere('.'),
    resolve: {
        alias: [
            {
                find: /^@kinnet-studio\/split-flaps\/canvas$/,
                replacement: fromHere('../src/canvas/index.ts'),
            },
            {
                find: /^@kinnet-studio\/split-flaps\/pixi$/,
                replacement: fromHere('../src/pixi/index.ts'),
            },
            {
                find: /^@kinnet-studio\/split-flaps$/,
                replacement: fromHere('../src/core/index.ts'),
            },
        ],
    },
});
```

- [ ] **Step 5: Write the examples app**

`examples/index.html`:

```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>split-flaps examples</title>
        <style>
            body {
                margin: 0;
                padding: 24px;
                background: #1b1b1f;
                color: #eeeeee;
                font-family: system-ui, sans-serif;
            }
            section {
                margin-bottom: 40px;
            }
            h2 {
                font-size: 13px;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: #a8a8b0;
            }
            .controls {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin: 8px 0 16px;
            }
            button,
            input {
                background: #2c2c33;
                color: #eeeeee;
                border: 1px solid #44444c;
                border-radius: 6px;
                padding: 6px 12px;
                font: inherit;
            }
            button {
                cursor: pointer;
            }
            .boards {
                display: flex;
                flex-wrap: wrap;
                gap: 24px;
                align-items: flex-start;
            }
            canvas {
                display: block;
                max-width: 100%;
            }
        </style>
    </head>
    <body>
        <section>
            <h2>Departures: Canvas 2D (left), Pixi (right), one board</h2>
            <div class="controls">
                <button id="next">Next message</button>
                <button id="play">Play playlist</button>
                <button id="spin">Spin</button>
                <button id="stop">Stop</button>
            </div>
            <div class="boards">
                <canvas id="departures-canvas"></canvas>
                <div id="departures-pixi"></div>
            </div>
        </section>
        <section>
            <h2>Plain grid</h2>
            <div class="controls">
                <input id="grid-input" value="HELLO WORLD" maxlength="22" />
                <button id="grid-show">Show</button>
            </div>
            <canvas id="grid-canvas"></canvas>
        </section>
        <section>
            <h2>Colour flaps (shortest path)</h2>
            <canvas id="colors-canvas"></canvas>
        </section>
        <script type="module" src="./main.ts"></script>
    </body>
</html>
```

`examples/main.ts`:

```ts
import {
    CHARSETS,
    defineField,
    FlapBoard,
    FlapField,
    FlapSequence,
    type RowValues,
    textField,
} from '@kinnet-studio/split-flaps';
import {
    CanvasFlapRenderer,
    colorFace,
    type FlapStyle,
    textFace,
} from '@kinnet-studio/split-flaps/canvas';
import { PixiFlapView } from '@kinnet-studio/split-flaps/pixi';
import { Application } from 'pixi.js';

const chars = FlapSequence.chars(`${CHARSETS.alphanumeric}:`);
const cities = new FlapSequence([
    '',
    'TOKYO',
    'OSAKA',
    'KYOTO',
    'NAGOYA',
    'SENDAI',
    'HAKATA',
]);

const style: FlapStyle = { radius: 4, hingeGap: 1 };
const cell = { w: 28, h: 44 };
const charFace = textFace({
    font: '600 26px ui-monospace, Menlo, monospace',
    color: '#f4f1e8',
    background: '#232326',
});
const wordFace = textFace({
    font: '600 22px system-ui, sans-serif',
    color: '#f4f1e8',
    background: '#232326',
});

function canvasById(id: string): HTMLCanvasElement {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLCanvasElement)) {
        throw new Error(`#${id} is not a canvas`);
    }
    return element;
}

function onClick(id: string, handler: () => void): void {
    document.getElementById(id)?.addEventListener('click', handler);
}

async function departures(): Promise<void> {
    const schema = {
        time: textField({ sequence: chars, length: 5 }),
        dest: defineField({
            sequence: cities,
            length: 1,
            cells: 5,
            unit: { flipDuration: 120 },
        }),
        plat: textField({ sequence: chars, length: 2, align: 'right' }),
    };
    const board = new FlapBoard({
        rows: 4,
        schema,
        stagger: { order: 'column', step: 25 },
    });
    const messages: RowValues<typeof schema>[][] = [
        [
            { time: '09:15', dest: 'TOKYO', plat: '3' },
            { time: '09:42', dest: 'OSAKA', plat: '12' },
            { time: '10:05', dest: 'KYOTO', plat: '7' },
            { time: '10:30', dest: 'HAKATA', plat: '1' },
        ],
        [
            { time: '11:00', dest: 'NAGOYA', plat: '4' },
            { time: '11:20', dest: 'SENDAI', plat: '9' },
            { time: '11:45', dest: 'TOKYO', plat: '2' },
        ],
    ];
    const face = { time: charFace, dest: wordFace, plat: charFace };
    const gap = { unit: 3, field: 16, row: 8 };

    // The canvas renderer advances the board; the Pixi view only mirrors it.
    const renderer = new CanvasFlapRenderer({
        canvas: canvasById('departures-canvas'),
        target: board,
        face,
        cell,
        gap,
        style,
    });
    renderer.start();

    const app = new Application();
    await app.init({
        width: renderer.width,
        height: renderer.height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio,
        autoDensity: true,
    });
    document.getElementById('departures-pixi')?.append(app.canvas);
    const view = new PixiFlapView({ target: board, face, cell, gap, style });
    app.stage.addChild(view);
    app.ticker.add(() => view.sync());

    let index = 0;
    board.show(messages[index]);
    onClick('next', () => {
        index = (index + 1) % messages.length;
        board.show(messages[index]);
    });
    onClick('play', () => board.play(messages, { hold: 4000 }));
    onClick('spin', () => board.spin());
    onClick('stop', () => board.stop());
}

function grid(): void {
    const board = new FlapBoard({
        rows: 2,
        schema: {
            text: textField({
                sequence: chars,
                length: 11,
                unit: { flipDuration: 60 },
            }),
        },
        stagger: { order: 'diagonal', step: 30 },
    });
    new CanvasFlapRenderer({
        canvas: canvasById('grid-canvas'),
        target: board,
        face: charFace,
        cell,
        gap: { unit: 3, row: 6 },
        style,
    }).start();
    const input = document.getElementById('grid-input');
    const show = () => {
        const text =
            input instanceof HTMLInputElement ? input.value.toUpperCase() : '';
        board.show([{ text: text.slice(0, 11) }, { text: text.slice(11, 22) }]);
    };
    onClick('grid-show', show);
    show();
}

function colours(): void {
    const palette = new FlapSequence([
        '#232326',
        '#e4572e',
        '#f3a712',
        '#29335c',
        '#669bbc',
        '#a8c686',
    ]);
    const field = new FlapField(
        defineField({
            sequence: palette,
            length: 8,
            stagger: { order: 'sequential', step: 60 },
            unit: { flipDuration: 90, direction: 'shortest' },
        })
    );
    new CanvasFlapRenderer({
        canvas: canvasById('colors-canvas'),
        target: field,
        face: colorFace(),
        cell,
        gap: { unit: 3 },
        style,
    }).start();
    const shuffle = () =>
        field.set(
            Array.from({ length: 8 }, () =>
                palette.at(1 + Math.floor(Math.random() * (palette.length - 1)))
            )
        );
    shuffle();
    setInterval(shuffle, 2500);
}

grid();
colours();
departures().catch(error => console.error(error));
```

- [ ] **Step 6: Typecheck and build the examples**

Run: `bun run typecheck`
Expected: `tsc` exits 0 (now including `examples/main.ts`).

Run: `bunx vite build --config examples/vite.config.ts`
Expected: Vite reports a successful build into `examples/dist`; exit code 0.

- [ ] **Step 7: Check the examples in a browser**

Run: `bun run dev` (leave it running) and open the printed local URL (default `http://localhost:5173/`).
Check, and note anything that fails:
- The departures board shows four rows (`09:15 TOKYO 3` …) in both the canvas (left) and the Pixi view (right), and both flip in lockstep with a left-to-right ripple.
- Flaps fold down from the top half, darken near edge-on, and bounce slightly before settling.
- "Next message" changes rows; "Play playlist" alternates the two messages after 4 s holds; "Spin" spins every unit; "Stop" settles them.
- The grid shows `HELLO WORLD` and rippling diagonally after editing the input and pressing Show; unknown characters show blank.
- The colour row reshuffles every 2.5 s, sometimes flipping backward (shortest path).
- The browser console has no errors.
Stop the dev server afterward.

- [ ] **Step 8: Write the README**

`README.md`:

````markdown
# @kinnet-studio/split-flaps

A split-flap display engine for the web. The core handles the drums, the timing,
idle spinning and message playlists, and works with any renderer. Canvas 2D and
Pixi v8 renderers are included.

## Install

```bash
bun add @kinnet-studio/split-flaps
# only for the Pixi renderer:
bun add pixi.js@^8
```

## Concepts

The API is layered; use whichever level you need.

| Layer          | What it is                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `FlapSequence` | The ordered flaps on one drum: characters, whole words, colours, anything with a key.          |
| `FlapUnit`     | One drum. `setTarget()`, `spin()`, `stop()`, `snapTo()`, `update(dt)`.                         |
| `FlapField`    | Units sharing a drum, set with one value (`'TOKYO'` across five units, or one word flap).      |
| `FlapBoard`    | Rows of named fields. `show()`, `row(i).set()`, `play()`.                                      |

The core never reads the clock. Call `update(dt)` (milliseconds) yourself, or
let a renderer's loop do it.

## Quick start (Canvas 2D)

```ts
import {
    CHARSETS,
    defineField,
    FlapBoard,
    FlapSequence,
    textField,
} from '@kinnet-studio/split-flaps';
import { CanvasFlapRenderer, textFace } from '@kinnet-studio/split-flaps/canvas';

const chars = FlapSequence.chars(`${CHARSETS.alphanumeric}:`);
const cities = new FlapSequence(['', 'TOKYO', 'OSAKA', 'KYOTO']);

const board = new FlapBoard({
    rows: 3,
    schema: {
        time: textField({ sequence: chars, length: 5 }),
        dest: defineField({ sequence: cities, length: 1, cells: 5 }),
        plat: textField({ sequence: chars, length: 2, align: 'right' }),
    },
    stagger: { order: 'column', step: 25 },
});

const renderer = new CanvasFlapRenderer({
    canvas: document.querySelector('canvas')!,
    target: board,
    face: textFace({
        font: '600 26px ui-monospace, monospace',
        color: '#f4f1e8',
        background: '#232326',
    }),
    cell: { w: 28, h: 44 },
    gap: { unit: 3, field: 16, row: 8 },
});
renderer.start();

board.show([{ time: '09:15', dest: 'TOKYO', plat: '3' }]);
```

## Pixi v8

```ts
import { PixiFlapView } from '@kinnet-studio/split-flaps/pixi';

const view = new PixiFlapView({ target: board, face, cell, gap });
app.stage.addChild(view);
view.attach(app.ticker); // or call view.update(dt) yourself
```

`/pixi` imports `pixi.js`, so install `pixi.js@^8` before importing it; the core
and `/canvas` entry points never load Pixi.

Face painters are shared: the same `textFace(...)` or custom
`(ctx, flap, w, h) => void` works in both renderers. For ready-made textures use
`textureFace(flap => texture)`.

## Unit options

| Option         | Default     | Meaning                                                    |
| -------------- | ----------- | ---------------------------------------------------------- |
| `flipDuration` | `80`        | Milliseconds per flip.                                     |
| `cycle`        | `'all'`     | `'all'` shows every flap in between; `'direct'` flips once. |
| `direction`    | `'forward'` | `'shortest'` may flip backward when that is shorter.       |
| `unknownFlap`  | `'pad'`     | Targets missing from the drum show the pad flap, or throw. |

A flip in progress always completes before a new target takes effect.

## Playlists, spinning and events

```ts
board.play([messageA, { rows: messageB, hold: 8000 }], { hold: 5000, loop: true });
board.spin(); // idle/attract spin until show(), play() or stop()
board.on('flipend', ({ row, field, unit }) => playClick());
board.on('settled', () => console.log('done'));
```

The hold timer starts once the board has settled on a message.

## Custom renderers

Read `unit.state` (`{ current, next, progress, direction }`) every frame.
`flipGeometry()`, `createFlipCurve()` and `layout()` (exported from `/canvas`
and `/pixi`) do the maths for you.

## Development

```bash
bun install
bun run test
bun run typecheck
bun run build
bun run dev   # examples app
```
````

- [ ] **Step 9: Final verification**

Run: `bun run test && bun run typecheck && bunx prettier --check . && bun run build`
Expected: every test PASSES, `tsc` exits 0, Prettier reports all files formatted (run `bunx prettier --write .` first if not), and the build succeeds.

- [ ] **Step 10: Commit**

```bash
bunx prettier --write .
git add -A
git commit -m "feat: add build, package exports, examples app and README

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
