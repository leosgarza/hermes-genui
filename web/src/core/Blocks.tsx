// Draws a list of blocks in order. Each type's drawing is its entry in registry.tsx; containers draw their children
// through the same lookup. One list is one board: its blocks share which flow node a steps block has lit.
// Where a block sits across its column or cell is the board's placement, resolved for every block wherever it sits:
// `align` says it per block (readBlocks.ts), `boardAlign` defaults it for every block that didn't ask, and
// `userAlign` — the reader's own choice — outranks both. Containers draw their children through this same placement,
// so a child's own word, the board's default and the reader's override all reach inside a grid, row, columns,
// section or tab panel; each block is placed within the cell it already had, and the cell keeps the layout it owns.
// Only a block placed away from left gets wrapped (a .hb-place box), so a board with no ask anywhere draws the same
// DOM it always did.
// A board whose envelope declares provenance (boardAsOf or boardLive) also grows a quiet footer — its source,
// when its data is from, and the word Live or Snapshot. The source part joins both attributions the board says:
// its first top-level source block — drawn here rather than twice, and placed exactly like any block, through
// Placed's own resolution — and the `source` each chart block carries, deduped in draw order (the chart keeps
// its inline line). The absorbed source gets its own full-width row inside the footer, never a flex child of the
// join line: a .hb-place only shares out space a block context left over, so a place squeezed into the line's
// flex row would collapse to its content and every word would sit back at the left. The join line — the charts'
// sources, as_of · the badge — reads as its own line beside it. A board that declares nothing draws exactly what
// it always drew.
import { createContext, Fragment, useContext, type ReactNode } from "react";
import { FlowLightBoard } from "../blocks/flow/highlight";
import type { SourceBlock } from "../blocks/source/read";
import { REGISTRY, type Block } from "../registry";
import type { BlockEntry } from "./types";
import type { Align } from "./fields";
import { alignOf } from "./readBlocks";

/** The two board-wide voices, carried down so every block — top level or nested — resolves placement the same way. */
const AlignScope = createContext<{ board?: Align; user?: Align }>({ board: undefined, user: undefined });

function BlockView({ block }: { block: Block }) {
  const entry = REGISTRY[block.type] as BlockEntry<Block> | undefined;
  if (!entry) return null;
  const { Component } = entry;
  return <Component block={block} draw={drawAll} />;
}

/** One block wherever it sits, wrapped in its place unless it sits left the way blocks do anyway. */
function Placed({ block }: { block: Block }) {
  const { board, user } = useContext(AlignScope);
  const at = user ?? alignOf(block) ?? board ?? "left";
  const view = <BlockView block={block} />;
  if (at === "left") return view;
  return <div className={`hb-place hb-place-${at}`} data-align={at}>{view}</div>;
}

/** The drawing path every container gets: children come back placed, exactly like the board's own list. */
function drawAll(blocks: Block[]): ReactNode[] {
  return blocks.map((b, i) => <Placed key={i} block={b} />);
}

/** The quiet footer of a board that declares where its data came from and when. Only the parts the board gave
 *  are shown. The absorbed source block is placed like any block — the reader's word, its own ask, the board's
 *  default — and it sits on its own full-width row, the same block-context column a board's own blocks fill:
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

export function Blocks({ blocks, boardAlign, userAlign, boardAsOf, boardLive }: {
  blocks: Block[]; boardAlign?: Align; userAlign?: Align; boardAsOf?: string; boardLive?: boolean;
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
    <AlignScope.Provider value={{ board: boardAlign, user: userAlign }}>
      <div className="hb-blocks">
        <FlowLightBoard>{drawAll(list)}</FlowLightBoard>
        {declared && <Provenance source={source} chartSources={chartSources} asOf={boardAsOf} live={boardLive} />}
      </div>
    </AlignScope.Provider>
  );
}
