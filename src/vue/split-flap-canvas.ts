import {
    defineComponent,
    h,
    onBeforeUnmount,
    onMounted,
    type PropType,
    ref,
    watch,
} from 'vue';

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

/**
 * A `<canvas>` drawn by a CanvasFlapRenderer for `target`. `class` and
 * `style` attributes apply to the wrapper `<div>`, which `fit` measures.
 *
 * `target`, `fit` and `drive` recreate the renderer. `cell`, `gap`,
 * `flapStyle` and `face` are applied with its setters. `flipCurve`, `dpr`,
 * `createCanvas` and `scheduler` are read once, when it is created.
 */
export const SplitFlapCanvas = defineComponent({
    name: 'SplitFlapCanvas',
    props: {
        target: { type: Object as PropType<RenderTarget>, required: true },
        /** Compared by identity: keep painters stable. */
        face: {
            type: [Function, Object] as PropType<
                CanvasFlapRendererOptions['face']
            >,
            required: true,
        },
        cell: {
            type: Object as PropType<LayoutOptions['cell']>,
            required: true,
        },
        gap: {
            type: Object as PropType<LayoutOptions['gap']>,
            default: undefined,
        },
        flapStyle: { type: Object as PropType<FlapStyle>, default: undefined },
        flipCurve: {
            type: Function as PropType<FlipCurve>,
            default: undefined,
        },
        fit: { type: String as PropType<FitMode>, default: undefined },
        drive: { type: Boolean, default: true },
        dpr: { type: Number, default: undefined },
        createCanvas: {
            type: Function as PropType<CanvasFactory>,
            default: undefined,
        },
        scheduler: {
            type: Object as PropType<FrameScheduler>,
            default: undefined,
        },
    },
    setup(props) {
        const wrapper = ref<HTMLDivElement | null>(null);
        const canvas = ref<HTMLCanvasElement | null>(null);
        let renderer: CanvasFlapRenderer | null = null;
        const inputs = () => ({
            target: props.target,
            fit: props.fit,
            drive: props.drive,
            layout: contentKey([props.cell, props.gap]),
            style: contentKey(props.flapStyle),
            face: props.face,
        });
        type Inputs = ReturnType<typeof inputs>;
        // What the renderer was created with, updated as the setters run.
        let applied: Inputs | null = null;

        const create = (next: Inputs) => {
            if (!canvas.value || !wrapper.value) {
                return;
            }
            renderer = new CanvasFlapRenderer({
                canvas: canvas.value,
                target: next.target,
                face: next.face,
                cell: props.cell,
                gap: props.gap,
                style: props.flapStyle,
                flipCurve: props.flipCurve,
                dpr: props.dpr,
                createCanvas: props.createCanvas,
                scheduler: props.scheduler,
                fit: next.fit
                    ? { element: wrapper.value, mode: next.fit }
                    : undefined,
            });
            applied = { ...next };
            renderer.start({ update: next.drive });
        };
        const destroy = () => {
            renderer?.destroy();
            renderer = null;
            applied = null;
        };
        // One watcher, so a target and the face map for it always arrive
        // together, whatever order the props change in.
        const sync = (next: Inputs) => {
            if (
                !renderer ||
                !applied ||
                next.target !== applied.target ||
                next.fit !== applied.fit ||
                next.drive !== applied.drive
            ) {
                destroy();
                create(next);
                return;
            }
            if (next.layout !== applied.layout) {
                // Explicit zeros so a removed gap resets instead of merging.
                renderer.setLayout({
                    cell: props.cell,
                    gap: { unit: 0, field: 0, row: 0, ...props.gap },
                });
                applied.layout = next.layout;
            }
            if (next.style !== applied.style) {
                renderer.setStyle(props.flapStyle ?? {});
                applied.style = next.style;
            }
            if (next.face !== applied.face) {
                renderer.setFace(next.face);
                applied.face = next.face;
            }
        };

        onMounted(() => create(inputs()));
        onBeforeUnmount(destroy);
        watch(inputs, sync);

        return () =>
            h('div', { ref: wrapper, style: { display: 'block' } }, [
                h('canvas', { ref: canvas, style: { display: 'block' } }),
            ]);
    },
});
