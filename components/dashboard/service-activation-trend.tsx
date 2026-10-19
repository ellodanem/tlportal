type TrendPoint = {
  label: string;
  count: number;
};

/** A compact, data-only trend for service records created in the last six months. */
export function ServiceActivationTrend({ points }: { points: TrendPoint[] }) {
  const width = 720;
  const height = 220;
  const padX = 18;
  const padTop = 18;
  const padBottom = 30;
  const maxCount = Math.max(1, ...points.map((point) => point.count));
  const innerWidth = width - padX * 2;
  const innerHeight = height - padTop - padBottom;
  const step = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;
  const hasData = points.some((point) => point.count > 0);

  const coordinates = points.map((point, index) => ({
    point,
    x: padX + index * step,
    y: padTop + innerHeight - (point.count / maxCount) * innerHeight,
  }));
  const linePath = coordinates.map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x} ${coord.y}`).join(" ");
  const areaPath = coordinates.length
    ? `${linePath} L ${coordinates[coordinates.length - 1]!.x} ${padTop + innerHeight} L ${coordinates[0]!.x} ${padTop + innerHeight} Z`
    : "";

  if (!hasData) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/70 px-5 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/30 dark:text-zinc-400">
        No service records were created in this period.
      </div>
    );
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-52 w-full overflow-visible"
        role="img"
        aria-label="New service records over the last six months"
      >
        <defs>
          <linearGradient id="dashboard-service-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((position) => {
          const y = padTop + innerHeight * position;
          return <path key={position} d={`M ${padX} ${y} H ${width - padX}`} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeDasharray="5 7" />;
        })}
        <path d={areaPath} fill="url(#dashboard-service-trend-fill)" />
        <path d={linePath} fill="none" stroke="rgb(5 150 105)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        {coordinates.map((coord) => (
          <g key={coord.point.label}>
            <circle cx={coord.x} cy={coord.y} r="4" fill="rgb(5 150 105)" />
            <text x={coord.x} y={height - 7} textAnchor="middle" className="fill-zinc-500 text-[12px] dark:fill-zinc-400">
              {coord.point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
