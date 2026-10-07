import { FlapBoard } from '../core/board.js';
import { FlapField } from '../core/field.js';
import type { FlapSequence } from '../core/sequence.js';
import { FlapUnit } from '../core/unit.js';

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
export type RenderTarget = FlapBoard<any> | FlapField<any, any> | FlapUnit<any>;

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
