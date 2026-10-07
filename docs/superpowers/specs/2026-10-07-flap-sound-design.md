# Flap sound — Design

**Date:** 2026-10-07
**Status:** Approved in brainstorming; awaiting written-spec review
**Package:** `@kinnet-studio/split-flaps`, new entry point `@kinnet-studio/split-flaps/sound`

## Summary

Optional, renderer-agnostic sound for split-flap boards. `FlapSound` subscribes to a core
target's `flipend` events and plays a short click for every landed flap through the Web Audio
API. The default click is synthesized (no audio assets); a custom sample can replace it. Many
simultaneous landings are kept clean by a voice cap, small random variation, and stereo panning
by column, so a ripple travels across the speakers.

## Goals

- Works with any renderer (Canvas, Pixi, custom, or none): it listens to the core, not to pixels.
- No dependencies and no bundled audio files; nothing is paid by apps that don't import `/sound`.
- Deterministic and testable in Node: synthesis is a pure function; playback runs against an
  injected `AudioContext`.

## Non-goals

- A separate "flip start" sound, multiple samples per board, per-field sounds, reverb/effects.
- Sound inside the renderers (rejected approach B: ties sound to our two renderers).
- Automatic unlocking on page interaction (documented one-liner instead).

## Architecture

- `src/sound/` imports only from `src/core` (target classes and event types). No `src/render`,
  no `pixi.js`, no `@ue-too/animate`.
- New package export `./sound` → `dist/sound/index.{js,d.ts}`; `scripts/build.ts` gains the entry,
  `scripts/check-dist.ts` asserts `typeof sound.FlapSound === 'function'`.
- Files:
  - `src/sound/click.ts` — `renderClick()` pure synthesis + `SynthClickOptions` + defaults.
  - `src/sound/pan.ts` — `panTable(target, width)` → `(event) => pan` lookup.
  - `src/sound/flap-sound.ts` — `FlapSound` (subscription, unlock, mixing, voice cap).
  - `src/sound/index.ts` — entry exports.

## API

```ts
interface FlapSoundOptions {
    target: FlapBoard<any> | FlapField<any, any> | FlapUnit<any>;
    volume?: number;              // 0..1 master volume, default 0.5
    muted?: boolean;              // start muted, default false
    sample?: AudioBuffer | string; // AudioBuffer used as-is; string = URL fetched + decoded on unlock()
    synth?: SynthClickOptions;    // ignored when a sample is loaded
    maxVoices?: number;           // whole number >= 1, default 12
    variation?: { pitch?: number; volume?: number }; // >= 0, defaults 0.06 / 0.15
    pan?: number;                 // 0..1 stereo width, default 0.6
    context?: AudioContext;       // inject a shared context; otherwise created on unlock()
    random?: () => number;        // default Math.random; inject for tests
}

class FlapSound {
    constructor(options: FlapSoundOptions);
    unlock(): Promise<void>;      // create/resume context, load sample, build graph; idempotent
    play(pan?: number): void;     // one click now (pan -1..1, default 0); no-op before unlock
    volume: number;               // get/set, 0..1, RangeError otherwise
    muted: boolean;               // get/set
    readonly unlocked: boolean;
    destroy(): void;
}

interface SynthClickOptions {
    frequency?: number;   // Hz of the tonal tick, default 2200
    decay?: number;       // s, envelope time constant, default 0.012
    duration?: number;    // s, buffer length, default 0.05
    noise?: number;       // 0..1 noise vs tone mix, default 0.6
    brightness?: number;  // (0, 1] one-pole low-pass amount (1 = no filtering), default 0.5
}

function renderClick(
    sampleRate: number,
    options?: SynthClickOptions,
    random?: () => number          // default: fixed-seed PRNG, so output is stable
): Float32Array;
```

## Behaviour

### Subscription and timing

- The constructor subscribes to `target.on('flipend', …)` (unit, field and board all emit it).
- Before `unlock()` resolves, landings are ignored (not queued). After `destroy()`, nothing plays.
- Each `flipend` plays one click immediately (`start(context.currentTime)`); a burst of landings in
  one `update()` plays together, subject to the voice cap. `timeScale` needs no special handling.

### Synthesis (`renderClick`)

- Length: `round(duration × sampleRate)` samples (min 1).
- Sample `i` at `t = i / sampleRate`:
  `raw = noise × n(i) + (1 − noise) × sin(2π · frequency · t)` with `n(i)` uniform in [−1, 1]
  from `random`; `env = exp(−t / decay)`; then a one-pole low-pass
  `y = y_prev + brightness × (raw·env − y_prev)`; finally the buffer is normalized so its peak
  absolute value is 0.9.
- Default `random` is a fixed-seed PRNG (mulberry32, seed 0x5f1a95), so the default click is
  identical on every load.
- Validation: `frequency > 0`, `decay > 0`, `duration > 0`, `noise` in 0..1, `brightness` in
  (0, 1] (0 would filter the click to silence), all finite, else `RangeError`.

### Samples

- `sample` as `AudioBuffer`: used as the click buffer.
- `sample` as URL: `unlock()` runs `fetch(url)` → `arrayBuffer()` → `context.decodeAudioData()`.
  On failure `unlock()` rejects with that error, but the sound remains unlocked and uses the synth
  click, so a missing file never silences the board.

### Mixing

- Graph per click: `AudioBufferSourceNode → GainNode → StereoPannerNode → master GainNode →
  destination`. The master gain is created on unlock; its value is `muted ? 0 : volume`.
- Per-click variation (from `random`): `playbackRate = 1 + (2r₁ − 1) × variation.pitch`;
  `gain = 1 − r₂ × variation.volume`.
- Voice cap: an active-voice counter increments on `start` and decrements on the source's `ended`
  event; a landing while `active >= maxVoices` is skipped.
- While muted, landings create no nodes at all.

### Panning

Pan is computed once at construction into a lookup; `pan` (width) scales the result, and a
single column or `pan: 0` gives 0.

- Board: columns follow the schema order. A field starting at column `c₀` with `cells = c` puts
  unit `u` at centre column `c₀ + u·c + (c − 1)/2`. With `lastColumn` = total cells − 1,
  `pan = (centre / lastColumn × 2 − 1) × width`. Rows do not affect pan.
- Field: the same with one field (`c₀ = 0`).
- Unit: 0.

### Unlocking

- `unlock()`: if no `context` was injected, creates `new AudioContext()` (rejects with
  `Error('FlapSound: Web Audio is not available')` when `AudioContext` is undefined); awaits
  `context.resume()`; builds the master gain; loads the sample (URL) or renders the synth click into
  `context.createBuffer(1, length, context.sampleRate)`. Repeated calls return the same promise.
- Browsers require a user gesture; README documents
  `addEventListener('pointerdown', () => sound.unlock(), { once: true })`.

### Destroy

- Unsubscribes from the target, stops counting voices, and closes the context only if
  `FlapSound` created it (an injected context is left open).

## Error handling

| Situation | Behaviour |
| --- | --- |
| `volume`/`pan` outside 0..1, `maxVoices` not a whole number >= 1, negative/non-finite `variation` | `RangeError` at construction (and from the `volume` setter) |
| Invalid synth options | `RangeError` from `renderClick` (surfaced by the constructor's validation) |
| No Web Audio | Construction works; `unlock()` rejects |
| Sample URL fetch/decode fails | `unlock()` rejects; synth click used |
| `play()` before unlock or after destroy | No-op |

## Testing

- `renderClick`: length; peak near the start and decay towards the end; deterministic for the
  default seed; `noise: 0` matches a decaying sine (before filtering, with `brightness: 1`);
  every sample within ±0.9 after normalization; validation errors.
- Pan tables: board with mixed `cells` widths, field, unit, `pan: 0`, single column.
- `FlapSound` with a recording fake `AudioContext` (createBufferSource / createGain /
  createStereoPanner / createBuffer / decodeAudioData / resume / close; `ended` triggered
  manually): silent before unlock; plays on `flipend` with expected pan, rate and gain (seeded
  `random`); voice cap and voice release on `ended`; muted creates no nodes; `volume` setter
  updates master gain; URL sample via stubbed `fetch`; failed load falls back to synth and rejects;
  `destroy` unsubscribes; closes only a context it created; missing Web Audio rejects.
- Entry point export test; build dist check covers `/sound`.
- Examples app: a "Sound" toggle (unlock then mute/unmute). Final listening check is manual.
