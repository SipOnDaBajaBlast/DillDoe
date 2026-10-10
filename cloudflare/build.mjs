import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const {build}=createRequire(import.meta.url)('esbuild');
const project=process.cwd(),output=path.join(project,'dist');
await fs.mkdir(output,{recursive:true});
await fs.cp(path.join(project,'public'),output,{recursive:true});
await build({entryPoints:['worker.mjs'],outfile:path.join(output,'_worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
const catalog=JSON.parse(await fs.readFile('lib/game-catalog.json','utf8'));
await fs.writeFile(path.join(output,'_routes.json'),JSON.stringify({version:1,include:['/ports/*','/__migration/*','/halo-mobile/*'],exclude:[]},null,2));
let headers='/*\n  X-Content-Type-Options: nosniff\n';
for(const file of catalog.mainIsolation)for(const route of ['/'+file,'/'+file.replace(/\.html$/,'')])headers+=`\n${route}\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  Cross-Origin-Resource-Policy: same-origin\n`;
await fs.writeFile(path.join(output,'_headers'),headers);
async function inspect(directory){for(const file of await fs.readdir(directory,{withFileTypes:true})){const filename=path.join(directory,file.name);if(file.isDirectory())await inspect(filename);else if((await fs.stat(filename)).size>25*1024*1024)throw new Error('Cloudflare asset limit exceeded: '+filename);}}
await inspect(output);
console.log('Cloudflare Pages build ready: '+Object.keys(catalog.games).length+' game ports.');
