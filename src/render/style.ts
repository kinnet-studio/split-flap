/** Covered flaps stacked under the bottom half, like the edges of a book. */
export interface FlapStack {
    /** Number of covered flaps shown (whole number >= 0). */
    count: number;
    /** Px each covered flap peeks out below the one in front of it. */
    step: number;
    /** 0..1 extra darkening per layer. Default 0.15. */
    shade?: number;
}

/** Surface finish: `gloss` is the original look; `matte` reads as printed card. */
export type Finish = 'matte' | 'satin' | 'gloss';

export interface FinishValues {
    shade: number;
    shadow: number;
    grain: number;
    light: number;
}

export const FINISH_PRESETS: Readonly<Record<Finish, FinishValues>> = {
    gloss: { shade: 0.5, shadow: 0.35, grain: 0, light: 0 },
    satin: { shade: 0.3, shadow: 0.2, grain: 0.03, light: 0.06 },
    matte: { shade: 0.15, shadow: 0.1, grain: 0.06, light: 0.1 },
};

export interface FlapStyle {
    /** Corner radius in px, baked into cached faces. */
    radius?: number;
    /** Height in px of the line drawn at the hinge. */
    hingeGap?: number;
    hingeColor?: string;
    /** 0..1 maximum darkening of the moving flap. */
    shade?: number;
    /** 0..1 maximum opacity of the shadow cast by the moving flap. */
    shadow?: number;
    /**
     * Preset for `shade`, `shadow`, `grain` and `light`; explicit values
     * override it. Default `'gloss'` (the original look).
     */
    finish?: Finish;
    /** 0..1 opacity of the paper-like grain baked into painted faces. */
    grain?: number;
    /** 0..1 strength of the top-to-bottom light falloff on painted faces. */
    light?: number;
    /**
     * Covered flaps under the bottom half. Takes `count × step` px from the
     * bottom of the cell; the face shrinks to fit. Off by default (or `null`).
     */
    stack?: FlapStack | null;
}

export type ResolvedFlapStack = Required<FlapStack>;

export interface ResolvedFlapStyle extends Required<Omit<FlapStyle, 'stack'>> {
    stack: ResolvedFlapStack | null;
}

export const DEFAULT_STACK_SHADE = 0.15;

export const DEFAULT_STYLE: ResolvedFlapStyle = {
    radius: 4,
    hingeGap: 1,
    hingeColor: 'rgba(0, 0, 0, 0.6)',
    shade: 0.5,
    shadow: 0.35,
    finish: 'gloss',
    grain: 0,
    light: 0,
    stack: null,
};

export function resolveStyle(style: FlapStyle = {}): ResolvedFlapStyle {
    const { stack, finish = DEFAULT_STYLE.finish, ...rest } = style;
    if (!Object.hasOwn(FINISH_PRESETS, finish)) {
        throw new RangeError(`FlapStyle: unknown finish "${finish}"`);
    }
    const explicit = Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined)
    );
    const resolved: ResolvedFlapStyle = {
        ...DEFAULT_STYLE,
        ...FINISH_PRESETS[finish],
        ...explicit,
        finish,
        stack: stack ? resolveStack(stack) : null,
    };
    for (const name of ['grain', 'light'] as const) {
        const value = resolved[name];
        if (!(value >= 0 && value <= 1)) {
            throw new RangeError(
                `FlapStyle: ${name} must be between 0 and 1, got ${value}`
            );
        }
    }
    return resolved;
}

function resolveStack(stack: FlapStack): ResolvedFlapStack {
    const shade = stack.shade ?? DEFAULT_STACK_SHADE;
    if (!Number.isInteger(stack.count) || stack.count < 0) {
        throw new RangeError(
            `FlapStyle.stack: count must be a whole number >= 0, got ${stack.count}`
        );
    }
    if (!(stack.step > 0) || !Number.isFinite(stack.step)) {
        throw new RangeError(
            `FlapStyle.stack: step must be a positive number, got ${stack.step}`
        );
    }
    if (!(shade >= 0) || !Number.isFinite(shade)) {
        throw new RangeError(
            `FlapStyle.stack: shade must be a number >= 0, got ${shade}`
        );
    }
    return { count: stack.count, step: stack.step, shade };
}
