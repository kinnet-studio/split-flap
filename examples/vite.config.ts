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
});
