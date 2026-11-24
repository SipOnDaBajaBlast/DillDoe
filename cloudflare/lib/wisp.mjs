/* Wisp relay for Webblox (/blox/).
 *
 * Roblox's browser client runs in the player's browser. host.js sends each
 * Roblox API request over a Wisp WebSocket with epoxy, which runs TLS inside
 * the browser, so this relay only moves encrypted bytes and never sees the
 * player's Roblox session. One WebSocket is one Function request, however
 * many API calls travel over it.
 *
 * Only Roblox hosts on port 443 are reachable, so the site is not an open
 * proxy. Game traffic itself is WebTransport from the browser straight to
 * *.qdmux.roblox.com and never passes through here.
 *
 * Wisp v1: https://github.com/MercuryWorkshop/wisp-protocol
 * Adapted from https://github.com/hiwa1do/webblox.js (src/worker.js).
 */
export const WISP_PATH = '/wisp/';
export const WISP_HOSTS = /(^|\.)(roblox\.com|rbxcdn\.com|robloxlabs\.com)$/i;
export const WISP_PORTS = new Set([443]);

/* Roblox's engine runs on shared memory, so the Webblox host page and the
 * game page that embeds it must be cross-origin isolated. The Pages _headers
 * file is at its 100-rule limit, so the Worker adds the headers to just these
 * two HTML documents; every other /blox/ file stays a static asset (same-origin
 * subresources need no extra headers). */
export const WEBBLOX_PAGES = new Set(['/blox/', '/blox/index.html', '/blox/index', '/games/Webblox', '/games/Webblox.html']);
export const WEBBLOX_ROUTES = ['/wisp', '/wisp/*', ...WEBBLOX_PAGES];

export function isolateWebbloxPage(response) {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

const CONNECT = 0x01, DATA = 0x02, CONTINUE = 0x03, CLOSE = 0x04;
const CLOSE_NORMAL = 0x02, CLOSE_NETWORK = 0x03, CLOSE_INVALID = 0x41, CLOSE_UNREACHABLE = 0x42, CLOSE_BLOCKED = 0x48;
const TCP = 0x01;
const QUEUE_SIZE = 128;
const CONTINUE_EVERY = QUEUE_SIZE / 4;
const MAX_STREAMS = 64;
const HEADER_SIZE = 5;
const EMPTY = new Uint8Array(0);

export function allowedTarget(hostname, port) {
  return typeof hostname === 'string' && hostname.length <= 253 && !/[^a-z0-9.-]/i.test(hostname) &&
    !hostname.startsWith('.') && !hostname.includes('..') && WISP_HOSTS.test(hostname) && WISP_PORTS.has(port);
}

export function packet(type, streamId, payload = EMPTY) {
  const out = new Uint8Array(HEADER_SIZE + payload.length);
  out[0] = type;
  new DataView(out.buffer).setUint32(1, streamId >>> 0, true);
  out.set(payload, HEADER_SIZE);
  return out;
}

function uint32(value) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, true);
  return out;
}

async function bytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof Blob !== 'undefined' && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return null;
}

export class WispSession {
  constructor(websocket, connect) {
    this.websocket = websocket;
    this.connect = connect;
    this.streams = new Map();
    this.closed = false;
    this.incoming = Promise.resolve();
  }

  send(type, streamId, payload = EMPTY) {
    if (this.closed || this.websocket.readyState !== 1) return false;
    try {
      this.websocket.send(packet(type, streamId, payload));
      return true;
    } catch {
      this.shutdown(1011, 'WebSocket send failed');
      return false;
    }
  }

  sendClose(streamId, reason) {
    this.send(CLOSE, streamId, new Uint8Array([reason & 0xff]));
  }

  attach() {
    this.websocket.binaryType = 'arraybuffer';
    this.websocket.addEventListener('message', event => {
      this.incoming = this.incoming.then(() => this.handle(event.data)).catch(() => this.shutdown(1011, 'Internal Wisp error'));
    });
    this.websocket.addEventListener('close', () => this.shutdown(1000, 'Closed', false));
    this.websocket.addEventListener('error', () => this.shutdown(1011, 'WebSocket error', false));
    // Wisp v1 handshake: the server's buffer size for every new stream.
    this.send(CONTINUE, 0, uint32(QUEUE_SIZE));
  }

  async handle(raw) {
    if (this.closed) return;
    const data = await bytes(raw);
    if (!data) return;
    if (data.byteLength < HEADER_SIZE) return this.shutdown(1002, 'Malformed Wisp packet');
    const type = data[0];
    const streamId = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(1, true);
    const payload = data.subarray(HEADER_SIZE);
    if (type === CONNECT) return this.open(streamId, payload);
    if (type === DATA) {
      const stream = this.streams.get(streamId);
      if (stream) await this.enqueue(stream, payload.slice());
      return;
    }
    if (type === CLOSE) this.closeStream(streamId);
  }

  open(streamId, payload) {
    if (streamId === 0 || this.streams.has(streamId) || payload.byteLength < 4) return this.sendClose(streamId, CLOSE_INVALID);
    if (this.streams.size >= MAX_STREAMS) return this.sendClose(streamId, CLOSE_UNREACHABLE);
    const type = payload[0];
    const port = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint16(1, true);
    let hostname;
    try {
      hostname = new TextDecoder('utf-8', {fatal: true}).decode(payload.subarray(3)).toLowerCase();
    } catch {
      return this.sendClose(streamId, CLOSE_INVALID);
    }
    if (type !== TCP || !hostname) return this.sendClose(streamId, CLOSE_INVALID);
    if (!allowedTarget(hostname, port)) return this.sendClose(streamId, CLOSE_BLOCKED);
    const stream = {id: streamId, hostname, port, socket: null, reader: null, writer: null, queue: [], dataWaiters: [], spaceWaiters: [], sent: 0, closed: false};
    this.streams.set(streamId, stream);
    this.openTcp(stream);
  }

  async openTcp(stream) {
    try {
      const socket = this.connect({hostname: stream.hostname, port: stream.port}, {secureTransport: 'off', allowHalfOpen: true});
      stream.socket = socket;
      await socket.opened;
      if (this.closed || stream.closed) {
        await socket.close().catch(() => {});
        return;
      }
      stream.reader = socket.readable.getReader();
      stream.writer = socket.writable.getWriter();
      this.pumpToTcp(stream);
      this.pumpToClient(stream);
    } catch {
      if (!stream.closed) {
        this.sendClose(stream.id, CLOSE_UNREACHABLE);
        this.closeStream(stream.id);
      }
      if (stream.socket) await stream.socket.close().catch(() => {});
    }
  }

  async enqueue(stream, data) {
    while (stream.queue.length >= QUEUE_SIZE && !stream.closed) await new Promise(resolve => stream.spaceWaiters.push(resolve));
    if (stream.closed) return;
    stream.queue.push(data);
    stream.dataWaiters.shift()?.();
  }

  async dequeue(stream) {
    while (stream.queue.length === 0 && !stream.closed) await new Promise(resolve => stream.dataWaiters.push(resolve));
    if (stream.closed || stream.queue.length === 0) return null;
    const data = stream.queue.shift();
    stream.spaceWaiters.shift()?.();
    return data;
  }

  async pumpToTcp(stream) {
    try {
      while (!stream.closed) {
        const data = await this.dequeue(stream);
        if (data === null) return;
        await stream.writer.write(data);
        if (++stream.sent % CONTINUE_EVERY === 0 && !stream.closed) this.send(CONTINUE, stream.id, uint32(QUEUE_SIZE - stream.queue.length));
      }
    } catch {
      if (!stream.closed) {
        this.sendClose(stream.id, CLOSE_NETWORK);
        this.closeStream(stream.id);
      }
    }
  }

  async pumpToClient(stream) {
    try {
      while (!stream.closed) {
        const {done, value} = await stream.reader.read();
        if (done) break;
        if (value?.byteLength && !this.send(DATA, stream.id, value)) return;
      }
      if (!stream.closed) {
        this.sendClose(stream.id, CLOSE_NORMAL);
        this.closeStream(stream.id);
      }
    } catch {
      if (!stream.closed) {
        this.sendClose(stream.id, CLOSE_NETWORK);
        this.closeStream(stream.id);
      }
    }
  }

  closeStream(streamId) {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    this.streams.delete(streamId);
    stream.closed = true;
    stream.queue.length = 0;
    for (const resolve of stream.dataWaiters.splice(0)) resolve();
    for (const resolve of stream.spaceWaiters.splice(0)) resolve();
    stream.socket?.close().catch(() => {});
  }

  shutdown(code = 1000, reason = 'Closed', closeSocket = true) {
    if (this.closed) return;
    this.closed = true;
    for (const id of [...this.streams.keys()]) this.closeStream(id);
    if (closeSocket && this.websocket.readyState === 1) {
      try { this.websocket.close(code, reason.slice(0, 100)); } catch {}
    }
  }
}

/* The WebSocket must come from a page on this site: the relay is for
 * DillDoe's own /blox/ page, not for other websites. */
export function sameSite(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function handleWisp(request, connect) {
  const url = new URL(request.url);
  if (url.pathname !== WISP_PATH) return Response.redirect(new URL(WISP_PATH, url).href, 308);
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Webblox relay: WebSocket only.\n', {status: 426, headers: {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', upgrade: 'websocket'}});
  }
  if (!sameSite(request)) return new Response('Forbidden\n', {status: 403, headers: {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store'}});
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  new WispSession(server, connect).attach();
  return new Response(null, {status: 101, webSocket: client});
}
