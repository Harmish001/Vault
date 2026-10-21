"""Generates all DocVault launcher/splash artwork. Run: python3 scripts/make_icons.py"""
from PIL import Image, ImageDraw, ImageChops
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
SS = 2                      # supersampling
N = 1024 * SS
NAVY, BLUE, GOLD = (27, 40, 116), (42, 59, 168), (242, 163, 58)
PAPER, PAPER_LINE, WHITE = (232, 236, 255), (190, 198, 235), (255, 255, 255)

def T(scale):
    c = 512
    return lambda v: (c + (v - c) * scale) * SS

def rr(d, box, r, fill, t):
    x0, y0, x1, y1 = [t(v) for v in box]
    d.rounded_rectangle([x0, y0, x1, y1], radius=r * (t(1) - t(0)), fill=fill)

def folder(d, t, mono=False):
    back = WHITE if mono else GOLD
    rr(d, (232, 280, 462, 430), 40, back, t)            # tab
    rr(d, (232, 330, 792, 760), 56, back, t)            # back panel
    if not mono:
        rr(d, (296, 292, 728, 640), 26, PAPER, t)       # sheet peeking out
        rr(d, (344, 346, 560, 366), 10, PAPER_LINE, t)
        rr(d, (344, 392, 640, 412), 10, PAPER_LINE, t)
    rr(d, (232, 452, 792, 760), 56, WHITE, t)           # front panel

def keyhole(d, t, color):
    cx, cy, r = 512, 568, 40
    d.ellipse([t(cx - r), t(cy - r), t(cx + r), t(cy + r)], fill=color)
    d.polygon([(t(490), t(590)), (t(534), t(590)), (t(552), t(676)), (t(472), t(676))], fill=color)

def layer(scale, mono=False):
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img); t = T(scale)
    folder(d, t, mono)
    if mono:
        hole = Image.new("L", (N, N), 0); keyhole(ImageDraw.Draw(hole), t, 255)
        a = img.getchannel("A"); img.putalpha(ImageChops.subtract(a, hole))
    else:
        keyhole(d, t, BLUE)
    return img

def gradient():
    g = Image.new("RGBA", (N, N))
    px = g.load()
    for y in range(N):
        for x in range(N):
            k = (x + y) / (2 * N)
            px[x, y] = tuple(int(NAVY[i] + (BLUE[i] - NAVY[i]) * k) for i in range(3)) + (255,)
    return g

def save(img, name, size=1024):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))

fg = layer(0.78)                                   # adaptive foreground, inside the 66% safe zone
save(fg, "adaptive-icon.png")
save(layer(0.78, mono=True), "adaptive-icon-mono.png")
save(fg, "splash-icon.png")

bg = Image.new("RGBA", (N, N), NAVY + (255,))      # flat fallback for tools that want a bg image
icon = gradient(); icon.alpha_composite(layer(0.92)); save(icon, "icon.png")

mark = gradient(); mark.alpha_composite(layer(0.92))
mask = Image.new("L", (N, N), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, N, N], radius=int(N * 0.225), fill=255)
mark.putalpha(mask); save(mark, "logo-mark.png", 512)
print("ok")
