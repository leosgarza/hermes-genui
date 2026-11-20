"""The living-board door (enhancement #9): GET /blocks/{id} carries the version words when a board has
them, an archived version answers GET /blocks/{id}?version=N in the SAME shape as the live one (so the
viewer can reach back without redrawing), and GET /blocks/{id}/versions lists what history exists.

Unsaid boards answer exactly what they always answered — no version key, no links key, nothing new.
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


V1 = [{"type": "heading", "text": "Portfolio · Q4"}, {"type": "text", "text": "three holdings"}]


def _updated(api, tmp_path):
    board_id = api.store.save(V1, root=tmp_path)
    other = _other(api, tmp_path)
    api.store.update(board_id, {"align": "center", "blocks": V1 + [{"type": "text", "text": "plus NVDA"}],
                                "density": "compact", "links": [{"id": other, "note": "last quarter"}]},
                     root=tmp_path)
    return board_id


def _other(api, tmp_path):
    if not hasattr(api, "_other_id"):
        api._other_id = api.store.save([{"type": "heading", "text": "Portfolio · Q3"}], root=tmp_path)
    return api._other_id


# --- unsaid boards answer exactly as they always did ----------------------------------------------------------------


def test_unsaid_board_carries_no_version_keys(client):
    http, api = client
    board_id = api.store.save(V1, root=api.store.default_root())
    body = http.get(f"/blocks/{board_id}").json()
    assert "version" not in body and "updated_at" not in body and "links" not in body
    assert body["blocks"] == V1


# --- the version words ride the same door ---------------------------------------------------------------------------


def test_updated_board_answers_version_updated_at_and_links(client):
    http, api = client
    board_id = _updated(api, api.store.default_root())
    body = http.get(f"/blocks/{board_id}").json()
    assert body["version"] == 2
    assert isinstance(body["updated_at"], str) and body["updated_at"]
    assert body["links"] == [{"id": _other(api, api.store.default_root()), "note": "last quarter"}]
    assert body["align"] == "center" and body["density"] == "compact"      # the version's own words
    assert len(body["blocks"]) == 3


# --- reach-back: an archived version answers in the same shape -------------------------------------------------------


def test_archived_version_answers_by_number_in_the_projection_shape(client):
    http, api = client
    board_id = _updated(api, api.store.default_root())
    body = http.get(f"/blocks/{board_id}", params={"version": 1}).json()
    assert body["blocks"] == V1
    assert "align" not in body                                            # v1 said no layout words
    assert "version" not in body or body.get("version") == 1              # honest about which version it is
    assert "stored" in body and body["stored"] == V1                      # the export source rides, as always


def test_unknown_version_number_is_404(client):
    http, api = client
    board_id = api.store.save(V1, root=api.store.default_root())
    assert http.get(f"/blocks/{board_id}", params={"version": 2}).status_code == 404
    assert http.get(f"/blocks/{board_id}", params={"version": "0"}).status_code == 400
    assert http.get(f"/blocks/{board_id}", params={"version": "x"}).status_code == 400


def test_versions_listing_names_what_history_exists(client):
    http, api = client
    fresh = api.store.save(V1, root=api.store.default_root())
    assert http.get(f"/blocks/{fresh}/versions").json() == {"versions": []}
    board_id = _updated(api, api.store.default_root())
    api.store.update(board_id, V1, root=api.store.default_root())
    rows = http.get(f"/blocks/{board_id}/versions").json()["versions"]
    assert [r["version"] for r in rows] == [3, 2, 1]          # newest first
    assert rows[0]["current"] is True                          # the live one, honestly labelled
    assert rows[0]["updated_at"] and not rows[2]["saved_at"]   # v1 predates any update stamp


def test_versions_of_an_unknown_or_malformed_address_is_404(client):
    http, api = client
    assert http.get("/blocks/0badc0de/versions").status_code == 404
    assert http.get("/blocks/../etc/versions").status_code in (404, 422)
