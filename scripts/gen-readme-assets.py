#!/usr/bin/env python3
"""Generate README image assets for dsh-excel-reconcile (docs/assets/).

Outputs (idempotent overwrite):
  dsh-excel-reconcile-flow-light.svg / dsh-excel-reconcile-flow-dark.svg
      Hero pipeline diagram. Two hand-written SVG files (vector — never
      rasterized to webp). Text inside is command-surface tokens only
      (fileA, excel_reconcile, findings[], ...), so all five README
      languages share the same pair.
  No evidence chart: this repository publishes no benchmark data, and the
  family rules forbid drawing numbers that do not exist.

Run once:  python scripts/gen-readme-assets.py
Requires:  Pillow (the CJK font probe below is shared with the family
           template; the flow SVGs themselves render ASCII tokens only).
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFont  # noqa: F401  (family template imports)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

# --- palette: PerryLink family (accent) + GitHub page backgrounds ----------
FAMILY = "#4B67B4"   # family accent (badges labelColor family uses #2B3245)
GREEN = {"light": "#16a34a", "dark": "#3fb950"}
SKIN = {
    "light": dict(bg="#ffffff", box="#f6f8fa", border="#d0d7de",
                  text="#1f2328", sub="#57606a"),
    "dark": dict(bg="#0d1117", box="#161b22", border="#30363d",
                 text="#f0f6fc", sub="#8b949e"),
}
WEBP_QUALITY = 90  # family standard for raster assets; none are produced here

# --- CJK font probe: localised raster assets must never render tofu --------
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",      # Microsoft YaHei
    r"C:\Windows\Fonts\simhei.ttf",    # SimHei
    r"C:\Windows\Fonts\Deng.ttf",      # DengXian
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]
FONT_PATH = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
if FONT_PATH is None:
    sys.exit("FATAL: no CJK font found (looked for msyh.ttc, simhei.ttf, "
             "Deng.ttf, Noto Sans CJK, PingFang). Refusing to render Chinese "
             "as tofu boxes; install one of the probed fonts and re-run.")


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size)


# ---------------------------------------------------------------------------
# Hero pipeline SVG (light + dark)
# ---------------------------------------------------------------------------
TITLE = "dsh-excel-reconcile"
SUBTITLE = "fileA · fileB → excel_reconcile → findings[] → reports"

# (x, y, w, h, main label, accent, [sub lines])
NODES = [
    (60, 140, 210, 78, "fileA", "border", ["xlsx · csv · docx"]),
    (60, 250, 210, 78, "fileB", "border", ["xlsx · csv · docx"]),
    (350, 178, 240, 112, "excel_reconcile", "family",
     ["ctx.tools.register", "timeoutMs · tools"]),
    (650, 178, 240, 112, "findings[]", "family",
     ["number-diff · text-diff · date-diff",
      "not-a-number · missing-in-a/b",
      "duplicate-key · empty-key"]),
    (930, 178, 210, 112, "reports", "green",
     ["markdown", "resultJson", "reconcile-diff.xlsx"]),
]


def arrow(x1: int, y1: int, x2: int, y2: int, color: str) -> list[str]:
    """Straight arrow with a small V head at (x2, y2)."""
    return [
        f'<path d="M{x1} {y1}H{x2}" stroke="{color}" stroke-width="2.5"/>',
        f'<path d="M{x2 - 10} {y2 - 6}l10 6-10 6" fill="none" '
        f'stroke="{color}" stroke-width="2.5" stroke-linecap="round" '
        f'stroke-linejoin="round"/>',
    ]


def flow_svg(skin: str) -> str:
    s = SKIN[skin]
    w, h = 1200, 460
    accent = {"border": s["border"], "family": FAMILY, "green": GREEN[skin]}
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" role="img" '
        f'aria-label="{TITLE} pipeline: fileA + fileB -> excel_reconcile -> '
        f'findings -> reports">',
        f'<title>{TITLE} pipeline</title>',
        f'<rect width="{w}" height="{h}" rx="18" fill="{s["bg"]}"/>',
        f'<text x="60" y="62" fill="{s["text"]}" font-family="ui-sans-serif,'
        f'system-ui,sans-serif" font-size="30" font-weight="700">{TITLE}</text>',
        f'<text x="60" y="94" fill="{s["sub"]}" font-family="ui-monospace,'
        f'monospace" font-size="15">{SUBTITLE}</text>',
        f'<line x1="60" y1="116" x2="1140" y2="116" stroke="{s["border"]}"/>',
    ]
    for x, y, nw, nh, label, kind, subs in NODES:
        color = accent[kind]
        parts.append(
            f'<rect x="{x}" y="{y}" width="{nw}" height="{nh}" rx="14" '
            f'fill="{s["box"]}" stroke="{color}" stroke-width="2"/>')
        parts.append(
            f'<text x="{x + nw // 2}" y="{y + 38}" fill="{s["text"]}" '
            f'text-anchor="middle" font-family="ui-monospace,monospace" '
            f'font-size="15" font-weight="700">{label}</text>')
        for i, sub in enumerate(subs):
            parts.append(
                f'<text x="{x + nw // 2}" y="{y + 62 + i * 16}" '
                f'fill="{s["sub"]}" text-anchor="middle" '
                f'font-family="ui-monospace,monospace" font-size="10">{sub}</text>')
    # A and B converge on the tool.
    for cx, cy in ((270, 179), (270, 289)):
        parts.append(
            f'<path d="M{cx} {cy}H320V234H350" fill="none" stroke="{s["sub"]}" '
            f'stroke-width="2.5"/>')
        parts.append(
            f'<path d="M340 228l10 6-10 6" fill="none" stroke="{s["sub"]}" '
            f'stroke-width="2.5" stroke-linecap="round" '
            f'stroke-linejoin="round"/>')
    # tool -> findings -> reports
    parts.extend(arrow(590, 234, 650, 234, s["sub"]))
    parts.extend(arrow(890, 234, 930, 234, s["sub"]))
    # config feeds the tool from below.
    parts.append(
        f'<path d="M470 290V350" stroke="{FAMILY}" stroke-width="2" '
        f'stroke-dasharray="5 5"/>')
    parts.append(
        f'<rect x="350" y="350" width="240" height="62" rx="12" '
        f'fill="{s["box"]}" stroke="{FAMILY}" stroke-width="2"/>')
    parts.append(
        f'<text x="470" y="378" fill="{s["text"]}" text-anchor="middle" '
        f'font-family="ui-monospace,monospace" font-size="13" '
        f'font-weight="700">config.yaml</text>')
    parts.append(
        f'<text x="470" y="398" fill="{s["sub"]}" text-anchor="middle" '
        f'font-family="ui-monospace,monospace" font-size="10">'
        f'join · compare[] · duplicates · scale</text>')
    parts.append(
        f'<text x="60" y="440" fill="{s["sub"]}" font-family="ui-monospace,'
        f'monospace" font-size="12">money = BigInt minor units · inputs '
        f'read-only · no network · no model call</text>')
    parts.append('</svg>')
    return "\n".join(parts) + "\n"


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for skin in ("light", "dark"):
        with open(os.path.join(OUT, f"dsh-excel-reconcile-flow-{skin}.svg"),
                  "w", encoding="utf-8", newline="\n") as fh:
            fh.write(flow_svg(skin))
    print("wrote 2 SVG assets to docs/assets/")


if __name__ == "__main__":
    main()
