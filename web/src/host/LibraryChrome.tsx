// The Library (enhancement #8): a shelf of saved boards, entirely on this machine. A pin is a note the door
// keeps in the store folder beside the boards themselves (core/store.py) — the board never moves, never gets
// copied, and never leaves: no account, no cloud, no request to anywhere but the plugin's own local door.
// The vendor shelves this mirrors are artifact-shaped (Claude) and file-shaped (ChatGPT); a board-level pin
// for inline chat visuals is an [inferred] synthesis of the two — what is genuinely ours is the local-first
// privacy, and the honesty that removing a pin removes ONLY the note: the stored board keeps answering and
// keeps drawing wherever its tag was quoted (the store has no delete at all; the semantics are pinned by
// tests at both ends, door and page).
// Two quiet controls join the board's chrome row beside the expand and export pair:
//  · SAVE (pin) — marks this drawn board saved under its own words (the door's auto-title) and back again;
//    aria-pressed carries the truth the file carries, refetched on mount, so a reload shows the state.
//  · LIBRARY — the established window-covering dialog (the expand overlay's pattern: one layer on the
//    shared stack, focus in on open, restored to the control on close, Tab trapped to the dialog's own
//    eligible controls, Escape stepping down exactly one layer): the shelf grouped Favorites, folders,
//    Unfiled, newest first. Each row opens the saved board right here in the dialog — rendered from the
//    door's own answer through the same reader and the same Blocks the inline board went through, so a
//    reopen draws the board's data AND its layout, not a picture of it — adds it back to the chat as
//    context through the real send seam (the ::blocks{id} tag is the plugin's one board reference), and
//    organizes it (favorite, rename, folder, remove). A board that is expanded takes the dialog's own
//    chrome; the shelf lives at rest, one view at a time.
// Nothing stateful is ever mounted twice: the dialog is the overlay element itself (a class and an ARIA
// toggle on one node), the reopened board is the one instance the dialog draws, and closing the dialog
// retires it — the inline board never felt a thing.
// Two review-round corrections ride here (t_0559173f round 2):
//  · A REOPENED board answers to its OWN id: the dialog inherits the host board's BlockActions context,
//    and a saved board B standing inside board A's shelf must save its ticks where B saves them
//    (/blocks/B/state), not into A. The reopened Blocks therefore re-provide the host actions with
//    blockId = view.id — one override covers every block that reads the id through the context
//    (checklist and form today; a block that never reads it is untouched by construction).
//  · The shelf is reachable with NO board on screen: plugin.tsx registers this chrome (standalone mode,
//    no pin — there is nothing here to pin) into the host's chat.empty area, the same slot the host
//    itself uses for its new-chat content. A brand-new chat, before any directive draws, opens the
//    Library and reattaches a saved board into the composer the user is typing in.
import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Blocks } from "../core/Blocks";
import type { Align, Density, Motion, Palette } from "../core/fields";
import { isTopLayer, popLayer, pushLayer } from "../core/overlays";
import { readBlocksNoted, type FollowUp } from "../core/readBlocks";
import { markLiving } from "../blocks/checklist/savedState";
import type { Block } from "../registry";
import { BlockActions, SENT_WORDS } from "./actions";
import { dialogKeys } from "./tabbable";

const ID_PATTERN = /^[0-9a-f]{8}$/;

/** One shelf row, exactly as the door answers GET /library. Words the server is unknown about stay
 *  unknown to the drawing: the row keeps its honesty (a missing board is shown missing, never opened). */
export type LibraryEntry = {
  id: string;
  title: string;
  folder: string | null;
  favorite: boolean;
  pinned: boolean;
  saved_at: string;
  exists: boolean;
};

type SavedBoard = {
  blocks: Block[]; boardAlign?: Align; boardTextAlign?: Align;
  boardAsOf?: string; boardLive?: boolean; boardFollowUps?: FollowUp[];
  boardDensity?: Density; boardPalette?: Palette; boardMotion?: Motion;
};

type View = { kind: "list" } | { kind: "board"; id: string; title: string; board: SavedBoard };

export type LibraryChrome = {
  controls: ReactNode;  // the chrome-row pair at rest (null while the board is expanded, like the menu)
  dialog: ReactNode;    // the window-covering shelf, mounted only while it is open
};

/** The host-level shelf entry (the chat.empty area): the LIBRARY control and its dialog with no board
 *  to pin — a brand-new chat has nothing drawn, and reattach is exactly what it needs. Actions come
 *  from the BlockActions context the plugin provides (the real composer seam, the plugin's REST door). */
export function LibraryEntry() {
  const library = useLibraryChrome({ standalone: true, drawn: false, expanded: false });
  return <>{library.controls}{library.dialog}</>;
}

/** The board reference a reattach sends: the saved board's own words on the line, and its tag — the one
 *  line the transcript turns back into the whole board — on a line of its own, exactly as paste does. */
export function attachText(title: string, id: string): string {
  return `Saved board “${title}”:\n::blocks{id="${id}"}`;
}

function rows(data: unknown): LibraryEntry[] | null {
  const list = (data as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(list)) return null;
  return list
    .filter((e): e is Record<string, unknown> => {
      const id = (e as Record<string, unknown> | null)?.id;
      return typeof id === "string" && ID_PATTERN.test(id);
    })
    .map((e) => ({
      id: String(e.id),
      title: typeof e.title === "string" ? e.title : "Board",
      folder: typeof e.folder === "string" && e.folder ? e.folder : null,
      favorite: e.favorite === true,
      pinned: e.pinned !== false,
      saved_at: typeof e.saved_at === "string" ? e.saved_at : "",
      exists: e.exists !== false,
    }));
}

export function useLibraryChrome(args: {
  id?: string; drawn: boolean; expanded: boolean;
  /** The new-chat shelf (chat.empty): the LIBRARY control with no board, so no pin and no mount read. */
  standalone?: boolean;
}): LibraryChrome {
  const actions = useContext(BlockActions);
  const rest = actions.rest;
  const valid = typeof args.id === "string" && ID_PATTERN.test(args.id);
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [pinned, setPinned] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [opened, setOpened] = useState<string | null>(null);   // a reopen the door has not answered yet
  const [openedSaid, setOpenedSaid] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; field: "title" | "folder" } | null>(null);
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<{ id: string; word: string } | null>(null);
  const pinRef = useRef<HTMLButtonElement | null>(null);
  const askedOnce = useRef(false);
  const libRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const ask = (path: string, init?: { method?: string; body?: unknown }): Promise<unknown> | null => {
    if (!rest) return null;
    // A door that refuses can refuse SYNCHRONOUSLY (the export suite's refuses-everything door). No
    // shelf act may crash the board it stands beside: the refusal answers as a rejected promise.
    try {
      return rest(path, init);
    } catch {
      return Promise.reject(new Error("the door did not answer"));
    }
  };

  /** What the shelf says right now. The answer is the shelf: the page lists exactly what the door pins,
   *  and this board's own pressed state rides on the same answer — one read, no second truth. A silent
   *  false (door off, door refuses) keeps the shelf unknown, and the dialog says so rather than lying. */
  const refresh = useCallback(() => {
    const answer = rest ? ask("/library") : null;
    if (!answer) return Promise.resolve(false);
    return answer
      .then((data) => {
        const list = rows(data);
        setEntries(list ?? []);
        setPinned(Boolean(list?.some((e) => e.id === args.id)));
        return true;
      })
      .catch(() => false);
  }, [rest, ask, args.id]);

  // The shelf is read ONCE when the board first stands drawn: refresh() hands back a fresh array every
  // answer, so an ungated effect could feed itself (answer -> re-render -> new callback -> refetch).
  // Later answers come only from the acts that need them: opening the dialog, and each write's read-back.
  useEffect(() => {
    if (valid && args.drawn && !askedOnce.current) {
      askedOnce.current = true;
      void refresh();
    }
  }, [valid, args.drawn, refresh]);

  /** Save or un-save this board. A pin is a note for a real stored board; an unpin is that note taken off
   *  and nothing else — the word says so, and the door's tests say so harder. The pressed state comes
   *  back from the shelf read, never from a guess made here. */
  const togglePin = () => {
    const was = pinned;
    const done = args.id ? ask(`/library/${args.id}`, { method: was ? "DELETE" : "PUT", body: was ? undefined : {} }) : null;
    if (!done) return;
    done
      .then(() => {
        setSaid(was ? "Removed from Library — the board itself was never deleted." : "Saved to Library — on this machine only.");
        return refresh();
      })
      .catch(() => setSaid("The Library did not answer."));
  };

  /** One organize word for one row: rename, folder, favorite. A refused word keeps the row as it was. */
  const putWords = (id: string, words: Record<string, unknown>) => {
    const done = ask(`/library/${id}`, { method: "PUT", body: words });
    if (!done) return;
    done.then(refresh).catch(() => setSaid("The Library did not answer."));
  };

  const removeRow = (e: LibraryEntry) => {
    const gone = ask(`/library/${e.id}`, { method: "DELETE" });
    if (!gone) return;
    gone
      .then(() => {
        setSaid(`“${e.title}” is off the shelf — the board itself was never deleted.`);
        return refresh();
      })
      .catch(() => setSaid("The Library did not answer."));
  };

  /** Reattach: the real send seam over the composer the user is typing in — the same seam a follow-up tap
   *  uses — carrying this board's tag. The answer word is the host's, never a promise invented here. */
  const reattach = (e: LibraryEntry) => {
    void actions.send(attachText(e.title || "Board", e.id), { force: true }).then((r) =>
      setAttached({ id: e.id, word: SENT_WORDS[r] }));
  };

  /** Reopen: fetch the saved board from the door and draw it in the dialog — through the same reader the
   *  inline board came from, envelope words (align, text_align, as_of, live, follow-ups) included, so
   *  data and layout both return. A board the door cannot answer admits it and is never half-drawn. */
  const openBoard = (e: LibraryEntry) => {
    const answer = ask(`/blocks/${e.id}`);
    if (!answer) return;
    setOpened(e.id);
    setOpenedSaid(null);
    answer
      .then((data) => {
        const { blocks, align, textAlign, asOf, live, followUps, density, palette, motion, version } = readBlocksNoted(data);
        if (!blocks.length) {
          setOpenedSaid("This board could not be reopened.");
          return;
        }
        // round 5: a board that has taken updates files its answers by identity — the word the door
        // already speaks — so this view says so too before its blocks mount.
        if ((version ?? 0) >= 2) markLiving(e.id);
        setView({
          kind: "board", id: e.id, title: e.title,
          board: { blocks, boardAlign: align, boardTextAlign: textAlign, boardAsOf: asOf, boardLive: live,
            boardFollowUps: followUps, boardDensity: density, boardPalette: palette, boardMotion: motion },
        });
      })
      .catch(() => setOpenedSaid("This board could not be reopened."))
      .finally(() => setOpened(null));
  };

  const openLibrary = () => {
    setOpen(true);
    setView({ kind: "list" });
    setEditing(null);
    void refresh();
  };
  const closeLibrary = () => {
    setOpen(false);
    libRef.current?.focus();  // the dialog hands focus back to the control it opened from
  };

  useEffect(() => {
    if (open) closeRef.current?.focus();  // an open dialog owns the keyboard
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const layer = pushLayer();  // the shelf holds the keys until something opens over it
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTopLayer(layer) && view.kind === "board") {
        e.stopImmediatePropagation();  // one Escape steps out of the reopened board, onto the shelf
        setView({ kind: "list" });
        return;
      }
      dialogKeys(dialogRef.current as HTMLElement, layer, closeLibrary)(e);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      popLayer(layer);
    };
  }, [open, view.kind]);

  // A board's chrome needs a board id to stand; the new-chat shelf stands with none (nothing to pin,
  // nothing to mark "this board" — the rows and the dialog behave the same either way).
  if (!valid && !args.standalone) return { controls: null, dialog: null };

  const libButton = (
    <button ref={libRef} type="button" className={args.standalone ? "hb-lib hb-lib-entry" : "hb-lib"}
      aria-haspopup="dialog" aria-label="Open Library" aria-disabled={!rest} onClick={openLibrary}>
      <IconShelf />
      {args.standalone && <span className="hb-lib-entry-label">Library</span>}
    </button>
  );
  const saidWord = said !== null && (
    <div className="hb-library-said" role="status" aria-live="polite">{said}</div>
  );

  const controls = args.expanded ? null : args.standalone ? (
    // The new-chat entry is always visible and in flow: a quiet pill standing where the empty chat
    // invites the first move — not a hover-revealed corner over a board that is not here.
    <span className="hb-library-entry">{libButton}{saidWord}</span>
  ) : (
    <>
      <button ref={pinRef} type="button" className="hb-pin" aria-pressed={pinned}
        aria-label={pinned ? "Remove from Library" : "Save to Library"}
        aria-disabled={!rest} title={rest ? undefined : "Nothing to save here"}
        onClick={togglePin}>
        <IconPin filled={pinned} />
      </button>
      {libButton}
      {saidWord}
    </>
  );

  if (!open) return { controls, dialog: null };

  const groups: { head: string; items: LibraryEntry[] }[] = [];
  const list = entries ?? [];
  const favorites = list.filter((e) => e.favorite);
  if (favorites.length) groups.push({ head: "Favorites", items: favorites });
  const shelf = list.filter((e) => !e.favorite);
  const names = [...new Set(shelf.map((e) => e.folder).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b));
  for (const name of names) groups.push({ head: name, items: shelf.filter((e) => e.folder === name) });
  const unfiled = shelf.filter((e) => !e.folder);
  if (unfiled.length) groups.push({ head: "Unfiled", items: unfiled });

  const row = (e: LibraryEntry) => {
    const editor = editing && editing.id === e.id && (
      <span className="hb-library-edit">
        <input type="text" autoFocus onFocus={(ev) => ev.target.select()}
          aria-label={editing.field === "title" ? `New title for “${e.title}”` : `Folder for “${e.title}”`}
          value={draft} onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              putWords(e.id, { [editing.field]: draft });
              setEditing(null);
            }
            if (ev.key === "Escape") ev.stopPropagation();  // the shelf stays: the editor answers first
          }} />
        <button type="button" onClick={() => {
          putWords(e.id, { [editing.field]: draft });
          setEditing(null);
        }}>Save</button>
        <button type="button" onClick={() => setEditing(null)}>Cancel</button>
      </span>
    );
    return (
      <div className="hb-library-row" key={e.id} data-board={e.id}>
        <button type="button" className="hb-library-open" onClick={() => openBoard(e)}
          disabled={!e.exists} title={e.exists ? "Reopen this saved board" : "This board is not on this machine"}>
          <span className="hb-library-name">{e.title || "Board"}</span>
          {!e.exists && <span className="hb-library-missing"> — not on this machine</span>}
          {e.id === args.id && <span className="hb-library-here"> — this board</span>}
        </button>
        <span className="hb-library-tools">
          <button type="button" aria-pressed={e.favorite}
            aria-label={e.favorite ? `Unfavorite “${e.title}”` : `Favorite “${e.title}”`}
            onClick={() => putWords(e.id, { favorite: !e.favorite })}>★</button>
          <button type="button" aria-label={`Rename “${e.title}”`}
            onClick={() => {
              setEditing({ id: e.id, field: "title" });
              setDraft(e.title);
            }}>Rename</button>
          <button type="button" aria-label={`Move “${e.title}” to a folder`}
            onClick={() => {
              setEditing({ id: e.id, field: "folder" });
              setDraft(e.folder ?? "");
            }}>Folder</button>
          <button type="button" aria-label={`Add “${e.title}” to chat`} disabled={!e.exists}
            onClick={() => reattach(e)}>Add to chat</button>
          <button type="button" aria-label={`Remove “${e.title}” from Library`}
            onClick={() => removeRow(e)}>Remove</button>
        </span>
        {attached?.id === e.id && (
          <span className="hb-library-attached" role="status" aria-live="polite">{attached.word}</span>
        )}
        {editor}
      </div>
    );
  };

  const dialog = (
    <div className="hb-library-overlay" onClick={(e) => e.target === e.currentTarget && closeLibrary()}>
      <div ref={dialogRef} className="hb-library-dialog" role="dialog" aria-modal="true" aria-label="Board Library">
        <button ref={closeRef} type="button" className="hb-overlay-close hb-library-close"
          aria-label="Close Library" onClick={closeLibrary}>
          <IconClose />
        </button>
        {view.kind === "board" ? (
          <div className="hb-library-board" data-board={view.id}>
            <div className="hb-library-boardhead">
              <button type="button" aria-label="Back to Library"
                onClick={() => setView({ kind: "list" })}>← Library</button>
              <span className="hb-library-boardtitle">{view.title || "Board"}</span>
              <button type="button" aria-label={`Add “${view.title}” to chat`}
                onClick={() => reattach({ ...view, folder: null, favorite: false, pinned: true, saved_at: "", exists: true })}>
                Add to chat
              </button>
              {/* the answer word shows where the act happened: reopened boards get it too */}
              {attached?.id === view.id && (
                <span className="hb-library-attached" role="status" aria-live="polite">{attached.word}</span>
              )}
            </div>
            {/* Isolation (review round 2): this board answers to ITS id. Without the override the
                reopened blocks would inherit the hosting board's BlockActions.blockId and a checklist
                or form here would read and save the HOST's state file. One provider, re-asserted on
                every render of this view, covers every block that consumes the id through context. */}
            <BlockActions.Provider value={{ ...actions, blockId: view.id }}>
              <Blocks blocks={view.board.blocks} boardAlign={view.board.boardAlign}
                boardTextAlign={view.board.boardTextAlign} boardAsOf={view.board.boardAsOf}
                boardLive={view.board.boardLive} boardFollowUps={view.board.boardFollowUps}
                boardDensity={view.board.boardDensity} boardPalette={view.board.boardPalette}
                boardMotion={view.board.boardMotion} />
            </BlockActions.Provider>
          </div>
        ) : (
          <div className="hb-library-list">
            <div className="hb-library-title">Library</div>
            {entries === null ? (
              <div className="hb-library-note">The Library did not answer.</div>
            ) : !list.length ? (
              <div className="hb-library-note">
                Nothing saved yet. Save a board with the pin beside it — it stays on this machine.
              </div>
            ) : (
              groups.map((g) => (
                <div className="hb-library-group" key={g.head}>
                  <div className="hb-library-head">{g.head}</div>
                  {g.items.map(row)}
                </div>
              ))
            )}
            {opened !== null && <div className="hb-library-note" role="status">Reopening…</div>}
            {openedSaid !== null && <div className="hb-library-note" role="status">{openedSaid}</div>}
            {said !== null && <div className="hb-library-note" role="status">{said}</div>}
          </div>
        )}
      </div>
    </div>
  );
  return { controls, dialog };
}

/** The pin glyph: a bookmark; filled once the board is saved. */
function IconPin({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}

/** The shelf glyph: two quiet boards standing side by side. */
function IconShelf() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19h16M6 19V9m6 10V5m6 14v-6" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
