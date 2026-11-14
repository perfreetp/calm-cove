// 极简 ZIP 写入器（STORE 不压缩），用于打包 PNG 序列帧 + 清单
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// files: [{ name: string, data: Uint8Array }]
export function makeZip(files) {
  const enc = new TextEncoder()
  const chunks = []
  const central = []
  let offset = 0
  for (const f of files) {
    const nameBytes = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // UTF-8 标志
    local.setUint16(8, 0, true) // STORE
    local.setUint32(14, crc, true)
    local.setUint32(18, f.data.length, true)
    local.setUint32(22, f.data.length, true)
    local.setUint16(26, nameBytes.length, true)
    chunks.push(new Uint8Array(local.buffer), nameBytes, f.data)
    central.push({ nameBytes, crc, size: f.data.length, offset })
    offset += 30 + nameBytes.length + f.data.length
  }
  const cdStart = offset
  for (const c of central) {
    const rec = new DataView(new ArrayBuffer(46))
    rec.setUint32(0, 0x02014b50, true)
    rec.setUint16(4, 20, true)
    rec.setUint16(6, 20, true)
    rec.setUint16(8, 0x0800, true)
    rec.setUint32(16, c.crc, true)
    rec.setUint32(20, c.size, true)
    rec.setUint32(24, c.size, true)
    rec.setUint16(28, c.nameBytes.length, true)
    rec.setUint32(42, c.offset, true)
    chunks.push(new Uint8Array(rec.buffer), c.nameBytes)
    offset += 46 + c.nameBytes.length
  }
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, central.length, true)
  end.setUint16(10, central.length, true)
  end.setUint32(12, offset - cdStart, true)
  end.setUint32(16, cdStart, true)
  chunks.push(new Uint8Array(end.buffer))
  return new Blob(chunks, { type: 'application/zip' })
}
