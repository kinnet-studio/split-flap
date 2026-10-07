// Board data and painters shared by the React and Vue adapter demos.
import {
    CHARSETS,
    defineField,
    FlapSequence,
    type RowValues,
    textField,
} from '@kinnet-studio/split-flaps';
import {
    FLAP_THEMES,
    type FlapStyle,
    textFace,
    type ThemeName,
} from '@kinnet-studio/split-flaps/canvas';

const chars = FlapSequence.chars(`${CHARSETS.alphanumeric}:`);
const cities = new FlapSequence(['', 'TOKYO', 'OSAKA', 'KYOTO', 'NAGOYA']);

export const schema = {
    time: textField({ sequence: chars, length: 5 }),
    dest: defineField({
        sequence: cities,
        length: 1,
        cells: 5,
        unit: { flipDuration: 120 },
    }),
    plat: textField({ sequence: chars, length: 2, align: 'right' }),
};

export const messages: RowValues<typeof schema>[][] = [
    [
        { time: '09:15', dest: 'TOKYO', plat: '3' },
        { time: '09:42', dest: 'OSAKA', plat: '12' },
        { time: '10:05', dest: 'KYOTO', plat: '7' },
    ],
    [
        { time: '11:00', dest: 'NAGOYA', plat: '4' },
        { time: '11:45', dest: 'TOKYO', plat: '2' },
    ],
];

export const THEMES: ThemeName[] = ['classic', 'solari', 'airport', 'cream'];
export const cell = { w: 28, h: 44 };
export const gap = { unit: 3, field: 16, row: 8 };

/** Painters for a theme. Create once per theme so they stay stable. */
export function facesFor(theme: ThemeName) {
    const charFace = textFace({
        font: '600 26px ui-monospace, Menlo, monospace',
        theme,
    });
    return {
        time: charFace,
        dest: textFace({ font: '600 22px system-ui, sans-serif', theme }),
        plat: charFace,
    };
}

export function styleFor(theme: ThemeName): FlapStyle {
    return {
        radius: 4,
        finish: 'matte',
        hingeColor: FLAP_THEMES[theme].hinge,
        stack: { count: 3, step: 2 },
    };
}
