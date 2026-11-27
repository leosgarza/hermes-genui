import { chartKind, histogramBins, isOnRightScale, maxSeries, pieSlices, type ChartKind, type ChartSeries, type ChartSpec } from "./chartData";
import type { Trail } from "../../core/fields";

export type ChartBlock = { type: "chart"; spec: ChartSpec };

/**
 * chart: `kind` is line, bar, area, stacked, hbar, combo, pie, donut, scatter or histogram; any other kind, or none,
 * draws a line. Up to 3 series (stacked and area 6; histogram 1); a value that isn't a number is a gap (null).
 * Pie and donut: x names the slices and the first series holds their values; zero, negative and missing values are
 * dropped and past 8 slices the smallest merge into "Other" (pieSlices).
 * Scatter: dots at each x/y pair; x labels that are all numbers place the dots by value, anything else spaces them
 * evenly. {kind: "scatter", x: [1, 2, 4], series: [{data: [10, 14, 12]}]} draws three dots.
 * Histogram: the one series' raw values are counted into about six round bins (histogramBins); x is not needed and
 * any x given is ignored — the bins become the labels and the counts the bars. The chart's unit belongs to the
 * values, so the count axis carries none.
 * Combo: the first series is bars, the rest lines; a line with its own unit (or axis "right") gets a right-hand scale.
 *   {type: "chart", kind: "bar", x: ["Q1", "Q2"], series: [{name: "Rev", data: [1, 2]}]}
 *   → {type: "chart", spec: {type: "bar", x: ["Q1", "Q2"], series: [{name: "Rev", data: [1, 2], right: false}]}}
 * figure: false (a % change comparison, where a change of a change means nothing) drops the headline number and change
 * chip; only true or false count, anything else is ignored.
 *   {..., figure: false} → spec.figure false;  {..., figure: "false"} → no spec.figure (the default: shown)
 * tone: "change" (exactly that string) colours a one-series line by direction from its first value; anything else is
 * ignored.  {..., tone: "change"} → spec.tone "change";  {..., tone: "Change"} → no spec.tone
 * Dropped: no x labels (a histogram: no number to bin), no series with a number, or a pie with no positive value.
 */
export function readChart(raw: any, here: Trail): ChartBlock | null {
  const spec = readSpec(raw);
  if (!spec) return here.drop("chart needs x labels and at least one series");
  return { type: "chart", spec };
}

function readSpec(d: any): ChartSpec | null {
  const type = chartKind(d.kind);
  if (!Array.isArray(d.x) && type !== "histogram") return null;
  if (!Array.isArray(d.series) || !d.series.length) return null;
  const unit = typeof d.unit === "string" ? d.unit : undefined;
  let x: string[] = Array.isArray(d.x) ? d.x.map(String) : [];
  let series: ChartSeries[] = d.series
    .filter((s: any) => s && Array.isArray(s.data))
    .slice(0, maxSeries(type))
    .map((s: any, k: number) => readSeries(s, k, type, unit));
  if (!series.length || series.every((s) => s.data.every((v) => v === null))) return null;
  if (type === "pie" || type === "donut") {
    const slices = pieSlices(x, series[0].data);
    if (!slices.x.length) return null;
    x = slices.x;
    series = [{ ...series[0], data: slices.data }];
  }
  if (type === "histogram") {
    const bins = histogramBins(series[0].data.filter((v): v is number => v !== null));
    if (!bins.labels.length) return null;
    x = bins.labels;
    series = [{ name: series[0].name, data: bins.counts }];
  }
  const spec: ChartSpec = { type, title: typeof d.title === "string" ? d.title : undefined, x,
    series, unit: type === "histogram" ? undefined : unit, source: typeof d.source === "string" ? d.source : undefined };
  if (typeof d.figure === "boolean") spec.figure = d.figure;
  if (d.tone === "change") spec.tone = "change";
  return spec;
}

/** One series as written → its name, its numbers (anything else a gap), its own unit, and which scale it uses. */
function readSeries(s: any, k: number, type: ChartKind, chartUnit: string | undefined): ChartSeries {
  const name = typeof s.name === "string" ? s.name : undefined;
  const data = s.data.map((v: any) => (typeof v === "number" && isFinite(v) ? v : null));
  const unit = typeof s.unit === "string" ? s.unit : undefined;
  const right = isOnRightScale(type, k, unit, s.axis, chartUnit);
  return { name, data, unit, right };
}
