// 纯手写 PNG / ZIP 编码器,用于 PNG 序列帧导出打包(无第三方依赖)

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, false);
}

// ZIP 规范使用小端字节序
function u32le(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function u16le(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  u32(view, 0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  u32(view, 8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** 不压缩 deflate 块(stored blocks),PNG 规范允许 */
function storedDeflate(raw: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  let offset = 0;
  do {
    const chunk = raw.subarray(offset, Math.min(offset + 65535, raw.length));
    const last = offset + chunk.length >= raw.length;
    const header = new Uint8Array(5);
    header[0] = last ? 1 : 0;
    const hv = new DataView(header.buffer);
    hv.setUint16(1, chunk.length, true);
    hv.setUint16(3, 65535 - chunk.length, true);
    blocks.push(header, chunk);
    offset += chunk.length;
  } while (offset < raw.length);
  const total = blocks.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const b of blocks) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

/** RGBA ImageData → PNG bytes */
export function encodePNG(image: ImageData): Uint8Array {
  const { width, height, data } = image;
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const zlib = new Uint8Array(raw.length + 2 + 4 + 5 + 64);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  const deflated = storedDeflate(raw);
  zlib.set(deflated, 2);
  const adler = adler32(raw);
  const tail = new DataView(zlib.buffer, zlib.byteOffset + 2 + deflated.length);
  tail.setUint32(0, adler, false);
  const zlibBytes = zlib.subarray(0, 2 + deflated.length + 4);

  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  u32(iv, 0, width);
  u32(iv, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = chunk('IDAT', zlibBytes);
  const iend = chunk('IEND', new Uint8Array(0));
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const out = new Uint8Array(signature.length + 12 + 13 + idat.length + iend.length);
  let p = 0;
  out.set(signature, p);
  p += signature.length;
  out.set(chunk('IHDR', ihdr), p);
  p += 12 + 13;
  out.set(idat, p);
  p += idat.length;
  out.set(iend, p);
  return out;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** STORE 方式打包 ZIP(不压缩,避免引入 zlib 依赖) */
export function encodeZIP(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    u32le(lv, 0, 0x04034b50);
    u16le(lv, 4, 20); // version needed
    u16le(lv, 6, 0); // flags
    u16le(lv, 8, 0); // method: store
    u16le(lv, 10, 0); // time
    u16le(lv, 12, 0); // date
    u32le(lv, 14, crc);
    u32le(lv, 18, entry.data.length);
    u32le(lv, 22, entry.data.length);
    u16le(lv, 26, nameBytes.length);
    u16le(lv, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, entry.data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    u32le(cv, 0, 0x02014b50);
    u16le(cv, 4, 20);
    u16le(cv, 6, 20);
    u16le(cv, 8, 0);
    u16le(cv, 10, 0);
    u16le(cv, 12, 0);
    u16le(cv, 14, 0);
    u32le(cv, 16, crc);
    u32le(cv, 20, entry.data.length);
    u32le(cv, 24, entry.data.length);
    u16le(cv, 28, nameBytes.length);
    u16le(cv, 30, 0);
    u16le(cv, 32, 0);
    u16le(cv, 34, 0);
    u16le(cv, 36, 0);
    u32le(cv, 38, 0);
    u32le(cv, 42, offset);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + entry.data.length;
  }

  const centralSize = central.reduce((s, b) => s + b.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  u32le(ev, 0, 0x06054b50);
  u16le(ev, 4, 0);
  u16le(ev, 6, 0);
  u16le(ev, 8, entries.length);
  u16le(ev, 10, entries.length);
  u32le(ev, 12, centralSize);
  u32le(ev, 16, offset);
  u16le(ev, 20, 0);

  // 合并为单个连续 ArrayBuffer,避免多 TypedArray 视图交给 Blob 时的字节序兼容问题
  const totalSize = offset + centralSize + eocd.length;
  const merged = new Uint8Array(totalSize);
  let p = 0;
  for (const part of [...localParts, ...central, eocd]) {
    merged.set(part, p);
    p += part.length;
  }
  return new Blob([merged.buffer.slice(0, totalSize)], { type: 'application/zip' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
