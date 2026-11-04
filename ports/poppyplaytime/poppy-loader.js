// Poppy Playtime loader.
//
// This host only publishes known file extensions, so the Unity bundles ship as .bin and the 48 MB data
// file ships as three .bin parts (25 MiB per file cap). UnityLoader asks for the original names, so this
// script fetches everything up front and then serves those requests from memory. The .unityweb names are
// deliberate: Unity itself decompresses the LZ4 bundles, and it only does that for URLs ending in .unityweb.
(function () {
  'use strict';

  var config = window.poppyLoader || {};
  var nativeFetch = window.fetch.bind(window);
  var ready = {};
  var failed = {};

  function fileName(url) {
    var text = String(url || '');
    try { text = decodeURIComponent(text); } catch (e) {}
    return text.split('?')[0].split('#')[0].split('/').pop();
  }

  function isPartRequest(name) {
    return name.indexOf('.part') !== -1;
  }

  function showError(message) {
    var box = document.getElementById('poppy-load-error');
    if (!box) {
      box = document.createElement('div');
      box.id = 'poppy-load-error';
      box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;padding:12px 16px;background:#3a1013;color:#ffd9dc;font:14px/1.4 system-ui,sans-serif;z-index:9';
      document.body.appendChild(box);
    }
    box.textContent = 'Game files could not be loaded: ' + message;
  }

  function prefetch(name, urls, expectedSize) {
    var key = fileName(name);
    var responses = urls.map(function (url) {
      return nativeFetch(url).then(function (response) {
        if (!response.ok) throw new Error(fileName(url) + ' returned HTTP ' + response.status);
        return response.arrayBuffer();
      });
    });
    Promise.all(responses).then(function (buffers) {
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
      ready[key] = merged.buffer;
      console.log('[poppy] ' + key + ' ready (' + (total / 1048576).toFixed(2) + ' MB)');
    }).catch(function (error) {
      failed[key] = true;
      console.error('[poppy] ' + key + ' failed: ' + error.message);
      showError(error.message);
    });
  }

  function waitFor(key) {
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      (function check() {
        if (Object.prototype.hasOwnProperty.call(ready, key)) return resolve(ready[key]);
        if (failed[key]) return reject(new Error('could not load ' + key));
        if (Date.now() - started > 300000) return reject(new Error('timed out loading ' + key));
        setTimeout(check, 100);
      }());
    });
  }

  function interceptable(url) {
    var key = fileName(url);
    if (!key || isPartRequest(key)) return '';
    return Object.prototype.hasOwnProperty.call(ready, key) || failed[key] ? key : '';
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
    prefetch(alias.name, [alias.url]);
  });
  if (config.data && config.data.urls) {
    prefetch(config.data.name, config.data.urls, config.data.size);
  }
}());
