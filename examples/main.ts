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
    type Finish,
    FLAP_THEMES,
    type FlapStyle,
    textFace,
    type ThemeName,
} from '@kinnet-studio/split-flap/canvas';
import { PixiFlapView } from '@kinnet-studio/split-flap/pixi';
import { FlapSound } from '@kinnet-studio/split-flap/sound';
import { Application } from 'pixi.js';

// Flap recordings anywhere under examples/sounds/ (git-ignored, so they are
// never committed) replace the synth click; without any, the synth plays.
const recordings = Object.values(
    import.meta.glob<string>(
        './sounds/**/*.{wav,WAV,mp3,MP3,ogg,OGG,m4a,M4A}',
        { eager: true, query: '?url', import: 'default' }
    )
);
console.info(
    recordings.length > 0
        ? `Sound: ${recordings.length} recordings from examples/sounds/`
        : 'Sound: synth (no audio files found in examples/sounds/)'
);

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
    // user gesture) and toggles it on.
    const sound = new FlapSound({
        target: board,
        volume: 0.4,
        muted: true,
        ...(recordings.length > 0 ? { sample: recordings } : {}),
    });
    const source =
        recordings.length > 0 ? `${recordings.length} recordings` : 'synth';
    const soundButton = document.getElementById('sound');
    onClick('sound', () => {
        sound.unlock().catch(error => console.error(error));
        sound.muted = !sound.muted;
        if (soundButton) {
            soundButton.textContent = sound.muted
                ? 'Sound: off'
                : `Sound: on (${source})`;
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

grid();
colours();
departures().catch(error => console.error(error));
