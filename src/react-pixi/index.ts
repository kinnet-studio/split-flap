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
 */
export function usePixiFlapView(
    app: Application | null,
    options: UsePixiFlapViewOptions
): PixiFlapView | null {
    const [view, setView] = useState<PixiFlapView | null>(null);
    const viewRef = useRef<PixiFlapView | null>(null);
    const latest = useRef(options);
    latest.current = options;
    const applied = useRef<{ layout: unknown; style: unknown; face: unknown }>({
        layout: undefined,
        style: undefined,
        face: undefined,
    });
    const {
        target,
        drive = true,
        resolution,
        flipCurve,
        createCanvas,
    } = options;

    useEffect(() => {
        if (!app) {
            return;
        }
        const current = latest.current;
        const created = new PixiFlapView({
            ...current,
            style: current.flapStyle,
        });
        app.stage.addChild(created);
        let stop: () => void;
        if (drive) {
            created.attach(app.ticker);
            stop = () => created.detach();
        } else {
            const sync = () => created.sync();
            app.ticker.add(sync);
            stop = () => app.ticker.remove(sync);
        }
        applied.current = {
            layout: contentKey([current.cell, current.gap]),
            style: contentKey(current.flapStyle),
            face: current.face,
        };
        viewRef.current = created;
        setView(created);
        return () => {
            stop();
            app.stage.removeChild(created);
            created.destroy();
            viewRef.current = null;
            setView(null);
        };
    }, [app, target, drive, resolution, flipCurve, createCanvas]);

    const currentLayout = contentKey([options.cell, options.gap]);
    useEffect(() => {
        const current = viewRef.current;
        if (current && applied.current.layout !== currentLayout) {
            const { cell, gap } = latest.current;
            current.setLayout({
                cell,
                gap: { unit: 0, field: 0, row: 0, ...gap },
            });
            applied.current.layout = currentLayout;
        }
    }, [currentLayout]);

    const currentStyle = contentKey(options.flapStyle);
    useEffect(() => {
        const current = viewRef.current;
        if (current && applied.current.style !== currentStyle) {
            current.setStyle(latest.current.flapStyle ?? {});
            applied.current.style = currentStyle;
        }
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
