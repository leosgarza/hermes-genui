// Charts that go up and down: line, bar, area, stacked, combo, histogram and range. Pies and donuts, and horizontal
// bars, have files of their own. Hand-drawn SVG at the width the chart has on screen (chart.css sets how wide that may
// be): the sums behind it are in chartData.ts, where things go in layout.ts, the marks in *Marks.tsx.
// A click (or Enter) on the picked column, point or band drills into that datum — one detail dialog, mounted beside
// the drawing, which is never re-instantiated and keeps its pick through open, close and reopen.
import { useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { binTotals, changePct, chartLabel, chartScales, fmt, fmtSpan, kindToDraw, sharePct, stackSeries, totalAt, type ChartSpec } from "./chartData";
import { seriesEnds, xyLayout, xyTip, type XYLayout } from "./layout";
import { useWidth } from "./useWidth";
import { keepsPick, pickKeys } from "./pick";
import { ChartTip } from "./ChartTip";
import { ChartDetail, KIND_WORDS, type Detail } from "./ChartDetail";
import { ChartLegend } from "./Legend";
import { LineMarks, Crosshair, Gridlines } from "./LineMarks";
import { BarMarks, ComboMarks, HistogramMarks, RangeMarks, StackMarks } from "./ColumnMarks";
import { AreaMarks } from "./AreaMarks";
import { HBarChart } from "./HBarChart";
import { PieChart } from "./PieChart";
import { ScatterChart } from "./ScatterChart";
import { WaterfallChart } from "./WaterfallChart";
import { Gauge } from "./Gauge";
import { Bullet } from "./Bullet";
import { Funnel } from "./Funnel";
import { Pareto } from "./Pareto";
import { Radar } from "./Radar";
import { Control } from "./Control";
import { Bubble } from "./Bubble";
import { Box } from "./Box";
import { Treemap } from "./Treemap";

const WIDE_FROM = 60;  // a line with this many points may be drawn wider than the usual cap

/** A chart of any kind: the pack's own drawings (a gauge, a bullet, a funnel, a pareto, a radar, a control, a
 *  bubble, a box, a treemap) first, then pies and donuts, a scatter, a waterfall, and horizontal bars (asked for,
 *  or bars that read better as rows: see kindToDraw); the rest go up and down. */
export function Chart({ spec }: { spec: ChartSpec }) {
  if (spec.type === "gauge") return <Gauge spec={spec} />;
  if (spec.type === "bullet") return <Bullet spec={spec} />;
  if (spec.type === "funnel") return <Funnel spec={spec} />;
  if (spec.type === "pareto") return <Pareto spec={spec} />;
  if (spec.type === "radar") return <Radar spec={spec} />;
  if (spec.type === "control") return <Control spec={spec} />;
  if (spec.type === "bubble") return <Bubble spec={spec} />;
  if (spec.type === "box") return <Box spec={spec} />;
  if (spec.type === "treemap") return <Treemap spec={spec} />;
  if (spec.type === "pie" || spec.type === "donut") return <PieChart spec={spec} />;
  if (spec.type === "scatter") return <ScatterChart spec={spec} />;
  if (spec.type === "waterfall") return <WaterfallChart spec={spec} />;
  if (kindToDraw(spec) === "hbar") return <HBarChart spec={spec} />;
  return <XYChart spec={spec} />;
}

/** Line, bar, area, stacked, combo, histogram and range: x labels along the bottom, values up the side. */
function XYChart({ spec }: { spec: ChartSpec }) {
  const plot = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const width = useWidth(plot);
  const [hover, setHover] = useState<number | null>(null);
  const [drill, setDrill] = useState<{ at: number; detail: Detail } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const closed = useRef(0);  // when the detail last closed: a stale blur right after it is not the reader leaving
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const n = spec.x.length;
  const piled = spec.type === "stacked" || spec.type === "area";  // the series pile on each other
  const bands = useMemo(() => (piled ? stackSeries(spec.series, n) : null), [spec, n, piled]);
  const scales = useMemo(() => chartScales(spec, bands), [spec, bands]);
  const layout = useMemo(() => xyLayout(spec, width, scales), [spec, width, scales]);
  const tip = useMemo(() => (hover === null ? null : xyTip(spec, hover, layout)), [spec, hover, layout]);

  /** Picks the x label nearest the pointer. */
  function pickAt(e: PointerEvent) {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const x = ((e.clientX - r.left) / r.width) * layout.W;
    setHover(nearestXIndex(layout.xAt, n, x));
  }

  /** One datum, read closely: the same full values the hover card says, plus a histogram bin's share of its
   *  values. */
  function detailAt(i: number): Detail {
    const t = xyTip(spec, i, layout);
    let note = t.note;
    if (!note && spec.type === "histogram") {
      const total = spec.series[0].data.reduce<number>((sum, v) => sum + (v ?? 0), 0);
      const inBin = spec.series[0].data[i] ?? 0;
      note = total > 0 ? `${inBin} of ${total} values (${sharePct(inBin / total)})` : undefined;
    }
    return { datum: t.title, chartTitle: spec.title, kind: KIND_WORDS[spec.type], rows: t.rows, note, source: spec.source };
  }
  const open = (i: number | null) => i !== null && setDrill({ at: i, detail: detailAt(i) });
  const close = () => {
    setDrill(null);
    closed.current = Date.now();
    svg.current?.focus();  // the dialog hands the keyboard back to the drawing it opened from
  };
  // Losing focus to the dialog is not leaving the chart: the pick must survive open and close.
  const pick = keepsPick(setHover, () => drill !== null, closed);

  const multiLegend = spec.type === "combo" || (spec.type === "bar" && spec.series.length > 1)
    || (spec.type === "line" && spec.series.length > 1);
  const wide = spec.type === "line" && n >= WIDE_FROM;
  return (
    <>
      <figure className={`hb-card hb-chart${wide ? " hb-chart-wide" : ""}`}>
        <Headline spec={spec} hover={hover} />
        <div ref={plot} className="hb-chart-plot">
          <svg ref={svg} width="100%" height={layout.H} viewBox={`0 0 ${layout.W} ${layout.H}`} className="hb-chart-svg"
            role="img" aria-label={chartLabel(spec)} {...pickKeys(n, hover, pick, false, () => open(hover))}
            onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; pickAt(e); }}
            onPointerMove={(e) => (e.buttons || e.pointerType === "mouse") && pickAt(e)}
            onPointerLeave={() => pick(null)}
            onClick={(e) => {
              const d = down.current;  // a click that never moved off its column drills into it; a scrub does not
              if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 8) open(hover);
            }}>
            <XLabels spec={spec} layout={layout} />
            <AxisTitles spec={spec} layout={layout} />
            {spec.type === "range" && layout.ticks.length > 0 && <Gridlines spec={spec} layout={layout} />}
            {spec.type === "line" && <LineMarks spec={spec} layout={layout} gid={gid} hover={hover} />}
            {spec.type === "bar" && <BarMarks spec={spec} layout={layout} hover={hover} />}
            {spec.type === "stacked" && bands && <StackMarks bands={bands} layout={layout} hover={hover} />}
            {spec.type === "area" && bands && <AreaMarks bands={bands} layout={layout} />}
            {spec.type === "combo" && <ComboMarks spec={spec} layout={layout} hover={hover} />}
            {spec.type === "histogram" && <HistogramMarks spec={spec} layout={layout} hover={hover} />}
            {spec.type === "range" && <RangeMarks spec={spec} layout={layout} hover={hover} />}
            {(spec.type === "area" || spec.type === "combo") && hover !== null && <Crosshair layout={layout} at={hover} />}
          </svg>
          <ChartTip tip={tip} />
        </div>
        {multiLegend && <ChartLegend series={spec.series} />}
        {piled && spec.series.length > 1 && <ChartLegend series={spec.series} at={hover ?? lastIndex(spec)} unit={spec.unit} />}
        {spec.caveat && <div className="hb-chart-caveat">{spec.caveat}</div>}
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

/** Where the big number is read when nothing is picked: a histogram's tallest bin, anything else's latest value. */
function headlineAt(spec: ChartSpec): number {
  if (spec.type !== "histogram") return lastIndex(spec);
  return Math.max(binTotals(spec.series[0].data).tallest, 0);
}

/** The title, the line's change chip, and the big number: the value at the picked x label, or the latest. A stacked
 *  chart's number is the whole pile; the other series's values sit beside it. A histogram shows the picked or tallest
 *  bin's count beside how many it counted, a range the picked window's dot (both ends when there is no dot). figure:
 *  false keeps only the title. */
function Headline({ spec, hover }: { spec: ChartSpec; hover: number | null }) {
  const piled = spec.type === "stacked" || spec.type === "area";
  const pct = spec.type === "line" ? changePct(spec.series[0].data) : null;
  const shown = hover ?? headlineAt(spec);
  const first = spec.series[0];
  const unit = piled ? spec.unit : first.unit ?? spec.unit;
  const hist = spec.type === "histogram";
  const span = spec.type === "range" ? first.span?.[shown] ?? null : null;
  const counted = hist ? binTotals(first.data) : null;
  const big = hist ? first.data[shown] ?? null
    : span ? span.now ?? fmtSpan(span.low, span.high, unit)
      : piled ? totalAt(spec.series, shown) : first.data[shown] ?? null;
  const listed = piled ? [] : spec.series.slice(1);  // a pile's parts have their values in the legend
  const withFigure = spec.figure !== false;
  // The bin's range, the window behind a dot, or the hovered x label: what the big number is about.
  const at = [
    hover !== null || hist || span ? String(spec.x[shown]) : "",
    counted ? `${counted.total} counted` : "",
    span && span.now !== null && span.low !== null && span.high !== null ? fmtSpan(span.low, span.high, unit) : "",
  ].filter(Boolean).join(" · ");
  return (
    <>
      <figcaption className="hb-chart-head">
        <span className="hb-chart-title">{spec.title ?? spec.series[0].name ?? "Chart"}</span>
        {pct !== null && withFigure && <span className={`hb-chip ${pct >= 0 ? "hb-chip-good" : "hb-chip-warn"}`}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%</span>}
      </figcaption>
      {withFigure && (
        <div className="hb-chart-figure">
          <span className="hb-chart-big">{big === null ? "–" : typeof big === "string" ? big : fmt(big, unit)}</span>
          <span className="hb-chart-at">
            {at}
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
        <text key={i} x={layout.xAt(i)} y={layout.base + 19} textAnchor={anchor(i)} className="hb-chart-axis">{String(spec.x[i])}</text>
      ))}
    </g>
  );
}

/** Axis captions in the drawing's own margin, using the same 11px muted type as the ticks. They are part of the svg
 *  image; the accessible name carries the same words for a screen reader. */
function AxisTitles({ spec, layout }: { spec: ChartSpec; layout: XYLayout }) {
  return (
    <g>
      {spec.yLabel && <text x={layout.left} y={layout.top - 6} className="hb-chart-axis">{spec.yLabel}</text>}
      {spec.xLabel && <text x={layout.left} y={layout.H - 2} className="hb-chart-axis">{spec.xLabel}</text>}
    </g>
  );
}
