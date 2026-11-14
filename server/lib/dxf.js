// Minimal AC1015-compatible ASCII DXF writer for tunnel schematics.
// Produces one layer per discipline, block definitions for repeated symbols,
// and an ENTITIES section with INSERT/LINE/CIRCLE/TEXT records.

import { KINDS, LAYERS, LAYER_ORDER, SHEET_SIZES_MM } from '../../shared/domain.js';

const LINE = (x1, y1, x2, y2, layer) =>
  `0\nLINE\n8\n${layer}\n10\n${f(x1)}\n20\n${f(y1)}\n30\n0.0\n11\n${f(x2)}\n21\n${f(y2)}\n31\n0.0\n`;
const CIRCLE = (x, y, r, layer) =>
  `0\nCIRCLE\n8\n${layer}\n10\n${f(x)}\n20\n${f(y)}\n30\n0.0\n40\n${f(r)}\n`;
const ARC = (x, y, r, a0, a1, layer) =>
  `0\nARC\n8\n${layer}\n10\n${f(x)}\n20\n${f(y)}\n30\n0.0\n40\n${f(r)}\n50\n${f(a0)}\n51\n${f(a1)}\n`;
const TEXT = (x, y, str, layer, h = 1.2, rot = 0) =>
  `0\nTEXT\n8\n${layer}\n10\n${f(x)}\n20\n${f(y)}\n30\n0.0\n40\n${f(h)}\n1\n${escapeText(str)}\n50\n${rot}\n`;
const INSERT = (block, x, y, layer, sx = 1, sy = 1, rot = 0) =>
  `0\nINSERT\n8\n${layer}\n2\n${block}\n10\n${f(x)}\n20\n${f(y)}\n30\n0.0\n41\n${f(sx)}\n42\n${f(sy)}\n50\n${rot}\n`;

const f = (n) => (Number.isFinite(n) ? Number(n).toFixed(4) : '0.0');
// The file is written as UTF-8 and declares $DWGCODEPAGE ANSI_936, so CJK text
// passes through unchanged; only control characters are neutralised.
const escapeText = (s) => String(s).replace(/[\r\n\t]/g, ' ');

export function buildBlocks() {
  // Block geometry drawn centred on origin, 1 unit wide by 1 unit tall where
  // possible; INSERT scale factors supply the real extents.
  const blocks = [];
  const rect = (layer, x1, y1, x2, y2) => [
    LINE(x1, y1, x2, y1, layer), LINE(x2, y1, x2, y2, layer),
    LINE(x2, y2, x1, y2, layer), LINE(x1, y2, x1, y1, layer),
  ].join('');

  blocks.push({ name: 'JET_FAN', layer: 'HVAC', body:
    rect('HVAC', -2.1, -0.675, 2.1, 0.675) +
    LINE(-1.4, 0.675, -0.35, -0.675, 'HVAC') +
    LINE(0.35, 0.675, 1.4, -0.675, 'HVAC') +
    CIRCLE(-1.75, 0, 0.45, 'HVAC') +
    CIRCLE(1.75, 0, 0.45, 'HVAC') +
    TEXT(0, -1.15, 'JF', 'HVAC', 0.7, 0),
  });
  blocks.push({ name: 'DAMPER', layer: 'HVAC', body:
    rect('HVAC', -0.9, -0.475, 0.9, 0.475) +
    LINE(-0.9, -0.475, 0.9, 0.475, 'HVAC') +
    LINE(-0.9, 0.475, 0.9, -0.475, 'HVAC'),
  });
  blocks.push({ name: 'CO_SENSOR', layer: 'ELEC', body:
    CIRCLE(0, 0, 0.6, 'ELEC') + TEXT(0, 0, 'CO', 'ELEC', 0.55, 0),
  });
  blocks.push({ name: 'VI_SENSOR', layer: 'ELEC', body:
    CIRCLE(0, 0, 0.6, 'ELEC') + TEXT(0, 0, 'VI', 'ELEC', 0.55, 0),
  });
  blocks.push({ name: 'FAN_ROOM_EQUIP', layer: 'HVAC', body:
    rect('HVAC', -3, -1.4, 3, 1.4) +
    LINE(-3, 0, 3, 0, 'HVAC') +
    TEXT(0, 0.45, 'EQ', 'HVAC', 0.9, 0),
  });
  blocks.push({ name: 'CIVIL_JOINT', layer: 'CIVIL', body:
    LINE(0, -0.5, 0, 0.5, 'CIVIL') + LINE(-0.2, -0.5, 0.2, -0.5, 'CIVIL') + LINE(-0.2, 0.5, 0.2, 0.5, 'CIVIL'),
  });
  blocks.push({ name: 'CHAINAGE_MARK', layer: 'ANNO', body:
    LINE(0, -4.75, 0, 4.75, 'ANNO') + TEXT(0.4, 4.95, 'CH', 'ANNO', 1.0, 0),
  });
  return blocks;
}

/**
 * Render elements to a DXF string.
 * @param {object} opts {project, sections, elements, layer, sheet, includeTitleBlock}
 */
export function renderDxf({ project, sections = [], elements = [], layer = null, section = null, title = '' }) {
  const blocks = buildBlocks();
  const layers = layer ? [layer] : LAYER_ORDER;
  const header = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
9
$DWGCODEPAGE
3
ANSI_936
9
$INSBASE
10
0.0
20
0.0
30
0.0
0
ENDSEC
`;

  const layerTable = `0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
${layers.length}
${layers.map((l) => `0
LAYER
2
${l.toUpperCase()}
70
0
62
${LAYERS[l].cdxf}
6
CONTINUOUS
`).join('')}0
ENDTAB
0
TABLE
2
BLOCK_RECORD
70
${blocks.length}
${blocks.map((b) => `0
BLOCK_RECORD\n2\n${b.name}\n70\n0\n`).join('')}0
ENDTAB
0
ENDSEC
`;

  const blocksSection = `0
SECTION
2
BLOCKS
${blocks.map((b) => `0
BLOCK
8
${b.layer}
2
${b.name}
70
0
10
0.0
20
0.0
30
0.0
3
${b.name}
1

${b.body}0
ENDBLK
8
${b.layer}
`).join('')}0
ENDSEC
`;

  const inLayer = (kind, l) => {
    if (layer && KINDS[kind].layer !== layer && !(kind === 'chainage_mark' && layer === 'anno')) return false;
    return true;
  };

  let ents = '';
  // Bore outlines (civil)
  if (!layer || layer === 'civil') {
    for (const [i, cy] of project.layout.centers.entries()) {
      const half = project.layout.boreW / 2;
      const x0 = project.range ? project.range[0] : 0;
      const x1 = project.range ? project.range[1] : project.length_m;
      ents += LINE(x0, cy - half, x1, cy - half, 'CIVIL');
      ents += LINE(x0, cy + half, x1, cy + half, 'CIVIL');
      ents += LINE(x0, cy - half, x0, cy + half, 'CIVIL');
      ents += LINE(x1, cy - half, x1, cy + half, 'CIVIL');
      ents += LINE(x0, cy - project.layout.roadW / 2, x1, cy - project.layout.roadW / 2, 'CIVIL');
      ents += LINE(x0, cy + project.layout.roadW / 2, x1, cy + project.layout.roadW / 2, 'CIVIL');
    }
  }

  for (const e of elements) {
    if (!inLayer(e.kind, e.layer)) continue;
    const lay = e.layer.toUpperCase();
    if (e.kind === 'chainage_mark') {
      // chainage label text with section code
      ents += TEXT(e.chainage + 1, e.offset + 5.2, `${e_sec(e) || ''}  K${Math.floor(e.chainage / 1000)}+${String(Math.round(e.chainage % 1000)).padStart(3, '0')}`, 'ANNO', 2.2, 0);
      ents += LINE(e.chainage, project.layout.centers[e.bore_index] - 5.4, e.chainage, project.layout.centers[e.bore_index] + 5.4, 'ANNO');
      continue;
    }
    const rot = e.angle_deg || 0;
    switch (e.kind) {
      case 'jet_fan':
        ents += INSERT('JET_FAN', e.chainage, e.offset, 'HVAC', KINDS.jet_fan.w / 4.2, KINDS.jet_fan.h / 1.35, rot);
        ents += TEXT(e.chainage, e.offset + 1.05, e.code, 'HVAC', 0.55, 0);
        break;
      case 'damper':
        ents += INSERT('DAMPER', e.chainage, e.offset, 'HVAC', KINDS.damper.w / 1.8, KINDS.damper.h / 0.95, rot);
        break;
      case 'duct': {
        const len = e.length_override || KINDS.duct.w;
        ents += LINE(e.chainage - len / 2, e.offset + 0.65, e.chainage + len / 2, e.offset + 0.65, 'HVAC');
        ents += LINE(e.chainage - len / 2, e.offset - 0.65, e.chainage + len / 2, e.offset - 0.65, 'HVAC');
        ents += LINE(e.chainage + len / 2, e.offset - 0.65, e.chainage + len / 2, e.offset + 0.65, 'HVAC');
        break;
      }
      case 'cable_tray': {
        const len = e.length_override || KINDS.cable_tray.w;
        ents += LINE(e.chainage - len / 2, e.offset - 0.3, e.chainage + len / 2, e.offset - 0.3, 'ELEC');
        ents += LINE(e.chainage - len / 2, e.offset + 0.3, e.chainage + len / 2, e.offset + 0.3, 'ELEC');
        break;
      }
      case 'fan_equip':
        ents += INSERT('FAN_ROOM_EQUIP', e.chainage, e.offset, 'HVAC', KINDS.fan_equip.w / 6, KINDS.fan_equip.h / 2.8, rot);
        ents += TEXT(e.chainage, e.offset - 1.9, e.code, 'HVAC', 0.55, 0);
        break;
      case 'co_sensor':
        ents += INSERT('CO_SENSOR', e.chainage, e.offset, 'ELEC', 1, 1, 0);
        ents += TEXT(e.chainage, e.offset + 1.1, e.code, 'ELEC', 0.5, 0);
        break;
      case 'vi_sensor':
        ents += INSERT('VI_SENSOR', e.chainage, e.offset, 'ELEC', 1, 1, 0);
        ents += TEXT(e.chainage, e.offset + 1.1, e.code, 'ELEC', 0.5, 0);
        break;
      case 'civil_joint':
        ents += INSERT('CIVIL_JOINT', e.chainage, e.offset, 'CIVIL', 1, project.layout.boreW / 1, 0);
        break;
      default:
        ents += CIRCLE(e.chainage, e.offset, 0.4, lay);
    }
  }

  if (!layer || layer === 'anno') {
    ents += TEXT(project.range ? project.range[0] : 0, project.layout.extentY, title || `${project.code} ${project.name}`, 'ANNO', 3.2, 0);
  }

  const entities = `0
SECTION
2
ENTITIES
${ents}0
ENDSEC
0
EOF
`;
  return header + layerTable + blocksSection + entities;
}

function e_sec(e) {
  return e.section_code || '';
}

export function dxfFileNames() {
  return LAYER_ORDER.map((l) => ({ layer: l, name: LAYERS[l].name }));
}

export function sheetDimsMm(spec) {
  return SHEET_SIZES_MM[spec] || SHEET_SIZES_MM.A1;
}
