// 灯具型号库 —— 高天棚 / 线槽 / 应急灯具

export const CCT_OPTIONS = [3000, 4000, 5000, 6500];

export const CCT_TINT = {
  3000: '#ffb063',
  4000: '#ffd39a',
  5000: '#fff0d6',
  6500: '#d9ecff',
};

export const CCT_LABEL = {
  3000: '3000K 暖白',
  4000: '4000K 中性',
  5000: '5000K 冷白',
  6500: '6500K 日光',
};

export const CATALOG = [
  {
    id: 'HB150',
    name: 'HB-LED 150W 高天棚',
    short: 'HB-150',
    watts: 150,
    lumens: 15000,
    beam: 90,
    cct: 4000,
    sourceRadius: 0.3,
    area: 0.9,
    ip: 'IP54',
  },
  {
    id: 'HB200',
    name: 'HB-LED 200W 高天棚',
    short: 'HB-200',
    watts: 200,
    lumens: 20000,
    beam: 110,
    cct: 5000,
    sourceRadius: 0.34,
    area: 1.05,
    ip: 'IP54',
  },
  {
    id: 'HB100N',
    name: 'HB-LED 100W 窄配光',
    short: 'HB-100N',
    watts: 100,
    lumens: 10000,
    beam: 60,
    cct: 5000,
    sourceRadius: 0.26,
    area: 0.7,
    ip: 'IP54',
  },
  {
    id: 'LN80',
    name: 'LN-LED 80W 线槽灯',
    short: 'LN-80',
    watts: 80,
    lumens: 8000,
    beam: 120,
    cct: 4000,
    sourceRadius: 0.55,
    area: 1.2,
    ip: 'IP40',
  },
  {
    id: 'EM40',
    name: 'EM-LED 40W 应急灯',
    short: 'EM-40',
    watts: 40,
    lumens: 4000,
    beam: 90,
    cct: 5000,
    sourceRadius: 0.24,
    area: 0.55,
    ip: 'IP65',
  },
];

export const CAT = Object.fromEntries(CATALOG.map((m) => [m.id, m]));

export function beamExponent(beamDeg) {
  const half = (beamDeg * Math.PI) / 360;
  return Math.log(0.5) / Math.log(Math.max(0.05, Math.cos(half)));
}

// 光强峰值：I(γ)=I0·cos^n(γ)，对半球积分等于光通量
export function peakIntensity(model) {
  return (model.lumens * (beamExponent(model.beam) + 1)) / (2 * Math.PI);
}
