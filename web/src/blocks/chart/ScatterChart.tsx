// A scatter: one dot per point on two numeric scales, a colour per group. The x labels are numbers, not names, so the
// drawing carries round values along the bottom as well as up the side, and the title names the two axes ("Price
// against mileage"). Points are read left to right, then top to bottom, which is the order the arrow keys walk.
// A click (or Enter) on a dot drills into that datum — one detail dialog beside the drawing, which keeps its pick
// through open and close. Dots that draw at one pixel are a CLUSTER (hit testing can only ever return the topmost
// circle), so repeated clicks at the spot walk its points one at a time and the spot wears a small ×n badge.
import { useMemo, useRef, useState, type PointerEvent } from "react";
import { axisNames, chartScales, fmt, partColour, seriesName, type ChartSpec } from "./chartData";
import { scatterLayout, scatterTip, TICK_GAP, type Dot, type ScatterLayout } from "./layout";
import { useWidth } from "./useWidth";
import { keepsPick, pickKeys } from "./pick";
import { ChartTip } from "./ChartTip";
import { ChartDetail, KIND_WORDS, type Detail } from "./ChartDetail";
import { ChartLegend } from "./Legend";

/** How near the pointer has to be to a dot to pick it, in drawing px. */
const PICK_RADIUS = 28;

export function ScatterChart({ spec }: { spec: ChartSpec }) {
  const plot = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const width = useWidth(plot);
  const [hover, setHover] = useState<number | null>(null);
  const [drill, setDrill] = useState<{ at: number; detail: Detail } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const closed = useRef(0);  // when the detail last closed: a stale blur right after it is not the reader leaving
  const scales = useMemo(() => chartScales(spec, null), [spec]);
  const layout = useMemo(() => scatterLayout(spec, width, scales), [spec, width, scales]);
  const tip = useMemo(() => (hover === null || !layout.dots[hover] ? null : scatterTip(spec, hover, layout)),
    [spec, hover, layout]);

  /** The dots that draw at one pixel, by index: a spot holding several points is walked one click at a time. */
  const clusters = useMemo(() => {
    const spots = new Map<string, number[]>();
    for (const [i, dot] of layout.dots.entries()) {
      const key = `${dot.cx},${dot.cy}`;
      spots.set(key, [...(spots.get(key) ?? []), i]);
    }
    const by = new Map<number, { key: string; members: number[] }>();
    for (const [key, members] of spots) if (members.length > 1) for (const i of members) by.set(i, { key, members });
    return by;
  }, [layout]);
  /** The spot the last click opened and which of its points that was; a click elsewhere resets it. */
  const cycle = useRef<{ key: string; at: number } | null>(null);

  /** Picks the dot nearest the pointer, if one is near enough; a dot under the pointer (a circle can be hit
   *  directly) names itself, and on a cluster it previews the point the next click will open. */
  function pickAt(e: PointerEvent) {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const x = ((e.clientX - r.left) / r.width) * layout.W;
    const y = ((e.clientY - r.top) / r.height) * layout.H;
    let best = dotIndex(e.target) ?? -1;
    if (best < 0) {
      let near = PICK_RADIUS;
      layout.dots.forEach((dot, i) => {
        const away = Math.hypot(dot.cx - x, dot.cy - y);
        if (away <= near) [best, near] = [i, away];
      });
    }
    const cl = best < 0 ? undefined : clusters.get(best);
    if (!cl) { setHover(best < 0 ? null : best); return; }
    const prev = cycle.current;
    setHover(cl.members[prev && prev.key === cl.key ? (prev.at + 1) % cl.members.length : 0]);
  }

  /** Which dot this click opens, stepping a cluster's cycle when the click lands on one. */
  function committedAt(target: EventTarget | null): number | null {
    const raw = dotIndex(target) ?? hover;
    const cl = raw === null ? undefined : clusters.get(raw);
    if (!cl) { cycle.current = null; return raw; }
    const prev = cycle.current;
    const at = prev && prev.key === cl.key ? (prev.at + 1) % cl.members.length : 0;
    cycle.current = { key: cl.key, at };
    const i = cl.members[at];
    setHover(i);
    return i;
  }

  /** Which point in its series this dot draws: its own place, so even exact duplicates each open their own. */
  function pointIndex(dot: Dot): number {
    return (spec.series[dot.series]?.points ?? []).indexOf(dot.point);
  }

  /** One datum, read closely: its own point in every series's list — a repeated x keeps each series's pair —
   *  with the full values the hover card says, and how many points share its pixel. */
  function detailAt(i: number): Detail {
    const dot = layout.dots[i];
    const p = pointIndex(dot);
    const rows = spec.series.flatMap((s, k) => {
      const point = s.points?.[p];
      if (!point || point.x === null || point.y === null) return [];
      const unit = s.unit ?? spec.unit;
      return [{ colour: partColour(k), name: seriesName(spec.series, k), value: fmt(point.y as number, unit, { full: true }) }];
    });
    const total = spec.series[0]?.points?.length ?? layout.dots.length;
    const cl = clusters.get(i);
    const note = cl
      ? `Point ${p + 1} of ${total} — ${ordinal(cl.members.indexOf(i) + 1)} of ${cl.members.length} here`
      : `Point ${p + 1} of ${total}`;
    return { datum: dot.point.label ?? seriesName(spec.series, dot.series), chartTitle: spec.title,
      kind: KIND_WORDS.scatter, rows, note, source: spec.source };
  }
  const open = (i: number | null) => i !== null && setDrill({ at: i, detail: detailAt(i) });
  const close = () => {
    setDrill(null);
    closed.current = Date.now();
    svg.current?.focus();  // the dialog hands the keyboard back to the drawing it opened from
  };
  // Losing focus to the dialog is not leaving the chart: the pick must survive open and close.
  const pick = keepsPick(setHover, () => drill !== null, closed);

  return (
    <>
      <figure className="hb-card hb-chart">
        <figcaption className="hb-chart-head">
          <span className="hb-chart-title">{spec.title ?? spec.series[0]?.name ?? "Scatter"}</span>
        </figcaption>
        <div ref={plot} className="hb-chart-plot">
          <svg ref={svg} width="100%" height={layout.H} viewBox={`0 0 ${layout.W} ${layout.H}`} className="hb-chart-svg"
            role="img" aria-label={nameOf(spec, layout)} {...pickKeys(layout.dots.length, hover, pick, false, () => open(hover))}
            onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; pickAt(e); }}
            onPointerMove={(e) => (e.buttons || e.pointerType === "mouse") && pickAt(e)}
            onPointerLeave={() => pick(null)}
            onClick={(e) => {
              const d = down.current;  // a click that never moved off its dot drills into it; a scrub does not
              if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 8) open(committedAt(e.target));
            }}>
            <Axis spec={spec} layout={layout} />
            {layout.dots.map((dot, i) => (
              <circle key={`${dot.series}-${i}`} cx={dot.cx} cy={dot.cy} r="4" fill={partColour(dot.series)}
                opacity={hover === null || hover === i ? 1 : 0.55} className="hb-chart-dot"
                data-pt={pointIndex(dot)} data-dot={i}>
                <title>{dotText(spec, dot)}</title>
              </circle>
            ))}
            {[...new Map([...clusters.values()].map((c) => [c.key, c])).values()].map((c) => {
              const dot = layout.dots[c.members[0]];
              return (
                <text key={c.key} x={dot.cx} y={dot.cy - 8} textAnchor="middle" className="hb-chart-cluster"
                  pointerEvents="none">×{c.members.length}</text>
              );
            })}
          </svg>
          <ChartTip tip={tip} />
        </div>
        {spec.series.length > 1 && <ChartLegend series={spec.series} />}
        {spec.source && <div className="hb-chart-source">{spec.source}</div>}
      </figure>
      {drill && <ChartDetail detail={drill.detail} onClose={close} />}
    </>
  );
}

/** The dot index carried by the circle under the pointer, or null when the click was not on a dot. */
function dotIndex(target: EventTarget | null): number | null {
  const raw = (target as SVGElement | null)?.dataset?.dot;
  return raw === undefined ? null : Number(raw);
}

/** Which of the points sharing its pixel a spot's detail is on: 1 → "1st", 2 → "2nd", 3 → "3rd", the rest "nth". */
function ordinal(k: number): string {
  return k % 100 >= 11 && k % 100 <= 13 ? `${k}th` : `${k}${["th", "st", "nd", "rd"][k % 10] ?? "th"}`;
}

/**
 * The scatter's scales: faint lines with round values up the side, and the round values along the bottom. Decorative:
 * the accessible name carries the ranges, since a screen reader can't read `<text>` in an SVG.
 */
function Axis({ spec, layout }: { spec: ChartSpec; layout: ScatterLayout }) {
  return (
    <g aria-hidden="true">
      {layout.yTicks.map((t) => (
        <g key={t}>
          <line x1={layout.left} x2={layout.right} y1={layout.yAt(t)} y2={layout.yAt(t)} className="hb-chart-rule" />
          <text x={layout.left - TICK_GAP} y={layout.yAt(t) + 4} textAnchor="end" className="hb-chart-tick">{fmt(t, spec.unit)}</text>
        </g>
      ))}
      <line x1={layout.left} x2={layout.right} y1={layout.base} y2={layout.base} className="hb-chart-rule" />
      {layout.xTicks.map((t) => (
        <text key={t} x={layout.xAt(t)} y={layout.H - 8} textAnchor="middle" className="hb-chart-axis">{fmt(t)}</text>
      ))}
    </g>
  );
}

/** A dot as the pointer hovers it: "mileage 62, price 1.2, Maruti 800". */
function dotText(spec: ChartSpec, dot: Dot): string {
  const names = axisNames(spec.title);
  const where = `${names.x ?? "x"} ${fmt(dot.x)}, ${names.y ?? "y"} ${fmt(dot.y)}`;
  return dot.point.label ? `${where}, ${dot.point.label}` : where;
}

/**
 * The drawing's accessible name: what it plots and how far the numbers run.
 *   "Price against mileage: mileage 9 to 62, price 1.2 to 24.6, 4 points"
 */
function nameOf(spec: ChartSpec, layout: ScatterLayout): string {
  const title = spec.title ?? "Scatter";
  const dots = layout.dots;
  if (!dots.length) return `${title}: no points with two numbers`;
  const names = axisNames(spec.title);
  const spread = (values: number[]) => {
    const lo = Math.min(...values), hi = Math.max(...values);
    return lo === hi ? fmt(lo) : `${fmt(lo)} to ${fmt(hi)}`;
  };
  const count = `${dots.length} point${dots.length === 1 ? "" : "s"}`;
  return `${title}: ${names.x ?? "x"} ${spread(dots.map((d) => d.x))}, ${names.y ?? "y"} ${spread(dots.map((d) => d.y))}, ${count}`;
}
