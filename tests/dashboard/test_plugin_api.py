import importlib.util

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from conftest import ROOT


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
    assert response.json() == {"blocks": [{"type": "text", "text": "hi"}]}


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
    assert http.get(f"/blocks/{block_id}").json() == {"blocks": [{"type": "checklist", "items": ["Passport"]}]}
    assert http.put(f"/blocks/{block_id}/state", json={"state": {"0": [0]}}).status_code == 200
    assert (other / f"{block_id}.state.json").is_file()
    assert not (tmp_path / f"{block_id}.state.json").exists()
    assert http.get(f"/blocks/{block_id}/state").json() == {"state": {"0": [0]}}


def test_api_passes_the_boards_own_align(client, tmp_path):
    http, api = client
    board = {"align": "center", "blocks": [{"type": "text", "text": "hi"}]}
    block_id = api.store.save(board, root=tmp_path)
    assert http.get(f"/blocks/{block_id}").json() == {"blocks": board["blocks"], "align": "center"}


def test_api_passes_the_boards_own_text_align(client, tmp_path):
    http, api = client
    board = {"align": "center", "text_align": "right", "blocks": [{"type": "text", "text": "hi"}]}
    block_id = api.store.save(board, root=tmp_path)
    assert http.get(f"/blocks/{block_id}").json() == {"blocks": board["blocks"], "align": "center",
                                                      "text_align": "right"}


def test_api_skips_a_text_align_that_was_never_text(client, tmp_path):
    http, api = client
    board = {"text_align": 7, "blocks": [{"type": "text", "text": "hi"}]}
    block_id = api.store.save(board, root=tmp_path)
    assert http.get(f"/blocks/{block_id}").json() == {"blocks": board["blocks"]}

def test_api_passes_the_boards_own_provenance(client, tmp_path):
    http, api = client
    board = {"as_of": "2026-11-18", "live": True, "blocks": [{"type": "text", "text": "hi"}]}
    block_id = api.store.save(board, root=tmp_path)
    assert http.get(f"/blocks/{block_id}").json() == {"blocks": board["blocks"], "as_of": "2026-11-18", "live": True}


def test_api_keeps_live_false_and_skips_junk(client, tmp_path):
    http, api = client
    board = {"align": "center", "as_of": 5, "live": False, "blocks": [{"type": "text", "text": "hi"}]}
    block_id = api.store.save(board, root=tmp_path)
    # an as_of that was never a string is not served; a live false is.
    assert http.get(f"/blocks/{block_id}").json() == {"blocks": board["blocks"], "align": "center", "live": False}


def test_api_passes_the_boards_own_follow_ups(client, tmp_path):
    http, api = client
    ups = [{"label": "Go", "run": "Tell me more"}]
    board = {"follow_ups": ups, "blocks": [{"type": "text", "text": "hi"}]}
    block_id = api.store.save(board, root=tmp_path)
    assert http.get(f"/blocks/{block_id}").json() == {"blocks": board["blocks"], "follow_ups": ups}


def test_api_skips_follow_ups_that_were_never_a_list(client, tmp_path):
    http, api = client
    board = {"follow_ups": "just keep going", "blocks": [{"type": "text", "text": "hi"}]}
    block_id = api.store.save(board, root=tmp_path)
    assert http.get(f"/blocks/{block_id}").json() == {"blocks": board["blocks"]}
