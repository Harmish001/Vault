"""
Generates all DocVault launcher, adaptive, and splash artwork.
Vault-Shield mark in the brand colors from src/theme.ts (primaryDark, primary, primaryLight)
with brushed platinum trim. Change the theme, then run: npm run icons (needs: pip install pillow)
"""
import math
import os
import re
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
os.makedirs(OUT, exist_ok=True)

SS = 2  # Supersampling factor for razor-sharp anti-aliased rendering
W = 1024 * SS
H = 1024 * SS

THEME = open(os.path.join(os.path.dirname(__file__), "..", "src", "theme.ts"), encoding="utf-8").read()


def theme_rgb(name):
    hit = re.search(r"\b" + name + r':\s*"#([0-9A-Fa-f]{6})"', THEME)
    if not hit:
        raise SystemExit(f"src/theme.ts: colors.{name} must be a 6-digit hex color")
    return tuple(int(hit.group(1)[i:i + 2], 16) for i in (0, 2, 4))


# Brand colors come from src/theme.ts; the platinum trim stays neutral
BRAND_DARK       = theme_rgb("primaryDark")
BRAND_DEEP       = theme_rgb("primary")
BRAND_MID        = theme_rgb("primaryLight")
SHADOW           = tuple(v // 2 for v in BRAND_DARK) + (130,)

PLATINUM_BRIGHT  = (248, 247, 244)   # #F8F7F4 Warm Platinum
PLATINUM_MID     = (228, 226, 220)   # #E4E2DC Brushed Platinum
PLATINUM_SHADOW  = (168, 164, 155)   # #A8A49B Polished Pewter
PLATINUM_DARK    = (110, 106, 98)    # #6E6A62 Shadowed Pewter

WHITE            = (255, 255, 255)
OFFWHITE         = (241, 240, 236)


def create_brand_gradient():
    """Radial gradient from the primary brand color to primaryDark."""
    base = Image.new("RGBA", (W, H))
    px = base.load()
    cx, cy = W * 0.38, H * 0.32
    max_d = math.hypot(W * 0.72, H * 0.72)

    for y in range(H):
        for x in range(W):
            d = math.hypot(x - cx, y - cy) / max_d
            d = min(1.0, max(0.0, d))
            # Smooth ease curve
            t = d * d * (3 - 2 * d)
            r = int(BRAND_DEEP[0] * (1 - t) + BRAND_DARK[0] * t)
            g = int(BRAND_DEEP[1] * (1 - t) + BRAND_DARK[1] * t)
            b = int(BRAND_DEEP[2] * (1 - t) + BRAND_DARK[2] * t)
            px[x, y] = (r, g, b, 255)
    return base


def draw_vault_shield_mark(scale=1.0, mono=False):
    """
    Renders the iconic geometric Vault-Shield:
    A precision shield contour + document corner fold + interlocking brushed platinum vault core.
    """
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    cx, cy = W / 2, H / 2
    def p(x, y):
        return (cx + (x - 512) * scale * SS, cy + (y - 512) * scale * SS)

    # Coordinates in 1024 unit space
    outer_shield = [
        p(512, 170), # Top center apex
        p(780, 245), # Top right corner
        p(780, 560), # Right side inflection
        p(512, 860), # Bottom center point
        p(244, 560), # Left side inflection
        p(244, 245), # Top left corner
    ]

    # Shield Inner Boundary (Brushed Platinum Inlay)
    trim_shield = [
        p(512, 215),
        p(745, 280),
        p(745, 545),
        p(512, 810),
        p(279, 545),
        p(279, 280),
    ]

    # Document Surface
    doc_body = [
        p(330, 310), # Top left of document
        p(630, 310), # Top fold start
        p(710, 390), # Fold right edge
        p(710, 680), # Lower right
        p(512, 770), # Lower point
        p(330, 680), # Lower left
    ]

    # Document Fold Corner
    doc_fold = [
        p(630, 310),
        p(710, 390),
        p(630, 390),
    ]

    if mono:
        # Monochrome stencil silhouette for Android 13+ themed icons
        d.polygon(outer_shield, fill=WHITE)
        cutout = Image.new("L", (W, H), 0)
        cd = ImageDraw.Draw(cutout)
        cd.polygon(trim_shield, fill=255)
        cd.polygon(doc_body, fill=0)
        cd.polygon(doc_fold, fill=255)
        # Vault Monogram "V" in cutout
        v_poly = [p(400, 440), p(512, 650), p(624, 440), p(570, 440), p(512, 550), p(454, 440)]
        cd.polygon(v_poly, fill=255)
        cr = 34 * scale * SS
        cd.ellipse([cx - cr, p(512, 500)[1] - cr, cx + cr, p(512, 500)[1] + cr], fill=0)

        alpha = img.getchannel("A")
        alpha = ImageChops.subtract(alpha, cutout)
        img.putalpha(alpha)
        return img

    # 1. Subtle drop shadow under shield
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    shadow_poly = [(x, y + 16 * scale * SS) for (x, y) in outer_shield]
    sd.polygon(shadow_poly, fill=SHADOW)
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=28 * scale * SS))
    img = Image.alpha_composite(shadow, img)
    d = ImageDraw.Draw(img)

    # 2. Outer Shield (Faceted 3D bevels)
    left_shield = [outer_shield[0], outer_shield[5], outer_shield[4], outer_shield[3]]
    d.polygon(left_shield, fill=BRAND_DEEP)
    right_shield = [outer_shield[0], outer_shield[1], outer_shield[2], outer_shield[3]]
    d.polygon(right_shield, fill=BRAND_MID)

    # 3. Brushed Platinum Trim Inlay
    d.polygon(trim_shield, fill=PLATINUM_SHADOW)
    right_plat = [trim_shield[0], trim_shield[1], trim_shield[2], trim_shield[3]]
    d.polygon(right_plat, fill=PLATINUM_BRIGHT)

    # 4. White Document Field with subtle split lighting
    d.polygon(doc_body, fill=WHITE)
    left_doc = [doc_body[0], doc_body[5], doc_body[4], p(512, 310)]
    d.polygon(left_doc, fill=OFFWHITE)

    # 5. Folded Corner (Brushed Platinum reflection)
    d.polygon(doc_fold, fill=PLATINUM_MID)
    d.line([doc_fold[0], doc_fold[2], doc_fold[1]], fill=PLATINUM_DARK, width=int(3 * scale * SS))

    # 6. Central Vault Shield Monogram ("V" in brand color)
    v_left = [p(395, 430), p(450, 430), p(512, 560), p(512, 660)]
    v_right = [p(629, 430), p(574, 430), p(512, 560), p(512, 660)]
    d.polygon(v_left, fill=BRAND_DEEP)
    d.polygon(v_right, fill=BRAND_MID)

    # 7. Vault Center Seal (Brushed Titanium Dial + brand core)
    dial_cy = p(512, 490)[1]
    r_outer = 48 * scale * SS
    r_inner = 28 * scale * SS
    r_core  = 16 * scale * SS

    # Outer platinum rim
    d.ellipse([cx - r_outer, dial_cy - r_outer, cx + r_outer, dial_cy + r_outer], fill=PLATINUM_DARK)
    d.ellipse([cx - r_outer + 3, dial_cy - r_outer + 3, cx + r_outer - 3, dial_cy + r_outer - 3], fill=PLATINUM_BRIGHT)
    # Dial track
    d.ellipse([cx - r_inner, dial_cy - r_inner, cx + r_inner, dial_cy + r_inner], fill=PLATINUM_MID)
    # Brand lock core
    d.ellipse([cx - r_core, dial_cy - r_core, cx + r_core, dial_cy + r_core], fill=BRAND_DEEP)

    # Precision vault laser ticks on the dial rim (8-axis dial)
    tick_len = 8 * scale * SS
    tick_w = max(2, int(2.5 * scale * SS))
    for angle in [0, 45, 90, 135, 180, 225, 270, 315]:
        rad = math.radians(angle)
        x1 = cx + (r_outer - tick_len) * math.cos(rad)
        y1 = dial_cy + (r_outer - tick_len) * math.sin(rad)
        x2 = cx + r_outer * math.cos(rad)
        y2 = dial_cy + r_outer * math.sin(rad)
        d.line([x1, y1, x2, y2], fill=PLATINUM_SHADOW, width=tick_w)

    return img


def save_resized(img, filename, size=1024):
    out_path = os.path.join(OUT, filename)
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(out_path, "PNG", optimize=True)
    print(f"Saved: {filename} ({size}x{size})")


def main():
    print("Generating brand artwork from src/theme.ts...")

    # 1. Full Launcher Icon (brand gradient background + vault emblem)
    bg = create_brand_gradient()
    fg_full = draw_vault_shield_mark(scale=0.90)
    full_icon = Image.alpha_composite(bg, fg_full)
    save_resized(full_icon, "icon.png", 1024)

    # 2. Adaptive Icon Foreground (safe within 66% circle zone)
    adaptive_fg = draw_vault_shield_mark(scale=0.74)
    save_resized(adaptive_fg, "adaptive-icon.png", 1024)

    # 3. Monochrome Adaptive Icon (Material You theme tinting)
    adaptive_mono = draw_vault_shield_mark(scale=0.74, mono=True)
    save_resized(adaptive_mono, "adaptive-icon-mono.png", 1024)

    # 4. Splash Screen Icon
    splash_fg = draw_vault_shield_mark(scale=0.82)
    save_resized(splash_fg, "splash-icon.png", 1024)

    # 5. App Store / Settings Logo Mark with rounded squircle
    mark = Image.alpha_composite(bg, draw_vault_shield_mark(scale=0.88))
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W, H], radius=int(W * 0.225), fill=255)
    mark.putalpha(mask)
    save_resized(mark, "logo-mark.png", 512)

    print("All artwork generated successfully!")


if __name__ == "__main__":
    main()
