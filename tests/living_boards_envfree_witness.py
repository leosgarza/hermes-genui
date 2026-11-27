#!/usr/bin/env python3
"""Living Boards round-7 witness — REAL Chrome, REAL store door, NO special environment.

Why this file exists (Sol's review-environment note on the round-6 disposition, run 1057): the
round-6 Chrome witnesses ride pytest + uvicorn + fastapi, and an independent reviewer whose
environment lacks them could not rerun them. This witness needs NOTHING but the system python3,
Google Chrome/Chromium, and the repo's own web/node_modules esbuild:

  python3 tests/living_boards_envfree_witness.py     # exit 0 = PASS, 1 = FAIL, 3 = SKIP (no deps)

The door is the REAL store (core/store.py, imported by path — the same module plugin_api.py wraps):
saved with store.save, UPDATED HEADLESS with store.update, archived versions read with
store.load_versions — served over a loopback http.server with plugin_api's exact route shapes
(GET /blocks/<id>, GET /blocks/<id>?version=N, GET/PUT /blocks/<id>/state). The page is the real
frozen components (BlockTag and everything behind it) bundled from source with esbuild, driven
through real Chrome over the DevTools protocol (the same raw-stdlib websocket client the accepted
harness uses). Between the edit phase and the reopen phase the browser PROCESS DIES: no forgetBlock,
no page store, nothing survives except what the board's own door file holds — the strictest shape
of "the only view unmounted, the host updated the address, the chat reaches it back later".

The invariants witnessed (Sol round-7 REQUIRED INVARIANT 1-3 + controls):
  calculator — v1 drag 700 files on the board's door by IDENTITY AT EDIT TIME (never-living board);
                first update lands HEADLESS ([heading, same calculator]); a fresh browser reopens
                and shows 700, Half=350 worked from it. Pre-fix this witness reddens at the filing
                wait: door:"never" left the door EMPTY and the reopen could only draw 400.
  form draft — typed draft reaches the door at edit time; headless update; reopen shows the draft.
  tab pick   — real pointer click on the second tab reaches the door; headless update; reopen has
                the tab still selected with its panel words.
  misfire    — v1 calculator dragged, headless update REPLACES it with different-words calculator:
                the new one draws its own spec (300, never the dead block's 700), the old bytes
                stay in the door file inert — never erased, never worn by a stranger.
"""
from __future__ import annotations

import base64
import http.server
import importlib.util
import json
import os
import re
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from contextlib import contextmanager
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "web" / "src"
ESBUILD = REPO / "web" / "node_modules" / ".bin" / "esbuild"

# --- the real store module (no framework anywhere near it) ---------------------------------------------
#
# REVIEW-ENVIRONMENT HONESTY: core/store.py is the shipped server-side store and needs Python >= 3.11
# (datetime.UTC). macOS' /usr/bin/python3 is 3.9 — the exact wall the round-6 reviewer hit with the
# pytest harness, in a different form. This witness therefore needs NO setup: when started under an
# old interpreter it finds any 3.11+ python on the machine (Homebrew python3, python3.11..3.14 on
# PATH) and re-execs ITSELF under it. Only if none exists does it SKIP with an honest one-line hint.

def load_store():
    spec = importlib.util.spec_from_file_location("hb_store", REPO / "core" / "store.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _dispatch():
    if sys.version_info >= (3, 11):  # noqa: UP036 — deliberate: this script is BY DESIGN started under
        return                        # an old system python3 too; the check is the reviewer feature
    cands = ["python3.14", "python3.13", "python3.12", "python3.11",
             "/opt/homebrew/bin/python3", "/usr/local/bin/python3"]
    for c in cands:
        exe = shutil.which(c) or (c if Path(c).exists() else None)
        if exe is None:
            continue
        try:
            probe = subprocess.run(
                [exe, "-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)"],
                timeout=15)
        except Exception:
            continue
        if probe.returncode == 0:
            os.execv(exe, [exe, str(Path(__file__).resolve()), *sys.argv[1:]])
    print("SKIP: the real core/store.py needs Python >= 3.11 and none was found; "
          "e.g. `uv run --python 3.12 python3 tests/living_boards_envfree_witness.py`")
    sys.exit(3)


STORE = None  # filled by main() after the interpreter is settled


_dispatch()

CALC = {"type": "calculator", "sliders": [{"name": "p", "title": "Loan", "max": 1000, "value": 400}],
        "results": [{"label": "Half", "formula": "p / 2"}]}
CALCB = {"type": "calculator", "sliders": [{"name": "q", "title": "Mortgage", "max": 900, "value": 300}],
         "results": [{"label": "Half", "formula": "q / 2"}]}
HEAD = {"type": "heading", "text": "Portfolio \u00b7 Q4"}
TEXT = {"type": "text", "text": "three holdings, all up"}
FORM = {"type": "form", "title": "Plan it", "submit": "Send",
        "fields": [{"id": "note", "type": "text", "label": "Anything to slip in?"}]}
TABS = {"type": "tabs", "tabs": [
    {"label": "Rent", "children": [{"type": "text", "text": "RENT NOTES"}]},
    {"label": "Buy", "children": [{"type": "text", "text": "BUY NOTES"}]},
]}

# --- the door: plugin_api's routes over the real store, stdlib http.server --------------------------------

WORD_READERS = [
    ("align", "align_of"), ("text_align", "text_align_of"), ("density", "density_of"),
    ("palette", "palette_of"), ("motion", "motion_of"), ("as_of", "as_of_of"),
    ("live", "live_of"), ("updated_at", "updated_at_of"), ("links", "links_of"),
]


class DoorHandler(http.server.BaseHTTPRequestHandler):
    root: Path  # injected per server before serving

    def log_message(self, *args):  # silence
        pass

    def _reply(self, code: int, payload) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802 — the preflight for the JSON PUT, as CORSMiddleware answered
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _board_answer(self, block_id: str, want_version):
        root = self.root
        board = STORE.load(block_id, root)
        if board is None:
            return self._reply(404, {"error": "not found"})
        served = STORE.version_of(board)
        if want_version is not None:
            if not want_version.isdigit() or int(want_version) < 1:
                return self._reply(400, {"error": "version must be a number 1 or up"})
            want = int(want_version)
            if want != (served or 1):
                entry = next((e for e in STORE.load_versions(block_id, root)
                              if isinstance(e, dict) and e.get("version") == want), None)
                if entry is None or not isinstance(entry.get("board"), (list, dict)):
                    return self._reply(404, {"error": f"no version {want} of this board"})
                board = entry["board"]
                served = want
        answer = {"blocks": STORE.blocks_of(board), "stored": board}
        for word, reader in WORD_READERS:
            value = getattr(STORE, reader)(board)
            if value is not None:
                answer[word] = value
        if served is not None:
            answer["version"] = served
        if reader_follow := STORE.follow_ups_of(board):
            answer["follow_ups"] = reader_follow
        self._reply(200, answer)

    def do_GET(self):  # noqa: N802
        parts = urllib.parse.urlsplit(self.path)
        query = urllib.parse.parse_qs(parts.query)
        m = re.fullmatch(r"/blocks/([0-9a-f]{8})", parts.path)
        if m:
            return self._board_answer(m.group(1), query.get("version", [None])[0])
        m = re.fullmatch(r"/blocks/([0-9a-f]{8})/state", parts.path)
        if m:
            block_id = m.group(1)
            if STORE.load(block_id, self.root) is None:
                return self._reply(404, {"error": "not found"})
            state = STORE.load_state(block_id, self.root)
            return self._reply(200, {"state": state} if state else {})
        self._reply(404, {"error": "no such route"})

    def do_PUT(self):  # noqa: N802
        parts = urllib.parse.urlsplit(self.path)
        m = re.fullmatch(r"/blocks/([0-9a-f]{8})/state", parts.path)
        if not m:
            return self._reply(404, {"error": "no such route"})
        block_id = m.group(1)
        if STORE.load(block_id, self.root) is None:
            return self._reply(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw)
        except ValueError:
            body = None
        state = body.get("state") if isinstance(body, dict) else None
        if not isinstance(state, dict):
            return self._reply(400, {"error": 'body must be {"state": {...}}'})
        STORE.save_state(block_id, state, self.root)
        self._reply(200, {"ok": True})


@contextmanager
def door(work: Path):
    DoorHandler.root = work
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), DoorHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{httpd.server_address[1]}"
    finally:
        httpd.shutdown()
        httpd.server_close()


# --- real Chrome over the raw-stdlib CDP client (the accepted harness's client, ported whole) ----------

CHROME_CANDIDATES = [
    Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    Path("/usr/bin/google-chrome"), Path("/usr/bin/chromium"), Path("/usr/bin/chromium-browser"),
]


def find_chrome():
    env = os.environ.get("HB_CHROME")
    if env and Path(env).exists():
        return Path(env)
    for name in ("chrome", "google-chrome", "chromium", "chromium-browser"):
        if (found := shutil.which(name)):
            return Path(found)
    return next((c for c in CHROME_CANDIDATES if c.exists()), None)


CHROME = find_chrome()
WINDOW_W, WINDOW_H = 1100, 900

BASE_CSS = [  # the same stylesheet set the accepted living Chrome harness feeds the probe page
    SRC / "styles" / "tokens.css", SRC / "styles" / "shared.css",
    SRC / "blocks" / "layout" / "layout.css", SRC / "blocks" / "calculator" / "calculator.css",
    SRC / "blocks" / "chart" / "chart.css", SRC / "blocks" / "table" / "table.css",
    SRC / "blocks" / "source" / "source.css", SRC / "blocks" / "callout" / "callout.css",
    SRC / "blocks" / "atoms" / "atoms.css", SRC / "blocks" / "kpis" / "kpis.css",
]
CSS = BASE_CSS[:2] + [SRC / "host" / "blockTag.css"] + BASE_CSS[2:] + [
    SRC / "blocks" / "checklist" / "checklist.css", SRC / "blocks" / "form" / "form.css",
]

DRIVER = r"""
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { BlockTag } from "./src/host/BlockTag";
import { BlockActions, composerActions } from "./src/host/actions";

declare const window: any;
const composer = {
  submit: (_s: null, _t: string) => true,
  insertText: async (_s: null, _t: string) => true,
  focus: () => {},
};
const actions = composerActions(composer);
const spec = JSON.parse(document.getElementById("spec")!.textContent!);
const rest = (path: string, init?: { method?: string; body?: unknown }) =>
  fetch(String(spec.door) + path, {
    method: init?.method,
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  }).then((r) =>
    r.ok ? r.json() : r.text().then((t) => Promise.reject(new Error(`${path} -> ${r.status} ${t}`))));
const load = (id: string) => rest(`/blocks/${id}`);
createRoot(document.getElementById("app-a")!).render(
  createElement(BlockActions.Provider, { value: { ...actions, rest } },
    createElement(BlockTag, { id: spec.live, streaming: false, load })));
window.__ready = true;
"""


class CDP:
    def __init__(self, host, port, path):
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

    def _read(self, n):
        while len(self.buf) < n:
            more = self.sock.recv(65536)
            if not more:
                raise OSError("websocket closed")
            self.buf += more
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _send(self, payload):
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

    def call(self, method, **params):
        self.mid += 1
        self._send(json.dumps({"id": self.mid, "method": method, "params": params}))
        while True:
            msg = self._recv()
            if msg.get("id") == self.mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result")

    def js(self, expr):
        r = self.call("Runtime.evaluate", expression=expr, returnByValue=True)
        if r.get("exceptionDetails"):
            raise RuntimeError(f"probe threw: {r['exceptionDetails']}")
        return r["result"].get("value")

    def mouse(self, x, y):
        for m, extra in (("mouseMoved", {}), ("mousePressed", {"button": "left", "clickCount": 1}),
                         ("mouseReleased", {"button": "left", "clickCount": 1})):
            self.call("Input.dispatchMouseEvent", type=m, x=x, y=y, **extra)

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


def wait_js(cdp, expr, timeout=20.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if cdp.js(expr):
            return
        time.sleep(0.05)
    raise AssertionError(f"never became true: {expr}")


def _devtools_port(profile):
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


def _page_socket(port):
    end = time.monotonic() + 30
    while time.monotonic() < end:
        try:
            targets = json.loads(urllib.request.urlopen(
                f"http://127.0.0.1:{port}/json/list", timeout=2).read())
        except Exception:
            targets = []
        for t in targets:
            if t.get("type") == "page" and t.get("url", "").endswith("probe.html"):
                _, rest = t["webSocketDebuggerUrl"].split("://", 1)
                hostport, path = rest.split("/", 1)
                return hostport.split(":")[0], int(hostport.split(":")[1]), "/" + path
        time.sleep(0.1)
    raise AssertionError("the probe page never appeared in the devtools target list")


@contextmanager
def browser(bundle_js, door_url, live):
    """One genuine Chrome PROCESS. Exiting the context kills it: the strongest unmount there is —
    forgetBlock never runs, no page store survives; only the door's files carry on."""
    with tempfile.TemporaryDirectory() as work:
        (Path(work) / "driver.js").write_text(bundle_js)
        page = Path(work) / "probe.html"
        spec = json.dumps({"door": door_url, "live": live}).replace("</", "<\\/")
        css = "\n".join(p.read_text() for p in CSS)
        page.write_text(
            "<!doctype html><html><head><meta charset='utf-8'>"
            f"<style>{css}</style></head><body style='margin:0'>"
            "<div id='app-a' style='padding:16px'></div>"
            f"<script id='spec' type='application/json'>{spec}</script>"
            "<script src='driver.js'></script></body></html>")
        profile = Path(work) / "profile"
        profile.mkdir()
        proc = subprocess.Popen(
            [str(CHROME), "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
             "--force-device-scale-factor=1", "--force-prefers-reduced-motion",
             f"--window-size={WINDOW_W},{WINDOW_H}", f"--user-data-dir={profile}",
             "--remote-debugging-port=0", f"file://{page}"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cdp = None
        try:
            cdp = CDP(*_page_socket(_devtools_port(profile)))
            wait_js(cdp, "window.__ready === true", 20)
            yield cdp
        finally:
            if cdp is not None:
                try:
                    cdp.close()
                except Exception:
                    pass
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()


def wait_filed(state_file: Path, seconds=20.0):
    """The round-7 edit-time rule, straight off the disk: SOME identity key must hold the answer
    while the reader is still looking at the board. Returns the dict when it appears."""
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if state_file.is_file():
            saved = json.loads(state_file.read_text())
            if any(str(k).startswith("k:") for k in saved):
                return saved
        time.sleep(0.1)
    return None


SET_RANGE = """(() => {{ const el = document.querySelector('#app-a input[type=range]');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, '{value}'); el.dispatchEvent(new Event('input', {{ bubbles: true }})); }})()"""


def scenario(bundle_js, name, v1, v2, seed, check):
    work = Path(tempfile.mkdtemp(prefix="envfree-door-"))
    STORE.default_root = lambda: work
    live = STORE.save(v1, root=work)
    state_file = work / f"{live}.state.json"
    failures = []
    with door(work) as door_url:
        with browser(bundle_js, door_url, live) as cdp:
            wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null")
            seed(cdp, state_file, failures, live)
        # the host updates the address while NOTHING is mounted (the browser is dead)
        STORE.update(live, v2, root=work)
        with browser(bundle_js, door_url, live) as cdp:
            wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null")
            check(cdp, state_file, failures, live)
    return failures


def main():
    global STORE
    STORE = load_store()
    if CHROME is None:
        print("SKIP: no Chrome/Chromium binary found")
        return 3
    if not ESBUILD.exists():
        print("SKIP: web/node_modules/.bin/esbuild missing — run npm ci in web/ first")
        return 3
    proc = subprocess.run(
        [str(ESBUILD), "--bundle", "--format=iife", "--jsx=automatic", "--loader=tsx",
         "--log-level=warning"],
        input=DRIVER, capture_output=True, text=True, timeout=180, cwd=str(REPO / "web"))
    if proc.returncode != 0:
        print(f"SKIP: esbuild could not bundle the components: {proc.stderr[:400]}")
        return 3
    bundle = proc.stdout
    all_failures = []

    # --- 1. calculator: drag -> edit-time identity filing -> FIRST headless update -> reopen -> 700 ----
    def seed_calc(cdp, state_file, fails, live):
        cdp.js(SET_RANGE.format(value="700"))
        saved = wait_filed(state_file)
        if saved is None:
            fails.append("calculator: the drag NEVER reached the board's door while the reader watched "
                         "(door:\"never\" page-only ephemeral — the round-7 defect)")
        elif not any(v == {"p": 700} for v in saved.values()):
            fails.append(f"calculator: door holds no answer {{p: 700}}: {saved}")

    def check_calc(cdp, state_file, fails, live):
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks').innerText.includes('Portfolio')")
        time.sleep(1.0)  # settle: the door has answered and the reopen drew from it
        value = cdp.js("document.querySelector('#app-a input[type=range]').value")
        if value != "700":
            fails.append(f"calculator: reopened after a FIRST headless update shows {value}, expected 700")
        half = cdp.js("""(() => { const t = document.querySelector('#app-a .hb-calc-result-value').innerText;
          const n = parseFloat(t.replace(/[^0-9.\\-]/g, "")); return Number.isFinite(n) ? n : -1; })()""")
        if not abs(half * 2 - 700) <= 1:
            fails.append(f"calculator: Half {half} does not match the restored drag 700")

    all_failures.append(("calculator first-headless-update",
                         scenario(bundle, "calculator", [CALC], [HEAD, CALC], seed_calc, check_calc)))

    # --- 2. form draft equivalent ------------------------------------------------------------------------
    def seed_form(cdp, state_file, fails, live):
        cdp.js("""(() => { const el = document.querySelector('#app-a input.hb-input[type=text]');
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          set.call(el, 'two cats, one tent'); el.dispatchEvent(new Event('input', { bubbles: true })); })()""")
        saved = wait_filed(state_file)
        if saved is None:
            fails.append("form: the draft NEVER reached the board's door at edit time")

    def check_form(cdp, state_file, fails, live):
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks').innerText.includes('Portfolio')")
        time.sleep(1.0)
        value = cdp.js("document.querySelector('#app-a input.hb-input[type=text]').value")
        if value != "two cats, one tent":
            fails.append(f"form: reopened draft field reads {value!r}, expected 'two cats, one tent'")

    all_failures.append(("form first-headless-update",
                         scenario(bundle, "form", [FORM], [HEAD, FORM], seed_form, check_form)))

    # --- 3. tab pick equivalent (REAL pointer click) ------------------------------------------------------
    def seed_tabs(cdp, state_file, fails, live):
        x, y = cdp.js("""(() => { const r = document.querySelectorAll('#app-a [role=tab]')[1]
          .getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()""")
        cdp.mouse(x, y)
        wait_js(cdp, "document.querySelector('#app-a .hb-tab-panel').innerText.includes('BUY NOTES')")
        saved = wait_filed(state_file)
        if saved is None:
            fails.append("tabs: the pick NEVER reached the board's door at edit time")

    def check_tabs(cdp, state_file, fails, live):
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks').innerText.includes('Portfolio')")
        time.sleep(1.0)
        if cdp.js("""(() => { const t = document.querySelectorAll('#app-a [role=tab]')[1];
          return t.getAttribute('aria-selected') === 'true'; })()""") is not True:
            fails.append("tabs: the reopened board did not restore the second tab")
        if "BUY NOTES" not in cdp.js("document.querySelector('#app-a .hb-tab-panel').innerText"):
            fails.append("tabs: the reopened panel does not show the picked tab's words")

    all_failures.append(("tabs first-headless-update",
                         scenario(bundle, "tabs", [TABS], [HEAD, TABS], seed_tabs, check_tabs)))

    # --- 4. misfire guard: the replaced calculator may NOT wear the dead one's drag ----------------------
    def seed_mis(cdp, state_file, fails, live):
        cdp.js(SET_RANGE.format(value="700"))
        saved = wait_filed(state_file)
        if saved is None:
            fails.append("misfire: v1 drag never filed at edit time (guard has nothing to stand on)")

    def check_mis(cdp, state_file, fails, live):
        wait_js(cdp, "document.querySelector('#app-a input[type=range]') !== null")
        time.sleep(1.0)
        value = cdp.js("document.querySelector('#app-a input[type=range]').value")
        if value != "300":
            fails.append(f"misfire: the stranger calculator wears {value}, expected its own spec 300")
        saved = json.loads(state_file.read_text()) if state_file.is_file() else {}
        if not any(v == {"p": 700} for v in saved.values()):
            fails.append("misfire: the v1 drag never reached the door file at all (no bytes to keep inert)")

    all_failures.append(("misfire guard",
                         scenario(bundle, "misfire", [CALC], [CALCB], seed_mis, check_mis)))

    bad = False
    for label, fails in all_failures:
        if fails:
            bad = True
            for f in fails:
                print(f"FAIL {label}: {f}")
        else:
            print(f"PASS {label}: real Chrome + real store.py door")
    print("WITNESS RESULT:", "FAIL" if bad else "PASS")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
