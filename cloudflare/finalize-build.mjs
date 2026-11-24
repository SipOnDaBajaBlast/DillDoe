import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {staticPlan} from './lib/static-plan.mjs';
import {isRetiredAsset,retiredAssetPaths} from './lib/static-build-state.mjs';
import {WEBBLOX_ROUTES} from './lib/wisp.mjs';

export async function finalizeBuild(output=path.resolve('dist'),catalog,{baseline=null}={}){
 if(path.resolve(output)!==path.resolve('dist'))throw new Error('Unsafe build output');
 catalog??=JSON.parse(await fs.readFile('lib/game-catalog.json','utf8'));
 const report=JSON.parse(await fs.readFile(path.join(output,'static-game-report.json'),'utf8'));
 if(Object.keys(report.games).length!==Object.keys(catalog.games).length)throw new Error('Incomplete static game build');
 const overflow=path.resolve('dist-games');
 // Pages serves the uploaded gzip bytes for these runtimes without their
 // Content-Encoding header. Route large WASM through the existing game worker,
 // which returns the original bytes with a valid WebAssembly content type.
 const compressed=new Set(report.compressedFiles);
 const routes=staticPlan(catalog).routes;
 // These are Worker endpoints, not static game files, so they are added here
 // without changing the static-game build fingerprint.
 for(const route of ['/relay/*','/ports/roblox-march-2007/*',...WEBBLOX_ROUTES])if(!routes.includes(route))routes.push(route);
 report.compressedFiles=[];
 report.remainingFunctionRoutes=routes.length;
 await fs.writeFile(path.join(output,'static-game-report.json'),JSON.stringify(report,null,2));
 await build({entryPoints:['worker.mjs'],outfile:path.join(output,'_worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,external:['cloudflare:sockets']});
 await fs.writeFile(path.join(output,'_routes.json'),JSON.stringify({version:1,include:routes,exclude:[]},null,2));
 let headers='/*\n  X-Content-Type-Options: nosniff\n';
 // A trailing wildcard covers both /games/Name and /games/Name.html, keeping
 // the Pages _headers rule count below its 100-rule limit as games are added.
 const isolatedRoutes=new Set(catalog.mainIsolation.map(file=>'/'+file.replace(/\.html$/,'')+'*').map(encodeURI));
 for(const route of isolatedRoutes)headers+=`\n${route}\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  Cross-Origin-Resource-Policy: same-origin\n`;
 // No gzip variants are published on this origin, so their Content-Encoding
 // blocks only consume the 100-rule budget.
 const dropDeadCompressed=text=>text.split(/\n{2,}/).filter(block=>!['/ports/*.gz','/ports/*.wasm.gz','/ports/*.js.gz'].includes(block.split('\n')[0].trim())).join('\n\n');
 headers+='\n/__migration/health\n  Content-Type: application/json\n  Cache-Control: no-store\n\n'+dropDeadCompressed(baseline?baseline.staticHeaders:await fs.readFile(path.join(overflow,'_headers'),'utf8'));
 if(compressed.size)console.log('Serving '+compressed.size+' large WebAssembly runtimes through the game router.');
 if(headers.split('\n').filter(line=>line.startsWith('/')).length>100)throw new Error('Static header rule limit exceeded');
 await fs.writeFile(path.join(output,'_headers'),headers);
 await fs.writeFile(path.join(output,'website-version.json'),JSON.stringify({commit:process.env.GITHUB_SHA||null,builtAt:new Date().toISOString()}));
 async function inspect(directory){let count=0;for(const file of await fs.readdir(directory,{withFileTypes:true})){const filename=path.join(directory,file.name);if(file.isDirectory())count+=await inspect(filename);else{if((await fs.stat(filename)).size>25*1024*1024)throw new Error('Static asset limit exceeded: '+filename);count++;}}return count;}
 if(baseline){
  // A fast publish merges the uploaded website manifest with the retained
  // `/ports/` entries. Some fallback pages live under `/ports/` too, so count
  // the union instead of adding the two totals and double-counting them.
  const files=[];
  async function list(directory,relative=''){for(const entry of await fs.readdir(directory,{withFileTypes:true})){const rel=path.posix.join(relative,entry.name);if(entry.isDirectory())await list(path.join(directory,entry.name),rel);else files.push('/'+rel);}}
  await list(output);
  const deployed=new Set(Object.keys(baseline.gameManifest));
  for(const file of files)deployed.add(file);
  for(const file of deployed)if(isRetiredAsset(file))deployed.delete(file);
  if(deployed.size>20000)throw new Error('Static file limit exceeded: '+deployed.size);
  console.log('dist: '+files.length+' website files; '+deployed.size+' files after merging retained game assets');
 }else{
  for(const directory of [output,overflow])for(const asset of retiredAssetPaths)await fs.rm(path.join(directory,asset.slice(1)),{force:true});
  for(const directory of [output,overflow]){const count=await inspect(directory);if(count>20000)throw new Error('Static file limit exceeded: '+count);console.log(path.basename(directory)+': '+count+' files');}
 }
 console.log('Cloudflare Pages build ready: '+Object.keys(catalog.games).length+' game ports; '+report.staticFiles+' static game files; '+routes.length+' explicit Function routes.');
}
if(process.argv.includes('--resume'))await finalizeBuild();
