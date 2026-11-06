#!/usr/bin/env python3
"""Raise the WebAssembly memory ceiling of gecko's browser core.

The upstream/CubeDeck build declares `max 8192 pages` (512 MiB) in its memory
section. That ceiling is only a number in the module header, so it can be
rewritten without a Rust toolchain. With it raised, the core can hold a
compressed disc image: a 1.03 GiB Wind Waker RVZ boots (measured ~10 fps,
~18% of full speed, no audio).

    python patch-memory-limit.py web_bg.wasm web_bg_4g.wasm

The module is otherwise byte-identical to the vendored build; this script is
part of the corresponding-source record for the binary served from
/ports/gamecube-homebrew/gecko/.
"""
import sys


def read_leb(data, i):
    shift = value = 0
    while True:
        byte = data[i]
        i += 1
        value |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return value, i
        shift += 7


def write_leb(value):
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        if value:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)


TARGET_PAGES = 65536  # 4 GiB in 64 KiB pages


def patch(data):
    if data[:4] != b"\x00asm":
        raise SystemExit("not a wasm module")
    out = bytearray(data[:8])
    pos, patched = 8, False
    while pos < len(data):
        section_id = data[pos]
        pos += 1
        size, after_size = read_leb(data, pos)
        body = data[after_size:after_size + size]
        if section_id == 5:  # memory section
            i = 0
            count, i = read_leb(body, i)
            rebuilt = bytearray(write_leb(count))
            for _ in range(count):
                flags, i = read_leb(body, i)
                minimum, i = read_leb(body, i)
                maximum = None
                if flags & 1:
                    maximum, i = read_leb(body, i)
                rebuilt += write_leb(flags) + write_leb(minimum)
                if maximum is not None:
                    print(f"memory max {maximum} pages ({maximum * 65536 / 2**20:.0f} MiB)"
                          f" -> {TARGET_PAGES} pages ({TARGET_PAGES * 65536 / 2**30:.0f} GiB)")
                    rebuilt += write_leb(TARGET_PAGES)
                    patched = True
            out += bytes([section_id]) + write_leb(len(rebuilt)) + bytes(rebuilt)
        else:
            out += bytes([section_id]) + write_leb(size) + body
        pos = after_size + size
    if not patched:
        raise SystemExit("no maximum found in the memory section")
    return bytes(out)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    with open(sys.argv[1], "rb") as handle:
        patched = patch(handle.read())
    with open(sys.argv[2], "wb") as handle:
        handle.write(patched)
    print(f"wrote {sys.argv[2]} ({len(patched):,} bytes)")
