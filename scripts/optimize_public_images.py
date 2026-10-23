#!/usr/bin/env python3
"""Generate WebP display copies for public images referenced by frontend/index.html.

Original image files remain untouched. The HTML points `src` to a lightweight preview
and retains the original path in `data-full-src` for gallery enlargement. Private
homenagens images are deliberately excluded.
"""
from __future__ import annotations

import html
import re
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "frontend" / "index.html"
IMAGE_ROOT = ROOT / "frontend" / "img"
MAX_EDGE = 1400
QUALITY = 80
MIN_SOURCE_BYTES = 70_000
MIN_SAVING_RATIO = 0.10
HERO_IMAGES = {
    "img/sala6.jpg",
    "img/sala5.JPG",
    "img/sala 3.jpg",
}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def read_attribute(tag: str, name: str) -> str | None:
    pattern = re.compile(
        rf"(?<![\w:-]){re.escape(name)}\s*=\s*([\"'])(.*?)\1",
        flags=re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(tag)
    return html.unescape(match.group(2)) if match else None


def set_attribute(tag: str, name: str, value: str) -> str:
    pattern = re.compile(
        rf"(?<![\w:-]){re.escape(name)}\s*=\s*([\"'])(.*?)\1",
        flags=re.IGNORECASE | re.DOTALL,
    )
    escaped = html.escape(value, quote=True)
    if pattern.search(tag):
        return pattern.sub(lambda m: f'{name}="{escaped}"', tag, count=1)
    insertion = f' {name}="{escaped}"'
    if tag.endswith("/>"):
        return tag[:-2] + insertion + "/>"
    return tag[:-1] + insertion + ">"


def variant_for(original_src: str) -> tuple[str, Path] | None:
    src = original_src.strip()
    if not src.startswith("img/") or src.startswith("img/optimized/"):
        return None
    # Personal tribute photos must only be served by the authenticated API.
    if "/homenagens/" in f"/{src.lstrip('/')}" or "private-homenagens" in src:
        return None

    relative = Path(src.removeprefix("img/"))
    original = ROOT / "frontend" / src
    if relative.suffix.lower() not in IMAGE_EXTENSIONS or not original.is_file():
        return None
    target_relative = Path("img/optimized") / relative.parent / f"{relative.stem}.webp"
    target = IMAGE_ROOT / "optimized" / relative.parent / f"{relative.stem}.webp"
    return target_relative.as_posix(), target


def create_variant(original_src: str, target: Path) -> bool:
    original = ROOT / "frontend" / original_src
    if original.stat().st_size < MIN_SOURCE_BYTES:
        return False
    if target.is_file() and target.stat().st_mtime >= original.stat().st_mtime:
        return True

    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(original) as source:
        image = ImageOps.exif_transpose(source)
        has_alpha = image.mode in ("RGBA", "LA") or (
            image.mode == "P" and "transparency" in image.info
        )
        image = image.convert("RGBA" if has_alpha else "RGB")
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        image.save(target, "WEBP", quality=QUALITY, method=6)

    # Keep originals in use if WebP did not materially reduce the transfer size.
    if target.stat().st_size >= original.stat().st_size * (1 - MIN_SAVING_RATIO):
        target.unlink(missing_ok=True)
        return False
    return True


def update_image_tag(tag: str, stats: dict[str, int]) -> str:
    src = read_attribute(tag, "src") or read_attribute(tag, "data-src")
    if not src:
        return tag
    source_attribute = "src" if read_attribute(tag, "src") else "data-src"
    full_src = read_attribute(tag, "data-full-src")
    original_src = full_src or src
    variant = variant_for(original_src)
    if variant:
        optimized_src, target = variant
        if create_variant(original_src, target):
            if not full_src:
                tag = set_attribute(tag, "data-full-src", original_src)
            tag = set_attribute(tag, source_attribute, optimized_src)
            stats["optimized"] += 1
            stats["optimized_bytes"] += target.stat().st_size
        else:
            stats["kept_original"] += 1

    original_path = full_src or original_src
    is_hero = original_path in HERO_IMAGES
    is_nested_photo = original_path.startswith("img/") and "/" in original_path[4:]

    # Keep the hero carousel available immediately; defer albums until they approach view.
    if original_path == "img/icon.png":
        tag = set_attribute(tag, "loading", "eager")
    elif is_hero:
        tag = set_attribute(tag, "loading", "eager")
        if original_path == "img/sala6.jpg":
            tag = set_attribute(tag, "fetchpriority", "high")
    elif is_nested_photo or original_path == "img/sala10.webp":
        tag = set_attribute(tag, "loading", "lazy")

    if original_path.startswith("img/") and ".mp4" not in original_path.lower():
        tag = set_attribute(tag, "decoding", "async")
    return tag


def remove_attribute(tag: str, name: str) -> str:
    pattern = re.compile(
        rf"\s+(?<![\w:-]){re.escape(name)}\s*=\s*([\"']).*?\1",
        flags=re.IGNORECASE | re.DOTALL,
    )
    return pattern.sub("", tag, count=1)


def defer_gallery_images(document: str) -> str:
    button_pattern = re.compile(
        r'(<button\b(?=[^>]*\bclass\s*=\s*[\"\'][^\"\']*\bfoto-item\b[^\"\']*[\"\'])[^>]*>)(.*?)(</button\s*>)',
        flags=re.IGNORECASE | re.DOTALL,
    )

    def defer_button(match: re.Match[str]) -> str:
        def defer_image(image_match: re.Match[str]) -> str:
            tag = image_match.group(0)
            src = read_attribute(tag, "src")
            deferred_src = read_attribute(tag, "data-src")
            original_src = src or deferred_src
            if not original_src:
                return tag
            if not read_attribute(tag, "data-full-src"):
                tag = set_attribute(tag, "data-full-src", original_src)
            if src:
                tag = set_attribute(tag, "data-src", src)
                tag = remove_attribute(tag, "src")
            return tag

        inner = re.sub(r"<img\b[^>]*>", defer_image, match.group(2), flags=re.IGNORECASE | re.DOTALL)
        return f"{match.group(1)}{inner}{match.group(3)}"

    return button_pattern.sub(defer_button, document)


def main() -> None:
    source = HTML_PATH.read_text(encoding="utf-8")
    stats = {"optimized": 0, "optimized_bytes": 0, "kept_original": 0}
    updated = re.sub(
        r"<img\b[^>]*>",
        lambda match: update_image_tag(match.group(0), stats),
        source,
        flags=re.IGNORECASE | re.DOTALL,
    )
    updated = defer_gallery_images(updated)
    HTML_PATH.write_text(updated, encoding="utf-8")
    print(f"Image tags updated: {stats['optimized']}")
    print(f"Existing originals retained where optimization did not help: {stats['kept_original']}")
    print(f"Total generated WebP previews: {stats['optimized_bytes'] / 1_000_000:.1f} MB")
    print("Originals untouched; img/homenagens excluded.")


if __name__ == "__main__":
    main()
