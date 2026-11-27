// Draws a list of blocks in order. Each type's drawing is its entry in registry.tsx; containers draw their children
// through the same lookup. One list is one board: its blocks share which flow node a steps block has lit.
// Where a block sits across its column or cell is the board's placement, resolved for every block wherever it sits:
// `align` says it per block (readBlocks.ts), `boardAlign` defaults it for every block that didn't ask, and a block
// that says nothing on a board that says nothing sits left as it always has. The model's cascade — block, board,
// left — is the whole rule; the reader has no override. Containers draw their children through this same placement,
// so a child's own word and the board's default both reach inside a grid, row, columns,
// section or tab panel; each block is placed within the cell it already had, and the cell keeps the layout it owns.
// The same block also answers for how the words read inside the blocks that carry words (heading, text, stat,
// callout): `text_align` per block, `boardTextAlign` for every block that didn't ask, left when neither says.
// A block wrapped for placement, for its text voice, or for both, gets the one wrapper; and the wrapper
// is now the block's STABLE root: every block sits in a .hb-place element, asked or not. Where nothing
// is asked the root carries .hb-bare and generates NO BOX (display: contents) — the block is laid out,
// measured and exported exactly as an unwrapped block has always been, and an unsaid board still renders
// byte-identically. What changed is why: a living update that only flips a placement word must not
// re-wrap the block's element tree, or the calculator inside it remounts and its half-dragged slider is
// gone (review round 3, defect 1). Placement is a class on the stable root, never a shape change.
// A board whose envelope declares provenance (boardAsOf or boardLive) also grows a quiet footer — its source,
// when its data is from, and the word Live or Snapshot. The source part joins both attributions the board says:
// its first top-level source block — drawn here rather than twice, and placed exactly like any block, through
// Placed's own resolution — and the `source` each chart block carries, deduped in draw order (the chart keeps
// its inline line). The absorbed source gets its own full-width row inside the footer, never a flex child of the
// join line: a .hb-place only shares out space a block context left over, so a place squeezed into the line's
// flex row would collapse to its content and every word would sit back at the left. The join line — the charts'
// sources, as_of · the badge — reads as its own line beside it. A board that declares nothing draws exactly what
// it always drew.
// A board whose envelope offers follow-ups (boardFollowUps, readBlocks.ts) also grows a quiet strip beneath
// everything — even beneath the provenance footer: up to four tappable prompts the AI chose so the reader can
// continue the conversation in one tap. Their drawing is core/FollowUps.tsx; the row costs a fit-content hug
// zero width and wraps long labels rather than clip them. Nothing offered, no strip: the same DOM as always.
import { createContext, Fragment, useContext, type ReactNode } from "react";
import { FlowLightBoard } from "../blocks/flow/highlight";
import type { SourceBlock } from "../blocks/source/read";
import { REGISTRY, type Block } from "../registry";
import type { BlockEntry } from "./types";
import type { Align, Density, Motion, Palette } from "./fields";
import { alignOf, textAlignOf, type FollowUp } from "./readBlocks";
import { provenanceOf } from "./provenance";
import { FollowUps } from "./FollowUps";
import { MotionScope, type MotionPref } from "../lib/motion";
import { carriedKey, identityOf, mintKey, noteMounted } from "./living-identity";
import { BlockSlot } from "./blockState";

/** The model's motion word, told to the drawings that animate by hand: only "reduced" stills them, and
 *  it can never un-still a reader whose own system asks for less motion (lib/motion.ts). */
const motionPref = (word?: Motion): MotionPref => (word === "reduced" ? "reduced" : "full");

/** The two board-wide voices, carried down so every block — top level or nested — resolves both the same way:
 *  `board` places the cards, `text` says how the words inside the blocks that carry text should read. */
const AlignScope = createContext<{ board?: Align; text?: Align }>({ board: undefined, text: undefined });

/** The blocks whose whole draw is words, where a text voice has something to move. A drawing that owns a layout
 *  (a chart, a table, photos, any container) is never re-typed by the board: the ask is simply not drawn there.
 *  A kind joins this set only where its words fill a line box wide enough for the voice to distribute them —
 *  Chrome measures every kind below at real word position; a shrink-wrapped text container (the callout body)
 *  is opened for the ask in tokens.css, never by default. */
const TEXT_BEARING: ReadonlySet<string> = new Set(["heading", "text", "stat", "callout"]);

function BlockView({ block }: { block: Block }) {
  const entry = REGISTRY[block.type] as BlockEntry<Block> | undefined;
  if (!entry) return null;
  const { Component } = entry;
  return <Component block={block} draw={drawAll} />;
}

/** One block wherever it sits: its root is ALWAYS the one .hb-place element, asked for or not. Where the
 *  model asked for a place (away from left) or a text voice, the wrapper carries the variant class and
 *  box; where it asked for nothing the wrapper carries .hb-bare and generates no box (display: contents),
 *  so an unsaid board lays out and measures exactly as it always drew. Placement is a class on the
 *  stable root — never a re-wrap — so a flip to or from left keeps the mounted block's live subtree
 *  (a half-dragged slider, an unsent form) instead of remounting it (review round 3, defect 1).
 *  The wrapper also answers for the block's identity SLOT (round 5): the block's own flat identity hung
 *  on the chain of identity blocks above it, and passed down through BlockView so every child list this
 *  block draws chains under it. Context only — no DOM — an unsaid board's bytes are untouched. */
function Placed({ block, flat }: { block: Block; flat: string }) {
  const parent = useContext(BlockSlot);
  const slot = parent === null ? flat : `${parent}/${flat}`;
  const { board, text } = useContext(AlignScope);
  const at = alignOf(block) ?? board ?? "left";
  const ta = TEXT_BEARING.has(block.type) ? textAlignOf(block) ?? text ?? "left" : "left";
  const cls = ["hb-place"];
  if (at !== "left") cls.push(`hb-place-${at}`);
  if (ta !== "left") cls.push(`hb-ta-${ta}`);
  if (at === "left" && ta === "left") cls.push("hb-bare");
  return (
    <BlockSlot.Provider value={slot}>
      <div className={cls.join(" ")} {...(at !== "left" ? { "data-align": at } : {})}
        {...(ta !== "left" ? { "data-text-align": ta } : {})}><BlockView block={block} /></div>
    </BlockSlot.Provider>
  );
}

/** A block's identity is the block's OWN words, never the slot it sits in and never its children's —
 *  and across a living board's update the key is CARRIED, not re-derived: core/living-identity.ts holds
 *  the whole rule (canonicalization, the skipped `path` stamp and #6 wrapper words, and the carry that
 *  hands a retained block the key it was mounted under, so same-worded twins stay distinguishable with
 *  no positional ordinal — review round 3, defect 2). drawAll below just asks for the key.
 *  Every block also gets its identity SLOT (`own-words hash:occurrence among its same-worded siblings
 *  in this drawn list`) through BlockSlot context — round 5's home for interactive state on the board,
 *  computed here once and counted exactly the way the legacy key counts, so key and slot can never
 *  disagree. */
function blockKey(b: Block, id: string, occ: number, carried: boolean): string {
  const asked = carriedKey(b);
  if (asked !== undefined) { noteMounted(b, asked); return asked; }
  if (carried) { const fresh = mintKey(b); noteMounted(b, fresh); return fresh; }
  const legacy = `${id}:${occ}`;
  noteMounted(b, legacy);
  return legacy;
}

/** The drawing path every container gets: children come back placed, exactly like the board's own list.
 *  A list an update has carried is keyed wholly by carried identity (a straggler gets a fresh mint, so
 *  no carried key and no legacy ordinal ever collide in one list); a plain list — every unsaid board,
 *  every first draw — keeps the accepted content key with its occurrence ordinal, byte for byte. */
function drawAll(blocks: Block[]): ReactNode[] {
  const seen = new Map<string, number>();
  const carried = blocks.some((b) => carriedKey(b) !== undefined);
  return blocks.map((b) => {
    const id = identityOf(b);
    const occ = seen.get(id) ?? 0;
    seen.set(id, occ + 1);
    return <Placed key={blockKey(b, id, occ, carried)} block={b} flat={`${id}:${occ}`} />;
  });
}

/** The quiet footer of a board that declares where its data came from and when. Only the parts the board gave
 *  are shown. The absorbed source block is placed like any block — its own ask, the board's default — and it
 *  sits on its own full-width row, the same block-context column a board's own blocks fill:
 *  put inside the join line's flex row it would shrink-wrap and every word would land back at the left edge.
 *  The join line — each chart's `source` once in draw order, as_of · the badge — reads beside it. The badge
 *  carries its word, Live or Snapshot; colour only sits beside it. */
function Provenance({ source, chartSources, asOf, live }: {
  source?: SourceBlock; chartSources?: string[]; asOf?: string; live?: boolean;
}) {
  const parts: ReactNode[] = [];
  const add = (key: string, node: ReactNode) => {
    if (parts.length) parts.push(<span key={`${key}-dot`} className="hb-provenance-dot" aria-hidden="true">·</span>);
    parts.push(<Fragment key={key}>{node}</Fragment>);
  };
  for (const [i, s] of (chartSources ?? []).entries()) {
    add(`chart-${i}`, <span className="hb-provenance-source">{s}</span>);
  }
  if (asOf) add("as_of", <span className="hb-provenance-time">{asOf}</span>);
  if (live !== undefined) {
    add("live", <span className="hb-provenance-badge" data-live={live ? "live" : "snapshot"}>{live ? "Live" : "Snapshot"}</span>);
  }
  return (
    <div className="hb-provenance">
      {source && <Placed block={source} flat={`${identityOf(source)}:0`} />}
      <div className="hb-provenance-line">{parts}</div>
    </div>
  );
}

export function Blocks({ blocks, boardAlign, boardTextAlign, boardAsOf, boardLive, boardFollowUps,
  boardDensity, boardPalette, boardMotion }: {
  blocks: Block[]; boardAlign?: Align; boardTextAlign?: Align; boardAsOf?: string; boardLive?: boolean;
  boardFollowUps?: FollowUp[]; boardDensity?: Density; boardPalette?: Palette; boardMotion?: Motion;
}) {
  // What the board's origins ARE is core/provenance.ts, the same reading an export writes; this draws it.
  const { declared, list, source, chartSources } = provenanceOf(blocks, boardAsOf, boardLive);
  // The board's look words (enhancement #7) mark the root, and only when they ask for something the default
  // isn't: compact, cool/warm, reduced. comfortable, default, full and any unknown word grow no attribute —
  // a board that never spoke these words draws exactly the DOM and tokens it always drew. The motion word
  // also rides down as a scope, so the drawings that animate by hand (flow, layers, simulate) ask once.
  const look: Record<string, string> = {};
  if (boardDensity === "compact") look["data-density"] = "compact";
  if (boardPalette === "cool" || boardPalette === "warm") look["data-palette"] = boardPalette;
  if (boardMotion === "reduced") look["data-motion"] = "reduced";
  return (
    <AlignScope.Provider value={{ board: boardAlign, text: boardTextAlign }}>
      <MotionScope.Provider value={motionPref(boardMotion)}>
        <div className="hb-blocks" {...look}>
          <FlowLightBoard>{drawAll(list)}</FlowLightBoard>
          {declared && <Provenance source={source} chartSources={chartSources} asOf={boardAsOf} live={boardLive} />}
          {!!boardFollowUps?.length && <FollowUps items={boardFollowUps} place={boardAlign} />}
        </div>
      </MotionScope.Provider>
    </AlignScope.Provider>
  );
}
