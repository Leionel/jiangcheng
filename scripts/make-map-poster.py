"""Generate a hand-drawn poster map of the fictional 江城 (Jiangcheng).

Run with the bundled Python:
  python scripts/make-map-poster.py
Output: docs/art/jiangcheng-map-poster.png
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "art" / "jiangcheng-map-poster.png"
OUT.parent.mkdir(parents=True, exist_ok=True)

FONT_DISPLAY = "C:/Windows/Fonts/simsun.ttc"
FONT_BODY = "C:/Windows/Fonts/msyh.ttc"
FONT_KAI = "C:/Windows/Fonts/simkai.ttf"

W, H = 1600, 1000
PAPER = (243, 238, 224)
PAPER_DEEP = (232, 226, 209)
INK = (24, 33, 42)
INK_SOFT = (72, 82, 88)
RED = (198, 59, 44)
BLUE = (41, 87, 117)
PINK = (192, 107, 130)
AMBER = (197, 139, 37)
TEAL = (43, 117, 112)
BROWN = (107, 91, 78)

random.seed(20261120)
img = Image.new("RGB", (W, H), PAPER)
draw = ImageDraw.Draw(img, "RGBA")


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def jitter_line(points, color, width=2, jitter=0.6, alpha=255, passes=2):
    for _ in range(passes):
        shifted = [(x + random.uniform(-jitter, jitter), y + random.uniform(-jitter, jitter)) for x, y in points]
        draw.line(shifted, fill=(*color, alpha), width=width, joint="curve")


def blob(cx, cy, rx, ry, color, alpha=26):
    points = []
    for i in range(36):
        angle = math.tau * i / 36
        wobble = 1 + math.sin(i * 2.7 + cx) * 0.035 + random.uniform(-0.025, 0.025)
        points.append((cx + math.cos(angle) * rx * wobble, cy + math.sin(angle) * ry * wobble))
    draw.polygon(points, fill=(*color, alpha))


# --- paper texture ----------------------------------------------------------
for _ in range(9000):
    x, y = random.randrange(W), random.randrange(H)
    shade = random.randint(0, 16)
    draw.point((x, y), fill=(69, 62, 48, random.randint(2, 9) + shade // 4))
for _ in range(40):
    x, y = random.randrange(W), random.randrange(H)
    draw.ellipse((x, y, x + random.randint(20, 180), y + random.randint(1, 3)), fill=(120, 108, 88, 4))

# --- frame ------------------------------------------------------------------
draw.rectangle((54, 54, W - 54, H - 54), outline=(*INK, 255), width=3)
draw.rectangle((66, 66, W - 66, H - 66), outline=(*INK, 120), width=1)

# --- title ------------------------------------------------------------------
display = font(FONT_DISPLAY, 82)
draw.text((92, 76), "江城万物怪", font=display, fill=(*INK, 255))
draw.text((96, 192), "五 区 观 测 图", font=font(FONT_DISPLAY, 34), fill=(*INK_SOFT, 255))
draw.text((98, 232), "FIVE DISTRICTS  ·  A FIELD MAP OF A RIVER CITY", font=font(FONT_BODY, 15), fill=(*INK_SOFT, 220))

# seal
seal = font(FONT_DISPLAY, 32)
draw.rounded_rectangle((1358, 86, 1476, 168), radius=3, outline=(*RED, 255), width=4)
draw.text((1384, 98), "江城", font=seal, fill=(*RED, 255))
draw.text((1384, 136), "观测", font=seal, fill=(*RED, 255))

# --- river ------------------------------------------------------------------
river_top = [(70, 620), (240, 586), (430, 638), (660, 604), (900, 548), (1130, 582), (1530, 536)]
river_bottom = [(1530, 694), (1150, 714), (900, 690), (650, 724), (420, 700), (220, 662), (70, 706)]
river_points = river_top + list(reversed(river_bottom))
draw.polygon(river_points, fill=(*BLUE, 34))
for i in range(3):
    jitter_line(river_top, BLUE, width=2, alpha=120, jitter=0.9)
    jitter_line(river_bottom, BLUE, width=2, alpha=120, jitter=0.9)
for _ in range(28):
    x = random.randrange(110, 1500)
    y = random.randrange(590, 690)
    length = random.randrange(28, 100)
    jitter_line([(x, y), (x + length // 2, y - random.randint(2, 8)), (x + length, y)], BLUE, width=1, alpha=60, jitter=0.4, passes=1)

# --- districts --------------------------------------------------------------
districts = [
    ("过早巷", 300, 448, 160, 100, AMBER, "余温 / 市井"),
    ("桥影工坊", 400, 806, 150, 88, BROWN, "连接 / 断路"),
    ("江风渡口", 810, 470, 190, 106, BLUE, "潮位 / 雾航"),
    ("樱语山坡", 1250, 438, 165, 108, PINK, "树影 / 记忆"),
    ("雷鸣创想站", 1250, 832, 160, 92, TEAL, "装置 / 组合"),
]
for name, cx, cy, rx, ry, color, note in districts:
    blob(cx, cy, rx, ry, color, alpha=22)
    # broken boundary
    for i in range(24):
        a1 = math.tau * i / 24
        a2 = math.tau * (i + 1) / 24
        if i % 6 == 5:
            continue
        p1 = (cx + math.cos(a1) * rx * 1.02, cy + math.sin(a1) * ry * 1.02)
        p2 = (cx + math.cos(a2) * rx * 1.02, cy + math.sin(a2) * ry * 1.02)
        jitter_line([p1, p2], color, width=2, alpha=150, jitter=0.7, passes=1)
    draw.text((cx - rx * 0.52, cy - ry - 48), name, font=font(FONT_DISPLAY, 30), fill=(*color, 255))
    draw.text((cx - rx * 0.52, cy - ry - 12), note, font=font(FONT_BODY, 14), fill=(*INK_SOFT, 210))

# --- landmarks --------------------------------------------------------------
def stall(cx, cy):
    for i, dx in enumerate((-46, 4, 54)):
        w = 42
        jitter_line([(cx + dx - w // 2, cy), (cx + dx + w // 2, cy), (cx + dx + w // 2, cy - 34), (cx + dx - w // 2, cy - 34), (cx + dx - w // 2, cy)], INK, width=2, alpha=180, passes=2)
        jitter_line([(cx + dx - w // 2 - 6, cy - 34), (cx + dx, cy - 54), (cx + dx + w // 2 + 6, cy - 34)], INK, width=2, alpha=180, passes=2)
        jitter_line([(cx + dx - 12, cy - 52), (cx + dx - 18, cy - 78)], INK, width=1, alpha=90, passes=1)


def bridge(cx, cy):
    jitter_line([(cx - 90, cy), (cx + 90, cy)], INK, width=3, alpha=190, passes=2)
    jitter_line([(cx - 72, cy - 62), (cx, cy - 2), (cx + 72, cy - 62)], INK, width=2, alpha=180, passes=2)
    for dx in (-72, -36, 0, 36, 72):
        jitter_line([(cx + dx, cy), (cx + dx, cy + 38)], INK, width=2, alpha=150, passes=1)
    jitter_line([(cx - 86, cy + 38), (cx + 86, cy + 38)], INK, width=1, alpha=100, passes=1)


def ferry(cx, cy):
    jitter_line([(cx - 46, cy), (cx + 46, cy), (cx + 32, cy + 24), (cx - 32, cy + 24), (cx - 46, cy)], INK, width=2, alpha=180, passes=2)
    jitter_line([(cx - 2, cy), (cx - 2, cy - 38), (cx + 26, cy)], INK, width=2, alpha=170, passes=2)
    jitter_line([(cx - 64, cy + 34), (cx - 36, cy + 28), (cx - 8, cy + 34), (cx + 20, cy + 28), (cx + 48, cy + 34)], BLUE, width=2, alpha=150, passes=1)


def cherry(cx, cy):
    jitter_line([(cx, cy + 46), (cx, cy + 6), (cx - 24, cy - 18)], INK, width=3, alpha=190, passes=2)
    jitter_line([(cx, cy + 12), (cx + 30, cy - 14)], INK, width=3, alpha=190, passes=2)
    for dx, dy, r in ((-30, -18, 24), (0, -38, 30), (32, -18, 24), (10, 0, 22), (-20, 8, 18)):
        draw.ellipse((cx + dx - r, cy + dy - r, cx + dx + r, cy + dy + r), fill=(*PINK, 42), outline=(*PINK, 120), width=1)


def coil(cx, cy):
    jitter_line([(cx - 26, cy + 40), (cx - 8, cy - 54), (cx + 28, cy + 40)], INK, width=3, alpha=190, passes=2)
    for i, y in enumerate((cy - 20, cy, cy + 20)):
        jitter_line([(cx - 30, y), (cx + 30, y)], INK, width=2, alpha=160, passes=1)
    jitter_line([(cx + 48, cy - 48), (cx + 32, cy - 20), (cx + 48, cy - 18), (cx + 28, cy + 16)], RED, width=4, alpha=220, passes=2)


stall(310, 476)
bridge(410, 790)
ferry(810, 470)
cherry(1250, 446)
coil(1250, 816)

# --- route ------------------------------------------------------------------
route = [(330, 450), (430, 610), (690, 640), (900, 560), (1180, 470), (1250, 380), (1300, 620), (1250, 760)]
for i in range(len(route) - 1):
    (x1, y1), (x2, y2) = route[i], route[i + 1]
    steps = max(2, int(math.dist((x1, y1), (x2, y2)) / 18))
    for s in range(0, steps - 1, 2):
        ax = x1 + (x2 - x1) * s / steps
        ay = y1 + (y2 - y1) * s / steps
        bx = x1 + (x2 - x1) * (s + 1) / steps
        by = y1 + (y2 - y1) * (s + 1) / steps
        jitter_line([(ax, ay), (bx, by)], RED, width=3, alpha=190, jitter=0.5, passes=1)

for i, (x, y) in enumerate([(330, 450), (430, 610), (690, 640), (900, 560), (1180, 470)]):
    draw.ellipse((x - 16, y - 16, x + 16, y + 16), fill=(*PAPER, 255), outline=(*RED, 255), width=3)
    draw.text((x - 7, y - 11), str(i + 1), font=font(FONT_BODY, 17), fill=(*RED, 255))

# --- compass / scale --------------------------------------------------------
cx, cy = 1450, 760
draw.ellipse((cx - 38, cy - 38, cx + 38, cy + 38), outline=(*INK, 180), width=2)
jitter_line([(cx, cy - 30), (cx + 10, cy + 8), (cx, cy - 2), (cx - 10, cy + 8), (cx, cy - 30)], INK, width=2, alpha=220, passes=2)
draw.text((cx - 8, cy + 46), "N", font=font(FONT_BODY, 18), fill=(*INK_SOFT, 220))
jitter_line([(1180, 914), (1320, 914)], INK, width=2, alpha=180, passes=2)
for x in (1180, 1250, 1320):
    jitter_line([(x, 908), (x, 920)], INK, width=2, alpha=150, passes=1)
draw.text((1332, 904), "虚构比例 · 不以真实地理为准", font=font(FONT_BODY, 14), fill=(*INK_SOFT, 210))

# --- footer -----------------------------------------------------------------
draw.text((92, 872), "江风渡口 · 渡运观测图", font=font(FONT_KAI, 30), fill=(*INK, 230))
draw.text((92, 914), "FIG. 02   /   五区 · 一条江 · 五个不想睡的地方", font=font(FONT_BODY, 14), fill=(*INK_SOFT, 200))
draw.text((1390, 920), "2026 · 观测记录", font=font(FONT_BODY, 14), fill=(*INK_SOFT, 190))

# --- edge wear --------------------------------------------------------------
for _ in range(900):
    x = random.randrange(54, W - 54)
    y = random.choice([random.randrange(54, 62), random.randrange(H - 62, H - 54)])
    draw.point((x, y), fill=(90, 80, 62, random.randint(8, 30)))
for _ in range(600):
    x = random.choice([random.randrange(54, 64), random.randrange(W - 64, W - 54)])
    y = random.randrange(54, H - 54)
    draw.point((x, y), fill=(90, 80, 62, random.randint(6, 24)))

img.save(OUT, "PNG")
print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
