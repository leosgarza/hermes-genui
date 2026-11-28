// The drill-down: a click (or Enter) on a picked bar, point, segment or row opens a focused detail of that datum —
// one dialog, mounted beside the chart, while the chart itself is NEVER re-mounted behind it. These tests hold that
// line: node identity, the kept pick, the aria shape and the returns (Escape, the close control, the scrim).
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pinLocale } from "../../lib/locale.testing";
import { readBlocks } from "../../core/readBlocks";
import type { ChartBlock } from "./read";
import { Blocks } from "../../core/Blocks";
import { nearestXIndex } from "./Chart";

beforeEach(() => pinLocale("en-US"));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const chart = (raw: object) => readBlocks([{ type: "chart", ...raw }]) as ChartBlock[];

const revenue = () => chart({ kind: "bar", title: "Revenue", source: "exchange filings", unit: "$",
  x: ["Q1", "Q2", "Q3", "Q4"], series: [{ name: "Revenue", data: [4213500000, 1, 1, 1] }] });

/** Make jsdom measure the svg like a real drawing so pointer picks work (the layout width stays 560). */
function layoutLikeChrome(svg: Element) {
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    width: 560, height: 210, left: 0, top: 0, right: 560, bottom: 210, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
}

describe("chart drill-down (up-and-down charts)", () => {
  it("a click on a column opens the focused detail of that datum, not a re-drawn chart", () => {
    const { container } = render(<Blocks blocks={revenue()} />);
    const svg = container.querySelector<SVGSVGElement>("svg.hb-chart-svg")!;
    layoutLikeChrome(svg);
    expect(container.querySelector(".hb-chart-detail")).toBeNull();  // at rest, nothing extra is drawn
    fireEvent.pointerDown(svg, { clientX: 60, clientY: 60 });
    fireEvent.click(svg, { clientX: 60, clientY: 60 });
    const dialog = container.querySelector<HTMLElement>(".hb-chart-detail");
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("role")).toBe("dialog");
    expect(dialog!.getAttribute("aria-modal")).toBe("true");
    expect(dialog!.getAttribute("aria-label")).toBe("Chart details: Q1");
    expect(dialog!.textContent).toContain("Q1");
    expect(dialog!.textContent).toContain("4,213,500,000");  // the full value, not the shortened headline
    expect(dialog!.textContent).toContain("Column");
    expect(dialog!.textContent).toContain("exchange filings");  // provenance comes along
    expect(container.querySelectorAll("svg.hb-chart-svg").length).toBe(1);  // the ONE chart, never a second copy
  });

  it("a click after a drag across the drawing scrubs but does not open", () => {
    const { container } = render(<Blocks blocks={revenue()} />);
    const svg = container.querySelector<SVGSVGElement>("svg.hb-chart-svg")!;
    layoutLikeChrome(svg);
    fireEvent.pointerDown(svg, { clientX: 60, clientY: 60 });
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 60, buttons: 1 });
    fireEvent.click(svg, { clientX: 300, clientY: 60 });
    expect(container.querySelector(".hb-chart-detail")).toBeNull();
  });

  it("opens from the keyboard on the picked column, keeps the chart node, and returns to it", () => {
    const { container } = render(<Blocks blocks={revenue()} />);
    const svg = container.querySelector<SVGSVGElement>("svg.hb-chart-svg")!;
    expect(svg.getAttribute("aria-haspopup")).toBe("dialog");
    svg.focus();
    fireEvent.keyDown(svg, { key: "ArrowRight" });           // pick Q1
    const before = container.querySelector("svg.hb-chart-svg");
    fireEvent.keyDown(svg, { key: "Enter" });
    const dialog = container.querySelector<HTMLElement>(".hb-chart-detail")!;
    expect(dialog.textContent).toContain("Q1");
    expect(document.activeElement).toBe(dialog.querySelector("button"));  // the dialog owns the keyboard
    expect(container.querySelector("svg.hb-chart-svg")).toBe(before);     // the SAME chart node, never re-mounted
    fireEvent.keyDown(dialog.querySelector("button")!, { key: "Tab" });
    expect(document.activeElement).toBe(dialog.querySelector("button"));  // Tab cannot leave the dialog
    fireEvent.keyDown(dialog.querySelector("button")!, { key: "Escape" });
    expect(container.querySelector(".hb-chart-detail")).toBeNull();
    expect(container.querySelector("svg.hb-chart-svg")).toBe(before);     // still the same node after the round trip
    // the pick survived open and close: Q1 is still the one column fully lit
    const shades = [...container.querySelectorAll("path.hb-chart-bar")].map((b) => b.parentElement!.getAttribute("opacity"));
    expect(shades).toEqual(["1", "0.55", "0.55", "0.55"]);
    fireEvent.keyDown(container.querySelector("svg.hb-chart-svg")!, { key: "Enter" });  // and it reopens the same datum
    expect(container.querySelector<HTMLElement>(".hb-chart-detail")!.textContent).toContain("Q1");
  });

  it("the close control returns focus to the drawing and the scrim click closes", () => {
    const { container } = render(<Blocks blocks={revenue()} />);
    const svg = container.querySelector<SVGSVGElement>("svg.hb-chart-svg")!;
    layoutLikeChrome(svg);
    fireEvent.pointerDown(svg, { clientX: 60, clientY: 60 });
    fireEvent.click(svg, { clientX: 60, clientY: 60 });
    const dialog = container.querySelector<HTMLElement>(".hb-chart-detail")!;
    fireEvent.click(dialog.querySelector("button")!);
    expect(container.querySelector(".hb-chart-detail")).toBeNull();
    expect(document.activeElement).toBe(svg);
    fireEvent.pointerDown(svg, { clientX: 60, clientY: 60 });
    fireEvent.click(svg, { clientX: 60, clientY: 60 });
    fireEvent.click(container.querySelector<HTMLElement>(".hb-chart-detail")!);  // the scrim itself
    expect(container.querySelector(".hb-chart-detail")).toBeNull();
  });

  it("a histogram bin's detail counts its values and tells their share", () => {
    const { container } = render(<Blocks blocks={chart({ kind: "histogram", title: "Scores",
      x: ["50–60", "60–70", "70–80", "80–90"], series: [{ name: "Students", data: [1, 2, 2, 1] }] })} />);
    const svg = container.querySelector<SVGSVGElement>("svg.hb-chart-svg")!;
    svg.focus();
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    fireEvent.keyDown(svg, { key: "Enter" });
    const dialog = container.querySelector<HTMLElement>(".hb-chart-detail")!;
    expect(dialog.textContent).toContain("Bin");
    expect(dialog.textContent).toContain("50–60");
    expect(dialog.textContent).toContain("1 of 6 values");
  });
});

describe("chart drill-down (pies and rows)", () => {
  it("clicking a slice opens its share, and the pie keeps its picked slice after close", () => {
    const { container } = render(<Blocks blocks={chart({ kind: "donut", unit: "₹", title: "Budget",
      x: ["Stay", "Flights"], series: [{ name: "Amount", data: [18000, 2000] }] })} />);
    fireEvent.click(container.querySelectorAll("path.hb-slice")[0]);
    const dialog = container.querySelector<HTMLElement>(".hb-chart-detail")!;
    expect(dialog.getAttribute("aria-label")).toBe("Chart details: Stay");
    expect(dialog.textContent).toContain("₹18,000");
    expect(dialog.textContent).toContain("90% of total");
    expect(dialog.textContent).toContain("Slice");
    fireEvent.keyDown(dialog.querySelector("button")!, { key: "Escape" });
    const faded = [...container.querySelectorAll("path.hb-slice")].map((s) => s.getAttribute("opacity"));
    expect(faded).toEqual(["1", "0.5"]);  // the picked slice is still picked
  });

  it("clicking an hbar row opens that row's full values", () => {
    const { container } = render(<Blocks blocks={chart({ kind: "hbar", x: ["HDFC", "ICICI"], unit: "%",
      series: [{ name: "2025", data: [10, 12] }] })} />);
    fireEvent.pointerDown(container.querySelector(".hb-hbar-label")!, {});
    fireEvent.click(container.querySelector(".hb-hbar-label")!, {});
    const dialog = container.querySelector<HTMLElement>(".hb-chart-detail")!;
    expect(dialog.textContent).toContain("HDFC");
    expect(dialog.textContent).toContain("Row");
    expect(dialog.textContent).toContain("10%");
    fireEvent.keyDown(dialog.querySelector("button")!, { key: "Escape" });
    expect(container.querySelector(".hb-chart-detail")).toBeNull();
  });
});

describe("scatter drill-down reads the clicked dot, not the x", () => {
  // Two points sharing an x value are drawn AT the same pixel: a nearest-x lookup cannot tell which one was
  // clicked and keeps the first — the wrong datum, material for the reader's numbers. Each dot therefore
  // carries its own point index and the pick takes it from the element under the pointer; the detail says
  // which point it is ("Point 2 of 2"), so even exact duplicates each open their own.
  const dots = (raw: { x?: number[]; series: { name?: string; data: number[] }[] }) =>
    chart({ kind: "scatter", title: "Size vs price", unit: "kg",
      series: raw.series.map((s) => ({ name: s.name, points: s.data.map((y, p) => ({ x: raw.x?.[p], y })) })) });
  const values = (dialog: Element) => [...dialog.querySelectorAll(".hb-detail-value")].map((v) => v.textContent);

  const clickDot = (container: HTMLElement, k: number) => {
    const svg = container.querySelector<SVGSVGElement>("svg.hb-chart-svg")!;
    layoutLikeChrome(svg);
    const mark = container.querySelectorAll("circle.hb-chart-dot")[k];
    fireEvent.pointerDown(mark, { clientX: 280, clientY: 60 });
    fireEvent.click(mark, { clientX: 280, clientY: 60 });
    return container.querySelector<HTMLElement>(".hb-chart-detail")!;
  };

  it("a repeated x: clicking the SECOND dot opens the second point's value, not the first's", () => {
    const { container } = render(<Blocks blocks={dots({ x: [1, 1], series: [{ name: "Values", data: [10, 90] }] })} />);
    expect(container.querySelectorAll("circle.hb-chart-dot").length).toBe(2);  // one px, two dots
    const dialog = clickDot(container, 1);
    expect(values(dialog)).toEqual(["90 kg"]);
    expect(dialog.textContent).toContain("Point 2 of 2");
  });

  it("exact duplicates: each dot opens its OWN detail, named by index", () => {
    const { container } = render(<Blocks blocks={dots({ x: [1, 1], series: [{ name: "Values", data: [90, 90] }] })} />);
    const first = clickDot(container, 0);
    expect(first.textContent).toContain("Point 1 of 2");
    fireEvent.keyDown(first.querySelector("button")!, { key: "Escape" });
    const second = clickDot(container, 1);
    expect(second.textContent).toContain("Point 2 of 2");
  });

  it("a repeated x across two series: the clicked dot's own index carries its pair", () => {
    const { container } = render(<Blocks blocks={dots({ x: [1, 1],
      series: [{ name: "A", data: [10, 20] }, { name: "B", data: [70, 80] }] })} />);
    // drawn A0, A1, B0, B1: the click lands on B's second dot, whose pair at index 1 is 20 kg / 80 kg
    const dialog = clickDot(container, 3);
    expect(values(dialog)).toEqual(["20 kg", "80 kg"]);
    expect(dialog.textContent).toContain("Point 2 of 2");
  });

  it("control — an ordinary distinct x still opens the clicked point", () => {
    const { container } = render(<Blocks blocks={dots({ x: [1, 2, 4], series: [{ name: "Samples", data: [10, 14, 12] }] })} />);
    const dialog = clickDot(container, 2);
    expect(values(dialog)).toEqual(["12 kg"]);
    expect(dialog.textContent).toContain("Point 3 of 3");
  });

  it("negative control: a nearest-x lookup on the repeated-x geometry picks the WRONG point", () => {
    // x = [1, 1] puts both dots at one px; the loop's tie keeps index 0 — "10 kg", not the clicked "90 kg".
    expect(nearestXIndex(() => 280, 2, 280)).toBe(0);
  });
});

describe("coincident scatter dots: a real click reaches EACH point at the spot", () => {
  // Two points at the same x AND the same y draw at the same pixel, and the topmost circle covers the other
  // for real pointer hit testing — a browser can never target the one beneath. So a spot holding several
  // points is a CLUSTER: the first real click opens its first datum, and repeated clicks at the same spot
  // cycle through the rest (wrapping). The marker carries a small ×n badge, and the detail says which
  // datum at the spot is being shown. Keyboard arrows already reach every index, each its own datum.
  const dots = (raw: { x?: number[]; series: { name?: string; data: number[] }[] }) =>
    chart({ kind: "scatter", title: "Size vs price", unit: "kg",
      series: raw.series.map((s) => ({ name: s.name, points: s.data.map((y, p) => ({ x: raw.x?.[p], y })) })) });
  const values = (dialog: Element) => [...dialog.querySelectorAll(".hb-detail-value")].map((v) => v.textContent);

  const clickDot = (container: HTMLElement, k: number) => {
    const svg = container.querySelector<SVGSVGElement>("svg.hb-chart-svg")!;
    layoutLikeChrome(svg);
    const mark = container.querySelectorAll("circle.hb-chart-dot")[k];
    fireEvent.pointerDown(mark, { clientX: 280, clientY: 60 });
    fireEvent.click(mark, { clientX: 280, clientY: 60 });
    return container.querySelector<HTMLElement>(".hb-chart-detail")!;
  };
  const closeDetail = (dialog: HTMLElement) => fireEvent.keyDown(dialog.querySelector("button")!, { key: "Escape" });

  it("successive clicks on the TOPMOST dot — all a browser can hit — open each coincident point in turn", () => {
    const { container } = render(<Blocks blocks={dots({ x: [1, 1], series: [{ name: "Values", data: [50, 50] }] })} />);
    const top = 1;  // the last-painted circle: elementFromPoint never returns the other one
    const first = clickDot(container, top);
    expect(first.textContent).toContain("Point 1 of 2");   // the cluster's FIRST datum, not the top one
    expect(first.textContent).toContain("1st of 2 here");
    closeDetail(first);
    const second = clickDot(container, top);               // the same element, the same pixel
    expect(second.textContent).toContain("Point 2 of 2");
    expect(second.textContent).toContain("2nd of 2 here");
    closeDetail(second);
    const wrapped = clickDot(container, top);              // and it wraps
    expect(wrapped.textContent).toContain("Point 1 of 2");
  });

  it("hovering a cluster spot previews the datum the NEXT click will open", () => {
    // The disclosure of this design is a preview, not a lag: the point lit under the pointer must be the one
    // a click commits. After the spot's first datum has been opened (cycle position 0), moving the pointer
    // back onto the spot — the only circle a browser can ever hit — must light the NEXT member, and the
    // ensuing click must open exactly that datum. (RED on the first round-2 cut, which re-lit the last-opened
    // point instead: the hover said one datum and the click opened another.)
    const { container } = render(<Blocks blocks={dots({ x: [1, 1], series: [{ name: "Values", data: [50, 50] }] })} />);
    const marks = () => [...container.querySelectorAll<SVGCircleElement>("circle.hb-chart-dot")];
    const lit = () => marks().findIndex((c) => c.getAttribute("opacity") === "1");
    closeDetail(clickDot(container, 1));                  // opens the spot's FIRST datum; the pick survives the close
    expect(lit()).toBe(0);
    fireEvent.pointerMove(marks()[1], { clientX: 280, clientY: 60, pointerType: "mouse" });  // the topmost circle
    expect(lit()).toBe(1);                                // the preview moved to what the next click commits
    const next = clickDot(container, 1);
    expect(next.textContent).toContain("2nd of 2 here");  // and the click opened exactly that
    closeDetail(next);
  });

  it("a spot holding several points wears an ×n badge; ordinary charts wear none", () => {
    const twin = render(<Blocks blocks={dots({ x: [1, 1], series: [{ name: "Values", data: [50, 50] }] })} />);
    const badges = [...twin.container.querySelectorAll("text.hb-chart-cluster")];
    expect(badges.map((b) => b.textContent)).toEqual(["×2"]);
    cleanup();
    const lone = render(<Blocks blocks={dots({ x: [1, 2, 4], series: [{ name: "Samples", data: [10, 14, 12] }] })} />);
    expect(lone.container.querySelectorAll("text.hb-chart-cluster").length).toBe(0);
    // same x, different y: separate pixels, separate dots, no cluster
    const near = render(<Blocks blocks={dots({ x: [1, 1], series: [{ name: "Values", data: [10, 90] }] })} />);
    expect(near.container.querySelectorAll("text.hb-chart-cluster").length).toBe(0);
  });

  it("a coincident pair ACROSS series opens each series's own pair", () => {
    // A0 (x 1, 50 kg) and B2 (x 1, 50 kg) sit at one pixel; the pair's own rows tell them apart.
    const { container } = render(<Blocks blocks={dots({ x: [1, 2, 1],
      series: [{ name: "A", data: [50, 90, 7] }, { name: "B", data: [4, 9, 50] }] })} />);
    const marks = [...container.querySelectorAll<SVGCircleElement>("circle.hb-chart-dot")];
    // drawn A0 A1 A2 B0 B1 B2 — B2 (DOM mark 5) paints last over A0 (mark 0) at the x=1, 50 kg px
    expect(marks.map((m) => m.dataset.pt)).toEqual(["0", "1", "2", "0", "1", "2"]);
    const first = clickDot(container, 5);
    expect(values(first)).toEqual(["50 kg", "4 kg"]);  // index 0's pair
    expect(first.textContent).toContain("1st of 2 here");
    closeDetail(first);
    const second = clickDot(container, 5);
    expect(values(second)).toEqual(["7 kg", "50 kg"]);  // index 2's pair
    expect(second.textContent).toContain("2nd of 2 here");
  });

  it("the keyboard cycles the cluster too: each coincident point opens its own detail", () => {
    const { container } = render(<Blocks blocks={dots({ x: [1, 1], series: [{ name: "Values", data: [50, 50] }] })} />);
    const svg = container.querySelector<SVGSVGElement>("svg.hb-chart-svg")!;
    svg.focus();
    fireEvent.keyDown(svg, { key: "ArrowRight" });   // pick point 1
    fireEvent.keyDown(svg, { key: "Enter" });
    const first = container.querySelector<HTMLElement>(".hb-chart-detail")!;
    expect(first.textContent).toContain("Point 1 of 2");
    fireEvent.keyDown(first.querySelector("button")!, { key: "Escape" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });   // pick point 2 — its own datum, not the same pixel
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(container.querySelector(".hb-chart-detail")!.textContent).toContain("Point 2 of 2");
  });

  it("a click somewhere else resets the cycle — the spot starts at its first datum again", () => {
    const { container } = render(<Blocks blocks={dots({ x: [1, 1, 3], series: [{ name: "Values", data: [50, 50, 20] }] })} />);
    closeDetail(clickDot(container, 1));                       // opens 1st of 2 here
    closeDetail(clickDot(container, 2));                       // elsewhere: Point 3 of 3
    const again = clickDot(container, 1);                      // back to the spot — its FIRST datum again
    expect(again.textContent).toContain("1st of 2 here");
  });
});
