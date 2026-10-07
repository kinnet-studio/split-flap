import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const fromHere = (path: string) =>
    fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
    root: fromHere('.'),
    resolve: {
        alias: [
            {
                find: /^@kinnet-studio\/split-flaps\/canvas$/,
                replacement: fromHere('../src/canvas/index.ts'),
            },
            {
                find: /^@kinnet-studio\/split-flaps\/react$/,
                replacement: fromHere('../src/react/index.ts'),
            },
            {
                find: /^@kinnet-studio\/split-flaps\/vue$/,
                replacement: fromHere('../src/vue/index.ts'),
            },
            {
                find: /^@kinnet-studio\/split-flaps\/sound$/,
                replacement: fromHere('../src/sound/index.ts'),
            },
            {
                find: /^@kinnet-studio\/split-flaps\/pixi$/,
                replacement: fromHere('../src/pixi/index.ts'),
            },
            {
                find: /^@kinnet-studio\/split-flaps$/,
                replacement: fromHere('../src/core/index.ts'),
            },
        ],
    },
    build: {
        rollupOptions: {
            input: {
                main: fromHere('index.html'),
                react: fromHere('react.html'),
                vue: fromHere('vue.html'),
            },
        },
    },
});
