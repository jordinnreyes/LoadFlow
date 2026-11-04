import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { cpSync, existsSync, lstatSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const spike = dirname(fileURLToPath(import.meta.url));
const root = resolve(spike, '../..');
if (process.versions.node.split('.')[0] !== '24') throw new Error('Use Node 24');
execFileSync(process.execPath, [resolve(root,'node_modules/typescript/bin/tsc'), '-b'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(root,'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
// This directory only contains generated assets. Refuse a linked directory and
// verify the absolute target before cleaning, so old hashed bundles cannot ship.
const output = resolve(spike, 'www');
if (dirname(output) !== spike || output !== resolve(root, 'spikes/android-capacitor/www'))
  throw new Error('Generated output must stay inside the spike workspace');
if (existsSync(output) && lstatSync(output).isSymbolicLink())
  throw new Error('Refusing to clean a linked output directory');
rmSync(output, { recursive: true, force: true });
cpSync(resolve(root, 'dist'), output, { recursive: true });
console.log('Assets del frontend existente copiados a www; sin bifurcar src.');
