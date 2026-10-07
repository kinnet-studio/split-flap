// Why package.json has `sideEffects: ["./src/**/*.ts"]` and not `false`:
// Bun 1.3 drops the shared chunks from the output when it is `false`, and the
// resulting dist/ is unusable even though this build exits 0. Published dist/
// files do not match the src glob, so consumers still tree-shake. The
// `check-dist` step (scripts/check-dist.ts) runs after this build to catch a
// regression.

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
