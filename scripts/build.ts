const result = await Bun.build({
    entrypoints: [
        './src/core/index.ts',
        './src/canvas/index.ts',
        './src/pixi/index.ts',
    ],
    root: './src',
    outdir: './dist',
    format: 'esm',
    target: 'browser',
    // Shared modules go into chunks so the core classes exist once and
    // `instanceof` works across entry points.
    splitting: true,
    sourcemap: 'external',
    external: ['pixi.js', '@ue-too/animate'],
});

if (!result.success) {
    for (const log of result.logs) {
        console.error(log);
    }
    process.exit(1);
}

for (const output of result.outputs) {
    console.log(output.path);
}
