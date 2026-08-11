#!/usr/bin/env python3
# Purpose: build docs/assets/social-preview.png (1280x640) from a real app capture.
# GitHub has no API for the repository social preview, so this image is committed
# and uploaded once by hand in the repository settings.
#
# Usage:
#   1. Run apps/web/scripts/record-demo.mjs (frames land in docs/assets/demo-frames/).
#   2. uv run --with pillow python scripts/build_social_preview.py
"""Compose the repository social-preview image from a real demo capture."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from PIL import Image, ImageDraw

if TYPE_CHECKING:
    from PIL import ImageFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "assets" / "demo-frames" / "frame-05.png"
OUTPUT = ROOT / "docs" / "assets" / "social-preview.png"
WIDTH, HEIGHT = 1280, 640
TOP_BAR = 150
BOTTOM_BAR = 84
BACKGROUND = (10, 15, 22)
PANEL = (22, 30, 40)
ACCENT = (0, 194, 122)
TEXT = (240, 245, 248)
MUTED = (150, 164, 178)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    from PIL import ImageFont

    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> int:
    if not SOURCE.exists():
        raise SystemExit(f"missing {SOURCE}; run apps/web/scripts/record-demo.mjs first")
    canvas = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(canvas)

    capture = Image.open(SOURCE).convert("RGB")
    body_height = HEIGHT - TOP_BAR - BOTTOM_BAR
    scale = body_height / capture.height
    capture = capture.resize((round(capture.width * scale), body_height), Image.LANCZOS)
    x = (WIDTH - capture.width) // 2
    canvas.paste(capture, (x, TOP_BAR))
    # Slim side panels so the body reads as one product shot, not a raw screenshot.
    draw.rectangle([0, TOP_BAR, x, HEIGHT - BOTTOM_BAR], fill=PANEL)
    draw.rectangle([x + capture.width, TOP_BAR, WIDTH, HEIGHT - BOTTOM_BAR], fill=PANEL)

    title_font = load_font(56)
    tagline_font = load_font(28)
    footer_font = load_font(24)
    draw.text((40, 24), "OpenKartLine", font=title_font, fill=TEXT)
    draw.text(
        (40, 96),
        "Kart racing-line planner & lap-time simulator",
        font=tagline_font,
        fill=MUTED,
    )
    badges = "Racing line  •  Speed profile  •  Braking & apex markers  •  Lap time"
    badge_width = draw.textlength(badges, font=footer_font)
    draw.text((WIDTH - badge_width - 40, 40), badges, font=footer_font, fill=ACCENT)
    url = "github.com/Navesz/openkartline"
    url_width = draw.textlength(url, font=footer_font)
    draw.text(
        ((WIDTH - url_width) / 2, HEIGHT - BOTTOM_BAR + 26), url, font=footer_font, fill=MUTED
    )
    draw.line([(0, TOP_BAR - 2), (WIDTH, TOP_BAR - 2)], fill=ACCENT, width=3)
    draw.line([(0, HEIGHT - BOTTOM_BAR), (WIDTH, HEIGHT - BOTTOM_BAR)], fill=ACCENT, width=3)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT, optimize=True)
    print(f"{OUTPUT} — {OUTPUT.stat().st_size / 1e3:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
