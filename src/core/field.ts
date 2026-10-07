import { Emitter } from './emitter.js';
import type { FlapSequence } from './sequence.js';
import { FlapUnit, type FlipEvent, type UnitOptions } from './unit.js';

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
        // `units` is public API; work started on a unit directly counts too.
        if (!this.isSettled) {
            this.wasSettled = false;
        }
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
            align === 'left'
                ? 0
                : align === 'right'
                  ? free
                  : Math.floor(free / 2);
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
