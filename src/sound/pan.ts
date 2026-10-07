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
