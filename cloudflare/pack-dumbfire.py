"""Package a local Unity WebGL build as Pages-compatible static files.

Usage: python pack-dumbfire.py WEBGL_BUILD_DIR
Requires: python -m pip install brotli
"""
from pathlib import Path
import hashlib
import json
import shutil
import sys

import brotli


def main():
    source = Path(sys.argv[1]).resolve()
    target = Path(__file__).resolve().parent / "public" / "ports" / "dumbfire"
    build = source / "Build"
    compressed = build / "WebGL-preview.data.br"
    if not compressed.is_file():
        raise SystemExit(f"Missing Unity data: {compressed}")
    raw = brotli.decompress(compressed.read_bytes())
    target.mkdir(parents=True, exist_ok=True)
    (target / "Build").mkdir(exist_ok=True)
    part_size = 20 * 1024 * 1024  # Cloudflare Pages limits individual assets to 25 MiB.
    paths = []
    for number, start in enumerate(range(0, len(raw), part_size)):
        name = f"data-{number:02d}.part"
        chunk = raw[start:start + part_size]
        (target / "Build" / name).write_bytes(chunk)
        paths.append(name)
    for name in ("WebGL-preview.loader.js", "WebGL-preview.framework.js.br", "WebGL-preview.wasm.br"):
        shutil.copyfile(build / name, target / "Build" / name)
    shutil.copytree(source / "TemplateData", target / "TemplateData", dirs_exist_ok=True)
    manifest = {"parts": paths, "size": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    (target / "Build" / "data-parts.txt").write_text(json.dumps(manifest), encoding="utf-8")
    print(f"Packaged {len(raw):,} bytes in {len(paths)} parts; sha256 {manifest['sha256']}")


if __name__ == "__main__":
    main()
