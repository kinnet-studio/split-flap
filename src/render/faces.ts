export type Ctx2D =
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;

/** Where a face is used: its board row (0 for fields and units) and field. */
export interface FaceContext {
    row: number;
    field: string;
}

/**
 * Draws one full flap face in CSS px. Used by both renderers. A painter whose
 * output depends on `context.row` sets `perRow`, so renderers cache its faces
 * per row; other painters receive `row: 0`.
 */
export type FacePainter<T> = ((
    ctx: Ctx2D,
    flap: T,
    width: number,
    height: number,
    context?: FaceContext
) => void) & { readonly perRow?: boolean };

export interface FlapTheme {
    color: string;
    background: string;
    /** Suggested `style.hingeColor`; textFace does not draw the hinge. */
    hinge: string;
}

export type ThemeName = 'classic' | 'solari' | 'airport' | 'cream';

export const FLAP_THEMES: Readonly<Record<ThemeName, FlapTheme>> = {
    classic: {
        color: '#f4f1e8',
        background: '#232326',
        hinge: 'rgba(0, 0, 0, 0.6)',
    },
    solari: {
        color: '#f5b335',
        background: '#2a2a2d',
        hinge: 'rgba(0, 0, 0, 0.6)',
    },
    airport: {
        color: '#141414',
        background: '#f5c400',
        hinge: 'rgba(0, 0, 0, 0.35)',
    },
    cream: {
        color: '#24211c',
        background: '#efe9dc',
        hinge: 'rgba(0, 0, 0, 0.25)',
    },
};

export interface FlapColors {
    color?: string;
    background?: string;
}

export interface TextFaceOptions {
    /** CSS font shorthand, e.g. `'600 26px ui-monospace, monospace'`. */
    font: string;
    /** Base colours: a theme name or `{ color, background }`. Default `'classic'`. */
    theme?: ThemeName | { color: string; background: string };
    /** Text colour; overrides the theme. */
    color?: string;
    /** Background colour; overrides the theme. */
    background?: string;
    /** Per-flap colours, e.g. a red `DELAYED`. Highest precedence. */
    colors?: (flap: string) => FlapColors | undefined;
    /** Per-row colours, e.g. alternating tints. Makes the painter `perRow`. */
    rows?: (row: number) => FlapColors | undefined;
}

/**
 * Fills the background and draws the flap text centred on the hinge.
 * Colour precedence: `colors(flap)`, `rows(row)`, `color`/`background`,
 * `theme`, then the classic theme.
 */
export function textFace(options: TextFaceOptions): FacePainter<string> {
    const theme = resolveTheme(options.theme);
    const baseColor = options.color ?? theme.color;
    const baseBackground = options.background ?? theme.background;
    const { colors, rows } = options;
    const painter = (
        ctx: Ctx2D,
        flap: string,
        width: number,
        height: number,
        context?: FaceContext
    ): void => {
        const byFlap = colors?.(flap);
        const byRow = rows && context ? rows(context.row) : undefined;
        ctx.fillStyle =
            byFlap?.background ?? byRow?.background ?? baseBackground;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = byFlap?.color ?? byRow?.color ?? baseColor;
        ctx.font = options.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(flap, width / 2, height / 2);
    };
    return rows ? Object.assign(painter, { perRow: true }) : painter;
}

function resolveTheme(theme: TextFaceOptions['theme']): {
    color: string;
    background: string;
} {
    if (theme === undefined) {
        return FLAP_THEMES.classic;
    }
    if (typeof theme !== 'string') {
        return theme;
    }
    if (!Object.hasOwn(FLAP_THEMES, theme)) {
        throw new RangeError(`textFace: unknown theme "${theme}"`);
    }
    return FLAP_THEMES[theme];
}

/** Fills the face with the flap, which is a CSS colour. */
export function colorFace(): FacePainter<string> {
    return (ctx, flap, width, height) => {
        ctx.fillStyle = flap;
        ctx.fillRect(0, 0, width, height);
    };
}
