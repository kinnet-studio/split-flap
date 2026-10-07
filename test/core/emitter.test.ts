import { describe, expect, it, vi } from 'vitest';

import { Emitter } from '../../src/core/emitter';

describe('Emitter', () => {
    it('calls listeners with the payload in subscription order', () => {
        const emitter = new Emitter<{ ping: number }>();
        const calls: string[] = [];
        emitter.on('ping', n => calls.push(`a${n}`));
        emitter.on('ping', n => calls.push(`b${n}`));
        emitter.emit('ping', 1);
        expect(calls).toEqual(['a1', 'b1']);
    });

    it('stops calling a listener after it unsubscribes', () => {
        const emitter = new Emitter<{ ping: number }>();
        const listener = vi.fn();
        const off = emitter.on('ping', listener);
        off();
        emitter.emit('ping', 1);
        expect(listener).not.toHaveBeenCalled();
    });

    it('ignores events nobody listens to', () => {
        const emitter = new Emitter<{ ping: number }>();
        expect(() => emitter.emit('ping', 1)).not.toThrow();
    });
});
