import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  calculateFuelSavings,
  loadFuelSavingsData,
  setFuelDeliveryPrice,
  syncFuelReferencePrices,
} from '../../modules/fuel-savings.js';
import './FuelSavingsPanel.css';

// WAWIS 13.97 — zakładka „Oszczędności” (tylko administrator, tylko komputer).

function money(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toLocaleString('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits })} zł`;
}

function perLiter(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł/l` : '—';
}

function liters(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} l` : '—';
}

function dateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function dayLabel(dateKey) {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}` : '';
}

function monthLabel(monthKey) {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  const label = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 15)));
  return label[0].toUpperCase() + label.slice(1);
}

/** Wykres: cena netto na stacji (linia) i cena ze zbiornika (pozioma) — szary pas między nimi to oszczędność na litrze. */
function PriceGapChart({ referencePrices, tankPrice, sinceKey }) {
  const points = (referencePrices || [])
    .filter((price) => String(price.valid_from) >= String(sinceKey || ''))
    .map((price) => ({ key: String(price.valid_from), value: Number(price.diesel_net) }))
    .filter((point) => Number.isFinite(point.value));
  if (points.length < 2 || !Number.isFinite(Number(tankPrice))) return null;
  const width = 640;
  const height = 150;
  const pad = { left: 44, right: 12, top: 12, bottom: 22 };
  const values = [...points.map((point) => point.value), Number(tankPrice)];
  const min = Math.floor((Math.min(...values) - 0.1) * 10) / 10;
  const max = Math.ceil((Math.max(...values) + 0.1) * 10) / 10;
  const x = (index) => pad.left + (index * (width - pad.left - pad.right)) / (points.length - 1);
  const y = (value) => pad.top + ((max - value) * (height - pad.top - pad.bottom)) / (max - min || 1);
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(tankPrice).toFixed(1)} L${x(0).toFixed(1)},${y(tankPrice).toFixed(1)} Z`;
  const ticks = [min, (min + max) / 2, max];
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  return (
    <figure className="fuelSavingsChart" aria-label="Cena netto na stacji i ze zbiornika">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="fuelSavingsChartGrid" />
            <text x={pad.left - 6} y={y(tick) + 4} textAnchor="end" className="fuelSavingsChartAxis">{tick.toFixed(2).replace('.', ',')}</text>
          </g>
        ))}
        <path d={area} className="fuelSavingsChartGap" />
        <line x1={pad.left} x2={width - pad.right} y1={y(tankPrice)} y2={y(tankPrice)} className="fuelSavingsChartTank" />
        <path d={line} className="fuelSavingsChartStation" />
        {points.map((point, index) => (index % labelEvery === 0 || index === points.length - 1 ? (
          <text key={point.key} x={x(index)} y={height - 6} textAnchor="middle" className="fuelSavingsChartAxis">{dayLabel(point.key)}</text>
        ) : null))}
      </svg>
      <figcaption>
        <span><i className="isStation" />Cena maksymalna na stacji (netto)</span>
        <span><i className="isTank" />Twoja cena ze zbiornika (netto)</span>
        <span><i className="isGap" />Oszczędność na każdym litrze</span>
      </figcaption>
    </figure>
  );
}

export default function FuelSavingsPanel({ supabase, isAdmin, entries = [], vehicles = [], refreshToken = 0 }) {
  const [data, setData] = useState({ movements: [], referencePrices: [] });
  const [loading, setLoading] = useState(true);
  const [syncInfo, setSyncInfo] = useState(null);
  const [error, setError] = useState('');
  const [priceDrafts, setPriceDrafts] = useState({});
  const [savingPriceId, setSavingPriceId] = useState('');

  const reload = useCallback(async ({ sync = false } = {}) => {
    if (!isAdmin || !supabase) return;
    setLoading(true);
    setError('');
    try {
      if (sync) setSyncInfo(await syncFuelReferencePrices({ supabase, isAdmin }));
      setData(await loadFuelSavingsData({ supabase, isAdmin }));
    } catch (loadError) {
      setError(loadError?.message || 'Nie udało się wczytać oszczędności.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, supabase]);

  // Ceny z Monitora Polskiego dociągamy raz przy otwarciu (i przyciskiem); zmiany w zbiorniku tylko przeliczają.
  const syncedRef = useRef(false);
  useEffect(() => {
    const sync = !syncedRef.current;
    syncedRef.current = true;
    void reload({ sync });
  }, [reload, refreshToken]);

  const savings = useMemo(() => calculateFuelSavings({ ...data, entries, vehicles }), [data, entries, vehicles]);
  const currentBatch = savings.batches.find((batch) => batch.remaining > 0.01 && batch.netPrice != null)
    || savings.batches.filter((batch) => batch.netPrice != null).slice(-1)[0]
    || null;
  const firstBatch = savings.batches[0] || null;
  const sinceKey = firstBatch ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date(firstBatch.happenedAt)) : '';

  async function savePrice(movementId) {
    const draft = priceDrafts[movementId] || {};
    setSavingPriceId(movementId);
    setError('');
    try {
      await setFuelDeliveryPrice({ supabase, isAdmin, movementId, grossPerLiter: draft.gross, vatRate: draft.vat || 8 });
      setPriceDrafts((current) => ({ ...current, [movementId]: undefined }));
      await reload();
    } catch (saveError) {
      setError(saveError?.message || 'Nie udało się zapisać ceny.');
    } finally {
      setSavingPriceId('');
    }
  }

  if (!isAdmin) return null;

  return (
    <section className="fuelCard fuelSavings" aria-labelledby="fuel-savings-title" data-testid="fuel-savings-panel">
      <div className="fuelCardHeading">
        <div><span className="fuelStep fuelSavingsStep">zł</span><h3 id="fuel-savings-title">Oszczędności na własnym zbiorniku</h3></div>
        <button type="button" className="fuelEditButton" onClick={() => void reload({ sync: true })} disabled={loading}>{loading ? 'Liczę…' : 'Odśwież ceny'}</button>
      </div>

      {error ? <div className="fuelAlert fuelAlertError" role="alert">{error}</div> : null}
      {syncInfo && syncInfo.ok === false ? (
        <div className="fuelAlert fuelSavingsWarning" role="status">Nie udało się teraz pobrać nowych cen z Monitora Polskiego — liczę na cenach już zapisanych. ({syncInfo.error})</div>
      ) : null}

      <div className="fuelSavingsTiles">
        <div className="isMain" data-testid="fuel-savings-total">
          <span>Zaoszczędzone łącznie</span>
          <strong>{money(savings.totalSavingsNet)}</strong>
          <small>netto · {liters(savings.countedLiters)} ze zbiornika</small>
        </div>
        <div>
          <span>W tym miesiącu</span>
          <strong>{money(savings.monthSavingsNet)}</strong>
          <small>{liters(savings.monthLiters)}</small>
        </div>
        <div>
          <span>Średnio na litrze</span>
          <strong>{savings.averageSavingsPerLiter == null ? '—' : perLiter(savings.averageSavingsPerLiter)}</strong>
          <small>netto</small>
        </div>
        <div>
          <span>Jeszcze w zbiorniku</span>
          <strong>{liters(savings.remainingLiters)}</strong>
          <small>{savings.potentialSavingsNet == null ? 'brak dzisiejszej ceny' : `≈ ${money(savings.potentialSavingsNet, 0)} do zaoszczędzenia przy dzisiejszej cenie`}</small>
        </div>
      </div>

      <div className="fuelSavingsExplain">
        <h4>Z czego to wynika</h4>
        <ul>
          <li>
            <b>Paliwo ze zbiornika:</b>{' '}
            {currentBatch
              ? <>{perLiter(currentBatch.netPrice)} netto — dostawa z {dateLabel(currentBatch.happenedAt)} ({liters(currentBatch.liters)}, {perLiter(currentBatch.grossPrice)} brutto, VAT {currentBatch.vatRate}%).</>
              : 'brak ceny zakupu dostawy.'}
          </li>
          <li>
            <b>Paliwo na stacji:</b>{' '}
            {savings.todayReference
              ? <>dziś maks. {perLiter(savings.todayReference.diesel_net)} netto ({perLiter(savings.todayReference.diesel_gross)} brutto) — urzędowa cena maksymalna oleju napędowego z obwieszczenia Ministra Energii (<a href={savings.todayReference.source_url} target="_blank" rel="noreferrer">Monitor Polski</a>), zmienia się prawie codziennie.</>
              : 'brak aktualnej ceny urzędowej.'}
          </li>
          <li><b>Oszczędność tankowania</b> = litry × (cena na stacji w dniu tankowania − cena ze zbiornika). Liczymy netto, bo firma odlicza VAT. Litry są brane z dostaw po kolei (najpierw najstarsza).</li>
          <li className="isNote">Stacje mogą sprzedawać taniej niż cena maksymalna, więc wynik to górne oszacowanie. Ceny maksymalne obowiązują w programie „Ceny Paliwa Niżej” do 31.12.2026.</li>
        </ul>
      </div>

      <PriceGapChart referencePrices={data.referencePrices} tankPrice={currentBatch?.netPrice} sinceKey={sinceKey} />

      {savings.deliveriesWithoutPrice.length ? (
        <div className="fuelSavingsMissing" data-testid="fuel-savings-missing-price">
          <h4>Dostawy bez ceny — uzupełnij, żeby policzyć oszczędność</h4>
          {savings.deliveriesWithoutPrice.map((delivery) => {
            const draft = priceDrafts[delivery.id] || {};
            return (
              <div key={delivery.id} className="fuelSavingsMissingRow">
                <span>{dateLabel(delivery.happenedAt)} · {liters(delivery.liters)}</span>
                <div className="fuelInputWithUnit"><input value={draft.gross || ''} onChange={(event) => setPriceDrafts((current) => ({ ...current, [delivery.id]: { ...draft, gross: event.target.value.replace(/[^0-9,.]/g, '') } }))} inputMode="decimal" placeholder="cena brutto" aria-label="Cena za litr brutto" /><b>zł/l</b></div>
                <select value={draft.vat || '8'} onChange={(event) => setPriceDrafts((current) => ({ ...current, [delivery.id]: { ...draft, vat: event.target.value } }))} aria-label="Stawka VAT">
                  <option value="8">VAT 8%</option>
                  <option value="23">VAT 23%</option>
                </select>
                <button type="button" className="fuelEditButton" disabled={!draft.gross || savingPriceId === delivery.id} onClick={() => void savePrice(delivery.id)}>{savingPriceId === delivery.id ? 'Zapisuję…' : 'Zapisz cenę'}</button>
              </div>
            );
          })}
        </div>
      ) : null}

      {savings.months.length > 1 ? (
        <div className="fuelSavingsMonths">
          {savings.months.map((month) => (
            <span key={month.monthKey}><b>{monthLabel(month.monthKey)}</b>{money(month.savingsNet)} · {liters(month.liters)}</span>
          ))}
        </div>
      ) : null}

      <div className="fuelSavingsTable" data-testid="fuel-savings-table">
        <div className="fuelSavingsTableHeader"><span>Data</span><span>Samochód</span><span>Litry</span><span>Zbiornik</span><span>Stacja</span><span>Oszczędność</span></div>
        {savings.refuels.length ? savings.refuels.map((row) => (
          <div key={row.id} className="fuelSavingsTableRow">
            <span>{dateLabel(row.happenedAt)}</span>
            <span><strong>{row.vehicleLabel}</strong></span>
            <span>{liters(row.liters)}</span>
            <span>{perLiter(row.tankNetPerLiter)}</span>
            <span>{row.reference ? <a href={row.reference.sourceUrl} target="_blank" rel="noreferrer" title={`Obwieszczenie ${row.reference.eli}, obowiązuje od ${row.reference.validFrom}`}>{perLiter(row.stationNetPerLiter)}</a> : '—'}</span>
            <span className={row.savingsNet == null ? 'isMissing' : row.savingsNet >= 0 ? 'isPositive' : 'isNegative'}>
              {row.savingsNet == null ? row.missingReason : money(row.savingsNet)}
            </span>
          </div>
        )) : <div className="fuelSavingsEmpty">{loading ? 'Liczę oszczędności…' : 'Brak tankowań ze zbiornika.'}</div>}
      </div>
    </section>
  );
}
