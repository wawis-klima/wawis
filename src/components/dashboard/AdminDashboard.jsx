import React, { useMemo } from 'react';
import ModuleHeader from '../common/ModuleHeader.jsx';
import { buildAdminDashboardStats } from './dashboard-utils.js';

function DashboardCard({ label, value, hint, tone = 'blue', onClick }) {
  return (
    <button type="button" className={`adminDashboardCard tone-${tone}`} onClick={onClick}>
      <div className="adminDashboardCardTop">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <p>{hint}</p>
      <em>Otwórz filtr ›</em>
    </button>
  );
}

function MiniList({ title, rows, emptyText, getTitle, getMeta, onOpen }) {
  return (
    <section className="adminDashboardPanel card premiumCard">
      <div className="adminDashboardPanelHeader">
        <h3>{title}</h3>
        <span>{rows.length}</span>
      </div>
      {rows.length ? (
        <div className="adminDashboardMiniList">
          {rows.slice(0, 6).map((row, index) => (
            <button key={row.id || row.job_id || `${title}-${index}`} type="button" className="adminDashboardMiniItem" onClick={() => onOpen?.(row)}>
              <strong>{getTitle(row)}</strong>
              <span>{getMeta(row)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="adminDashboardEmpty">{emptyText}</div>
      )}
    </section>
  );
}

export default function AdminDashboard({ jobs = [], contractors = [], onNavigate }) {
  const stats = useMemo(() => buildAdminDashboardStats({ jobs, contractors }), [jobs, contractors]);

  return (
    <div className="adminDashboardPage desktopModuleShell">
      <ModuleHeader
        eyebrow="Centrum dowodzenia"
        title="Start administratora"
        description="Najważniejsze sprawy po zalogowaniu: montaże, SMS-y, urządzenia, braki w danych i błędy komunikacji. Kafle przenoszą od razu do właściwego modułu."
        metrics={[
          { label: 'Montaże', value: stats.totals.jobs },
          { label: 'Urządzenia', value: stats.totals.devices },
          { label: 'Kontrahenci', value: stats.totals.contractors },
        ]}
      />

      <section className="adminDashboardGrid" aria-label="Szybkie filtry administratora">
        <DashboardCard label="Montaże dzisiaj" value={stats.jobsToday.length} hint={`Termin: ${stats.today}`} tone="green" onClick={() => onNavigate?.({ module: 'jobs', navKey: 'orders', jobsQuickFilter: 'today' })} />
        <DashboardCard label="Montaże w tygodniu" value={stats.jobsThisWeek.length} hint={stats.periodLabel} tone="blue" onClick={() => onNavigate?.({ module: 'jobs', navKey: 'orders', jobsQuickFilter: 'week' })} />
        <DashboardCard label="SMS-y do wysłania" value={stats.smsDueToday} hint="Klienci gotowi do przypomnienia serwisowego" tone="teal" onClick={() => onNavigate?.({ module: 'sms', navKey: 'sms' })} />
        <DashboardCard label="Urządzenia do serwisu" value={stats.devicesDueService.length} hint="Po terminie lub z aktywnym przypomnieniem" tone="amber" onClick={() => onNavigate?.({ module: 'devices', navKey: 'devices' })} />
        <DashboardCard label="Bez daty montażu" value={stats.devicesMissingInstallDate.length} hint="Brakuje daty do wyliczenia serwisu" tone="slate" onClick={() => onNavigate?.({ module: 'devices', navKey: 'devices', devicesQuickFilter: 'missing_installation_date' })} />
        <DashboardCard label="Klienci bez telefonu" value={stats.clientsWithoutPhone.length} hint="Nie da się wysłać SMS ani szybko zadzwonić" tone="red" onClick={() => onNavigate?.({ module: 'contractors', navKey: 'contractors', contractorsQuickFilter: 'missing_phone' })} />
        <DashboardCard label="Bez montera" value={stats.jobsWithoutInstaller.length} hint="Zlecenia bez przypisanego wykonawcy" tone="purple" onClick={() => onNavigate?.({ module: 'jobs', navKey: 'orders', jobsQuickFilter: 'no_installer' })} />
        <DashboardCard label="Błędy SMS" value={stats.smsErrors.length} hint="Niewysłane lub błędne wiadomości" tone="red" onClick={() => onNavigate?.({ module: 'sms', navKey: 'sms' })} />
      </section>

      <section className="adminDashboardPanels">
        <MiniList
          title="Dzisiejsze montaże"
          rows={stats.jobsToday}
          emptyText="Brak montaży na dzisiaj."
          getTitle={(job) => job.client || job.title || 'Klient'}
          getMeta={(job) => [job.city, job.street, job.phone].filter(Boolean).join(' • ') || 'Brak szczegółów'}
          onOpen={(job) => onNavigate?.({ module: 'jobs', navKey: 'orders', openJobId: job.id, jobsQuickFilter: 'today' })}
        />
        <MiniList
          title="Do uzupełnienia"
          rows={[...stats.devicesMissingInstallDate, ...stats.jobsWithoutInstaller].slice(0, 8)}
          emptyText="Nie widzę krytycznych braków w danych."
          getTitle={(row) => row.client || row.title || 'Pozycja'}
          getMeta={(row) => row.model ? `Brak daty montażu • ${row.model}` : 'Brak przypisanego montera'}
          onOpen={(row) => onNavigate?.({ module: row.model ? 'devices' : 'jobs', navKey: row.model ? 'devices' : 'orders', openJobId: row.job_id || row.id, devicesQuickFilter: row.model ? 'missing_installation_date' : '', jobsQuickFilter: row.model ? '' : 'no_installer' })}
        />
      </section>
    </div>
  );
}
