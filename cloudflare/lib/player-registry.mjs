import { checkPlayerName } from './player-name.mjs';

const PLAYER_COOKIE = '__Host-dd_player';
const ADMIN_COOKIE = '__Host-dd_player_admin';
const SESSION_LIFETIME = 12 * 60 * 60;
const LOGIN_WINDOW = 15 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
// Bump this to ask every player for a name again. Existing rows below it are reset.
const NAME_VERSION = 3;

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

function cookieValue(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  for (const part of cookies.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return '';
}

function setCookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    difference |= (a[i] || 0) ^ (b[i] || 0);
  }
  return difference === 0;
}

async function bodyJson(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 2048) return null;
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

let schemaReady = null;

async function addColumn(env, definition) {
  try {
    await env.PLAYER_DB.prepare(`ALTER TABLE players ADD COLUMN ${definition}`).run();
  } catch (error) {
    if (!String(error?.message).toLowerCase().includes('duplicate column')) throw error;
  }
}

async function migratePlayerSchema(env) {
  const table = await env.PLAYER_DB.prepare('PRAGMA table_info(players)').all();
  const columns = new Set((table.results || []).map(column => column.name));
  if (!columns.size) return;
  if (!columns.has('name_version')) await addColumn(env, 'name_version INTEGER NOT NULL DEFAULT 0');
  if (!columns.has('previous_username')) await addColumn(env, 'previous_username TEXT');
  await env.PLAYER_DB.prepare(
    'CREATE TABLE IF NOT EXISTS player_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
  ).run();
  const applied = await env.PLAYER_DB.prepare(
    "SELECT value FROM player_meta WHERE key = 'name_version'"
  ).first();
  if (Number(applied?.value) === NAME_VERSION) return;
  // Everyone enters a name again after a rules change, even if they already picked one.
  await env.PLAYER_DB.prepare(
    'UPDATE players SET previous_username = COALESCE(previous_username, username), name_version = 0'
  ).run();
  await env.PLAYER_DB.prepare(`
    INSERT INTO player_meta (key, value) VALUES ('name_version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).bind(String(NAME_VERSION)).run();
}

async function ensurePlayerSchema(env) {
  if (!schemaReady) {
    schemaReady = migratePlayerSchema(env).catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function ensurePlayer(request, env) {
  let id = cookieValue(request, PLAYER_COOKIE);
  const headers = {};
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    id = crypto.randomUUID();
    headers['Set-Cookie'] = setCookie(PLAYER_COOKIE, id, 60 * 60 * 24 * 365);
  }

  const player = await env.PLAYER_DB.prepare(
    'SELECT username, previous_username, name_version, banned_at, last_seen_at FROM players WHERE player_id = ?'
  ).bind(id).first();
  if (player && Date.now() - player.last_seen_at > 60 * 1000) {
    await env.PLAYER_DB.prepare('UPDATE players SET last_seen_at = ? WHERE player_id = ?')
      .bind(Date.now(), id).run();
  }
  return { id, player, headers };
}

async function adminSession(request, env) {
  const token = cookieValue(request, ADMIN_COOKIE);
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const hash = await sha256(token);
  const session = await env.PLAYER_DB.prepare(
    'SELECT expires_at FROM admin_sessions WHERE session_hash = ?'
  ).bind(hash).first();
  if (!session || session.expires_at <= Date.now()) {
    await env.PLAYER_DB.prepare('DELETE FROM admin_sessions WHERE session_hash = ?').bind(hash).run();
    return null;
  }
  return hash;
}

async function login(request, env) {
  if (!sameOrigin(request)) return json({ error: 'Request rejected.' }, 403);
  if (!env.PLAYER_ADMIN_PASSWORD) return json({ error: 'Admin password is not configured.' }, 503);
  const body = await bodyJson(request);
  if (typeof body?.password !== 'string' || body.password.length > 256) {
    return json({ error: 'Enter your admin password.' }, 400);
  }

  const address = request.headers.get('CF-Connecting-IP') || 'unknown';
  const addressHash = await sha256(address);
  const now = Date.now();
  await env.PLAYER_DB.prepare('DELETE FROM admin_login_attempts WHERE window_started < ?')
    .bind(now - 24 * 60 * 60 * 1000).run();
  await env.PLAYER_DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now).run();
  const attempts = await env.PLAYER_DB.prepare(
    'SELECT attempts, window_started, blocked_until FROM admin_login_attempts WHERE address_hash = ?'
  ).bind(addressHash).first();
  if (attempts?.blocked_until > now) return json({ error: 'Too many attempts. Try again later.' }, 429);

  if (!constantTimeEqual(body.password, env.PLAYER_ADMIN_PASSWORD)) {
    const active = attempts && now - attempts.window_started < LOGIN_WINDOW * 1000;
    const count = active ? attempts.attempts + 1 : 1;
    const blockedUntil = count >= MAX_LOGIN_ATTEMPTS ? now + LOGIN_WINDOW * 1000 : 0;
    await env.PLAYER_DB.prepare(`
      INSERT INTO admin_login_attempts (address_hash, attempts, window_started, blocked_until)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(address_hash) DO UPDATE SET
        attempts = excluded.attempts,
        window_started = excluded.window_started,
        blocked_until = excluded.blocked_until
    `).bind(addressHash, count, active ? attempts.window_started : now, blockedUntil).run();
    return json({ error: blockedUntil ? 'Too many attempts. Try again later.' : 'Incorrect password.' }, blockedUntil ? 429 : 401);
  }

  await env.PLAYER_DB.prepare('DELETE FROM admin_login_attempts WHERE address_hash = ?')
    .bind(addressHash).run();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const hash = await sha256(token);
  const expiresAt = now + SESSION_LIFETIME * 1000;
  await env.PLAYER_DB.prepare(
    'INSERT INTO admin_sessions (session_hash, created_at, expires_at) VALUES (?, ?, ?)'
  ).bind(hash, now, expiresAt).run();
  return json({ ok: true }, 200, { 'Set-Cookie': setCookie(ADMIN_COOKIE, token, SESSION_LIFETIME) });
}

async function adminApi(request, env, url) {
  if (url.pathname === '/api/admin/login' && request.method === 'POST') return login(request, env);
  if (!['GET', 'POST'].includes(request.method)) {
    return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
  }
  const sessionHash = await adminSession(request, env);
  if (!sessionHash) return json({ error: 'Sign in to manage players.' }, 401);

  if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
    if (!sameOrigin(request)) return json({ error: 'Request rejected.' }, 403);
    await env.PLAYER_DB.prepare('DELETE FROM admin_sessions WHERE session_hash = ?').bind(sessionHash).run();
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(ADMIN_COOKIE, '', 0) });
  }
  if (url.pathname === '/api/admin/players' && request.method === 'GET') {
    const query = (url.searchParams.get('q') || '').trim().slice(0, 80);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    const offset = Math.min(1000000, Math.max(0, Number(url.searchParams.get('offset')) || 0));
    const search = query.toLowerCase();
    const [rows, total] = await Promise.all([
      env.PLAYER_DB.prepare(`
        SELECT player_id, username, name_version, created_at, last_seen_at, banned_at
        FROM players
        WHERE name_version >= ? AND INSTR(LOWER(username), ?) > 0
        ORDER BY username COLLATE NOCASE LIMIT ? OFFSET ?
      `).bind(NAME_VERSION, search, limit, offset).all(),
      env.PLAYER_DB.prepare(`
        SELECT COUNT(*) AS count FROM players
        WHERE name_version >= ? AND INSTR(LOWER(username), ?) > 0
      `).bind(NAME_VERSION, search).first(),
    ]);
    return json({ players: rows.results, total: total.count, limit, offset, nameVersion: NAME_VERSION });
  }
  if (url.pathname === '/api/admin/ban' && request.method === 'POST') {
    if (!sameOrigin(request)) return json({ error: 'Request rejected.' }, 403);
    const body = await bodyJson(request);
    if (typeof body?.playerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.playerId) || typeof body.banned !== 'boolean') {
      return json({ error: 'Choose a valid player.' }, 400);
    }
    const result = await env.PLAYER_DB.prepare(
      'UPDATE players SET banned_at = ? WHERE player_id = ?'
    ).bind(body.banned ? Date.now() : null, body.playerId).run();
    if (!result.meta.changes) return json({ error: 'Player not found.' }, 404);
    return json({ ok: true });
  }
  return json({ error: 'Not found.' }, 404);
}

export async function playerRegistry(request, env) {
  if (!env.PLAYER_DB) return json({ error: 'Player accounts are not configured yet.' }, 503);
  await ensurePlayerSchema(env);
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/admin/')) return adminApi(request, env, url);
  if (url.pathname !== '/api/player/status' && url.pathname !== '/api/player/register') {
    return json({ error: 'Not found.' }, 404);
  }
  if (request.method === 'GET' && url.pathname === '/api/player/status') {
    const { player, headers } = await ensurePlayer(request, env);
    if (!player) return json({ registered: false }, 200, headers);
    if (player.banned_at) return json({ registered: true, banned: true }, 200, headers);
    if (Number(player.name_version) < NAME_VERSION) {
      return json({ registered: false, reset: true }, 200, headers);
    }
    return json({ registered: true, username: player.username }, 200, headers);
  }
  if (request.method === 'POST' && url.pathname === '/api/player/register') {
    if (!sameOrigin(request)) return json({ error: 'Request rejected.' }, 403);
    const body = await bodyJson(request);
    const checked = checkPlayerName(typeof body?.username === 'string' ? body.username : '');
    if (!checked.ok) return json({ error: checked.error }, 400);
    const { id, player, headers } = await ensurePlayer(request, env);
    if (player?.banned_at) return json({ error: 'This player is banned.' }, 403, headers);
    if (player && Number(player.name_version) >= NAME_VERSION) {
      return json({ registered: true, username: player.username }, 200, headers);
    }
    const now = Date.now();
    try {
      if (player) {
        await env.PLAYER_DB.prepare(`
          UPDATE players
          SET previous_username = CASE WHEN username = ? THEN NULL ELSE username END,
              username = ?, name_version = ?, last_seen_at = ?
          WHERE player_id = ?
        `).bind(checked.name, checked.name, NAME_VERSION, now, id).run();
      } else {
        await env.PLAYER_DB.prepare(`
          INSERT INTO players (player_id, username, created_at, last_seen_at, name_version)
          VALUES (?, ?, ?, ?, ?)
        `).bind(id, checked.name, now, now, NAME_VERSION).run();
      }
    } catch (error) {
      if (String(error?.message).includes('UNIQUE constraint failed')) {
        return json({ error: 'That name is already taken. Choose another.' }, 409, headers);
      }
      throw error;
    }
    return json({ registered: true, username: checked.name }, player ? 200 : 201, headers);
  }
  return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
}
