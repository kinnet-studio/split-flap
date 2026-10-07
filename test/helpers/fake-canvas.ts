import type { FaceCanvas } from '../../src/render/face-cache';
import type { Ctx2D } from '../../src/render/faces';

export interface RecordedCall {
    name: string;
    args: unknown[];
    /** `fillStyle` at the time of the call. */
    fillStyle: unknown;
    /** `globalCompositeOperation` at the time of the call. */
    composite: string;
}

/** Records 2D context calls; implements only what this package uses. */
export class FakeContext {
    readonly calls: RecordedCall[] = [];
    fillStyle: unknown = '#000000';
    font = '10px sans-serif';
    textAlign = 'start';
    textBaseline = 'alphabetic';
    globalCompositeOperation = 'source-over';
    private readonly stack: { fillStyle: unknown; composite: string }[] = [];

    save(): void {
        this.stack.push({
            fillStyle: this.fillStyle,
            composite: this.globalCompositeOperation,
        });
        this.record('save', []);
    }

    restore(): void {
        const saved = this.stack.pop();
        if (saved) {
            this.fillStyle = saved.fillStyle;
            this.globalCompositeOperation = saved.composite;
        }
        this.record('restore', []);
    }

    beginPath(): void {
        this.record('beginPath', []);
    }

    roundRect(...args: unknown[]): void {
        this.record('roundRect', args);
    }

    clip(): void {
        this.record('clip', []);
    }

    setTransform(...args: unknown[]): void {
        this.record('setTransform', args);
    }

    fillRect(...args: unknown[]): void {
        this.record('fillRect', args);
    }

    clearRect(...args: unknown[]): void {
        this.record('clearRect', args);
    }

    fillText(...args: unknown[]): void {
        this.record('fillText', args);
    }

    drawImage(...args: unknown[]): void {
        this.record('drawImage', args);
    }

    callsNamed(name: string): RecordedCall[] {
        return this.calls.filter(call => call.name === name);
    }

    reset(): void {
        this.calls.length = 0;
    }

    private record(name: string, args: unknown[]): void {
        this.calls.push({
            name,
            args,
            fillStyle: this.fillStyle,
            composite: this.globalCompositeOperation,
        });
    }
}

export class FakeCanvas {
    width: number;
    height: number;
    readonly style: Record<string, string> = {};
    readonly context = new FakeContext();

    constructor(width = 0, height = 0) {
        this.width = width;
        this.height = height;
    }

    getContext(contextId: '2d'): FakeContext {
        void contextId;
        return this.context;
    }
}

export const fakeCanvasFactory = (width: number, height: number): FaceCanvas =>
    new FakeCanvas(width, height) as unknown as FaceCanvas;

export const asCtx = (ctx: FakeContext): Ctx2D => ctx as unknown as Ctx2D;

export const asCanvasElement = (canvas: FakeCanvas): HTMLCanvasElement =>
    canvas as unknown as HTMLCanvasElement;
