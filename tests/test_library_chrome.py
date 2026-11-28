# Real-browser regression for the Library (t_0559173f, enhancement #8).
#
# The claim this file owns is the WHOLE shelf in one living browser: a real pointer click on the pin
# writes a real note into a real store folder; a REAL page reload reads it back and lists the board;
# "Library" opens the saved board and draws it from the door's own answer (data AND layout words);
# reattach walks the real composerActions seam over a recording fake composer and submits exactly the
# saved board's own tag. Organizing (favorite, rename, folder) and the unpin semantics (the note dies,
# the board lives — GET still answers 200 and the file is still on disk) are proven by clicks here too.
#
# THE DOOR IS REAL: dashboard/plugin_api.py itself, served in-process by uvicorn over a loopback port
# on a tmp store, exactly like Hermes serves it. From a file:// page the browser reaches ONLY that
# 127.0.0.1 door: window.__net witnesses every fetch the page makes, and the local-only claim is
# asserted against it (nothing external is ever asked — no account, no cloud, no telemetry). CORS is
# opened on the TEST app only: a browser-side harness fact about file:// origins, not a plugin change.
#
# Standing rules that ride along: the inline board's own DOM does not change while shelf acts happen
# (the controls live outside .hb-blocks); the chrome pair is keyboard-operable with real Tab presses
# and a trusted Enter; the dialog's entrance respects prefers-reduced-motion (the harness runs with
# --force-prefers-reduced-motion, and the assertion reads the RESTING style — the gate rule sits
# below the animation rule in blockTag.css, later of the same specificity wins); and at the narrowest
# board column the shelf still fits and every word stays readable inside its box.
from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
import threading
import time
from contextlib import contextmanager
from pathlib import Path

import pytest
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from conftest import ROOT, load_plugin_package

load_plugin_package()

from test_chart_scatter_cluster_chrome import (  # noqa: E402
    CDP, CSS, ESBUILD, _devtools_port, _page_socket, real_click, wait_js,
)
from test_layout_alignment import CHROME  # noqa: E402

WINDOW_W, WINDOW_H = 1100, 820


# --- the real door --------------------------------------------------------------------------------


@pytest.fixture
def door():
    """plugin_api.py, really served, over a loopback port on a tmp store folder — the same code the
    Dashboard runs. One FRESH store per test: the shelf is exact-counted below, and a shared store
    would make each test's rows depend on which test ran first. The tmp folder is yielded too: the
    shelf assertions read its files directly."""
    work = Path(tempfile.mkdtemp(prefix="library-door-"))
    spec = importlib.util.spec_from_file_location("hb_plugin_api", ROOT / "dashboard" / "plugin_api.py")
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)
    api.store.default_root = lambda: work

    app = FastAPI()
    app.include_router(api.router)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    end = time.monotonic() + 30
    port = None
    while time.monotonic() < end:
        if server.started and server.servers:
            port = server.servers[0].sockets[0].getsockname()[1]
            break
        time.sleep(0.1)
    assert port, "uvicorn never opened a port"
    try:
        yield api, f"http://127.0.0.1:{port}", work
    finally:
        server.should_exit = True
        thread.join(timeout=10)


# --- the real page --------------------------------------------------------------------------------

DRIVER = """
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { BlockTag } from "./src/host/BlockTag";
import { BlockActions, composerActions } from "./src/host/actions";

declare const window: any;
window.__boot = Date.now();  // one stamp per load, so a reload can never be mistaken for the old page

// The local-only ledger, installed before anything can ask: every fetch the page makes, with its
// method. It restarts at each page load, so the journey reads it once per load and budgets both.
window.__net = [];
const realFetch = window.fetch;
window.fetch = (u: RequestInfo | string, o?: RequestInit) => {
  window.__net.push([String(u), String(o?.method ?? "GET")]);
  return realFetch(u as any, o);
};

const sends: Array<[string, string]> = [];
window.__send = sends;
const composer = {
  submit: (_s: null, t: string) => { sends.push(["submit", t]); return true; },
  insertText: async (_s: null, t: string) => { sends.push(["insert", t]); return true; },
  focus: () => { sends.push(["focus", ""]); },
};
const actions = composerActions(composer);

const spec = JSON.parse(document.getElementById("spec")!.textContent!);
const door = String(spec.door);
const rest = (path: string, init?: { method?: string; body?: unknown }) =>
  fetch(door + path, {
    method: init?.method,
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  }).then((r) =>
    r.ok ? r.json() : r.text().then((t) => Promise.reject(new Error(`${path} -> ${r.status} ${t}`))));

createRoot(document.getElementById("app")!).render(
  createElement(BlockActions.Provider, { value: { ...actions, rest } },
    createElement(BlockTag, { id: spec.id, streaming: false, load: (id: string) => rest(`/blocks/${id}`) })));
window.__ready = true;
"""


@pytest.fixture(scope="module")
def bundle():
    if CHROME is None:
        pytest.skip("no Chrome/Chromium binary on this machine")
    if not ESBUILD.exists():
        pytest.skip("web/node_modules not installed — cannot bundle the real components")
    proc = subprocess.run(
        [str(ESBUILD), "--bundle", "--format=iife", "--jsx=automatic", "--loader=tsx",
         "--log-level=warning"],
        input=DRIVER, capture_output=True, text=True, timeout=180, cwd=str(ROOT / "web"))
    assert proc.returncode == 0, proc.stderr
    return proc.stdout


class Page:
    """One real Chrome on one probe page over the real door."""

    def __init__(self, proc, cdp, work, page_path, url):
        self.proc, self.cdp, self.work, self.page_path, self.url = proc, cdp, work, page_path, url

    def reload(self):
        before = self.cdp.js("window.__boot")
        self.cdp.call("Page.navigate", url=self.url)
        # wait for the NEW load, not for the old page's flag to still be there
        wait_js(self.cdp, f"window.__boot !== {json.dumps(before)} && window.__ready === true", 15)

    def close(self):
        self.cdp.close()
        self.proc.terminate()
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()


@contextmanager
def chrome_page(bundle_js: str, board_id: str | None, door_url: str, app_style: str = ""):
    with tempfile.TemporaryDirectory() as work:
        (Path(work) / "driver.js").write_text(bundle_js)
        page = Path(work) / "probe.html"
        spec = {"door": door_url}
        if board_id is not None:
            spec["id"] = board_id
        spec = json.dumps(spec).replace("</", "<\\/")
        css = "\n".join(p.read_text() for p in CSS)
        page.write_text(
            "<!doctype html><html><head><meta charset='utf-8'>"
            f"<style>{css}</style></head><body style='margin:0'>"
            f"<div id='app' style='{app_style}'></div>"
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
        try:
            port = _devtools_port(profile)
            cdp = CDP(*_page_socket(port))
            wait_js(cdp, "window.__ready === true", 20)
            yield Page(proc, cdp, Path(work), page, f"file://{page}")
        finally:
            try:
                cdp.close()
            except Exception:
                pass
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()


def drawn(cdp: CDP):
    wait_js(cdp, "document.querySelector('.hb-pin') !== null", 15)


def click(cdp: CDP, selector: str, index: int = 0):
    rect = f"document.querySelectorAll('{selector}')[{index}].getBoundingClientRect()"
    return real_click(cdp, rect)


PIN = ".hb-pin"
LIB = ".hb-lib"
DIALOG = ".hb-library-dialog"


def pin_state(cdp):
    return cdp.js("document.querySelector('.hb-pin')?.getAttribute('aria-pressed')")


def shelf_row(cdp: CDP, board_id: str) -> str:
    """The one board's shelf row text, read in the live page. The attribute value is quoted: a hex
    id that starts with a digit is not a bare CSS identifier, so the unquoted form is a SyntaxError."""
    sel = json.dumps(f'.hb-library-row[data-board="{board_id}"]')
    return cdp.js(f"(() => {{ const r = document.querySelector({sel});"
                  " return r ? r.textContent : null; })()")


# --- the tests --------------------------------------------------------------------------------------


class TestPinReloadLibraryReopenReattach:
    """The named acceptance journey, in one living browser: pin → reload → Library → reopen → reattach."""

    def test_the_journey(self, door, bundle):
        api, door_url, work = door
        board_id = api.store.save(
            {"align": "center", "blocks": [
                {"type": "heading", "text": "Kyoto trip planner"},
                {"type": "table", "caption": "Budget", "columns": ["Item", "Cost"], "rows": [["Ryokan", "120000"]]},
            ]}, root=work)
        with chrome_page(bundle, board_id, door_url) as p:
            cdp = p.cdp
            drawn(cdp)

            # 1. a REAL click on the pin marks the board saved — and the note is on disk in the store folder
            assert pin_state(cdp) == "false"
            click(cdp, PIN)
            wait_js(cdp, "document.querySelector('.hb-pin[aria-pressed=\"true\"]') !== null", 10)
            notes = json.loads((work / "library.json").read_text())
            assert notes[board_id]["title"] == "Kyoto trip planner"  # auto-title from the board's own words
            assert notes[board_id]["pinned"] is True
            assert "Saved to Library" in cdp.js("document.querySelector('.hb-library-said')?.textContent ?? ''")
            # the board's GET and the mount shelf GET landed before the click; the pin's PUT pushed at
            # the click; the read-back GET pushes when the PUT answers — right after the word shows.
            wait_js(cdp, "window.__net.length === 4", 10)
            first_load_net = cdp.js("window.__net")

            # 2. a REAL reload: the page forgets everything it knew; the shelf remembers
            p.reload()
            drawn(cdp)
            assert pin_state(cdp) == "true", "the pin did not survive the reload"

            # 3. the Library lists exactly the pinned boards — this one, and only this one
            click(cdp, LIB)
            wait_js(cdp, "document.querySelectorAll('.hb-library-row').length === 1", 10)
            row = shelf_row(cdp, board_id)
            assert "Kyoto trip planner" in row
            assert "this board" in row  # the shelf knows which board it is standing on

            # 4. reopen: the saved board comes back from the door — data AND layout words
            click(cdp, ".hb-library-open")
            wait_js(cdp, "document.querySelector('.hb-library-board') !== null", 10)
            board_js = cdp.js("""(() => {
              const b = document.querySelector('.hb-library-board');
              return b ? {
                text: b.textContent,
                centered: [...b.querySelectorAll('.hb-place')].filter(
                  (p) => p.getAttribute('data-align') === 'center').length,
                rows: b.querySelectorAll('tbody tr').length,
              } : null;
            })()""")
            assert "Kyoto trip planner" in board_js["text"] and "Ryokan" in board_js["text"]
            assert board_js["centered"] >= 2, "the stored align did not ride back through the reader"
            assert board_js["rows"] == 1  # the saved table, whole

            # 5. reattach: the real seam submits exactly the board's own reference line
            click(cdp, '.hb-library-boardhead button[aria-label^="Add"]')
            wait_js(cdp, "window.__send.some(([k, t]) => k === 'submit' && t.includes('::blocks'))", 10)
            submitted = [t for k, t in cdp.js("window.__send") if k == "submit"]
            assert submitted == [f'Saved board “Kyoto trip planner”:\n::blocks{{id="{board_id}"}}']
            wait_js(cdp, "document.querySelector('.hb-library-attached') !== null", 10)
            assert cdp.js("document.querySelector('.hb-library-attached').textContent") == "Sent to chat."

            # 6. the local-only ledger: every ask the WHOLE journey made went to the one loopback door,
            #    and nothing more than the acts themselves cost. The ledger restarts at each page load,
            #    so both loads are budgeted. First load: the board's own GET, the ONE mount read of the
            #    shelf, the pin's PUT, and that write's read-back. Second load: board GET twice (draw +
            #    reopen), shelf GET twice (mount + opening the dialog), and the reattach costs ZERO —
            #    it rides the composer seam, not the net.
            def tally(ledger):
                assert ledger and all(u.startswith(door_url) for u, _m in ledger), ledger
                counts: dict = {}
                for u, method in ledger:
                    path = "/library" if u[len(door_url):].startswith("/library/") else u[len(door_url):]
                    key = (method, path)
                    counts[key] = counts.get(key, 0) + 1
                return counts

            assert tally(first_load_net) == {
                ("GET", f"/blocks/{board_id}"): 1,
                ("GET", "/library"): 2,   # mount read + the read-back after the pin's PUT
                ("PUT", "/library"): 1,   # the pin itself
            }, first_load_net
            assert tally(cdp.js("window.__net")) == {
                ("GET", f"/blocks/{board_id}"): 2,  # the page's board + the reopen's answer
                ("GET", "/library"): 2,             # mount read + opening the dialog
            }, "an act asked the door beyond what it needed"
            hosts = {u.split("/")[2] for u, _m in first_load_net + cdp.js("window.__net")}
            assert hosts == {door_url.split("/")[2]}, f"the shelf reached beyond one origin: {hosts}"


class TestOrganize:
    def test_favorite_rename_and_folder_through_real_clicks(self, door, bundle):
        api, door_url, work = door
        one = api.store.save([{"type": "heading", "text": "Rent tracker"}], root=work)
        two = api.store.save([{"type": "heading", "text": "Q3 review"}], root=work)
        api.store.pin(two, root=work)  # pinned at the door (never through this page): the shelf must list it too
        with chrome_page(bundle, one, door_url) as p:
            cdp = p.cdp
            drawn(cdp)
            click(cdp, PIN)  # pin the board standing on — the UI's half
            wait_js(cdp, "document.querySelector('.hb-pin[aria-pressed=\"true\"]') !== null", 10)

            # EXACTLY the pinned boards: the clicked one and the door's one, nothing else
            click(cdp, LIB)
            wait_js(cdp, "document.querySelectorAll('.hb-library-row').length === 2", 10)

            # Every control below is SELECTED BY BOARD, never by position: a star click re-groups rows
            # mid-test, and index-selected clicks would then chase a moving target and hit the wrong row.

            # favorite: the row moves under a Favorites head, and the file says so
            click(cdp, f'[data-board="{two}"] .hb-library-tools > button[aria-label^="Favorite"]')
            wait_js(cdp, "document.querySelector('.hb-library-head')?.textContent === 'Favorites'", 10)
            assert json.loads((work / "library.json").read_text())[two]["favorite"] is True

            # rename: the editor commits with a real Enter, the title rides back through the door
            click(cdp, f'[data-board="{two}"] .hb-library-tools > button[aria-label^="Rename"]')
            wait_js(cdp, "document.querySelector('.hb-library-edit input') !== null", 10)
            cdp.call("Input.insertText", text="Budget 2026")
            cdp.key("Enter", "Enter", 13)
            wait_js(cdp, f"""document.querySelector('[data-board="{two}"] .hb-library-name')"""
                         """.textContent === 'Budget 2026'""", 10)
            assert json.loads((work / "library.json").read_text())[two]["title"] == "Budget 2026"

            # folder: a name moves the row under a new head, and the file carries it
            click(cdp, f'[data-board="{one}"] .hb-library-tools > button[aria-label^="Move"]')
            wait_js(cdp, "document.querySelector('.hb-library-edit input') !== null", 10)
            cdp.call("Input.insertText", text="Finance")
            cdp.js("document.querySelector('.hb-library-edit button').click()")
            wait_js(
                cdp,
                "[...document.querySelectorAll('.hb-library-head')]"
                ".map(h => h.textContent).join(',') === 'Favorites,Finance'",
                10,
            )
            assert json.loads((work / "library.json").read_text())[one]["folder"] == "Finance"

            # a reload proves the organizing persisted, not just repainted: names, groups, and all
            p.reload()
            drawn(cdp)
            click(cdp, LIB)
            wait_js(cdp,
                    "[...document.querySelectorAll('.hb-library-name')]"
                    ".map(n => n.textContent).join(',') === 'Budget 2026,Rent tracker'", 10)


class TestUnpinSemantics:
    def test_removing_a_pin_destroys_nothing(self, door, bundle):
        api, door_url, work = door
        board_id = api.store.save([{"type": "heading", "text": "Keep me"}], root=work)
        api.store.pin(board_id, root=work)
        board_path = work / f"{board_id}.json"
        with chrome_page(bundle, board_id, door_url) as p:
            cdp = p.cdp
            drawn(cdp)
            click(cdp, LIB)
            wait_js(cdp, "document.querySelectorAll('.hb-library-row').length === 1", 10)
            click(cdp, '.hb-library-tools > button[aria-label^="Remove"]')
            wait_js(cdp, "document.querySelectorAll('.hb-library-row').length === 0", 10)
            assert json.loads((work / "library.json").read_text()) == {}
            # THE semantics, in the real browser: the board the shelf just dropped still answers.
            cdp.js(
                f"window.__still = fetch('{door_url}/blocks/{board_id}')"
                f".then((r) => {{ window.__code = r.status; return r.json(); }})"
            )
            wait_js(cdp, "window.__code !== undefined", 10)
            assert cdp.js("window.__code") == 200
            assert board_path.is_file()
            assert "never deleted" in (cdp.js("document.querySelector('.hb-library-said')?.textContent ?? ''") or "")
            # the page the board stands on still draws it: the tag was never harmed either
            assert "Keep me" in cdp.js("document.querySelector('.hb-tag')?.textContent ?? ''")


class TestKeyboardAndChrome:
    def test_real_tabs_reach_the_pin_and_enter_pins(self, door, bundle):
        api, door_url, work = door
        board_id = api.store.save([{"type": "heading", "text": "Keyboard"}], root=work)
        with chrome_page(bundle, board_id, door_url) as p:
            cdp = p.cdp
            drawn(cdp)
            seen = []
            reached = False
            for _ in range(12):  # real Tab presses from the page body walk the chrome pair
                cdp.key("Tab", "Tab", 9)
                at = cdp.js(
                    "(() => { const a = document.activeElement;"
                    " return a ? (a.className + '|' + (a.getAttribute('aria-label') ?? '')) : ''; })()"
                )
                seen.append(at)
                if "hb-pin" in at:
                    reached = True
                    break
            assert reached, seen
            # a trusted Enter needs the key event's text — without it the button default action never fires
            cdp.call("Input.dispatchKeyEvent", type="keyDown", key="Enter", code="Enter",
                     windowsVirtualKeyCode=13, text="\r", unmodifiedText="\r")
            cdp.call("Input.dispatchKeyEvent", type="keyUp", key="Enter", code="Enter",
                     windowsVirtualKeyCode=13)
            wait_js(cdp, "document.querySelector('.hb-pin[aria-pressed=\"true\"]') !== null", 10)
            assert board_id in json.loads((work / "library.json").read_text())

            # the dialog owns its keyboard and hands focus back exactly where it came from
            cdp.key("Tab", "Tab", 9)  # one more stop: the Library control
            at = cdp.js("(() => document.activeElement?.className ?? '')()")
            assert "hb-lib" in at, seen + [at]
            cdp.call("Input.dispatchKeyEvent", type="keyDown", key="Enter", code="Enter",
                     windowsVirtualKeyCode=13, text="\r", unmodifiedText="\r")
            cdp.call("Input.dispatchKeyEvent", type="keyUp", key="Enter", code="Enter",
                     windowsVirtualKeyCode=13)
            wait_js(cdp, f"document.querySelector('{DIALOG}') !== null", 10)
            inside = cdp.js(f"(() => document.querySelector('{DIALOG}').contains(document.activeElement))()")
            assert inside is True  # focus landed IN the dialog on open
            cdp.key("Tab", "Tab", 9)
            inside = cdp.js(f"(() => document.querySelector('{DIALOG}').contains(document.activeElement))()")
            assert inside is True  # the trap keeps the keys while it is open
            cdp.key("Escape", "Escape", 27)
            wait_js(cdp, f"document.querySelector('{DIALOG}') === null", 10)
            back = cdp.js("(() => document.activeElement?.className ?? '')()")
            assert "hb-lib" in back  # the control got its reader back

    def test_the_inline_board_draws_what_it_always_drew(self, door, bundle):
        api, door_url, work = door
        board_id = api.store.save([{"type": "heading", "text": "Untouched"}, {"type": "divider"}], root=work)
        with chrome_page(bundle, board_id, door_url) as p:
            cdp = p.cdp
            drawn(cdp)
            before = cdp.js("document.querySelector('.hb-blocks').innerHTML")
            click(cdp, PIN)
            wait_js(cdp, "document.querySelector('.hb-pin[aria-pressed=\"true\"]') !== null", 10)
            click(cdp, PIN)
            wait_js(cdp, "document.querySelector('.hb-pin[aria-pressed=\"false\"]') !== null", 10)
            after = cdp.js("document.querySelector('.hb-blocks').innerHTML")
            assert before == after  # shelf chrome never reaches inside the board


class TestMotionAndWidth:
    def test_the_shelf_rests_without_motion(self, door, bundle):
        # The harness runs Chrome with --force-prefers-reduced-motion. The gate in blockTag.css sits
        # BELOW the rule that declares the animation (same specificity, later wins), so the
        # resting style of the open overlay is the honest one: no animation at all.
        api, door_url, work = door
        board_id = api.store.save([{"type": "heading", "text": "Quiet"}], root=work)
        api.store.pin(board_id, root=work)
        with chrome_page(bundle, board_id, door_url) as p:
            cdp = p.cdp
            drawn(cdp)
            click(cdp, LIB)
            wait_js(cdp, "document.querySelector('.hb-library-overlay') !== null", 10)
            got = cdp.js("getComputedStyle(document.querySelector('.hb-library-overlay')).animationName")
            assert got == "none", got

    def test_the_shelf_fits_the_narrowest_column(self, door, bundle):
        api, door_url, work = door
        one = api.store.save([{"type": "heading", "text": "A very long saved board title that must wrap"}], root=work)
        two = api.store.save([{"type": "heading", "text": "Short one"}], root=work)
        api.store.pin(two, root=work)
        # the real side-column shape: the headless window floors at 500 px, so the BOARD column is
        # forced to 380 and the dialog hugs the viewport honestly (innerWidth is reported by the probe)
        with chrome_page(bundle, one, door_url, app_style="width:380px") as p:
            cdp = p.cdp
            drawn(cdp)
            click(cdp, PIN)
            wait_js(cdp, "document.querySelector('.hb-pin[aria-pressed=\"true\"]') !== null", 10)
            click(cdp, LIB)
            wait_js(cdp, "document.querySelectorAll('.hb-library-row').length === 2", 10)
            probe = cdp.js("""(() => {
              const d = document.querySelector('.hb-library-dialog');
              const r = d.getBoundingClientRect();
              const out = { innerWidth: window.innerWidth,
                fits: r.left >= 0 && r.right <= window.innerWidth && r.width <= window.innerWidth,
                hScroll: d.scrollWidth <= d.clientWidth + 1,
                tools: 0, clipped: [] };
              for (const row of d.querySelectorAll('.hb-library-row')) {
                const name = row.querySelector('.hb-library-name');
                const rr = row.getBoundingClientRect();
                for (const b of row.querySelectorAll('button')) {
                  const br = b.getBoundingClientRect();
                  if (br.left >= rr.left - 1 && br.right <= rr.right + 1) out.tools++;
                }
                if (name && name.scrollWidth > name.clientWidth + 1) out.clipped.push(name.textContent);
              }
              return out;
            })()""")
            assert probe["innerWidth"] >= 380  # honest about which box is narrow: the 380px column
            assert probe["fits"], probe
            assert probe["hScroll"], probe
            # 2 rows × (open + five tools) = 12 buttons, and EVERY one stayed inside its row's box
            assert probe["tools"] == 12, probe
            assert probe["clipped"] == [], probe  # the long title WRAPS, it never clips

# --- round 2 (review): reopened-board state isolation, and the shelf in a genuinely new chat ---------
#
# Blocking #1 here is proven as DATA, not declaration: two boards with the SAME block shape carry
# DIVERGENT saved states (the same key "1" on both — an accidental shared context shows up as B wearing
# A's ticks). The reopened board must read B's state, write B's state, and leave A's file byte-identical
# while a real pointer taps inside B. The door's own files are the ground truth.
#
# Blocking #2 is proven through the REAL plugin wiring: the page bundles web/src/plugin.tsx itself
# against an @hermes/plugin-sdk stub (esbuild --alias) whose host.composer getter hands the plugin the
# recording composer exactly when each tap happens — the same lookup the shipped bundle performs. The
# stub's area names are the values verified in the shipped Desktop binary (CHAT_EMPTY_AREA === "chat.empty",
# TRANSCRIPT_DIRECTIVE_AREA === "transcript.directives"), and the slot is driven the way the app's own
# chat-empty slot drives its registrations: data.render({sessionId}). A boardless page — no .hb-tag,
# no directive anywhere — must still reach the Library and land the saved board's tag in the new chat.

SDK_STUB = """
export const TRANSCRIPT_DIRECTIVE_AREA = "transcript.directives";
export const CHAT_EMPTY_AREA = "chat.empty";
// The plugin looks host.composer up on EVERY tap (plugin.tsx); a getter hands it the recording
// composer the moment the tap happens — the same seam shape the real app fills with its own composer.
export const host = { get composer() { return globalThis.__composer; } };
"""

SHELF_DRIVER = """
import { createRoot } from "react-dom/client";
import plugin from "./src/plugin";

declare const window: any;
window.__boot = Date.now();
window.__net = [];
const realFetch = window.fetch;
window.fetch = (u: RequestInfo | string, o?: RequestInit) => {
  window.__net.push([String(u), String(o?.method ?? "GET")]);
  return realFetch(u as any, o);
};

const sends: Array<[string, string, string]> = [];
window.__send = sends;
(globalThis as any).__composer = {
  submit: (s: string | null, t: string) => { sends.push(["submit", t, String(s)]); return true; },
  insertText: async (s: string | null, t: string) => { sends.push(["insert", t, String(s)]); return true; },
  focus: (s: string | null) => { sends.push(["focus", "", String(s)]); },
};

const spec = JSON.parse(document.getElementById("spec")!.textContent!);
const door = String(spec.door);
const rest = (path: string, init?: { method?: string; body?: unknown }) =>
  fetch(door + path, {
    method: init?.method,
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  }).then((r) =>
    r.ok ? r.json() : r.text().then((t) => Promise.reject(new Error(`${path} -> ${r.status} ${t}`))));

// THE REAL PLUGIN, registered the way the app registers it: one ctx, two contributions.
const regs: any[] = [];
plugin.register({ register: (r: any) => { regs.push(r); }, rest });
window.__areas = regs.map((r) => String(r.area));
const shelf = regs.find((r) => String(r.area) === "chat.empty");
window.__shelf = Boolean(shelf && typeof shelf.data?.render === "function");

// The empty chat: the host's chat.empty slot draws every registration with {sessionId}. NO board
// directive is mounted anywhere on this page — this is the new chat before its first reply.
createRoot(document.getElementById("app")!).render(shelf.data.render({ sessionId: "new-chat-1" }));
window.__ready = true;
"""


@pytest.fixture(scope="module")
def shelf_bundle():
    """web/src/plugin.tsx and everything it stands, bundled for the browser with the SDK stubbed —
    the real registration code, the real chrome seam, the real dialog, run outside any transcript."""
    if CHROME is None:
        pytest.skip("no Chrome/Chromium binary on this machine")
    if not ESBUILD.exists():
        pytest.skip("web/node_modules not installed — cannot bundle the real components")
    with tempfile.TemporaryDirectory(prefix="shelf-sdk-") as work:
        stub = Path(work) / "sdk-stub.js"
        stub.write_text(SDK_STUB)
        proc = subprocess.run(
            [str(ESBUILD), "--bundle", "--format=iife", "--jsx=automatic", "--loader=tsx",
             "--loader:.css=text", f"--alias:@hermes/plugin-sdk={stub}", "--log-level=warning"],
            input=SHELF_DRIVER, capture_output=True, text=True, timeout=180, cwd=str(ROOT / "web"))
        assert proc.returncode == 0, proc.stderr
        return proc.stdout


def ticks_state(cdp: CDP, scope: str) -> str:
    """The aria-checked column of one board's checkboxes, as drawn in the live page."""
    return cdp.js(f"""(() => {{
      const cs = document.querySelectorAll('{scope} [role="checkbox"]');
      return [...cs].map((c) => c.getAttribute("aria-checked")).join(",");
    }})()""")


class TestReopenStateIsolation:
    """Two distinct boards, same shape, divergent truths: the reopened board answers to ITS id."""

    def test_reopened_board_reads_and_writes_only_its_own_state(self, door, bundle):
        api, door_url, work = door
        twin = [  # heading first: the checklist sits at "1", the form at "2" — keys identical on BOTH boards
            {"type": "heading", "text": "Trip"},
            {"type": "checklist", "title": "Pack", "items": ["Jacket", "Socks", "Passport"]},
            {"type": "form", "title": "Plan it", "submit": "Send",
             "fields": [{"id": "where", "kind": "text", "label": "Where"}]},
        ]
        host_id = api.store.save({"blocks": twin}, root=work)      # A: the board the page stands on
        saved_id = api.store.save({"blocks": twin}, root=work)     # B: the saved twin the shelf reopens
        api.store.pin(saved_id, root=work)
        api.store.save_state(host_id, {"1": [0]}, root=work)  # A: item 0 ticked; its form never sent
        api.store.save_state(saved_id, {
            "1": [1], "2": {"sent": True, "values": {"where": "Hills"}}}, root=work)  # B: other truth
        a_before = (work / f"{host_id}.state.json").read_bytes()

        with chrome_page(bundle, host_id, door_url) as p:
            cdp = p.cdp
            drawn(cdp)

            # The host's own inline board draws A's state first — so any cross-board echo below is loud.
            wait_js(cdp, "(() => { const cs = document.querySelectorAll('.hb-board-host [role=\"checkbox\"]');"
                         " return cs.length === 3 && cs[0].getAttribute('aria-checked') === 'true'; })()", 10)
            assert ticks_state(cdp, ".hb-board-host") == "true,false,false"
            assert cdp.js("document.querySelector('.hb-board-host .hb-form-sent') === null") is True

            click(cdp, LIB)
            open_sel = f'[data-board="{saved_id}"] .hb-library-open'
            wait_js(cdp, f"document.querySelector({json.dumps(open_sel)}) !== null", 10)
            click(cdp, open_sel)
            wait_js(cdp, "document.querySelector('.hb-library-board [role=\"checkbox\"]') !== null", 10)

            # READ isolation, at the same keys: the dialog shows B's ticks, never A's.
            wait_js(cdp, "(() => [...document.querySelectorAll('.hb-library-board [role=\"checkbox\"]')]"
                         ".map((c) => c.getAttribute('aria-checked')).join(','))()"
                         " === 'false,true,false'", 10)
            assert ticks_state(cdp, ".hb-board-host") == "true,false,false"  # A, untouched, still itself
            # B's sent form comes back SENT with its saved answer; A's form stays unsent in the page.
            wait_js(cdp, "document.querySelector('.hb-library-board .hb-form-sent') !== null", 10)
            answer = cdp.js("(() => { const i = document.querySelector('.hb-library-board .hb-input');"
                            " return i ? i.value : null; })()")
            assert answer == "Hills"

            # WRITE isolation by a REAL pointer: a tick inside the reopened board saves B and only B.
            click(cdp, '.hb-library-board [role="checkbox"]', 2)
            wait_js(cdp, "(() => [...document.querySelectorAll('.hb-library-board [role=\"checkbox\"]')]"
                         ".map((c) => c.getAttribute('aria-checked')).join(','))()"
                         " === 'false,true,true'", 10)
            end = time.monotonic() + 10
            while time.monotonic() < end:
                if json.loads((work / f"{saved_id}.state.json").read_text()).get("1") == [1, 2]:
                    break
                time.sleep(0.1)
            assert json.loads((work / f"{saved_id}.state.json").read_text()) == {
                "1": [1, 2], "2": {"sent": True, "values": {"where": "Hills"}}}
            assert (work / f"{host_id}.state.json").read_bytes() == a_before, "the host board's state file moved"
            # and the PAGE asked for exactly one state write — B's.
            puts = [(u[len(door_url):], m) for u, m in cdp.js("window.__net") if m == "PUT"]
            assert puts == [(f"/blocks/{saved_id}/state", "PUT")], puts


class TestNewChatShelf:
    """The genuine flow the shelf was missing: an EMPTY chat — no directive, no board — opens the
    Library from the host-level entry the real plugin.tsx registers, and reattaches a saved board
    into that chat's composer."""

    def test_boardless_page_stands_the_shelf_and_reattaches_to_the_new_chat(self, door, shelf_bundle):
        api, door_url, work = door
        board_id = api.store.save({"blocks": [
            {"type": "heading", "text": "Rent tracker"},
            {"type": "table", "caption": "Budget", "columns": ["Item", "Cost"], "rows": [["Rent", "1400"]]},
        ]}, root=work)
        api.store.pin(board_id, root=work)  # saved the honest way, at the door

        with chrome_page(shelf_bundle, None, door_url) as p:
            cdp = p.cdp
            # The REAL plugin registered both halves, and the chat.empty half is render-shaped.
            assert sorted(cdp.js("window.__areas")) == sorted(["transcript.directives", "chat.empty"])
            assert cdp.js("window.__shelf") is True
            # A boardless page: no transcript drew, no pin stands — only the host-level entry.
            assert cdp.js("document.querySelector('.hb-tag') === null") is True
            wait_js(cdp, "document.querySelector('.hb-lib-entry') !== null", 15)
            assert cdp.js("document.querySelector('.hb-pin') === null") is True
            # an unopened shelf costs the door NOTHING — not one request.
            assert cdp.js("window.__net.length") == 0

            # Keyboard-first: a real Tab reaches the entry, a trusted Enter opens the shelf.
            reached = False
            seen = []
            for _ in range(6):
                cdp.key("Tab", "Tab", 9)
                at = cdp.js("(() => document.activeElement?.className ?? '')()")
                seen.append(at)
                if "hb-lib-entry" in at:
                    reached = True
                    break
            assert reached, seen
            cdp.call("Input.dispatchKeyEvent", type="keyDown", key="Enter", code="Enter",
                     windowsVirtualKeyCode=13, text="\r", unmodifiedText="\r")
            cdp.call("Input.dispatchKeyEvent", type="keyUp", key="Enter", code="Enter",
                     windowsVirtualKeyCode=13)
            wait_js(cdp, f"document.querySelector('{DIALOG}') !== null", 10)
            wait_js(cdp, "document.querySelectorAll('.hb-library-row').length === 1", 10)
            assert "Rent tracker" in shelf_row(cdp, board_id)

            # Sol's confirmations, in the live page: the star speaks its name; the reopen control is a
            # real focusable BUTTON, and a trusted Enter on it reopens the board — keyboard, no mouse.
            star = cdp.js("""(() => { const b = document.querySelector('.hb-library-tools button[aria-pressed]');
              return b ? [b.tagName, b.getAttribute('aria-label')] : null; })()""")
            assert star and star[0] == "BUTTON" and star[1].startswith("Favorite ")
            reached = False
            for _ in range(10):  # the trap cycles the dialog's controls; the open control is one of them
                cdp.key("Tab", "Tab", 9)
                at = cdp.js("(() => document.activeElement?.className ?? '')()")
                if "hb-library-open" in at:
                    reached = True
                    break
            assert reached, "the reopen affordance is not on the keyboard path"
            cdp.call("Input.dispatchKeyEvent", type="keyDown", key="Enter", code="Enter",
                     windowsVirtualKeyCode=13, text="\r", unmodifiedText="\r")
            cdp.call("Input.dispatchKeyEvent", type="keyUp", key="Enter", code="Enter",
                     windowsVirtualKeyCode=13)
            wait_js(cdp, "document.querySelector('.hb-library-board') !== null", 10)
            reopened = cdp.js("document.querySelector('.hb-library-board').textContent")
            assert "Rent tracker" in reopened and "Rent" in reopened and "1400" in reopened  # data, faithfully
            assert cdp.js("document.querySelectorAll('.hb-library-board tbody tr').length") == 1
            click(cdp, '.hb-library-boardhead button[aria-label="Back to Library"]')

            # Reattach: the saved board's OWN reference reaches the new chat, through the real seam —
            # submit on sessionId null, which IS the composer the user is typing in (the new chat here).
            click(cdp, f'[data-board="{board_id}"] button[aria-label^="Add"]')
            wait_js(cdp, "window.__send.some(([k]) => k === 'submit')", 10)
            submitted = [(t, s) for k, t, s in cdp.js("window.__send") if k == "submit"]
            assert submitted == [(f'Saved board “Rent tracker”:\n::blocks{{id="{board_id}"}}', "null")]
            wait_js(cdp, "document.querySelector('.hb-library-attached') !== null", 10)

            # Local-only, still: every ask this new-chat flow made went to the one loopback door — and
            # the shelf wrote nothing: no pin, no organize, no PUT anywhere in the ledger.
            ledger = cdp.js("window.__net")
            assert ledger and all(u.startswith(door_url) for u, _m in ledger), ledger
            assert {m for _u, m in ledger} == {"GET"}, ledger
            # nothing stateful ever reached the board: this new-chat flow was read-and-compose only.
            assert not (work / f"{board_id}.state.json").exists()
