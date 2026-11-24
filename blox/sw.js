// Service worker for /blox/. Roblox's web client talks to *.roblox.com and
// *.rbxcdn.com with ordinary fetch/XHR, from the page and from its pthread
// workers. Those hosts may be unreachable from here, so every cross-origin
// request is handed to a page in this scope, which sends it over Wisp
// (host.js) with the Roblox session attached, and the reply comes back here.
//
// DillDoe: the engine itself is not stored on this site. Requests for
// /blox/engine/<version>/<file> are answered here, straight from Roblox's
// public engine CDN (setup.rbxcdn.com allows CORS), with the cross-origin
// isolation headers the engine's SharedArrayBuffer needs. Keeping the engine
// URL same-origin lets the engine start its pthread workers without a stub,
// and none of these downloads use a Cloudflare Function request.
// Other same-origin requests are left alone: the site's static headers
// already make /blox/ cross-origin isolated.

const SCOPE = new URL(self.registration.scope);
const ENGINE_PREFIX = new URL("engine/", SCOPE).pathname;
const ENGINE_CDN = "https://setup.rbxcdn.com/webclient/";
const ENGINE_VERSION = /^version-[0-9a-f]{16}$/;
// Engine content paths as Roblox's file index writes them, percent-encoded.
const ENGINE_FILE = /^[A-Za-z0-9_@ .()+%,=~!-]+(?:\/[A-Za-z0-9_@ .()+%,=~!-]+)*$/;
const ENGINE_HEADERS = ["content-type", "content-range", "accept-ranges", "etag", "last-modified", "cache-control"];
const NULL_BODY = new Set([101, 103, 204, 205, 304]);
const RELAY_TIMEOUT_MS = 120_000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!/^https?:/.test(request.url)) return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith(ENGINE_PREFIX)) event.respondWith(engineFile(request, url));
    return;
  }
  event.respondWith(crossOrigin(request, event.clientId));
});

function isolatedHeaders(headers = new Headers()) {
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-embedder-policy", "require-corp");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

function engineError(status, message) {
  return new Response(message, { status, headers: isolatedHeaders(new Headers({ "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" })) });
}

// /blox/engine/<version>/<path> -> setup.rbxcdn.com/webclient/<version>-RobloxWebClient/<path>
async function engineFile(request, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return engineError(405, "Method not allowed");
  const rest = url.pathname.slice(ENGINE_PREFIX.length);
  const slash = rest.indexOf("/");
  const version = slash < 0 ? "" : rest.slice(0, slash);
  const file = slash < 0 ? "" : rest.slice(slash + 1);
  if (!ENGINE_VERSION.test(version) || !ENGINE_FILE.test(file) || file.split("/").some((part) => part === "." || part === "..")) {
    return engineError(404, "Not an engine file");
  }
  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) headers.set("range", range);
  let upstream;
  try {
    upstream = await fetch(`${ENGINE_CDN}${version}-RobloxWebClient/${file}${url.search}`, {
      method: request.method,
      headers,
      mode: "cors",
      credentials: "omit",
      signal: request.signal,
    });
  } catch (error) {
    return engineError(502, `Could not download the Roblox engine: ${error?.message || error}`);
  }
  // The browser has already decoded the CDN's gzip, so the encoded length and
  // encoding are dropped; the useful caching headers are kept.
  const out = isolatedHeaders();
  for (const name of ENGINE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(request.method === "HEAD" || NULL_BODY.has(upstream.status) ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

async function crossOrigin(request, clientId) {
  try {
    const body = request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer();
    const result = await relay(clientId, {
      url: request.url,
      method: request.method,
      headers: [...request.headers],
      body,
    });
    return reply(result.status, result.statusText, result.headers, result.body);
  } catch (error) {
    return reply(502, "Bad Gateway", [["content-type", "application/json"]], JSON.stringify({ error: String(error?.message || error) }));
  }
}

function reply(status, statusText, headers, body) {
  const out = new Headers(headers);
  // The page is cross-origin isolated (COEP require-corp): without this, any
  // no-cors load (an <img>) of a relayed response would be blocked.
  out.set("cross-origin-resource-policy", "cross-origin");
  // The engine fetches with credentials and reads headers such as
  // x-csrf-token, so answer as Roblox would to its own site.
  out.set("access-control-allow-origin", self.location.origin);
  out.set("access-control-allow-credentials", "true");
  const names = [...new Set([...out.keys()])].join(", ");
  if (names) out.set("access-control-expose-headers", names);
  return new Response(NULL_BODY.has(status) ? null : body, { status, statusText, headers: out });
}

// A page of ours in this scope. Requests from the engine's workers carry the
// worker's client id, so fall back to any window.
async function relayPage(clientId) {
  const own = clientId ? await self.clients.get(clientId) : null;
  if (own?.type === "window") return own;
  const pages = await self.clients.matchAll({ type: "window" });
  const page = pages.find((client) => client.frameType === "top-level") ?? pages[0];
  if (!page) throw new Error("no page to relay through");
  return page;
}

async function relay(clientId, message) {
  const page = await relayPage(clientId);
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error("relay timed out"));
    }, RELAY_TIMEOUT_MS);
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer);
      channel.port1.close();
      if (data.ok) resolve(data);
      else reject(new Error(data.error));
    };
    const transfer = message.body ? [channel.port2, message.body] : [channel.port2];
    page.postMessage({ type: "blox-fetch", ...message }, transfer);
  });
}
