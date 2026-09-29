// Copies the pinned DivJS engine (the "divjs" dependency in package.json,
// a tag of github.com/akadjoker/divjs) into engine/: its single-file build
// and the function reference the editor completes from. Run after changing
// the version: npm install && npm run engine.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lib = join(ROOT, 'node_modules', 'divjs');
const { version } = JSON.parse(readFileSync(join(lib, 'package.json'), 'utf-8'));
mkdirSync(join(ROOT, 'engine'), { recursive: true });
copyFileSync(join(lib, 'dist', 'divjs.js'), join(ROOT, 'engine', 'divjs.js'));
copyFileSync(join(lib, 'docs', 'natives.md'), join(ROOT, 'engine', 'natives.md'));
console.log(`engine/: DivJS ${version}`);
