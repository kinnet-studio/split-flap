import {
    Animation,
    type Keyframe,
    numberHelperFunctions,
} from '@ue-too/animate';

/** Maps linear flip progress (0..1) to the flap angle in degrees (0..180). */
export type FlipCurve = (progress: number) => number;

const easeInQuad = (t: number): number => t * t;
const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);

/** Ease-in fall to 180° by 80% of the flip, bounce to 165°, settle at 180°. */
export const DEFAULT_FLIP_KEYFRAMES: readonly Keyframe<number>[] = [
    { percentage: 0, value: 0, easingFn: easeInQuad },
    { percentage: 0.8, value: 180, easingFn: easeOutQuad },
    { percentage: 0.9, value: 165, easingFn: easeInQuad },
    { percentage: 1, value: 180 },
];

/**
 * Builds a flip curve from `@ue-too/animate` keyframes. Each keyframe's
 * `easingFn` shapes the segment that starts at it.
 */
export function createFlipCurve(
    keyframes: readonly Keyframe<number>[] = DEFAULT_FLIP_KEYFRAMES
): FlipCurve {
    if (keyframes.length < 2) {
        throw new RangeError('createFlipCurve: need at least 2 keyframes');
    }
    if (
        keyframes[0].percentage !== 0 ||
        keyframes[keyframes.length - 1].percentage !== 1
    ) {
        throw new RangeError(
            'createFlipCurve: keyframes must start at percentage 0 and end at 1'
        );
    }
    for (let i = 1; i < keyframes.length; i++) {
        if (keyframes[i].percentage <= keyframes[i - 1].percentage) {
            throw new RangeError(
                'createFlipCurve: keyframe percentages must increase'
            );
        }
    }
    const frames = keyframes.map(frame => ({ ...frame }));
    // Never started: only used to sample the keyframes via findValue.
    const sampler = new Animation<number>(
        frames,
        () => {},
        numberHelperFunctions,
        1
    );
    return progress => {
        const p = Number.isFinite(progress)
            ? Math.min(1, Math.max(0, progress))
            : 0;
        const angle = sampler.findValue(p, frames, numberHelperFunctions);
        return Math.min(180, Math.max(0, angle));
    };
}

let sharedDefault: FlipCurve | undefined;

/** The default curve, created on first use and shared. */
export function defaultFlipCurve(): FlipCurve {
    sharedDefault ??= createFlipCurve();
    return sharedDefault;
}
