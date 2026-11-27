"""The Library shelf (enhancement #8): pins are notes in library.json, beside the boards, local to this profile.

The two semantics the Reviewer must never have to ask about, pinned here by tests:
  · pin requires a real stored board and auto-titles it from the board's own words;
  · unpin removes ONLY the note — the board file stays, still loadable, exactly as the store has always
    kept every board forever. There is no delete in this store at all.
"""

import importlib
import re

import pytest

from conftest import load_plugin_package

load_plugin_package()
store = importlib.import_module("hermes_genui.core.store")


def _board(tmp_path, blocks):
    return store.save(blocks, root=tmp_path)


# --- title_of: the auto title comes from the board's own words ----------------------------------------------------


def test_title_prefers_a_heading_words(tmp_path):
    board = [{"type": "heading", "text": "Kyoto trip planner"}, {"type": "text", "text": "more"}]
    assert store.title_of(board) == "Kyoto trip planner"


def test_title_falls_through_block_words_in_order(tmp_path):
    assert store.title_of({"blocks": [{"type": "chart", "spec": {"title": "Q3 sales", "kind": "line"}}]}) == "Q3 sales"
    assert store.title_of([{"type": "table", "caption": "Budget", "columns": ["a"], "rows": [["1"]]}]) == "Budget"


def test_title_descends_into_layout_children(tmp_path):
    board = [{"type": "section", "children": [{"type": "heading", "text": "Inside the fold"}]}]
    assert store.title_of(board) == "Inside the fold"


def test_title_collapses_whitespace_and_bounds_length(tmp_path):
    long = "  alpha   " + "beta " * 40
    got = store.title_of([{"type": "heading", "text": long}])
    assert "\n" not in got and "  " not in got
    assert len(got) <= store.TITLE_LIMIT


def test_title_without_any_words_is_plainly_generic(tmp_path):
    assert store.title_of([{"type": "divider"}, "not a block"]) == "Board"
    assert store.title_of(None) == "Board"


# --- pin: a note for a real board ----------------------------------------------------------------------------------


def test_pin_stores_the_auto_title_from_the_board(tmp_path):
    block_id = _board(tmp_path, [{"type": "heading", "text": "Quarterly review"}])
    entry = store.pin(block_id, root=tmp_path)
    assert entry["title"] == "Quarterly review"
    assert entry["pinned"] is True
    assert entry["favorite"] is False
    assert entry["folder"] is None
    assert (tmp_path / store.LIBRARY_FILE).is_file()


def test_pin_may_be_given_a_title(tmp_path):
    block_id = _board(tmp_path, [{"type": "text", "text": "x"}])
    assert store.pin(block_id, title="My shelf name", root=tmp_path)["title"] == "My shelf name"


def test_pin_refuses_a_board_that_is_not_stored(tmp_path):
    with pytest.raises(store.NoSuchBlock):
        store.pin("0badc0de", root=tmp_path)
    with pytest.raises(store.NoSuchBlock):
        store.pin("../etc/passwd", root=tmp_path)


def test_pin_twice_keeps_the_saved_at_and_respects_edits(tmp_path):
    block_id = _board(tmp_path, [{"type": "heading", "text": "First"}])
    first = store.pin(block_id, root=tmp_path)
    store.update_entry(block_id, {"folder": "Trips", "favorite": True}, root=tmp_path)
    second = store.pin(block_id, root=tmp_path)
    assert second["saved_at"] == first["saved_at"]  # re-pin is not a re-save
    assert second["folder"] == "Trips" and second["favorite"] is True


# --- unpin: the note dies, the board lives -------------------------------------------------------------------------


def test_unpin_removes_the_note_and_never_touches_the_board(tmp_path):
    block_id = _board(tmp_path, [{"type": "heading", "text": "Keep me"}])
    board_path = tmp_path / f"{block_id}.json"
    store.pin(block_id, root=tmp_path)
    assert store.unpin(block_id, root=tmp_path) is True
    assert store.load_library(root=tmp_path) == {}
    # THE semantics: removing the pin must not destroy the stored board.
    assert board_path.is_file()
    assert store.load(block_id, root=tmp_path) == [{"type": "heading", "text": "Keep me"}]


def test_unpin_of_an_unpinned_board_is_harmless(tmp_path):
    assert store.unpin("0badc0de", root=tmp_path) is False


# --- update_entry: organize without re-saving ----------------------------------------------------------------------


def test_update_moves_to_folder_renames_and_favorites(tmp_path):
    block_id = _board(tmp_path, [{"type": "heading", "text": "Trip"}])
    store.pin(block_id, root=tmp_path)
    entry = store.update_entry(block_id, {"title": "Kyoto", "folder": "Japan 2026", "favorite": True}, root=tmp_path)
    assert entry["title"] == "Kyoto" and entry["folder"] == "Japan 2026" and entry["favorite"] is True
    assert store.load_library(root=tmp_path)[block_id]["folder"] == "Japan 2026"


def test_clearing_folder_and_emptying_title_return_to_defaults(tmp_path):
    block_id = _board(tmp_path, [{"type": "heading", "text": "Trip"}])
    store.pin(block_id, root=tmp_path)
    store.update_entry(block_id, {"folder": "X", "title": "Y"}, root=tmp_path)
    entry = store.update_entry(block_id, {"folder": "", "title": ""}, root=tmp_path)
    assert entry["folder"] is None
    assert entry["title"] == "Trip"  # empty rename means auto-title again


def test_update_entry_pins_on_demand_for_a_real_board(tmp_path):
    # The Library door PUTs an entry the shelf does not have yet: that is a pin, and only for a stored board.
    block_id = _board(tmp_path, [{"type": "divider"}])
    entry = store.update_entry(block_id, {"favorite": True}, root=tmp_path)
    assert entry["title"] == "Board" and entry["pinned"] is True
    with pytest.raises(store.NoSuchBlock):
        store.update_entry("0badc0de", {"title": "ghost"}, root=tmp_path)


# --- the file itself -----------------------------------------------------------------------------------------------


def test_library_survives_reload_from_disk(tmp_path):
    block_id = _board(tmp_path, [{"type": "heading", "text": "Persist me"}])
    store.pin(block_id, root=tmp_path)
    store.update_entry(block_id, {"folder": "Notes"}, root=tmp_path)
    entries = store.load_library(root=tmp_path)  # a fresh read of the file is the whole shelf
    assert entries[block_id]["title"] == "Persist me"
    assert entries[block_id]["folder"] == "Notes"
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T[0-9:.+Z-]+", entries[block_id]["saved_at"])


def test_damaged_library_reads_as_no_notes(tmp_path):
    (tmp_path / store.LIBRARY_FILE).write_text("{half", encoding="utf-8")
    assert store.load_library(root=tmp_path) == {}


def test_library_oversize_is_refused_whole(tmp_path):
    block_id = _board(tmp_path, [{"type": "text", "text": "hi"}])
    entries = {block_id: {"title": "x" * (store.LIBRARY_LIMIT + 10)}}
    with pytest.raises(store.LibraryTooBig):
        store.save_library(entries, root=tmp_path)
    assert not (tmp_path / store.LIBRARY_FILE).is_file()
