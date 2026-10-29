import { formatCompactCurrency } from "@/lib/reports";

// Chart palette: validated categorical slots (blue / green / orange) plus a
// one-hue blue ramp for ordinal views (aging, funnel). Text always uses the
// app's charcoal tokens; color only carries series identity.
export const CHART_COLORS = {
  invoiced: "#2a78d6",
  collected: "#1baf7a",
  prior: "#eb6834",
  quoted: "#eda100",
  ramp: ["#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6", "#cde2fb"]
};

export type ChartSeries = {
  name: string;
  color: string;
  values: number[];
};

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / power;
  const step =
    scaled <= 1.2 ? 1.2 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return step * power;
}

function axisLabel(value: number): string {
  return formatCompactCurrency(Math.round(value));
}

function shouldLabel(index: number, count: number): boolean {
  if (count <= 12) return true;
  return index % Math.ceil(count / 12) === 0;
}

export function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-3 text-xs font-bold text-charcoal/65">
      {series.map((item) => (
        <span key={item.name} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{ background: item.color }}
          />
          {item.name}
        </span>
      ))}
    </div>
  );
}

type GroupedBarsProps = {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  ariaLabel?: string;
};

export function GroupedBarChart({
  labels,
  series,
  height = 260,
  ariaLabel = "Bar chart"
}: GroupedBarsProps) {
  const width = 720;
  const pad = { top: 16, right: 14, bottom: 30, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(
    Math.max(1, ...series.flatMap((item) => item.values))
  );
  const slot = plotW / Math.max(1, labels.length);
  const groupW = Math.min(slot * 0.74, 58);
  const gap = 2;
  const barW = Math.max(3, groupW / Math.max(1, series.length) - gap);
  const base = pad.top + plotH;

  return (
    <div>
      <ChartLegend series={series} />
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          className="block min-w-[440px] w-full"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = pad.top + plotH * (1 - fraction);
            return (
              <g key={fraction}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y}
                  y2={y}
                  stroke={fraction === 0 ? "#c9c0ae" : "#e8e0d1"}
                  strokeWidth={1}
                />
                <text
                  x={pad.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize={10}
                  fill="#5f6157"
                >
                  {axisLabel(max * fraction)}
                </text>
              </g>
            );
          })}

          {labels.map((label, index) => {
            const groupLeft = pad.left + slot * index + (slot - groupW) / 2;
            return (
              <g key={`${label}-${index}`}>
                {series.map((item, seriesIndex) => {
                  const value = item.values[index] ?? 0;
                  if (value <= 0) return null;
                  const barHeight = Math.max(1, (value / max) * plotH);
                  const x = groupLeft + seriesIndex * (barW + gap);
                  const y = base - barHeight;
                  const radius = Math.min(4, barHeight);
                  return (
                    <path
                      key={item.name}
                      d={`M${x} ${base} L${x} ${y + radius} Q${x} ${y} ${x + radius} ${y} L${x + barW - radius} ${y} Q${x + barW} ${y} ${x + barW} ${y + radius} L${x + barW} ${base} Z`}
                      fill={item.color}
                    >
                      <title>
                        {`${label} ${item.name}: ${formatCompactCurrency(value)}`}
                      </title>
                    </path>
                  );
                })}
                {shouldLabel(index, labels.length) ? (
                  <text
                    x={pad.left + slot * index + slot / 2}
                    y={height - 9}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#5f6157"
                  >
                    {label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

type TrendLineProps = {
  labels: string[];
  current: number[];
  prior: number[];
  currentName?: string;
  priorName?: string;
  height?: number;
  ariaLabel?: string;
};

export function TrendLineChart({
  labels,
  current,
  prior,
  currentName = "This period",
  priorName = "Prior period",
  height = 270,
  ariaLabel = "Line chart"
}: TrendLineProps) {
  const width = 720;
  const pad = { top: 18, right: 56, bottom: 30, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...current, ...prior));
  const stepX = plotW / Math.max(1, labels.length - 1);
  const point = (index: number, value: number) => ({
    x: pad.left + stepX * index,
    y: pad.top + plotH - (value / max) * plotH
  });
  const series = [
    { name: currentName, color: CHART_COLORS.invoiced, values: current, fill: true },
    ...(prior.length > 0
      ? [{ name: priorName, color: CHART_COLORS.prior, values: prior, fill: false }]
      : [])
  ];

  return (
    <div>
      <ChartLegend
        series={series.map((item) => ({
          name: item.name,
          color: item.color,
          values: []
        }))}
      />
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          className="block min-w-[440px] w-full"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = pad.top + plotH * (1 - fraction);
            return (
              <g key={fraction}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y}
                  y2={y}
                  stroke={fraction === 0 ? "#c9c0ae" : "#e8e0d1"}
                  strokeWidth={1}
                />
                <text
                  x={pad.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize={10}
                  fill="#5f6157"
                >
                  {axisLabel(max * fraction)}
                </text>
              </g>
            );
          })}

          {series.map((item) => {
            const points = item.values.map((value, index) => point(index, value));
            const line = points
              .map((p, index) => `${index === 0 ? "M" : "L"}${p.x} ${p.y}`)
              .join(" ");
            const last = points[points.length - 1];
            return (
              <g key={item.name}>
                {item.fill ? (
                  <path
                    d={`${line} L${last.x} ${pad.top + plotH} L${points[0].x} ${pad.top + plotH} Z`}
                    fill={item.color}
                    opacity={0.1}
                  />
                ) : null}
                <path
                  d={line}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {points.map((p, index) => (
                  <circle
                    key={index}
                    cx={p.x}
                    cy={p.y}
                    r={3.5}
                    fill="#fffdf8"
                    stroke={item.color}
                    strokeWidth={2}
                  >
                    <title>
                      {`${labels[index]} ${item.name}: ${formatCompactCurrency(item.values[index] ?? 0)}`}
                    </title>
                  </circle>
                ))}
                {last ? (
                  <text
                    x={last.x + 7}
                    y={last.y + (item.fill ? -7 : 14)}
                    fontSize={10}
                    fontWeight={700}
                    fill={item.color}
                  >
                    {formatCompactCurrency(item.values[item.values.length - 1] ?? 0)}
                  </text>
                ) : null}
              </g>
            );
          })}

          {labels.map((label, index) =>
            shouldLabel(index, labels.length) ? (
              <text
                key={`${label}-${index}`}
                x={pad.left + stepX * index}
                y={height - 9}
                textAnchor="middle"
                fontSize={10}
                fill="#5f6157"
              >
                {label}
              </text>
            ) : null
          )}
        </svg>
      </div>
    </div>
  );
}

export function MonthChangeChart({
  labels,
  changes,
  height = 240
}: {
  labels: string[];
  changes: number[];
  height?: number;
}) {
  const width = 720;
  const pad = { top: 20, right: 12, bottom: 30, left: 46 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxAbs = Math.max(5, ...changes.map((value) => Math.abs(value)));
  const scale = plotH / 2 / maxAbs;
  const base = pad.top + plotH / 2;
  const slot = plotW / Math.max(1, labels.length);
  const barW = Math.min(30, slot * 0.56);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Month over month change"
        className="block min-w-[440px] w-full"
      >
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={base}
          y2={base}
          stroke="#c9c0ae"
          strokeWidth={1}
        />
        <text
          x={pad.left - 8}
          y={base + 3.5}
          textAnchor="end"
          fontSize={10}
          fill="#5f6157"
        >
          0%
        </text>
        {changes.map((value, index) => {
          if (index === 0) return null;
          const barHeight = Math.abs(value) * scale;
          const x = pad.left + slot * index + (slot - barW) / 2;
          const y = value >= 0 ? base - barHeight : base;
          const radius = Math.min(3, barHeight);
          const d =
            value >= 0
              ? `M${x} ${base} L${x} ${y + radius} Q${x} ${y} ${x + radius} ${y} L${x + barW - radius} ${y} Q${x + barW} ${y} ${x + barW} ${y + radius} L${x + barW} ${base} Z`
              : `M${x} ${base} L${x} ${base + barHeight - radius} Q${x} ${base + barHeight} ${x + radius} ${base + barHeight} L${x + barW - radius} ${base + barHeight} Q${x + barW} ${base + barHeight} ${x + barW} ${base + barHeight - radius} L${x + barW} ${base} Z`;
          return (
            <g key={`${labels[index]}-${index}`}>
              <path d={d} fill={value >= 0 ? CHART_COLORS.collected : CHART_COLORS.prior}>
                <title>{`${labels[index]}: ${value >= 0 ? "+" : ""}${value.toFixed(1)}%`}</title>
              </path>
              {shouldLabel(index, labels.length) ? (
                <text
                  x={pad.left + slot * index + slot / 2}
                  y={height - 9}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#5f6157"
                >
                  {labels[index]}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function HorizontalBars({
  items,
  colorFor,
  emptyCopy = "No data in this period."
}: {
  items: { label: string; cents: number }[];
  colorFor?: (index: number) => string;
  emptyCopy?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm font-bold text-charcoal/55">{emptyCopy}</p>;
  }
  const max = Math.max(1, ...items.map((item) => item.cents));
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className="grid min-w-0 grid-cols-[minmax(84px,128px)_minmax(0,1fr)_auto] items-center gap-2.5"
        >
          <span
            className="truncate text-xs font-bold text-charcoal"
            title={item.label}
          >
            {item.label}
          </span>
          <span className="h-2.5 overflow-hidden rounded-[4px] border border-pine/10 bg-cream">
            <span
              className="block h-full rounded-[3px]"
              style={{
                width: `${Math.max(2, (item.cents / max) * 100)}%`,
                background: colorFor ? colorFor(index) : CHART_COLORS.invoiced
              }}
            />
          </span>
          <span className="whitespace-nowrap text-xs font-bold tabular-nums text-charcoal/65">
            {formatCompactCurrency(item.cents)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function FunnelBars({
  items
}: {
  items: { label: string; cents: number }[];
}) {
  const max = Math.max(1, ...items.map((item) => item.cents));
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item, index) => {
        const previous = index > 0 ? items[index - 1] : null;
        const rate =
          previous && previous.cents > 0
            ? (item.cents / previous.cents) * 100
            : null;
        return (
          <div
            key={item.label}
            className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2.5"
          >
            <span className="text-xs font-bold text-charcoal/65">
              {item.label}
            </span>
            <span className="h-4 overflow-hidden rounded-[4px] bg-cream">
              <span
                className="block h-full rounded-[3px]"
                style={{
                  width: `${Math.max(2, (item.cents / max) * 100)}%`,
                  background:
                    CHART_COLORS.ramp[
                      Math.min(CHART_COLORS.ramp.length - 1, index)
                    ]
                }}
              />
            </span>
            <span className="whitespace-nowrap text-xs font-bold tabular-nums text-deep-pine">
              {formatCompactCurrency(item.cents)}
              {rate != null ? (
                <span className="block text-[10px] font-semibold text-charcoal/55">
                  {rate.toFixed(1)}% of {previous?.label.toLowerCase()}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
