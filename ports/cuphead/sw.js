const CDN = 'https://cdn.jsdelivr.net/gh/web-ports/cuphead@08a62227c742d74092f739b168ee4be1993f8ba5/';
const RAW = 'https://raw.githubusercontent.com/web-ports/cuphead/08a62227c742d74092f739b168ee4be1993f8ba5/';
const PARTS = 103;
const SIZE = 2134335501;

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (!new URL(event.request.url).pathname.endsWith('/Build/CupheadPort.data.unityweb')) return;
  if (event.request.method !== 'GET') return;
  const stream = new ReadableStream({
    async start(controller) {
      let total = 0;
      try {
        for (let i = 1; i <= PARTS; i++) {
          const file = `Build/CupheadPort.data.unityweb.part${i}`;
          let response;
          for (const base of [CDN, RAW]) {
            try { response = await fetch(base + file); if (response.ok) break; }
            catch (error) { console.warn('Retrying Cuphead part', i, error); }
          }
          if (!response?.ok || !response.body) throw new Error(`Cuphead part ${i} unavailable`);
          const reader = response.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            controller.enqueue(value);
          }
        }
        if (total !== SIZE) throw new Error(`Cuphead data length ${total} did not match ${SIZE}`);
        controller.close();
      } catch (error) { controller.error(error); }
    }
  });
  event.respondWith(new Response(stream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(SIZE),
      'Cache-Control': 'no-store'
    }
  }));
});
