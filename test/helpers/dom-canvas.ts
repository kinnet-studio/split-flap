import { vi } from 'vitest';

import { FakeContext } from './fake-canvas';

/**
 * In jsdom, makes every `<canvas>` return a recording FakeContext (one per
 * canvas). Returns a lookup from canvas to its context.
 */
export function stubCanvasContext(): (
    canvas: HTMLCanvasElement
) => FakeContext {
    const contexts = new WeakMap<HTMLCanvasElement, FakeContext>();
    const contextOf = (canvas: HTMLCanvasElement): FakeContext => {
        let context = contexts.get(canvas);
        if (!context) {
            context = new FakeContext();
            contexts.set(canvas, context);
        }
        return context;
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
        function (this: HTMLCanvasElement) {
            return contextOf(this) as unknown as CanvasRenderingContext2D;
        } as unknown as typeof HTMLCanvasElement.prototype.getContext
    );
    return contextOf;
}

/** A ResizeObserver stand-in whose `resize()` fires the callback by hand. */
export class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    observed: unknown[] = [];
    disconnected = false;

    constructor(
        readonly callback: (
            entries: { contentRect: { width: number; height: number } }[]
        ) => void
    ) {
        FakeResizeObserver.instances.push(this);
    }

    observe(element: unknown): void {
        this.observed.push(element);
    }

    disconnect(): void {
        this.disconnected = true;
    }

    resize(width: number, height: number): void {
        this.callback([{ contentRect: { width, height } }]);
    }
}
