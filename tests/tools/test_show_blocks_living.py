"""Living Boards (enhancement #9) at the tool door: show_blocks gains two optional words.

  · `target` — the address (the id) of a board already drawn: the new blocks are written AT THAT ADDRESS as a
    new version, the answer is the SAME tag, and the live board in the chat updates instead of a second board
    being born. A wrong or unknown address is refused with a clear problem (never silently drawn fresh).
  · `links` — 1-3 other boards this one connects to, each by address with an optional one-line note (the
    AI-suggested connection). Every linked address must name a real stored board; the drawing side fetches
    them from the store by address — reach-back without redrawing.

A board with neither word is answered exactly as it always was (byte-for-byte): this is what every unsaid
board regression downstream leans on.
"""

import importlib
import json

import pytest

from conftest import load_plugin_package

load_plugin_package()
tools = importlib.import_module("hermes_genui.tools.show_blocks")
plugin_store = importlib.import_module("hermes_genui.core.store")

HEAD = {"type": "heading", "text": "Portfolio · Q4"}
KPI = {"type": "text", "text": "Value $128k · up 12.4% on the quarter"}


@pytest.fixture
def store_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(plugin_store, "default_root", lambda: tmp_path)
    return tmp_path


def stored_id(result: str) -> str:
    last = result.strip().splitlines()[-1]
    assert last.startswith('::blocks{id="') and last.endswith('"}'), result
    return last[len('::blocks{id="'):-2]


# --- target: update-in-place ---------------------------------------------------------------------------------------


def test_target_writes_a_new_version_at_the_same_address(store_dir):
    board_id = stored_id(tools.show_blocks({"blocks": [HEAD, KPI]}))
    nvda = {"type": "text", "text": "Best: NVDA +34%"}
    result = tools.show_blocks({"blocks": [HEAD, KPI, nvda], "target": board_id})
    assert stored_id(result) == board_id                       # the same tag — the address was kept
    board = plugin_store.load(board_id, root=store_dir)
    assert plugin_store.version_of(board) == 2
    assert plugin_store.blocks_of(board)[2] == nvda
    assert "v2" in result and "same" in result.lower()         # the answer tells the model what it did


def test_target_answer_carries_the_unchanged_paste_line(store_dir):
    board_id = stored_id(tools.show_blocks({"blocks": [HEAD]}))
    result = tools.show_blocks({"blocks": [{"type": "text", "text": "later"}], "target": board_id})
    assert f'Put this on its own line in your reply, exactly as it is:\n::blocks{{id="{board_id}"}}' in result


def test_target_is_accepted_with_a_leading_hash_and_case(store_dir):
    board_id = stored_id(tools.show_blocks({"blocks": [HEAD]}))
    result = tools.show_blocks({"blocks": [HEAD], "target": f"#{board_id.upper()}"})
    assert stored_id(result) == board_id                       # and it still answers the lower-case address
    assert plugin_store.version_of(plugin_store.load(board_id, root=store_dir)) == 2


def test_target_carries_the_boards_words_into_the_new_version(store_dir):
    board_id = stored_id(tools.show_blocks({"blocks": [HEAD]}))
    tools.show_blocks({"blocks": [HEAD, {"type": "text", "text": "tight"}],
                       "target": board_id, "density": "compact", "palette": "cool", "as_of": "Nov 19"})
    board = plugin_store.load(board_id, root=store_dir)
    assert plugin_store.density_of(board) == "compact"
    assert plugin_store.palette_of(board) == "cool"
    assert plugin_store.as_of_of(board) == "Nov 19"
    assert plugin_store.version_of(board) == 2


def test_unknown_target_is_refused_and_nothing_new_is_drawn(store_dir):
    result = tools.show_blocks({"blocks": [HEAD], "target": "0badc0de"})
    assert result.startswith("Not drawn.")
    assert "0badc0de" in result and "no stored board" in result
    assert list(store_dir.glob("*.json")) == []                # the refusal touched no disk


def test_malformed_target_is_refused_with_the_address_rule(store_dir):
    result = tools.show_blocks({"blocks": [HEAD], "target": "sevenbeef"})
    assert result.startswith("Not drawn.")
    assert "target" in result


def test_target_too_big_is_refused_with_history_intact(store_dir):
    board_id = stored_id(tools.show_blocks({"blocks": [HEAD]}))
    result = tools.show_blocks({"blocks": [{"type": "text", "text": "x" * (plugin_store.BOARD_LIMIT + 10)}],
                                "target": board_id})
    assert "too big" in result
    assert plugin_store.version_of(plugin_store.load(board_id, root=store_dir)) is None  # v1 untouched


def test_unsaid_boards_answer_exactly_as_they_always_did(store_dir):
    result = tools.show_blocks({"blocks": [HEAD, KPI], "align": "center"})
    board = plugin_store.load(stored_id(result), root=store_dir)
    assert plugin_store.version_of(board) is None              # an unsaid board says no version
    assert "updated" not in result.lower()


# --- the create path stays byte-stable ------------------------------------------------------------------------------


def test_create_answer_text_is_byte_stable(store_dir):
    # exact literal the accepted base answers with: nothing living-boards adds may touch it
    result = tools.show_blocks({"blocks": [HEAD]})
    board_id = stored_id(result)
    assert result == f'Put this on its own line in your reply, exactly as it is:\n::blocks{{id="{board_id}"}}'


# --- links: reach-back by address ----------------------------------------------------------------------------------


def test_links_store_addresses_and_notes(store_dir):
    q3 = stored_id(tools.show_blocks({"blocks": [{"type": "heading", "text": "Portfolio · Q3"}]}))
    result = tools.show_blocks({"blocks": [HEAD], "links": [{"id": q3, "note": "last quarter"}]})
    board = plugin_store.load(stored_id(result), root=store_dir)
    assert plugin_store.links_of(board) == [{"id": q3, "note": "last quarter"}]


def test_link_note_is_optional(store_dir):
    other = stored_id(tools.show_blocks({"blocks": [HEAD]}))
    result = tools.show_blocks({"blocks": [HEAD], "links": [other]})
    board = plugin_store.load(stored_id(result), root=store_dir)
    assert plugin_store.links_of(board) == [{"id": other}]


def test_link_to_an_unknown_address_is_refused(store_dir):
    result = tools.show_blocks({"blocks": [HEAD], "links": [{"id": "0badc0de"}]})
    assert result.startswith("Not drawn.")
    assert "0badc0de" in result


def test_four_links_are_refused_with_the_count(store_dir):
    ids = [stored_id(tools.show_blocks({"blocks": [{"type": "heading", "text": f"b{i}"}]})) for i in range(4)]
    result = tools.show_blocks({"blocks": [HEAD], "links": ids})
    assert result.startswith("Not drawn.")
    assert "1-3" in result


def test_a_board_does_not_link_to_itself(store_dir):
    board_id = stored_id(tools.show_blocks({"blocks": [HEAD]}))
    result = tools.show_blocks({"blocks": [{"type": "text", "text": "again"}],
                                "target": board_id, "links": [board_id]})
    assert result.startswith("Not drawn.")
    assert plugin_store.version_of(plugin_store.load(board_id, root=store_dir)) is None  # refusal wrote nothing


def test_duplicate_link_addresses_collapse(store_dir):
    other = stored_id(tools.show_blocks({"blocks": [HEAD]}))
    result = tools.show_blocks({"blocks": [HEAD], "links": [other, {"id": other}]})
    board = plugin_store.load(stored_id(result), root=store_dir)
    assert plugin_store.links_of(board) == [{"id": other}]


def test_links_ride_along_with_an_update(store_dir):
    q3 = stored_id(tools.show_blocks({"blocks": [{"type": "heading", "text": "Portfolio · Q3"}]}))
    board_id = stored_id(tools.show_blocks({"blocks": [HEAD]}))
    tools.show_blocks({"blocks": [HEAD, {"type": "text", "text": "vs Q3"}],
                       "target": board_id, "links": [{"id": q3, "note": "linked across time"}]})
    board = plugin_store.load(board_id, root=store_dir)
    assert plugin_store.version_of(board) == 2
    assert plugin_store.links_of(board) == [{"id": q3, "note": "linked across time"}]


def test_links_note_never_carries_control_characters(store_dir):
    other = stored_id(tools.show_blocks({"blocks": [HEAD]}))
    result = tools.show_blocks({"blocks": [HEAD], "links": [{"id": other, "note": "a\x00b"}]})
    board = plugin_store.load(stored_id(result), root=store_dir)
    json.dumps(plugin_store.links_of(board))                   # storable: what was written is clean
    assert "\x00" not in plugin_store.links_of(board)[0]["note"]
