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
  it("keeps a 1–2 sentence decision reason in full (the card must read without hovering)", () => {
    const reason = "Take the 08:12 local to Omiya and the Keihin-Tohoku line direct to Tokyo Station — about 85 minutes, and it skips the shinkansen fare.";
    expect(reason.length).toBeGreaterThan(80);
    expect(reason.length).toBeLessThanOrEqual(180);
    const r = one({ type: "tiles", items: [{ title: "Local train", subtitle: reason, run: "Book the 08:12 local" }] });
    expect((r.blocks[0] as any).items[0].subtitle).toBe(reason);
  });
  // The visible reason is capped at MAX_STRING (300) — the same general string maximum as the tile's own ask/run,
  // every other reader's long text, and the Python text fallback. These are the strings a real decision card writes:
  // a whole sentence or two must pass through untouched, whatever their length.
  const longOneSentence = "Compare all four hotels side by side before booking: the riverside one is 12k a night but a twenty-minute walk to the office, the Grand is loudest but cheapest, and only the corner suites get morning light.";
  const twoSentences = "Take the 08:12 local to Omiya and the Keihin-Tohoku line direct to Tokyo Station — about 85 minutes, and it skips the shinkansen fare. Arriving before nine leaves the whole morning free for the east side, which the later trains cannot give you.";

  it("keeps a 206-character single-sentence reason in full — a sentence carries no length limit", () => {
    expect(longOneSentence.match(/\./g)!.length).toBe(1);  // one sentence
    expect(longOneSentence.length).toBeGreaterThan(180);   // the rejected candidate cut exactly this
    const r = one({ type: "tiles", items: [{ title: "Hotels", subtitle: longOneSentence, run: "Compare hotels" }] });
    expect((r.blocks[0] as any).items[0].subtitle).toBe(longOneSentence);
  });
  it("keeps a longer two-sentence reason in full", () => {
    expect(twoSentences.length).toBeGreaterThan(180);      // the rejected candidate cut this too
    const r = one({ type: "tiles", items: [{ title: "Local train", subtitle: twoSentences, run: "Book the 08:12 local" }] });
    expect((r.blocks[0] as any).items[0].subtitle).toBe(twoSentences);
  });
  it("cuts only a runaway reason — at the general string maximum, between words, with an ellipsis", () => {
    const runaway = `${twoSentences} And a third sentence, then a fourth, which keeps on writing and writing until the text is plainly no longer a short decision reason but a paragraph that would flood the card if nothing ended it with room to spare before the cap.`;
    expect(runaway.length).toBeGreaterThan(300);
    const r = one({ type: "tiles", items: [{ title: "Essay", subtitle: runaway, run: "Tell me more" }] });
    const sub = (r.blocks[0] as any).items[0].subtitle;
    expect(sub.length).toBeLessThanOrEqual(300);
    expect(sub.length).toBeGreaterThan(240);               // reaches the general maximum, not a smaller number
    expect(sub.endsWith("…")).toBe(true);                  // the old code cut mid-word at 80, silently
    const kept = sub.slice(0, -1);
    expect(runaway.startsWith(kept)).toBe(true);           // keeps the author's words, in order
    expect(runaway[kept.length]).toBe(" ");                // cut between words, not inside one
    expect(kept.endsWith(" ")).toBe(false);                // no dangling space before the ellipsis
  });
  it("drops tiles without a title, and keeps at most 8", () => {
    const r = one({ type: "tiles", items: [{ subtitle: "no title" }] });
    expect(r.blocks).toEqual([]);
    expect(r.dropped).toEqual([{ path: "0.items.0", why: "tile has no title" }, { path: "0", why: "tiles has no item with a title" }]);
    const many = one({ type: "tiles", items: Array.from({ length: 10 }, (_, i) => ({ title: `t${i}`, ask: "x" })) });
    expect((many.blocks[0] as any).items.length).toBe(8);
  });
});
