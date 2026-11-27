# Real-browser layout regression for the interactive table (t_b2ea89cc, enhancement #3).
#
# The claim to test lives in real layout, not jsdom: adding the filter UI must not change what a table card
# measures. The card keeps hugging its columns (fit-content), the controls row costs it ZERO width (it fills
# the card via width:0 + min-width:100% instead of contributing its own), the tick column is the only added
# width, and a filtered table keeps the same hug. One negative control keeps the defect shape measurable
# forever: the same DOM with a naive tools row (plain auto width, NOT shipped CSS) inflates the card far past
# the table — if the shipped rule ever regresses to that shape, this probe reads geometry, not markup.
#
# The SECOND claim (review round 3): the send-outcome word is FULLY READABLE on the narrowest hugging card.
# The old clip shape (nowrap + ellipsis) cut "Blocked…" off mid-sentence exactly where the recovery
# instruction lives; the shipped span WRAPS instead. The probe measures real layout: scrollWidth vs
# clientWidth, and every word's own range rect sitting fully inside the span's box. Its negative control
# keeps that defect shape measurable too: the same DOM restyled to the old clip rule truncates — so if the
# readability assertions ever go soft, the control reddens with them.
#
# Fixture DOM mirrors exactly what Table.tsx draws for a plain vs interactive table (ids added to measure),
# over the repo's own shipped stylesheets, in a 2000x1400 window so the 1100px board cap is never the clamp.
from __future__ import annotations

import html
import re
import subprocess
import tempfile
from pathlib import Path

import pytest

from test_layout_alignment import CHROME, CSS  # same stylesheet set the accepted alignment probe feeds Chrome

REPO = Path(__file__).resolve().parents[1]


def cells(rows: list[tuple[str, str]]) -> str:
    out = []
    for r, (name, price) in enumerate(rows):
        out.append(
            f"<tr><td class=\"hb-first\">{name}</td><td class=\"hb-num\">{price}</td></tr>"
        )
    return "".join(out)


def static_table(p: str, rows: list[tuple[str, str]] | None = None) -> str:
    """A plain table exactly as the shipped component draws it with no interactive word."""
    rows = rows or [("Pixel 10a", "₹44,999"), ("Nothing 4", "₹39,999"), ("Galaxy A56", "₹42,999")]
    return (
        f'<div class="hb-card hb-table-card" id="{p}-card"><div class="hb-table-scroll">'
        f'<table class="hb-table" id="{p}-table"><thead><tr>'
        f'<th class="hb-first"><button type="button"><span>Phone</span>'
        f'<span class="hb-sort" aria-hidden="true">↕</span></button></th>'
        f'<th class="hb-num"><button type="button"><span>Price</span>'
        f'<span class="hb-sort" aria-hidden="true">↕</span></button></th>'
        f"</tr></thead><tbody>{cells(rows)}</tbody></table></div></div>"
    )


def interactive_table(p: str, rows: list[tuple[str, str]] | None = None, status: str = "") -> str:
    """The same table with the interactive chrome: tools row above the rows, a tick column beside them.

    The tools row carries the live-region span the component always renders; `status` fills it the way a
    send's feedback does ("Sent to chat." / "Blocked from sending — in the composer — press Send.")."""
    rows = rows or [("Pixel 10a", "₹44,999"), ("Nothing 4", "₹39,999"), ("Galaxy A56", "₹42,999")]
    row_html = "".join(
        f'<tr><td class="hb-pick"><input type="checkbox" aria-label="Select row {name}"/></td>'
        f'<td class="hb-first">{name}</td><td class="hb-num">{price}</td></tr>'
        for name, price in rows
    )
    return (
        f'<div class="hb-card hb-table-card" id="{p}-card">'
        f'<div class="hb-table-tools" id="{p}-tools">'
        f'<input type="search" class="hb-table-filter" id="{p}-filter" aria-label="Filter rows" '
        f'placeholder="Filter rows" value=""/>'
        f'<button type="button" class="hb-pill" id="{p}-pill" aria-label="Send selected rows as context" disabled>'
        f'<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"></svg>'
        f'<span class="hb-pill-label">Send selected as context</span></button>'
        f'<span class="hb-table-sent" role="status" aria-live="polite" id="{p}-sent">{status}</span></div>'
        f'<div class="hb-table-scroll"><table class="hb-table" id="{p}-table"><thead><tr>'
        f'<th class="hb-pick" id="{p}-pick" aria-label="Selected rows"></th>'
        f'<th class="hb-first"><button type="button"><span>Phone</span>'
        f'<span class="hb-sort" aria-hidden="true">↕</span></button></th>'
        f'<th class="hb-num"><button type="button"><span>Price</span>'
        f'<span class="hb-sort" aria-hidden="true">↕</span></button></th>'
        f"</tr></thead><tbody>{row_html}</tbody></table></div></div>"
    )


BLOCKED = "Blocked from sending — in the composer — press Send."
DRAFTED = "In the composer — press Send."
FAILED = "Send failed — nothing was sent or kept."
SENT_OK = "Sent to chat."
# The status spans the clip report measures, in the fixture's id form.
PROBED = ("s-sent", "d-sent", "f-sent", "k-sent", "x-sent")


def fixture_html() -> str:
    css = "\n".join(p.read_text() for p in CSS)
    # NOT shipped CSS: two defect shapes, each kept measurable as a negative control —
    #   neg-root:   a tools row sized to its own content instead of the card (width blow-up);
    #   clip-root:  the OLD status style (nowrap + ellipsis), which clips words on a narrow hug
    #               (review round 3). Restated in full so the control never leans on the shipped rule.
    neg_css = (
        "#neg-root .hb-table-tools { width: auto; min-width: 0; }\n"
        "#clip-root .hb-table-sent { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; "
        "min-width: 0; flex: 0 1 auto; }"
    )
    one_row = [("Pixel 10a", "₹44,999")]
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<style>{css}\n{neg_css}</style></head>"
        "<body style='margin:0'>"
        f'<div class="hb-blocks" data-root id="plain-root">{static_table("p")}</div>'
        f'<div class="hb-blocks" data-root id="optin-root">{interactive_table("o")}</div>'
        f'<div class="hb-blocks" data-root id="narrow-root">{interactive_table("o1", one_row)}</div>'
        f'<div class="hb-blocks" data-root id="sent-root">{interactive_table("s", one_row, status=BLOCKED)}</div>'
        f'<div class="hb-blocks" data-root id="drafted-root">{interactive_table("d", one_row, status=DRAFTED)}</div>'
        f'<div class="hb-blocks" data-root id="failed-root">{interactive_table("f", one_row, status=FAILED)}</div>'
        f'<div class="hb-blocks" data-root id="sentok-root">{interactive_table("k", one_row, status=SENT_OK)}</div>'
        f'<div class="hb-blocks" data-root id="neg-root">{interactive_table("n")}</div>'
        f'<div class="hb-blocks" data-root id="clip-root">{interactive_table("x", one_row, status=BLOCKED)}</div>'
        "<pre id='out' style='display:none'></pre>"
        "<pre id='clip' style='display:none'></pre>"
        f"<script>{measure_script()}</script></body></html>"
    )


def measure_script() -> str:
    probed = ",".join(f'"{p}"' for p in PROBED)
    js = """
    const roots = [...document.querySelectorAll("[data-root]")];
    const out = roots.map((root) => {
      const rb = root.getBoundingClientRect();
      const els = [root, ...root.querySelectorAll("[id]")];
      return els.map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.id} ${r.width.toFixed(3)} ${(r.left - rb.left).toFixed(3)} ` +
          `${(r.right - rb.left).toFixed(3)} ${r.height.toFixed(3)}`;
      });
    }).flat();
    document.getElementById("out").textContent = out.join("\\n");
    // Clip report per status span: box overflow (scrollWidth vs clientWidth) and, word by word,
    // whether the word's own laid-out range rect sits fully inside the span's box. A clipped word
    // still has a rect — it simply lies past the edge. That is layout truth, not markup.
    const clips = [];
    for (const id of [__PROBED__]) {
      const el = document.getElementById(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      let words = 0, inside = 0;
      for (const node of el.childNodes) {
        if (node.nodeType !== 3) continue;
        const re = /\\S+/g;
        let m;
        while ((m = re.exec(node.textContent))) {
          words++;
          const rg = document.createRange();
          rg.setStart(node, m.index);
          rg.setEnd(node, m.index + m[0].length);
          const rs = [...rg.getClientRects()].filter((q) => q.width > 0);
          if (rs.length && rs.every((q) => q.left >= r.left - 0.5 && q.right <= r.right + 0.5)) inside++;
        }
      }
      clips.push(`${id} cw ${el.clientWidth} sw ${el.scrollWidth} h ${r.height.toFixed(3)} ` +
        `words ${words} inside ${inside}`);
    }
    document.getElementById("clip").textContent = clips.join("\\n");
    """
    return js.replace("__PROBED__", probed)


@pytest.fixture(scope="module")
def probe() -> dict:
    """One real-Chrome run of the fixture; BOTH reports parsed out of it."""
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
        c = re.search(r"<pre id=\"clip\"[^>]*>(.*?)</pre>", proc.stdout, re.S)
        assert c, f"clip probe never reported; chrome said: {proc.stderr[-400:]}"
        text_clip = html.unescape(c.group(1)).strip()
    out: dict[str, tuple[float, float, float, float]] = {}
    for line in text_out.splitlines():
        bits = line.split()
        assert len(bits) == 5, line
        out[bits[0]] = (float(bits[1]), float(bits[2]), float(bits[3]), float(bits[4]))
    clip: dict[str, dict[str, float]] = {}
    for line in text_clip.splitlines():
        bits = line.split()
        assert len(bits) == 11, line
        vals = dict(zip(bits[1::2], bits[2::2]))
        assert list(vals) == ["cw", "sw", "h", "words", "inside"], line
        clip[bits[0]] = {k: float(v) for k, v in vals.items()}
    assert set(clip) == set(PROBED), f"clip report missing spans: {set(PROBED) - set(clip)}"
    return {"rects": out, "clip": clip}


@pytest.fixture(scope="module")
def rects(probe) -> dict[str, tuple[float, float, float, float]]:
    return probe["rects"]


@pytest.fixture(scope="module")
def clip(probe) -> dict[str, dict[str, float]]:
    return probe["clip"]


BOARD_W = 1100.0  # the board's reading cap; a hugging card sits far under it
BORDER = 2.0      # .hb-card's 1px border on each side: the box hugs the table plus exactly this


class TestStaticDefault:
    """The table without the word is untouched: the shipped card still hugs its columns."""

    def test_the_plain_card_hugs_its_table(self, rects):
        assert rects["p-card"][0] == pytest.approx(rects["p-table"][0] + BORDER, abs=0.01)

    def test_the_plain_card_is_not_the_board(self, rects):
        assert rects["p-card"][0] < BOARD_W - 100  # hugging, not filling


class TestInteractiveKeepsTheHug:
    """With the filter UI present the fit-content width is preserved: the card still measures its table,
    the controls row contributes ZERO width of its own, and the tick column is all that was added."""

    def test_the_opt_in_card_still_hugs_its_table(self, rects):
        assert rects["o-card"][0] == pytest.approx(rects["o-table"][0] + BORDER, abs=0.01)
        assert rects["o-card"][0] < BOARD_W - 100

    def test_the_tools_row_costs_the_card_nothing(self, rects):
        # Same data columns in both cards: the only added width is the tick column itself — the tools row
        # (input + pill, which alone measure ~350px) inflates the card by ZERO.
        added = rects["o-card"][0] - rects["p-card"][0]
        assert added == pytest.approx(rects["o-pick"][0], abs=0.5), (added, rects["o-pick"])
        assert rects["o-pick"][0] < 60.0  # a checkbox column, not a content-driven band

    def test_the_tools_row_fills_the_card_it_never_widens(self, rects):
        assert rects["o-tools"][0] == pytest.approx(rects["o-card"][0] - BORDER, abs=0.5)
        # Both controls sit inside the hug — nothing overflows the card edge.
        assert rects["o-filter"][3] <= rects["o-card"][3] + 0.5
        assert rects["o-pill"][3] <= rects["o-card"][3] + 0.5

    def test_a_narrowed_table_hugs_too(self, rects):
        # One row visible after a filter: the card still measures its table, never a fixed or full width.
        assert rects["o1-card"][0] == pytest.approx(rects["o1-table"][0] + BORDER, abs=0.01)
        assert rects["o1-card"][0] < BOARD_W - 100
        assert rects["o1-tools"][0] == pytest.approx(rects["o1-card"][0] - BORDER, abs=0.5)

    def test_spoken_feedback_costs_the_narrowest_card_nothing(self, rects):
        # The same one-row card after a tap, its live region filled with the longest word it can say:
        # the tools row still costs zero width — the card measures its table exactly as it did in silence,
        # and the feedback text never overflows the card edge (it WRAPS inside the hug — see
        # TestNarrowFeedbackReadability for the claim that every wrapped word is actually readable).
        assert rects["s-card"][0] == pytest.approx(rects["s-table"][0] + BORDER, abs=0.01)
        assert rects["s-card"][0] == pytest.approx(rects["o1-card"][0], abs=0.5)
        assert rects["s-tools"][0] == pytest.approx(rects["s-card"][0] - BORDER, abs=0.5)
        assert rects["s-sent"][3] <= rects["s-card"][3] + 0.5


class TestNarrowFeedbackReadability:
    """Review round 3, on the NARROWEST hugging card (one row, two columns — the exact fixture the
    reviewer measured): the send-outcome and recovery words must be FULLY readable. The probe reads
    layout: no horizontal overflow in the span, and every word's own laid-out range rect inside the
    span's box. Card WIDTH stays == the silent table's hug; only HEIGHT may grow."""

    @pytest.mark.parametrize("pid", ["s-sent", "d-sent", "f-sent", "k-sent"])
    def test_no_word_is_clipped_at_narrow_width(self, clip, pid):
        c = clip[pid]
        assert c["words"] > 0, pid
        assert c["sw"] <= c["cw"] + 1, f"{pid}: overflow {c['sw']}px past a {c['cw']}px box"
        assert c["inside"] == c["words"], f"{pid}: {c['words'] - c['inside']} word(s) laid out past the box"

    def test_the_long_words_really_wrap(self, clip):
        # The blocked/failed messages cannot fit the narrow hug on one line — proof they REFLOW onto
        # more lines (the span grows taller) instead of being handed room the card never had.
        one_line = clip["x-sent"]["h"]  # the clip control's single line, same text and box
        assert clip["s-sent"]["h"] > 1.8 * one_line
        assert clip["f-sent"]["h"] > 1.8 * one_line

    @pytest.mark.parametrize("p", ["d", "f", "k"])
    def test_wrapping_words_cost_the_card_no_width(self, rects, p):
        # Same one-row data behind every card: drafted/failed/sent cards measure exactly the SILENT
        # one. Wrapping is a height affair; the fit-content hug is untouched.
        assert rects[f"{p}-card"][0] == pytest.approx(rects[f"{p}-table"][0] + BORDER, abs=0.01)
        assert rects[f"{p}-card"][0] == pytest.approx(rects["o1-card"][0], abs=0.5)


class TestNarrowClipControl:
    """The defect the reviewer measured stays measurable: the same narrow DOM wearing the OLD clip
    style (NOT shipped any more) truncates mid-sentence — while hugging just as tightly. So the
    readability probes above read real layout; if they ever go soft, this control reddens with them."""

    def test_the_old_clip_shape_truncates_the_message(self, clip):
        c = clip["x-sent"]
        assert c["sw"] > c["cw"] + 50, f"the clip probe no longer detects the defect ({c['sw']} vs {c['cw']})"
        assert 0 < c["inside"] < c["words"], "no word was caught past the edge — the probe reads nothing"

    def test_the_clipping_card_still_hugs(self, rects):
        # The round-3 finding was never about width: the clipped card hugs as tightly as the fixed
        # one — which is exactly why the width tests alone could not see it, and this can.
        assert rects["x-card"][0] == pytest.approx(rects["x-table"][0] + BORDER, abs=0.01)
        assert rects["x-card"][0] == pytest.approx(rects["s-card"][0], abs=0.5)


class TestNegativeControl:
    """The defect shape stays measurable: a tools row sized to its own content (NOT the shipped rule)
    inflates the card past the table it is supposed to hug."""

    def test_a_content_sized_tools_row_would_widen_the_card(self, rects):
        # Same DOM, one unshipped override: the card outgrows the shipped one by far more than the tick
        # column could explain — the probe reads geometry, not markup.
        assert rects["n-card"][0] - rects["p-card"][0] > 100.0
        assert rects["n-card"][0] - rects["o-card"][0] > 100.0

    def test_the_defect_stretches_the_table_with_the_card(self, rects):
        # A table fills its available box, so the inflated card visibly stretches the table it never grew:
        # the second geometric signature of the same defect, keeping it unmissable.
        assert rects["n-table"][0] > rects["p-table"][0] + 100.0
        assert rects["o-table"][0] == pytest.approx(rects["p-table"][0] + rects["o-pick"][0], abs=0.5)
