// The follow-up strip (t_87119a1c, enhancement #5): a quiet line of up to four tappable prompts a board's
// envelope offers beneath itself. The presentation is AI-directed — the reader has no controls — and a tap
// sends the prompt to the chat over the EXISTING route: composerActions.send on the explicit force path the
// interactive table shipped (a >120-char prompt is POSTED, not drafted), with the command/file guard holding
// its ground and only host-acknowledged words ever shown. The strip costs a fit-content hug zero width and
// wraps long labels rather than clipping them; real layout and real clicks are pinned in Chrome by
// tests/test_follow_ups_chrome.py. What this file pins: markup, placement, the seam contract, and the words.
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Blocks } from "./Blocks";
import { readBlocksNoted } from "./readBlocks";
import { BlockActions, composerActions, MAX_SENT, type Composer, type SendResult } from "../host/actions";
import { withStyles } from "./testing";
import tokens from "../styles/tokens.css?raw";
import shared from "../styles/shared.css?raw";

let unstyle: () => void;
beforeAll(() => (unstyle = withStyles(tokens, shared)));
afterAll(() => unstyle());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TEXT = { type: "text", text: "Kyoto, three days" };
const ups = () => [
  { label: "Plan day 2", run: "Plan the second day of my Kyoto itinerary" },
  { label: "Find trains", run: "Compare trains between Kyoto and Osaka" },
];

const draw = (board: unknown[], value = {}) =>
  render(
    <BlockActions.Provider value={{ send: async () => "sent", fill: () => {}, ...value }}>
      <Blocks blocks={readBlocksNoted(board).blocks} boardFollowUps={ups()} />
    </BlockActions.Provider>,
  ).container;

const readBoard = (data: unknown) => {
  const r = readBlocksNoted(data);
  return render(
    <Blocks blocks={r.blocks} boardAlign={r.align} boardAsOf={r.asOf} boardLive={r.live}
      boardFollowUps={r.followUps} />,
  ).container;
};

describe("the strip a board offers", () => {
  it("draws one quiet pill per follow-up, each saying what it sends", () => {
    const root = draw([TEXT]);
    const pills = root.querySelectorAll(".hb-followups button");
    expect(pills.length).toBe(2);
    expect(pills[0].querySelector(".hb-followup-label")?.textContent).toBe("Plan day 2");
    expect(pills[0].getAttribute("title")).toBe("Plan the second day of my Kyoto itinerary");
    expect(pills[1].querySelector(".hb-followup-label")?.textContent).toBe("Find trains");
  });

  it("draws no strip, and no wrapper, when the board says nothing", () => {
    const noted = readBlocksNoted({ blocks: [TEXT] });
    expect(noted.followUps).toBeUndefined();
    const plain = render(<Blocks blocks={noted.blocks} />).container;
    expect(plain.querySelector(".hb-followups")).toBeNull();
    // byte-identical to the board as it always drew: the strip adds nothing to a board without the word.
    const r2 = readBlocksNoted({ blocks: [TEXT] });
    const same = render(<Blocks blocks={r2.blocks} boardFollowUps={r2.followUps} />).container;
    expect(same.innerHTML).toBe(plain.innerHTML);
  });

  it("sits beneath the board, and beneath the provenance footer when the board has one", () => {
    const root = readBoard({ blocks: [TEXT], as_of: "2026-11-18", live: true, follow_ups: ups() });
    const strip = root.querySelector(".hb-followups")!;
    const footer = root.querySelector(".hb-provenance")!;
    expect(!!(strip.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_PRECEDING)).toBe(true);
    expect(root.querySelectorAll(".hb-provenance, .hb-followups").length).toBe(2);
  });

  it("takes the board's placement without touching the blocks' own", () => {
    const center = readBoard({ blocks: [{ type: "text", text: "Hi", align: "right" }], align: "center", follow_ups: ups() });
    const strip = center.querySelector(".hb-followups")!;
    expect(strip.className).toBe("hb-followups hb-followups-center");
    expect(getComputedStyle(strip).justifyContent).toBe("center");
    expect(center.querySelector(".hb-place-right")).not.toBeNull();  // block placement machinery untouched
    const right = readBoard({ blocks: [TEXT], align: "right", follow_ups: ups() });
    expect(getComputedStyle(right.querySelector(".hb-followups")!).justifyContent).toBe("flex-end");
    const left = readBoard({ blocks: [TEXT], align: "left", follow_ups: ups() });
    expect(left.querySelector(".hb-followups")!.className).toBe("hb-followups");
    expect(getComputedStyle(left.querySelector(".hb-followups")!).justifyContent).toBe("normal");
  });

  it("wraps long labels and never clips: no nowrap, no ellipsis, no overflow hidden anywhere in the strip", () => {
    const root = draw([TEXT]);
    for (const sel of [".hb-followup-label", ".hb-followups-said"]) {
      const el = root.querySelector(sel)!;
      const cs = getComputedStyle(el);
      expect([sel, cs.whiteSpace]).toEqual([sel, "normal"]);
      expect(cs.overflowWrap).toBe("anywhere");
      expect(cs.textOverflow).toBe("clip");
      expect(["", "visible"].includes(cs.overflow)).toBe(true);  // jsdom leaves unset overflow unreported
    }
    const row = getComputedStyle(root.querySelector(".hb-followups")!);
    expect(row.flexWrap).toBe("wrap");
    expect(row.width).toBe("0px");      // the fit-content hug trick: the row costs the board nothing…
    expect(row.minWidth).toBe("100%");  // …and fills the column that gives it room
  });

  it("is keyboard-reachable focus-wise: real pills, in order", () => {
    const root = draw([TEXT]);
    const pills = [...root.querySelectorAll<HTMLButtonElement>(".hb-followups button")];
    pills[1].focus();
    expect(document.activeElement).toBe(pills[1]);
  });

  it("renders whole long words: the label on the pill, the prompt in its title — nothing cut on the way", () => {
    const label = "Compare the three days and tell me which evening walk to cut or keep";
    const run = ("Expand every line of this Kyoto plan into a detailed day-by-day itinerary with train " +
      "times, booking links and costs for every hop between the cities. ").repeat(4).trim();
    const root = render(
      <BlockActions.Provider value={{ send: async () => "nowhere", fill: () => {} }}>
        <Blocks blocks={readBlocksNoted({ blocks: [TEXT] }).blocks} boardFollowUps={[{ label, run }]} />
      </BlockActions.Provider>,
    ).container;
    const pill = root.querySelector(".hb-followups button")!;
    expect(pill.querySelector(".hb-followup-label")!.textContent).toBe(label);
    expect(pill.getAttribute("title")).toBe(run);
  });
});

describe("a tap on the real seam", () => {
  type Insert = boolean | "rejects";
  function fakeComposer(takes = true, inserts: Insert = true) {
    return {
      submit: vi.fn((_s: string | null, _t: string) => takes),
      insertText: vi.fn(async () => {
        if (inserts === "rejects") throw new Error("no mounted surface answered");
        return inserts;
      }),
      focus: vi.fn(),
    };
  }
  const wire = (composer: Composer | undefined) => {
    const a = composerActions(composer);
    return render(
      <BlockActions.Provider value={{ send: a.send, fill: a.fill }}>
        <Blocks blocks={readBlocksNoted({ blocks: [TEXT] }).blocks} boardFollowUps={ups()} />
      </BlockActions.Provider>,
    ).container;
  };
  const tapPill = async (root: HTMLElement, n = 0) => {
    await act(async () => { fireEvent.click(root.querySelectorAll(".hb-followups button")[n]); });
  };
  const said = (root: HTMLElement) => root.querySelector(".hb-followups-said")!.textContent;

  it("a tap posts exactly that prompt, and the host's yes is what the strip says", async () => {
    const composer = fakeComposer();
    const root = wire(composer);
    await tapPill(root, 1);
    expect(composer.submit).toHaveBeenCalledTimes(1);
    expect(composer.submit.mock.calls[0][1]).toBe("Compare trains between Kyoto and Osaka");
    expect(composer.insertText).not.toHaveBeenCalled();
    expect(said(root)).toBe("Sent to chat.");
  });

  it("a prompt past MAX_SENT is still posted — the explicit route, not a draft", async () => {
    const long = { label: "Go deeper", run: "Expand every line of this Kyoto plan into a detailed day-by-day itinerary, " + "with train times, booking links and costs for every hop between the cities" };
    expect(long.run.length).toBeGreaterThan(MAX_SENT);
    const composer = fakeComposer();
    const a = composerActions(composer);
    const root = render(
      <BlockActions.Provider value={{ send: a.send, fill: a.fill }}>
        <Blocks blocks={readBlocksNoted({ blocks: [TEXT] }).blocks} boardFollowUps={[long]} />
      </BlockActions.Provider>,
    ).container;
    await tapPill(root);
    expect(composer.submit.mock.calls[0][1]).toBe(long.run);
    expect(composer.insertText).not.toHaveBeenCalled();  // not drafted, not kept in the composer — SENT
    expect(said(root)).toBe("Sent to chat.");
  });

  it("a refused submit falls into an acknowledged draft, and the strip says where it went", async () => {
    const composer = fakeComposer(false, true);
    const root = wire(composer);
    await tapPill(root);
    expect(said(root)).toBe("In the composer — press Send.");
  });

  it("an insert that answers nothing admits the text is nowhere — no false claim, retry stays possible", async () => {
    const composer = fakeComposer(false, false);
    const root = wire(composer);
    await tapPill(root);
    expect(said(root)).toBe("Send failed — nothing was sent or kept.");
    await tapPill(root);  // tap again: the retry is the whole point
    expect(composer.submit).toHaveBeenCalledTimes(2);
  });

  it("text Hermes acts on before the model is never submitted, even through the explicit route", async () => {
    // Crafted past the reader (defense in depth): the host seam is the last guard, and it holds it.
    const composer = fakeComposer();
    const a = composerActions(composer);
    const root = render(
      <BlockActions.Provider value={{ send: a.send, fill: a.fill }}>
        <Blocks blocks={readBlocksNoted({ blocks: [TEXT] }).blocks} boardFollowUps={[{ label: "Reset", run: "/reset" }]} />
      </BlockActions.Provider>,
    ).container;
    await tapPill(root);
    expect(composer.submit).not.toHaveBeenCalled();
    expect(composer.insertText).toHaveBeenCalled();
    expect(said(root)).toBe("Blocked from sending — in the composer — press Send.");
  });

  it("with no app around a tap did nothing, and the strip says that too", async () => {
    const root = render(<Blocks blocks={readBlocksNoted({ blocks: [TEXT] }).blocks} boardFollowUps={ups()} />).container;
    await tapPill(root);
    expect(said(root)).toBe("No chat here.");
  });

  it("only the LAST tap's answer labels the strip — a slow host cannot mislabel a newer choice", async () => {
    let releaseA: (r: SendResult) => void = () => {};
    const send = (text: string) =>
      text.startsWith("Plan") ? new Promise<SendResult>((res) => { releaseA = res; }) : Promise.resolve<SendResult>("sent");
    const root = render(
      <BlockActions.Provider value={{ send: vi.fn(send), fill: () => {} }}>
        <Blocks blocks={readBlocksNoted({ blocks: [TEXT] }).blocks} boardFollowUps={ups()} />
      </BlockActions.Provider>,
    ).container;
    const pills = root.querySelectorAll(".hb-followups button");
    await act(async () => { fireEvent.click(pills[0]); });  // A stays pending
    await tapPill(root, 1);                                 // B answers first
    expect(said(root)).toBe("Sent to chat.");
    await act(async () => { releaseA("failed"); });         // A's late "failed" must not stick
    expect(said(root)).toBe("Sent to chat.");
  });

  it("a new tap never leaves the old word standing: pending until the host answers THIS one", async () => {
    // The round-2 defect: tap A resolves "sent", tap B goes out while the host is silent, and the strip
    // still says "Sent to chat." — a success word for a tap nobody acknowledged. Each new tap must clear
    // the prior word to a pending mark, and only the host's answer to the last tap may replace it.
    const deferred: Array<(r: SendResult) => void> = [];
    let tapsSent = 0;
    const send = vi.fn(() => {
      tapsSent++;
      if (tapsSent === 1) return Promise.resolve<SendResult>("sent");
      return new Promise<SendResult>((res) => { deferred.push(res); });
    });
    const root = render(
      <BlockActions.Provider value={{ send, fill: () => {} }}>
        <Blocks blocks={readBlocksNoted({ blocks: [TEXT] }).blocks} boardFollowUps={ups()} />
      </BlockActions.Provider>,
    ).container;
    const pills = () => root.querySelectorAll<HTMLButtonElement>(".hb-followups button");
    await tapPill(root, 0);                                 // A: the host says yes
    expect(said(root)).toBe("Sent to chat.");
    await act(async () => { fireEvent.click(pills()[1]); });  // B: the host has not answered yet
    expect(said(root)).toBe("Pending…");                    // the old success word is GONE
    expect(said(root)).not.toContain("Sent");
    await act(async () => { deferred[0]("failed"); });      // B's real answer: nothing went anywhere
    expect(said(root)).toBe("Send failed — nothing was sent or kept.");
    await act(async () => { fireEvent.click(pills()[0]); });  // C: a resolved word is stale the moment a tap starts
    expect(said(root)).toBe("Pending…");
    await act(async () => { deferred[1]("blocked"); });
    expect(said(root)).toBe("Blocked from sending — in the composer — press Send.");
  });

  it("the pill carries its prompt in full where the reader can see it, title included", async () => {
    const composer = fakeComposer();
    const root = wire(composer);
    const pill = root.querySelectorAll(".hb-followups button")[0];
    expect(pill.getAttribute("title")).toBe("Plan the second day of my Kyoto itinerary");
    expect(pill.textContent).toContain("Plan day 2");
  });
});
