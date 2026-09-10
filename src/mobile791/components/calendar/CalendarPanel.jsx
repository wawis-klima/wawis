import React, { useEffect, useMemo, useState } from 'react';
import { getJobDeviceRows } from '../../modules/job-devices.js';

const MONTH_NAMES = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const WEEK_DAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

const JOB_STATUS_LABELS = {
  new: 'Nowe',
  active: 'W trakcie',
  progress: 'W trakcie',
  in_progress: 'W trakcie',
  done: 'Zakończone',
  completed: 'Zakończone',
  finished: 'Zakończone',
  archived: 'Archiwum',
  archive: 'Archiwum',
  cancelled: 'Anulowane',
  canceled: 'Anulowane',
};

function getJobStatus(job) {
  const rawStatus = job.status || job.job_status || job.stage || job.state || '';
  if (!rawStatus) return 'Brak statusu';
  const normalized = String(rawStatus).trim().toLowerCase();
  return JOB_STATUS_LABELS[normalized] || String(rawStatus);
}

function getJobStatusTone(job) {
  const normalized = String(job.status || job.job_status || job.stage || job.state || '').trim().toLowerCase();
  if (['done', 'completed', 'finished', 'zakończone', 'zakonczone'].includes(normalized)) return 'done';
  if (['active', 'progress', 'in_progress', 'w trakcie'].includes(normalized)) return 'active';
  if (['archived', 'archive', 'archiwum'].includes(normalized)) return 'archived';
  if (['cancelled', 'canceled', 'anulowane'].includes(normalized)) return 'cancelled';
  return 'new';
}


function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getJobDateKey(job) {
  const rawDate = job.installation_date;
  if (!rawDate) return '';
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return '';
  return toDateKey(date);
}

function getClientName(job) {
  return job.client || job.client_name || job.contractor_name || job.title || 'Bez klienta';
}

function getDeviceName(job) {
  const devices = getJobDeviceRows(job);
  if (devices.length > 1) return `${devices.length} urządzenia`;
  return devices[0]?.model || job.model || job.device || job.air_conditioner_model || '';
}

function getAddress(job) {
  return [job.city, job.street || job.address].filter(Boolean).join(', ');
}

function buildMonthDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstWeekDay = (firstDay.getDay() + 6) % 7;
  const days = [];

  for (let offset = firstWeekDay; offset > 0; offset -= 1) {
    days.push(new Date(year, month, 1 - offset));
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(year, month, day));
  }

  while (days.length % 7 !== 0) {
    const next = new Date(days[days.length - 1]);
    next.setDate(next.getDate() + 1);
    days.push(next);
  }

  return days;
}

export default function CalendarPanel({ jobs = [], focusedDateKey = '', onOpenJob }) {
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()));

  const jobsByDate = useMemo(() => {
    const map = new Map();
    jobs.forEach((job) => {
      const key = getJobDateKey(job);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(job);
    });
    return map;
  }, [jobs]);

  useEffect(() => {
    if (!focusedDateKey) return;
    const focusedDate = new Date(focusedDateKey);
    if (Number.isNaN(focusedDate.getTime())) return;
    setSelectedDateKey(focusedDateKey);
    setMonthDate(new Date(focusedDate.getFullYear(), focusedDate.getMonth(), 1));
  }, [focusedDateKey]);

  const monthDays = useMemo(() => buildMonthDays(monthDate), [monthDate]);
  const selectedJobs = jobsByDate.get(selectedDateKey) || [];
  const monthLabel = `${MONTH_NAMES[monthDate.getMonth()]} ${monthDate.getFullYear()}`;

  function changeMonth(delta) {
    setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function goToday() {
    const now = new Date();
    setMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDateKey(toDateKey(now));
  }

  return (
    <div className="calendarModulePage calendarModulePageWide">
      <section className="calendarToolbar calendarToolbarCompact card premiumCard calendarDesktopWideSection">
        <div className="calendarMonthTitleWrap">
          <strong className="calendarMonthTitle">{monthLabel}</strong>
        </div>
        <div className="calendarToolbarActions">
          <button type="button" className="btn secondary desktopToolbarActionBtn" onClick={() => changeMonth(-1)}>‹ Poprzedni</button>
          <button type="button" className="btn primary desktopToolbarActionBtn" onClick={goToday}>Dzisiaj</button>
          <button type="button" className="btn secondary desktopToolbarActionBtn" onClick={() => changeMonth(1)}>Następny ›</button>
        </div>
      </section>

      <section className="calendarContentGrid calendarDesktopWideSection">
        <div className="calendarCard card premiumCard">
          <div className="calendarWeekHeader">
            {WEEK_DAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="calendarGrid">
            {monthDays.map((day) => {
              const key = toDateKey(day);
              const dayJobs = jobsByDate.get(key) || [];
              const isOutside = day.getMonth() !== monthDate.getMonth();
              const isToday = key === toDateKey(new Date());
              const isSelected = key === selectedDateKey;
              return (
                <button
                  type="button"
                  key={key}
                  className={`calendarDay ${isOutside ? 'outside' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedDateKey(key)}
                >
                  <span className="calendarDayNumber">{day.getDate()}</span>
                  <div className="calendarDayJobs">
                    {dayJobs.slice(0, 3).map((job) => (
                      <span key={job.id || `${key}-${getClientName(job)}`} className="calendarJobChip">
                        {getClientName(job)}
                      </span>
                    ))}
                    {dayJobs.length > 3 ? <span className="calendarMoreChip">+{dayJobs.length - 3} więcej</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="calendarDetailsCard card premiumCard">
          <div className="calendarDetailsHeader">
            <span>Wybrany dzień</span>
            <strong>{selectedDateKey}</strong>
          </div>
          {selectedJobs.length ? (
            <div className="calendarJobsList">
              {selectedJobs.map((job) => (
                <button type="button" key={job.id || `${selectedDateKey}-${getClientName(job)}`} className="calendarJobDetailsItem" onClick={() => onOpenJob?.(job)}>
                  <strong>{getClientName(job)}</strong>
                  <div className="calendarJobDetailsMeta">
                    <span className={`calendarJobDetailsStatus tone-${getJobStatusTone(job)}`}>{getJobStatus(job)}</span>
                    {getDeviceName(job) ? (
                      <span className="calendarJobDetailsPill">Urządzenie: {getDeviceName(job)}</span>
                    ) : (
                      <span className="calendarJobDetailsMuted">Brak modelu urządzenia</span>
                    )}
                  </div>
                  {getAddress(job) ? (
                    <small className="calendarJobDetailsAddress">Adres: {getAddress(job)}</small>
                  ) : (
                    <small className="calendarJobDetailsAddress calendarJobDetailsMuted">Brak adresu</small>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="calendarEmptyState">Brak montaży w tym dniu.</div>
          )}
        </aside>
      </section>
    </div>
  );
}
