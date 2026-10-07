# Flap sound — Design

**Date:** 2026-10-07
**Status:** Approved in brainstorming; awaiting written-spec review
**Package:** `@kinnet-studio/split-flap`, new entry point `@kinnet-studio/split-flap/sound`

## Summary

Optional, renderer-agnostic sound for split-flap boards. `FlapSound` subscribes to a core
target's `flipend` events and plays a short click for every landed flap through the Web Audio
API. The default click is synthesized (no audio assets); a custom sample can replace it. Many
simultaneous landings are kept clean by a voice cap, small random variation (including a few
milliseconds of timing spread), stereo panning by column, so a ripple travels across the
speakers, and a soft clipper on the output.

## Goals

- Works with any renderer (Canvas, Pixi, custom, or none): it listens to the core, not to pixels.
- No dependencies and no bundled audio files; nothing is paid by apps that don't import `/sound`.
- Deterministic and testable in Node: synthesis is a pure function; playback runs against an
  injected `AudioContext`.

## Non-goals

- A separate "flip start" sound, per-field sounds, reverb/effects. (Several samples per board,
  one picked per landing, were a non-goal at first; added once real recordings proved more
  authentic than the synth and a single repeated recording proved less.)
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
    sample?: FlapSample | readonly FlapSample[]; // FlapSample = AudioBuffer (as-is) | string (URL fetched + decoded on unlock())
    synth?: SynthClickOptions;    // unused when `sample` is given
    maxVoices?: number;           // whole number >= 1, default 12
    variation?: { pitch?: number; volume?: number; timing?: number }; // >= 0, defaults 0.06 / 0.5 / 0.012 s
    pan?: number;                 // 0..1 stereo width, default 0.6
    context?: AudioContext;       // inject a shared context; otherwise created on unlock()
    random?: () => number;        // default Math.random; inject for tests
}

class FlapSound {
    constructor(options: FlapSoundOptions);
    unlock(): Promise<void>;      // create/resume context, load sample, build graph; idempotent
    play(pan?: number): void;     // one click within variation.timing (pan -1..1, default 0); no-op before unlock
    volume: number;               // get/set, 0..1, RangeError otherwise
    muted: boolean;               // get/set
    readonly unlocked: boolean;
    destroy(): void;
}

interface SynthClickOptions {
    frequency?: number;   // Hz the click resonates around (noise band-pass and tone), default 4000
    resonance?: number;   // Q of the noise band-pass (low = wide, high = pitched), default 0.2
    decay?: number;       // s, strike time constant, default 0.001
    duration?: number;    // s, buffer length, default 0.16
    noise?: number;       // 0..1 noise vs tone mix, default 1
    brightness?: number;  // (0, 1] low-pass amount per stage (1 = no filtering), default 0.85
    attack?: number;      // s, linear fade-in (0 = instant), default 0.0002
    body?: number;        // 0..1 level of the rattle after the strike, default 0.35
    bodyDecay?: number;   // s, body time constant, default 0.04
    rattle?: number;      // impacts per second in the body (0 = smooth hiss), default 5000
    bounce?: number;      // 0..1 level of one bounce (0 = none), default 0.3
    bounceDelay?: number; // s from strike to bounce, default 0.011
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
- Each `flipend` plays one click at once, give or take the timing variation
  (`start(context.currentTime + r × variation.timing)`); a burst of landings in one `update()` is
  spread over that window instead of hitting in unison. `timeScale` needs no special handling.

### Synthesis (`renderClick`)

- Length: `round(duration × sampleRate)` samples (min 1).
- Sample `i` at `t = i / sampleRate`:
  `raw = noise × h(i) + (1 − noise) × sin(2π · frequency · t)`, where `h` is white noise (uniform
  in [−1, 1] from `random`) through a band-pass biquad (constant 0 dB peak, Q = `resonance`) centred on
  `frequency` (clamped to 0.45 × sampleRate so the filter stays stable).
- Envelope, with `rise(t) = min(1, t / attack)` (1 when `attack` is 0):
  `env = rise(t) × (exp(−t / decay) + B(t))`, plus, from `tb = t − bounceDelay ≥ 0`,
  `bounce × rise(tb) × exp(−tb / decay)`: a strike, the flap and housing rattling on, and one
  smaller bounce. With `rattle` 0 the body is smooth, `B(t) = body × exp(−t / bodyDecay)`.
  Otherwise it is a scatter of impacts: each sample, with probability `rattle / sampleRate`
  (one more `random` draw), an impact of size `s = −ln(1 − r)` (exponential, mean 1; another
  draw) adds `body × exp(−t / bodyDecay) × s / (rattle × 0.0006)` to an accumulator that decays
  with a 0.6 ms time constant, and `B(t)` is that accumulator. On average it follows the smooth
  body, but it arrives as separate knocks rather than a hiss.
- `raw × env` goes through two one-pole low-pass stages, each
  `y = y_prev + brightness × (x − y_prev)`; finally the buffer is normalized so its peak absolute
  value is 0.9.
- The defaults were fitted to a recording of a real module: a loud landing about every 60 ms
  with quieter ticks between (27 detected hits in 1.3 s). The synth click was placed at each
  detected hit (time and level) and the rebuilt burst compared with the recording. The fit is within about 2.5 dB of the recording's 1 ms RMS
  envelope on average, within about 11 points summed over eight frequency bands, and leaves the
  gaps between landings 11.3 dB below the strikes (recording: 11.7 dB). The real sound is a
  sub-millisecond, unpitched strike with most of its energy above 4 kHz and a rattle that runs
  into the next flap; that rattle (`body`) is what makes a fast run sound even rather than
  spiky. The 0.2 ms fade-in still starts the click from silence, and the noise has almost no
  energy below 600 Hz, so there is no low pop.
- The rattle replaced a smooth body that sounded like a taser: a sharp crack followed by static,
  repeated. Measured over 3–30 ms after the strike, the real flaps' rattle has a kurtosis of
  4.3–8.2 and peaks 8.7–14 dB above its median 0.25 ms level; the smooth body had 3.4 and
  6.7 dB, i.e. plain noise. At 5000 impacts a second, each 0.6 ms long, with `body` 0.35, the
  takes measure 4.2–7.4 and 10–12 dB, and the rebuilt burst keeps its gaps 11.6 dB below the
  strikes (recording 11.7 dB).
- `renderClickVariants(sampleRate, options, count)` renders `count` takes seeded
  `0x5f1a95 + i`; take 0 is the default click.
- A softer, lower clack (fitted earlier to a generated single-flap sound) is documented in the
  README as a `synth` preset: `frequency` 1100, `resonance` 0.6, `noise` 0.91, `brightness` 0.5,
  `attack` 0.003, `decay` 0.004, `body` 0.15, `bodyDecay` 0.022, `bounceDelay` 0.022.
- Default `random` is a fixed-seed PRNG (mulberry32, seed 0x5f1a95), so the default click is
  identical on every load.
- Validation: `frequency`, `resonance`, `decay`, `duration`, `bodyDecay` > 0; `noise`, `body`, `bounce` in
  0..1; `brightness` in (0, 1] (0 would filter the click to silence); `attack`, `bounceDelay`
  >= 0; all finite, else `RangeError`.

### Samples

- `sample` is one recording or a list; each is an `AudioBuffer` (used as-is) or a URL (`unlock()`
  runs `fetch(url)` → `arrayBuffer()` → `context.decodeAudioData()`). All load in parallel.
- With `sample`, the synth is never rendered or played: the graph is built and `unlocked` is true
  at once, but landings are silent until the recordings load. If any fails, `unlock()` rejects
  with the first error and the ones that loaded are played; if none loads the board stays silent.
  (Earlier versions fell back to the synth; dropped so a board set up with real recordings never
  plays a synthetic click.)

### Mixing

- Graph per click: `AudioBufferSourceNode → GainNode → StereoPannerNode → master GainNode →
  soft clipper → destination`. The master gain is created on unlock; its value is
  `muted ? 0 : volume`.
- Soft clipper: a `GainNode` of `1 / CLIP_RANGE` (4) into a `WaveShaperNode` (oversample `none`: with `2x`/`4x` the resampling filter rang up to 9% past 1.0 on the crisp click)
  whose curve is unity up to `CLIP_KNEE` (0.7) and a tanh shoulder above it that approaches but
  never passes 1. Normal levels pass untouched; a burst that sums past full scale is rounded off
  instead of hard-clipping at the output. (A `DynamicsCompressorNode` was rejected: its automatic
  makeup gain raises every click, and it lets 5 ms transients through.)
- Per-click variation (from `random`): `playbackRate = 1 + (2r₁ − 1) × variation.pitch`;
  `gain = 1 − r₂ × variation.volume`; start delay `r₃ × variation.timing`.
- Takes: on unlock the synth click is rendered as 8 takes (`renderClickVariants`), and each
  landing plays take `floor(r₄ × 8)`, so a fast run doesn't repeat one sound. With samples, the
  loaded recordings are the takes; a single one draws no `r₄`.
- Voice cap: playing voices are kept oldest first and removed on the source's `ended` event. A
  landing while `maxVoices` are playing steals the oldest: its gain ramps to 0
  (`setTargetAtTime(0, now, 0.004)`) and its source stops 20 ms later, so every landing is heard
  and only the quiet end of an old tail is cut. (Skipping landings instead dropped 62% of them on
  the example board once the click grew a 140 ms tail.)
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
  `context.resume()`; builds the master gain; loads the samples (URLs) or renders the synth click takes into
  `context.createBuffer(1, length, context.sampleRate)`. Repeated calls return the same promise.
- Browsers require a user gesture; README documents
  `addEventListener('pointerdown', () => sound.unlock(), { once: true })`.

### Destroy

- Unsubscribes from the target, disconnects the master and clipper, and closes the context only if
  `FlapSound` created it (an injected context is left open).

## Error handling

| Situation | Behaviour |
| --- | --- |
| `volume`/`pan` outside 0..1, `maxVoices` not a whole number >= 1, negative/non-finite `variation` | `RangeError` at construction (and from the `volume` setter) |
| Invalid synth options | `RangeError` from `renderClick` (surfaced by the constructor's validation) |
| No Web Audio | Construction works; `unlock()` rejects |
| Sample URL fetch/decode fails | `unlock()` rejects; the samples that loaded play; none loaded: silent |
| `play()` before unlock or after destroy | No-op |

## Testing

- `renderClick`: length; starts from silence (fade-in); over 60% of the strike's energy above
  4 kHz and under 3% below 600 Hz; no 200 Hz band holds 10% of it (unpitched); rattles on after
  the strike and bounces once; the rattle of every take is spiky (kurtosis > 4) and a smooth
  body is not; takes differ and take 0 is the default click; peak near the start and decay towards
  the end; deterministic for the default seed; `noise: 0` matches a decaying sine (with
  `brightness: 1`, `attack: 0`, `body: 0`, `bounce: 0`); stays finite with `frequency` above
  Nyquist; every sample within ±0.9 after normalization; validation errors.
- Pan tables: board with mixed `cells` widths, field, unit, `pan: 0`, single column.
- `FlapSound` with a recording fake `AudioContext` (createBufferSource / createGain /
  createStereoPanner / createBuffer / decodeAudioData / resume / close; `ended` triggered
  manually): silent before unlock; plays on `flipend` with expected pan, rate and gain (seeded
  `random`), including the timing spread; master → headroom → soft clipper → destination; clipper
  curve unity below the knee, monotonic and within ±1; oldest voice faded and stopped when all are busy; a different synth take per landing; voice release on `ended`; muted creates no nodes; `volume` setter
  updates master gain; URL sample via stubbed `fetch`; several samples picked per landing; silent while samples load; a failed load rejects, plays the
  samples that loaded and never the synth;
  `destroy` unsubscribes; closes only a context it created; missing Web Audio rejects.
- Entry point export test; build dist check covers `/sound`.
- Examples app: a "Sound" toggle (unlock then mute/unmute). Final listening check is manual.
