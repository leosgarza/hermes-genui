# Real-browser layout regression for block placement (t_b6642ef1, review round 1).
#
# jsdom never lays anything out, so the width defect the Reviewer measured — cross-axis auto margins on a flex
# column child shrinking a capped card from 720px to its content (720 → 58.875px, and a stretched block 1100 →
# 30.203px) — slipped past the declaration-only tests. This test feeds Chrome (headless) the repo's own stylesheets
# with the DOM the frozen renderer draws, and asserts the measured rects: placed cards keep their exact unplaced
# width, full-width blocks stay at the container width, nested blocks fill their cells, row cells stretch, and a
# narrow container places without shrinking. Skipif only when no Chrome binary exists on this machine.
# Round 3 (t_4c0e43aa) adds the provenance footer: the absorbed source block sits on its own full-width row, and
# that row must measure EXACTLY like the same asks drawn by a no-provenance board — a place squeezed into the
# join line's flex row shrink-wraps instead (the Reviewer's [8,29.09] on an 800px board). The negative
# control keeps that defect shape measurable, so the probe proves it is reading real geometry, not classes.
# Round 4 (t_2ef3fa9e) removes the reader's chips (placement is the model's cascade alone: block, board, left —
# the override fixture rows go with them) and adds the model's text voice: `text_align` must center or right-set
# a text block's words WITHOUT moving or resizing its box (placement and voice are separate rules), a plain
# placement must never imply a voice, and an attribute without its class must compute to the left default —
# the probe reports getComputedStyle().textAlign, so both controls prove it reads the cascade, not the markup.
# Round 5 (the review of t_2ef3fa9e) closes the hole that class left: a COMPUTED voice over a SHRINK-WRAPPED
# flex body moves nothing (the callout's body beside its icon measured exactly its text width, words parked at
# the left, while textAlign said "center"). Computed style is therefore no longer evidence: the probe now
# measures the first line of every text-bearing kind with a real Range rect, and keeps the defect itself
# measurable as the #neg-voice control — same shipped markup, hug restored by a scoped rule that is not CSS.
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
    SRC / "blocks" / "source" / "source.css",
    SRC / "blocks" / "callout" / "callout.css",
    SRC / "blocks" / "atoms" / "atoms.css",
    SRC / "blocks" / "kpis" / "kpis.css",
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


def place(word: str, inner: str, id_: str = "") -> str:
    tag = f' id="{id_}"' if id_ else ""
    return f'<div class="hb-place hb-place-{word}"{tag} data-align="{word}">{inner}</div>'


def ta(word: str, inner: str, id_: str = "") -> str:
    """A text voice alone: the wrapper the frozen renderer grows when only `text_align` asks (no position)."""
    tag = f' id="{id_}"' if id_ else ""
    return f'<div class="hb-place hb-ta-{word}"{tag} data-text-align="{word}">{inner}</div>'


def ta_both(pos: str, word: str, inner: str, id_: str = "") -> str:
    """Both voices on the one wrapper: the card sits at `pos`, its words read at `word`."""
    return (f'<div class="hb-place hb-place-{pos} hb-ta-{word}" id="{id_}" '
            f'data-align="{pos}" data-text-align="{word}">{inner}</div>')


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


def stat_card(base: str) -> str:
    """A lone stat exactly as the frozen renderer draws it: a card whose column-flex lines stretch across it."""
    return (f'<div class="hb-card hb-kpi" id="{base}-box">'
            f'<div class="hb-kpi-label">Revenue</div>'
            f'<div class="hb-kpi-value" id="{base}-value" data-word>12.4M</div></div>')


def callout(base: str, words: str = "Short note") -> str:
    """A callout as the frozen renderer draws it: tinted box, fixed icon, flex body beside it. The body is the
    text-bearing line box; it hugs its words unless the voice opens it (round 5)."""
    icon = '<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"></svg>'
    return (f'<div class="hb-callout hb-callout-info" id="{base}-box">'
            f'<span class="hb-callout-icon" id="{base}-icon">{icon}</span>'
            f'<div class="hb-callout-body" id="{base}-body">'
            f'<div id="{base}-words" data-word>{words}</div></div></div>')


CO_LONG = ("A note long enough to wrap: it must break across at least two lines inside the opened body, "
           "so every line shows a line box and not a hug of one tight word.")


PROV_LINE = ('<div class="hb-provenance-line"><span class="hb-provenance-time">2026-11-18</span>'
             '<span class="hb-provenance-dot" aria-hidden="true">·</span>'
             '<span class="hb-provenance-badge" data-live="snapshot">Snapshot</span></div>')


def footer(word: str, src_id: str) -> str:
    """The DOM the frozen renderer draws for a declaring board whose absorbed source block lands at `word`
    (a left ask sits bare, exactly like any block that sits left)."""
    src = f'<div class="hb-source" id="{src_id}">BLS</div>'
    row = src if word == "left" else place(word, src, f"{src_id}-place")
    return f'<div class="hb-provenance">{row}{PROV_LINE}</div>'


def measure_script() -> str:
    return """
    const roots = [...document.querySelectorAll("[data-root]")];
    const out = roots.map((root) => {
      const rb = root.getBoundingClientRect();
      const els = [root, ...root.querySelectorAll("[id]")];
      const rows = els.map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.id} ${r.width.toFixed(3)} ${(r.left - rb.left).toFixed(3)} ${r.height.toFixed(3)} ` +
          `${getComputedStyle(el).textAlign}`;
      });
      // Round 5: the words themselves. A Range over a text-bearing element answers with one rect per line
      // fragment; the first is where the words actually sit, in real layout, not in computed style.
      for (const el of root.querySelectorAll("[data-word]")) {
        const rng = document.createRange();
        rng.selectNodeContents(el);
        const r = rng.getClientRects()[0];
        const w = r ?? {width: 0, left: rb.left, height: 0};
        rows.push(`word-${el.id} ${w.width.toFixed(3)} ${(w.left - rb.left).toFixed(3)} ` +
          `${w.height.toFixed(3)} ${getComputedStyle(el).textAlign}`);
      }
      return rows;
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
      {ta("center", text("prose-ta-center"), "prose-ta-center-place")}
      {ta("right", text("prose-ta-right"), "prose-ta-right-place")}
      {ta_both("right", "center", text("prose-pos-right-ta-center"), "prose-both-place")}
      {place("center", text("prose-plain-inside"), "prose-plain-inside-place")}
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
    # The provenance footer (t_4c0e43aa round 3): the absorbed source lands through the same placement
    # machinery as any block, on a row of its own — measured here against the identical asks drawn by a
    # board with no provenance.
    prov = f"""
    <div class="hb-blocks" data-root id="prov" style="width:800px">
      {footer("left", "f-left")}
      {footer("center", "f-center")}
      {footer("right", "f-right")}
    </div>
    """
    ctrl = f"""
    <div class="hb-blocks" data-root id="ctrl" style="width:800px">
      <div class="hb-source" id="c-left">BLS</div>
      {place("center", '<div class="hb-source" id="c-center">BLS</div>', "c-center-place")}
      {place("right", '<div class="hb-source" id="c-right">BLS</div>', "c-right-place")}
      <div class="hb-place" data-text-align="center" id="ta-attr-only">
        <div class="hb-text" id="ta-attr-inside">Attribute without its class must read left.</div>
      </div>
    </div>
    """
    # The negative control keeps the CURRENT defect measurable: the same placed source squeezed into a flex
    # ROW footer — the shape the Reviewer measured in Chrome (place [8,29.09] on an 800px board). The rule
    # below is NOT shipped CSS; it is scoped to #neg-ctrl on purpose, so the probe provably reads geometry
    # and the fix is exactly what changes the numbers above it.
    neg = f"""
    <div class="hb-blocks" data-root id="neg-ctrl" style="width:800px">
      <div class="hb-provenance">
        {place("right", '<div class="hb-source" id="neg-src">BLS</div>', "neg-place")}
        <span class="hb-provenance-dot" aria-hidden="true">·</span>
        <span class="hb-provenance-time">2026-11-18</span>
      </div>
    </div>
    """
    neg_css = "\n#neg-ctrl .hb-provenance { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }\n"
    # Round 5: the voice measured on the words, every text-bearing kind the renderer applies it to, at the
    # Reviewer's 800px board with SHORT words — a hug is only visible when the words are short. Left asks sit
    # bare (the frozen renderer grows no wrapper for left), center/right through the one voice wrapper.
    voice = f"""
    <div class="hb-blocks" data-root id="voice" style="width:800px">
      <div class="hb-heading" id="v-head-l" data-word>Quarterly note</div>
      {ta("center", '<div class="hb-heading" id="v-head-c" data-word>Quarterly note</div>', "v-head-c-place")}
      {ta("right", '<div class="hb-heading" id="v-head-r" data-word>Quarterly note</div>', "v-head-r-place")}
      <div class="hb-text" id="v-text-l" data-word>Short note</div>
      {ta("center", '<div class="hb-text" id="v-text-c" data-word>Short note</div>', "v-text-c-place")}
      {ta("right", '<div class="hb-text" id="v-text-r" data-word>Short note</div>', "v-text-r-place")}
      {stat_card("v-stat-l")}
      {ta("center", stat_card("v-stat-c"), "v-stat-c-place")}
      {ta("right", stat_card("v-stat-r"), "v-stat-r-place")}
      {callout("v-co-l")}
      {ta("center", callout("v-co-c"), "v-co-c-place")}
      {ta("right", callout("v-co-r"), "v-co-r-place")}
      {ta("center", callout("v-co-long", CO_LONG), "v-co-long-c-place")}
    </div>
    """
    # The negative control keeps THIS round's defect measurable forever: the shipped callout markup under a
    # scoped rule that is NOT shipped CSS — the body's pre-fix hug restored. The class computes "center" and
    # the words stay parked beside the icon: exactly what the Reviewer measured (body == text width at 800px).
    neg_voice = f"""
    <div class="hb-blocks" data-root id="neg-voice" style="width:800px">
      {callout("neg-co-l")}
      {ta("center", callout("neg-co-c"), "neg-co-c-place")}
    </div>
    """
    neg_css += "\n#neg-voice .hb-callout-body { flex: 0 1 auto; }\n"
    body = board + nested_board + narrow + prov + ctrl + neg + voice + neg_voice
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<style>{css}\n{neg_css}</style></head>"
        f"<body style='margin:0;width:1200px'>{body}"
        "<pre id='out' style='display:none'></pre>"
        f"<script>{measure_script()}</script></body></html>"
    )


@pytest.fixture(scope="module")
def report() -> dict[str, tuple[float, float, float, str]]:
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
        text = html.unescape(m.group(1)).strip()
    out: dict[str, tuple[float, float, float, str]] = {}
    for line in text.splitlines():
        bits = line.split()
        assert len(bits) == 5, line
        out[bits[0]] = (float(bits[1]), float(bits[2]), float(bits[3]), bits[4])
    return out


@pytest.fixture(scope="module")
def rects(report) -> dict[str, tuple[float, float, float]]:
    """id → (width, left edge, height), as Chrome measured them."""
    return {k: v[:3] for k, v in report.items()}


@pytest.fixture(scope="module")
def aligns(report) -> dict[str, str]:
    """id → getComputedStyle().textAlign, as Chrome resolved it."""
    return {k: v[3] for k, v in report.items()}


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


class TestProvenancePlacement:
    """The footer's absorbed source block is placed by the very machinery the board uses — proven with real
    Chrome geometry at the Reviewer's 800px width, not with class names jsdom cannot lay out."""

    def test_the_place_boxes_span_the_footer_row_at_the_off_left_words(self, rects):
        # 800px board: each placed row fills it — left edge at 0, right edge at 800 — never the shrink-
        # wrapped ~29px the Reviewer measured when the place sat as a child of the flex-row footer.
        for word in ("f-center", "f-right"):
            w, x, _ = rects[f"{word}-place"]
            assert near(w, 800.0), (word, w)
            assert near(x, 0.0), (word, x)

    def test_the_footer_source_measures_exactly_like_the_plain_board(self, rects):
        # Width and left edge, word by word, against identical asks drawn without provenance. A filling
        # element keeps the full row at every word (the accepted prose semantics the first class pins);
        # what placement must never lose is the box a board gives the block in the first place.
        for word in ("left", "center", "right"):
            assert rects[f"f-{word}"][:2] == pytest.approx(rects[f"c-{word}"][:2], abs=0.01), word

    def test_no_reader_override_mechanism_reaches_the_footer(self, rects):
        # The chips are gone (t_2ef3fa9e): the only right-word row the footer draws is the model's own ask,
        # and it measures like the plain right ask. There is no override fixture any more — placement has
        # exactly one author.
        assert rects["f-right"][:2] == pytest.approx(rects["c-right"][:2], abs=0.01)

    def test_negative_control_shrinkwraps_the_way_the_defect_did(self, rects):
        # The same right ask squeezed into a flex-row footer — the old shape, kept measurable on purpose:
        # the place hugs its content and the source stays pinned at the left edge of an 800px board. If
        # these numbers ever match the fixed rows, this probe has stopped reading real geometry.
        pw, px, _ = rects["neg-place"]
        sw, sx, _ = rects["neg-src"]
        assert pw < 100.0, pw             # ~29px of content where the footer row gives 800
        assert near(px, 0.0), px
        assert near(sx, 0.0), sx          # the right-aligned source stuck at the left edge
        assert sw < 100.0, sw
        assert rects["f-right"][:2] != pytest.approx(rects["neg-src"][:2], abs=1.0)


class TestTextVoice:
    """`text_align` moves the words inside a text block and nothing else (t_2ef3fa9e): the voice is computed
    from the repo's own cascade, measured by Chrome — and the box around it keeps exactly the width and place
    placement gave it, so the two rules cannot trade damage."""

    def test_a_text_voice_reads_at_its_word_and_keeps_the_column(self, rects, aligns):
        for word in ("center", "right"):
            w, x, _ = rects[f"prose-ta-{word}-place"]
            assert near(w, 1100.0), (word, w)        # the wrapper fills the column exactly like an unplaced prose line
            assert near(x, 0.0), (word, x)           # the voice moves no box
            assert aligns[f"prose-ta-{word}-place"] == word
            assert aligns[f"prose-ta-{word}"] == word  # and the words inherit it

    def test_position_and_voice_share_one_box_without_disturbing_each_other(self, rects, aligns):
        w, x, _ = rects["prose-both-place"]
        assert near(w, 1100.0), w                    # a prose box fills its column at any position word
        assert near(x, 0.0), x
        assert aligns["prose-both-place"] == "center"
        assert aligns["prose-pos-right-ta-center"] == "center"

    def test_plain_placement_never_implies_a_voice(self, rects, aligns):
        # A card placed center still reads its words left: the two asks are separate rules.
        assert aligns["prose-plain-inside-place"] in ("start", "left")
        assert aligns["prose-plain-inside"] in ("start", "left")
        w, x, _ = rects["prose-plain-inside-place"]
        assert near(w, 1100.0) and near(x, 0.0), (w, x)

    def test_negative_control_an_attribute_without_its_class_reads_default(self, aligns):
        # The probe resolves real CSS: the data-text-align mark on its own moves nothing. If these ever
        # report "center", the test is reading markup, not the cascade — same trick as the shrink-wrap control.
        assert aligns["ta-attr-only"] in ("start", "left")
        assert aligns["ta-attr-inside"] in ("start", "left")


class TestVoiceWords:
    """Round 5: the voice is measured on the WORDS, not on computed style. A text-align over a shrink-wrapped
    flex body computes "center" while every word stands still beside the icon — the defect this round fixes.
    Every text-bearing kind (heading, text, stat, callout) gets short words at left/center/right on an 800px
    board, and each assertion reads the Range rect of the first line Chrome actually laid out."""

    # (left, center, right) ids of each kind's data-word element: the line box the words fill.
    LINE_BOXES = [
        ("v-head-l", "v-head-c", "v-head-r"),
        ("v-text-l", "v-text-c", "v-text-r"),
        ("v-stat-l-value", "v-stat-c-value", "v-stat-r-value"),
        ("v-co-l-words", "v-co-c-words", "v-co-r-words"),
    ]

    def test_words_land_where_the_voice_put_them(self, rects):
        for lid, cid, rid in self.LINE_BOXES:
            for ask, el in (("left", lid), ("center", cid), ("right", rid)):
                cw, cx, _ = rects[el]              # the element's own box: the line box to distribute across
                ww, wx, _ = rects[f"word-{el}"]    # the first line of the words inside it
                if ask == "left":
                    assert near(wx, cx, 2.5), (el, wx, cx)
                elif ask == "center":
                    assert ww < cw - 40.0, (el, ww, cw)   # short words in a line box wide enough to centre
                    assert near(wx + ww / 2, cx + cw / 2, 2.5), (el, wx, ww, cx, cw)
                else:
                    assert ww < cw - 40.0, (el, ww, cw)
                    assert near(wx + ww, cx + cw, 2.5), (el, wx, ww, cx, cw)

    def test_the_voice_moves_the_words_and_no_box(self, rects):
        for lid, cid, rid in self.LINE_BOXES:
            _, lx, _ = rects[f"word-{lid}"]
            _, cx, _ = rects[f"word-{cid}"]
            _, rx, _ = rects[f"word-{rid}"]
            assert cx > lx + 200.0, (lid, cx, lx)   # the words actually travelled, not merely computed
            assert rx > cx + 100.0, (rid, rx, cx)
        # and the voice never touched a box: every wrapper fills the board exactly like a bare block did.
        for wrapper in ("v-head-c", "v-head-r", "v-text-c", "v-text-r", "v-stat-c", "v-stat-r",
                        "v-co-c", "v-co-r", "v-co-long-c"):
            w, x, _ = rects[f"{wrapper}-place"]
            assert near(w, 800.0), (wrapper, w)
            assert near(x, 0.0), (wrapper, x)

    def test_the_callout_opens_its_body_for_the_voice_without_moving_icon_or_box(self, rects):
        bw0, bx0, _ = rects["v-co-l-body"]
        assert bw0 < 100.0, bw0                    # no ask: the body hugs its words exactly as it always did
        w, x, _ = rects["v-co-c-body"]
        assert w > 500.0, w                        # the voice opens the row: a line box, not a hug
        assert near(x, bx0, 0.5), (x, bx0)         # opened to the right, never pushing the body off the icon
        w, x, _ = rects["v-co-r-body"]
        assert w > 500.0, w
        for suffix in ("l", "c", "r"):
            assert rects[f"v-co-{suffix}-box"][:3] == pytest.approx(rects["v-co-l-box"][:3], abs=0.5)
        for suffix in ("c", "r"):                  # the icon: same rect at every word — it is the fixed mark
            assert rects[f"v-co-{suffix}-icon"][:3] == pytest.approx(rects["v-co-l-icon"][:3], abs=0.5)

    def test_a_default_callout_measures_exactly_like_the_pre_fix_shape(self, rects):
        # The fix is scoped to the voice classes; a callout nobody asked about keeps every rect it had. The
        # left asks inside the defect control are that pre-fix shape drawn with the very same shipped rule:
        # identical widths and edges, word for word, box and body alike.
        assert rects["v-co-l-body"][:3] == pytest.approx(rects["neg-co-l-body"][:3], abs=0.5)
        assert rects["v-co-l-box"][:3] == pytest.approx(rects["neg-co-l-box"][:3], abs=0.5)
        assert rects["word-v-co-l-words"][:3] == pytest.approx(rects["word-neg-co-l-words"][:3], abs=0.5)

    def test_long_words_center_line_by_line(self, rects):
        # A wrapped note centered: its first line is a line, not a tight hug, and it sits in the body's middle.
        ww, wx, _ = rects["word-v-co-long-words"]
        bw, bx, _ = rects["v-co-long-body"]
        assert ww > 300.0, ww                      # it wrapped: a long first line
        assert near(wx + ww / 2, bx + bw / 2, 2.5), (wx, ww, bx, bw)

    def test_negative_control_a_hugged_body_parks_the_words_despite_the_class(self, rects, aligns):
        # The defect of this round, kept measurable forever: the shipped callout under the scoped NOT-shipped
        # hug. The class computes "center" — and it means nothing: body == text width, words exactly where the
        # left ask put them, not one pixel moved. If these numbers ever match the fixed callout above, this
        # probe has stopped reading real geometry.
        assert aligns["neg-co-c-body"] == "center"
        bw, bx, _ = rects["neg-co-c-body"]
        ww, wx, _ = rects["word-neg-co-c-words"]
        assert bw < 100.0, bw                      # the hug: the body is only as wide as its words
        assert near(ww, bw, 1.5), (ww, bw)         # body width == word width: no line box exists
        assert near(wx, bx, 1.5), (wx, bx)         # words at the body's left edge, beside the icon
        assert near(wx, rects["word-neg-co-l-words"][1], 1.0)  # NOT one pixel from where left sits
        fw, fx, _ = rects["neg-co-c-place"]
        assert near(fw, 800.0) and near(fx, 0.0)   # the wrapper still fills: only the body refused to open
