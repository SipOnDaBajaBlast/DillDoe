import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {staticPlan} from './lib/static-plan.mjs';

export async function finalizeBuild(output=path.resolve('dist'),catalog){
 if(path.resolve(output)!==path.resolve('dist'))throw new Error('Unsafe build output');
 catalog??=JSON.parse(await fs.readFile('lib/game-catalog.json','utf8'));
 const report=JSON.parse(await fs.readFile(path.join(output,'static-game-report.json'),'utf8'));
 if(Object.keys(report.games).length!==Object.keys(catalog.games).length)throw new Error('Incomplete static game build');
 const overflow=path.resolve('dist-games');
 const compressed=new Set(report.compressedFiles);
 const routes=staticPlan(catalog).routes.filter(route=>!compressed.has(decodeURI(route)));
 report.remainingFunctionRoutes=routes.length;
 await fs.writeFile(path.join(output,'static-game-report.json'),JSON.stringify(report,null,2));
 await build({entryPoints:['worker.mjs'],outfile:path.join(output,'_worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
 await fs.writeFile(path.join(output,'_routes.json'),JSON.stringify({version:1,include:routes,exclude:[]},null,2));
 let headers='/*\n  X-Content-Type-Options: nosniff\n';
 const isolatedRoutes=new Set(catalog.mainIsolation.flatMap(file=>file.startsWith('games/')?['/games/*']:['/'+file,'/'+file.replace(/\.html$/,'')]));
 for(const route of isolatedRoutes)headers+=`\n${route}\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  Cross-Origin-Resource-Policy: same-origin\n`;
 headers+='\n/__migration/health\n  Content-Type: application/json\n  Cache-Control: no-store\n\n'+await fs.readFile(path.join(overflow,'_headers'),'utf8');
 for(const file of compressed)headers+='\n'+encodeURI(file)+'\n  Content-Encoding: gzip\n  Content-Type: application/wasm\n';
 if(headers.split('\n').filter(line=>line.startsWith('/')).length>100)throw new Error('Static header rule limit exceeded');
 await fs.writeFile(path.join(output,'_headers'),headers);
 await fs.writeFile(path.join(output,'website-version.json'),JSON.stringify({commit:process.env.GITHUB_SHA||null,builtAt:new Date().toISOString()}));
 async function inspect(directory){let count=0;for(const file of await fs.readdir(directory,{withFileTypes:true})){const filename=path.join(directory,file.name);if(file.isDirectory())count+=await inspect(filename);else{if((await fs.stat(filename)).size>25*1024*1024)throw new Error('Static asset limit exceeded: '+filename);count++;}}return count;}
 for(const directory of [output,overflow]){const count=await inspect(directory);if(count>20000)throw new Error('Static file limit exceeded: '+count);console.log(path.basename(directory)+': '+count+' files');}
 console.log('Cloudflare Pages build ready: '+Object.keys(catalog.games).length+' game ports; '+report.staticFiles+' static game files; '+routes.length+' explicit Function routes.');
}
if(process.argv.includes('--resume'))await finalizeBuild();
