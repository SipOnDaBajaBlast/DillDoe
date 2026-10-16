// Stream an exported asset from its numbered source files without buffering it.
export function splitStream(parts, start, end, read) {
  let offset = 0;
  const selected = [];
  for (const part of parts) {
    if (!Number.isSafeInteger(part.size) || part.size <= 0) throw new Error('Invalid asset part');
    if (start < offset + part.size && end >= offset) {
      selected.push({...part, start: Math.max(0, start - offset), end: Math.min(part.size - 1, end - offset)});
    }
    offset += part.size;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= offset) throw new Error('Invalid split asset range');
  let index = 0, reader = null, remaining = 0, cancelled = false;
  return new ReadableStream({
    async pull(controller) {
      try {
        while (!cancelled) {
          if (!reader) {
            if (index === selected.length) { controller.close(); return; }
            const part = selected[index++];
            const body = await read(part.path, part.start, part.end, part.size);
            if (cancelled) { await body.cancel(); return; }
            reader = body.getReader();
            remaining = part.end - part.start + 1;
          }
          const chunk = await reader.read();
          if (cancelled) return;
          if (chunk.done || chunk.value.byteLength > remaining) throw new Error('Incomplete or oversized asset part');
          remaining -= chunk.value.byteLength;
          controller.enqueue(chunk.value);
          if (remaining === 0) { await reader.cancel(); reader = null; }
          return;
        }
      } catch (error) {
        await reader?.cancel().catch(() => {});
        if (!cancelled) controller.error(error);
      }
    },
    cancel(reason) { cancelled = true; return reader?.cancel(reason); },
  });
}
