export function cleanPath(value) {
  let path;
  try {path=decodeURIComponent(value);}catch{return null;}
  if(path.includes('\\') || path.includes('\0') || path.split('/').some(p=>p==='..'||p==='.'))return null;
  return path.replace(/^\/+/, '');
}
export const isolatedHeaders = {
 'Cross-Origin-Opener-Policy':'same-origin',
 'Cross-Origin-Embedder-Policy':'require-corp',
 'Cross-Origin-Resource-Policy':'same-origin',
 'Permissions-Policy':'cross-origin-isolated=(self), fullscreen=(self), gamepad=(self)',
};
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',wasm:'application/wasm',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',ico:'image/x-icon',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',mp4:'video/mp4',webm:'video/webm',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',txt:'text/plain; charset=utf-8'};
export function contentType(path){return types[path.replace(/\.(br|gz)$/,'').split('.').at(-1)]||'application/octet-stream';}
export function rewriteRootPaths(text, game, files, path='') {
  // RenPy uses absolute paths for its virtual filesystem. Browser network
  // requests are already scoped by bootstrap; these filesystem paths must stay.
  if(/^renpy(?:-pre)?\.js$/.test(path)&&Object.hasOwn(files,'renpy.wasm'))return text;
  const prefix=`/ports/${game}/`,roots=new Set(Object.keys(files).map(p=>p.split('/')[0]));
  return text.replace(/(["'`])(\/(?!\/)([^"'`\s<>]*))/g,(whole,quote,absolute,rest)=>{
    if(rest.startsWith('ports/'))return whole;
    const root=rest.split(/[/?#]/)[0];
    return roots.has(root)||root==='api'||root==='data'||root==='game-data' ? quote+prefix+rest : whole;
  });
}
export function installSmgShaderCompatibility() {
 // The port skips draws whose parallel shader compilation is still pending.
 // Use WebGL's synchronous link-status check so those frames retain geometry.
 const original = HTMLCanvasElement.prototype.getContext;
 const patched = new WeakSet();
 HTMLCanvasElement.prototype.getContext = function(type, ...args) {
  const context = original.call(this, type, ...args);
  if(type !== 'webgl2' || !context || patched.has(context))return context;
  patched.add(context);
  const extension = context.getExtension;
  const extensions = context.getSupportedExtensions;
  context.getExtension = function(name) {
   return String(name).toLowerCase() === 'khr_parallel_shader_compile' ? null : extension.call(this, name);
  };
  context.getSupportedExtensions = function() {
   return extensions.call(this)?.filter(name => name.toLowerCase() !== 'khr_parallel_shader_compile') ?? null;
  };
  return context;
 };
}
export function bootstrap(game) {
 const shaderCompatibility = game === 'smg-webport' ? `(${installSmgShaderCompatibility.toString()})();` : '';
 const prefix=`/ports/${game}/`;
 // Only root-relative requests inside this game are rebased. External hosts,
 // sibling games, and page navigation keep their original semantics.
 return `<script>${shaderCompatibility}(()=>{const p=${JSON.stringify(prefix)};const map=v=>{if(typeof v==='string'&&v.startsWith('/')&&!v.startsWith('//')&&!v.startsWith('/ports/'))return p+v.slice(1);return v};const f=window.fetch;window.fetch=function(v,o){return f.call(this,v instanceof Request?new Request(map(v.url.startsWith(location.origin+'/')?v.url.slice(location.origin.length):v.url),v):map(v),o)};const open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u,...a){return open.call(this,m,map(u),...a)};for(const n of ['Worker','SharedWorker'])if(window[n]){const C=window[n];window[n]=new Proxy(C,{construct(t,a){a[0]=map(a[0]);return Reflect.construct(t,a)}})}if(navigator.serviceWorker){const r=navigator.serviceWorker.register.bind(navigator.serviceWorker);navigator.serviceWorker.register=(u,o)=>r(map(u),o&&{...o,scope:o.scope?map(o.scope):o.scope})}})();<\/script>`;
}
