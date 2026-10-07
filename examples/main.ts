import {
    CHARSETS,
    defineField,
    FlapBoard,
    FlapField,
    FlapSequence,
    type RowValues,
    textField,
} from '@kinnet-studio/split-flaps';
import {
    CanvasFlapRenderer,
    colorFace,
    type FlapStyle,
    textFace,
} from '@kinnet-studio/split-flaps/canvas';
import { PixiFlapView } from '@kinnet-studio/split-flaps/pixi';
import { FlapSound } from '@kinnet-studio/split-flaps/sound';
import { Application } from 'pixi.js';

const chars = FlapSequence.chars(`${CHARSETS.alphanumeric}:`);
const cities = new FlapSequence([
    '',
    'TOKYO',
    'OSAKA',
    'KYOTO',
    'NAGOYA',
    'SENDAI',
    'HAKATA',
]);

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
            { time: '11:20', dest: 'SENDAI', plat: '9' },
            { time: '11:45', dest: 'TOKYO', plat: '2' },
        ],
    ];
    const face = { time: charFace, dest: wordFace, plat: charFace };
    const gap = { unit: 3, field: 16, row: 8 };

    // The canvas renderer advances the board; the Pixi view only mirrors it.
    const renderer = new CanvasFlapRenderer({
        canvas: canvasById('departures-canvas'),
        target: board,
        face,
        cell,
        gap,
        style,
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
    const view = new PixiFlapView({ target: board, face, cell, gap, style });
    app.stage.addChild(view);
    app.ticker.add(() => view.sync());

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
    const sound = new FlapSound({ target: board, volume: 0.4 });
    sound.muted = true;
    const soundButton = document.getElementById('sound');
    onClick('sound', () => {
        sound.unlock().catch(error => console.error(error));
        sound.muted = !sound.muted;
        if (soundButton) {
            soundButton.textContent = sound.muted ? 'Sound: off' : 'Sound: on';
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
    new CanvasFlapRenderer({
        canvas: canvasById('grid-canvas'),
        target: board,
        face: charFace,
        cell,
        gap: { unit: 3, row: 6 },
        style,
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
