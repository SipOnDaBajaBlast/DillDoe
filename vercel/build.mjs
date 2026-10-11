import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {buildGamePages} from './game-pages.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(repository, '.vercel', 'output');
if (path.dirname(output) !== path.join(repository, '.vercel')) throw new Error('Unsafe build path');
const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repository, encoding: 'utf8'}).trim();
execFileSync(process.execPath, ['build.mjs'], {cwd: path.join(repository, 'cloudflare'), stdio: 'inherit', env: {...process.env, GITHUB_SHA: commit}});
await fs.rm(output, {recursive: true, force: true});
await fs.mkdir(path.join(output, 'static'), {recursive: true});
await fs.cp(path.join(repository, 'cloudflare', 'dist'), path.join(output, 'static'), {
    recursive: true,
    filter: source => !['_worker.js', '_routes.json', '_headers'].includes(path.basename(source)),
});
await buildGamePages(path.join(output, 'static'));
const {build} = createRequire(path.join(repository, 'cloudflare', 'build.mjs'))('esbuild');
const functionDirectory = path.join(output, 'functions', 'game-router.func');
await fs.mkdir(functionDirectory, {recursive: true});
await build({entryPoints: [path.join(repository, 'vercel', 'game-handler.mjs')], outfile: path.join(functionDirectory, 'index.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node22', minify: true});
await fs.writeFile(path.join(functionDirectory, '.vc-config.json'), JSON.stringify({runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', supportsResponseStreaming: true, maxDuration: 300}));
const catalog = JSON.parse(await fs.readFile(path.join(repository, 'cloudflare', 'lib', 'game-catalog.json'), 'utf8'));
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isolated = catalog.mainIsolation.flatMap(file => ['/' + file, '/' + file.replace(/\.html$/, '')]);
const routes = [
    {src: '/(.*)', headers: {'X-Content-Type-Options': 'nosniff'}, continue: true},
    {src: '^(?:' + isolated.map(escape).join('|') + ')$', headers: {'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin'}, continue: true},
    {src: '^/(ports(?:/.*)?|halo-mobile/.*|__migration/health)$', dest: '/game-router?__route=$1'},
    {handle: 'filesystem'},
    {src: '^/$', dest: '/index.html'},
    {src: '^/(.*)$', dest: '/$1.html'},
];
await fs.writeFile(path.join(output, 'config.json'), JSON.stringify({version: 3, routes}, null, 2));
console.log('Vercel build ready: current website and ' + Object.keys(catalog.games).length + ' game ports; no Cloudflare hosting dependency.');
