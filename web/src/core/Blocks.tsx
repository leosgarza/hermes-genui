// Draws a list of blocks in order. Each type's drawing is its entry in registry.tsx; containers draw their children
// through the same lookup. One list is one board: its blocks share which flow node a steps block has lit.
// Each block draws inside its own error boundary, so one that throws leaves a small note and the rest of the board.
// Living Boards: each block also carries its identity SLOT down through BlockSlot (the chain the board files a
// block's answers under — context only, no DOM), and a list an update has CARRIED is keyed by carried identity, so
// React reconciles each surviving drawing onto the very element already mounted. A plain list — every unsaid board,
// every first draw — keeps the accepted index keys, byte for byte.
// Where a block sits across its column or cell is the board's placement, resolved for every block wherever it sits:
// `align` says it per block (readBlocks.ts), `boardAlign` defaults it for every block that didn't ask, and a block
// that says nothing on a board that says nothing sits left as it always has. The model's cascade — block, board,
// left — is the whole rule; the reader has no override. Containers draw their children through this same placement,
// so a child's own word and the board's default both reach inside a grid, row, columns, section or tab panel; each
// block is placed within the cell it already had, and the cell keeps the layout it owns.
// The same block also answers for how the words read inside the blocks that carry words (heading, text, stat,
// callout): `text_align` per block, `boardTextAlign` for every block that didn't ask, left when neither says.
// A block wrapped for placement, for its text voice, or for both, gets the one wrapper; a board with no ask
// anywhere draws the same DOM it always did.
// A board whose envelope offers follow-ups (boardFollowUps, readBlocks.ts) also grows a quiet strip beneath
// its blocks: up to four tappable prompts the AI chose so the reader can continue the conversation in one tap.
// Their drawing is core/FollowUps.tsx; the row costs a fit-content hug zero width and wraps long labels rather
// than clipping them. Nothing offered, no strip: the same DOM as always.
import { Component as ReactComponent, createContext, Fragment, useContext, type ErrorInfo, type ReactNode } from "react";
import { FlowLightBoard } from "../blocks/flow/highlight";
import { REGISTRY, type Block } from "../registry";
import type { BlockEntry } from "./types";
import type { FollowUp } from "./readBlocks";
import { FollowUps } from "./FollowUps";
import { BlockSlot } from "./blockState";
import { carriedKey, identityOf, mintKey, noteMounted } from "./living-identity";
import type { Align, Density, Motion, Palette } from "./fields";
import { alignOf, textAlignOf } from "./readBlocks";

/** The two board-wide voices, carried down so every block — top level or nested — resolves both the same way:
 *  `board` places the cards, `text` says how the words inside the blocks that carry text should read. */
const AlignScope = createContext<{ board?: Align; text?: Align }>({ board: undefined, text: undefined });

/** The blocks whose whole draw is words, where a text voice has something to move. A drawing that owns a layout
 *  (a chart, a table, photos, any container) is never re-typed by the board: the ask is simply not drawn there.
 *  A kind joins this set only where its words fill a line box wide enough for the voice to distribute them —
 *  Chrome measures every kind below at real word position (tests/test_layout_alignment.py); a shrink-wrapped text
 *  container (the callout body) is opened for the ask in tokens.css, never by default. */
const TEXT_BEARING: ReadonlySet<string> = new Set(["heading", "text", "stat", "callout"]);


function BlockView({ block }: { block: Block }) {
  const entry = REGISTRY[block.type] as BlockEntry<Block> | undefined;
  if (!entry) return null;
  const { Component } = entry;
  return <Contained block={block}><Component block={block} draw={drawAll} /></Contained>;
}

/** Catches a block that throws while drawing: it becomes a one-line note, and the block and error are logged, so the
 *  board can be turned into a test case. Its siblings and the blocks around its container still draw.
 *  [text "Before", kpis with items: null, text "After"] → Before · "This part couldn't be drawn." · After */
class Contained extends ReactComponent<{ block: Block; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error(`hermes-genui: a "${this.props.block.type}" block failed to draw`, this.props.block, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <p className="hb-block-failed" role="note">This part couldn't be drawn.</p>;
  }
}

/** The key one block draws under: the carried one if an update handed it on (and the block was mounted before),
 *  a fresh mint inside a carried list, else the accepted index key. drawAll records what it mounted, so the next
 *  carry can hand that very key on. */
function blockKey(b: Block, i: number, carried: boolean): string | number {
  const asked = carriedKey(b as object);
  if (asked !== undefined) { noteMounted(b as object, asked); return asked; }
  if (carried) { const fresh = mintKey(b); noteMounted(b as object, fresh); return fresh; }
  noteMounted(b as object, String(i));
  return i;
}

/** One block with its identity slot hung on the chain of the blocks above it, drawn inside its place. Context
 *  only for the slot: a placed board wraps the block in a .hb-place box, an unplaced one draws exactly the DOM
 *  it always drew — byte for byte, keys and all. */
function Slotted({ block, flat }: { block: Block; flat: string }) {
  const parent = useContext(BlockSlot);
  const slot = parent === null ? flat : `${parent}/${flat}`;
  return <BlockSlot.Provider value={slot}><Placed block={block} /></BlockSlot.Provider>;
}

/** The drawing path every block takes, top level or nested: children come back slotted and placed, exactly like
 *  the board's own list. */
function drawAll(blocks: Block[]): ReactNode[] {
  const seen = new Map<string, number>();
  const carried = blocks.some((b) => carriedKey(b as object) !== undefined);
  return blocks.map((b, i) => {
    const id = identityOf(b);
    const occ = seen.get(id) ?? 0;
    seen.set(id, occ + 1);
    return <Slotted key={blockKey(b, i, carried)} block={b} flat={`${id}:${occ}`} />;
  });
}

/** One block wherever it sits: wrapped in its place when it sits away from left, and marked with its text voice
 *  when it carries words and they are asked to read other than left. Either ask grows the one wrapper; nothing
 *  asked for, nothing added — the board draws exactly the DOM it always drew. */
function Placed({ block }: { block: Block }) {
  const { board, text } = useContext(AlignScope);
  const at = alignOf(block) ?? board ?? "left";
  const ta = TEXT_BEARING.has(block.type) ? textAlignOf(block) ?? text ?? "left" : "left";
  const view = <BlockView block={block} />;
  if (at === "left" && ta === "left") return view;
  const cls = ["hb-place"];
  if (at !== "left") cls.push(`hb-place-${at}`);
  if (ta !== "left") cls.push(`hb-ta-${ta}`);
  return (
    <div className={cls.join(" ")} {...(at !== "left" ? { "data-align": at } : {})}
      {...(ta !== "left" ? { "data-text-align": ta } : {})}>{view}</div>
  );
}

export function Blocks({ blocks, boardAlign, boardTextAlign, live, boardFollowUps, boardAsOf, boardDensity,
  boardPalette, boardMotion }: {
  blocks: Block[]; boardAlign?: Align; boardTextAlign?: Align; live?: boolean; boardFollowUps?: FollowUp[];
  boardAsOf?: string; boardDensity?: Density; boardPalette?: Palette; boardMotion?: Motion;
}) {
  // A board that SHOWS a source block has already said where its data came from — that block draws in the
  // flow, right above this quiet line, so repeating its words under it was a duplicate, not provenance
  // (maintainer note 2026-11-25 #1: "the same sources show twice"). The gate is total by construction and
  // said plainly: the accepted rule (provenanceParts) reads ONLY top-level source blocks, and every other
  // source carrier — a chart's inline attribution, an image's credit, a source nested in a cell — already
  // draws its own words in the flow and was accepted as this line's silence. So on any shipped board the
  // line renders with NO source words; the rule stays exported and pinned exactly as accepted, and a
  // source-less board says nothing here because there is nothing unseen to say. What survives this line
  // answers to the host, not to sources (maintainer note 2026-11-25 #2): a kept, refreshing view
  // grows it with the Live badge alone — Today's shape — while a chat tag or a panel claims nothing.
  const said = showsSourceBlock(blocks) ? [] : provenanceParts(blocks);
  const parts = boardAsOf ? [...said, `as of ${boardAsOf}`] : said;
  return (
    <AlignScope.Provider value={{ board: boardAlign, text: boardTextAlign }}>
      <div className="hb-blocks" data-density={boardDensity === "compact" ? "compact" : undefined}
        data-palette={boardPalette && boardPalette !== "default" ? boardPalette : undefined}
        data-motion={boardMotion === "reduced" ? "reduced" : undefined}>
        <FlowLightBoard>{drawAll(blocks)}</FlowLightBoard>
        {!!boardFollowUps?.length && <FollowUps items={boardFollowUps} />}
        {(parts.length > 0 || live === true) && <ProvenanceFooter parts={parts} live={live} />}
      </div>
    </AlignScope.Provider>
  );
}

/** Whether the board already shows its sources: a top-level `source` block draws in the flow, and the quiet
 *  line under it would only repeat it. Nested sources keep drawing inside their cells and stay the footer's
 *  own silence; a chart's inline attribution stays the chart's business — as accepted. */
function showsSourceBlock(blocks: Block[]): boolean {
  return blocks.some((b) => b.type === "source");
}

/** A provenance line says short things: at most this many parts, then a quiet ellipsis. */
const PROVENANCE_PARTS = 8;
/** The only shape the footer trusts as a date: the YYYY-MM-DD that read.ts already cuts from `accessed`. */
const IS_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One spoken word of the footer, folded to a single line: an embedded newline must not break a quiet line. */
function foldWord(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

/**
 * The words a board already says: every top-level `source` block contributes its item labels and `accessed`
 * dates (or, for the one-line form, its text) in draw order, each shown once. Nothing is asked of the model
 * and nothing is invented: charts keep their inline attributions to themselves, nested sources keep drawing
 * inside their cells, and a board that carries no source block says nothing here. Exported so the line's
 * rule keeps its direct pins even though the board's no-echo gate (maintainer note 2026-11-25) decides
 * whether these words are ever spoken.
 */
export function provenanceParts(blocks: Block[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const say = (raw: string | undefined): void => {
    const word = raw ? foldWord(raw) : "";
    if (!word || seen.has(word)) return;
    seen.add(word);
    out.push(word);
  };
  for (const b of blocks) {
    if (b.type !== "source") continue;
    if (b.items?.length) for (const item of b.items) { say(item.label); say(item.accessed); }
    else say(b.text);
  }
  return out;
}

/** The quiet footer line itself: label · date · … · the host's badge. Words reach it only from the board's
 *  own source data the flow does not already show (the caller gates an echo away, and keeps a live pill able
 *  to stand alone); the badge is not a board word — it arrives only when the plugin's OWN view knows this
 *  drawing keeps refreshing (DashboardView); a chat tag or a panel says nothing about freshness, and absence
 *  of the badge claims nothing either way. */
function ProvenanceFooter({ parts, live }: { parts: string[]; live?: boolean }) {
  const nodes: ReactNode[] = [];
  const join = (key: string, node: ReactNode): void => {
    if (nodes.length) {
      nodes.push(<span key={`${key}-dot`} className="hb-provenance-dot" aria-hidden="true">·</span>);
    }
    nodes.push(<Fragment key={key}>{node}</Fragment>);
  };
  for (const [i, word] of parts.entries()) {
    if (i >= PROVENANCE_PARTS) { join("more", <span className="hb-provenance-more">…</span>); break; }
    join(`part-${i}`, <span className={IS_DATE.test(word) ? "hb-provenance-time" : "hb-provenance-source"}>{word}</span>);
  }
  if (live === true) join("live", <span className="hb-provenance-badge" data-live="live">Live</span>);
  return <div className="hb-provenance">{nodes}</div>;
}
