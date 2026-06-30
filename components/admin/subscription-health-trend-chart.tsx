type TrendPoint = {
  label: string;
  count: number;
};

export function SubscriptionHealthTrendChart({
  points,
  totalLabel,
}: {
  points: TrendPoint[];
  totalLabel: string;
}) {
  const width = 640;
  const height = 200;
  const padX = 8;
  const padY = 16;
  const maxCount = Math.max(1, ...points.map((point) => point.count));
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const step = points.length > 1 ? innerW / (points.length - 1) : innerW;

  const coords = points.map((point, index) => {
    const x = padX + index * step;
    const y = padY + innerH - (point.count / maxCount) * innerH;
    return { x, y, point };
  });

  const linePath = coords.map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x} ${coord.y}`).join(" ");
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1]?.x ?? padX} ${padY + innerH} L ${coords[0]?.x ?? padX} ${padY + innerH} Z`
      : "";

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-48 w-full"
        role="img"
        aria-label={`New subscriptions trend: ${totalLabel}`}
      >
        <defs>
          <linearGradient id="subscription-health-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {areaPath ? <path d={areaPath} fill="url(#subscription-health-fill)" /> : null}
        {linePath ? (
          <path d={linePath} fill="none" stroke="rgb(5 150 105)" strokeWidth="2.5" strokeLinejoin="round" />
        ) : null}
        {coords.map((coord) => (
          <circle key={coord.point.label} cx={coord.x} cy={coord.y} r="3.5" fill="rgb(5 150 105)" />
        ))}
      </svg>
      <div className="mt-2 flex justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        {points.length > 0 ? (
          <>
            <span>{points[0]?.label}</span>
            <span>{points[Math.floor(points.length / 2)]?.label}</span>
            <span>{points[points.length - 1]?.label}</span>
          </>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{totalLabel}</p>
    </div>
  );
}
