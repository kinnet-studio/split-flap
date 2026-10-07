/**
 * `width` fills the box's width (height follows) — right for normal page
 * flow. `contain` fits both dimensions; the box needs a definite height, or it
 * locks at the current size.
 */
export type FitMode = 'width' | 'contain';

export interface Size {
    width: number;
    height: number;
}

/**
 * The uniform scale that fits content of `size` into `box`, or `null` when
 * the box or the content has no usable size (e.g. a hidden element).
 */
export function fitScale(
    size: Size,
    box: Size,
    mode: FitMode = 'width'
): number | null {
    const byWidth = ratio(box.width, size.width);
    if (mode === 'width') {
        return byWidth;
    }
    const byHeight = ratio(box.height, size.height);
    return byWidth === null || byHeight === null
        ? null
        : Math.min(byWidth, byHeight);
}

function ratio(available: number, needed: number): number | null {
    return available > 0 &&
        needed > 0 &&
        Number.isFinite(available) &&
        Number.isFinite(needed)
        ? available / needed
        : null;
}
