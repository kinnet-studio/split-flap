import { fnv1a, mulberry32 } from '../core/random.js';
import type { Ctx2D } from './faces.js';

export interface FaceFinish {
    /** 0..1 opacity of the specks. */
    grain: number;
    /** 0..1 strength of the top-to-bottom light falloff. */
    light: number;
}

/**
 * Bakes the matte finish into a painted face: a soft light falloff and a
 * grain of light/dark specks seeded by `key`, drawn `source-atop` so only
 * the face's own pixels change. Draws nothing when both are 0.
 */
export function finishFace(
    ctx: Ctx2D,
    width: number,
    height: number,
    finish: FaceFinish,
    key: string
): void {
    if (finish.light <= 0 && finish.grain <= 0) {
        return;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    if (finish.light > 0) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${finish.light * 0.5})`);
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
        gradient.addColorStop(1, `rgba(0, 0, 0, ${finish.light})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }
    if (finish.grain > 0) {
        const random = mulberry32(fnv1a(key));
        const lightSpeck = `rgba(255, 255, 255, ${finish.grain})`;
        const darkSpeck = `rgba(0, 0, 0, ${finish.grain})`;
        const specks = Math.round((width * height) / 8);
        for (let i = 0; i < specks; i++) {
            const x = random() * width;
            const y = random() * height;
            ctx.fillStyle = random() < 0.5 ? lightSpeck : darkSpeck;
            ctx.fillRect(x, y, 1, 1);
        }
    }
    ctx.restore();
}
