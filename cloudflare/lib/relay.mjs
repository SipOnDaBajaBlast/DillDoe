/* Same-origin peer relay for the Roblox March 2007 browser port.
 *
 * Pages Functions do not share memory between isolates, and WebSocket room
 * state cannot be kept in a normal Function. The relay therefore uses the
 * site's existing D1 database as shared room storage and long-polling for
 * transport. A small browser shim presents the same WebSocket-shaped API to
 * the port, so the game code itself does not need to know about polling.
 *
 * The host remains authoritative: joiners may only send commands to the
 * host, and only the host may publish state. No player addresses are shared.
 */
const MAX_PLAYERS = 16;
const ROOM_STALE_MS = 90000;
const MESSAGE_TTL_MS = 180000;
const MAX_BODY = 256 * 1024;
const MAX_BATCH = 64;
const MAX_MESSAGE = 128 * 1024;
const POLL_INTERVAL_MS = 250;

let schemaDb = null;
let schemaReady = null;

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function randomCode(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function tokenHash(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function cleanName(value, fallback) {
  const name = String(value == null ? '' : value).replace(/[^\x20-\x7E]/g, '').trim();
  return (name || fallback || 'Player').slice(0, 20);
}

function cleanPlace(value) {
  return String(value == null ? '' : value).replace(/[^\x20-\x7E]/g, '').trim().slice(0, 80);
}

function integer(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function dbOf(env) {
  return env && env.PLAYER_DB ? env.PLAYER_DB : null;
}

async function ensureSchema(env) {
  const db = dbOf(env);
  if (!db) throw new Error('PLAYER_DB is not configured');
  if (schemaReady && schemaDb === db) return schemaReady;
  schemaDb = db;
  schemaReady = db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS relay_rooms (
      id TEXT PRIMARY KEY,
      place TEXT NOT NULL,
      host_id TEXT NOT NULL,
      host_name TEXT NOT NULL,
      max INTEGER NOT NULL DEFAULT 16,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS relay_players (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      host INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL,
      seen_at INTEGER NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS relay_players_room ON relay_players(room_id, seen_at)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS relay_messages (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS relay_messages_room ON relay_messages(room_id, seq)'),
    db.prepare('CREATE INDEX IF NOT EXISTS relay_messages_time ON relay_messages(created_at)')
  ]).then(() => true).catch(error => {
    schemaReady = null;
    schemaDb = null;
    throw error;
  });
  return schemaReady;
}

let lastCleanup = 0;

async function cleanup(env, now) {
  if (now - lastCleanup < 5000) return;
  lastCleanup = now;
  const db = dbOf(env);
  const stale = now - ROOM_STALE_MS;
  await db.batch([
    db.prepare('DELETE FROM relay_messages WHERE created_at < ?').bind(now - MESSAGE_TTL_MS),
    db.prepare('DELETE FROM relay_players WHERE seen_at < ?').bind(stale),
    db.prepare('DELETE FROM relay_rooms WHERE id NOT IN (SELECT DISTINCT room_id FROM relay_players)'),
    db.prepare('DELETE FROM relay_messages WHERE room_id NOT IN (SELECT id FROM relay_rooms)')
  ]);
}

async function activePlayers(env, roomId, now) {
  const result = await dbOf(env).prepare(
    `SELECT id, name, host FROM relay_players
     WHERE room_id = ? AND seen_at >= ?
     ORDER BY host DESC, joined_at ASC
     LIMIT ?`
  ).bind(roomId, now - ROOM_STALE_MS, MAX_PLAYERS).all();
  return (result.results || []).map(player => ({
    id: String(player.id),
    name: String(player.name),
    host: Number(player.host) === 1
  }));
}

async function authenticate(env, token, now) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32}$/i.test(token)) return null;
  const hash = await tokenHash(token);
  const player = await dbOf(env).prepare(
    'SELECT id, room_id, name, host, joined_at, seen_at FROM relay_players WHERE token_hash = ?'
  ).bind(hash).first();
  if (!player) return null;
  if (now - Number(player.seen_at) > 1000) {
    await dbOf(env).prepare('UPDATE relay_players SET seen_at = ? WHERE id = ?')
      .bind(now, player.id).run();
  }
  return player;
}

async function createRoom(env, place, name, now) {
  const db = dbOf(env);
  for (let attempt = 0; attempt < 8; attempt++) {
    const roomId = randomCode(6);
    const playerId = randomCode(12);
    const token = randomToken();
    const hash = await tokenHash(token);
    try {
      await db.batch([
        db.prepare(
          'INSERT INTO relay_rooms (id, place, host_id, host_name, max, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(roomId, place, playerId, name, MAX_PLAYERS, now, now),
        db.prepare(
          'INSERT INTO relay_players (id, room_id, name, token_hash, host, joined_at, seen_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
        ).bind(playerId, roomId, name, hash, now, now)
      ]);
      return { roomId, playerId, token };
    } catch (error) {
      if (!/UNIQUE|constraint/i.test(String(error && error.message))) throw error;
    }
  }
  throw new Error('Could not allocate a room');
}

async function handleRooms(request, env) {
  const db = dbOf(env);
  if (!db) return jsonResponse({ error: 'Multiplayer relay is not configured.' }, 503);
  const now = Date.now();
  await ensureSchema(env);
  await cleanup(env, now);
  const place = cleanPlace(new URL(request.url).searchParams.get('place'));
  if (!place) return jsonResponse({ v: 1, rooms: [] });
  const stale = now - ROOM_STALE_MS;
  const result = await db.prepare(
    `SELECT r.id, r.place, r.host_name, r.max, COUNT(p.id) AS players
     FROM relay_rooms r
     JOIN relay_players p ON p.room_id = r.id AND p.seen_at >= ?
     WHERE r.place = ?
       AND EXISTS (
         SELECT 1 FROM relay_players h
         WHERE h.id = r.host_id AND h.seen_at >= ?
       )
     GROUP BY r.id
     ORDER BY r.updated_at DESC
     LIMIT 64`
  ).bind(stale, place, stale).all();
  const rooms = (result.results || []).map(row => ({
    id: String(row.id),
    place: String(row.place),
    hostName: String(row.host_name),
    players: Math.max(1, Math.min(MAX_PLAYERS, Number(row.players) || 1)),
    max: Math.max(2, Math.min(MAX_PLAYERS, Number(row.max) || MAX_PLAYERS))
  }));
  return jsonResponse({ v: 1, rooms });
}

async function handleSession(request, env) {
  const db = dbOf(env);
  if (!db) return jsonResponse({ error: 'Multiplayer relay is not configured.' }, 503);
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid session request.' }, 400);
  }
  if (!body || typeof body !== 'object') return jsonResponse({ error: 'Invalid session request.' }, 400);
  const mode = body.mode === 'host' ? 'host' : body.mode === 'join' ? 'join' : '';
  const place = cleanPlace(body.place);
  const name = cleanName(body.name, mode === 'host' ? 'Host' : 'Player');
  if (!mode || !place) return jsonResponse({ error: 'Invalid session parameters.' }, 400);

  const now = Date.now();
  await ensureSchema(env);
  await cleanup(env, now);

  let roomId;
  let playerId;
  let token;
  if (mode === 'host') {
    try {
      ({ roomId, playerId, token } = await createRoom(env, place, name, now));
    } catch (error) {
      return jsonResponse({ error: 'Could not create a room. Try again.' }, 503);
    }
  } else {
    roomId = String(body.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (!roomId) return jsonResponse({ error: 'Room code is missing.' }, 400);
    const room = await db.prepare('SELECT id, place, host_id, max FROM relay_rooms WHERE id = ?')
      .bind(roomId).first();
    if (!room || String(room.place) !== place) {
      return jsonResponse({ error: 'Room not found.' }, 404);
    }
    const count = await db.prepare(
      'SELECT COUNT(*) AS n FROM relay_players WHERE room_id = ? AND seen_at >= ?'
    ).bind(roomId, now - ROOM_STALE_MS).first();
    if (Number(count && count.n) >= Math.min(MAX_PLAYERS, Number(room.max) || MAX_PLAYERS)) {
      return jsonResponse({ error: 'Room is full.' }, 409);
    }
    playerId = randomCode(12);
    token = randomToken();
    const hash = await tokenHash(token);
    try {
      await db.batch([
        db.prepare(
          'INSERT INTO relay_players (id, room_id, name, token_hash, host, joined_at, seen_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
        ).bind(playerId, roomId, name, hash, now, now),
        db.prepare('UPDATE relay_rooms SET updated_at = ? WHERE id = ?').bind(now, roomId)
      ]);
    } catch (_) {
      return jsonResponse({ error: 'Could not join the room.' }, 503);
    }
  }

  const players = await activePlayers(env, roomId, now);
  const host = mode === 'host' ? playerId : players.find(player => player.host)?.id || '';
  return jsonResponse({
    t: 'welcome',
    room: roomId,
    place,
    self: playerId,
    host,
    max: MAX_PLAYERS,
    players,
    token
  });
}

async function handleSend(request, env) {
  const db = dbOf(env);
  if (!db) return jsonResponse({ error: 'Multiplayer relay is not configured.' }, 503);
  const length = integer(request.headers.get('Content-Length'), 0);
  if (length > MAX_BODY) return jsonResponse({ error: 'Message batch is too large.' }, 413);
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid message batch.' }, 400);
  }
  if (!body || typeof body !== 'object' || !Array.isArray(body.batch)) {
    return jsonResponse({ error: 'Invalid message batch.' }, 400);
  }
  const batch = body.batch.slice(0, MAX_BATCH);
  const now = Date.now();
  await ensureSchema(env);
  const player = await authenticate(env, body.token, now);
  if (!player) return jsonResponse({ error: 'Relay session expired.' }, 410);
  const room = await db.prepare('SELECT id, host_id FROM relay_rooms WHERE id = ?')
    .bind(player.room_id).first();
  if (!room) return jsonResponse({ error: 'Relay session expired.' }, 410);

  const isHost = Number(player.host) === 1;
  const statements = [];
  const active = isHost
    ? new Set((await activePlayers(env, player.room_id, now)).map(member => member.id))
    : null;

  for (const item of batch) {
    if (!item || typeof item !== 'object' || typeof item.t !== 'string') continue;
    if (item.t !== (isHost ? 'state' : 'cmd')) continue;
    if (!item.d || typeof item.d !== 'object') continue;
    let payload;
    try {
      payload = JSON.stringify(item.d);
    } catch (_) {
      continue;
    }
    if (payload.length > MAX_MESSAGE) continue;

    const insert = (toId, fromId, kind) => {
      if (statements.length >= 96) return;
      statements.push(db.prepare(
        'INSERT INTO relay_messages (room_id, from_id, to_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(player.room_id, fromId, toId, kind, payload, now));
    };

    if (!isHost) {
      insert(room.host_id, player.id, 'cmd');
      continue;
    }

    if (item.to === 'all') {
      insert('*', player.id, 'state');
      continue;
    }
    if (Array.isArray(item.to)) {
      for (const target of item.to.slice(0, MAX_PLAYERS)) {
        if (typeof target === 'string' && active.has(target)) insert(target, player.id, 'state');
      }
    }
  }

  if (statements.length) await db.batch(statements);
  return jsonResponse({ ok: true, n: statements.length });
}

async function handlePoll(request, env) {
  const db = dbOf(env);
  if (!db) return jsonResponse({ error: 'Multiplayer relay is not configured.' }, 503);
  const url = new URL(request.url);
  const now = Date.now();
  await ensureSchema(env);
  await cleanup(env, now);
  const player = await authenticate(env, url.searchParams.get('token'), now);
  if (!player) return jsonResponse({ error: 'Relay session expired.' }, 410);
  const after = integer(url.searchParams.get('after'), 0);

  const room = await db.prepare('SELECT id, place, host_id FROM relay_rooms WHERE id = ?')
    .bind(player.room_id).first();
  if (!room) return jsonResponse({ v: 1, seq: after, messages: [], players: [], hostLeft: true });

  const isHost = Number(player.host) === 1;
  const wait = Math.min(2500, Math.max(100, integer(env.RELAY_POLL_WAIT_MS, 1800)));
  const until = Date.now() + wait;
  let messages = [];
  let seq = after;

  while (true) {
    const result = await db.prepare(
      `SELECT seq, from_id, kind, body FROM relay_messages
       WHERE room_id = ? AND seq > ? AND created_at >= ?
         AND (to_id = '*' OR to_id = ?) AND from_id <> ?
       ORDER BY seq ASC
       LIMIT 200`
    ).bind(player.room_id, after, Number(player.joined_at) || 0, player.id, player.id).all();
    const rows = result.results || [];
    if (rows.length) {
      seq = Math.max(after, Number(rows[rows.length - 1].seq) || after);
      messages = rows.map(row => {
        let data = null;
        try { data = JSON.parse(row.body); } catch (_) { /* dropped */ }
        if (!data || typeof data !== 'object') return null;
        if (row.kind === 'cmd') return { t: 'cmd', from: String(row.from_id), d: data };
        if (row.kind === 'state') return { t: 'state', d: data };
        return null;
      }).filter(Boolean);
      break;
    }
    if (Date.now() >= until) break;
    await sleep(POLL_INTERVAL_MS);
  }

  const players = await activePlayers(env, player.room_id, Date.now());
  const hostPresent = players.some(member => member.id === String(room.host_id) && member.host);
  if (!isHost && !hostPresent) {
    return jsonResponse({ v: 1, seq, messages: [], players, hostLeft: true });
  }
  return jsonResponse({ v: 1, seq, messages, players, hostLeft: false });
}

async function handleLeave(request, env) {
  const db = dbOf(env);
  if (!db) return jsonResponse({ ok: true });
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ ok: true });
  }
  const now = Date.now();
  await ensureSchema(env);
  const player = await authenticate(env, body && body.token, now);
  if (!player) return jsonResponse({ ok: true });
  if (Number(player.host) === 1) {
    await db.batch([
      db.prepare('DELETE FROM relay_messages WHERE room_id = ?').bind(player.room_id),
      db.prepare('DELETE FROM relay_players WHERE room_id = ?').bind(player.room_id),
      db.prepare('DELETE FROM relay_rooms WHERE id = ?').bind(player.room_id)
    ]);
  } else {
    await db.batch([
      db.prepare('DELETE FROM relay_players WHERE id = ?').bind(player.id),
      db.prepare('UPDATE relay_rooms SET updated_at = ? WHERE id = ?').bind(now, player.room_id)
    ]);
  }
  return jsonResponse({ ok: true });
}

async function handleHealth(env) {
  const db = dbOf(env);
  if (!db) return jsonResponse({ ok: false, relay: 'unconfigured' }, 503);
  await ensureSchema(env);
  const now = Date.now();
  const rooms = await db.prepare('SELECT COUNT(*) AS n FROM relay_rooms').first();
  const players = await db.prepare('SELECT COUNT(*) AS n FROM relay_players WHERE seen_at >= ?')
    .bind(now - ROOM_STALE_MS).first();
  return jsonResponse({
    ok: true,
    relay: 'd1',
    rooms: Number(rooms && rooms.n) || 0,
    players: Number(players && players.n) || 0
  });
}

export async function handleRelay(request, env) {
  try {
    await ensureSchema(env);
    const path = new URL(request.url).pathname;
    if (path === '/relay/rooms') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
      return await handleRooms(request, env);
    }
    if (path === '/relay/session') {
      if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
      return await handleSession(request, env);
    }
    if (path === '/relay/send') {
      if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
      return await handleSend(request, env);
    }
    if (path === '/relay/poll') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
      return await handlePoll(request, env);
    }
    if (path === '/relay/leave') {
      if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
      return await handleLeave(request, env);
    }
    if (path === '/relay/health') return await handleHealth(env);
    return jsonResponse({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[relay]', error && error.stack || error);
    return jsonResponse({ error: 'Multiplayer relay is unavailable.' }, 503);
  }
}
