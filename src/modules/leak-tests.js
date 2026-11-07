// WAWIS 14.28 — dane prób szczelności zakończonych montaży (zakładka administratora „Próby szczelności”).
// Administrator przepisuje z podpisanych protokołów papierowych: data badania, temperatura, wynik.

export const LEAK_TEST_RESULTS = [['pozytywny', 'Pozytywny'], ['negatywny', 'Negatywny']];

function missingFunction(error, name) {
  const message = String(error?.message || '');
  return /PGRST202|schema cache|does not exist|Could not find/i.test(message) && message.includes(name);
}

function rpcError(error) {
  const message = String(error?.message || '');
  if (/leak_installer_required/.test(message)) return new Error('Wybierz instalatora — tylko on podpisze ten protokół.');
  if (/leak_installer_invalid/.test(message)) return new Error('Wybrana osoba nie jest instalatorem. Odśwież listę.');
  if (/leak_test|PGRST202|schema cache|does not exist|Could not find/i.test(message) && !/staff_only|admin_only|42501/i.test(message)) {
    return new Error('Próby szczelności nie są jeszcze włączone w bazie (brak migracji 14.28).');
  }
  if (/admin_only|42501/i.test(message)) return new Error('Próby szczelności widzi tylko administrator.');
  return new Error(message || 'Nie udało się wczytać prób szczelności.');
}

export async function loadLeakTests({ supabase }) {
  const { data, error } = await supabase.rpc('leak_tests_list_v1428');
  if (error) throw rpcError(error);
  return Array.isArray(data) ? data : [];
}

export async function loadLeakTest({ supabase, jobId }) {
  if (!supabase || !jobId) return null;
  const { data, error } = await supabase.rpc('leak_test_get_v1428', { p_job_id: jobId });
  if (error) throw rpcError(error);
  const row = Array.isArray(data) ? data[0] : data;
  return row && row.test_date ? row : null;
}

/** Walidacja wpisu: data RRRR-MM-DD, temperatura -30…50 (przecinek lub kropka), wynik z listy. */
export function validateLeakTestDraft({ testDate, temperature, result } = {}) {
  const date = String(testDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Wpisz datę badania.' };
  const tempText = String(temperature ?? '').trim().replace(',', '.');
  const temp = Number(tempText);
  if (!tempText || !Number.isFinite(temp) || temp < -30 || temp > 50) return { ok: false, error: 'Temperatura od -30 do 50 °C.' };
  if (!LEAK_TEST_RESULTS.some(([value]) => value === result)) return { ok: false, error: 'Wybierz wynik.' };
  return { ok: true, value: { testDate: date, temperature: Math.round(temp * 10) / 10, result } };
}

// 14.32: instalator przypisany przez administratora do montaży bez instalatora z aplikacji (montaż bez zmian).
export async function loadLeakInstallers({ supabase }) {
  const { data, error } = await supabase.rpc('leak_test_installers_v1432');
  if (error) {
    if (missingFunction(error, 'leak_test_installers_v1432')) return null; // baza przed 14.32 — bez wyboru instalatora
    throw rpcError(error);
  }
  return Array.isArray(data) ? data : [];
}

export async function saveLeakTest({ supabase, jobId, testDate, temperature, result, installerId = null, needsInstaller = false }) {
  const checked = validateLeakTestDraft({ testDate, temperature, result });
  if (!checked.ok) throw new Error(checked.error);
  if (needsInstaller && !installerId) throw new Error('Wybierz instalatora — tylko on podpisze ten protokół.');
  const base = { p_job_id: jobId, p_test_date: checked.value.testDate, p_temperature_c: checked.value.temperature, p_result: checked.value.result };
  let { data, error } = await supabase.rpc('leak_test_save_v1432', { ...base, p_installer_id: installerId || null });
  // Baza przed 14.32: zapis jak w 14.28 (montaże z instalatorem z aplikacji).
  if (error && missingFunction(error, 'leak_test_save_v1432') && !needsInstaller) {
    ({ data, error } = await supabase.rpc('leak_test_save_v1428', base));
  }
  if (error) throw rpcError(error);
  if (data !== true) throw new Error('Montaż nie jest zakończony — odśwież listę.');
  return { ...checked.value, installerId: needsInstaller ? installerId : null };
}

/** Domyślna data badania w formularzu = dzień zakończenia montażu (Europe/Warsaw). */
export function defaultLeakTestDate(completedAt) {
  const date = new Date(completedAt || '');
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function countFilledLeakTests(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row?.test_date).length;
}

// 14.29: instalator podpisuje SWOJE protokoły (telefon). Wzór podpisu w bazie, nie w telefonie.
export async function loadOwnPendingLeakTests({ supabase }) {
  const { data, error } = await supabase.rpc('leak_test_pending_own_v1429');
  if (error) throw rpcError(error);
  return Array.isArray(data) ? data : [];
}

export async function signOwnLeakTests({ supabase, jobIds = [], imagePng = null }) {
  const ids = (Array.isArray(jobIds) ? jobIds : []).map(String).filter(Boolean);
  if (!ids.length) return 0;
  if (imagePng != null && !/^data:image\/png;base64,/.test(String(imagePng))) throw new Error('Podpis nie został zapisany jako obraz.');
  const { data, error } = await supabase.rpc('leak_test_sign_own_v1429', { p_job_ids: ids, p_image_png: imagePng });
  if (error) {
    if (/leak_sign_no_saved_signature/.test(String(error.message || ''))) throw new Error('Brak zapisanego podpisu — podpisz palcem.');
    throw rpcError(error);
  }
  return Number(data) || 0;
}
