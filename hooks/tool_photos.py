"""post_tool_call observer: remember image references from a short allowlist of Hermes tools.

find_photos already records the URLs it returns. Generated images come back through Hermes's own image tools instead,
so the same provenance store needs a second writer. Only named image tools are observed, and only drawable references
are kept: an https image URL, or the absolute local path image_generate saves into the agent's image cache (Desktop
reads those back through the host's own file reader). A fetched web page, a relative name, file:// and data: spellings
and any other tool's output can never approve an image here.

Original proposal and scope by @leosgarza in sagarmainkar/hermes-genui#11; this implementation reworks that idea for
0.3.0.
"""

from __future__ import annotations

import json
from typing import Any

from ..blocks.common import is_https, is_local_path
from ..core import store

# A short, named allowlist. Adding a tool here is a deliberate decision, not a pattern match over every tool result.
PHOTO_TOOLS: frozenset[str] = frozenset({"image_generate"})
# The plugin's own stand-in is observed only while its setting is on, so a testing tool can walk the whole path from
# tool to hook to board without ever widening the shipped allowlist.
_standin_on = False
MAX_URLS = 12  # the images block takes at most 12 photos
MAX_DEPTH = 4


def record_standin(on: bool) -> None:
    """Called when the plugin registers: the stand-in is observed only when photo_test_tool is on."""
    global _standin_on
    _standin_on = bool(on)


def _observed(tool_name: str) -> bool:
    return tool_name in PHOTO_TOOLS or (tool_name == "standin_photos" and _standin_on)
def _urls(value: Any, depth: int = 0) -> list[str]:
    """https strings anywhere in a tool result, in order, without repeats."""
    found: list[str] = []
    seen: set[str] = set()

    def add(url: str) -> None:
        if url.startswith("https://") and url not in seen:
            seen.add(url)
            found.append(url)

    def walk(item: Any, level: int) -> None:
        if level > MAX_DEPTH:
            return
        if isinstance(item, str):
            text = item.strip()
            if text.startswith("https://"):
                add(text)
            elif text.startswith("{") or text.startswith("["):
                try:
                    walk(json.loads(text), level + 1)
                except (ValueError, TypeError):
                    pass
        elif isinstance(item, dict):
            for sub in item.values():
                walk(sub, level + 1)
        elif isinstance(item, (list, tuple)):
            for sub in item:
                walk(sub, level + 1)

    walk(value, depth)
    return found[:MAX_URLS]


def _local_images(result: Any) -> list[str]:
    """The absolute local paths a result names as its own image, in order, without repeats.

    Only the documented `image` field of a result that did not fail counts: a path quoted inside a log line or an
    error message is not something a tool made, and must never approve a photo. A result given as a JSON string is
    read the same way.

    {"success": true, "image": "/Users/me/a.png"} → ["/Users/me/a.png"]
    {"success": false, "image": "/tmp/x.png"}     → []
    """
    refs: list[str] = []

    def add(value: Any) -> None:
        if isinstance(value, str) and is_local_path(value.strip()) and value.strip() not in refs:
            refs.append(value.strip())

    item = result
    if isinstance(item, str):
        try:
            item = json.loads(item)
        except (ValueError, TypeError):
            return []
    if isinstance(item, dict):
        if item.get("success") is False:
            return []
        add(item.get("image"))
        images = item.get("images")
        if isinstance(images, list):
            for one in images:
                if isinstance(one, dict):
                    add(one.get("url"))
                else:
                    add(one)
    return refs


def note_tool_photos(*, tool_name: str, result: Any = None, **kwargs: Any) -> None:
    """Hermes hook: note the image references an allowed tool returned, https or generated local path. Never raises
    into the caller."""
    if not _observed(tool_name):
        return
    try:
        made = _local_images(result)
        refs = made + [url for url in _urls(result) if url not in made]
        if refs:
            store.remember_photo_urls(refs)
    except Exception:  # noqa: BLE001 - an observer must never break the tool call it watches
        pass
