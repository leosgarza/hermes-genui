// What a board's provenance IS, in one place: the first top-level source line the footer absorbs (drawn there,
// not twice), the sources the charts add beside it — once each, in draw order — and the envelope's as_of and its
// live/snapshot word. core/Blocks.tsx draws this; lib/export.ts writes it into Markdown exports. Both read it
// from here, so the footer and the export can never disagree about where a board's data came from.
// A board that declares nothing (no as_of, no live word) is not a provenance board at all: every block stays on
// the drawing list, the source line keeps its place on the board, and the export line says nothing.
import type { Block } from "../registry";
import type { SourceBlock } from "../blocks/source/read";

export type BoardProvenance = {
  declared: boolean;
  /** The blocks to draw: the stored list minus an absorbed source line. */
  list: Block[];
  /** The top-level source line the footer owns, when the board declares provenance and has one. */
  source?: SourceBlock;
  /** The charts' own sources: each one once, in draw order, never repeating the footer's. */
  chartSources: string[];
  asOf?: string;
  live?: boolean;
};

export function provenanceOf(blocks: Block[], asOf?: string, live?: boolean): BoardProvenance {
  const declared = asOf !== undefined || live !== undefined;
  if (!declared) return { declared, list: blocks, chartSources: [], asOf, live };
  let list = blocks;
  let source: SourceBlock | undefined;
  const at = blocks.findIndex((b) => b.type === "source");
  if (at >= 0) {
    source = blocks[at] as SourceBlock;
    list = blocks.filter((_, i) => i !== at);
  }
  const said = new Set<string>(source ? [source.text] : []);
  const chartSources: string[] = [];
  for (const b of list) {  // charts say their own source; the line joins each once, in draw order
    if (b.type !== "chart") continue;
    const s = b.spec.source;
    if (typeof s === "string" && s.trim() && !said.has(s)) {
      said.add(s);
      chartSources.push(s);
    }
  }
  return { declared, list, source, chartSources, asOf, live };
}

/** The provenance as one plain line for exports: exactly the parts the board gave, in the footer's order —
 *  the absorbed source, the charts' sources, as of, Live or Snapshot — joined the way the footer joins them.
 *  "" when the board said nothing: an export of an ordinary board carries no footer it did not have. */
export function provenanceLine(p: BoardProvenance): string {
  const parts: string[] = [];
  if (p.source) parts.push(p.source.text);
  parts.push(...p.chartSources);
  if (p.asOf) parts.push(`as of ${p.asOf}`);
  if (p.live !== undefined) parts.push(p.live ? "Live" : "Snapshot");
  return parts.join(" · ");
}
