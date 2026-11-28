// The export affordance, host chrome end to end (enhancement #6). Zero model round-trips, zero bytes over the
// composer. PNG, CSV and JSON are fully LOCAL acts: the board's stored envelope arrived with the board itself
// and has sat in this page's memory since (JSON is that envelope), and a table's CSV and a chart's PNG never
// needed the door at all. Markdown is the one act that ASKS the door — exactly once, at the single text writer
// (GET /blocks/{id}/markdown?version=N, host hooks/text_fallback.py) — so the file always says precisely what
// the chat text says, and there is no second serializer to keep in step. The ask is ALWAYS versioned, pinned
// to the version the current drawing committed with: the file says the board ON SCREEN, never whatever the
// address happens to be on at click time (round 4's binding); a drawing that names no version is refused.
// Two controls:
//  · A CORNER BUTTON for EVERY exportable block — every chart (the SVG kinds and the DOM-drawn horizontal-bar
//    kind) and every table, at any depth: a parallel walk of the read block tree and the drawn DOM finds the
//    blocks the reader can actually see (collapsed section children and inactive tab panels are not drawn, so
//    they have no button; mount changes rescan). The button is ALWAYS in the DOM — a focusable, properly-named
//    control even while it is invisible — so a keyboard reader Tabs to it and Enter exports it without a mouse
//    ever existing; the pointer merely lights it early (hover reveals the corner, focus reveals it fully).
//    It sits IN the block's own corner, in a layer OUTSIDE .hb-blocks: the board's DOM stays exactly what it
//    always was, the one live view is never re-mounted, and the walk pairs data with the elements the reader
//    is looking at. In the tag's own top strip a corner steps BELOW the tag's controls (the expand button
//    #72 owns right: 6px; this menu sits beside it at right: 40px) so no two controls ever share a hit area.
//  · A BOARD MENU in the tag's corner: the whole board as Markdown (the host's ONE writer, uncapped — a file
//    is not one chat message — asked at the version this very drawing is, reach-back included; a screen that
//    cannot name its version exports nothing) or as JSON (the stored envelope, whole — for a living board,
//    whichever version is being looked at). Nothing is ever written from a guess: no envelope, no answer,
//    no identifiable version, and the word says so.
import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { PointerEvent as ReactPointerEvent, FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Block } from "../registry";
import type { ChartSpec } from "../blocks/chart/chartData";
import type { TableBlock } from "../blocks/table/read";
import { chartFileBase, chartPng, fileBase, jsonFile, markdownFile, saveBlob, tableCsvBlob } from "../lib/export";
import { BlockActions } from "./actions";
import { getSlotStatus, setSlotStatus, settleSlots, type SlotDraw } from "../core/slotDraw";

/** One exportable block as the walk found it: its data, its drawn element, and where its corner sits (host px). */
type Candidate = { block: Block; root: HTMLElement; kind: "chart" | "table"; name: string; left: number; top: number };

export type ExportBind = {
  onPointerMove?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerLeave?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onFocus?: (e: ReactFocusEvent<HTMLDivElement>) => void;
  onBlur?: (e: ReactFocusEvent<HTMLDivElement>) => void;
};

export type ExportChrome = {
  bind: ExportBind;                 // pointer/focus lighting, on the tag as before
  menu: ReactNode;                  // the board menu: the tag's own corner control
  layer: ReactNode;                 // the per-block corner layer: a child of the tag, never of .hb-blocks
};

/** The walk's container kinds, in the shape the READER guarantees (layout/read.ts flattens what it cannot draw). */
const CONTAINER = ["row", "section", "grid", "columns", "tabs"];

/** A box in the browser's own coordinates: the four edges of a measured element. */
export type Box = { left: number; top: number; right: number; bottom: number };

/** The corner control's box and the inset it keeps from the block it belongs to. Exported so the unit tests and
 *  the real-Chrome suite assert against the SAME numbers the act uses, never a copy of them. */
export const EXPORT_BTN = 26;
export const EXPORT_INSET = 8;

/** The tag's own corner stack — the expand control and the board menu, one above the other — as the width and
 *  height it occupies at the tag's top-right, and the gap a block's corner keeps from it. */
export const GLOBAL_GUTTER = 40;
export const GLOBAL_BAND = 80;
export const GLOBAL_GAP = 6;

/** Where one block's corner control sits, in the TAG's coordinates (the layer it draws in).
 *
 *  The control belongs to the block it exports: it sits in that block's own top-right corner, inset by
 *  EXPORT_INSET, so a wide or scrolling widget can never push it out of the widget or off the board. The tag's
 *  top-right corner is the global controls' (expand, board menu), so a corner that would land under them slides
 *  left of the stack instead of sitting on it. It is then clamped inside its block: a narrow chart, a hugged
 *  table, a horizontally scrolled one all keep their own control within their own box.
 *
 *    block 40..640 x 100..400, tag 0..640 x 0..500  ->  { left: 606, top: 108 }   (its own corner)
 *    the same block at the tag's top-right          ->  { left: 574, top: 8 }     (clear of the stack)
 */
export function cornerOf(block: Box, tag: Box): { left: number; top: number } {
  const b = { left: block.left - tag.left, top: block.top - tag.top, right: block.right - tag.left };
  const tagW = Math.round(tag.right - tag.left);
  let left = Math.round(b.right) - EXPORT_INSET - EXPORT_BTN;
  const top = Math.round(b.top) + EXPORT_INSET;
  // The global stack owns the tag's top-right corner: slide left of it rather than under it.
  const bandLeft = tagW - GLOBAL_GUTTER;
  if (left + EXPORT_BTN > bandLeft && top < GLOBAL_BAND) left = bandLeft - EXPORT_BTN - GLOBAL_GAP;
  // ...and never outside the block it belongs to.
  const minLeft = Math.round(b.left) + 2;
  const maxLeft = Math.round(b.right) - EXPORT_BTN - 2;
  left = maxLeft >= minLeft ? Math.min(Math.max(left, minLeft), maxLeft) : minLeft;
  return { left: Math.max(left, 0), top: Math.max(top, 0) };
}

export function useExportChrome(args: {
  blocks: Block[]; stored: unknown;
  boardId: string | undefined; drawnVersion: number | null;
  getBoard: () => HTMLElement | null; getHost: () => HTMLElement | null;
}): ExportChrome {
  const { blocks, stored, boardId, drawnVersion, getBoard, getHost } = args;
  const actions = useContext(BlockActions);
  const [found, setFound] = useState<Candidate[]>([]);
  const foundRef = useRef<Candidate[]>([]);          // the last pairing, so a re-scan that changes nothing changes nothing
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [lit, setLit] = useState<number | null>(null);   // which corner the pointer asked to see
  const [said, setSaid] = useState<Candidate | null>(null); // which block's PNG the browser could not paint
  const [open, setOpen] = useState(false);
  const menuEpoch = useRef(0);
  const [failed, setFailed] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /** Pair the drawn elements with the read blocks, together, depth first. The two trees are the same shape
   *  because both come from the same read list — what the reader CANNOT see (a collapsed accordion body, an
   *  inactive tab panel) is not in the DOM, and the walk stops where the DOM does. */
  function scan(): void {
    const board = getBoard();
    const host = getHost();
    let unresolved = false;
    const setUnresolved = (value: boolean): void => {
      pendingRef.current = value;
      setPending((previous) => previous === value ? previous : value);
    };
    const commit = (out: Candidate[]): void => {
      // Two truths must hold at once here.
      //  · LOOP AVOIDANCE, as before: an identical re-pair must not re-render (React loops on a new array).
      //    A scan that changes nothing — an observer beat with the same read list, a scroll, a resize whose
      //    rounded rects land where they already were — commits nothing.
      //  · DATA CURRENCY (the Living Boards contract): an in-place update or a version reach-back carries
      //    every surviving drawing ONTO THE VERY ELEMENT already mounted (core/living-identity.ts) — same
      //    element, same rect — while its DATA is a brand-new read. Element + geometry alone therefore do
      //    NOT say "unchanged": the candidate must hold the block the reader is looking at NOW, or a corner
      //    exports yesterday's table under today's words (and its aria-label names yesterday's too).
      //    The block reference IS the data check — kind and name are pure functions of the block, and the
      //    export reads only what the candidate's block/root hold — so comparing it is exactly "refresh the
      //    candidate whenever the read list moved, never when it did not".
      const same = out.length === foundRef.current.length
        && out.every((c, i) => c.root === foundRef.current[i].root
          && c.block === foundRef.current[i].block
          && c.left === foundRef.current[i].left && c.top === foundRef.current[i].top);
      if (same) return;
      foundRef.current = out;
      setFound(out);
    };
    if (!board || !host) {
      commit([]);
      setUnresolved(false);
      return;
    }
    const out: Candidate[] = [];
    const measure = (block: Block, root: HTMLElement, kind: "chart" | "table"): void => {
      const r = root.getBoundingClientRect();
      const t = host.getBoundingClientRect();
      const name = kind === "table"
        ? (block as { caption?: string }).caption ?? ""
        : ((block as { spec: ChartSpec }).spec.title ?? (block as { spec: ChartSpec }).spec.series[0]?.name ?? "Chart");
      const at = cornerOf(r, t);   // the block's OWN corner, clear of the tag's global stack
      out.push({ block, root, kind, name, left: at.left, top: at.top });
    };
    // The three slotless lists — top level, section bodies, tab panels — expose one identity slot per child:
    // pair each block with the element its slot holds (skipped when nothing drew; the whole list stays
    // provisional while any slot is still loading). This is the cell mechanism, extended — see core/drawSlot.tsx.
    const inspectSlot = (node: Element): SlotDraw<Element> => {
      if (getSlotStatus(node)?.state === "loading") return { state: "loading" };
      const child = node.firstElementChild;
      const result: SlotDraw<Element> = child ? { state: "ready", value: child } : { state: "skipped" };
      setSlotStatus(node, result.state, "renderer");
      return result;
    };
    const slots = (parent: Element): SlotDraw<Element>[] =>
      [...parent.querySelectorAll(":scope > .hb-slot")].map(inspectSlot);
    // Cells stay as the accepted mechanism drew them: the cell div IS the slot — present even when its child
    // draws nothing — so the drawn child at index i pairs with block i; nulls kept, index = slot.
    const drawn = (els: (Element | null)[]): SlotDraw<Element>[] =>
      els.map((el) => (el ? { state: "ready", value: el } : { state: "skipped" }));
    const walk = (list: Block[], draws: SlotDraw<Element>[]): void => {
      const model: SlotDraw<{ block: Block; element: Element }>[] = list.map((block, i) => {
        const draw = draws[i];
        if (!draw || draw.state === "skipped") return { state: "skipped" };
        if (draw.state === "loading") return { state: "loading" };
        return { state: "ready", value: { block, element: draw.value } };
      });
      const settled = settleSlots(model);
      if (settled === null) unresolved = true;
      // Pending siblings may have provisional corners, but runBlock refuses every act until this ordered list settles.
      const entries = settled ?? model.map((slot) => slot.state === "ready" ? slot.value : null);
      entries.forEach((entry) => {
        if (!entry) return;   // nothing was drawn here: no corner to pair — and the SLOTS STAY PUT (CodeRabbit
                           // on #75: a container child that renders nothing — an image strip where every
                           // photo failed — must not shift the LATER children's indices onto the wrong block)
        const { block, element: el } = entry;
        if (block.type === "table" || block.type === "chart") {
          measure(block, el as HTMLElement, block.type);
          return;
        }
        if (!CONTAINER.includes(block.type)) return;
        const root = el as HTMLElement;
        const container = block as { children?: Block[]; tabs?: { label: string; children: Block[] }[] };
        if (block.type === "tabs") {
          const tabs = [...root.querySelectorAll(":scope > .hb-tab-bar > .hb-tab")];
          const at = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
          const panel = root.querySelector(":scope > .hb-tab-panel");
          const children = container.tabs?.[at >= 0 ? at : 0]?.children ?? [];
          if (panel) walk(children, slots(panel));
          return;
        }
        if (block.type === "section") {
          const body = root.querySelector(":scope > .hb-section-body");
          if (body) walk(container.children ?? [], slots(body));   // a closed section's body is not drawn at all
          return;
        }
        const cellClass = block.type === "grid" ? ".hb-grid-cell" : block.type === "row" ? ".hb-row-cell" : ".hb-column";
        const cells = [...root.querySelectorAll(`:scope > ${cellClass}`)];
        walk(container.children ?? [], drawn(cells.map((c) => c.firstElementChild)));   // nulls KEPT: index = slot
      });
    };
    walk(blocks, slots(board));
    setUnresolved(unresolved);
    commit(out);
  }

  // The observers outlive a render; scan must not. Every re-pair runs the CURRENT closure.
  const scanRef = useRef(scan);
  scanRef.current = scan;

  useLayoutEffect(() => {
    scanRef.current();
  }, [blocks, stored]);   // eslint-disable-line react-hooks/exhaustive-deps -- the scan reads the live DOM

  useEffect(() => {
    const board = getBoard();
    if (!board) return;
    const observer = new MutationObserver(() => scanRef.current());   // tabs switched, a section opened: re-pair
    observer.observe(board, { childList: true, subtree: true });
    const onResize = () => scanRef.current();
    window.addEventListener("resize", onResize);
    // Any scroller can move a block under its pinned corner — the reply pane especially: its boards scroll
    // inside a fixed surface, so the layer must re-measure with the scroll. Capture catches every scroller.
    const onScroll = () => scanRef.current();
    window.addEventListener("scroll", onScroll, true);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => scanRef.current());
      ro.observe(board);
    }
    return () => {
      observer.disconnect();
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [getBoard]);   // eslint-disable-line react-hooks/exhaustive-deps -- scan() is stable over the live DOM

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const node = e.target as Node;
      if (menuRef.current?.contains(node) || menuButtonRef.current?.contains(node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      menuButtonRef.current?.focus();  // the control gets its reader back, like every dialog here does
    };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The menu opens ON its first option and keeps the arrows inside it (the APG menu-button pattern its
  // role="menu" promises, asked for on #75): a reader never Tabs blindly through a menu's items. Selection
  // and Escape hand focus back to the trigger; pointer-away and blur close.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>("button[role='menuitem']")?.focus();
  }, [open]);

  const menuKeys = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button[role='menuitem']") ?? [])];
    if (!items.length) return;
    const at = items.findIndex((b) => b === document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();  // the menu owns its arrows: Down steps, Up returns, both wrap
      const next = e.key === "ArrowDown"
        ? (at + 1) % items.length
        : (at - 1 + items.length) % items.length;
      items[next].focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1].focus();
    }
  };

  /** The lit corner: the pointer asked to see the block it is over. (Keyboard readers need no lighting: every
   *  corner control is already in the tab order; :focus-visible shows it whole.) */
  function light(e: { target: EventTarget | null; currentTarget: EventTarget | null }): void {
    const node = e.target as Element | null;
    if (node?.closest?.(".hb-export-btn, .hb-export, .hb-export-menu")) return;  // stepping onto the chrome is not leaving
    const at = found.findIndex((c) => c.root.contains(node as Node));
    setLit(at >= 0 ? at : null);
  }

  /** One block, exported — its data from the read list, its picture from the one drawn element. No model, no
   *  composer: the bytes come out of what the page already has. */
  async function runBlock(c: Candidate): Promise<void> {
    if (pendingRef.current) return;
    setSaid(null);   // a retry clears the old word before anything else can answer
    if (c.block.type === "table") {
      saveBlob(tableCsvBlob(c.block as TableBlock), `${fileBase((c.block as { caption?: string }).caption, "table")}.csv`);
      return;
    }
    try {
      const filename = `${chartFileBase(c.root)}.png`;
      const blob = await chartPng(c.root, { spec: (c.block as { spec: ChartSpec }).spec });
      if (blob) saveBlob(blob, filename);
      else setSaid(c);  // no 2D here: the word is the truth, no download is a lie
    } catch {
      setSaid(c);       // a raster that REJECTED failed the very same act as one that returned nothing
    }
  }

  /** The whole board: JSON from the envelope this page loaded (zero doors); Markdown from the ONE host
   *  writer, asked at the version the CURRENT DRAWING committed with — the ask is always versioned, so a
   *  host advance the view has not seen cannot answer a newer board than the one on screen, and a
   *  selection whose load has not landed cannot answer the one merely clicked. A drawing that names no
   *  version is refused rather than guessed: nothing is ever written from a guess — no id, no door, no
   *  answer, no version on screen, and the word says so. */
  async function runBoard(kind: "markdown" | "json"): Promise<void> {
    const base = `board-${boardId ?? "board"}`;
    const epoch = menuEpoch.current;
    const isCurrent = () => epoch === menuEpoch.current;
    const done = () => {
      if (!isCurrent()) return;  // a stale answer must not close a menu reopened while it waited
      setFailed(null);
      setOpen(false);
      menuButtonRef.current?.focus();
    };
    const fail = () => {
      if (isCurrent()) setFailed("Nothing was exported.");
    };
    if (kind === "markdown") {
      if (!boardId || !actions.rest || drawnVersion === null) {
        fail();  // the screen's version is not identifiable: refuse, never guess
        return;
      }
      try {
        const answer = await actions.rest(`/blocks/${boardId}/markdown?version=${drawnVersion}`);
        const text = (answer as { markdown?: unknown } | null)?.markdown;
        if (typeof text !== "string") {
          fail();  // an answer that does not carry the words writes no file
          return;
        }
        saveBlob(new Blob([markdownFile(text)], { type: "text/markdown;charset=utf-8" }), `${base}.md`);
        done();
      } catch {
        fail();  // a door that answers "gone" writes no file
      }
      return;
    }
    if (stored === null || stored === undefined) {
      fail();
      return;
    }
    saveBlob(new Blob([jsonFile(stored)], { type: "application/json" }), `${base}.json`);
    done();
  }

  const bind: ExportBind = {
    onPointerMove: (e) => light(e),
    onPointerLeave: () => setLit(null),
    onFocus: (e) => light(e),
    onBlur: (e) => {
      const to = e.relatedTarget as Element | null;
      if (to?.closest?.(".hb-export-btn, .hb-export, .hb-export-menu")) return;
      setLit(null);
    },
  };

  const menu = (
    <button ref={menuButtonRef} type="button" className="hb-export"
      aria-label="Export board" aria-haspopup="menu"
      aria-expanded={open} onClick={() => { menuEpoch.current += 1; setOpen((o) => !o); setFailed(null); }}>
      <IconDownload />
    </button>
  );
  const blurAway = (e: ReactFocusEvent<HTMLDivElement>): void => {
    const to = e.relatedTarget as Element | null;
    if (!to || !(menuRef.current?.contains(to) || menuButtonRef.current?.contains(to))) setOpen(false);
  };
  const popover = open && (
    <div ref={menuRef} className="hb-export-menu" role="menu" aria-label="Export the whole board"
      onKeyDown={menuKeys} onBlur={blurAway}>
      <button type="button" role="menuitem" onClick={() => void runBoard("markdown")}>Markdown</button>
      <button type="button" role="menuitem" onClick={() => void runBoard("json")}>JSON</button>
      {failed && <div className="hb-export-failed" role="status" aria-live="polite">{failed}</div>}
    </div>
  );

  const saidAt = said ? found.indexOf(said) : -1;  // identity, not index: a re-pair that moved retires the word
  const layer = (
    <div className="hb-export-layer">
      {found.map((c, i) => (
        <button key={i} type="button"
          className={i === lit ? "hb-export-btn lit" : "hb-export-btn"}
          disabled={pending} aria-disabled={pending}
          style={{ left: `${c.left}px`, top: `${c.top}px` }}
          aria-label={`Export ${c.kind === "table" ? "table" : "chart"}${c.name ? ` “${c.name}”` : ""} as ${c.kind === "table" ? "CSV" : "PNG"}`}
          onClick={() => void runBlock(c)}>
          <IconDownload />
        </button>
      ))}
      {saidAt >= 0 && (
        <span className="hb-export-said" role="status" aria-live="polite"
          style={{ left: `${said!.left}px`, top: `${said!.top + EXPORT_BTN + 4}px` }}>
          No picture could be exported.
        </span>
      )}
    </div>
  );

  const whole = (
    <>
      {menu}
      {popover}
    </>
  );
  return { bind, menu: whole, layer };
}

/** One quiet glyph for every export control: the arrow into the tray. */
function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v10m0 0l-4-4m4 4l4-4M4 19h16" />
    </svg>
  );
}
