import { describe, expect, it } from 'vitest';

import { colorFace, textFace } from '../../src/render/faces';
import { asCtx, FakeContext } from '../helpers/fake-canvas';

describe('textFace', () => {
    it('fills the background and centres the text', () => {
        const ctx = new FakeContext();
        textFace({
            font: 'bold 32px sans-serif',
            color: '#fff',
            background: '#111',
        })(asCtx(ctx), 'A', 40, 60);
        const [fill] = ctx.callsNamed('fillRect');
        expect(fill.args).toEqual([0, 0, 40, 60]);
        expect(fill.fillStyle).toBe('#111');
        const [text] = ctx.callsNamed('fillText');
        expect(text.args).toEqual(['A', 20, 30]);
        expect(text.fillStyle).toBe('#fff');
        expect(ctx.font).toBe('bold 32px sans-serif');
        expect(ctx.textAlign).toBe('center');
        expect(ctx.textBaseline).toBe('middle');
    });
});

describe('colorFace', () => {
    it('fills the face with the flap colour', () => {
        const ctx = new FakeContext();
        colorFace()(asCtx(ctx), '#e4572e', 40, 60);
        const [fill] = ctx.callsNamed('fillRect');
        expect(fill.args).toEqual([0, 0, 40, 60]);
        expect(fill.fillStyle).toBe('#e4572e');
    });
});
