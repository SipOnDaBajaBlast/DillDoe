(function () {
  "use strict";

  if (typeof window === "undefined") {
    self.addEventListener("install", function () {
      self.skipWaiting();
    });

    self.addEventListener("activate", function (event) {
      event.waitUntil(self.clients.claim());
    });

    self.addEventListener("fetch", function (event) {
      var req = event.request;

      if (req.cache === "only-if-cached" && req.mode !== "same-origin") {
        return;
      }

      event.respondWith(
        fetch(req)
          .then(function (response) {
            if (response.status === 0) {
              return response;
            }

            var headers = new Headers(response.headers);
            headers.set("Cross-Origin-Opener-Policy", "same-origin");
            headers.set("Cross-Origin-Embedder-Policy", "require-corp");
            headers.set("Cross-Origin-Resource-Policy", "cross-origin");

            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: headers,
            });
          })
          .catch(function (err) {
            console.error("coi-serviceworker: fetch failed", err);
          }),
      );
    });

    return;
  }

  if (window.crossOriginIsolated) {
    return;
  }

  if (!window.isSecureContext) {
    console.warn(
      "coi-serviceworker: a secure context (https:// or localhost) is required; skipping.",
    );
    return;
  }

  if (!("serviceWorker" in navigator)) {
    console.warn("coi-serviceworker: Service Workers are not supported in this browser; skipping.");
    return;
  }

  var RELOAD_FLAG = "coiServiceWorkerReloaded";

  window.__coiFixing = true;

  function giveUp(reason) {
    window.__coiFixing = false;
    console.warn("coi-serviceworker: " + reason);
    window.dispatchEvent(new CustomEvent("coi-fix-failed", { detail: { reason: reason } }));
  }

  navigator.serviceWorker
    .register(document.currentScript.src)
    .then(function () {
      return navigator.serviceWorker.ready;
    })
    .then(function () {
      if (sessionStorage.getItem(RELOAD_FLAG) === "1") {
        sessionStorage.removeItem(RELOAD_FLAG);
        giveUp("still not cross-origin isolated after reload; giving up.");
        return;
      }
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    })
    .catch(function (err) {
      giveUp("registration failed: " + err);
    });
})();
