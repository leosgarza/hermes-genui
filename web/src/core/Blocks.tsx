// Draws a list of blocks in order. Each type's drawing is its entry in registry.tsx; containers draw their children
// through the same lookup. One list is one board: its blocks share which flow node a steps block has lit.
// Where a block sits across its column or cell is the board's placement, resolved for every block wherever it sits:
// `align` says it per block (readBlocks.ts), `boardAlign` defaults it for every block that didn't ask, and
// `userAlign` — the reader's own choice — outranks both. Containers draw their children through this same placement,
// so a child's own word, the board's default and the reader's override all reach inside a grid, row, columns,
// section or tab panel; each block is placed within the cell it already had, and the cell keeps the layout it owns.
// Only a block placed away from left gets wrapped (a .hb-place box), so a board with no ask anywhere draws the same
// DOM it always did.
import { createContext, useContext, type ReactNode } from "react";
import { FlowLightBoard } from "../blocks/flow/highlight";
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

export function Blocks({ blocks, boardAlign, userAlign }: { blocks: Block[]; boardAlign?: Align; userAlign?: Align }) {
  return (
    <AlignScope.Provider value={{ board: boardAlign, user: userAlign }}>
      <div className="hb-blocks">
        <FlowLightBoard>{drawAll(blocks)}</FlowLightBoard>
      </div>
    </AlignScope.Provider>
  );
}
