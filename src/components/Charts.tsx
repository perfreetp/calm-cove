import React from 'react';

export function Donut({
  slices,
  size = 132,
  thickness = 15,
  centerLabel,
  centerValue,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: React.ReactNode;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#111d28" strokeWidth={thickness} />
        {slices.map((s, i) => {
          const len = (s.value / total) * circ;
          const el = (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - 1.5)} ${circ}`}
              strokeDashoffset={-acc}
              strokeLinecap="round"
            />
          );
          acc += len;
          return el;
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600 }}>{centerValue ?? total}</div>
          <div className="tiny dim" style={{ marginTop: 1 }}>{centerLabel}</div>
        </div>
      </div>
    </div>
  );
}

export function AreaChart({
  data,
  height = 132,
  color = '#4fd1c5',
  color2 = '#e5b76a',
}: {
  data: Array<{ day: string; created: number; delivered: number; returned: number }>;
  height?: number;
  color?: string;
  color2?: string;
}) {
  const w = 640;
  const h = height;
  const pad = { l: 8, r: 8, t: 10, b: 18 };
  const max = Math.max(1, ...data.map((d) => Math.max(d.created, d.delivered)));
  const x = (i: number) => pad.l + (i / Math.max(1, data.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  const line = (key: 'created' | 'delivered') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={pad.l} x2={w - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="#16232f" strokeWidth="1" />
      ))}
      <path d={`${line('delivered')} L${w - pad.r},${h - pad.b} L${pad.l},${h - pad.b} Z`} fill="url(#areaGrad)" opacity="0.8" />
      <path d={line('created')} fill="none" stroke={color2} strokeWidth="1.4" strokeDasharray="3 3" opacity="0.75" />
      <path d={line('delivered')} fill="none" stroke={color} strokeWidth="1.8" />
      {data.map((d, i) =>
        d.returned > 0 ? <circle key={d.day} cx={x(i)} cy={y(d.returned)} r="2.4" fill="#e8624f" /> : null,
      )}
      <text x={pad.l} y={h - 4} fill="#4d6276" fontSize="9" fontFamily="ui-monospace, monospace">{data[0]?.day.slice(5)}</text>
      <text x={w - pad.r} y={h - 4} fill="#4d6276" fontSize="9" textAnchor="end" fontFamily="ui-monospace, monospace">
        {data[data.length - 1]?.day.slice(5)}
      </text>
    </svg>
  );
}

export function Spark({ values, color = '#4fd1c5', w = 64, h = 22 }: { values: number[]; color?: string; w?: number; h?: number }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 3) - 1}`).join(' ');
  return (
    <svg width={w} height={h} className="spark">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    </svg>
  );
}
