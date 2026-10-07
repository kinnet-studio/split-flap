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
}

export type ResolvedFlapStyle = Required<FlapStyle>;

export const DEFAULT_STYLE: ResolvedFlapStyle = {
    radius: 4,
    hingeGap: 1,
    hingeColor: 'rgba(0, 0, 0, 0.6)',
    shade: 0.5,
    shadow: 0.35,
};

export function resolveStyle(style: FlapStyle = {}): ResolvedFlapStyle {
    return { ...DEFAULT_STYLE, ...style };
}
