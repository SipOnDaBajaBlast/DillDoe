export const STATIC_LIMIT=25*1024*1024;
export const STATIC_ORIGIN='https://dilldoe-gamefiles.pages.dev';
export const SITE_ORIGIN='https://dilldoe-games.pages.dev';
// Only fetch/XHR data moves hosts. HTML, JavaScript, images, audio, and game
// documents keep their original origin, preserving saves and worker security.
export const isSecondaryFile=file=>/\.(?:wgsl|json|xml|meta)$/i.test(file);
export const isSecondaryGameFile=(game,file)=>isSecondaryFile(file)||(game==='gta5-webport-vercel'&&file.startsWith('data/')&&Object.hasOwn(gtaStatic.hashes,file.slice(5)));
export const specialRoutes=[
 '/halo-mobile/*',
 '/ports/gta5-webport-vercel/data/*','/ports/gta5-webport-vercel/deployment-status.json',
 '/ports/master-quest-browser/api/*','/ports/persona3-browser/api/*','/ports/ghost-sparta-browser/api/*',
 '/ports/spiderman-psp/api/*','/ports/halo-mobile/game-data/*',
];
export function staticPlan(catalog,budget=19000){
 let used=0;const games={},routes=[...specialRoutes];
 for(const [name,entry] of Object.entries(catalog.games).sort((a,b)=>Object.keys(b[1].files).length-Object.keys(a[1].files).length||a[0].localeCompare(b[0]))){
  const files=Object.entries(entry.files).filter(([,size])=>size<=STATIC_LIMIT).map(([file])=>file);
  const large=Object.entries(entry.files).filter(([,size])=>size>STATIC_LIMIT).map(([file])=>file);
  const secondaryFiles=files.filter(file=>isSecondaryGameFile(name,file));
  used+=files.length-secondaryFiles.length+(entry.entry&&entry.entry!=='index.html'?1:0);
  games[name]={files,large,secondaryFiles};
  if(large.includes(entry.entry||'index.html'))routes.push('/ports/'+name+'/*');
  else for(const file of large)routes.push(encodeURI('/ports/'+name+'/'+file));
 }
 if(used>budget)throw new Error('Primary static file budget exceeded; revise the data-file partition before publishing');
 if(routes.length>100)throw new Error('Function route limit exceeded; revise the static partition before publishing');
 return {games,routes,primaryFiles:used};
}
import gtaStatic from './gta-static-data.json' with {type:'json'};
