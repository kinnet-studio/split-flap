import { describe, expect, it } from 'vitest';

import {
    defineField,
    fieldStaggerDelays,
    FlapField,
    textField,
} from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const cities = new FlapSequence(['', 'TOKYO', 'OSAKA']);
const fast = { flipDuration: 10 };

function shown<V>(field: FlapField<string, V>): string {
    return field.units.map(unit => unit.state.current).join('');
}

function text(
    length: number,
    extra: Partial<Parameters<typeof textField>[0]> = {}
) {
    return new FlapField(
        textField({ sequence: alnum, length, unit: fast, ...extra })
    );
}

describe('FlapField', () => {
    it('starts with every unit on the pad flap', () => {
        expect(shown(text(3))).toBe('   ');
    });

    it('splits text across units, left-aligned and padded', () => {
        const field = text(3);
        field.set('AB');
        field.update(10_000);
        expect(shown(field)).toBe('AB ');
        expect(field.isSettled).toBe(true);
    });

    it('aligns right', () => {
        const field = text(4, { align: 'right' });
        field.set('AB');
        field.update(10_000);
        expect(shown(field)).toBe('  AB');
    });

    it('aligns center with the extra space on the right', () => {
        const field = text(5, { align: 'center' });
        field.set('AB');
        field.update(10_000);
        expect(shown(field)).toBe(' AB  ');
    });

    it('truncates overflow by default', () => {
        const field = text(2);
        field.set('ABC');
        field.update(10_000);
        expect(shown(field)).toBe('AB');
    });

    it('throws on overflow when asked to', () => {
        const field = text(2, { overflow: 'throw' });
        expect(() => field.set('ABC')).toThrow(RangeError);
    });

    it('pads with a custom pad flap', () => {
        const field = text(3, { pad: 'X' });
        expect(shown(field)).toBe('XXX');
        field.set('A');
        field.update(10_000);
        expect(shown(field)).toBe('AXX');
    });

    it('accepts a single flap or a flap array by default', () => {
        const single = new FlapField(
            defineField({ sequence: cities, length: 1, unit: fast })
        );
        single.set('OSAKA');
        single.update(10_000);
        expect(single.units[0].state.current).toBe('OSAKA');

        const pair = new FlapField(
            defineField({ sequence: cities, length: 2, unit: fast })
        );
        pair.set(['TOKYO', 'OSAKA']);
        pair.update(10_000);
        expect(pair.units.map(u => u.state.current)).toEqual([
            'TOKYO',
            'OSAKA',
        ]);
    });

    it('clears back to the pad flap', () => {
        const field = text(3);
        field.set('AB');
        field.update(10_000);
        field.clear();
        field.update(10_000);
        expect(shown(field)).toBe('   ');
    });

    it('snaps instantly', () => {
        const field = text(3);
        field.snap('AB');
        expect(shown(field)).toBe('AB ');
        expect(field.isSettled).toBe(true);
    });

    it('staggers unit start times', () => {
        const field = text(3, { stagger: { order: 'sequential', step: 50 } });
        field.set('AAA');
        field.update(10);
        expect(shown(field)).toBe('A  ');
    });

    it('lets explicit delays override the stagger', () => {
        const field = text(3, { stagger: { order: 'sequential', step: 50 } });
        field.set('AAA', { delays: [0, 0, 0] });
        field.update(10);
        expect(shown(field)).toBe('AAA');
    });

    it('emits flipend with the unit index and settled once', () => {
        const field = text(2);
        const flips: unknown[] = [];
        let settled = 0;
        field.on('flipend', event => flips.push(event));
        field.on('settled', () => settled++);
        field.set('A');
        field.update(10);
        field.update(10);
        expect(flips).toEqual([{ from: ' ', to: 'A', direction: 1, unit: 0 }]);
        expect(settled).toBe(1);
    });

    it('emits settled once when a unit is driven directly', () => {
        const field = text(2);
        let settled = 0;
        field.on('settled', () => settled++);
        field.units[1].setTarget('B');
        field.update(1000);
        field.update(1000);
        expect(field.isSettled).toBe(true);
        expect(settled).toBe(1);
    });

    it('spins and stops', () => {
        const field = text(2);
        field.spin();
        field.update(25);
        expect(field.isSettled).toBe(false);
        field.stop();
        field.update(100);
        expect(field.isSettled).toBe(true);
    });

    it('validates its length', () => {
        expect(() => text(0)).toThrow(RangeError);
        expect(() => text(1.5)).toThrow(RangeError);
    });

    it('exposes its sequence, length and cells', () => {
        const field = new FlapField(
            defineField({ sequence: cities, length: 1, cells: 6 })
        );
        expect(field.sequence).toBe(cities);
        expect(field.length).toBe(1);
        expect(field.cells).toBe(6);
        expect(text(2).cells).toBe(1);
    });
});

describe('fieldStaggerDelays', () => {
    it('computes delays for each order', () => {
        expect(
            fieldStaggerDelays({ order: 'sequential', step: 50 }, 3)
        ).toEqual([0, 50, 100]);
        expect(fieldStaggerDelays({ order: 'reverse', step: 50 }, 3)).toEqual([
            100, 50, 0,
        ]);
        expect(
            fieldStaggerDelays(
                { order: 'random', step: 50, random: () => 0.5 },
                3
            )
        ).toEqual([50, 50, 50]);
        expect(fieldStaggerDelays({ order: 'none', step: 50 }, 3)).toEqual([
            0, 0, 0,
        ]);
        expect(fieldStaggerDelays(undefined, 2)).toEqual([0, 0]);
    });
});
