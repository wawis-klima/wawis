// Serial numbers are identifiers: plausibility is NOT proof of correctness.
// Only an exact match between independent barcode and printed SN readers
// qualifies as an automatically confirmed serial number.
export function normalizeNameplateSerial(value = '') {
  return String(value || '').replace(/\s+/g, '').trim().toUpperCase();
}

export function reconcileNameplateSerial({
  barcodeSerial = '',
  ocrSerial = '',
  ocrVotes = 0,
  ocrConfidence = 0,
  ocrRawText = '',
} = {}) {
  const barcode = normalizeNameplateSerial(barcodeSerial);
  const rawOcr = normalizeNameplateSerial(ocrSerial);
  // A single OCR pass (or text without an SN label) must not outvote a barcode.
  const ocrSupported = Boolean(
    rawOcr
    && Number(ocrVotes) >= 2
    && Number(ocrConfidence) >= 45
    && /(?:^|\b)(?:S\s*[/.-]?\s*N|SERIAL)\s*[:;=._-]?/i.test(ocrRawText),
  );
  const ocr = ocrSupported ? rawOcr : '';

  if (barcode && ocr && barcode === ocr) {
    return { status: 'confirmed', serialNumber: barcode, barcodeSerial: barcode, ocrSerial: ocr };
  }
  if (barcode && ocr && barcode !== ocr) {
    // Never silently prefer either decoder when independent readers disagree.
    return { status: 'conflict', serialNumber: '', barcodeSerial: barcode, ocrSerial: ocr };
  }
  if (barcode || ocr) {
    return { status: 'single_source', serialNumber: barcode || ocr, barcodeSerial: barcode, ocrSerial: ocr };
  }
  return { status: 'missing', serialNumber: '', barcodeSerial: barcode, ocrSerial: ocr };
}

// AI only supplies a candidate for human review. It cannot be used as
// independent confirmation here, because it receives barcode context.
export function withNameplateAiSerialCandidate(serialCheck = {}, aiSerial = '') {
  if (serialCheck.status === 'conflict' || serialCheck.status === 'confirmed') return serialCheck;
  const existing = normalizeNameplateSerial(serialCheck.serialNumber);
  const candidate = existing || normalizeNameplateSerial(aiSerial);
  return {
    ...serialCheck,
    status: candidate ? 'single_source' : 'missing',
    serialNumber: candidate,
  };
}

export function requiresNameplateSerialReview({ reading = null, serialManuallyChanged = false } = {}) {
  return Boolean(serialManuallyChanged || reading?.serialCheck?.status !== 'confirmed');
}
