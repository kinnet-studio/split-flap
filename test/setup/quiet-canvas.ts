// jsdom has no canvas: getContext() returns null and logs "Not implemented".
// Pixi probes for WebGL while it loads, before a test's own stubs exist, so
// return the same null here without the noise. Tests that draw still stub
// getContext themselves (test/helpers/dom-canvas.ts).
if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = (() =>
        null) as typeof HTMLCanvasElement.prototype.getContext;
}
