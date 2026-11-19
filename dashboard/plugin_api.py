"""Serves stored blocks to the Desktop half: GET /api/plugins/hermes-genui/blocks/<id>, plus what the user did to
them (a checklist's ticks): GET and PUT /blocks/<id>/state. Desktop asks the active profile for every board, so a board
missing from this profile's store is looked up in the other profiles' stores (store.find_root), and its ticks are kept
beside it there.

Hermes imports this file on its own (not as part of the plugin package), so core/store.py is loaded by path
(it imports nothing from the package).
"""

import importlib.util
import json
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


def _load_store():
    path = Path(__file__).resolve().parent.parent / "core" / "store.py"
    spec = importlib.util.spec_from_file_location("hermes_genui_store", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


store = _load_store()
router = APIRouter()


@router.get("/blocks/{block_id}")
async def get_block(block_id: str):
    board = store.load(block_id, store.find_root(block_id))
    if board is None:
        return JSONResponse({"error": "not found"}, status_code=404)
    # `stored` is the envelope exactly as it was saved, riding along so a board's JSON export is the board's
    # OWN words — unknown fields and all — with no second read and no request at export time (enhancement #6:
    # an export is a deterministic host act, local to the page). The drawer ignores the key; its reader
    # (core/readBlocks.ts) reads the words it knows, as it always did.
    answer = {"blocks": store.blocks_of(board), "stored": board}
    if (word := store.align_of(board)) is not None:  # the board's own alignment default, when it has one
        answer["align"] = word
    if (word := store.text_align_of(board)) is not None:  # and its text default: how the words inside read
        answer["text_align"] = word
    if (word := store.density_of(board)) is not None:  # and its look words: how it packs, colours, moves
        answer["density"] = word
    if (word := store.palette_of(board)) is not None:
        answer["palette"] = word
    if (word := store.motion_of(board)) is not None:
        answer["motion"] = word
    if (as_of := store.as_of_of(board)) is not None:  # and its provenance: when the data is from, live or snapshot
        answer["as_of"] = as_of
    if (live := store.live_of(board)) is not None:
        answer["live"] = live
    if (ups := store.follow_ups_of(board)) is not None:  # and its tappable follow-ups, when the board offers them
        answer["follow_ups"] = ups
    return answer


NOT_FOUND = {"error": "not found"}


@router.get("/blocks/{block_id}/state")
async def get_state(block_id: str):
    """{"state": {...}} once something is saved, {} before; 404 when no board has this id."""
    root = store.find_root(block_id)
    if root is None or store.load(block_id, root) is None:
        return JSONResponse(NOT_FOUND, status_code=404)
    state = store.load_state(block_id, root)
    return {"state": state} if state else {}


# The most a PUT body may be. The state itself is capped at store.STATE_LIMIT (20 KB); this is the request around it.
BODY_LIMIT = 32 * 1024
TOO_BIG = {"error": "state too big"}


async def _body(request: Request) -> bytes | None:
    """The request body, or None when it is (or says it is) over BODY_LIMIT. A stated Content-Length is checked
    before anything is read; without one, reading stops as soon as the limit is passed.

    Content-Length 40000 → None (nothing read);  no Content-Length, 40 KB streamed → None after 32 KB;  b'{}' → b'{}'
    """
    stated = request.headers.get("content-length")
    if stated is not None and (not stated.isdigit() or int(stated) > BODY_LIMIT):
        return None
    body = b""
    async for chunk in request.stream():
        body += chunk
        if len(body) > BODY_LIMIT:
            return None
    return body


@router.put("/blocks/{block_id}/state")
async def put_state(block_id: str, request: Request):
    """Body {"state": {...}} replaces the saved state. The id is checked before the body is read, and a body over
    32 KB is refused unread.

    {"state": {"0": [1]}} → 200;  unknown id → 404;  state over 20 KB or body over 32 KB → 413;
    {"state": [1]} or not JSON → 400
    """
    root = store.find_root(block_id)
    if root is None or store.load(block_id, root) is None:
        return JSONResponse(NOT_FOUND, status_code=404)
    raw = await _body(request)
    if raw is None:
        return JSONResponse(TOO_BIG, status_code=413)
    try:
        body = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        body = None
    state = body.get("state") if isinstance(body, dict) else None
    if not isinstance(state, dict):
        return JSONResponse({"error": "body must be {\"state\": {...}}"}, status_code=400)
    try:
        store.save_state(block_id, state, root)
    except store.NoSuchBlock:
        return JSONResponse(NOT_FOUND, status_code=404)
    except store.StateTooBig:
        return JSONResponse(TOO_BIG, status_code=413)
    return {"ok": True}


# --- the Library door -------------------------------------------------------------------
# The shelf is a local file inside the same store folder as the boards: these three routes read and
# write that file and nothing else. No account, no cloud, no network — a pin never leaves the machine.
# Semantics, pinned by tests: PUT requires a real stored board (auto-title from the board's own
# words, or the words given); DELETE removes only the note — the board keeps answering /blocks/{id}
# and is never deleted by anything on this door (the store has no delete at all).

WORD_TYPES = {"title": str, "folder": str, "favorite": bool}


def _entry_rows(entries: dict) -> list[dict]:
    """The shelf as rows, newest first, each saying honestly whether its board answers on this machine."""
    rows = []
    newest_first = sorted(entries.items(), key=lambda kv: str(_note_of(kv[1]).get("saved_at", "")), reverse=True)
    for block_id, note in newest_first:
        note = _note_of(note)
        if not note:
            continue
        rows.append({
            "id": block_id,
            "title": note.get("title") or "",
            "folder": note.get("folder") or None,
            "favorite": bool(note.get("favorite")),
            "pinned": True,
            "saved_at": note.get("saved_at") or "",
            "exists": store.find_root(block_id) is not None,
        })
    return rows


def _note_of(note: object) -> dict:
    return note if isinstance(note, dict) else {}


@router.get("/library")
async def get_library():
    """{"entries": [...]} — exactly the pinned boards, newest saved first, with the organize words
    (title, folder, favorite) and an exists flag for the rare note whose board lives in no store here."""
    return {"entries": _entry_rows(store.load_library())}


@router.put("/library/{block_id}")
async def put_library_entry(block_id: str, request: Request):
    """Pin, or organize a pin. Body {} saves the board as its own words titled it; the words title,
    folder and favorite set exactly those fields. Unknown words or wrong types are refused (400) with
    nothing written; a board that is not stored is 404 — the Library never notes a broken link.
    An empty title means the board's own words again; an empty folder means the shelf, unfiled.
    """
    if store.find_root(block_id) is None:
        return JSONResponse(NOT_FOUND, status_code=404)
    raw = await _body(request)
    if raw is None:
        return JSONResponse(TOO_BIG, status_code=413)
    try:
        body = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        body = None
    if not isinstance(body, dict) or not all(
        key in WORD_TYPES and isinstance(value, WORD_TYPES[key]) for key, value in body.items()
    ):
        return JSONResponse(
            {"error": "body must be {} or words title/folder/favorite of the right type"}, status_code=400
        )
    try:
        if body:
            entry = store.update_entry(block_id, body)
        else:
            entry = store.pin(block_id)
    except store.NoSuchBlock:
        return JSONResponse(NOT_FOUND, status_code=404)
    except store.LibraryTooBig:
        return JSONResponse({"error": "library too big"}, status_code=413)
    return {"entry": {"id": block_id, **entry}}


@router.delete("/library/{block_id}")
async def delete_library_entry(block_id: str):
    """Take the note off the shelf. The board itself stays stored and keeps answering GET /blocks —
    remove-from-Library never destroys anything a chat still quotes. {"removed": false} when there
    was no note (id malformed or never pinned): saying nothing happened is cheaper than a lie."""
    return {"ok": True, "removed": store.unpin(block_id)}
