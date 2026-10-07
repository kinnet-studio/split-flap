import { describe, expect, it, vi } from 'vitest';

import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit, type FlapUnitOptions } from '../../src/core/unit';

// Index: '-'=0, A=1, B=2, C=3, D=4, E=5
const seq = FlapSequence.chars('-ABCDE');

function makeUnit(options: Partial<FlapUnitOptions<string>> = {}) {
    return new FlapUnit<string>({
        sequence: seq,
        flipDuration: 100,
        ...options,
    });
}

function record(unit: FlapUnit<string>): string[] {
    const log: string[] = [];
    unit.on('flipstart', e => log.push(`start ${e.from}>${e.to}`));
    unit.on('flipend', e => log.push(`end ${e.from}>${e.to}`));
    unit.on('settled', e => log.push(`settled ${e.flap}`));
    return log;
}

describe('FlapUnit', () => {
    it('starts settled on the first flap', () => {
        const unit = makeUnit();
        expect(unit.state).toEqual({
            current: '-',
            next: null,
            progress: 0,
            direction: 1,
        });
        expect(unit.isSettled).toBe(true);
        expect(unit.target).toBe('-');
    });

    it('starts on the initial flap', () => {
        expect(makeUnit({ initial: 'C' }).state.current).toBe('C');
    });

    it('validates its options', () => {
        expect(() => makeUnit({ flipDuration: 0 })).toThrow(RangeError);
        expect(() => makeUnit({ flipDuration: NaN })).toThrow(RangeError);
        expect(() => makeUnit({ initial: 'Z' })).toThrow(RangeError);
        expect(() => makeUnit({ pad: 'Z' })).toThrow(RangeError);
    });

    it('flips through every intermediate flap', () => {
        const unit = makeUnit();
        const log = record(unit);
        unit.setTarget('B');
        expect(unit.isSettled).toBe(false);
        expect(unit.target).toBe('B');

        unit.update(50);
        expect(unit.state).toEqual({
            current: '-',
            next: 'A',
            progress: 0.5,
            direction: 1,
        });

        unit.update(50);
        expect(unit.state).toEqual({
            current: 'A',
            next: 'B',
            progress: 0,
            direction: 1,
        });

        unit.update(100);
        expect(unit.state).toEqual({
            current: 'B',
            next: null,
            progress: 0,
            direction: 1,
        });
        expect(unit.isSettled).toBe(true);
        expect(log).toEqual([
            'start ->A',
            'end ->A',
            'start A>B',
            'end A>B',
            'settled B',
        ]);
    });

    it('carries overshoot into the next flip', () => {
        const unit = makeUnit();
        unit.setTarget('C');
        unit.update(250);
        expect(unit.state).toEqual({
            current: 'B',
            next: 'C',
            progress: 0.5,
            direction: 1,
        });
    });

    it('completes several flips in one large dt', () => {
        const unit = makeUnit();
        const log = record(unit);
        unit.setTarget('E');
        unit.update(10_000);
        expect(unit.state.current).toBe('E');
        expect(unit.isSettled).toBe(true);
        expect(log.filter(l => l.startsWith('end'))).toHaveLength(5);
        expect(log.at(-1)).toBe('settled E');
    });

    it('ignores non-positive and non-finite dt', () => {
        const unit = makeUnit();
        unit.setTarget('A');
        unit.update(0);
        unit.update(-5);
        unit.update(NaN);
        unit.update(Infinity);
        expect(unit.state).toEqual({
            current: '-',
            next: null,
            progress: 0,
            direction: 1,
        });
    });

    it('wraps around going forward', () => {
        const unit = makeUnit({ initial: 'D' });
        const log = record(unit);
        unit.setTarget('A');
        unit.update(1000);
        expect(log.filter(l => l.startsWith('end'))).toEqual([
            'end D>E',
            'end E>-',
            'end ->A',
        ]);
    });

    it('takes the shortest way, backward when shorter', () => {
        const unit = makeUnit({ initial: 'A', direction: 'shortest' });
        const log = record(unit);
        unit.setTarget('E');
        unit.update(50);
        expect(unit.state).toEqual({
            current: 'A',
            next: '-',
            progress: 0.5,
            direction: -1,
        });
        unit.update(150);
        expect(log).toEqual([
            'start A>-',
            'end A>-',
            'start ->E',
            'end ->E',
            'settled E',
        ]);
    });

    it('flips once in direct mode', () => {
        const unit = makeUnit({ cycle: 'direct' });
        const log = record(unit);
        unit.setTarget('D');
        unit.update(100);
        expect(log).toEqual(['start ->D', 'end ->D', 'settled D']);
    });

    it('finishes the current flip before following a new target', () => {
        const unit = makeUnit({ direction: 'shortest' });
        const log = record(unit);
        unit.setTarget('C');
        unit.update(50);
        unit.setTarget('-');
        expect(unit.state).toEqual({
            current: '-',
            next: 'A',
            progress: 0.5,
            direction: 1,
        });
        unit.update(50);
        unit.update(100);
        expect(log).toEqual([
            'start ->A',
            'end ->A',
            'start A>-',
            'end A>-',
            'settled -',
        ]);
    });

    it('settles after the current flip when retargeted to its landing flap', () => {
        const unit = makeUnit();
        const log = record(unit);
        unit.setTarget('B');
        unit.update(50);
        unit.setTarget('A');
        unit.update(50);
        expect(unit.state.current).toBe('A');
        expect(log).toEqual(['start ->A', 'end ->A', 'settled A']);
    });

    it('waits for the delay before flipping', () => {
        const unit = makeUnit();
        unit.setTarget('A', { delay: 30 });
        unit.update(20);
        expect(unit.state.next).toBeNull();
        unit.update(20);
        expect(unit.state).toEqual({
            current: '-',
            next: 'A',
            progress: 0.1,
            direction: 1,
        });
    });

    it('starts a delay set mid-flip after that flip lands', () => {
        const unit = makeUnit();
        unit.setTarget('A');
        unit.update(50);
        unit.setTarget('B', { delay: 40 });
        unit.update(50);
        expect(unit.state).toEqual({
            current: 'A',
            next: null,
            progress: 0,
            direction: 1,
        });
        unit.update(40);
        expect(unit.state.next).toBe('B');
        expect(unit.state.progress).toBe(0);
    });

    it('treats a target equal to the settled flap as a no-op', () => {
        const unit = makeUnit();
        const log = record(unit);
        unit.setTarget('-');
        unit.update(100);
        expect(log).toEqual([]);
        expect(unit.isSettled).toBe(true);
    });

    it('pads unknown targets by default', () => {
        const unit = makeUnit({ initial: 'B' });
        unit.setTarget('Z');
        expect(unit.target).toBe('-');
        unit.update(1000);
        expect(unit.state.current).toBe('-');
    });

    it('pads with a custom pad flap', () => {
        const unit = makeUnit({ pad: 'E' });
        unit.setTarget('Z');
        expect(unit.target).toBe('E');
    });

    it('throws on unknown targets when asked to', () => {
        const unit = makeUnit({ unknownFlap: 'throw' });
        expect(() => unit.setTarget('Z')).toThrow(/not in the sequence/);
    });

    it('spins until stopped, then settles where the flip lands', () => {
        const unit = makeUnit();
        const log = record(unit);
        unit.spin();
        expect(unit.target).toBeNull();
        expect(unit.isSettled).toBe(false);
        unit.update(250);
        expect(unit.state).toEqual({
            current: 'B',
            next: 'C',
            progress: 0.5,
            direction: 1,
        });
        unit.stop();
        expect(unit.target).toBe('C');
        unit.update(50);
        expect(unit.isSettled).toBe(true);
        unit.update(500);
        expect(unit.state.current).toBe('C');
        expect(log.at(-1)).toBe('settled C');
    });

    it('spins forward regardless of cycle and direction', () => {
        const unit = makeUnit({ cycle: 'direct', direction: 'shortest' });
        unit.spin();
        unit.update(150);
        expect(unit.state).toEqual({
            current: 'A',
            next: 'B',
            progress: 0.5,
            direction: 1,
        });
    });

    it('ends a spin when given a target', () => {
        const unit = makeUnit();
        unit.spin();
        unit.update(150);
        unit.setTarget('B');
        unit.update(50);
        expect(unit.state.current).toBe('B');
        expect(unit.isSettled).toBe(true);
    });

    it('snaps instantly without events', () => {
        const unit = makeUnit();
        const log = record(unit);
        unit.setTarget('C');
        unit.update(150);
        unit.snapTo('E');
        expect(unit.state).toEqual({
            current: 'E',
            next: null,
            progress: 0,
            direction: 1,
        });
        expect(unit.isSettled).toBe(true);
        expect(unit.target).toBe('E');
        unit.update(100);
        expect(log.filter(l => l.startsWith('settled'))).toEqual([]);
    });

    it('stops calling unsubscribed listeners', () => {
        const unit = makeUnit();
        const listener = vi.fn();
        const off = unit.on('flipend', listener);
        off();
        unit.setTarget('A');
        unit.update(100);
        expect(listener).not.toHaveBeenCalled();
    });
});
