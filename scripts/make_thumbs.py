"""Downscale source photos into GPU-friendly thumbnails + a manifest.

EXIF is read while the original is open, so the gallery can show real shooting
parameters instead of placeholders.

Usage:
    python scripts/make_thumbs.py
    python scripts/make_thumbs.py --src 素材 --out public/assets/thumbs --max 1600
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps
from PIL.ExifTags import TAGS

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = ROOT / "素材"
DEFAULT_OUT = ROOT / "public" / "assets" / "thumbs"
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


def rational(value) -> float | None:
    try:
        if isinstance(value, tuple) and len(value) == 2:
            return value[0] / value[1] if value[1] else None
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def exif_metadata(im: Image.Image) -> dict:
    raw = im.getexif()
    if not raw:
        return {}
    tags = {TAGS.get(key, key): value for key, value in raw.items()}
    exif_ifd = raw.get_ifd(0x8769) if hasattr(raw, "get_ifd") else {}
    for key, value in exif_ifd.items():
        tags[TAGS.get(key, key)] = value

    meta: dict = {}
    description = tags.get("ImageDescription")
    if isinstance(description, str) and description.strip():
        meta["description"] = description.strip()

    make = tags.get("Make")
    model = tags.get("Model")
    if isinstance(make, str) and make.strip():
        meta["make"] = make.strip()
    if isinstance(model, str) and model.strip():
        meta["model"] = model.strip()

    date = tags.get("DateTimeOriginal") or tags.get("DateTime")
    if isinstance(date, str) and len(date) >= 10:
        meta["date"] = date[:10].replace(":", "-", 2).replace(":", "-")

    f_number = rational(tags.get("FNumber"))
    if f_number:
        meta["fNumber"] = f"{f_number:g}"

    exposure = rational(tags.get("ExposureTime"))
    if exposure:
        meta["exposure"] = f"{exposure:g}" if exposure >= 1 else f"1/{round(1 / exposure)}"

    iso = tags.get("ISOSpeedRatings") or tags.get("PhotographicSensitivity")
    if isinstance(iso, (list, tuple)):
        iso = iso[0] if iso else None
    if iso:
        meta["iso"] = str(iso)

    focal = rational(tags.get("FocalLength"))
    if focal:
        meta["focalLength"] = f"{focal:g}"

    return meta


def build(src: Path, out: Path, max_edge: int) -> None:
    if max_edge < 1:
        raise SystemExit("--max must be a positive integer")
    files = sorted(p for p in src.iterdir() if p.is_file() and p.suffix.lower() in EXTS)
    if not files:
        raise SystemExit(f"No images found in {src}")

    catalog_path = out / "artworks.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    order = catalog["order"]
    artworks = catalog["artworks"]
    names = [path.name for path in files]
    if (not isinstance(order, list) or not all(isinstance(name, str) for name in order)
            or len(order) != len(set(order)) or set(order) != set(names)
            or not isinstance(artworks, dict) or set(artworks) != set(names)):
        raise SystemExit("artworks.json must list every source image exactly once in order and artworks")
    for name in order:
        entry = artworks[name]
        if not isinstance(entry, dict) or not all(
            isinstance(entry.get(key), str) and entry[key].strip()
            for key in ("title", "description", "rationale")
        ):
            raise SystemExit(f"Missing title, description or rationale in artworks.json: {name}")
    files = [src / name for name in order]
    out.mkdir(parents=True, exist_ok=True)

    manifest = []
    for i, path in enumerate(files, start=1):
        with Image.open(path) as im:
            meta = exif_metadata(im)
            im = ImageOps.exif_transpose(im)
            if im.mode != "RGB":
                im = im.convert("RGB")
            w, h = im.size
            scale = min(1.0, max_edge / max(w, h))
            if scale < 1.0:
                nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
                im = im.resize((nw, nh), Image.LANCZOS)
            else:
                nw, nh = w, h
            thumb = f"photo_{i:02d}.jpg"
            im.save(out / thumb, "JPEG", quality=82, optimize=True, progressive=True)
            entry = {"thumb": thumb, "w": nw, "h": nh, "src": path.name}
            entry.update(meta)
            manifest.append(entry)
            print(f"  {path.name} -> {thumb}  ({nw}x{nh})  {meta.get('date', '')}")

    (out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nDone: {len(manifest)} thumbnails + manifest.json -> {out}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Downscale gallery photos.")
    ap.add_argument("--src", default=str(DEFAULT_SRC))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--max", type=int, default=1600, dest="max_edge")
    args = ap.parse_args()
    build(Path(args.src), Path(args.out), args.max_edge)


if __name__ == "__main__":
    main()
