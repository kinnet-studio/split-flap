/** Covered flaps stacked under the bottom half, like the edges of a book. */
export interface FlapStack {
    /** Number of covered flaps shown (whole number >= 0). */
    count: number;
    /** Px each covered flap peeks out below the one in front of it. */
    step: number;
    /** 0..1 extra darkening per layer. Default 0.15. */
    shade?: number;
}

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
    stack: null,
};

export function resolveStyle(style: FlapStyle = {}): ResolvedFlapStyle {
    const { stack, ...rest } = style;
    return {
        ...DEFAULT_STYLE,
        ...rest,
        stack: stack ? resolveStack(stack) : null,
    };
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
