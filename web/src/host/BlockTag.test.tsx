import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import catalog from "../../../core/catalog.json";
import { Blocks } from "../core/Blocks";
import { readBlocks } from "../core/readBlocks";
import { withStyles } from "../core/testing";
import tokens from "../styles/tokens.css?raw";
import shared from "../styles/shared.css?raw";
import calculator from "../blocks/calculator/calculator.css?raw";
import blockTag from "./blockTag.css?raw";
import { BlockActions } from "./actions";
import { BlockTag } from "./BlockTag";

afterEach(cleanup);

const timeline = catalog.blocks.find((b) => b.kind === "timeline")!.example;

// Shared shapes for the expand suite below (the placement describe keeps its own locals untouched).
const stored = (blocks: unknown[], envelope: Record<string, unknown> = {}) => ({ ...envelope, blocks });
const calc = { type: "calculator", sliders: [{ name: "p", title: "Loan", max: 100, value: 40 }], results: [{ label: "Half", formula: "p / 2" }] };
const photo = { type: "images", images: [{ url: "https://a.example/x.jpg", caption: "Alfama" }] };

const drawn = async (blocks: unknown[], envelope: Record<string, unknown> = {}) => {
  const view = render(<BlockTag id="7f3a09bc" streaming={false} load={async () => stored(blocks, envelope)} />);
  const button = await screen.findByRole("button", { name: "Expand board" });
  await waitFor(() => expect(view.container.querySelector(".hb-blocks")).toBeTruthy());
  return { ...view, button };
};
const openExpanded = async (blocks: unknown[], envelope: Record<string, unknown> = {}) => {
  const view = await drawn(blocks, envelope);
  fireEvent.click(view.button);
  await waitFor(() => expect(document.querySelector(".hb-board-overlay")).toBeTruthy());
  return view;
};

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

describe("BlockTag placement", () => {
  // Placement is the model's alone: the block's own ask, then the board's stored default, then left. The reader
  // has no control anywhere — no chips above the board, and no remembered per-board override: a stale
  // localStorage key from the old chips changes nothing and is never read.
  const stored = (blocks: unknown[], envelope: Record<string, unknown> = {}) => ({ ...envelope, blocks });
  const calc = { type: "calculator", sliders: [{ name: "p", title: "Loan", max: 100, value: 40 }], results: [{ label: "Half", formula: "p / 2" }] };

  afterEach(() => {
    localStorage.clear();
    cleanup();
  });

  it("passes the board's own default down to the blocks", async () => {
    render(<BlockTag id="7f3a09bc" streaming={false} load={async () => stored([timeline], { align: "center" })} />);
    await waitFor(() => expect(screen.getByText("Day 1 · Fri 9 Oct")).toBeTruthy());
    expect(document.querySelector(".hb-place[data-align='center']")).toBeTruthy();
  });

  it("passes the board's own text default down to its blocks", async () => {
    render(<BlockTag id="7f3a09bc" streaming={false}
      load={async () => stored([{ type: "heading", text: "Today" }], { text_align: "center" })} />);
    await waitFor(() => expect(screen.getByText("Today")).toBeTruthy());
    expect(document.querySelector("[data-text-align='center'] .hb-heading")).toBeTruthy();
  });

  it("draws no alignment control of any kind", async () => {
    // The host controls a board grows are view acts, never placement asks: the expand control (t_e7796349) and,
    // since #6 (t_bff8178a), the export affordance — a deterministic save of what is drawn. Every button at the
    // host level must be one of them; every OTHER button — and above all any alignment word — stays forbidden.
    render(<BlockTag id="7f3a09bc" streaming={false} load={async () => stored([calc], { align: "center" })} />);
    await waitFor(() => expect(document.querySelector(".hb-place[data-align='center']")).toBeTruthy());
    expect(document.querySelector(".hb-align")).toBeNull();
    for (const b of [...document.querySelectorAll("button")]) {
      const viewAct = b.classList.contains("hb-expand") ||
        b.classList.contains("hb-export") || b.classList.contains("hb-export-btn") ||
        b.closest(".hb-export-menu") !== null;
      expect(viewAct, b.className).toBe(true);
    }
    for (const word of ["Auto", "Left", "Center", "Right"]) {
      expect(screen.queryByRole("button", { name: word })).toBeNull();
    }
  });

  it("ignores a remembered reader choice: the model's word stands", async () => {
    localStorage.setItem("hermes-genui-align-7f3a09bc", "right");  // what the old chips used to save
    render(<BlockTag id="7f3a09bc" streaming={false} load={async () => stored([{ ...calc, align: "center" }])} />);
    await waitFor(() => expect(document.querySelector(".hb-place")).toBeTruthy());
    expect(document.querySelector(".hb-place[data-align='center']")).toBeTruthy();  // still the model's center
    expect(document.querySelectorAll(".hb-place[data-align='right']").length).toBe(0);
    expect(localStorage.getItem("hermes-genui-align-7f3a09bc")).toBe("right");      // untouched: never read, never written
  });
});

describe("BlockTag expand / full-screen", () => {
  // The images full-size overlay pattern (blocks/images/Images.tsx) raised to a whole board, with one honest
  // correction: a stateless photo may be re-drawn at full size, a board may not. Its blocks carry live state —
  // a calculator's sliders, an unsent form draft, a lit flow — so expanding MOVES the one drawn instance into
  // the dialog instead of instantiating a second one. The host wrapper is a plain block container at rest (the
  // inline board keeps drawing its byte-identical .hb-blocks under it) and becomes the fixed dialog itself.
  // Escape and the close control return to the inline view; focus is trapped inside while open and handed back
  // on close. The trap wraps Tab on the ELIGIBLE tabbable controls: disabled (own or via a disabled fieldset),
  // negative-tabindex and hidden controls are never stops and never leak focus out of the dialog.

  const form = {
    type: "form", id: "trip", title: "Weekend",
    fields: [{ id: "note", kind: "text", label: "Note" }],
  };

  it("grows an expand control on every drawn board — a real button, outside the blocks", async () => {
    const { container, button } = await drawn([{ type: "heading", text: "Quarterly" }]);
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.classList.contains("hb-expand")).toBe(true);
    expect(document.querySelector(".hb-blocks .hb-expand")).toBeNull();  // the control never sits inside the board
    expect(container.querySelector(".hb-tag > .hb-board-host > .hb-blocks")).toBeTruthy();  // the host owns the wrapper
    expect(container.querySelector(".hb-board-host")!.hasAttribute("role")).toBe(false);    // at rest: a plain container
  });

  it("draws no expand control while streaming or when the board is not there", async () => {
    render(<BlockTag id="7f3a09bc" streaming={true} load={() => Promise.resolve({ blocks: [] })} />);
    expect(screen.queryByRole("button", { name: "Expand board" })).toBeNull();
    const failed = render(<BlockTag id="7f3a09bc" streaming={false} load={() => Promise.reject(new Error("404"))} />);
    await waitFor(() => expect(failed.container.innerHTML).toBe(""));
    expect(screen.queryByRole("button", { name: "Expand board" })).toBeNull();
  });

  it("leaves the inline board byte-identical when nothing is expanded", async () => {
    const blocks = [{ type: "heading", text: "Quarterly" }, { ...calc, align: "center" }, { type: "text", text: "Notes" }];
    const { container } = await drawn(blocks, { align: "right", text_align: "center" });
    const inline = container.querySelector(".hb-blocks")!.outerHTML;
    cleanup();
    const bare = render(<Blocks blocks={readBlocks(blocks)} boardAlign="right" boardTextAlign="center" />).container;
    expect(inline).toBe(bare.innerHTML);  // the whole .hb-blocks element: not one byte of markup changes
  });

  it("expands the one board instance into the dialog — the same element, never a copy", async () => {
    const { container, button } = await drawn([{ type: "heading", text: "Quarterly" }]);
    const board = container.querySelector(".hb-blocks")!;
    fireEvent.click(button);
    const dialog = document.querySelector<HTMLElement>(".hb-board-overlay")!;
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Expanded board");
    expect(dialog.querySelector(".hb-blocks")).toBe(board);               // lifted in, not re-instantiated
    expect(document.querySelectorAll(".hb-blocks").length).toBe(1);      // the board is drawn once, ever
    expect(dialog.firstElementChild!.classList.contains("hb-overlay-close")).toBe(true);
    expect(screen.getAllByText("Quarterly").length).toBe(1);             // inline and expanded are ONE board
  });

  it("carries a calculator across open, close and reopen in both directions", async () => {
    const { container, button } = await drawn([calc]);
    const slider = container.querySelector<HTMLInputElement>(".hb-calc input")!;
    fireEvent.change(slider, { target: { value: "70" } });               // the reviewer probe: 40 moved to 70
    fireEvent.click(button);
    const shown = document.querySelector<HTMLInputElement>(".hb-board-overlay .hb-calc input")!;
    expect(shown).toBe(slider);                                          // the same control, not a second draw
    expect(shown.value).toBe("70");                                      // the dialog shows live state, not 40
    fireEvent.change(shown, { target: { value: "90" } });                // edit while expanded…
    fireEvent.click(document.querySelector(".hb-overlay-close")!);
    expect(slider.value).toBe("90");                                     // …and it returns to the inline view
    fireEvent.click(button);
    expect(document.querySelector<HTMLInputElement>(".hb-board-overlay .hb-calc input")!.value).toBe("90");  // survives a reopen
  });

  it("carries an unsent form draft across the same round trip", async () => {
    const { container, button } = await drawn([form]);
    const field = container.querySelector<HTMLInputElement>(".hb-input")!;
    fireEvent.change(field, { target: { value: "Cottage, Friday" } });   // typed, never sent
    fireEvent.click(button);
    expect(document.querySelector(".hb-board-overlay .hb-input")).toBe(field);
    expect(field.value).toBe("Cottage, Friday");
    fireEvent.change(field, { target: { value: "Cabin, Sunday" } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(field.value).toBe("Cabin, Sunday");                           // the draft came back with the board
  });

  it("the close control returns to the inline view and hands focus back to the expand button", async () => {
    const { button } = await openExpanded([{ type: "heading", text: "Quarterly" }]);
    fireEvent.click(document.querySelector(".hb-overlay-close")!);
    expect(document.querySelector(".hb-board-overlay")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("Escape closes the expanded board and returns focus", async () => {
    const { button } = await openExpanded([{ type: "heading", text: "Quarterly" }]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector(".hb-board-overlay")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("focus lands in the dialog on open and Tab cannot leave it", async () => {
    const { button } = await openExpanded([calc]);
    const close = document.querySelector(".hb-overlay-close")!;
    expect(document.activeElement).toBe(close);                          // open: focus starts inside the dialog
    const items = [...document.querySelectorAll<HTMLElement>(
      ".hb-board-overlay button, .hb-board-overlay input, .hb-board-overlay [href], " +
      ".hb-board-overlay select, .hb-board-overlay textarea, .hb-board-overlay [tabindex]:not([tabindex='-1'])")];
    expect(items.length).toBeGreaterThan(1);                             // a slider lives in the expanded board
    const focusedLast = items[items.length - 1];
    focusedLast.focus();
    fireEvent.keyDown(window, { key: "Tab" });                           // from the last item: wraps to the first
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });           // from the first: wraps to the last
    expect(document.activeElement).toBe(focusedLast);
    expect(button).not.toBe(document.activeElement);                     // focus never escaped to the inline button
  });

  it("the trap wraps on the real ends when the last control is disabled — the reviewer probe", async () => {
    await openExpanded([calc]);
    const dialog = document.querySelector(".hb-board-overlay")!;
    const dead = document.createElement("button");                       // a Steps/Layers final Next, spent
    dead.disabled = true;
    dialog.appendChild(dead);                                            // dead last in tab order
    const close = document.querySelector<HTMLElement>(".hb-overlay-close")!;
    const slider = document.querySelector<HTMLElement>(".hb-board-overlay .hb-calc input")!;
    expect(document.activeElement).toBe(close);                          // open landed on the first control
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(back);                                          // Shift+Tab from the first control
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(slider);                         // wrapped to the last ELIGIBLE, not stuck
    const fwd = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    window.dispatchEvent(fwd);                                           // Tab from that real last control
    expect(fwd.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);                          // wraps — native would skip the dead end and leave
  });

  it("the trap skips disabled, negative-tabindex and hidden controls and stops only on eligible ones", async () => {
    await openExpanded([calc]);
    const dialog = document.querySelector(".hb-board-overlay")!;
    const add = <T extends HTMLElement>(el: T): T => { dialog.appendChild(el); return el; };
    const neg = add(document.createElement("input"));
    neg.setAttribute("type", "text");
    neg.setAttribute("tabindex", "-1");                                  // reachable only programmatically
    const hid = add(document.createElement("button"));
    hid.hidden = true;                                                   // gone from every tab order
    const held = add(document.createElement("fieldset"));
    held.disabled = true;
    const send = document.createElement("button");
    send.textContent = "Send";
    held.appendChild(send);                                              // a form Send behind a disabled fieldset
    const realLast = add(document.createElement("button"));
    realLast.textContent = "Real last";
    const close = document.querySelector<HTMLElement>(".hb-overlay-close")!;
    const exportMenu = document.querySelector<HTMLElement>(".hb-board-overlay .hb-export")!;  // the dialog's own export control: eligible by design (#6 round 2)
    const slider = document.querySelector<HTMLElement>(".hb-board-overlay .hb-calc input")!;
    close.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(exportMenu);                     // first: the close control, then the board menu, then the slider
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(slider);
    fireEvent.keyDown(window, { key: "Tab" });                           // skipping negative, hidden and held
    expect(document.activeElement).toBe(realLast);
    fireEvent.keyDown(window, { key: "Tab" });                           // and wrapping at that real end
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(realLast);                       // reverse: back over the same real list
  });

  it("clicking the scrim closes, clicking the board itself does not", async () => {
    const { container } = await openExpanded([{ type: "heading", text: "Quarterly" }]);
    fireEvent.click(container.querySelector(".hb-blocks")!);             // on the panel: stays open
    expect(document.querySelector(".hb-board-overlay")).toBeTruthy();
    fireEvent.click(document.querySelector(".hb-heading")!);             // inside the board: stays open
    expect(document.querySelector(".hb-board-overlay")).toBeTruthy();
    fireEvent.click(document.querySelector(".hb-board-overlay")!);       // the scrim ring closes
    expect(document.querySelector(".hb-board-overlay")).toBeNull();
  });

  it("an expanded board keeps the model's placement and voice", async () => {
    await openExpanded([{ ...calc, align: "center" }, { type: "heading", text: "Reads centered" }],
      { text_align: "center" });
    const dialog = document.querySelector(".hb-board-overlay")!;
    expect(dialog.querySelector(".hb-place[data-align='center']")).toBeTruthy();
    expect(dialog.querySelector(".hb-place[data-text-align='center'] .hb-heading")).toBeTruthy();
    expect(document.querySelectorAll(".hb-place").length).toBe(2);       // both asks — and one instance, not two draws
  });

  it("a declaring board keeps its provenance footer in the expanded view", async () => {
    await openExpanded([{ type: "source", text: "BLS series" }, { type: "heading", text: "Jobs" }],
      { as_of: "2026-11-18", live: false });
    expect(document.querySelectorAll(".hb-provenance").length).toBe(1);  // the footer travels with the board
    expect(document.querySelector(".hb-board-overlay .hb-provenance-badge[data-live='snapshot']")).toBeTruthy();
  });

  it("Escape answers the photo layer first while the board stays expanded", async () => {
    await openExpanded([photo]);
    fireEvent.click(document.querySelector(".hb-board-overlay .hb-photo")!);   // open a photo inside the dialog
    await waitFor(() => expect(document.querySelector(".hb-photo-overlay")).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector(".hb-photo-overlay")).toBeNull();             // the photo closes first
    expect(document.querySelector(".hb-board-overlay")).toBeTruthy();           // the board keeps the ask
  });
});

describe("BlockTag nested overlays — the chart detail inside the expanded board", () => {
  // A drill-down can open over an expanded board: a chart, expanded, drilled. The keyboard then belongs to the
  // topmost layer alone — the first Escape closes the detail (the board stays expanded, focus returns to the
  // drawing, its pick kept) and only a second Escape closes the board (focus back on the expand control). The
  // board's Tab trap must not reach past the dialog above it (core/overlays.ts is the stack).
  const line = { type: "chart", kind: "line", title: "Temps", x: ["Jun", "Jul"], series: [{ name: "°C", data: [20, 30] }] };

  const openDrill = async () => {
    const view = await openExpanded([line]);
    const svg = document.querySelector<SVGSVGElement>(".hb-board-overlay svg.hb-chart-svg")!;
    svg.focus();
    fireEvent.keyDown(svg, { key: "ArrowRight" });   // pick Jun
    fireEvent.keyDown(svg, { key: "Enter" });        // drill into it
    await waitFor(() => expect(document.querySelector(".hb-chart-detail")).toBeTruthy());
    return { ...view, svg };
  };

  it("the first Escape closes the detail ONLY — the board stays expanded, focus back on the drawing", async () => {
    const { container, svg } = await openDrill();
    const dialog = document.querySelector<HTMLElement>(".hb-chart-detail")!;
    const button = dialog.querySelector("button")!;
    expect(document.activeElement).toBe(button);                        // the dialog owns the keyboard
    fireEvent.keyDown(button, { key: "Escape" });
    expect(document.querySelector(".hb-chart-detail")).toBeNull();      // the detail answered the key…
    expect(document.querySelector(".hb-board-overlay")).toBeTruthy();   // …and nothing under it did
    expect(document.activeElement).toBe(svg);                           // back to the drawing it opened from
    expect(container.querySelector("svg.hb-chart-svg")).toBe(svg);      // the ONE chart, never re-mounted
    expect(container.querySelector(".hb-chart-at")!.textContent).toBe("Jun");  // its pick survived the round trip
  });

  it("a second Escape then closes the board itself, focus back on the expand control", async () => {
    const { button: expand, svg } = await openDrill();
    fireEvent.keyDown(document.querySelector(".hb-chart-detail button")!, { key: "Escape" });  // the detail first
    fireEvent.keyDown(svg, { key: "Escape" });                                                 // then the board
    expect(document.querySelector(".hb-chart-detail")).toBeNull();
    expect(document.querySelector(".hb-board-overlay")).toBeNull();
    expect(document.activeElement).toBe(expand);
  });

  it("Tab belongs to the topmost dialog only; the board's trap resumes when it closes", async () => {
    const { svg } = await openDrill();
    const dialog = document.querySelector<HTMLElement>(".hb-chart-detail")!;
    const close = dialog.querySelector("button")!;
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab" });
    expect(document.activeElement).toBe(close);                    // the dialog's own trap, not the board's
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);                    // wrapping both ways
    fireEvent.keyDown(close, { key: "Escape" });                   // close the detail
    expect(document.querySelector(".hb-board-overlay")).toBeTruthy();
    fireEvent.keyDown(svg, { key: "Tab" });                        // the board's trap owns the keys again
    const host = document.querySelector(".hb-board-overlay")!;
    expect(host.contains(document.activeElement)).toBe(true);
  });
});

describe("BlockTag expand width semantics", () => {
  // jsdom cannot lay out, but it does resolve the cascade: the board keeps the 1100px reading cap inline, and
  // the ONE shipped dialog rule opens that same element — and only its cap — to the wider container while every
  // .hb-blocks > X cap (the calculator's 720px, the hugging table) stays the board's own rule. Real widths are
  // measured in Chrome by tests/test_expand_fullscreen.py.
  let unstyle: () => void;
  beforeAll(() => (unstyle = withStyles(tokens, shared, blockTag, calculator)));
  afterAll(() => unstyle());

  it("lifts the reading cap on the very element the dialog opens, and puts it back on close", async () => {
    const { container, button } = await drawn([{ type: "heading", text: "Quarterly" }, calc]);
    const board = container.querySelector(".hb-blocks")!;
    const card = container.querySelector(".hb-calc")!;
    expect(getComputedStyle(board).maxWidth).toBe("1100px");             // inline: the cap stands
    fireEvent.click(button);
    expect(getComputedStyle(board).maxWidth).toBe("none");               // expanded: the same node rides the wider column
    expect(getComputedStyle(card).maxWidth).toBe("720px");               // cards keep their caps when expanded
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getComputedStyle(board).maxWidth).toBe("1100px");             // closed: the cap returns with the inline view
    expect(getComputedStyle(card).maxWidth).toBe("720px");               // and the cards never moved
  });
});
