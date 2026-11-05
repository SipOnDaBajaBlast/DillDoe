// Poppy Playtime loader.
//
// This host only publishes known file extensions, so the Unity bundles ship as .bin and the 48 MB data
// file ships as three .bin parts (25 MiB per file cap). UnityLoader asks for the original names, so this
// script fetches everything up front and then serves those requests from memory. The .unityweb names are
// deliberate: Unity itself decompresses the LZ4 bundles, and it only does that for URLs ending in .unityweb.
//
// UnityLoader.instantiate runs on window load, which is long before a 48 MB download finishes, so requests
// are intercepted from the moment a download starts rather than only once it is cached: they wait for the
// in-memory bundle instead of hitting the network, where a missing .unityweb file returns the site's HTML
// fallback page and WebAssembly.instantiate dies on "expected magic word".
(function () {
  'use strict';

  var config = window.poppyLoader || {};
  var nativeFetch = window.fetch.bind(window);
  var ready = {};
  var pending = {};
  var failed = {};
  var jobs = [];
  var samples = [];

  // Mutated in place so anything holding window.poppyLoading always reads current numbers.
  var stats = {phase: 'downloading', loaded: 0, total: 0, percent: 0, speed: 0, eta: null, failed: ''};
  window.poppyLoading = stats;

  function fileName(url) {
    var text = String(url || '');
    try { text = decodeURIComponent(text); } catch (e) {}
    return text.split('?')[0].split('#')[0].split('/').pop();
  }

  function isPartRequest(name) {
    return name.indexOf('.part') !== -1;
  }

  function publish() {
    var now = Date.now();
    var loaded = 0;
    var total = 0;
    jobs.forEach(function (job) {
      loaded += job.loaded;
      total += job.size || 0;
    });
    samples.push({at: now, loaded: loaded});
    while (samples.length > 2 && now - samples[0].at > 3000) samples.shift();
    var first = samples[0];
    var elapsed = first ? (now - first.at) / 1000 : 0;
    var speed = elapsed > 0.4 ? Math.max(0, (loaded - first.loaded) / elapsed) : 0;
    stats.loaded = loaded;
    stats.total = total;
    stats.speed = speed;
    stats.percent = total ? Math.min(100, (loaded / total) * 100) : 0;
    stats.eta = speed > 0 && total > loaded ? (total - loaded) / speed : null;
    if (jobs.length && jobs.every(function (job) { return ready[job.key]; })) stats.phase = 'starting';
    if (typeof config.onProgress === 'function') {
      try { config.onProgress(stats); } catch (e) {}
    }
    try { window.dispatchEvent(new CustomEvent('poppy-progress', {detail: stats})); } catch (e) {}
  }

  function showError(message) {
    var box = document.getElementById('poppy-load-error');
    if (!box) {
      box = document.createElement('div');
      box.id = 'poppy-load-error';
      box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;padding:12px 16px;background:#3a1013;color:#ffd9dc;font:14px/1.4 system-ui,sans-serif;z-index:11';
      document.body.appendChild(box);
    }
    box.textContent = 'Game files could not be loaded: ' + message;
  }

  // Streams one file so progress moves while it downloads instead of jumping when it lands.
  function download(url, onBytes) {
    return nativeFetch(url).then(function (response) {
      if (!response.ok) throw new Error(fileName(url) + ' returned HTTP ' + response.status);
      var type = response.headers.get('Content-Type') || '';
      if (/text\/html/i.test(type)) throw new Error(fileName(url) + ' returned a web page instead of game data');
      if (!response.body || typeof response.body.getReader !== 'function') {
        return response.arrayBuffer().then(function (buffer) {
          onBytes(buffer.byteLength);
          return buffer;
        });
      }
      var reader = response.body.getReader();
      var chunks = [];
      var received = 0;
      return (function pump() {
        return reader.read().then(function (result) {
          if (result.done) {
            var merged = new Uint8Array(received);
            var offset = 0;
            chunks.forEach(function (chunk) {
              merged.set(chunk, offset);
              offset += chunk.byteLength;
            });
            return merged.buffer;
          }
          chunks.push(result.value);
          received += result.value.byteLength;
          onBytes(result.value.byteLength);
          return pump();
        });
      }());
    });
  }

  function prefetch(name, urls, expectedSize) {
    var key = fileName(name);
    var job = {key: key, size: expectedSize || 0, loaded: 0};
    jobs.push(job);
    pending[key] = true;
    publish();
    var requests = urls.map(function (url) {
      return download(url, function (bytes) {
        job.loaded += bytes;
        if (!job.size) job.size = job.loaded;
        publish();
      });
    });
    var task = Promise.all(requests).then(function (buffers) {
      var total = 0;
      buffers.forEach(function (buffer) { total += buffer.byteLength; });
      if (expectedSize && total !== expectedSize) {
        throw new Error(name + ' arrived as ' + total + ' bytes, expected ' + expectedSize);
      }
      var merged = new Uint8Array(total);
      var offset = 0;
      buffers.forEach(function (buffer) {
        merged.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      });
      if (!job.size) job.size = total;
      job.loaded = total;
      ready[key] = merged.buffer;
      delete pending[key];
      console.log('[poppy] ' + key + ' ready (' + (total / 1048576).toFixed(2) + ' MB)');
      publish();
    }).catch(function (error) {
      delete pending[key];
      failed[key] = error.message;
      stats.failed = error.message;
      console.error('[poppy] ' + key + ' failed: ' + error.message);
      showError(error.message);
      publish();
    });
    task.catch(function () {});
  }

  function waitFor(key) {
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      (function check() {
        if (Object.prototype.hasOwnProperty.call(ready, key)) return resolve(ready[key]);
        if (failed[key]) return reject(new Error(failed[key]));
        if (Date.now() - started > 300000) return reject(new Error('timed out loading ' + key));
        setTimeout(check, 100);
      }());
    });
  }

  // Intercepts as soon as a download is queued, so Unity waits instead of asking the network for a file
  // the host does not publish.
  function interceptable(url) {
    var key = fileName(url);
    if (!key || isPartRequest(key)) return '';
    if (pending[key] || failed[key] || Object.prototype.hasOwnProperty.call(ready, key)) return key;
    return '';
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url);
    var key = url ? interceptable(url) : '';
    if (!key) return nativeFetch(input, init);
    return waitFor(key).then(function (buffer) {
      return new Response(buffer.slice(0), {status: 200, statusText: 'OK', headers: {'Content-Type': 'application/octet-stream'}});
    });
  };

  var NativeXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    var xhr = new NativeXHR();
    var open = xhr.open;
    var send = xhr.send;
    var url = '';
    xhr.open = function (method, target) {
      url = target;
      return open.apply(xhr, arguments);
    };
    xhr.send = function () {
      var key = interceptable(url);
      if (!key) return send.apply(xhr, arguments);
      waitFor(key).then(function (buffer) {
        Object.defineProperties(xhr, {
          status: {value: 200},
          statusText: {value: 'OK'},
          readyState: {value: 4},
          response: {value: buffer.slice(0)},
          responseType: {value: 'arraybuffer'}
        });
        setTimeout(function () {
          if (xhr.onreadystatechange) xhr.onreadystatechange();
          if (xhr.onload) xhr.onload({type: 'load', target: xhr});
        }, 1);
      }, function (error) {
        if (xhr.onerror) xhr.onerror(error);
      });
    };
    return xhr;
  };

  (config.aliases || []).forEach(function (alias) {
    prefetch(alias.name, [alias.url], alias.size);
  });
  if (config.data && config.data.urls) {
    prefetch(config.data.name, config.data.urls, config.data.size);
  }
}());
