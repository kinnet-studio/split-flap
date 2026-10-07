import {
    createElement,
    type CSSProperties,
    type ReactElement,
    useEffect,
    useRef,
} from 'react';

import {
    CanvasFlapRenderer,
    type CanvasFlapRendererOptions,
    type FrameScheduler,
} from '../canvas/renderer.js';
import { contentKey } from '../render/content-key.js';
import type { CanvasFactory } from '../render/face-cache.js';
import type { FitMode } from '../render/fit.js';
import type { FlipCurve } from '../render/flip-curve.js';
import type { LayoutOptions, RenderTarget } from '../render/layout.js';
import type { FlapStyle } from '../render/style.js';

export interface SplitFlapCanvasProps {
    target: RenderTarget;
    /** Keep painters stable (module scope or useMemo): compared by identity. */
    face: CanvasFlapRendererOptions['face'];
    cell: LayoutOptions['cell'];
    gap?: LayoutOptions['gap'];
    /** The flap style (finish, stack, radius, ...). Compared by content. */
    flapStyle?: FlapStyle;
    flipCurve?: FlipCurve;
    /** Fit the canvas to the wrapper `<div>`. */
    fit?: FitMode;
    /** Advance the target each frame (default). `false` only renders it. */
    drive?: boolean;
    dpr?: number;
    createCanvas?: CanvasFactory;
    scheduler?: FrameScheduler;
    /** CSS class for the wrapper `<div>`. */
    className?: string;
    /** CSS for the wrapper `<div>`. */
    style?: CSSProperties;
}

const layoutKey = (props: SplitFlapCanvasProps) =>
    contentKey([props.cell, props.gap]);

/** A `<canvas>` drawn by a CanvasFlapRenderer for `target`. */
export function SplitFlapCanvas(props: SplitFlapCanvasProps): ReactElement {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<CanvasFlapRenderer | null>(null);
    const latest = useRef(props);
    latest.current = props;
    const applied = useRef<{ layout: unknown; style: unknown; face: unknown }>({
        layout: undefined,
        style: undefined,
        face: undefined,
    });
    const {
        target,
        fit,
        drive = true,
        flipCurve,
        dpr,
        createCanvas,
        scheduler,
    } = props;

    useEffect(() => {
        const canvas = canvasRef.current;
        const wrapper = wrapperRef.current;
        if (!canvas || !wrapper) {
            return;
        }
        const current = latest.current;
        const renderer = new CanvasFlapRenderer({
            canvas,
            target,
            face: current.face,
            cell: current.cell,
            gap: current.gap,
            style: current.flapStyle,
            flipCurve,
            dpr,
            createCanvas,
            scheduler,
            fit: fit ? { element: wrapper, mode: fit } : undefined,
        });
        applied.current = {
            layout: layoutKey(current),
            style: contentKey(current.flapStyle),
            face: current.face,
        };
        rendererRef.current = renderer;
        renderer.start({ update: drive });
        return () => {
            renderer.destroy();
            rendererRef.current = null;
        };
    }, [target, fit, drive, flipCurve, dpr, createCanvas, scheduler]);

    const currentLayout = layoutKey(props);
    useEffect(() => {
        const renderer = rendererRef.current;
        if (renderer && applied.current.layout !== currentLayout) {
            const { cell, gap } = latest.current;
            // Explicit zeros so a removed gap resets instead of merging.
            renderer.setLayout({
                cell,
                gap: { unit: 0, field: 0, row: 0, ...gap },
            });
            applied.current.layout = currentLayout;
        }
    }, [currentLayout]);

    const currentStyle = contentKey(props.flapStyle);
    useEffect(() => {
        const renderer = rendererRef.current;
        if (renderer && applied.current.style !== currentStyle) {
            renderer.setStyle(latest.current.flapStyle ?? {});
            applied.current.style = currentStyle;
        }
    }, [currentStyle]);

    useEffect(() => {
        const renderer = rendererRef.current;
        if (renderer && applied.current.face !== props.face) {
            renderer.setFace(props.face);
            applied.current.face = props.face;
        }
    }, [props.face]);

    return createElement(
        'div',
        {
            ref: wrapperRef,
            className: props.className,
            style: { display: 'block', ...props.style },
        },
        createElement('canvas', { ref: canvasRef })
    );
}
