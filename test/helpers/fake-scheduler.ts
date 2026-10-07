import type { FrameScheduler } from '../../src/canvas/renderer';

/** A frame scheduler driven by hand: `tick(time)` runs the pending frames. */
export function fakeScheduler() {
    const callbacks = new Map<number, (time: number) => void>();
    const cancelled: number[] = [];
    let nextId = 1;
    const scheduler: FrameScheduler = {
        request: callback => {
            const id = nextId++;
            callbacks.set(id, callback);
            return id;
        },
        cancel: id => {
            cancelled.push(id);
            callbacks.delete(id);
        },
    };
    const tick = (time: number) => {
        const pending = [...callbacks.values()];
        callbacks.clear();
        pending.forEach(callback => callback(time));
    };
    return { scheduler, callbacks, cancelled, tick };
}
