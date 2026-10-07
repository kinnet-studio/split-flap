// Smoke test for the built package: imports every dist entry and checks the
// pieces that a broken bundle (e.g. dropped shared chunks) would lose.
const EXPECTED_CORE_EXPORTS = [
    'CHARSETS',
    'DEFAULT_FLIP_DURATION',
    'DEFAULT_HOLD',
    'FlapBoard',
    'FlapField',
    'FlapSequence',
    'FlapUnit',
    'defineField',
    'fieldStaggerDelays',
    'planPath',
    'textField',
];

const failures: string[] = [];

function check(condition: boolean, message: string): void {
    if (!condition) {
        failures.push(message);
    }
}

try {
    const core = await import('../dist/core/index.js');
    const canvasEntry = await import('../dist/canvas/index.js');
    const pixi = await import('../dist/pixi/index.js');
    const sound = await import('../dist/sound/index.js');
    const react = await import('../dist/react/index.js');
    const reactPixi = await import('../dist/react-pixi/index.js');
    const vue = await import('../dist/vue/index.js');
    const vuePixi = await import('../dist/vue-pixi/index.js');

    const keys = Object.keys(core).sort();
    const expected = [...EXPECTED_CORE_EXPORTS].sort();
    check(
        JSON.stringify(keys) === JSON.stringify(expected),
        `core exports differ.\n  expected: ${expected.join(', ')}\n  actual:   ${keys.join(', ')}`
    );

    const unit = new core.FlapUnit({
        sequence: core.FlapSequence.chars(' A'),
    });
    const slots = canvasEntry.layout(unit, { cell: { w: 1, h: 1 } }).slots;
    check(
        slots.length === 1,
        `canvas layout() did not recognise a core FlapUnit (instanceof across entries is broken); got ${slots.length} slots`
    );

    check(
        typeof pixi.PixiFlapView === 'function',
        'pixi entry does not export PixiFlapView as a function'
    );

    check(
        typeof sound.FlapSound === 'function',
        'sound entry does not export FlapSound as a function'
    );

    check(
        typeof react.useFlapBoard === 'function' &&
            typeof react.SplitFlapCanvas === 'function' &&
            typeof reactPixi.usePixiFlapView === 'function',
        'react entries do not export useFlapBoard, SplitFlapCanvas and usePixiFlapView'
    );

    check(
        typeof vue.useFlapBoard === 'function' &&
            typeof vue.SplitFlapCanvas === 'object' &&
            typeof vuePixi.usePixiFlapView === 'function',
        'vue entries do not export useFlapBoard, SplitFlapCanvas and usePixiFlapView'
    );
} catch (error) {
    failures.push(`failed to load dist: ${String(error)}`);
}

if (failures.length > 0) {
    console.error('check-dist failed:');
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exit(1);
}
console.log('check-dist ok');
