// Where blocks sit in the board's column — or in the cell a container gave them: a block that asks with `align` is
// placed, a board default from the stored envelope cascades to every block that didn't ask, wherever it sits, the
// block's own word beats it, and the reader's own choice (user override) beats everything. Placement resolves
// recursively: containers draw their children through the same path, so a nested block is placed inside its own
// cell and the container keeps the layout it owns. A placed block is drawn inside a .hb-place wrapper; left is how
// blocks sit already, so an unplaced board keeps the DOM exactly as it was.
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import catalog from "../../../core/catalog.json";
import type { Align } from "./fields";
import { Blocks } from "./Blocks";
import { readBlocksNoted } from "./readBlocks";
import { withStyles } from "./testing";
import tokens from "../styles/tokens.css?raw";
import shared from "../styles/shared.css?raw";
import chartCss from "../blocks/chart/chart.css?raw";
import tableCss from "../blocks/table/table.css?raw";
import calcCss from "../blocks/calculator/calculator.css?raw";
import formCss from "../blocks/form/form.css?raw";

let unstyle: () => void;
beforeAll(() => (unstyle = withStyles(tokens, shared, chartCss, tableCss, calcCss, formCss)));
afterAll(() => unstyle());

const draw = (data: unknown, opts: { boardAlign?: Align; userAlign?: Align } = {}) => {
  const noted = readBlocksNoted(data);
  const blocks = noted.blocks;
  return render(<Blocks blocks={blocks} boardAlign={opts.boardAlign ?? noted.align} userAlign={opts.userAlign} />).container;
};

const TEXT = { type: "text", text: "Hi" };
const CALC = { type: "calculator", sliders: [{ name: "p", title: "Loan", max: 100, value: 40 }], results: [{ label: "Half", formula: "p / 2" }] };

describe("block placement", () => {
  afterEach(cleanup);

  it("leaves the board alone when nobody asks: no wrapper, blocks fill the column as they always did", () => {
    const root = draw([TEXT, CALC]);
    expect(root.querySelector(".hb-place")).toBeNull();
    const blocks = root.querySelector(".hb-blocks")!;
    expect(blocks.children.length).toBe(2);
    expect(blocks.firstElementChild!.classList.contains("hb-text")).toBe(true);
  });

  it("draws a block that asks for center inside a centered place", () => {
    const root = draw([{ ...TEXT, align: "center" }]);
    const place = root.querySelector(".hb-place")!;
    expect([place.className, place.getAttribute("data-align")]).toEqual(["hb-place hb-place-center", "center"]);
    expect(place.querySelector(".hb-text")).toBeTruthy();
  });

  it("draws a block that asks for right inside a right place", () => {
    const place = draw([{ ...CALC, align: "right" }]).querySelector(".hb-place")!;
    expect([place.getAttribute("data-align"), place.querySelector(".hb-calc") !== null]).toEqual(["right", true]);
  });

  it("asks for left the way a board already sits, so it needs no place at all", () => {
    const root = draw([{ ...TEXT, align: "left" }]);
    expect(root.querySelector(".hb-place")).toBeNull();
  });

  it("cascades the board's default to every block that didn't ask", () => {
    const root = draw({ align: "right", blocks: [TEXT, { ...CALC }] });
    const places = [...root.querySelectorAll(".hb-place")];
    expect(places.map((p) => p.getAttribute("data-align"))).toEqual(["right", "right"]);
    expect(root.querySelector(".hb-blocks")!.children.length).toBe(2);  // one place per block, nothing added between
  });

  it("lets a block's own word override the board's default", () => {
    const root = draw({ align: "center", blocks: [{ ...TEXT, align: "left" }, { ...CALC, align: "right" }, CALC] });
    const places = [...root.querySelectorAll(".hb-place")];
    expect(places.map((p) => p.getAttribute("data-align"))).toEqual(["right", "center"]);  // left block sits unplaced; right beats center
  });

  it("puts the reader's choice above the model's and above the board's", () => {
    const asked = { align: "center", blocks: [{ ...TEXT, align: "right" }] };
    expect(draw(asked, { userAlign: "left" }).querySelector(".hb-place")).toBeNull();          // left is how it sits anyway
    const centered = draw(asked, { userAlign: "center" }).querySelector(".hb-place")!;
    expect(centered.getAttribute("data-align")).toBe("center");
    expect(draw([TEXT, { ...CALC, align: "center" }], { userAlign: "right" }).querySelectorAll(".hb-place").length).toBe(2);
  });

  it("places a container itself, and reaches its children with the same rules", () => {
    const root = draw({ align: "center", blocks: [{ type: "grid", children: [TEXT, { ...CALC, align: "right" }] }] });
    const place = root.querySelector(".hb-place")!;
    expect(place.getAttribute("data-align")).toBe("center");
    const grid = place.querySelector(".hb-grid")!;
    expect(grid.querySelectorAll(":scope > .hb-grid-cell").length).toBe(2);   // the grid still owns its cells
    const cells = [...grid.children] as HTMLElement[];
    // the child that didn't ask takes the board default; the child that asked wins its own word inside its cell
    expect(cells[0].querySelector(":scope > .hb-place[data-align='center'] > .hb-text")).toBeTruthy();
    expect(cells[1].querySelector(":scope > .hb-place[data-align='right'] > .hb-calc")).toBeTruthy();
  });

  it("puts the reader's choice above nested blocks too", () => {
    const nested = [{ type: "grid", children: [{ ...TEXT, align: "right" }, CALC] }];
    const centered = draw(nested, { userAlign: "center" });
    const places = [...centered.querySelectorAll(".hb-place")];
    expect(places.length).toBe(3);                                          // the grid and both children
    expect(places.every((p) => p.getAttribute("data-align") === "center")).toBe(true);
    expect(draw(nested, { userAlign: "left" }).querySelector(".hb-place")).toBeNull();  // left is how they sit anyway
  });

  it("places nested blocks in every container shape: row, section, tabs", () => {
    const root = draw({ align: "center", blocks: [
      { type: "row", children: [TEXT, { type: "stat", label: "Seats", value: 12 }] },
      { type: "section", title: "Picks", children: [TEXT] },
      { type: "tabs", tabs: [{ label: "One", children: [{ ...TEXT, align: "right" }] }, { label: "Two", children: [{ type: "text", text: "Other" }] }] },
    ] });
    expect(root.querySelector(".hb-row > .hb-row-cell > .hb-place[data-align='center'] > .hb-text")).toBeTruthy();
    expect(root.querySelector(".hb-section-body > .hb-place[data-align='center'] > .hb-text")).toBeTruthy();
    expect(root.querySelector(".hb-tab-panel > .hb-place[data-align='right'] > .hb-text")).toBeTruthy();
  });

  it("places each block of a row drawn as a stack", () => {
    // A row holding a wide block is flattened by the reader; the row's word follows the stack.
    const root = draw([{ type: "row", align: "right", children: [TEXT, { ...CALC }] }]);
    expect([...root.querySelectorAll(".hb-place")].map((p) => p.getAttribute("data-align"))).toEqual(["right", "right"]);
  });
});

describe("placement within the column's widths", () => {
  // Behavior, not pixels: a placed card keeps the cap it had unplaced, a full-width block is not made narrower or
  // wider by being placed, and placing a board never reaches inside a container.
  afterEach(cleanup);

  const example = (kind: string) => catalog.blocks.find((b) => b.kind === kind)!.example;
  const style = (root: HTMLElement, selector: string) => getComputedStyle(root.querySelector(selector)!);

  it("keeps a centered calculator and a right-aligned form to their 720px reading width", () => {
    const root = draw([{ ...CALC, align: "center" }, { ...example("form"), align: "right" }]);
    expect(style(root, ".hb-blocks > .hb-place > .hb-calc").maxWidth).toBe("720px");
    expect(style(root, ".hb-blocks > .hb-place > .hb-form").maxWidth).toBe("720px");
  });

  it("caps a centered chart, and leaves a long line at the board's width", () => {
    cleanup();
    const root = draw([{ ...example("chart"), align: "center" }]);
    expect(style(root, ".hb-blocks > .hb-place > .hb-chart").maxWidth).toBe("720px");
    const x = Array.from({ length: 60 }, (_, i) => `d${i}`);
    const wide = draw([{ type: "chart", kind: "line", x, series: [{ data: x.map((_, i) => i) }], align: "center" }]);
    expect(style(wide, ".hb-blocks > .hb-place > .hb-chart").maxWidth).toBe("none");
  });

  it("lets a full-width table hug its columns, placed or not", () => {
    expect(style(draw([{ ...example("table"), align: "center" }]), ".hb-blocks > .hb-place > .hb-table-card").width).toBe("fit-content");
    expect(style(draw([example("table")]), ".hb-blocks > .hb-table-card").width).toBe("fit-content");
  });

  it("reaches inside a container without taking over its cells", () => {
    // (a grid with one child is drawn as just that child, so it needs two to stay a grid — as in widths.test)
    const root = draw({ align: "center", blocks: [{ type: "grid", children: [CALC, { type: "text", text: "Beside it" }] }] });
    expect(root.querySelector(".hb-blocks > .hb-place > .hb-grid")).toBeTruthy();
    // inside the cell the card fills its cell as unplaced: no top-level cap reaches into a container
    expect(style(root, ".hb-grid-cell > .hb-place > .hb-calc").maxWidth).toBe("none");
  });

  it("keeps a placed card's cap by its own cap rule, not by the place's layout", () => {
    // jsdom can't measure layout (the Chrome regression in tests/ does); what it can prove is the structure the
    // browser test pins its selectors to: the place is a block box, the capped card sits directly inside it.
    const root = draw([{ ...CALC, align: "center" }]);
    const place = root.querySelector(".hb-place")!;
    expect(place.getAttribute("class")).toBe("hb-place hb-place-center");
    expect(place.firstElementChild!.classList.contains("hb-calc")).toBe(true);
  });
});
