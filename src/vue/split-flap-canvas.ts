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
        const applied = {
            layout: undefined as unknown,
            style: undefined as unknown,
            face: undefined as unknown,
        };
        const layoutKey = () => contentKey([props.cell, props.gap]);

        const create = () => {
            if (!canvas.value || !wrapper.value) {
                return;
            }
            renderer = new CanvasFlapRenderer({
                canvas: canvas.value,
                target: props.target,
                face: props.face,
                cell: props.cell,
                gap: props.gap,
                style: props.flapStyle,
                flipCurve: props.flipCurve,
                dpr: props.dpr,
                createCanvas: props.createCanvas,
                scheduler: props.scheduler,
                fit: props.fit
                    ? { element: wrapper.value, mode: props.fit }
                    : undefined,
            });
            applied.layout = layoutKey();
            applied.style = contentKey(props.flapStyle);
            applied.face = props.face;
            renderer.start({ update: props.drive });
        };
        const destroy = () => {
            renderer?.destroy();
            renderer = null;
        };

        onMounted(create);
        onBeforeUnmount(destroy);
        watch(
            [
                () => props.target,
                () => props.fit,
                () => props.drive,
                () => props.flipCurve,
                () => props.dpr,
                () => props.createCanvas,
                () => props.scheduler,
            ],
            () => {
                destroy();
                create();
            }
        );
        watch(layoutKey, key => {
            if (renderer && key !== applied.layout) {
                // Explicit zeros so a removed gap resets instead of merging.
                renderer.setLayout({
                    cell: props.cell,
                    gap: { unit: 0, field: 0, row: 0, ...props.gap },
                });
                applied.layout = key;
            }
        });
        watch(
            () => contentKey(props.flapStyle),
            key => {
                if (renderer && key !== applied.style) {
                    renderer.setStyle(props.flapStyle ?? {});
                    applied.style = key;
                }
            }
        );
        watch(
            () => props.face,
            face => {
                if (renderer && face !== applied.face) {
                    renderer.setFace(face);
                    applied.face = face;
                }
            }
        );

        return () =>
            h('div', { ref: wrapper, style: { display: 'block' } }, [
                h('canvas', { ref: canvas }),
            ]);
    },
});
