# Real-pointer regression for coincident scatter dots (t_debd6eb3, review round 2).
#
# Dots that share an x AND a y draw at one pixel, and SVG hit testing returns ONLY the topmost circle — a
# browser click can never land on the point beneath. jsdom fires events ON an element and so cannot see this;
# the reviewer proved it with document.elementFromPoint. This file therefore drives a REAL headless Chrome
# over the DevTools Protocol with REAL pointer events at coordinates (Input.dispatchMouseEvent — the browser
# does its own hit testing; never element.dispatchEvent), against the REAL components: the checkout's own
# Chart.tsx/ScatterMarks.tsx are bundled (esbuild, to a temp dir — nothing is written into the checkout)
# and mounted with react-dom/client over the shipped stylesheets.
#
# What must hold:
#   premise / negative control — elementFromPoint at the spot (centre and every side) returns ONLY the
#       topmost dot's data-pt: a topmost-only click handler can never reach the other point. The old
#       behaviour is pinned here so the defect stays measurable.
#   cycle — the first real click at the spot opens its FIRST datum ("1st of 2 here"), the next opens the
#       second ("2nd of 2 here"), the next wraps; the spot wears an ×2 badge; closing happens by really
#       clicking the dialog's own close control.
#   cross-series pair — coincident dots from two series open each series's own values.
#   keyboard — real trusted key events (Input.dispatchKeyEvent): ArrowRight/Enter opens each coincident
#       point's own detail; Escape closes it.
#   control — an ordinary scatter (no coincident dots): no badge, no cycle wording, each dot opens itself.
from __future__ import annotations

import base64
import json
import os
import socket
import struct
import subprocess
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

import httpx
import pytest

from test_layout_alignment import CSS as BASE_CSS, CHROME, REPO, SRC

ESBUILD = REPO / "web" / "node_modules" / ".bin" / "esbuild"
CSS = BASE_CSS[:2] + [SRC / "host" / "blockTag.css"] + BASE_CSS[2:]
WINDOW_W, WINDOW_H = 1400, 1000

TWIN = {"type": "chart", "kind": "scatter", "title": "Weights", "unit": "kg",
        "x": [1, 1], "series": [{"name": "Values", "data": [50, 50]}]}
PAIR = {"type": "chart", "kind": "scatter", "title": "Weights", "unit": "kg", "x": [1, 2, 1],
        "series": [{"name": "A", "data": [50, 90, 7]}, {"name": "B", "data": [4, 9, 50]}]}
LONE = {"type": "chart", "kind": "scatter", "title": "Weights", "unit": "kg",
        "x": [1, 3], "series": [{"name": "Values", "data": [50, 20]}]}

DRIVER = """
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { readBlocks } from "./src/core/readBlocks";
import { Chart } from "./src/blocks/chart/Chart";

const blocks = readBlocks(JSON.parse(document.getElementById("spec").textContent)) as any[];
createRoot(document.getElementById("app")).render(
  createElement("div", { className: "hb-blocks" },
    blocks.filter((b) => b.type === "chart").map((b, k) => createElement(Chart, { key: k, spec: b.spec })))
);
"""


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


@pytest.fixture(scope="module")
def bundle() -> str:
    if CHROME is None:
        pytest.skip("no Chrome/Chromium binary on this machine")
    if not ESBUILD.exists():
        pytest.skip("web/node_modules not installed — cannot bundle the real components")
    proc = subprocess.run(
        [str(ESBUILD), "--bundle", "--format=iife", "--jsx=automatic", "--loader=tsx",
         "--log-level=warning"],
        input=DRIVER, capture_output=True, text=True, timeout=120, cwd=str(REPO / "web"))
    assert proc.returncode == 0, proc.stderr
    return proc.stdout


@contextmanager
def chrome_page(board: list[dict], bundle_js: str):
    """One real Chrome, one page: the shipped CSS, the real components mounted from the checkout's source."""
    with tempfile.TemporaryDirectory() as work:
        (Path(work) / "driver.js").write_text(bundle_js)
        page = Path(work) / "probe.html"
        css = "\n".join(p.read_text() for p in CSS)
        page.write_text(
            "<!doctype html><html><head><meta charset='utf-8'>"
            f"<style>{css}</style></head><body style='margin:0'>"
            f"<div id='app'></div>"
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
            ws = _page_socket(port)
            cdp = CDP(*ws)
            wait_js(cdp, "document.querySelectorAll('circle.hb-chart-dot').length")
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


DOT = "document.querySelectorAll('circle.hb-chart-dot')[{}].getBoundingClientRect()"
DETAIL = "(() => { const d = document.querySelector('.hb-chart-detail'); return d ? d.textContent : null; })()"
CLOSE = "(() => { const b = document.querySelector('.hb-chart-detail button.hb-overlay-close');" \
        " return b ? [b.getBoundingClientRect().left + 16, b.getBoundingClientRect().top + 16] : null; })()"


def real_click(cdp: CDP, rect_expr: str) -> tuple[float, float]:
    x, y = cdp.js(f"(() => {{ const r = ({rect_expr}); return [r.left + r.width / 2, r.top + r.height / 2]; }})()")
    cdp.mouse(x, y)
    return x, y


def dismiss_dialog(cdp: CDP) -> None:
    pos = wait_js(cdp, CLOSE)
    cdp.mouse(pos[0], pos[1])
    wait_js(cdp, "!document.querySelector('.hb-chart-detail')")


class TestCoincidentDotsRealPointer:
    def test_the_premise_only_the_topmost_dot_is_ever_hit(self, bundle):
        # Negative control, pinned in the real browser: elementFromPoint at the spot — centre and every
        # side — returns the LAST-painted circle (data-pt 1) and never the point beneath (data-pt 0).
        # A handler that trusts the hit result alone (the round-1 defect) can therefore never open point 1.
        with chrome_page([TWIN], bundle) as cdp:
            hits = cdp.js("""(() => {
              const r = document.querySelectorAll('circle.hb-chart-dot')[1].getBoundingClientRect();
              const x = r.left + r.width / 2, y = r.top + r.height / 2;
              const out = [];
              for (const [dx, dy] of [[0,0],[3,0],[-3,0],[0,3],[0,-3],[2,-2],[-2,2],[2,2],[-2,-2]]) {
                const el = document.elementFromPoint(x + dx, y + dy);
                out.push(el && el.dataset ? String(el.dataset.pt ?? "?") : "none");
              }
              return out;
            })()""")
            assert set(hits) == {"1"}, hits  # never "0": no coordinate can target the covered dot

    def test_the_badge_says_the_spot_holds_two_points(self, bundle):
        with chrome_page([TWIN], bundle) as cdp:
            badges = cdp.js("[...document.querySelectorAll('text.hb-chart-cluster')].map(t => t.textContent)")
            assert badges == ["×2"], badges
            circles = cdp.js("document.querySelectorAll('circle.hb-chart-dot').length")
            assert circles == 2  # the dots never moved: one px, two circles, one badge

    def test_successive_real_clicks_open_each_coincident_datum_and_wrap(self, bundle):
        with chrome_page([TWIN], bundle) as cdp:
            x, y = real_click(cdp, DOT.format(1))  # the topmost circle — all a real click can ever hit
            text = wait_js(cdp, DETAIL)
            assert "Point 1 of 2" in text and "1st of 2 here" in text, text  # the FIRST datum, not the top one
            dismiss_dialog(cdp)
            cdp.mouse(x, y)
            text = wait_js(cdp, DETAIL)
            assert "Point 2 of 2" in text and "2nd of 2 here" in text, text  # the one beneath, at the same px
            dismiss_dialog(cdp)
            cdp.mouse(x, y)
            text = wait_js(cdp, DETAIL)
            assert "Point 1 of 2" in text and "1st of 2 here" in text, text  # and it wraps

    def test_a_coincident_pair_across_series_opens_each_series_values(self, bundle):
        with chrome_page([PAIR], bundle) as cdp:
            real_click(cdp, DOT.format(5))  # B2 paints last over A0 at the x=1, 50 kg pixel
            rows = wait_js(cdp, "[...document.querySelectorAll('.hb-detail-value')].map(v => v.textContent)")
            assert rows == ["50 kg", "4 kg"], rows  # index 0's pair (A 50, B 4)
            dismiss_dialog(cdp)
            real_click(cdp, DOT.format(5))
            rows = wait_js(cdp, "[...document.querySelectorAll('.hb-detail-value')].map(v => v.textContent)")
            assert rows == ["7 kg", "50 kg"], rows  # index 2's pair — a different datum, the same pixel

    def test_the_real_keyboard_reaches_every_coincident_point(self, bundle):
        with chrome_page([TWIN], bundle) as cdp:
            cdp.js("document.querySelector('svg.hb-chart-svg').focus(), true")
            cdp.key("ArrowRight", "ArrowRight", 39)
            cdp.key("Enter", "Enter", 13)
            text = wait_js(cdp, DETAIL)
            assert "Point 1 of 2" in text, text
            cdp.key("Escape", "Escape", 27)
            wait_js(cdp, "!document.querySelector('.hb-chart-detail')")
            # the pick survived the close: point 1 is still the lit one (the dialog's own blur must not eat it)
            shades = cdp.js("[...document.querySelectorAll('circle.hb-chart-dot')].map(c => c.getAttribute('opacity'))")
            assert shades == ["1", "0.55"], shades
            cdp.key("ArrowRight", "ArrowRight", 39)
            cdp.key("Enter", "Enter", 13)
            text = wait_js(cdp, DETAIL)
            assert "Point 2 of 2" in text, text

    def test_control_an_ordinary_scatter_has_no_badge_and_never_cycles(self, bundle):
        with chrome_page([LONE], bundle) as cdp:
            assert cdp.js("document.querySelectorAll('text.hb-chart-cluster').length") == 0
            real_click(cdp, DOT.format(0))
            text = wait_js(cdp, DETAIL)
            assert "Point 1 of 2" in text and "here" not in text, text
            dismiss_dialog(cdp)
            real_click(cdp, DOT.format(0))
            text = wait_js(cdp, DETAIL)
            assert "Point 1 of 2" in text, text  # a second click on a single dot opens the SAME datum
            dismiss_dialog(cdp)
            real_click(cdp, DOT.format(1))
            text = wait_js(cdp, DETAIL)
            assert "Point 2 of 2" in text, text
