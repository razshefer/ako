"""Generate the PWA icons with no third-party dependencies.

    python tools/make_icons.py

Draws a dark rounded tile with three ascending bars ("reps").
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "app" / "icons"

BG_TOP = (14, 24, 36)
BG_BOTTOM = (9, 15, 23)
BARS = [(62, 166, 255), (56, 211, 159), (255, 184, 77)]


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def rounded_alpha(x, y, size, radius, inset):
    """Coverage (0..1) of a rounded square, cheap 1-sample edge test."""
    lo, hi = inset, size - inset
    if x < lo or x > hi or y < lo or y > hi:
        return 0.0
    cx = min(max(x, lo + radius), hi - radius)
    cy = min(max(y, lo + radius), hi - radius)
    dx, dy = x - cx, y - cy
    d = (dx * dx + dy * dy) ** 0.5
    if d <= radius - 1:
        return 1.0
    if d >= radius:
        return 0.0
    return radius - d


def draw(size, maskable=False):
    inset = 0 if maskable else size * 0.03
    radius = size * (0.30 if maskable else 0.24)
    # bars live inside the safe zone for maskable icons
    pad = size * (0.28 if maskable else 0.22)
    inner = size - 2 * pad
    bar_h = inner * 0.17
    gap = (inner - 3 * bar_h) / 2
    widths = [0.55, 0.78, 1.0]

    rows = []
    for y in range(size):
        row = bytearray()
        row.append(0)  # PNG filter type: none
        for x in range(size):
            t = y / (size - 1)
            r, g, b = lerp(BG_TOP, BG_BOTTOM, t)
            a = rounded_alpha(x + 0.5, y + 0.5, size, radius, inset)

            for i, w in enumerate(widths):
                top = pad + i * (bar_h + gap)
                bottom = top + bar_h
                left = pad
                right = pad + inner * w
                br = bar_h / 2
                if top <= y + 0.5 <= bottom and left <= x + 0.5 <= right:
                    # round the bar caps
                    cx = min(max(x + 0.5, left + br), right - br)
                    cy = top + br
                    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5 <= br:
                        r, g, b = BARS[i]
            row += bytes((r, g, b, round(a * 255)))
        rows.append(bytes(row))
    return b"".join(rows)


def png(path, size, maskable=False):
    raw = draw(size, maskable)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    body = (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))
    path.write_bytes(body)
    print(f"wrote {path.relative_to(path.parent.parent.parent)} ({len(body)} bytes)")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    png(OUT / "icon-192.png", 192)
    png(OUT / "icon-512.png", 512)
    png(OUT / "icon-maskable-512.png", 512, maskable=True)
