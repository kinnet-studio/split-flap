import {
    defineField,
    FlapBoard,
    FlapSequence,
    type UnitOptions,
} from '@kinnet-studio/split-flap';
import {
    CanvasFlapRenderer,
    colorFace,
    type Ctx2D,
    type FaceContext,
    type FacePainter,
    type FlapStyle,
} from '@kinnet-studio/split-flap/canvas';

const style: FlapStyle = { radius: 2, hingeGap: 1, finish: 'matte' };

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

/** A `rows × cols` array filled by `at(col, row)`. */
function frame<T>(
    cols: number,
    rows: number,
    at: (col: number, row: number) => T
): T[][] {
    return Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => at(col, row))
    );
}

/** The unit under a pointer, from the canvas's displayed size. */
function cellAt(
    canvas: HTMLCanvasElement,
    event: MouseEvent,
    cols: number,
    rows: number
): { col: number; row: number } {
    const box = canvas.getBoundingClientRect();
    const pick = (offset: number, size: number, count: number) =>
        Math.min(count - 1, Math.max(0, Math.floor((offset / size) * count)));
    return {
        col: pick(event.clientX - box.left, box.width, cols),
        row: pick(event.clientY - box.top, box.height, rows),
    };
}

interface MatrixOptions {
    canvas: string;
    cols: number;
    rows: number;
    sequence: FlapSequence<string>;
    face: FacePainter<string>;
    unit?: Omit<UnitOptions<string>, 'pad'>;
    cell?: { w: number; h: number };
}

/**
 * A `cols × rows` grid of units: a board with one row per grid row, each a
 * single field of `cols` units. `show` sets every unit from a frame, with an
 * optional start delay per unit, which is how the patterns below spread.
 */
function matrix(options: MatrixOptions) {
    const { cols, rows } = options;
    const board = new FlapBoard({
        rows,
        schema: {
            px: defineField({
                sequence: options.sequence,
                length: cols,
                unit: options.unit,
            }),
        },
    });
    const canvas = canvasById(options.canvas);
    const cell = options.cell ?? { w: 14, h: 18 };
    const gap = 2;
    new CanvasFlapRenderer({
        canvas,
        target: board,
        face: options.face,
        cell,
        gap: { unit: gap, row: gap },
        style,
    }).start();
    /** Distance between two units in CSS px. */
    const distance = (col: number, row: number, x: number, y: number) =>
        Math.hypot((col - x) * (cell.w + gap), (row - y) * (cell.h + gap));
    const show = (
        flaps: readonly string[][],
        delay?: (col: number, row: number) => number
    ): void => {
        flaps.forEach((line, row) =>
            board.field(row, 'px').set(line, {
                delays: delay && line.map((_, col) => delay(col, row)),
            })
        );
    };
    return { canvas, show, distance };
}

/**
 * Click anywhere: every unit flips to the next colour, starting later the
 * further it is from the click, so the colour spreads out in a ring. A
 * second click before the ring has passed replans each unit from where it
 * is, so the rings merge.
 */
function ripple(): void {
    const cols = 32;
    const rows = 14;
    const palette = new FlapSequence([
        '#232326',
        '#e4572e',
        '#f3a712',
        '#a8c686',
        '#669bbc',
        '#29335c',
    ]);
    const grid = matrix({
        canvas: 'ripple-canvas',
        cols,
        rows,
        sequence: palette,
        face: colorFace(),
        unit: { flipDuration: 70 },
    });
    let colour = 0;
    let lastClick = -Infinity;
    const splash = (x: number, y: number) => {
        colour = (colour + 1) % palette.length;
        const flap = palette.at(colour);
        grid.show(
            frame(cols, rows, () => flap),
            // Measured in px, so the ring is round although units are tall.
            (col, row) => grid.distance(col, row, x, y) * 3
        );
    };
    grid.canvas.addEventListener('click', event => {
        const { col, row } = cellAt(grid.canvas, event, cols, rows);
        lastClick = performance.now();
        splash(col, row);
    });
    // Splash from a random unit now and then, unless someone is clicking.
    setInterval(() => {
        if (performance.now() - lastClick > 4000) {
            splash(
                Math.floor(Math.random() * cols),
                Math.floor(Math.random() * rows)
            );
        }
    }, 3000);
    splash(cols / 2, rows / 2);
}

/**
 * Conway's Game of Life on a wrapping grid, a classic for flip-dot boards.
 * Each unit has two flaps, so a cell that is born or dies flips once. A small
 * random delay keeps the units from moving in perfect lockstep. Click a unit
 * to toggle its cell.
 */
function life(): void {
    const cols = 36;
    const rows = 18;
    const dead = '#232326';
    const alive = '#f5c400';
    const grid = matrix({
        canvas: 'life-canvas',
        cols,
        rows,
        sequence: new FlapSequence([dead, alive]),
        face: colorFace(),
        unit: { flipDuration: 90 },
    });
    let cells: boolean[][] = [];
    let generation = 0;
    let recent: string[] = [];
    const draw = () =>
        grid.show(
            cells.map(line => line.map(on => (on ? alive : dead))),
            () => Math.random() * 80
        );
    const seed = () => {
        cells = frame(cols, rows, () => Math.random() < 0.3);
        generation = 0;
        recent = [];
        draw();
    };
    const neighbours = (col: number, row: number) => {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx || dy) {
                    const y = (row + dy + rows) % rows;
                    const x = (col + dx + cols) % cols;
                    count += cells[y][x] ? 1 : 0;
                }
            }
        }
        return count;
    };
    const tick = () => {
        cells = frame(cols, rows, (col, row) => {
            const count = neighbours(col, row);
            return count === 3 || (cells[row][col] && count === 2);
        });
        generation++;
        // Start over once it settles into a still life or a short loop, or
        // has run for a while.
        const key = cells.flat().map(Number).join('');
        if (recent.includes(key) || generation > 400) {
            seed();
            return;
        }
        recent = [key, ...recent].slice(0, 3);
        draw();
    };
    grid.canvas.addEventListener('click', event => {
        const { col, row } = cellAt(grid.canvas, event, cols, rows);
        cells[row][col] = !cells[row][col];
        draw();
    });
    onClick('life-seed', seed);
    seed();
    setInterval(tick, 400);
}

/**
 * Plasma: overlapping sine waves, each value mapped onto a drum of twelve
 * hues. The drum is a circle and units take the shorter way round, so a unit
 * moves a flap or two per step and the bands flow.
 */
function plasma(): void {
    const cols = 28;
    const rows = 14;
    const hues = Array.from(
        { length: 12 },
        (_, index) => `hsl(${index * 30}, 70%, 55%)`
    );
    const grid = matrix({
        canvas: 'plasma-canvas',
        cols,
        rows,
        sequence: new FlapSequence(hues),
        face: colorFace(),
        unit: { flipDuration: 60, direction: 'shortest' },
    });
    let time = 0;
    setInterval(() => {
        time += 0.15;
        grid.show(
            frame(cols, rows, (x, y) => {
                const value =
                    Math.sin(x * 0.3 + time) +
                    Math.sin(y * 0.4 - time * 0.8) +
                    Math.sin((x + y) * 0.2 + time * 0.6) +
                    Math.sin(
                        Math.hypot(x - cols / 2, y - rows / 2) * 0.45 -
                            time * 1.2
                    );
                // value is in -4..4: go round the hue circle twice.
                const turn = ((value + 4) / 8) * 2;
                return hues[Math.floor(turn * hues.length) % hues.length];
            })
        );
    }, 160);
}

/**
 * Equalizer bars that jump up and fall back a unit at a time. Every unit has
 * just two flaps, off and on; the painter colours a lit unit by its row
 * (`perRow`), so the bars are green, then amber, then red at the top.
 */
function equalizer(): void {
    const cols = 24;
    const rows = 12;
    const litColor = (row: number) =>
        row < 2 ? '#e4572e' : row < 5 ? '#f3a712' : '#a8c686';
    const face = Object.assign(
        (
            ctx: Ctx2D,
            flap: string,
            width: number,
            height: number,
            context?: FaceContext
        ) => {
            ctx.fillStyle =
                flap === 'on' ? litColor(context?.row ?? 0) : '#202024';
            ctx.fillRect(0, 0, width, height);
        },
        { perRow: true }
    );
    const grid = matrix({
        canvas: 'eq-canvas',
        cols,
        rows,
        sequence: new FlapSequence(['off', 'on']),
        face,
        unit: { flipDuration: 45 },
    });
    let levels = Array.from({ length: cols }, () => 0);
    setInterval(() => {
        const noise = levels.map(() => Math.random() ** 1.5);
        levels = levels.map((level, col) => {
            // Smooth with the neighbours; louder at the low (left) end.
            const near =
                (noise[Math.max(0, col - 1)] +
                    2 * noise[col] +
                    noise[Math.min(cols - 1, col + 1)]) /
                4;
            const peak = Math.round(near * rows * (1.6 - (col / cols) * 0.8));
            return Math.min(rows, Math.max(peak, level - 1));
        });
        grid.show(
            frame(cols, rows, (col, row) =>
                rows - row <= levels[col] ? 'on' : 'off'
            )
        );
    }, 110);
}

/** 3 × 5 digits, row by row. */
const DIGITS = [
    '111101101101111',
    '010110010010111',
    '111001111100111',
    '111001111001111',
    '101101111001001',
    '111100111001111',
    '111100111101111',
    '111001001001001',
    '111101111101111',
    '111101111001111',
];
/** 1 × 5 colon. */
const COLON = '01010';

/**
 * A clock in a 3 × 5 pixel font. Each second only the pixels that change
 * flip, in a quick left-to-right sweep.
 */
function clock(): void {
    const cols = 29;
    const rows = 7;
    const off = '#2a2a2d';
    const on = '#f5b335';
    const grid = matrix({
        canvas: 'clock-canvas',
        cols,
        rows,
        sequence: new FlapSequence([off, on]),
        face: colorFace(),
        unit: { flipDuration: 80 },
        cell: { w: 16, h: 20 },
    });
    const draw = () => {
        const now = new Date();
        const text = [now.getHours(), now.getMinutes(), now.getSeconds()]
            .map(part => String(part).padStart(2, '0'))
            .join(':');
        const lit = frame(cols, rows, () => false);
        // A blank column around the edge and between glyphs.
        let x = 1;
        for (const char of text) {
            const glyph = char === ':' ? COLON : DIGITS[Number(char)];
            const width = glyph.length / 5;
            Array.from(glyph).forEach((pixel, index) => {
                if (pixel === '1') {
                    lit[1 + Math.floor(index / width)][x + (index % width)] =
                        true;
                }
            });
            x += width + 1;
        }
        grid.show(
            lit.map(line => line.map(pixel => (pixel ? on : off))),
            col => col * 12
        );
        // Wake again just after the next whole second.
        setTimeout(draw, 1000 - (Date.now() % 1000) + 10);
    };
    draw();
}

ripple();
life();
plasma();
equalizer();
clock();
