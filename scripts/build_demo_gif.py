#!/usr/bin/env python3
# Purpose: assemble docs/assets/openkartline-demo.gif from the frames recorded by
# apps/web/scripts/record-demo.mjs. Kept in the repo so the README's demo GIF is
# reproducible instead of a one-off local artifact.
#
# Usage:
#   uv run --with pillow python scripts/build_demo_gif.py
"""Assemble the README demo GIF from recorded browser frames."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FRAMES_DIR = ROOT / "docs" / "assets" / "demo-frames"
OUTPUT = ROOT / "docs" / "assets" / "openkartline-demo.gif"
TARGET_WIDTH = 960
# Extra dwell on the first frame (track editor) and on the freshly computed lap.
FRAME_DURATIONS_MS = {1: 1400, 5: 1600, 15: 1200}
DEFAULT_DURATION_MS = 480


def main() -> int:
    frame_paths = sorted(FRAMES_DIR.glob("frame-*.png"))
    if not frame_paths:
        raise SystemExit(f"no frames in {FRAMES_DIR}; run apps/web/scripts/record-demo.mjs first")
    frames = []
    for path in frame_paths:
        image = Image.open(path).convert("RGB")
        height = round(image.height * TARGET_WIDTH / image.width)
        frames.append(image.resize((TARGET_WIDTH, height), Image.LANCZOS))
    durations = [
        FRAME_DURATIONS_MS.get(index + 1, DEFAULT_DURATION_MS) for index in range(len(frames))
    ]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )
    size_mb = OUTPUT.stat().st_size / 1e6
    print(f"{OUTPUT} — {len(frames)} frames, {size_mb:.2f} MB")
    if size_mb > 5:
        raise SystemExit("GIF exceeds 5 MB; reduce frames or TARGET_WIDTH")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
