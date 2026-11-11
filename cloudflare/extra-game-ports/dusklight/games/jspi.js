/* JSPI fallback for browsers without WebAssembly.Suspending (iOS < 27 etc).
   Games load a binaryen --asyncify build of their wasm and this file fakes
   Suspending/promising on top of asyncify_start_unwind/rewind.
   Config (set before this script): self.JSPI_SHIM = { wasm: { "app.wasm": "app.async.wasm" }, stack: 1 << 20 }
   Testing on desktop: add ?nojspi to the game url or localStorage.nojspi = "1". */
(function () {
  var G = typeof globalThis != "undefined" ? globalThis : self;
  if (G.__jspiShim) return;
  var W = G.WebAssembly;
  if (!W) return;
  var cfg = G.JSPI_SHIM || (G.JSPI_SHIM = {});
  var native = typeof W.Suspending == "function" && typeof W.promising == "function";
  var isWorker = typeof document == "undefined";
  var forced = false;
  try {
    forced = /[?&]nojspi\b/.test(G.location.search) || /nojspi/.test(G.location.hash) || G.localStorage.getItem("nojspi") == "1";
  } catch (e) {}
  try {
    if (!forced && !isWorker && G.parent !== G) forced = /[?&]nojspi\b/.test(G.top.location.search) || G.top.localStorage.getItem("nojspi") == "1";
  } catch (e) {}
  var shim = (G.__jspiShim = { active: false, native: native, install: install, needed: !native || forced });

  var nativeInstantiate = W.instantiate, nativeStreaming = W.instantiateStreaming, NativeInstance = W.Instance;
  var MARK = typeof Symbol == "function" ? Symbol("jspi") : "__jspi";
  var ctxs = [], byFn = new WeakMap();

  function Suspending(fn) {
    if (!(this instanceof Suspending)) throw new TypeError("WebAssembly.Suspending must be called with new");
    if (typeof fn != "function") throw new TypeError("WebAssembly.Suspending: argument must be a function");
    this[MARK] = fn;
  }
  function SuspendError(msg) {
    var e = new Error(msg || "trying to suspend without WebAssembly.promising");
    e.name = "SuspendError";
    return e;
  }

  function dummy(name) {
    return /^invoke_j/.test(name) || (cfg.i64 && cfg.i64.indexOf(name) >= 0) ? BigInt(0) : 0;
  }

  function makeCtx() {
    var ctx = { exp: null, mem: null, pool: [], active: null, depth: 0, rewind: null };
    ctxs.push(ctx);
    return ctx;
  }

  function stub(ctx, fn, name) {
    return function () {
      var e = ctx.exp;
      if (!e) return fn.apply(this, arguments);
      if (e.asyncify_get_state() === 2) {
        ctx.depth++;
        try {
          var rw = ctx.rewind;
          if (rw && ctx.depth === rw.depth) {
            e.asyncify_stop_rewind();
            ctx.rewind = null;
            if (rw.failed) throw rw.error;
            return rw.value;
          }
          return fn.apply(this, arguments);
        } finally {
          ctx.depth--;
        }
      }
      var res;
      ctx.depth++;
      try {
        res = fn.apply(this, arguments);
      } finally {
        ctx.depth--;
      }
      if (e.asyncify_get_state() === 1) return dummy(name);
      if (!res || typeof res.then != "function") return res;
      var call = ctx.active;
      if (!call) throw SuspendError();
      call.pending = res;
      call.at = ctx.depth + 1 - call.base;
      var p = call.data, v = new Int32Array(ctx.mem.buffer, p, 2);
      v[0] = p + 8;
      v[1] = p + call.size;
      e.asyncify_start_unwind(p);
      return dummy(name);
    };
  }

  function wrapImports(imports) {
    if (!imports) return { imports: imports, ctx: null };
    var ctx = null, mem = null, out = {};
    for (var mod in imports) {
      var ns = imports[mod], copy = ns;
      if (ns && typeof ns == "object") {
        for (var k in ns) {
          var v = ns[k];
          if (v instanceof W.Memory) mem = v;
          if (v instanceof Suspending) {
            if (copy === ns) {
              copy = {};
              for (var k2 in ns) copy[k2] = ns[k2];
            }
            ctx = ctx || makeCtx();
            copy[k] = stub(ctx, v[MARK], k);
          }
        }
      }
      out[mod] = copy;
    }
    if (ctx) ctx.mem = mem;
    return { imports: ctx ? out : imports, ctx: ctx };
  }

  function bind(ctx, instance) {
    var e = instance.exports;
    if (typeof e.asyncify_start_unwind != "function") {
      if (ctx) console.warn("[jspi] module has Suspending imports but no asyncify exports, it needs an asyncified build");
      return;
    }
    ctx = ctx || makeCtx();
    ctx.exp = e;
    for (var k in e) {
      var v = e[k];
      if (!ctx.mem && v instanceof W.Memory) ctx.mem = v;
      if (typeof v == "function") byFn.set(v, ctx);
    }
    if (!ctx.mem && cfg.memory) ctx.mem = cfg.memory;
    ctx.malloc = e[cfg.malloc || "malloc"] || e.emscripten_builtin_malloc || e._malloc;
    ctx.free = e[cfg.free || "free"] || e.emscripten_builtin_free || e._free;
  }

  function findCtx(fn) {
    var c = byFn.get(fn);
    if (c) return c;
    for (var i = ctxs.length - 1; i >= 0; i--) if (ctxs[i].exp) return ctxs[i];
    return null;
  }

  function alloc(ctx) {
    var size = cfg.stack || 1 << 20;
    if (ctx.pool.length) return ctx.pool.pop();
    if (!ctx.malloc) throw new Error("[jspi] no malloc export, set JSPI_SHIM.malloc");
    var p = ctx.malloc(size) >>> 0;
    if (!p) throw new Error("[jspi] out of memory for asyncify stack");
    return { data: p, size: size };
  }

  function promising(fn) {
    if (typeof fn != "function") throw new TypeError("WebAssembly.promising: argument must be a function");
    return function () {
      var self = this, args = arguments;
      var ctx = findCtx(fn);
      if (!ctx || !ctx.exp) {
        try {
          return Promise.resolve(fn.apply(self, args));
        } catch (err) {
          return Promise.reject(err);
        }
      }
      var e = ctx.exp, buf = alloc(ctx);
      var call = { data: buf.data, size: buf.size, pending: null, at: 0, base: 0 };
      function run() {
        var prev = ctx.active;
        ctx.active = call;
        call.base = ctx.depth;
        try {
          var r = fn.apply(self, args);
          if (e.asyncify_get_state() === 1) {
            e.asyncify_stop_unwind();
            return { wait: call.pending };
          }
          return { done: r };
        } finally {
          ctx.active = prev;
        }
      }
      function release() {
        ctx.pool.push(buf);
      }
      function step(state) {
        if (!("wait" in state)) {
          release();
          return state.done;
        }
        var p = state.wait;
        call.pending = null;
        var at = call.at;
        return Promise.resolve(p).then(
          function (value) {
            return resume({ value: value }, at);
          },
          function (error) {
            return resume({ failed: true, error: error }, at);
          },
        );
      }
      function resume(rw, at) {
        rw.depth = ctx.depth + at;
        ctx.rewind = rw;
        e.asyncify_start_rewind(call.data);
        var state;
        try {
          state = run();
        } catch (err) {
          ctx.rewind = null;
          release();
          throw err;
        }
        return step(state);
      }
      try {
        return Promise.resolve(step(run()));
      } catch (err) {
        release();
        return Promise.reject(err);
      }
    };
  }

  function Instance(module, imports) {
    var w = wrapImports(imports);
    var inst = new NativeInstance(module, w.imports);
    bind(w.ctx, inst);
    return inst;
  }
  Instance.prototype = NativeInstance.prototype;

  function instantiate(src, imports) {
    var w = wrapImports(imports);
    return nativeInstantiate.call(W, src, w.imports).then(function (r) {
      bind(w.ctx, r instanceof NativeInstance ? r : r.instance);
      return r;
    });
  }

  function instantiateStreaming(resp, imports) {
    var w = wrapImports(imports);
    var go = nativeStreaming
      ? nativeStreaming.call(W, resp, w.imports)
      : Promise.resolve(resp)
          .then(function (r) {
            return r.arrayBuffer();
          })
          .then(function (b) {
            return nativeInstantiate.call(W, b, w.imports);
          });
    return go.then(function (r) {
      bind(w.ctx, r.instance);
      return r;
    });
  }

  function swapUrl(url) {
    var map = cfg.wasm;
    if (!map || url == null) return url;
    var s = String(url), q = s.search(/[?#]/), path = q < 0 ? s : s.slice(0, q), rest = q < 0 ? "" : s.slice(q);
    for (var k in map) {
      if (path === k || path.slice(-k.length - 1) === "/" + k) return path.slice(0, path.length - k.length) + map[k] + rest;
    }
    return url;
  }

  function hookFetch() {
    if (G.fetch) {
      var f = G.fetch;
      G.fetch = function (input, init) {
        if (typeof input == "string" || input instanceof URL) {
          var s = swapUrl(String(input));
          if (s !== String(input)) input = s;
        } else if (input && input.url) {
          var u = swapUrl(input.url);
          if (u !== input.url) input = new Request(u, input);
        }
        return f.call(this, input, init);
      };
    }
    if (G.XMLHttpRequest) {
      var open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (m, url) {
        var a = Array.prototype.slice.call(arguments);
        a[1] = swapUrl(url);
        return open.apply(this, a);
      };
    }
  }

  function hookWorkers() {
    if (!forced || !G.Worker) return;
    var NW = G.Worker;
    var Wrapped = function (url, opts) {
      if (typeof url == "string" && url.indexOf("#") < 0) url += "#nojspi";
      else if (url instanceof URL && !url.hash) (url = new URL(url)), (url.hash = "nojspi");
      var w = new NW(url, opts);
      try {
        w.postMessage({ __jspiForce: 1 });
      } catch (e) {}
      return w;
    };
    Wrapped.prototype = NW.prototype;
    G.Worker = Wrapped;
  }

  function install() {
    if (shim.active) return;
    shim.active = true;
    W.Suspending = Suspending;
    W.promising = promising;
    W.Instance = Instance;
    W.instantiate = instantiate;
    W.instantiateStreaming = instantiateStreaming;
    if (!W.SuspendError) W.SuspendError = SuspendError;
    hookFetch();
    hookWorkers();
    console.log("[jspi] using asyncify fallback" + (native ? " (forced)" : "") + (isWorker ? " in worker" : ""));
  }

  function record() {
    var seen = (shim.recorded = shim.recorded || []);
    function scan(imports, src) {
      var names = [];
      for (var mod in imports || {}) for (var k in imports[mod]) if (imports[mod][k] instanceof W.Suspending) names.push(mod + "." + k);
      if (!names.length) return;
      var key = names.sort().join(",");
      if (seen.indexOf(key) >= 0) return;
      seen.push(key);
      console.log("[jspi] suspending imports" + (src ? " for " + src : "") + ": " + JSON.stringify(names));
    }
    W.instantiate = function (s, i) {
      scan(i);
      return nativeInstantiate.apply(W, arguments);
    };
    W.instantiateStreaming = function (r, i) {
      Promise.resolve(r).then(function (x) {
        scan(i, x && x.url);
      });
      return nativeStreaming.apply(W, arguments);
    };
  }

  var rec = false;
  try {
    rec = /[?&]jspirecord\b/.test(G.location.search) || G.localStorage.getItem("jspirecord") == "1";
  } catch (e) {}
  if (shim.needed) install();
  else if (rec) record();
  if (!shim.needed && isWorker)
    G.addEventListener(
      "message",
      function (ev) {
        if (ev.data && ev.data.__jspiForce) {
          ev.stopImmediatePropagation();
          install();
        }
      },
      true,
    );
})();
