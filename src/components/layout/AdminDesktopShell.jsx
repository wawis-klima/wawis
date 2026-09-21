import React from 'react';
import { APP_VERSION } from '../../version';
import GlobalDesktopSearch from '../desktop/GlobalDesktopSearch.jsx';

function ShellIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" className="adminShellIcon" fill="none" stroke="currentColor" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function IconDashboardPremium() {
  return (
    <ShellIcon>
      <rect x="4" y="4" width="6.4" height="6.4" rx="1.9" />
      <rect x="13.6" y="4" width="6.4" height="6.4" rx="1.9" />
      <rect x="4" y="13.6" width="6.4" height="6.4" rx="1.9" />
      <rect x="13.6" y="13.6" width="6.4" height="6.4" rx="1.9" />
    </ShellIcon>
  );
}

function IconCalendarShell() {
  return (
    <ShellIcon>
      <rect x="3.8" y="5.2" width="16.4" height="15" rx="3.6" />
      <path d="M8 3.6v3M16 3.6v3M4.4 10.1h15.2" />
      <path d="M8.3 14.1h.01M12 14.1h.01M15.7 14.1h.01M8.3 17.2h.01M12 17.2h.01" />
    </ShellIcon>
  );
}

function IconBriefcaseModern() {
  return (
    <ShellIcon>
      <path d="M9 7V5.8A2.1 2.1 0 0 1 11.1 3.7h1.8A2.1 2.1 0 0 1 15 5.8V7" />
      <rect x="4" y="7" width="16" height="12.6" rx="3.6" />
      <path d="M4.3 12.2c2.25 1.18 4.82 1.78 7.7 1.78s5.45-.6 7.7-1.78" />
      <path d="M10.2 12.9h3.6" />
    </ShellIcon>
  );
}

function IconContactsModern() {
  return (
    <ShellIcon>
      <path d="M4.5 20V8.25L12 4l7.5 4.25V20" />
      <path d="M8.2 20v-5.35h7.6V20" />
      <path d="M8.35 10.55h.01M12 10.55h.01M15.65 10.55h.01" />
      <path d="M6.75 20h10.5" />
    </ShellIcon>
  );
}

function IconDeviceModern() {
  return (
    <ShellIcon>
      <rect x="4" y="5.3" width="16" height="9.7" rx="3.2" />
      <path d="M7.4 9.2h9.2" />
      <path d="M8.5 12.05c2.2 1.08 4.8 1.08 7 0" />
      <path d="M12 15v3.8M9.25 18.8h5.5" />
    </ShellIcon>
  );
}

function IconFuel() {
  return <ShellIcon><path d="M6 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16" /><path d="M4 21h15" /><path d="M9 7h5v4H9z" /><path d="M17 8h1.5l1.5 2v6.5a1.5 1.5 0 0 0 3 0V10l-2-2" /></ShellIcon>;
}

function IconMessageModern() {
  return (
    <ShellIcon>
      <path d="M6.25 17.15 4 19.15l.58-3.12A6.72 6.72 0 0 1 3.45 12.15C3.45 8.3 7.18 5.2 11.8 5.2s8.35 3.1 8.35 6.95-3.73 6.95-8.35 6.95a9.8 9.8 0 0 1-5.55-1.95Z" />
      <path d="M8.15 10.75h7.35M8.15 13.65h4.95" />
    </ShellIcon>
  );
}

function IconSlidersModern() {
  return (
    <ShellIcon>
      <path d="M4.5 7.2h4.1M13.2 7.2h6.3" />
      <circle cx="10.8" cy="7.2" r="2.2" />
      <path d="M4.5 16.8h6.3M15.4 16.8h4.1" />
      <circle cx="13.2" cy="16.8" r="2.2" />
    </ShellIcon>
  );
}

function IconTemplateModern() {
  return (
    <ShellIcon>
      <path d="M7.2 3.9h6.9L19 8.75v9.1a2.25 2.25 0 0 1-2.25 2.25h-9.5A2.25 2.25 0 0 1 5 17.85V6.15A2.25 2.25 0 0 1 7.2 3.9Z" />
      <path d="M14 4.2v4.9h4.75" />
      <path d="M8.35 12.1h7.3M8.35 15.2h4.8" />
    </ShellIcon>
  );
}

const sidebarSections = [
  {
    title: null,
    items: [
      { key: 'center360', label: 'Centrum 360', icon: IconDashboardPremium, target: 'center360' },
      { key: 'orders', label: 'Montaże', icon: IconBriefcaseModern, target: 'jobs' },
      { key: 'calendar', label: 'Kalendarz', icon: IconCalendarShell, target: 'calendar' },
      { key: 'devices', label: 'Urządzenia', icon: IconDeviceModern, target: 'devices' },
      { key: 'fuel', label: 'Tankowania', icon: IconFuel, target: 'fuel' },
      { key: 'contractors', label: 'Kontrahenci', icon: IconContactsModern, target: 'contractors' },
    ],
  },
  {
    title: 'KOMUNIKACJA',
    items: [
      { key: 'sms', label: 'SMS', icon: IconMessageModern, target: 'sms' },
      { key: 'sms_templates', label: 'Szablony SMS', icon: IconTemplateModern, target: 'sms', passive: true },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { key: 'diagnostics', label: 'Diagnostyka', icon: IconSlidersModern, target: 'diagnostics' },
    ],
  },
];

function getSidebarActiveState(item, activeModule, activeNavKey) {
  if (activeNavKey && item.key === activeNavKey) return true;
  if (item.key === 'center360') return activeModule === 'center360';
  if (item.key === 'sms') return activeModule === 'sms' && activeNavKey !== 'sms_templates';
  if (item.key === 'devices') return activeModule === 'devices';
  if (item.key === 'fuel') return activeModule === 'fuel';
  if (item.key === 'contractors') return activeModule === 'contractors';
  if (item.key === 'calendar') return activeModule === 'calendar';
  if (item.key === 'orders') return activeModule === 'jobs' && (!activeNavKey || activeNavKey === 'orders');
  if (item.key === 'diagnostics') return activeModule === 'diagnostics';
  return false;
}

export default function AdminDesktopShell({ activeModule, activeNavKey, setActiveModule, onNavigate, profile, onLogout, globalSearchProps = null, children }) {
  const displayName = profile?.full_name || profile?.email || 'Administrator';
  const initials = String(displayName).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'AD';

  return (
    <div className="adminDesktopShell">
      <aside className="adminDesktopSidebar adminDesktopSidebarLightPremium">
        <div className="adminDesktopBrand adminDesktopBrandWawis">
          <img src="/logo.png" alt="WAWIS Chłodnictwo i Klimatyzacja" className="adminDesktopBrandLogo" />
        </div>

        <nav className="adminDesktopNav" aria-label="Menu aplikacji desktopowej">
          {sidebarSections.map((section) => (
            <div key={section.title || 'main'} className="adminDesktopNavSection">
              {section.title ? <div className="adminDesktopNavHeading">{section.title}</div> : null}
              <div className="adminDesktopNavList">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = getSidebarActiveState(item, activeModule, activeNavKey);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`adminDesktopNavItem ${active ? 'active' : ''}`}
                      onClick={() => (typeof onNavigate === 'function' ? onNavigate(item.target, item.key) : setActiveModule(item.target))}
                      title={item.label}
                    >
                      <span className="adminDesktopNavItemIcon"><Icon /></span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="adminDesktopSidebarFooter">
          <div className="adminDesktopSidebarProfileCard">
            <div className="adminDesktopProfileAvatar">{initials}</div>
            <div className="adminDesktopProfileCopy">
              <strong>{displayName}</strong>
              <span>{profile?.role || 'Administrator'}</span>
            </div>
            <button type="button" className="adminDesktopLogoutButton" aria-label="Wyloguj" onClick={onLogout} title="Wyloguj">
              Wyloguj
            </button>
          </div>
          <div className="adminDesktopSidebarVersion" aria-label={`Aktualna wersja aplikacji ${APP_VERSION}`}>
            Wersja {APP_VERSION}
          </div>
        </div>
      </aside>

      <div className="adminDesktopMain">
        {globalSearchProps ? (
          <header className="adminDesktopTopbar adminDesktopGlobalSearchTopbar">
            <GlobalDesktopSearch {...globalSearchProps} />
          </header>
        ) : null}
        <main className="adminDesktopWorkspace">{children}</main>
      </div>
    </div>
  );
}
