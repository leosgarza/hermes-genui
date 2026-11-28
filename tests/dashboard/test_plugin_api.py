import importlib.util

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from conftest import ROOT, load_plugin_package


@pytest.fixture
def client(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("hb_plugin_api", ROOT / "dashboard" / "plugin_api.py")
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)
    monkeypatch.setattr(api.store, "default_root", lambda: tmp_path)
    app = FastAPI()
    app.include_router(api.router)
    return TestClient(app), api


def test_api_returns_blocks(client, tmp_path):
    http, api = client
    block_id = api.store.save([{"type": "text", "text": "hi"}], root=tmp_path)
    response = http.get(f"/blocks/{block_id}")
    assert response.status_code == 200
    # the stored envelope rides along (enhancement #6): the page's JSON export is the board's OWN words.
    assert response.json() == {"blocks": [{"type": "text", "text": "hi"}], "stored": [{"type": "text", "text": "hi"}]}


def test_an_envelope_board_answers_with_its_blocks_and_its_words(client, tmp_path):
    http, api = client
    block_id = api.store.save({"align": "center", "text_align": "right",
                               "blocks": [{"type": "text", "text": "hi"}]}, root=tmp_path)
    response = http.get(f"/blocks/{block_id}")
    assert response.status_code == 200
    # The #54 words ride; enhancement #6 adds ONE key to the exact shape: stored, the envelope as saved.
    assert response.json() == {"blocks": [{"type": "text", "text": "hi"}],
                               "align": "center", "text_align": "right",
                               "stored": {"align": "center", "text_align": "right",
                                          "blocks": [{"type": "text", "text": "hi"}]}}


def test_api_404_for_unknown(client):
    http, _ = client
    response = http.get("/blocks/0badc0de")
    assert response.status_code == 404
    assert response.json() == {"error": "not found"}


def test_state_is_empty_until_saved_then_comes_back(client, tmp_path):
    http, api = client
    block_id = api.store.save([{"type": "checklist", "items": ["Passport", "Tickets"]}], root=tmp_path)
    assert http.get(f"/blocks/{block_id}/state").json() == {}
    response = http.put(f"/blocks/{block_id}/state", json={"state": {"0": [1]}})
    assert response.status_code == 200
    assert http.get(f"/blocks/{block_id}/state").json() == {"state": {"0": [1]}}


def test_state_404_for_bad_or_unknown_ids(client):
    http, _ = client
    for bad in ("0badc0de", "NOPE1234"):
        assert http.get(f"/blocks/{bad}/state").status_code == 404
        assert http.put(f"/blocks/{bad}/state", json={"state": {}}).status_code == 404


def test_state_413_when_too_big(client, tmp_path):
    http, api = client
    block_id = api.store.save([{"type": "text", "text": "hi"}], root=tmp_path)
    response = http.put(f"/blocks/{block_id}/state", json={"state": {"0": "x" * 30_000}})
    assert response.status_code == 413


def test_state_400_when_not_an_object(client, tmp_path):
    http, api = client
    block_id = api.store.save([{"type": "text", "text": "hi"}], root=tmp_path)
    assert http.put(f"/blocks/{block_id}/state", json={"state": [1, 2]}).status_code == 400
    assert http.put(f"/blocks/{block_id}/state", json=[1]).status_code == 400


def test_an_unreadable_board_is_404_not_500(client, tmp_path):
    http, _ = client
    (tmp_path / "0badc0de.json").write_text("[{not json", encoding="utf-8")
    assert http.get("/blocks/0badc0de").status_code == 404
    assert http.get("/blocks/0badc0de/state").status_code == 404


def test_state_body_over_32kb_is_413_before_it_is_read(client, tmp_path):
    http, api = client
    block_id = api.store.save([{"type": "text", "text": "hi"}], root=tmp_path)
    response = http.put(f"/blocks/{block_id}/state", json={"state": {}, "padding": "x" * (40 * 1024)})
    assert response.status_code == 413
    assert http.get(f"/blocks/{block_id}/state").json() == {}


def test_state_body_without_a_length_is_cut_off_at_32kb(client, tmp_path):
    http, api = client
    block_id = api.store.save([{"type": "text", "text": "hi"}], root=tmp_path)

    def chunks():
        yield b'{"state": {}, "padding": "'
        for _ in range(40):
            yield b"x" * 1024
        yield b'"}'

    response = http.put(f"/blocks/{block_id}/state", content=chunks(), headers={"content-type": "application/json"})
    assert response.status_code == 413
    assert http.get(f"/blocks/{block_id}/state").json() == {}



def test_a_board_from_another_profile_draws_and_keeps_its_ticks_there(client, tmp_path, monkeypatch):
    """Desktop asks the active profile for every board, so a session from another profile must still find its own."""
    http, api = client
    other = tmp_path / "profiles" / "claude" / "blocks"
    monkeypatch.setattr(api.store, "profile_stores", lambda: [other])
    block_id = api.store.save([{"type": "checklist", "items": ["Passport"]}], root=other)
    assert http.get(f"/blocks/{block_id}").json() == {
        "blocks": [{"type": "checklist", "items": ["Passport"]}],
        "stored": [{"type": "checklist", "items": ["Passport"]}]}
    assert http.put(f"/blocks/{block_id}/state", json={"state": {"0": [0]}}).status_code == 200
    assert (other / f"{block_id}.state.json").is_file()
    assert not (tmp_path / f"{block_id}.state.json").exists()
    assert http.get(f"/blocks/{block_id}/state").json() == {"state": {"0": [0]}}


@pytest.fixture
def own(tmp_path, monkeypatch):
    """Like client, but the blocks folder is tmp_path/blocks: the assistant and the dashboard keep their files beside
    it, which must stay inside this test's folder."""
    spec = importlib.util.spec_from_file_location("hb_plugin_api", ROOT / "dashboard" / "plugin_api.py")
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)
    blocks = tmp_path / "blocks"
    blocks.mkdir()
    monkeypatch.setattr(api.store, "default_root", lambda: blocks)
    app = FastAPI()
    app.include_router(api.router)
    return TestClient(app), api, blocks


def _set_up(api, tmp_path):
    from datetime import datetime
    now = datetime.now().astimezone()
    api.assistant_memory.save_config({"source": "demo", "setup_at": now.isoformat(), "last_check": None}, tmp_path)
    api.assistant_memory.apply_report({"items": [{"ref": "airtel-bill-x", "pile": "bills", "title": "Airtel bill"}],
                                       "summary": "1"}, now, tmp_path)
    return api.assistant_memory.load_items(tmp_path)[0]["id"]


def test_the_ticker_routes_are_gone(own):
    """Nothing polls for a ticker any more, so no route hands out every tracked item or a ticker layout."""
    http, api, tmp_path = own
    _set_up(api, tmp_path)
    assert http.get("/live").status_code == 404
    assert http.get("/assistant").status_code == 404


def test_a_button_changes_an_items_status(own):
    http, api, tmp_path = own
    item_id = _set_up(api, tmp_path)
    response = http.post(f"/assistant/items/{item_id}", json={"status": "done"})
    assert response.status_code == 200 and response.json()["status"] == "done"
    assert response.json()["history"][-1]["what"] == "page: done"
    assert http.post("/assistant/items/nope1234", json={"status": "done"}).status_code == 404
    assert http.post(f"/assistant/items/{item_id}", json={"status": "paid"}).status_code == 400


def test_reopen_from_the_page(own):
    http, api, tmp_path = own
    item_id = _set_up(api, tmp_path)
    http.post(f"/assistant/items/{item_id}", json={"status": "done"})
    response = http.post(f"/assistant/items/{item_id}", json={"status": "suggested"})
    assert response.status_code == 200 and response.json()["status"] == "suggested"
    assert response.json()["reopened_by_user"] is True and response.json()["history"][-1]["what"] == "you: reopened"


def test_dashboard_is_empty_without_a_spec(own):
    http, _, _ = own
    assert http.get("/dashboard").json() == {"title": None, "blocks": [], "live": False}


def test_dashboard_assembles_valid_blocks(own):
    http, api, tmp_path = own
    item_id = _set_up(api, tmp_path)
    api.dashboard_spec.save_spec({"title": "Today", "sections": [
        {"from": "assistant.summary"}, {"from": "assistant.open", "as": "checklist"}, {"from": "calendar.today"}]},
        tmp_path)
    body = http.get("/dashboard").json()
    assert body["title"] == "Today" and [b["type"] for b in body["blocks"]] == ["kpis", "checklist", "calendar"]
    assert body["blocks"][1]["items"][0]["id"] == item_id


def test_ticks_on_the_dashboard_close_and_reopen_items(own):
    http, api, tmp_path = own
    item_id = _set_up(api, tmp_path)
    assert http.put("/dashboard/state", json={"ticks": {item_id: True, "nope1234": True}}).status_code == 200
    assert api.assistant_memory.load_items(tmp_path)[0]["status"] == "done"
    http.put("/dashboard/state", json={"ticks": {item_id: False}})
    assert api.assistant_memory.load_items(tmp_path)[0]["status"] == "suggested"
    assert http.put("/dashboard/state", json={"ticks": [1]}).status_code == 400


def test_dashboard_head_is_just_the_title(own):
    http, api, tmp_path = own
    assert http.get("/dashboard/head").json() == {"title": None}
    api.dashboard_spec.save_spec({"title": "Today", "sections": [{"from": "tasks"}]}, tmp_path)
    assert http.get("/dashboard/head").json() == {"title": "Today"}


def _page(api, tmp_path, **over):
    pages = api.pages_store
    page = {"slug": "executive", "title": "Executive", "kind": "dashboard", "servers": ["mockcrm"], "notes": "",
            "job_id": "abc123", "previous": None,
            "snapshot": {"at": "2026-11-15T09:12:00+05:30", "blocks": [
                {"type": "list", "items": [{"title": "MRR up 6%"}]}]},
            "refresh": {"requested_at": None, "error": None}, **over}
    pages.save(page, tmp_path)
    return page


def test_pages_lists_dashboards_only(client, tmp_path):
    http, api = client
    _page(api, tmp_path)
    _page(api, tmp_path, slug="today", title="Today", kind="today")
    assert http.get("/pages").json() == {"pages": [{"slug": "executive", "title": "Executive", "kind": "dashboard"}]}


def test_a_page_is_its_snapshot_as_blocks_with_its_status(client, tmp_path):
    http, api = client
    _page(api, tmp_path)
    body = http.get("/pages/executive").json()
    assert body["title"] == "Executive" and body["blocks"][0]["type"] == "list"
    assert body["at"] == "2026-11-15T09:12:00+05:30" and body["refreshing"] is False and body["live"] is False
    assert http.get("/pages/nope").status_code == 404


def test_refresh_runs_the_pages_job_through_hermes(client, tmp_path, monkeypatch):
    http, api = client
    _page(api, tmp_path)
    runs = []
    monkeypatch.setattr(api, "run_job", lambda job_id, root, done=None: runs.append(job_id))
    first = http.post("/pages/executive/refresh").json()
    http.post("/pages/executive/refresh")
    assert runs == ["abc123"] and first["refreshing"] is True
    assert api.pages_store.load("executive", tmp_path)["refresh"]["requested_at"]
    assert http.post("/pages/nope/refresh").status_code == 404


def test_the_hermes_command_names_the_profile(tmp_path):
    spec = importlib.util.spec_from_file_location("hb_plugin_api2", ROOT / "dashboard" / "plugin_api.py")
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)
    named = tmp_path / "profiles" / "genui-test" / "plugin-data" / "hermes-genui" / "blocks"
    default = tmp_path / ".hermes" / "plugin-data" / "hermes-genui" / "blocks"
    assert api.job_command("abc123", named)[1:] == ["-p", "genui-test", "cron", "run", "abc123"]
    assert api.job_command("abc123", default)[1:] == ["cron", "run", "abc123"]


def test_a_long_refresh_runs_on_without_holding_the_request(client, tmp_path, monkeypatch):
    import time
    _, api = client
    monkeypatch.setattr(api, "job_command", lambda job_id, root: ["sleep", "5"])
    started = time.monotonic()
    api.run_job("abc123", tmp_path)
    assert time.monotonic() - started < 4


def test_a_job_that_fails_at_once_reports_why(client, tmp_path, monkeypatch):
    import subprocess
    _, api = client
    monkeypatch.setattr(api, "job_command", lambda job_id, root: ["sh", "-c", "echo Job not found >&2; exit 1"])
    with pytest.raises(subprocess.CalledProcessError) as failed:
        api.run_job("abc123", tmp_path)
    assert b"Job not found" in failed.value.output


def test_a_job_that_ends_later_is_reported(client, tmp_path, monkeypatch):
    import threading
    _, api = client
    monkeypatch.setattr(api, "QUICK_FAIL_SECONDS", 0.2)
    monkeypatch.setattr(api, "job_command", lambda job_id, root: ["sh", "-c", "sleep 0.5; echo rate limited; exit 2"])
    ended, seen = threading.Event(), []
    api.run_job("abc123", tmp_path, done=lambda code, out: (seen.append((code, out)), ended.set()))
    assert ended.wait(10)
    assert seen[0][0] == 2 and b"rate limited" in seen[0][1]


def test_the_page_says_why_a_refresh_failed_after_it_started(client, tmp_path, monkeypatch):
    http, api = client
    _page(api, tmp_path)
    finished = []
    monkeypatch.setattr(api, "run_job", lambda job_id, root, done=None: finished.append(done))
    http.post("/pages/executive/refresh")
    finished[0](1, b"Error: model not loaded\n")
    body = http.get("/pages/executive").json()
    assert body["refreshing"] is False and body["error"] == "The refresh failed: Error: model not loaded"


def test_a_page_on_a_schedule_says_so(client, tmp_path):
    http, api = client
    _page(api, tmp_path, schedule="every day at 8am")
    assert http.get("/pages/executive").json()["schedule"] == "every day at 8am"
    _page(api, tmp_path)
    assert http.get("/pages/executive").json()["schedule"] is None


def test_api_passes_the_boards_own_follow_ups(client, tmp_path):
    http, api = client
    ups = [{"label": "Go", "run": "Tell me more"}]
    board = {"follow_ups": ups, "blocks": [{"type": "text", "text": "hi"}]}
    block_id = api.store.save(board, root=tmp_path)
    assert http.get(f"/blocks/{block_id}").json() == (
        {"blocks": board["blocks"], "follow_ups": ups, "stored": board}
    )


def test_api_skips_follow_ups_that_were_never_a_list(client, tmp_path):
    http, api = client
    board = {"follow_ups": "just keep going", "blocks": [{"type": "text", "text": "hi"}]}
    block_id = api.store.save(board, root=tmp_path)
    assert http.get(f"/blocks/{block_id}").json() == (
        {"blocks": board["blocks"], "stored": board}
    )


def test_api_serves_follow_ups_the_version_it_belong_to(client, tmp_path):
    http, api = client
    ups1 = [{"label": "Go", "run": "Tell me more"}]
    block_id = api.store.save({"follow_ups": ups1, "blocks": [{"type": "text", "text": "v1"}]}, root=tmp_path)
    api.store.update(block_id, [{"type": "text", "text": "v2"}])
    # the live answer says nothing follow-ups; the archived one still speaks its own, in the same shape.
    assert "follow_ups" not in http.get(f"/blocks/{block_id}").json()
    archived = http.get(f"/blocks/{block_id}?version=1").json()
    assert archived["blocks"] == [{"type": "text", "text": "v1"}] and archived["follow_ups"] == ups1


# --- export rides the load; there is no export door (t_bff8178a round 2, F1) ---------------------------------

def test_the_load_itself_carries_the_stored_envelope_whole(client, tmp_path):
    """The board page needs nothing else to export JSON: the stored envelope arrives with the board itself —
    unknown words and all, exactly as saved (the drawer may serve a projection; the export keeps the original)."""
    http, api = client
    board = {"version": 2, "updated_at": "2026-11-18T10:00:00+05:30", "model_note": "kept", "blocks": [
        {"type": "heading", "text": "Day 1"},
        {"type": "text", "text": "Leaves at 7:10."},
    ]}
    block_id = api.store.save(board, root=tmp_path)
    assert http.get(f"/blocks/{block_id}").json()["stored"] == board


def test_plain_list_boards_store_ride_as_they_were_saved(client, tmp_path):
    http, api = client
    board = [{"type": "text", "text": "hi"}]
    block_id = api.store.save(board, root=tmp_path)
    assert http.get(f"/blocks/{block_id}").json()["stored"] == board


def test_reach_back_stores_the_version_answered(client, tmp_path):
    """With ?version=N the `stored` word is THAT version's envelope — the very board the answer describes,
    never the live one beside it."""
    http, api = client
    first = [{"type": "text", "text": "Q3: 41"}]
    block_id = api.store.save(first, root=tmp_path)
    api.store.update(block_id, {"blocks": first + [{"type": "text", "text": "plus NVDA"}]}, root=tmp_path)
    answer = http.get(f"/blocks/{block_id}", params={"version": "1"}).json()
    assert answer["stored"] == first


def test_there_is_no_export_route_to_ask(client, tmp_path):
    """The old GET /blocks/<id>/export door stays removed: nothing named "export" answers on a board.
    Pinned BOTH ways CodeRabbit asked on #75: a SAVED board (a handler returning 404 only for unknown ids
    could not hide behind the miss) and the router's own registered paths."""
    http, api = client
    block_id = api.store.save([{"type": "text", "text": "hi"}], root=tmp_path)
    assert http.get(f"/blocks/{block_id}/export").status_code == 404
    registered = {getattr(route, "path", "") for route in api.router.routes}
    assert not any(path.endswith("/export") for path in registered), sorted(registered)


# --- the markdown door: ONE writer, asked at export time (the maintainer's reshape of offer #6) --------------

def test_markdown_answers_the_boards_own_text_whole(client, tmp_path):
    """GET /blocks/<id>/markdown says EXACTLY what the chat serializer says about this board, uncapped —
    blocks_as_text with limit=None. One writer: the file can never disagree with the reply."""
    import importlib

    load_plugin_package()
    tf = importlib.import_module("hermes_genui.hooks.text_fallback")
    http, api = client
    board = {"blocks": [{"type": "heading", "text": "Day 1"}, {"type": "text", "text": "Leaves at 7:10."}]}
    block_id = api.store.save(board, root=tmp_path)
    answer = http.get(f"/blocks/{block_id}/markdown")
    assert answer.status_code == 200
    assert answer.json() == {"markdown": tf.blocks_as_text(board["blocks"], limit=None)}


def test_markdown_goes_uncapped_where_chat_would_cut(client, tmp_path):
    """A file is not one chat message: a board whose text passes LIMIT arrives WHOLE, with no more-note."""
    http, api = client
    blocks = [{"type": "text", "text": f"line {i} " + "x" * 60} for i in range(80)]
    block_id = api.store.save(blocks, root=tmp_path)
    text = http.get(f"/blocks/{block_id}/markdown").json()["markdown"]
    assert len(text) > 3500 and text.count("line ") == 80 and "more in Hermes Desktop" not in text


def test_markdown_reads_either_board_shape(client, tmp_path):
    """Plain lists and Living envelopes answer the same text: the door reads blocks, not history."""
    http, api = client
    heading = [{"type": "heading", "text": "Same"}]
    plain = api.store.save(heading, root=tmp_path)
    wrapped = api.store.save({"version": 3, "updated_at": "2026-11-18T10:00:00+05:30", "blocks": heading},
                             root=tmp_path)
    assert http.get(f"/blocks/{plain}/markdown").json() == http.get(f"/blocks/{wrapped}/markdown").json()


def test_markdown_version_reach_back_answers_the_version_on_screen(client, tmp_path):
    """/markdown shares get_block's ONE version rule (the shared _resolve_board): the address answers the
    current version; ?version=N reaches back; a bad number is a 400; nothing behind it is a 404; nowhere
    is a 404. The export then always speaks the board the reader is looking at."""
    http, api = client
    first = [{"type": "text", "text": "Q3: 41"}]
    block_id = api.store.save(first, root=tmp_path)
    api.store.update(block_id, {"blocks": first + [{"type": "text", "text": "plus NVDA"}]}, root=tmp_path)
    now = http.get(f"/blocks/{block_id}/markdown").json()["markdown"]
    back = http.get(f"/blocks/{block_id}/markdown", params={"version": "1"}).json()["markdown"]
    assert "Q3: 41" in now and "plus NVDA" in now
    assert "Q3: 41" in back and "plus NVDA" not in back
    assert http.get(f"/blocks/{block_id}/markdown", params={"version": "0"}).status_code == 400
    assert http.get(f"/blocks/{block_id}/markdown", params={"version": "x"}).status_code == 400
    assert http.get(f"/blocks/{block_id}/markdown", params={"version": "9"}).status_code == 404
    assert http.get("/blocks/0badc0de/markdown").status_code == 404


def test_markdown_version_one_answers_the_unversioned_current_board(client, tmp_path):
    """The rule the always-versioned export ask leans on, pinned at the door: a board that never spoke a
    version word IS version 1 (_resolve_board's own "or 1") — so ?version=1 answers the live board's bytes
    EXACTLY, no archive needed. After an update, ?version=1 reaches back to the archived first version.
    The client may therefore pin an initial, unversioned drawing and still say the board on screen."""
    http, api = client
    board = [{"type": "text", "text": "the first draft"}]
    block_id = api.store.save(board, root=tmp_path)
    plain = http.get(f"/blocks/{block_id}").json()
    assert plain.get("version") is None                       # unversioned: the door says no version word
    assert http.get(f"/blocks/{block_id}/markdown", params={"version": "1"}).json() == \
        http.get(f"/blocks/{block_id}/markdown").json()       # ?version=1 IS the live board here
    api.store.update(block_id, {"blocks": board + [{"type": "text", "text": "the second pass"}]},
                     root=tmp_path)
    back = http.get(f"/blocks/{block_id}/markdown", params={"version": "1"}).json()["markdown"]
    assert "the first draft" in back and "the second pass" not in back   # now it reaches back


def test_markdown_corpus_pins_the_door_to_the_writer(client, tmp_path):
    """The corpus contract SURVIVES the twin's death, aimed at the door: every board in the golden corpus
    gets, through /blocks/<id>/markdown, byte for byte the text the serializer was pinned to say. A change
    to the writer without regenerating this corpus reddens here — exactly the drift alarm the twin test
    used to raise, now with ONE writer underneath."""
    import json
    from pathlib import Path

    CORPUS = Path(__file__).resolve().parents[1] / "fixtures" / "markdown.corpus.json"
    entries = json.loads(CORPUS.read_text(encoding="utf-8"))
    assert len(entries) >= 40, "the corpus arrived truncated"
    http, api = client
    for entry in entries:
        block_id = api.store.save(entry["blocks"], root=tmp_path)
        answer = http.get(f"/blocks/{block_id}/markdown")
        assert answer.status_code == 200, entry["name"]
        assert answer.json()["markdown"] == entry["expected"], f"corpus drift at {entry['name']!r}"


# --- the stored passthrough never breaks the draw (CodeRabbit on #75) -----------------------------------------

def test_a_board_with_a_non_finite_unknown_field_still_draws(client, tmp_path):
    """JSON reads and writes Infinity/NaN, and Starlette REFUSES to serialize one: an odd saved word in an
    unknown envelope field may not turn GET /blocks/<id> into a 500. The non-finite value says None; every
    block and every other word ride, and the board still arrives whole enough to draw."""
    http, api = client
    board = {"model_note": float("inf"), "notes": [{"deep": float("nan")}, "kept"],
             "blocks": [{"type": "heading", "text": "Still draws"}]}
    block_id = api.store.save(board, root=tmp_path)
    answer = http.get(f"/blocks/{block_id}")
    assert answer.status_code == 200
    body = answer.json()
    assert body["blocks"] == [{"type": "heading", "text": "Still draws"}]
    assert body["stored"]["model_note"] is None
    assert body["stored"]["notes"] == [{"deep": None}, "kept"]
    assert http.get(f"/blocks/{block_id}/markdown").json()["markdown"] == "**Still draws**"
