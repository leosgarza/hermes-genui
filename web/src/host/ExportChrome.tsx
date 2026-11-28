// The export affordance, host chrome end to end (enhancement #6). Zero model round-trips, zero bytes over the
// composer, and ZERO requests at export time: the board's stored envelope arrived with the board itself and has
// sat in this page's memory since — Markdown is written by the host-side twin of the chat serializer
// (lib/markdown.ts), JSON is that stored envelope, and PNG/CSV never needed the door at all. Two controls:
//  · A CORNER BUTTON for EVERY exportable block — every chart (the SVG kinds and the DOM-drawn horizontal-bar
//    kind) and every table, at any depth: a parallel walk of the read block tree and the drawn DOM finds the
//    blocks the reader can actually see (collapsed section children and inactive tab panels are not drawn, so
//    they have no button; mount changes rescan). The button is ALWAYS in the DOM — a focusable, properly-named
//    control even while it is invisible — so a keyboard reader Tabs to it and Enter exports it without a mouse
//    ever existing; the pointer merely lights it early (hover reveals the corner, focus reveals it fully).
//    It sits IN the block's own corner, in a layer OUTSIDE .hb-blocks: the board's DOM stays exactly what it
//    always was, the one drawn instance is never re-mounted, and the walk pairs data with the elements the
//    reader is looking at.
//  · A BOARD MENU beside the expand control: the whole board as Markdown (serializer twin, uncapped — a file
//    is not one chat message) or as JSON (the stored envelope, whole). Inside the expanded dialog both controls
//    stay with the board: the corner layer rides inside the dialog host (the focus trap finds it), and the menu
//    moves to the dialog's own corner beside the close control. Nothing is ever faked: no envelope, no file,
//    and the word says so.
// The provenance footer (core/provenance.ts — the one composition the drawn footer uses) travels with every
// export: the Markdown and JSON files, the CSV comment line, and the chart PNG as a caption line of its own.
import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { PointerEvent as ReactPointerEvent, FocusEvent as ReactFocusEvent } from "react";
import { provenanceLine, provenanceOf } from "../core/provenance";
import type { Block } from "../registry";
import type { ChartSpec } from "../blocks/chart/chartData";
import { chartFileBase, chartPng, csvBlob, fileBase, jsonFile, markdownFile, saveBlob } from "../lib/export";
import { blocksAsMarkdown } from "../lib/markdown";
import { BlockActions } from "./actions";

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
  menu: ReactNode;                  // the board menu: the tag's chrome row at rest
  dialogMenu: ReactNode;            // …and the dialog's corner while expanded (only one of the two is ever drawn)
  layer: ReactNode;                 // the per-block corner layer: a child of the board host, never of .hb-blocks
};

/** The walk's container kinds, in the shape the READER guarantees (layout/read.ts flattens what it cannot draw). */
const CONTAINER = ["row", "section", "grid", "columns", "tabs"];

/** store.blocks_of, host-side: the blocks inside a stored board, either shape; anything else has none. */
function blocksOf(board: unknown): unknown[] {
  if (Array.isArray(board)) return board;
  if (board && typeof board === "object" && Array.isArray((board as { blocks?: unknown }).blocks)) {
    return (board as { blocks: unknown[] }).blocks;
  }
  return [];
}

export function useExportChrome(args: {
  blocks: Block[]; asOf?: string; live?: boolean; stored: unknown; expanded: boolean;
  getBoard: () => HTMLElement | null; getHost: () => HTMLElement | null;
}): ExportChrome {
  const { blocks, asOf, live, stored, expanded, getBoard, getHost } = args;
  const actions = useContext(BlockActions);
  const provenance = provenanceOf(blocks, asOf, live);   // the same reading Blocks draws with; every export agrees with it
  const line = provenanceLine(provenance);               // its one line: CSV comment, PNG caption, MD footer
  const [found, setFound] = useState<Candidate[]>([]);
  const foundRef = useRef<Candidate[]>([]);          // the last pairing, so a re-scan that changes nothing changes nothing
  const [lit, setLit] = useState<number | null>(null);   // which corner the pointer asked to see
  const [said, setSaid] = useState<number | null>(null); // which block's PNG the browser could not paint
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /** Pair the drawn elements with the read blocks, together, depth first. The two trees are the same shape
   *  because both come from the same read list — what the reader CANNOT see (a collapsed accordion body, an
   *  inactive tab panel) is not in the DOM, and the walk stops where the DOM does. */
  function scan(): void {
    const board = getBoard();
    const host = getHost();
    const commit = (out: Candidate[]): void => {     // an identical re-pair must not re-render (React loops on a new array)
      const same = out.length === foundRef.current.length
        && out.every((c, i) => c.root === foundRef.current[i].root && c.left === foundRef.current[i].left
          && c.top === foundRef.current[i].top);
      if (same) return;
      foundRef.current = out;
      setFound(out);
    };
    if (!board || !host) {
      commit([]);
      return;
    }
    const out: Candidate[] = [];
    const place = (el: Element): Element => {  // unwrap one placement wrapper: the card itself, where its corner is
      let node = el;
      while (node instanceof HTMLElement && node.classList.contains("hb-place")) node = node.firstElementChild ?? node;
      return node;
    };
    const measure = (block: Block, el: HTMLElement, kind: "chart" | "table"): void => {
      const root = place(el) as HTMLElement;
      const r = root.getBoundingClientRect();
      const t = host.getBoundingClientRect();
      const name = kind === "table"
        ? (block as { caption?: string }).caption ?? ""
        : ((block as { spec: ChartSpec }).spec.title ?? (block as { spec: ChartSpec }).spec.series[0]?.name ?? "Chart");
      out.push({ block, root, kind, name, left: Math.round(r.right - t.left) - 34, top: Math.round(r.top - t.top) + 6 });
    };
    const walk = (list: Block[], els: Element[]): void => {
      list.forEach((block, i) => {
        const el = els[i];
        if (!el) return;   // the drawing stopped with this container's children (a closed body): nothing to reach
        if (block.type === "table" || block.type === "chart") {
          measure(block, el as HTMLElement, block.type);
          return;
        }
        if (!CONTAINER.includes(block.type)) return;
        const root = place(el) as HTMLElement;
        const container = block as { children?: Block[]; tabs?: { label: string; children: Block[] }[] };
        if (block.type === "tabs") {
          const tabs = [...root.querySelectorAll(":scope > .hb-tab-bar > .hb-tab")];
          const at = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
          const panel = root.querySelector(":scope > .hb-tab-panel");
          const children = container.tabs?.[at >= 0 ? at : 0]?.children ?? [];
          if (panel) walk(children, [...panel.children]);
          return;
        }
        if (block.type === "section") {
          const body = root.querySelector(":scope > .hb-section-body");
          if (body) walk(container.children ?? [], [...body.children]);   // a closed section's body is not drawn at all
          return;
        }
        const cellClass = block.type === "grid" ? ".hb-grid-cell" : block.type === "row" ? ".hb-row-cell" : ".hb-column";
        const cells = [...root.querySelectorAll(`:scope > ${cellClass}`)];
        walk(container.children ?? [], cells.map((c) => c.firstElementChild).filter((c): c is Element => !!c));
      });
    };
    walk(provenance.list, [...board.children]);
    commit(out);
  }

  // The observers outlive a render; scan must not. Every re-pair runs the CURRENT closure.
  const scanRef = useRef(scan);
  scanRef.current = scan;

  useLayoutEffect(() => {
    scanRef.current();
  }, [blocks, asOf, live, expanded]);   // eslint-disable-line react-hooks/exhaustive-deps -- the scan reads the live DOM

  useEffect(() => {
    const board = getBoard();
    if (!board) return;
    const observer = new MutationObserver(() => scanRef.current());   // tabs switched, a section opened: re-pair
    observer.observe(board, { childList: true, subtree: true });
    const onResize = () => scanRef.current();
    window.addEventListener("resize", onResize);
    // Any scroller can move a block under its pinned corner — the dialog especially: its board scrolls INSIDE
    // the fixed host, so the layer must re-measure with the scroll. Capture catches every scroller, host included.
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

  useEffect(() => {
    if (expanded) {
      setOpen(false);
      setLit(null);
    }
  }, [expanded]);

  /** The lit corner: the pointer asked to see the block it is over. (Keyboard readers need no lighting: every
   *  corner control is already in the tab order; :focus-visible shows it whole.) */
  function light(e: { target: EventTarget | null; currentTarget: EventTarget | null }): void {
    const node = e.target as Element | null;
    if (node?.closest?.(".hb-export-btn, .hb-export, .hb-export-menu")) return;  // stepping onto the chrome is not leaving
    const at = found.findIndex((c) => c.root.contains(node as Node));
    setLit(at >= 0 ? at : null);
  }

  /** One block, exported — its data from the read list, its picture from the one drawn element. No request, no
   *  model: the bytes come out of what the page already has. */
  async function runBlock(c: Candidate): Promise<void> {
    if (c.block.type === "table") {
      // A structured table's columns carry a label and its rows are cells by column id; a legacy table's are plain
      // strings. The CSV writes the words people see either way.
      const table = c.block as {
        columns: (string | { id: string; label: string })[];
        rows: (string[] | { cells: Record<string, { text: string }> })[];
      };
      const structured = table.columns.length > 0 && typeof table.columns[0] !== "string";
      const headers = structured
        ? (table.columns as { label: string }[]).map((col) => col.label)
        : (table.columns as string[]);
      const rows = structured
        ? (table.rows as { cells: Record<string, { text: string }> }[]).map((row) =>
            (table.columns as { id: string }[]).map((col) => row.cells[col.id]?.text ?? ""))
        : (table.rows as string[][]);
      saveBlob(csvBlob(headers, rows, line), `${fileBase(c.block.caption, "table")}.csv`);
      return;
    }
    const blob = await chartPng(c.root, { spec: (c.block as { spec: ChartSpec }).spec, provenance: line });
    if (blob) saveBlob(blob, `${chartFileBase(c.root)}.png`);
    else setSaid(found.indexOf(c));  // no 2D here: the word is the truth, no download is a lie
  }

  /** The whole board, from the envelope this page loaded and the serializer twin. Zero doors answered: an
   *  export asked with the door torn off works exactly as well as one asked with the door on. */
  function runBoard(kind: "markdown" | "json"): void {
    if (stored === null || stored === undefined) {
      setFailed("Nothing was exported.");
      return;
    }
    const base = `board-${actions.blockId ?? "board"}`;
    if (kind === "markdown") {
      saveBlob(new Blob([markdownFile(blocksAsMarkdown(blocksOf(stored)), provenance)], {
        type: "text/markdown;charset=utf-8",
      }), `${base}.md`);
    } else {
      saveBlob(new Blob([jsonFile(stored)], { type: "application/json" }), `${base}.json`);
    }
    setFailed(null);
    setOpen(false);
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
    <button ref={menuButtonRef} type="button" className={expanded ? "hb-export hb-export-dialog" : "hb-export"}
      aria-label="Export board" aria-haspopup="menu"
      aria-expanded={open} onClick={() => { setOpen((o) => !o); setFailed(null); }}>
      <IconDownload />
    </button>
  );
  const popover = open && (
    <div ref={menuRef} className="hb-export-menu" role="menu" aria-label="Export the whole board">
      <button type="button" role="menuitem" onClick={() => runBoard("markdown")}>Markdown</button>
      <button type="button" role="menuitem" onClick={() => runBoard("json")}>JSON</button>
      {failed && <div className="hb-export-failed" role="status" aria-live="polite">{failed}</div>}
    </div>
  );

  const layer = (
    <div className="hb-export-layer">
      {found.map((c, i) => (
        <button key={i} type="button"
          className={i === lit ? "hb-export-btn lit" : "hb-export-btn"}
          style={{ left: `${c.left}px`, top: `${c.top}px` }}
          aria-label={`Export ${c.kind === "table" ? "table" : "chart"}${c.name ? ` “${c.name}”` : ""} as ${c.kind === "table" ? "CSV" : "PNG"}`}
          onClick={() => runBlock(c)}>
          <IconDownload />
        </button>
      ))}
      {said !== null && found[said] && (
        <span className="hb-export-said" role="status" aria-live="polite"
          style={{ left: `${found[said].left}px`, top: `${found[said].top + 30}px` }}>
          No picture could be exported.
        </span>
      )}
    </div>
  );

  // One menu, one popover, one state — mounted in the tag's chrome row at rest and in the dialog's corner while
  // expanded. Exactly one of the two is ever drawn, and the reader keeps the whole board export either way.
  const whole = (
    <>
      {menu}
      {popover}
    </>
  );
  return { bind, menu: expanded ? null : whole, dialogMenu: expanded ? whole : null, layer };
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
