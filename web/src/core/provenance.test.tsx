// Provenance: a board whose stored envelope declares `as_of` (when its data is from) or `live` (true: the figures
// update; false: a snapshot) draws a quiet footer — source · as_of · a [Live] or [Snapshot] badge — reusing the
// source block's line for the "where from" part. A top-level source block on such a board is drawn inside the
// footer, not twice, and keeps its placement: it resolves through the very same path as any block (the block's
// own ask, then the board's default, then left — the model's cascade alone), and it gets its OWN full-width row — a
// place box only shares out space in a block context, never as a flex child of the join line (the real geometry
// is pinned in Chrome by tests/test_layout_alignment.py). The `source` a chart block carries joins the line
// beside it — deduped, in draw order — while the chart keeps its own inline attribution. Anything that isn't
// a usable date string or a real boolean is ignored, and a board with no provenance declared draws exactly what
// it always drew: no footer, no new nodes, source blocks where they sit.
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Blocks } from "./Blocks";
import { readBlocksNoted } from "./readBlocks";
import { withStyles } from "./testing";
import tokens from "../styles/tokens.css?raw";
import shared from "../styles/shared.css?raw";
import sourceCss from "../blocks/source/source.css?raw";

let unstyle: () => void;
beforeAll(() => (unstyle = withStyles(tokens, shared, sourceCss)));
afterAll(() => unstyle());

const TEXT = { type: "text", text: "Hi" };
const SRC = { type: "source", text: "BLS", url: "https://www.bls.gov/ooh" };

/** A valid one-series line chart, optionally carrying its own `source` attribution. */
const chart = (source?: string) => {
  const c: any = { type: "chart", x: ["Q1", "Q2"], series: [{ name: "Jobs", data: [1, 2] }] };
  if (source !== undefined) c.source = source;
  return c;
};

const draw = (data: unknown) => {
  const noted = readBlocksNoted(data);
  return render(
    <Blocks blocks={noted.blocks} boardAlign={noted.align}
      boardAsOf={noted.asOf} boardLive={noted.live} />,
  ).container;
};

describe("envelope read: as_of and live ride beside align", () => {
  afterEach(cleanup);

  it("reads the words a stored envelope carries", () => {
    const noted = readBlocksNoted({ align: "center", as_of: "2026-11-18", live: true, blocks: [TEXT] });
    expect([noted.align, noted.asOf, noted.live]).toEqual(["center", "2026-11-18", true]);
    expect(noted.blocks.length).toBe(1);
  });

  it("keeps live false — a snapshot is a word, not an absence", () => {
    expect(readBlocksNoted({ as_of: "Nov 18, 14:05 UTC", live: false, blocks: [TEXT] }).live).toBe(false);
  });

  it("ignores anything that is not a usable date string or a real boolean", () => {
    for (const data of [
      { as_of: 5, blocks: [TEXT] },
      { as_of: "   ", blocks: [TEXT] },
      { live: "yes", blocks: [TEXT] },
      { live: 1, blocks: [TEXT] },
    ]) {
      const noted = readBlocksNoted(data);
      expect([noted.asOf, noted.live, noted.blocks.length]).toEqual([undefined, undefined, 1]);
    }
  });

  it("cuts an over-long date line to what the footer can show", () => {
    expect(readBlocksNoted({ as_of: "x".repeat(200), blocks: [TEXT] }).asOf).toBe("x".repeat(80));
  });

  it("leaves old boards as they were: plain lists and align-only envelopes give no provenance", () => {
    for (const data of [[TEXT], { align: "center", blocks: [TEXT] }]) {
      const noted = readBlocksNoted(data);
      expect([noted.asOf, noted.live]).toEqual([undefined, undefined]);
    }
  });

  it("is not fooled by a block that spells its children blocks (its own fields stay the block's)", () => {
    const noted = readBlocksNoted({ type: "section", title: "T", as_of: "2026-11-18", blocks: [TEXT] });
    expect(noted.asOf).toBeUndefined();
  });
});

describe("footer render", () => {
  afterEach(cleanup);

  it("draws source · as_of · the badge, once, on a board that declares provenance", () => {
    const root = draw({ as_of: "2026-11-18", live: true, blocks: [TEXT, SRC] });
    const footer = root.querySelector(".hb-provenance")!;
    expect(footer).toBeTruthy();
    expect(footer.parentElement!.classList.contains("hb-blocks")).toBe(true);
    expect(footer.textContent).toContain("2026-11-18");
    // the source line is the existing one, absorbed into the footer rather than drawn twice
    expect(root.querySelectorAll(".hb-source").length).toBe(1);
    expect(footer.querySelector(".hb-source a")!.getAttribute("href")).toBe("https://www.bls.gov/ooh");
    // the order reads: source, then as_of, then the badge
    const line = footer.textContent!;
    expect(line.indexOf("BLS")).toBeLessThan(line.indexOf("2026-11-18"));
    expect(line.indexOf("2026-11-18")).toBeLessThan(line.indexOf("Live"));
  });

  it("the badge carries its word: Live or Snapshot, not colour alone", () => {
    const live = draw({ live: true, blocks: [TEXT] }).querySelector(".hb-provenance-badge")!;
    expect([live.textContent, live.getAttribute("data-live")]).toEqual(["Live", "live"]);
    const snap = draw({ live: false, blocks: [TEXT] }).querySelector(".hb-provenance-badge")!;
    expect([snap.textContent, snap.getAttribute("data-live")]).toEqual(["Snapshot", "snapshot"]);
  });

  it("shows only the parts a board gave: as_of alone has no badge, live alone has no date", () => {
    const dated = draw({ as_of: "2026-11-18", blocks: [TEXT] });
    expect(dated.querySelector(".hb-provenance-badge")).toBeNull();
    expect(dated.querySelector(".hb-provenance")!.textContent).toBe("2026-11-18");
    const badged = draw({ live: true, blocks: [TEXT] }).querySelector(".hb-provenance")!;
    expect(badged.textContent).toBe("Live");
  });

  it("a source without a usable link still shows as text in the footer", () => {
    const footer = draw({ as_of: "2026-11-18", blocks: [{ type: "source", text: "desk notes" }] }).querySelector(".hb-provenance")!;
    expect(footer.querySelector(".hb-source a")).toBeNull();
    expect(footer.querySelector(".hb-source")!.textContent).toBe("desk notes");
  });

  it("absorbs only the first top-level source; a later one draws where it sits", () => {
    const root = draw({ as_of: "2026-11-18", blocks: [SRC, { type: "source", text: "field log" } ] });
    expect(root.querySelectorAll(".hb-source").length).toBe(2);  // one in the footer, one in the board
    expect(root.querySelector(".hb-blocks > .hb-place > .hb-source")!.textContent).toBe("field log");
  });

  it("a board with no provenance draws exactly what it always did: no footer, no new nodes", () => {
    for (const data of [[TEXT, SRC], { align: "center", blocks: [TEXT, SRC] }]) {
      const root = draw(data);
      expect(root.querySelector(".hb-provenance")).toBeNull();
      const blocks = root.querySelector(".hb-blocks")!;
      expect(blocks.children.length).toBe(2);  // one per block, nothing added after them
      expect(root.querySelectorAll(".hb-source").length).toBe(1);
      expect(root.querySelector(".hb-source")!.textContent).toBe("BLS");  // where it always sat, not in a footer
    }
  });

  it("ignores junk the envelope may carry: an unusable date and a non-boolean live draw no footer", () => {
    const root = draw({ as_of: 5, live: "yes", blocks: [TEXT] });
    expect(root.querySelector(".hb-provenance")).toBeNull();
    expect(root.querySelector(".hb-blocks")!.children.length).toBe(1);
  });
});

describe("the footer source keeps its placement (rework of defect 1)", () => {
  afterEach(cleanup);

  it("a source that asks for right lands right inside the footer (reviewer probe)", () => {
    const root = draw({ as_of: "2026-11-18", blocks: [{ type: "source", text: "BLS", align: "right" }] });
    const place = root.querySelector(".hb-provenance .hb-place")!;
    expect([place.getAttribute("data-align"), place.classList.contains("hb-place-right")]).toEqual(["right", true]);
    expect(place.querySelector(".hb-source")!.textContent).toBe("BLS");
  });

  it("the identical ask without provenance still lands right on the board (alignment control)", () => {
    const root = draw([{ type: "source", text: "BLS", align: "right" }]);
    expect(root.querySelector(".hb-provenance")).toBeNull();
    expect(root.querySelector(".hb-blocks > .hb-place")!.getAttribute("data-align")).toBe("right");
  });

  it("center asks for a centre place too; a source that sits left needs no wrapper", () => {
    const center = draw({ as_of: "d", blocks: [{ type: "source", text: "BLS", align: "center" }] });
    expect(center.querySelector(".hb-provenance .hb-place")!.getAttribute("data-align")).toBe("center");
    const plain = draw({ as_of: "d", blocks: [SRC] });
    expect(plain.querySelector(".hb-provenance .hb-place:not(.hb-bare)")).toBeNull();
    expect(plain.querySelector(".hb-provenance .hb-source")!.textContent).toBe("BLS");
  });

  it("the board's default cascades onto the footer source like any block", () => {
    const root = draw({ align: "center", as_of: "2026-11-18", blocks: [TEXT, SRC] });
    expect(root.querySelector(".hb-provenance .hb-place")!.getAttribute("data-align")).toBe("center");
  });

  it("the model's word moves the footer source; nothing else can", () => {
    const plain = draw({ as_of: "d", blocks: [SRC] });
    expect(plain.querySelector(".hb-provenance .hb-place:not(.hb-bare)")).toBeNull();  // left is how it sits anyway
    const asked = draw({ as_of: "d", blocks: [{ type: "source", text: "BLS", align: "right" }] });
    expect(asked.querySelector(".hb-provenance .hb-place")!.getAttribute("data-align")).toBe("right");
    expect(asked.querySelectorAll("button").length).toBe(0);                // no reader chips, not even beside a footer
  });

  it("the placed source sits beside the join line, never inside its flex row", () => {
    const root = draw({ as_of: "d", live: true, blocks: [{ type: "source", text: "BLS", align: "right" }] });
    const source = root.querySelector(".hb-provenance .hb-source")!;
    expect(source.parentElement!.classList.contains("hb-place")).toBe(true);
    // the place box is a child of the footer's column — the block context where its auto margins have space —
    // not a child of the line, which shrink-wraps every flex child to its content (the measured defect shape)
    expect(source.parentElement!.parentElement!.classList.contains("hb-provenance")).toBe(true);
    expect(root.querySelector(".hb-provenance-line .hb-place")).toBeNull();
    expect(root.querySelector(".hb-provenance-line .hb-source")).toBeNull();
    const plain = draw({ as_of: "d", blocks: [SRC] });  // left asks need no wrapper but still sit on the row
    expect(plain.querySelector(".hb-provenance > .hb-place > .hb-source")).toBeTruthy();
  });
});

describe("chart sources join the line (rework of defect 2)", () => {
  afterEach(cleanup);

  it("a chart-only board reads source · as_of · the badge (reviewer probe)", () => {
    const root = draw({ as_of: "2026-11-18", live: false, blocks: [chart("BLS")] });
    expect(root.querySelector(".hb-provenance")!.textContent).toBe("BLS·2026-11-18·Snapshot");
    // the footer joins the chart's attribution, it does not replace it: the inline line stays
    expect(root.querySelector(".hb-chart-source")!.textContent).toBe("BLS");
  });

  it("several charts dedupe their sources in draw order", () => {
    const root = draw({ as_of: "d", blocks: [chart("BLS"), chart("FRED"), chart("BLS"), chart()] });
    expect(root.querySelector(".hb-provenance")!.textContent).toBe("BLS·FRED·d");
  });

  it("a chart without a source joins nothing and changes nothing", () => {
    const root = draw({ as_of: "2026-11-18", blocks: [chart()] });
    expect(root.querySelector(".hb-provenance")!.textContent).toBe("2026-11-18");
    expect(root.querySelector(".hb-chart-source")).toBeNull();
    // and a chart source alone is not provenance: no declaration, no footer, board as it always drew
    const plain = draw([chart("BLS")]);
    expect(plain.querySelector(".hb-provenance")).toBeNull();
    expect(plain.querySelector(".hb-chart-source")!.textContent).toBe("BLS");
  });

  it("a source block and chart sources join cleanly, each said once", () => {
    const same = draw({ as_of: "d", blocks: [{ type: "source", text: "BLS" }, chart("BLS")] });
    // deduped across the seams: the chart says nothing the source row hasn't already said, so the line is the date
    expect(same.querySelector(".hb-provenance .hb-source")!.textContent).toBe("BLS");
    expect(same.querySelector(".hb-provenance-line")!.textContent).toBe("d");
    expect(same.querySelectorAll(".hb-source").length).toBe(1);
    const both = draw({ as_of: "d", blocks: [{ type: "source", text: "Census" }, chart("BLS")] });
    expect(both.querySelector(".hb-provenance .hb-source")!.textContent).toBe("Census");  // its own placed row
    expect(both.querySelector(".hb-provenance-line")!.textContent).toBe("BLS·d");
    expect(both.querySelector(".hb-chart-source")!.textContent).toBe("BLS");  // inline stays too
  });

  it("a declared but sourceless footer still reads as_of · badge without a stray dot", () => {
    const root = draw({ as_of: "d", live: true, blocks: [chart(), TEXT] });
    expect(root.querySelector(".hb-provenance")!.textContent).toBe("d·Live");
  });
});
