// SwitchRecomp - Copyright 2026 MZ Labs. AGPL-3.0, see LICENSE.txt and NOTICE.txt.
// plays the runtime's PCM16 ring (WebRing in audio.c: u32 rd, wr, beat, size; i16 pcm[size*2]) straight out of the
// shared wasm memory. positions count frames and only grow; the beat tells the runtime someone is listening
class SwrAudio extends AudioWorkletProcessor {
  constructor(opt) { super(); this.mem = opt.processorOptions.memory; this.ptr = opt.processorOptions.ptr; this.buf = null; this.prime = true; }
  views() {
    if (this.buf !== this.mem.buffer) {
      this.buf = this.mem.buffer;
      this.hdr = new Int32Array(this.buf, this.ptr, 4);
      this.size = Atomics.load(this.hdr, 3) || 16384;
      this.pcm = new Int16Array(this.buf, this.ptr + 16, this.size * 2);
    }
  }
  process(inputs, outputs) {
    this.views();
    const L = outputs[0][0], R = outputs[0][1] || outputs[0][0], n = L.length, h = this.hdr;
    Atomics.add(h, 2, 1);
    let rd = Atomics.load(h, 0) >>> 0; const wr = Atomics.load(h, 1) >>> 0;
    let avail = (wr - rd) >>> 0;
    if (this.prime) { if (avail < 2400) { L.fill(0); R.fill(0); return true; } this.prime = false; }   /* 50 ms of slack before starting */
    const k = Math.min(n, avail);
    for (let i = 0; i < k; i++) { const j = ((rd + i) % this.size) * 2; L[i] = this.pcm[j] / 32768; R[i] = this.pcm[j + 1] / 32768; }
    for (let i = k; i < n; i++) { L[i] = 0; R[i] = 0; }
    if (k < n) this.prime = true;   // ran dry: build up some slack again instead of crackling
    Atomics.store(h, 0, (rd + k) | 0);
    return true;
  }
}
registerProcessor('swr-audio', SwrAudio);
