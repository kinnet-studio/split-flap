import { describe, expect, it } from 'vitest';

import { bumpFor } from '../../scripts/bump';

describe('bumpFor', () => {
    it('bumps the patch for fixes and chores', () => {
        expect(bumpFor('0.2.0', ['fix(core): x', 'chore: y'])).toBe('patch');
    });

    it('bumps the minor for a feature', () => {
        expect(bumpFor('0.2.0', ['fix: x', 'feat(pixi): y'])).toBe('minor');
    });

    it('bumps the minor for a breaking change while on 0.x', () => {
        expect(bumpFor('0.2.0', ['feat(core)!: y'])).toBe('minor');
        expect(
            bumpFor('0.2.0', ['fix: x\n\nBREAKING CHANGE: renamed show()'])
        ).toBe('minor');
    });

    it('bumps the major for a breaking change from 1.0 on', () => {
        expect(bumpFor('1.4.2', ['refactor!: y'])).toBe('major');
        expect(
            bumpFor('1.4.2', ['fix: x\n\nBREAKING-CHANGE: renamed show()'])
        ).toBe('major');
    });

    it('throws when there is nothing to release', () => {
        expect(() => bumpFor('0.2.0', [])).toThrow(/no commits/);
    });
});
