#!/usr/bin/env bun
/**
 * Prints the version bump (`patch`, `minor` or `major`) that the
 * conventional commits since the last `v*` tag call for. The release
 * workflow passes it to `npm version`.
 *
 * Usage:
 *   bun scripts/next-version.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { bumpFor } from './bump';

function git(...args: string[]): string {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const root = resolve(import.meta.dir, '..');
const { version } = JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf8')
);
const tag = git('describe', '--tags', '--abbrev=0', '--match', 'v*');
const commits = git('log', '--format=%B%x00', `${tag}..HEAD`)
    .split('\0')
    .map(message => message.trim())
    .filter(message => message.length > 0);
console.log(bumpFor(version, commits));
