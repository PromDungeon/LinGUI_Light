#!/usr/bin/env python3
"""
Generates LinGUI_Light extension icons as PNG files.
Design: dark navy background, bold "L" letter, rainbow color bar at bottom.
Sizes: 16, 32, 48, 96, 128
"""
import struct, zlib, math, os

def write_png(filename, width, height, pixels):
    """Write a PNG file from a list of (r, g, b, a) tuples, row by row."""
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(c[4:]) & 0xffffffff)

    raw = b''
    for row in range(height):
        raw += b'\x00'  # filter byte
        for col in range(width):
            r, g, b, a = pixels[row * width + col]
            raw += bytes([r, g, b, a])

    png  = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')

    with open(filename, 'wb') as f:
        f.write(png)
    print(f"  Written: {filename} ({width}x{height})")


def lerp(a, b, t):
    return int(a + (b - a) * t)


def blend(fg, bg, alpha):
    """Alpha-composite fg over bg. Alpha is 0.0–1.0."""
    return tuple(lerp(bg[i], fg[i], alpha) for i in range(3))


def draw_icon(size):
    pixels = []

    # ── Palette ──────────────────────────────────────────────────────────────
    BG       = (18,  20,  40)   # deep navy
    LETTER   = (235, 240, 255)  # near-white
    BAR_H    = max(3, size // 10)  # rainbow bar height at bottom
    PADDING  = max(1, size // 10)  # inner padding
    RADIUS   = max(2, size // 8)   # corner radius

    # Rainbow stops (R → O → Y → G → B → V)
    RAINBOW = [
        (255,  60,  60),
        (255, 150,  30),
        (255, 220,  30),
        ( 50, 200,  80),
        ( 50, 130, 255),
        (160,  60, 255),
    ]

    def rainbow_color(x, total_w):
        t = (x / max(total_w - 1, 1)) * (len(RAINBOW) - 1)
        i = int(t)
        f = t - i
        if i >= len(RAINBOW) - 1:
            return RAINBOW[-1]
        c0, c1 = RAINBOW[i], RAINBOW[i + 1]
        return (lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f), lerp(c0[2], c1[2], f))

    # ── Rounded-rect mask ────────────────────────────────────────────────────
    def in_rounded_rect(x, y, r):
        cx = max(r, min(size - 1 - r, x))
        cy = max(r, min(size - 1 - r, y))
        return math.hypot(x - cx, y - cy) <= r

    # ── "L" bitmap ───────────────────────────────────────────────────────────
    # Build the L as a set of filled pixels using stroke math
    lp = PADDING + 1            # left edge
    tp = PADDING + 1            # top edge
    bp = size - PADDING - BAR_H - 2   # bottom edge (above bar)
    stem_w = max(2, size // 6)  # vertical stroke width
    foot_w = max(2, size // 6)  # horizontal stroke width (foot of L)
    rp = min(size - PADDING - 2, lp + size // 2 + stem_w)  # right edge of foot

    def in_letter_L(x, y):
        in_vert  = lp <= x < lp + stem_w and tp <= y <= bp
        in_horiz = lp <= x <= rp          and bp - foot_w < y <= bp
        return in_vert or in_horiz

    # ── Compose pixels ───────────────────────────────────────────────────────
    for row in range(size):
        for col in range(size):
            # Background with rounded corners
            if not in_rounded_rect(col, row, RADIUS):
                pixels.append((0, 0, 0, 0))   # transparent outside corners
                continue

            # Rainbow bar zone
            bar_top = size - BAR_H
            if row >= bar_top:
                rc = rainbow_color(col, size)
                pixels.append((*rc, 255))
                continue

            # Letter L
            if in_letter_L(col, row):
                pixels.append((*LETTER, 255))
                continue

            # Background fill
            pixels.append((*BG, 255))

    return pixels


out_dir = os.path.join(os.path.dirname(__file__), 'icons')
os.makedirs(out_dir, exist_ok=True)

for sz in [16, 32, 48, 96, 128]:
    pix = draw_icon(sz)
    write_png(os.path.join(out_dir, f'icon{sz}.png'), sz, sz, pix)

print("Done.")
