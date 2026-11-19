import { describe, expect, it } from "vitest";
import catalog from "../../../core/catalog.json";
import type { Block } from "../registry";
import { alignOf, readBlocks, readBlocksNoted, textAlignOf } from "./readBlocks";

describe("readBlocks", () => {
  it("reads chart, kpis and source; skips unknown types", () => {
    const b = readBlocks([
      { type: "chart", kind: "bar", title: "Rev", x: ["Q1", "Q2"], series: [{ name: "R", data: [1, 2] }], unit: "$M" },
      { type: "kpis", items: [{ label: "Revenue", value: 182.2, unit: "$M", change: 3.8, change_unit: "%" }] },
      { type: "weather", foo: 1 },
      { type: "source", text: "SEC filings", url: "https://www.sec.gov/x" },
    ]);
    expect(b.map((x) => x.type)).toEqual(["chart", "kpis", "source"]);
    expect(b[0].type === "chart" && b[0].spec.type).toBe("bar");
  });
  it("takes a lone block object, and gives nothing for anything that isn't blocks", () => {
    expect(readBlocks({ type: "heading", text: "Day 1" })).toEqual([{ type: "heading", text: "Day 1" }]);
    expect(readBlocks("just text")).toEqual([]);
    expect(readBlocks(null)).toEqual([]);
    expect(readBlocks({ blocks: [{ type: "heading", text: "Wrapped" }] })).toEqual([{ type: "heading", text: "Wrapped" }]);
  });
  it("notes what it dropped and why", () => {
    const r = readBlocksNoted([{ type: "weather" }, "x"]);
    expect(r.blocks).toEqual([]);
    expect(r.dropped).toEqual([{ path: "0", why: 'unknown type "weather"' }, { path: "1", why: "not a block object" }]);
  });
});

describe("alignment", () => {
  // The semantic field `align` on a block spec: where the block sits in the column. Anything that isn't one of the
  // three words is ignored (the block still draws, left), the same way a callout's unknown tone becomes "info".
  it("reads a block's own align", () => {
    expect(alignOf(readBlocks([{ type: "text", text: "Hi", align: "center" }])[0])).toBe("center");
    expect(alignOf(readBlocks([{ type: "text", text: "Hi", align: "right" }])[0])).toBe("right");
    expect(alignOf(readBlocks([{ type: "text", text: "Hi", align: "left" }])[0])).toBe("left");
  });

  it("gives no align for a block that doesn't ask for one, or spells it wrongly", () => {
    expect(alignOf(readBlocks([{ type: "text", text: "Hi" }])[0])).toBeUndefined();
    for (const bad of ["middle", "up", "", "  ", 16, null, true, {}, ["center"]]) {
      expect([String(bad), alignOf(readBlocks([{ type: "text", text: "Hi", align: bad }])[0])][1]).toBeUndefined();
    }
  });

  it("takes the word trimmed and caseless, the way models write it", () => {
    expect(alignOf(readBlocks([{ type: "text", text: "Hi", align: " Center " }])[0])).toBe("center");
    expect(alignOf(readBlocks([{ type: "text", text: "Hi", align: "RIGHT" }])[0])).toBe("right");
  });

  it("reads the board-level default from the stored envelope, beside its blocks", () => {
    const r = readBlocksNoted({ align: "center", blocks: [{ type: "text", text: "Hi" }] });
    expect(r.align).toBe("center");
    expect(r.blocks.length).toBe(1);
    expect(readBlocksNoted({ blocks: [{ type: "text", text: "Hi" }] }).align).toBeUndefined();
    expect(readBlocksNoted({ align: "middle", blocks: [{ type: "text", text: "Hi" }] }).align).toBeUndefined();
    expect(readBlocksNoted({ type: "text", text: "Hi", align: "center" }).align).toBeUndefined();  // a lone block, not an envelope
  });

  it("keeps each block's own align when the board sets a default too", () => {
    const r = readBlocksNoted({ align: "center", blocks: [{ type: "text", text: "Hi", align: "left" }, { type: "text", text: "There" }] });
    expect(r.blocks.map(alignOf)).toEqual(["left", undefined]);
  });

  it("reads no board default from a block that merely spells its children blocks", () => {
    expect(readBlocksNoted({ type: "section", title: "S", blocks: [{ type: "text", text: "Hi" }], align: "center" }).align).toBeUndefined();
  });

  it("carries a flattened container's own align down to the blocks drawn in its place", () => {
    // A row holding a wide block is drawn as a stack: the row's align belongs to the stack.
    const blocks = readBlocks([{ type: "row", align: "right", children: [{ type: "text", text: "A" }, { type: "chart", kind: "bar", x: ["Q1", "Q2"], series: [{ name: "R", data: [1, 2] }] }] }]);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.map(alignOf)).toEqual(["right", "right"]);
  });

  it("keeps a child's own align over the container's when the container is flattened", () => {
    const blocks = readBlocks([{ type: "row", align: "right", children: [{ type: "text", text: "A", align: "center" }, { type: "chart", kind: "bar", x: ["Q1", "Q2"], series: [{ name: "R", data: [1, 2] }] }] }]);
    expect(blocks.map(alignOf)).toEqual(["center", "right"]);
  });

  it("keeps an align on children inside a surviving container", () => {
    // Placement resolves recursively (core/Blocks.tsx): the reader side must carry the word into the tree.
    const blocks = readBlocks([{ type: "grid", children: [{ type: "text", text: "A", align: "right" }, { type: "text", text: "B" }] }]);
    const grid = blocks[0] as { type: string; children: Block[] };
    expect(grid.type).toBe("grid");
    expect(grid.children.map(alignOf)).toEqual(["right", undefined]);
  });
});

describe("text alignment read", () => {
  // The semantic field `text_align` on a block spec: how the block's words read inside it. Read centrally,
  // exactly like align: anything that isn't one of the three words is ignored, and the block follows the board.
  it("reads a block's own text_align", () => {
    expect(textAlignOf(readBlocks([{ type: "text", text: "Hi", text_align: "center" }])[0])).toBe("center");
    expect(textAlignOf(readBlocks([{ type: "heading", text: "H", text_align: "right" }])[0])).toBe("right");
    expect(textAlignOf(readBlocks([{ type: "stat", label: "L", value: 1, text_align: "left" }])[0])).toBe("left");
  });

  it("gives no text_align for a block that doesn't ask, or spells it wrongly", () => {
    expect(textAlignOf(readBlocks([{ type: "text", text: "Hi" }])[0])).toBeUndefined();
    for (const bad of ["middle", "justify", "", 16, null, true, {}, ["center"]]) {
      expect([String(bad), textAlignOf(readBlocks([{ type: "text", text: "Hi", text_align: bad }])[0])][1]).toBeUndefined();
    }
  });

  it("takes the word trimmed and caseless, the way models write it", () => {
    expect(textAlignOf(readBlocks([{ type: "text", text: "Hi", text_align: " Center " }])[0])).toBe("center");
    expect(textAlignOf(readBlocks([{ type: "text", text: "Hi", text_align: "RIGHT" }])[0])).toBe("right");
  });

  it("reads the board-level default from the stored envelope, beside align", () => {
    const r = readBlocksNoted({ align: "center", text_align: "right", blocks: [{ type: "text", text: "Hi" }] });
    expect([r.align, r.textAlign]).toEqual(["center", "right"]);
    expect(readBlocksNoted({ blocks: [{ type: "text", text: "Hi" }] }).textAlign).toBeUndefined();
    expect(readBlocksNoted({ text_align: "middle", blocks: [{ type: "text", text: "Hi" }] }).textAlign).toBeUndefined();
    // a lone block, not an envelope: its word belongs to the block
    expect(readBlocksNoted({ type: "text", text: "Hi", text_align: "center" }).textAlign).toBeUndefined();
  });

  it("keeps each block's own text_align when the board sets a default too", () => {
    const r = readBlocksNoted({ text_align: "center", blocks: [{ type: "text", text: "Hi", text_align: "left" }, { type: "text", text: "There" }] });
    expect(r.blocks.map(textAlignOf)).toEqual(["left", undefined]);
  });

  it("reads no board default from a block that merely spells its children blocks", () => {
    const r = readBlocksNoted({ type: "section", title: "S", blocks: [{ type: "text", text: "Hi" }], text_align: "center" });
    expect(r.textAlign).toBeUndefined();
  });

  it("carries a flattened container's own text_align down to the blocks drawn in its place", () => {
    // A row holding a wide block is drawn as a stack: the row's word belongs to the stack, exactly like its align.
    const blocks = readBlocks([{ type: "row", text_align: "center", children: [{ type: "text", text: "A" }, { type: "chart", kind: "bar", x: ["Q1", "Q2"], series: [{ name: "R", data: [1, 2] }] }] }]);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.map(textAlignOf)).toEqual(["center", "center"]);
  });

  it("keeps a child's own text_align over the container's when the container is flattened", () => {
    const blocks = readBlocks([{ type: "row", text_align: "center", children: [{ type: "text", text: "A", text_align: "right" }, { type: "chart", kind: "bar", x: ["Q1", "Q2"], series: [{ name: "R", data: [1, 2] }] }] }]);
    expect(blocks.map(textAlignOf)).toEqual(["right", "center"]);
  });

  it("keeps a text_align on children inside a surviving container", () => {
    const blocks = readBlocks([{ type: "grid", children: [{ type: "text", text: "A", text_align: "center" }, { type: "text", text: "B" }] }]);
    const grid = blocks[0] as { type: string; children: Block[] };
    expect(grid.children.map(textAlignOf)).toEqual(["center", undefined]);
  });
});

describe("catalog parity", () => {
  it("reads every catalog example as exactly one block, with nothing dropped", () => {
    for (const entry of catalog.blocks.filter((b) => b.kind !== "include")) {  // include is resolved before storing
      const read = readBlocksNoted([entry.example]);
      expect([entry.kind, read.blocks.length, read.dropped]).toEqual([entry.kind, 1, []]);
    }
  });
});

describe("long prose", () => {
  // "word0 word1 word2 …", long enough to pass every limit below.
  const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
  const endsCut = (text: string, max: number) => {
    expect(text.length).toBeLessThanOrEqual(max);
    expect(text.length).toBeGreaterThan(max - 12);
    expect(text).toMatch(/ word\d+…$/);
  };

  it("is cut between words with an ellipsis, at each reader's own limit", () => {
    const [text, callout, list, timeline] = readBlocks([
      { type: "text", text: long },
      { type: "callout", text: long },
      { type: "list", items: [{ title: "MTR", subtitle: long }] },
      { type: "timeline", groups: [{ label: "Day 1", items: [{ title: "Lake", note: long }] }] },
    ]) as any[];
    endsCut(text.text, 600);
    endsCut(callout.text, 400);
    endsCut(list.items[0].subtitle, 160);
    endsCut(timeline.groups[0].items[0].note, 160);
  });
});
