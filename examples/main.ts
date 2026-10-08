/// <reference types="vite/client" />
import {
    CHARSETS,
    defineField,
    FlapBoard,
    FlapField,
    FlapSequence,
    type RowValues,
    textField,
} from '@kinnet-studio/split-flap';
import {
    CanvasFlapRenderer,
    colorFace,
    type Ctx2D,
    type FaceContext,
    type FacePainter,
    type Finish,
    FLAP_THEMES,
    type FlapStyle,
    textFace,
    type ThemeName,
} from '@kinnet-studio/split-flap/canvas';
import { PixiFlapView } from '@kinnet-studio/split-flap/pixi';
import { FlapSound } from '@kinnet-studio/split-flap/sound';
import { Application } from 'pixi.js';

// The default sound: single flaps cut from a recording of a real board (see
// flap-sounds/CREDITS.md).
const recordedFlaps = Object.values(
    import.meta.glob<string>('./flap-sounds/*.wav', {
        eager: true,
        query: '?url',
        import: 'default',
    })
);
// Your own recordings anywhere under examples/sounds/ (git-ignored, so they
// are never committed) add a "your recordings" choice.
const localFlaps = Object.values(
    import.meta.glob<string>(
        './sounds/**/*.{wav,WAV,mp3,MP3,ogg,OGG,m4a,M4A}',
        { eager: true, query: '?url', import: 'default' }
    )
);

/** What the Sound select can pick; recordings run louder, so lower volume. */
const SOUND_SOURCES: Record<string, { sample?: string[]; volume: number }> = {
    recorded: { sample: recordedFlaps, volume: 0.3 },
    synth: { volume: 0.4 },
    local: { sample: localFlaps, volume: 0.3 },
};

const chars = FlapSequence.chars(`${CHARSETS.alphanumeric}:`);
const cities = new FlapSequence([
    '',
    'TOKYO',
    'OSAKA',
    'KYOTO',
    'NAGOYA',
    'SENDAI',
    'HAKATA',
    'DELAYED',
]);

/** Background for every other departures row, per theme. */
const ROW_TINTS: Record<ThemeName, string> = {
    classic: '#2c2c31',
    solari: '#343438',
    airport: '#e6b800',
    cream: '#e3dccd',
};

/** A readable red for the DELAYED destination on each theme. */
const DELAYED_COLORS: Record<ThemeName, string> = {
    classic: '#ff5a4f',
    solari: '#ff5a4f',
    airport: '#b3261e',
    cream: '#b3261e',
};

const style: FlapStyle = {
    radius: 4,
    hingeGap: 1,
    stack: { count: 3, step: 2 },
};
const cell = { w: 28, h: 44 };
const charFace = textFace({
    font: '600 26px ui-monospace, Menlo, monospace',
    color: '#f4f1e8',
    background: '#232326',
});
const wordFace = textFace({
    font: '600 22px system-ui, sans-serif',
    color: '#f4f1e8',
    background: '#232326',
});

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

async function departures(): Promise<void> {
    const schema = {
        time: textField({ sequence: chars, length: 5 }),
        dest: defineField({
            sequence: cities,
            length: 1,
            cells: 5,
            unit: { flipDuration: 120 },
        }),
        plat: textField({ sequence: chars, length: 2, align: 'right' }),
    };
    const board = new FlapBoard({
        rows: 4,
        schema,
        stagger: { order: 'column', step: 25 },
    });
    const messages: RowValues<typeof schema>[][] = [
        [
            { time: '09:15', dest: 'TOKYO', plat: '3' },
            { time: '09:42', dest: 'OSAKA', plat: '12' },
            { time: '10:05', dest: 'KYOTO', plat: '7' },
            { time: '10:30', dest: 'HAKATA', plat: '1' },
        ],
        [
            { time: '11:00', dest: 'NAGOYA', plat: '4' },
            { time: '11:20', dest: 'DELAYED', plat: '9' },
            { time: '11:45', dest: 'TOKYO', plat: '2' },
        ],
    ];
    const gap = { unit: 3, field: 16, row: 8 };
    const themeSelect = document.getElementById('theme');
    const finishSelect = document.getElementById('finish');
    const selected = () => ({
        theme: (themeSelect instanceof HTMLSelectElement
            ? themeSelect.value
            : 'classic') as ThemeName,
        finish: (finishSelect instanceof HTMLSelectElement
            ? finishSelect.value
            : 'matte') as Finish,
    });

    // Painters and style for a theme + finish: a red DELAYED destination and
    // alternating row tints.
    const look = (theme: ThemeName, finish: Finish) => {
        const rows = (row: number) =>
            row % 2 ? { background: ROW_TINTS[theme] } : undefined;
        const charPainter = textFace({
            font: '600 26px ui-monospace, Menlo, monospace',
            theme,
            rows,
        });
        const face = {
            time: charPainter,
            dest: textFace({
                font: '600 22px system-ui, sans-serif',
                theme,
                rows,
                colors: flap =>
                    flap === 'DELAYED'
                        ? { color: DELAYED_COLORS[theme] }
                        : undefined,
            }),
            plat: charPainter,
        };
        const lookStyle: FlapStyle = {
            ...style,
            finish,
            hingeColor: FLAP_THEMES[theme].hinge,
        };
        return { face, style: lookStyle };
    };

    // The canvas renderer advances the board; the Pixi view only mirrors it.
    const initial = look(selected().theme, selected().finish);
    const renderer = new CanvasFlapRenderer({
        canvas: canvasById('departures-canvas'),
        target: board,
        face: initial.face,
        cell,
        gap,
        style: initial.style,
    });
    renderer.start();

    const app = new Application();
    await app.init({
        width: renderer.width,
        height: renderer.height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio,
        autoDensity: true,
    });
    document.getElementById('departures-pixi')?.append(app.canvas);
    const view = new PixiFlapView({
        target: board,
        face: initial.face,
        cell,
        gap,
        style: initial.style,
    });
    app.stage.addChild(view);
    app.ticker.add(() => view.sync());

    // Switch both renderers to the new look in place.
    const restyle = () => {
        const next = look(selected().theme, selected().finish);
        for (const target of [renderer, view]) {
            target.setStyle(next.style);
            target.setFace(next.face);
        }
    };
    themeSelect?.addEventListener('change', restyle);
    finishSelect?.addEventListener('change', restyle);

    let index = 0;
    board.show(messages[index]);
    onClick('next', () => {
        index = (index + 1) % messages.length;
        board.show(messages[index]);
    });
    onClick('play', () => board.play(messages, { hold: 4000 }));
    onClick('spin', () => board.spin());
    onClick('stop', () => board.stop());

    // Sound starts muted; the first click unlocks audio (browsers require a
    // user gesture) and toggles it on. Picking another source swaps in a new
    // FlapSound that keeps the old one's muted and unlocked state.
    const sourceSelect = document.getElementById('sound-source');
    if (sourceSelect instanceof HTMLSelectElement && localFlaps.length > 0) {
        sourceSelect.add(
            new Option(`Sound: your recordings (${localFlaps.length})`, 'local')
        );
    }
    const makeSound = (muted: boolean) => {
        const key =
            sourceSelect instanceof HTMLSelectElement
                ? sourceSelect.value
                : 'recorded';
        const { sample, volume } = SOUND_SOURCES[key] ?? SOUND_SOURCES.recorded;
        return new FlapSound({
            target: board,
            volume,
            muted,
            ...(sample ? { sample } : {}),
        });
    };
    let sound = makeSound(true);
    const soundButton = document.getElementById('sound');
    onClick('sound', () => {
        sound.unlock().catch(error => console.error(error));
        sound.muted = !sound.muted;
        if (soundButton) {
            soundButton.textContent = sound.muted ? 'Sound: off' : 'Sound: on';
        }
    });
    sourceSelect?.addEventListener('change', () => {
        const { muted, unlocked } = sound;
        sound.destroy();
        sound = makeSound(muted);
        if (unlocked) {
            sound.unlock().catch(error => console.error(error));
        }
    });
}

function grid(): void {
    const board = new FlapBoard({
        rows: 2,
        schema: {
            text: textField({
                sequence: chars,
                length: 11,
                unit: { flipDuration: 60 },
            }),
        },
        stagger: { order: 'diagonal', step: 30 },
    });
    // Fills the wrapper's width and re-fits when the window resizes.
    const wrap = document.getElementById('grid-wrap');
    new CanvasFlapRenderer({
        canvas: canvasById('grid-canvas'),
        target: board,
        face: charFace,
        cell,
        gap: { unit: 3, row: 6 },
        style,
        fit: wrap ? { element: wrap } : undefined,
    }).start();
    const input = document.getElementById('grid-input');
    const show = () => {
        const text =
            input instanceof HTMLInputElement ? input.value.toUpperCase() : '';
        board.show([{ text: text.slice(0, 11) }, { text: text.slice(11, 22) }]);
    };
    onClick('grid-show', show);
    show();
}

/** Spaces kept between the end of a marquee message and its next pass. */
const MARQUEE_GAP = 3;

/**
 * Every position of `text` sliding right to left through `width` units, one
 * character per frame. The last frame leads back into the first, so the
 * frames loop seamlessly. Short messages get a longer gap so they never show
 * twice at once.
 */
function marqueeFrames(text: string, width: number): string[] {
    const tape = Array.from(text);
    const gap = Math.max(MARQUEE_GAP, width - tape.length);
    tape.push(...Array.from({ length: gap }, () => ' '));
    return tape.map((_, start) =>
        Array.from(
            { length: width },
            (_, index) => tape[(start + index) % tape.length]
        ).join('')
    );
}

/**
 * Text scrolling sideways, one character per step. Like a real drum, each
 * unit flips through every character between the one it shows and the next
 * one, so it lags behind the text. The pace decides where that lag shows:
 *
 * - `settle`: a looping playlist moves on only once every unit has caught up
 *   (plus a short hold), so the scroll stalls on steps that need long runs.
 * - A number of ms: the text moves at that fixed pace regardless, and units
 *   that have not caught up chase their new character. A unit needs about
 *   half a drum of flips per character, so short steps or slow flaps leave
 *   the text unreadable.
 */
function marquee(): void {
    const width = 16;
    const board = new FlapBoard({
        rows: 1,
        schema: {
            text: textField({
                sequence: FlapSequence.chars(
                    `${CHARSETS.alphanumeric}.,:;!?'"&/+-`
                ),
                length: width,
                unit: { flipDuration: 60 },
            }),
        },
    });
    new CanvasFlapRenderer({
        canvas: canvasById('marquee-canvas'),
        target: board,
        face: textFace({
            font: '600 26px ui-monospace, Menlo, monospace',
            theme: 'solari',
        }),
        cell,
        gap: { unit: 3 },
        style: { ...style, hingeColor: FLAP_THEMES.solari.hinge },
    }).start();

    const input = document.getElementById('marquee-input');
    const pace = document.getElementById('marquee-pace');
    let timer: ReturnType<typeof setInterval> | undefined;
    const scroll = () => {
        clearInterval(timer);
        const text =
            input instanceof HTMLInputElement ? input.value.toUpperCase() : '';
        const frames = marqueeFrames(text, width);
        // The pace is 'settle' (NaN here) or a step length in ms.
        const ms = pace instanceof HTMLSelectElement ? Number(pace.value) : NaN;
        if (ms > 0) {
            let index = 0;
            const step = () => {
                board.show([{ text: frames[index] }]);
                index = (index + 1) % frames.length;
            };
            step();
            timer = setInterval(step, ms);
            return;
        }
        board.play(
            frames.map(frame => [{ text: frame }]),
            { hold: 60, loop: true }
        );
    };
    onClick('marquee-scroll', scroll);
    pace?.addEventListener('change', scroll);
    // Scales flips (and playlist holds), not the fixed pace's timer.
    const speed = document.getElementById('marquee-speed');
    speed?.addEventListener('change', () => {
        if (speed instanceof HTMLSelectElement) {
            board.timeScale = Number(speed.value);
        }
    });
    scroll();
}

function colours(): void {
    const palette = new FlapSequence([
        '#232326',
        '#e4572e',
        '#f3a712',
        '#29335c',
        '#669bbc',
        '#a8c686',
    ]);
    const field = new FlapField(
        defineField({
            sequence: palette,
            length: 8,
            stagger: { order: 'sequential', step: 60 },
            unit: { flipDuration: 90, direction: 'shortest' },
        })
    );
    new CanvasFlapRenderer({
        canvas: canvasById('colors-canvas'),
        target: field,
        face: colorFace(),
        cell,
        gap: { unit: 3 },
        style,
    }).start();
    const shuffle = () =>
        field.set(
            Array.from({ length: 8 }, () =>
                palette.at(1 + Math.floor(Math.random() * (palette.length - 1)))
            )
        );
    shuffle();
    setInterval(shuffle, 2500);
}

/** Draws a whole picture into a `width × height` box. */
type Picture = (ctx: Ctx2D, width: number, height: number) => void;

/**
 * A picture with a background and a centred shape in `color`. `draw` works in
 * a 100 × 100 box and fills each part of the shape itself.
 */
function icon(
    background: string,
    color: string,
    draw: (ctx: Ctx2D) => void
): Picture {
    return (ctx, width, height) => {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
        const size = Math.min(width, height) * 0.8;
        ctx.translate((width - size) / 2, (height - size) / 2);
        ctx.scale(size / 100, size / 100);
        ctx.fillStyle = color;
        draw(ctx);
    };
}

function polygon(ctx: Ctx2D, points: readonly [number, number][]): void {
    ctx.beginPath();
    points.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    ctx.fill();
}

const PICTURES: Record<string, Picture> = {
    // The blank pad flap.
    '': (ctx, width, height) => {
        ctx.fillStyle = '#232326';
        ctx.fillRect(0, 0, width, height);
    },
    plane: icon('#1d4f91', '#f4f1e8', ctx => {
        ctx.translate(50, 50);
        ctx.rotate(Math.PI / 4);
        ctx.translate(-50, -50);
        ctx.beginPath();
        ctx.roundRect(44, 6, 12, 84, 6);
        ctx.fill();
        polygon(ctx, [
            [44, 38],
            [6, 58],
            [6, 66],
            [44, 56],
            [56, 56],
            [94, 66],
            [94, 58],
            [56, 38],
        ]);
        polygon(ctx, [
            [46, 74],
            [30, 86],
            [30, 92],
            [46, 86],
            [54, 86],
            [70, 92],
            [70, 86],
            [54, 74],
        ]);
    }),
    arrow: icon('#f5c400', '#141414', ctx =>
        polygon(ctx, [
            [10, 38],
            [52, 38],
            [52, 16],
            [90, 50],
            [52, 84],
            [52, 62],
            [10, 62],
        ])
    ),
    heart: icon('#efe9dc', '#e4572e', ctx => {
        ctx.beginPath();
        ctx.moveTo(50, 88);
        ctx.bezierCurveTo(20, 66, 6, 48, 6, 32);
        ctx.bezierCurveTo(6, 18, 17, 10, 29, 10);
        ctx.bezierCurveTo(39, 10, 47, 16, 50, 25);
        ctx.bezierCurveTo(53, 16, 61, 10, 71, 10);
        ctx.bezierCurveTo(83, 10, 94, 18, 94, 32);
        ctx.bezierCurveTo(94, 48, 80, 66, 50, 88);
        ctx.fill();
    }),
    sun: icon('#669bbc', '#f3a712', ctx => {
        ctx.beginPath();
        ctx.arc(50, 50, 22, 0, Math.PI * 2);
        ctx.fill();
        for (let ray = 0; ray < 8; ray++) {
            ctx.save();
            ctx.translate(50, 50);
            ctx.rotate((ray * Math.PI) / 4);
            ctx.beginPath();
            ctx.roundRect(-4, -48, 8, 16, 4);
            ctx.fill();
            ctx.restore();
        }
    }),
};

/**
 * One picture spread across a grid of units, like an airline logo on a
 * station board. Each column is its own single-unit field, so a painter can
 * tell the units apart by `{ row, field }`: it draws the whole picture shifted
 * by its unit's position, and the face keeps only that unit's slice.
 */
function tiledIcons(): void {
    const cols = 6;
    const rows = 5;
    const tileCell = { w: 40, h: 48 };
    const gap = 3;
    const pictureWidth = cols * tileCell.w + (cols - 1) * gap;
    const pictureHeight = rows * tileCell.h + (rows - 1) * gap;

    // Every unit carries the same drum of pictures; only its slice differs.
    const pictures = new FlapSequence(Object.keys(PICTURES));
    const columns = Array.from({ length: cols }, (_, col) => `c${col}`);
    const board = new FlapBoard({
        rows,
        schema: Object.fromEntries(
            columns.map(name => [
                name,
                defineField({
                    sequence: pictures,
                    length: 1,
                    unit: { flipDuration: 80 },
                }),
            ])
        ),
        stagger: { order: 'diagonal', step: 40 },
    });

    // The offset includes the gaps, as if the picture were printed across the
    // modules: the gaps hide thin strips of it instead of stretching it.
    const sliceOf = (col: number): FacePainter<string> =>
        Object.assign(
            (
                ctx: Ctx2D,
                flap: string,
                _width: number,
                _height: number,
                context?: FaceContext
            ) => {
                const row = context?.row ?? 0;
                // Restore the transform: the finish is baked in after this.
                ctx.save();
                ctx.translate(
                    -col * (tileCell.w + gap),
                    -row * (tileCell.h + gap)
                );
                PICTURES[flap]?.(ctx, pictureWidth, pictureHeight);
                ctx.restore();
            },
            // Faces differ by row, so renderers must cache them per row.
            { perRow: true }
        );
    new CanvasFlapRenderer({
        canvas: canvasById('icons-canvas'),
        target: board,
        face: Object.fromEntries(
            columns.map((name, col) => [name, sliceOf(col)])
        ),
        cell: tileCell,
        gap: { field: gap, row: gap },
        style: { radius: 3, hingeGap: 1, finish: 'satin' },
    }).start();

    // A message that shows one picture on every unit.
    const showing = (picture: string) =>
        Array.from({ length: rows }, () =>
            Object.fromEntries(columns.map(name => [name, picture]))
        );
    const names = Object.keys(PICTURES).filter(name => name !== '');
    const playAll = () =>
        board.play(names.map(showing), { hold: 2500, loop: true });
    for (const name of names) {
        onClick(`icon-${name}`, () => board.show(showing(name)));
    }
    onClick('icons-play', playAll);
    playAll();
}

grid();
marquee();
colours();
tiledIcons();
departures().catch(error => console.error(error));
