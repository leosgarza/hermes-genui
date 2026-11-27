import { describe, expect, it } from "vitest";
import { readBlocks } from "../../core/readBlocks";

describe("images", () => {
  it("keeps https photos only, up to 12", () => {
    const photos = [{ url: "http://x.example/a.jpg" }, ...Array.from({ length: 14 }, (_, i) => ({ url: `https://x.example/${i}.jpg`, caption: `c${i}`, source: "Wikimedia" }))];
    const b = readBlocks([{ type: "images", title: "Lisbon", images: photos }])[0] as any;
    expect(b.title).toBe("Lisbon");
    expect(b.images.length).toBe(12);
    expect(b.images[0]).toEqual({ url: "https://x.example/0.jpg", caption: "c0", source: "Wikimedia" });
  });
  it("is dropped when no photo has a drawable url", () => {
    expect(readBlocks([{ type: "images", images: [{ url: "http://x.example/a.jpg" }] }])).toEqual([]);
  });
  it("keeps a trusted-shaped generated path in url", () => {
    // (show_blocks' provenance gate is what proved the tool returned it; the reader only reads the shape.)
    const p = "/Users/me/.hermes/cache/generated/images/a.png";
    const b = readBlocks([{ type: "images", images: [{ url: p, caption: "Fox gate" }] }])[0] as any;
    expect(b.images[0]).toEqual({ url: p, caption: "Fox gate" });
    const w = readBlocks([{ type: "images", images: [{ url: "C:\\Users\\me\\a.png" }] }])[0] as any;
    expect(w.images[0].url).toBe("C:\\Users\\me\\a.png");
  });
  it("takes generated paths from url only — the src alias stays https", () => {
    expect(readBlocks([{ type: "images", images: [{ src: "/Users/me/a.png" }] }])).toEqual([]);
    const b = readBlocks([{ type: "images", images: [{ url: "https://a.example/x.jpg", src: "/Users/me/a.png" }] }])[0] as any;
    expect(b.images[0].url).toBe("https://a.example/x.jpg"); // url wins, as before
  });
  it("drops relative names, file:// spellings and data: urls", () => {
    expect(readBlocks([{ type: "images", images: [{ url: "a.png" }] }])).toEqual([]);
    expect(readBlocks([{ type: "images", images: [{ url: "file:///Users/me/a.png" }] }])).toEqual([]);
    expect(readBlocks([{ type: "images", images: [{ url: "data:image/png;base64,AAAA" }] }])).toEqual([]);
  });
});
