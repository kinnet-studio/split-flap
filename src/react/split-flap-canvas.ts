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
    /** Read when the renderer is created (with `dpr`, `createCanvas`, `scheduler`). */
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
    const applied = useRef<{ layout: unknown; style: unknown; face: unknown }>({
        layout: undefined,
        style: undefined,
        face: undefined,
    });
    const { target, fit, drive = true } = props;

    // Only target, fit and drive recreate the renderer. The other props are
    // read here from this render; later changes go through the setters below.
    useEffect(() => {
        const canvas = canvasRef.current;
        const wrapper = wrapperRef.current;
        if (!canvas || !wrapper) {
            return;
        }
        const renderer = new CanvasFlapRenderer({
            canvas,
            target,
            face: props.face,
            cell: props.cell,
            gap: props.gap,
            style: props.flapStyle,
            flipCurve: props.flipCurve,
            dpr: props.dpr,
            createCanvas: props.createCanvas,
            scheduler: props.scheduler,
            fit: fit ? { element: wrapper, mode: fit } : undefined,
        });
        applied.current = {
            layout: layoutKey(props),
            style: contentKey(props.flapStyle),
            face: props.face,
        };
        rendererRef.current = renderer;
        renderer.start({ update: drive });
        return () => {
            renderer.destroy();
            rendererRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target, fit, drive]);

    const currentLayout = layoutKey(props);
    useEffect(() => {
        const renderer = rendererRef.current;
        if (renderer && applied.current.layout !== currentLayout) {
            const { cell, gap } = props;
            // Explicit zeros so a removed gap resets instead of merging.
            renderer.setLayout({
                cell,
                gap: { unit: 0, field: 0, row: 0, ...gap },
            });
            applied.current.layout = currentLayout;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentLayout]);

    const currentStyle = contentKey(props.flapStyle);
    useEffect(() => {
        const renderer = rendererRef.current;
        if (renderer && applied.current.style !== currentStyle) {
            renderer.setStyle(props.flapStyle ?? {});
            applied.current.style = currentStyle;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        createElement('canvas', { ref: canvasRef, style: { display: 'block' } })
    );
}
