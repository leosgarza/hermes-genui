# Real-browser witness for Living Boards v1 (t_7d60a6a6, enhancement #9).
#
# What only a living browser can prove, on the FROZEN src components over the REAL local door:
#  · ONE live view per address: when a second tag of the same address arrives (the model's update turn pastes
#    the same tag), the page gains NO second board subtree — the one .hb-blocks element is the SAME element
#    (identity witnessed across the update), its calculator's typed value survives (no remount), and the
#    second tag position draws a pointer instead;
#  · the update is a layout/state change of that same subtree: v1's words are gone, v2's arrived, the row
#    under the board says v2 and names the address;
#  · reach-back: the archived v1 answers GET /blocks/{id}?version=1 and redraws IN PLACE (same element);
#    a link chip fetches a prior Library board by address and draws it connected below — real geometry,
#    everything inside the window, only the door ever asked (window.__net witnesses every fetch);
#  · negative controls: a linked address that is not on this machine says so quietly and draws nothing fake.
# The suite runs with --force-prefers-reduced-motion; the new row ships no animation of its own, so motion
# honesty is structural (nothing to still), witnessed by the resting-state reads below.
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

WINDOW_W, WINDOW_H = 1100, 900

CALC = {"type": "calculator", "sliders": [{"name": "p", "title": "Loan", "max": 1000, "value": 400}],
        "results": [{"label": "Half", "formula": "p / 2"}]}
HEAD = {"type": "heading", "text": "Portfolio · Q4"}
TEXT = {"type": "text", "text": "three holdings, all up"}
NVDA = {"type": "text", "text": "plus NVDA up 34%"}
Q3HEAD = {"type": "heading", "text": "Portfolio · Q3"}
Q3 = {"type": "text", "text": "Q3 closed +5.0%"}


# --- the real door ------------------------------------------------------------------------------------------------


@pytest.fixture
def door():
    """plugin_api.py really served over a loopback port on a tmp store — the same code the Dashboard runs."""
    work = Path(tempfile.mkdtemp(prefix="living-door-"))
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
        yield api, port, work
    finally:
        server.should_exit = True
        thread.join(timeout=10)


# --- the driver: two tag positions, the second opens on word (a new turn arriving) ----------------------------------


DRIVER = r"""
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { BlockTag } from "./src/host/BlockTag";
import { BlockActions, composerActions } from "./src/host/actions";

declare const window: any;
window.__net = [];
const realFetch = window.fetch;
window.fetch = (u: RequestInfo | string, o?: RequestInit) => {
  window.__net.push([String(u), String(o?.method ?? "GET")]);
  return realFetch(u as any, o);
};
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

const tag = (rootId: string, id: string) => {
  const el = document.getElementById(rootId)!;
  createRoot(el).render(
    createElement(BlockActions.Provider, { value: { ...actions, rest } },
      createElement(BlockTag, { id, streaming: false, load })));
};
tag("app-a", spec.live);
// a later message quoting the SAME address arrives: the live turn lands it exactly like the app would.
window.__openUpdate = (id: string) => tag("app-b", id);
window.__ready = true;
"""


@pytest.fixture(scope="module")
def bundle():
    if CHROME is None:
        pytest.skip("no Chrome/Chromium binary on this machine")
    proc = subprocess.run(
        [str(ESBUILD), "--bundle", "--format=iife", "--jsx=automatic", "--loader=tsx",
         "--log-level=warning"],
        input=DRIVER, capture_output=True, text=True, timeout=180, cwd=str(ROOT / "web"))
    assert proc.returncode == 0, proc.stderr
    return proc.stdout


@contextmanager
def living_page(bundle_js: str, door_url: str, live_id: str):
    with tempfile.TemporaryDirectory() as work:
        (Path(work) / "driver.js").write_text(bundle_js)
        page = Path(work) / "probe.html"
        spec = json.dumps({"door": door_url, "live": live_id}).replace("</", "<\\/")
        css = "\n".join(p.read_text() for p in CSS)
        page.write_text(
            "<!doctype html><html><head><meta charset='utf-8'>"
            f"<style>{css}</style></head><body style='margin:0'>"
            "<div id='app-a' style='padding:16px'></div><div id='app-b' style='padding:16px'></div>"
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


def board_rect(cdp: CDP) -> dict:
    return cdp.js("(() => { const r = document.querySelector('#app-a .hb-blocks')"
                  ".getBoundingClientRect(); return {top: r.top, bottom: r.bottom, "
                  "left: r.left, right: r.right}; })()")


# --- the living update ---------------------------------------------------------------------------------------------


def test_update_quoting_the_same_address_moves_no_second_board(door, bundle):
    api, port, work = door
    door_url = f"http://127.0.0.1:{port}"
    live = api.store.save([CALC, HEAD, TEXT], root=work)

    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        # the reader has the calculator half-touched, in the REAL input, through a REAL input event
        cdp.js("""(() => { const el = document.querySelector('#app-a input[type=range]');
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          set.call(el, '777'); el.dispatchEvent(new Event('input', { bubbles: true })); })()""")
        typed = cdp.js("document.querySelector('#app-a input[type=range]').value")
        assert typed not in ("400", "")  # the reader really moved it (the app settles it to its own step)
        # witness the one live element by identity, and mark it where only THAT node carries the mark
        cdp.js("window.__mark = document.querySelector('#app-a .hb-blocks'); window.__mark.__seen = 1;")

        # the model updates the SAME address server-side... then its new turn pastes the SAME tag
        api.store.update(live, [CALC, HEAD, TEXT, NVDA], root=work)
        cdp.js(f"window.__openUpdate({json.dumps(live)})")

        wait_js(cdp, "document.querySelector('#app-a .hb-blocks')?.__seen === 1"
                     " && document.body.innerText.includes('plus NVDA')", 20)
        # ONE subtree for the address, and it is THE same element: identity, mark, and typed state all ride
        assert cdp.js("document.querySelectorAll('.hb-blocks').length") == 1
        assert cdp.js("document.querySelector('.hb-blocks') === window.__mark") is True
        assert cdp.js("document.querySelector('#app-a input[type=range]').value") == typed
        # the update moved into the same subtree: v2's words are in, the row says v2 and names the address
        assert cdp.js("document.querySelector('#app-a .hb-blocks').innerText.includes('plus NVDA')") is True
        assert cdp.js("document.querySelector('#app-a .hb-live').innerText.includes('v2')") is True
        assert cdp.js(f"document.querySelector('#app-a .hb-live-addr').innerText === '#{live}'") is True
        # the second position draws the pointer, never a board
        assert cdp.js("document.querySelector('#app-b .hb-blocks') === null") is True
        assert cdp.js("document.querySelector('#app-b .hb-live-pointer') !== null") is True
        # geometry: the pointer is a real, readable line inside the window
        p = cdp.js("(() => { const r = document.querySelector('#app-b .hb-live-pointer')"
                   ".getBoundingClientRect(); return {w: r.width, h: r.height, top: r.top}; })()")
        assert p["w"] > 150 and p["h"] > 10 and p["top"] < WINDOW_H  # readable, never a clipped thread
        hosts = {u.split("/")[2] for u, _m in cdp.js("window.__net")}
        assert hosts == {f"127.0.0.1:{port}"}  # the door, and nothing else, was ever asked


def test_update_that_shifts_blocks_carries_typed_state_on_the_same_elements(door, bundle):
    # review round 1, defect 1, in a living browser: an update that INSERTS a heading before the
    # calculator and REORDERS the rest must keep the half-dragged slider and the clicked tick on the
    # very same DOM elements — not merely the same .hb-blocks container. Positional React keys remount
    # any block whose slot moved; identity must speak the block's own words.
    api, port, work = door
    door_url = f"http://127.0.0.1:{port}"
    check = {"type": "checklist", "title": "Pack", "items": [{"text": "Rope"}, {"text": "Tent"}]}
    live = api.store.save([CALC, check, HEAD, TEXT], root=work)

    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        cdp.js("""(() => { const el = document.querySelector('#app-a input[type=range]');
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          set.call(el, '777'); el.dispatchEvent(new Event('input', { bubbles: true })); })()""")
        typed = cdp.js("document.querySelector('#app-a input[type=range]').value")
        assert typed not in ("400", "")  # the reader really moved it
        real_click(cdp, "document.querySelectorAll('#app-a button[role=checkbox]')[1]"
                        ".getBoundingClientRect()")
        wait_js(cdp, "document.querySelectorAll('#app-a button[role=checkbox]')[1]"
                     ".classList.contains('hb-check-on')", 20)
        # witness the two LIVE elements by identity — a remount could not survive these marks
        cdp.js("window.__inp = document.querySelector('#app-a input[type=range]');"
               " window.__inp.__seen = 1;"
               " window.__chk = document.querySelectorAll('#app-a button[role=checkbox]')[1];"
               " window.__chk.__seen = 1;")

        # v2: a heading inserted BEFORE the calculator; everything else permutes behind the insert
        api.store.update(live, [HEAD, CALC, NVDA, check, TEXT], root=work)
        cdp.js(f"window.__openUpdate({json.dumps(live)})")
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks').innerText.includes('plus NVDA')", 20)
        assert cdp.js("document.querySelectorAll('.hb-blocks').length") == 1
        assert cdp.js("document.querySelector('#app-a input[type=range]') === window.__inp") is True
        assert cdp.js(f"window.__inp.__seen === 1 && window.__inp.value === {json.dumps(typed)}") is True
        assert cdp.js("document.querySelectorAll('#app-a button[role=checkbox]')[1] === window.__chk") is True
        assert cdp.js("window.__chk.__seen === 1 && window.__chk.classList.contains('hb-check-on')") is True
        # the tick's word under the checklist is still honest, and the door was the only host asked
        assert cdp.js("document.querySelector('#app-a .hb-checklist-count').innerText === '1 of 2 done'") is True
        hosts = {u.split("/")[2] for u, _m in cdp.js("window.__net")}
        assert hosts == {f"127.0.0.1:{port}"}


def test_nested_update_inside_a_container_carries_typed_state(door, bundle):
    # review round 2, defect 1, in a living browser: a calculator INSIDE a tabs panel and a checklist
    # cell must keep the very elements the reader touched when the update only changes a sibling's
    # words, and an insertion inside a columns container must not remount what it sits beside. A
    # container keyed by its whole content re-keys the entire subtree the moment one child moves —
    # the flat top-level shift tests cannot see this because the parent's own key is what changes.
    api, port, work = door
    door_url = f"http://127.0.0.1:{port}"
    tabs = {"type": "tabs", "tabs": [
        {"label": "Holdings", "children": [CALC, TEXT]},
        {"label": "Notes", "children": [HEAD]},
    ]}
    cols = {"type": "columns", "children": [
        {"type": "checklist", "title": "Pack", "items": [{"text": "Rope"}, {"text": "Tent"}]}, TEXT]}
    live = api.store.save([tabs, cols], root=work)

    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        cdp.js("""(() => { const el = document.querySelector('#app-a input[type=range]');
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          set.call(el, '777'); el.dispatchEvent(new Event('input', { bubbles: true })); })()""")
        typed = cdp.js("document.querySelector('#app-a input[type=range]').value")
        assert typed not in ("400", "")  # the reader really moved the nested slider
        real_click(cdp, "document.querySelectorAll('#app-a button[role=checkbox]')[1]"
                        ".getBoundingClientRect()")
        wait_js(cdp, "document.querySelectorAll('#app-a button[role=checkbox]')[1]"
                     ".classList.contains('hb-check-on')", 20)
        cdp.js("window.__inp = document.querySelector('#app-a input[type=range]');"
               " window.__inp.__seen = 1;"
               " window.__chk = document.querySelectorAll('#app-a button[role=checkbox]')[1];"
               " window.__chk.__seen = 1;")

        # v2: ONLY a sibling's words change inside the tabs panel, and a heading is inserted inside
        # the columns container beside the live checklist.
        tabs2 = {"type": "tabs", "tabs": [
            {"label": "Holdings", "children": [CALC, NVDA]},
            {"label": "Notes", "children": [HEAD]},
        ]}
        cols2 = {"type": "columns", "children": [HEAD, cols["children"][0], TEXT]}
        api.store.update(live, [tabs2, cols2], root=work)
        cdp.js(f"window.__openUpdate({json.dumps(live)})")
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks').innerText.includes('plus NVDA')", 20)
        assert cdp.js("document.querySelectorAll('.hb-blocks').length") == 1
        # the nested calculator: same element, still dragged, the sibling's new words drawn beside it
        assert cdp.js("document.querySelector('#app-a input[type=range]') === window.__inp") is True
        assert cdp.js(f"window.__inp.__seen === 1 && window.__inp.value === {json.dumps(typed)}") is True
        # the checklist in the container whose child list GREW: same element, still ticked
        chk = cdp.js("""(() => { const n = document.querySelectorAll('#app-a button[role=checkbox]')[1];
          return n === window.__chk && n.__seen === 1 && n.classList.contains('hb-check-on'); })()""")
        assert chk is True
        # the inserted heading really landed inside the columns, in its own column cell
        assert cdp.js("document.querySelectorAll('#app-a .hb-column').length") == 3
        assert cdp.js("document.querySelector('#app-a .hb-column').innerText.includes('Portfolio')") is True
        hosts = {u.split("/")[2] for u, _m in cdp.js("window.__net")}
        assert hosts == {f"127.0.0.1:{port}"}


# --- reach-back into the board's own history ------------------------------------------------------------------------


def test_reach_back_redraws_the_old_version_in_the_same_element(door, bundle):
    api, port, work = door
    door_url = f"http://127.0.0.1:{port}"
    live = api.store.save([HEAD, TEXT], root=work)
    api.store.update(live, [HEAD, TEXT, NVDA], root=work)

    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-live-history') !== null", 20)
        cdp.js("window.__mark = document.querySelector('.hb-blocks'); 1;")
        real_click(cdp, "document.querySelector('#app-a .hb-live-history').getBoundingClientRect()")
        wait_js(cdp, "document.querySelector('.hb-blocks').innerText.includes('three holdings')"
                     " && !document.querySelector('.hb-blocks').innerText.includes('plus NVDA')", 20)
        assert cdp.js("document.querySelector('.hb-blocks') === window.__mark") is True  # same element
        assert cdp.js("document.querySelector('#app-a .hb-live').innerText.includes('viewing v1')") is True
        # back to the current version: still the one element, v2's words return
        real_click(cdp, "document.querySelector('#app-a .hb-live-back').getBoundingClientRect()")
        wait_js(cdp, "document.querySelector('.hb-blocks').innerText.includes('plus NVDA')", 20)
        assert cdp.js("document.querySelectorAll('.hb-blocks').length") == 1


# --- reach-back to ANOTHER board: the link renders from the door ----------------------------------------------------


def test_link_opens_the_prior_board_connected_below(door, bundle):
    api, port, work = door
    door_url = f"http://127.0.0.1:{port}"
    q3 = api.store.save([Q3HEAD, Q3], root=work)
    live = api.store.save({"blocks": [HEAD, TEXT], "links": [{"id": q3, "note": "last quarter"},
                                                             {"id": "dead0000"}]}, root=work)

    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelectorAll('#app-a .hb-link-chip').length === 2", 20)
        chips = cdp.js("Array.from(document.querySelectorAll('#app-a .hb-link-chip')).map(b => b.innerText)")
        assert chips[0] == "last quarter"
        real_click(cdp, "document.querySelectorAll('#app-a .hb-link-chip')[0].getBoundingClientRect()")
        wait_js(cdp, "document.querySelector('#app-a .hb-linked') !== null"
                     " && document.querySelector('#app-a .hb-linked').innerText.includes('Portfolio · Q3')", 20)
        panel = cdp.js("(() => { const r = document.querySelector('#app-a .hb-linked')"
                       ".getBoundingClientRect(); return {top: r.top, bottom: r.bottom, h: r.height}; })()")
        top = board_rect(cdp)
        assert panel["top"] >= top["top"]          # connected below the current board, as one read
        assert panel["bottom"] - panel["top"] > 30  # it really drew the prior board (a heading and its line)
        words = cdp.js("document.querySelector('#app-a .hb-linked').innerText")
        assert "Portfolio · Q3" in words and "Q3 closed +5.0%" in words
        # the data AND the address: the panel names the board it fetched, and the fetch went to the door only
        assert q3 in cdp.js("document.querySelector('#app-a .hb-linked code').innerText")
        gets = [u for u, m in cdp.js("window.__net") if m == "GET"]
        assert any(u.endswith(f"/blocks/{q3}") for u in gets)
        hosts = {u.split("/")[2] for u, _m in cdp.js("window.__net")}
        assert hosts == {f"127.0.0.1:{port}"}
        # negative control: a linked address this machine does not have says so quietly, and draws nothing
        real_click(cdp, "document.querySelectorAll('#app-a .hb-link-chip')[1].getBoundingClientRect()")
        wait_js(cdp, "document.querySelector('#app-a .hb-linked-gone') !== null", 20)
        assert cdp.js("document.querySelectorAll('#app-a .hb-linked:not(.hb-linked-gone)').length") == 1


def test_unsaid_board_grows_no_living_dom(door, bundle):
    api, port, work = door
    door_url = f"http://127.0.0.1:{port}"
    plain = api.store.save([HEAD, TEXT], root=work)
    with living_page(bundle, door_url, plain) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        assert cdp.js("document.querySelector('#app-a .hb-live') === null") is True
        html = cdp.js("document.querySelector('#app-a').innerHTML")
        assert "hb-live" not in html and "hb-link" not in html


def test_placement_word_flip_wraps_and_unwraps_the_same_live_element(door, bundle):
    # review round 3, defect 1, in a living browser: asking the LIVE calculator to sit centered and
    # then asking it back must be class changes on stable elements — the half-dragged slider rides
    # through BOTH transitions on the very same input, and the centered card is really centered.
    api, port, work = door
    door_url = f"http://127.0.0.1:{port}"
    live = api.store.save([CALC, HEAD, TEXT], root=work)
    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        cdp.js("""(() => { const el = document.querySelector('#app-a input[type=range]');
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          set.call(el, '777'); el.dispatchEvent(new Event('input', { bubbles: true })); })()""")
        typed = cdp.js("document.querySelector('#app-a input[type=range]').value")
        assert typed not in ("400", "")
        cdp.js("window.__inp = document.querySelector('#app-a input[type=range]'); window.__inp.__seen = 1;")

        # wrap: the model asks for center (the sibling text changes so the new version is undeniable)
        api.store.update(live, [{**CALC, "align": "center"}, HEAD, NVDA], root=work)
        cdp.js(f"window.__openUpdate({json.dumps(live)})")
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks').innerText.includes('plus NVDA')", 20)
        assert cdp.js("document.querySelector('#app-a input[type=range]') === window.__inp") is True
        assert cdp.js(f"window.__inp.__seen === 1 && window.__inp.value === {json.dumps(typed)}") is True
        centered = cdp.js("""(() => { const p = document.querySelector('#app-a .hb-place-center');
          if (!p || p.getAttribute('data-align') !== 'center') return null;
          const b = document.querySelector('#app-a .hb-blocks').getBoundingClientRect();
          const c = p.firstElementChild.getBoundingClientRect();
          return { fill: Math.abs(p.getBoundingClientRect().width - b.width) <= 1,
                   l: Math.round(c.left - b.left), r: Math.round(b.right - c.right) }; })()""")
        assert centered and centered["fill"] and centered["l"] > 50, f"center ask not drawn: {centered}"
        assert abs(centered["l"] - centered["r"]) <= 1  # actually centered in the column

        # unwrap: back to the plain ask — the same element, still dragged, the box gone
        api.store.update(live, [CALC, HEAD, {**TEXT, "text": "loose again"}], root=work)
        cdp.js(f"window.__openUpdate({json.dumps(live)})")
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks').innerText.includes('loose again')", 20)
        assert cdp.js("document.querySelector('#app-a input[type=range]') === window.__inp") is True
        assert cdp.js(f"window.__inp.__seen === 1 && window.__inp.value === {json.dumps(typed)}") is True
        assert cdp.js("document.querySelector('#app-a .hb-place-center') === null") is True
        hosts = {u.split("/")[2] for u, _m in cdp.js("window.__net")}
        assert hosts == {f"127.0.0.1:{port}"}


def test_twin_section_swap_carries_the_nested_slider_in_the_real_browser(door, bundle):
    # review round 3, defect 2, in a living browser: two sections that say the same title swap slots
    # and one sibling text changes — the calculator's card is a logically retained container, so the
    # slider AND its card element ride through the swap; the card has moved, not remounted.
    api, port, work = door
    door_url = f"http://127.0.0.1:{port}"
    sec = lambda *kids: {"type": "section", "title": "Same", "children": list(kids)}  # noqa: E731
    live = api.store.save([sec(CALC), sec(TEXT)], root=work)
    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        cdp.js("""(() => { const el = document.querySelector('#app-a input[type=range]');
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          set.call(el, '777'); el.dispatchEvent(new Event('input', { bubbles: true })); })()""")
        typed = cdp.js("document.querySelector('#app-a input[type=range]').value")
        assert typed not in ("400", "")
        cdp.js("window.__inp = document.querySelector('#app-a input[type=range]');"
               " window.__inp.__seen = 1;"
               " window.__sec = document.querySelector('#app-a .hb-section');"  # v1's calc card is first
               " window.__sec.__seen = 1;")

        api.store.update(live, [sec(NVDA), sec(CALC)], root=work)
        cdp.js(f"window.__openUpdate({json.dumps(live)})")
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks').innerText.includes('plus NVDA')", 20)
        assert cdp.js("document.querySelectorAll('#app-a .hb-section').length") == 2
        assert cdp.js("document.querySelector('#app-a input[type=range]') === window.__inp") is True
        assert cdp.js(f"window.__inp.__seen === 1 && window.__inp.value === {json.dumps(typed)}") is True
        # the SAME card element now sits second and still holds the live slider
        assert cdp.js("""(() => { const secs = document.querySelectorAll('#app-a .hb-section');
          return secs[1] === window.__sec && secs[1].__seen === 1
            && secs[1].contains(window.__inp); })()""") is True
        assert cdp.js("""document.querySelectorAll('#app-a .hb-section')[0].innerText.includes('plus NVDA')""") is True
        hosts = {u.split("/")[2] for u, _m in cdp.js("window.__net")}
        assert hosts == {f"127.0.0.1:{port}"}


def test_cross_container_move_restores_dragged_state_from_the_board(door, bundle):
    # review round 5, case 1, in a living browser: an update that MOVES the calculator from section A
    # into section B reparents it — React cannot carry a DOM node across parents, so the element is
    # rebuilt there. By Sol's round-5 disposition the ANSWER lives on the BOARD: the fresh mount must
    # restore the dragged value (and the door ends up holding it filed by identity, not by path).
    api, port, work = door
    door_url = f"http://127.0.0.1:{port}"

    def section(t, child):
        return {"type": "section", "title": t, "children": [child]}

    live = api.store.save([section("A", CALC), section("B", TEXT)], root=work)

    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        cdp.js("""(() => { const el = document.querySelector('#app-a input[type=range]');
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          set.call(el, '777'); el.dispatchEvent(new Event('input', { bubbles: true })); })()""")
        typed = cdp.js("document.querySelector('#app-a input[type=range]').value")
        assert typed not in ("400", "")  # the reader really moved it
        # the surviving card the calculator moves INTO, witnessed by identity across the move
        cdp.js("window.__b = document.querySelectorAll('#app-a .hb-section')[1]; window.__b.__seen = 1;")

        api.store.update(live, [section("A", NVDA), section("B", CALC)], root=work)
        cdp.js(f"window.__openUpdate({json.dumps(live)})")
        wait_js(cdp, "document.querySelectorAll('#app-a .hb-section')[1]"
                     "?.contains(document.querySelector('#app-a input[type=range]'))", 20)
        after = cdp.js("document.querySelector('#app-a input[type=range]').value")
        assert after == typed, f"the moved calculator lost its drag: {after} != {typed}"  # RED pre-fix: 400
        # the whole card redraws in its new home and the results work from the RESTORED value:
        # the shown Half equals (dragged ÷ 2), the calculator's own formula, honest to the reader's answer
        half = cdp.js("""(() => { const t = document.querySelector('#app-a .hb-calc-result-value').innerText;
          const n = parseFloat(t.replace(/[^0-9.\\-]/g, "")); return Number.isFinite(n) ? n : -1; })()""")
        assert abs(half * 2 - float(typed)) <= 1.0, f"result {half} does not match the restored drag {typed}"
        assert cdp.js("""(() => { const b = document.querySelectorAll('#app-a .hb-section')[1];
          return b.__seen === 1 && b.contains(document.querySelector('#app-a input[type=range]')); })()""") is True
        assert cdp.js("document.querySelectorAll('.hb-blocks').length") == 1
        # the board itself files the answer by identity once it is living (the door holds it)
        deadline = time.monotonic() + 20
        filed = False
        state_file = work / f"{live}.state.json"
        while time.monotonic() < deadline and not filed:
            if state_file.is_file():
                filed = any(k.startswith("k:") for k in json.loads(state_file.read_text()))
            if not filed:
                time.sleep(0.1)
        assert filed, "the moved block's answer was never filed on the board under its identity"
        hosts = {u.split("/")[2] for u, _m in cdp.js("window.__net")}
        assert hosts == {f"127.0.0.1:{port}"}


def test_reopen_after_insertion_restores_saved_ticks_from_the_real_door(door, bundle):
    # review round 5, case 2, in a living browser: ticks saved while the board sat at position "0",
    # an insertion that shifts it to "1", a poke landing the update — then the WHOLE PAGE reloads.
    # The reopened board must show its ticks: the state follows the block, not the slot.
    api, port, work = door
    door_url = f"http://127.0.0.1:{port}"
    check = {"type": "checklist", "title": "Pack", "items": [{"text": "Rope"}, {"text": "Tent"}]}
    live = api.store.save([check], root=work)
    state_file = work / f"{live}.state.json"

    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        real_click(cdp, "document.querySelectorAll('#app-a button[role=checkbox]')[0]"
                        ".getBoundingClientRect()")
        wait_js(cdp, "document.querySelectorAll('#app-a button[role=checkbox]')[0]"
                     ".classList.contains('hb-check-on')", 20)
        # the never-updated board files positionally, exactly as #8 accepted
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline and not (state_file.is_file()
                                                   and json.loads(state_file.read_text()).get("0") == [0]):
            time.sleep(0.1)
        assert json.loads(state_file.read_text()).get("0") == [0], "the accepted positional save vanished"

        api.store.update(live, [HEAD, check], root=work)
        cdp.js(f"window.__openUpdate({json.dumps(live)})")
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks').innerText.includes('Portfolio · Q4')", 20)
        assert cdp.js("document.querySelectorAll('#app-a button[role=checkbox]')[0]"
                      ".classList.contains('hb-check-on')") is True  # the live node rode through (r4)
        # and the promote filed the ticks under the block's identity
        deadline = time.monotonic() + 20
        filed = False
        while time.monotonic() < deadline and not filed:
            if state_file.is_file():
                filed = any(k.startswith("k:") for k in json.loads(state_file.read_text()))
            if not filed:
                time.sleep(0.1)
        assert filed, "the update never migrated the saved ticks to the block's identity"

    # the reopen: a GENUINELY fresh page against the same door — nothing survived in memory; the
    # checklist now reads path "1", and the ticks were saved at "0".
    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks').innerText.includes('Portfolio · Q4')", 20)
        deadline = time.monotonic() + 20
        checked = False
        while time.monotonic() < deadline and not checked:
            checked = cdp.js("document.querySelectorAll('#app-a button[role=checkbox]')[0]"
                             "?.classList.contains('hb-check-on')") is True
            if not checked:
                time.sleep(0.1)
        assert checked, "RED pre-fix: the reopened checklist read the vacated path and came back bare"
        # a different checklist can never inherit it: its own identity is its own answer
        assert cdp.js("document.querySelectorAll('.hb-blocks').length") == 1


# --- round 6 (reviewer comment 937): updates that arrive while NOTHING is mounted ------------------------------------
#
# The store happily takes an update at an address with no view anywhere — the reach-back/edit-later shape
# of the chat's visual memory. The old bug: the update's promote lived only in the mounted view, so a
# legacy positional answer waited in the door for whatever block NOW sat in that slot. The witnesses here
# close the page entirely (the process dies; forgetBlock never runs against a live element), update the
# REAL store, and reopen in a genuinely fresh browser.


def _wait_state(state_file: Path, key: str, want, seconds: float = 20.0) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if state_file.is_file() and json.loads(state_file.read_text()).get(key) == want:
            return True
        time.sleep(0.1)
    return False


def test_headless_update_never_lets_a_vacated_slot_speak(door, bundle):
    # the reviewer's exact probe over the real door: Pack ticks save "0"; the page CLOSES; the HOST
    # updates to [Other, Pack] with no view mounted; the reopen must show Pack ticked and Other bare.
    api, port, work = door
    door_url = f"http://127.0.0.1:{port}"
    pack = {"type": "checklist", "title": "Pack", "items": [{"text": "Rope"}, {"text": "Tent"}]}
    other = {"type": "checklist", "title": "Other", "items": [{"text": "Map"}, {"text": "Stove"}]}
    live = api.store.save([pack], root=work)
    state_file = work / f"{live}.state.json"
    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        real_click(cdp, "document.querySelectorAll('#app-a button[role=checkbox]')[0]"
                        ".getBoundingClientRect()")
        assert _wait_state(state_file, "0", [0]), "the accepted positional save never arrived"
    # every view is gone — this update lands headless, exactly like a later turn quoting the address
    api.store.update(live, [other, pack], root=work)
    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        wait_js(cdp, "!!document.querySelector('#app-a button[role=checkbox]')", 20)
        time.sleep(1.0)  # settle: the door has answered and the reopen drew from it
        cls = [cdp.js(f"document.querySelectorAll('#app-a button[role=checkbox]')[{i}]"
                      f".className.includes('hb-check-on')") for i in range(4)]
        # boxes 0,1 belong to Other (now at path 0), 2,3 to the retained Pack (now at path 1)
        assert cls[2] is True, "RED pre-fix: the retained Pack read its NEW path 1, found nothing, came back bare"
        assert cls[0] is False, "RED pre-fix: the stranger Other read the vacated path 0 and inherited the tick"
        assert cls[1] is False and cls[3] is False
        assert cdp.js("document.querySelectorAll('.hb-blocks').length") == 1


def test_headless_insertion_before_the_checklist_carries_its_ticks_to_the_reopen(door, bundle):
    # a headless insertion shifts the checklist's path (0→1) without touching its words: the answer
    # rides the archived v1→v2 mapping onto the block, not onto the slot it used to sit in.
    api, port, work = door
    door_url = f"http://127.0.0.1:{port}"
    pack = {"type": "checklist", "title": "Pack", "items": [{"text": "Rope"}, {"text": "Tent"}]}
    live = api.store.save([pack], root=work)
    state_file = work / f"{live}.state.json"
    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        real_click(cdp, "document.querySelectorAll('#app-a button[role=checkbox]')[1]"
                        ".getBoundingClientRect()")
        assert _wait_state(state_file, "0", [1])
    api.store.update(live, [HEAD, pack], root=work)
    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        wait_js(cdp, "!!document.querySelector('#app-a button[role=checkbox]')", 20)
        time.sleep(1.0)
        assert cdp.js("document.querySelectorAll('#app-a button[role=checkbox]')[1]"
                      ".className.includes('hb-check-on')") is True, \
            "RED pre-fix: the shifted checklist read the vacated path 0 — a heading wears no ticks"
        assert cdp.js("document.querySelectorAll('#app-a button[role=checkbox]')[0]"
                      ".className.includes('hb-check-on')") is False


def test_headless_update_that_drops_a_block_leaves_its_answer_inert(door, bundle):
    # the misfire guard at the real door: Pack is GONE from v2; its legacy bytes may not move onto
    # the stranger that took its slot — and they may not be erased either (user data stays).
    api, port, work = door
    door_url = f"http://127.0.0.1:{port}"
    pack = {"type": "checklist", "title": "Pack", "items": [{"text": "Rope"}, {"text": "Tent"}]}
    other = {"type": "checklist", "title": "Other", "items": [{"text": "Map"}, {"text": "Stove"}]}
    live = api.store.save([pack], root=work)
    state_file = work / f"{live}.state.json"
    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        real_click(cdp, "document.querySelectorAll('#app-a button[role=checkbox]')[0]"
                        ".getBoundingClientRect()")
        assert _wait_state(state_file, "0", [0])
    api.store.update(live, [other], root=work)
    with living_page(bundle, door_url, live) as cdp:
        wait_js(cdp, "document.querySelector('#app-a .hb-blocks') !== null", 20)
        wait_js(cdp, "!!document.querySelector('#app-a button[role=checkbox]')", 20)
        time.sleep(1.0)
        for i in range(2):
            assert cdp.js(f"document.querySelectorAll('#app-a button[role=checkbox]')[{i}]"
                          f".className.includes('hb-check-on')") is False, \
                "RED pre-fix: Other inherited a dead Pack's ticks from the vacated path"
    saved = json.loads(state_file.read_text())
    assert saved.get("0") == [0], "migration may not erase bytes it cannot safely move"
    assert not any(str(k).startswith("k:") for k in saved), "nothing may be filed without a confirmed trail"
