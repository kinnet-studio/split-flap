/**
 * The version bump that a list of conventional commits calls for. Kept free
 * of Node and Bun APIs so tests can import it under the browser-typed
 * tsconfig; `next-version.ts` is the CLI around it.
 *
 * A `feat` commit is a minor bump and anything else a patch. A breaking
 * change (`type!:` or a `BREAKING CHANGE:` footer) is a major bump, except
 * while the version is 0.x, where it is a minor bump.
 */
export type Bump = 'major' | 'minor' | 'patch';

const BREAKING_SUBJECT = /^\w+(\([^)]*\))?!:/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/m;
const FEATURE_SUBJECT = /^feat(\([^)]*\))?!?:/;

/** The bump `commits` (full messages) call for on top of `currentVersion`. */
export function bumpFor(currentVersion: string, commits: string[]): Bump {
    if (commits.length === 0) {
        throw new Error('no commits since the last release');
    }
    const breaking = commits.some(
        message =>
            BREAKING_SUBJECT.test(message) || BREAKING_FOOTER.test(message)
    );
    if (breaking) {
        return currentVersion.startsWith('0.') ? 'minor' : 'major';
    }
    return commits.some(message => FEATURE_SUBJECT.test(message))
        ? 'minor'
        : 'patch';
}
