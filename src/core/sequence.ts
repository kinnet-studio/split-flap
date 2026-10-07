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
