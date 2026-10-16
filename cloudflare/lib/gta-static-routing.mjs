import known from './gta-static-data.json' with {type:'json'};

export function installGtaStaticDataRouting(prefix,files) {
 const scope=typeof window==='undefined'?self:window;
 const original=scope.fetch,staticFiles=new Set(files);
 scope.fetch=function(input,options){
  const url=new URL(input instanceof Request?input.url:String(input),location.href);
  if(url.origin===location.origin){
   let name;
   try{name=decodeURIComponent(url.pathname.startsWith(prefix)?url.pathname.slice(prefix.length):url.pathname.startsWith('/data/')?url.pathname.slice(6):'');}catch{}
   if(name&&name!=='batch'&&name!=='file'&&!staticFiles.has(name)){
    url.pathname=prefix+'file';url.searchParams.set('file',name);
    input=input instanceof Request?new Request(url,input):url.href;
   }
  }
  return original.call(this,input,options);
 };
}
export const gtaRoutingScript=()=>`(${installGtaStaticDataRouting.toString()})('/ports/gta5-webport-vercel/data/',${JSON.stringify(Object.keys(known.hashes))});`;
