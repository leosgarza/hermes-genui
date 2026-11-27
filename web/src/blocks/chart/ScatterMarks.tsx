// Scatter: a dot at every pair, none joined. The dots keep their series colours, fade like columns do while one
// x label is picked, and sit wherever the layout says (by value when the x labels are numbers, evenly spaced
// else). Each carries its point index: two points sharing an x draw AT the same pixel, so the pointer — not an
// x lookup — has to say which one it is on (Chart.tsx's dotIndex reads this).
// Dots that share an x AND a y draw at one pixel, and SVG hit testing can only ever return the topmost circle —
// the points beneath could never be clicked at all. So the renderer groups dots by their exact drawn position
// (dotSpots): a spot holding several points wears a small ×n badge so the reader can see they are there, and
// Chart.tsx cycles successive clicks at that spot through its points. The dots themselves never move.
import type { ChartSpec } from "./chartData";
import { partColour } from "./chartData";
import type { XYLayout } from "./layout";

type Props = { spec: ChartSpec; layout: XYLayout; hover: number | null };

const shade = (hover: number | null, i: number) => (hover === null || hover === i ? 1 : 0.55);

/** One drawn dot position: where it sits, the key that names its pixel, every point index drawn there
 *  (ascending, across series) and the colour of the first dot painted at it. */
export type DotSpot = { x: number; y: number; key: string; members: number[]; colour: string };

/** The scatter's dots grouped by exact drawn position — one spot per pixel. Equal labels and equal values
 *  compute equal floats, so points that coincide to the pixel always share a key; nothing else ever joins. */
export function dotSpots(spec: ChartSpec, layout: XYLayout): DotSpot[] {
  const spots = new Map<string, DotSpot>();
  spec.series.forEach((s, k) => s.data.forEach((v, i) => {
    if (v === null) return;
    const x = layout.xAt(i);
    const y = layout.yOf(s)(v);
    const key = `${x.toFixed(2)},${y.toFixed(2)}`;
    const at = spots.get(key);
    if (!at) spots.set(key, { x, y, key, members: [i], colour: partColour(k) });
    else if (!at.members.includes(i)) at.members.push(i);
  }));
  return [...spots.values()].map((s) => ({ ...s, members: s.members.sort((a, b) => a - b) }));
}

export function ScatterMarks({ spec, layout, hover }: Props) {
  const spots = dotSpots(spec, layout);
  return (
    <g>
      {spec.series.map((s, k) => s.data.map((v, i) => v === null ? null : (
        <circle key={`${k}-${i}`} data-pt={i} cx={layout.xAt(i)} cy={layout.yOf(s)(v)} r="4" fill={partColour(k)}
          opacity={shade(hover, i)} className="hb-chart-dot" />
      )))}
      {spots.filter((s) => s.members.length > 1).map((s) => (
        <text key={s.key} x={s.x + 5} y={s.y - 6} fill={s.colour} className="hb-chart-cluster" aria-hidden="true"
          opacity={hover === null || s.members.includes(hover) ? 1 : 0.55}>×{s.members.length}</text>
      ))}
    </g>
  );
}
