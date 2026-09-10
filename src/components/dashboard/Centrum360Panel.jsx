import React, { useMemo } from 'react';
import { getJobDeviceRows } from '../../modules/job-devices.js';
import { buildContractorsWithJobFallback } from '../../modules/contractors.js';
import { getJobTypeClass, getJobTypeLabel, renderInitialBadges } from '../../utils/jobHelpers.jsx';

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfIsoWeek(date) {
  const start = startOfDay(date);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return start;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(value) {
  const date = parseDate(value);
  if (!date) return 'bez daty';
  return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
}

function normalizeText(value) {
  return String(value || '').trim();
}

function getProfileDisplayName(profile = {}) {
  return normalizeText(profile.full_name || profile.name || profile.email || profile.id);
}

function getGreetingName(profile = {}) {
  const displayName = getProfileDisplayName(profile);
  if (!displayName) return 'Administrator';
  const withoutEmailDomain = displayName.includes('@') ? displayName.split('@')[0] : displayName;
  const firstName = normalizeText(withoutEmailDomain.split(/\s+/)[0]);
  return firstName || 'Administrator';
}

function buildContractorsById(contractors = []) {
  return new Map((contractors || []).map((contractor) => [String(contractor.id || ''), contractor]).filter(([id]) => id));
}

function buildProfilesById(profiles = []) {
  return new Map((profiles || []).map((profile) => [String(profile.id || ''), profile]).filter(([id]) => id));
}

function getJobClientName(job = {}, contractorsById = new Map()) {
  const direct = normalizeText(
    job.client
    || job.title
    || job.client_name
    || job.contractor_name
    || job.customer_name
    || job.company_name
    || job.name,
  );
  if (direct) return direct;

  const contractorId = normalizeText(job.contractor_id);
  const contractor = contractorId ? contractorsById.get(String(contractorId)) : null;
  const contractorName = normalizeText(contractor?.company_name || contractor?.name || contractor?.client || contractor?.title);
  return contractorName || 'Klient bez nazwy';
}

function getJobAddress(job = {}) {
  return [job.city, job.street || job.address].map(normalizeText).filter(Boolean).join(', ') || normalizeText(job.location || job.address_text) || 'Adres nieuzupełniony';
}

function getAssignedInstallerNames(job = {}, profilesById = new Map()) {
  const names = [];
  const addName = (value) => {
    const name = normalizeText(value);
    if (name && !names.includes(name)) names.push(name);
  };
  const addProfileName = (userId) => {
    const id = normalizeText(userId);
    if (!id) return;
    const profile = profilesById.get(String(id));
    addName(getProfileDisplayName(profile));
  };

  addName(job.main_technician_name || job.technician_name || job.installer_name || job.assigned_to_name);
  addProfileName(job.main_technician_id || job.technician_id || job.assigned_to || job.assigned_user_id);

  if (Array.isArray(job.viewers)) {
    job.viewers.forEach((viewer) => addProfileName(viewer?.user_id || viewer?.id || viewer));
  }
  if (Array.isArray(job.installers)) {
    job.installers.forEach((installer) => addName(installer?.name || installer?.full_name || installer?.email || installer));
  }
  if (Array.isArray(job.assignees)) {
    job.assignees.forEach((assignee) => addName(assignee?.name || assignee?.full_name || assignee?.email || assignee));
  }
  if (Array.isArray(job.assigned_user_ids)) {
    job.assigned_user_ids.forEach(addProfileName);
  }

  return names;
}

function hasInstaller(job = {}, profilesById = new Map()) {
  if (getAssignedInstallerNames(job, profilesById).length) return true;
  if (normalizeText(job.main_technician_id || job.technician_id || job.assigned_to || job.assigned_user_id)) return true;
  if (Array.isArray(job.viewers) && job.viewers.length) return true;
  if (Array.isArray(job.installers) && job.installers.length) return true;
  if (Array.isArray(job.assignees) && job.assignees.length) return true;
  if (Array.isArray(job.assigned_user_ids) && job.assigned_user_ids.length) return true;
  return false;
}

function isPhoneMissing(job = {}) {
  return !normalizeText(job.phone || job.client_phone || job.contact_phone || job.contractor_phone);
}

function isOpenJobForQuickInstallerCheck(job = {}) {
  const status = getJobTypeLabel(job);
  return status === 'Nowe' || status === 'W trakcie';
}


function pickMetric(metrics, key, fallback) {
  const value = metrics?.[key];
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function IconCard({ type = 'dashboard' }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.9', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' };
  if (type === 'calendar') return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="4" /><path d="M8 3.5v3M16 3.5v3M4.5 10h15" /></svg>;
  if (type === 'device') return <svg {...common}><rect x="4" y="5.5" width="16" height="9.5" rx="3" /><path d="M7.5 9.4h9M8.5 12.1c2.2 1 4.8 1 7 0M12 15v3.5M9.5 18.5h5" /></svg>;
  if (type === 'sms') return <svg {...common}><path d="M6.4 17.2 4 19l.7-3.1A6.5 6.5 0 0 1 3.5 12c0-3.8 3.8-6.8 8.5-6.8s8.5 3 8.5 6.8-3.8 6.8-8.5 6.8a9.9 9.9 0 0 1-5.6-1.6Z" /><path d="M8.2 10.5h7.6M8.2 13.4h4.6" /></svg>;
  if (type === 'contractor') return <svg {...common}><path d="M4.5 20V8.3L12 4l7.5 4.3V20" /><path d="M8.2 20v-5.4h7.6V20M8.4 10.6h.01M12 10.6h.01M15.6 10.6h.01" /></svg>;
  return <svg {...common}><rect x="4" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" /></svg>;
}

function Sparkline({ tone = 'blue' }) {
  return (
    <svg className={`centrum360Sparkline centrum360Sparkline-${tone}`} viewBox="0 0 96 36" fill="none" aria-hidden="true">
      <path d="M3 29 C14 26, 15 18, 25 22 S38 31, 48 19 S60 10, 71 15 S84 22, 93 6" />
    </svg>
  );
}

export default function Centrum360Panel({ jobs = [], contractors = [], profiles = [], profile = null, smsDueTodayCount = 0, metrics = null, onNavigate = () => {} }) {
  const greetingName = useMemo(() => getGreetingName(profile), [profile]);

  const stats = useMemo(() => {
    const contractorsById = buildContractorsById(contractors);
    const profilesById = buildProfilesById(profiles);
    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const currentWeekStart = startOfIsoWeek(today);
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekStart.getDate() + 7);

    const jobsWithDates = jobs.map((job) => ({ job, date: parseDate(job.installation_date || job.date || job.created_at) })).filter((item) => item.date);
    const todaysJobs = jobsWithDates.filter(({ date }) => date >= today && date < tomorrow).map(({ job }) => job);
    const weekJobs = jobsWithDates.filter(({ date }) => date >= currentWeekStart && date < currentWeekEnd).map(({ job }) => job);
    const devicesRows = jobs.flatMap((job) => getJobDeviceRows(job).map((device) => ({ ...device, job })));
    const devicesWithoutDate = devicesRows.filter(({ job }) => !job.installation_date);
    const noPhone = jobs.filter(isPhoneMissing);
    const noInstaller = jobs.filter((job) => isOpenJobForQuickInstallerCheck(job) && !hasInstaller(job, profilesById));
    const contractorsWithJobFallback = buildContractorsWithJobFallback(contractors, jobs);

    const statusCounts = jobs.reduce((acc, job) => {
      const key = getJobTypeLabel(job);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const upcoming = jobsWithDates
      .filter(({ date }) => date >= today)
      .sort((a, b) => a.date - b.date)
      .slice(0, 4)
      .map(({ job }) => job);

    const weekBars = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(currentWeekStart);
      day.setDate(currentWeekStart.getDate() + index);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      const count = jobsWithDates.filter(({ date }) => date >= day && date < next).length;
      return {
        key: day.toISOString(),
        label: day.toLocaleDateString('pl-PL', { weekday: 'short' }).replace('.', ''),
        dateLabel: day.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }),
        count,
      };
    });

    return {
      todaysJobs,
      weekJobs,
      devicesCount: devicesRows.length,
      devicesWithoutDate,
      noPhone,
      noInstaller,
      contractorsCount: contractorsWithJobFallback.length,
      statusCounts,
      upcoming,
      weekBars,
      contractorsById,
      profilesById,
    };
  }, [contractors, jobs, profiles]);

  const maxBar = Math.max(1, ...stats.weekBars.map((bar) => bar.count));
  const completed = stats.statusCounts.Zakończone || stats.statusCounts.zakończone || 0;
  const inProgress = stats.statusCounts['W trakcie'] || stats.statusCounts['W realizacji'] || 0;
  const planned = (stats.statusCounts.Nowe || 0) + (stats.statusCounts.Zaplanowane || 0);
  const blocked = Object.entries(stats.statusCounts).reduce((sum, [status, count]) => {
    const normalized = status.toLowerCase();
    return normalized.includes('nie') || normalized.includes('anul') ? sum + count : sum;
  }, 0);
  const totalStatus = Math.max(1, completed + inProgress + planned + blocked);
  const statusGradient = `conic-gradient(#16a34a 0 ${completed / totalStatus * 360}deg, #2563eb ${completed / totalStatus * 360}deg ${(completed + inProgress) / totalStatus * 360}deg, #f97316 ${(completed + inProgress) / totalStatus * 360}deg ${(completed + inProgress + planned) / totalStatus * 360}deg, #ef4444 ${(completed + inProgress + planned) / totalStatus * 360}deg 360deg)`;

  const dashboardCounts = {
    jobsToday: pickMetric(metrics, 'jobsToday', stats.todaysJobs.length),
    jobsNext7Days: pickMetric(metrics, 'jobsCurrentWeek', pickMetric(metrics, 'jobsNext7Days', stats.weekJobs.length)),
    smsDueToday: smsDueTodayCount,
    devicesWithoutDate: pickMetric(metrics, 'devicesWithoutDate', stats.devicesWithoutDate.length),
    contractorsCount: pickMetric(metrics, 'contractorsCount', stats.contractorsCount),
    clientsWithoutPhone: pickMetric(metrics, 'clientsWithoutPhone', stats.noPhone.length),
    jobsWithoutInstaller: pickMetric(metrics, 'jobsWithoutInstaller', stats.noInstaller.length),
    smsErrors: pickMetric(metrics, 'smsErrors', 0),
  };

  const cards = [
    { label: 'Montaże dziś', value: dashboardCounts.jobsToday, note: 'zaplanowane na dzisiaj', icon: 'dashboard', tone: 'blue', action: () => onNavigate('calendar', 'calendar') },
    { label: 'Montaże bieżący tydzień', value: dashboardCounts.jobsNext7Days, note: 'od poniedziałku do niedzieli', icon: 'calendar', tone: 'green', action: () => onNavigate('calendar', 'calendar') },
    { label: 'SMS do wysłania', value: dashboardCounts.smsDueToday, note: 'serwisy do przypomnienia', icon: 'sms', tone: 'orange', action: () => onNavigate('sms', 'sms') },
  ];

  return (
    <section className="centrum360Page desktopModuleShell" aria-label="Centrum 360" data-center360-header="10.00">
      <div className="centrum360Header">
        <div>
          <span className="centrum360Eyebrow">Centrum 360</span>
          <h1>Dzień dobry, {greetingName} 👋</h1>
          <p>Jedno miejsce do codziennego prowadzenia montażu, SMS-ów i bazy klientów.</p>
        </div>
      </div>

      <div className="centrum360CardsGrid">
        {cards.map((card) => (
          <button type="button" key={card.label} className={`centrum360MetricCard centrum360MetricCard-${card.tone}`} onClick={card.action}>
            <span className="centrum360MetricIcon"><IconCard type={card.icon} /></span>
            <span className="centrum360MetricCopy">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </span>
            <Sparkline tone={card.tone} />
          </button>
        ))}
      </div>

      <div className="centrum360MainGrid">
        <div className="centrum360Panel centrum360WeeklyPanel">
          <div className="centrum360PanelHeader">
            <div>
              <h2>Montaże w bieżącym tygodniu</h2>
              <p>Podgląd obciążenia od poniedziałku do niedzieli</p>
            </div>
            <button type="button" className="centrum360TinyButton" onClick={() => onNavigate('calendar', 'calendar')}>Bieżący tydzień</button>
          </div>
          <div className="centrum360Bars" aria-label="Wykres montaży w tygodniu">
            {stats.weekBars.map((bar, index) => (
              <div className="centrum360BarItem" key={bar.key}>
                <span className="centrum360BarValue">{bar.count}</span>
                <span className={`centrum360Bar ${index === 0 ? 'active' : ''}`} style={{ height: `${Math.max(10, (bar.count / maxBar) * 118)}px` }} />
                <span className="centrum360BarDay">{bar.label}</span>
                <small>{bar.dateLabel}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="centrum360Panel centrum360StatusPanel">
          <div className="centrum360PanelHeader compact">
            <div>
              <h2>Status zleceń</h2>
              <p>Aktualny rozkład pracy</p>
            </div>
          </div>
          <div className="centrum360StatusBody">
            <div className="centrum360Donut" style={{ background: statusGradient }}><span>{jobs.length}<small>łącznie</small></span></div>
            <div className="centrum360Legend">
              <div><span className="centrum360LegendDot centrum360LegendGreen" />Zakończone <strong>{completed}</strong></div>
              <div><span className="centrum360LegendDot centrum360LegendBlue" />W realizacji <strong>{inProgress}</strong></div>
              <div><span className="centrum360LegendDot centrum360LegendAmber" />Nowe / planowane <strong>{planned}</strong></div>
              <div><span className="centrum360LegendDot centrum360LegendRose" />Niezrealizowane <strong>{blocked}</strong></div>
            </div>
          </div>
        </div>

        <div className="centrum360Panel centrum360UpcomingPanel">
          <div className="centrum360PanelHeader">
            <div>
              <h2>Nadchodzące montaże</h2>
              <p>Najbliższe zaplanowane zlecenia</p>
            </div>
            <button type="button" className="centrum360TinyButton" onClick={() => onNavigate('jobs', 'orders')}>Zobacz listę</button>
          </div>
          <div className="centrum360UpcomingList">
            {stats.upcoming.length ? stats.upcoming.map((job) => (
              <article className="centrum360UpcomingItem" key={job.id || `${getJobClientName(job, stats.contractorsById)}-${job.installation_date}`}>
                <div className="centrum360DateBadge"><strong>{formatShortDate(job.installation_date)}</strong></div>
                <div className="centrum360UpcomingCopy">
                  <strong>{getJobClientName(job, stats.contractorsById)}</strong>
                  <span>{getJobAddress(job)}</span>
                </div>
                <span className={`jobTypeTag desktopJobTypeTag centrum360StatusTag ${getJobTypeClass(job)}`}>{getJobTypeLabel(job)}</span>
                <div className="centrum360InstallerBadges" aria-label="Monterzy">{renderInitialBadges(getAssignedInstallerNames(job, stats.profilesById))}</div>
              </article>
            )) : (
              <div className="centrum360EmptyState">Brak nadchodzących montaży z wpisaną datą.</div>
            )}
          </div>
        </div>

        <div className="centrum360Panel centrum360QuickPanel">
          <div className="centrum360PanelHeader compact">
            <div>
              <h2>Szybkie filtry</h2>
              <p>Najczęstsze rzeczy do sprawdzenia</p>
            </div>
          </div>
          <div className="centrum360QuickList">
            <button type="button" onClick={() => onNavigate('contractors', 'contractors')}><span>Klienci bez telefonu</span><strong>{dashboardCounts.clientsWithoutPhone}</strong></button>
            <button type="button" onClick={() => onNavigate('jobs', 'orders')}><span>Zlecenia bez montera</span><strong>{dashboardCounts.jobsWithoutInstaller}</strong></button>
            <button type="button" onClick={() => onNavigate('devices', 'devices')}><span>Urządzenia bez daty</span><strong>{dashboardCounts.devicesWithoutDate}</strong></button>
            <button type="button" onClick={() => onNavigate('sms', 'sms')}><span>Błędy SMS</span><strong>{dashboardCounts.smsErrors}</strong></button>
            <button type="button" onClick={() => onNavigate('contractors', 'contractors')}><span>Kontrahenci w bazie</span><strong>{dashboardCounts.contractorsCount}</strong></button>
          </div>
        </div>
      </div>
    </section>
  );
}
