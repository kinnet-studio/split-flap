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
 *
 * `options` may be reactive. `app`, `target` and `drive` recreate the view.
 * `cell`, `gap`, `flapStyle` and `face` are applied with the view's setters.
 * `resolution`, `flipCurve` and `createCanvas` are read once, when the view
 * is created.
 */
export function usePixiFlapView(
    app: MaybeRefOrGetter<Application | null | undefined>,
    options: MaybeRefOrGetter<UsePixiFlapViewOptions>
): ShallowRef<PixiFlapView | null> {
    const view = shallowRef<PixiFlapView | null>(null);
    const inputs = () => {
        const current = toValue(options);
        return {
            app: toValue(app) ?? null,
            target: current.target,
            drive: current.drive ?? true,
            layout: contentKey([current.cell, current.gap]),
            style: contentKey(current.flapStyle),
            face: current.face,
        };
    };
    type Inputs = ReturnType<typeof inputs>;
    // What the view was created with, updated as the setters run.
    let applied: Inputs | null = null;
    let teardown: (() => void) | null = null;

    const dispose = () => {
        teardown?.();
        teardown = null;
        applied = null;
        view.value = null;
    };
    const create = (currentApp: Application, next: Inputs) => {
        const current = toValue(options);
        const created = markRaw(
            new PixiFlapView({ ...current, style: current.flapStyle })
        );
        currentApp.stage.addChild(created);
        created.attach(currentApp.ticker, { update: next.drive });
        teardown = () => {
            // Safe even when the app (and its stage and ticker) was destroyed
            // first: destroy() detaches from a destroyed ticker without throwing.
            created.removeFromParent();
            created.destroy();
        };
        applied = { ...next };
        view.value = created;
    };

    // One watcher, so a target and the face map for it always arrive
    // together, whatever order the options change in.
    watch(
        inputs,
        next => {
            const current = view.value;
            if (
                !current ||
                !applied ||
                next.app !== applied.app ||
                next.target !== applied.target ||
                next.drive !== applied.drive
            ) {
                dispose();
                if (next.app) {
                    create(next.app, next);
                }
                return;
            }
            const { cell, gap, flapStyle } = toValue(options);
            if (next.layout !== applied.layout) {
                // Explicit zeros so a removed gap resets instead of merging.
                current.setLayout({
                    cell,
                    gap: { unit: 0, field: 0, row: 0, ...gap },
                });
                applied.layout = next.layout;
            }
            if (next.style !== applied.style) {
                current.setStyle(flapStyle ?? {});
                applied.style = next.style;
            }
            if (next.face !== applied.face) {
                current.setFace(next.face);
                applied.face = next.face;
            }
        },
        { immediate: true }
    );
    onScopeDispose(dispose);
    return view;
}
