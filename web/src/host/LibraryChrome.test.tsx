// The Library chrome, unit end: the controls speak to an in-memory door that routes like
// dashboard/plugin_api.py (PUT requires a stored board; DELETE removes only the note), the send goes
// through the REAL composerActions seam over a recording fake composer (no send() mock anywhere), and a
// board is remounted to read the shelf back — the reload persistence at unit level. The door's own
// semantics are pinned in Python (tests/core/test_store_library.py, tests/dashboard/); the real
// browser, layout and the local-only witness live in tests/test_library_chrome.py.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { forgetBoards } from "../blocks/checklist/savedState";
import { BlockActions, composerActions, type Rest } from "./actions";
import { BlockTag } from "./BlockTag";
import { attachText, LibraryEntry } from "./LibraryChrome";

afterEach(cleanup);

type Door = {
  rest: Rest; calls: string[]; boards: Map<string, unknown>;
  notes: Map<string, Record<string, unknown>>; states: Map<string, Record<string, unknown>>;
};

function autoTitle(board: unknown): string {
  const blocks = Array.isArray(board) ? board : ((board as { blocks?: unknown[] })?.blocks ?? []);
  for (const b of blocks) {
    const block = b as Record<string, unknown>;
    for (const word of ["title", "caption", "text", "label"]) {
      const v = block[word];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "Board";
}

/** One fake shelf: routes like the Python door — PUT 404s for un-stored boards and validates words;
 *  DELETE only pops the note. boards is the store: nothing ever removes from it (no delete at all). */
function makeDoor(): Door {
  const boards = new Map<string, unknown>();
  const notes = new Map<string, Record<string, unknown>>();
  const states = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  const rest: Rest = async (path, init) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    // The board-state door, routed like GET/PUT /blocks/<id>/state: 404 without a board, {} before
    // anything is saved; a PUT replaces the state whole (the real store's contract).
    const st = /^\/blocks\/([0-9a-f]{8})\/state$/.exec(path);
    if (st) {
      if (!boards.has(st[1])) throw new Error("404 not found");
      if (method === "GET") {
        const saved = states.get(st[1]);
        return saved ? { state: saved } : {};
      }
      if (method === "PUT") {
        const body = (init?.body ?? {}) as { state?: Record<string, unknown> };
        states.set(st[1], { ...(body.state ?? {}) });
        return { ok: true };
      }
    }
    if (path === "/library") {
      return {
        entries: [...notes.entries()].map(([id, n]) => ({
          id, title: n.title ?? "", folder: n.folder ?? null, favorite: n.favorite === true,
          pinned: true, saved_at: n.saved_at ?? "", exists: boards.has(id),
        })),
      };
    }
    const pin = /^\/library\/([0-9a-f]{8})$/.exec(path);
    if (pin && (method === "PUT" || method === "DELETE")) {
      const id = pin[1];
      if (method === "DELETE") return { ok: true, removed: notes.delete(id) };
      if (!boards.has(id)) throw new Error("404 not found");
      const words = (init?.body ?? {}) as Record<string, unknown>;
      const known = ["title", "folder", "favorite"];
      if (Object.keys(words).some((k) => !known.includes(k))) throw new Error("400 bad word");
      const note = notes.get(id) ?? { title: "", saved_at: "2026-11-19T00:00:00+00:00" };
      if ("title" in words) note.title = (words.title as string) || autoTitle(boards.get(id));
      if ("folder" in words) note.folder = (words.folder as string) || null;
      if ("favorite" in words) note.favorite = words.favorite === true;
      if (!note.title) note.title = autoTitle(boards.get(id));
      notes.set(id, note);
      return { entry: { id, ...note } };
    }
    const get = /^\/blocks\/([0-9a-f]{8})$/.exec(path);
    if (get && method === "GET") {
      const board = boards.get(get[1]);
      if (board === undefined) throw new Error("404 not found");
      return board;
    }
    throw new Error(`unrouted ${method} ${path}`);
  };
  return { rest, calls, boards, notes, states };
}

const board = (text: string) => [{ type: "heading", text }, { type: "divider" }];
const drawnWith = (door: Door, submit: Array<[string, string]>) => {
  const composer = {
    submit: (_s: null, t: string) => {
      submit.push(["submit", t]);
      return true;
    },
    insertText: async (_s: null, t: string) => {
      submit.push(["insert", t]);
      return true;
    },
    focus: () => {
      submit.push(["focus", ""]);
    },
  };
  const actions = { ...composerActions(composer), rest: door.rest };
  const view = render(
    <BlockActions.Provider value={actions}>
      <BlockTag id="7f3a09bc" streaming={false} load={async () => door.rest("/blocks/7f3a09bc")} />
    </BlockActions.Provider>,
  );
  return view;
};

async function drawn(door: Door, submit: Array<[string, string]> = []) {
  door.boards.set("7f3a09bc", { blocks: board("Kyoto trip planner") });
  const view = drawnWith(door, submit);
  await screen.findByRole("button", { name: "Save to Library" });
  return view;
}

const pinButton = () => screen.getByRole("button", { name: /Save to Library|Remove from Library/ });

const openButton = (id: string) => {
  const el = document.querySelector<HTMLElement>(`.hb-library-row[data-board="${id}"] .hb-library-open`);
  if (!el) throw new Error(`no open control for ${id} yet`);
  return el;
};

describe("Library chrome", () => {
  it("pins through the door, shows the pressed truth and says where it went", async () => {
    const door = makeDoor();
    await drawn(door);
    expect(pinButton().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(pinButton());
    await waitFor(() => expect(door.calls).toContain("PUT /library/7f3a09bc"));
    await waitFor(() => expect(pinButton().getAttribute("aria-pressed")).toBe("true"));
    expect(door.notes.get("7f3a09bc")?.title).toBe("Kyoto trip planner");  // auto-title, the board's own words
    const said = await waitFor(() => {
      const el = document.querySelector(".hb-library-said");
      if (!el) throw new Error("no word yet");
      return el;
    });
    expect(said.textContent).toBe("Saved to Library — on this machine only.");
  });

  it("unpinning removes the note and never destroys the board", async () => {
    const door = makeDoor();
    await drawn(door);
    fireEvent.click(pinButton());
    await waitFor(() => expect(pinButton().getAttribute("aria-pressed")).toBe("true"));
    fireEvent.click(pinButton());  // the label flipped: this tap takes it off the shelf
    await waitFor(() => expect(door.calls).toContain("DELETE /library/7f3a09bc"));
    await waitFor(() => expect(door.notes.size).toBe(0));
    expect(door.boards.has("7f3a09bc")).toBe(true);  // THE semantics: the stored board survives its pin
    expect(document.querySelector(".hb-library-said")?.textContent).toContain("the board itself was never deleted");
  });

  it("reads the pin state back from the shelf when the board remounts (a reload)", async () => {
    const door = makeDoor();
    await drawn(door);
    fireEvent.click(pinButton());
    await waitFor(() => expect(door.notes.size).toBe(1));
    cleanup();
    const view = await drawn(door);          // the same door, a fresh page: nothing pinned itself here
    expect(view.container.innerHTML).toBeTruthy();
    await waitFor(() => expect(pinButton().getAttribute("aria-pressed")).toBe("true"));
    expect(pinButton().getAttribute("aria-label")).toBe("Remove from Library");
  });

  it("refuses to lie without a door: the controls say they cannot save", async () => {
    const composer = { submit: () => true, insertText: async () => true, focus: () => {} };
    render(
      <BlockActions.Provider value={composerActions(composer)}>
        <BlockTag id="7f3a09bc" streaming={false} load={async () => board("x")} />
      </BlockActions.Provider>,
    );
    const button = await screen.findByRole("button", { name: "Save to Library" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");  // no door: nothing was claimed saved
  });

  it("the Library lists exactly the saved boards, grouped Favorites, folder, Unfiled", async () => {
    const door = makeDoor();
    door.boards.set("aabbccdd", { blocks: board("Q3 review") });
    door.boards.set("beef0000", { blocks: board("Rent tracker") });
    door.notes.set("7f3a09bc", { title: "Kyoto trip planner", favorite: true, saved_at: "3" });
    door.notes.set("aabbccdd", { title: "Q3 review", folder: "Finance", saved_at: "2" });
    door.notes.set("beef0000", { title: "Rent tracker", folder: "", saved_at: "1" });
    await drawn(door);
    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    const dialog = await screen.findByRole("dialog", { name: "Board Library" });
    expect([...dialog.querySelectorAll(".hb-library-head")].map((h) => h.textContent)).toEqual(["Favorites", "Finance", "Unfiled"]);
    const names = [...dialog.querySelectorAll(".hb-library-name")].map((n) => n.textContent);
    expect(names).toEqual(["Kyoto trip planner", "Q3 review", "Rent tracker"]);
    expect(dialog.querySelector('[data-board="beef0000"] .hb-library-here')).toBe(null);
    expect(dialog.querySelector('[data-board="7f3a09bc"] .hb-library-here')).not.toBe(null);  // this board, marked
  });

  it("reopening a saved board draws its data AND its layout from the door", async () => {
    const door = makeDoor();
    door.boards.set("aabbccdd", { align: "center", blocks: [{ type: "heading", text: "The saved thing" }, { type: "divider" }] });
    door.notes.set("aabbccdd", { title: "The saved thing", favorite: false, saved_at: "1" });
    await drawn(door);
    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    await waitFor(() => expect(document.querySelector('[data-board="aabbccdd"] .hb-library-open')).toBeTruthy());
    fireEvent.click(openButton("aabbccdd"));
    const region = await screen.findByRole("dialog", { name: "Board Library" });
    expect(region.textContent).toContain("The saved thing");
    // layout truth: the stored envelope's align rode through the same reader the inline board used
    const places = [...region.querySelectorAll(".hb-place-center")];
    expect(places.length).toBeGreaterThan(0);
  });

  it("reattach sends the board's own tag through the real seam and reports the host's word", async () => {
    const door = makeDoor();
    const submit: Array<[string, string]> = [];
    door.boards.set("aabbccdd", { blocks: board("Q3 review") });
    door.notes.set("aabbccdd", { title: "Q3 review", favorite: false, saved_at: "1" });
    await drawn(door, submit);
    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add “Q3 review” to chat" }));
    await waitFor(() => expect(submit.filter(([k]) => k === "submit").length).toBe(1));
    const [, text] = submit.find(([k]) => k === "submit")!;
    expect(text).toBe(attachText("Q3 review", "aabbccdd"));
    expect(text).toContain('::blocks{id="aabbccdd"}');  // the one line that turns back into the board
    const said = await waitFor(() => {
      const el = document.querySelector(".hb-library-attached");
      if (!el) throw new Error("no answer word yet");
      return el;
    });
    expect(said.textContent).toBe("Sent to chat.");  // the host's own word, not one invented here
  });

  it("rename and folder go through the door as single words", async () => {
    const door = makeDoor();
    door.boards.set("aabbccdd", { blocks: board("Q3 review") });
    door.notes.set("aabbccdd", { title: "Q3 review", favorite: false, saved_at: "1" });
    await drawn(door);
    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename “Q3 review”" }));
    const input = await screen.findByRole("textbox", { name: 'New title for “Q3 review”' });
    fireEvent.change(input, { target: { value: "Budget 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(door.calls).toContain("PUT /library/aabbccdd"));
    expect(door.notes.get("aabbccdd")?.title).toBe("Budget 2026");
    fireEvent.click(await screen.findByRole("button", { name: "Move “Budget 2026” to a folder" }));
    const folder = await screen.findByRole("textbox", { name: 'Folder for “Budget 2026”' });
    fireEvent.change(folder, { target: { value: "Finance" } });
    fireEvent.keyDown(folder, { key: "Enter" });  // Enter commits the editor without a mouse
    await waitFor(() => expect(door.notes.get("aabbccdd")?.folder).toBe("Finance"));
  });

  it("favorite re-groups the row; remove takes it off the shelf and keeps the board", async () => {
    const door = makeDoor();
    door.boards.set("aabbccdd", { blocks: board("Q3 review") });
    door.notes.set("aabbccdd", { title: "Q3 review", favorite: false, saved_at: "1" });
    await drawn(door);
    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    fireEvent.click(await screen.findByRole("button", { name: "Favorite “Q3 review”" }));
    await waitFor(() => expect(door.notes.get("aabbccdd")?.favorite).toBe(true));
    await waitFor(() => expect(document.querySelector(".hb-library-head")?.textContent).toBe("Favorites"));
    fireEvent.click(screen.getByRole("button", { name: "Remove “Q3 review” from Library" }));
    await waitFor(() => expect(document.querySelector(".hb-library-row")).toBe(null));
    expect(door.boards.has("aabbccdd")).toBe(true);  // the shelf row is gone; the board is not
    fireEvent.click(screen.getByRole("button", { name: "Close Library" }));
    expect(document.querySelector(".hb-library-said")?.textContent).toContain("the board itself was never deleted");
  });

  it("a note whose board is not on this machine admits it and cannot be opened", async () => {
    const door = makeDoor();
    door.notes.set("deadbeef", { title: "Ghost", favorite: false, saved_at: "1" });
    await drawn(door);
    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    await waitFor(() => expect(document.querySelector('[data-board="deadbeef"] .hb-library-open')).toBeTruthy());
    const open = openButton("deadbeef");
    expect((open as HTMLButtonElement).disabled).toBe(true);
    expect(open.textContent).toContain("not on this machine");
  });

  it("the dialog owns the keyboard: Tab stays inside it, Escape closes it back onto its control", async () => {
    const door = makeDoor();
    const view = await drawn(door);
    const lib = screen.getByRole("button", { name: "Open Library" });
    fireEvent.click(lib);
    const dialog = await screen.findByRole("dialog", { name: "Board Library" });
    expect(dialog.contains(document.activeElement)).toBe(true);  // focus landed in the dialog on open
    for (let i = 0; i < 6; i++) {
      fireEvent.keyDown(window, { key: "Tab" });
      const active = document.activeElement as HTMLElement;
      expect(dialog.contains(active) || active === lib).toBe(true);
      expect(active).not.toBe(view.container.querySelector(".hb-expand"));  // the board behind never got the keys
    }
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Board Library" })).toBe(null));
    expect(document.activeElement).toBe(lib);  // the control gets its reader back
  });

  it("from a reopened board, one Escape steps back onto the shelf, not out of the dialog", async () => {
    const door = makeDoor();
    door.boards.set("aabbccdd", { blocks: board("Q3 review") });
    door.notes.set("aabbccdd", { title: "Q3 review", favorite: false, saved_at: "1" });
    await drawn(door);
    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    await waitFor(() => expect(document.querySelector('[data-board="aabbccdd"] .hb-library-open')).toBeTruthy());
    fireEvent.click(openButton("aabbccdd"));
    await waitFor(() => expect(document.querySelector(".hb-library-board")).not.toBe(null));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(document.querySelector(".hb-library-board")).toBe(null));
    expect(screen.getByRole("dialog", { name: "Board Library" })).toBeTruthy();  // still open, back on the list
  });

  it("an expanded board takes the shelf controls away until it rests again", async () => {
    const door = makeDoor();
    await drawn(door);
    fireEvent.click(screen.getByRole("button", { name: "Expand board" }));
    await waitFor(() => expect(document.querySelector(".hb-board-overlay")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Save to Library|Remove from Library|Open Library/ })).toBe(null);
  });

  it("the attach text carries the tag whole, title quotes and all", () => {
    expect(attachText("A “quoted” title", "7f3a09bc")).toBe(
      'Saved board “A “quoted” title”:\n::blocks{id="7f3a09bc"}',
    );
  });
});

// Round-2 review fixes, unit end (the real-browser halves live in tests/test_library_chrome.py).
describe("Library state isolation (review round 2, blocking #1)", () => {
  const twin = () => [
    { type: "checklist", title: "Pack", items: ["Jacket", "Socks", "Passport"] },
    { type: "form", title: "Plan it", fields: [{ id: "where", kind: "text", label: "Where" }] },
  ];

  const tickedIn = (scope: string) =>
    [...document.querySelectorAll<HTMLElement>(`${scope} [role="checkbox"]`)]
      .map((el, i) => (el.getAttribute("aria-checked") === "true" ? i : -1))
      .filter((i) => i >= 0);

  it("a reopened board reads and saves its OWN state, never the board hosting the shelf", async () => {
    forgetBoards();
    const door = makeDoor();
    // Two DIFFERENT boards with the same shape — same state keys, divergent truths. A: item 0 ticked,
    // form unsent. B: item 1 ticked, form already sent with an answer.
    door.boards.set("7f3a09bc", { blocks: twin() });  // the host board the page stands on
    door.boards.set("aabbccdd", { blocks: twin() });  // the saved twin reopened inside the shelf
    door.states.set("7f3a09bc", { "0": [0] });
    door.states.set("aabbccdd", { "0": [1], "1": { sent: true, values: { where: "Hills" } } });
    door.notes.set("aabbccdd", { title: "Saved twin", favorite: false, saved_at: "1" });
    drawnWith(door, []);
    await screen.findByRole("button", { name: "Save to Library" });
    await waitFor(() => expect(tickedIn(".hb-board-host")).toEqual([0]));  // the host shows A's ticks

    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    await waitFor(() => expect(document.querySelector('[data-board="aabbccdd"] .hb-library-open')).toBeTruthy());
    fireEvent.click(openButton("aabbccdd"));
    // The gate is the LOADED STATE, not the mount (review round 3, blocking #1): the checkboxes draw
    // before the saved-state read resolves, so waiting only for a checkbox to EXIST raced the async
    // read (first independent run: `expected [] to deeply equal [1]`). B's truth is [1]; a board that
    // wrongly read A would sit at [0] and a never-loaded one at [], so this gate stays honest — the
    // negative control (blockId override removed) still turns it RED, only by timeout instead of
    // mismatch. Everything asserted below stays exactly as it was.
    await waitFor(() => expect(tickedIn(".hb-library-board")).toEqual([1]));
    // READ isolation: B's checklist and B's sent form come back as B's — same keys, other board's truth.
    expect(tickedIn(".hb-board-host")).toEqual([0]);  // A unaffected by B standing in the dialog
    await waitFor(() => expect(document.querySelector(".hb-library-board .hb-form-sent")).toBeTruthy());
    expect(document.querySelector(".hb-board-host .hb-form-sent")).toBe(null);
    await waitFor(() => expect(document.querySelector<HTMLInputElement>(".hb-library-board .hb-input")?.value)
      .toBe("Hills"));  // B's saved answer, not A's blank field (same async read, same honest gate)
    const answer = document.querySelector<HTMLInputElement>(".hb-library-board .hb-input");
    expect(answer?.value).toBe("Hills");

    // WRITE isolation: a tick inside the reopened board saves B. A was never written to — at all.
    const boxes = [...document.querySelectorAll<HTMLElement>(".hb-library-board [role='checkbox']")];
    fireEvent.click(boxes[2]);
    await waitFor(() => expect(door.calls).toContain("PUT /blocks/aabbccdd/state"));
    await waitFor(() => expect(door.states.get("aabbccdd")).toEqual({
      "0": [1, 2], "1": { sent: true, values: { where: "Hills" } },
    }));
    expect(door.states.get("7f3a09bc")).toEqual({ "0": [0] });  // A's state, byte-for-byte as it was
    expect(door.calls.filter((c) => c.startsWith("PUT /blocks/7f3a09bc"))).toEqual([]);
    expect(tickedIn(".hb-library-board")).toEqual([1, 2]);  // and the reopened board shows its own truth
  });
});

// The new-chat shelf (chat.empty): review round 2, blocking #2. The plugin.tsx half — that the real
// register() stands this entry — runs in real Chrome over an SDK stub (tests/test_library_chrome.py).
describe("LibraryEntry — the shelf with no board on screen", () => {
  it("stands without a board, costs the door nothing until opened, and reattaches through the real seam", async () => {
    forgetBoards();
    const door = makeDoor();
    door.boards.set("aabbccdd", { blocks: board("Rent tracker") });
    door.notes.set("aabbccdd", { title: "Rent tracker", favorite: false, saved_at: "1" });
    const submit: Array<[string, string]> = [];
    render(
      <BlockActions.Provider value={{
        ...composerActions({
          submit: (_s, t) => { submit.push(["submit", t]); return true; },
          insertText: async (_s, t) => { submit.push(["insert", t]); return true; },
          focus: () => { submit.push(["focus", ""]); },
        }),
        rest: door.rest,
      }}>
        <LibraryEntry />
      </BlockActions.Provider>,
    );
    // No board: no pin (there is nothing drawn to save) — but the shelf stands and is a real button.
    expect(screen.queryByRole("button", { name: /Save to Library|Remove from Library/ })).toBe(null);
    expect(door.calls).toEqual([]);  // an empty chat costs the door NOTHING until the shelf is opened

    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    await screen.findByRole("dialog", { name: "Board Library" });
    expect(await screen.findByText("Rent tracker")).toBeTruthy();

    // Reattach into the new chat: the real composer seam carries the saved board's own tag.
    fireEvent.click(await screen.findByRole("button", { name: "Add “Rent tracker” to chat" }));
    await waitFor(() => expect(submit.filter(([k]) => k === "submit")).toEqual([
      ["submit", attachText("Rent tracker", "aabbccdd")],
    ]));
    expect(submit[0][1]).toContain('::blocks{id="aabbccdd"}');

    // And the row's accessible open control reopens the board from the empty chat, faithfully.
    fireEvent.click(openButton("aabbccdd"));
    await waitFor(() => expect(document.querySelector(".hb-library-board")).toBeTruthy());
    expect(document.querySelector(".hb-library-board")?.textContent).toContain("Rent tracker");
  });
});
