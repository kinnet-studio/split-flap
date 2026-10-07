import type { RowValues, Schema } from './board.js';

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
