// What `::blocks{id="..."}` turns into inside a reply: a placeholder while the reply streams in, then the stored
// blocks fetched by id and drawn. A block that cannot load draws nothing — a stray id in a reply stays silent
// rather than printing an error note. Never raw JSON.
// Alignment is the model's alone: the board's own default (the stored envelope's align) and a block's own ask
// (readBlocks reads it into the block) decide where each card sits. The reader has no control — the chips and
// their per-device override are gone.
// The reader gets exactly one view, not an ask: a quiet expand control on every drawn board, the images strip's
// full-size overlay pattern (blocks/images/Images.tsx) raised to the whole board — with one honest correction.
// A stateless photo may be re-drawn at full size; a board may not: its blocks carry live state (a calculator's
// sliders, an unsent form draft, a lit flow), so expanding MOVES the one drawn instance into the dialog instead
// of instantiating a second one. The host's .hb-board-host wrapper — a plain block container at rest, so an
// inline board keeps drawing its byte-identical .hb-blocks under it — becomes the fixed dialog itself: cards
// keep their caps and full-width blocks ride the wider column. Escape or the close control returns to the
// inline view and the element settles back into flow; state survives open, close and reopen in both directions
// because the blocks were never unmounted. Focus lands in the dialog on open, stays inside it while open, and
// lands back on the control on close; the trap wraps Tab on the eligible tabbable controls (see tabbableIn),
// never on disabled, negative-tabindex or hidden ones — and only while the board is the TOP of the overlay
// stack: a chart detail or a photo opened from inside it answers the keys first, and one Escape steps the
// reader down exactly one layer (core/overlays.ts). A board that is not expanded draws exactly the markup
// it always drew: the control lives outside the board wrapper, and the wrapper takes no part in layout.
import { useContext, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { Blocks } from "../core/Blocks";
import * as boards from "../core/boardRoster";
import { carryBlocks } from "../core/living-identity";
import { forgetBlock, markLiving, migrateArchived, promoteOnUpdate } from "../blocks/checklist/savedState";
import { LivePointer, LiveRow } from "../core/LivingBoards";
import { readBlocksNoted, type BoardLink, type FollowUp } from "../core/readBlocks";
import { popLayer, pushLayer } from "../core/overlays";
import type { Align, Density, Motion, Palette } from "../core/fields";
import type { Block } from "../registry";
import { BlockActions } from "./actions";
import { useExportChrome } from "./ExportChrome";
import { useLibraryChrome } from "./LibraryChrome";
import { dialogKeys } from "./tabbable";

const ID_PATTERN = /^[0-9a-f]{8}$/;

/** A get_block answer that carries the stored envelope beside its projection (the local door does). */
function isEnvelopeCarrying(data: unknown): data is { stored: unknown } {
  return typeof data === "object" && data !== null && !Array.isArray(data) && "stored" in data;
}

// One stable empty list for the chrome's "nothing drawn yet" argument: a fresh [] every render would churn its
// deps and let its scan re-commit forever.
const NO_BLOCKS: Block[] = [];

type Board = {
  blocks: Block[]; boardAlign?: Align; boardTextAlign?: Align; boardAsOf?: string; boardLive?: boolean;
  boardFollowUps?: FollowUp[]; boardDensity?: Density; boardPalette?: Palette; boardMotion?: Motion;
  boardVersion?: number; boardUpdatedAt?: string; boardLinks?: BoardLink[];
  stored: unknown;
};

type State = {
  kind: "loading";
} | {
  kind: "drawn"; blocks: Block[]; boardAlign?: Align; boardTextAlign?: Align; boardAsOf?: string;
  boardLive?: boolean; boardFollowUps?: FollowUp[]; boardDensity?: Density; boardPalette?: Palette;
  boardMotion?: Motion; boardVersion?: number; boardUpdatedAt?: string; boardLinks?: BoardLink[];
  stored: unknown;
} | { kind: "failed" };

/**
 * load fetches the stored JSON for an id (in the app: the plugin's REST route).
 *   streaming → "drawing…" (no fetch yet: the tag may still be arriving)
 *   id "zzz" → nothing (never fetched)
 *   fetch fails, or nothing in it can be drawn → nothing
 * The blocks drawn get the app's actions (send, fill, rest) with this tag's id added, so a checklist saves its
 * ticks with this board.
 *
 * One address, one live view (Living Boards v1): the FIRST tag of an id claims the address in the roster
 * (core/boardRoster.ts) and owns the live view; every later tag of the same id draws a pointer instead and
 * pokes the owner, whose refetch updates the SAME mounted subtree in place — a layout/state change of the
 * same elements, never a second renderer (a calculator's sliders, an unsent form, a lit tab all ride
 * through). A board that speaks a living word (a version, links) says it in a quiet row under itself.
 */
export function BlockTag({ id, streaming, load }: { id: string | undefined; streaming: boolean; load: (id: string) => Promise<unknown> }) {
  const validId = typeof id === "string" && ID_PATTERN.test(id);
  const actions = useContext(BlockActions);
  // The roster's address key: the board id scoped to its conversation. An address is THE CHAT's visual
  // memory — two session panes open on one page (the host integration's shape) never pointer each other.
  const address = validId ? `${actions.sessionScope ?? ""}|${id}` : "";
  const [state, setState] = useState<State>({ kind: "loading" });
  const [expanded, setExpanded] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);  // an archived version being viewed, or null
  const hostRef = useRef<HTMLDivElement | null>(null);
  const expandRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // The tree this live view MOUNTED last: what the next replacement tree is carried against.
  const drawn = useRef<Block[] | null>(null);

  // The roster claim (core/boardRoster.ts): the token belongs to this instance; the claim is taken in a
  // LAYOUT effect so no flash of the wrong role ever paints, and it is released on unmount whatever path
  // the tag arrived by (streaming tags never hold a claim they cannot give back). Role "unknown" is only
  // the pre-claim beat of the very first paint — it draws the same "drawing…" note the tag has always
  // shown before its first answer lands.
  const self = useRef<{ token: symbol } | null>(null);
  if (self.current === null) self.current = { token: Symbol("hb-tag") };
  const [role, setRole] = useState<"unknown" | "home" | "pointer">("unknown");
  const [refresh, setRefresh] = useState(0);  // the owner's answer to a poke: the address said something newer
  const [, force] = useReducer((x: number) => x + 1, 0);  // repaint on any roster word about this address
  const [live, setLive] = useState<{ version?: number; updatedAt?: string; links?: BoardLink[] }>({});

  useLayoutEffect(() => {
    if (streaming || !validId) return;
    const token = self.current!.token;
    const claim = boards.claim(address, token);
    setRole(claim ? "home" : "pointer");
    if (!claim) boards.poke(address);  // an update turn quotes this address: the live view should show it
    const recompute = () => {
      const mine = boards.owns(address, token);
      setRole(mine ? "home" : boards.listed(address, token) ? "pointer" : "unknown");
      force();  // pointers speak the live view's word: a meta change repaints them even when the role is stable
    };
    const unsub = boards.subscribe(address, recompute);
    // The poke channel is the owner's refetch word — and it steps the view back to the current version: a
    // poke means a newer turn quoted this address, so an older one being looked at is no longer the ask.
    const offPoke = boards.onPoke(address, () => {
      setViewing(null);
      setRefresh((r) => r + 1);
    });
    return () => {
      unsub();
      offPoke();
      // round 5/7: when this was the page's LAST tag of the address, forgetBlock only PUSHES the
      // queued door writes out — the board's answers live on the board (door + page mirror), not on
      // the elements, so a reopen at the address finds everything, mounted updates or headless ones.
      if (boards.release(address, token)) forgetBlock(id);
    };
  }, [address, id, streaming, validId]);

  useEffect(() => {
    if (streaming || !validId || role !== "home") return;
    let alive = true;
    // The live view answers load() (the tag's own door call); an archived version reached back into answers
    // the same door with its number — retrieval by address, never a redraw.
    const ask = viewing === null || !actions.rest
      ? load(id)
      : actions.rest(`/blocks/${id}?version=${viewing}`);
    Promise.resolve(ask)
      .then((data) => {
        const {
          blocks, align: boardAlign, textAlign: boardTextAlign, asOf: boardAsOf, live: boardLive,
          followUps: boardFollowUps, density: boardDensity, palette: boardPalette, motion: boardMotion,
          version: boardVersion, updatedAt: boardUpdatedAt, links: boardLinks,
        } = readBlocksNoted(data);
        // The export's JSON source: the stored envelope when the answer carries it (the local get_block does);
        // the answer itself where it does not (previews, old doors) — never a fabrication.
        const envelope = isEnvelopeCarrying(data) ? (data as { stored: unknown }).stored : data;
        if (!alive) return;
        if (blocks.length) {
          // Drawing the answer is a function of the board and the door; the ONE thing that may precede
          // it is an archive walk. Round 6 (Sol's disposition on reviewer comment 937): a version ≥ 2
          // board arriving at a FRESH mount (drawn.current === null) may carry updates that landed with
          // no view mounted anywhere — no promote ever ran, and the door may still hold answers under
          // the OLD position or a superseded chain. migrateArchived computes the old→new mapping from
          // the STORED specs alone and lands every answer it can PROVE before any block mounts, so a
          // reopened block never reads its vacated slot and never loses what it filed. The walk may
          // not block the draw forever: it never rejects, and its round trips are the door's own.
          const headless = drawn.current === null && viewing === null && (boardVersion ?? 0) >= 2;
          const commitDraw = () => {
            if (!alive) return;
            // A replacement tree landing on this live view: carry every logically-retained block's
            // identity forward (core/living-identity.ts) BEFORE the swap, so React reconciles each
            // surviving drawing onto the very element already mounted — independent of content shape
            // and of slot alike (review round 3, defect 2). The first draw carries nothing: an unsaid
            // board draws exactly the old content keys, byte for byte.
            if (drawn.current) carryBlocks(drawn.current, blocks);
            // Round 5 (Sol's disposition): the update also makes the board LIVING — its interactive
            // answers now file by identity and follow their blocks across moves and reopens. The
            // promote runs synchronously up to the door's first answer, and marks before the swap
            // renders, so every remount mounts from the board, not from the spec, wherever the
            // update moved it. A version ≥ 2 answering a FRESH mount (a reopen) says the same word —
            // and the archive walk above already moved what a mounted promote never got to.
            if (drawn.current && viewing === null) void promoteOnUpdate(actions.rest, id, drawn.current, blocks);
            if (viewing === null && (boardVersion ?? 0) >= 2) markLiving(id);
            drawn.current = blocks;
            setState({ kind: "drawn", blocks, boardAlign, boardTextAlign, boardAsOf, boardLive, boardFollowUps,
              boardDensity, boardPalette, boardMotion, boardVersion, boardUpdatedAt, boardLinks, stored: envelope });
            // Only the LIVE answer says what this address IS now: the live row and the roster's word about the
            // address speak of the current version, whatever older one is being looked at.
            if (viewing === null) {
              setLive({ version: boardVersion, updatedAt: boardUpdatedAt, links: boardLinks });
              boards.setMeta(address, { version: boardVersion, updatedAt: boardUpdatedAt });
            }
          };
          if (headless && actions.rest !== undefined) {
            const rest = actions.rest;
            void migrateArchived(
              rest, id,
              async (v) => {
                const answer = await rest(`/blocks/${id}?version=${v}`);
                const read = readBlocksNoted(answer).blocks;
                return read.length > 0 ? (read as unknown[]) : null;
              },
              blocks, boardVersion ?? 2,
            ).then(commitDraw, commitDraw);  // the walk swallows everything; either way the board draws
          } else {
            commitDraw();
          }
        } else if (viewing === null) {
          setState({ kind: "failed" });
        } else {
          setViewing(null);  // the door had no such version: say nothing false, keep the live board drawn
        }
      })
      .catch(() => {
        if (!alive) return;
        if (viewing === null) setState({ kind: "failed" });
        else setViewing(null);
      });
    return () => {
      alive = false;
    };
    // actions.rest is left out of the deps on purpose: it is a per-render closure over the same door.
  }, [address, id, streaming, validId, role, refresh, viewing]);

  const close = () => {
    setExpanded(false);
    expandRef.current?.focus();  // the dialog hands focus back to the control it opened from
  };

  // The export affordance (host/ExportChrome.tsx): chrome around the board, never inside it. Its corner buttons
  // pair the one drawn instance's elements with the read blocks by walking both trees together; its board
  // files come out of the stored envelope this very load already delivered — export asks the door for nothing.
  const chrome = useExportChrome({
    blocks: state.kind === "drawn" ? state.blocks : NO_BLOCKS,
    asOf: state.kind === "drawn" ? state.boardAsOf : undefined,
    live: state.kind === "drawn" ? state.boardLive : undefined,
    stored: state.kind === "drawn" ? state.stored : null,
    expanded,
    getBoard: () => hostRef.current?.querySelector<HTMLElement>(".hb-blocks") ?? null,
    getHost: () => hostRef.current,
  });

  // The Library (host/LibraryChrome.tsx): a pin beside the board's other chrome and the shelf dialog the
  // pin feeds. The controls live OUTSIDE .hb-blocks, exactly like the expand and export pair, so an inline
  // board still draws the markup it always drew; the dialog is the one established window-covering
  // pattern, answering its own Escape/Tab on the shared layer stack.
  const library = useLibraryChrome({
    id,
    drawn: state.kind === "drawn",
    expanded,
  });

  useEffect(() => {
    if (expanded) closeRef.current?.focus();  // an open dialog owns the keyboard
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const root = hostRef.current;
    if (!root) return;
    const layer = pushLayer();  // the board holds the keys until something opens over it
    // One Escape steps the reader down exactly one layer; the trap belongs to the topmost dialog alone.
    // The rules themselves are host/tabbable.ts, shared with the Library dialog word for word.
    const onKey = dialogKeys(root, layer, close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      popLayer(layer);
    };
  }, [expanded]);

  if (!validId && !streaming) return null;
  if (streaming || role === "unknown") return <Note text="drawing…" pulse />;
  if (role === "pointer") return <LivePointer id={id as string} address={address} />;
  if (state.kind === "loading") return <Note text="drawing…" pulse />;
  if (state.kind === "failed") return null;

  const board: Board = state;

  return (
    <BlockActions.Provider value={{ ...actions, blockId: id }}>
      <div className="hb-tag" {...chrome.bind}>
        <button ref={expandRef} type="button" className="hb-expand" aria-label="Expand board" aria-haspopup="dialog"
          onClick={() => setExpanded(true)}>
          <IconExpand />
        </button>
        {chrome.menu}
        {library.controls}
        <div ref={hostRef} className={expanded ? "hb-board-host hb-board-overlay" : "hb-board-host"}
          {...(expanded ? { role: "dialog", "aria-modal": "true", "aria-label": "Expanded board" } : {})}
          onClick={expanded ? (e) => e.target === e.currentTarget && close() : undefined}>
          {expanded && (
            <button ref={closeRef} type="button" className="hb-overlay-close" aria-label="Close expanded board"
              onClick={close}>
              <IconClose />
            </button>
          )}
          {chrome.dialogMenu}
          <Blocks blocks={board.blocks} boardAlign={board.boardAlign} boardTextAlign={board.boardTextAlign}
            boardAsOf={board.boardAsOf} boardLive={board.boardLive} boardFollowUps={board.boardFollowUps}
            boardDensity={board.boardDensity} boardPalette={board.boardPalette} boardMotion={board.boardMotion} />
          {(live.version != null || live.links) && (
            <LiveRow id={id as string} version={live.version} updatedAt={live.updatedAt}
              links={live.links} viewing={viewing} onShow={setViewing}
              canReach={Boolean(actions.rest)} />
          )}
          {chrome.layer}
        </div>
        {library.dialog}
      </div>
    </BlockActions.Provider>
  );
}

function Note({ text, pulse = false }: { text: string; pulse?: boolean }) {
  return <div className={pulse ? "hb-state hb-pulse" : "hb-state"}>{text}</div>;
}

function IconExpand() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" aria-hidden="true">
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
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
