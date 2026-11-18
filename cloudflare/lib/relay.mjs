/* Same-origin peer relay for the Roblox March 2007 browser port.
 *
 * This is deliberately a small, dependency-free WebSocket room service. A
 * room is coordinated by one worker instance; players never learn each
 * other's address, and the host is the only participant allowed to receive
 * joiners' commands or send authoritative state.
 */
const rooms = new Map();
const sessions = new Map();
const MAX_PLAYERS = 16;
const MAX_MESSAGE = 128 * 1024;

function randomId(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const byte of bytes) out += byte.toString(36).padStart(2, '0');
  return out.slice(0, length).toUpperCase();
}

function cleanName(value, fallback) {
  const name = String(value == null ? '' : value).replace(/[^\x20-\x7E]/g, '').trim();
  return (name || fallback || 'Player').slice(0, 20);
}

function cleanPlace(value) {
  return String(value == null ? '' : value).replace(/[^\x20-\x7E]/g, '').trim().slice(0, 80);
}

function send(socket, message) {
  if (!socket || socket.readyState !== 1) return;
  try {
    socket.send(JSON.stringify(message));
  } catch (_) {
    /* The close handler removes dead sockets. */
  }
}

function roster(room) {
  return Array.from(room.players.values()).map(player => ({
    id: player.id,
    name: player.name,
    host: player.id === room.hostId
  }));
}

function broadcastRoster(room) {
  const players = roster(room);
  for (const player of room.players.values()) {
    send(player.socket, {t: 'roster', players});
  }
}

function roomList(place) {
  const out = [];
  for (const room of rooms.values()) {
    if (place && room.place !== place) continue;
    out.push({
      id: room.id,
      place: room.place,
      hostName: room.hostName,
      players: room.players.size,
      max: room.max
    });
    if (out.length >= 64) break;
  }
  return out;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function removePlayer(player, reason) {
  const room = rooms.get(player.roomId);
  if (!room || !room.players.has(player.id)) return;
  room.players.delete(player.id);
  sessions.delete(player.id);

  if (player.id === room.hostId) {
    for (const member of room.players.values()) {
      send(member.socket, {t: 'hostLeft'});
      try { member.socket.close(); } catch (_) { /* already closed */ }
      sessions.delete(member.id);
    }
    rooms.delete(room.id);
    return;
  }

  if (reason) send(player.socket, {t: 'error', code: reason});
  broadcastRoster(room);
}

function acceptPlay(request) {
  const upgrade = request.headers.get('Upgrade');
  if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
    return jsonResponse({error: 'Expected a WebSocket upgrade'}, 426);
  }
  if (request.method !== 'GET') {
    return jsonResponse({error: 'Expected GET'}, 405);
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const place = cleanPlace(url.searchParams.get('place'));
  if (!place || (mode !== 'host' && mode !== 'join')) {
    return jsonResponse({error: 'Invalid session parameters'}, 400);
  }

  let room = null;
  if (mode === 'join') {
    const id = String(url.searchParams.get('room') || '').toUpperCase().slice(0, 16);
    room = rooms.get(id);
    if (!room || room.place !== place) return jsonResponse({error: 'Room not found'}, 404);
    if (room.players.size >= room.max) return jsonResponse({error: 'Room is full'}, 409);
  }

  const [client, server] = Object.values(new WebSocketPair());
  server.accept();

  const player = {
    id: randomId(12),
    name: cleanName(url.searchParams.get('name'), mode === 'host' ? 'Host' : 'Player'),
    socket: server,
    roomId: '',
    host: mode === 'host'
  };

  if (mode === 'host') {
    let id;
    do { id = randomId(6); } while (rooms.has(id));
    room = {
      id,
      place,
      hostId: player.id,
      hostName: player.name,
      max: MAX_PLAYERS,
      players: new Map()
    };
    rooms.set(id, room);
  }

  player.roomId = room.id;
  room.players.set(player.id, player);
  sessions.set(player.id, player);

  send(server, {
    t: 'welcome',
    room: room.id,
    place: room.place,
    self: player.id,
    host: room.hostId,
    max: room.max,
    players: roster(room)
  });
  broadcastRoster(room);

  server.addEventListener('message', event => {
    if (typeof event.data !== 'string' || event.data.length > MAX_MESSAGE) return;
    let message;
    try { message = JSON.parse(event.data); } catch (_) { return; }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return;
    if (message.t === 'ping') {
      send(server, {t: 'pong'});
      return;
    }
    if (message.t === 'cmd' && !player.host) {
      const host = room.players.get(room.hostId);
      if (host) send(host.socket, {t: 'cmd', from: player.id, d: message.d});
      return;
    }
    if (message.t === 'state' && player.host) {
      const packet = {t: 'state', d: message.d};
      if (message.to === 'all') {
        for (const member of room.players.values()) {
          if (member.id !== player.id) send(member.socket, packet);
        }
        return;
      }
      if (Array.isArray(message.to)) {
        const targets = new Set(message.to.slice(0, 16).map(String));
        for (const member of room.players.values()) {
          if (targets.has(member.id) && member.id !== player.id) send(member.socket, packet);
        }
      }
    }
  });

  server.addEventListener('close', () => removePlayer(player, null));
  server.addEventListener('error', () => removePlayer(player, null));

  return new Response(null, {status: 101, webSocket: client});
}

export async function handleRelay(request) {
  const url = new URL(request.url);
  if (url.pathname === '/relay/rooms') {
    return jsonResponse({v: 1, rooms: roomList(url.searchParams.get('place'))});
  }
  if (url.pathname === '/relay/play') return acceptPlay(request);
  if (url.pathname === '/relay/health') {
    return jsonResponse({ok: true, rooms: rooms.size, players: sessions.size});
  }
  return jsonResponse({error: 'Not found'}, 404);
}
