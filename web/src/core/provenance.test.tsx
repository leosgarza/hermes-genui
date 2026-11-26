// Provenance, the quiet way — after the maintainer's read of 2026-11-25, two rules shape the line:
//   (1) A board that SHOWS a source block already says where its data came from: the block draws in the
//       flow, so the footer never echoes it. The same source words must not show twice. The rule behind
//       the line stays as accepted — only the board's own source data speaks it (item labels and
//       `accessed` dates, in draw order, each shown once; a chart's inline `source` stays the chart's
//       business; nested sources keep drawing inside their cells), and nothing is ever invented.
//   (2) The Live badge answers to the host, not to sources: a kept, refreshing view (DashboardView knows
//       the fact; a chat tag or a panel never does) wears it EVEN WHEN the page shows no source block —
//       Today's shape. A non-live drawing claims nothing and grows no line.
// Nothing is asked of the model: the envelope gains no word, and a board with no source words and no live
// host draws byte-identical to the plain path.
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Blocks, provenanceParts } from "./Blocks";
import { readBlocks, readBlocksNoted } from "./readBlocks";
import { withStyles } from "./testing";
import tokens from "../styles/tokens.css?raw";
import shared from "../styles/shared.css?raw";
import sourceCss from "../blocks/source/source.css?raw";

let unstyle: () => void;
beforeAll(() => (unstyle = withStyles(tokens, shared, sourceCss)));
afterAll(() => unstyle());

const TEXT = { type: "text", text: "Hi" };
const HEADING = { type: "heading", level: 2, text: "Markets" };

/** A line-form source: one small line saying where the data came from. */
const LINE_SRC = { type: "source", text: "BLS JOLTS", url: "https://www.bls.gov/jlt" };

/** A list-form source: labels, kind, and the dates the reader cares about. */
function listSrc(items: { label: string; accessed?: string; note?: string }[], title = "Sources") {
  return { type: "source", title, items };
}

/** A valid one-series line chart, optionally carrying its own inline `source` attribution. */
const chart = (source?: string) => {
  const c: any = { type: "chart", kind: "line", x: ["Q1", "Q2"], series: [{ name: "Jobs", data: [1, 2] }] };
  if (source !== undefined) c.source = source;
  return c;
};

const draw = (data: unknown, live?: boolean) =>
  render(<Blocks blocks={readBlocks(data)} live={live} />).container;

/** The footer's spoken parts, in order. */
function footerParts(root: ParentNode): string[] {
  const footer = root.querySelector(".hb-provenance");
  if (!footer) return [];
  return Array.from(footer.querySelectorAll(
    ".hb-provenance-source, .hb-provenance-time, .hb-provenance-badge, .hb-provenance-more"))
    .map((n) => n.textContent!);
}

const blocksChildren = (root: ParentNode) =>
  Array.from(root.querySelector(".hb-blocks")!.children);

/** How many times a word is spoken anywhere in the drawing: an echo would make it two. */
const sayCount = (root: ParentNode, word: string) => root.textContent!.split(word).length - 1;

describe("a board that shows a source block is never echoed (maintainer tweak 2026-11-25 #1)", () => {
  afterEach(cleanup);

  it("a shown list-form source grows NO footer: every word of it appears exactly once", () => {
    const root = draw([HEADING, TEXT,
      listSrc([{ label: "Yahoo Finance", accessed: "2026-11-24" }, { label: "BLS", accessed: "2026-11-18" }]),
    ]);
    expect(root.querySelector(".hb-provenance")).toBeNull(); // no second listing of the same sources
    expect(root.querySelectorAll(".hb-blocks > .hb-source").length).toBe(1); // the block itself still draws
    expect(root.querySelector(".hb-source")!.textContent).toContain("Yahoo Finance");
    expect(sayCount(root, "Yahoo Finance")).toBe(1);
    expect(sayCount(root, "2026-11-24")).toBe(1);
  });

  it("a shown line-form source says its own line once: no footer repeats it, nothing is moved", () => {
    const root = draw([HEADING, LINE_SRC, TEXT]);
    const inFlow = root.querySelectorAll(".hb-blocks > .hb-source");
    expect(inFlow.length).toBe(1);
    expect(inFlow[0].textContent).toContain("BLS JOLTS");
    expect(root.querySelector(".hb-provenance")).toBeNull();
    expect(sayCount(root, "BLS JOLTS")).toBe(1);
    // nothing joins the flow: heading, the source line, text — and nothing moved, absorbed or hidden
    expect(blocksChildren(root).length).toBe(3);
  });

  it("several shown source blocks still grow no footer: dedup never rescues the repeat", () => {
    const root = draw([
      listSrc([{ label: "BLS JOLTS", accessed: "2026-11-18" }]),
      LINE_SRC,
      listSrc([{ label: "BLS JOLTS", accessed: "2026-11-18" }, { label: "FRED", accessed: "2026-11-18" }]),
    ]);
    expect(root.querySelector(".hb-provenance")).toBeNull();
    expect(sayCount(root, "FRED")).toBe(1);
  });

  it("a chart's inline source stays the chart's own line: no source block, no footer", () => {
    const root = draw([chart("BLS JOLTS"), TEXT]);
    expect(root.querySelector(".hb-provenance")).toBeNull();
    // beside a shown source block the chart word stays its own as ever, and the block is not echoed either
    const both = draw([chart("BLS JOLTS"), LINE_SRC]);
    expect(both.querySelector(".hb-provenance")).toBeNull();
    expect(sayCount(both, "BLS JOLTS")).toBe(2); // chart line + source block — the footer adds no third
  });

  it("a board without a source block grows nothing: no footer, no new nodes", () => {
    for (const data of [[TEXT], [HEADING, TEXT, chart("BLS JOLTS")],
      [{ type: "grid", rows: [[TEXT, listSrc([{ label: "Yahoo Finance", accessed: "2026-11-24" }])]] }]]) {
      const root = draw(data);
      expect(root.querySelector(".hb-provenance")).toBeNull();
    }
  });

  it("works straight from the stored envelope a door answers — and the reader gained NO words", () => {
    const noted = readBlocksNoted({ version: 3, updated_at: "2026-11-18T10:00:00",
      links: [{ id: "7f3a09bc" }], blocks: [HEADING, LINE_SRC] });
    // the envelope reader is untouched: no asOf, no live ever come out of it
    expect("asOf" in noted).toBe(false);
    expect("live" in noted).toBe(false);
    // and the shown source block is not echoed
    expect(render(<Blocks blocks={noted.blocks} />).container.querySelector(".hb-provenance")).toBeNull();
  });

  it("reads nothing from junk: a source with no usable word grows no footer", () => {
    const root = draw([{ type: "source", text: "   " }]);
    expect(root.querySelector(".hb-provenance")).toBeNull();
  });

  it("an align-wrapped board is the same rule: a shown source stays the block's own", () => {
    const root = draw({ align: "center", blocks: [HEADING, LINE_SRC] }, undefined);
    expect(root.querySelector(".hb-provenance")).toBeNull();
    const root2 = draw({ align: "center", blocks: [HEADING] });
    expect(root2.querySelector(".hb-provenance")).toBeNull();
  });
});

describe("the resolved contract (parent ruling 2026-11-25): source words stay shown-in-flow; the line survives for the host badge", () => {
  afterEach(cleanup);

  // The honest end-to-end witness, in place of a fabricated sourced footer: the footer's only derivation
  // input is a top-level source block, and the echo gate is exactly that block — so on ANY shipped board
  // no source words reach the line. A source-less board has no unseen source data either: every carrier
  // below already draws its words inside its own block (the accepted silence of charts, credits, nested
  // cells — provenanceParts reads none of them). Live is a host fact: the badge is the line's whole
  // remaining content, standing alone on Today's shape.
  const CARRIERS: [string, unknown[]][] = [
    ["a shown list-form source block",
      [HEADING, TEXT, listSrc([{ label: "Yahoo Finance", accessed: "2026-11-24" }])]],
    ["a shown line-form source block", [LINE_SRC, TEXT]],
    ["a chart's inline attribution beside a shown block",
      [chart("BLS JOLTS"), listSrc([{ label: "FRED", accessed: "2026-11-18" }])]],
    ["a source nested in a grid cell",
      [{ type: "grid", rows: [[TEXT, listSrc([{ label: "Yahoo Finance", accessed: "2026-11-24" }])]] }]],
    ["an image credit",
      [{ type: "images", images: [{ url: "https://img.example/a.jpg", source: "AP Photo" }] }]],
    ["no carrier at all (plain board)", [HEADING, TEXT]],
  ];
  const CARRIER_WORDS = ["Yahoo Finance", "2026-11-24", "BLS JOLTS", "FRED", "2026-11-18", "AP Photo"];

  it("non-live, every carrier shape: no footer source words ever render; no word is said twice", () => {
    for (const [, data] of CARRIERS) {
      const root = draw(data);
      expect(root.querySelectorAll(".hb-provenance-source, .hb-provenance-time").length).toBe(0);
      for (const word of CARRIER_WORDS) expect(sayCount(root, word)).toBeLessThanOrEqual(1);
    }
  });

  it("live, every carrier shape: the line renders badge-ONLY — the pill is its one child", () => {
    for (const [, data] of CARRIERS) {
      const root = draw(data, true);
      expect(footerParts(root)).toEqual(["Live"]);
      expect(root.querySelector(".hb-provenance-dot")).toBeNull();
      expect(root.querySelectorAll(".hb-provenance-source, .hb-provenance-time").length).toBe(0);
      for (const word of CARRIER_WORDS) expect(sayCount(root, word)).toBeLessThanOrEqual(1);
    }
  });

  it("the Today pair: source-less NON-live grows no footer at all; source-less LIVE wears the pill alone", () => {
    expect(draw([HEADING, TEXT]).querySelector(".hb-provenance")).toBeNull();
    const root = draw([HEADING, TEXT], true);
    expect(footerParts(root)).toEqual(["Live"]);
  });
});

describe("the line's rule is kept: derived from the board's source data, never invented", () => {
  afterEach(cleanup);

  // The gate that stops an echo lives in Blocks; the accepted derivation itself — labels and accessed
  // dates of source blocks, in draw order, each shown once — stays the whole rule of the line and is
  // pinned here as the pure rule it is. No shipped board feeds it words today (a shown source is never
  // echoed), and the drawer keeps its cap at eight parts then a quiet ellipsis for whatever reaches it.
  const parts = (data: unknown) => provenanceParts(readBlocks(data));

  it("joins item labels and accessed dates in draw order, each shown once", () => {
    expect(parts([HEADING, TEXT,
      listSrc([{ label: "Yahoo Finance", accessed: "2026-11-24" }, { label: "BLS", accessed: "2026-11-18" }]),
    ])).toEqual(["Yahoo Finance", "2026-11-24", "BLS", "2026-11-18"]);
  });

  it("an item's note, kind and link stay the block's own business — the rule reads label and date", () => {
    expect(parts([listSrc([{ label: "Yahoo Finance", accessed: "2026-11-24", note: "prices at 11:30 IST" }])]))
      .toEqual(["Yahoo Finance", "2026-11-24"]);
  });

  it("dedupes across source blocks in draw order: repeated labels and dates say once", () => {
    expect(parts([
      listSrc([{ label: "BLS JOLTS", accessed: "2026-11-18" }]),
      LINE_SRC,
      listSrc([{ label: "BLS JOLTS", accessed: "2026-11-18" }, { label: "FRED", accessed: "2026-11-18" }]),
    ])).toEqual(["BLS JOLTS", "2026-11-18", "FRED"]);
  });

  it("a line-form source contributes its text; a matching list label says once", () => {
    expect(parts([LINE_SRC, listSrc([{ label: "BLS JOLTS", accessed: "2026-11-18" }])]))
      .toEqual(["BLS JOLTS", "2026-11-18"]);
  });

  it("an item's date shape: only the leading YYYY-MM-DD speaks (read.ts cuts the rest)", () => {
    expect(parts([listSrc([{ label: "Yahoo", accessed: "2026-11-24 prices at 11:30 IST" }])]))
      .toEqual(["Yahoo", "2026-11-24"]);
  });

  it("labels are folded to one line: an embedded newline cannot break the quiet line", () => {
    expect(parts([listSrc([{ label: "Yahoo\nFinance" }, { label: "BLS\tJOLTS" }])]))
      .toEqual(["Yahoo Finance", "BLS JOLTS"]);
  });

  it("charts and nested sources feed nothing: only the board's own source blocks are source data", () => {
    expect(parts([chart("BLS JOLTS"), TEXT])).toEqual([]);
    expect(parts([{ type: "grid", rows: [[TEXT, listSrc([{ label: "Yahoo Finance" }])]] }])).toEqual([]);
  });

  it("nothing to say is nothing said: a sourceless board's parts are empty", () => {
    expect(parts([HEADING, TEXT])).toEqual([]);
  });
});

describe("the Live badge is host knowledge, decoupled from sources (maintainer tweak 2026-11-25 #2)", () => {
  afterEach(cleanup);

  it("a live board with NO source block wears the pill alone: Today's shape", () => {
    const root = draw([HEADING, TEXT], true);
    const footer = root.querySelector(".hb-provenance");
    expect(footer).toBeTruthy();
    const badge = root.querySelector(".hb-provenance-badge")!;
    expect([badge.textContent, badge.getAttribute("data-live")]).toEqual(["Live", "live"]);
    // the line says NOTHING else: no dots, no words, no invented rivals — the pill is its one child,
    // and the footer is the only node added to the flow
    expect(Array.from(footer!.children).map((k) => k.className)).toEqual(["hb-provenance-badge"]);
    expect(root.querySelector(".hb-provenance-dot")).toBeNull();
    expect(root.querySelectorAll(".hb-provenance-source, .hb-provenance-time").length).toBe(0);
    expect(blocksChildren(root).at(-1)!.classList.contains("hb-provenance")).toBe(true);
    expect(footerParts(root)).toEqual(["Live"]);
  });

  it("a live board whose sources are shown wears the pill and echoes nothing", () => {
    const root = draw([HEADING, LINE_SRC], true);
    const badge = root.querySelector(".hb-provenance-badge")!;
    expect([badge.textContent, badge.getAttribute("data-live")]).toEqual(["Live", "live"]);
    expect(root.querySelector(".hb-provenance-source")).toBeNull(); // the block above already said it
    expect(footerParts(root)).toEqual(["Live"]);
    expect(sayCount(root, "BLS JOLTS")).toBe(1);
  });

  it("live undefined or false claims nothing: no badge, and the word Live is nowhere", () => {
    for (const live of [undefined, false]) {
      for (const data of [[HEADING, LINE_SRC], [HEADING, TEXT]]) {
        const root = draw(data, live);
        expect(root.querySelector(".hb-provenance-badge")).toBeNull();
        expect(root.textContent).not.toContain("Live");
        expect(root.textContent).not.toContain("Snapshot"); // absence is the answer; no rival word is invented
      }
    }
  });

  it("a sourceless NON-live board stays byte-identical: no footer for a pill to stand in", () => {
    for (const root of [draw([HEADING, TEXT]), draw([HEADING, TEXT], undefined)]) {
      expect(root.querySelector(".hb-provenance")).toBeNull();
    }
  });
});
