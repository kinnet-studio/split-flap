import type { ThemeName } from '@kinnet-studio/split-flaps/canvas';
import {
    SplitFlapCanvas,
    useFlapBoard,
} from '@kinnet-studio/split-flaps/react';
import { type ChangeEvent, createElement, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
    cell,
    facesFor,
    gap,
    messages,
    schema,
    styleFor,
    THEMES,
} from './adapter-shared';

function App() {
    const [index, setIndex] = useState(0);
    const [theme, setTheme] = useState<ThemeName>('classic');
    // `value` is shown whenever its content changes.
    const board = useFlapBoard({
        rows: 3,
        schema,
        stagger: { order: 'column', step: 25 },
        value: messages[index],
    });
    // Painters are compared by identity, so memoize them per theme.
    const face = useMemo(() => facesFor(theme), [theme]);
    return createElement(
        'div',
        null,
        createElement(
            'div',
            { className: 'controls' },
            createElement(
                'button',
                { onClick: () => setIndex(i => (i + 1) % messages.length) },
                'Next message'
            ),
            createElement(
                'select',
                {
                    value: theme,
                    'aria-label': 'Theme',
                    onChange: (event: ChangeEvent<HTMLSelectElement>) =>
                        setTheme(event.target.value as ThemeName),
                },
                THEMES.map(name =>
                    createElement(
                        'option',
                        { key: name, value: name },
                        `Theme: ${name}`
                    )
                )
            )
        ),
        createElement(SplitFlapCanvas, {
            target: board,
            face,
            cell,
            gap,
            flapStyle: styleFor(theme),
            fit: 'width',
            style: { maxWidth: '720px' },
        })
    );
}

const root = document.getElementById('app');
if (root) {
    createRoot(root).render(createElement(App));
}
