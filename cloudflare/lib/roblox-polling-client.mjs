/* Browser-side WebSocket shim for the D1 relay.
 *
 * The March 2007 port already speaks a tiny JSON protocol over a WebSocket
 * URL. Pages Functions cannot keep a WebSocket room in memory across
 * isolates, so this shim replaces only the relay WebSocket with long-polling
 * HTTP. The rest of the port keeps its existing WebSocket-shaped session.
 */
export const POLLING_RELAY_CLIENT = String.raw`(function () {
  'use strict';
  var Native = window.WebSocket;
  if (!Native) return;

  // The port patches window.fetch to remap its virtual asset paths, which also
  // rewrites /relay requests. Use a blank same-origin frame's untouched fetch
  // (or the untouched window.fetch when it is still native).
  var relayFetchImpl = null;
  var relayAbortFactory = null;

  function isNative(fn) {
    try { return /\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(fn)); }
    catch (_) { return false; }
  }

  function useWindowFetch() {
    relayFetchImpl = function (input, init) { return window.fetch(input, init); };
    relayAbortFactory = function () { return new AbortController(); };
    return relayFetchImpl;
  }

  function ensureRelayFetch() {
    if (relayFetchImpl) return relayFetchImpl;
    if (typeof window.fetch === 'function' && isNative(window.fetch)) return useWindowFetch();
    // A hidden frame normally gives us an unpatched fetch, but a page CSP that
    // blocks frame-src (or a browser that refuses about:blank frames) makes
    // that impossible. Fall back to window.fetch: the relay URLs are absolute,
    // and the port only remaps root-relative paths, so they still reach us.
    try {
      var frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
      frame.src = 'about:blank';
      (document.body || document.documentElement).appendChild(frame);
      var frameWindow = frame.contentWindow;
      if (!frameWindow || typeof frameWindow.fetch !== 'function') throw new Error('No frame fetch');
      var frameFetch = frameWindow.fetch.bind(frameWindow);
      relayFetchImpl = frameFetch;
      relayAbortFactory = function () { return new frameWindow.AbortController(); };
      return relayFetchImpl;
    } catch (_) {
      return useWindowFetch();
    }
  }

  function newRelayAbortController() {
    ensureRelayFetch();
    return relayAbortFactory();
  }

  var OPEN = 1;
  var CONNECTING = 0;
  var CLOSING = 2;
  var CLOSED = 3;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function relayHttpBase(url) {
    // The game page carries a <base> tag, so every relay request needs an
    // absolute origin. A relative '/relay/...' fetch would resolve under the
    // port's directory and hit a static 405 instead of the relay worker.
    var parsed = new URL(url, location.href);
    return parsed.origin.replace(/^ws/, 'http') + '/relay';
  }

  function PollingSocket(url) {
    var parsed;
    try {
      parsed = new URL(url, location.href);
    } catch (_) {
      throw new Error('Invalid relay URL');
    }
    this.url = String(url);
    this.readyState = CONNECTING;
    this.bufferedAmount = 0;
    this.extensions = '';
    this.protocol = '';
    this.binaryType = 'blob';
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;

    this._base = relayHttpBase(url);
    this._mode = parsed.searchParams.get('mode') || '';
    this._name = parsed.searchParams.get('name') || 'Player';
    this._place = parsed.searchParams.get('place') || '';
    this._roomCode = parsed.searchParams.get('room') || '';
    this._token = '';
    this._self = '';
    this._host = '';
    this._lastSeq = 0;
    this._lastRoster = '';
    this._pending = [];
    this._latest = new Map();
    this._flushTimer = null;
    this._flushing = false;
    this._closed = false;
    this._hostGone = false;
    this._failures = 0;
    this._pollAbort = null;
    this._listeners = {};

    var self = this;
    setTimeout(function () { self._connect(); }, 0);
  }

  PollingSocket.CONNECTING = CONNECTING;
  PollingSocket.OPEN = OPEN;
  PollingSocket.CLOSING = CLOSING;
  PollingSocket.CLOSED = CLOSED;

  PollingSocket.prototype.addEventListener = function (name, fn) {
    if (typeof fn !== 'function') return;
    (this._listeners[name] || (this._listeners[name] = [])).push(fn);
  };

  PollingSocket.prototype.removeEventListener = function (name, fn) {
    var list = this._listeners[name];
    if (!list) return;
    var at = list.indexOf(fn);
    if (at >= 0) list.splice(at, 1);
  };

  PollingSocket.prototype._fire = function (name, event) {
    var fn = this['on' + name];
    if (typeof fn === 'function') {
      try { fn.call(this, event || {}); } catch (error) { setTimeout(function () { throw error; }, 0); }
    }
    var list = this._listeners[name];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i].call(this, event || {}); } catch (error) { setTimeout(function () { throw error; }, 0); }
    }
  };

  PollingSocket.prototype._emit = function (message) {
    if (this.readyState !== OPEN || this._closed) return;
    var text;
    try { text = JSON.stringify(message); } catch (_) { return; }
    this._fire('message', { data: text });
  };

  PollingSocket.prototype._emitError = function (message) {
    this._fire('error', { message: message || 'Relay connection failed' });
  };

  PollingSocket.prototype._connect = async function () {
    if (this._closed) return;
    // One dropped request should not end the session. Retry transport errors
    // and 5xx answers; a real 4xx (room not found, room full) is final.
    var attempts = 3;
    for (var attempt = 1; attempt <= attempts; attempt++) {
      try {
        var response = await ensureRelayFetch()(this._base + '/session', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: this._mode,
            name: this._name,
            place: this._place,
            room: this._roomCode
          })
        });
        var data = null;
        try { data = await response.json(); } catch (_) { data = null; }
        if (this._closed) return;
        if (!response.ok) {
          if (response.status >= 500 && attempt < attempts) {
            await sleep(350 * attempt);
            continue;
          }
          this._emitError(data && data.error || ('Relay HTTP ' + response.status));
          this._shutdown(1008);
          return;
        }
        if (!data || data.t !== 'welcome') {
          this._emitError(data && data.error || 'Unexpected relay response');
          this._shutdown(1008);
          return;
        }
        this._token = String(data.token || '');
        this._self = String(data.self || '');
        this._host = String(data.host || '');
        this.readyState = OPEN;
        this._fire('open', {});
        this._lastRoster = JSON.stringify(data.players || []);
        this._emit(data);
        this._poll();
        return;
      } catch (error) {
        if (this._closed) return;
        if (attempt < attempts) {
          await sleep(350 * attempt);
          continue;
        }
        this._emitError(error && error.message || 'Could not reach the relay');
        this._shutdown(1006);
      }
    }
  };

  PollingSocket.prototype._poll = async function () {
    while (this.readyState === OPEN && !this._closed && !this._hostGone) {
      var response;
      var timer = null;
      try {
        this._pollAbort = newRelayAbortController();
        timer = setTimeout(function () {
          try { this._pollAbort.abort(); } catch (_) { /* already done */ }
        }.bind(this), 12000);
        response = await ensureRelayFetch()(
          this._base + '/poll?token=' + encodeURIComponent(this._token) +
            '&after=' + encodeURIComponent(String(this._lastSeq)),
          { cache: 'no-store', signal: this._pollAbort.signal }
        );
        if (timer) { clearTimeout(timer); timer = null; }
        if (this._closed) return;
        if (response.status === 410) {
          this._emit({ t: 'hostLeft' });
          this._hostGone = true;
          return;
        }
        if (!response.ok) throw new Error('Relay HTTP ' + response.status);
        var data = await response.json();
        if (!data || data.v !== 1) throw new Error('Bad relay response');
        if (data.hostLeft) {
          this._emit({ t: 'hostLeft' });
          this._hostGone = true;
          return;
        }
        this._failures = 0;
        var roster = JSON.stringify(data.players || []);
        if (roster && roster !== this._lastRoster) {
          this._lastRoster = roster;
          this._emit({ t: 'roster', players: data.players });
        }
        if (typeof data.seq === 'number' && data.seq > this._lastSeq) this._lastSeq = data.seq;
        var messages = Array.isArray(data.messages) ? data.messages : [];
        for (var i = 0; i < messages.length; i++) this._emit(messages[i]);
      } catch (error) {
        if (timer) clearTimeout(timer);
        if (this._closed) return;
        this._failures++;
        if (this._failures >= 3) {
          this._emitError(error && error.message || 'Relay disconnected');
          this._shutdown(1006);
          return;
        }
        await sleep(500);
      } finally {
        this._pollAbort = null;
      }
    }
  };

  PollingSocket.prototype._scheduleFlush = function () {
    if (this._flushTimer || this._closed || this.readyState !== OPEN) return;
    var self = this;
    this._flushTimer = setTimeout(function () {
      self._flushTimer = null;
      self._flush();
    }, 100);
  };

  PollingSocket.prototype.send = function (data) {
    if (this.readyState !== OPEN || this._closed || typeof data !== 'string') return;
    var message;
    try { message = JSON.parse(data); } catch (_) { return; }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return;

    var key = '';
    if (message.t === 'state' && message.to === 'all' &&
        message.d && message.d.k === 's') {
      key = 'snapshot';
    } else if (message.t === 'cmd' && message.d && message.d.k === 'i') {
      key = 'input';
    }
    if (key) this._latest.set(key, message);
    else {
      this._pending.push(message);
      if (this._pending.length > 48) this._pending.splice(0, this._pending.length - 48);
    }
    this._scheduleFlush();
  };

  PollingSocket.prototype._flush = async function () {
    if (this._flushing || this._closed || this.readyState !== OPEN || !this._token) return;
    this._flushing = true;
    var batch = [];
    for (var value of this._latest.values()) batch.push(value);
    this._latest.clear();
    while (this._pending.length && batch.length < 64) batch.push(this._pending.shift());
    if (!batch.length) {
      this._flushing = false;
      return;
    }
    try {
      var response = await ensureRelayFetch()(this._base + '/send', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this._token, batch: batch })
      });
      if (!response.ok && response.status !== 410) throw new Error('Relay HTTP ' + response.status);
    } catch (_) {
      if (!this._closed) {
        var reliable = batch.filter(function (message) {
          return !(message.t === 'state' && message.d && message.d.k === 's') &&
                 !(message.t === 'cmd' && message.d && message.d.k === 'i');
        });
        this._pending = reliable.concat(this._pending).slice(-48);
      }
    } finally {
      this._flushing = false;
      if (this._pending.length || this._latest.size) this._scheduleFlush();
    }
  };

  PollingSocket.prototype.close = function (code, reason) {
    if (this.readyState === CLOSING || this.readyState === CLOSED) return;
    this.readyState = CLOSING;
    this._closed = true;
    this._hostGone = true;
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    if (this._pollAbort) {
      try { this._pollAbort.abort(); } catch (_) { /* already done */ }
    }
    var self = this;
    var payload = JSON.stringify({ token: this._token });
    try {
      if (!this._token) {
        /* Nothing to leave. */
      } else if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'application/json' });
        if (!navigator.sendBeacon(this._base + '/leave', blob)) {
          ensureRelayFetch()(this._base + '/leave', {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: payload
          }).catch(function () {});
        }
      } else {
        fetch(this._base + '/leave', {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: payload
        }).catch(function () {});
      }
    } catch (_) { /* best effort */ }
    setTimeout(function () {
      self.readyState = CLOSED;
      self._fire('close', { code: code || 1000, reason: reason || '' });
    }, 0);
  };

  PollingSocket.prototype._shutdown = function (code) {
    if (this._closed) return;
    this.readyState = CLOSED;
    this._closed = true;
    this._hostGone = true;
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    if (this._pollAbort) {
      try { this._pollAbort.abort(); } catch (_) { /* already done */ }
    }
    var self = this;
    setTimeout(function () { self._fire('close', { code: code || 1006, reason: '' }); }, 0);
  };

  function RelayWebSocket(url, protocols) {
    var parsed;
    try { parsed = new URL(String(url), location.href); } catch (_) { parsed = null; }
    if (parsed && parsed.pathname === '/relay/play') return new PollingSocket(String(url));
    return protocols === undefined ? new Native(url) : new Native(url, protocols);
  }
  RelayWebSocket.prototype = Native.prototype;
  RelayWebSocket.CONNECTING = CONNECTING;
  RelayWebSocket.OPEN = OPEN;
  RelayWebSocket.CLOSING = CLOSING;
  RelayWebSocket.CLOSED = CLOSED;
  window.WebSocket = RelayWebSocket;
})();`;
