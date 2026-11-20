// Living Boards v1 (enhancement #9) — reading the version words off the stored envelope.
// The rule that keeps every unsaid board byte-identical: the new keys are read ONLY from an envelope,
// and a board that never spoke them answers with them absent, as if this file had never changed.
import { describe, expect, it } from "vitest";
import { readBlocksNoted } from "./readBlocks";

const HEADING = { type: "heading", text: "Portfolio · Q4" };

describe("readBlocksNoted — living boards words", () => {
  it("reads the version number and the moment it was written", () => {
    const noted = readBlocksNoted({ version: 2, updated_at: "2026-11-19T21:00:00+00:00", blocks: [HEADING] });
    expect(noted.version).toBe(2);
    expect(noted.updatedAt).toBe("2026-11-19T21:00:00+00:00");
  });

  it("leaves both unsaid when the envelope says nothing", () => {
    const noted = readBlocksNoted({ align: "center", blocks: [HEADING] });
    expect(noted.version).toBeUndefined();
    expect(noted.updatedAt).toBeUndefined();
    expect(noted.links).toBeUndefined();
  });

  it("ignores a version that is not a number or not positive", () => {
    expect(readBlocksNoted({ version: "2", blocks: [HEADING] }).version).toBeUndefined();
    expect(readBlocksNoted({ version: 0, blocks: [HEADING] }).version).toBeUndefined();
    expect(readBlocksNoted({ version: 1.5, blocks: [HEADING] }).version).toBeUndefined();
    expect(readBlocksNoted({ version: true, blocks: [HEADING] }).version).toBeUndefined();
  });

  it("reads links: bare addresses, id+note objects, junk dropped with a note", () => {
    const noted = readBlocksNoted({
      blocks: [HEADING],
      links: ["7f3a09bc", { id: "a1b2c3d4", note: "last quarter" }, { id: "not-a-board" }, "z".repeat(4)],
    });
    expect(noted.links).toEqual([{ id: "7f3a09bc" }, { id: "a1b2c3d4", note: "last quarter" }]);
    const paths = noted.dropped.map((d) => d.path);
    expect(paths).toContain("links.2");
    expect(paths).toContain("links.3");
  });

  it("keeps at most three links and notes the cut", () => {
    const noted = readBlocksNoted({
      blocks: [HEADING],
      links: ["aaaaaaaa", "bbbbbbbb", "cccccccc", "dddddddd"],
    });
    expect(noted.links?.length).toBe(3);
  });

  it("a block that spells its children blocks is still no envelope (its links are not the board's)", () => {
    const noted = readBlocksNoted({ type: "section", blocks: [HEADING], links: ["7f3a09bc"] });
    expect(noted.links).toBeUndefined();
  });

  it("an empty or wrong-typed links word is nothing said", () => {
    expect(readBlocksNoted({ blocks: [HEADING], links: [] }).links).toBeUndefined();
    expect(readBlocksNoted({ blocks: [HEADING], links: "yes" }).links).toBeUndefined();
  });

  it("the updatedAt word is a short line cut like every shown string, never an object", () => {
    expect(readBlocksNoted({ updated_at: "x".repeat(500), blocks: [HEADING] }).updatedAt).toHaveLength(40);
    expect(readBlocksNoted({ updated_at: 5, blocks: [HEADING] }).updatedAt).toBeUndefined();
  });
});
