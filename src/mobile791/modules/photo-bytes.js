// Materialize camera/IndexedDB File references before persisting or transporting.
// Only owned ArrayBuffers cross the persistence and HTTP boundaries.
export async function readPhotoBytes(value) {
  let bytes;
  if (value instanceof ArrayBuffer) bytes = value.slice(0);
  else {
    try { bytes = await value?.arrayBuffer?.(); }
    catch (error) {
      if (!(value instanceof Blob) || typeof FileReader === 'undefined') throw error;
      bytes = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        const timer = setTimeout(() => { reader.abort(); reject(new Error('Przekroczono czas odczytu zdjęcia.')); }, 30000);
        reader.onload = () => { clearTimeout(timer); resolve(reader.result); };
        reader.onerror = reader.onabort = () => { clearTimeout(timer); reject(reader.error || error); };
        reader.readAsArrayBuffer(value);
      });
    }
  }
  const expected = value instanceof ArrayBuffer ? value.byteLength : Number(value?.size);
  if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength !== expected) {
    const error = new Error('Zdjęcie nie ma pełnej zawartości bajtowej. Lokalna kopia pozostaje zachowana.');
    error.code = 'PHOTO_UPLOAD_BODY_INVALID';
    throw error;
  }
  return bytes;
}

export async function photoBytesDigest(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function encodePhotoBytes(record) {
  const next = { ...record };
  for (const field of ['local_file', 'prepared_file']) {
    if (!next[field]) continue;
    const bytes = await readPhotoBytes(next[field]);
    const digest = await photoBytesDigest(bytes);
    if (next[`${field}_sha256`] && next[`${field}_sha256`] !== digest) {
      const error = new Error('Integralność lokalnego zdjęcia nie została potwierdzona. Zachowano dane.');
      error.code = 'PHOTO_LOCAL_INTEGRITY_FAILED';
      throw error;
    }
    next[field] = bytes;
    next[`${field}_sha256`] = digest;
  }
  return next;
}

// Presentation adapter also keeps the established queue API usable by recovery
// tools and older v4 clients. The record on disk contains no File/Blob handles.
export function decodePhotoBytes(record) {
  const next = { ...record };
  for (const field of ['local_file', 'prepared_file']) {
    if (next[field] instanceof ArrayBuffer) {
      const prefix = field === 'local_file' ? 'local_file' : 'prepared_file';
      next[field] = new Blob([next[field]], {
        type: next[`${prefix}_type`] || 'image/jpeg',
      });
    }
  }
  return next;
}
