// One rule, one place: what a board's provenance IS — which source line the footer absorbs, which words the
// charts add, in draw order, deduped — feeds both the drawn footer (core/Blocks.tsx) and the export text
// (lib/export.ts). If these two ever disagree about a board's origins, the composition lives in the disagreement;
// here it lives in the code. Provenance.test.tsx pins the drawing; these pin the reading.
import { describe, expect, it } from "vitest";
import type { Block } from "../registry";
import { provenanceLine, provenanceOf } from "./provenance";

const heading = { type: "heading", text: "Kyoto" } as Block;
const source = (text: string) => ({ type: "source", text } as Block);
const chart = (src?: string) => ({ type: "chart", spec: { type: "line", x: ["a"], series: [{ data: [1] }], ...(src ? { source: src } : {}) } } as Block);

describe("provenanceOf", () => {
  it("a board that declares nothing keeps every block on the list — no absorbing, no lines", () => {
    const p = provenanceOf([heading, source("From the city office"), chart("OpenWeather")]);
    expect(p.declared).toBe(false);
    expect(p.list).toHaveLength(3);
    expect(p.source).toBeUndefined();
    expect(p.chartSources).toEqual([]);
    expect(provenanceLine(p)).toBe("");
  });
  it("the FIRST top-level source line belongs to the footer; a later one stays on the board", () => {
    const p = provenanceOf([heading, source("First"), source("Second")], "2026-11-18");
    expect(p.source?.text).toBe("First");
    expect(p.list.map((b) => b.type)).toEqual(["heading", "source"]);
  });
  it("the charts add their sources once each, in draw order, and never repeat the footer's own", () => {
    const p = provenanceOf([source("OpenWeather"), chart("OpenWeather"), chart("Yahoo"), heading, chart("Yahoo"), chart()], "x");
    expect(p.chartSources).toEqual(["Yahoo"]);
  });
  it("a blank chart source says nothing and is not a line", () => {
    expect(provenanceOf([chart("   "), chart("")], "x").chartSources).toEqual([]);
  });
  it("live false is a word of its own — a snapshot — not an absence", () => {
    expect(provenanceOf([heading], undefined, false).live).toBe(false);
    expect(provenanceOf([heading], undefined, undefined).live).toBeUndefined();
  });
});

describe("provenanceLine", () => {
  it("joins exactly the parts the board gave, in the footer's order", () => {
    const p = provenanceOf([source("Kyoto Tourist Board"), chart("OpenWeather"), chart("Yahoo")], "2026-11-18", false);
    expect(provenanceLine(p)).toBe("Kyoto Tourist Board · OpenWeather · Yahoo · as of 2026-11-18 · Snapshot");
  });
  it("says Live when the board says its figures are live", () => {
    expect(provenanceLine(provenanceOf([heading], "now", true))).toBe("as of now · Live");
  });
  it("a badge alone is still a line; nothing at all is no line", () => {
    expect(provenanceLine(provenanceOf([heading], undefined, false))).toBe("Snapshot");
    expect(provenanceLine(provenanceOf([heading]))).toBe("");
  });
});
