import { Emitter } from './emitter.js';
import { type FieldSpec, fieldStaggerDelays, FlapField } from './field.js';
import { type Message, type PlayOptions, Playlist } from './playlist.js';
import { checkTimeScale } from './time-scale.js';
import type { FlipEvent } from './unit.js';

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

export interface BoardFlipEvent<S extends Schema> extends FlipEvent<
    FlapOf<S[keyof S]>
> {
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
    private scale = 1;

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
        const fields = this.rowFields(row);
        if (!Object.hasOwn(fields, name)) {
            throw new RangeError(`FlapBoard: unknown field "${name}"`);
        }
        return fields[name] as BoardField<S, K>;
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

    /** Sets the whole board and cancels any playlist. Missing fields and rows go to their pad flap. */
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

    /**
     * Multiplies every `dt` passed to {@link update}: 2 runs twice as fast,
     * 0.5 at half speed, 0 pauses. Compounds with parent scales.
     */
    get timeScale(): number {
        return this.scale;
    }

    set timeScale(value: number) {
        this.scale = checkTimeScale(value, 'FlapBoard');
    }

    /**
     * Advances every field and the playlist by `dt` ms (times
     * {@link timeScale}), so playlist holds scale too.
     */
    update(dt: number): void {
        const scaled = dt * this.scale;
        if (!(scaled > 0) || !Number.isFinite(scaled)) {
            return;
        }
        // Children are public API; work started on them directly counts too.
        if (!this.isSettled) {
            this.wasSettled = false;
        }
        this.eachField(field => field.update(scaled));
        this.playlist?.update(scaled);
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
            if (value !== undefined) {
                fields[name].set(value, { delays: this.delaysFor(row, name) });
            } else if (clearMissing) {
                fields[name].clear({ delays: this.delaysFor(row, name) });
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
