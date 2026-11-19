"""The Library door (enhancement #8): GET/PUT/DELETE /library — the shelf, served from the local store only.

The semantics the tests below pin, in door terms:
  · PUT pins for a REAL stored board (auto-title server-side) and organizes; unknown/malformed ids 404;
  · GET lists exactly the pinned boards, and says whether each board is still on disk (exists) so the
    Library can honest about a note whose board a machine does not have;
  · DELETE removes only the note — the board still answers 200 afterwards, file still on disk.
  · Nothing here opens a socket outward: every route reads/writes files under the store folder.
"""

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


def _board(api, tmp_path, blocks):
    return api.store.save(blocks, root=tmp_path)


def test_get_library_is_empty_notes_until_pinned(client, tmp_path):
    http, api = client
    assert http.get("/library").json() == {"entries": []}
    block_id = _board(api, tmp_path, [{"type": "heading", "text": "Kyoto"}])
    assert http.put(f"/library/{block_id}", json={}).status_code == 200
    body = http.get("/library").json()
    assert body["entries"] == [
        {"id": block_id, "title": "Kyoto", "folder": None, "favorite": False, "pinned": True,
         "saved_at": body["entries"][0]["saved_at"], "exists": True}
    ]


def test_put_pins_with_auto_title_and_words(client, tmp_path):
    http, api = client
    block_id = _board(api, tmp_path, [{"type": "heading", "text": "Q3 review"}, {"type": "divider"}])
    response = http.put(f"/library/{block_id}", json={"folder": "Finance", "favorite": True})
    assert response.status_code == 200
    entry = response.json()["entry"]
    assert entry == {"id": block_id, "title": "Q3 review", "folder": "Finance", "favorite": True,
                     "pinned": True, "saved_at": entry["saved_at"]}


def test_put_refuses_boards_that_are_not_stored(client):
    http, _ = client
    for bad in ("0badc0de", "NOPE1234", "../etc"):
        assert http.put(f"/library/{bad}", json={}).status_code == 404


def test_put_refuses_words_that_are_not_words(client, tmp_path):
    http, api = client
    block_id = _board(api, tmp_path, [{"type": "heading", "text": "x"}])
    for body in ({"title": 5}, {"folder": []}, {"favorite": "yes"}, [1], {"title": "ok", "extra": 1}):
        assert http.put(f"/library/{block_id}", json=body).status_code == 400
    assert http.get("/library").json() == {"entries": []}  # a refused word wrote nothing


def test_delete_removes_the_note_and_keeps_the_board(client, tmp_path):
    http, api = client
    block_id = _board(api, tmp_path, [{"type": "heading", "text": "Keep me"}])
    http.put(f"/library/{block_id}", json={})
    response = http.delete(f"/library/{block_id}")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "removed": True}
    assert http.get("/library").json() == {"entries": []}
    # THE unpin semantics through the door: the board is not silently destroyed.
    assert http.get(f"/blocks/{block_id}").status_code == 200
    assert (tmp_path / f"{block_id}.json").is_file()


def test_delete_unknown_or_unpinned_is_harmless(client, tmp_path):
    http, api = client
    block_id = _board(api, tmp_path, [{"type": "divider"}])
    assert http.delete(f"/library/{block_id}").json() == {"ok": True, "removed": False}
    assert http.delete("/library/0badc0de").json() == {"ok": True, "removed": False}


def test_rename_back_to_empty_restores_the_auto_title(client, tmp_path):
    http, api = client
    block_id = _board(api, tmp_path, [{"type": "heading", "text": "Auto"}])
    http.put(f"/library/{block_id}", json={"title": "Edited"})
    assert http.put(f"/library/{block_id}", json={"title": ""}).json()["entry"]["title"] == "Auto"


def test_get_says_when_a_note_has_no_board_on_disk(client, tmp_path, monkeypatch):
    # A note outlives its board only if the board folder vanishes (another profile, a moved disk):
    # the door must not promise a reopen that cannot answer. It says exists: false and stays local.
    http, api = client
    block_id = _board(api, tmp_path, [{"type": "heading", "text": "Gone"}])
    http.put(f"/library/{block_id}", json={})
    (tmp_path / f"{block_id}.json").unlink()
    entry = http.get("/library").json()["entries"][0]
    assert entry["exists"] is False
