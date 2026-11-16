import { afterEach, describe, expect, it, vi } from "vitest";
import { clearGeneratedImageCache, isGeneratedImagePath, readGeneratedImageDataUrl } from "./localImage";

afterEach(() => {
  delete (window as unknown as { hermesDesktop?: unknown }).hermesDesktop;
  clearGeneratedImageCache();
});

const PATH = "/Users/me/.hermes/cache/generated/images/a.png";
const DATA = "data:image/png;base64,AAAA";

describe("isGeneratedImagePath", () => {
  it("takes absolute POSIX, Windows and UNC paths", () => {
    for (const p of [PATH, "/tmp/a.png", "C:\\Users\\me\\a.png", "d:/pic.png", "\\\\server\\share\\a.png"]) {
      expect(isGeneratedImagePath(p)).toBe(true);
    }
  });
  it("refuses urls, relative names, empty and over-long strings", () => {
    const bad = ["https://a.example/x.jpg", "http://a/x.jpg", "file:///Users/me/a.png", "data:image/png;base64,AA",
      "a.png", "~/a.png", "", "javascript:alert(1)", "/tmp/a\n.png", "x".repeat(501)];
    for (const p of bad) expect(isGeneratedImagePath(p)).toBe(false);
  });
});

describe("readGeneratedImageDataUrl", () => {
  it("reads through the desktop host's file reader", async () => {
    const readFileDataUrl = vi.fn(async () => DATA);
    (window as unknown as { hermesDesktop: unknown }).hermesDesktop = { readFileDataUrl };
    await expect(readGeneratedImageDataUrl(PATH)).resolves.toBe(DATA);
    expect(readFileDataUrl).toHaveBeenCalledWith(PATH);
  });

  it("treats a missing-file sentinel as final: rejects, and no gateway call even with one available", async () => {
    const api = vi.fn(async () => ({ dataUrl: DATA }));
    (window as unknown as { hermesDesktop: unknown }).hermesDesktop = {
      readFileDataUrl: async () => ({ ok: false, error: "ENOENT" }),
      api,
    };
    await expect(readGeneratedImageDataUrl(PATH)).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
  });

  it("treats the size-cap rejection as final: rejects, and no gateway call even with one succeeding", async () => {
    const api = vi.fn(async () => DATA);
    (window as unknown as { hermesDesktop: unknown }).hermesDesktop = {
      readFileDataUrl: async () => {
        throw new Error("EFBIG");
      },
      api,
    };
    await expect(readGeneratedImageDataUrl(PATH)).rejects.toThrow("EFBIG");
    expect(api).not.toHaveBeenCalled();
  });

  it("treats a sensitive-file refusal as final: rejects, and no gateway call even with one succeeding", async () => {
    const api = vi.fn(async () => DATA);
    (window as unknown as { hermesDesktop: unknown }).hermesDesktop = {
      readFileDataUrl: async () => {
        throw new Error("refused: sensitive file");
      },
      api,
    };
    await expect(readGeneratedImageDataUrl(PATH)).rejects.toThrow(/sensitive/);
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects without a gateway call when the build has no direct reader", async () => {
    const api = vi.fn(async () => ({ dataUrl: DATA }));
    (window as unknown as { hermesDesktop: unknown }).hermesDesktop = { api };
    await expect(readGeneratedImageDataUrl(PATH)).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects when no desktop bridge is there at all", async () => {
    await expect(readGeneratedImageDataUrl(PATH)).rejects.toThrow();
  });

  it("reads a path once and caches the data url", async () => {
    const readFileDataUrl = vi.fn(async () => DATA);
    (window as unknown as { hermesDesktop: unknown }).hermesDesktop = { readFileDataUrl };
    await Promise.all([readGeneratedImageDataUrl(PATH), readGeneratedImageDataUrl(PATH)]);
    await readGeneratedImageDataUrl(PATH);
    expect(readFileDataUrl).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures: a later remount reads again", async () => {
    let up = false;
    const readFileDataUrl = vi.fn(async () => (up ? DATA : { ok: false, error: "ENOENT" }));
    (window as unknown as { hermesDesktop: unknown }).hermesDesktop = { readFileDataUrl };
    await expect(readGeneratedImageDataUrl(PATH)).rejects.toThrow();
    up = true;
    await expect(readGeneratedImageDataUrl(PATH)).resolves.toBe(DATA);
    expect(readFileDataUrl).toHaveBeenCalledTimes(2);
  });
});
