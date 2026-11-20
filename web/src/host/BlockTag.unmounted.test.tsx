// Living Boards v1, round 6 (Sol's binding disposition on reviewer comment 937): an update made while
// NO view is mounted must still preserve and correctly attribute persisted edits.
//
// The defect class: a board is drawn (v1), the reader ticks a checklist — the never-living board files
// positionally, exactly as #8 accepted ({"0":[0]}). The view closes. The HOST updates the same address
// (v2). Nothing was mounted, so no promote ran; a legacy positional answer is left for whatever block
// NOW sits in that slot. The rule this file owns:
//  · a legacy positional answer NEVER rides the NEW positional path (invariant 1);
//  · the answer follows its block along a mapping computed from the STORED specs (the version archive),
//    independent of any mounted view (invariant 2);
//  · where retention cannot be CONFIRMED, nothing applies — a vacated slot leaves its answer behind
//    rather than handing it to an unrelated block (invariant 3, the misfire guard);
//  · a board that was never updated keeps the accepted #8 truth: position IS its address (control).
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockActions, type Rest } from "./actions";
import { BlockTag } from "./BlockTag";

afterEach(cleanup);

const DEEP = (v: unknown) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
const HEAD = { type: "heading", text: "Portfolio · Q4" };
const NVDA = { type: "text", text: "plus NVDA" };
const calc = {
  type: "calculator",
  sliders: [{ name: "p", title: "Loan", max: 1000, value: 400 }],
  results: [{ label: "Half", formula: "p / 2" }],
};
const CHECK = { type: "checklist", title: "Pack", items: [{ text: "Rope" }, { text: "Tent" }] };
const CHECK2 = { type: "checklist", title: "Other", items: [{ text: "Map" }, { text: "Stove" }] };
const stored = (blocks: unknown[], envelope: Record<string, unknown> = {}) => ({
  ...envelope, blocks, stored: { ...envelope, blocks },
});
const stamped = (n: number) => ({ version: n, updated_at: `2026-11-19T2${n}:00:00+00:00` });
const section = (title: string, ...children: unknown[]) => ({
  type: "section", title, children: children.map(DEEP),
});

// The door the round-6 defect needs: it answers the STATE routes AND reaches into the version archive
// (?version=N) — the store's own words, exactly what the real door serves. A version nobody archived
// answers the 404 body, like plugin_api does.
function livingHost(versions: Record<number, unknown>) {
  const saved: Record<string, unknown> = {};
  const rest = vi.fn(async (path: string, init?: { method?: string; body?: unknown }) => {
    const back = /^\/blocks\/[0-9a-f]{8}\?version=(\d+)$/.exec(path);
    if (back !== null) {
      const spec = versions[Number(back[1])];
      return spec !== undefined ? spec : { error: `no version ${back[1]} of this board` };
    }
    if (!path.endsWith("/state")) throw new Error(`mock door: ${path}`);
    if (init?.method === "PUT") {
      Object.assign(saved, (init.body as { state: Record<string, unknown> }).state);
      return {};
    }
    return { state: JSON.parse(JSON.stringify(saved)) as Record<string, unknown> };
  });
  return { rest, saved };
}

const mountTag = (id: string, load: (id: string) => Promise<unknown>, rest?: Rest) => render(
  <BlockActions.Provider value={{ send: vi.fn(), fill: vi.fn(), ...(rest ? { rest } : {}) }}>
    <BlockTag id={id} streaming={false} load={load} />
  </BlockActions.Provider>,
);
const settle = async () => { await new Promise((r) => setTimeout(r, 30)); };

describe("an update made while the board is NOT mounted (round 6, reviewer comment 937)", () => {
  it("case 1 (the reviewer's exact probe): a different checklist in the vacated slot never wears its ticks", async () => {
    const id = "f6d00001";
    const v1 = stored([DEEP(CHECK)]);
    const v2 = stored([DEEP(CHECK2), DEEP(CHECK)], stamped(2));
    const { rest, saved } = livingHost({ 1: v1, 2: v2 });
    const first = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.click(first.container.querySelectorAll("button[role=checkbox]")[0]);
    await waitFor(() => expect(saved["0"]).toEqual([0]));
    first.unmount();  // the page lets the board go — no view mounted anywhere
    // the HOST updates the same address while nothing is mounted: reopen must not misread the slot
    const again = mountTag(id, vi.fn(async () => v2), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    const boxes = again.container.querySelectorAll("button[role=checkbox]");
    expect(boxes[0]!.className, "Other item 0").not.toContain("hb-check-on");   // RED pre-fix: it inherited them
    expect(boxes[1]!.className, "Other item 1").not.toContain("hb-check-on");
    expect(boxes[2]!.className, "Pack item 0").toContain("hb-check-on");        // RED pre-fix: bare
    expect(boxes[3]!.className, "Pack item 1").not.toContain("hb-check-on");
    again.unmount();
  });

  it("case 2: a headless insertion before the checklist carries its ticks to the reopen", async () => {
    const id = "f6d00002";
    const v1 = stored([DEEP(CHECK)]);
    const v2 = stored([DEEP(HEAD), DEEP(CHECK), DEEP(NVDA)], stamped(2));
    const { rest, saved } = livingHost({ 1: v1, 2: v2 });
    const first = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.click(first.container.querySelectorAll("button[role=checkbox]")[1]);
    await waitFor(() => expect(saved["0"]).toEqual([1]));
    first.unmount();
    const again = mountTag(id, vi.fn(async () => v2), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    const boxes = again.container.querySelectorAll("button[role=checkbox]");
    expect(boxes.length, "one checklist survives at path 1").toBe(2);
    expect(boxes[0]!.className).not.toContain("hb-check-on");
    expect(boxes[1]!.className, "the tick rode the insertion").toContain("hb-check-on");
    again.unmount();
  });

  it("case 3: a headless SWAP of two checklists moves the ticks WITH their checklist, not with the slot", async () => {
    const id = "f6d00003";
    const v1 = stored([DEEP(CHECK), DEEP(CHECK2)]);   // Pack at "0", Other at "1"
    const v2 = stored([DEEP(CHECK2), DEEP(CHECK)], stamped(2));  // Other now owns path "0"
    const { rest, saved } = livingHost({ 1: v1, 2: v2 });
    const first = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.click(first.container.querySelectorAll("button[role=checkbox]")[2]);  // Other item 0
    await waitFor(() => expect(saved["1"]).toEqual([0]));
    first.unmount();
    const again = mountTag(id, vi.fn(async () => v2), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    const boxes = again.container.querySelectorAll("button[role=checkbox]");
    expect(boxes[0]!.className, "Other (now first) keeps its own tick").toContain("hb-check-on");
    expect(boxes[2]!.className, "Pack (now second) stays bare").not.toContain("hb-check-on");
    again.unmount();
  });

  it("case 4 (the misfire guard): a headless update that DROPS the block leaves the legacy answer inert", async () => {
    const id = "f6d00004";
    const v1 = stored([DEEP(CHECK)]);
    const v2 = stored([DEEP(CHECK2)], stamped(2));  // Pack is gone; Other takes its old slot
    const { rest, saved } = livingHost({ 1: v1, 2: v2 });
    const first = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.click(first.container.querySelectorAll("button[role=checkbox]")[0]);
    await waitFor(() => expect(saved["0"]).toEqual([0]));
    first.unmount();
    const again = mountTag(id, vi.fn(async () => v2), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    for (const box of again.container.querySelectorAll("button[role=checkbox]")) {
      expect(box.className, "nothing of a deleted block may land on a stranger").not.toContain("hb-check-on");
    }
    expect(saved["0"], "the bytes stay; they are simply never worn by another block").toEqual([0]);
    again.unmount();
  });

  it("case 5: a slider answer filed by identity at a MOUNTED update survives a SECOND, HEADLESS update", async () => {
    const id = "f6d00005";
    const v1 = stored([DEEP(calc)]);
    const v2 = stored([DEEP(calc), DEEP(HEAD)], stamped(2));  // first update lands MOUNTED (the poke promotes)
    // second update lands with NO view mounted: the calculator moves INSIDE a fresh section — its
    // identity chain changes, and only the archived v2→v3 mapping can carry the answer across.
    const v3 = stored([section("B", DEEP(calc)), DEEP(NVDA)], stamped(3));
    const { rest, saved } = livingHost({ 1: v1, 2: v2, 3: v3 });
    const load2 = vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    const first = mountTag(id, load2, rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    const poke = mountTag(id, vi.fn(async () => v2), rest);  // the poke that makes the board living
    await waitFor(() => expect(first.container.textContent).toContain("Portfolio · Q4"));
    fireEvent.change(first.container.querySelector("input[type=range]") as HTMLInputElement, { target: { value: "700" } });
    await waitFor(() => expect(Object.keys(saved).some((k) => k.startsWith("k:"))).toBe(true));
    poke.unmount();
    first.unmount();                                          // every view is gone
    const again = mountTag(id, vi.fn(async () => v3), rest);  // reopen the HEADLESS v3
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    const slider = again.container.querySelector("input[type=range]") as HTMLInputElement;
    expect(slider.value, "the dragged line rode the archived v2→v3 mapping").toBe("700");  // RED pre-fix: 400
    again.unmount();
  });

  it("case 6: a nested block survives a headless update that shifts its PATH through the archive mapping", async () => {
    const id = "f6d00006";
    const v1 = stored([section("A", DEEP(CHECK))]);
    // section word changes AND the checklist shifts slot: the old positional bytes sit at
    // "0.children.0" while the reopened checklist sits at "1.children.0" — neither may be read blind.
    const v2 = stored([DEEP(HEAD), section("B", DEEP(CHECK)), DEEP(NVDA)], stamped(2));
    const { rest, saved } = livingHost({ 1: v1, 2: v2 });
    const first = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.click(first.container.querySelectorAll("button[role=checkbox]")[0]);
    await waitFor(() => expect(saved["0.children.0"]).toEqual([0]));
    first.unmount();
    const again = mountTag(id, vi.fn(async () => v2), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    expect(again.container.querySelector("button[role=checkbox]")!.className).toContain("hb-check-on");
    again.unmount();
  });

  it("control (green by design pre-fix): a NEVER-updated board still reads its own positional bytes", async () => {
    const id = "f6d00007";
    const v1 = stored([DEEP(CHECK)]);  // no version word at all — the accepted #8 board
    const { rest, saved } = livingHost({ 1: v1 });
    saved["0"] = [0];  // ticks filed while the reader last looked, positionally
    const again = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    expect(again.container.querySelectorAll("button[role=checkbox]")[0]!.className)
      .toContain("hb-check-on");   // position is the TRUTH of a board that never spoke an update
    again.unmount();
  });
});
