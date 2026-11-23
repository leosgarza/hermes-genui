#!/usr/bin/env python3
"""Truthful before/after visual evidence for the placement lever rebased on Living Boards.

Same markup, two trees: base main 1617ba7e vs the candidate. PNGs via genui_capture.render
(the repo's shipped CSS, renderer-equivalent DOM, settled static markup — no animations exist
in this fixture class, so the settled state IS the captured state); geometry COMPLETENESS and
placement are proven NUMERICALLY over the identical fixture with a Chrome dump-dom rect probe
(no vision on the worker). Writes evidence/ under this workspace and a JSON ledger.
"""
import json
import re
import subprocess
import sys
import tempfile
from html import unescape
from pathlib import Path

WS = Path("/Users/leocadiogarza/.hermes/kanban/workspaces/t_d19f0788")
sys.path.insert(0, "/Users/leocadiogarza/.hermes/cache/scratch/genui-enhancement/tools")
import genui_capture as gc  # noqa: E402

BASE = WS / "base"
CAND = WS / "repo"
OUT = WS / "evidence"
OUT.mkdir(exist_ok=True)
COL = 800.0


def kpis_row(base_id):
    cards = "".join(
        f'<div class="hb-kpi" id="{base_id}-c{i}"><div class="hb-kpi-label">Revenue</div>'
        f'<div class="hb-kpi-value">12.4M</div></div>' for i in (1, 2, 3))
    return f'<div class="hb-kpis" id="{base_id}">{cards}</div>'


def heading(t, id_):
    return f'<div class="hb-heading" id="{id_}">{t}</div>'


def note(t, id_):
    return f'<div class="hb-text" id="{id_}">{t}</div>'


def calc_card(id_):
    """The verdict as a capped card — the frozen 720px calculator root, exactly as the renderer emits it
    (the caps in calculator.css/chart.css; a capped card is what a placement ask visibly moves)."""
    return f'<div class="hb-card hb-calc" id="{id_}">Verdict: keep the index fund.</div>'


# Identical markup strings for base and candidate. The story: a placement ask on ONE block moves only that
# block; a board-level ask wraps every block, and each moves as its own width allows (a capped card sits at
# (COL-720)/2; a full-width line never shifts; the kpis row only since note-2's fix).
SCENARIOS = {
    "kpis-align-center": gc.place("center", kpis_row("h-kpis")),
    "center-one-block": (heading("Q3 verdict", "o-head")
                         + gc.place("center", calc_card("o-calc"))
                         + note("Notes and the rest of the board stay exactly where they always sat.", "o-note")
                         + kpis_row("o-kpis")),
    "whole-board": (gc.place("center", heading("Q3 verdict", "w-head"))
                    + gc.place("center", calc_card("w-calc"))
                    + gc.place("center", note("Notes and the rest of the board stay exactly where they always sat.", "w-note"))
                    + gc.place("center", kpis_row("w-kpis"))),
}
HEIGHTS = {"kpis-align-center": 190, "center-one-block": 330, "whole-board": 330}


def measure_probe(repo, board_html, width=800):
    """Chrome dump-dom over the identical fixture: id -> [x, y, w, h] relative to the .hb-blocks box."""
    css = "\n".join((repo / "web/src" / c).read_text() for c in gc.CSS_REL)
    js = ("const box=document.querySelector('.hb-blocks').getBoundingClientRect();"
          "const rows=[...document.querySelectorAll('[id]')].map(el=>{const r=el.getBoundingClientRect();"
          "return el.id+' '+(r.left-box.left).toFixed(1)+' '+(r.top-box.top).toFixed(1)+' '"
          "+r.width.toFixed(1)+' '+r.height.toFixed(1);});"
          "document.getElementById('out').textContent=rows.join('\\n');")
    html = (f"<!doctype html><html class='dark'><head><meta charset='utf-8'><style>{gc.DARK_VARS}"
            f"body{{margin:0;background:#0d1117;padding:24px;font-family:-apple-system,system-ui,sans-serif;}}"
            f"{css}</style></head><body><div class='hb-blocks' style='width:{width}px'>{board_html}</div>"
            f"<pre id='out' style='display:none'></pre><script>{js}</script></body></html>")
    with tempfile.TemporaryDirectory() as work:
        page = Path(work) / "probe.html"
        page.write_text(html)
        cmd = [gc.find_chrome(), "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
               "--force-device-scale-factor=1", f"--user-data-dir={Path(work)/'prof'}",
               "--virtual-time-budget=2000", "--dump-dom", f"file://{page}"]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    m = re.search(r"<pre id=[\"']out[\"'][^>]*>(.*?)</pre>", proc.stdout, re.S)
    assert m, f"probe never reported: {proc.stderr[-300:]}"
    rows = {}
    for line in unescape(m.group(1)).strip().splitlines():
        bits = line.split()
        rows[bits[0]] = [float(v) for v in bits[1:]]
    return rows


def near(a, b, eps=1.0):
    return abs(a - b) <= eps


def check(name, side, rects):
    """Numeric completeness + placement proof over the identical fixture (asserts, and returns the facts)."""
    facts = {}
    if name == "kpis-align-center":
        for c in ("h-kpis-c1", "h-kpis-c2", "h-kpis-c3"):
            assert rects[c][2] > 100 and rects[c][3] > 40, (c, rects[c])
        x0 = rects["h-kpis-c1"][0]
        r2 = rects["h-kpis-c3"][0] + rects["h-kpis-c3"][2]
        assert near(rects["h-kpis"][2], COL), rects["h-kpis"]  # the row box fills its column either way
        if side == "candidate":  # the ask centers the CARDS, not the box (note 2's fix)
            assert x0 > 20 and near(x0, COL - r2, 3.0), (x0, r2)
        else:  # base: same markup, no placement CSS — cards park flush left, the invisible-ask defect
            assert near(x0, 0.0), x0
        facts = {"first_card_x": x0, "last_card_right": r2, "row_width": rects["h-kpis"][2]}
    elif name == "center-one-block":
        assert rects["o-head"][2] > 400, rects["o-head"]
        assert rects["o-note"][2] > 400, rects["o-note"]
        for c in ("o-kpis-c1", "o-kpis-c3"):
            assert rects[c][2] > 100 and rects[c][3] > 40, (c, rects[c])
        cx, cw = rects["o-calc"][0], rects["o-calc"][2]
        kx = rects["o-kpis-c1"][0]
        if side == "candidate":  # only the asked block moves: card at (800-720)/2; the row nobody asked stays left
            assert near(cw, 720.0), cw
            assert near(cx, (COL - 720.0) / 2), cx
            assert near(kx, 0.0), kx
        else:  # base: the wrapper is inert, the cap rule cannot reach through it — a full-width box at left
            assert near(cx, 0.0, 2.0), cx
            assert near(cw, COL, 2.0), cw
            assert near(kx, 0.0), kx
        facts = {"calc_x": cx, "calc_w": cw, "kpis_first_card_x": kx}
    elif name == "whole-board":
        for bid in ("w-head", "w-note", "w-calc", "w-kpis-c1", "w-kpis-c3"):
            assert bid in rects, (bid, sorted(rects))
        cx, cw = rects["w-calc"][0], rects["w-calc"][2]
        kx = rects["w-kpis-c1"][0]
        kr = rects["w-kpis-c3"][0] + rects["w-kpis-c3"][2]
        if side == "candidate":  # the cascade wraps all; capped card centers, kpis cards center, lines stay full
            assert near(cw, 720.0), cw
            assert near(cx, (COL - 720.0) / 2), cx
            assert kx > 20 and near(kx, COL - kr, 3.0), (kx, kr)
            assert near(rects["w-head"][0], 0.0) and rects["w-head"][2] > 400, rects["w-head"]
        else:
            assert near(cx, 0.0, 2.0) and near(cw, COL, 2.0), (cx, cw)
            assert near(kx, 0.0), kx
        facts = {"calc_x": cx, "calc_w": cw, "kpis_first_card_x": kx, "kpis_last_card_right": kr}
    return facts


ledger = {}
for name, markup in SCENARIOS.items():
    entry = {"scenario": name}
    for side, repo in (("base", BASE), ("candidate", CAND)):
        png = OUT / f"{name}-{side}.png"
        gc.render(repo, markup, png, width=int(COL), height=HEIGHTS[name])
        png2 = OUT / f"{name}-{side}-repeat.png"
        gc.render(repo, markup, png2, width=int(COL), height=HEIGHTS[name])
        sha1 = subprocess.run(["shasum", "-a", "256", str(png)], capture_output=True, text=True).stdout.split()[0]
        sha2 = subprocess.run(["shasum", "-a", "256", str(png2)], capture_output=True, text=True).stdout.split()[0]
        rects = measure_probe(repo, markup)
        entry[side] = {"png_sha256": sha1, "repeat_sha256": sha2, "reproducible": sha1 == sha2,
                       "rect_count": len(rects), "facts": check(name, side, rects)}
        print(f"{name}/{side}: ok sha={sha1[:12]} repro={sha1 == sha2}")
    ledger[name] = entry
(OUT / "capture-ledger.json").write_text(json.dumps(ledger, indent=1))
print("EVIDENCE DONE")
