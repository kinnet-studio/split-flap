import { describe, expect, it } from 'vitest';

import * as canvas from '../src/canvas';
import * as core from '../src/core';
import * as pixi from '../src/pixi';
import * as sound from '../src/sound';

describe('entry points', () => {
    it('exports the core runtime API', () => {
        expect(Object.keys(core).sort()).toEqual(
            [
                'CHARSETS',
                'DEFAULT_FLIP_DURATION',
                'DEFAULT_HOLD',
                'FlapBoard',
                'FlapField',
                'FlapSequence',
                'FlapUnit',
                'defineField',
                'fieldStaggerDelays',
                'planPath',
                'textField',
            ].sort()
        );
    });

    it('exports the canvas renderer and shared render helpers', () => {
        expect(Object.keys(canvas)).toEqual(
            expect.arrayContaining([
                'CanvasFlapRenderer',
                'DEFAULT_FLIP_KEYFRAMES',
                'DEFAULT_STYLE',
                'FaceCache',
                'MAX_FRAME_DT',
                'colorFace',
                'createFlipCurve',
                'drawUnit',
                'flipGeometry',
                'layout',
                'textFace',
                'stackDepth',
                'stackFlaps',
                'fitScale',
                'FLAP_THEMES',
                'FINISH_PRESETS',
                'finishFace',
            ])
        );
    });

    it('exports the pixi renderer and shared render helpers', () => {
        expect(Object.keys(pixi)).toEqual(
            expect.arrayContaining([
                'FaceTextures',
                'MAX_FRAME_DT',
                'PixiFlapView',
                'UnitSprite',
                'colorFace',
                'createFlipCurve',
                'layout',
                'textFace',
                'stackDepth',
                'stackFlaps',
                'fitScale',
                'FLAP_THEMES',
                'FINISH_PRESETS',
                'finishFace',
                'textureFace',
            ])
        );
    });

    it('exports the sound entry', () => {
        expect(Object.keys(sound).sort()).toEqual(
            [
                'DEFAULT_SYNTH_CLICK',
                'FlapSound',
                'panTable',
                'renderClick',
            ].sort()
        );
    });
});
