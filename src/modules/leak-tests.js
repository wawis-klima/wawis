// WAWIS 14.28 — dane prób szczelności zakończonych montaży (zakładka administratora „Próby szczelności”).
// Administrator przepisuje z podpisanych protokołów papierowych: data badania, temperatura, wynik.

export const LEAK_TEST_RESULTS = [['pozytywny', 'Pozytywny'], ['negatywny', 'Negatywny']];

function rpcError(error) {
  const message = String(error?.message || '');
  if (/leak_test|PGRST202|schema cache|does not exist|Could not find/i.test(message)) {
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

export async function saveLeakTest({ supabase, jobId, testDate, temperature, result }) {
  const checked = validateLeakTestDraft({ testDate, temperature, result });
  if (!checked.ok) throw new Error(checked.error);
  const { data, error } = await supabase.rpc('leak_test_save_v1428', {
    p_job_id: jobId, p_test_date: checked.value.testDate, p_temperature_c: checked.value.temperature, p_result: checked.value.result,
  });
  if (error) throw rpcError(error);
  if (data !== true) throw new Error('Montaż nie jest zakończony — odśwież listę.');
  return checked.value;
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
