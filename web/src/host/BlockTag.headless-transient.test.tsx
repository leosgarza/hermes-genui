// Living Boards v1, round 7 (Sol's binding disposition on reviewer comment 944, run 1057):
// EVERY interactive surface — calculator, form draft, tab pick, slider, checklist — records its answer
// to the BOARD-HELD identity-keyed store AT EDIT TIME while mounted. No page-only ephemeral interactive
// state remains: recordValue's door:"never" transient path is retired, and forgetBlock no longer
// destroys a released address's board-held answers. Because the edit is durably on the board BEFORE
// any unmount, a FIRST addressed update that lands with no view mounted migrates it by identity (the
// same trailsFrom walk and misfire guard as round 6) and a reopen restores it.
//
// The explicit supersession (Sol, round-7): the all-state preservation invariant WINS over #8's
// door:"never" page-only transient behavior. #8 is still binding where it belongs: a never-updated
// board keeps its POSITIONAL filing for persisted answers (door key IS the path) — captured transient
// edits add durability without touching that truth. Isolation, no-misattribution, one-live-subtree and
// unsaid byte identity all stay under the same tests as before.
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockActions, type Rest } from "./actions";
import { BlockTag } from "./BlockTag";

afterEach(cleanup);

const DEEP = (v: unknown) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
const HEAD = { type: "heading", text: "Portfolio \u00b7 Q4" };
const TEXT = { type: "text", text: "three holdings, all up" };
const NVDA = { type: "text", text: "plus NVDA" };
const calc = {
  type: "calculator",
  sliders: [{ name: "p", title: "Loan", max: 1000, value: 400 }],
  results: [{ label: "Half", formula: "p / 2" }],
};
const calcB = {
  type: "calculator",
  sliders: [{ name: "q", title: "Mortgage", max: 900, value: 300 }],
  results: [{ label: "Half", formula: "q / 2" }],
};
const CHECK = { type: "checklist", title: "Pack", items: [{ text: "Rope" }, { text: "Tent" }] };
const FORM = { type: "form", title: "Plan it", submit: "Send",
  fields: [{ id: "note", type: "text", label: "Anything to slip in?" }] };
const TABS = { type: "tabs", tabs: [
  { label: "Rent", children: [{ type: "text", text: "RENT NOTES" }] },
  { label: "Buy", children: [{ type: "text", text: "BUY NOTES" }] },
] };
const section = (title: string, ...children: unknown[]) => ({
  type: "section", title, children: children.map(DEEP),
});
const stored = (blocks: unknown[], envelope: Record<string, unknown> = {}) => ({
  ...envelope, blocks, stored: { ...envelope, blocks },
});
const stamped = (n: number) => ({ version: n, updated_at: `2026-11-19T2${n}:00:00+00:00` });

// The door that speaks versions AND state — the same shape the round-6 file established (the real
// door answers ?version=N from the store's archive; the walk needs it exactly like BlockTag does).
// ONE STATE MAP PER ADDRESS: a real door never shares one board's bytes with another board, and a
// shared map would turn the isolation cases into false failures (two addresses, same block words).
function livingHost(versions: Record<number, unknown>) {
  const doors = new Map<string, Record<string, unknown>>();
  const savedFor = (id: string): Record<string, unknown> => {
    let m = doors.get(id);
    if (m === undefined) { m = {}; doors.set(id, m); }
    return m;
  };
  const rest = vi.fn(async (path: string, init?: { method?: string; body?: unknown }) => {
    const back = /^\/blocks\/([0-9a-f]{8})\?version=(\d+)$/.exec(path);
    if (back !== null) {
      const spec = versions[Number(back[2])];
      return spec !== undefined ? spec : { error: `no version ${back[2]} of this board` };
    }
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

const mountTag = (id: string, load: (id: string) => Promise<unknown>, rest?: Rest) => render(
  <BlockActions.Provider value={{ send: vi.fn(), fill: vi.fn(), ...(rest ? { rest } : {}) }}>
    <BlockTag id={id} streaming={false} load={load} />
  </BlockActions.Provider>,
);
const settle = async () => { await new Promise((r) => setTimeout(r, 30)); };

describe("round 7 (Sol's binding rule): transient edits file on the BOARD at EDIT TIME", () => {
  it("case 1 (the reviewer's exact probe): a v1 slider drag survives unmount + the FIRST headless update + reopen", async () => {
    const id = "f7d00001";
    const v1 = stored([DEEP(calc)]);
    const v2 = stored([DEEP(HEAD), DEEP(calc)], stamped(2));
    const { rest, savedFor } = livingHost({ 1: v1, 2: v2 });
    const first = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.change(first.container.querySelector("input[type=range]") as HTMLInputElement,
      { target: { value: "700" } });
    await settle();
    first.unmount();                                          // the only view is gone
    const again = mountTag(id, vi.fn(async () => v2), rest);  // the host updated v2 headlessly
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    expect(again.container.textContent, "v2's heading arrived").toContain("Portfolio");
    const slider = again.container.querySelector("input[type=range]") as HTMLInputElement;
    expect(slider.value, "INDEPENDENT v1-headless: reopened calculator").toBe("700"); // RED pre-fix: 400
    // THE BINDING NEW RULE, witnessed on the door: the answer reached the board while the reader
    // was still looking — a never-living board files transient answers by IDENTITY, never elsewhere.
    const saved = savedFor(id);
    const filed = Object.keys(saved).filter((k) => k.startsWith("k:"));
    expect(filed, "the drag filed on the door at edit time (RED pre-fix: door was EMPTY)").toHaveLength(1);
    expect(saved[filed[0]!]).toEqual({ p: 700 });
    again.unmount();
  });

  it("case 2: a v1 form draft survives unmount + the FIRST headless update + reopen", async () => {
    const id = "f7d00002";
    const v1 = stored([DEEP(FORM)]);
    const v2 = stored([DEEP(HEAD), DEEP(FORM)], stamped(2));
    const { rest, savedFor } = livingHost({ 1: v1, 2: v2 });
    const first = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.change(first.container.querySelector("input.hb-input[type=text]") as HTMLInputElement,
      { target: { value: "two cats, one tent" } });
    await settle();
    first.unmount();
    const again = mountTag(id, vi.fn(async () => v2), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    const draft = again.container.querySelector("input.hb-input[type=text]") as HTMLInputElement;
    expect(draft.value, "the reopened form shows the draft the reader typed on v1").toBe("two cats, one tent"); // RED pre-fix: ""
    const filed = Object.keys(savedFor(id)).filter((k) => k.startsWith("k:"));
    expect(filed, "a never-living board filed the draft by identity at edit time (RED pre-fix: {} )").toHaveLength(1);
    again.unmount();
  });

  it("case 3: a v1 tab pick survives unmount + the FIRST headless update + reopen", async () => {
    const id = "f7d00003";
    const v1 = stored([DEEP(TABS)]);
    const v2 = stored([DEEP(HEAD), DEEP(TABS)], stamped(2));
    const { rest, savedFor } = livingHost({ 1: v1, 2: v2 });
    const first = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.click(first.container.querySelectorAll("[role=tab]")[1]);
    await settle();
    first.unmount();
    const again = mountTag(id, vi.fn(async () => v2), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    const tabs = again.container.querySelectorAll("[role=tab]");
    expect((tabs[1] as HTMLElement).getAttribute("aria-selected"), "the pick rode unmount + headless update").toBe("true"); // RED pre-fix: tab 0
    expect(again.container.querySelector(".hb-tab-panel")!.textContent).toContain("BUY NOTES");
    const filed = Object.keys(savedFor(id)).filter((k) => k.startsWith("k:"));
    expect(filed, "the pick reached the door at edit time (RED pre-fix: {})").toHaveLength(1);
    again.unmount();
  });

  it("case 4: the archive walk migrates a transient answer across a FIRST headless cross-container move", async () => {
    const id = "f7d00004";
    const v1 = stored([section("A", DEEP(calc)), section("B", DEEP(TEXT))]);
    const v2 = stored([section("A", DEEP(NVDA)), section("B", DEEP(calc))], stamped(2));
    const { rest, savedFor } = livingHost({ 1: v1, 2: v2 });
    const first = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.change(first.container.querySelector("input[type=range]") as HTMLInputElement,
      { target: { value: "700" } });
    // the coalesced door write lands a breath after the drag — wait for it, then remember the key
    await waitFor(() => expect(Object.keys(savedFor(id)).filter((k) => k.startsWith("k:")).length)
      .toBe(1), { timeout: 2000 });
    const filedChain = Object.keys(savedFor(id)).find((k) => k.startsWith("k:"))!;
    first.unmount();
    const again = mountTag(id, vi.fn(async () => v2), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    // the chain moved (section A -> section B): the reopen must find the answer under the NEW chain,
    // carried by the stored v1->v2 mapping (trailsFrom), not re-worn by any position.
    const slider = again.container.querySelector("input[type=range]") as HTMLInputElement;
    expect(slider.value, "the drag rode the archived move").toBe("700");           // RED pre-fix: 400
    expect(filedChain, "it was filed on the door at all (RED pre-fix: nothing was filed)").toBeDefined();
    const saved = savedFor(id);
    expect(Object.keys(saved).some((k) => k.startsWith("k:") && k !== filedChain && saved[k] !== undefined))
      .toBe(true);  // the walk landed it under the NEW chain too (RED pre-fix)
    again.unmount();
  });

  it("case 5: even WITHOUT any update, reopen restores a v1 transient edit (no page-only ephemeral state remains)", async () => {
    const id = "f7d00005";
    const v1 = stored([DEEP(calc)]);  // never updated: version-less, the accepted #8-shaped board
    const { rest, savedFor } = livingHost({ 1: v1 });
    const first = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.change(first.container.querySelector("input[type=range]") as HTMLInputElement,
      { target: { value: "700" } });
    await settle();
    first.unmount();       // forgetBlock ran pre-fix and DESTROYED the page-held value (the 700 -> 400 class)
    const again = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    const slider = again.container.querySelector("input[type=range]") as HTMLInputElement;
    expect(slider.value, "a released address keeps its reader's answer").toBe("700");  // RED pre-fix: 400
    expect(Object.keys(savedFor(id)).filter((k) => k.startsWith("k:")), "filed by identity, not page-only").toHaveLength(1); // RED pre-fix: {}
    again.unmount();
  });

  it("case 6: a never-updated board files PERSISTED answers positionally (the #8 truth) and adds ONLY identity keys for transient edits", async () => {
    const id = "f7d00006";
    const v1 = stored([DEEP(CHECK), DEEP(calc)]);
    const { rest, savedFor } = livingHost({ 1: v1 });
    const first = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.click(first.container.querySelectorAll("button[role=checkbox]")[0]);
    await waitFor(() => expect(savedFor(id)["0"]).toEqual([0]));   // the accepted positional filing, unchanged
    fireEvent.change(first.container.querySelector("input[type=range]") as HTMLInputElement,
      { target: { value: "700" } });
    await settle();
    first.unmount();
    const again = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    expect(again.container.querySelectorAll("button[role=checkbox]")[0]!.className).toContain("hb-check-on"); // #8 control (green pre-fix)
    expect((again.container.querySelector("input[type=range]") as HTMLInputElement).value,
      "the transient edit rode the reopen").toBe("700");           // RED pre-fix: 400
    // the transient edit added EXACTLY one identity key; the checklist keeps NO identity byte on a
    // never-updated board, and the calculator never wears a positional one: position stays #8's truth.
    const saved = savedFor(id);
    const kKeys = Object.keys(saved).filter((k) => k.startsWith("k:"));
    expect(kKeys, "one identity key — for the transient answer only (RED pre-fix: none)").toHaveLength(1);
    expect(saved[kKeys[0]!]).toEqual({ p: 700 });
    expect(Object.keys(saved).filter((k) => !k.startsWith("k:"))).toEqual(["0"]);
    again.unmount();
  });

  it("isolation: two addresses with the same block words never share an answer across the retained store", async () => {
    const a = "f7d00007";
    const b = "f7d00008";
    const v1 = stored([DEEP(calc)]);
    const { rest, savedFor } = livingHost({ 1: v1 });
    const first = mountTag(a, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.change(first.container.querySelector("input[type=range]") as HTMLInputElement,
      { target: { value: "700" } });
    await settle();
    first.unmount();
    const other = mountTag(b, vi.fn(async () => v1), rest);  // same words, different address
    await waitFor(() => expect(other.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    expect((other.container.querySelector("input[type=range]") as HTMLInputElement).value,
      "B never wears A's retained answer").toBe("400");       // green pre-fix; guards the new filing
    const againA = mountTag(a, vi.fn(async () => v1), rest);
    await waitFor(() => expect(againA.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    expect((againA.container.querySelector("input[type=range]") as HTMLInputElement).value).toBe("700"); // RED pre-fix: 400
    expect(Object.keys(savedFor(b)).filter((k) => k.startsWith("k:"))).toHaveLength(0);                  // B filed nothing
    expect(Object.keys(savedFor(a)).filter((k) => k.startsWith("k:"))).toHaveLength(1);                  // only A's own
    other.unmount(); againA.unmount();
  });

  // Honest red/green split (disclosed): every clause that asserts a value ON SCREEN passes before
  // the fix (nothing was ever filed, so nothing can be misworn); the clauses that assert the NEW
  // edit-time filing are red before the fix. Post-fix, both hold together — that is the guard.
  it("misfire pin: a headless first update that REPLACES the calculator's words puts nothing on the new one", async () => {
    const id = "f7d00009";
    const v1 = stored([DEEP(calc)]);
    const v2 = stored([DEEP(HEAD), DEEP(calcB)], stamped(2));  // calcB: different own words
    const { rest, savedFor } = livingHost({ 1: v1, 2: v2 });
    const first = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.change(first.container.querySelector("input[type=range]") as HTMLInputElement,
      { target: { value: "700" } });
    await settle();
    first.unmount();
    const again = mountTag(id, vi.fn(async () => v2), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    const slider = again.container.querySelector("input[type=range]") as HTMLInputElement;
    expect(slider.value, "a genuinely replaced calculator is honest: its own spec, not the dead one's drag").toBe("300");
    const saved = savedFor(id);
    expect(Object.keys(saved).some((k) => k.startsWith("k:") && JSON.stringify(saved[k]) === JSON.stringify({ p: 700 })),
      "the old bytes stay put: inert, never erased (RED pre-fix: they were never filed at all)").toBe(true);
    again.unmount();
  });

  it("500-honesty pin: a headless first update to changed words shows the new spec value", async () => {
    const id = "f7d0000a";
    const moved = { ...DEEP(calc), sliders: [{ name: "p", title: "Loan", max: 1000, value: 500 }] };
    const v1 = stored([DEEP(calc)]);
    const v2 = stored([DEEP(moved)], stamped(2));
    const { rest } = livingHost({ 1: v1, 2: v2 });
    const first = mountTag(id, vi.fn(async () => v1), rest);
    await waitFor(() => expect(first.container.querySelector(".hb-blocks")).toBeTruthy());
    fireEvent.change(first.container.querySelector("input[type=range]") as HTMLInputElement,
      { target: { value: "700" } });
    await settle();
    first.unmount();
    const again = mountTag(id, vi.fn(async () => v2), rest);
    await waitFor(() => expect(again.container.querySelector(".hb-blocks")).toBeTruthy());
    await settle();
    expect((again.container.querySelector("input[type=range]") as HTMLInputElement).value,
      "changed own words redraw honestly from their own spec").toBe("500");
    again.unmount();
  });
});
