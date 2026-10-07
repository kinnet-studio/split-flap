export type Ctx2D =
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;

/** Draws one full flap face in CSS px. Used by both renderers. */
export type FacePainter<T> = (
    ctx: Ctx2D,
    flap: T,
    width: number,
    height: number
) => void;

export interface TextFaceOptions {
    /** CSS font shorthand, e.g. `'600 26px ui-monospace, monospace'`. */
    font: string;
    color: string;
    background: string;
}

/** Fills the background and draws the flap text centred on the hinge. */
export function textFace(options: TextFaceOptions): FacePainter<string> {
    return (ctx, flap, width, height) => {
        ctx.fillStyle = options.background;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = options.color;
        ctx.font = options.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(flap, width / 2, height / 2);
    };
}

/** Fills the face with the flap, which is a CSS colour. */
export function colorFace(): FacePainter<string> {
    return (ctx, flap, width, height) => {
        ctx.fillStyle = flap;
        ctx.fillRect(0, 0, width, height);
    };
}
