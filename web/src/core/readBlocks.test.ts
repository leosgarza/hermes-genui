import { describe, expect, it } from "vitest";
import catalog from "../../../core/catalog.json";
import type { Block } from "../registry";
import { NO_SEND } from "./fields";
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

describe("follow-ups read", () => {
  // The envelope's `follow_ups`: quiet tappable prompts under the board, each {label, run}. Read like every
  // board word — only the envelope may say it (a block that spells its children `blocks` is not one) — and
  // dropped leniently item by item: both halves are needed, a message Hermes acts on is never offered, and
  // the strip keeps at most four.
  const ups = (data: unknown) => readBlocksNoted(data).followUps;
  const board = (follow_ups: unknown) => ({ blocks: [{ type: "text", text: "Hi" }], follow_ups });

  it("reads well-said follow-ups beside the blocks", () => {
    expect(ups(board([{ label: "Plan day 2", run: "Plan the second day" }]))).toEqual([
      { label: "Plan day 2", run: "Plan the second day" },
    ]);
  });

  it("takes the aliases a reader of buttons already knows", () => {
    expect(ups(board([{ text: "More", ask: "Tell me more" }, { label: "Deeper", message: "Go deeper" }]))).toEqual([
      { label: "More", run: "Tell me more" },
      { label: "Deeper", run: "Go deeper" },
    ]);
  });

  it("says nothing when the board says nothing, or says it any other way", () => {
    expect(ups({ blocks: [{ type: "text", text: "Hi" }] })).toBeUndefined();
    for (const junk of ["keep going", 5, null, true, {}, []]) expect(ups(board(junk))).toBeUndefined();
    for (const junk of ["x", 5, null, {}, { label: "Go" }, { run: "Go on" }]) {
      expect(ups(board([junk]))).toBeUndefined();
    }
  });

  it("keeps an envelope's follow-ups only from an envelope", () => {
    // A lone block, or a section spelling its children `blocks`: its follow_ups is none of the board's business.
    expect(ups({ type: "section", title: "S", blocks: [], follow_ups: [{ label: "Go", run: "More" }] })).toBeUndefined();
    expect(ups({ type: "text", text: "Hi", follow_ups: [{ label: "Go", run: "More" }] })).toBeUndefined();
  });

  it("drops a follow-up whose message Hermes would act on, and notes why", () => {
    const r = readBlocksNoted(board([{ label: "Reset", run: "/reset" }, { label: "Notes", run: "Open @file:notes.md" }, { label: "Good", run: "Tell me more" }]));
    expect(r.followUps).toEqual([{ label: "Good", run: "Tell me more" }]);
    const wants = NO_SEND;
    expect(r.dropped.filter((d) => d.why === wants).map((d) => d.path)).toEqual(["follow_ups.0", "follow_ups.1"]);
  });

  it("keeps the first four and notes the rest", () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ label: `Go ${i}`, run: `Continue ${i}` }));
    const r = readBlocksNoted(board(five));
    expect(r.followUps?.length).toBe(4);
    expect(r.dropped.some((d) => d.why.includes("follow-ups"))).toBe(true);
  });

  it("trims the words and keeps them WHOLE — the caps no one asked for would send a different message", () => {
    const r = readBlocksNoted(board([{ label: "  Plan day 2  ", run: "  Plan the second day of my itinerary  " }]));
    expect(r.followUps).toEqual([{ label: "Plan day 2", run: "Plan the second day of my itinerary" }]);
    // The writer stores the entire prompt (blocks/common.py keeps messages whole) and the schema declares no
    // length. A tap must therefore submit exactly what was stored, and a long label must reach the row whole
    // so it WRAPS there — reading them cut (the round-2 defect: silent slice at 40/300) sends a different
    // message than the board said and clips a label that was written to be read.
    const label = "Compare the three days and tell me which evening walk to cut or keep";
    const run = ("Expand every line of this Kyoto plan into a detailed day-by-day itinerary with train " +
      "times, booking links and costs for every hop between the cities. ").repeat(4).trim();
    expect([label.length > 40, run.length > 300]).toEqual([true, true]);
    const whole = readBlocksNoted(board([{ label, run }])).followUps![0];
    expect(whole.label).toBe(label);
    expect(whole.run).toBe(run);
    // aliases carry the same truth — the whole word, however it was named
    const aliased = readBlocksNoted(board([{ text: label, message: run }])).followUps![0];
    expect([aliased.label, aliased.run]).toEqual([label, run]);
  });

  it("drops a blank label or message but keeps its neighbours", () => {
    const r = readBlocksNoted(board([{ label: "Go", run: "More" }, { label: "   ", run: "Next" }, { label: "And", run: "" }]));
    expect(r.followUps).toEqual([{ label: "Go", run: "More" }]);
    expect(r.dropped.map((d) => d.path)).toEqual(["follow_ups.1", "follow_ups.2"]);
  });
});
