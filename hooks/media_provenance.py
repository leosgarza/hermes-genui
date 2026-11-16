"""post_tool_call observer: remember the images Hermes's own tools return, so show_blocks can draw them inline.
Reuses the existing provenance store (core/store.py) — no new block type, no new prompt text, no network calls.

An https image URL is remembered as before (a hosted generation). New: so is an **absolute local path** — what
`image_generate` returns when it saves the file into the agent's image cache. Desktop reads exactly those paths back
through the host's own file reader, and only after show_blocks' provenance gate has matched a board's photo against
this store; a path no tool returned never reaches a stored board. Relative names, file:// and data: spellings and
junk are ignored; the hook never raises: an observer must not break a tool's reply.

    image_generate returns {"success": true, "image": "/Users/me/.../a.png"} (or https) → the reference is noted.
    A made-up path the model invents is still refused by show_blocks, because no tool returned it.
"""

import json

from ..blocks.common import is_https, is_local_path
from ..core import store

# Tools whose result may carry an image Hermes produced. image_generate returns {"image": url-or-local-path}.
IMAGE_TOOLS = frozenset({"image_generate"})


def _image_references(result: object) -> list[str]:
    """The drawable image references in a tool result: the `image` field of a successful result (an https URL or an
    absolute local path), or of a result given as a JSON string. A failure, an http:// URL, a relative name or junk
    gives []. Never raises.

    {"success": true, "image": "https://x.example/a.png"} → ["https://x.example/a.png"]
    {"success": true, "image": "/Users/me/a.png"}         → ["/Users/me/a.png"]
    {"success": false, "image": "/tmp/x.png"}             → []
    """
    if isinstance(result, str):
        try:
            result = json.loads(result)
        except (json.JSONDecodeError, ValueError):
            return []
    if not isinstance(result, dict) or result.get("success") is False:
        return []
    image = result.get("image")
    if not isinstance(image, str):
        return []
    if is_https(image) or is_local_path(image):
        return [image]
    return []


def media_provenance(tool_name: str = "", result: object = None, **kwargs) -> None:
    """The post_tool_call hook: note image URLs and generated local file paths a Hermes tool returned, so they can
    be drawn. A no-op for other tools or non-image results; never raises.

    ("image_generate", {"success": true, "image": "/Users/me/a.png"}) → the path is remembered.
    ("web_search", {...}) → nothing.
    """
    try:
        if tool_name not in IMAGE_TOOLS:
            return
        references = _image_references(result)
        if references:
            store.remember_photo_urls(references)
    except Exception:
        return
