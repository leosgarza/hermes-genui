// How the board looks — density, chart palette and motion, all the model's alone (enhancement #7).
// The words ride the stored envelope beside align; the renderer reads them leniently (anything unknown is as
// unsaid) and marks the root ONLY for an ask that isn't the default — comfortable, default colours and full
// motion are the attributes ABSENT, so every board drawn before these words existed keeps its exact DOM and
// its exact rhythm. There is no reader control anywhere: like alignment, the model's cascade is the whole rule.
// The pixels that make compact compact (and cool cool) live in tokens.css; Chrome measures them for real in
// tests/test_visual_adaptive_chrome.py — what jsdom asserts here is the attribute surface and the reading.
import { cleanup, render } from "@testing-library/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Blocks } from "./Blocks";
import { readBlocksNoted } from "./readBlocks";
import { density, motion, palette } from "./fields";
import { lessMotion, MotionScope, useLessMotion } from "../lib/motion";
import { withStyles } from "./testing";
import tokens from "../styles/tokens.css?raw";
import motionSrc from "../lib/motion?raw";
import shared from "../styles/shared.css?raw";

let unstyle: () => void;
beforeAll(() => (unstyle = withStyles(tokens)));
afterAll(() => unstyle());

const TEXT = { type: "text", text: "Hi" };

const draw = (data: unknown) => {
  const noted = readBlocksNoted(data);
  return render(
    <Blocks blocks={noted.blocks} boardAlign={noted.align} boardTextAlign={noted.textAlign}
      boardDensity={noted.density} boardPalette={noted.palette} boardMotion={noted.motion} />,
  ).container;
};

describe("the look words read leniently", () => {
  it("takes its words trimmed and caseless, and treats a wrong word as unsaid", () => {
    expect(density(" Compact ")).toBe("compact");
    expect(density("COMFORTABLE")).toBe("comfortable");
    expect(density("tight")).toBeUndefined();
    expect(density(3)).toBeUndefined();
    expect(palette("Cool")).toBe("cool");
    expect(palette("warm")).toBe("warm");
    expect(palette("default")).toBe("default");
    expect(palette("neon")).toBeUndefined();
    expect(motion(" reduced ")).toBe("reduced");
    expect(motion("FULL")).toBe("full");
    expect(motion("off")).toBeUndefined();
  });

  it("reads the envelope beside align, as written", () => {
    const noted = readBlocksNoted({ align: "center", density: "compact", palette: "cool", motion: "reduced",
      blocks: [TEXT] });
    expect([noted.align, noted.density, noted.palette, noted.motion]).toEqual(["center", "compact", "cool", "reduced"]);
  });

  it("says nothing for a lone block that merely carries a look word, or for junk words", () => {
    const block = readBlocksNoted({ type: "text", text: "Hi", density: "compact" });
    expect(block.density).toBeUndefined();
    const junk = readBlocksNoted({ density: 1, palette: ["cool"], motion: { less: true }, blocks: [TEXT] });
    expect([junk.density, junk.palette, junk.motion]).toEqual([undefined, undefined, undefined]);
    const absent = readBlocksNoted([TEXT]);
    expect([absent.density, absent.palette, absent.motion]).toEqual([undefined, undefined, undefined]);
  });
});

describe("the root wears only asks that aren't the default", () => {
  afterEach(cleanup);

  const lookOf = (data: unknown) => {
    const root = draw(data).querySelector(".hb-blocks")!;
    return [root.getAttribute("data-density"), root.getAttribute("data-palette"), root.getAttribute("data-motion")];
  };

  it("marks compact, cool/warm and reduced", () => {
    expect(lookOf({ density: "compact", blocks: [TEXT] })).toEqual(["compact", null, null]);
    expect(lookOf({ palette: "cool", blocks: [TEXT] })).toEqual([null, "cool", null]);
    expect(lookOf({ palette: "warm", motion: "reduced", blocks: [TEXT] })).toEqual([null, "warm", "reduced"]);
  });

  it("draws the very DOM an unsaid board draws: defaults, unknown words and junk grow no attribute", () => {
    const plain = draw([TEXT]).querySelector(".hb-blocks")!.outerHTML;
    expect(lookOf({ density: "comfortable", palette: "default", motion: "full", blocks: [TEXT] }))
      .toEqual([null, null, null]);
    expect(lookOf({ density: "tight", palette: "neon", motion: "off", blocks: [TEXT] })).toEqual([null, null, null]);
    expect(draw({ density: "comfortable", blocks: [TEXT] }).querySelector(".hb-blocks")!.outerHTML).toBe(plain);
  });
});

describe("the tokens behind the words", () => {
  it("comfortable ships the rhythm boards have always had, and no attribute changes it", () => {
    // The default declarations in tokens.css: the exact numbers every existing board measures. compact may only
    // ever retighten them; this test pins the comfortable side so the compact rule can never drift the default.
    expect(tokens).toMatch(/--hb-gap: 10px;/);
    expect(tokens).toMatch(/--hb-margin: 8px;/);
    expect(tokens).toMatch(/--hb-card-pad-y: 14px;/);
    expect(tokens).toMatch(/--hb-card-pad-x: 16px;/);
    expect(tokens).toMatch(/gap: var\(--hb-gap, 10px\);/);
  });

  it("compact tightens every rhythm token, and cool/warm recolour only the eight chart series", () => {
    const compact = tokens.match(/\.hb-blocks\[data-density="compact"\]\s*\{([^}]*)\}/)![1];
    for (const pair of ["--hb-gap: 5px", "--hb-margin: 4px", "--hb-card-pad-y: 9px", "--hb-card-pad-x: 12px"]) {
      expect(compact).toContain(pair);
    }
    for (const name of ["cool", "warm"]) {
      const set = tokens.match(new RegExp(`\\.hb-blocks\\[data-palette="${name}"\\]\\s*\\{([^}]*)\\}`))![1];
      const colours = set.match(/#[0-9a-f]{6}/g)!;
      expect(colours.length).toBe(8);
      expect(new Set(colours).size).toBe(8);  // neighbours (and everything else) stay apart
      expect(set).not.toMatch(/--hb-accent|--hb-ink|--hb-warn|--foreground|--theme-primary/);  // themes untouched
    }
  });

  it("reduced stills CSS motion for the board and keeps every prefers-reduced-motion block intact", () => {
    expect(tokens).toMatch(/\.hb-blocks\[data-motion="reduced"\][^{]*\{[^}]*animation: none !important/);
    expect(tokens).toMatch(/\.hb-blocks\[data-motion="reduced"\][^{]*\{[^}]*transition: none !important/);
    // The OS floor lives in the shipped media blocks (shared.css and the per-block sheets) and my word can
    // only ADD stillness: those blocks must survive the build untouched.
    expect(shared).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe("the motion word reaches the drawings that animate by hand", () => {
  afterEach(cleanup);

  const Probe = () => {
    const less = useLessMotion();
    return <span data-less={less ? "yes" : "no"} />;
  };
  const ask = (pref?: "full" | "reduced", matches = false) => {
    const mm = globalThis.window.matchMedia;
    // @ts-expect-error test stub: the OS ask, on or off
    globalThis.window.matchMedia = matches ? () => ({ matches: true }) : undefined;
    try {
      const el = render(pref === undefined
        ? <Probe />
        : <MotionScope.Provider value={pref}><Probe /></MotionScope.Provider>).container.firstElementChild!;
      return [el.getAttribute("data-less"), lessMotion()] as const;
    } finally {
      globalThis.window.matchMedia = mm;
    }
  };

  it("asks full once and lands at once when the board's word says reduced", () => {
    expect(ask("reduced")).toEqual(["yes", false]);
  });

  it("a default, full or absent word keeps today's behaviour", () => {
    expect(ask("full")).toEqual(["no", false]);
    expect(ask()).toEqual(["no", false]);
  });

  it("the reader's own ask stills everything whatever the model said — the floor never comes off", () => {
    expect(ask("full", true)).toEqual(["yes", true]);
    expect(ask(undefined, true)).toEqual(["yes", true]);
    expect(ask("reduced", true)).toEqual(["yes", true]);
  });


  // Hook order is a React contract: every render of one component must call the same hooks in the same
  // order. `lessMotion() || useContext(...)` SHORT-CIRCUITS — when the OS ask is true the useContext never
  // runs — so the first render after a preference change calls one hook fewer (or one more) than its
  // neighbour and every later hook lands on the wrong slot. This React build does not announce it; it
  // corrupts silently, and the real drawings are exactly the exposed shape: Flow.tsx keeps its `travelling`
  // state BEFORE the ask and the packet flight's layout effect AFTER it; Layers.tsx useOpening writes
  // `now.current = open` on a useRef immediately AFTER the ask. A reader flipping their system setting with
  // a board on screen hit one of these. Both probes re-render the SAME mount across OS-ask flips in both
  // directions (fresh element literals — the same element object would be React's bailout and re-run nothing).
  const SENTINEL = 7;
  let flowRuns = 0;
  let flowCleans = 0;
  const FlowLike = () => {                      // Flow.tsx useTravel shape: state, ask, self-cleaning effect
    const [n] = useState(SENTINEL);             // travelling, read BEFORE the ask
    const less = useLessMotion();               // the seam under test
    useLayoutEffect(() => {                     // the packet flight's effect, hooked AFTER the ask
      flowRuns += 1;
      return () => { flowCleans += 1; };
    });
    return <span data-less={less ? "yes" : "no"} data-n={n} />;
  };
  const LayerLike = () => {                     // Layers.tsx useOpening shape: state, ask, ref write after
    const [n] = useState(SENTINEL);             // open
    const less = useLessMotion();               // the seam under test
    const now = useRef<number[]>([]);           // now, AFTER the ask — slot-shift lands it on the ctx VALUE
    now.current = [n];                          // a primitive here throws TypeError (strict) on a shifted slot
    useEffect(() => {});                        // the glide effect, one slot later still
    return <span data-less={less ? "yes" : "no"} data-n={n} />;
  };
  const setAsk = (on: boolean) => {
    const mm = globalThis.window.matchMedia;
    // @ts-expect-error test stub: the OS ask, toggled mid-mount
    globalThis.window.matchMedia = on ? () => ({ matches: true }) : undefined;
    return () => (globalThis.window.matchMedia = mm);
  };

  it("the OS ask turning OFF mid-mount never orphan a mounted flow drawing's effect", () => {
    const restore = setAsk(true);
    flowRuns = 0; flowCleans = 0;
    try {
      const mounted = render(<FlowLike />);
      const seen = () => [mounted.container.firstElementChild!.getAttribute("data-less"),
        mounted.container.firstElementChild!.getAttribute("data-n"), flowRuns, flowCleans] as const;
      expect(seen()).toEqual(["yes", String(SENTINEL), 1, 0]);   // mounted while the OS asks for less
      setAsk(false);                                             // reader un-asks while the board is on screen
      mounted.rerender(<FlowLike />);                            // useContext appears: every later hook shifts
      expect(seen()).toEqual(["no", String(SENTINEL), 2, 1]);    // one more run, and its predecessor CLEANED UP
      setAsk(true);                                              // ...and the flip back, same mount
      mounted.rerender(<FlowLike />);                            // useContext vanishes: hooks shift again
      expect(seen()).toEqual(["yes", String(SENTINEL), 3, 2]);
    } finally {
      restore();
    }
  });

  // Honest disclosure: React 19.3.1 (measured on this build) does NOT consume a queue slot for useContext —
  // flipping the OS ask mid-mount keeps the state setter and the effect cleanup pairing intact on the buggy
  // short-circuit body too (probe: sameSetter stable, runs=cleans+1 across both flips, no throw). So the two
  // behavioural tests above document the invariant a stricter React enforces but cannot redden HERE. The seam
  // contract itself is therefore pinned at the source, the same way this file pins tokens.css: useContext is
  // read unconditionally, OUTSIDE the || chain, and the answers are combined after. This assertion reddens on
  // the short-circuit body and holds on the fixed one.
  it("the seam reads the context unconditionally — hook order never short-circuits", () => {
    expect(motionSrc).toMatch(/const word = useContext\(MotionScope\);\s*return lessMotion\(\) \|\| word === "reduced";/);
    expect(motionSrc).not.toMatch(/lessMotion\(\)\s*\|\|\s*useContext/);
  });

  it("the OS ask turning ON mid-mount never lands a mounted layers drawing's ref on the wrong slot", () => {
    const restore = setAsk(false);
    try {
      const tree = () => (
        <MotionScope.Provider value="reduced"><LayerLike /></MotionScope.Provider>
      );
      const mounted = render(tree());
      const at = () => [mounted.container.firstElementChild!.getAttribute("data-less"),
        mounted.container.firstElementChild!.getAttribute("data-n")] as const;
      expect(at()).toEqual(["yes", String(SENTINEL)]);           // the word alone stills; slots: state, ctx, ref, effect
      setAsk(true);                                              // OS asks too — the short-circuit skips useContext
      mounted.rerender(tree());                                  // ref would pop the ctx VALUE slot and write onto it
      expect(at()).toEqual(["yes", String(SENTINEL)]);
      setAsk(false);
      mounted.rerender(tree());                                  // ...and back the other way, same mount
      expect(at()).toEqual(["yes", String(SENTINEL)]);
    } finally {
      restore();
    }
  });
});
