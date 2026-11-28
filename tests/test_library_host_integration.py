# Round-4 verification (t_0559173f, reviewer finding #2; wording corrected per the round-3 contract
# audit and Sol's authority decision, run 1022): the Library reattach in a NEW chat, exercised
# through a FAITHFUL MIRROR of the shipped Hermes Desktop host's plugin pipeline — NOT the actual
# live host seam, and not a recording composer stub. (The round-3 header claimed "the ACTUAL host
# integration seam"; that claim was too strong and is corrected here.)
#
# WHAT IS REAL IN THIS TEST (executed bytes, not transcriptions):
#   - THE FROZEN ARTIFACT: desktop/plugin.js, exact bytes, sha256 asserted below before load.
#   - THE REAL DOOR: core/plugin_api.py over loopback uvicorn — the store + /blocks the plugin talks to.
#   - REAL CHROME: a genuine browser process, genuine keyboard events, a genuine network ledger.
# WHAT IS MIRRORED (function-for-function transcriptions, read out of
# /Applications/Hermes.app/Contents/Resources/app.asar.unpacked/dist/assets/capabilities-CX1W09bd.js
# with offsets quoted in tests/host_harness_r3.tsx): the plugin loader + blob import-map shims
# (NW; PU/FU/LU), the bare-import scanner (wW/OW/kW/AW/jW), the xW-style ctx.register namespacing,
# the ::directive{...} splitter (kI/FI/II/LI) and the yz/bz transcript slot, and the bA/yA composer
# with its null→ACTIVE-session targeting rule. The real SDK object itself cannot be imported here:
# @hermes/plugin-sdk is not an installable package (npm E404; web/package.json deps are empty) but a
# BUILD-TIME EXTERNAL (web/build.mjs) whose implementation lives only inside the running Desktop host
# bundle — per the architect's decision this mirror is the maximal isolated proof (see OUTCOME).
# WHAT REQUIRES LIVE (residual — NOT claimed passed here): the Electron renderer process itself —
# the running host's real SDK namespace installation, the app's real session store, IPC, and the
# model loop. Sol performs a BOUNDED LIVE new-chat acceptance at promotion (after the owner
# restart): open the Library in a genuinely new chat, reattach a saved board, confirm it renders
# into and targets the ACTIVE session.
#
# What this mirror proves TOGETHER (the reviewer's four conditions), in real Chrome:
#   REGISTRATION  — the plugin's own register(ctx) ran against the mirror's host-shaped ctx; the
#                   shelf and the transcript directive appear in the registry under the
#                   plugin-namespaced ids the mirrored xW applies ("hermes-genui:hermes-genui-shelf"
#                   in chat.empty, "...-tag" in transcript.directives) — nobody hand-invoked a render.
#   TARGETING     — host.composer.submit(null, text) resolves to the ACTIVE session through the
#                   mirrored bA rule; switching the active session switches where the text lands,
#                   and the other session's transcript is asserted untouched.
#   RECEIPT       — the reattached ::blocks reference ENTERS the session's transcript model: the
#                   exact text `Saved board “Rent tracker”:\n::blocks{id="<id>"}` is in that
#                   session's messages list (the mirror's host state, read back through window).
#   RENDER        — the transcript draws messages through the mirrored directive splitter, which
#                   finds the plugin's OWN transcript-directive registration by data.name and
#                   renders it — so the saved board comes back as real .hb-blocks in the new chat,
#                   fetched through the mirrored ctx.rest against the REAL loopback door.
from __future__ import annotations

import hashlib
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
    CDP, ESBUILD, _devtools_port, _page_socket, real_click, wait_js,
)
from test_layout_alignment import CHROME  # noqa: E402

WINDOW_W, WINDOW_H = 1100, 820
BUNDLE_SHA256 = "3883e550b7bc3871a081a7c50d0ef420f277dd5f76653e6565b8f4b9fb6df18d"  # #9 round-7 rebuild —
# edit-time identity filing (blockState door "identity" + forgetBlock that destroys nothing) changed the
# host bundle; the mirror loads THE frozen bundle of this tree (round-6's 6a2efc63… predates the unification;
# round-5's 0e37f819… predates the headless-update walk; #8's 22cec44c… predates the adaptive renderer)


@pytest.fixture
def door():
    """The REAL plugin_api.py served over loopback on a fresh tmp store — same as the Library suite."""
    work = Path(tempfile.mkdtemp(prefix="hostdoor-"))
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


@pytest.fixture(scope="module")
def harness_js():
    """tests/host_harness_r3.tsx bundled for the browser. The temp file sits INSIDE web/ so esbuild
    resolves react and react-dom from web/node_modules exactly the way the plugin build does; the
    harness's own bundled React is what it hands the loader as globalThis.__HERMES_REACT__, so the
    plugin under test renders with the SAME module instance the host mirror does (mirroring shipped
    NU/FU)."""
    if CHROME is None:
        pytest.skip("no Chrome/Chromium binary on this machine")
    if not ESBUILD.exists():
        pytest.skip("web/node_modules not installed — cannot bundle the real components")
    src = (ROOT / "tests" / "host_harness_r3.tsx").read_text()
    with tempfile.TemporaryDirectory(prefix="r3-harness-", dir=str(ROOT / "web")) as work:
        entry = Path(work) / "harness.tsx"
        entry.write_text(src)
        proc = subprocess.run(
            [str(ESBUILD), "--bundle", "--format=iife", "--jsx=automatic", "--loader:.tsx=tsx",
             "--log-level=warning", str(entry.relative_to(ROOT / "web"))],
            capture_output=True, text=True, timeout=180, cwd=str(ROOT / "web"))
        assert proc.returncode == 0, proc.stderr
        return proc.stdout


@contextmanager
def host_page(harness: str, door_url: str, plugin_src: str):
    """A real Chrome on a page that carries the harness + the FROZEN artifact as bytes."""
    with tempfile.TemporaryDirectory() as work:
        (Path(work) / "driver.js").write_text(harness)
        page = Path(work) / "probe.html"
        spec = json.dumps({"door": door_url}).replace("</", "<\\/")
        blob = json.dumps(plugin_src).replace("</", "<\\/")
        page.write_text(
            "<!doctype html><html><head><meta charset='utf-8'></head><body style='margin:0'>"
            "<div id='app'></div>"
            f"<script id='spec' type='application/json'>{spec}</script>"
            f"<script id='plugin-src' type='application/json'>{blob}</script>"
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
            port = _devtools_port(profile)
            cdp = CDP(*_page_socket(port))
            wait_js(cdp, "window.__ready === true", 30)
            yield cdp
        finally:
            if cdp:
                try:
                    cdp.close()
                except Exception:
                    pass
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()


def click(cdp: CDP, selector: str, index: int = 0):
    rect = f"document.querySelectorAll('{selector}')[{index}].getBoundingClientRect()"
    return real_click(cdp, rect)


def pane_js(session: str, inner: str) -> str:
    """A selector INSIDE one session's pane — the mirror's chat surfaces are addressed by session."""
    return f".hh-pane[data-session=\"{session}\"] {inner}"


class TestFrozenArtifactLoadsThroughTheShippedLoader:
    """Conditions 1–2 in their bare form: the artifact itself passes the app's own loader, and its
    register(ctx) lands BOTH contributions in the registry under the ids xW applies."""

    def test_the_bundle_itself_registers_through_the_host_pipeline(self, door, harness_js):
        api, door_url, work = door
        board_id = api.store.save({"blocks": [
            {"type": "heading", "text": "Rent tracker"},
            {"type": "table", "caption": "Budget", "columns": ["Item", "Cost"], "rows": [["Rent", "1400"]]},
        ]}, root=work)
        api.store.pin(board_id, root=work)

        plugin_src = (ROOT / "desktop" / "plugin.js").read_text()
        assert hashlib.sha256(plugin_src.encode()).hexdigest() == BUNDLE_SHA256  # THE frozen bytes

        with host_page(harness_js, door_url, plugin_src) as cdp:
            assert cdp.js("window.__loadError ?? null") is None
            assert cdp.js("window.__loaded") is True
            assert cdp.js("window.__pluginId") == "hermes-genui"
            regs = cdp.js("window.__registrations")
            ids = sorted(r["id"] for r in regs)
            assert ids == ["hermes-genui:hermes-genui-shelf", "hermes-genui:hermes-genui-tag"], ids
            areas = {r["id"]: r["area"] for r in regs}
            assert areas["hermes-genui:hermes-genui-tag"] == "transcript.directives"
            assert areas["hermes-genui:hermes-genui-shelf"] == "chat.empty"
            # the empty chat is the mirror host's chat.empty slot: the plugin's own registration drew
            # the entry into the CURRENT session pane — nobody hand-invoked render.
            wait_js(cdp, "document.querySelector('.hh-pane[data-session=\"chat-new\"] .hb-lib-entry') !== null", 15)
            assert cdp.js("document.querySelectorAll('.hh-directive').length") == 0
            assert cdp.js("window.__net.length") == 0  # an unopened shelf costs the door nothing


class TestReattachReachesAndRendersInTheNewChat:
    """The named journey, through the host mirror: keyboard-open the shelf in a BOARDLESS new chat,
    reattach, and the saved board arrives in that chat's transcript as a REAL rendered board."""

    def test_reattach_lands_in_the_active_session_and_renders(self, door, harness_js):
        api, door_url, work = door
        board_id = api.store.save({"blocks": [
            {"type": "heading", "text": "Rent tracker"},
            {"type": "table", "caption": "Budget", "columns": ["Item", "Cost"], "rows": [["Rent", "1400"]]},
        ]}, root=work)
        api.store.pin(board_id, root=work)
        plugin_src = (ROOT / "desktop" / "plugin.js").read_text()

        with host_page(harness_js, door_url, plugin_src) as cdp:
            # keyboard into the entry (Tab + trusted Enter), opening the shelf via the mirror host's
            # own chrome
            reached = False
            for _ in range(8):
                cdp.key("Tab", "Tab", 9)
                if "hb-lib-entry" in (cdp.js("(() => document.activeElement?.className ?? '')()") or ""):
                    reached = True
                    break
            assert reached, "the host-slot entry is not on the keyboard path"
            cdp.call("Input.dispatchKeyEvent", type="keyDown", key="Enter", code="Enter",
                     windowsVirtualKeyCode=13, text="\r", unmodifiedText="\r")
            cdp.call("Input.dispatchKeyEvent", type="keyUp", key="Enter", code="Enter",
                     windowsVirtualKeyCode=13)
            wait_js(cdp, "document.querySelector('.hb-library-dialog') !== null", 10)
            wait_js(cdp, "document.querySelectorAll('.hb-library-row').length === 1", 10)

            # REATTACH by a real pointer tap
            click(cdp, f'.hb-library-row[data-board="{board_id}"] button[aria-label^="Add"]')

            # RECEIPT: the mirror host's transcript model, read back through the harness — the exact
            # board reference entered chat-new's message list. Not a recorder: this is the state
            # the mirror's component tree renders FROM.
            want = f'Saved board “Rent tracker”:\n::blocks{{id="{board_id}"}}'
            cdp.js(f"window.__want = {json.dumps(want)};")
            wait_js(cdp, "(() => { const s = window.__hostSessions().find((x) => x.id === 'chat-new');"
                         " return Boolean(s && s.messages.length === 1 && s.messages[0] === window.__want); })()", 10)

            # RENDER: the transcript drew the message through the host's directive splitter, which
            # found the plugin's OWN transcript.directives registration by data.name — the saved
            # board stands in the new chat as real blocks, fetched over the real door.
            wait_js(cdp, f"document.querySelector('{pane_js('chat-new', '.hh-directive .hb-blocks')}') !== null", 15)
            drawn = cdp.js(f"document.querySelector('{pane_js('chat-new', '.hh-directive')}').textContent")
            assert "Rent tracker" in drawn and "Rent" in drawn and "1400" in drawn
            assert cdp.js(f"document.querySelector('{pane_js('chat-new', '.hh-directive .hb-table tbody tr')}')"
                          " !== null") is True

            # TARGETING: the OTHER chat never received anything.
            old = cdp.js("(() => { const s = window.__hostSessions().find((x) => x.id === \"chat-old\");"
                         " return s.messages.length; })()")
            assert old == 0
            assert cdp.js("document.querySelectorAll('.hh-pane[data-session=\"chat-old\"] .hh-directive').length") == 0

            # Close the shelf, switch the ACTIVE chat the way a user clicks one, and reattach again:
            # it lands in chat-old NOW. bA's null-target followed the switch — chat-new gained nothing.
            cdp.call("Input.dispatchKeyEvent", type="keyDown", key="Escape", code="Escape",
                     windowsVirtualKeyCode=27)
            wait_js(cdp, "document.querySelector('.hb-library-dialog') === null", 10)
            click(cdp, '.hh-session[data-session="chat-old"]')
            wait_js(cdp, "document.querySelector('.hh-pane[data-session=\"chat-old\"][data-active=\"1\"]') !== null", 5)
            click(cdp, '.hh-pane[data-session="chat-old"] .hb-lib-entry')
            wait_js(cdp, "document.querySelector('.hb-library-dialog') !== null", 10)
            wait_js(cdp, "document.querySelectorAll('.hb-library-row').length === 1", 10)
            click(cdp, f'.hb-library-row[data-board="{board_id}"] button[aria-label^="Add"]')
            end = time.monotonic() + 15
            while time.monotonic() < end:
                if cdp.js("(() => { const s = window.__hostSessions().find((x) => x.id === \"chat-old\");"
                          " return s.messages.length === 1; })()") is True:
                    break
                time.sleep(0.2)
            assert cdp.js("(() => { const s = window.__hostSessions().find((x) => x.id === \"chat-old\");"
                          " return s.messages.length; })()") == 1
            assert cdp.js("(() => { const s = window.__hostSessions().find((x) => x.id === \"chat-new\");"
                          " return s.messages.length; })()") == 1
            wait_js(cdp, f"document.querySelector('{pane_js('chat-old', '.hh-directive .hb-blocks')}') !== null", 15)

            # LOCAL-ONLY, through the host mirror too: every ask went to the one loopback door.
            ledger = cdp.js("window.__net")
            assert ledger and all(u.startswith(door_url) for u, _m in ledger), ledger
            # and a rendered reattach READS the board through ctx.rest — the board GET is there
            gets = [u[len(door_url):] for u, m in ledger if m == "GET"]
            assert f"/blocks/{board_id}" in gets, gets
            # a read-and-compose flow must not WRITE at the door: no PUT anywhere in the ledger
            puts = [u for u, m in ledger if m == "PUT"]
            assert puts == [], puts
