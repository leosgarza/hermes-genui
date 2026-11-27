// Charts that go up and down: line, bar, area, stacked, combo, scatter and histogram. Pies and donuts, and horizontal
// bars, have files of their own. Hand-drawn SVG at the width the chart has on screen (chart.css sets how wide that may
// be): the sums behind it are in chartData.ts, where things go in layout.ts, the marks in *Marks.tsx.
import { useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { changePct, chartScales, fmt, kindToDraw, sharePct, stackSeries, totalAt, type ChartSpec } from "./chartData";
import { seriesEnds, xyLayout, xyTip, type XYLayout } from "./layout";
import { useWidth } from "./useWidth";
import { pickKeys } from "./pick";
import { ChartTip } from "./ChartTip";
import { ChartDetail, KIND_WORDS, type Detail } from "./ChartDetail";
import { ChartLegend } from "./Legend";
import { LineMarks, Crosshair } from "./LineMarks";
import { BarMarks, ComboMarks, StackMarks } from "./ColumnMarks";
import { AreaMarks } from "./AreaMarks";
import { ScatterMarks, dotSpots } from "./ScatterMarks";
import { HBarChart } from "./HBarChart";
import { PieChart } from "./PieChart";

const WIDE_FROM = 60;  // a line with this many points may be drawn wider than the usual cap

/** A chart of any kind: pies and donuts, and horizontal bars (asked for, or bars that read better as rows: see
 *  kindToDraw), have drawings of their own; the rest go up and down. */
export function Chart({ spec }: { spec: ChartSpec }) {
  if (spec.type === "pie" || spec.type === "donut") return <PieChart spec={spec} />;
  if (kindToDraw(spec) === "hbar") return <HBarChart spec={spec} />;
  return <XYChart spec={spec} />;
}

/** Line, bar, area, stacked, combo, scatter and histogram: x labels along the bottom, values up the side. A click
 *  (or Enter) on the picked column, point or band drills into that datum — one detail dialog, mounted beside the
 *  drawing, which is never re-instantiated and keeps its pick through open, close and reopen. */
function XYChart({ spec }: { spec: ChartSpec }) {
  const plot = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const width = useWidth(plot);
  const [hover, setHover] = useState<number | null>(null);
  const [drill, setDrill] = useState<{ at: number; detail: Detail } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const n = spec.x.length;
  const piled = spec.type === "stacked" || spec.type === "area";  // the series pile on each other
  const bands = useMemo(() => (piled ? stackSeries(spec.series, n) : null), [spec, n, piled]);
  const scales = useMemo(() => chartScales(spec, bands), [spec, bands]);
  const layout = useMemo(() => xyLayout(spec, width, scales), [spec, width, scales]);
  const tip = useMemo(() => (hover === null ? null : xyTip(spec, hover, layout)), [spec, hover, layout]);
  /** Dots that draw at one pixel are a CLUSTER: hit testing can only ever return the topmost circle, so a
   *  spot holding several points is walked one click at a time. cycle holds the spot the last click opened
   *  and which of its points that was — a click on anything else resets it, so the spot starts again from
   *  its first datum. (The dialog covering the drawing is NOT leaving it: a real pointerleave fires as the
   *  overlay opens, and the cycle has to survive the open→close round trip it just caused.) */
  const clusters = useMemo(() => {
    const by = new Map<number, { key: string; members: number[] }>();
    if (spec.type === "scatter") for (const s of dotSpots(spec, layout)) {
      if (s.members.length > 1) for (const i of s.members) by.set(i, s);
    }
    return by;
  }, [spec, layout]);
  const cycle = useRef<{ key: string; at: number } | null>(null);

  /** Where the pointer points on the x axis: a scatter takes its pick from the DOT under it (a repeated x
   *  draws several points at one px, and no lookup by x can tell them apart); a dot that shares its px with
   *  others highlights the point the next click will open; anything else uses the nearest x label, which is
   *  what its columns and bands are made of. */
  function pickAt(e: PointerEvent) {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const x = ((e.clientX - r.left) / r.width) * layout.W;
    const raw = dotIndex(e.target);
    const cl = raw === null ? undefined : clusters.get(raw);
    if (!cl) { setHover(raw ?? nearestXIndex(layout.xAt, n, x)); return; }
    const prev = cycle.current;
    setHover(cl.members[prev && prev.key === cl.key ? (prev.at + 1) % cl.members.length : 0]);
  }

  /** Which datum this click opens, taking the click off the cluster's cycle if it is one: the first click
   *  on a spot opens its first point, and each successive click opens the next (wrapping). Any other
   *  committed click resets the cycle, so the spot starts again from its first datum. */
  function committedAt(target: EventTarget | null): number | null {
    const raw = dotIndex(target);
    const cl = raw === null ? undefined : clusters.get(raw);
    if (!cl) { cycle.current = null; return hover; }
    const prev = cycle.current;
    const at = prev && prev.key === cl.key ? (prev.at + 1) % cl.members.length : 0;
    cycle.current = { key: cl.key, at };
    const i = cl.members[at];
    setHover(i);
    return i;
  }

  /** One datum, read closely: the same full values the hover card says, with a histogram bin's share of its
   *  values and a scatter point's own place in the series — and, at a spot of several, which of its points
   *  this is. */
  function detailAt(i: number): Detail {
    const t = xyTip(spec, i, layout);
    let note = t.note;
    if (!note && spec.type === "histogram") {
      const total = spec.series[0].data.reduce<number>((sum, v) => sum + (v ?? 0), 0);
      const inBin = spec.series[0].data[i] ?? 0;
      note = total > 0 ? `${inBin} of ${total} values (${sharePct(inBin / total)})` : undefined;
    }
    if (!note && spec.type === "scatter") {
      const cl = clusters.get(i);
      note = cl
        ? `Point ${i + 1} of ${n} — ${ordinal(cl.members.indexOf(i) + 1)} of ${cl.members.length} here`
        : `Point ${i + 1} of ${n}`;  // even twins say which one this is
    }
    return { datum: t.title, chartTitle: spec.title, kind: KIND_WORDS[spec.type], rows: t.rows, note, source: spec.source };
  }
  const open = (i: number | null) => i !== null && setDrill({ at: i, detail: detailAt(i) });
  const close = () => {
    setDrill(null);
    svg.current?.focus();  // the dialog hands the keyboard back to the drawing it opened from
  };
  // Losing focus to the dialog is not leaving the chart: the pick must survive open and close.
  const pick = (i: number | null) => { if (i !== null || !drill) setHover(i); };

  const multiLegend = spec.type === "combo" || (spec.type === "bar" && spec.series.length > 1)
    || (spec.type === "line" && spec.series.length > 1);
  const wide = spec.type === "line" && n >= WIDE_FROM;
  return (
    <>
      <figure className={`hb-card hb-chart${wide ? " hb-chart-wide" : ""}`}>
        <Headline spec={spec} hover={hover} />
        <div ref={plot} className="hb-chart-plot">
          <svg ref={svg} width="100%" height={layout.H} viewBox={`0 0 ${layout.W} ${layout.H}`} className="hb-chart-svg"
            role="img" aria-label={spec.title ?? "chart"} {...pickKeys(n, hover, pick, false, () => open(hover))}
            onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; pickAt(e); }}
            onPointerMove={(e) => (e.buttons || e.pointerType === "mouse") && pickAt(e)}
            onPointerLeave={() => pick(null)}
            onClick={(e) => {
              const d = down.current;  // a click that never moved off its column drills into it; a scrub does not
              if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 8) open(committedAt(e.target));
            }}>
            <XLabels spec={spec} layout={layout} />
            {spec.type === "line" && <LineMarks spec={spec} layout={layout} gid={gid} hover={hover} />}
            {spec.type === "bar" && <BarMarks spec={spec} layout={layout} hover={hover} />}
            {spec.type === "histogram" && <BarMarks spec={spec} layout={layout} hover={hover} />}
            {spec.type === "scatter" && <ScatterMarks spec={spec} layout={layout} hover={hover} />}
            {spec.type === "stacked" && bands && <StackMarks bands={bands} layout={layout} hover={hover} />}
            {spec.type === "area" && bands && <AreaMarks bands={bands} layout={layout} />}
            {spec.type === "combo" && <ComboMarks spec={spec} layout={layout} hover={hover} />}
            {(spec.type === "area" || spec.type === "combo") && hover !== null && <Crosshair layout={layout} at={hover} />}
          </svg>
          <ChartTip tip={tip} />
        </div>
        {multiLegend && <ChartLegend series={spec.series} />}
        {piled && spec.series.length > 1 && <ChartLegend series={spec.series} at={hover ?? lastIndex(spec)} unit={spec.unit} />}
        {spec.source && <div className="hb-chart-source">{spec.source}</div>}
      </figure>
      {drill && <ChartDetail detail={drill.detail} onClose={close} />}
    </>
  );
}

/** The index of the first series's last value (gaps skipped): where the headline number is read when nothing is
 *  picked. */
function lastIndex(spec: ChartSpec): number {
  const { last } = seriesEnds(spec.series[0].data);
  return last < 0 ? spec.x.length - 1 : last;
}

/** The x label nearest to `px`, in drawing units. A tie keeps the LOWEST index — which is exactly why a scatter
 *  does not pick this way: two points sharing an x sit at the same px and the pointer knows which one it is on.
 *  Exported for the test that pins that wrongness (a negative control the scatter's dot picking corrects). */
export function nearestXIndex(xAt: (i: number) => number, n: number, px: number): number {
  let best = 0;
  for (let i = 1; i < n; i++) if (Math.abs(xAt(i) - px) < Math.abs(xAt(best) - px)) best = i;
  return best;
}

/** Which of the points sharing its pixel a spot's detail is on: 1 → "1st", 2 → "2nd", 3 → "3rd", the rest "nth". */
function ordinal(k: number): string {
  return k % 100 >= 11 && k % 100 <= 13 ? `${k}th` : `${k}${["th", "st", "nd", "rd"][k % 10] ?? "th"}`;
}

/** Which point the pointer is on: scatter dots carry their own index (ScatterMarks' data-pt). null when the
 *  pointer is not on a dot — the pick then falls back to the x label nearest it, as everywhere else. */
function dotIndex(target: EventTarget | null): number | null {
  const pt = (target as SVGElement | null)?.dataset?.pt;
  return pt === undefined ? null : Number(pt);
}

/** The sum of a histogram's bin counts: how many values it binned. */
function totalOf(data: (number | null)[]): number {
  return data.reduce<number>((sum, v) => sum + (v ?? 0), 0);
}

/** The title, the line's change chip, and the big number: the value at the picked x label, or the latest. A stacked
 *  chart's number is the whole pile; a histogram's is how many values it binned (its bars count them, and the last
 *  bin's count alone is not a headline). The other series's values sit beside it. figure: false keeps only the title. */
function Headline({ spec, hover }: { spec: ChartSpec; hover: number | null }) {
  const piled = spec.type === "stacked" || spec.type === "area";
  const pct = spec.type === "line" ? changePct(spec.series[0].data) : null;
  const shown = hover ?? lastIndex(spec);
  const big = piled ? totalAt(spec.series, shown)
    : spec.type === "histogram" && hover === null ? totalOf(spec.series[0].data)
    : spec.series[0].data[shown] ?? null;
  const bigUnit = piled ? spec.unit : spec.series[0].unit ?? spec.unit;
  const listed = piled ? [] : spec.series.slice(1);  // a pile's parts have their values in the legend
  const withFigure = spec.figure !== false;
  return (
    <>
      <figcaption className="hb-chart-head">
        <span className="hb-chart-title">{spec.title ?? spec.series[0].name ?? "Chart"}</span>
        {pct !== null && withFigure && <span className={`hb-chip ${pct >= 0 ? "hb-chip-good" : "hb-chip-warn"}`}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%</span>}
      </figcaption>
      {withFigure && (
        <div className="hb-chart-figure">
          <span className="hb-chart-big">{big === null ? "–" : fmt(big, bigUnit)}</span>
          <span className="hb-chart-at">
            {hover !== null ? spec.x[shown] : ""}
            {listed.map((s, k) => {
              const v = s.data[shown] ?? null;
              return v === null ? null : <span key={k} className="hb-chart-other">{s.name ? `${s.name} ` : ""}{fmt(v, s.unit ?? spec.unit)}</span>;
            })}
          </span>
        </div>
      )}
    </>
  );
}

/** The x labels that fit along the bottom (layout.xLabels): under each column, or for a line the first one starting
 *  at the left edge, the last ending at the right and the rest centred. */
function XLabels({ spec, layout }: { spec: ChartSpec; layout: XYLayout }) {
  const last = spec.x.length - 1;
  const anchor = (i: number) => (layout.slotted ? "middle" : i === 0 && last > 0 ? "start" : i === last && last > 0 ? "end" : "middle");
  return (
    <g>
      {layout.xLabels.map((i) => (
        <text key={i} x={layout.xAt(i)} y={layout.H - 7} textAnchor={anchor(i)} className="hb-chart-axis">{String(spec.x[i])}</text>
      ))}
    </g>
  );
}
