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
// A block wrapped for placement, for its text voice, or for both, gets the one wrapper; a board with no ask
// anywhere draws the same DOM it always did.
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
import type { Align } from "./fields";
import { alignOf, textAlignOf, type FollowUp } from "./readBlocks";
import { FollowUps } from "./FollowUps";

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

/** The drawing path every container gets: children come back placed, exactly like the board's own list. */
function drawAll(blocks: Block[]): ReactNode[] {
  return blocks.map((b, i) => <Placed key={i} block={b} />);
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
      {source && <Placed block={source} />}
      <div className="hb-provenance-line">{parts}</div>
    </div>
  );
}

export function Blocks({ blocks, boardAlign, boardTextAlign, boardAsOf, boardLive, boardFollowUps }: {
  blocks: Block[]; boardAlign?: Align; boardTextAlign?: Align; boardAsOf?: string; boardLive?: boolean;
  boardFollowUps?: FollowUp[];
}) {
  const declared = boardAsOf !== undefined || boardLive !== undefined;
  let list = blocks;
  let source: SourceBlock | undefined;
  let chartSources: string[] = [];
  if (declared) {  // the first top-level source line belongs to the footer, not twice on the board
    const at = blocks.findIndex((b) => b.type === "source");
    if (at >= 0) {
      source = blocks[at] as SourceBlock;
      list = blocks.filter((_, i) => i !== at);
    }
    const said = new Set<string>(source ? [source.text] : []);
    for (const b of list) {  // charts say their own source; the line joins each once, in draw order
      if (b.type !== "chart") continue;
      const s = b.spec.source;
      if (typeof s === "string" && s.trim() && !said.has(s)) {
        said.add(s);
        chartSources.push(s);
      }
    }
  }
  return (
    <AlignScope.Provider value={{ board: boardAlign, text: boardTextAlign }}>
      <div className="hb-blocks">
        <FlowLightBoard>{drawAll(list)}</FlowLightBoard>
        {declared && <Provenance source={source} chartSources={chartSources} asOf={boardAsOf} live={boardLive} />}
        {!!boardFollowUps?.length && <FollowUps items={boardFollowUps} place={boardAlign} />}
      </div>
    </AlignScope.Provider>
  );
}
