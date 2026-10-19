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

// The third check is intentionally blind: the AI sees only the picture, not
// Code128/OCR candidates. A high-confidence visual read that exactly matches
// one of the independent candidates can resolve a disagreement.
export function resolveNameplateSerialWithVisualAi(serialCheck = {}, aiResult = {}) {
  const aiSerial = normalizeNameplateSerial(aiResult?.aiResult?.serial_number);
  const confidence = Number(aiResult?.aiResult?.confidence?.serial_number ?? 0);
  const uncertain = aiResult?.aiResult?.uncertain_characters || [];
  const barcodeSerial = normalizeNameplateSerial(serialCheck.barcodeSerial);
  const ocrSerial = normalizeNameplateSerial(serialCheck.ocrSerial);
  if (serialCheck.status === 'confirmed') return serialCheck;
  const matchesOne = Boolean(aiSerial && (
    (barcodeSerial && aiSerial === barcodeSerial)
    || (ocrSerial && aiSerial === ocrSerial)
  ));
  // Check that the AI explicitly transcribed the printed S/N value in its
  // visual evidence; a confident guess based on barcode-shaped pixels is not
  // enough to automatically resolve a disagreement.
  const rawText = String(aiResult?.aiResult?.raw_text || '');
  const printedLabel = rawText.match(/(?:^|\b)(?:S\s*[/.-]?\s*N|SERIAL)\s*[:=._-]?\s*([A-Z0-9][A-Z0-9._/-]{9,39})/i);
  const printedEvidence = Boolean(printedLabel
    && normalizeNameplateSerial(printedLabel[1]) === aiSerial);
  const confirmedByAi = Boolean(matchesOne && printedEvidence && confidence >= 0.90
    && Array.isArray(uncertain) && uncertain.length === 0);
  if (confirmedByAi) {
    return {
      ...serialCheck,
      status: 'ai_resolved',
      serialNumber: aiSerial,
      aiSerial,
      aiConfidence: confidence,
    };
  }
  if (serialCheck.status === 'conflict') {
    return { ...serialCheck, serialNumber: '', aiSerial, aiConfidence: confidence };
  }
  // AI-only results and uncertain/disagreeing AI outputs are never auto-approved.
  if (aiSerial && serialCheck.serialNumber && aiSerial !== normalizeNameplateSerial(serialCheck.serialNumber)) {
    return { ...serialCheck, status: 'conflict', serialNumber: '', aiSerial, aiConfidence: confidence };
  }
  return {
    ...withNameplateAiSerialCandidate(serialCheck, aiSerial),
    aiSerial,
    aiConfidence: confidence,
  };
}

export function requiresNameplateSerialReview({ reading = null, serialManuallyChanged = false } = {}) {
  const status = reading?.serialCheck?.status;
  return Boolean(serialManuallyChanged || (status !== 'confirmed' && status !== 'ai_resolved'));
}
