// Keep Unity's original gzip-fallback download and IndexedDB cache key while
// serving its data archive as static files below the Pages per-file limit.
export function installDeathNoteData(parts, totalBytes) {
 const originalFetch = window.fetch.bind(window);
 const dataUrl = new URL('Build/DeathNote.data.unityweb', location.href);
 window.fetch = async function(input, options) {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  const method = options?.method || (input instanceof Request ? input.method : 'GET');
  if (url.origin !== dataUrl.origin || url.pathname !== dataUrl.pathname || method !== 'GET') return originalFetch(input, options);
  const signal = options?.signal || (input instanceof Request ? input.signal : undefined);
  let index = 0, reader, loaded = 0;
  const stream = new ReadableStream({
   async pull(controller) {
    try {
     while (true) {
      if (signal?.aborted) throw signal.reason || new DOMException('Download cancelled', 'AbortError');
      if (!reader) {
       if (index === parts.length) {
        if (loaded !== totalBytes) throw new Error('Death Note download is incomplete. Reload to try again.');
        controller.close(); return;
       }
       const partUrl = new URL(parts[index++], dataUrl);
       partUrl.search = url.search;
       const response = await originalFetch(partUrl.href, {signal});
       if (!response.ok || !response.body || response.headers.get('Content-Type')?.includes('text/html')) {
        await response.body?.cancel();
        throw new Error('Death Note download failed (HTTP ' + response.status + '). Reload to try again.');
       }
       reader = response.body.getReader();
      }
      const {value, done} = await reader.read();
      if (done) { reader.releaseLock(); reader = null; continue; }
      loaded += value.byteLength;
      if (loaded > totalBytes) throw new Error('Death Note download has an unexpected size.');
      controller.enqueue(value); return;
     }
    } catch (error) {
     await reader?.cancel().catch(() => {});
     controller.error(error);
    }
   },
   async cancel(reason) { await reader?.cancel(reason); }
  });
  return new Response(stream, {headers: {'Content-Type': 'application/octet-stream', 'Content-Length': String(totalBytes)}});
 };
}

export function patchDeathNoteHtml(html, entry) {
 const parts = entry.splitFiles?.['Build/DeathNote.data.unityweb'];
 if (!parts?.length || !html.includes('DeathNote.loader.js')) throw new Error('Recheck Death Note split data configuration');
 const files = parts.map(file => file.replace(/^Build\//, ''));
 const size = parts.reduce((total, file) => total + entry.files[file], 0);
 return html.replace('</head>', '<script>(' + installDeathNoteData.toString() + ')(' + JSON.stringify(files) + ',' + size + ');</script></head>');
}
