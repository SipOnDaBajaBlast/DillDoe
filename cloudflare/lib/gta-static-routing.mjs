import known from './gta-static-data.json' with {type:'json'};
import {STATIC_ORIGIN} from './static-plan.mjs';

export function installGtaWorkerVersion(){
 const scope=typeof window==='undefined'?self:window;
 for(const name of ['Worker','SharedWorker'])if(scope[name]){const Original=scope[name];scope[name]=new Proxy(Original,{construct(target,args){
  try{const url=new URL(args[0],location.href);if(/^https?:$/.test(url.protocol)&&url.origin===location.origin&&url.pathname.startsWith('/ports/gta5-webport-vercel/')&&/\.m?js$/.test(url.pathname)){url.searchParams.set('assets','static-v2');args[0]=url.href;}}catch{}
  return Reflect.construct(target,args);
 }});}
}

export function installGtaStaticDataRouting(prefix,files,staticOrigin) {
 const scope=typeof window==='undefined'?self:window;
 const original=scope.fetch,staticFiles=new Set(files);
 scope.fetch=function(input,options){
  const url=new URL(input instanceof Request?input.url:String(input),location.href);
  if(url.origin===location.origin){
   let name;
   try{name=decodeURIComponent(url.pathname.startsWith(prefix)?url.pathname.slice(prefix.length):url.pathname.startsWith('/data/')?url.pathname.slice(6):'');}catch{}
   if(name&&name!=='batch'&&name!=='file'){
    if(staticFiles.has(name)){
     const target=new URL(prefix+name.split('/').map(encodeURIComponent).join('/'),staticOrigin);target.search=url.search;
     input=input instanceof Request?new Request(target,input):target.href;
     options={...options,mode:'cors',credentials:'omit'};
    }else{
     url.pathname=prefix+'file';url.searchParams.set('file',name);
     input=input instanceof Request?new Request(url,input):url.href;
    }
   }
  }
  return original.call(this,input,options);
 };
}
export const gtaRoutingScript=()=>`(${installGtaWorkerVersion.toString()})();(${installGtaStaticDataRouting.toString()})('/ports/gta5-webport-vercel/data/',${JSON.stringify(Object.keys(known.hashes))},${JSON.stringify(STATIC_ORIGIN)});`;
