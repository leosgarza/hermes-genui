// Living Boards v1 (enhancement #9) at the mount: one address, one live view.
//
// The claims this file owns:
//  · the first tag of an id owns the live view; a later tag of the SAME id draws a pointer, never a second
//    renderer (exactly one .hb-blocks subtree exists no matter how many times the address is quoted);
//  · the owner's refetch updates the SAME mounted subtree in place — the element is the same element, a
//    calculator's half-dragged state rides through, and the version word moves from v1's absence to v2;
//  · a board that speaks a living word says it in a quiet row (address, version, reach-back buttons, links)
//    OUTSIDE .hb-blocks — an unsaid board grows no row at all;
//  · reach-back asks the door for the old version by number and for a linked board by address, and draws
//    what answers (negative control: a door that has no such thing says so quietly and the live board
//    stays exactly where it was).
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockActions, type Rest } from "./actions";
import { BlockTag } from "./BlockTag";
import * as boards from "../core/boardRoster";

afterEach(cleanup);

const HEAD = { type: "heading", "text": "Portfolio · Q4" };
const TEXT = { type: "text", "text": "three holdings, all up" };
const NVDA = { type: "text", "text": "plus NVDA" };
const calc = {
  type: "calculator",
  sliders: [{ name: "p", title: "Loan", max: 1000, value: 400 }],
  results: [{ label: "Half", formula: "p / 2" }],
};
const stored = (blocks: unknown[], envelope: Record<string, unknown> = {}) => ({
  ...envelope, blocks, stored: { ...envelope, blocks },
});

const V1 = stored([calc, HEAD, TEXT]);
const V2 = stored([calc, HEAD, TEXT, NVDA], { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });

describe("one address, one live view", () => {
  it("the second tag of an address is a pointer: exactly one board subtree on the page", async () => {
    const load = vi.fn(async () => V1);
    const first = render(<BlockTag id="7f3a09bc" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const second = render(<BlockTag id="7f3a09bc" streaming={false} load={vi.fn(async () => V2)} />);
    await waitFor(() => expect(second.container.querySelector(".hb-live-pointer")).toBeTruthy());
    expect(document.querySelectorAll(".hb-blocks")).toHaveLength(1);
    expect(second.container.textContent).toContain("#7f3a09bc");
    expect(second.container.querySelector(".hb-blocks")).toBeNull();  // the pointer draws no board
  });

  it("the pointer says the version the live view learned (roster meta, not its own fetch)", async () => {
    const load = vi.fn(async () => V2);
    render(<BlockTag id="7f3a09bc" streaming={false} load={load} />);
    const second = render(<BlockTag id="7f3a09bc" streaming={false} load={vi.fn()} />);
    await waitFor(() => expect(second.container.textContent).toContain("v2"));
  });

  it("the owner refetches when a later tag quotes the address, updating the SAME subtree in place", async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(V1)
      .mockResolvedValueOnce(V2);
    const first = render(<BlockTag id="7f3a09bc" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const boardEl = first.container.querySelector(".hb-blocks")!;
    (boardEl as HTMLElement & { __seen?: boolean }).__seen = true;  // a mark a re-mount could never survive
    // the reader has the calculator half-touched: change a slider, then let the update turn land
    const slider = boardEl.querySelector("input[type=range]") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "700" } });
    render(<BlockTag id="7f3a09bc" streaming={false} load={vi.fn(async () => V2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    // same element, updated in place: the mark survives, the calculator's live value survives, one renderer
    const after = first.container.querySelector(".hb-blocks")!;
    expect((after as HTMLElement & { __seen?: boolean }).__seen).toBe(true);
    expect(after.querySelector("input[type=range]")!.getAttribute("value") ??
      (after.querySelector("input[type=range]") as HTMLInputElement).value).toBeTruthy();
    expect((after.querySelector("input[type=range]") as HTMLInputElement).value).toBe("700");
    expect(document.querySelectorAll(".hb-blocks")).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(2);  // v1 on mount, v2 on the poke
  });

  it("the claim passes to a pointer when the owner unmounts (no orphaned board)", async () => {
    const load = vi.fn(async () => V2);
    const first = render(<BlockTag id="7f3a09bc" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const second = render(<BlockTag id="7f3a09bc" streaming={false} load={load} />);
    await waitFor(() => expect(second.container.querySelector(".hb-live-pointer")).toBeTruthy());
    first.unmount();
    await waitFor(() => expect(second.container.querySelector(".hb-blocks")).toBeTruthy());
    expect(second.container.querySelector(".hb-live-pointer")).toBeNull();
    expect(document.querySelectorAll(".hb-blocks")).toHaveLength(1);
  });

  it("two conversations open at once never pointer each other (session scope; the #8 host shape)", async () => {
    const load = vi.fn(async () => V1);
    const a = render(
      <BlockActions.Provider value={{ send: vi.fn(), fill: vi.fn(), sessionScope: "chat-old" }}>
        <BlockTag id="7f3a09bc" streaming={false} load={load} />
      </BlockActions.Provider>,
    );
    const b = render(
      <BlockActions.Provider value={{ send: vi.fn(), fill: vi.fn(), sessionScope: "chat-new" }}>
        <BlockTag id="7f3a09bc" streaming={false} load={load} />
      </BlockActions.Provider>,
    );
    await waitFor(() => expect(a.container.querySelector(".hb-blocks")).toBeTruthy());
    await waitFor(() => expect(b.container.querySelector(".hb-blocks")).toBeTruthy());
    expect(a.container.querySelector(".hb-live-pointer")).toBeNull();
    expect(b.container.querySelector(".hb-live-pointer")).toBeNull();
  });
});

describe("an update that SHIFTS blocks keeps their live state (review round 1, defect 1)", () => {
  // The hard rule: update-in-place is a layout/state change of the SAME subtree. Appending one block
  // after an interactive one is the easy case; the defect class is an insertion or reordering that
  // moves a live block to a new position — its slider answer, typed form text and open state must ride
  // the update on the very same DOM element, or the reader loses half an edit. Keys must therefore
  // speak the block's own content, never its slot number.
  const FORM = {
    type: "form", title: "Plan it", submit: "Send",
    fields: [{ id: "note", type: "text", label: "Anything to slip in?" }],
  };
  const DEEP = (v: unknown) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;

  it("a heading inserted BEFORE the calculator keeps its dragged value on the same input element", async () => {
    // exactly the reviewer's probe: v1 [calc, HEAD, TEXT], the reader moves the slider to 700, the
    // update lands [HEAD, calc, TEXT, NVDA] at the same address — calc shifts index 0 → 1.
    const V2 = stored([DEEP(HEAD), DEEP(calc), DEEP(TEXT), DEEP(NVDA)],
      { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const load = vi.fn().mockResolvedValueOnce(V1).mockResolvedValueOnce(V2);
    const first = render(<BlockTag id="7f3a09bd" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const slider = first.container.querySelector("input[type=range]") as HTMLInputElement;
    (slider as HTMLElement & { __seen?: boolean }).__seen = true;  // a mark only THIS element carries
    fireEvent.change(slider, { target: { value: "700" } });
    expect((slider.value === "700" ? first.container.textContent : "").includes("350")).toBe(true);
    render(<BlockTag id="7f3a09bd" streaming={false} load={vi.fn(async () => V2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    const after = first.container.querySelector("input[type=range]") as HTMLInputElement;
    // the interactive element itself — not merely the board container — survived the shift
    expect(after).toBe(slider);
    expect((after as HTMLElement & { __seen?: boolean }).__seen).toBe(true);
    expect(after.value).toBe("700");
    expect(first.container.querySelector(".hb-calc-result-value")!.textContent).toBe("350");
    expect(document.querySelectorAll(".hb-blocks")).toHaveLength(1);
  });

  it("a REORDER of the whole list keeps the calculator dragged and the form typed, on their elements", async () => {
    const V2 = stored([DEEP(NVDA), DEEP(TEXT), DEEP(FORM), DEEP(calc), DEEP(HEAD)],
      { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const v1 = stored([calc, FORM, HEAD]);
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(V2);
    const first = render(<BlockTag id="7f3a09be" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const slider = first.container.querySelector("input[type=range]") as HTMLInputElement;
    const typed = first.container.querySelector("input.hb-input[type=text]") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "700" } });
    fireEvent.change(typed, { target: { value: "two cats, one tent" } });
    render(<BlockTag id="7f3a09be" streaming={false} load={vi.fn(async () => V2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    expect(first.container.querySelector("input[type=range]")).toBe(slider);
    expect(slider.value).toBe("700");
    expect(first.container.querySelector("input.hb-input[type=text]")).toBe(typed);
    expect(typed.value).toBe("two cats, one tent");
    expect(document.querySelectorAll(".hb-blocks")).toHaveLength(1);
  });

  it("a REORDER keeps checklist ticks and an opened tab alive on their elements", async () => {
    // the reviewer named these three: typed slider value, checklist ticks, tab selection. The whole
    // board permutes — every block lands in a different slot — and every live block stays the live
    // element it was, carrying its taps. (Checklist and form carry a positional `path` the reader
    // stamps on them; identity must speak the block's words, never the slot that stamp came from.)
    const CHECK = { type: "checklist", title: "Pack", items: [{ text: "Rope" }, { text: "Tent" }] };
    const TABS = { type: "tabs", tabs: [
      { label: "Rent", children: [DEEP(TEXT)] },
      { label: "Buy", children: [DEEP(HEAD)] },
    ] };
    const v1 = stored([CHECK, TABS, calc]);
    const V2 = stored([calc, NVDA, TABS, CHECK]);   // every slot moved, a block inserted
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(V2);
    const first = render(<BlockTag id="7f3a09c0" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const check = first.container.querySelectorAll("button[role=checkbox]")[1] as HTMLElement;
    const tabs = first.container.querySelectorAll("[role=tab]");
    fireEvent.click(check);
    fireEvent.click(tabs[1]);
    expect(check.classList.contains("hb-check-on")).toBe(true);
    expect((tabs[1] as HTMLElement).getAttribute("aria-selected")).toBe("true");
    (check as HTMLElement & { __seen?: boolean }).__seen = true;
    render(<BlockTag id="7f3a09c0" streaming={false} load={vi.fn(async () => V2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    const after = first.container.querySelectorAll("button[role=checkbox]")[1] as HTMLElement;
    expect(after).toBe(check);                                     // the same element rode the shift
    expect((after as HTMLElement & { __seen?: boolean }).__seen).toBe(true);
    expect(after.classList.contains("hb-check-on")).toBe(true);    // and still carries its tick
    expect(first.container.querySelector(".hb-checklist-count")!.textContent).toBe("1 of 2 done");
    const afterTabs = first.container.querySelectorAll("[role=tab]");
    expect((afterTabs[1] as HTMLElement).getAttribute("aria-selected")).toBe("true");
    expect(first.container.textContent).toContain("Portfolio · Q4");  // the picked panel still drawn
    expect(document.querySelectorAll(".hb-blocks")).toHaveLength(1);
  });

  it("a block whose own words CHANGED redraws with those new words (the honest boundary)", async () => {
    // the other half of the rule: content-identity keys mean a CHANGED block is a new block — it draws
    // fresh from its stored numbers, it is not frozen at whatever the reader had dragged.
    const moved = { ...DEEP(calc), sliders: [{ name: "p", title: "Loan", max: 1000, value: 500 }] };
    const V2 = stored([moved, DEEP(HEAD), DEEP(TEXT), DEEP(NVDA)],
      { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const load = vi.fn().mockResolvedValueOnce(V1).mockResolvedValueOnce(V2);
    const first = render(<BlockTag id="7f3a09bf" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const slider = first.container.querySelector("input[type=range]") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "700" } });
    render(<BlockTag id="7f3a09bf" streaming={false} load={vi.fn(async () => V2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    const after = first.container.querySelector("input[type=range]") as HTMLInputElement;
    expect(after.value).toBe("500");  // the board's new word won, as it must
  });
});

describe("NESTED interactive state rides a container's update (review round 2, defect 1)", () => {
  // The rule at depth: a container's identity is the container's OWN words, never its children's.
  // A block inside a tabs panel, a column, a section, a grid cell or a row keeps its mounted element
  // (and every dragged slider, typed draft and clicked tick on it) through a sibling's content change,
  // a sibling's layout change, an insertion or a reorder ANYWHERE inside the container. Hashing a
  // container including its descendants re-keys the whole subtree the moment one child moves, which
  // is the defect this block pins; the top-level shift tests above only covered the flat list.
  const DEEP = (v: unknown) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;

  const tabsBoard = (text: unknown) => ([
    { type: "tabs", tabs: [
      { label: "Holdings", children: [DEEP(calc), DEEP(text)] },
      { label: "Notes", children: [{ type: "heading", text: "Fine print" }] },
    ] },
  ]);

  it("a calculator inside a TABS panel survives its sibling's words changing (the reviewer's probe)", async () => {
    const v1 = stored(tabsBoard(TEXT));
    const v2 = stored(tabsBoard(NVDA), { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="7f3a09d0" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const slider = first.container.querySelector("input[type=range]") as HTMLInputElement;
    (slider as HTMLElement & { __seen?: boolean }).__seen = true;
    fireEvent.change(slider, { target: { value: "700" } });
    render(<BlockTag id="7f3a09d0" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    const after = first.container.querySelector("input[type=range]") as HTMLInputElement;
    expect(after).toBe(slider);                    // the SAME nested element rode the sibling's update
    expect((after as HTMLElement & { __seen?: boolean }).__seen).toBe(true);
    expect(after.value).toBe("700");               // and still carries the dragged answer
    expect(first.container.querySelector(".hb-calc-result-value")!.textContent).toBe("350");
    expect(document.querySelectorAll(".hb-blocks")).toHaveLength(1);
  });

  it("the opened TAB itself is still lit when a panel's sibling text updates", async () => {
    const v1 = stored(tabsBoard(TEXT));
    const v2 = stored(tabsBoard(NVDA), { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="7f3a09d1" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelectorAll("[role=tab]").length).toBe(2));
    fireEvent.click(first.container.querySelectorAll("[role=tab]")[1]);
    expect((first.container.querySelectorAll("[role=tab]")[1] as HTMLElement).getAttribute("aria-selected")).toBe("true");
    render(<BlockTag id="7f3a09d1" streaming={false} load={vi.fn(async () => v2)} />);
    // the update lands (the live row is drawn OUTSIDE the panels — it is what the hidden picked
    // panel can honestly prove without needing the unlit tab's words on screen)
    await waitFor(() => expect(first.container.querySelector(".hb-live")?.textContent).toContain("v2"));
    const tabs = first.container.querySelectorAll("[role=tab]");
    expect((tabs[1] as HTMLElement).getAttribute("aria-selected")).toBe("true");  // Tabs' own state survived
    expect(first.container.textContent).toContain("Fine print");                  // the picked panel still drawn
  });

  it("a new TAB added beside a live calculator keeps it mounted and lit", async () => {
    const v1 = stored(tabsBoard(TEXT));
    const grown = tabsBoard(TEXT)[0] as Record<string, unknown>;
    const v2 = stored([{ ...DEEP(grown), tabs: [...(grown.tabs as unknown[]),
      { label: "Charts", children: [{ type: "text", text: "a fresh panel" }] }] }],
    { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="7f3a09d2" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const slider = first.container.querySelector("input[type=range]") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "700" } });
    render(<BlockTag id="7f3a09d2" streaming={false} load={vi.fn(async () => v2)} />);
    // the tab BAR grew (only the picked panel draws, so the bar is what proves the new tab landed)
    await waitFor(() => expect(first.container.querySelectorAll("[role=tab]").length).toBe(3));
    expect(first.container.textContent).toContain("Charts");
    expect(first.container.querySelector("input[type=range]")).toBe(slider);
    expect(slider.value).toBe("700");
    expect(first.container.querySelectorAll("[role=tab]")[0].getAttribute("aria-selected")).toBe("true");
  });

  it("a sibling's words change inside COLUMNS, SECTION and GRID keeps the calculator mounted", async () => {
    // (row flattens a wide child like the calculator — its cell-key proof is the dedicated REORDER test)
    const kinds: Record<string, (t: unknown) => unknown[]> = {
      columns: (t) => [{ type: "columns", children: [DEEP(calc), DEEP(t)] }],
      section: (t) => [{ type: "section", title: "Deep", children: [DEEP(calc), DEEP(t)] }],
      grid: (t) => [{ type: "grid", children: [DEEP(calc), DEEP(t)] }],
    };
    for (const [name, make] of Object.entries(kinds)) {
      const v1 = stored(make(TEXT) as unknown[]);
      const v2 = stored(make(NVDA) as unknown[], { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
      const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
      const first = render(<BlockTag id="7f3a09d3" streaming={false} load={load} />);
      await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
      const slider = first.container.querySelector("input[type=range]") as HTMLInputElement;
      (slider as HTMLElement & { __seen?: string }).__seen = name;
      fireEvent.change(slider, { target: { value: "700" } });
      render(<BlockTag id="7f3a09d3" streaming={false} load={vi.fn(async () => v2)} />);
      await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
      const after = first.container.querySelector("input[type=range]") as HTMLInputElement;
      expect(`${name}:${after === slider}`, name).toBe(`${name}:true`);
      expect(`${name}:${(after as HTMLElement & { __seen?: string }).__seen}`, name).toBe(`${name}:${name}`);
      expect(`${name}:${after.value}`, name).toBe(`${name}:700`);
      first.unmount();
      cleanup();
    }
  });

  it("a HEADING INSERTED BEFORE the calculator inside a grid keeps it on its element (cells ride too)", async () => {
    const v1 = stored([{ type: "grid", children: [DEEP(calc), DEEP(TEXT)] }]);
    const v2 = stored([{ type: "grid", children: [DEEP(HEAD), DEEP(calc), DEEP(TEXT)] }],
      { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="7f3a09d4" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const slider = first.container.querySelector("input[type=range]") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "700" } });
    render(<BlockTag id="7f3a09d4" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("Portfolio · Q4"));
    const after = first.container.querySelector("input[type=range]") as HTMLInputElement;
    expect(after).toBe(slider);
    expect(after.value).toBe("700");
    // the inserted heading sits in its OWN cell before it — the layout really changed around the survivor
    expect(first.container.querySelectorAll(".hb-grid-cell").length).toBe(3);
    expect(first.container.querySelector(".hb-grid-cell")!.textContent).toContain("Portfolio · Q4");
  });

  it("a REORDER inside a row carries each block's cell along with it", async () => {
    // the row FLATTENS when it holds a wide block (read.ts), so this cell-key proof rides on plain
    // text children — the survivor here is the mounted DOM node itself, which is the same thing a
    // calculator's typed state lives on. A row keyed by its whole content (or cells keyed by slot
    // number) remounts both texts when the list swaps.
    const A = { type: "text", text: "alpha" };
    const B = { type: "text", text: "beta" };
    const v1 = stored([{ type: "row", children: [DEEP(A), DEEP(B)] }]);
    const v2 = stored([{ type: "row", children: [DEEP(B), DEEP(A)] }],
      { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="7f3a09d5" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-row-cell")).toBeTruthy());
    const aCell = first.container.querySelectorAll(".hb-row-cell")[0] as HTMLElement;
    (aCell as HTMLElement & { __seen?: boolean }).__seen = true;
    render(<BlockTag id="7f3a09d5" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.querySelector(".hb-live")?.textContent).toContain("v2"));
    const cells = first.container.querySelectorAll(".hb-row-cell");
    expect(cells.length).toBe(2);
    expect(cells[1]).toBe(aCell);                                   // the cell moved WITH its block
    expect((cells[1] as HTMLElement & { __seen?: boolean }).__seen).toBe(true);
    expect(cells[1].textContent).toBe("alpha");
    expect(cells[0].textContent).toBe("beta");
  });

  it("a sibling gaining an ALIGN ask (a wrapper change beside the block) keeps the calculator alive", async () => {
    const v1 = stored([{ type: "columns", children: [DEEP(calc), DEEP(TEXT)] }]);
    const v2 = stored([{ type: "columns", children: [DEEP(calc), { ...DEEP(NVDA), align: "center" }] }],
      { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="7f3a09d6" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const slider = first.container.querySelector("input[type=range]") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "700" } });
    render(<BlockTag id="7f3a09d6" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    expect(first.container.querySelector("input[type=range]")).toBe(slider);
    expect(slider.value).toBe("700");
    expect(first.container.querySelector(".hb-place-center")).toBeTruthy();  // the sibling really wrapped
  });

  it("a block's OWN wrapper word moving (center to right) is the same block on the same element", async () => {
    // #6 placement words move a wrapper's class, never the block's content: an unchanged-content block
    // that only changes where it sits keeps its dragged value.
    const v1 = stored([{ ...DEEP(calc), align: "center" }, DEEP(TEXT)]);
    const v2 = stored([{ ...DEEP(calc), align: "right" }, DEEP(TEXT)],
      { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="7f3a09d7" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const slider = first.container.querySelector("input[type=range]") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "700" } });
    render(<BlockTag id="7f3a09d7" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.querySelector(".hb-place-right")).toBeTruthy());
    expect(first.container.querySelector("input[type=range]")).toBe(slider);
    expect(slider.value).toBe("700");
  });

  it("the board's own look words (density, palette, motion — #7 wrappers) never disturb a live block", async () => {
    const v1 = stored([DEEP(calc), DEEP(TEXT)]);
    const v2 = stored([DEEP(calc), DEEP(TEXT)],
      { version: 2, updated_at: "2026-11-19T21:00:00+00:00", density: "compact", palette: "cool", motion: "reduced" });
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="7f3a09d8" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const slider = first.container.querySelector("input[type=range]") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "700" } });
    render(<BlockTag id="7f3a09d8" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")!.getAttribute("data-density")).toBe("compact"));
    expect(first.container.querySelector("input[type=range]")).toBe(slider);
    expect(slider.value).toBe("700");
  });

  it("a FORM typed inside a section keeps its draft when a block outside the section changes", async () => {
    const FORM = { type: "form", title: "Plan it", submit: "Send",
      fields: [{ id: "note", type: "text", label: "Anything to slip in?" }] };
    const v1 = stored([{ type: "section", title: "Trip", children: [DEEP(FORM), DEEP(TEXT)] }, DEEP(HEAD)]);
    const v2 = stored([{ type: "section", title: "Trip", children: [DEEP(FORM), DEEP(TEXT)] }, DEEP(NVDA)],
      { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="7f3a09d9" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const typed = first.container.querySelector("input.hb-input[type=text]") as HTMLInputElement;
    fireEvent.change(typed, { target: { value: "two cats, one tent" } });
    render(<BlockTag id="7f3a09d9" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    expect(first.container.querySelector("input.hb-input[type=text]")).toBe(typed);
    expect(typed.value).toBe("two cats, one tent");
  });

  it("CHECKLIST ticks inside a tabs panel ride the sibling's content change", async () => {
    const CHECK = { type: "checklist", title: "Pack", items: [{ text: "Rope" }, { text: "Tent" }] };
    // two usable panels: a lone labelled tab is flattened in place by the reader (readTabs).
    const v1 = stored([{ type: "tabs", tabs: [
      { label: "Rent", children: [DEEP(CHECK), DEEP(TEXT)] },
      { label: "Buy", children: [DEEP(HEAD)] },
    ] }]);
    const v2 = stored([{ type: "tabs", tabs: [
      { label: "Rent", children: [DEEP(CHECK), DEEP(NVDA)] },
      { label: "Buy", children: [DEEP(HEAD)] },
    ] }], { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="7f3a09da" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const check = first.container.querySelectorAll("button[role=checkbox]")[1] as HTMLElement;
    fireEvent.click(check);
    (check as HTMLElement & { __seen?: boolean }).__seen = true;
    render(<BlockTag id="7f3a09da" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    const after = first.container.querySelectorAll("button[role=checkbox]")[1] as HTMLElement;
    expect(after).toBe(check);
    expect((after as HTMLElement & { __seen?: boolean }).__seen).toBe(true);
    expect(after.classList.contains("hb-check-on")).toBe(true);
  });

  it("the boundary holds at depth: a calculator whose OWN numbers changed redraws, not frozen stale", async () => {
    const moved = { ...DEEP(calc), sliders: [{ name: "p", title: "Loan", max: 1000, value: 500 }] };
    const v1 = stored(tabsBoard(TEXT));
    const v2 = stored([{ type: "tabs", tabs: [
      { label: "Holdings", children: [moved, DEEP(TEXT)] },
      { label: "Notes", children: [{ type: "heading", text: "Fine print" }] },
    ] }], { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="7f3a09db" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const slider = first.container.querySelector("input[type=range]") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "700" } });
    render(<BlockTag id="7f3a09db" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.querySelector(".hb-calc-result-value")!.textContent).toBe("250"));
    expect((first.container.querySelector("input[type=range]") as HTMLInputElement).value).toBe("500");
  });

  it("two same-titled sections with different children coexist: the ordinal tells them apart", async () => {
    // containers now share an identity when their OWN words match (children name themselves), so the
    // per-identity occurrence ordinal must keep two such twins distinct siblings — no dup key, no crash.
    const twin = (t: unknown) => ({ type: "section", title: "Same", children: [DEEP(t)] });
    const v1 = stored([twin(calc), twin(TEXT)]);
    const v2 = stored([twin(calc), twin(NVDA)],
      { version: 2, updated_at: "2026-11-19T21:00:00+00:00" });
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="7f3a09dc" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelectorAll(".hb-section").length).toBe(2));
    const slider = first.container.querySelector("input[type=range]") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "700" } });
    render(<BlockTag id="7f3a09dc" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    expect(first.container.querySelectorAll(".hb-section").length).toBe(2);
    expect(first.container.querySelector("input[type=range]")).toBe(slider);  // the calc twin rode through
    expect(slider.value).toBe("700");
  });
});

describe("the live row and the unsaid board", () => {
  it("an unsaid board grows no live row, no pointer and no new attributes", async () => {
    const { container } = render(<BlockTag id="7f3a09bc" streaming={false} load={async () => V1} />);
    await waitFor(() => expect(container.querySelector(".hb-blocks")).toBeTruthy());
    expect(container.querySelector(".hb-live")).toBeNull();
    expect(container.querySelector(".hb-live-pointer")).toBeNull();
  });

  it("a versioned board says v2, its address and its date; reach-back buttons appear with the door", async () => {
    const rest = vi.fn(async () => ({}));
    const { container } = render(
      <BlockActions.Provider value={{ send: vi.fn(), fill: vi.fn(), rest }}>
        <BlockTag id="7f3a09bc" streaming={false} load={async () => V2} />
      </BlockActions.Provider>,
    );
    await waitFor(() => expect(container.querySelector(".hb-live")).toBeTruthy());
    expect(container.textContent).toContain("v2");
    expect(container.textContent).toContain("#7f3a09bc");
    expect(container.textContent).toContain("2026-11-19");
    expect(container.querySelector(".hb-live-history")).toBeTruthy();  // the v1 ↩ button exists
  });

  it("reach-back asks the door for the old version and draws it; current comes back", async () => {
    const rest = vi.fn(async (path: string) => (path.includes("version=1") ? V1 : {}));
    const { container } = render(
      <BlockActions.Provider value={{ send: vi.fn(), fill: vi.fn(), rest }}>
        <BlockTag id="7f3a09bc" streaming={false} load={async () => V2} />
      </BlockActions.Provider>,
    );
    await waitFor(() => expect(container.textContent).toContain("plus NVDA"));
    fireEvent.click(container.querySelector(".hb-live-history")!);
    expect(rest).toHaveBeenCalledWith("/blocks/7f3a09bc?version=1");
    await waitFor(() => expect(container.textContent).toContain("three holdings, all up"));
    expect(container.textContent).not.toContain("plus NVDA");        // v2's words are off screen, still stored
    expect(container.textContent).toContain("viewing v1");
    fireEvent.click(container.querySelector(".hb-live-back")!);
    await waitFor(() => expect(container.textContent).toContain("plus NVDA"));
    expect(container.textContent).toContain("v2");
  });

  it("a door with no such version keeps the live board drawn (negative control)", async () => {
    const rest = vi.fn(async () => { throw new Error("404"); });
    const { container } = render(
      <BlockActions.Provider value={{ send: vi.fn(), fill: vi.fn(), rest }}>
        <BlockTag id="7f3a09bc" streaming={false} load={async () => V2} />
      </BlockActions.Provider>,
    );
    await waitFor(() => expect(container.textContent).toContain("plus NVDA"));
    fireEvent.click(container.querySelector(".hb-live-history")!);
    await waitFor(() => expect(container.textContent).toContain("plus NVDA"));  // never blanked
  });
});

describe("links: reach-back by address", () => {
  const Q3 = { type: "heading", text: "Portfolio · Q3" };
  const LINKED = stored([Q3], { version: 1 });

  it("a chip opens the linked board fetched whole from the door, attributed to its own id", async () => {
    const rest = vi.fn(async (path: string) => (path === "/blocks/a1b2c3d4"
      ? stored([Q3]) : {}));
    const board = stored([HEAD, TEXT], { links: [{ id: "a1b2c3d4", note: "last quarter" }] });
    const { container } = render(
      <BlockActions.Provider value={{ send: vi.fn(), fill: vi.fn(), rest }}>
        <BlockTag id="7f3a09bc" streaming={false} load={async () => board} />
      </BlockActions.Provider>,
    );
    await waitFor(() => expect(container.textContent).toContain("last quarter"));
    expect(container.querySelector(".hb-linked")).toBeNull();           // closed until asked
    fireEvent.click(container.querySelector(".hb-link-chip")!);
    expect(rest).toHaveBeenCalledWith("/blocks/a1b2c3d4");
    await waitFor(() => expect(container.querySelector(".hb-linked")).toBeTruthy());
    expect(container.querySelector(".hb-linked")!.textContent).toContain("Portfolio · Q3");
    expect(LINKED).toBeTruthy();  // (fixture kept referenced for clarity)
  });

  it("a linked board that is not on the machine says so quietly", async () => {
    const rest = vi.fn(async () => { throw new Error("404"); });
    const board = stored([HEAD], { links: [{ id: "dead0000" }] });
    const { container } = render(
      <BlockActions.Provider value={{ send: vi.fn(), fill: vi.fn(), rest }}>
        <BlockTag id="7f3a09bc" streaming={false} load={async () => board} />
      </BlockActions.Provider>,
    );
    await waitFor(() => expect(container.querySelector(".hb-link-chip")).toBeTruthy());
    fireEvent.click(container.querySelector(".hb-link-chip")!);
    await waitFor(() => expect(container.querySelector(".hb-linked-gone")).toBeTruthy());
    expect(container.textContent).toContain("#dead0000");
    expect(container.textContent).toContain("not a board on this machine");
  });

  it("a board with links but no version still says the links row (and no version word)", async () => {
    const rest = vi.fn(async () => ({}));
    const board = stored([HEAD], { links: ["a1b2c3d4"] });
    const { container } = render(
      <BlockActions.Provider value={{ send: vi.fn(), fill: vi.fn(), rest }}>
        <BlockTag id="7f3a09bc" streaming={false} load={async () => board} />
      </BlockActions.Provider>,
    );
    await waitFor(() => expect(container.querySelector(".hb-links")).toBeTruthy());
    expect(container.textContent).not.toContain("v2");
    expect(container.querySelector(".hb-live-addr")!.textContent).toBe("#7f3a09bc");
  });
});

describe("the roster", () => {
  it("hands the claim on release, and forgets the address when nobody is left", () => {
    const a = Symbol("a");
    const b = Symbol("b");
    expect(boards.claim("7f3a09bc", a)).toBe(true);
    expect(boards.claim("7f3a09bc", b)).toBe(false);
    expect(boards.owns("7f3a09bc", a)).toBe(true);
    boards.release("7f3a09bc", a);
    expect(boards.owns("7f3a09bc", b)).toBe(true);
    boards.release("7f3a09bc", b);
    expect(boards.claim("7f3a09bc", a)).toBe(true);  // free again — a fresh conversation starts clean
  });

  it("poke shouts only to the owner's channel; meta changes speak to plain subscribers", () => {
    const owner = Symbol("o");
    boards.claim("aaaaaaaa", owner);
    let poked = 0;
    let heard = 0;
    const offPoke = boards.onPoke("aaaaaaaa", () => { poked += 1; });
    const unsub = boards.subscribe("aaaaaaaa", () => { heard += 1; });
    boards.poke("aaaaaaaa");
    expect(poked).toBe(1);
    boards.setMeta("aaaaaaaa", { version: 3 });
    expect(heard).toBe(1);  // the owner's own meta word never looks like a new turn to it
    expect(poked).toBe(1);
    unsub();
    offPoke();
    boards.release("aaaaaaaa", owner);
  });
});

describe("round 4: placement flips and twin swaps carry the live subtree", () => {
  const DEEP = (v: unknown) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
  const stamped = (n: number) => ({ version: n, updated_at: `2026-11-19T2${n}:00:00+00:00` });
  const halfDragged = async (first: ReturnType<typeof render>) => {
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const slider = first.container.querySelector("input[type=range]")!;
    fireEvent.change(slider, { target: { value: "700" } });
    (slider as unknown as { __seen?: number }).__seen = 1;
    return slider;
  };

  it("align default→center is a class change, not a re-wrap: the slider rides through", async () => {
    // Review round 3, defect 1 (wrap): the model asks the LIVE calculator to sit centered. A block
    // that only changes where it sits is the same block on the same element.
    const v1 = stored([DEEP(calc), DEEP(HEAD), DEEP(TEXT)]);
    const v2 = stored([DEEP({ ...calc, align: "center" }), DEEP(HEAD), DEEP(NVDA)], stamped(2));
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="c0ffee01" streaming={false} load={load} />);
    await halfDragged(first);
    render(<BlockTag id="c0ffee01" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    const after = first.container.querySelector("input[type=range]") as HTMLInputElement;
    expect((after as unknown as { __seen?: number }).__seen).toBe(1);  // RED pre-fix: the wrap remounted
    expect(after.value).toBe("700");
    expect(after.closest(".hb-place[data-align=center]")).not.toBeNull();  // and the ask is really drawn
  });

  it("align center→default is the same class change unwrapped: the slider still rides through", async () => {
    // Round 3, defect 1 (unwrap): coming back from an ask to the default must not remount either.
    const v1 = stored([DEEP({ ...calc, align: "center" }), DEEP(HEAD), DEEP(TEXT)]);
    const v2 = stored([DEEP(calc), DEEP(HEAD), DEEP(NVDA)], stamped(2));
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="c0ffee02" streaming={false} load={load} />);
    await halfDragged(first);
    render(<BlockTag id="c0ffee02" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    const after = first.container.querySelector("input[type=range]") as HTMLInputElement;
    expect((after as unknown as { __seen?: number }).__seen).toBe(1);  // RED pre-fix: the unwrap remounted
    expect(after.value).toBe("700");
    expect(after.closest("[data-align]")).toBeNull();
  });

  it("swapping two same-titled sections carries the nested calculator (the reviewer's probe)", async () => {
    // Review round 3, defect 2, exactly: v1 [section('Same', calc), section('Same', text)];
    // v2 [section('Same', changed text), section('Same', calc)]. The calculator keeps its words —
    // its card is a logically retained container, so its dragged slider must survive the swap.
    const section = (t: unknown) => ({ type: "section", title: "Same", children: [t] });
    const v1 = stored([section(DEEP(calc)), section(DEEP(TEXT))]);
    const v2 = stored([section(DEEP(NVDA)), section(DEEP(calc))], stamped(2));
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="c0ffee03" streaming={false} load={load} />);
    await halfDragged(first);
    const sec = first.container.querySelector(".hb-section")!;  // v1's calculator card is the first one
    (sec as unknown as { __seen?: number }).__seen = 1;
    render(<BlockTag id="c0ffee03" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    const after = first.container.querySelector("input[type=range]") as HTMLInputElement;
    expect((after as unknown as { __seen?: number }).__seen).toBe(1);  // RED pre-fix: ordinal flip remounted
    expect(after.value).toBe("700");
    const moved = first.container.querySelectorAll(".hb-section")[1] as unknown as { __seen?: number };
    expect(moved.__seen).toBe(1);  // the card itself moved to the second slot on the SAME element
    expect(first.container.querySelectorAll(".hb-section")[0].textContent).toContain("plus NVDA");
  });

  it("twin sections whose children share kinds still swap by what they hold", async () => {
    // Same-titled containers, children of the same TYPE (two texts), contents swapped plus a fresh
    // twin: each retained card must keep the very element that drew it before.
    const A = { type: "text", text: "aaa" };
    const B = { type: "text", text: "bbb" };
    const C = { type: "text", text: "ccc" };
    const section = (t: unknown) => ({ type: "section", title: "Same", children: [t] });
    const v1 = stored([section(DEEP(A)), section(DEEP(B))]);
    const v2 = stored([section(DEEP(B)), section(DEEP(C))], stamped(2));
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="c0ffee04" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelectorAll(".hb-section")).toHaveLength(2));
    const bCard = first.container.querySelectorAll(".hb-section")[1];
    (bCard as unknown as { __seen?: number }).__seen = 1;
    render(<BlockTag id="c0ffee04" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("ccc"));
    const cards = [...first.container.querySelectorAll(".hb-section")];
    const bAfter = cards.find((s) => s.textContent?.includes("bbb"))!;
    expect((bAfter as unknown as { __seen?: number }).__seen).toBe(1);  // RED pre-fix: b moved into a's element
    expect(bAfter).toBe(cards[0]);  // …and 'bbb' now sits FIRST
  });
});

describe("round 5: state lives on the BOARD, not the element (Sol's disposition, reviewer cases 1 and 2)", () => {
  // React cannot carry a DOM node across parents, and a reopen draws a fresh tree from the stored
  // spec — so by Sol's binding round-5 disposition EVERY interactive answer (slider, typed form
  // text, checklist ticks, chosen tab) is filed on the board's state store under the block's
  // carried identity, and restored on every mount. Cases:
  //  · a block MOVED to another container keeps its dragged value (case 1 — remount restores);
  //  · ticks SAVED before an insertion come back after a full unmount + REOPEN at the address
  //    (case 2 — the door re-keys position→identity the moment the board takes an update);
  //  · never-updated boards keep filing by positional path exactly as #8 accepted.
  const DEEP = (v: unknown) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
  const CHECK = { type: "checklist", title: "Pack", items: [{ text: "Rope" }, { text: "Tent" }] };
  const CHECK2 = { type: "checklist", title: "Other", items: [{ text: "Map" }, { text: "Stove" }] };
  const FORM = { type: "form", title: "Plan it", submit: "Send",
    fields: [{ id: "note", type: "text", label: "Anything to slip in?" }] };
  const TABS = { type: "tabs", tabs: [
    { label: "Rent", children: [DEEP(TEXT)] },
    { label: "Buy", children: [DEEP(HEAD)] },
  ] };
  const section = (t: string, child: unknown) => ({ type: "section", title: t, children: [child] });
  const stamped = (n: number) => ({ version: n, updated_at: `2026-11-19T2${n}:00:00+00:00` });

  /** A real state door in a closure: ONE map PER ADDRESS (the shipped GET/PUT /blocks/<id>/state
   *  routes key the state by board id — sharing one map between boards is what the pre-round-7 mock
   *  did, and since round 7 files transient answers at edit time, that mock would let board B read
   *  board A's answer and the isolation case would fail against the mock, not against the app).
   *  PUT merges, GET answers the current whole object. */
  function stateDoor() {
    const doors = new Map<string, Record<string, unknown>>();
    const savedFor = (id: string): Record<string, unknown> => {
      let m = doors.get(id);
      if (m === undefined) { m = {}; doors.set(id, m); }
      return m;
    };
    const rest = vi.fn(async (path: string, init?: { method?: string; body?: unknown }) => {
      const at = /^\/blocks\/([0-9a-f]{8})\/state$/.exec(path);
      if (at === null) throw new Error(`mock door: ${path}`);
      const saved = savedFor(at[1]);
      if (init?.method === "PUT") {
        Object.assign(saved, (init.body as { state: Record<string, unknown> }).state);
        return {};
      }
      return { state: JSON.parse(JSON.stringify(saved)) as Record<string, unknown> };
    });
    return { rest, savedFor };
  }
  // The live view (the FIRST tag) answers the poke with its OWN load — so its loader is v1 once, v2
  // after (the r4 pattern); a later tag's loader only answers a claim takeover. Reopen uses v2.
  const seqLoad = (v1: unknown, v2: unknown) => {
    let n = 0;
    return vi.fn(async () => (++n === 1 ? v1 : v2));
  };
  const mountTag = (id: string, load: (id: string) => Promise<unknown>, rest?: Rest) => render(
    <BlockActions.Provider value={{ send: vi.fn(), fill: vi.fn(), ...(rest ? { rest } : {}) }}>
      <BlockTag id={id} streaming={false} load={load} />
    </BlockActions.Provider>,
  );
  const settle = async () => { await new Promise((r) => setTimeout(r, 30)); };

  it("case 1 (the reviewer's probe): a calculator MOVED between two sections restores its dragged 700", async () => {
    const v1 = stored([section("A", DEEP(calc)), section("B", DEEP(TEXT))]);
    const v2 = stored([section("A", DEEP(NVDA)), section("B", DEEP(calc))], stamped(2));
    const load = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = render(<BlockTag id="f5d00001" streaming={false} load={load} />);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const slider = first.container.querySelector("input[type=range]") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "700" } });
    render(<BlockTag id="f5d00001" streaming={false} load={vi.fn(async () => v2)} />);
    await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
    // the calculator moved from section A into section B: React must rebuild its element there,
    // and the board's stored answer must restore the drag on the fresh mount
    const after = first.container.querySelectorAll("input[type=range]");
    expect(after).toHaveLength(1);
    expect(first.container.querySelectorAll(".hb-section")[1]!.contains(after[0])).toBe(true);
    expect((after[0] as HTMLInputElement).value).toBe("700");   // RED pre-fix: a remount read 400
    expect(first.container.querySelector(".hb-calc-result-value")!.textContent).toBe("350");
    expect(document.querySelectorAll(".hb-blocks")).toHaveLength(1);
  });

  it("case 2 (the reviewer's probe): ticks saved before an insertion come back through a full REOPEN", async () => {
    const { rest, savedFor } = stateDoor();
    const id = "f5d00002";
    const v1 = stored([DEEP(CHECK)]);
    const v2 = stored([DEEP(HEAD), DEEP(CHECK)], stamped(2));
    const first = mountTag(id, seqLoad(v1, v2), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.click(first.container.querySelectorAll("button[role=checkbox]")[0]);
    // the never-updated board files positionally, exactly as #8 accepted
    await waitFor(() => expect(savedFor(id)["0"]).toEqual([0]));
    const second = mountTag(id, vi.fn(async () => v2), rest);   // the turn lands: it pokes the live view
    await waitFor(() => expect(first.container.textContent).toContain("Portfolio · Q4"));
    expect(first.container.querySelectorAll("button[role=checkbox]")[0]!.className).toContain("hb-check-on");
    second.unmount();
    first.unmount();                                          // the whole chat scrolls the board away
    const again = mountTag(id, vi.fn(async () => v2), rest);   // reopened at the same address
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    const ticked = again.container.querySelectorAll("button[role=checkbox]")[0]!.className;
    expect(ticked).toContain("hb-check-on");                  // RED pre-fix: it read the vacated path "1"
    again.unmount();
  });

  it("a DIFFERENT checklist that takes the vacated position never inherits the retained one's ticks", async () => {
    const { rest, savedFor } = stateDoor();
    const id = "f5d00003";
    const v1 = stored([DEEP(CHECK)]);
    const v2 = stored([DEEP(CHECK2), DEEP(CHECK)], stamped(2));
    const first = mountTag(id, seqLoad(v1, v2), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.click(first.container.querySelectorAll("button[role=checkbox]")[0]);
    await waitFor(() => expect(savedFor(id)["0"]).toEqual([0]));
    const second = mountTag(id, vi.fn(async () => v2), rest);
    await waitFor(() => expect(first.container.textContent).toContain("Map"));
    second.unmount();
    first.unmount();
    const again = mountTag(id, vi.fn(async () => v2), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    const boxes = again.container.querySelectorAll("button[role=checkbox]");
    // boxes 0,1 = CHECK2 (never ticked); boxes 2,3 = CHECK (item 0 ticked)
    expect(boxes[0]!.className).not.toContain("hb-check-on");
    expect(boxes[1]!.className).not.toContain("hb-check-on");
    expect(boxes[2]!.className).toContain("hb-check-on");
    expect(boxes[3]!.className).not.toContain("hb-check-on");
    again.unmount();
  });

  it("two boards at two addresses never share an interactive answer (isolation)", async () => {
    const { rest } = stateDoor();
    const a = mountTag("f5d00004", vi.fn(async () => stored([DEEP(calc)])), rest);
    await waitFor(() => expect(a.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.change(a.container.querySelector("input[type=range]")!, { target: { value: "700" } });
    const b = mountTag("f5d00005", vi.fn(async () => stored([DEEP(calc)])), rest);
    await waitFor(() => expect(b.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    expect((b.container.querySelector("input[type=range]") as HTMLInputElement).value).toBe("400");
    expect((a.container.querySelector("input[type=range]") as HTMLInputElement).value).toBe("700");
    b.unmount(); a.unmount();
  });

  it("a genuinely CHANGED block still redraws its own new words after a reopen (the 500-honesty boundary)", async () => {
    const { rest } = stateDoor();
    const moved = { ...DEEP(calc), sliders: [{ name: "p", title: "Loan", max: 1000, value: 500 }] };
    const first = mountTag("f5d00006", seqLoad(stored([DEEP(calc)]), stored([moved], stamped(2))), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.change(first.container.querySelector("input[type=range]")!, { target: { value: "700" } });
    const second = mountTag("f5d00006", vi.fn(async () => stored([moved], stamped(2))), rest);   // lands via poke
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")!.textContent).toContain("500"));
    expect((first.container.querySelector("input[type=range]") as HTMLInputElement).value).toBe("500");
    second.unmount(); first.unmount();
    const again = mountTag("f5d00006", vi.fn(async () => stored([moved], stamped(2))), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    expect((again.container.querySelector("input[type=range]") as HTMLInputElement).value).toBe("500");
    again.unmount();
  });

  // THE COMPLETE MATRIX (Sol, round 5): structural transformations × interactive kinds × persistence
  // {in-place update, reopen}. Every cell asserts the ANSWER survived, never a node identity.
  const KINDS = [
    { name: "slider", block: () => DEEP(calc),
      seed: (c: HTMLElement) => fireEvent.change(c.querySelector("input[type=range]")!, { target: { value: "700" } }),
      assert: (c: HTMLElement, where: string) => {
        const el = c.querySelectorAll("input[type=range]");
        expect(`${where}:${el.length}`, where).toBe(`${where}:1`);
        expect(`${where}:${(el[0] as HTMLInputElement).value}`, where).toBe(`${where}:700`);
      } },
    { name: "form", block: () => DEEP(FORM),
      seed: (c: HTMLElement) => fireEvent.change(c.querySelector("input.hb-input[type=text]")!, { target: { value: "two cats, one tent" } }),
      assert: (c: HTMLElement, where: string) => {
        const el = c.querySelectorAll("input.hb-input[type=text]");
        expect(`${where}:${(el[0] as HTMLInputElement).value}`, where).toBe(`${where}:two cats, one tent`);
      } },
    { name: "checklist", block: () => DEEP(CHECK),
      seed: (c: HTMLElement) => fireEvent.click(c.querySelectorAll("button[role=checkbox]")[1]),
      assert: (c: HTMLElement, where: string) => {
        const el = c.querySelectorAll("button[role=checkbox]");
        expect(`${where}:${el[1]!.className}`, where).toContain("hb-check-on");
        expect(`${where}:${el[0]!.className}`, where).not.toContain("hb-check-on");
      } },
    { name: "tab", block: () => DEEP(TABS),
      seed: (c: HTMLElement) => fireEvent.click(c.querySelectorAll("[role=tab]")[1]),
      assert: (c: HTMLElement, where: string) => {
        const el = c.querySelectorAll("[role=tab]");
        expect(`${where}:${(el[1] as HTMLElement).getAttribute("aria-selected")}`, where).toBe(`${where}:true`);
        expect(`${where}:${c.querySelector(".hb-tab-panel")!.textContent}`, where).toContain("Portfolio · Q4");
      } },
  ];
  const XFORMS: { name: string; tabsNest?: boolean; v1: (b: unknown) => unknown[]; v2: (b: unknown) => unknown[] }[] = [
    { name: "insert-before", v1: (b) => [b, DEEP(TEXT)], v2: (b) => [DEEP(HEAD), b, DEEP(TEXT), DEEP(NVDA)] },
    { name: "delete-before", v1: (b) => [DEEP(TEXT), DEEP(HEAD), b], v2: (b) => [DEEP(HEAD), b, DEEP(NVDA)] },
    { name: "reorder", v1: (b) => [b, DEEP(HEAD), DEEP(TEXT)], v2: (b) => [DEEP(NVDA), b, DEEP(HEAD)] },
    { name: "cross-container-move", tabsNest: true,
      v1: (b) => [section("A", b), section("B", DEEP(TEXT))],
      v2: (b) => [section("A", DEEP(NVDA)), section("B", b)] },
    { name: "placement-wrap", v1: (b) => [b, DEEP(TEXT)], v2: (b) => [{ ...b as object, align: "center" }, DEEP(TEXT), DEEP(NVDA)] },
    { name: "sibling-content", v1: (b) => [b, DEEP(TEXT)], v2: (b) => [b, DEEP(NVDA)] },
    { name: "twin-swap", tabsNest: true, v1: (b) => [section("Same", b), section("Same", DEEP(TEXT))],
      v2: (b) => [section("Same", DEEP(NVDA)), section("Same", b)] },
  ];
  let cell = 0;
  for (const x of XFORMS) {
    for (const kind of KINDS) {
      // the reader flattens tabs nested below top level (readTabs), so a tabs block literally
      // cannot sit inside a section — the move and twin-swap cells have no drawable board for it
      // (the tab's structural shift rides the reorder and insert cells). Every other cell runs.
      if (x.tabsNest && kind.name === "tab") continue;
      it(`matrix ${x.name} × ${kind.name}: survives the update AND the reopen`, async () => {
        const { rest, savedFor } = stateDoor();
        const id = `f5d1${String(cell++).padStart(4, "0")}`;
        const v1 = stored(x.v1(kind.block()));
        const v2 = stored(x.v2(kind.block()), stamped(2));
        const first = mountTag(id, seqLoad(v1, v2), rest);
        await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
        kind.seed(first.container);
        const second = mountTag(id, vi.fn(async () => v2), rest);
        await waitFor(() => expect(first.container.textContent).toContain("plus NVDA"));
        await settle();
        kind.assert(first.container, "update");                       // in-place cell
        second.unmount();
        first.unmount();
        const again = mountTag(id, vi.fn(async () => v2), rest);
        await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
        await settle();
        kind.assert(again.container, "reopen");                       // persisted cell
        again.unmount();
        expect(Object.keys(savedFor(id)).some((k) => k.startsWith("k:"))).toBe(true);  // filed by identity
      });
    }
  }
});
