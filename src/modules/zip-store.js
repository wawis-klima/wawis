// WAWIS 14.37 — prosty zapis archiwum ZIP (bez kompresji, metoda „store”) dla pobierania zbiorczego protokołów.
// PDF-y są już skompresowane, więc kompresja ZIP nic by nie dała. Nazwy plików w UTF-8 (polskie znaki).
// Bez zewnętrznych bibliotek. Limit: do 65 535 plików i 4 GB (ZIP bez rozszerzenia ZIP64) — z dużym zapasem.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const day = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, day };
}

async function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data && typeof data.arrayBuffer === 'function') return new Uint8Array(await data.arrayBuffer());
  return new TextEncoder().encode(String(data ?? ''));
}

/**
 * entries: [{ name: 'folder/plik.pdf', data: Blob | Uint8Array | ArrayBuffer | string, date?: Date }]
 * Zwraca Blob (application/zip). Powtórzone nazwy dostają przyrostek „ (2)”.
 */
export async function createZipBlob(entries = [], { now = new Date() } = {}) {
  const encoder = new TextEncoder();
  const used = new Set();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    let name = String(entry?.name || 'plik').replace(/\\/g, '/').replace(/^\/+/, '');
    if (used.has(name.toLowerCase())) {
      const dot = name.lastIndexOf('.');
      const base = dot > name.lastIndexOf('/') ? name.slice(0, dot) : name;
      const ext = dot > name.lastIndexOf('/') ? name.slice(dot) : '';
      let n = 2;
      while (used.has(`${base} (${n})${ext}`.toLowerCase())) n += 1;
      name = `${base} (${n})${ext}`;
    }
    used.add(name.toLowerCase());

    const nameBytes = encoder.encode(name);
    const data = await toBytes(entry.data);
    const crc = crc32(data);
    const { time, day } = dosDateTime(entry.date || now);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8
    local.setUint16(8, 0, true); // store
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);

    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 20, true);
    head.setUint16(8, 0x0800, true);
    head.setUint16(10, 0, true);
    head.setUint16(12, time, true);
    head.setUint16(14, day, true);
    head.setUint32(16, crc, true);
    head.setUint32(20, data.length, true);
    head.setUint32(24, data.length, true);
    head.setUint16(28, nameBytes.length, true);
    head.setUint32(42, offset, true);
    central.push(new Uint8Array(head.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/** Odczyt nazw plików z archiwum (do testów i kontroli). */
export function listZipEntryNames(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('To nie jest archiwum ZIP.');
  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const names = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('Uszkodzony katalog ZIP.');
    const nameLength = view.getUint16(pos + 28, true);
    const extra = view.getUint16(pos + 30, true);
    const comment = view.getUint16(pos + 32, true);
    names.push(decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength)));
    pos += 46 + nameLength + extra + comment;
  }
  return names;
}
