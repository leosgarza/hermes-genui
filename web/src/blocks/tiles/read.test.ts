// For each, a good input, a sloppy one written the way models write, and a broken one that is dropped with a
// note saying why.
import { describe, expect, it } from "vitest";
import { readBlocksNoted } from "../../core/readBlocks";

const one = (block: unknown) => readBlocksNoted([block]);

describe("tiles", () => {
  it("reads cards, leaving off an unsafe image or an unknown icon", () => {
    const r = one({ type: "tiles", items: [
      { title: "Kyoto", subtitle: "Temples", image: "https://x.example/k.jpg", icon: "walk", ask: "Plan Kyoto" },
      { title: "Nara", image: "javascript:x", icon: "nope", run: "Plan Nara" }] });
    expect(r.dropped).toEqual([]);
    expect(r.blocks).toEqual([{ type: "tiles", items: [
      { title: "Kyoto", subtitle: "Temples", image: "https://x.example/k.jpg", icon: "walk", ask: "Plan Kyoto" },
      { title: "Nara", run: "Plan Nara" }] }]);
  });
  it("takes label/value/note when there is no title or subtitle", () => {
    const r = one({ type: "tiles", tiles: [{ label: "Right now", value: "24°C", note: "0 mm rain", ask: "Weather?" }] });
    expect((r.blocks[0] as any).items).toEqual([{ title: "Right now", subtitle: "24°C · 0 mm rain", ask: "Weather?" }]);
  });

  // The card keeps its cover shape and shows the reason in up to three lines, so the reader cuts it to what three
  // lines hold — about 120 characters — and only ever BETWEEN words (cutAtWord), never mid-word. Behaviour checks
  // only: the exact cut position is the helper's business, not the test's.
  const shortReason = "Take the 08:12 local to Omiya and the Keihin-Tohoku line direct to Tokyo Station — about 85 minutes.";
  const twoSentences = "Take the 08:12 local to Omiya and the Keihin-Tohoku line direct to Tokyo Station — about 85 minutes, and it skips the shinkansen fare. Arriving before nine leaves the whole morning free for the east side, which the later trains cannot give you.";

  it("keeps a reason three lines can hold in full, uncut", () => {
    expect(shortReason.length).toBeLessThanOrEqual(120);
    const r = one({ type: "tiles", items: [{ title: "Local train", subtitle: shortReason, run: "Book the 08:12 local" }] });
    expect((r.blocks[0] as any).items[0].subtitle).toBe(shortReason);
  });
  it("cuts a longer reason to about 120 characters, between words, with an ellipsis", () => {
    expect(twoSentences.length).toBeGreaterThan(200);
    const r = one({ type: "tiles", items: [{ title: "Local train", subtitle: twoSentences, run: "Book the 08:12 local" }] });
    const sub = (r.blocks[0] as any).items[0].subtitle;
    expect(sub.length).toBeLessThanOrEqual(120);   // three lines' worth, no more
    expect(sub.length).toBeGreaterThan(60);        // a real part of the reason, not a stub
    expect(sub.endsWith("…")).toBe(true);
    const kept = sub.slice(0, -1);
    expect(twoSentences.startsWith(kept)).toBe(true);         // the author's own words, in order
    expect(twoSentences[kept.length]).toMatch(/[\s\p{P}]/u);  // stopped at a word boundary, never inside a word
    expect(kept.endsWith(" ")).toBe(false);                   // no dangling space before the ellipsis
  });
  it("cuts between whole words even when the cap lands in the middle of one", () => {
    const uniform = Array.from({ length: 40 }, () => "stationary").join(" ");
    const r = one({ type: "tiles", items: [{ title: "Trains", subtitle: uniform, run: "Compare trains" }] });
    const sub = (r.blocks[0] as any).items[0].subtitle;
    expect(sub.endsWith("…")).toBe(true);
    expect(sub.slice(0, -1).split(" ").every((w: string) => w === "stationary")).toBe(true);  // only whole words survive
  });

  it("drops tiles without a title, and keeps at most 8", () => {
    const r = one({ type: "tiles", items: [{ subtitle: "no title" }] });
    expect(r.blocks).toEqual([]);
    expect(r.dropped).toEqual([{ path: "0.items.0", why: "tile has no title" }, { path: "0", why: "tiles has no item with a title" }]);
    const many = one({ type: "tiles", items: Array.from({ length: 10 }, (_, i) => ({ title: `t${i}`, ask: "x" })) });
    expect((many.blocks[0] as any).items.length).toBe(8);
  });
});
