import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const fromHere = (path: string) =>
    fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
    root: fromHere('.'),
    // Vue's esm-bundler build warns unless these compile-time flags are set.
    define: {
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: false,
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    },
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
                find: /^@kinnet-studio\/split-flaps\/react-pixi$/,
                replacement: fromHere('../src/react-pixi/index.ts'),
            },
            {
                find: /^@kinnet-studio\/split-flaps\/vue$/,
                replacement: fromHere('../src/vue/index.ts'),
            },
            {
                find: /^@kinnet-studio\/split-flaps\/vue-pixi$/,
                replacement: fromHere('../src/vue-pixi/index.ts'),
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
