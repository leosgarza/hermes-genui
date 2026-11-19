import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import catalog from "../../../core/catalog.json";
import { BlockActions } from "./actions";
import { BlockTag } from "./BlockTag";

afterEach(cleanup);

const timeline = catalog.blocks.find((b) => b.kind === "timeline")!.example;

describe("BlockTag", () => {
  it("shows a placeholder while the reply is still streaming, without loading", () => {
    const load = vi.fn();
    render(<BlockTag id="7f3a09bc" streaming={true} load={load} />);
    expect(screen.getByText("drawing…")).toBeTruthy();
    expect(load).not.toHaveBeenCalled();
  });

  it("hides a malformed id without loading", () => {
    const load = vi.fn();
    const { container } = render(<BlockTag id="zzz" streaming={false} load={load} />);
    expect(container.innerHTML).toBe("");
    expect(load).not.toHaveBeenCalled();
  });

  it("hides itself when loading fails", async () => {
    const { container } = render(<BlockTag id="7f3a09bc" streaming={false} load={() => Promise.reject(new Error("404"))} />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("hides itself when the stored data has nothing drawable", async () => {
    const { container } = render(<BlockTag id="7f3a09bc" streaming={false} load={() => Promise.resolve({ blocks: [{ type: "weather" }] })} />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("draws the stored blocks", async () => {
    const load = vi.fn(() => Promise.resolve({ blocks: [timeline] }));
    render(<BlockTag id="7f3a09bc" streaming={false} load={load} />);
    await waitFor(() => expect(screen.getByText("Day 1 · Fri 9 Oct")).toBeTruthy());
    expect(load).toHaveBeenCalledWith("7f3a09bc");
  });

  it("hands its id to the blocks inside, so a checklist loads its board's saved ticks", async () => {
    const rest = vi.fn(async () => ({ state: { "0": [0] } }));
    const checklist = { type: "checklist", items: ["Passport", "Tickets"] };
    render(
      <BlockActions.Provider value={{ send: vi.fn(), fill: vi.fn(), rest }}>
        <BlockTag id="7f3a09bc" streaming={false} load={() => Promise.resolve({ blocks: [checklist] })} />
      </BlockActions.Provider>,
    );
    await waitFor(() => expect(screen.getByText("1 of 2 done")).toBeTruthy());
    expect(rest).toHaveBeenCalledWith("/blocks/7f3a09bc/state");
  });
});

describe("BlockTag alignment", () => {
  // The board's default comes from the stored envelope; the reader's own choice (host-side, this device) outranks
  // both the board's default and every block's ask, and is remembered per board until given back ("Auto").
  const stored = (blocks: unknown[], envelope: Record<string, unknown> = {}) => ({ ...envelope, blocks });

  afterEach(() => {
    localStorage.clear();
    cleanup();
  });

  it("passes the board's own default down to the blocks", async () => {
    render(<BlockTag id="7f3a09bc" streaming={false} load={async () => stored([timeline], { align: "center" })} />);
    await waitFor(() => expect(screen.getByText("Day 1 · Fri 9 Oct")).toBeTruthy());
    expect(document.querySelector(".hb-place[data-align='center']")).toBeTruthy();
  });

  it("offers the reader left, center and right, over the model's choice", async () => {
    const calc = { type: "calculator", sliders: [{ name: "p", title: "Loan", max: 100, value: 40 }], results: [{ label: "Half", formula: "p / 2" }], align: "center" };
    render(<BlockTag id="7f3a09bc" streaming={false} load={async () => stored([calc])} />);
    await waitFor(() => expect(document.querySelector(".hb-place[data-align='center']")).toBeTruthy());  // the model asked
    fireEvent.click(screen.getByRole("button", { name: "Left" }));
    expect(document.querySelector(".hb-place")).toBeNull();                                              // the reader says left, blocks sit left
    fireEvent.click(screen.getByRole("button", { name: "Right" }));
    expect(document.querySelector(".hb-place[data-align='right']")).toBeTruthy();                        // and right
    expect(localStorage.getItem("hermes-genui-align-7f3a09bc")).toBe("right");                            // remembered
  });

  it("starts from the remembered choice, and Auto gives it back to the model", async () => {
    localStorage.setItem("hermes-genui-align-7f3a09bc", "right");
    render(<BlockTag id="7f3a09bc" streaming={false} load={async () => stored([timeline], { align: "center" })} />);
    await waitFor(() => expect(document.querySelector(".hb-place[data-align='right']")).toBeTruthy());   // remembered beats the board's default
    expect(screen.getByRole("button", { name: "Right" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    expect(document.querySelector(".hb-place[data-align='center']")).toBeTruthy();                       // back to what the model chose
    expect(localStorage.getItem("hermes-genui-align-7f3a09bc")).toBeNull();
  });
});
