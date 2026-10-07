import type { Application } from 'pixi.js';
import {
    markRaw,
    type MaybeRefOrGetter,
    onScopeDispose,
    type ShallowRef,
    shallowRef,
    toValue,
    watch,
} from 'vue';

import { PixiFlapView, type PixiFlapViewOptions } from '../pixi/view.js';
import { contentKey } from '../render/content-key.js';
import type { FlapStyle } from '../render/style.js';

export interface UsePixiFlapViewOptions extends Omit<
    PixiFlapViewOptions,
    'style'
> {
    /** The flap style (finish, stack, radius, ...). Compared by content. */
    flapStyle?: FlapStyle;
    /** Advance the target on `app.ticker` (default). `false` only mirrors it. */
    drive?: boolean;
}

/**
 * Adds a PixiFlapView to `app.stage` once `app` is set (an Application, a ref
 * or a getter), and removes and destroys it when the scope is disposed.
 * `options` may be reactive; layout, style and face changes use the view's
 * setters, other changes recreate it.
 */
export function usePixiFlapView(
    app: MaybeRefOrGetter<Application | null | undefined>,
    options: MaybeRefOrGetter<UsePixiFlapViewOptions>
): ShallowRef<PixiFlapView | null> {
    const view = shallowRef<PixiFlapView | null>(null);
    const applied = {
        layout: undefined as unknown,
        style: undefined as unknown,
        face: undefined as unknown,
    };
    let teardown: (() => void) | null = null;
    const opts = () => toValue(options);

    const dispose = () => {
        teardown?.();
        teardown = null;
        view.value = null;
    };

    watch(
        [
            () => toValue(app),
            () => opts().target,
            () => opts().drive ?? true,
            () => opts().resolution,
            () => opts().flipCurve,
            () => opts().createCanvas,
        ],
        ([currentApp, , drive]) => {
            dispose();
            if (!currentApp) {
                return;
            }
            const current = opts();
            const created = markRaw(
                new PixiFlapView({ ...current, style: current.flapStyle })
            );
            currentApp.stage.addChild(created);
            let stop: () => void;
            if (drive) {
                created.attach(currentApp.ticker);
                stop = () => created.detach();
            } else {
                const sync = () => created.sync();
                currentApp.ticker.add(sync);
                stop = () => currentApp.ticker.remove(sync);
            }
            applied.layout = contentKey([current.cell, current.gap]);
            applied.style = contentKey(current.flapStyle);
            applied.face = current.face;
            teardown = () => {
                stop();
                currentApp.stage.removeChild(created);
                created.destroy();
            };
            view.value = created;
        },
        { immediate: true }
    );
    watch(
        () => contentKey([opts().cell, opts().gap]),
        key => {
            if (view.value && key !== applied.layout) {
                const { cell, gap } = opts();
                view.value.setLayout({
                    cell,
                    gap: { unit: 0, field: 0, row: 0, ...gap },
                });
                applied.layout = key;
            }
        }
    );
    watch(
        () => contentKey(opts().flapStyle),
        key => {
            if (view.value && key !== applied.style) {
                view.value.setStyle(opts().flapStyle ?? {});
                applied.style = key;
            }
        }
    );
    watch(
        () => opts().face,
        face => {
            if (view.value && face !== applied.face) {
                view.value.setFace(face);
                applied.face = face;
            }
        }
    );
    onScopeDispose(dispose);
    return view;
}
