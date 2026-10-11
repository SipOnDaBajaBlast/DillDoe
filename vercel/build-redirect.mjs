import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Keep the former host lightweight. Redirect rules are in root vercel.json.
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(repository, '.vercel', 'output');
if (path.dirname(output) !== path.join(repository, '.vercel')) throw new Error('Unsafe build path');
await fs.rm(output, {recursive: true, force: true});
await fs.mkdir(path.join(output, 'static'), {recursive: true});
await fs.writeFile(path.join(output, 'config.json'), JSON.stringify({version: 3}));
await fs.writeFile(path.join(output, 'static', 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=https://dilldoe-games.pages.dev/"><title>DillDoe has moved</title><a href="https://dilldoe-games.pages.dev/">Continue to DillDoe</a>');
console.log('Lightweight redirect build ready. No game files, ads, or Functions are hosted on Vercel.');
