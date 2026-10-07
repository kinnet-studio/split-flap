import { Emitter } from './emitter.js';
import { type Cycle, type Direction, planPath } from './plan-path.js';
import type { FlapSequence } from './sequence.js';

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
        return this.flip === null && this.queue.length === 0 && !this.spinning;
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

    /**
     * Advances time by `dt` ms. Overshoot carries into the next flip.
     *
     * A spinning unit with no flip pending fast-forwards whole revolutions
     * when `dt` is huge, so the cost does not grow with `dt`. The visible end
     * state is identical; the skipped flips emit no events.
     */
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
                if (this.spinning && this.queue.length === 0) {
                    // Whole revolutions land back on the same flap: drop them.
                    const rev = this.flipDuration * this.sequence.length;
                    if (remaining > 2 * rev) {
                        remaining = rev + (remaining % rev);
                    }
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
                if (this.flip !== flip) {
                    // A flipstart listener replaced the flip (snapTo, etc.).
                    continue;
                }
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
        const to = queued ?? (this.currentIndex + 1) % this.sequence.length;
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
