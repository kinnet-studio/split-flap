import type { Application } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';

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
 * Adds a PixiFlapView to `app.stage` while `app` is set, and removes and
 * destroys it on unmount. Returns the view (or `null` before `app` exists).
 *
 * `app`, `target` and `drive` recreate the view. `cell`, `gap`, `flapStyle`
 * and `face` are applied with the view's setters. `resolution`, `flipCurve`
 * and `createCanvas` are read once, when the view is created.
 */
export function usePixiFlapView(
    app: Application | null,
    options: UsePixiFlapViewOptions
): PixiFlapView | null {
    const [view, setView] = useState<PixiFlapView | null>(null);
    const viewRef = useRef<PixiFlapView | null>(null);
    const applied = useRef<{ layout: unknown; style: unknown; face: unknown }>({
        layout: undefined,
        style: undefined,
        face: undefined,
    });
    const { target, drive = true } = options;

    useEffect(() => {
        if (!app) {
            return;
        }
        const created = new PixiFlapView({
            ...options,
            style: options.flapStyle,
        });
        app.stage.addChild(created);
        created.attach(app.ticker, { update: drive });
        applied.current = {
            layout: contentKey([options.cell, options.gap]),
            style: contentKey(options.flapStyle),
            face: options.face,
        };
        viewRef.current = created;
        setView(created);
        return () => {
            // Safe even when the app (and its stage and ticker) was destroyed
            // first: destroy() detaches from a destroyed ticker without throwing.
            created.removeFromParent();
            created.destroy();
            viewRef.current = null;
            setView(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [app, target, drive]);

    const currentLayout = contentKey([options.cell, options.gap]);
    useEffect(() => {
        const current = viewRef.current;
        if (current && applied.current.layout !== currentLayout) {
            const { cell, gap } = options;
            current.setLayout({
                cell,
                gap: { unit: 0, field: 0, row: 0, ...gap },
            });
            applied.current.layout = currentLayout;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentLayout]);

    const currentStyle = contentKey(options.flapStyle);
    useEffect(() => {
        const current = viewRef.current;
        if (current && applied.current.style !== currentStyle) {
            current.setStyle(options.flapStyle ?? {});
            applied.current.style = currentStyle;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStyle]);

    useEffect(() => {
        const current = viewRef.current;
        if (current && applied.current.face !== options.face) {
            current.setFace(options.face);
            applied.current.face = options.face;
        }
    }, [options.face]);

    return view;
}
