/**
 * PieChart.jsx
 * Pure-SVG animated pie chart — no extra dependencies.
 * Props:
 *   slices  : [{ label, value, color }]
 *   size    : number (diameter in px, default 180)
 */
export default function PieChart({ slices = [], size = 180 }) {
  const r = size / 2;
  const cx = r;
  const cy = r;
  const innerR = r * 0.55; // donut hole

  const total = slices.reduce((s, x) => s + x.value, 0);

  // Build arc paths
  const paths = [];
  let startAngle = -Math.PI / 2; // start at top

  slices.forEach((slice, i) => {
    const fraction = total === 0 ? 1 / slices.length : slice.value / total;
    const angle = fraction * 2 * Math.PI;
    const endAngle = startAngle + angle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    paths.push({
      d: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`,
      color: slice.color,
      label: slice.label,
      value: slice.value,
    });

    startAngle = endAngle;
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="drop-shadow-lg"
        style={{ animation: "fadeIn .5s ease" }}
      >
        <style>{`@keyframes fadeIn{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}`}</style>
        {total === 0 ? (
          // Empty state ring
          <circle
            cx={cx}
            cy={cy}
            r={(r + innerR) / 2}
            fill="none"
            stroke="currentColor"
            strokeWidth={r - innerR}
            strokeOpacity={0.1}
          />
        ) : (
          paths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              fill={p.color}
              opacity={0.9}
              className="hover:opacity-100 transition-opacity cursor-default"
            >
              <title>{p.label}: {p.value}</title>
            </path>
          ))
        )}
        {/* Centre label */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size * 0.14}
          fontWeight="700"
          fill="currentColor"
          opacity={0.85}
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + size * 0.09}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size * 0.08}
          fill="currentColor"
          opacity={0.5}
        >
          tasks
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
              style={{ background: s.color }}
            />
            <span className="text-on-surface-variant">{s.label}</span>
            <span className="font-semibold text-on-surface">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
