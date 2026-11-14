import React from 'react';

const s = (props: { size?: number; fill?: boolean; stroke?: number }) => ({
  width: props.size ?? 16,
  height: props.size ?? 16,
  viewBox: '0 0 24 24',
  fill: props.fill ? 'currentColor' : 'none',
  stroke: 'currentColor',
  strokeWidth: props.stroke ?? 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

type P = { size?: number; className?: string };

export const IconEar = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M7 9a5 5 0 0 1 10 0c0 2.6-1.3 3.4-2.6 4.6C13.2 14.7 12 16 12 18a3 3 0 0 0 5.4 1.8" />
    <path d="M10 9.2a2 2 0 0 1 3.6 1.1c0 1.1-.7 1.6-1.4 2.2" />
  </svg>
);
export const IconGrid = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
  </svg>
);
export const IconCube = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M12 3.2 20 7.6v9L12 21 4 16.6v-9z" />
    <path d="M4 7.6 12 12l8-4.4M12 12v9" />
  </svg>
);
export const IconLayers = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="m12 3 8.5 4.5L12 12 3.5 7.5z" />
    <path d="m3.5 12 8.5 4.6L20.5 12M3.5 16.6l8.5 4.6 8.5-4.6" />
  </svg>
);
export const IconStore = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M4 9.5 5.6 4h12.8L20 9.5" />
    <path d="M4 9.5a2.4 2.4 0 0 0 4.2 1.5A2.4 2.4 0 0 0 12 12a2.4 2.4 0 0 0 3.8-1 2.4 2.4 0 0 0 4.2-1.5M5.5 11.4V20h13v-8.6" />
  </svg>
);
export const IconUsers = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <circle cx="9.5" cy="8.5" r="3.2" />
    <path d="M4 19c.5-3.2 2.8-4.6 5.5-4.6s5 1.4 5.5 4.6" />
    <path d="M16 5.6a3 3 0 0 1 0 5.8M17.4 14.8c2 .5 3.2 1.9 3.6 4.2" />
  </svg>
);
export const IconBox = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M3.5 8 12 3.6 20.5 8v8L12 20.4 3.5 16z" />
    <path d="M3.5 8 12 12.4 20.5 8M12 12.4v8" />
  </svg>
);
export const IconChart = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M4 20V10M9 20V5M14 20v-6M19 20V8" />
  </svg>
);
export const IconShield = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M12 3.4 19 6v6.2c0 4.3-2.9 6.9-7 8.4-4.1-1.5-7-4.1-7-8.4V6z" />
    <path d="m9 12 2.2 2.2L15.4 10" />
  </svg>
);
export const IconSearch = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <circle cx="10.8" cy="10.8" r="6" />
    <path d="m15.4 15.4 4.2 4.2" />
  </svg>
);
export const IconUpload = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M12 16V4.5M8 8l4-3.5L16 8" />
    <path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" />
  </svg>
);
export const IconDownload = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M12 4.5V16M8 12l4 3.5L16 12" />
    <path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" />
  </svg>
);
export const IconSave = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M5 4.5h11L19.5 8v11.5H5z" />
    <path d="M8.5 4.5v5h7v-5M8.5 19.5v-6h7v6" />
  </svg>
);
export const IconCheck = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="m5 12.5 4.5 4.5L19 6.5" />
  </svg>
);
export const IconX = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
  </svg>
);
export const IconUndo = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M8 8H4V4" />
    <path d="M4.5 8A8 8 0 1 1 4 13" />
  </svg>
);
export const IconRotate = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M20 12a8 8 0 1 1-2.6-5.8" />
    <path d="M20 4v4.6h-4.6" />
  </svg>
);
export const IconTarget = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 1.6v3M12 19.4v3M1.6 12h3M19.4 12h3" />
  </svg>
);
export const IconSun = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19" />
  </svg>
);
export const IconSliders = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M5 6.5h14M5 12h14M5 17.5h14" />
    <circle cx="9" cy="6.5" r="2.1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="12" r="2.1" fill="currentColor" stroke="none" />
    <circle cx="7.5" cy="17.5" r="2.1" fill="currentColor" stroke="none" />
  </svg>
);
export const IconSheet = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M4.5 4.5h15v15h-15z" />
    <path d="M4.5 9.5h15M4.5 14.5h15M9.5 4.5v15M14.5 4.5v15" strokeDasharray="1.4 1.6" />
  </svg>
);
export const IconAlert = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M12 4 21 19.5H3z" />
    <path d="M12 9.5v4.2M12 16.6v.4" />
  </svg>
);
export const IconInfo = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.2M12 7.6v.4" />
  </svg>
);
export const IconClock = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.4V12l3.2 2" />
  </svg>
);
export const IconUser = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <circle cx="12" cy="8.4" r="3.6" />
    <path d="M5 20c.7-3.8 3.4-5.6 7-5.6s6.3 1.8 7 5.6" />
  </svg>
);
export const IconChevron = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="m9 5.5 6 6.5-6 6.5" />
  </svg>
);
export const IconPlus = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconTrend = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="m3.5 16.5 5-5.5 4 3.5 7.5-8" />
    <path d="M15.5 6.5H20V11" />
  </svg>
);
export const IconLock = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8.4 10.5V8a3.6 3.6 0 0 1 7.2 0v2.5" />
  </svg>
);
export const IconArrow = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M4.5 12h15M14 6.5l5.5 5.5L14 17.5" />
  </svg>
);
export const IconSparkle = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M12 3.5 13.9 9l5.6 1.4-5.6 1.4L12 17.4 10.1 11.8 4.5 10.4 10.1 9z" />
    <path d="M18.5 16.5 19.2 18.5l2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
  </svg>
);
export const IconWave = (p: P) => (
  <svg {...s({ size: p.size })} className={p.className}>
    <path d="M2.5 12c1.6 0 1.6-5 3.2-5s1.6 10 3.2 10 1.6-7 3.2-7 1.6 4 3.2 4 1.6-2 3.2-2 1.6 0 3.2 0" />
  </svg>
);
