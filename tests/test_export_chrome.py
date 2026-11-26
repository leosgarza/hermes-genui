# Real-browser regression for the per-block export affordance (t_bff8178a, enhancement #6 — ROUND 3,
# the maintainer's reshape on #75).
#
# Charts draw as hand-built SVG or as DOM bars, tables as HTML. PNG, CSV and JSON are deterministic host acts
# with ZERO requests: the stored envelope rode in with the board's own load and the pictures never needed the
# door. Markdown is the one act that ASKS — exactly once, at the ONE text writer
# (GET /blocks/<id>/markdown?version=N, host hooks/text_fallback.py), pinned to the version the CURRENT
# DRAWING committed with (round 4): never "whatever the host is on now", and never a selection whose load
# has not landed. The file can only ever say what the chat says, because it IS the chat's writer. The door
# mock answers that ask with bytes the REAL serializer produced in this process, so the
# byte-equality claim runs end to end. jsdom has no rasterizer, no layout and no
# downloads, so everything that matters here can only be proven in real Chrome. The Reviewer findings and
# their required proofs, in order:
#
# (F1) THE WRITER IS THE ANSWER. The harness loads the board through the door, records every ask, and can
#     tear the door away. With the door OFF a Markdown click writes NO file and says so plainly, while JSON
#     — from the envelope the page already holds — still writes, byte-equal to it, unknown words and all.
#     With the door ON, Markdown costs exactly ONE ask and the download equals the serializer's uncapped
#     output verbatim (no footer, no twin — the twin died with the reshape). window.__rest shows every ask.
#
# (F2) COVERAGE. Every supported block carries its corner: the SVG kinds, the DOM-drawn horizontal bars, blocks
#     nested inside a grid. (The expanded dialog #72 grows on the tag is the expand feature's own surface:
#     the export chrome composes beside it, never inside it.) The PNG bytes decode to
#     dimensions EXACTLY what the production formulas compute for each picture (including the rebuilt hbar one,
#     measured through the shipped hbarSvg + captionLines + pngMetrics), and the nested table's CSV holds its
#     own stored rows.
#
# (F3) LEGIBLE, WITH THE FIGURE'S OWN WORDS. The raster's alpha channel is fully 255 (the PNG stands on any
#     surface); on the light host the background reads light, on a dark-tokened host it reads dark, and the
#     caption ink keeps a luminance spread on BOTH. The caveat line's band — computed from the same formulas —
#     holds real ink rows (a projection note may not vanish from the file it qualifies), and the CSV is the
#     stored table alone: the data block, formula-looking words neutralized, round-tripping every stored row
#     through Python's csv reader.
#
# (F4) KEYBOARD. No hover happens in this test. Real Tab presses from the page body walk the tab order and
#     REACH EVERY exportable block's corner button — including a table with no interactive descendants at all —
#     and a trusted Enter on the focused button writes the file.
#
# THE STANDING RULES ride along: the board's own DOM is byte-identical through every act (and holds still
# between reads); no act ever speaks to the composer; the shipped hover card still works with the chrome
# mounted; at a 380px-wide board every corner stays inside its host and nothing scrolls.
from __future__ import annotations

import base64
import csv
import httpx
import importlib
import io
import json
import math
import os
import re
import shutil
import socket
import struct
import subprocess
import tarfile
import tempfile
import time
import zlib
from contextlib import contextmanager
from pathlib import Path

import pytest

from conftest import load_plugin_package

tf = importlib.import_module("hermes_genui.hooks.text_fallback") if load_plugin_package() else None

# --- inlined real-Chrome harness (the upstream base has no chrome-test module yet: this suite is
#     self-contained — the CDP client, devtools plumbing and stylesheet list the earlier offers grew,
#     ported verbatim from the stack's harnesses so no sibling PR is needed to run it) ---
REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "web" / "src"
BASE_CSS = [
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


ESBUILD = REPO / "web" / "node_modules" / ".bin" / "esbuild"
CSS = BASE_CSS[:2] + [SRC / "host" / "blockTag.css"] + BASE_CSS[2:]

class CDP:
    """The smallest DevTools Protocol client that is enough here: one page, text frames, call-and-answer.
    Raw stdlib websocket (the harness bans new deps) — client frames masked, server frames not."""

    def __init__(self, host: str, port: int, path: str):
        self.sock = socket.create_connection((host, port), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(
            (f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
             f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            # Empty bytes mean Chrome CLOSED the connection: fail the test naming it, never spin here
            # forever (docs.python.org: socket.recv answers b"" on close; _read below already says so).
            chunk = self.sock.recv(4096)
            if not chunk:
                raise OSError("websocket closed during the handshake")
            buf += chunk
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
            head.append(0x80 | 127)  # 64-bit length — not reached in practice, kept honest
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
            # else: ping/pong/other control or continuation — not used by CDP over loopback

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
        """A REAL click: the browser hit-tests these events exactly as a reader's mouse would."""
        for m, extra in (("mouseMoved", {}), ("mousePressed", {"button": "left", "clickCount": 1}),
                         ("mouseReleased", {"button": "left", "clickCount": 1})):
            self.call("Input.dispatchMouseEvent", type=m, x=x, y=y, **extra)

    def key(self, name: str, code: str, vk: int) -> None:
        for t in ("keyDown", "keyUp"):
            self.call("Input.dispatchKeyEvent", type=t, key=name, code=code,
                      windowsVirtualKeyCode=vk, nativeVirtualKeyCode=vk)

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass


def wait_js(cdp: CDP, expr: str, timeout: float = 12.0):
    """Poll an expression until it returns something truthy (Chrome needs a moment between event and paint)."""
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        got = cdp.js(expr)
        if got:
            return got
        time.sleep(0.05)
    raise AssertionError(f"never became true: {expr}")

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

def real_click(cdp: CDP, rect_expr: str) -> tuple[float, float]:
    x, y = cdp.js(f"(() => {{ const r = ({rect_expr}); return [r.left + r.width / 2, r.top + r.height / 2]; }})()")
    cdp.mouse(x, y)
    return x, y


WINDOW_W, WINDOW_H = 1400, 1200
NARROW_W = 380

# The board: a heading (no export), an SVG bar chart carrying a source AND a caveat (the exported PNG must
# keep the word that qualifies it — raised on #75), a pie (legend table, headline), the DOM-drawn horizontal
# bars (no <svg> at all, its own caveat), a NON-INTERACTIVE table whose cells stress every CSV escape rule,
# and a GRID holding a nested chart and a nested table — every coverage case the rework owed, plus an unknown
# envelope word the JSON export must carry.
BOARD = {
    "updated_at": "2026-11-18T10:00:00+05:30",
    "links": [{"id": "0badc0de", "note": "last quarter"}],
    "model_note": "kept verbatim",
    "blocks": [
        {"type": "heading", "text": "Kyoto budget"},
        {"type": "chart", "kind": "bar", "title": "Cost by day", "unit": "¥",
         "x": ["Day 1", "Day 2", "Day 3"], "series": [{"name": "Cost", "data": [42000, 31500, 28000]}],
         "source": "Trip ledger", "caveat": "Day 3 is a projection."},
        {"type": "chart", "kind": "pie", "title": "Cost mix", "x": ["Stay", "Eat", "See"],
         "series": [{"data": [73000, 24000, 4000]}], "source": "Stay survey"},
        {"type": "chart", "kind": "hbar", "title": "Costs by stay", "x": ["Kanra", "Miyagasa", "Hostel"],
         "series": [{"name": "Cost", "data": [42000, 31500, 12000]}], "caveat": "Net of points."},
        {"type": "source", "text": "Kyoto Tourist Board"},
        {"type": "table", "caption": "Lodging, compared",
         "columns": ["Hotel", "Price, nightly", "Notes"],
         "rows": [["Hotel Kanra", "¥42,000", 'has a "cypress" bath'],
                  ["Sequence Miyagasa", "¥31,500", "on Kyoto station"]]},
        {"type": "grid", "children": [
            {"type": "chart", "kind": "line", "title": "Trend in grid", "x": ["Q1", "Q2"],
             "series": [{"name": "Spend", "data": [11, 18]}]},
            {"type": "table", "caption": "Inside grid", "columns": ["City", "Days"],
             "rows": [["Kyoto", "3"], ["Nara", "1"]]},
        ]},
    ],
}

# The hand-written CSV data block (the writer is not its own witness): quoted header word with a comma,
# quoted cell with a comma, doubled quotes inside a cell, CRLF records, trailing CRLF. With the provenance
# line dropped (held for #71) the file is the data block ALONE.
CSV_DATA = (
    "Hotel,\"Price, nightly\",Notes\r\n"
    "Hotel Kanra,\"¥42,000\",\"has a \"\"cypress\"\" bath\"\r\n"
    "Sequence Miyagasa,\"¥31,500\",on Kyoto station\r\n"
)
CSV_FILE = f"\uFEFF{CSV_DATA}"

# The whole board through the REAL serializer, uncapped — what the markdown door answers, and what the
# download must equal byte for byte (one writer: the file IS the chat's words, newline closed).
MD_BODY = tf.blocks_as_text(BOARD["blocks"], limit=None) if tf else ""

DRIVER = """
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { BlockActions } from "./src/host/actions";
import { BlockTag } from "./src/host/BlockTag";
import { setSlotStatus } from "./src/core/slotDraw";
import { PNG_PAD, PNG_SCALE, LINE_GAP, LINE_RATIO, captionLines, hbarSvg, opaqueBackdrop,
         pngMetrics } from "./src/lib/export";

const calls = [];
window.__calls = calls;
window.__hits = 0;
window.__log = [];
window.__buttonClicks = 0;
// Witness for the suite: pointerdowns that land ON export controls (click_corner converges on this counter,
// not on a paint it cannot see), and the anchor-click seam every saveBlob uses — so a failed act says exactly
// which step of the gesture did or did not happen.
document.addEventListener("pointerdown", (e) => {
  const b = e.target.closest && e.target.closest(".hb-export-btn, .hb-export, .hb-export-menu > button");
  if (b) { window.__hits += 1;
    window.__log.push("down:" + (b.getAttribute("aria-label") || b.textContent || b.className)); }
}, true);
document.addEventListener("pointerup", (e) => {
  const b = e.target.closest && e.target.closest(".hb-export-btn, .hb-export, .hb-export-menu > button");
  if (b) window.__log.push("up:" + (b.getAttribute("aria-label") || b.textContent || b.className));
}, true);
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest(".hb-export-btn, .hb-export, .hb-export-menu > button");
  if (b) { window.__buttonClicks += 1;
    window.__log.push("activate:" + (b.getAttribute("aria-label") || b.textContent || b.className)); }
  const a = e.target.closest && e.target.closest("a[download]");
  if (a) window.__log.push("save:" + a.getAttribute("download"));
}, true);
window.__mark = (m) => window.__log.push("mark:" + m);
const board = JSON.parse(document.getElementById("spec").textContent);
const ARCHIVE = Array.isArray(board.__archive__) ? board.__archive__ : [];
// The markdown door's answers keyed BY VERSION (a board that speaks no version word IS version 1 — the
// door's own rule): bytes the REAL serializer produced in the test process. One writer means the ONLY
// honest parity witness is the writer itself.
const MD = board.__md__ || {};
// The CURRENT board as the host has it. __hostAdvance moves it the way store.update does — the living
// version archived whole, a newer one current — WITHOUT any word reaching a mounted view (round 4's race).
let ENVELOPE = (() => { const e = Object.assign({}, board); delete e.__archive__; delete e.__md__; return e; })();
window.__rest = [];
window.__FAIL_DOOR__ = false;
window.__hostAdvance = (nextVersion, nextBlocks, nextStamp) => {
  const cur = ENVELOPE.version === undefined ? 1 : ENVELOPE.version;
  ARCHIVE.push({ version: cur, saved_at: nextStamp, blocks: ENVELOPE.blocks });
  ENVELOPE = Object.assign({}, ENVELOPE, { version: nextVersion, blocks: nextBlocks, updated_at: nextStamp });
};
// One armed hold: the NEXT version reach-back waits until the test releases it — the state where the
// SELECTION has moved but the DRAWING has not yet landed (round 4's inverse race).
window.__holdBack = null;
window.__armHold = () => {
  window.__holdBack = new Promise((r) => { window.__releaseHold = () => { window.__holdBack = null; r(); }; });
};
// The app's own poke path: a LATER tag of the same address claims nothing, pokes the owner, and the owner
// refetches — the only way this page's live view learns the host moved.
window.__mountSecond = () => {
  const holder = document.createElement("div");
  document.body.append(holder);
  createRoot(holder).render(createElement(BlockActions.Provider,
    { value: { send, fill, rest, blockId: "7f3a09bc" } },
    createElement(BlockTag, { id: "7f3a09bc", streaming: false, load: (qid) => rest("/blocks/" + qid) })));
};
const rest = async (path) => {
  window.__rest.push(path);
  if (window.__FAIL_DOOR__ === true) throw new Error("gone");
  if (path === "/blocks/7f3a09bc") {
    // The real get_block answer: the drawer's projection of the envelope — plus the stored envelope itself,
    // riding along, which is what makes the JSON export need nothing at act time.
    const answer = { blocks: ENVELOPE.blocks, stored: ENVELOPE };
    if (ENVELOPE.version !== undefined) answer.version = ENVELOPE.version;
    if (ENVELOPE.updated_at !== undefined) answer.updated_at = ENVELOPE.updated_at;
    if (ENVELOPE.links !== undefined) answer.links = ENVELOPE.links;
    return answer;
  }
  // The ONE text writer's door (the reshape of #75): /blocks/<id>/markdown answers the board's whole
  // uncapped text; the version rule mirrors get_block's reach-back, so the file follows the version shown.
  const md = /^\\/blocks\\/7f3a09bc\\/markdown(?:\\?version=(\\d+))?$/.exec(path);
  if (md) {
    // get_block's OWN rule (the shared _resolve_board): the address answers the version it is CURRENT on
    // (no version word means version 1); ?version=N reaches back; nothing archived behind it is refused.
    const want = md[1] === undefined ? null : Number(md[1]);
    const cur = ENVELOPE.version === undefined ? 1 : ENVELOPE.version;
    let key;
    if (want === null || want === cur) key = String(cur);
    else {
      if (!ARCHIVE.find((a) => a.version === want)) throw new Error("no markdown version " + want);
      key = String(want);
    }
    if (!(key in MD)) throw new Error("no markdown answer for " + path);
    return { markdown: MD[key] };
  }
  // The version reach-back rides the same door: /blocks/<id>?version=N answers THAT version's envelope —
  // retrieval by address, never a redraw. Only the living fixture asks this; the plain boards never do.
  const back = /^\\/blocks\\/7f3a09bc\\?version=(\\d+)$/.exec(path);
  if (back) {
    if (window.__holdBack !== null) { const g = window.__holdBack; window.__holdBack = null; await g; }
    const hit = ARCHIVE.find((a) => a.version === Number(back[1]));
    if (!hit) throw new Error("no such version");
    const answer = { blocks: hit.blocks, stored: hit };
    if (hit.version !== undefined) answer.version = hit.version;
    if (hit.updated_at !== undefined) answer.updated_at = hit.updated_at;
    if (hit.links !== undefined) answer.links = hit.links;
    return answer;
  }
  if (path.startsWith("/blocks/7f3a09bc/state")) return { state: {} };   // the walk's own door round trips
  throw new Error("unexpected door: " + path);
};
const send = async (text) => { calls.push(["submit", text]); return "sent"; };
const fill = (text) => { calls.push(["insert", text]); };

// The PNG's expected geometry, computed by the PRODUCTION formulas over the live drawing — the SVG box where
// one was drawn, the REBUILT hbar picture (shipped hbarSvg over the stored spec) otherwise — plus the band of
// canvas pixels where the CAVEAT line sits (its text is passed in, the line is found among the figure's own),
// so the test can prove the qualifying word's ink landed there.
window.__wantPng = (sel, spec, caveat) => {
  const fig = document.querySelector(sel);
  if (!fig) return { error: "no figure for " + sel };
  const svg = fig.querySelector("svg");
  let w, h;
  if (svg) { const r = svg.getBoundingClientRect(); w = Math.round(r.width); h = Math.round(r.height); }
  else { const pic = hbarSvg(fig, spec); w = Math.round(pic.width); h = Math.round(pic.height); }
  const m = document.createElement("canvas").getContext("2d");
  const measure = (l) => { m.font = l.font; return m.measureText(l.text).width; };
  const lines = captionLines(fig);
  const withCav = pngMetrics(lines, measure, w, h);
  let bandTop = 0, bandBottom = 0;
  const at = lines.findIndex((l) => l.text === caveat);
  if (at >= 0) {
    let y = PNG_PAD;
    for (let k = 0; k < at; k += 1) y += lines[k].size * LINE_RATIO + LINE_GAP;
    bandTop = y * PNG_SCALE;
    bandBottom = (y + lines[at].size * LINE_RATIO) * PNG_SCALE;
  }
  return { dims: [Math.round(withCav.width * PNG_SCALE), Math.round(withCav.height * PNG_SCALE)],
           band: [Math.round(bandTop), Math.round(bandBottom)] };
};

// The MEASURED hbar truth for the round-3 regression: what production hbarSvg emits for the live drawing,
// side by side with what the browser ACTUALLY laid out — every bar/word/label rect relative to the
// .hb-hbar-box origin, sampled fills, and the exact canvas pixel where the picture starts under the caption
// lines. The picture and the page must agree rect for rect; the PNG pixels must then hold every bar.
window.__hbarMap = (sel, spec) => {
  const fig = document.querySelector(sel);
  if (!fig) return { error: "no figure for " + sel };
  const box = fig.querySelector(".hb-hbar-box");
  const b = box.getBoundingClientRect();
  const pic = hbarSvg(fig, spec);
  const rel = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
  };
  const bars = [];
  const words = [];
  [...box.querySelectorAll(".hb-hbar-tracks")].forEach((tr, i) =>
    [...tr.querySelectorAll(".hb-hbar-track")].forEach((t, k) => {
      const bar = t.querySelector(".hb-hbar-bar");
      if (!bar) return;
      const m = rel(bar);
      m.key = i + ":" + k;
      m.fill = getComputedStyle(bar).backgroundColor;
      bars.push(m);
    }));
  [...box.querySelectorAll(".hb-hbar-values")].forEach((v, i) =>
    [...v.querySelectorAll("span")].forEach((s, k) => {
      const m = rel(s);
      m.key = i + ":" + k;
      m.text = (s.textContent || "").trim();
      words.push(m);
    }));
  const labels = [...box.querySelectorAll(".hb-hbar-label")].map((l, i) => {
    const m = rel(l);
    m.key = String(i);
    m.text = (l.textContent || "").trim();
    return m;
  });
  const lines = captionLines(fig);
  const ctx = document.createElement("canvas").getContext("2d");
  const measure = (l) => { ctx.font = l.font; return ctx.measureText(l.text).width; };
  const textHeight = lines.reduce((h, l) => h + l.size * LINE_RATIO, 0)
    + (lines.length ? (lines.length - 1) * LINE_GAP : 0);
  const total = pngMetrics(lines, measure, pic.width, pic.height);
  return {
    picW: pic.width, picH: pic.height, body: pic.body, box: [b.width, b.height],
    dims: [Math.round(total.width * PNG_SCALE), Math.round(total.height * PNG_SCALE)],
    picTop: (PNG_PAD + textHeight) * PNG_SCALE, scale: PNG_SCALE, pad: PNG_PAD,
    bars, words, labels,
  };
};

const app = createRoot(document.getElementById("app"));
app.render(createElement(BlockActions.Provider, { value: { send, fill, rest, blockId: "7f3a09bc" } },
  createElement(BlockTag, { id: "7f3a09bc", streaming: false, load: (id) => rest("/blocks/" + id) })));
window.__readBackdrop = (sel) => opaqueBackdrop(document.querySelector(sel));
window.__setSlotStatus = (sel, state) => {
  setSlotStatus(document.querySelector(sel), state);
  window.dispatchEvent(new Event("resize"));
};
window.__ready = true;
"""

BAR_SEL = ".hb-blocks figure.hb-chart:not(.hb-pie):not(:has(.hb-hbar-box))"
PIE_SEL = ".hb-blocks figure.hb-chart.hb-pie"
HBAR_SEL = ".hb-blocks figure.hb-chart:has(.hb-hbar-box)"
NESTED_SEL = ".hb-blocks .hb-grid-cell figure.hb-chart:has(svg)"
MENU_ITEM_1 = "document.querySelector('.hb-export-menu > button:nth-child(1)').getBoundingClientRect()"
MENU_ITEM_2 = "document.querySelector('.hb-export-menu > button:nth-child(2)').getBoundingClientRect()"
MENU_BUTTON = "document.querySelector('.hb-tag > .hb-export').getBoundingClientRect()"


def corner_expr(i: int) -> str:
    return f"document.querySelectorAll('.hb-export-btn')[{i}].getBoundingClientRect()"


def click_corner(cdp: CDP, i: int, *, wait_for_activation: bool = True) -> None:
    """Use a real pointer path. By default, return only after Chrome delivers the complete button click;
    disabled-state tests may ask for pointerdown alone. A tall board can overflow the window, and the lit style's
    pointer-events commit can trail the hover by a frame, so bring the control into view and converge on the event
    the browser actually delivered rather than trusting its painted rectangle."""
    cdp.js(f"document.querySelectorAll('.hb-export-btn')[{i}].scrollIntoView({{block: 'center'}}), true")
    # A lit style commits on React's schedule and input routing can trail the visible paint by a frame. Re-move
    # and re-press until the capture witnesses both the target pointerdown and, for an enabled control, its click.
    cdp.js(f"window.__mark('corner{i}'), true")
    for _ in range(8):
        before = cdp.js("window.__hits")
        before_clicks = cdp.js("window.__buttonClicks")
        at = (f"(() => {{ const r = ({corner_expr(i)});"
              " return [r.left + r.width / 2, r.top + r.height / 2]; })()")
        box = cdp.js(at)
        cdp.call("Input.dispatchMouseEvent", type="mouseMoved", x=box[0], y=box[1])
        cdp.call("Input.dispatchMouseEvent", type="mousePressed", x=box[0], y=box[1], button="left", clickCount=1)
        cdp.call("Input.dispatchMouseEvent", type="mouseReleased", x=box[0], y=box[1], button="left", clickCount=1)
        time.sleep(0.2)
        if cdp.js("window.__hits") > before and (
            not wait_for_activation or cdp.js("window.__buttonClicks") > before_clicks
        ):
            # The browser delivered the full click for enabled controls; negative tests may request only a press.
            return
    event = "full activation" if wait_for_activation else "pointerdown"
    raise AssertionError(f"corner {i} never received a {event}: {diag(cdp)}")


def click_until(cdp: CDP, expr: str, ready_js: str, tries: int = 4, scroll: str = "") -> None:
    """A real click whose landing the page itself confirms: the same one-frame commit races click_corner
    dodges exist for every control; re-click until the expected truth shows, then stop being clever.
    `scroll` brings the target into view first — after corner clicks scrolled a tall board, a control pinned
    to the tag's top row sits OFF the viewport, and a press at negative coordinates lands on nothing."""
    cdp.js(f"window.__mark({json.dumps('until ' + expr[:34])}), true")
    for _ in range(tries):
        if scroll:
            cdp.js(f"document.querySelector('{scroll}').scrollIntoView({{block: 'center'}}), true")
            time.sleep(0.1)
        real_click(cdp, expr)
        try:
            wait_js(cdp, ready_js, timeout=2.5)
            return
        except AssertionError:
            time.sleep(0.3)
    raise AssertionError(f"the click never took effect: {expr} — page says {diag(cdp)}")


def bundle() -> str:
    if CHROME is None:
        pytest.skip("no Chrome/Chromium binary on this machine")
    if not ESBUILD.exists():
        pytest.skip("web/node_modules not installed — cannot bundle the real components")
    proc = subprocess.run(
        [str(ESBUILD), "--bundle", "--format=iife", "--jsx=automatic", "--loader=tsx", "--log-level=warning"],
        input=DRIVER, capture_output=True, text=True, timeout=180, cwd=str(REPO / "web"))
    assert proc.returncode == 0, proc.stderr
    return proc.stdout


@contextmanager
def chrome_export_page(board: object, driver_js: str, *, width: int = WINDOW_W, height: int = WINDOW_H,
                       narrow: bool = False, dark: bool = False, door_off: bool = True,
                       minimum_exports: int = 2, chart_required: bool = True):
    """One real Chrome, one page, one CDP-configured download folder. The board LOADS through the door, then
    the door is torn off (F1's literal scenario): every export that follows happens with rest() throwing.
    door_off=False keeps the door answered — the living fixture's version reach-back IS a load-time ask,
    and the zero-requests contract is then pinned by COUNTING around each export instead."""
    with tempfile.TemporaryDirectory() as work:
        downloads = Path(work) / "downloads"
        downloads.mkdir()
        (Path(work) / "driver.js").write_text(driver_js)
        page = Path(work) / "probe.html"
        css = "\n".join(p.read_text() for p in CSS)
        page.write_text(
            "<!doctype html><html><head><meta charset='utf-8'>"
            f"<style>{css}</style>"
            # Real Chrome floors --window-size at 500px; a narrow BOARD is then the container's, exactly the
            # shape a side-column reply gives it. The layout truth being measured is the 380px box.
            + ("<style>#app { width: 380px }</style>" if narrow else "")
            # A dark host: the app tokens flipped the way the desktop's dark theme flips them. The exported
            # PNG must stay readable here too — composited onto a dark ground, in light inks.
            + ("<style>:root { --foreground: #e6edf3; --background: #0d1117; } "
               "body { background: #0d1117 !important; }</style>" if dark else "")
            + "</head><body style='margin:0'>"
            "<div id='app'></div>"
            f"<script id='spec' type='application/json'>{json.dumps(board)}</script>"
            "<script src='driver.js'></script></body></html>")
        profile = Path(work) / "profile"
        profile.mkdir()
        proc = subprocess.Popen(
            [str(CHROME), "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
             "--force-device-scale-factor=1", "--force-prefers-reduced-motion",
             f"--window-size={width},{height}", f"--user-data-dir={profile}",
             "--remote-debugging-port=0", f"file://{page}"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            port = _devtools_port(profile)
            cdp = CDP(*_page_socket(port))
            wait_js(cdp, "typeof window.__wantPng === 'function'")
            cdp.call("Browser.setDownloadBehavior", behavior="allow", downloadPath=str(downloads))
            if chart_required:
                wait_js(cdp, "!!document.querySelector('.hb-blocks figure.hb-chart svg')")
            else:
                wait_js(cdp, "!!document.querySelector('.hb-blocks')")
            wait_js(cdp, f"document.querySelectorAll('.hb-export-btn').length >= {minimum_exports}")
            if door_off:
                cdp.js("window.__FAIL_DOOR__ = true, true")   # the load already came through; the door is OFF now
            yield cdp, downloads
            cdp.close()
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()


def hover_js(cdp: CDP, expr: str) -> None:
    """A real mouseMoved onto the middle of whatever box the expression measures."""
    x, y = cdp.js(f"(() => {{ const r = ({expr}); return [r.left + r.width / 2, r.top + r.height / 2]; }})()")
    cdp.call("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y)


def rest_calls(cdp: CDP) -> list:
    return json.loads(cdp.js("JSON.stringify(window.__rest)"))


DIAG = (
    "(() => { const b = document.querySelectorAll('.hb-export-btn')[0]; const cs = b && getComputedStyle(b);"
    "const said = document.querySelector('.hb-export-said');"
    "const failed = document.querySelector('.hb-export-failed');"
    "return JSON.stringify({ hits: window.__hits, log: window.__log,"
    " lit: document.querySelectorAll('.hb-export-btn.lit').length,"
    " disabled: [...document.querySelectorAll('.hb-export-btn')].map(b => b.disabled),"
    " said: said && said.textContent, failed: failed && failed.textContent,"
    " btn0: cs && [cs.opacity, cs.pointerEvents, cs.visibility],"
    " menu: !!document.querySelector('.hb-export-menu'), rest: window.__rest }); })()"
)


def diag(cdp: CDP) -> str:
    """What the page itself knows about a failed act: whether pointerdowns ever reached an export control,
    whether a word is showing, which corner is lit, and what style the control actually carries."""
    return cdp.js(DIAG)


def wait_file_diag(cdp: CDP, downloads: Path, name: str, timeout: float = 15.0) -> bytes:
    try:
        return wait_file(downloads, name, timeout)
    except AssertionError:
        raise AssertionError(f"{name}: page says {diag(cdp)}") from None


def wait_file(downloads: Path, name: str, timeout: float = 15.0) -> bytes:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        for p in downloads.iterdir():
            if p.name == name and p.stat().st_size:
                return p.read_bytes()
        time.sleep(0.1)
    raise AssertionError(f"{name} never landed in {sorted(q.name for q in downloads.iterdir())}")


def wait_any_download(downloads: Path, prefix: str, timeout: float = 15.0) -> tuple[str, bytes]:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        for p in downloads.iterdir():
            if p.name.startswith(prefix) and p.stat().st_size:
                return p.name, p.read_bytes()
        time.sleep(0.1)
    raise AssertionError(f"nothing starting with {prefix} landed")


# --- the round-2 evidence harness: the SAME user acts against BOTH trees ----------------------------------------
# The reviewer's bar: the pairing claim must fail where the BUG is (a wrong file's bytes, on the accepted
# R6) rather than where the FIX is (missing candidate markup), and the layout claim must compare the real
# base bundle against the real candidate bundle, not wrappers removed from one tree with the other's CSS.
# Both need a DRIVER that exists in both trees: DRIVER's only candidate-specific seam is the slot-status test
# hook, so the evidence runs strip exactly that; everything else in it — the door mock, the pointer
# witnesses, the download seam — predates the slots and bundles identically on both.

R6_BASE_COMMIT = "8a7fd6391fb6975be8b16641de7e76b5fb437f0d"   # the accepted R6 working head (on main 3c83a1d)


def slot_free_driver() -> str:
    imp = 'import { setSlotStatus } from "./src/core/slotDraw";\n'
    assert imp in DRIVER, "DRIVER changed shape — re-aim slot_free_driver before running it against the base tree"
    text = DRIVER.replace(imp, "")
    start = text.index("window.__setSlotStatus = (sel, state) => {")
    end = text.index("};\n", start) + 3
    out = text[:start] + text[end:]
    assert "setSlotStatus" not in out, "slot hooks remain in the driver — both trees must build it cleanly"
    return out


def bundle_in(web_dir: Path, driver: str) -> str:
    """Bundle the driver from ANY tree's web directory; esbuild itself is host tooling, not tree content."""
    if CHROME is None:
        pytest.skip("no Chrome/Chromium binary on this machine")
    if not ESBUILD.exists():
        pytest.skip("web/node_modules not installed — cannot bundle the real components")
    proc = subprocess.run(
        [str(ESBUILD), "--bundle", "--format=iife", "--jsx=automatic", "--loader=tsx", "--log-level=warning"],
        input=driver, capture_output=True, text=True, timeout=180, cwd=str(web_dir), check=False)
    assert proc.returncode == 0, proc.stderr
    return proc.stdout


def base_tree(dest: Path) -> None:
    """Materialize the accepted R6 base — the candidate's own parent commit, byte for byte — into dest."""
    proc = subprocess.run(["git", "-C", str(REPO), "archive", R6_BASE_COMMIT],
                          capture_output=True, timeout=180, check=False)
    assert proc.returncode == 0, proc.stderr.decode()
    with tarfile.open(fileobj=io.BytesIO(proc.stdout)) as arc:
        arc.extractall(dest)
    (dest / "web" / "node_modules").symlink_to((REPO / "web" / "node_modules").resolve())


def css_text(root: Path) -> str:
    """The page's stylesheet, read from the given tree's OWN source files."""
    return "\n".join((root / p.relative_to(REPO)).read_text() for p in CSS)


@contextmanager
def chrome_tree_page(board: object, driver_js: str, root: Path, *, ready_js: str,
                     width: int = WINDOW_W, height: int = WINDOW_H):
    """One real Chrome, one page, one CDP-configured download folder, bundle and CSS from a chosen tree.
    No candidate-specific wait is built in: the caller waits on whatever BOTH trees draw, so a base run
    and a candidate run see the same page, driven by the same acts."""
    with tempfile.TemporaryDirectory() as work:
        downloads = Path(work) / "downloads"
        downloads.mkdir()
        (Path(work) / "driver.js").write_text(driver_js)
        page = Path(work) / "probe.html"
        page.write_text(
            "<!doctype html><html><head><meta charset='utf-8'>"
            f"<style>{css_text(root)}</style>"
            "</head><body style='margin:0'>"
            "<div id='app'></div>"
            f"<script id='spec' type='application/json'>{json.dumps(board)}</script>"
            "<script src='driver.js'></script></body></html>")
        profile = Path(work) / "profile"
        profile.mkdir()
        proc = subprocess.Popen(
            [str(CHROME), "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
             "--force-device-scale-factor=1", "--force-prefers-reduced-motion",
             f"--window-size={width},{height}", f"--user-data-dir={profile}",
             "--remote-debugging-port=0", f"file://{page}"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            port = _devtools_port(profile)
            cdp = CDP(*_page_socket(port))
            wait_js(cdp, "typeof window.__wantPng === 'function'")
            cdp.call("Browser.setDownloadBehavior", behavior="allow", downloadPath=str(downloads))
            wait_js(cdp, ready_js)
            yield cdp, downloads
            cdp.close()
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()


def wait_first_file(downloads: Path, timeout: float = 15.0) -> tuple[str, bytes]:
    """Whatever file the act actually wrote — the RED witness needs the WRONG one named, not a preset."""
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        for p in sorted(downloads.iterdir()):
            if p.stat().st_size:
                return p.name, p.read_bytes()
        time.sleep(0.1)
    raise AssertionError(f"no export file ever landed in {downloads}")


PAIRING_BYTES = b"\xef\xbb\xbfItem\r\nTAPPED-SECOND\r\n"


def pairing_board(container: str) -> dict:
    """The table lists with a draws-nothing block before and between the two tables: AN IMAGE STRIP WHOSE
    PHOTOS ALL FAIL — CodeRabbit's own scenario on #75. The block READS fine in both trees (a valid url list)
    and survives in the block list; its drawing appears and then disappears as every photo errors out. The
    walk's next scan then meets fewer drawn children than blocks. An empty source line, by contrast, is
    dropped by the reader itself (readSource → null → filtered) — both trees' block lists compress evenly —
    so it is not the honest shift witness; the strip is."""
    dead = {"type": "images", "images": [{"url": "https://127.0.0.1:9/missing.png", "caption": "gone"}]}
    first = {"type": "table", "caption": "first", "columns": ["Item"], "rows": [["FIRST-ONLY"]]}
    second = {"type": "table", "caption": "second", "columns": ["Item"], "rows": [["TAPPED-SECOND"]]}
    children = [dead, first, dead, second]
    if container == "tab":
        blocks = [{"type": "tabs", "tabs": [{"label": "Data", "children": children}]}]
    elif container == "section":
        blocks = [{"type": "section", "title": "Data", "children": children}]
    else:
        blocks = children
    return {"version": 1, "blocks": blocks}


def run_pairing_case(cdp: CDP, downloads: Path, container: str) -> None:
    """One user act on the table the reader tapped, one claim about the bytes of the file. It requires
    nothing the candidate adds: wait for the two drawn table cards, wait the strip out of existence (photo
    errors, identically in both trees), then dispatch a resize — the very rescan a reader's scroll gives —
    and find the corner riding ON the second table, click it, and require the tapped table's own bytes.
    Where pairing shifts — the accepted R6, where the rescan finds two blocks' worth of fewer drawn
    children than the list has — the NEIGHBOUR's file lands, and exactly that wrong-file fact fails the
    assertion, with the observed bytes named."""
    wait_js(cdp, "document.querySelectorAll('.hb-table-card').length === 2")
    wait_js(cdp, "document.querySelectorAll('.hb-photos').length === 0")   # every photo has failed: the strips are gone
    wait_js(cdp, "document.querySelectorAll('.hb-export-btn').length >= 1")
    cdp.js("window.dispatchEvent(new Event('resize')), true")              # the rescan a reader's scroll gives
    time.sleep(0.6)                                                        # let the scan commit its new pairing
    corners = json.loads(cdp.js("""(() => {
      const t = [...document.querySelectorAll('.hb-table-card')].at(-1).getBoundingClientRect();
      return JSON.stringify([...document.querySelectorAll('.hb-export-btn')].map((b, i) => {
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        return { i, onTapped: cx >= t.left && cx <= t.right && cy >= t.top && cy <= t.bottom,
                 label: b.getAttribute('aria-label') };
      }));
    })()"""))
    on_tapped = [c for c in corners if c["onTapped"]]
    assert on_tapped, f"{container}: no export corner sits on the tapped table — page says {diag(cdp)}"
    click_corner(cdp, on_tapped[0]["i"])
    name, data = wait_first_file(downloads)
    assert data == PAIRING_BYTES, (
        f"{container}: the corner on the second table exported {name} carrying {data!r} — a neighbour "
        f"table's file, not the tapped table's {PAIRING_BYTES!r}")
    assert name == "second.csv", f"{container}: exported {name}, expected second.csv"


# --- a small PNG reader: signature, IHDR, and the full raster unfiltered to bytes per scanline ------------------

def png_dims(data: bytes) -> tuple[int, int, int, int]:
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    (ln,) = struct.unpack(">I", data[8:12])
    assert data[12:16] == b"IHDR" and ln == 13
    w, h, depth, colour = struct.unpack(">IIBB", data[16:26])
    return w, h, depth, colour


def png_scanlines(data: bytes) -> list[bytes]:
    """Every scanline, unfiltered (8-bit truecolour or RGBA — the only shapes canvas.toBlob writes)."""
    w, h, depth, colour = png_dims(data)
    assert depth == 8 and colour in (2, 6), f"unexpected bit depth {depth} / colour type {colour}"
    channels = 3 if colour == 2 else 4
    i, idat = 8, b""
    while i + 8 <= len(data):
        (ln,) = struct.unpack(">I", data[i:i + 4])
        typ = data[i + 4:i + 8]
        if typ == b"IDAT":
            idat += data[i + 8:i + 8 + ln]
        if typ == b"IEND":
            break
        i += 12 + ln
    raw = zlib.decompress(idat)
    stride = w * channels
    out: list[bytes] = []
    pos, prev = 0, bytearray(stride)
    for _ in range(h):
        f = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        for x in range(stride):
            a = line[x - channels] if x >= channels else 0
            b = prev[x]
            c = prev[x - channels] if x >= channels else 0
            v = line[x]
            if f == 1:
                v = (v + a) & 255
            elif f == 2:
                v = (v + b) & 255
            elif f == 3:
                v = (v + ((a + b) >> 1)) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                v = (v + pr) & 255
            line[x] = v
        out.append(bytes(line))
        prev = line
    return out


def png_alpha_all_opaque(lines: list[bytes], data: bytes) -> bool:
    """Every alpha byte in the raster is 255: the export stands on any surface, no translucent ground."""
    _, _, _, colour = png_dims(data)
    if colour == 2:
        return True
    return all(line[x] == 255 for line in lines for x in range(3, len(line), 4))


def lum(line: bytes, x: int, channels: int) -> int:
    return (line[x] * 3 + line[x + 1] * 4 + line[x + 2] * 2) // 9


def bg_luma(data: bytes) -> int:
    """The canvas's own backdrop: the very first pixel (padding is always background)."""
    lines = png_scanlines(data)
    _, _, _, colour = png_dims(data)
    ch = 3 if colour == 2 else 4
    return lum(lines[0], 0, ch)


def luma_spread(data: bytes) -> tuple[int, int]:
    _, _, _, colour = png_dims(data)
    ch = 3 if colour == 2 else 4
    lo, hi = 255, 0
    for line in png_scanlines(data):
        for x in range(0, len(line), ch):
            v = lum(line, x, ch)
            lo, hi = min(lo, v), max(hi, v)
    return lo, hi


def band_ink_rows(data: bytes, band: tuple[int, int]) -> int:
    """How many scanlines inside the band hold pixels that clearly differ from the backdrop — real ink."""
    _, _, _, colour = png_dims(data)
    ch = 3 if colour == 2 else 4
    ground = bg_luma(data)
    rows = 0
    for line in png_scanlines(data)[band[0]:band[1]]:
        if any(abs(lum(line, x, ch) - ground) > 40 for x in range(0, len(line), ch)):
            rows += 1
    return rows


# --- the measured hbar truth: what production hbarSvg emitted, and the live rects it must equal ----------------

def hbar_map(cdp, sel: str, spec: dict) -> dict:
    return json.loads(cdp.js(
        f"JSON.stringify(window.__hbarMap({json.dumps(sel)}, {json.dumps(spec)}))"))


def emitted_rects(body: str) -> dict:
    """Every emitted <rect>, keyed by (role, "row:series"), carrying x/y/width/height."""
    out = {}
    for m in re.finditer(r'<rect (data-bar|data-zero)="([^"]+)"([^>]*)/>', body):
        pairs = dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(3)))
        out[(m.group(1), m.group(2))] = {k: float(pairs[k]) for k in ("x", "y", "width", "height")}
    return out


def emitted_words(body: str) -> dict:
    out = {}
    for m in re.finditer(
            r'<text data-word="([^"]+)" x="(-?[\d.]+)" y="(-?[\d.]+)" text-anchor="(\w+)"[^>]*>(.*?)</text>', body):
        out[m.group(1)] = {"x": float(m.group(2)), "y": float(m.group(3)), "anchor": m.group(4), "text": m.group(5)}
    return out


def emitted_labels(body: str) -> dict:
    out = {}
    for m in re.finditer(r'<text data-label="(\d+)" x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*>(.*?)</text>', body):
        out[m.group(1)] = {"x": float(m.group(2)), "y": float(m.group(3)), "text": m.group(4)}
    return out


def parse_rgb(value: str) -> tuple[int, int, int]:
    m = re.match(r"rgba?\(([\d.,\s]+)\)", value)
    assert m, f"not an rgb paint: {value!r}"
    r, g, b = (int(float(p)) for p in m.group(1).split(",")[:3])
    return (r, g, b)


def bars_in_png(data: bytes, m: dict) -> dict:
    """Every bar the drawing laid out, found in the downloaded PNG's pixels at its measured place: the sampled
    fill colour sits on the bar's centre row, and its run there matches the rendered width. Keys are
    "row:series" — a missing bar, a drifted place, or a run that is not the bar fails right there, naming it."""
    w_img, h_img, _d, colour = png_dims(data)
    ch = 3 if colour == 2 else 4
    scale, pad = m["scale"], m["pad"]
    lines = png_scanlines(data)
    runs = {}
    for bar in m["bars"]:
        want = parse_rgb(bar["fill"])
        x0 = int(round((pad + bar["x"]) * scale))
        x1 = int(round((pad + bar["x"] + bar["w"]) * scale))
        cy = int(round(m["picTop"] + (bar["y"] + bar["h"] / 2) * scale))
        assert 0 <= x0 < x1 <= w_img, f"bar {bar['key']} lies outside the image horizontally"
        assert 0 <= cy < h_img, f"bar {bar['key']} leaves the image vertically (the round-2 clip)"
        row = lines[cy]

        def close(x: int) -> bool:
            return (abs(row[x * ch] - want[0]) <= 40 and abs(row[x * ch + 1] - want[1]) <= 40
                    and abs(row[x * ch + 2] - want[2]) <= 40)

        cx = (x0 + x1) // 2
        assert close(cx), f"bar {bar['key']}: no {want} paint at its measured centre ({cx},{cy})"
        lo = cx
        while lo - 1 >= x0 - 3 and close(lo - 1):
            lo -= 1
        hi = cx
        while hi + 1 <= x1 + 3 and close(hi + 1):
            hi += 1
        run = hi - lo + 1
        assert abs(run - (x1 - x0)) <= max(8, 0.15 * (x1 - x0)), (
            f"bar {bar['key']}: pixel run {run} is not its rendered width {x1 - x0}")
        runs[bar["key"]] = run
    return runs


class TestExportFullScreenKeyboard:
    def test_real_tab_reaches_the_per_block_button_inside_full_screen(self):
        js = bundle()
        with chrome_export_page(BOARD, js) as (cdp, _downloads):
            click_until(cdp, "document.querySelector('.hb-expand').getBoundingClientRect()",
                        "!!document.querySelector('.hb-board-overlay')", scroll=".hb-expand")
            last_inside = cdp.js("""(() => {
              const root = document.querySelector('.hb-board-overlay');
              const eligible = [...root.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
                .filter(e => e.tabIndex >= 0 && !e.disabled && e.type !== 'hidden' && !e.closest('[hidden]'));
              const last = eligible.at(-1);
              last.focus();
              return last === document.activeElement;
            })()""")
            assert last_inside is True
            cdp.key("Tab", "Tab", 9)
            assert wait_js(cdp, "document.activeElement.matches('.hb-export-btn')")
            assert cdp.js("document.activeElement.getAttribute('aria-label').includes('Export')") is True


class TestPngSnapshotTiming:
    def test_name_and_backdrop_are_snapshotted_before_image_decode(self):
        js = bundle()
        with chrome_export_page(BOARD, js) as (cdp, downloads):
            expected = json.loads(cdp.js("JSON.stringify(window.__readBackdrop('.hb-blocks figure.hb-chart'))"))
            cdp.js("""(() => {
              const nativeDecode = HTMLImageElement.prototype.decode;
              window.__decodeStarted = false;
              window.__decodeGate = new Promise(resolve => { window.__releaseDecode = resolve; });
              HTMLImageElement.prototype.decode = function() {
                window.__decodeStarted = true;
                return nativeDecode.call(this).then(() => window.__decodeGate);
              };
            })()""")
            click_corner(cdp, 0)
            wait_js(cdp, "window.__decodeStarted === true")
            cdp.js("""(() => {
              document.querySelector('.hb-blocks figure.hb-chart .hb-chart-title').textContent =
                'Changed while decoding';
              document.querySelector('.hb-blocks figure.hb-chart').style.backgroundColor = 'rgb(10, 20, 30)';
              window.__releaseDecode();
            })()""")
            data = wait_file_diag(cdp, downloads, "cost-by-day.png")
            lines = png_scanlines(data)
            _w, _h, _depth, colour = png_dims(data)
            channels = 3 if colour == 2 else 4
            assert list(lines[0][:3]) == expected, "the pixels used a later backdrop than the click's drawing"
            assert not any(p.name == "changed-while-decoding.png" for p in downloads.iterdir())
            assert channels in (3, 4)


class TestPairingReachesTheTappedTableBytes:
    """Round-2 merge-gate proof, tree-honest on purpose: the three claims share run_pairing_case with
    tests/slot_pairing_witness.py and ask NOTHING of the candidate's markup. Against the accepted R6 the
    very same acts and the very same byte assertions fail on the WRONG FILE — the neighbor table's bytes
    land where the tapped table's should (the witness log records all three observed failures, per
    container) — and against the frozen candidate every tap exports the tapped table's own file."""
    @pytest.mark.parametrize("container", ["top-level", "tab", "section"])
    def test_a_block_that_draws_nothing_never_moves_the_export_off_the_tapped_table(self, container):
        js = bundle_in(REPO / "web", slot_free_driver())
        with chrome_tree_page(pairing_board(container), js, REPO,
                              ready_js="window.__ready === true") as (cdp, downloads):
            run_pairing_case(cdp, downloads, container)


class TestAllFailedImageStripKeepsPairing:
    def test_the_failed_strip_slot_never_shifts_later_tables(self):
        js = bundle()
        dead = {"type": "images", "images": [{"url": "https://127.0.0.1:9/missing.png", "caption": "gone"}]}
        first = {"type": "table", "caption": "first", "columns": ["Item"], "rows": [["FIRST-ONLY"]]}
        second = {"type": "table", "caption": "second", "columns": ["Item"], "rows": [["TAPPED-SECOND"]]}
        board = {"version": 1, "blocks": [dead, first, dead, second]}
        with chrome_export_page(board, js, minimum_exports=2, chart_required=False) as (cdp, downloads):
            wait_js(cdp, "document.querySelectorAll('.hb-photos').length === 0")  # every photo failed
            wait_js(cdp, "[...document.querySelectorAll('.hb-export-btn')].every(b => !b.disabled)")
            buttons = cdp.js("JSON.stringify([...document.querySelectorAll('.hb-export-btn')]"
                             ".map(b => b.getAttribute('aria-label')))")
            assert json.loads(buttons) == ['Export table “first” as CSV', 'Export table “second” as CSV']
            click_corner(cdp, 1)
            data = wait_file_diag(cdp, downloads, "second.csv")
            assert data == b"\xef\xbb\xbfItem\r\nTAPPED-SECOND\r\n"
            assert b"FIRST-ONLY" not in data


class TestExportStaysProvisionalWhileASlotLoads:
    def test_table_after_a_loading_slot_cannot_export_until_the_slot_is_skipped(self):
        js = bundle()
        dead = {"type": "images", "images": [{"url": "https://127.0.0.1:9/missing.png", "caption": "gone"}]}
        first = {"type": "table", "caption": "first", "columns": ["Item"], "rows": [["FIRST-ONLY"]]}
        second = {"type": "table", "caption": "second", "columns": ["Item"], "rows": [["TAPPED-SECOND"]]}
        board = {"version": 1, "blocks": [first, dead, second]}
        with chrome_export_page(board, js, minimum_exports=2, chart_required=False) as (cdp, downloads):
            slots = cdp.js("document.querySelectorAll('.hb-blocks > .hb-slot').length")
            assert slots == 3
            cdp.js("document.querySelector('.hb-blocks > .hb-slot:nth-child(2) .hb-photos')?.remove(), true")
            cdp.js("window.__setSlotStatus('.hb-blocks > .hb-slot:nth-child(2)', 'skipped'), true")
            wait_js(cdp, "document.querySelectorAll('.hb-export-btn')[1].disabled === false")
            cdp.js("window.__setSlotStatus('.hb-blocks > .hb-slot:nth-child(2)', 'loading'), true")
            wait_js(cdp, "document.querySelectorAll('.hb-export-btn')[1].disabled === true")
            click_corner(cdp, 1, wait_for_activation=False)
            time.sleep(0.3)
            assert list(downloads.iterdir()) == [], "a provisional table pairing must never produce a file"

            cdp.js("window.__setSlotStatus('.hb-blocks > .hb-slot:nth-child(2)', 'skipped'), true")
            wait_js(cdp, "document.querySelectorAll('.hb-export-btn')[1].disabled === false")
            click_corner(cdp, 1)
            data = wait_file_diag(cdp, downloads, "second.csv")
            assert data == b"\xef\xbb\xbfItem\r\nTAPPED-SECOND\r\n"


# --- the round-2 geometry bar: the accepted base bundle versus the candidate bundle, in one real Chrome -------

GEOM_FIXTURE = {
    "version": 1,
    "blocks": [
        {"type": "heading", "text": "Geometry parity"},
        {"type": "text", "text": "Top level, fully drawn."},
        {"type": "chart", "kind": "bar", "title": "Bars", "x": ["A", "B", "C"],
         "series": [{"name": "S", "data": [5, 2, 8]}]},
        {"type": "table", "caption": "Top table", "columns": ["Item", "N"],
         "rows": [["alpha", "1"], ["beta", "2"]]},
        {"type": "row", "children": [
            {"type": "stat", "label": "A", "value": 1},
            {"type": "stat", "label": "B", "value": 2, "trend": [1, 5, 3, 9, 7]},
        ]},
        {"type": "row", "children": [
            {"type": "badge", "text": "own"}, {"type": "button", "label": "Go", "run": "Go"},
            {"type": "text", "text": "shares the row width"},
        ]},
        {"type": "row", "children": [
            {"type": "stat", "label": "C", "value": 3, "align": "center"},
            {"type": "stat", "label": "D", "value": 4, "align": "right", "text_align": "center"},
        ]},
        {"type": "section", "title": "Open section", "children": [
            {"type": "grid", "children": [
                {"type": "table", "caption": "Grid table", "columns": ["a"], "rows": [["1"]]},
                {"type": "row", "children": [
                    {"type": "stat", "label": "E", "value": 5},
                    {"type": "stat", "label": "F", "value": 6, "trend": [2, 8, 4]},
                ]},
            ]},
            {"type": "chart", "kind": "pie", "title": "Mix", "x": ["p", "q"], "series": [{"data": [3, 4]}]},
        ]},
        {"type": "section", "title": "Folded", "collapsed": True, "children": [
            {"type": "text", "text": "revealed", "align": "center"},
            {"type": "table", "caption": "Revealed", "columns": ["x"], "rows": [["9"]]},
        ]},
        {"type": "tabs", "tabs": [
            {"label": "One", "children": [
                {"type": "chart", "kind": "line", "title": "Line", "x": ["d1", "d2"],
                 "series": [{"name": "s", "data": [1, 2]}]},
                {"type": "table", "caption": "Tab table", "columns": ["t"], "rows": [["7"]]},
            ]},
            {"label": "Two", "children": [
                {"type": "grid", "children": [
                    {"type": "text", "text": "g1"}, {"type": "stat", "label": "G", "value": 7},
                ]},
            ]},
        ]},
        {"type": "columns", "children": [
            {"type": "text", "text": "column one"},
            {"type": "text", "text": "column two", "text_align": "right"},
        ]},
        {"type": "source", "items": [{"label": "Ledger", "accessed": "2026-11-20"}]},
        {"type": "text", "text": "Placed at the board top", "align": "right"},
    ],
}

GEOM_PROBE = """(() => {
  // Every drawn box under .hb-blocks, in one normalized path list. A slot wrapper generates NO box, so the
  // walk UNBOXES it here (descend through display:contents instead of counting it): the paths, and with them
  // every rect and computed style entry, come out identical when — and only when — the added structure left
  // the layout of both trees untouched.
  const sig = (el) => {
    const cls = [...el.classList].sort().join('.');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const items = (el) => {
    const out = [];
    for (const c of el.children) {
      if (getComputedStyle(c).display === 'contents') { out.push(...items(c)); continue; }
      out.push(c);
    }
    return out;
  };
  const rec = [];
  const walk = (el, path) => {
    items(el).forEach((child, i) => {
      const p = path + '>' + sig(child) + '[' + i + ']';
      const r = child.getBoundingClientRect();
      const cs = getComputedStyle(child);
      const q = (v) => Math.round(v * 1000) / 1000;
      rec.push({ p, x: q(r.x + scrollX), y: q(r.y + scrollY), w: q(r.width), h: q(r.height),
        display: cs.display, position: cs.position, flex: cs.flex, height: cs.height, width: cs.width,
        maxWidth: cs.maxWidth, alignSelf: cs.alignSelf, textAlign: cs.textAlign });
      walk(child, p);
    });
  };
  const board = document.querySelector('.hb-blocks');
  if (!board) return JSON.stringify({ ready: false });
  walk(board, 'board');
  return JSON.stringify({ ready: true, slots: document.querySelectorAll('.hb-slot').length,
                         count: rec.length, rec });
})()"""


def geom_diff(a: list, b: list) -> str:
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            return f"first difference at entry {i}:\n    base      {x}\n    candidate {y}"
    return f"length differs: base {len(a)} vs candidate {len(b)}"


class TestBaseCandidateGeometryParity:
    """Reviewer item 2, the hard way: the accepted R6 base (8a7fd639) is materialized from git, bundled,
    and served with the candidate — the SAME fixture page, the SAME driver source, the SAME Chrome flags,
    CSS read from each tree's own files. Per state the probe compares every drawn box's rect AND computed
    display/position/flex/width/height/maxWidth/alignSelf/textAlign: fully-drawing top level, a section
    opened from collapsed, each tab panel, nested grids AND rows, unequal-height row cards, own-width row
    cells, and placed children (align + text-align). Removing wrappers from one tree is not proof; this
    is base versus candidate. The base must carry zero slot wrappers and the candidate must carry some —
    the sanity that the two bundles are really the two trees."""
    def _probe_states(self, cdp: CDP) -> dict:
        wait_js(cdp, "document.querySelectorAll('.hb-table-card').length >= 2")
        states = {"settled": json.loads(cdp.js(GEOM_PROBE))}
        click_until(cdp, "document.querySelectorAll('.hb-section-toggle')[0].getBoundingClientRect()",
                    "document.querySelectorAll('.hb-card.hb-section > .hb-section-body').length === 2",
                    scroll=".hb-section-toggle")
        time.sleep(1.0)   # the toggle's chevron ROTATES on a transform transition; probe only once it settled
        states["section-opened"] = json.loads(cdp.js(GEOM_PROBE))
        click_until(cdp, "document.querySelectorAll('.hb-tabs .hb-tab')[1].getBoundingClientRect()",
                    "!!document.querySelector('.hb-tab-panel .hb-grid')", scroll=".hb-tab-bar")
        time.sleep(1.0)   # same: the panel arrives with an appear fade, the chevron is still settling too
        states["tab-two"] = json.loads(cdp.js(GEOM_PROBE))
        return states

    def test_base_and_candidate_draw_identically(self):
        if subprocess.run(["git", "-C", str(REPO), "cat-file", "-t", R6_BASE_COMMIT],
                          capture_output=True, check=False).returncode != 0:
            pytest.skip(f"accepted R6 base {R6_BASE_COMMIT} is not in this checkout — run this parity from "
                        "the candidate branch (the base commit is its parent), not a patch-replay clone")
        driver = slot_free_driver()
        with tempfile.TemporaryDirectory() as work:
            base = Path(work) / "base"
            base.mkdir()
            base_tree(base)
            js_base = bundle_in(base / "web", driver)
            js_cand = bundle_in(REPO / "web", driver)
            dumps = {}
            for label, root, js in (("base", base, js_base), ("candidate", REPO, js_cand)):
                with chrome_tree_page(GEOM_FIXTURE, js, root, ready_js="window.__ready === true") as (cdp, _d):
                    dumps[label] = self._probe_states(cdp)
        for state in ("settled", "section-opened", "tab-two"):
            b, c = dumps["base"][state], dumps["candidate"][state]
            assert b["slots"] == 0, f"{state}: the BASE tree somehow carries {b['slots']} slot wrappers"
            assert c["slots"] > 0, f"{state}: the CANDIDATE tree draws no slots at all — the wrong bundle?"
            assert b["count"] == c["count"], (
                f"{state}: element counts differ: base {b['count']} vs candidate {c['count']}")
            assert b["rec"] == c["rec"], f"{state}: base vs candidate differ — {geom_diff(b['rec'], c['rec'])}"
            print(f"[geometry-parity] {state}: {b['count']} drawn boxes identical "
                  f"(base slots 0, candidate slots {c['slots']})")
        # The reviewer's own fixture read, in words and numbers: two unequal-height stat cards inside ONE row
        # end at the SAME height — in the base, and (by the rec equality above) identically in the candidate.
        cards = [e for e in dumps["base"]["settled"]["rec"]
                 if ">div.hb-row-cell[" in e["p"] and e["p"].endswith(">div.hb-card.hb-kpi[0]")]
        assert len(cards) >= 4, f"the unequal-height row probe missed its cards: {[c['p'] for c in cards]}"
        a, b_card = cards[0], cards[1]          # the top row: stat A (no trend) vs stat B (trend sparkline)
        assert a["h"] == b_card["h"], (
            f"row equal-height is broken ALREADY on the base read: A {a['h']} vs B {b_card['h']}")
        print(f"[geometry-parity] reviewer row: stat A h={a['h']} ({a['flex']}), "
              f"stat B h={b_card['h']} ({b_card['flex']}) — equal on base, and rec-identical on the candidate")


class TestCoverageAndActs:
    """F2 + F1 (acts): corners exist for every supported block without any hover; the bytes come out with the
    door torn off; the board's own DOM never moves; nothing costs a model turn."""

    def test_every_exportable_block_carries_its_corner_from_the_start(self):
        js = bundle()
        with chrome_export_page(BOARD, js) as (cdp, _downloads):
            read = ("JSON.stringify([...document.querySelectorAll('.hb-export-btn')]"
                    ".map((b) => [b.getAttribute('aria-label'), b.tabIndex]))")
            labels = json.loads(cdp.js(read))
            assert [lab for lab, _ in labels] == [
                "Export chart “Cost by day” as PNG",
                "Export chart “Cost mix” as PNG",
                "Export chart “Costs by stay” as PNG",           # the DOM-drawn kind — no <svg>, still covered
                "Export table “Lodging, compared” as CSV",
                "Export chart “Trend in grid” as PNG",           # nested in the grid
                "Export table “Inside grid” as CSV",             # nested in the grid
            ]
            assert all(t >= 0 for _, t in labels), "a corner control off the tab order"
            assert rest_calls(cdp) == ["/blocks/7f3a09bc"], "the page asked the door beyond its load"

    def test_the_svg_chart_png_is_the_formulas_size_opaque_and_carries_the_caveat_line(self):
        js = bundle()
        with chrome_export_page(BOARD, js) as (cdp, downloads):
            want = json.loads(cdp.js(
                f"JSON.stringify(window.__wantPng({json.dumps(BAR_SEL)}, null, "
                f"{json.dumps('Day 3 is a projection.')}))"))
            i = 0  # the bar chart's corner
            click_corner(cdp, i)
            data = wait_file_diag(cdp, downloads, "cost-by-day.png")
            w, h, _depth, _colour = png_dims(data)
            assert [w, h] == want["dims"], "the PNG is not the size the shipped formulas say the drawing is"
            lines = png_scanlines(data)
            assert len(set(lines)) > 4, "flat raster — no picture in it"
            assert png_alpha_all_opaque(lines, data), "alpha in the backdrop — it vanishes on dark surfaces"
            assert bg_luma(data) > 180, "light-host export should sit on a light, legible ground"
            assert band_ink_rows(data, tuple(want["band"])) >= 2, "the caveat line occupies no real ink"
            lo, hi = luma_spread(data)
            assert hi - lo >= 60, "caption/drawing ink does not separate from the ground"
            assert rest_calls(cdp) == ["/blocks/7f3a09bc"], "the PNG asked the door"
            assert json.loads(cdp.js("JSON.stringify(window.__calls)")) == [], "an export spoke to the composer"

    def test_the_hbar_png_downloads_at_the_measured_pictures_size(self):
        js = bundle()
        with chrome_export_page(BOARD, js) as (cdp, downloads):
            spec = {"type": "hbar", "x": ["Kanra", "Miyagasa", "Hostel"],
                    "series": [{"name": "Cost", "data": [42000, 31500, 12000]}]}
            want = json.loads(cdp.js(
                f"JSON.stringify(window.__wantPng({json.dumps(HBAR_SEL)}, {json.dumps(spec)}, "
                f"{json.dumps('Net of points.')}))"))
            click_corner(cdp, 2)
            data = wait_file_diag(cdp, downloads, "costs-by-stay.png")
            w, h, _d, _c = png_dims(data)
            assert [w, h] == want["dims"], "the picture is not the laid-out box it measured"
            assert len(set(png_scanlines(data))) > 4
            assert png_alpha_all_opaque(png_scanlines(data), data)
            assert band_ink_rows(data, tuple(want["band"])) >= 2, "the caveat line occupies no real ink"
            assert rest_calls(cdp) == ["/blocks/7f3a09bc"]
            # Sol's finding, pinned in pixels: EVERY row's bar is in the file, at the place the grid put it,
            # with a width proportional to its value. The round-2 rebuild printed the middle row onto the
            # third and dropped the last bar off the canvas — a count/proportion check sees exactly that.
            m = hbar_map(cdp, HBAR_SEL, spec)
            runs = bars_in_png(data, m)
            assert sorted(runs) == ["0:0", "1:0", "2:0"], "a rendered row's bar is missing from the export"
            for key, value in [("0:0", 42000), ("1:0", 31500), ("2:0", 12000)]:
                assert abs(runs[key] / runs["0:0"] - value / 42000) <= 0.12, f"bar {key} is not {value}"

    def test_nested_blocks_export_their_own_data(self):
        js = bundle()
        with chrome_export_page(BOARD, js) as (cdp, downloads):
            click_corner(cdp, 5)                       # the nested table
            data = wait_file_diag(cdp, downloads, "inside-grid.csv")
            assert data.decode("utf-8-sig") == "City,Days\r\nKyoto,3\r\nNara,1\r\n"
            spec = None
            want = json.loads(cdp.js(f"JSON.stringify(window.__wantPng({json.dumps(NESTED_SEL)}, {json.dumps(spec)}))"))
            click_corner(cdp, 4)                       # the nested chart
            data = wait_file_diag(cdp, downloads, "trend-in-grid.png")
            w, h, _d, _c = png_dims(data)
            assert [w, h] == want["dims"]
            assert rest_calls(cdp) == ["/blocks/7f3a09bc"]

    def test_the_csv_file_is_the_stored_data_block_alone_and_round_trips(self):
        js = bundle()
        with chrome_export_page(BOARD, js) as (cdp, downloads):
            click_corner(cdp, 3)
            data = wait_file_diag(cdp, downloads, "lodging-compared.csv")
            assert data[:3] == b"\xef\xbb\xbf", "no UTF-8 BOM"
            assert data.decode("utf-8-sig") == CSV_FILE.lstrip("\ufeff"), "the file is not the promised bytes"
            rows = list(csv.reader(io.StringIO(data.decode("utf-8-sig"))))
            assert rows[0] == ["Hotel", "Price, nightly", "Notes"]
            assert rows[1] == ["Hotel Kanra", "¥42,000", 'has a "cypress" bath']
            assert rows[2] == ["Sequence Miyagasa", "¥31,500", "on Kyoto station"]
            assert rest_calls(cdp) == ["/blocks/7f3a09bc"]

    def test_the_board_dom_is_byte_identical_through_every_act(self):
        js = bundle()
        with chrome_export_page(BOARD, js) as (cdp, downloads):
            def settle_and_read():
                """Hover the bar chart's middle, take the pointer away, and read the board at rest. ChartTip
                keeps the last card it showed by design (#4's fade-out memory, shipped behaviour): both
                snapshots go through the same hover history, so what they compare is the CHROME's effect."""
                hover_js(cdp, f"document.querySelector({json.dumps(BAR_SEL)}).getBoundingClientRect()")
                cdp.call("Input.dispatchMouseEvent", type="mouseMoved", x=2, y=2)
                time.sleep(0.2)
                return cdp.js("document.querySelector('.hb-blocks').outerHTML")

            settle_and_read()
            before = settle_and_read()
            assert before == settle_and_read(), "the board at rest does not even hold still"
            for i in (3, 5):
                click_corner(cdp, i)
            wait_file_diag(cdp, downloads, "lodging-compared.csv")
            wait_file_diag(cdp, downloads, "inside-grid.csv")
            assert settle_and_read() == before, "the export chrome changed the board's own DOM"


class TestHbarMeasuredGeometry:
    """Round 3's blocking finding: the rebuilt hbar picture must MEASURE the live drawing. A multi-series
    board (2 series x 3 rows, the Reviewer's exact reproduction: a second series [17000, 12000, 5000] beside
    [42000, 31500, 12000]) — every series' value word at its OWN span (none printed over a sibling), every bar
    at its rendered rect, proportional to its data, and inside the picture (the round-2 rebuild double-counted
    later rows out of the canvas); the downloaded PNG then holds every bar's pixels where the grid put them."""

    MULTI_SPEC = {
        "type": "hbar", "x": ["Kanra", "Miyagasa", "Hostel"],
        "series": [{"name": "Peak", "data": [42000, 31500, 12000]},
                   {"name": "Quiet", "data": [17000, 12000, 5000]}],
    }
    BOARD_MULTI = {
        "blocks": [
            {"type": "chart", "kind": "bar", "title": "Cost by day", "unit": "\u00a5",
             "x": ["Day 1", "Day 2", "Day 3"], "series": [{"name": "Cost", "data": [42000, 31500, 28000]}],
             "source": "Trip ledger"},
            {"type": "chart", "kind": "hbar", "title": "Stay vs season",
             "x": ["Kanra", "Miyagasa", "Hostel"],
             "series": [{"name": "Peak", "data": [42000, 31500, 12000]},
                        {"name": "Quiet", "data": [17000, 12000, 5000]}]},
        ],
    }
    # The hbar carries no source word of its own on this board: the caption lines are the figure's own.
    KEYS = ["0:0", "0:1", "1:0", "1:1", "2:0", "2:1"]

    def test_the_multiseries_picture_places_every_element_where_the_grid_laid_it_out(self):
        js = bundle()
        with chrome_export_page(self.BOARD_MULTI, js) as (cdp, _downloads):
            m = hbar_map(cdp, HBAR_SEL, self.MULTI_SPEC)
            assert "body" in m, m
            rects, words, labels = emitted_rects(m["body"]), emitted_words(m["body"]), emitted_labels(m["body"])
            # The picture IS the laid-out box — sized so every row fits, by construction.
            assert m["picW"] == math.ceil(m["box"][0]) and m["picH"] == math.ceil(m["box"][1])
            live = {b["key"]: b for b in m["bars"]}
            assert sorted(live) == sorted(self.KEYS), "the live drawing itself lost a row's bar"
            for key, b in live.items():
                r = rects[("data-bar", key)]
                assert abs(r["x"] - b["x"]) <= 0.6 and abs(r["y"] - b["y"]) <= 0.6, f"bar {key} drifted"
                assert abs(r["width"] - b["w"]) <= 0.6 and abs(r["height"] - b["h"]) <= 0.6, f"bar {key} resized"
                # Nothing re-derived: the row's series stack keeps its own order and stays INSIDE the canvas —
                # the round-2 bug put these bars at y=78/94 and y=150/166 while the picture was 66 tall.
                assert r["y"] >= -0.6 and r["y"] + r["height"] <= m["picH"] + 0.6, f"bar {key} leaves the picture"
            for i in range(3):
                a, b = words[f"{i}:0"]["y"], words[f"{i}:1"]["y"]
                assert abs(a - b) >= 2.0, f"row {i}: both series' values print at one place"
            for key, b in {w["key"]: w for w in m["words"]}.items():
                t = words[key]
                assert t["anchor"] == "end", "values must keep the drawing's right alignment"
                assert abs(t["x"] - (b["x"] + b["w"])) <= 0.6, f"value {key} not at its span's edge"
                assert abs(t["y"] - (b["y"] + b["h"] / 2)) <= 0.6, f"value {key} not at its span's middle"
                assert t["text"] == b["text"]
            # A later row's words and bars sit below the earlier rows' — no shared, no stacked coordinates.
            assert words["2:0"]["y"] > words["1:0"]["y"] > words["0:0"]["y"]
            assert rects[("data-bar", "2:0")]["y"] > rects[("data-bar", "1:0")]["y"] \
                > rects[("data-bar", "0:0")]["y"]
            for lab in m["labels"]:
                t = labels[lab["key"]]
                assert abs(t["y"] - (lab["y"] + lab["h"] / 2)) <= 0.6, f"label {lab['key']} left its row"
            # The widths the picture carries are the data's proportions (linear scale, shared zero).
            big = rects[("data-bar", "0:0")]["width"]
            for key, value in [("1:0", 31500), ("2:0", 12000), ("0:1", 17000), ("1:1", 12000), ("2:1", 5000)]:
                assert abs(rects[("data-bar", key)]["width"] / big - value / 42000) <= 0.05, f"bar {key}"

    def test_the_multiseries_png_pixels_hold_every_bar_in_its_place(self):
        js = bundle()
        with chrome_export_page(self.BOARD_MULTI, js) as (cdp, downloads):
            m = hbar_map(cdp, HBAR_SEL, self.MULTI_SPEC)
            click_corner(cdp, 1)                       # the hbar's own corner; the SVG chart's is 0
            data = wait_file_diag(cdp, downloads, "stay-vs-season.png")
            w_img, h_img, _d, _c = png_dims(data)
            assert [w_img, h_img] == m["dims"], "the PNG is not the measured picture plus its caption"
            runs = bars_in_png(data, m)
            assert sorted(runs) == sorted(self.KEYS), "a rendered bar is absent from the exported file"
            assert abs(runs["0:1"] / runs["0:0"] - 17000 / 42000) <= 0.12, "series B row 1 is not proportional"
            assert abs(runs["2:1"] / runs["0:0"] - 5000 / 42000) <= 0.12, "the LAST row's bar is not proportional"
            last = next(b for b in m["bars"] if b["key"] == "2:1")
            assert m["picTop"] + (last["y"] + last["h"]) * m["scale"] <= h_img, "the last row is clipped"
            assert rest_calls(cdp) == ["/blocks/7f3a09bc"], "the measured PNG still asked the door"


class TestDarkSurface:
    """F3: the same act on a dark host. The composited ground must go DARK, stay opaque, and keep its ink
    separated — legibility pinned numerically on both surfaces, not by looking."""

    def test_the_export_reads_on_a_dark_board_too(self):
        js = bundle()
        with chrome_export_page(BOARD, js, dark=True) as (cdp, downloads):
            click_corner(cdp, 0)
            data = wait_file_diag(cdp, downloads, "cost-by-day.png")
            assert png_alpha_all_opaque(png_scanlines(data), data)
            assert bg_luma(data) < 100, "a dark host should paint a dark ground, not a translucent one"
            lo, hi = luma_spread(data)
            assert hi - lo >= 60, "ink does not separate from the dark ground"


class TestKeyboard:
    """F4: real Tab presses from the body — no pointer anywhere — must REACH every corner control and a
    trusted Enter must EXPORT. The table with no interactive descendants is the block the old chrome could
    never reach."""

    def press_tab(self, cdp: CDP) -> None:
        cdp.call("Input.dispatchKeyEvent", type="rawKeyDown", key="Tab", code="Tab",
                 windowsVirtualKeyCode=9, nativeVirtualKey=9)
        cdp.call("Input.dispatchKeyEvent", type="keyUp", key="Tab", code="Tab",
                 windowsVirtualKeyCode=9, nativeVirtualKey=9)

    def press_enter(self, cdp: CDP) -> None:
        cdp.call("Input.dispatchKeyEvent", type="keyDown", key="Enter", code="Enter", text="\r",
                 windowsVirtualKeyCode=13, nativeVirtualKey=13)
        cdp.call("Input.dispatchKeyEvent", type="keyUp", key="Enter", code="Enter",
                 windowsVirtualKeyCode=13, nativeVirtualKey=13)

    def test_tab_walks_every_corner_and_enter_exports_a_keyless_block(self):
        js = bundle()
        with chrome_export_page(BOARD, js) as (cdp, downloads):
            reached: list[str] = []
            probe = ("(() => { const a = document.activeElement;"
                     "return a && a.classList && a.classList.contains('hb-export-btn')"
                     " ? a.getAttribute('aria-label') : ''; })()")
            want_last = "Export table “Inside grid” as CSV"
            for _ in range(60):
                self.press_tab(cdp)
                label = cdp.js(probe)
                if label and label not in reached:
                    reached.append(label)
                if label == want_last and len(reached) == 6:
                    break            # the walk is done and this control holds the focus: Enter it
            assert reached == [
                "Export chart “Cost by day” as PNG",
                "Export chart “Cost mix” as PNG",
                "Export chart “Costs by stay” as PNG",
                "Export table “Lodging, compared” as CSV",
                "Export chart “Trend in grid” as PNG",
                "Export table “Inside grid” as CSV",
            ], "the tab order does not carry every export control"
            # Enter on the LAST reached control — a table with nothing else interactive — writes the file.
            self.press_enter(cdp)
            assert wait_file_diag(cdp, downloads, "inside-grid.csv")[:3] == b"\xef\xbb\xbf"
            assert rest_calls(cdp) == ["/blocks/7f3a09bc"], "the keyboard path asked the door"
            assert json.loads(cdp.js("JSON.stringify(window.__calls)")) == []


class TestBoardFiles:
    """F1: the whole-board files. JSON is the stored envelope the page already holds — zero acts on the door.
    Markdown is the ONE writer's answer: asked once, written verbatim, closed by a newline. With the door
    torn off, Markdown writes NOTHING and says so; JSON still writes, byte-equal, unknown words and all."""

    def open_menu(self, cdp: CDP) -> None:
        click_until(cdp, MENU_BUTTON, "!!document.querySelector('.hb-export-menu')", scroll=".hb-tag > .hb-export")

    def test_markdown_asks_the_writer_once_and_downloads_its_answer_verbatim(self):
        js = bundle()
        with chrome_export_page({**BOARD, "__md__": {"1": MD_BODY}}, js, door_off=False) as (cdp, downloads):
            before = len(rest_calls(cdp))
            self.open_menu(cdp)
            real_click(cdp, MENU_ITEM_1)
            name, data = wait_any_download(downloads, "board-")
            assert name == "board-7f3a09bc.md"
            # The writer's uncapped bytes, whole, one closing newline — no footer, no twin, nothing added.
            assert data.decode("utf-8") == MD_BODY.rstrip("\n") + "\n"
            assert "Kyoto budget" in data.decode("utf-8")
            assert rest_calls(cdp)[before:] == ["/blocks/7f3a09bc/markdown?version=1"], \
                "Markdown asked more than the writer"
            # And it asks EVERY export (never caches): a second click knocks again and writes the same bytes.
            (downloads / "board-7f3a09bc.md").unlink()
            self.open_menu(cdp)
            real_click(cdp, MENU_ITEM_1)
            data = wait_file_diag(cdp, downloads, "board-7f3a09bc.md")
            assert data.decode("utf-8") == MD_BODY.rstrip("\n") + "\n"
            # The menu reopening asked nothing; only the export acts knocked, exactly twice, on the writer.
            assert rest_calls(cdp)[before:] == [
                "/blocks/7f3a09bc/markdown?version=1", "/blocks/7f3a09bc/markdown?version=1",
            ]

    def test_the_door_off_writes_no_markdown_file_and_says_the_truth_while_json_still_writes(self):
        js = bundle()
        with chrome_export_page(BOARD, js) as (cdp, downloads):        # door_off=True: every ask throws
            self.open_menu(cdp)
            real_click(cdp, MENU_ITEM_1)
            wait_js(cdp, "!!document.querySelector('.hb-export-failed')")
            assert cdp.js("document.querySelector('.hb-export-failed').textContent") == "Nothing was exported."
            assert not list(downloads.iterdir()), "a refused door wrote a file anyway"
            self.open_menu(cdp)
            real_click(cdp, MENU_ITEM_2)
            name, data = wait_any_download(downloads, "board-")
            assert name == "board-7f3a09bc.json"
            assert json.loads(data.decode("utf-8")) == BOARD           # JSON needs no door: the envelope rode in
            # load, then the ONE refused Markdown attempt (recorded before it threw); the JSON act added nothing.
            assert rest_calls(cdp) == ["/blocks/7f3a09bc", "/blocks/7f3a09bc/markdown?version=1"], \
                "an act beyond Markdown knocked"

    def test_json_is_the_stored_envelope_verbatim_including_unknown_words(self):
        js = bundle()
        with chrome_export_page(BOARD, js) as (cdp, downloads):
            self.open_menu(cdp)
            real_click(cdp, MENU_ITEM_2)
            name, data = wait_any_download(downloads, "board-")
            assert name == "board-7f3a09bc.json"
            assert json.loads(data.decode("utf-8")) == BOARD          # model_note and all
            assert data.decode("utf-8") == json.dumps(BOARD, indent=2, ensure_ascii=False) + "\n"
            assert rest_calls(cdp) == ["/blocks/7f3a09bc"], "JSON cost a request"

    def test_no_export_in_this_page_cost_a_model_turn(self):
        js = bundle()
        with chrome_export_page({**BOARD, "__md__": {"1": MD_BODY}}, js, door_off=False) as (cdp, downloads):
            click_corner(cdp, 3)
            wait_file_diag(cdp, downloads, "lodging-compared.csv")
            self.open_menu(cdp)
            real_click(cdp, MENU_ITEM_1)
            wait_any_download(downloads, "board-")
            assert json.loads(cdp.js("JSON.stringify(window.__calls)")) == [], "an export spoke to the composer"


class TestPreservedSeams:
    """The shipped drawing's own interactions are none of the chrome's business: with every corner mounted,
    a real hover over the bar chart still raises the hover card."""

    def test_the_hover_card_still_rises_under_a_real_pointer(self):
        js = bundle()
        with chrome_export_page(BOARD, js) as (cdp, _downloads):
            spot = (
                f"(() => {{ const b = document.querySelector({json.dumps(BAR_SEL)}).getBoundingClientRect();"
                "return { left: b.left + b.width / 2, top: b.top + b.height * 0.8, width: 1, height: 1 }; })()"
            )
            hover_js(cdp, spot)
            wait_js(cdp, "document.querySelector('.hb-tip-name') !== null")


class TestNarrowBoard:
    def test_everything_stays_inside_and_the_nested_exports_still_write(self):
        js = bundle()
        with chrome_export_page(BOARD, js, narrow=True) as (cdp, downloads):
            inside = (
                "(() => { const host = document.querySelector('.hb-tag').getBoundingClientRect();"
                "const btns = [...document.querySelectorAll('.hb-export-btn')].map((b) => {"
                "const r = b.getBoundingClientRect();"
                "return r.left >= host.left - 1 && r.right <= host.right + 1 && r.width > 0; });"
                "const menu = document.querySelector('.hb-tag > .hb-export').getBoundingClientRect();"
                "const tag = document.querySelector('.hb-tag').getBoundingClientRect();"
                "return { all: btns, menuInside: menu.left >= tag.left - 1 && menu.right <= tag.right + 1,"
                "scrolling: [...document.querySelectorAll('.hb-blocks > *'), document.querySelector('.hb-tag')]"
                ".some((e) => e.scrollWidth > e.clientWidth + 1) }; })()"
            )
            dump = json.loads(cdp.js(f"JSON.stringify({inside})"))
            assert all(dump["all"]), "a corner button escaped its host at 380px"
            assert dump["menuInside"] is True
            assert dump["scrolling"] is False, "the narrow board scrolls where nothing used to"
            click_corner(cdp, 5)
            assert wait_file_diag(cdp, downloads, "inside-grid.csv")[:3] == b"\xef\xbb\xbf"


# The living fixture: one address, two versions, same shape. v2 is the live board; the archive holds v1.
# The words differ (chart title and source, table caption and row) and the SHAPE agrees: the swap moves
# data under pairings the identity system keeps in place wherever a block is unchanged. Every export must
# say whichever version the reader is looking at — and the board's JSON file IS that version's envelope.
def living_version(ordinal: int, word: str, source: str, data: list[int]) -> dict:
    return {
        "version": ordinal,
        "updated_at": f"2026-11-{16 + ordinal}T09:00:00+05:30",
        "blocks": [
            {"type": "heading", "text": "Kyoto, over time"},
            {"type": "chart", "kind": "bar", "title": f"Cost by day v{ordinal}", "unit": "¥",
             "x": ["Day 1", "Day 2"], "series": [{"name": "Cost", "data": data}], "source": source},
            {"type": "table", "caption": f"Trip v{ordinal}", "columns": ["Item"], "rows": [[word]]},
        ],
    }


LIVING_V1 = living_version(1, "Old", "Old ledger", [5, 7])
LIVING_BOARD = dict(living_version(2, "Grand", "Trip ledger", [10, 20]))
LIVING_BOARD["__archive__"] = [LIVING_V1]
# The writer's words for each version, computed in-process — the door's answers and the byte expectations
# come from ONE place: the same serializer the real endpoint runs.
LIVING_MD_V1 = tf.blocks_as_text(LIVING_V1["blocks"], limit=None) if tf else ""
LIVING_MD_V2 = tf.blocks_as_text(LIVING_BOARD["blocks"], limit=None) if tf else ""
LIVING_MD = {"2": LIVING_MD_V2, "1": LIVING_MD_V1}
LIVING = {**LIVING_BOARD, "__md__": LIVING_MD}
# Round 4's host-advance fixture: the CURRENT board is v1 ("Old") with nothing archived; the test then
# moves the host to v2 ("Grand") through __hostAdvance — store.update's own shape, the living version
# archived whole — WITHOUT any word reaching the mounted view (no poke). Both versions' writer words
# are already in the door's table, computed by the real serializer in THIS process.
ADVANCE = {**LIVING_V1, "__md__": {"1": LIVING_MD_V1, "2": LIVING_MD_V2}}


class TestLivingRefresh:
    """Round 2's blocking finding, in real Chrome through the REAL BlockTag machinery. A Living Board
    update-in-place or a version reach-back replaces the READ while the surviving drawing is reconciled onto
    the very element already mounted: the corner may not export the previous version. Here the two versions
    differ in their words and agree in their shape, so the pairings that survive carry move under a corner
    that never visibly moves — and every export (label, CSV bytes, PNG bytes, the board's JSON) must follow
    the board the reader is looking at. The door stays ANSWERED (the reach-back is a load-time ask); the
    zero-requests contract is pinned by counting around each export instead.

    v2 says "Grand"; v1 (the archive) says "Old"; the CSV must say whichever is drawn. And the pairing
    itself — refreshed only when the block reference moved, never churned on an unchanged re-scan — is
    pinned at the predicate in web/src/host/ExportChrome.scan.test.tsx, because this base's honest-remount
    rule means a same-geometry swap here can also arrive as a new element; both guards must hold."""

    def open_menu(self, cdp: CDP) -> None:
        click_until(cdp, MENU_BUTTON, "!!document.querySelector('.hb-export-menu')", scroll=".hb-tag > .hb-export")

    def table_csv(self, cdp: CDP, downloads: Path, name: str) -> str:
        click_corner(cdp, 1)                       # the table's corner (the board's second exportable)
        return wait_file_diag(cdp, downloads, name).decode("utf-8-sig")

    def labels(self, cdp: CDP) -> list[str]:
        read = ("JSON.stringify([...document.querySelectorAll('.hb-export-btn')]"
                ".map((b) => b.getAttribute('aria-label')))")
        return json.loads(cdp.js(read))

    def test_reach_back_moves_every_export_to_the_version_on_screen(self):
        js = bundle()
        with chrome_export_page(LIVING, js, door_off=False) as (cdp, downloads):
            # v2 on screen: the living row offers v1; every export says the CURRENT version's words.
            wait_js(cdp, "!!document.querySelector('.hb-live-history')")
            assert self.labels(cdp) == [
                "Export chart “Cost by day v2” as PNG", "Export table “Trip v2” as CSV"]
            assert self.table_csv(cdp, downloads, "trip-v2.csv") == "Item\r\nGrand\r\n"
            (downloads / "trip-v2.csv").unlink()
            # Markdown, v2 on screen: the writer's v2 words, asked PINNED to the drawn version.
            self.open_menu(cdp)
            click_until(cdp, MENU_ITEM_1, "!!document.querySelector('.hb-export-failed')"
                        " || !document.querySelector('.hb-export-menu')")
            data = wait_file_diag(cdp, downloads, "board-7f3a09bc.md")
            assert data.decode("utf-8") == LIVING_MD_V2.rstrip("\n") + "\n"
            assert "Grand" in data.decode("utf-8") and "Old" not in data.decode("utf-8")
            assert rest_calls(cdp)[-1] == "/blocks/7f3a09bc/markdown?version=2"
            (downloads / "board-7f3a09bc.md").unlink()

            before = len(rest_calls(cdp))
            click_until(
                cdp,
                "document.querySelector('.hb-live-history').getBoundingClientRect()",
                "document.body.textContent.includes('viewing v1')",
                scroll=".hb-live",
            )
            wait_js(cdp, "document.body.textContent.includes('Old')")
            assert self.labels(cdp) == [
                "Export chart “Cost by day v1” as PNG", "Export table “Trip v1” as CSV"]
            assert self.table_csv(cdp, downloads, "trip-v1.csv") == "Item\r\nOld\r\n"
            (downloads / "trip-v1.csv").unlink()
            # The CSV act itself asked the door NOTHING (the reach-back fetch above is the only new call,
            # and it is a load-time ask by contract): count deltas around THIS export alone.
            mid = len(rest_calls(cdp))
            assert self.table_csv(cdp, downloads, "trip-v1.csv") == "Item\r\nOld\r\n"
            assert len(rest_calls(cdp)) == mid, "a v1 CSV export knocked on the door"
            # Markdown follows the version on screen: the ask carries ?version=1 and the file says v1.
            self.open_menu(cdp)
            click_until(cdp, MENU_ITEM_1, "!document.querySelector('.hb-export-menu')")
            data = wait_file_diag(cdp, downloads, "board-7f3a09bc.md")
            assert data.decode("utf-8") == LIVING_MD_V1.rstrip("\n") + "\n"
            assert "Old" in data.decode("utf-8") and "Grand" not in data.decode("utf-8")
            assert rest_calls(cdp)[-1] == "/blocks/7f3a09bc/markdown?version=1"
            (downloads / "board-7f3a09bc.md").unlink()

            # The whole board too: the JSON file is the envelope of the version BEING VIEWED.
            self.open_menu(cdp)
            click_until(cdp, MENU_ITEM_2, "!document.querySelector('.hb-export-menu')")
            data = wait_file_diag(cdp, downloads, "board-7f3a09bc.json")
            env = json.loads(data.decode("utf-8"))
            assert env["blocks"][1]["title"] == "Cost by day v1" and env["blocks"][2]["caption"] == "Trip v1"
            (downloads / "board-7f3a09bc.json").unlink()

            # Step back to current: the exports return with the board.
            click_until(cdp, "document.querySelector('.hb-live-back').getBoundingClientRect()",
                        "document.body.textContent.includes('Grand')", scroll=".hb-live")
            assert self.labels(cdp) == [
                "Export chart “Cost by day v2” as PNG", "Export table “Trip v2” as CSV"]
            assert self.table_csv(cdp, downloads, "trip-v2.csv") == "Item\r\nGrand\r\n"
            self.open_menu(cdp)
            click_until(cdp, MENU_ITEM_1, "!document.querySelector('.hb-export-menu')")
            data = wait_file_diag(cdp, downloads, "board-7f3a09bc.md")
            assert data.decode("utf-8") == LIVING_MD_V2.rstrip("\n") + "\n"
            assert rest_calls(cdp)[-1] == "/blocks/7f3a09bc/markdown?version=2"  # back at the live drawing
            assert json.loads(cdp.js("JSON.stringify(window.__calls)")) == [], "an export spoke to the composer"
            assert len(rest_calls(cdp)) >= before  # the reach-backs and Markdown asks knocked; nothing else had to

    def test_an_identical_replacement_read_does_not_churn_the_pairing(self):
        """The other half of round 2's ask: loop avoidance stands. Re-answering the door with the SAME board
        (a poke that changed nothing) may re-pair, must re-commit NOTHING, and the exports keep working."""
        js = bundle()
        with chrome_export_page(LIVING, js, door_off=False) as (cdp, downloads):
            wait_js(cdp, "!!document.querySelector('.hb-live-history')")
            first = cdp.js("document.querySelectorAll('.hb-export-btn').length")
            n0 = len(rest_calls(cdp))
            click_until(cdp, "document.querySelector('.hb-live-history').getBoundingClientRect()",
                        "document.body.textContent.includes('viewing v1')", scroll=".hb-live")
            click_until(cdp, "document.querySelector('.hb-live-back').getBoundingClientRect()",
                        "document.body.textContent.includes('Grand')", scroll=".hb-live")
            assert cdp.js("document.querySelectorAll('.hb-export-btn').length") == first
            assert self.table_csv(cdp, downloads, "trip-v2.csv") == "Item\r\nGrand\r\n"
            assert len(rest_calls(cdp)) > n0  # the two door asks were the reach-backs, never an export


class TestDrawingRace:
    """Round 4's blocking finding, in real Chrome through the REAL machinery: the Markdown act binds to
    the version the DRAWING committed — not to "whatever the address is on now" (a host update the view
    has not been poked about may not move the file out from under the screen), and not to a selection
    whose load has not landed (until the answer commits, the OLD drawing IS the screen). The door answers
    every version from the REAL serializer's bytes computed in this process, so a wrong pin downloads
    provably different words."""

    def open_menu(self, cdp: CDP) -> None:
        click_until(cdp, MENU_BUTTON, "!!document.querySelector('.hb-export-menu')", scroll=".hb-tag > .hb-export")

    def export_markdown(self, cdp: CDP, downloads: Path) -> str:
        """One whole Markdown act: open, press, wait for the EXACT final name, read, unlink."""
        self.open_menu(cdp)
        click_until(cdp, MENU_ITEM_1, "!document.querySelector('.hb-export-menu')")
        data = wait_file_diag(cdp, downloads, "board-7f3a09bc.md")
        (downloads / "board-7f3a09bc.md").unlink()
        return data.decode("utf-8")

    def test_a_host_advance_the_view_has_not_seen_cannot_move_the_file(self):
        js = bundle()
        with chrome_export_page(ADVANCE, js, door_off=False) as (cdp, downloads):
            # Witnesses read the DRAWN board only: the spec's own script text (both versions' writer bytes
            # ride in __md__) would make a whole-body textContent check vacuous — .hb-blocks is the screen.
            wait_js(cdp, "document.querySelector('.hb-blocks').textContent.includes('Old')")
            # The host moves WITHOUT a word to this view: v1 archived whole, v2 current — store.update's
            # own shape. Nothing on the page changed; the drawing still says "Old".
            cdp.js(f"window.__hostAdvance(2, {json.dumps(LIVING_BOARD['blocks'])},"
                   f" '2026-11-17T09:00:00+05:30'), true")
            drawn = "document.querySelector('.hb-blocks').textContent"
            assert "Grand" not in cdp.js(drawn), "the race fixture poked itself"
            text = self.export_markdown(cdp, downloads)
            assert text == LIVING_MD_V1.rstrip("\n") + "\n", "the file moved out from under the screen"
            assert "Old" in text and "Grand" not in text
            assert rest_calls(cdp)[-1] == "/blocks/7f3a09bc/markdown?version=1"
            # The app's own word: a later tag of the address POKEs the owner; the view refetches, the
            # DRAWING commits v2 — and the pin rides with the commit, never before it.
            cdp.js("window.__mountSecond(), true")
            wait_js(cdp, "document.querySelector('.hb-blocks').textContent.includes('Grand')")
            text = self.export_markdown(cdp, downloads)
            assert text == LIVING_MD_V2.rstrip("\n") + "\n"
            assert rest_calls(cdp)[-1] == "/blocks/7f3a09bc/markdown?version=2"

    def test_a_selection_still_loading_cannot_outrun_the_drawing(self):
        js = bundle()
        with chrome_export_page(LIVING, js, door_off=False) as (cdp, downloads):
            drawn = "document.querySelector('.hb-blocks').textContent"   # the screen, not the script text
            wait_js(cdp, "document.querySelector('.hb-blocks').textContent.includes('Grand')")
            # Reach for v1 — and hold its load: the SELECTION moved, the DRAWING has not.
            cdp.js("window.__armHold(), true")
            click_until(cdp, "document.querySelector('.hb-live-history').getBoundingClientRect()",
                        "document.body.textContent.includes('viewing v1')", scroll=".hb-live")
            assert "Old" not in cdp.js(drawn), "the old drawing must still be up"
            text = self.export_markdown(cdp, downloads)
            assert text == LIVING_MD_V2.rstrip("\n") + "\n", "a pending selection outran the drawing"
            assert rest_calls(cdp)[-1] == "/blocks/7f3a09bc/markdown?version=2"
            # The load lands: the drawing commits v1 — and only NOW does the file follow the selection.
            cdp.js("window.__releaseHold(), true")
            wait_js(cdp, "document.querySelector('.hb-blocks').textContent.includes('Old')")
            text = self.export_markdown(cdp, downloads)
            assert text == LIVING_MD_V1.rstrip("\n") + "\n"
            assert rest_calls(cdp)[-1] == "/blocks/7f3a09bc/markdown?version=1"


# The corner rework (folded from #78's fix): the tag's globals ride ONE VERTICAL STACK (expand owns the very
# top, the board menu sits below it, its popover below both), and a block's own control belongs to ITS OWN
# top-right corner — cornerOf (web/src/host/corner.test.ts pins it as numbers; this proves it laid out).
# The witness fixture puts a full-bleed table FIRST: its corner is exactly the block whose arithmetic used to
# reach for the tag's corner, the collision Sagar saw on #75.
STRIP = {
    "version": 1,
    "updated_at": "2026-11-24T09:00:00+05:30",
    "blocks": [
        {"type": "table", "caption": "First", "columns": ["A", "B"], "rows": [["1", "2"], ["3", "4"]]},
        {"type": "chart", "kind": "line", "title": "Second", "x": ["a", "b", "c"],
         "series": [{"name": "s", "data": [5, 9, 7]}]},
        {"type": "chart", "kind": "hbar", "title": "Third", "x": ["a", "b", "c"],
         "series": [{"name": "s", "data": [1, 2, 3]}]},
    ],
}

STACK_JS = """(() => {
  const r = (e) => { const b = e.getBoundingClientRect();
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: b.width, h: b.height }; };
  const tag = document.querySelector('.hb-tag');
  const expand = document.querySelector('.hb-expand');
  const menu = document.querySelector('.hb-tag > .hb-export');
  const corners = [...document.querySelectorAll('.hb-export-btn')].map(r);
  const blocks = [...document.querySelectorAll('.hb-blocks > .hb-slot > *')]
    .filter((e) => e.matches('.hb-table-card, figure.hb-chart')).map(r);
  const pop = document.querySelector('.hb-export-menu');
  return JSON.stringify({ expand: r(expand), menu: r(menu), corners, blocks,
    pop: pop ? r(pop) : null, tag: r(tag),
    scroll: [...document.querySelectorAll('.hb-blocks > *'), tag]
      .some((e) => e.scrollWidth > e.clientWidth + 1) });
})()"""


def overlap(a: dict, b: dict) -> bool:
    """Two measured boxes claiming the same pixel of the page."""
    return (max(a["left"], b["left"]) < min(a["right"], b["right"]) - 0.5
            and max(a["top"], b["top"]) < min(a["bottom"], b["bottom"]) - 0.5)


class TestCornerStack:
    def collect(self, cdp) -> dict:
        dump = json.loads(cdp.js(STACK_JS))
        assert len(dump["corners"]) == 3, "the strip fixture grows a corner per exportable block"
        return dump

    def assert_stack(self, cdp, dump: dict) -> None:
        named = [("expand", dump["expand"]), ("menu", dump["menu"])] + [
            (f"corner{i}", c) for i, c in enumerate(dump["corners"])]
        for i in range(len(named)):            # no two controls claim one pixel, at either width
            for j in range(i + 1, len(named)):
                assert not overlap(named[i][1], named[j][1]), (
                    f"{named[i][0]} overlaps {named[j][0]}: {named[i][1]} vs {named[j][1]}")
        assert dump["menu"]["top"] >= dump["expand"]["bottom"] - 0.5, "the menu must stack BELOW the expand"
        for i, c in enumerate(dump["corners"]):    # each control belongs to ITS OWN block's corner
            b = dump["blocks"][i]
            assert (c["left"] >= b["left"] - 1 and c["right"] <= b["right"] + 1
                    and c["top"] >= b["top"] - 1 and c["bottom"] <= b["bottom"] + 1), (
                    f"corner {i} left its block: {c} vs block {b}")

    def test_globals_stack_and_corners_stay_in_their_own_blocks(self):
        js = bundle()
        with chrome_export_page(STRIP, js) as (cdp, _downloads):
            self.assert_stack(cdp, self.collect(cdp))

    def test_the_open_menu_clears_every_corner_too(self):
        js = bundle()
        with chrome_export_page(STRIP, js) as (cdp, _downloads):
            menu = "document.querySelector('.hb-tag > .hb-export').getBoundingClientRect()"
            click_until(cdp, menu, "!!document.querySelector('.hb-export-menu')")
            dump = self.collect(cdp)
            assert dump["pop"] is not None, "the popover did not open"
            assert dump["pop"]["top"] >= dump["menu"]["bottom"] - 0.5, "the popover stacks below the menu"
            for i, c in enumerate(dump["corners"]):
                assert not overlap(dump["pop"], c), f"the open menu covers corner {i}: {dump['pop']} vs {c}"

    def test_the_stack_holds_at_380px(self):
        js = bundle()
        with chrome_export_page(STRIP, js, narrow=True) as (cdp, _downloads):
            dump = self.collect(cdp)
            self.assert_stack(cdp, dump)
            assert dump["scroll"] is False, "the narrow board scrolls sideways where nothing used to"
