const SECURITY_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'fullscreen=(self), gamepad=(self)',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);

    // Pages stores these files as-is and does not add Content-Encoding in time
    // for the Unity loader. Return the original gzip bytes with the header.
    if (url.pathname.endsWith('.unityweb')) {
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('Content-Encoding', 'gzip');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(asset.body, {
        status: asset.status,
        statusText: asset.statusText,
        headers,
        encodeBody: 'manual',
      });
    }

    if (url.pathname.endsWith('.wasm')) headers.set('Content-Type', 'application/wasm');
    if (url.pathname === '/' || url.pathname.endsWith('/index.html')) {
      headers.set('Cache-Control', 'no-cache');
    } else if (url.pathname.startsWith('/Build/') || url.pathname.startsWith('/StreamingAssets/')) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }

    return new Response(asset.body, {
      status: asset.status,
      statusText: asset.statusText,
      headers,
    });
  },
};
