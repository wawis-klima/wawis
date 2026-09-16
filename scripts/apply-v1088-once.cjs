const fs = require('node:fs');

function read(file) { return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); }
function write(file, value) { fs.writeFileSync(file, value, 'utf8'); }
function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Patch target missing: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Patch target not unique: ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

// N3 — protocol identity + CAS replacement.
{
  const file = 'src/mobile791/modules/job-protocol-storage.js';
  let source = read(file);
  source = replaceOnce(source,
    'const PROTOCOL_CLEANUP_TIMEOUT_MS = 5_000;\n',
    'const PROTOCOL_CLEANUP_TIMEOUT_MS = 5_000;\nexport const PROTOCOL_WRITE_CONFLICT = "PROTOCOL_WRITE_CONFLICT";\n',
    'protocol conflict constant');
  source = replaceOnce(source,
    `function protocolRecordUsesStoragePath(record, storagePath) {\n  return Boolean(record && normalizeText(record.storage_path) === normalizeText(storagePath));\n}\n`,
    `function protocolRecordUsesStoragePath(record, storagePath) {\n  return Boolean(record && normalizeText(record.storage_path) === normalizeText(storagePath));\n}\n\nfunction createProtocolWriteConflict({ activeRecord = null, attemptedStoragePath = "" } = {}) {\n  const error = new Error("W międzyczasie zapisano inną wersję protokołu. Twój podpis nie został uznany za zapisany — odśwież aktywny protokół i zdecyduj, czy chcesz go zastąpić.");\n  error.code = PROTOCOL_WRITE_CONFLICT;\n  error.activeRecord = activeRecord || null;\n  error.attemptedStoragePath = normalizeText(attemptedStoragePath);\n  return error;\n}\n\nexport function isProtocolWriteConflictError(error) {\n  return normalizeText(error?.code) === PROTOCOL_WRITE_CONFLICT;\n}\n`,
    'protocol conflict helper');
  source = replaceOnce(source,
    `  replaceExisting = false,\n  timeoutMs = PROTOCOL_SAVE_STEP_TIMEOUT_MS,`,
    `  replaceExisting = false,\n  expectedStoragePath = "",\n  timeoutMs = PROTOCOL_SAVE_STEP_TIMEOUT_MS,`,
    'protocol expected path argument');
  source = replaceOnce(source,
    `  if (existing.record && !replaceExisting) return existing.record;\n\n  const createdBy = await getAuthenticatedUserId(supabase, timeoutMs);`,
    `  if (existing.record && !replaceExisting) return existing.record;\n\n  const expectedExistingStoragePath = normalizeText(expectedStoragePath);\n  if (existing.record && replaceExisting && expectedExistingStoragePath\n      && !protocolRecordUsesStoragePath(existing.record, expectedExistingStoragePath)) {\n    throw createProtocolWriteConflict({ activeRecord: existing.record, attemptedStoragePath: expectedExistingStoragePath });\n  }\n\n  const createdBy = await getAuthenticatedUserId(supabase, timeoutMs);`,
    'protocol pre-upload CAS');
  source = replaceOnce(source,
    `.update(row)\n      .eq("id", existing.record.id)\n      .select(PROTOCOL_RECORD_COLUMNS)`,
    `.update(row)\n      .eq("id", existing.record.id)\n      .eq("storage_path", expectedExistingStoragePath || existing.record.storage_path)\n      .select(PROTOCOL_RECORD_COLUMNS)`,
    'protocol update CAS');
  source = replaceOnce(source,
    `      // 10.77: po niejednoznacznym wyniku zapisu nie usuwamy nowego PDF.\n      // Pusty readback nie wyklucza późnego commitu wcześniejszego UPDATE.\n      throw writeResult.error;`,
    `      if (reconciliation.confirmed && reconciliation.record) {\n        throw createProtocolWriteConflict({ activeRecord: reconciliation.record, attemptedStoragePath: storagePath });\n      }\n      // Po niejednoznacznym wyniku zapisu nie usuwamy nowego PDF.\n      // Pusty readback nie wyklucza późnego commitu wcześniejszego UPDATE.\n      throw writeResult.error;`,
    'protocol update conflict reconciliation');
  source = replaceOnce(source,
    `      // 10.77: po utraconej odpowiedzi INSERT pusty readback nie jest dowodem braku commitu.\n      // Zachowujemy plik; ewentualny orphan jest bezpieczniejszy niż rekord wskazujący usunięty PDF.\n      if (reconciliation.confirmed && reconciliation.record) return reconciliation.record;\n      throw writeResult.error;`,
    `      // Po utraconej odpowiedzi INSERT sukces oznacza wyłącznie nasz storage_path.\n      // Obcy rekord jest konfliktem, a nie potwierdzeniem naszego podpisu.\n      if (reconciliation.confirmed && reconciliation.record) {\n        throw createProtocolWriteConflict({ activeRecord: reconciliation.record, attemptedStoragePath: storagePath });\n      }\n      throw writeResult.error;`,
    'protocol insert conflict reconciliation');
  source = replaceOnce(source,
    `  if (reconciliation.confirmed && !existing.record && reconciliation.record) return reconciliation.record;\n  // 10.77: brak jednoznacznego potwierdzenia nigdy nie uruchamia kasowania nowego pliku.`,
    `  if (reconciliation.confirmed && reconciliation.record) {\n    throw createProtocolWriteConflict({ activeRecord: reconciliation.record, attemptedStoragePath: storagePath });\n  }\n  // Brak jednoznacznego potwierdzenia nigdy nie uruchamia kasowania nowego pliku.`,
    'protocol final conflict reconciliation');
  write(file, source);
}

// N3 — caller carries the version it actually edited and preserves the signature on conflict.
{
  const file = 'src/mobile791/components/modals/ProtocolTestModal.jsx';
  let source = read(file);
  source = replaceOnce(source,
    `          replaceExisting: Boolean(savedRecord),\n        });`,
    `          replaceExisting: Boolean(savedRecord),\n          expectedStoragePath: savedRecord?.storage_path || "",\n        });`,
    'modal protocol expected storage path');
  source = replaceOnce(source,
    `      } else if (error?.name !== "AbortError") {\n        setMessage(error?.message || "Nie udało się utworzyć i zapisać protokołu PDF.");\n      }`,
    `      } else if (error?.code === "PROTOCOL_WRITE_CONFLICT") {\n        setMessage(error?.message || "Aktywny protokół zmienił się w trakcie zapisu. Twój podpis pozostał w formularzu — odśwież i zdecyduj o ponownym zastąpieniu.");\n      } else if (error?.name !== "AbortError") {\n        setMessage(error?.message || "Nie udało się utworzyć i zapisać protokołu PDF.");\n      }`,
    'modal protocol conflict message');
  write(file, source);
}

// N4 — one logical fuel save owns one stable UUID and reconciles by primary key.
{
  const file = 'src/modules/fuel.js';
  let source = read(file);
  source = replaceOnce(source,
    `function makePhotoId() {\n  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();\n  return \`${'${Date.now()}-${Math.random().toString(36).slice(2)}'}\`;\n}\n`,
    `function makePhotoId() {\n  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();\n  return \`${'${Date.now()}-${Math.random().toString(36).slice(2)}'}\`;\n}\n\nexport function createFuelEntryAttemptId() {\n  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();\n  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {\n    const random = Math.floor(Math.random() * 16);\n    const value = character === "x" ? random : (random & 0x3) | 0x8;\n    return value.toString(16);\n  });\n}\n\nfunction normalizeFuelEntryId(value) {\n  const normalized = String(value || '').trim();\n  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : '';\n}\n`,
    'fuel attempt id helper');

  const start = source.indexOf('async function reconcileFuelEntryByPhotoPath');
  const end = source.indexOf('export async function updateFuelEntry');
  if (start < 0 || end < 0 || end <= start) throw new Error('Fuel add block boundaries not found');
  const replacement = `async function reconcileFuelEntryById({ supabase, entryId }) {\n  if (!entryId) return { confirmed: false, entry: null, error: null };\n  try {\n    const { data, error } = await supabase\n      .from('fuel_entries')\n      .select(FUEL_ENTRY_SELECT)\n      .eq('id', entryId)\n      .maybeSingle();\n    if (error) return { confirmed: false, entry: null, error };\n    return { confirmed: true, entry: normalizeFuelEntryResult(data), error: null };\n  } catch (error) {\n    return { confirmed: false, entry: null, error };\n  }\n}\n\nasync function reconcileFuelEntryByPhotoPath({ supabase, photoPath }) {\n  if (!photoPath) return { confirmed: false, entry: null, error: null };\n  try {\n    const { data, error } = await supabase\n      .from('fuel_entries')\n      .select(FUEL_ENTRY_SELECT)\n      .eq('odometer_photo_path', photoPath)\n      .maybeSingle();\n    if (error) return { confirmed: false, entry: null, error };\n    return { confirmed: true, entry: normalizeFuelEntryResult(data), error: null };\n  } catch (error) {\n    return { confirmed: false, entry: null, error };\n  }\n}\n\nfunction fuelEntryMatchesAttempt(entry, expected = {}) {\n  if (!entry) return false;\n  if (String(entry.id || '') !== String(expected.entryId || '')) return false;\n  if (String(entry.vehicle_id || '') !== String(expected.vehicleId || '')) return false;\n  if (Number(entry.liters) !== Number(expected.liters)) return false;\n  if (Number(entry.odometer_km) !== Number(expected.odometerKm)) return false;\n  if (expected.photoPath && String(entry.odometer_photo_path || '') !== String(expected.photoPath)) return false;\n  return true;\n}\n\nfunction fuelAttemptConflict(entryId) {\n  const error = new Error('Identyfikator tej próby tankowania jest już przypisany do innych danych. Formularz nie został zapisany ponownie.');\n  error.code = 'FUEL_ENTRY_ATTEMPT_CONFLICT';\n  error.entryId = entryId;\n  return error;\n}\n\nfunction isStorageAlreadyExistsError(error) {\n  const code = String(error?.statusCode || error?.status || error?.code || '');\n  const message = String(error?.message || '').toLowerCase();\n  return code === '409' || code === '23505' || message.includes('already exists') || message.includes('duplicate');\n}\n\nasync function removeFuelOdometerPhotoBestEffort(supabase, photoPath) {\n  if (!photoPath) return;\n  try {\n    await supabase.storage.from(FUEL_ODOMETER_BUCKET).remove([photoPath]);\n  } catch {\n    // Sprzątanie osieroconego zdjęcia nie może zmieniać wyniku zapisu tankowania.\n  }\n}\n\nasync function resolveFuelEntryInsertFailure({ supabase, entryId, photoPath, expected, error }) {\n  const byId = await reconcileFuelEntryById({ supabase, entryId });\n  if (byId.entry) {\n    if (fuelEntryMatchesAttempt(byId.entry, { ...expected, photoPath })) return byId.entry;\n    throw fuelAttemptConflict(entryId);\n  }\n  if (photoPath) {\n    const byPhoto = await reconcileFuelEntryByPhotoPath({ supabase, photoPath });\n    if (byPhoto.entry) {\n      if (fuelEntryMatchesAttempt(byPhoto.entry, { ...expected, entryId: byPhoto.entry.id, photoPath })) return byPhoto.entry;\n      throw fuelAttemptConflict(entryId);\n    }\n  }\n  throw error;\n}\n\nexport async function addFuelEntry({\n  supabase,\n  isAdmin,\n  vehicleId,\n  liters,\n  tankCapacityLiters = null,\n  odometerKm,\n  odometerPhotoBlob,\n  odometerAiConfidence,\n  odometerReadSource,\n  entryId = '',\n  existingPhotoPath = '',\n  onAttemptProgress = null,\n}) {\n  assertFuelAccess({ supabase });\n  const parsedLiters = Number(String(liters).replace(',', '.'));\n  const parsedOdometer = Number(String(odometerKm).replace(/\\s/g, ''));\n  if (!vehicleId) throw new Error('Wybierz numer rejestracyjny.');\n  if (!Number.isFinite(parsedLiters) || parsedLiters <= 0 || parsedLiters > 500) {\n    throw new Error('Ilość paliwa musi być większa od 0 i nie może przekraczać 500 litrów.');\n  }\n  const normalizedCapacity = normalizeFuelTankCapacity(tankCapacityLiters);\n  if (normalizedCapacity !== null && parsedLiters > normalizedCapacity) {\n    throw new Error(\`Nie można zatankować \${parsedLiters.toLocaleString('pl-PL')} l. Pojemność baku tego samochodu to \${normalizedCapacity.toLocaleString('pl-PL')} l.\`);\n  }\n  if (!Number.isInteger(parsedOdometer) || parsedOdometer < 0 || parsedOdometer > 5000000) {\n    throw new Error('Wpisz prawidłowy, pełny stan licznika.');\n  }\n  const suppliedEntryId = normalizeFuelEntryId(entryId);\n  const normalizedEntryId = suppliedEntryId || createFuelEntryAttemptId();\n  const normalizedExistingPhotoPath = String(existingPhotoPath || '').trim();\n  const hasPhotoBlob = odometerPhotoBlob !== null && odometerPhotoBlob !== undefined;\n  if (hasPhotoBlob && (!(odometerPhotoBlob instanceof Blob) || !String(odometerPhotoBlob.type || '').startsWith('image/'))) {\n    throw new Error('Wybrany plik nie jest prawidłowym zdjęciem licznika.');\n  }\n\n  const expected = { entryId: normalizedEntryId, vehicleId, liters: parsedLiters, odometerKm: parsedOdometer };\n  if (suppliedEntryId) {\n    const existingAttempt = await reconcileFuelEntryById({ supabase, entryId: normalizedEntryId });\n    if (existingAttempt.entry) {\n      if (fuelEntryMatchesAttempt(existingAttempt.entry, { ...expected, photoPath: normalizedExistingPhotoPath })) return existingAttempt.entry;\n      throw fuelAttemptConflict(normalizedEntryId);\n    }\n  }\n\n  let photoPath = normalizedExistingPhotoPath || null;\n  if (hasPhotoBlob && !photoPath) {\n    const sessionResult = await supabase.auth.getSession();\n    const userId = String(sessionResult?.data?.session?.user?.id || '').trim();\n    if (!userId) throw new Error('Sesja użytkownika wygasła. Zaloguj się ponownie.');\n    photoPath = \`\${userId}/\${normalizedEntryId}.jpg\`;\n    const uploadResult = await supabase.storage\n      .from(FUEL_ODOMETER_BUCKET)\n      .upload(photoPath, odometerPhotoBlob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });\n    if (uploadResult.error && !isStorageAlreadyExistsError(uploadResult.error)) throw uploadResult.error;\n    onAttemptProgress?.({ entryId: normalizedEntryId, photoPath, phase: 'photo-uploaded' });\n  }\n\n  const hasPhoto = Boolean(photoPath || hasPhotoBlob);\n  const confidence = Math.max(0, Math.min(1, Number(odometerAiConfidence || 0)));\n  const readSource = hasPhoto && ['local_ocr', 'openai', 'manual'].includes(odometerReadSource)\n    ? odometerReadSource\n    : hasPhoto ? 'openai' : 'manual';\n\n  onAttemptProgress?.({ entryId: normalizedEntryId, photoPath, phase: 'inserting' });\n  let insertResult;\n  try {\n    insertResult = await supabase\n      .from('fuel_entries')\n      .insert({\n        id: normalizedEntryId,\n        vehicle_id: vehicleId,\n        liters: parsedLiters,\n        odometer_km: parsedOdometer,\n        odometer_photo_path: photoPath,\n        odometer_ai_confidence: hasPhoto ? confidence : null,\n        odometer_read_source: readSource,\n      })\n      .select(FUEL_ENTRY_SELECT)\n      .single();\n  } catch (error) {\n    return resolveFuelEntryInsertFailure({ supabase, entryId: normalizedEntryId, photoPath, expected, error });\n  }\n\n  if (insertResult.error) {\n    return resolveFuelEntryInsertFailure({ supabase, entryId: normalizedEntryId, photoPath, expected, error: insertResult.error });\n  }\n\n  const savedEntry = normalizeFuelEntryResult(insertResult.data);\n  if (savedEntry && fuelEntryMatchesAttempt(savedEntry, { ...expected, photoPath })) return savedEntry;\n  if (savedEntry) throw fuelAttemptConflict(normalizedEntryId);\n\n  const missingConfirmationError = new Error('Tankowanie zostało wysłane, ale baza nie zwróciła jednoznacznego potwierdzenia zapisu.');\n  return resolveFuelEntryInsertFailure({ supabase, entryId: normalizedEntryId, photoPath, expected, error: missingConfirmationError });\n}\n\n`;
  source = source.slice(0, start) + replacement + source.slice(end);
  write(file, source);
}

// N4 — persist the logical fuel attempt across retry/reload.
{
  const file = 'src/components/fuel/FuelPanelBase.jsx';
  let source = read(file);
  source = replaceOnce(source,
    `  checkRapidFuelRefill,\n  deleteFuelEntry,`,
    `  checkRapidFuelRefill,\n  createFuelEntryAttemptId,\n  deleteFuelEntry,`,
    'fuel panel attempt import');
  source = replaceOnce(source,
    `const HISTORY_PAGE_SIZE = 5;\n`,
    `const HISTORY_PAGE_SIZE = 5;\nconst FUEL_ENTRY_ATTEMPT_STORAGE_KEY = 'fuel-entry-attempt-v1088';\n\nfunction loadFuelEntryAttempt() {\n  if (typeof localStorage === 'undefined') return null;\n  try {\n    const parsed = JSON.parse(localStorage.getItem(FUEL_ENTRY_ATTEMPT_STORAGE_KEY) || 'null');\n    return parsed?.entryId && parsed?.fingerprint ? parsed : null;\n  } catch {\n    return null;\n  }\n}\n\nfunction persistFuelEntryAttempt(attempt) {\n  if (typeof localStorage === 'undefined') return;\n  try {\n    if (attempt) localStorage.setItem(FUEL_ENTRY_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));\n    else localStorage.removeItem(FUEL_ENTRY_ATTEMPT_STORAGE_KEY);\n  } catch {\n    // Retry w tej samej sesji nadal korzysta ze stanu React.\n  }\n}\n\nfunction getFuelEntryAttemptFingerprint({ vehicleId, liters, odometerKm, odometerMode }) {\n  return JSON.stringify({\n    vehicleId: String(vehicleId || ''),\n    liters: String(liters || '').trim().replace(',', '.'),\n    odometerKm: String(odometerKm || '').replace(/\\s/g, ''),\n    odometerMode: String(odometerMode || 'manual'),\n  });\n}\n`,
    'fuel panel storage helpers');
  source = replaceOnce(source,
    `  const [error, setError] = useState('');\n`,
    `  const [error, setError] = useState('');\n  const [fuelEntryAttempt, setFuelEntryAttempt] = useState(() => loadFuelEntryAttempt());\n\n  const rememberFuelEntryAttempt = useCallback((attempt) => {\n    setFuelEntryAttempt(attempt || null);\n    persistFuelEntryAttempt(attempt || null);\n  }, []);\n\n  const clearFuelEntryAttempt = useCallback(() => {\n    setFuelEntryAttempt(null);\n    persistFuelEntryAttempt(null);\n  }, []);\n`,
    'fuel panel attempt state');
  source = replaceOnce(source,
    `    || readingOdometer\n    || entrySaveInProgress\n  );`,
    `    || readingOdometer\n    || entrySaveInProgress\n    || fuelEntryAttempt\n  );`,
    'fuel unsaved attempt');
  source = replaceOnce(source,
    `  useEffect(() => { void refresh(); }, [refresh]);\n`,
    `  useEffect(() => { void refresh(); }, [refresh]);\n  useEffect(() => {\n    if (!fuelEntryAttempt) return;\n    setVehicleId((current) => current || String(fuelEntryAttempt.vehicleId || ''));\n    setLiters((current) => current || String(fuelEntryAttempt.liters || ''));\n    setOdometerKm((current) => current || String(fuelEntryAttempt.odometerKm || ''));\n    setOdometerMode((current) => current === 'manual' ? String(fuelEntryAttempt.odometerMode || current) : current);\n  }, []);\n`,
    'fuel attempt restore');
  source = replaceOnce(source,
    `  function selectOdometerMode(nextMode) {\n    if (nextMode === odometerMode) return;\n    resetOdometerPhoto();`,
    `  function selectOdometerMode(nextMode) {\n    if (nextMode === odometerMode) return;\n    clearFuelEntryAttempt();\n    resetOdometerPhoto();`,
    'fuel mode clears old attempt');
  source = replaceOnce(source,
    `    setReadingOdometer(true);\n    setError('');`,
    `    clearFuelEntryAttempt();\n    setReadingOdometer(true);\n    setError('');`,
    'new fuel photo clears attempt');
  source = replaceOnce(source,
    `      if (odometerMode === 'photo' && !odometerPhotoBlob) throw new Error('Zrób zdjęcie licznika i potwierdź odczyt przed zapisem.');`,
    `      if (odometerMode === 'photo' && !odometerPhotoBlob && !fuelEntryAttempt?.photoPath) throw new Error('Zrób zdjęcie licznika i potwierdź odczyt przed zapisem.');`,
    'fuel photo reload validation');
  const oldSave = `      const saved = await addFuelEntry({\n        supabase,\n        isAdmin,\n        vehicleId,\n        liters,\n        tankCapacityLiters: selectedFuelVehicle?.tank_capacity_liters ?? null,\n        odometerKm,\n        odometerPhotoBlob: odometerMode === 'photo' ? odometerPhotoBlob : null,\n        odometerAiConfidence: odometerMode === 'photo' && !manualCorrection ? odometerConfidence : null,\n        odometerReadSource: odometerMode === 'photo' && !manualCorrection ? odometerSource : 'manual',\n      });\n      setEntries((current) => [saved, ...current]);`;
  const newSave = `      const fingerprint = getFuelEntryAttemptFingerprint({ vehicleId, liters, odometerKm, odometerMode });\n      let activeAttempt = fuelEntryAttempt?.fingerprint === fingerprint\n        ? fuelEntryAttempt\n        : {\n          entryId: createFuelEntryAttemptId(),\n          fingerprint,\n          vehicleId,\n          liters,\n          odometerKm,\n          odometerMode,\n          photoPath: '',\n          createdAt: new Date().toISOString(),\n        };\n      rememberFuelEntryAttempt(activeAttempt);\n      const saved = await addFuelEntry({\n        supabase,\n        isAdmin,\n        vehicleId,\n        liters,\n        tankCapacityLiters: selectedFuelVehicle?.tank_capacity_liters ?? null,\n        odometerKm,\n        odometerPhotoBlob: odometerMode === 'photo' ? odometerPhotoBlob : null,\n        odometerAiConfidence: odometerMode === 'photo' && !manualCorrection ? odometerConfidence : null,\n        odometerReadSource: odometerMode === 'photo' && !manualCorrection ? odometerSource : 'manual',\n        entryId: activeAttempt.entryId,\n        existingPhotoPath: activeAttempt.photoPath || '',\n        onAttemptProgress: (patch) => {\n          activeAttempt = { ...activeAttempt, ...patch };\n          rememberFuelEntryAttempt(activeAttempt);\n        },\n      });\n      clearFuelEntryAttempt();\n      setEntries((current) => [saved, ...current.filter((entry) => entry.id !== saved?.id)]);`;
  source = replaceOnce(source, oldSave, newSave, 'fuel panel stable attempt save');
  write(file, source);
}

// N5 — provider retry uses the same request key and keeps unknown results resumable.
{
  const file = 'supabase/functions/send-job-protocol-email/index.ts';
  let source = read(file);
  source = replaceOnce(source,
    `const RATE_LIMIT_SECONDS = 30;\n`,
    `const RATE_LIMIT_SECONDS = 30;\nconst PROVIDER_TIMEOUT_MS = 12_000;\n`,
    'email provider timeout constant');

  const startText = `    const rateLimitAfter = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000).toISOString();`;
  const start = source.indexOf(startText);
  const endText = `    } catch (error) {\n      const errorMessage = truncate(error instanceof Error ? error.message : String(error), 1200);\n      await adminClient.from("job_protocol_email_log").update({\n        status: "failed",\n        error_message: errorMessage,\n      }).eq("id", emailLog.id);\n      return json({ error: errorMessage }, 502);\n    }\n`;
  const endStart = source.indexOf(endText, start);
  if (start < 0 || endStart < 0) throw new Error('Email Edge processing block boundaries not found');
  const end = endStart + endText.length;
  const replacement = `    const { data: existingLog, error: existingLogError } = await adminClient\n      .from("job_protocol_email_log")\n      .select("id, request_key, job_id, protocol_id, recipient_email, sender_email, status, sent_by, provider_message_id, sent_at, error_message, created_at")\n      .eq("request_key", requestKey)\n      .maybeSingle();\n\n    if (existingLogError) {\n      return json({ error: \`Nie udało się sprawdzić poprzedniej próby wysyłki. \${existingLogError.message}\` }, 500);\n    }\n    if (existingLog) {\n      const sameAttempt = String(existingLog.job_id) === jobId\n        && String(existingLog.protocol_id) === protocolId\n        && normalizeEmail(existingLog.recipient_email) === jobRecipient\n        && String(existingLog.sent_by || '') === String(authData.user.id);\n      if (!sameAttempt) {\n        return json({ error: "Klucz próby jest już przypisany do innej wysyłki.", definitive: true, requestKey }, 409);\n      }\n      if (existingLog.status === "sent") {\n        return json({\n          ok: true,\n          reconciled: true,\n          requestKey,\n          recipientEmail: jobRecipient,\n          senderEmail: FROM_EMAIL,\n          sentAt: existingLog.sent_at,\n          providerMessageId: existingLog.provider_message_id,\n        });\n      }\n      if (existingLog.status === "failed") {\n        return json({\n          error: existingLog.error_message || "Poprzednia próba została jednoznacznie odrzucona.",\n          definitive: true,\n          requestKey,\n        }, 409);\n      }\n    }\n\n    if (!existingLog) {\n      const rateLimitAfter = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000).toISOString();\n      const { data: recentSend } = await adminClient\n        .from("job_protocol_email_log")\n        .select("id, status, recipient_email, created_at")\n        .eq("job_id", jobId)\n        .eq("sent_by", authData.user.id)\n        .gte("created_at", rateLimitAfter)\n        .in("status", ["sending", "sent"])\n        .order("created_at", { ascending: false })\n        .limit(1)\n        .maybeSingle();\n\n      if (recentSend) {\n        return json({ error: "Protokół został właśnie wysłany. Odczekaj chwilę przed nową, świadomą wysyłką.", definitive: true }, 429);\n      }\n    }\n\n    let emailLog = existingLog;\n    if (!emailLog) {\n      const nowIso = new Date().toISOString();\n      const logRow = {\n        request_key: requestKey,\n        job_id: jobId,\n        protocol_id: protocolId,\n        recipient_email: jobRecipient,\n        sender_email: FROM_EMAIL,\n        provider: "resend",\n        status: "sending",\n        sent_by: authData.user.id,\n        created_at: nowIso,\n      };\n      const { data: insertedLog, error: logError } = await adminClient\n        .from("job_protocol_email_log")\n        .insert(logRow)\n        .select("id, request_key, job_id, protocol_id, recipient_email, status, sent_by")\n        .single();\n\n      if (logError || !insertedLog) {\n        if (String(logError?.code || "") === "23505") {\n          return json({ error: "Ta sama próba została rozpoczęta równolegle. Ponów z tym samym kluczem.", pending: true, requestKey }, 409);\n        }\n        return json({ error: \`Nie udało się rozpocząć wysyłki protokołu. \${logError?.message || ""}\`.trim() }, 500);\n      }\n      emailLog = insertedLog;\n    }\n\n    try {\n      const { data: pdfBlob, error: downloadError } = await adminClient.storage\n        .from("job-protocols")\n        .download((protocol as ProtocolRow).storage_path);\n      if (downloadError || !pdfBlob) throw new Error("Nie udało się pobrać zapisanego protokołu PDF.");\n\n      const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());\n      if (!pdfBytes.length || pdfBytes.length > MAX_PROTOCOL_SIZE) throw new Error("Plik protokołu ma nieprawidłowy rozmiar.");\n\n      const clientName = normalizeText(job.client || job.title) || "Klient";\n      const address = [normalizeText(job.city), normalizeText(job.street)].filter(Boolean).join(", ");\n      const subject = \`Protokół montażu klimatyzacji – \${clientName}\`;\n      const providerController = new AbortController();\n      const providerTimeout = setTimeout(() => providerController.abort(), PROVIDER_TIMEOUT_MS);\n      let resendResponse: Response;\n      try {\n        resendResponse = await fetch(RESEND_ENDPOINT, {\n          method: "POST",\n          headers: {\n            Authorization: \`Bearer \${resendApiKey}\`,\n            "Content-Type": "application/json",\n            "Idempotency-Key": \`wawis-protocol-\${requestKey}\`,\n          },\n          signal: providerController.signal,\n          body: JSON.stringify({\n            from: FROM_HEADER,\n            reply_to: FROM_EMAIL,\n            to: [jobRecipient],\n            subject,\n            html: buildHtml({ clientName, address, installationDate: job.installation_date }),\n            text: buildText({ clientName, address, installationDate: job.installation_date }),\n            attachments: [{\n              filename: safePdfFileName((protocol as ProtocolRow).file_name),\n              content: bytesToBase64(pdfBytes),\n            }],\n            tags: [\n              { name: "source", value: "wawis_protocol" },\n              { name: "job_id", value: jobId },\n              { name: "protocol_id", value: protocolId },\n            ],\n          }),\n        });\n      } catch (providerError) {\n        const providerUnknown = truncate(\`provider_result_unknown: \${providerError instanceof Error ? providerError.message : String(providerError)}\`, 1200);\n        await adminClient.from("job_protocol_email_log").update({\n          status: "sending",\n          error_message: providerUnknown,\n        }).eq("id", emailLog.id);\n        return json({\n          error: "Serwer pocztowy nie potwierdził wyniku. Ponów wysyłkę — zostanie użyty ten sam klucz próby.",\n          pending: true,\n          providerResultUnknown: true,\n          requestKey,\n        }, 504);\n      } finally {\n        clearTimeout(providerTimeout);\n      }\n\n      const providerBody = await safeResponseJson(resendResponse);\n      if (!resendResponse.ok) {\n        const rejection = truncate(normalizeText((providerBody as Record<string, unknown>)?.message) || \`Serwer pocztowy odrzucił wysyłkę (\${resendResponse.status}).\`, 1200);\n        await adminClient.from("job_protocol_email_log").update({\n          status: "failed",\n          provider_response: safeJson(providerBody),\n          error_message: rejection,\n        }).eq("id", emailLog.id);\n        return json({ error: rejection, definitive: true, requestKey }, 502);\n      }\n\n      const providerMessageId = normalizeText((providerBody as Record<string, unknown>)?.id) || null;\n      const sentAt = new Date().toISOString();\n      const { error: sentLogError } = await adminClient.from("job_protocol_email_log").update({\n        status: "sent",\n        provider_message_id: providerMessageId,\n        provider_response: safeJson(providerBody),\n        error_message: null,\n        sent_at: sentAt,\n      }).eq("id", emailLog.id);\n\n      if (sentLogError) {\n        return json({\n          error: "Wiadomość została przyjęta przez dostawcę, ale zapis potwierdzenia nie powiódł się. Ponów — użyjemy tego samego klucza.",\n          pending: true,\n          providerResultUnknown: true,\n          requestKey,\n          providerMessageId,\n        }, 503);\n      }\n\n      return json({\n        ok: true,\n        requestKey,\n        recipientEmail: jobRecipient,\n        senderEmail: FROM_EMAIL,\n        sentAt,\n        providerMessageId,\n      });\n    } catch (error) {\n      const errorMessage = truncate(error instanceof Error ? error.message : String(error), 1200);\n      await adminClient.from("job_protocol_email_log").update({\n        status: "failed",\n        error_message: errorMessage,\n      }).eq("id", emailLog.id);\n      return json({ error: errorMessage, definitive: true, requestKey }, 502);\n    }\n`;
  source = source.slice(0, start) + replacement + source.slice(end);
  write(file, source);
}

// N8 — ensure the 10.88 counterexamples run with every relevant group.
{
  const file = 'scripts/test-groups.cjs';
  let source = read(file);
  source = replaceOnce(source,
    `    'node scripts/smoke-storage-delayed-commit-v1077.mjs',\n    'npm run test:smoke:mobile-protocol-print',`,
    `    'node scripts/smoke-storage-delayed-commit-v1077.mjs',\n    'node scripts/smoke-audit-fixes-v1088.mjs',\n    'npm run test:smoke:mobile-protocol-print',`,
    'v1088 protocol group');
  source = replaceOnce(source,
    `  fuel: [\n    'npm run test:smoke:fuel-module',\n    'node scripts/smoke-storage-write-reconciliation-v1074.mjs',\n    'node scripts/smoke-storage-delayed-commit-v1077.mjs',\n  ],`,
    `  fuel: [\n    'npm run test:smoke:fuel-module',\n    'node scripts/smoke-storage-write-reconciliation-v1074.mjs',\n    'node scripts/smoke-storage-delayed-commit-v1077.mjs',\n    'node scripts/smoke-audit-fixes-v1088.mjs',\n  ],`,
    'v1088 fuel group');
  source = replaceOnce(source,
    `    'node scripts/smoke-nameplate-ai-auth-v1085.mjs',\n  ],`,
    `    'node scripts/smoke-nameplate-ai-auth-v1085.mjs',\n    'node scripts/smoke-audit-fixes-v1088.mjs',\n  ],`,
    'v1088 nameplate group');
  source = replaceOnce(source,
    `    'node scripts/smoke-audit-fixes-v1087.mjs',\n    'npm run test:smoke:e2e-mobile',`,
    `    'node scripts/smoke-audit-fixes-v1087.mjs',\n    'node scripts/smoke-audit-fixes-v1088.mjs',\n    'npm run test:smoke:e2e-mobile',`,
    'v1088 infra group');
  write(file, source);
}

console.log('Applied WAWIS 10.88 N3/N4/N5 and regression wiring.');
