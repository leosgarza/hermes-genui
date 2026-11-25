// Provenance across version navigation, at the SHIPPED tag: the board's source block is the chat reader's
// provenance — it draws in the flow of the version being shown, and the footer never echoes it (maintainer
// tweak 2026-11-25 #1), so each source word appears exactly once per drawing. Reaching back into an archived
// version reads that version's OWN source block — no clamp is needed, because the badge was never a board
// word to begin with. A chat tag is not a kept, refreshing dashboard view, so nothing on this path ever
// wears Live (the pill belongs only to the kept view, and a sourceless live page wears it alone — tweak #2);
// and a board whose bytes still carry the withdrawn as_of/live words (from the first design of this feature —
// never merged upstream) simply says nothing extra: unknown envelope words are silent today. The door is a
// fake over the real route shapes (GET /blocks/{id}[?version=N]); same harness as BlockTag.living.test.tsx.
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { forgetBoards } from "../blocks/checklist/savedState";
import { BlockActions, type Rest } from "./actions";
import { BlockTag } from "./BlockTag";

afterEach(() => {
  cleanup();
  forgetBoards();
});

type Door = { boards: Map<string, unknown> };

function restFor(d: Door): Rest {
  return async (path: string) => {
    const [head, query] = path.split("?");
    const parts = head.split("/");
    const id = parts[2];
    const board = d.boards.get(id);
    if (board === undefined) return { error: "not found" };
    if (parts[3] === "versions") {
      return { versions: (d.boards.get(`${id}.versions`) as { version: number }[] | undefined) ?? [] };
    }
    if (query?.startsWith("version=")) {
      const want = Number(query.split("=")[1]);
      const archive = (d.boards.get(`${id}.versions`) as { version: number; board: unknown }[] | undefined) ?? [];
      const hit = archive.find((e) => e.version === want);
      return hit ? hit.board : { error: "no such version" };
    }
    return board;
  };
}

function mountTag(id: string, d: Door) {
  return render(
    <BlockActions.Provider
      value={{ send: async () => "nowhere", fill: () => {}, rest: restFor(d), sessionScope: "s1" }}>
      <BlockTag id={id} streaming={false} load={async () => (d.boards.get(id) as object)} />
    </BlockActions.Provider>,
  );
}

const HEADING = { type: "heading", text: "Jobs report" };
const srcLine = (accessed: string) => ({
  type: "source", title: "Sources",
  items: [{ label: "BLS JOLTS", url: "https://www.bls.gov/jlt", kind: "web", accessed }],
});

describe("provenance across version navigation", () => {
  it("current → archived → current: each drawing shows its OWN version's source block — once, with no echo", async () => {
    const id = "c0ffee10";
    const d: Door = { boards: new Map() };
    d.boards.set(id, { version: 2, updated_at: "2026-11-20T09:00:00+00:00", blocks: [HEADING, srcLine("2026-11-20")] });
    d.boards.set(`${id}.versions`, [{ version: 1, saved_at: null,
      board: { version: 1, updated_at: "2026-11-17T08:00:00+00:00", blocks: [HEADING, srcLine("2026-11-17")] } }]);
    const { container } = mountTag(id, d);
    await waitFor(() => expect(container.querySelector(".hb-source")).toBeTruthy());
    expect(container.querySelector(".hb-provenance")).toBeNull(); // a shown source is not repeated below itself
    expect(container.querySelector(".hb-source")!.textContent).toContain("2026-11-20");
    expect(container.textContent!.split("BLS JOLTS").length - 1).toBe(1); // once — never twice
    expect(container.querySelector(".hb-provenance-badge")).toBeNull();

    fireEvent.click(container.querySelector("button.hb-live-history")!);
    await waitFor(() => expect(container.textContent).toContain("viewing v1"));
    // the frozen drawing reads its OWN date — the archived block says 2026-11-17, and it says it once
    expect(container.querySelector(".hb-source")!.textContent).toContain("2026-11-17");
    expect(container.textContent).not.toContain("2026-11-20");
    expect(container.querySelector(".hb-provenance")).toBeNull();
    expect(container.textContent).not.toContain("Live"); // a reach-back can never claim freshness — no clamp needed
    fireEvent.click(container.querySelector("button.hb-live-back")!);
    await waitFor(() => expect(container.textContent).toContain("v2"));
    expect(container.querySelector(".hb-source")!.textContent).toContain("2026-11-20");
    expect(container.querySelector(".hb-provenance")).toBeNull();
  });

  it("the whole chat path never speaks the word Live: the shown source stands alone, no echo, no badge", async () => {
    const id = "c0ffee11";
    const d: Door = { boards: new Map() };
    d.boards.set(id, { blocks: [HEADING, srcLine("2026-11-18")] });
    const { container } = mountTag(id, d);
    await waitFor(() => expect(container.querySelector(".hb-source")).toBeTruthy());
    expect(container.querySelector(".hb-provenance")).toBeNull();
    expect(container.querySelector(".hb-provenance-badge")).toBeNull();
    expect(container.textContent).not.toContain("Live");
    expect(container.textContent).not.toContain("Snapshot");
  });

  it("a board carrying the WITHDRAWN words draws like any other: unknown envelope words stay silent", async () => {
    const id = "c0ffee12";
    const d: Door = { boards: new Map() };
    d.boards.set(id, { as_of: "Nov 18, 14:05 UTC", live: true, blocks: [HEADING, srcLine("2026-11-18")] });
    const { container } = mountTag(id, d);
    await waitFor(() => expect(container.querySelector(".hb-source")).toBeTruthy());
    // the source block says its own words once; the stale as_of word joins nothing, the stale live word badges nothing
    expect(container.querySelector(".hb-provenance")).toBeNull();
    expect(container.querySelector(".hb-source")!.textContent).toContain("BLS JOLTS");
    expect(container.textContent).not.toContain("14:05");
    expect(container.querySelector(".hb-provenance-badge")).toBeNull();
    expect(container.textContent).not.toContain("Live");
  });

  it("a sourceless board's tag keeps every node it always had — and no others", async () => {
    const id = "c0ffee13";
    const d: Door = { boards: new Map() };
    d.boards.set(id, { version: 2, updated_at: "2026-11-20T09:00:00+00:00", blocks: [HEADING] });
    const { container } = mountTag(id, d);
    await waitFor(() => expect(container.querySelector(".hb-live")).toBeTruthy());
    expect(container.querySelector(".hb-provenance")).toBeNull();
  });
});
