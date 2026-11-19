// The export affordance is host chrome (enhancement #6, round 2): EVERY exportable block — charts of both kinds
// and tables, at any depth the drawing shows them — carries a corner button that is ALWAYS in the DOM and in the
// tab order (invisible until lit, focusable all the time: a keyboard reader reaches a non-interactive chart's
// export without a mouse), and the board menu writes Markdown and JSON from the envelope the page already holds
// — export-time requests are ZERO, pinned here by giving the page a door that records and refuses. jsdom pins
// the acts, the DOM and the bytes it can reach; pixels, geometry, real Tab order and downloads are real
// Chrome's (tests/test_export_chrome.py).
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockActions, type SendResult } from "./actions";
import { BlockTag } from "./BlockTag";
import { csvOf } from "../lib/csv";

afterEach(() => {
  cleanup();
  delete (URL as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
});

const CHART = { type: "chart", title: "Revenue", x: ["Jan", "Feb"], series: [{ name: "Ads", data: [4000, 5800] }], source: "Finance board" };
const HBAR = { type: "chart", kind: "hbar", title: "Costs", x: ["Stay", "Flights", "Local"], series: [{ name: "Cost", data: [42000, 31500, 28000] }] };
const TABLE = { type: "table", caption: "Kyoto trip", columns: ["Item", "Cost"], rows: [["Ryokan", "¥120,000"], ["Train, early", "¥3,000"]] };
const HEAD = { type: "heading", text: "Plan" };
const ENVELOPE = { as_of: "2026-11-18", live: false };

/** A door that records every ask and then REFUSES: the rework's promise is that an export never knocks. */
function refusingDoor() {
  const calls: string[] = [];
  const rest = (path: string) => {
    calls.push(path);
    throw new Error("the door is off: exports are local");
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

async function drawnTag(
  blocks: unknown[],
  envelope: Record<string, unknown> = {},
  extra: { rest?: (path: string) => Promise<unknown>; send?: (text: string) => Promise<SendResult>; fill?: () => void } = {},
) {
  const stored = { ...envelope, blocks };
  render(
    <BlockActions.Provider value={{ send: extra.send ?? (async () => "nowhere" as const), fill: extra.fill ?? (() => {}), rest: extra.rest, blockId: "7f3a09bc" }}>
      <BlockTag id="7f3a09bc" streaming={false} load={async () => stored} />
    </BlockActions.Provider>,
  );
  await waitFor(() => expect(document.querySelector(".hb-blocks")).toBeTruthy());
  const tag = document.querySelector(".hb-tag")!;
  const board = tag.querySelector(".hb-blocks")!;
  const over = (el: Element) => fireEvent(el, new Event("pointermove", { bubbles: true }));
  const buttons = () => [...tag.querySelectorAll<HTMLButtonElement>(".hb-export-btn")];
  return { tag, board, over, buttons };
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
});

describe("the corner tap writes bytes the page already has", () => {
  it("a table exports the STORED rows — every row, escaped — with the provenance comment over them", async () => {
    const files = watchDownloads();
    const t = await drawnTag([TABLE], ENVELOPE);
    t.buttons()[0].click();
    await waitFor(() => expect(files.length).toBe(1));
    expect(files[0].name).toBe("kyoto-trip.csv");
    expect(files[0].blob.type).toBe("text/csv;charset=utf-8");
    const bytes = new Uint8Array(await files[0].blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(await files[0].blob.text()).toBe(
      `# as of 2026-11-18 · Snapshot\r\n${csvOf(["Item", "Cost"], [["Ryokan", "¥120,000"], ["Train, early", "¥3,000"]])}`);
  });
  it("a board that declares no provenance gets a CSV with no comment to strip", async () => {
    const files = watchDownloads();
    const t = await drawnTag([TABLE]);
    t.buttons()[0].click();
    await waitFor(() => expect(files.length).toBe(1));
    expect(await files[0].blob.text()).toBe(
      csvOf(["Item", "Cost"], [["Ryokan", "¥120,000"], ["Train, early", "¥3,000"]]));
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

describe("the board menu — Markdown and JSON from the page's own memory", () => {
  it("asks NOTHING of the door: a door that refuses everything still exports the whole board", async () => {
    const files = watchDownloads();
    const door = refusingDoor();
    const t = await drawnTag([HEAD, CHART, TABLE], ENVELOPE, { rest: door.rest });
    fireEvent.click(t.tag.querySelector(".hb-export")!);
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeTruthy());
    fireEvent.click(t.tag.querySelectorAll<HTMLElement>('[role="menuitem"]')[0]);   // Markdown
    await waitFor(() => expect(files.length).toBe(1));
    expect(files[0].name).toBe("board-7f3a09bc.md");
    expect(files[0].blob.type).toBe("text/markdown;charset=utf-8");
    // the host-side serializer twin, uncapped — the same text the chat fallback would speak — plus the footer
    expect(await files[0].blob.text()).toBe(
      "**Plan**\n\n**Revenue**: Ads 4,000 → 5,800 (▲ 45%)\n\n**Kyoto trip**\n| Item | Cost |\n| --- | --- |\n"
      + "| Ryokan | ¥120,000 |\n| Train, early | ¥3,000 |\n\n---\n\nFinance board · as of 2026-11-18 · Snapshot\n");
    expect(door.calls.filter((c) => c !== "/library")).toEqual([]);  // #8's mount shelf read is the one ask; exports themselves still ask NOTHING                             // ZERO asks. The promise, pinned.
  });
  it("JSON is the stored envelope, whole — unknown words and all, no second read", async () => {
    const files = watchDownloads();
    const door = refusingDoor();
    const t = await drawnTag([HEAD, TABLE], { ...ENVELOPE, model_note: "kept verbatim" }, { rest: door.rest });
    fireEvent.click(t.tag.querySelector(".hb-export")!);
    fireEvent.click(await waitFor(() => {
      const items = t.tag.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (items.length < 2) throw new Error("menu not open");
      return items[1];
    }));
    await waitFor(() => expect(files.length).toBe(1));
    expect(files[0].name).toBe("board-7f3a09bc.json");
    expect(JSON.parse(await files[0].blob.text())).toEqual({
      ...ENVELOPE, model_note: "kept verbatim", blocks: [HEAD, TABLE],
    });
    expect(door.calls.filter((c) => c !== "/library")).toEqual([]);  // #8's mount shelf read is the one ask; exports themselves still ask NOTHING
  });
  it("Escape closes it; a click outside closes it; nothing was asked of anyone on the way", async () => {
    const door = refusingDoor();
    const t = await drawnTag([HEAD], ENVELOPE, { rest: door.rest });
    fireEvent.click(t.tag.querySelector(".hb-export")!);
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeNull());
    fireEvent.click(t.tag.querySelector(".hb-export")!);
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeTruthy());
    fireEvent(t.board, new Event("pointerdown", { bubbles: true }));
    await waitFor(() => expect(t.tag.querySelector('[role="menu"]')).toBeNull());
    expect(door.calls.filter((c) => c !== "/library")).toEqual([]);  // #8's mount shelf read is the one ask; exports themselves still ask NOTHING
  });
});

describe("inside the dialog, the affordance rides along", () => {
  it("expanded: the menu keeps the dialog's corner and the corner buttons stay mounted with the board", async () => {
    const t = await drawnTag([CHART, TABLE], ENVELOPE);
    fireEvent.click(t.tag.querySelector(".hb-expand")!);
    const host = document.querySelector(".hb-board-overlay")!;
    expect(host).toBeTruthy();
    expect(host.querySelector(".hb-export")).toBeTruthy();               // the menu moved into the dialog
    expect(t.tag.querySelector("div.hb-tag > .hb-export")).toBeNull();   // and away from the tag row
    expect(host.querySelectorAll(".hb-export-btn").length).toBe(2);      // keyboard-reachable inside the trap
    fireEvent.click(host.querySelector(".hb-export")!);
    await waitFor(() => expect(host.querySelector('[role="menu"]')).toBeTruthy());
    expect(document.querySelectorAll(".hb-blocks").length).toBe(1);      // the one instance rode into the dialog
  });
});

describe("an export never costs a model turn", () => {
  it("send and fill are untouched through a CSV, a Markdown and a JSON export", async () => {
    const files = watchDownloads();
    const send = vi.fn(async () => "nowhere" as const);
    const fill = vi.fn();
    const door = refusingDoor();
    const t = await drawnTag([CHART, TABLE], ENVELOPE, { send, fill, rest: door.rest });
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
    expect(door.calls.filter((c) => c !== "/library")).toEqual([]);  // #8's mount shelf read is the one ask; exports themselves still ask NOTHING
  });
});

describe("the board's own DOM is none of the export's business", () => {
  it("corner buttons live OUTSIDE .hb-blocks; its bytes never change", async () => {
    const files = watchDownloads();
    const t = await drawnTag([HEAD, CHART, TABLE]);
    const before = t.board.innerHTML;
    for (const b of t.buttons()) {
      expect(b.closest(".hb-blocks")).toBeNull();                  // the layer is the host's, never the board's
      b.click();
    }
    await waitFor(() => expect(files.length).toBe(1));             // the PNG act only said a word; the CSV wrote bytes
    expect(t.board.innerHTML).toBe(before);                        // every act ran; the board never moved
  });
});
