export type FaceRef = 'current' | 'next';
export type Half = 'top' | 'bottom';

export interface FlipGeometry {
    /** Face shown in the static top half. */
    staticTop: FaceRef;
    /** Face shown in the static bottom half. */
    staticBottom: FaceRef;
    /** The moving flap, anchored at the hinge and scaled vertically. */
    flap: { face: FaceRef; half: Half; anchor: 'hinge'; scaleY: number };
    /** 0..1 darkening of the moving flap; peaks edge-on at 90°. */
    flapShade: number;
    /** 0..1 shadow strength on the half the flap is moving toward. */
    castShadow: number;
    shadowHalf: Half;
}

/**
 * Describes what to draw for a flap at `angle` degrees (0..180).
 * Forward flips fold the top down; backward flips fold the bottom up.
 */
export function flipGeometry(angle: number, direction: 1 | -1): FlipGeometry {
    const clamped = Math.min(180, Math.max(0, angle));
    const radians = (clamped * Math.PI) / 180;
    const cos = Math.cos(radians);
    const firstHalf = clamped < 90;
    const forward = direction === 1;
    const leadingHalf: Half = forward ? 'top' : 'bottom';
    const trailingHalf: Half = forward ? 'bottom' : 'top';
    return {
        staticTop: forward ? 'next' : 'current',
        staticBottom: forward ? 'current' : 'next',
        flap: {
            face: firstHalf ? 'current' : 'next',
            half: firstHalf ? leadingHalf : trailingHalf,
            anchor: 'hinge',
            scaleY: Math.abs(cos),
        },
        flapShade: 1 - Math.abs(cos),
        castShadow: Math.sin(radians),
        shadowHalf: trailingHalf,
    };
}
