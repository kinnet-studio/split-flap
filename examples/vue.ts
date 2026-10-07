import type { ThemeName } from '@kinnet-studio/split-flap/canvas';
import { SplitFlapCanvas, useFlapBoard } from '@kinnet-studio/split-flap/vue';
import { computed, createApp, defineComponent, h, ref } from 'vue';

import {
    cell,
    facesFor,
    gap,
    messages,
    schema,
    styleFor,
    THEMES,
} from './adapter-shared';

const App = defineComponent({
    setup() {
        const index = ref(0);
        const theme = ref<ThemeName>('classic');
        // `value` (here a getter) is shown whenever its content changes.
        const board = useFlapBoard({
            rows: 3,
            schema,
            stagger: { order: 'column', step: 25 },
            value: () => messages[index.value],
        });
        // Painters are compared by identity: computed keeps them stable.
        const face = computed(() => facesFor(theme.value));
        return () =>
            h('div', [
                h('div', { class: 'controls' }, [
                    h(
                        'button',
                        {
                            onClick: () => {
                                index.value =
                                    (index.value + 1) % messages.length;
                            },
                        },
                        'Next message'
                    ),
                    h(
                        'select',
                        {
                            value: theme.value,
                            'aria-label': 'Theme',
                            onChange: (event: Event) => {
                                theme.value = (
                                    event.target as HTMLSelectElement
                                ).value as ThemeName;
                            },
                        },
                        THEMES.map(name =>
                            h('option', { value: name }, `Theme: ${name}`)
                        )
                    ),
                ]),
                h(SplitFlapCanvas, {
                    target: board,
                    face: face.value,
                    cell,
                    gap,
                    flapStyle: styleFor(theme.value),
                    fit: 'width',
                    style: { maxWidth: '720px' },
                }),
            ]);
    },
});

createApp(App).mount('#app');
