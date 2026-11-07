import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './leak-tests.css';
import {
  LEAK_TEST_RESULTS, countFilledLeakTests, defaultLeakTestDate, loadLeakInstallers, loadLeakTests, saveLeakTest, validateLeakTestDraft,
} from '../../modules/leak-tests.js';
import { openLeakTestProtocolPdf } from '../../mobile791/modules/leak-test-protocol-pdf.js';
import { dailyMeanTemperature } from '../../modules/weather-daily-mean.js';

// WAWIS 14.28 — zakładka „Próby szczelności” (komputer, administrator). Zakończone montaże z instalatorem;
// administrator przepisuje z podpisanego protokołu papierowego datę badania, temperaturę i wynik, potem PDF.
// 14.29: podpis składa sam instalator w swojej aplikacji; tutaj widać, co jest podpisane.
// 14.33: temperatura — podpowiedź: średnia dnia badania dla miejscowości montażu (Open-Meteo); zatwierdza „Zapisz”.
// 14.33: podpis wstawia baza ze wzoru instalatora (Diagnostyka → „Wzór podpisu”), z datą badania.
// 14.32: także starsze montaże bez instalatora w aplikacji — administrator wybiera instalatora (montaż bez zmian),
// protokół trafia do podpisu w aplikacji tego instalatora.

/** Montaż bez instalatora zapisanego w aplikacji (wymaga wyboru). Baza przed 14.32 nie zwraca tego pola. */
function needsInstaller(row) {
  return row?.installer_from_app === false;
}

function formatDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function draftFromRow(row) {
  return {
    testDate: row.test_date || defaultLeakTestDate(row.completed_at || row.installation_date),
    temperature: row.temperature_c != null && row.test_date ? String(Number(row.temperature_c)).replace('.', ',') : '',
    result: row.result || 'pozytywny',
    installerId: needsInstaller(row) ? String(row.installer_id || '') : '',
  };
}

function rowToJob(row) {
  return {
    id: row.job_id, client: row.client, city: row.city, street: row.street,
    device_model: row.device_model, completed_at: row.completed_at, installation_date: row.installation_date,
    completed_by: row.installer_id || row.completed_by, status: 'Zakończone',
  };
}

export default function LeakTestsPanel({ supabase }) {
  const [rows, setRows] = useState([]);
  const [installers, setInstallers] = useState([]);
  // 14.33: podpowiedzi temperatury: jobId → { status: 'loading' | 'auto' | 'none' | 'error', date, city }.
  const [tempHints, setTempHints] = useState({});
  const tempRequested = useRef(new Set());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowState, setRowState] = useState({});
  const [filter, setFilter] = useState('todo');
  // Zapisany wiersz zostaje w „Do uzupełnienia” z „Zapisano” aż do zmiany filtra lub odświeżenia.
  const [recentlySaved, setRecentlySaved] = useState(() => new Set());

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    setRecentlySaved(new Set());
    try {
      const [list, people] = await Promise.all([
        loadLeakTests({ supabase }),
        loadLeakInstallers({ supabase }).catch(() => []),
      ]);
      setRows(list);
      setInstallers(Array.isArray(people) ? people : []);
      setDrafts(Object.fromEntries(list.map((row) => [row.job_id, draftFromRow(row)])));
    } catch (loadError) {
      setError(loadError?.message || 'Nie udało się wczytać listy.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void reload(); }, [reload]);

  const filled = countFilledLeakTests(rows);
  const visible = useMemo(
    () => rows.filter((row) => (filter === 'todo' ? (!row.test_date || recentlySaved.has(row.job_id)) : filter === 'done' ? Boolean(row.test_date) : true)),
    [rows, filter, recentlySaved],
  );

  function setDraft(jobId, patch) {
    // Powrót do wcześniejszej daty — podpowiedź pobierana ponownie (z pamięci modułu pogody).
    if (patch.testDate) tempRequested.current.delete(`${jobId}|${patch.testDate}`);
    setDrafts((prev) => {
      const current = prev[jobId] || {};
      const next = { ...current, ...patch };
      // Ręczna temperatura zostaje; zmiana daty przy podpowiedzi — nowa podpowiedź dla nowej daty.
      if ('temperature' in patch) next.tempAuto = false;
      if ('testDate' in patch && patch.testDate !== current.testDate && (current.tempAuto || !String(current.temperature || '').trim())) {
        next.temperature = ''; next.tempAuto = false;
      }
      return { ...prev, [jobId]: next };
    });
    setRowState((prev) => ({ ...prev, [jobId]: { ...prev[jobId], error: '', saved: false } }));
  }

  // 14.33: dla widocznych, nieuzupełnionych wierszy bez temperatury — średnia dnia badania (po kolei, z pamięcią).
  useEffect(() => {
    const queue = visible.filter((row) => {
      const draft = drafts[row.job_id];
      return draft && !row.test_date && !String(draft.temperature || '').trim() && row.city && draft.testDate
        && !tempRequested.current.has(`${row.job_id}|${draft.testDate}`);
    }).slice(0, 40);
    if (!queue.length) return;
    // Bez przerywania przy kolejnych zmianach formularza (wpisana podpowiedź zmienia drafts) — tylko po zamknięciu zakładki.
    queue.forEach((row) => tempRequested.current.add(`${row.job_id}|${drafts[row.job_id].testDate}`));
    (async () => {
      const workers = Array.from({ length: 3 }, async (_, w) => {
        for (let i = w; i < queue.length; i += 3) {
          const row = queue[i];
          const date = drafts[row.job_id].testDate;
          setTempHints((prev) => ({ ...prev, [row.job_id]: { status: 'loading', date, city: row.city } }));
          let mean = null; let failed = false;
          try { mean = await dailyMeanTemperature({ city: row.city, date }); } catch { failed = true; }
          if (!mounted.current) return;
          setTempHints((prev) => ({ ...prev, [row.job_id]: { status: failed ? 'error' : mean == null ? 'none' : 'auto', date, city: row.city } }));
          if (mean != null) {
            setDrafts((prev) => {
              const current = prev[row.job_id];
              if (!current || current.testDate !== date || String(current.temperature || '').trim()) return prev;
              return { ...prev, [row.job_id]: { ...current, temperature: String(mean).replace('.', ','), tempAuto: true } };
            });
          }
        }
      });
      await Promise.all(workers);
    })();
  }, [visible, drafts]);

  async function handleSave(row) {
    const draft = drafts[row.job_id] || draftFromRow(row);
    const checked = validateLeakTestDraft(draft);
    if (!checked.ok) {
      setRowState((prev) => ({ ...prev, [row.job_id]: { error: checked.error } }));
      return;
    }
    setRowState((prev) => ({ ...prev, [row.job_id]: { busy: true } }));
    try {
      const saved = await saveLeakTest({ supabase, jobId: row.job_id, ...draft, needsInstaller: needsInstaller(row) });
      // 14.29: zmiana danych po podpisie usuwa podpis (tak samo robi baza) — instalator podpisze ponownie.
      // 14.32: zmiana przypisanego instalatora też.
      setRows((prev) => prev.map((item) => {
        if (item.job_id !== row.job_id) return item;
        const installerId = needsInstaller(item) ? saved.installerId : item.installer_id;
        const changed = item.test_date !== saved.testDate || Number(item.temperature_c) !== saved.temperature || item.result !== saved.result
          || String(item.installer_id || '') !== String(installerId || '');
        const installerName = needsInstaller(item)
          ? installers.find((person) => String(person.id) === String(installerId))?.full_name || null
          : item.installer_name;
        return { ...item, test_date: saved.testDate, temperature_c: saved.temperature, result: saved.result,
          installer_id: installerId, installer_name: installerName, signed_at: changed ? null : item.signed_at };
      }));
      setRecentlySaved((prev) => new Set(prev).add(row.job_id));
      setRowState((prev) => ({ ...prev, [row.job_id]: { saved: true } }));
      // 14.33: baza od razu podpisuje wzorem instalatora — pobieramy aktualny stan podpisu tego wiersza.
      loadLeakTests({ supabase }).then((list) => {
        const fresh = list.find((item) => item.job_id === row.job_id);
        if (fresh) setRows((prev) => prev.map((item) => (item.job_id === row.job_id ? { ...item, signed_at: fresh.signed_at, installer_name: fresh.installer_name } : item)));
      }).catch(() => {});
    } catch (saveError) {
      setRowState((prev) => ({ ...prev, [row.job_id]: { error: saveError?.message || 'Nie udało się zapisać.' } }));
    }
  }

  function handlePdf(row) {
    // Dane próby i podpis instalatora odczytywane z bazy przy otwarciu PDF.
    openLeakTestProtocolPdf({
      job: rowToJob(row),
      profiles: (row.installer_id || row.completed_by)
        ? [{ id: row.installer_id || row.completed_by, full_name: row.installer_name || row.completed_by_name }] : [],
      supabase,
    }).catch((pdfError) => setRowState((prev) => ({ ...prev, [row.job_id]: { error: pdfError?.message || 'Nie udało się przygotować PDF.' } })));
  }

  return (
    <section className="card leakTestsPanel" data-testid="leak-tests-panel">
      <div className="leakTestsHead">
        <div>
          <h2>Próby szczelności</h2>
          <p className="leakTestsLead">
            Zakończone montaże. Przepisz z podpisanego protokołu datę badania, temperaturę i wynik — PDF wypełni się tymi danymi.
            Przy starszych montażach bez instalatora w aplikacji wybierz instalatora — protokół trafi do podpisu w jego aplikacji.
          </p>
        </div>
        <div className="leakTestsTools">
          <span className="leakTestsCount" data-testid="leak-tests-count">Uzupełniono {filled} z {rows.length}</span>
          <span className="leakTestsCount signed" data-testid="leak-tests-signed">Podpisane: {rows.filter((row) => row.signed_at).length}</span>
          <button type="button" className="btn" onClick={() => void reload()} disabled={loading}>Odśwież</button>
        </div>
      </div>
      <div className="leakTestsFilter" role="tablist" aria-label="Filtr">
        {[['todo', 'Do uzupełnienia'], ['done', 'Uzupełnione'], ['all', 'Wszystkie']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key}
            className={`leakTestsFilterTab${filter === key ? ' active' : ''}`} onClick={() => { setFilter(key); setRecentlySaved(new Set()); }}>{label}</button>
        ))}
      </div>
      {error ? <p className="leakTestsError" role="alert">{error}</p> : null}
      {loading ? <p className="leakTestsEmpty">Wczytuję…</p> : null}
      {!loading && !error && !visible.length ? (
        <p className="leakTestsEmpty">{filter === 'todo' ? 'Wszystkie montaże uzupełnione.' : 'Brak montaży.'}</p>
      ) : null}
      <div className="leakTestsList">
        {visible.map((row) => {
          const draft = drafts[row.job_id] || draftFromRow(row);
          const state = rowState[row.job_id] || {};
          return (
            <div key={row.job_id} className={`leakTestRow${row.test_date ? ' done' : ''}${needsInstaller(row) ? ' withInstaller' : ''}`} data-testid="leak-test-row">
              <div className="leakTestInfo">
                <strong>{row.client || 'Klient'}</strong>
                <span>{[row.city, row.street].filter(Boolean).join(', ') || '—'}</span>
                <span className="leakTestMeta">{row.device_model ? String(row.device_model).split('\n')[0] : 'Urządzenie —'}</span>
                {needsInstaller(row) ? (
                  <span className="leakTestMeta">Montaż {formatDate(row.installation_date)} · bez instalatora w aplikacji{row.installer_name ? ` · przypisany: ${row.installer_name}` : ''}</span>
                ) : (
                  <span className="leakTestMeta">Zakończony {formatDate(row.completed_at)} · {row.completed_by_name || '—'}</span>
                )}
                {row.test_date ? (
                  <span className={`leakTestSign${row.signed_at ? ' signed' : ''}`} data-testid="leak-test-sign-status">
                    {row.signed_at ? `Podpisany wzorem instalatora ${formatDate(row.signed_at)}` : 'Czeka na wzór podpisu instalatora (Diagnostyka → Wzór podpisu)'}
                  </span>
                ) : null}
              </div>
              {needsInstaller(row) ? (
                <label className="leakTestField">
                  <span>Instalator</span>
                  <select className="input" data-testid="leak-test-installer" value={draft.installerId || ''}
                    onChange={(e) => setDraft(row.job_id, { installerId: e.target.value })}>
                    <option value="">Wybierz…</option>
                    {installers.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="leakTestField">
                <span>Data badania</span>
                <input type="date" className="input" value={draft.testDate} onChange={(e) => setDraft(row.job_id, { testDate: e.target.value })} />
              </label>
              <label className="leakTestField small">
                <span>Temperatura °C</span>
                <input type="text" inputMode="decimal" className="input" placeholder="np. 18" value={draft.temperature}
                  onChange={(e) => setDraft(row.job_id, { temperature: e.target.value })} />
                {!row.test_date && tempHints[row.job_id] && tempHints[row.job_id].date === draft.testDate ? (
                  <small className={`leakTestTempHint ${tempHints[row.job_id].status}`} data-testid="leak-test-temp-hint">
                    {tempHints[row.job_id].status === 'loading' ? 'Pobieram średnią dnia…'
                      : tempHints[row.job_id].status === 'auto' && draft.tempAuto ? `Średnia dnia · ${tempHints[row.job_id].city}`
                        : tempHints[row.job_id].status === 'none' ? 'Brak danych pogodowych — wpisz ręcznie'
                          : tempHints[row.job_id].status === 'error' ? 'Nie udało się pobrać — wpisz ręcznie' : ''}
                  </small>
                ) : null}
              </label>
              <label className="leakTestField small">
                <span>Wynik</span>
                <select className="input" value={draft.result} onChange={(e) => setDraft(row.job_id, { result: e.target.value })}>
                  {LEAK_TEST_RESULTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <div className="leakTestActions">
                <button type="button" className="btn primary" disabled={state.busy} onClick={() => void handleSave(row)}>
                  {state.busy ? 'Zapisuję…' : 'Zapisz'}
                </button>
                <button type="button" className="btn" onClick={() => handlePdf(row)}>PDF</button>
              </div>
              {state.error ? <p className="leakTestRowError" role="alert">{state.error}</p> : null}
              {state.saved ? <p className="leakTestRowSaved" role="status">Zapisano</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
