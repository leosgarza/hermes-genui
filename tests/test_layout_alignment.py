# Real-browser layout regression for block placement (t_b6642ef1, review round 1).
#
# jsdom never lays anything out, so the width defect the Reviewer measured — cross-axis auto margins on a flex
# column child shrinking a capped card from 720px to its content (720 → 58.875px, and a stretched block 1100 →
# 30.203px) — slipped past the declaration-only tests. This test feeds Chrome (headless) the repo's own stylesheets
# with the DOM the frozen renderer draws, and asserts the measured rects: placed cards keep their exact unplaced
# width, full-width blocks stay at the container width, nested blocks fill their cells, row cells stretch, and a
# narrow container places without shrinking. Skipif only when no Chrome binary exists on this machine.
import html
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "web" / "src"
CSS = [
    SRC / "styles" / "tokens.css",
    SRC / "styles" / "shared.css",
    SRC / "blocks" / "layout" / "layout.css",
    SRC / "blocks" / "calculator" / "calculator.css",
    SRC / "blocks" / "chart" / "chart.css",
    SRC / "blocks" / "table" / "table.css",
]

CHROME_CANDIDATES = [
    Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    Path("/usr/bin/google-chrome"),
    Path("/usr/bin/chromium"),
    Path("/usr/bin/chromium-browser"),
]


def find_chrome() -> Path | None:
    env = os.environ.get("HB_CHROME")
    if env and Path(env).exists():
        return Path(env)
    for name in ("chrome", "google-chrome", "chromium", "chromium-browser"):
        found = shutil.which(name)
        if found:
            return Path(found)
    for cand in CHROME_CANDIDATES:
        if cand.exists():
            return cand
    return None


CHROME = find_chrome()


def place(word: str, inner: str) -> str:
    return f'<div class="hb-place hb-place-{word}" data-align="{word}">{inner}</div>'


def calc(id_: str) -> str:
    return f'<div class="hb-card hb-calc" id="{id_}">Example</div>'


def text(id_: str) -> str:
    return f'<div class="hb-text" id="{id_}">A prose block long enough to fill a wide column of the chat.</div>'


def table(id_: str) -> str:
    rows = "<tr><td>City</td><td>Deg</td></tr><tr><td>Rome</td><td>21</td></tr>"
    return f'<div class="hb-card hb-table-card" id="{id_}"><table>{rows}</table></div>'


def wide_chart(id_: str) -> str:
    return f'<figure class="hb-card hb-chart hb-chart-wide" id="{id_}">Long line</figure>'


def grid(id_: str, cells: list[str]) -> str:
    inner = "".join(f'<div class="hb-grid-cell">{c}</div>' for c in cells)
    return f'<div class="hb-grid" id="{id_}">{inner}</div>'


def measure_script() -> str:
    return """
    const roots = [...document.querySelectorAll("[data-root]")];
    const out = roots.map((root) => {
      const rb = root.getBoundingClientRect();
      const els = [root, ...root.querySelectorAll("[id]")];
      return els.map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.id} ${r.width.toFixed(3)} ${(r.left - rb.left).toFixed(3)} ${r.height.toFixed(3)}`;
      });
    }).flat();
    document.getElementById("out").textContent = out.join("\\n");
    """


def fixture_html() -> str:
    css = "\n".join(p.read_text() for p in CSS)
    board = f"""
    <div class="hb-blocks" data-root id="wide">
      {calc("calc-left")}
      {place("center", calc("calc-center"))}
      {place("right", calc("calc-right"))}
      {text("prose-left")}
      {place("center", text("prose-center"))}
      {place("right", text("prose-right"))}
      {wide_chart("chart-left")}
      {place("center", wide_chart("chart-center"))}
      {table("table-left")}
      {place("center", table("table-center"))}
      {place("right", table("table-right"))}
    </div>
    """
    # Surviving containers: a grid places its children without touching its cells (paired grids compare placed
    # against unplaced at identical geometry), and a row's placed child stretches like its direct sibling.
    plain = '<div class="hb-card hb-calc" id="row-plain">Example<br>Another line<br>And one more</div>'
    nested = f"""
    {grid("grid-a", [calc("a1"), calc("a2")])}
    {grid("grid-b", [place("center", calc("b1")), place("center", calc("b2"))])}
    <div class="hb-row" data-root id="row">
      <div class="hb-row-cell">{place("center", calc("row-placed"))}</div>
      <div class="hb-row-cell">{plain}</div>
    </div>
    """
    nested_board = f'<div class="hb-blocks" data-root id="nested">{nested}</div>'
    # A narrow container: the cap clamps below the board width; nothing shrinks and nothing shifts.
    narrow = f"""
    <div style="width: 360px">
      <div class="hb-blocks" data-root id="narrow">
        {calc("narrow-left")}
        {place("center", calc("narrow-center"))}
        {place("right", calc("narrow-right"))}
      </div>
    </div>
    """
    body = board + nested_board + narrow
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<style>{css}</style></head>"
        f"<body style='margin:0;width:1200px'>{body}"
        "<pre id='out' style='display:none'></pre>"
        f"<script>{measure_script()}</script></body></html>"
    )


@pytest.fixture(scope="module")
def rects() -> dict[str, tuple[float, float, float]]:
    if CHROME is None:
        pytest.skip("no Chrome/Chromium binary on this machine")
    with tempfile.TemporaryDirectory() as work:
        page = Path(work) / "probe.html"
        page.write_text(fixture_html())
        profile = Path(work) / "profile"
        profile.mkdir()
        cmd = [
            str(CHROME), "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
            "--force-device-scale-factor=1", f"--user-data-dir={profile}",
            "--virtual-time-budget=2000", "--dump-dom", f"file://{page}",
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        m = re.search(r"<pre id=\"out\"[^>]*>(.*?)</pre>", proc.stdout, re.S)
        assert m, f"probe never reported; chrome said: {proc.stderr[-400:]}"
        report = html.unescape(m.group(1)).strip()
    out: dict[str, tuple[float, float, float]] = {}
    for line in report.splitlines():
        bits = line.split()
        assert len(bits) == 4, line
        out[bits[0]] = (float(bits[1]), float(bits[2]), float(bits[3]))
    return out


def near(a: float, b: float, eps: float = 1.0) -> bool:
    return abs(a - b) <= eps


class TestPlacementSizing:
    """The reviewer's repro: a placed card must keep the width it had unplaced, at every word and every width."""

    def test_capped_card_keeps_720_at_left_center_right(self, rects):
        w, x, _ = rects["calc-left"]
        assert near(w, 720.0), w
        assert near(x, 0.0), x
        w, x, _ = rects["calc-center"]
        assert near(w, 720.0), w          # NOT ~58.875: the content width never replaces the cap
        assert near(x, (1100.0 - 720.0) / 2), x
        w, x, _ = rects["calc-right"]
        assert near(w, 720.0), w
        assert near(x + w, 1100.0), x + w  # hugs the right edge

    def test_full_width_prose_and_wide_chart_unaffected(self, rects):
        for id_ in ("prose-left", "prose-center", "prose-right"):
            w, x, _ = rects[id_]
            assert near(w, 1100.0), (id_, w)      # NOT ~30px: stretched blocks stay the column width
            assert near(x, 0.0), (id_, x)
        w, x, _ = rects["chart-center"]
        assert near(w, 1100.0), w
        assert near(x, 0.0), x

    def test_fit_content_table_keeps_hugging_and_shifts(self, rects):
        w0, x0, _ = rects["table-left"]
        w, x, _ = rects["table-center"]
        assert near(w, w0), (w, w0)                # hugging is its width; placing must not fatten or shrink it
        assert x > x0, (x, x0)
        w, x, _ = rects["table-right"]
        assert near(w, w0), w
        assert near(x + w, 1100.0), x + w

    def test_nested_grid_places_children_at_cell_width(self, rects):
        # Two identical grids; in grid-b every cell's block is placed center. Cells must be where they were and the
        # placed card as wide as the unplaced one — a place inside a cell sizes exactly like the cell did before.
        for a, b in (("a1", "b1"), ("a2", "b2")):
            assert near(rects[b][0], rects[a][0]), (b, rects[b][0], rects[a][0])
        for cell_a, cell_b in (("grid-a", "grid-b"),):
            assert near(rects[cell_b][0], rects[cell_a][0]), cell_b

    def test_row_cell_stretch_survives_a_place(self, rects):
        wp, xp, hp = rects["row-placed"]
        wu, xu, hu = rects["row-plain"]
        assert near(wp, wu), (wp, wu)   # same cell width both cells share
        assert near(hp, hu), (hp, hu)   # flex:1 reached through the place: heights end together

    def test_narrow_container_places_without_shrinking(self, rects):
        w0, x0, _ = rects["narrow-left"]
        assert near(w0, 360.0), w0      # cap above board width: the block fills 360
        for id_ in ("narrow-center", "narrow-right"):
            w, x, _ = rects[id_]
            assert near(w, 360.0), (id_, w)
            assert near(x, x0), (id_, x)  # no free space to share: nothing moves, nothing shrinks
