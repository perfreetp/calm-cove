import { unzlibSync } from 'fflate';

export interface DecodedPng {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/**
 * Minimal PNG reader for tests: supports the 8-bit RGBA, filter-0 images that
 * `encodePng` produces. Throws on anything it cannot faithfully decode.
 */
export function decodePng(bytes: Uint8Array): DecodedPng {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) throw new Error('不是 PNG 文件');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];

  const readU32 = (at: number) =>
    ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

  while (offset < bytes.length) {
    const length = readU32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = readU32(offset + 8);
      height = readU32(offset + 12);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8 || colorType !== 6) throw new Error(`不支持的颜色格式 ${bitDepth}/${colorType}`);
  const combined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let cursor = 0;
  for (const d of idat) {
    combined.set(d, cursor);
    cursor += d.length;
  }
  const raw = unzlibSync(combined);
  const stride = width * 4;
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter !== 0) throw new Error(`测试解码器仅支持 filter 0，遇到 ${filter}`);
    rgba.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  }
  return { width, height, rgba };
}
