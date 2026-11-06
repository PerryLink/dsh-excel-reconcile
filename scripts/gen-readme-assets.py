#!/usr/bin/env python3
"""Generate README visuals for dsh-excel-reconcile (docs/assets/).

Outputs (idempotent overwrite):
  dsh-excel-reconcile-hero-{zh,en}-{light,dark}.webp   1440x576 raster hero (Pillow)
  dsh-excel-reconcile-flow-v5-{light,dark}.svg         1100x660 hand-written SVG

Design notes
------------
* Hero: the left column is prose (kicker / title / two value lines / one
  subtitle / one meta line / footer). The right column is this repository's own
  semantic figure: an open two-page spread. Side A (the AR ledger) and side B
  (the customer statement) are aligned row by row on the join key, and the
  gutter between them carries one verdict per key — equal, a delta, or an
  orphan on either side. A second card turns the same three findings into
  `findings[]` and the three artefacts. Every key, amount and verdict comes from
  the checked-in quickstart fixture
  (samples/quickstart/input/ar-ledger-{a,b}.csv, docs/assets/quickstart.log:
  A=3 B=3, matched 2, only A=1, only B=1, 3 findings = 1 error + 2 warn).
* Flow: a two-sided comparison band, not a row of boxes. Both ledgers feed a
  key spine (`normaliseKey`, `join`); each matched key is carried down the
  spine and answered field by field in the verdict column — A value, verdict,
  B value — with `compare[]` tolerance shown on the field itself. Unmatched
  keys bypass the band and land straight in the finding taxonomy, which is a
  fixed eight-type vocabulary split by severity, and only then fans out to the
  three artefacts. Text is tokens and short labels only (tool, config keys,
  finding types, sheet names, fixture keys), so all five README languages share
  one pair.

Run once:  python scripts/gen-readme-assets.py
Requires:  Python 3.10+ with Pillow; Windows fonts msyh.ttc / msyhbd.ttc /
           consola.ttf / segoeui.ttf / segoeuib.ttf.
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

FONT_CJK = r"C:\Windows\Fonts\msyh.ttc"
FONT_CJK_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"
FONT_EN = r"C:\Windows\Fonts\segoeui.ttf"
FONT_EN_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"

for _path in (FONT_CJK, FONT_CJK_BOLD, FONT_MONO, FONT_EN, FONT_EN_BOLD):
    if not os.path.exists(_path):
        raise SystemExit(f"FATAL: font missing: {_path}")

WARNINGS: list[str] = []

SKIN = {
    "light": dict(
        bg_from="#f9f6fd", bg_to="#e4eaf8", card="#ffffff",
        card_edge="#e4e1ee", sheet="#f6f3fc", sheet_edge="#e7e2f2",
        text="#141419", sub="#4d5261", faint="#8f94a4",
        accent="#4B67B4", warn="#c2410c", good="#16a34a",
        pill="#ece7f9", track="#eae6f3", grid="#e7e4f0",
        warn_soft="#fdf0e7", sub_soft="#eef0f7", dot="#d9d3ea",
        shadow=(32, 26, 64),
    ),
    "dark": dict(
        bg_from="#131a2a", bg_to="#0c1016", card="#1b2231",
        card_edge="#2e374b", sheet="#171e2d", sheet_edge="#2b3448",
        text="#f0f3f9", sub="#a8b1c4", faint="#737b8d",
        accent="#8496f5", warn="#d9a03c", good="#3fb950",
        pill="#242d42", track="#243049", grid="#1e2636",
        warn_soft="#3a2a1c", sub_soft="#232c44", dot="#26314a",
        shadow=(0, 0, 0),
    ),
}


# --------------------------------------------------------------- primitives
def font(size, kind="cjk"):
    return ImageFont.truetype(
        {"cjk": FONT_CJK, "cjk_bold": FONT_CJK_BOLD, "mono": FONT_MONO,
         "en": FONT_EN, "en_bold": FONT_EN_BOLD}[kind], max(8, int(size)))


def hx(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(int(p + (q - p) * t) for p, q in zip(hx(a), hx(b)))


def gradient(w, h, c1, c2):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = 0.25 * (y / h) + 0.75 * (y / h) ** 1.6
        d.line([(0, y), (w, y)], fill=mix(c1, c2, t))
    return img


def glow(img, cx, cy, r, color, alpha=30):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(12, 0, -1):
        rr = r * i / 12
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                  fill=color + (int(alpha * (1 - i / 13)),))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def dot_texture(img, color, alpha=14, spacing=30, r=1.25):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for y in range(0, img.height, spacing):
        for x in range(0, img.width, spacing):
            d.ellipse([x - r, y - r, x + r, y + r], fill=color + (alpha,))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def card(img, box, skin, radius=22, shadow=26, fill=None, edge=None, width=2):
    x0, y0, x1, y1 = box
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for i in range(shadow, 0, -3):
        sd.rounded_rectangle([x0 - i // 5, y0 + i // 2, x1 + i // 5, y1 + i],
                             radius=radius + i // 5,
                             fill=skin["shadow"] + (int(8 * (1 - i / shadow)),))
    base = Image.alpha_composite(
        img.convert("RGBA"), sh.filter(ImageFilter.GaussianBlur(12)))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle(box, radius=radius, fill=hx(fill or skin["card"]),
                        outline=hx(edge or skin["card_edge"]), width=width)
    return base.convert("RGB")


def pill(img, xy, text, skin, size=20, kind="cjk_bold", fg=None, bg=None,
         anchor="la", padx=18, pady=10):
    d = ImageDraw.Draw(img)
    f = font(size, kind)
    tw = d.textlength(text, font=f)
    h = size + pady * 2
    x, y = xy
    if anchor == "ra":
        x -= tw + padx * 2
    d.rounded_rectangle([x, y, x + tw + padx * 2, y + h], radius=h // 2,
                        fill=hx(bg or skin["pill"]))
    d.text((x + padx, y + pady - 1), text, font=f, fill=hx(fg or skin["accent"]))
    return img


def fit(d, text, kind, max_w, size, min_size=14):
    size = int(size)
    while size > min_size:
        if d.textlength(text, font=font(size, kind)) <= max_w:
            return size
        size -= 2
    return max(min_size, size)


def write(img, xy, text, skin, size, kind="cjk", color="text",
          max_w=None, min_size=12, tag="", anchor=None):
    d = ImageDraw.Draw(img)
    if max_w is not None:
        size = fit(d, text, kind, max_w, size, min_size)
        if d.textlength(text, font=font(size, kind)) > max_w:
            WARNINGS.append(f"{tag}: {text!r} exceeds {max_w}px at {size}px")
            print(f"WARN {tag}: {text!r} exceeds {max_w}px at {size}px")
    d.text(xy, text, font=font(size, kind), fill=hx(skin[color]),
           anchor=anchor)
    return size



# --------------------------------------------------------------- hero model
# Fixture-faithful reconciliation of samples/quickstart/input/ar-ledger-{a,b}.csv
# (see docs/assets/quickstart.log and expected/result.json).
A_ROWS = [("HT-2026-001", "12000.00"), ("HT-2026-002", "8600.00"),
          ("HT-2026-003", "5000.00"), None]
B_ROWS = [("HT-2026-001", "12000.00"), ("HT-2026-002", "8500.00"),
          None, ("HT-2026-004", "3200.00")]
VERDICTS = [("一致", "match", "equal"), ("Δ 100.00", "Δ 100.00", "diff"),
            ("仅 A", "only A", "orphan"), ("仅 B", "only B", "orphan")]

HERO = {
    "zh": dict(
        kicker="DeepSeek Harness · 表格对账插件",
        title="dsh-excel-reconcile",
        value=["两份表格，一个主键脊", "逐字段对照，只列差异"],
        sub="按主键对齐 → 按容差比较 → 报告 / JSON / 差异工作簿",
        meta="BigInt 金额 · 重复键整键跳过 · 无网络 · 不调模型",
        foot="Apache-2.0 · 只读输入 · 单一写入面",
        spread_title="对开两页 · 主键对齐",
        spread_pill="join=full · scale=2",
        sheet_a="A · 应收台账", sheet_b="B · 对账单",
        sheet_rows="3 行",
        col_key="合同号", col_amount="金额",
        empty="无",
        findings_title="findings[] · 3 条",
        findings_pill="1 error · 2 warn · 0 info",
        findings=[
            ("error", "number-diff", "HT-2026-002", "金额 8600.00 ≠ 8500.00"),
            ("warn", "missing-in-b", "HT-2026-003", "A 有 · B 无"),
            ("warn", "missing-in-a", "HT-2026-004", "B 有 · A 无"),
        ],
        art_title="三份产物",
        alt=[
            ("markdown", "给人读 · 固定带「边界」段"),
            ("resultJson", "给程序用 · summary + findings[]"),
            ("reconcile-diff.xlsx", "5 张表 · 可筛选"),
        ],
    ),
    "en": dict(
        kicker="DeepSeek Harness · spreadsheet reconcile plugin",
        title="dsh-excel-reconcile",
        value=["Two tables, one key spine", "Field by field, differences only"],
        sub="Key join → tolerance check → report / JSON / workbook",
        meta="BigInt money · duplicate keys skipped whole · no network · no model",
        foot="Apache-2.0 · read-only inputs · one write surface",
        spread_title="Open spread · key-aligned",
        spread_pill="join=full · scale=2",
        sheet_a="A · AR ledger", sheet_b="B · statement",
        sheet_rows="3 rows",
        col_key="key", col_amount="amount",
        empty="—",
        findings_title="findings[] · 3",
        findings_pill="1 error · 2 warn · 0 info",
        findings=[
            ("error", "number-diff", "HT-2026-002", "8600.00 ≠ 8500.00"),
            ("warn", "missing-in-b", "HT-2026-003", "only A"),
            ("warn", "missing-in-a", "HT-2026-004", "only B"),
        ],
        art_title="three artefacts",
        alt=[
            ("markdown", "for humans · boundary section"),
            ("resultJson", "for programs · summary + findings[]"),
            ("reconcile-diff.xlsx", "5 sheets · filterable"),
        ],
    ),
}


def sheet(img, s, box, label, count, rows, col_key, col_amount, empty,
          lang):
    """Draw one page of the spread: label, column header, key/amount rows."""
    x0, y0, x1, y1 = box
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(box, radius=18, fill=hx(s["sheet"]),
                        outline=hx(s["sheet_edge"]), width=1)
    write(img, (x0 + 14, y0 + 12), label, s, 13,
          "cjk" if lang == "zh" else "en_bold", "accent", (x1 - x0) - 70,
          11, f"hero.{lang}.sheet")
    d.text((x1 - 14, y0 + 15), count, font=font(11, "mono" if lang == "en"
                                                else "cjk"), fill=hx(s["faint"]),
           anchor="ra")
    write(img, (x0 + 14, y0 + 34), col_key, s, 11, "cjk", "faint")
    d.text((x1 - 14, y0 + 34), col_amount,
           font=font(11, "cjk" if lang == "zh" else "mono"),
           fill=hx(s["faint"]), anchor="ra")
    f = ImageDraw.Draw(img)
    f.line([x0 + 14, y0 + 50, x1 - 14, y0 + 50], fill=hx(s["sheet_edge"]),
           width=1)
    for i, row in enumerate(rows):
        base = y0 + 72 + i * 32
        if row is None:
            d = ImageDraw.Draw(img)
            d.rounded_rectangle([x0 + 14, base - 22, x1 - 14, base + 2],
                                radius=9,
                                fill=mix(s["sheet"], s["card_edge"], 0.30))
            d.text(((x0 + x1) / 2, base - 10), empty,
                   font=font(11, "cjk" if lang == "zh" else "mono"),
                   fill=hx(s["faint"]), anchor="mm")
            continue
        key, amount = row
        d.text((x0 + 14, base - 14), key, font=font(14, "mono"),
               fill=hx(s["text"]))
        d.text((x1 - 14, base - 14), amount, font=font(14, "mono"),
               fill=hx(s["warn"] if i == 1 else s["text"]), anchor="ra")


def hero(lang, skin_name):
    s = SKIN[skin_name]
    hm = HERO[lang]
    zh = lang == "zh"
    w, h = 1440, 576
    img = gradient(w, h, s["bg_from"], s["bg_to"])
    img = glow(img, 1220, 10, 470, hx(s["accent"]),
               20 if skin_name == "light" else 38)
    img = glow(img, 60, 560, 320, hx(s["accent"]),
               9 if skin_name == "light" else 15)
    img = dot_texture(img, hx(s["dot"]), 12 if skin_name == "light" else 20)

    # ---------------------------------------------------------- left column
    m = 60
    img = pill(img, (m, 54), hm["kicker"], s, size=20 if zh else 19,
               kind="cjk_bold" if zh else "en_bold")
    d = ImageDraw.Draw(img)
    tsize = fit(d, hm["title"], "mono", 620, 84, 54)
    if tsize < 56:
        WARNINGS.append(f"hero.{lang}.title only {tsize}px")
    d.text((m, 126), hm["title"], font=font(tsize, "mono"),
           fill=hx(s["text"]))
    title_bottom = 126 + tsize * 1.16

    vkind = "cjk_bold" if zh else "en_bold"
    vmax = 604
    vsize = 38 if zh else 32
    for line in hm["value"]:
        vsize = min(vsize, fit(d, line, vkind, vmax, vsize, 26))
    vtop = int(max(226, title_bottom + 34))
    for i, line in enumerate(hm["value"]):
        write(img, (m, vtop + i * int(vsize * 1.42)), line, s, vsize, vkind,
              "text", vmax, 26, f"hero.{lang}.value{i}")

    sub_top = vtop + len(hm["value"]) * int(vsize * 1.42) + 4
    write(img, (m + 2, sub_top), hm["sub"], s, 25, "cjk" if zh else "en",
          "sub", 604, 21, f"hero.{lang}.sub")
    meta_top = sub_top + 50
    write(img, (m + 2, meta_top), hm["meta"], s, 20, "cjk" if zh else "en",
          "faint", 604, 17, f"hero.{lang}.meta")

    d = ImageDraw.Draw(img)
    rule_y = meta_top + 44
    d.line([m + 2, rule_y, m + 604, rule_y], fill=hx(s["grid"]), width=2)
    write(img, (m + 2, rule_y + 18), hm["foot"], s, 17,
          "cjk" if zh else "en", "faint", 604, 14,
          f"hero.{lang}.foot")

    # ----------------------------------------- card 1: the two-page spread
    spread = (700, 44, 1380, 304)
    img = card(img, spread, s, radius=22)
    write(img, (724, 68), hm["spread_title"], s, 21,
          "cjk_bold" if zh else "en_bold", "text", 420, 16,
          f"hero.{lang}.spread_title")
    img = pill(img, (1356, 60), hm["spread_pill"], s, size=11.5, kind="mono",
               padx=13, pady=6, anchor="ra")

    a_box = (724, 104, 988, 292)
    b_box = (1092, 104, 1356, 292)
    hero_sheet_a = list(A_ROWS)
    hero_sheet_b = list(B_ROWS)
    sheet(img, s, a_box, hm["sheet_a"], hm["sheet_rows"], hero_sheet_a,
          hm["col_key"], hm["col_amount"], hm["empty"], lang)
    sheet(img, s, b_box, hm["sheet_b"], hm["sheet_rows"], hero_sheet_b,
          hm["col_key"], hm["col_amount"], hm["empty"], lang)

    # gutter verdicts: the spine of the spread
    d = ImageDraw.Draw(img)
    for i, (zh_text, en_text, kind) in enumerate(VERDICTS):
        baseline = 176 + i * 32
        mid = baseline - 6
        color = hx(s["warn"]) if kind in ("diff", "orphan") else hx(s["faint"])
        d.line([988, mid, 996, mid], fill=color, width=1)
        d.line([1084, mid, 1092, mid], fill=color, width=1)
        text = zh_text if zh else en_text
        f = font(11, "mono")
        bw = d.textlength(text, font=f) + 16
        bx = 1040 - bw / 2
        fill = hx(s["warn_soft"] if kind in ("diff", "orphan") else s["sheet"])
        edge = hx(s["warn"]) if kind == "diff" else hx(s["sheet_edge"])
        d.rounded_rectangle([bx, mid - 11, bx + bw, mid + 11], radius=11,
                            fill=fill, outline=edge, width=1)
        d.text((1040, mid - 1), text, font=f,
               fill=hx(s["warn"] if kind in ("diff", "orphan") else s["sub"]),
               anchor="mm")

    # ------------------------------------ card 2: findings -> three artefacts
    lower = (700, 316, 1380, 516)
    img = card(img, lower, s, radius=22)
    write(img, (724, 338), hm["findings_title"], s, 19,
          "cjk_bold" if zh else "en_bold", "text", 330, 15,
          f"hero.{lang}.findings_title")
    img = pill(img, (1356, 326), hm["findings_pill"], s, size=10.5, kind="mono",
               padx=11, pady=5, anchor="ra")
    d = ImageDraw.Draw(img)
    d.line([724, 362, 1096, 362], fill=hx(s["grid"]), width=1)

    for i, (sev, kind_text, key, detail) in enumerate(hm["findings"]):
        y = 384 + i * 38
        chip_bg = s["warn_soft"] if sev == "error" else s["sub_soft"]
        chip_fg = s["warn"] if sev == "error" else s["sub"]
        d.rounded_rectangle([724, y - 15, 770, y + 5], radius=10,
                            fill=hx(chip_bg))
        d.text((747, y - 5), sev, font=font(10.5, "mono"), fill=hx(chip_fg),
               anchor="mm")
        d.text((784, y - 13), kind_text, font=font(13.5, "mono"),
               fill=hx(s["text"]))
        d.text((1096, y - 11), key, font=font(11.5, "mono"), fill=hx(s["faint"]),
               anchor="ra")
        d.text((784, y + 6), detail,
               font=font(12, "cjk" if zh else "mono"), fill=hx(s["sub"]))

    # right half: three artefacts
    d.line([1118, 352, 1118, 506], fill=hx(s["grid"]), width=1)
    write(img, (1134, 352), hm["art_title"], s, 11,
          "cjk" if zh else "en", "faint")
    for i, (name, note) in enumerate(hm["alt"]):
        y = 376 + i * 40
        write(img, (1134, y), name, s, 14, "mono", "accent", 210, 11,
              f"hero.{lang}.art{i}")
        write(img, (1134, y + 19), note, s, 11, "cjk" if zh else "en", "sub",
              210, 9, f"hero.{lang}.artnote{i}")

    path = os.path.join(OUT, f"dsh-excel-reconcile-hero-{lang}-{skin_name}.webp")
    img.save(path, "WEBP", quality=92)
    print(f"wrote dsh-excel-reconcile-hero-{lang}-{skin_name}.webp")


# ------------------------------------------------------------- flow diagram
FLOW = {
    "light": dict(bg_from="#f9f6fd", bg_to="#e4eaf8", card="#ffffff",
                  edge="#e4e1ee", zone="#f5f2fb", text="#141419",
                  sub="#4d5261", faint="#8f94a4", accent="#4B67B4",
                  warn="#b0470f", good="#16a34a", pill="#ece7f9",
                  track="#eae6f3", grid="#e7e4f0", dot="#d9d3ea",
                  warn_soft="#fdf0e7", sub_soft="#eef0f7"),
    "dark": dict(bg_from="#131a2a", bg_to="#0c1016", card="#1b2231",
                 edge="#2e374b", zone="#171e2d", text="#f0f3f9",
                 sub="#a8b1c4", faint="#737b8d", accent="#8496f5",
                 warn="#d9a03c", good="#3fb950", pill="#242d42",
                 track="#243049", grid="#1e2636", dot="#26314a",
                 warn_soft="#3a2a1c", sub_soft="#232c44"),
}

MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace"
SANS = ("ui-sans-serif, system-ui, -apple-system, 'Segoe UI', "
        "'Microsoft YaHei', sans-serif")

A_FILE = "ar-ledger-a.csv"
B_FILE = "ar-ledger-b.csv"
FINDING_TYPES = {
    "error": [("number-diff", True), ("text-diff", False), ("date-diff", False),
              ("duplicate-key", False)],
    "warn": [("not-a-number", False), ("empty-key", False),
             ("missing-in-a", True), ("missing-in-b", True)],
}


def esc(text: str) -> str:
    return (text.replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;"))


def tw(text: str, size: float, mono: bool = True) -> float:
    """Conservative advance width: ASCII 0.62em (mono) / 0.56em, CJK 1em."""
    total = 0.0
    for ch in text:
        if ord(ch) > 0x2E7F:
            total += size
        else:
            total += size * (0.62 if mono else 0.56)
    return total


def text(x, y, body, size, color, family=MONO, weight=None, anchor=None,
         spacing=None, opacity=None):
    attrs = [f'x="{x}"', f'y="{y}"', f'fill="{color}"',
             f'font-family="{family}"', f'font-size="{size}"']
    if weight:
        attrs.append(f'font-weight="{weight}"')
    if anchor:
        attrs.append(f'text-anchor="{anchor}"')
    if spacing:
        attrs.append(f'letter-spacing="{spacing}"')
    if opacity:
        attrs.append(f'opacity="{opacity}"')
    return f'<text {" ".join(attrs)}>{esc(body)}</text>'


def chip(x, y, body, s, size=12, h=22, on=False, tone="accent", pad=9):
    width = round(tw(body, size) + pad * 2)
    if on:
        fill = s[tone if tone in ("accent", "warn", "good") else "accent"]
        fg = "#ffffff" if s["accent"] == "#4B67B4" else "#0c1016"
        stroke = fill
    else:
        fill = s["card"]
        fg = s["faint"]
        stroke = s["edge"]
    body_svg = (f'<rect x="{x}" y="{y}" width="{width}" height="{h}" rx="{h // 2}" '
                f'fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>'
                + text(x + width / 2, y + h / 2 + 4, body, size, fg,
                       anchor="middle"))
    return body_svg, width


def flow_svg(skin_name):
    s = FLOW[skin_name]
    dark = skin_name == "dark"
    p: list[str] = []
    shadow_op = "0.10" if not dark else "0.55"
    shadow_col = "#1b1735" if not dark else "#000000"

    p.append(
        f'''<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="660" viewBox="0 0 1100 660" role="img" aria-labelledby="fig-title fig-desc">
<title id="fig-title">dsh-excel-reconcile: two ledgers, one key spine, one verdict per field</title>
<desc id="fig-desc">Side A (AR ledger) and side B (statement) meet at a key spine that normalises keys and applies a join mode. Every matched key is answered field by field in a verdict column — A value, verdict, B value — with compare[] tolerance shown on the field. Keys present on one side only bypass the comparison band and enter the finding taxonomy directly. Eight finding types, split by severity, then fan out to the three artefacts: markdown, resultJson and the five-sheet diff workbook.</desc>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.36" y2="1">
    <stop offset="0" stop-color="{s['bg_from']}"/>
    <stop offset="1" stop-color="{s['bg_to']}"/>
  </linearGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="180%">
    <feDropShadow dx="0" dy="8" stdDeviation="11" flood-color="{shadow_col}" flood-opacity="{shadow_op}"/>
  </filter>
  <marker id="arrow" viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 1.7 L9 5 L0 8.3 z" fill="{s['accent']}"/>
  </marker>
  <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
    <circle cx="1.3" cy="1.3" r="1.3" fill="{s['dot']}"/>
  </pattern>
</defs>
<rect width="1100" height="660" fill="url(#bg)"/>
<rect width="1100" height="660" fill="url(#dots)" opacity=".42"/>
<text x="44" y="60" fill="{s['text']}" font-family="{MONO}" font-size="34" font-weight="700">dsh-excel-reconcile</text>
<text x="44" y="86" fill="{s['sub']}" font-family="{SANS}" font-size="15">two ledgers · one key spine · one verdict per field · three artefacts</text>
<rect x="726" y="34" width="330" height="32" rx="16" fill="{s['pill']}"/>
<text x="891" y="55" fill="{s['accent']}" font-family="{MONO}" font-size="12.5" text-anchor="middle">quickstart: 3 findings — 1 error · 2 warn</text>
<line x1="44" y1="102" x2="1056" y2="102" stroke="{s['grid']}" stroke-width="1.5"/>''')

    # ------------------------------------------------------ input cards A / B
    p.append(f'''<g filter="url(#soft)"><rect x="40" y="116" width="290" height="168" rx="20" fill="{s['card']}" stroke="{s['edge']}" stroke-width="1.5"/></g>
<text x="60" y="144" fill="{s['accent']}" font-family="{MONO}" font-size="14" letter-spacing="1.2">A · 应收台账</text>
<text x="60" y="170" fill="{s['text']}" font-family="{MONO}" font-size="16" font-weight="700">{A_FILE}</text>
<text x="60" y="194" fill="{s['sub']}" font-family="{MONO}" font-size="12.5">a.keys = 合同号 · 3 行</text>
<line x1="60" y1="206" x2="310" y2="206" stroke="{s['grid']}" stroke-width="1.4"/>
<text x="66" y="230" fill="{s['sub']}" font-family="{MONO}" font-size="12.5">HT-2026-001</text>
<text x="310" y="230" fill="{s['sub']}" font-family="{MONO}" font-size="12.5" text-anchor="end">12000.00</text>
<text x="66" y="252" fill="{s['text']}" font-family="{MONO}" font-size="12.5" font-weight="700">HT-2026-002</text>
<text x="310" y="252" fill="{s['warn']}" font-family="{MONO}" font-size="12.5" text-anchor="end">8600.00</text>
<text x="66" y="274" fill="{s['warn']}" font-family="{MONO}" font-size="12.5">HT-2026-003</text>
<text x="166" y="274" fill="{s['faint']}" font-family="{MONO}" font-size="11">only A</text>
<text x="310" y="274" fill="{s['sub']}" font-family="{MONO}" font-size="12.5" text-anchor="end">5000.00</text>''')

    p.append(f'''<g filter="url(#soft)"><rect x="770" y="116" width="290" height="168" rx="20" fill="{s['card']}" stroke="{s['edge']}" stroke-width="1.5"/></g>
<text x="790" y="144" fill="{s['accent']}" font-family="{MONO}" font-size="14" letter-spacing="1.2">B · 对账单</text>
<text x="790" y="170" fill="{s['text']}" font-family="{MONO}" font-size="16" font-weight="700">{B_FILE}</text>
<text x="790" y="194" fill="{s['sub']}" font-family="{MONO}" font-size="12.5">b.keys = 合同号 · 3 行</text>
<line x1="790" y1="206" x2="1040" y2="206" stroke="{s['grid']}" stroke-width="1.4"/>
<text x="796" y="230" fill="{s['sub']}" font-family="{MONO}" font-size="12.5">HT-2026-001</text>
<text x="1040" y="230" fill="{s['sub']}" font-family="{MONO}" font-size="12.5" text-anchor="end">12000.00</text>
<text x="796" y="252" fill="{s['text']}" font-family="{MONO}" font-size="12.5" font-weight="700">HT-2026-002</text>
<text x="1040" y="252" fill="{s['warn']}" font-family="{MONO}" font-size="12.5" text-anchor="end">8500.00</text>
<text x="796" y="274" fill="{s['warn']}" font-family="{MONO}" font-size="12.5">HT-2026-004</text>
<text x="896" y="274" fill="{s['faint']}" font-family="{MONO}" font-size="11">only B</text>
<text x="1040" y="274" fill="{s['sub']}" font-family="{MONO}" font-size="12.5" text-anchor="end">3200.00</text>''')

    # -------------------------------------------------------------- key spine
    p.append(f'''<g filter="url(#soft)"><rect x="372" y="116" width="356" height="168" rx="20" fill="{s['card']}" stroke="{s['edge']}" stroke-width="1.5"/></g>
<text x="392" y="144" fill="{s['text']}" font-family="{MONO}" font-size="17" font-weight="700">excel_reconcile</text>
<text x="392" y="166" fill="{s['sub']}" font-family="{MONO}" font-size="12">主键脊 · normaliseKey(NFKC · trim · upper)</text>''')

    # join-mode selector: `full` is the default and the active chip
    jx = 392
    for name, on in (("full", True), ("left", False), ("inner", False),
                     ("right", False)):
        body, width = chip(jx, 180, name, s, size=12, h=22, on=on)
        p.append(body)
        jx += width + 7
    p.append(text(392, 230, "matched 2 · only A 1 · only B 1", 12.5, s["sub"]))
    p.append(text(392, 252, "未匹配键绕过对照带 → missing-in-*", 11.5,
                  s["faint"]))
    p.append(text(392, 272, "config 随请求传入 · YAML / JSON", 11.5, s["faint"]))

    # A / B into the spine, then the spine down into the comparison band
    p.append(f'<path d="M330 200 H364" stroke="{s["accent"]}" stroke-width="2.2" '
             f'marker-end="url(#arrow)" opacity=".8"/>')
    p.append(f'<path d="M770 200 H736" stroke="{s["accent"]}" stroke-width="2.2" '
             f'marker-end="url(#arrow)" opacity=".8"/>')
    p.append(f'<line x1="550" y1="284" x2="550" y2="294" stroke="{s["accent"]}" '
             f'stroke-width="2.6" opacity=".85"/>')

    # ------------------------------------------------------- comparison band
    p.append(f'''<g filter="url(#soft)"><rect x="40" y="294" width="1020" height="184" rx="20" fill="{s['card']}" stroke="{s['edge']}" stroke-width="1.5"/></g>
<rect x="496" y="334" width="108" height="132" rx="14" fill="{s['accent']}" opacity="{0.05 if not dark else 0.10}"/>
<text x="64" y="320" fill="{s['text']}" font-family="{MONO}" font-size="14" font-weight="700">对照带 · 每个匹配行逐字段判定</text>
<text x="1036" y="320" fill="{s['sub']}" font-family="{MONO}" font-size="12" text-anchor="end">容差 = abs + rel × max(|A|, |B|)</text>
<line x1="64" y1="334" x2="1036" y2="334" stroke="{s['grid']}" stroke-width="1.4"/>
<text x="64" y="356" fill="{s['faint']}" font-family="{MONO}" font-size="11.5">字段 · kind</text>
<text x="490" y="356" fill="{s['faint']}" font-family="{MONO}" font-size="11.5" text-anchor="end">A · 应收台账</text>
<text x="550" y="356" fill="{s['accent']}" font-family="{MONO}" font-size="11.5" text-anchor="middle">判定</text>
<text x="610" y="356" fill="{s['faint']}" font-family="{MONO}" font-size="11.5">B · 对账单</text>
<text x="1036" y="356" fill="{s['faint']}" font-family="{MONO}" font-size="11.5" text-anchor="end">finding</text>''')

    # the matched key being answered (fixture row HT-2026-002)
    p.append(f'<rect x="372" y="304" width="180" height="26" rx="13" fill="{s["pill"]}"/>')
    p.append(text(462, 321, "matched · HT-2026-002", 11.5, s["accent"],
                  anchor="middle"))

    rows = [
        ("客户", "text", "乙公司", "乙公司", "一致", "equal", "text · same"),
        ("金额", "number · abs 0.01", "8600.00", "8500.00", "Δ 100.00",
         "diff", "number-diff · error"),
        ("到期日", "date", "2026-12-15", "2026-12-15", "一致", "equal",
         "date · same"),
    ]
    for i, (field, kind, a_value, b_value, verdict, tone, tag) in enumerate(rows):
        base = 386 + i * 30
        if tone == "diff":
            p.append(f'<rect x="56" y="{base - 22}" width="988" height="30" rx="9" '
                     f'fill="{s["warn_soft"]}" opacity=".9"/>')
            p.append(f'<rect x="56" y="{base - 22}" width="4" height="30" rx="2" '
                     f'fill="{s["warn"]}"/>')
        p.append(text(64, base, field, 15, s["text"], weight="700"))
        p.append(text(150, base - 1, kind, 11, s["faint"]))
        p.append(text(490, base, a_value, 14.5, s["text"], anchor="end"))
        vfill = s["warn_soft"] if tone == "diff" else s["sub_soft"]
        vedge = s["warn"] if tone == "diff" else s["edge"]
        vcolor = s["warn"] if tone == "diff" else s["sub"]
        p.append(f'<rect x="502" y="{base - 18}" width="96" height="25" rx="12" '
                 f'fill="{vfill}" stroke="{vedge}" stroke-width="1.1"/>')
        p.append(text(550, base - 1, verdict, 11.5, vcolor, anchor="middle"))
        p.append(text(610, base, b_value, 14.5, s["text"]))
        p.append(text(1036, base, tag, 11.5, s["faint"], anchor="end"))

    p.append(text(64, 470, "对照带内的每一行只回答「两侧字面是否一致」；不判断哪一侧正确",
                  11.5, s["faint"]))

    # --------------------------------------------------------------- findings
    p.append(text(64, 504, "findings[]", 14, s["text"], weight="700"))
    p.append(text(64, 524, "固定 8 种", 11.5, s["faint"]))
    p.append(text(176, 504, "error", 11.5, s["warn"], weight="700"))
    p.append(text(176, 532, "warn", 11.5, s["accent"], weight="700"))
    for group, top in (("error", 488), ("warn", 516)):
        cx = 222
        for name, fired in FINDING_TYPES[group]:
            tone = "warn" if group == "error" else "accent"
            body, width = chip(cx, top, name, s, size=11.5, h=22, on=fired,
                               tone=tone)
            p.append(body)
            cx += width + 8
    p.append(text(1036, 504, "severity 默认来自 compare[].severity", 11.5,
                  s["faint"], anchor="end"))
    p.append(text(1036, 524, "join=left 时 missing-in-b 升为 error", 11.5,
                  s["faint"], anchor="end"))

    # --------------------------------------------------------------- artefacts
    p.append(f'<line x1="203" y1="546" x2="895" y2="546" stroke="{s["accent"]}" '
             f'stroke-width="1.6" opacity=".6"/>')
    for x in (203, 549, 895):
        p.append(f'<path d="M{x - 5} 546 L{x + 5} 546 L{x} 555 Z" '
                 f'fill="{s["accent"]}" opacity=".75"/>')

    arts = [
        ("markdown", "给人读 · 固定带「边界」段", "renderMarkdown()"),
        ("resultJson", "给程序用 · summary + findings[]", "buildView()"),
        ("reconcile-diff.xlsx", "5 张表 · 差异明细可筛选",
         "写盘失败仍返回 base64"),
    ]
    for i, (name, note, foot) in enumerate(arts):
        x = 40 + i * 346
        p.append(f'<g filter="url(#soft)"><rect x="{x}" y="558" width="326" height="72" rx="18" fill="{s["card"]}" stroke="{s["edge"]}" stroke-width="1.5"/></g>')
        p.append(text(x + 18, 584, name, 14.5, s["accent"], weight="700"))
        p.append(text(x + 18, 604, note, 11.5, s["sub"], family=SANS))
        p.append(text(x + 18, 622, foot, 11, s["faint"]))

    p.append(text(44, 646, "money = BigInt minor units · duplicate keys rejected whole "
                  "· inputs read-only · one write surface · no network · no model call",
                  11.5, s["faint"]))
    p.append('</svg>')

    path = os.path.join(OUT, f"dsh-excel-reconcile-flow-v5-{skin_name}.svg")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(p) + "\n")
    print(f"wrote dsh-excel-reconcile-flow-v5-{skin_name}.svg")


def main():
    os.makedirs(OUT, exist_ok=True)
    for skin_name in ("light", "dark"):
        for lang in ("zh", "en"):
            hero(lang, skin_name)
        flow_svg(skin_name)
    if WARNINGS:
        print(f"{len(WARNINGS)} layout warning(s)")
    else:
        print("layout: no text overflow warnings")


if __name__ == "__main__":
    main()
