// The export affordance is host chrome (enhancement #6): EVERY exportable block — charts of both kinds and
// tables, at any depth the drawing shows them — carries a corner button that is ALWAYS in the DOM and in the
// tab order (invisible until lit, focusable all the time: a keyboard reader reaches a non-interactive chart's
// export without a mouse), and the board menu writes JSON from the envelope the page already holds and
// Markdown from the ONE host writer (GET /blocks/<id>/markdown?version=N — asked ONCE, answered verbatim,
// always VERSIONED: the version the current drawing committed with, never "whatever the host is on now").
// CSV, PNG and JSON never touch the door; the tests watch every ask. jsdom pins the acts, the DOM and the
// bytes it can reach; pixels, geometry, real Tab order and downloads are real Chrome's (tests/test_export_chrome.py).
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockActions, type SendResult } from "./actions";
import { BlockTag } from "./BlockTag";
import { csvOf } from "../lib/csv";
import { getSlotStatus, setSlotStatus } from "../core/slotDraw";

afterEach(() => {
  cleanup();
  delete (URL as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
});

const CHART = { type: "chart", title: "Revenue", x: ["Jan", "Feb"], series: [{ name: "Ads", data: [4000, 5800] }], source: "Finance board" };
const HBAR = { type: "chart", kind: "hbar", title: "Costs", x: ["Stay", "Flights", "Local"], series: [{ name: "Cost", data: [42000, 31500, 28000] }] };
const TABLE = { type: "table", caption: "Kyoto trip", columns: ["Item", "Cost"], rows: [["Ryokan", "¥120,000"], ["Train, early", "¥3,000"]] };
const HEAD = { type: "heading", text: "Plan" };

/** A door that records every ask and then REFUSES: CSV, PNG and JSON may never knock; a Markdown ask that
 *  lands in the refuse writes nothing but the honest word. */
function refusingDoor() {
  const calls: string[] = [];
  const rest = (path: string) => {
    calls.push(path);
    throw new Error("the door is off: nothing is answered");
  };
  return { rest, calls };
}

/** Every export hands its bytes through the one door the browser offers: createObjectURL. Watch it, and the
 *  named anchor every save clicks — the same seam real Chrome downloads through. */
function watchDownloads() {
  const files: { name: string; blob: Blob }[] = [];
  (URL as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => {
    files.push({ name: "", blob: b });
    return "blob:x";
  };
  (URL as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
  const grab = (e: Event) => {
    const link = (e.target as HTMLElement).closest?.("a[download]");
    if (link && files.length) files[files.length - 1].name = link.getAttribute("download")!;
  };
  document.addEventListener("click", grab, true);
  afterEach(() => document.removeEventListener("click", grab, true));
  return files;
}

/** Mount a home BlockTag over a door answer in the LOCAL shape: the projection it serves (blocks) plus the
 *  stored envelope riding beside it (`stored`) — exactly what get_block answers with enhancement #6. */
async function drawnTag(
  board: unknown,
  extra: { rest?: (path: string) => Promise<unknown>; send?: () => Promise<SendResult>; fill?: () => void } = {},
) {
  const blocks = Array.isArray(board) ? board : (board as { blocks?: unknown[] }).blocks ?? [];
  const answer = { blocks, stored: board };
  render(
    <BlockActions.Provider value={{ send: extra.send ?? (async () => "nowhere"), fill: extra.fill ?? (() => {}), rest: extra.rest, blockId: "7f3a09bc" }}>
      <BlockTag id="7f3a09bc" streaming={false} load={async () => answer} />
    </BlockActions.Provider>,
  );
  await waitFor(() => expect(document.querySelector(".hb-blocks")).toBeTruthy());
  const tag = document.querySelector(".hb-tag")!;
  const boardEl = tag.querySelector(".hb-blocks")!;
  const over = (el: Element) => fireEvent(el, new Event("pointermove", { bubbles: true }));
  const buttons = () => [...tag.querySelectorAll<HTMLButtonElement>(".hb-export-btn")];
  return { tag, board: boardEl, over, buttons };
}

describe("every exportable block carries its control, drawn or not", () => {
  it("top-level chart and table: buttons exist WITHOUT any pointer having reached them", async () => {
    const t = await drawnTag([HEAD, CHART, TABLE]);
    expect(t.buttons()).toHaveLength(2);                       // the heading is not exportable; nothing else dims to nothing
    const labels = t.buttons().map((b) => b.getAttribute("aria-label"));
    expect(labels[0]).toBe("Export chart “Revenue” as PNG");
    expect(labels[1]).toBe("Export table “Kyoto trip” as CSV");
    for (const b of t.buttons()) {
      expect(b.tabIndex).toBeGreaterThanOrEqual(0);            // in the tab order already: keyboard first-class
      expect(b.disabled).toBe(false);
    }
  });
  it("the DOM-drawn horizontal bars — no <svg> anywhere — are exportable too", async () => {
    const t = await drawnTag([HBAR]);
    expect(t.board.querySelector("figure.hb-chart svg")).toBeNull();   // proof it is the pure-DOM kind
    expect(t.buttons()).toHaveLength(1);
    expect(t.buttons()[0].getAttribute("aria-label")).toBe("Export chart “Costs” as PNG");
  });
  it("nested blocks: a chart and a table inside a grid each get a button", async () => {
    const grid = { type: "grid", children: [CHART, TABLE] };
    const t = await drawnTag([grid]);
    expect(t.buttons()).toHaveLength(2);
    expect(t.buttons().map((b) => b.getAttribute("aria-label"))).toEqual([
      "Export chart “Revenue” as PNG", "Export table “Kyoto trip” as CSV",
    ]);
  });
  it("a closed accordion's children are not drawn and get no button; opening it rescans", async () => {
    const section = { type: "section", title: "Picks", collapsed: true, children: [TABLE] };
    const t = await drawnTag([section]);
    expect(t.buttons()).toHaveLength(0);                        // not drawn: nothing to reach by keyboard either
    fireEvent.click(t.board.querySelector(".hb-section-toggle")!);
    await waitFor(() => expect(t.buttons()).toHaveLength(1));   // the mount changed; the walk re-pairs
  });
  it("tabs: only the panel the reader is on is offered; switching re-scans", async () => {
    const tabs = { type: "tabs", tabs: [{ label: "A", children: [TABLE] }, { label: "B", children: [CHART] }] };
    const t = await drawnTag([tabs]);
    expect(t.buttons().map((b) => b.getAttribute("aria-label"))).toEqual(["Export table “Kyoto trip” as CSV"]);
    fireEvent.click(t.board.querySelectorAll<HTMLElement>(".hb-tab")[1]!);
    await waitFor(() => expect(t.buttons().map((b) => b.getAttribute("aria-label")))
      .toEqual(["Export chart “Revenue” as PNG"]));
  });
  it("hover lights the corner under the pointer, and leaving dims it again (the look, not the reach)", async () => {
    const t = await drawnTag([HEAD, CHART, TABLE]);
    expect(t.buttons()[0].classList.contains("lit")).toBe(false);
    t.over(t.board.querySelector("figure.hb-chart")!);
    expect(t.buttons()[0].classList.contains("lit")).toBe(true);
    expect(t.buttons()[1].classList.contains("lit")).toBe(false);
    t.over(t.tag);
    expect(t.buttons()[0].classList.contains("lit")).toBe(false);
  });
  it("a still-loading slot blocks every export until that slot resolves", async () => {
    const files = watchDownloads();
    const dead = { type: "images", images: [{ url: "https://127.0.0.1:9/missing.png", caption: "gone" }] };
    const first = { type: "table", caption: "first", columns: ["Item"], rows: [["FIRST-ONLY"]] };
    const second = { type: "table", caption: "second", columns: ["Item"], rows: [["TAPPED-SECOND"]] };
    const t = await drawnTag([first, dead, second]);
    const slots = [...t.board.querySelectorAll<HTMLElement>(":scope > .hb-slot")];
    expect(slots).toHaveLength(3);
    expect(getSlotStatus(slots[0])?.state).toBe("ready");
    expect(getSlotStatus(slots[2])?.state).toBe("ready");
    slots[1].querySelector(".hb-photos")?.remove();
    setSlotStatus(slots[1], "skipped");
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(t.buttons()[1].disabled).toBe(false));
    expect(getSlotStatus(slots[1])?.state).toBe("skipped");
    setSlotStatus(slots[1], "loading");
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(t.buttons()[1].disabled).toBe(true));
    expect(getSlotStatus(slots[1])?.state).toBe("loading");

    t.buttons()[1].click();
    expect(files).toHaveLength(0);

    setSlotStatus(slots[1], "skipped");
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(t.buttons()[1].disabled).toBe(false));
    expect(getSlotStatus(slots[1])?.state).toBe("skipped");
    t.buttons()[1].click();
    await waitFor(() => expect(files).toHaveLength(1));
    expect(files[0].name).toBe("second.csv");
    expect(await files[0].blob.text()).toBe("Item\r\nTAPPED-SECOND\r\n");
  });
});

describe("the corner tap writes bytes the page already has", () => {
  it("a table exports the STORED rows — every row, escaped, and nothing else", async () => {
    const files = watchDownloads();
    const t = await drawnTag([CHART, TABLE]);                 // the CHART's source is none of the CSV's
    t.buttons()[1].click();                                   // business: the table's corner, the table's rows
    await waitFor(() => expect(files.length).toBe(1));
    expect(files[0].name).toBe("kyoto-trip.csv");
    expect(files[0].blob.type).toBe("text/csv;charset=utf-8");
    const bytes = new Uint8Array(await files[0].blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(await files[0].blob.text()).toBe(
      csvOf(["Item", "Cost"], [["Ryokan", "¥120,000"], ["Train, early", "¥3,000"]]));
  });
  it("#41's structured table travels as stored data: raw numbers, and the source words the table itself says", async () => {
    const files = watchDownloads();
    const struct = {
      type: "table", caption: "Q4",
      columns: [
        { id: "h", label: "Hotel", kind: "text" },
        { id: "p", label: "Price", kind: "currency", unit: "¥" },
        { id: "s", label: "Sources", kind: "sources" },
      ],
      rows: [
        { cells: { h: { text: "Kanra" }, p: { text: "¥42,000", value: 42000 } }, sources: [{ label: "booking" }, { label: "hotel.site" }] },
        { cells: { h: { text: "Hoshiya, JR" }, p: { text: "¥18,000", value: 18000 } }, sources: [] },
      ],
    };
    const t = await drawnTag([struct]);
    t.buttons()[0].click();
    await waitFor(() => expect(files.length).toBe(1));
    // headers are the column labels; a number travels RAW (42000, not the formatted word) — a spreadsheet is
    // for computing; the comma in a label and in the source list quotes exactly where bare text cannot hold it.
    expect(await files[0].blob.text()).toBe(
      csvOf(["Hotel", "Price", "Sources"], [["Kanra", "42000", "booking, hotel.site"], ["Hoshiya, JR", "18000", ""]]));
  });
  it("formula-looking words AND signed numbers in the stored rows travel neutralized", async () => {
    const files = watchDownloads();
    const table = { type: "table", caption: "Risk", columns: ["A", "B"],
                    rows: [["=1+1", "-42"], ["@x", "+7.5"]] };
    const t = await drawnTag([table]);
    t.buttons()[0].click();
    await waitFor(() => expect(files.length).toBe(1));
    // CodeRabbit's second Major on #75 (CWE-1236), plus the #75 review: EVERY cell whose first character is
    // = + - @ arrives apostrophe-first — signed numbers included, no numeric exception. Pinned as literal
    // bytes, not the writer re-asking itself: the file matches what the agreed rule SAYS, not computes.
    expect(await files[0].blob.text()).toBe("A,B\r\n'=1+1,'-42\r\n'@x,'+7.5\r\n");
  });
  it("nested, too: the grid's table exports its own stored data", async () => {
    const files = watchDownloads();
    const grid = { type: "grid", children: [HEAD, TABLE] };
    const t = await drawnTag([grid]);
    t.buttons()[0].click();
    await waitFor(() => expect(files.length).toBe(1));
    expect(files[0].name).toBe("kyoto-trip.csv");
  });
  it("the PNG act says so where a browser cannot paint — no fake download", async () => {
    const files = watchDownloads();
    const t = await drawnTag([CHART]);
    t.buttons()[0].click();
    await waitFor(() => expect(t.tag.querySelector(".hb-export-said")!.textContent).toBe("No picture could be exported."));
    expect(files).toEqual([]);
  });
});

describe("the board menu — JSON from memory, Markdown from the ONE writer", () => {
  it("Markdown asks the door exactly once and writes EXACTLY what the writer answered", async () => {
    const files = watchDownloads();
    const calls: string[] = [];
    const rest = async (path: string) => {
      calls.push(path);
      return { markdown: "**Plan**\n\n**Revenue**: Ads 4,000 → 5,800 (▲ 45%)" };
    };
    const t = await drawnTag([HEAD, CHART, TABLE], { rest });
    fireEvent.click(t.tag.querySelector(".hb-export")!);
    const items = await waitFor(() => {
      const found = t.tag.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (found.length < 2) throw new Error("menu not open");
      return found;
    });
    fireEvent.click(items[0]);                                           // Markdown
    await waitFor(() => expect(files.length).toBe(1));
    expect(files[0].name).toBe("board-7f3a09bc.md");
    expect(files[0].blob.type).toBe("text/markdown;charset=utf-8");
    // The door's words, whole, closed by exactly one newline — no footer, no twin, nothing added.
    expect(await files[0].blob.text()).toBe(
      "**Plan**\n\n**Revenue**: Ads 4,000 → 5,800 (▲ 45%)\n");
    expect(calls).toEqual(["/blocks/7f3a09bc/markdown?version=1"]);       // ONE ask, pinned to this drawing
  });
  it("a door that refuses writes no Markdown — and says so, plainly, while JSON still needs nothing", async () => {
    const files = watchDownloads();
    const door = refusingDoor();
    const t = await drawnTag([HEAD, CHART, TABLE], { rest: door.rest });
    fireEvent.click(t.tag.querySelector(".hb-export")!);
    const items = await waitFor(() => {
      const found = t.tag.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (found.length < 2) throw new Error("menu not open");
      return found;
    });
    fireEvent.click(items[0]);                                           // Markdown
    await waitFor(() => expect(t.tag.querySelector(".hb-export-failed")!.textContent)
      .toBe("Nothing was exported."));
    expect(files).toEqual([]);                                           // the word is the truth: no file
    fireEvent.keyDown(window, { key: "Escape" });                        // the word stays; the menu closes
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeNull());
    fireEvent.click(t.tag.querySelector(".hb-export")!);                 // and JSON never needed the door
    const reopened = await waitFor(() => {
      const found = t.tag.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (found.length < 2) throw new Error("menu not open");
      return found;
    });
    fireEvent.click(reopened[1]);
    await waitFor(() => expect(files.length).toBe(1));
    expect(files[0].name).toBe("board-7f3a09bc.json");
    expect(door.calls).toEqual(["/blocks/7f3a09bc/markdown?version=1"]);  // only the Markdown act knocked
  });
  it("an old Markdown answer does not close a menu that was reopened while it waited", async () => {
    let answer!: (value: unknown) => void;
    const rest = () => new Promise((resolve) => { answer = resolve; });
    const t = await drawnTag([HEAD], { rest });
    const trigger = t.tag.querySelector(".hb-export")!;
    fireEvent.click(trigger);
    const firstItems = await waitFor(() => t.tag.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    fireEvent.click(firstItems[0]);
    await waitFor(() => expect(answer).toBeTypeOf("function"));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeNull());
    fireEvent.click(trigger);
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeTruthy());
    await act(async () => { answer({ markdown: "late answer" }); });
    expect(t.tag.querySelector('[role="menu"]')).toBeTruthy();
  });
  it("an old Markdown failure does not paint into a menu that was reopened while it waited", async () => {
    let reject!: (reason: Error) => void;
    const rest = () => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; });
    const t = await drawnTag([HEAD], { rest });
    const trigger = t.tag.querySelector(".hb-export")!;
    fireEvent.click(trigger);
    const firstItems = await waitFor(() => t.tag.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    fireEvent.click(firstItems[0]);
    await waitFor(() => expect(reject).toBeTypeOf("function"));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeNull());
    fireEvent.click(trigger);
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeTruthy());
    await act(async () => { reject(new Error("late failure")); });
    expect(t.tag.querySelector('[role="menu"]')).toBeTruthy();
    expect(t.tag.querySelector(".hb-export-failed")).toBeNull();
  });

  it("an answer that carries no words writes no file", async () => {
    const files = watchDownloads();
    const t = await drawnTag([HEAD], { rest: async () => ({}) });
    fireEvent.click(t.tag.querySelector(".hb-export")!);
    const items = await waitFor(() => {
      const found = t.tag.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (found.length < 2) throw new Error("menu not open");
      return found;
    });
    fireEvent.click(items[0]);
    await waitFor(() => expect(t.tag.querySelector(".hb-export-failed")!.textContent)
      .toBe("Nothing was exported."));
    expect(files).toEqual([]);
  });
  it("a drawing that never identified its own version is refused — nothing asked, nothing written", async () => {
    const files = watchDownloads();
    const calls: string[] = [];
    const rest = async (path: string) => { calls.push(path); return { markdown: "**Anything**" }; };
    // A BARE-list answer: the blocks draw, but nothing says WHICH version the screen is — no version word,
    // no envelope. Round 4's fail-closed rule: refusing beats downloading "whatever the host is on now".
    render(
      <BlockActions.Provider value={{ send: async () => "nowhere", fill: () => {}, rest, blockId: "7f3a09bc" }}>
        <BlockTag id="7f3a09bc" streaming={false} load={async () => [HEAD]} />
      </BlockActions.Provider>,
    );
    await waitFor(() => expect(document.querySelector(".hb-blocks")).toBeTruthy());
    const tag = document.querySelector(".hb-tag")!;
    fireEvent.click(tag.querySelector(".hb-export")!);
    const items = await waitFor(() => {
      const found = tag.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (found.length < 2) throw new Error("menu not open");
      return found;
    });
    fireEvent.click(items[0]);                                           // Markdown
    await waitFor(() => expect(tag.querySelector(".hb-export-failed")!.textContent)
      .toBe("Nothing was exported."));
    expect(files).toEqual([]);                                           // the word is the truth: no file
    expect(calls).toEqual([]);                                           // and NOTHING was asked of the door
    // JSON still writes: it rides the very snapshot this drawing was committed with — no version question.
    fireEvent.keyDown(window, { key: "Escape" });                        // the word stays; the menu closes
    await waitFor(() => expect(tag.querySelector('[role="menu"]')).toBeNull());
    fireEvent.click(tag.querySelector(".hb-export")!);
    const reopened = await waitFor(() => {
      const found = tag.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (found.length < 2) throw new Error("menu not open");
      return found;
    });
    fireEvent.click(reopened[1]);
    await waitFor(() => expect(files.length).toBe(1));
    expect(files[0].name).toBe("board-7f3a09bc.json");
  });
  it("the tag's OWN id names the files, never an enclosing provider's blockId (raised on #75)", async () => {
    const files = watchDownloads();
    render(
      // The provider speaks ANOTHER board's id; BlockTag's own id is the one the files must carry.
      <BlockActions.Provider value={{ send: async () => "nowhere", fill: () => {}, blockId: "0badc0de" }}>
        <BlockTag id="7f3a09bc" streaming={false}
          load={async () => ({ blocks: [HEAD], stored: { blocks: [HEAD] } })} />
      </BlockActions.Provider>,
    );
    await waitFor(() => expect(document.querySelector(".hb-tag")).toBeTruthy());
    const tag = document.querySelector(".hb-tag")!;
    fireEvent.click(tag.querySelector(".hb-export")!);
    const items = await waitFor(() => {
      const found = tag.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (found.length < 2) throw new Error("menu not open");
      return found;
    });
    fireEvent.click(items[1]);                                           // JSON
    await waitFor(() => expect(files.length).toBe(1));
    expect(files[0].name).toBe("board-7f3a09bc.json");                   // THIS tag, not the provider above
  });
  it("the menu opens ON its first item and keeps its arrows inside it (APG, raised on #75)", async () => {
    const t = await drawnTag([HEAD]);
    fireEvent.click(t.tag.querySelector(".hb-export")!);
    const items = await waitFor(() => {
      const found = [...t.tag.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      if (found.length < 2) throw new Error("menu not open");
      return found;
    });
    await waitFor(() => expect(document.activeElement).toBe(items[0]));  // focus lands ON the menu
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);                       // Down steps
    fireEvent.keyDown(items[1], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);                       // and wraps
    fireEvent.keyDown(items[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[1]);                       // Up returns, wrapping too
    fireEvent.keyDown(items[1], { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: "End" });
    expect(document.activeElement).toBe(items[1]);
  });
  it("JSON is the stored envelope, whole — the living words, unknown words and all, no second read", async () => {
    const files = watchDownloads();
    const door = refusingDoor();
    const board = { version: 2, updated_at: "2026-11-18T10:00:00+05:30", model_note: "kept verbatim", blocks: [HEAD, TABLE] };
    const t = await drawnTag(board, { rest: door.rest });
    fireEvent.click(t.tag.querySelector(".hb-export")!);
    fireEvent.click(await waitFor(() => {
      const items = t.tag.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (items.length < 2) throw new Error("menu not open");
      return items[1];
    }));
    await waitFor(() => expect(files.length).toBe(1));
    expect(files[0].name).toBe("board-7f3a09bc.json");
    expect(JSON.parse(await files[0].blob.text())).toEqual(board);
    expect(door.calls).toEqual([]);                                      // JSON knocked ZERO times
  });
  it("Escape closes it and returns focus to the trigger; a click outside closes it; nobody was asked", async () => {
    const door = refusingDoor();
    const t = await drawnTag([HEAD], { rest: door.rest });
    const trigger = t.tag.querySelector(".hb-export")!;
    fireEvent.click(trigger);
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeNull());
    expect(document.activeElement).toBe(trigger);                        // the reader gets its control back
    fireEvent.click(t.tag.querySelector(".hb-export")!);
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeTruthy());
    fireEvent(t.board, new Event("pointerdown", { bubbles: true }));
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeNull());
    expect(door.calls).toEqual([]);
  });
});

describe("an export never costs a model turn", () => {
  it("send and fill are untouched through a CSV, a Markdown and a JSON export", async () => {
    const files = watchDownloads();
    const send = vi.fn();
    const fill = vi.fn();
    const calls: string[] = [];
    const rest = async (path: string) => {
      calls.push(path);
      return { markdown: "**Text**" };
    };
    const t = await drawnTag([CHART, TABLE], { send, fill, rest });
    t.buttons()[1].click();                                              // table CSV
    await waitFor(() => expect(files.length).toBe(1));
    fireEvent.click(t.tag.querySelector(".hb-export")!);
    const items = await waitFor(() => {
      const found = t.tag.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (found.length < 2) throw new Error("menu not open");
      return found;
    });
    fireEvent.click(items[0]);                                           // Markdown
    await waitFor(() => expect(files.length).toBe(2));
    fireEvent.click(t.tag.querySelector(".hb-export")!);
    const reopened = await waitFor(() => {
      const found = t.tag.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (found.length < 2) throw new Error("menu not open");
      return found;
    });
    fireEvent.click(reopened[1]);                                        // JSON
    await waitFor(() => expect(files.length).toBe(3));
    expect(send).not.toHaveBeenCalled();
    expect(fill).not.toHaveBeenCalled();
    // The only ask in the whole passage is the ONE writer's door, for Markdown; CSV and JSON stayed local.
    expect(calls).toEqual(["/blocks/7f3a09bc/markdown?version=1"]);
  });
});

describe("the board's own DOM is none of the export's business", () => {
  it("corner buttons live OUTSIDE .hb-blocks; its bytes never change", async () => {
    const files = watchDownloads();
    const t = await drawnTag([HEAD, CHART, TABLE]);
    const before = t.board.innerHTML;
    for (const b of t.buttons()) {
      expect(b.closest(".hb-blocks")).toBeNull();                  // the layer is the tag's, never the board's
      b.click();
    }
    await waitFor(() => expect(files.length).toBe(1));             // the PNG act only said a word; the CSV wrote bytes
    expect(t.board.innerHTML).toBe(before);                        // every act ran; the board never moved
  });
});
