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
import { useContext, useEffect, useRef, useState } from "react";
import { Blocks } from "../core/Blocks";
import { readBlocksNoted, type FollowUp } from "../core/readBlocks";
import { isTopLayer, popLayer, pushLayer } from "../core/overlays";
import type { Align } from "../core/fields";
import type { Block } from "../registry";
import { BlockActions } from "./actions";

const ID_PATTERN = /^[0-9a-f]{8}$/;

type Board = {
  blocks: Block[]; boardAlign?: Align; boardTextAlign?: Align; boardAsOf?: string; boardLive?: boolean;
  boardFollowUps?: FollowUp[];
};

type State = {
  kind: "loading";
} | {
  kind: "drawn"; blocks: Block[]; boardAlign?: Align; boardTextAlign?: Align; boardAsOf?: string;
  boardLive?: boolean; boardFollowUps?: FollowUp[];
} | { kind: "failed" };

/**
 * load fetches the stored JSON for an id (in the app: the plugin's REST route).
 *   streaming → "drawing…" (no fetch yet: the tag may still be arriving)
 *   id "zzz" → nothing (never fetched)
 *   fetch fails, or nothing in it can be drawn → nothing
 * The blocks drawn get the app's actions (send, fill, rest) with this tag's id added, so a checklist saves its ticks
 * with this board.
 */
export function BlockTag({ id, streaming, load }: { id: string | undefined; streaming: boolean; load: (id: string) => Promise<unknown> }) {
  const validId = typeof id === "string" && ID_PATTERN.test(id);
  const actions = useContext(BlockActions);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [expanded, setExpanded] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const expandRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (streaming || !validId) return;
    let live = true;
    load(id)
      .then((data) => {
        const {
          blocks, align: boardAlign, textAlign: boardTextAlign, asOf: boardAsOf, live: boardLive,
          followUps: boardFollowUps,
        } = readBlocksNoted(data);
        if (live) setState(blocks.length ? { kind: "drawn", blocks, boardAlign, boardTextAlign, boardAsOf, boardLive, boardFollowUps } : { kind: "failed" });
      })
      .catch(() => {
        if (live) setState({ kind: "failed" });
      });
    return () => {
      live = false;
    };
  }, [id, streaming, validId]);

  const close = () => {
    setExpanded(false);
    expandRef.current?.focus();  // the dialog hands focus back to the control it opened from
  };

  useEffect(() => {
    if (expanded) closeRef.current?.focus();  // an open dialog owns the keyboard
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const layer = pushLayer();  // the board holds the keys until something opens over it
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // A detail or a photo opened from inside this dialog sits above it; the key answers the topmost layer
        // first — the board only closes when it IS the topmost one (core/overlays.ts).
        if (!isTopLayer(layer)) return;
        e.stopImmediatePropagation();  // one keypress steps down exactly one layer
        close();
        return;
      }
      if (e.key !== "Tab" || !hostRef.current) return;
      if (!isTopLayer(layer)) return;  // the focus trap belongs to the topmost dialog alone
      const items = tabbableIn(hostRef.current);  // the DOM can change while open: recompute per keypress
      if (!items.length) return;
      e.preventDefault();  // the dialog owns the keyboard: Tab steps only through its own eligible controls
      const active = document.activeElement as HTMLElement | null;
      const at = active === null ? -1 : items.indexOf(active);
      const step = e.shiftKey ? -1 : 1;
      const next = at === -1 ? (e.shiftKey ? items.length - 1 : 0) : (at + step + items.length) % items.length;
      items[next].focus();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      popLayer(layer);
    };
  }, [expanded]);

  if (!validId && !streaming) return null;
  if (streaming || state.kind === "loading") return <Note text="drawing…" pulse />;
  if (state.kind === "failed") return null;

  const board: Board = state;

  return (
    <BlockActions.Provider value={{ ...actions, blockId: id }}>
      <div className="hb-tag">
        <button ref={expandRef} type="button" className="hb-expand" aria-label="Expand board" aria-haspopup="dialog"
          onClick={() => setExpanded(true)}>
          <IconExpand />
        </button>
        <div ref={hostRef} className={expanded ? "hb-board-host hb-board-overlay" : "hb-board-host"}
          {...(expanded ? { role: "dialog", "aria-modal": "true", "aria-label": "Expanded board" } : {})}
          onClick={expanded ? (e) => e.target === e.currentTarget && close() : undefined}>
          {expanded && (
            <button ref={closeRef} type="button" className="hb-overlay-close" aria-label="Close expanded board"
              onClick={close}>
              <IconClose />
            </button>
          )}
          <Blocks blocks={board.blocks} boardAlign={board.boardAlign} boardTextAlign={board.boardTextAlign}
            boardAsOf={board.boardAsOf} boardLive={board.boardLive} boardFollowUps={board.boardFollowUps} />
        </div>
      </div>
    </BlockActions.Provider>
  );
}

/** The controls a real Tab press can reach inside the open dialog, in tab order. The focusable set minus the
 *  controls that are not actually stops: anything disabled (own .disabled or a disabled fieldset — Steps and
 *  Layers end on a spent Next, and a form's Send sits behind its fieldset once sent), anything asking not to be
 *  (negative tabindex, hidden inputs), anything not shown. The layout half of that read (rects, visibility)
 *  only counts where layout is real; jsdom reports a zero rect for every element, so there the attribute
 *  shape governs and Chrome measures the rest (tests/test_expand_fullscreen.py). */
function tabbableIn(root: HTMLElement): HTMLElement[] {
  const laidOut = root.getClientRects().length > 0;
  return [...root.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")].filter(
    (el) =>
      el.tabIndex >= 0 &&
      el.getAttribute("type") !== "hidden" &&
      (el as HTMLButtonElement).disabled !== true &&
      !el.closest("fieldset[disabled]") &&
      !el.closest("[hidden]") &&
      (!laidOut || (el.getClientRects().length > 0 && getComputedStyle(el).visibility === "visible")),
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
