"""The block store: one JSON file per drawn block, named by a short random id.

A tool saves a list of blocks and gets back an id; the reply carries only `::blocks{id="..."}`,
and the Desktop half fetches the JSON by that id. Blocks are never deleted, so old chats still draw.
"""

import json
import re
import secrets
from datetime import UTC, datetime
from pathlib import Path

# 8 lowercase hex characters, e.g. "7f3a09bc". Anything else is refused before touching the disk.
ID_PATTERN = r"^[0-9a-f]{8}$"


# Where a profile keeps its blocks, under its Hermes home.
STORE_DIR = Path("plugin-data") / "hermes-genui" / "blocks"


def default_root() -> Path:
    """Where this profile keeps its blocks: <hermes home>/plugin-data/hermes-genui/blocks."""
    from hermes_constants import get_hermes_home  # only importable inside Hermes

    return get_hermes_home() / STORE_DIR


def profile_stores(hermes_root: Path | None = None) -> list[Path]:
    """Every profile's block store on this machine: the root profile's, then each named profile's, by name. Folders
    starting with "." (such as the profiles/.deleted tombstone) are not profiles. Outside Hermes, with no root given,
    there are none.

    profile_stores(~/.hermes) → [~/.hermes/plugin-data/hermes-genui/blocks,
                                 ~/.hermes/profiles/claude/plugin-data/hermes-genui/blocks, ...]
    """
    if hermes_root is None:
        try:
            from hermes_constants import get_default_hermes_root
        except ImportError:
            return []
        hermes_root = get_default_hermes_root()
    profiles = hermes_root / "profiles"
    found = profiles.iterdir() if profiles.is_dir() else []
    named = sorted(p for p in found if p.is_dir() and not p.name.startswith("."))
    return [home / STORE_DIR for home in [hermes_root, *named]]


def find_root(block_id: str, roots: list[Path] | None = None) -> Path | None:
    """The store that holds a board: the active profile's first, then every other profile's. Hermes Desktop lists
    sessions from all profiles but asks the active profile for a board, so a board drawn in profile A and viewed while
    profile B is active is only in A's store (issue #6). None when the id is malformed or no store has it.

    find_root("7f3a09bc") → ~/.hermes/profiles/claude/plugin-data/hermes-genui/blocks;  find_root("../x") → None
    """
    if not re.fullmatch(ID_PATTERN, block_id or ""):
        return None
    for folder in roots if roots is not None else [default_root(), *profile_stores()]:
        if (folder / f"{block_id}.json").is_file():
            return folder
    return None


# The most a stored board may take on disk. show_blocks refuses a bigger one with a note to the model first; this is
# the last guard for every other caller.
BOARD_LIMIT = 256 * 1024


class BoardTooBig(ValueError):
    """The board is over BOARD_LIMIT bytes as JSON."""


def board_size(blocks: list | dict) -> int:
    """How many bytes a board takes stored: board_size([{"type": "divider"}]) → 20"""
    return len(json.dumps(blocks, ensure_ascii=False).encode("utf-8"))


def save(blocks: list[dict] | dict, root: Path | None = None) -> str:
    """Store a board — a list of blocks, or the envelope {"align": ..., "blocks": [...]} that says where the whole
    board sits — and return its new id. Refused (BoardTooBig, nothing written) over BOARD_LIMIT.

    The id is one no store on this machine uses yet (with root given, no board in root), so a new board never
    overwrites an old one and find_root never finds another profile's board under the same id.
    """
    text = json.dumps(blocks, ensure_ascii=False)
    if len(text.encode("utf-8")) > BOARD_LIMIT:
        raise BoardTooBig(f"{len(text.encode('utf-8'))} bytes")
    folder = root or default_root()
    folder.mkdir(parents=True, exist_ok=True)
    block_id = _unused_id([root] if root else [folder, *profile_stores()])
    _write_whole(folder / f"{block_id}.json", text)
    return block_id


def _unused_id(stores: list[Path]) -> str:
    """A random id with no board under it in any of these stores. With 4.3 billion ids and a few thousand boards, the
    first pick is almost always free; a taken one is simply drawn again.

    _unused_id([active, other]) where other holds a6600503.json → never "a6600503"
    """
    while True:
        block_id = secrets.token_hex(4)
        if not any((folder / f"{block_id}.json").exists() for folder in stores):
            return block_id


def _write_whole(path: Path, text: str) -> None:
    """Write a file so a reader sees the old one or the new one, never half of it: the text goes to <name>.tmp in
    the same folder, which then replaces the file in one step.

    _write_whole(.../7f3a09bc.json, "[...]") → writes 7f3a09bc.json.tmp, then renames it to 7f3a09bc.json
    """
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)  # os.replace: one step, on the same disk


def _read_json(path: Path) -> object | None:
    """A JSON file's contents, or None when it is missing or isn't readable JSON (a damaged file is treated as no
    file, so the API answers 404 rather than failing)."""
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


def size(block_id: str, root: Path | None = None) -> int | None:
    """How many bytes a stored board takes, without reading it; None when the id is malformed or unknown.

    size("7f3a09bc") → 2048;  size("../etc/passwd") → None
    """
    if not re.fullmatch(ID_PATTERN, block_id or ""):
        return None
    path = (root or default_root()) / f"{block_id}.json"
    return path.stat().st_size if path.is_file() else None


def load(block_id: str, root: Path | None = None) -> list[dict] | dict | None:
    """The stored board for an id — a list of blocks, or an envelope carrying the board's own alignment — or None
    when the id is malformed or unknown.

    load("7f3a09bc") → [{"type": "chart", ...}]
    load("../etc/passwd") → None (never a path outside the store)
    load("0badc0de") where the file holds "[{not json" → None
    """
    if not re.fullmatch(ID_PATTERN, block_id or ""):
        return None
    return _read_json((root or default_root()) / f"{block_id}.json")


# --- the two shapes a stored board comes in ----------------------------------------------------------------------


def blocks_of(board: object) -> list:
    """The blocks inside a stored board, either shape: the plain list it has always been, or the envelope
    {"align": ..., "blocks": [...]} that carries a whole-board alignment beside them. Anything else gives no blocks.

    blocks_of([chart, source]) → [chart, source]
    blocks_of({"align": "center", "blocks": [chart]}) → [chart]
    blocks_of(None) → []
    """
    if isinstance(board, list):
        return board
    if isinstance(board, dict) and isinstance(board.get("blocks"), list):
        return board["blocks"]
    return []


def align_of(board: object) -> str | None:
    """The alignment word a stored envelope carries for the whole board, or None. The word is checked where it is
    drawn (the web side reads anything that isn't left, center or right as left), as every model word is.

    align_of({"align": "right", "blocks": [x]}) → "right";  align_of([x]) → None
    """
    word = board.get("align") if isinstance(board, dict) else None
    return word if isinstance(word, str) else None


def text_align_of(board: object) -> str | None:
    """The text-alignment word a stored envelope carries for the whole board (how the words inside the blocks
    read), or None. Like the align word it is checked where it is drawn; the store keeps any text as written.

    text_align_of({"text_align": "center", "blocks": [x]}) → "center";  text_align_of([x]) → None
    """
    word = board.get("text_align") if isinstance(board, dict) else None
    return word if isinstance(word, str) else None


def density_of(board: object) -> str | None:
    """The density word a stored envelope carries for the whole board, or None. The word is checked where it is
    drawn (the web side reads anything that isn't comfortable or compact as comfortable), as every model word is.

    density_of({"density": "compact", "blocks": [x]}) → "compact";  density_of([x]) → None
    """
    word = board.get("density") if isinstance(board, dict) else None
    return word if isinstance(word, str) else None


def palette_of(board: object) -> str | None:
    """The chart-palette word a stored envelope carries for the whole board, or None. Checked where drawn
    (anything that isn't default, cool or warm draws the house colours); the store keeps any text as written.

    palette_of({"palette": "cool", "blocks": [x]}) → "cool";  palette_of([x]) → None
    """
    word = board.get("palette") if isinstance(board, dict) else None
    return word if isinstance(word, str) else None


def motion_of(board: object) -> str | None:
    """The motion word a stored envelope carries for the whole board, or None. Checked where drawn (anything
    that isn't full or reduced is as unsaid), never overriding a reader's own reduced-motion ask there.

    motion_of({"motion": "reduced", "blocks": [x]}) → "reduced";  motion_of([x]) → None
    """
    word = board.get("motion") if isinstance(board, dict) else None
    return word if isinstance(word, str) else None


def as_of_of(board: object) -> str | None:
    """The date line a stored envelope carries for the whole board, or None. Like the align word it is checked
    where it is drawn; here only what was never text (or is empty) is refused.

    as_of_of({"as_of": "2026-11-18", "blocks": [x]}) → "2026-11-18";  as_of_of({"as_of": 5, ...}) → None
    """
    line = board.get("as_of") if isinstance(board, dict) else None
    return line if isinstance(line, str) and line else None


def live_of(board: object) -> bool | None:
    """Whether a stored envelope says its figures are live: True or False when it carries a real bool (False is a
    word of its own — a snapshot — and not an absence), None when it says nothing or says it any other way.

    live_of({"live": false, "blocks": [x]}) → False;  live_of({"live": "yes", ...}) → None
    """
    flag = board.get("live") if isinstance(board, dict) else None
    return flag if isinstance(flag, bool) else None


def follow_ups_of(board: object) -> list | None:
    """The tappable follow-ups a stored envelope carries for the whole board, or None. The shape was checked
    where it was written (show_blocks refuses an unusable one); here only "is it a list with anything in it".

    follow_ups_of({"follow_ups": [{"label": "Go", "run": "More"}], "blocks": [x]}) → [that list]
    follow_ups_of([x]) → None;  follow_ups_of({"follow_ups": "yes", ...}) → None
    """
    ups = board.get("follow_ups") if isinstance(board, dict) else None
    return ups if isinstance(ups, list) and ups else None


PHOTO_LIST = "photo-urls.txt"
# Only the most recent photo URLs are kept: enough for the boards of a conversation, and the file stays small.
MAX_PHOTO_URLS = 500


def remember_photo_urls(urls: list[str], root: Path | None = None) -> None:
    """Note photo URLs a tool returned, so show_blocks can refuse any the model made up. Only the last 500 are kept.

    450 noted, then 100 more → the file holds the last 350 of the first lot and all 100 new ones
    """
    folder = root or default_root()
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / PHOTO_LIST
    old = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    kept = [line for line in old if line.strip()] + [url for url in urls if url]
    _write_whole(path, "".join(f"{url}\n" for url in kept[-MAX_PHOTO_URLS:]))


def known_photo_urls(root: Path | None = None) -> set[str]:
    path = (root or default_root()) / PHOTO_LIST
    if not path.is_file():
        return set()
    return {line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()}


# What the user did to a stored board (a checklist's ticks), kept beside it as <id>.state.json so it follows them to
# every device. Small by design: a list of ticks per checklist, nothing like a document.
STATE_LIMIT = 20 * 1024


class NoSuchBlock(LookupError):
    """The id is malformed, or no board is stored under it."""


class StateTooBig(ValueError):
    """The state is over STATE_LIMIT bytes as JSON."""


def load_state(block_id: str, root: Path | None = None) -> dict:
    """The saved state for a board, or {} when there is none (or the id is malformed).

    load_state("7f3a09bc") → {"0": [0, 2]}   (the first block, a checklist, has items 0 and 2 ticked)
    load_state("../etc/passwd") → {}
    load_state("7f3a09bc") where the file holds "{half" → {}
    """
    if not re.fullmatch(ID_PATTERN, block_id or ""):
        return {}
    state = _read_json((root or default_root()) / f"{block_id}.state.json")
    return state if isinstance(state, dict) else {}


def save_state(block_id: str, state: dict, root: Path | None = None) -> None:
    """Replace a board's saved state. Refused for an id with no stored board, and for a state over 20 KB.

    save_state("7f3a09bc", {"0": [0, 2]}) → written to 7f3a09bc.state.json
    save_state("0badc0de", {...}) where no such board → NoSuchBlock;  {"0": "x" * 30000} → StateTooBig
    """
    if load(block_id, root) is None:
        raise NoSuchBlock(block_id)
    text = json.dumps(state, ensure_ascii=False)
    if len(text.encode("utf-8")) > STATE_LIMIT:
        raise StateTooBig(block_id)
    _write_whole((root or default_root()) / f"{block_id}.state.json", text)


# --- the Library shelf ------------------------------------------------------------------
# A pin is a note, not a copy: one small JSON file, in this profile's store folder, holding
# {board id: {title, folder, favorite, pinned, saved_at}}. The boards themselves stay exactly where
# they have always stayed and are never touched by a shelf edit — removing a pin removes only the
# note (the store has no delete at all), so an unpinned board still loads and still draws wherever
# its tag was quoted. Nothing here reaches the network: the shelf is a local file, read and written
# like every other piece of the store.

LIBRARY_FILE = "library.json"
LIBRARY_LIMIT = 64 * 1024
TITLE_LIMIT = 60  # a shelf label, not a document; rename says whatever you want, this is only the auto title

# The words a board can title itself with, in order: what a heading says, what a chart or table is
# called, what a bare text block opens with. Checked where it is read, like every model word.
TITLE_WORDS = ("title", "caption", "text", "label")


class LibraryTooBig(ValueError):
    """The shelf note file grew over LIBRARY_LIMIT bytes."""


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def title_of(board: object) -> str:
    """The board's own first words, as a shelf label: depth first through the blocks (a heading inside a
    section titles the board just as well as one at the top), collapsing whitespace and bounded at
    TITLE_LIMIT with an ellipsis. "Board" when the board says nothing anywhere.

    title_of([{"type": "heading", "text": "Kyoto trip planner"}]) → "Kyoto trip planner"
    title_of({"blocks": [{"type": "chart", "spec": {"title": "Q3 sales"}}]}) → "Q3 sales"
    title_of([{"type": "divider"}]) → "Board"
    """
    stack = list(blocks_of(board))
    while stack:
        block = stack.pop(0)
        if isinstance(block, dict):
            spec = block.get("spec")
            for value in (block.get(w) for w in TITLE_WORDS):
                if isinstance(value, str) and value.strip():
                    return _label(value)
            spec_title = spec.get("title") if isinstance(spec, dict) else None
            if isinstance(spec_title, str) and spec_title.strip():
                return _label(spec_title)
            if isinstance(block.get("children"), list):
                stack = block["children"] + stack
            tabs = block.get("tabs")
            if isinstance(tabs, list):
                kids = [
                    c for t in tabs
                    if isinstance(t, dict) and isinstance(t.get("children"), list) for c in t["children"]
                ]
                stack = kids + stack
    return "Board"


def _label(value: str) -> str:
    """One readable line out of whatever words a block said."""
    collapsed = " ".join(value.split())
    if len(collapsed) <= TITLE_LIMIT:
        return collapsed
    return collapsed[: TITLE_LIMIT - 1].rstrip() + "…"


def _shelf(root: Path | None = None) -> Path:
    folder = root or default_root()
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _board_of(block_id: str, root: Path | None) -> object:
    """The stored board a shelf note needs: this folder's first, then (only when no folder was given)
    every other profile's — the same doors find_root already opens, so no new lookup exists here."""
    board = load(block_id, root)
    if board is None and root is None:
        found = find_root(block_id)
        board = load(block_id, found) if found else None
    return board


def load_library(root: Path | None = None) -> dict:
    """Every pin note, {board id: entry}; {} when the shelf is empty, missing or unreadable — a damaged
    note file is treated as no notes, exactly like a damaged board file."""
    notes = _read_json((root or default_root()) / LIBRARY_FILE)
    return notes if isinstance(notes, dict) else {}


def save_library(entries: dict, root: Path | None = None) -> None:
    """Replace the whole shelf note file, written whole so a reader sees the old one or the new one.
    Refused over LIBRARY_LIMIT bytes, with nothing written."""
    text = json.dumps(entries, ensure_ascii=False)
    if len(text.encode("utf-8")) > LIBRARY_LIMIT:
        raise LibraryTooBig(f"{len(text.encode('utf-8'))} bytes")
    _write_whole(_shelf(root) / LIBRARY_FILE, text)


def pin(block_id: str, title: str | None = None, root: Path | None = None) -> dict:
    """Mark a board saved. The board must really be stored (NoSuchBlock otherwise — a note without a
    board is a lie the Library would reopen as a broken link). The label comes from the board's own
    words unless one was given. Re-pinning keeps the note's edits (title, folder, favorite, saved_at);
    it is the same board being saved, not a new save."""
    board = _board_of(block_id, root)
    if board is None:
        raise NoSuchBlock(block_id)
    notes = load_library(root)
    entry = notes.get(block_id)
    if not isinstance(entry, dict):
        entry = {"title": None, "folder": None, "favorite": False, "saved_at": _now()}
    entry["pinned"] = True
    if title is not None and title.strip():
        entry["title"] = _label(title)
    elif not entry.get("title"):
        entry["title"] = title_of(board)
    notes[block_id] = entry
    save_library(notes, root)
    return entry


def update_entry(block_id: str, words: dict, root: Path | None = None) -> dict:
    """Organize one note: rename, move to folder, favorite. Only the words present in the call change;
    an empty title means the board's own words again, an empty folder means the shelf with no folder.
    An id with no note yet is a pin: put away first, organize second — and only a stored board may be."""
    if not isinstance(words, dict):
        raise ValueError("words must be an object")
    board = _board_of(block_id, root)
    if board is None:
        raise NoSuchBlock(block_id)
    notes = load_library(root)
    entry = notes.get(block_id)
    if not isinstance(entry, dict):
        entry = pin(block_id, root=root)
    if "title" in words:
        line = words["title"]
        entry["title"] = _label(line) if isinstance(line, str) and line.strip() else title_of(board)
    if "folder" in words:
        line = words["folder"]
        entry["folder"] = _label(line) if isinstance(line, str) and line.strip() else None
    if "favorite" in words:
        entry["favorite"] = bool(words["favorite"])
    entry["pinned"] = True
    notes[block_id] = entry
    save_library(notes, root)
    return entry


def unpin(block_id: str, root: Path | None = None) -> bool:
    """Take a board off the shelf: the NOTE goes, the board stays. This is the whole of the remove
    semantics — the store never deletes boards, so unpinning cannot destroy anything a chat still
    quotes; the tag keeps drawing, only the Library stops listing it. True when a note was there.

    unpin("7f3a09bc") → False afterwards: the note;  and 7f3a09bc.json still loads its board.
    """
    notes = load_library(root)
    if block_id not in notes:
        return False
    del notes[block_id]
    save_library(notes, root)
    return True
