# Real-browser layout regression for the chart drill-down (t_debd6eb3, enhancement #4).
#
# Two claims live in real layout, not jsdom:
#
# (1) COSTS NOTHING — the drill-down dialog is mounted BESIDE the chart figure, position: fixed, out of flow.
#     A board carrying one (the DOM the component draws while it is open) must measure the board that does not
#     carry it, word for word: the capped chart figure (720px), the hugging fit-content table, the pie figure,
#     the board box. Two NOT-shipped controls keep both defect shapes measurable forever:
#       #neg-flow   a dialog that forgot to leave the flow (position: static) joins the block column — the board
#                   grows past the resting one and the overlay is a band, not the window;
#       #neg-inside the same DOM the component does NOT mount: a dialog INSIDE the pie card, with the card given
#                   a transform (the shape a card animating itself gets — Chrome measures that a transform,
#                   contain: layout and contain: paint each contain a fixed descendant, while a plain
#                   container-type card does NOT; probed on Chrome 157 before this file was written). The inside
#                   mount shrinks to the card; the shipped sibling mount keeps covering the window even on the
#                   pie card. That is what mounting beside the figure buys.
#
# (2) IS THE WINDOW — over the repo's own chart.css and the host's blockTag.css (the close control is the same
#     shipped component), the open dialog's rect equals the real viewport (measured, not assumed — headless
#     window-size and viewport differ), its card is the shipped min(440px, 100%) centred in it, and the close
#     control holds the corner. --force-prefers-reduced-motion settles the dialog's own appear animation via the
#     shipped reduced-motion gate, so the frames read the resting geometry.
#
# Fixture DOM mirrors what Chart.tsx / PieChart.tsx draw at rest and while drilled (ids added to measure).
from __future__ import annotations

import html
import re
import subprocess
import tempfile
from pathlib import Path

import pytest

from test_layout_alignment import CHROME, SRC, near
from test_layout_alignment import CSS as BASE_CSS

# tokens, shared, then the host sheet in the order styles/index.ts ships it — the dialog borrows the host's
# close control — and then the block sheets (chart.css carries the dialog's own rules).
CSS = BASE_CSS[:2] + [SRC / "host" / "blockTag.css"] + BASE_CSS[2:]

WINDOW_W, WINDOW_H = 2000.0, 1400.0
BOARD_W = 1100.0  # the board's reading cap
CARD_W = 720.0    # the cap a chart figure keeps beside the dialog


def chart_figure(p: str) -> str:
    """A bar chart at rest as the frozen renderer draws it (an empty svg is enough: widths come from CSS)."""
    return (f'<figure class="hb-card hb-chart" id="{p}-chart">'
            f'<figcaption class="hb-chart-head"><span class="hb-chart-title">Revenue</span></figcaption>'
            f'<div class="hb-chart-plot"><svg class="hb-chart-svg" width="100%" height="210"'
            f' viewBox="0 0 560 210"></svg></div></figure>')


def dialog(p: str) -> str:
    """The drilled state of ChartDetail.tsx: the scrim div, the host close control, the card the component draws."""
    return (f'<div class="hb-chart-detail" id="{p}-detail" role="dialog" aria-modal="true"'
            f' aria-label="Chart details: Q1">'
            f'<button type="button" class="hb-overlay-close" id="{p}-close" aria-label="Close chart details"></button>'
            f'<div class="hb-chart-detail-card" id="{p}-card">'
            f'<div class="hb-chart-detail-where">Column · Revenue</div>'
            f'<div class="hb-chart-detail-title" id="{p}-title">Q1</div>'
            f'<div class="hb-detail-row"><i style="background:var(--hb-chart-1)"></i>'
            f'<span class="hb-detail-name">Revenue</span><b class="hb-detail-value">4,213,500,000</b></div>'
            f'<div class="hb-detail-source">exchange filings</div></div></div>')


def pie_figure(p: str, inside: bool = False) -> str:
    """A donut at rest as PieChart.tsx draws it; `inside` mounts the dialog WHERE THE SHIPPED COMPONENT
    DOES NOT — inside the card. Paired with the scoped transform below, it is the containing-block defect."""
    return (f'<figure class="hb-card hb-chart hb-pie" id="{p}-pie">'
            f'<div class="hb-pie-body">'
            f'<svg class="hb-pie-svg" width="168" height="168" viewBox="0 0 168 168"></svg>'
            f'<table class="hb-pie-legend"><tbody><tr><td class="hb-pie-swatch"><i></i></td>'
            f'<td class="hb-pie-name">Stay</td><td class="hb-pie-value">₹18,000</td>'
            f'<td class="hb-pie-share">90%</td></tr></tbody></table>'
            f"{dialog(p) if inside else ''}</div></figure>")


def hug_table(p: str) -> str:
    """A table card as the frozen renderer draws it — the fit-content hug the dialog must never touch."""
    rows = "<tr><td>City</td><td>Deg</td></tr><tr><td>Rome</td><td>21</td></tr>"
    return (f'<div class="hb-card hb-table-card" id="{p}-table-card"><table id="{p}-table">{rows}</table></div>')


def board(p: str, *, drilled: bool) -> str:
    """One board: the capped chart, the hugging table, the pie — and beside the chart (the shipped mount
    position, a sibling inside .hb-blocks) the open dialog when drilled."""
    parts = [chart_figure(p)]
    if drilled:
        parts.append(dialog(p))
    parts += [hug_table(p), pie_figure(p)]
    return "\n".join(parts)


def fixture_html() -> str:
    css = "\n".join(p.read_text() for p in CSS)
    # NOT shipped: the flow shape (a dialog that never left the block column), and a card that transforms
    # itself (every entrance animation does) for the inside-mount defect.
    neg_css = (
        "#neg-flow .hb-chart-detail { position: static; animation: none; }\n"
        "#neg-inside .hb-pie { transform: translateZ(0); }\n"
    )
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<style>{css}\n{neg_css}</style></head>"
        "<body style='margin:0'>"
        f'<div class="hb-blocks" data-root id="rest">{board("r", drilled=False)}</div>'
        f'<div class="hb-blocks" data-root id="open">{board("o", drilled=True)}</div>'
        f'<div class="hb-blocks" data-root id="neg-flow">{board("n", drilled=True)}</div>'
        f'<div class="hb-blocks" data-root id="neg-inside">{chart_figure("x")}{hug_table("x")}'
        f'{pie_figure("x", inside=True)}</div>'
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
        // width, height, x and y inside the board, and the raw window x and y (what a fixed overlay claims).
        return `${el.id} ${r.width.toFixed(3)} ${r.height.toFixed(3)} ${(r.left - rb.left).toFixed(3)} ` +
          `${(r.top - rb.top).toFixed(3)} ${r.left.toFixed(3)} ${r.top.toFixed(3)}`;
      });
    }).flat();
    out.unshift(`viewport ${innerWidth.toFixed(3)} ${innerHeight.toFixed(3)} 0 0 0 0`);
    document.getElementById("out").textContent = out.join("\\n");
    """


@pytest.fixture(scope="module")
def rects() -> dict[str, tuple[float, float, float, float, float, float]]:
    if CHROME is None:
        pytest.skip("no Chrome/Chromium binary on this machine")
    with tempfile.TemporaryDirectory() as work:
        page = Path(work) / "probe.html"
        page.write_text(fixture_html())
        profile = Path(work) / "profile"
        profile.mkdir()
        cmd = [
            str(CHROME), "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
            "--force-device-scale-factor=1", "--force-prefers-reduced-motion",
            f"--window-size={WINDOW_W:.0f},{WINDOW_H:.0f}", f"--user-data-dir={profile}",
            "--virtual-time-budget=2000", "--dump-dom", f"file://{page}",
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        m = re.search(r"<pre id=\"out\"[^>]*>(.*?)</pre>", proc.stdout, re.S)
        assert m, f"probe never reported; chrome said: {proc.stderr[-400:]}"
        text_out = html.unescape(m.group(1)).strip()
    out: dict[str, tuple[float, float, float, float, float, float]] = {}
    for line in text_out.splitlines():
        bits = line.split()
        assert len(bits) == 7, line
        out[bits[0]] = tuple(float(b) for b in bits[1:])  # type: ignore[assignment]  # (w,h,rx,ry,vx,vy)
    return out


class TestDialogCostsNothing:
    """The open drill-down is pure overlay: with the dialog in the DOM, every block on the board measures
    exactly what the same board measures without it — caps, hug and all, position inside the board included."""

    PAIRS = [("o-chart", "r-chart"), ("o-table-card", "r-table-card"), ("o-table", "r-table"),
             ("o-pie", "r-pie")]

    def test_every_block_measures_where_the_plain_board_puts_it(self, rects):
        for drilled, plain in self.PAIRS:
            # width, height, and position inside the board; the roots stack down one document, so their raw
            # window y is each root's own offset, never a claim about the blocks.
            got, want = rects[drilled][:4], rects[plain][:4]
            assert got == pytest.approx(want, abs=0.01), (drilled, got, want)

    def test_the_capped_chart_keeps_its_cap(self, rects):
        assert near(rects["o-chart"][0], CARD_W), rects["o-chart"]  # still the 720 cap on the 1100 board

    def test_the_fit_content_table_still_hugs(self, rects):
        # The card measures its table plus the 1px border on each side, dialog mounted or not.
        assert rects["o-table-card"][0] == pytest.approx(rects["o-table"][0] + 2.0, abs=0.01)
        assert rects["o-table-card"][0] < BOARD_W - 100  # a hug, not a fill

    def test_the_board_box_itself_is_unmoved(self, rects):
        assert rects["open"][:2] == pytest.approx(rects["rest"][:2], abs=0.01)  # width and height: no row added


class TestOverlayGeometry:
    """What the dialog DOES measure: the window, centred, with the corner control where the host puts it.
    The window's own size is read from the probe (headless viewport and --window-size differ), never assumed."""

    def test_the_dialog_is_the_whole_window(self, rects):
        vw, vh = rects["viewport"][0], rects["viewport"][1]
        w, h, rx, ry, vx, vy = rects["o-detail"]
        assert near(w, vw) and near(h, vh), (w, h, vw, vh)
        assert near(vx, 0.0, 0.5) and near(vy, 0.0, 0.5), (vx, vy)  # covers it from its true corner
        assert near(vw, WINDOW_W, 1.0), vw  # and it really is the 2000px window we asked for, in the main axis

    def test_the_card_is_the_shipped_width_centred_in_it(self, rects):
        vw, vh = rects["viewport"][0], rects["viewport"][1]
        w, h, rx, ry, vx, vy = rects["o-card"]
        assert near(w, 440.0), rects["o-card"]                       # min(440px, 100%) in a 2000px window
        assert near(vx + w / 2, vw / 2, 1.0), (vx, w, vw)            # centred by the scrim's own flex
        assert near(vy + h / 2, vh / 2, 1.0), (vy, h, vh)
        assert 0.0 < h < vh - 60.0, rects["o-card"]                  # fits with the scrim's padding to spare

    def test_the_close_control_holds_the_window_corner(self, rects):
        vw = rects["viewport"][0]
        w, h, rx, ry, vx, vy = rects["o-close"]
        assert near(vx + w, vw - 14.0, 1.0), (vx, w, vw)  # right: 14px, the host's own number — settled,
        assert near(vy, 14.0, 1.0), vy                    # because the shipped reduced-motion gate stops the
        assert near(w, 32.0) and near(h, 32.0)            # appear transform this close to the frame


class TestNegativeControls:
    """Each defect shape stays measurable: if the shipped rules ever regress to one, these green pairs redden."""

    def test_a_dialog_that_never_left_the_flow_stretches_the_board(self, rects):
        # position: static (NOT shipped): the dialog joins the block column; the board grows past the resting
        # one, the overlay becomes a column-wide band pushed down into the flow, and the hug… survives —
        # which is exactly why width probes alone never saw this defect, and height is in the pair.
        assert rects["neg-flow"][:2] != pytest.approx(rects["rest"][:2], abs=1.0)
        assert rects["neg-flow"][1] > rects["rest"][1] + 100.0, (rects["neg-flow"], rects["rest"])  # height
        assert rects["n-detail"][0] == pytest.approx(BOARD_W, abs=1.0), rects["n-detail"]           # a band
        assert rects["n-detail"][1] < 400.0, rects["n-detail"]                                      # content-tall
        assert rects["n-detail"][3] > 100.0, rects["n-detail"]                                      # pushed down
        assert rects["o-detail"][0] == pytest.approx(rects["viewport"][0], abs=1.0)  # shipped: the window

    def test_a_dialog_mounted_inside_an_animating_card_measures_the_card(self, rects):
        # The defect the beside-the-figure mount exists to dodge: a card that transforms its own box (every
        # entrance animation does — Chrome contains fixed descendants to transforms, contain: layout and
        # contain: paint, measured before this file was written) shrinks an INSIDE-mounted overlay to the
        # card. Mounted beside it, the shipped dialog keeps covering the window. Both shapes, in one frame.
        assert rects["x-detail"][:4] == pytest.approx(
            (rects["x-pie"][0] - 2.0, rects["x-pie"][1] - 2.0, rects["x-pie"][2] + 1.0, rects["x-pie"][3] + 1.0),
            abs=2.0), (rects["x-detail"], rects["x-pie"])
        assert rects["o-detail"][0] == pytest.approx(rects["viewport"][0], abs=1.0)  # shipped: full window
