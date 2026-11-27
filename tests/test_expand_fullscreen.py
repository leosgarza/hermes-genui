# Real-browser layout regression for the expand / full-screen board view (t_e7796349).
#
# jsdom cannot lay out, so everything the width claims depend on is measured here in headless Chrome over the
# repo's OWN stylesheets with the DOM the frozen renderer draws: (1) the inline board is geometry-neutral under
# the new host chrome — every rect inside .hb-tag's board (which the plain .hb-board-host wrapper now owns)
# measures word-for-word what the same block measures in a bare .hb-blocks drawn without the expand control,
# the wrapper itself fills the tag as a plain block, and those bare numbers are the accepted alignment probe's
# own (1100px board, 720px caps, fit-content hug); (2) the expanded dialog is the SAME placement and width
# machinery on a wider container — the ONE board element IS the dialog's paper panel (expanding moves it, it
# is never re-instantiated): full-width blocks ride 1552px of column where inline they rode 1100px, capped
# cards keep 720 at every word, a placed card is still exactly centered in its (wider) column, a fit-content
# table still hugs its columns, and the provenance footer's placed row still fills the whole row; (3) two
# negative controls keep both defect shapes measurable forever, each reproduced by scoped rules that are NOT
# shipped CSS: an overlay that forgot to lift the reading cap measures inline widths in "full screen", and a
# naive implementation that widened the board by also loosening the caps inflates the cards. If the shipped
# overlay ever matches one of those shapes, this probe is reading markup, not geometry.
#
# Window is 2000x1400: the dialog is position:fixed inset:0, so Chrome's viewport IS its container. Panel and
# board are one element now — the expanded board box is min(1600px, 100% - padding) = 1600px, and its own
# 24px padding per side leaves the wider column the blocks fill: 1600 - 48 = 1552.
from __future__ import annotations

import html
import re
import subprocess
import tempfile
from pathlib import Path

import pytest

from test_layout_alignment import CHROME, SRC, calc, footer, near, place, table, text, wide_chart
from test_layout_alignment import CSS as BASE_CSS

# The same stylesheet set the alignment probe feeds Chrome, with the host's own sheet joined in the exact
# order styles/index.ts ships them (tokens, shared, blockTag, …): the dialog's rules live in blockTag.css.
CSS = BASE_CSS[:2] + [SRC / "host" / "blockTag.css"] + BASE_CSS[2:]

INLINE_W = 1100.0    # the board's own reading cap, unchanged inline
PANEL_W = 1600.0     # the expanded board's own box — panel and board are ONE element now
PAD_W = 24.0         # the padding that box carries as the dialog's paper panel
COLUMN_W = PANEL_W - 2 * PAD_W   # 1552: the wider column the dialog's blocks fill
CARD_W = 720.0       # the cap cards keep in BOTH views

EXPAND_BUTTON = ('<button type="button" class="hb-expand" id="{i}" aria-label="Expand board" aria-haspopup="dialog">'
                 '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"></svg></button>')
CLOSE_BUTTON = ('<button type="button" class="hb-overlay-close" id="{i}" aria-label="Close expanded board">'
                '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"></svg></button>')


def board(prefix: str, *, prov: bool = False) -> str:
    """The DOM the frozen renderer draws for one board, with ids that cannot collide between roots."""
    rows = [
        calc(f"{prefix}-calc-left"),
        place("center", calc(f"{prefix}-calc-center")),
        place("right", calc(f"{prefix}-calc-right")),
        text(f"{prefix}-prose"),
        wide_chart(f"{prefix}-chart"),
        table(f"{prefix}-table"),
        place("center", text(f"{prefix}-prose-center")),
    ]
    if prov:
        rows.append(footer("center", f"{prefix}-footer"))
    return "\n".join(rows)


def overlay(inner: str, root_id: str = "") -> str:
    """One host wrapper in its expanded state — the class pair host/BlockTag.tsx gives the same element,
    plus the dialog attributes it puts on the very element that already holds the ONE drawn board."""
    rid = f' id="{root_id}"' if root_id else ""
    return (f'<div class="hb-board-host hb-board-overlay"{rid} data-root role="dialog" aria-modal="true"'
            f' aria-label="Expanded board">{inner}</div>')


def fixture_html() -> str:
    css = "\n".join(p.read_text() for p in CSS)
    inline = f"""
    <div class="hb-tag" data-root id="tagged">
      {EXPAND_BUTTON.format(i="tag-expand")}
      <div class="hb-board-host" id="tag-host">
        <div class="hb-blocks" id="tag-blocks">{board("t")}</div>
      </div>
    </div>
    <div class="hb-blocks" data-root id="bare">{board("p")}</div>
    """
    # The shipped dialog, exactly as host/BlockTag.tsx draws it: the close control first, then the SAME
    # board element the inline view just held — no separate body panel, provenance footer included.
    expanded = f"""
    {overlay(
        f'{CLOSE_BUTTON.format(i="ov-close")}'
        f'<div class="hb-blocks" id="ov-blocks">{board("o", prov=True)}</div>',
        root_id="ov",
    )}
    """
    # Controls, each with a scoped rule that is NOT shipped CSS — the two wrong implementations, kept measurable:
    negs = f"""
    {overlay(
        f'{CLOSE_BUTTON.format(i="nf-close")}'
        f'<div class="hb-blocks" id="nf-blocks">{board("nf")}</div>',
        root_id="neg-flat",
    )}
    {overlay(
        f'{CLOSE_BUTTON.format(i="nc-close")}'
        f'<div class="hb-blocks" id="nc-blocks">{board("nc")}</div>',
        root_id="neg-caps",
    )}
    """
    neg_css = f"""
#neg-flat .hb-blocks {{ width: 100%; max-width: {INLINE_W:.0f}px; padding: 0; }}  /* the overlay forgot to lift the cap:
   the board fills to the reading cap in "full screen", exactly as it does inline */
#neg-caps .hb-blocks > .hb-calc,
#neg-caps .hb-blocks > .hb-place > .hb-calc {{ max-width: none; }}   /* widening that also loosened the caps */
"""
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<style>{css}\n{neg_css}</style></head>"
        f"<body style='margin:0'>{inline}{expanded}{negs}"
        "<pre id='out' style='display:none'></pre>"
        f"<script>{measure_script()}</script></body></html>"
    )


def measure_script() -> str:
    return """
    const roots = [...document.querySelectorAll("[data-root]")];
    const out = roots.map((root) => {
      const rb = root.getBoundingClientRect();
      const els = [root, ...root.querySelectorAll("[id]")];
      return els.map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.id} ${r.width.toFixed(3)} ${(r.left - rb.left).toFixed(3)} ${r.height.toFixed(3)} ` +
          `${getComputedStyle(el).textAlign}`;
      });
    }).flat();
    document.getElementById("out").textContent = out.join("\\n");
    """


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
            "--force-device-scale-factor=1", "--window-size=2000,1400", f"--user-data-dir={profile}",
            "--virtual-time-budget=2000", "--dump-dom", f"file://{page}",
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        m = re.search(r"<pre id=\"out\"[^>]*>(.*?)</pre>", proc.stdout, re.S)
        assert m, f"probe never reported; chrome said: {proc.stderr[-400:]}"
        text_out = html.unescape(m.group(1)).strip()
    out: dict[str, tuple[float, float, float]] = {}
    for line in text_out.splitlines():
        bits = line.split()
        assert len(bits) == 5, line
        out[bits[0]] = (float(bits[1]), float(bits[2]), float(bits[3]))
    return out


class TestInlineUnchanged:
    """The expand chrome must cost the inline board nothing: with .hb-tag, the control and the plain host
    wrapper present, every rect inside the board measures what the same board measures without them — and
    those numbers are the accepted alignment probe's own inline geometry."""

    PAIRS = ["calc-left", "calc-center", "calc-right", "prose", "chart", "table", "prose-center"]

    def test_the_host_wrapper_is_geometry_neutral_for_every_block(self, rects):
        for name in self.PAIRS:
            assert rects[f"t-{name}"] == pytest.approx(rects[f"p-{name}"], abs=0.01), name
        assert rects["tag-blocks"] == pytest.approx(rects["bare"], abs=0.01)  # the board box itself: 1100, at 0

    def test_the_host_wrapper_is_a_plain_block_at_rest(self, rects):
        # Not a flex item, not capped, not centered: it fills the tag exactly as a bare div would — the
        # wrapper exists so expansion can MOVE the board into the dialog, and at rest it must add nothing.
        assert rects["tag-host"][0] == pytest.approx(rects["tagged"][0], abs=0.01)
        assert rects["tag-host"][1] == pytest.approx(rects["tagged"][1], abs=0.01)

    def test_the_inline_numbers_are_the_accepted_ones(self, rects):
        assert near(rects["bare"][0], INLINE_W), rects["bare"]          # the board keeps its reading cap
        assert near(rects["p-calc-left"][0], CARD_W), rects["p-calc-left"]
        assert near(rects["p-calc-center"][1], (INLINE_W - CARD_W) / 2), rects["p-calc-center"]
        assert near(rects["p-prose"][0], INLINE_W), rects["p-prose"]    # full-width prose at the cap, inline

    def test_the_expand_control_takes_no_part_in_layout(self, rects):
        # Absolute at the board's top-right corner: pinned to the corner, 28px tall — and the pair equality
        # above already proved it displaced nothing inside the board on its way there.
        ew, ex, eh = rects["tag-expand"]
        assert near(ex + ew, rects["tagged"][0] - 6.0, 2.0), (ex, ew)  # right: 6px from the tag's right edge
        assert near(rects["tagged"][0], 2000.0), rects["tagged"]       # the tag fills the reply column
        assert near(eh, 28.0) and near(ew, 28.0), (ew, eh)


class TestExpandedWider:
    """The dialog is the same machinery on a wider container, measured as geometry — on the ONE board
    element the inline view just held, which the shipped rule turns into the paper panel itself."""

    def test_the_panel_column_is_wider_than_the_inline_cap(self, rects):
        assert near(rects["ov-blocks"][0], PANEL_W), rects["ov-blocks"]  # the board box IS the panel now
        assert near(rects["ov-blocks"][1] + PAD_W, (2000.0 - PANEL_W) / 2 + PAD_W), rects["ov-blocks"]
        assert COLUMN_W > INLINE_W + 100.0  # the dialog really does give the board a wider column

    def test_full_width_blocks_ride_the_wider_container(self, rects):
        assert near(rects["o-prose"][0], COLUMN_W), rects["o-prose"]     # 1552 where inline measured 1100
        assert near(rects["o-chart"][0], COLUMN_W), rects["o-chart"]
        assert rects["o-prose"][0] > rects["p-prose"][0] + 100.0        # and it is a MEASURED widening

    def test_cards_keep_their_caps_and_prose_their_placement(self, rects):
        assert near(rects["o-calc-left"][0], CARD_W), rects["o-calc-left"]
        assert near(rects["o-calc-center"][0], CARD_W), rects["o-calc-center"]
        assert near(rects["o-calc-right"][0], CARD_W), rects["o-calc-right"]
        col_x = rects["ov-blocks"][1] + PAD_W  # the column starts inside the board's own paper padding
        assert near(rects["o-calc-center"][1] + CARD_W / 2, col_x + COLUMN_W / 2, 2.0), rects["o-calc-center"]
        assert near(rects["o-calc-right"][1] + CARD_W, col_x + COLUMN_W, 1.0), rects["o-calc-right"]
        assert near(rects["o-calc-left"][1], col_x, 0.5), rects["o-calc-left"]

    def test_fit_content_still_hugs_in_the_wider_column(self, rects):
        assert rects["o-table"][0] == pytest.approx(rects["p-table"][0], abs=1.0)  # a hug is still a hug

    def test_the_provenance_row_fills_the_whole_wider_row(self, rects):
        # The footer's absorbed source is a place, and a place spans its block column — in the dialog that
        # column is the wider one; squeezed or shrunk here would mean placement stopped working when expanded.
        w, x, _ = rects["o-footer-place"]
        assert near(w, COLUMN_W), w
        assert near(x, rects["ov-blocks"][1] + PAD_W, 1.0), x

    def test_the_close_control_holds_the_dialog_corner(self, rects):
        cw, cx, ch = rects["ov-close"]
        assert near(cx + cw, 2000.0 - 14.0, 2.0), (cx, cw)  # viewport-right (the overlay IS the viewport)
        assert near(cw, 32.0), cw

    def test_negative_control_an_overlay_that_never_lifted_the_cap_reads_inline_widths(self, rects):
        # The "expand did nothing" shape: same shipped DOM, one scoped NOT-shipped rule pinning the board
        # back to the inline cap. Full-width prose never travels — which the shipped dialog does.
        assert near(rects["nf-blocks"][0], INLINE_W), rects["nf-blocks"]
        assert near(rects["nf-prose"][0], INLINE_W), rects["nf-prose"]
        assert rects["o-prose"][0] - rects["nf-prose"][0] > 100.0  # the shipped dialog is NOT this shape

    def test_negative_control_widening_the_caps_inflates_the_cards(self, rects):
        # The "widened everything" shape: same DOM, scoped rules that also clear the caps. Cards blow up to
        # the full column — which is exactly what the shipped dialog never does (test_cards_keep_their_caps).
        assert near(rects["nc-calc-left"][0], COLUMN_W), rects["nc-calc-left"]
        assert rects["o-calc-left"][0] == pytest.approx(CARD_W, abs=1.0)  # shipped: cards stay capped
