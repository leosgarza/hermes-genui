// waterfall: how a start value becomes an end value through signed steps — each bar floats from the running total,
// up in green, down in orange, sharing one 0–100 viewBox so the bars read as one bridge.
import { fmt, type ChartSpec } from "./chartData";

type Bar = { from: number; to: number; d: number } | null;

export function Waterfall({ spec }: { spec: ChartSpec }) {
  const deltas = spec.series[0]?.data ?? [];
  let acc = 0;
  const bars: Bar[] = deltas.map((d) => {
    if (typeof d !== "number") return null;
    const from = acc;
    acc += d;
    return { from, to: acc, d };
  });
  const values = bars.flatMap((b) => (b ? [b.from, b.to] : []));
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const n = deltas.length || 1;
  const w = 100 / n;
  const y = (v: number) => 100 - ((v - lo) / span) * 100;
  const end = acc;

  return (
    <figure className="hb-waterfall">
      {spec.title && <figcaption className="hb-chart-title">{spec.title}</figcaption>}
      <svg className="hb-waterfall-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
        aria-label={`${spec.title ?? "Waterfall"}: starts 0, ends ${fmt(end, spec.unit)}`}>
        <line x1="0" y1={y(0)} x2="100" y2={y(0)} stroke="var(--hb-line-strong)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        {bars.map((b, i) => {
          if (!b) return null;
          const top = y(Math.max(b.from, b.to));
          const height = Math.abs(y(b.from) - y(b.to));
          return (
            <rect key={i} x={i * w + w * 0.15} width={w * 0.7} y={top} height={Math.max(height, 0.5)}
              fill={b.d >= 0 ? "var(--hb-good)" : "var(--hb-warn)"} fillOpacity={0.85} />
          );
        })}
      </svg>
      <div className="hb-waterfall-axis">
        {deltas.map((_, i) => <span key={i} className="hb-waterfall-label" style={{ width: `${w}%` }}>{spec.x[i]}</span>)}
      </div>
      <div className="hb-waterfall-net">net <strong>{fmt(end, spec.unit)}</strong></div>
      {spec.source && <div className="hb-chart-source">{spec.source}</div>}
    </figure>
  );
}
