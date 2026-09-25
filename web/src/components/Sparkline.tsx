/** A minimal inline-SVG sparkline, no charting dependency (PLAN 21+22: "No chart dependency").
 * Handles an empty series, an all-zero series and a single point without dividing by zero. */
export function Sparkline({
  values,
  label,
  width = 160,
  height = 36,
}: {
  values: readonly number[];
  /** What the series counts, for the accessible summary, e.g. "daily impressions". */
  label: string;
  width?: number;
  height?: number;
}) {
  const summary = summarize(values, label);
  if (values.length === 0) {
    return (
      <svg role="img" aria-label={summary} width={width} height={height} className="text-muted" />
    );
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;
  const pad = 2;
  const points = values.map((v, i) => {
    const x = values.length === 1 ? width / 2 : pad + (i / (values.length - 1)) * (width - pad * 2);
    // A flat (including all-zero) series draws a level line across the middle.
    const y = span === 0 ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const path = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const [lastX, lastY] = points[points.length - 1] ?? [0, 0];

  return (
    <svg
      role="img"
      aria-label={summary}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-accent" />
      <circle cx={lastX} cy={lastY} r={2} fill="currentColor" className="text-accent" />
    </svg>
  );
}

function summarize(values: readonly number[], label: string): string {
  if (values.length === 0) return `${label}: no data`;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const last = values[values.length - 1];
  return `${label}: min ${min}, max ${max}, last ${last}`;
}
