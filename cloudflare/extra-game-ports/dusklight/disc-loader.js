(function () {
  "use strict";

  const BLOCK_SIZE = 1024 * 1024;
  const MEMORY_LIMIT = 16 * BLOCK_SIZE;
  const DB_NAME = "dusklight-disc";

  function openCache() {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore("p");
        request.onsuccess = () => resolve(request.result);
        request.onerror = request.onblocked = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  function cacheGet(db, key) {
    return new Promise((resolve) => {
      if (!db) return resolve(null);
      try {
        const request = db.transaction("p").objectStore("p").get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  function cachePut(db, key, value) {
    return new Promise((resolve) => {
      if (!db) return resolve(false);
      try {
        const transaction = db.transaction("p", "readwrite");
        transaction.objectStore("p").put(value, key);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = transaction.onabort = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function create(options = {}) {
    const manifestURL = new URL(options.manifest || "disc-manifest.json", document.baseURI);
    const response = await fetch(manifestURL, { cache: "no-cache" });
    if (!response.ok) throw new Error("Could not load disc manifest: HTTP " + response.status);
    const manifest = await response.json();
    if (!manifest.revision || !Array.isArray(manifest.parts) || !manifest.parts.length) {
      throw new Error("Invalid disc manifest");
    }
    let size = 0;
    const parts = manifest.parts.map((part, index) => {
      if (
        !Number.isSafeInteger(part.size) ||
        part.size <= 0 ||
        !/^twilight\.ciso\.part\d+$/.test(part.name)
      ) {
        throw new Error("Invalid disc part " + (index + 1));
      }
      const url = new URL("parts/" + part.name, manifestURL);
      url.searchParams.set("v", manifest.revision);
      const entry = { ...part, index, start: size, url };
      size += part.size;
      return entry;
    });
    const db = await openCache();
    const memory = new Map();
    const wholeParts = new Map();
    const legacyChecked = new Set();
    let memoryBytes = 0;
    let cacheWritable = !!db;
    let closed = false;
    let readQueue = Promise.resolve();
    const stats = {
      size,
      residentBytes: 0,
      peakResidentBytes: 0,
      networkBytes: 0,
      reads: 0,
      cacheHits: 0,
    };

    function remember(key, data) {
      if (closed) return data;
      if (memory.has(key)) memoryBytes -= memory.get(key).byteLength;
      memory.delete(key);
      while (memoryBytes + data.byteLength > MEMORY_LIMIT && memory.size) {
        const oldest = memory.keys().next().value;
        memoryBytes -= memory.get(oldest).byteLength;
        memory.delete(oldest);
      }
      memory.set(key, data);
      memoryBytes += data.byteLength;
      stats.residentBytes = memoryBytes;
      stats.peakResidentBytes = Math.max(stats.peakResidentBytes, memoryBytes);
      return data;
    }

    async function save(key, value) {
      if (cacheWritable && !(await cachePut(db, key, value))) cacheWritable = false;
    }

    function retainPart(index, blob) {
      wholeParts.delete(index);
      wholeParts.set(index, blob);

      while (wholeParts.size > 2) wholeParts.delete(wholeParts.keys().next().value);
      return blob;
    }

    async function getBlock(part, block) {
      const start = block * BLOCK_SIZE;
      const end = Math.min(start + BLOCK_SIZE, part.size);
      const key = manifest.revision + ":" + part.index + ":" + block;
      if (memory.has(key)) {
        const data = memory.get(key);
        memory.delete(key);
        memory.set(key, data);
        stats.cacheHits++;
        return data;
      }
      let blob = await cacheGet(db, key);
      if (blob instanceof Blob && blob.size === end - start) {
        stats.cacheHits++;
        return remember(key, new Uint8Array(await blob.arrayBuffer()));
      }
      let whole = wholeParts.get(part.index);
      if (!whole && !legacyChecked.has(part.index)) {
        legacyChecked.add(part.index);

        if (manifest.legacyCache) {
          const old = await cacheGet(db, "p" + String(part.index + 1).padStart(2, "0"));
          if (old instanceof Blob && old.size === part.size) whole = retainPart(part.index, old);
        }
      }
      if (!whole) {
        const fullKey = manifest.revision + ":part:" + part.index;
        const cached = await cacheGet(db, fullKey);
        if (cached instanceof Blob && cached.size === part.size)
          whole = retainPart(part.index, cached);
        if (!whole) {
          const result = await fetch(part.url, {
            headers: { Range: "bytes=" + start + "-" + (end - 1) },
          });
          if (!result.ok) throw new Error("HTTP " + result.status + " loading " + part.name);
          if (result.status === 206) {
            const expected = "bytes " + start + "-" + (end - 1) + "/" + part.size;
            if (result.headers.get("Content-Range") !== expected) {
              await result.body?.cancel();
              throw new Error("Invalid byte range for " + part.name);
            }
            blob = await result.blob();
            if (blob.size !== end - start) throw new Error("Truncated disc block: " + part.name);
            stats.networkBytes += blob.size;
            await save(key, blob);
            return remember(key, new Uint8Array(await blob.arrayBuffer()));
          }

          whole = await result.blob();
          if (whole.size !== part.size) throw new Error("Incorrect size for " + part.name);
          stats.networkBytes += whole.size;
          retainPart(part.index, whole);
          await save(fullKey, whole);
        }
      }
      return remember(key, new Uint8Array(await whole.slice(start, end).arrayBuffer()));
    }

    async function readAt(position, length) {
      if (closed) throw new Error("Disc is closed");
      if (
        !Number.isSafeInteger(position) ||
        position < 0 ||
        !Number.isSafeInteger(length) ||
        length < 0
      ) {
        throw new Error("Invalid disc read");
      }
      const output = new Uint8Array(Math.max(0, Math.min(length, size - position)));
      let copied = 0;
      stats.reads++;
      while (copied < output.length) {
        const part = parts.find(
          (entry) => position >= entry.start && position < entry.start + entry.size,
        );
        const relative = position - part.start;
        const block = Math.floor(relative / BLOCK_SIZE);
        const bytes = await getBlock(part, block);
        const offset = relative % BLOCK_SIZE;
        const count = Math.min(output.length - copied, bytes.length - offset);
        output.set(bytes.subarray(offset, offset + count), copied);
        copied += count;
        position += count;
      }
      return output;
    }

    function read(position, length) {
      const result = readQueue.then(() => readAt(position, length));
      readQueue = result.catch(() => {});
      return result;
    }

    function mount(FS, path = "/game.ciso") {
      const node = FS.create(path, 0o444);
      node.usedBytes = size;
      node.contents = null;
      const readOnly = () => {
        throw new FS.ErrnoError(63);
      };
      node.node_ops = { ...node.node_ops, setattr: readOnly };
      node.stream_ops = {
        ...node.stream_ops,

        readAsync: (_stream, length, position) => read(position, length),
        read: () => {
          throw new FS.ErrnoError(29);
        },
        write: readOnly,
        allocate: readOnly,
        mmap: () => {
          throw new FS.ErrnoError(43);
        },
        msync: readOnly,
      };
      return node;
    }

    function close() {
      closed = true;
      memory.clear();
      wholeParts.clear();
      memoryBytes = stats.residentBytes = 0;
      db?.close();
    }
    return { read, mount, close, stats };
  }

  globalThis.DuskDisc = { create };
})();
