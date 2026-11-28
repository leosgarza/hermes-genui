"""The post_tool_call provenance hook: what a Hermes tool returned, show_blocks may draw — an https image URL or a
local file path image_generate saved. Exercises the real hook (hooks/tool_photos.py, which absorbed this branch's
media_provenance module), the real provenance store and the real show_blocks gate. No network, no disk outside
tmp_path.

The security half of this is refusal: a path or URL no tool returned must never be stored, because the Desktop half
reads a remembered local path from disk.
"""

import importlib
import json

import pytest

from conftest import load_plugin_package

load_plugin_package()
hook = importlib.import_module("hermes_genui.hooks.tool_photos")
tools = importlib.import_module("hermes_genui.tools.show_blocks")
plugin_store = importlib.import_module("hermes_genui.core.store")

GEN_URL = "https://images.example/generated/a.png"
GEN_PATH = "/Users/me/.hermes/cache/generated/images/openai_codex_a.png"
WIN_PATH = "C:\\Users\\me\\.hermes\\cache\\generated\\images\\a.png"


@pytest.fixture
def store_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(plugin_store, "default_root", lambda: tmp_path)
    return tmp_path


def board(url):
    return [{"type": "images", "title": "Generated", "images": [{"url": url, "caption": "a made image"}]}]


# --- remembering -----------------------------------------------------------------------------------------------


def test_generated_https_url_is_remembered_and_drawn(store_dir):
    hook.note_tool_photos(tool_name="image_generate", result={"success": True, "image": GEN_URL})
    assert GEN_URL in plugin_store.known_photo_urls(root=store_dir)
    result = tools.show_blocks({"blocks": board(GEN_URL)})
    assert result.startswith("Drawn.") and "::blocks{id=" in result  # accepted → a tag, not a refusal


def test_generated_local_path_is_remembered_and_drawn(store_dir):
    hook.note_tool_photos(tool_name="image_generate", result={"success": True, "image": GEN_PATH})
    assert GEN_PATH in plugin_store.known_photo_urls(root=store_dir)
    result = tools.show_blocks({"blocks": board(GEN_PATH)})
    assert result.startswith("Drawn.") and "::blocks{id=" in result


def test_generated_windows_path_is_remembered(store_dir):
    hook.note_tool_photos(tool_name="image_generate", result={"success": True, "image": WIN_PATH})
    assert WIN_PATH in plugin_store.known_photo_urls(root=store_dir)


def test_json_string_result_is_remembered_whichever_shape(store_dir):
    hook.note_tool_photos(tool_name="image_generate", result=json.dumps({"success": True, "image": GEN_URL}))
    hook.note_tool_photos(tool_name="image_generate", result=json.dumps({"success": True, "image": GEN_PATH}))
    assert {GEN_URL, GEN_PATH} <= plugin_store.known_photo_urls(root=store_dir)


def test_a_failed_generation_is_not_remembered(store_dir):
    hook.note_tool_photos(tool_name="image_generate",
                          result={"success": False, "image": None, "error": "provider down"})
    hook.note_tool_photos(tool_name="image_generate",
                          result=json.dumps({"success": False, "image": "/tmp/evil.png"}))
    assert plugin_store.known_photo_urls(root=store_dir) == set()


# --- refusing what is not a tool-returned drawable image -------------------------------------------------------


def test_made_up_url_is_still_refused(store_dir):
    hook.note_tool_photos(tool_name="image_generate", result={"success": True, "image": GEN_URL})
    result = tools.show_blocks({"blocks": board("https://made.up/never-returned.png")})
    assert result.startswith("Not drawn.")
    assert "use only image URLs that find_photos or image_generate returned" in result


def test_made_up_local_path_is_refused_end_to_end(store_dir):
    hook.note_tool_photos(tool_name="image_generate", result={"success": True, "image": GEN_PATH})
    result = tools.show_blocks({"blocks": board("/Users/me/.ssh/id_ed25519.png")})
    assert result.startswith("Not drawn.")
    assert "use only image URLs that find_photos or image_generate returned" in result


def test_wrong_shapes_are_not_remembered(store_dir):
    # The hook trusts what image_generate returned; anything that is not an https url or an absolute path
    # (a file:// spelling, a data: URI) is junk even beside a real result.
    for junk in ("file:///Users/me/a.png", "data:image/png;base64,AAAA"):
        hook.note_tool_photos(tool_name="image_generate", result={"success": True, "image": junk})
    assert plugin_store.known_photo_urls(root=store_dir) == set()


def test_relative_names_and_http_are_not_remembered(store_dir):
    for weak in ("a.png", "~/a.png", "http://x.example/a.png", "", None, 42, ["x"]):
        hook.note_tool_photos(tool_name="image_generate", result={"success": True, "image": weak})
    assert plugin_store.known_photo_urls(root=store_dir) == set()


def test_path_in_the_src_alias_is_not_a_provenance_photo(store_dir):
    # photos_in only watches `url` for images blocks, and the web reader takes a local path from `url` only:
    # a src-carrying path must never reach a stored board. (url carries a remembered https photo, so the block
    # passes check_images and the src path's photo would still need `url` membership - it has none.)
    hook.note_tool_photos(tool_name="image_generate", result={"success": True, "image": GEN_URL})
    blocks = [{"type": "images", "images": [{"url": GEN_URL}, {"src": "/Users/me/secret.png"}]}]
    result = tools.show_blocks({"blocks": blocks})
    assert result.startswith("Not drawn.")  # the second photo has no remembered url


def test_unrelated_tool_is_a_noop(store_dir):
    hook.note_tool_photos(tool_name="web_search", result={"success": True, "image": GEN_PATH})
    assert plugin_store.known_photo_urls(root=store_dir) == set()


def test_junk_never_raises(store_dir):
    for junk in (None, 42, "not json", {"image": None}, {"nope": 1}, [1, 2], "{half"):
        hook.note_tool_photos(tool_name="image_generate", result=junk)  # must not raise
    assert plugin_store.known_photo_urls(root=store_dir) == set()


def test_a_made_up_https_photo_beside_a_remembered_path_is_still_refused(store_dir):
    hook.note_tool_photos(tool_name="image_generate", result={"success": True, "image": GEN_PATH})
    blocks = [{"type": "images", "images": [{"url": "https://made.up/x.png"}, {"url": GEN_PATH}]}]
    result = tools.show_blocks({"blocks": blocks})
    assert result.startswith("Not drawn.")  # every photo in the block still needs its own provenance
