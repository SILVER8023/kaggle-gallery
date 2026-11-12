"""Read metadata from matching originals without copying or modifying image files.

Usage:
    python scripts/import_exif.py --src /path/to/originals

The source folder must contain exactly the filenames in the gallery manifest.
Only EXIF shooting fields are updated; thumbnail dimensions, order, and captions stay intact.
"""
from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path

from PIL import Image

from make_thumbs import DEFAULT_OUT, exif_metadata

SHOOTING_KEYS = ("make", "model", "date", "fNumber", "exposure", "iso", "focalLength")


def import_exif(src: Path, manifest_path: Path) -> int:
    if not src.is_dir():
        raise SystemExit(f"Original image directory does not exist: {src}")
    if not manifest_path.is_file():
        raise SystemExit(f"Gallery manifest does not exist: {manifest_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, list) or not manifest:
        raise SystemExit("Gallery manifest must be a non-empty list")
    names = [item.get("src") for item in manifest if isinstance(item, dict)]
    if len(names) != len(manifest) or not all(isinstance(name, str) for name in names):
        raise SystemExit("Every manifest entry must have a source filename")
    if len(names) != len(set(names)) or any(Path(name).name != name for name in names):
        raise SystemExit("Manifest source filenames must be unique basenames")

    originals = {p.name: p for p in src.iterdir() if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg"}}
    if set(originals) != set(names):
        missing = sorted(set(names) - set(originals))
        extra = sorted(set(originals) - set(names))
        raise SystemExit(f"Original filenames do not match manifest; missing={missing}, extra={extra}")

    updated = []
    for item in manifest:
        name = item["src"]
        with Image.open(originals[name]) as image:
            meta = exif_metadata(image)
        if not all(meta.get(key) for key in SHOOTING_KEYS):
            missing = [key for key in SHOOTING_KEYS if not meta.get(key)]
            raise SystemExit(f"Incomplete EXIF for {name}: {', '.join(missing)}")
        entry = {key: value for key, value in item.items() if key not in SHOOTING_KEYS}
        entry.update({key: meta[key] for key in SHOOTING_KEYS})
        updated.append(entry)
        print(f"{name}: {meta['date']} · {meta['model']} · {meta['focalLength']}mm · f/{meta['fNumber']} · {meta['exposure']}s · ISO {meta['iso']}")

    payload = json.dumps(updated, ensure_ascii=False, indent=2) + "\n"
    fd, temporary = tempfile.mkstemp(prefix=".manifest-exif-", suffix=".json", dir=manifest_path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
        os.replace(temporary, manifest_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return len(updated)


def main() -> None:
    parser = argparse.ArgumentParser(description="Read original EXIF into the existing gallery manifest.")
    parser.add_argument("--src", required=True, type=Path, help="Read-only folder containing original JPEG files")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_OUT / "manifest.json")
    args = parser.parse_args()
    count = import_exif(args.src, args.manifest)
    print(f"Updated {count} manifest entries; image files were not copied or changed.")


if __name__ == "__main__":
    main()
