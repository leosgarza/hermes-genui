import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImagesBlock } from "./read";
import { Images } from "./Images";
import { clearGeneratedImageCache } from "./localImage";

afterEach(() => {
  cleanup();
  clearGeneratedImageCache();
  delete (window as unknown as { hermesDesktop?: unknown }).hermesDesktop;
});

const block: ImagesBlock = { type: "images", title: "Lisbon", images: [
  { url: "https://a.example/alfama.jpg", caption: "Alfama rooftops", source: "a.example" },
  { url: "https://b.example/tram.jpg", caption: "Tram 28", source: "b.example" },
] };

const GEN_PATH = "/Users/me/.hermes/cache/generated/images/fox-gate.png";
const GEN_DATA = "data:image/png;base64,Rk9Y";

const hostWithFileRead = (readFileDataUrl: (path: string) => Promise<unknown>) => {
  (window as unknown as { hermesDesktop: unknown }).hermesDesktop = { readFileDataUrl: vi.fn(readFileDataUrl) };
};

const genBlock: ImagesBlock = { type: "images", images: [{ url: GEN_PATH, caption: "Fox gate" }] };

describe("Images", () => {
  it("shows each photo with its caption and credit", () => {
    render(<Images block={block} />);
    expect(screen.getByText("Lisbon")).toBeTruthy();
    expect(screen.getByText("Alfama rooftops")).toBeTruthy();
    expect(screen.getByText("b.example")).toBeTruthy();
    expect(document.querySelectorAll(".hb-photo img").length).toBe(2);
  });

  it("hides a photo that fails to load and keeps the rest", () => {
    render(<Images block={block} />);
    fireEvent.error(document.querySelector('img[src="https://a.example/alfama.jpg"]')!);
    expect(screen.queryByText("Alfama rooftops")).toBeNull();
    expect(screen.getByText("Tram 28")).toBeTruthy();
  });

  it("draws nothing when every photo fails", () => {
    const { container } = render(<Images block={block} />);
    for (const img of [...document.querySelectorAll(".hb-photo img")]) fireEvent.error(img);
    expect(container.innerHTML).toBe("");
  });

  it("opens a photo full size on click and closes it again", () => {
    render(<Images block={block} />);
    fireEvent.click(screen.getByRole("button", { name: /Tram 28/ }));
    const big = document.querySelector(".hb-photo-overlay img") as HTMLImageElement;
    expect(big.getAttribute("src")).toBe("https://b.example/tram.jpg");
    fireEvent.click(document.querySelector(".hb-photo-overlay")!);
    expect(document.querySelector(".hb-photo-overlay")).toBeNull();
  });

  // --- generated local images (the host reads the file; nothing renders until it answers) ------------------------

  it("draws a generated photo through the host's data url", async () => {
    hostWithFileRead(async () => GEN_DATA);
    render(<Images block={genBlock} />);
    const img = await screen.findByAltText("Fox gate");
    expect(img.getAttribute("src")).toBe(GEN_DATA);
    expect(screen.getByText("Fox gate")).toBeTruthy();
  });

  it("shows nothing while the generated photo is still being read", () => {
    hostWithFileRead(() => new Promise(() => {})); // never settles
    const { container } = render(<Images block={genBlock} />);
    expect(container.innerHTML).toBe("");
  });

  it("hides a generated photo the host cannot read and keeps https photos", async () => {
    hostWithFileRead(async (p) => (p === GEN_PATH ? { ok: false, error: "ENOENT" } : GEN_DATA));
    render(<Images block={{ ...block, images: [...block.images, { url: GEN_PATH, caption: "Fox gate" }] }} />);
    expect(screen.getByText("Tram 28")).toBeTruthy(); // https photos never wait for the file read
    await waitFor(() => expect(screen.queryByText("Fox gate")).toBeNull());
    expect(screen.getByText("Alfama rooftops")).toBeTruthy();
  });

  it("hides generated photos when no desktop bridge is there", async () => {
    const { container } = render(<Images block={genBlock} />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("opens a generated photo full size with its data url", async () => {
    hostWithFileRead(async () => GEN_DATA);
    render(<Images block={genBlock} />);
    fireEvent.click(await screen.findByRole("button", { name: "Fox gate" }));
    const big = document.querySelector(".hb-photo-overlay img") as HTMLImageElement;
    expect(big.getAttribute("src")).toBe(GEN_DATA);
  });

  it("reads each generated path once even across remounts", async () => {
    const read = vi.fn(async () => GEN_DATA);
    (window as unknown as { hermesDesktop: unknown }).hermesDesktop = { readFileDataUrl: read };
    const first = render(<Images block={genBlock} />);
    await screen.findByAltText("Fox gate");
    first.unmount();
    render(<Images block={genBlock} />);
    await screen.findByAltText("Fox gate");
    expect(read).toHaveBeenCalledTimes(1);
  });
});
