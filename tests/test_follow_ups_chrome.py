# Real-browser regression for the follow-up suggestions strip (t_87119a1c, enhancement #5).
#
# Three claims, all measured in real layout or with real input, none provable in jsdom:
#
# (1) GEOMETRY (a dump-dom probe over the repo's own shipped stylesheets, fixture DOM mirroring exactly what
#     core/FollowUps.tsx + core/Blocks.tsx render): the strip costs a fit-content hug ZERO width — the narrow
#     board's bubble measures the same with the strip as without it, the row fills the column it is given and
#     never overflows; every word of every long label, and of the worst-case host answer word ("Blocked from
#     sending — in the composer — press Send."), lies FULLY inside its own box with no element scrolling
#     (scrollWidth <= clientWidth); a one-word label longer than the whole box breaks anywhere rather than
#     clipping; the WHOLE long words (the round-2 fixture: a 68-character label, no read cap any more) cost
#     the same hug nothing, wrap word-for-word, and park the status word on its OWN line beneath the pills at
#     the narrowest width; the board's placement moves the row's pills (center symmetric, right packed)
#     without moving anything else. Two unshipped restyles keep both old defect shapes measurable forever:
#     a row sized to its own content (width:auto) inflates the bubble past the silent one, and the old clip
#     rule (nowrap + ellipsis) truncates words outside their box — on the short AND the whole-long fixtures —
#     if the shipped probes ever go soft, these controls redden.
#
# (2) BEHAVIOR (real headless Chrome over CDP with REAL pointer/key events against the REAL components —
#     esbuild bundles web/src into a temp dir, nothing is written into the checkout, react mounts over the
#     shipped stylesheets, and the board is wired to the real composerActions seam over a RECORDING fake host
#     composer — no send() mock anywhere): a tap submits exactly its prompt ("Sent to chat." after the host's
#     yes); a >120-char prompt is POSTED through the explicit route, not drafted (submit, and insertText never
#     called); a run past 300 characters with a label past 40 arrives through the real read WHOLE and submits
#     EXACTLY (the round-2 defect — the reader silently cutting these at 300/40 — has nowhere to hide); a
#     refused submit that falls to an acknowledged draft says so, and an insert that acknowledges nothing
#     admits the text is nowhere; while a held-open host promise is still unanswered the strip says its
#     pending mark, never the PREVIOUS tap's leftover success word; keyboard Tab reaches the first pill and a
#     trusted Enter submits it. A run crafted past the reader ("/reset") is still never submitted — the guard
#     holds and says BLOCKED.
#
# (3) COMPOSITION (real host/BlockTag.tsx): the strip sits beneath the provenance footer, fills the same row,
#     and rides the ONE board element into the expand dialog and back — node identity proves no second
#     instance was mounted, and the tap's word survives open/close/reopen; inside the dialog a tap still
#     posts, a chart detail opened over the board answers the FIRST Escape (the strip never becomes a layer),
#     and the second Escape steps the board itself down. The reader's Esc/focus topmost rules are untouched.
from __future__ import annotations

import base64
import html
import json
import os
import re
import socket
import struct
import subprocess
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

import httpx
import pytest

from test_chart_scatter_cluster_chrome import CSS, ESBUILD, WINDOW_H, WINDOW_W  # same sheets + bundle tool
from test_layout_alignment import CHROME, REPO

BLOCKED = "Blocked from sending — in the composer — press Send."
PENDING_WORD = "Pending…"  # the strip's non-success word while the host has not answered the last tap

FOLLOW_UPS = [
    {"label": "Plan day 2", "run": "Plan the second day of my Kyoto itinerary"},
    {"label": "Find trains", "run": "Compare trains between Kyoto and Osaka"},
    {"label": "Go deeper", "run": "Expand every line of this Kyoto plan into a detailed day-by-day itinerary, "
                                  "with train times, booking links and costs for every hop between the cities"},
]
LONG_RUN = FOLLOW_UPS[2]["run"]
assert len(LONG_RUN) > 120

# Round 2's whole-word pair: a label the reader must see WRAPPED (the old read cut it at 40), and a run past
# the old 300-character read cap — the board offered these words, so the tap must submit them EXACTLY.
LONG_LABEL = "Compare the three days and tell me which evening walk to cut or keep"
assert len(LONG_LABEL) > 40
_SENTENCE = ("Expand every line of this Kyoto plan into a detailed day-by-day itinerary with train times, "
             "booking links and costs for every hop between the cities.")
WHOLE_RUN = " ".join([_SENTENCE] * 3)  # one prompt, > 300 characters, stored and read whole
assert len(WHOLE_RUN) > 300
FOLLOW_UPS_LONG = [
    {"label": LONG_LABEL, "run": WHOLE_RUN},
    {"label": "Cut the rain risk", "run": "What should I do on day two if it rains the whole afternoon"},
    {"label": "Book the walks", "run": WHOLE_RUN},
]

# ---------------------------------------------------------------- the geometry probe ------------------------------
def strip_html(p: str, place_cls: str = "", said: str = "", items: list | None = None) -> str:
    """The DOM core/FollowUps.tsx renders for a set of follow-ups, ids added to measure. The svg stands in for
    the shipped <Icon> (same 14px box, aria-hidden), exactly as the cluster fixture does for chart marks.
    `items` defaults to the short-word strip; the round-2 fixture passes the whole long words."""
    cls = f"hb-followups {place_cls}".strip()
    pills = "".join(
        f'<button type="button" class="hb-pill" id="{p}-pill{i}" title="{html.escape(f["run"])}">'
        f'<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"></svg>'
        f'<span class="hb-followup-label" id="{p}-l{i}">{f["label"]}</span></button>'
        for i, f in enumerate(items or FOLLOW_UPS))
    return (f'<div class="{cls}" id="{p}-row">{pills}'
            f'<span class="hb-followups-said" role="status" aria-live="polite" id="{p}-said">{said}</span></div>')


NARROW_ROWS = '<tr><td>City</td><td>Deg</td></tr><tr><td>Rome</td><td>21</td></tr>'


def narrow_board(p: str, *, strip: str) -> str:
    """A fit-content BUBBLE around one .hb-blocks whose only block is a tiny table — the narrowest hug the
    table review measured. The bubble is what a strip could widen; it must not."""
    return (f'<div style="width:fit-content" data-root id="{p}-bubble">'
            f'<div class="hb-blocks" id="{p}-blocks">'
            f'<div class="hb-card hb-table-card" id="{p}-card"><table>{NARROW_ROWS}</table></div>'
            f"{strip}</div></div>")


def wide_board(p: str, place_cls: str, *, said: str = "") -> str:
    """A 1100px board (the reading cap at this window) with one full-width line and the placed strip."""
    return (f'<div class="hb-blocks" data-root id="{p}-root">'
            f'<div class="hb-text" id="{p}-text">A prose block long enough to fill the whole column.</div>'
            f"{strip_html(p, place_cls, said)}</div>")


def fixture_html() -> str:
    css = "\n".join(p.read_text() for p in CSS)
    # NOT shipped CSS — the old defect shapes, restated in full so each control stands on its own:
    neg_css = (
        "#nb-naive-bubble .hb-followups { width: auto; min-width: 0; }  /* a row sized to its own content */\n"
        "#nb-clip-bubble .hb-followup-label, #nb-clip-bubble .hb-followups-said, "
        "#nb-longclip-bubble .hb-followup-label, #nb-longclip-bubble .hb-followups-said { "
        "white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }  /* the round-3 clip rule */"
    )
    page = (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<style>{css}\n{neg_css}</style></head><body style='margin:0'>"
        + narrow_board("nb-plain", strip="")
        + narrow_board("nb-strip", strip=strip_html("nb-strip", said=BLOCKED))
        + narrow_board("nb-long", strip=strip_html("nb-long", said=BLOCKED, items=FOLLOW_UPS_LONG))
        + narrow_board("nb-longclip", strip=strip_html("nb-longclip", said=BLOCKED, items=FOLLOW_UPS_LONG))
        + narrow_board("nb-naive", strip=strip_html("nb-naive"))
        + narrow_board("nb-clip", strip=strip_html("nb-clip", said=BLOCKED))
        + wide_board("wb-left", "")
        + wide_board("wb-center", "hb-followups-center")
        + wide_board("wb-right", "hb-followups-right")
        + "<pre id='out' style='display:none'></pre><pre id='clip' style='display:none'></pre>"
        f"<script>{measure_script()}</script></body></html>"
    )
    return page


def measure_script() -> str:
    return """
    const roots = [...document.querySelectorAll("[data-root]")];
    const out = roots.map((root) => {
      const rb = root.getBoundingClientRect();
      const els = [root, ...root.querySelectorAll("[id]")];
      return els.map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.id} ${r.width.toFixed(3)} ${(r.left - rb.left).toFixed(3)} ` +
          `${(r.right - rb.left).toFixed(3)} ${r.height.toFixed(3)} ` +
          `${(r.top - rb.top).toFixed(3)} ${(r.bottom - rb.top).toFixed(3)}`;
      });
    }).flat();
    document.getElementById("out").textContent = out.join("\\n");
    const clips = [];
    for (const id of ["nb-strip-l0", "nb-strip-l1", "nb-strip-l2", "nb-strip-said",
                      "nb-long-l0", "nb-long-said",
                      "nb-clip-l0", "nb-clip-l1", "nb-clip-l2", "nb-clip-said",
                      "nb-longclip-l0", "nb-longclip-said"]) {
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
      clips.push(`${id} cw ${el.clientWidth} sw ${el.scrollWidth} h ` +
        `${r.height.toFixed(3)} words ${words} inside ${inside}`);
    }
    document.getElementById("clip").textContent = clips.join("\\n");
    """


PROBED = ("nb-strip-l0", "nb-strip-l1", "nb-strip-l2", "nb-strip-said",
          "nb-long-l0", "nb-long-said",
          "nb-clip-l0", "nb-clip-l1", "nb-clip-l2", "nb-clip-said",
          "nb-longclip-l0", "nb-longclip-said")


@pytest.fixture(scope="module")
def probe() -> dict:
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
            "--virtual-time-budget=2000", "--force-prefers-reduced-motion", "--dump-dom", f"file://{page}",
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        m = re.search(r"<pre id=\"out\"[^>]*>(.*?)</pre>", proc.stdout, re.S)
        assert m, f"probe never reported; chrome said: {proc.stderr[-400:]}"
        text_out = html.unescape(m.group(1)).strip()
        c = re.search(r"<pre id=\"clip\"[^>]*>(.*?)</pre>", proc.stdout, re.S)
        assert c, f"clip probe never reported; chrome said: {proc.stderr[-400:]}"
        text_clip = html.unescape(c.group(1)).strip()
    out: dict[str, tuple[float, float, float, float, float, float]] = {}
    for line in text_out.splitlines():
        bits = line.split()
        assert len(bits) == 7, line
        out[bits[0]] = (float(bits[1]), float(bits[2]), float(bits[3]), float(bits[4]),
                        float(bits[5]), float(bits[6]))
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
def rects(probe):
    return probe["rects"]


@pytest.fixture(scope="module")
def clip(probe):
    return probe["clip"]


class TestStripCostsTheHugNothing:
    """The fit-content bubble hugs the little table with or without the strip: the row fills the column,
    contributes zero width of its own, and every one of its words is readable at the narrowest hug."""

    def test_the_narrow_bubble_hugs_its_table(self, rects):
        assert rects["nb-plain-bubble"][0] == pytest.approx(rects["nb-plain-card"][0], abs=0.51)

    def test_the_strip_costs_the_bubble_nothing(self, rects):
        # Same DOM, one addition: the whole strip (three pills + the worst-case word, ~600px of content on
        # one line) inflates the hugging board by ZERO.
        assert rects["nb-strip-bubble"][0] == pytest.approx(rects["nb-plain-bubble"][0], abs=0.51)

    def test_the_row_fills_the_board_it_never_widens(self, rects):
        # reported per element: (width, left−root.left, right−root.left, height)
        assert rects["nb-strip-row"][0] == pytest.approx(rects["nb-strip-bubble"][0], abs=0.51)
        assert rects["nb-strip-row"][1] == pytest.approx(0.0, abs=0.51)      # left edge of the column
        assert rects["nb-strip-row"][2] == pytest.approx(rects["nb-strip-bubble"][0], abs=0.51)

    def test_no_pill_overflows_the_row(self, rects):
        for i in range(3):
            assert rects[f"nb-strip-pill{i}"][2] <= rects["nb-strip-bubble"][0] + 0.5

    def test_the_narrow_strip_really_wraps(self, rects):
        # The row is far taller than a single line of pills: at this hug the content REFLOWS, it is not
        # handed room. (Tuple fields: width, left, right, height, top, bottom — top/bottom are root-relative.)
        assert rects["nb-strip-row"][3] > 3.0 * rects["nb-strip-l0"][3]


class TestEveryWordIsReadable:
    """Round-3's lesson on the narrowest hug: no box scrolls, and every laid-out word rect lies fully inside
    its own element — label and worst-case host word alike, one-word labels included (they break, not clip)."""

    @pytest.mark.parametrize("pid", ["nb-strip-l0", "nb-strip-l1", "nb-strip-l2", "nb-strip-said"])
    def test_no_word_is_clipped_at_narrow_width(self, clip, pid):
        c = clip[pid]
        assert c["words"] > 0, pid
        assert c["sw"] <= c["cw"] + 1, f"{pid}: overflow {c['sw']}px past a {c['cw']}px box"
        assert c["inside"] == c["words"], f"{pid}: {c['words'] - c['inside']} word(s) laid out past the box"

    def test_the_longest_word_still_fits_after_breaking(self, clip):
        # The middle label ("Find trains") and the long third label share one truth: even a word wider than
        # the box ends up fully inside it once overflow-wrap has cut it.
        assert clip["nb-strip-l1"]["inside"] == clip["nb-strip-l1"]["words"]


class TestWholeLongWordsWrapAtTheNarrowestHug:
    """Round 2: read WHOLE (no 40/300 cut), the board's long words must still cost the hug zero width and
    wrap every word inside its box — the label the old read amputated, and the worst-case host word on its
    OWN line beneath the pills (Sol's pre-check: the feedback must never widen or share its way past the
    narrow fit-content column)."""

    def test_the_whole_long_words_cost_the_bubble_nothing(self, rects):
        assert rects["nb-long-bubble"][0] == pytest.approx(rects["nb-plain-bubble"][0], abs=0.51)

    @pytest.mark.parametrize("pid", ["nb-long-l0", "nb-long-said"])
    def test_no_word_of_the_long_label_or_the_status_is_clipped(self, clip, pid):
        c = clip[pid]
        assert c["words"] >= 6, f"{pid}: the whole words never arrived ({c['words']} words)"
        assert c["sw"] <= c["cw"] + 1, f"{pid}: overflow {c['sw']}px past a {c['cw']}px box"
        assert c["inside"] == c["words"], f"{pid}: {c['words'] - c['inside']} word(s) laid out past the box"

    def test_the_status_word_sits_on_its_own_line_at_the_narrow_hug(self, rects):
        # The pills each take their own wrapped line; the feedback word follows BELOW the last pill's bottom,
        # inside the column — never inline beside content that would widen the bubble (the wide-capture look
        # Sol flagged: fine at 1100px, and at the narrowest hug the row's flex-wrap puts it on its own line).
        last_pill_bottom = max(rects[f"nb-long-pill{i}"][5] for i in range(3))
        assert rects["nb-long-said"][4] >= last_pill_bottom - 0.5
        assert rects["nb-long-said"][2] <= rects["nb-long-bubble"][0] + 0.5

    def test_the_row_with_whole_long_words_really_wraps(self, rects):
        # the tall wrapped label and the wrapped status word are on SEPARATE lines, plus the other two
        # pills: the row's height exceeds label + word alone — it stacks, it does not spill sideways
        assert rects["nb-long-row"][3] > rects["nb-long-l0"][3] + rects["nb-long-said"][3]


class TestPlacementMovesThePills:
    """The board's placement moves the strip the way it moves a row of pills — and nothing else."""

    def test_center_is_symmetric_in_the_column(self, rects):
        row = rects["wb-center-row"]
        gap_left = rects["wb-center-pill0"][1] - row[1]
        gap_right = row[2] - rects["wb-center-said"][2]  # the word span is the group's last item (0 wide at rest)
        assert gap_left == pytest.approx(gap_right, abs=1.0)
        assert gap_left > 40.0  # and it really moved: a left-packed row would measure ~0 here

    def test_right_packs_the_group_to_the_column_end(self, rects):
        row = rects["wb-right-row"]
        assert row[2] - rects["wb-right-said"][2] < 1.5          # the group ends AT the right edge
        assert rects["wb-right-pill0"][1] - row[1] > 200.0       # and nothing sits flush left

    def test_left_is_plain(self, rects):
        assert rects["wb-left-pill0"][1] == pytest.approx(rects["wb-left-row"][1], abs=0.51)


class TestClipAndWidthControlsStayMeasurable:
    """The two shipped-away defects stay visible to this probe forever: the content-sized row inflates the
    hug; the old nowrap/ellipsis rule clips words outside their box. If these reddened, the real tests above
    would be reading markup, not layout."""

    def test_a_content_sized_row_would_widen_the_bubble(self, rects):
        assert rects["nb-naive-bubble"][0] - rects["nb-plain-bubble"][0] > 100.0

    def test_the_old_clip_rule_truncates_the_same_words(self, clip):
        for pid in ("nb-clip-said", "nb-clip-l1"):
            c = clip[pid]
            assert c["sw"] > 1.5 * c["cw"], f"{pid}: the clip probe no longer detects the defect"
            assert 0 < c["inside"] < c["words"], f"{pid}: no word was caught past the edge"

    def test_the_old_clip_rule_truncates_the_whole_long_words_too(self, clip):
        # round 2's standing control: the very words that used to arrive cut at 40/300, restyled with the
        # old nowrap+ellipsis rule — if the shipped wrapping ever goes soft, this reddens with it. The long
        # label is clipped so badly here that not even its first word lies inside the box: inside < words
        # (with the whole 11-word label present) is the defect shape this probe must always see.
        for pid in ("nb-longclip-l0", "nb-longclip-said"):
            c = clip[pid]
            assert c["words"] >= 6, f"{pid}: the whole words never arrived"
            assert c["sw"] > 1.5 * c["cw"], f"{pid}: the clip probe no longer detects the defect"
            assert c["inside"] < c["words"], f"{pid}: no word was caught past the edge"

    def test_the_clipping_bubble_still_hugs(self, rects):
        # The defect never announced itself in width — which is why only a word-level clip probe can see it.
        assert rects["nb-clip-bubble"][0] == pytest.approx(rects["nb-plain-bubble"][0], abs=0.51)


# ------------------------------------------------------------------ the live drivers --------------------------------
DRIVER_BLOCKS = """
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { readBlocksNoted } from "./src/core/readBlocks";
import { Blocks } from "./src/core/Blocks";
import { BlockActions, composerActions } from "./src/host/actions";

declare const window: any;
const calls: Array<[string, string]> = [];
window.__calls = calls;
const composer = {
  submit: (_s: null, t: string) => { calls.push(["submit", t]); return window.__SUBMIT_OK__ !== false; },
  insertText: async (_s: null, t: string) => {
    calls.push(["insert", t]);
    if (window.__SLOW__ === true) {
      // a host that has not answered yet: the promise stays open until the test lets it resolve,
      // so the strip's behavior WHILE a tap waits on the host is observable from the outside
      await new Promise<void>((res) => {
        const iv = setInterval(() => { if (window.__GO__ === true) { clearInterval(iv); res(); } }, 10);
      });
    }
    if (window.__INSERT_FAIL__ === true) return false;      // nothing mounted took it
    return true;
  },
  focus: () => { calls.push(["focus", ""]); },
};
const actions = composerActions(composer);
const spec = JSON.parse(document.getElementById("spec")!.textContent!);
const app = createRoot(document.getElementById("app")!);
if (spec.direct) {
  // crafted past the reader: the guard's last defense is the seam itself
  app.render(createElement(BlockActions.Provider, { value: actions },
    createElement(Blocks, { blocks: [], boardFollowUps: spec.follow_ups })));
} else {
  const r = readBlocksNoted(spec);
  app.render(createElement(BlockActions.Provider, { value: actions },
    createElement(Blocks, {
      blocks: r.blocks, boardAlign: r.align, boardAsOf: r.asOf, boardLive: r.live, boardFollowUps: r.followUps,
    })));
}
window.__ready = true;
"""

DRIVER_TAG = """
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { BlockTag } from "./src/host/BlockTag";
import { BlockActions, composerActions } from "./src/host/actions";

declare const window: any;
const calls: Array<[string, string]> = [];
window.__calls = calls;
const composer = {
  submit: (_s: null, t: string) => { calls.push(["submit", t]); return true; },
  insertText: async (_s: null, t: string) => { calls.push(["insert", t]); return true; },
  focus: () => { calls.push(["focus", ""]); },
};
const actions = composerActions(composer);
const data = JSON.parse(document.getElementById("spec")!.textContent!);
createRoot(document.getElementById("app")!).render(
  createElement(BlockActions.Provider, { value: actions },
    createElement(BlockTag, { id: "7f3a09bc", streaming: false, load: async () => data })));
window.__ready = true;
"""


class CDP:
    """The smallest DevTools Protocol client that is enough here (same stdlib shape the cluster tests use)."""

    def __init__(self, host: str, port: int, path: str):
        self.sock = socket.create_connection((host, port), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(
            (f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
             f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.sock.recv(4096)
        assert b" 101 " in buf.split(b"\r\n", 1)[0], buf[:120]
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
        self.mid = 0

    def _read(self, n: int) -> bytes:
        while len(self.buf) < n:
            more = self.sock.recv(65536)
            if not more:
                raise OSError("websocket closed")
            self.buf += more
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _send(self, payload: str) -> None:
        data = payload.encode()
        mask = os.urandom(4)
        body = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        head = bytearray([0x81])
        if len(data) < 126:
            head.append(0x80 | len(data))
        elif len(data) < 65536:
            head.append(0x80 | 126)
            head += struct.pack(">H", len(data))
        else:
            head.append(0x80 | 127)
            head += struct.pack(">Q", len(data))
        self.sock.sendall(bytes(head) + mask + body)

    def _recv(self):
        while True:
            b0, b1 = self._read(2)
            ln = b1 & 0x7F
            if ln == 126:
                ln = struct.unpack(">H", self._read(2))[0]
            elif ln == 127:
                ln = struct.unpack(">Q", self._read(8))[0]
            payload, op = self._read(ln), b0 & 0x0F
            if op == 0x8:
                raise OSError("websocket closed by peer")
            if op in (0x1, 0x2):
                return json.loads(payload)

    def call(self, method: str, **params):
        self.mid += 1
        self._send(json.dumps({"id": self.mid, "method": method, "params": params}))
        while True:
            msg = self._recv()
            if msg.get("id") == self.mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result")

    def js(self, expr: str):
        r = self.call("Runtime.evaluate", expression=expr, returnByValue=True)
        if r.get("exceptionDetails"):
            raise RuntimeError(f"probe threw: {r['exceptionDetails']}")
        return r["result"].get("value")

    def mouse(self, x: float, y: float) -> None:
        for m, extra in (("mouseMoved", {}), ("mousePressed", {"button": "left", "clickCount": 1}),
                         ("mouseReleased", {"button": "left", "clickCount": 1})):
            self.call("Input.dispatchMouseEvent", type=m, x=x, y=y, **extra)

    def key(self, name: str, code: str, vk: int, text: str | None = None) -> None:
        for t in ("keyDown", "keyUp"):
            extra = {"text": text} if text and t == "keyDown" else {}
            self.call("Input.dispatchKeyEvent", type=t, key=name, code=code,
                      windowsVirtualKeyCode=vk, nativeVirtualKeyCode=vk, **extra)

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass


def wait_js(cdp: CDP, expr: str, timeout: float = 12.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        got = cdp.js(expr)
        if got:
            return got
        time.sleep(0.05)
    raise AssertionError(f"never became true: {expr}")


@pytest.fixture(scope="module")
def driver_blocks() -> str:
    if CHROME is None:
        pytest.skip("no Chrome/Chromium binary on this machine")
    if not ESBUILD.exists():
        pytest.skip("web/node_modules not installed — cannot bundle the real components")
    proc = subprocess.run(
        [str(ESBUILD), "--bundle", "--format=iife", "--jsx=automatic", "--loader=tsx", "--log-level=warning"],
        input=DRIVER_BLOCKS, capture_output=True, text=True, timeout=180, cwd=str(REPO / "web"))
    assert proc.returncode == 0, proc.stderr
    return proc.stdout


@pytest.fixture(scope="module")
def driver_tag() -> str:
    if CHROME is None:
        pytest.skip("no Chrome/Chromium binary on this machine")
    proc = subprocess.run(
        [str(ESBUILD), "--bundle", "--format=iife", "--jsx=automatic", "--loader=tsx", "--log-level=warning"],
        input=DRIVER_TAG, capture_output=True, text=True, timeout=180, cwd=str(REPO / "web"))
    assert proc.returncode == 0, proc.stderr
    return proc.stdout


@contextmanager
def chrome_page(board: object, driver_js: str, ready: str = "window.__ready"):
    with tempfile.TemporaryDirectory() as work:
        (Path(work) / "driver.js").write_text(driver_js)
        page = Path(work) / "probe.html"
        css = "\n".join(p.read_text() for p in CSS)
        page.write_text(
            "<!doctype html><html><head><meta charset='utf-8'>"
            f"<style>{css}</style></head><body style='margin:0'>"
            "<div id='app'></div>"
            f"<script id='spec' type='application/json'>{json.dumps(board)}</script>"
            "<script src='driver.js'></script></body></html>")
        profile = Path(work) / "profile"
        profile.mkdir()
        proc = subprocess.Popen(
            [str(CHROME), "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
             "--force-device-scale-factor=1", "--force-prefers-reduced-motion",
             f"--window-size={WINDOW_W},{WINDOW_H}", f"--user-data-dir={profile}",
             "--remote-debugging-port=0", f"file://{page}"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            port = _devtools_port(profile)
            cdp = CDP(*_page_socket(port))
            wait_js(cdp, ready)
            yield cdp
            cdp.close()
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()


def _devtools_port(profile: Path) -> int:
    marker = profile / "DevToolsActivePort"
    end = time.monotonic() + 30
    while time.monotonic() < end:
        if marker.exists():
            try:
                return int(marker.read_text().splitlines()[0])
            except (ValueError, IndexError):
                pass
        time.sleep(0.1)
    raise AssertionError("chrome never opened a devtools port")


def _page_socket(port: int):
    end = time.monotonic() + 30
    while time.monotonic() < end:
        try:
            targets = httpx.get(f"http://127.0.0.1:{port}/json/list", timeout=2).json()
        except httpx.HTTPError:
            targets = []
        for t in targets:
            if t.get("type") == "page" and t.get("url", "").endswith("probe.html"):
                _, rest = t["webSocketDebuggerUrl"].split("://", 1)
                hostport, path = rest.split("/", 1)
                return hostport.split(":")[0], int(hostport.split(":")[1]), "/" + path
        time.sleep(0.1)
    raise AssertionError("the probe page never appeared in the devtools target list")


PILL = "document.querySelectorAll('.hb-followups .hb-pill')[{}].getBoundingClientRect()"
SAID = "document.querySelector('.hb-followups-said').textContent"
CALLS = "JSON.stringify(window.__calls)"
BOARD_REAL = {
    "blocks": [{"type": "heading", "text": "Kyoto, three days"},
               {"type": "text", "text": "Temples, trains and one very long evening walk."}],
    "follow_ups": FOLLOW_UPS,
}


def real_click(cdp: CDP, rect_expr: str) -> tuple[float, float]:
    x, y = cdp.js(f"(() => {{ const r = ({rect_expr}); return [r.left + r.width / 2, r.top + r.height / 2]; }})()")
    cdp.mouse(x, y)
    return x, y


def calls_of(cdp: CDP) -> list[list[str]]:
    return json.loads(cdp.js(CALLS))


def clear_calls(cdp: CDP) -> None:
    cdp.js("window.__calls.length = 0, true")


class TestATapSendsTheRightPrompt:
    """Real pointer events against the real seam over a recording fake composer: what a tap submits is exactly
    its prompt, and the word the strip says is only ever the host's own answer."""

    def test_a_real_click_submits_exactly_that_prompt(self, driver_blocks):
        with chrome_page(BOARD_REAL, driver_blocks) as cdp:
            clear_calls(cdp)
            real_click(cdp, PILL.format(1))
            wait_js(cdp, "document.querySelector('.hb-followups-said').textContent")
            calls = calls_of(cdp)
            submits = [t for kind, t in calls if kind == "submit"]
            assert submits == [FOLLOW_UPS[1]["run"]], submits
            assert [t for kind, t in calls if kind == "insert"] == []  # a yes from submit ends the story
            assert cdp.js(SAID) == "Sent to chat."

    def test_a_prompt_past_max_sent_is_posted_not_drafted(self, driver_blocks):
        with chrome_page(BOARD_REAL, driver_blocks) as cdp:
            clear_calls(cdp)
            real_click(cdp, PILL.format(2))            # the 152-character prompt
            wait_js(cdp, "document.querySelector('.hb-followups-said').textContent")
            calls = calls_of(cdp)
            submits = [t for kind, t in calls if kind == "submit"]
            assert submits == [LONG_RUN] and len(LONG_RUN) > 120
            assert [t for kind, t in calls if kind == "insert"] == [], \
                "the long prompt was drafted, not posted — the explicit route is gone"
            assert cdp.js(SAID) == "Sent to chat."

    def test_a_refused_submit_falls_to_an_acknowledged_draft_and_says_so(self, driver_blocks):
        with chrome_page(BOARD_REAL, driver_blocks) as cdp:
            cdp.js("window.__SUBMIT_OK__ = false, true")
            clear_calls(cdp)
            real_click(cdp, PILL.format(0))
            wait_js(cdp, "document.querySelector('.hb-followups-said').textContent")
            calls = calls_of(cdp)
            assert [k for k, _ in calls] == ["submit", "insert", "focus"], calls
            assert cdp.js(SAID) == "In the composer — press Send."

    def test_an_insert_that_answers_nothing_admits_the_text_is_nowhere(self, driver_blocks):
        with chrome_page(BOARD_REAL, driver_blocks) as cdp:
            cdp.js("window.__SUBMIT_OK__ = false; window.__INSERT_FAIL__ = true, true")
            clear_calls(cdp)
            real_click(cdp, PILL.format(0))
            wait_js(cdp, "document.querySelector('.hb-followups-said').textContent")
            assert cdp.js(SAID) == "Send failed — nothing was sent or kept."
            assert cdp.js("document.querySelectorAll('.hb-followups .hb-pill').length") == 3  # taps stay, retryable

    def test_a_command_run_crafted_past_the_reader_is_still_never_submitted(self, driver_blocks):
        with chrome_page({"direct": True, "follow_ups": [{"label": "Reset", "run": "/reset"}]}, driver_blocks) as cdp:
            clear_calls(cdp)
            real_click(cdp, PILL.format(0))
            wait_js(cdp, "document.querySelector('.hb-followups-said').textContent")
            calls = calls_of(cdp)
            assert [k for k, _ in calls] == ["insert", "focus"], calls  # submit was never tried
            assert cdp.js(SAID) == BLOCKED

    def test_a_long_label_and_a_run_past_300_chars_are_read_whole_and_sent_exactly(self, driver_blocks):
        # Round 2's blocked criterion: the reader used to silently cut these words at 40/300, so the tap
        # sent a DIFFERENT message than the board stored. Through the real read, the real draw, and the
        # real seam: the label reaches the pill whole, and the submit carries the entire prompt.
        board = {"blocks": [{"type": "text", "text": "Kyoto, three days"}], "follow_ups": FOLLOW_UPS_LONG}
        with chrome_page(board, driver_blocks) as cdp:
            labels = cdp.js("(() => [...document.querySelectorAll('.hb-followup-label')]"
                            ".map((e) => e.textContent))()")
            assert labels == [f["label"] for f in FOLLOW_UPS_LONG], "a word was cut on the way to the row"
            titles = cdp.js("(() => [...document.querySelectorAll('.hb-followups .hb-pill')]"
                            ".map((e) => e.title))()")
            assert titles == [f["run"] for f in FOLLOW_UPS_LONG]
            clear_calls(cdp)
            real_click(cdp, PILL.format(0))                            # the 68-character label, 449-char prompt
            wait_js(cdp, "document.querySelector('.hb-followups-said').textContent")
            submits = [t for k, t in calls_of(cdp) if k == "submit"]
            assert submits == [WHOLE_RUN] and len(WHOLE_RUN) > 300, "the prompt arrived cut, not whole"
            assert [t for k, t in calls_of(cdp) if k == "insert"] == [], "posted, never drafted"
            assert cdp.js(SAID) == "Sent to chat."

    def test_a_second_tap_while_the_host_is_silent_clears_the_stale_word(self, driver_blocks):
        # Round 2's other blocked criterion: tap A got "sent", tap B is out with the host not yet answering,
        # and the strip still said "Sent to chat." — a success nobody acknowledged for THIS tap. Real async:
        # the fake host holds its insert promise open until the test lets it answer.
        with chrome_page(BOARD_REAL, driver_blocks) as cdp:
            real_click(cdp, PILL.format(0))
            wait_js(cdp, "document.querySelector('.hb-followups-said').textContent")
            assert cdp.js(SAID) == "Sent to chat."
            cdp.js("window.__SUBMIT_OK__ = false; window.__SLOW__ = true; window.__GO__ = false, true")
            clear_calls(cdp)
            real_click(cdp, PILL.format(1))
            assert wait_js(cdp, f"(() => document.querySelector('.hb-followups-said').textContent"
                                f" === '{PENDING_WORD}')()"), "the old success word stayed on a new tap"
            assert "Sent" not in cdp.js(SAID)
            cdp.js("window.__GO__ = true, true")  # the host finally answers THIS tap
            wait_js(cdp, "(() => document.querySelector('.hb-followups-said').textContent"
                          " === 'In the composer — press Send.')()")
            assert cdp.js(SAID) == "In the composer — press Send."


class TestTheReaderGuardHolds:
    """The NO_SEND drop happens at read: a board whose stored follow_ups smuggle a command (an old board, a
    hand-edited store) simply never offers it — and its neighbours stand."""

    def test_a_guarded_stored_run_never_becomes_a_pill(self, driver_blocks):
        board = {"blocks": [{"type": "text", "text": "Hi"}],
                 "follow_ups": [{"label": "Reset", "run": "/reset"},
                                {"label": "Pull", "run": "Open @file:notes.md"},
                                {"label": "Good", "run": "Tell me more"}]}
        with chrome_page(board, driver_blocks) as cdp:
            labels = cdp.js("[...document.querySelectorAll('.hb-followup-label')].map(e => e.textContent)")
            assert labels == ["Good"], labels
            clear_calls(cdp)
            real_click(cdp, PILL.format(0))
            wait_js(cdp, "document.querySelector('.hb-followups-said').textContent")
            assert [k for k, _ in calls_of(cdp)][0] == "submit"  # what is drawn is safe, and posting works


class TestKeyboardActivation:
    """A trusted Tab reaches the strip and a trusted Enter posts it — the reader never needs the mouse."""

    def test_tab_then_enter_submits_the_prompt(self, driver_blocks):
        with chrome_page(BOARD_REAL, driver_blocks) as cdp:
            clear_calls(cdp)
            cdp.key("Tab", "Tab", 9)
            first = wait_js(cdp, "(() => { const a = document.activeElement;"
                                 " return a && a.classList && a.classList.contains('hb-pill')"
                                 " ? a.textContent : null; })()")
            assert "Plan day 2" in first, first
            # A trusted Enter must ACTIVATE the focused button — Chrome runs the default action when the key
            # arrives with its text, exactly as a real keyboard delivers it.
            cdp.key("Enter", "Enter", 13, text="\r")
            wait_js(cdp, "document.querySelector('.hb-followups-said').textContent")
            calls = calls_of(cdp)
            assert [t for k, t in calls if k == "submit"] == [FOLLOW_UPS[0]["run"]]
            assert cdp.js(SAID) == "Sent to chat."


PROV_BOARD = {
    "blocks": [{"type": "heading", "text": "Kyoto, three days"},
               {"type": "chart", "kind": "scatter", "title": "Walks", "unit": "km",
                "x": [1, 2, 3], "series": [{"name": "km", "data": [4, 6, 9]}]},
               {"type": "source", "text": "City open data", "url": "https://example.gov/data"}],
    "as_of": "2026-11-19", "live": True,
    "follow_ups": FOLLOW_UPS,
}


class TestCompositionWithFooterAndOverlays:
    """The real host BlockTag: footer above, strip below, ONE instance that rides into the dialog and back."""

    def test_the_strip_sits_beneath_the_provenance_footer(self, driver_tag):
        with chrome_page(PROV_BOARD, driver_tag, "document.querySelectorAll('.hb-followups .hb-pill').length") as cdp:
            geo = cdp.js("""(() => {
              const f = document.querySelector(".hb-provenance").getBoundingClientRect();
              const s = document.querySelector(".hb-followups").getBoundingClientRect();
              const b = document.querySelector(".hb-blocks").getBoundingClientRect();
              return [f.bottom <= s.top + 1, f.left >= b.left - 1, s.right <= b.right + 1];
            })()""")
            assert geo == [True, True, True], geo

    def test_expanding_moves_the_one_strip_its_word_and_state_included(self, driver_tag):
        with chrome_page(PROV_BOARD, driver_tag, "document.querySelectorAll('.hb-followups .hb-pill').length") as cdp:
            clear_calls(cdp)
            real_click(cdp, PILL.format(0))
            wait_js(cdp, "document.querySelector('.hb-followups-said').textContent")
            cdp.js("window.__strip = document.querySelector('.hb-followups'), true")
            expand = "(() => { const b = document.querySelector('.hb-expand').getBoundingClientRect();" \
                     " return [b.left + b.width / 2, b.top + b.height / 2]; })()"
            x, y = cdp.js(expand)
            cdp.mouse(x, y)
            same = wait_js(cdp, "(() => { const d = document.querySelector('.hb-board-overlay');" \
                                " return d && d.querySelector('.hb-followups') === window.__strip ? 1 : null; })()")
            assert same == 1, "the dialog re-instantiated the strip (a second board instance)"
            assert cdp.js("document.querySelector('.hb-followups-said').textContent") == "Sent to chat."
            # and it still POSTS from inside the dialog
            clear_calls(cdp)
            dpill = "document.querySelector('.hb-board-overlay .hb-followups .hb-pill').getBoundingClientRect()"
            real_click(cdp, dpill)
            wait_js(cdp, "(() => { const c = window.__calls; return c.length ? JSON.stringify(c) : null; })()")
            assert [t for k, t in calls_of(cdp) if k == "submit"] == [FOLLOW_UPS[0]["run"]]
            # one Escape steps the dialog down, the strip returns to flow with the board, word intact
            cdp.key("Escape", "Escape", 27)
            wait_js(cdp, "!document.querySelector('.hb-board-overlay')")
            assert cdp.js("document.querySelector('.hb-followups') === window.__strip") is True
            assert cdp.js("document.querySelector('.hb-followups-said').textContent") == "Sent to chat."

    def test_a_detail_opened_from_the_strip_board_answers_escape_first(self, driver_tag):
        with chrome_page(PROV_BOARD, driver_tag, "document.querySelectorAll('circle.hb-chart-dot').length") as cdp:
            expand = "(() => { const b = document.querySelector('.hb-expand').getBoundingClientRect();" \
                     " return [b.left + b.width / 2, b.top + b.height / 2]; })()"
            x, y = cdp.js(expand)
            cdp.mouse(x, y)
            wait_js(cdp, "!!document.querySelector('.hb-board-overlay')")
            dot = "document.querySelector('.hb-board-overlay circle.hb-chart-dot').getBoundingClientRect()"
            real_click(cdp, dot)
            wait_js(cdp, "!!document.querySelector('.hb-chart-detail')")
            cdp.key("Escape", "Escape", 27)
            wait_js(cdp, "!document.querySelector('.hb-chart-detail')")
            assert cdp.js("!!document.querySelector('.hb-board-overlay .hb-followups')") is True  # strip still there
            cdp.key("Escape", "Escape", 27)
            wait_js(cdp, "!document.querySelector('.hb-board-overlay')")  # the board steps down only next
