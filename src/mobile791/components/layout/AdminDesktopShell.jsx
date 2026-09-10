import React from 'react';
import { APP_VERSION } from '../../version';

function ShellIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" className="adminShellIcon" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function IconHome() {
  return <ShellIcon><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10.5V20h12v-9.5" /></ShellIcon>;
}
function IconCalendarShell() {
  return <ShellIcon><path d="M8 3v3M16 3v3" /><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16" /></ShellIcon>;
}
function IconClipboard() {
  return <ShellIcon><rect x="6" y="5" width="12" height="15" rx="2" /><path d="M9 5.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5" /><path d="M9 11h6M9 15h4" /></ShellIcon>;
}
function IconUsersShell() {
  return <ShellIcon><path d="M16 20v-1.2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" /><circle cx="9.5" cy="8" r="3.2" /><path d="M20 20v-1a3.5 3.5 0 0 0-2.8-3.4" /><path d="M16.5 4.8a3.2 3.2 0 0 1 0 6.3" /></ShellIcon>;
}
function IconDevice() {
  return <ShellIcon><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></ShellIcon>;
}
function IconFuel() {
  return <ShellIcon><path d="M6 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16" /><path d="M4 21h15" /><path d="M9 7h5v4H9z" /><path d="M17 8h1.5l1.5 2v6.5a1.5 1.5 0 0 0 3 0V10l-2-2" /></ShellIcon>;
}
function IconChecklist() {
  return <ShellIcon><path d="M9 7h10M9 12h10M9 17h10" /><path d="M4.5 7.2 5.7 8.4 7.8 6.3" /><path d="M4.5 12.2 5.7 13.4 7.8 11.3" /><path d="M4.5 17.2 5.7 18.4 7.8 16.3" /></ShellIcon>;
}
function IconMessage() {
  return <ShellIcon><path d="M20 11a7.5 7.5 0 0 1-7.5 7.5H8l-4 2 1.5-4A7.5 7.5 0 1 1 20 11Z" /></ShellIcon>;
}
function IconFile() {
  return <ShellIcon><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></ShellIcon>;
}
function IconGear() {
  return <ShellIcon><circle cx="12" cy="12" r="3.2" /><path d="M19 12a7 7 0 0 0-.08-1l2.03-1.58-2-3.46-2.46 1a7.08 7.08 0 0 0-1.72-1L14.4 3h-4.8l-.37 2.96a7.08 7.08 0 0 0-1.72 1l-2.46-1-2 3.46L5.08 11a7 7 0 0 0 0 2l-2.03 1.58 2 3.46 2.46-1a7.08 7.08 0 0 0 1.72 1L9.6 21h4.8l.37-2.96a7.08 7.08 0 0 0 1.72-1l2.46 1 2-3.46L18.92 13c.05-.33.08-.66.08-1Z" /></ShellIcon>;
}
function IconBell() {
  return <ShellIcon><path d="M15 18H5.5a1 1 0 0 1-.8-1.6l1.1-1.47A4 4 0 0 0 6.6 12.5V10a5.4 5.4 0 0 1 10.8 0v2.5c0 .88.29 1.73.8 2.43l1.1 1.47A1 1 0 0 1 18.5 18H15" /><path d="M10 18a2 2 0 0 0 4 0" /></ShellIcon>;
}
function IconChevronDown() {
  return <ShellIcon><path d="m7 10 5 5 5-5" /></ShellIcon>;
}
function IconSupport() {
  return <ShellIcon><path d="M5 12a7 7 0 0 1 14 0v4a2 2 0 0 1-2 2h-2v-4h4" /><path d="M5 14h4v4H7a2 2 0 0 1-2-2v-4Z" /></ShellIcon>;
}

function LogoSnowflake() {
  return (
    <svg viewBox="0 0 48 48" className="adminShellLogoIcon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M24 4v40M14 10l20 28M34 10 14 38M7 24h34M10 14l28 20M38 14 10 34" />
      <circle cx="24" cy="24" r="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

const sidebarSections = [
  {
    title: null,
    items: [
      { key: 'calendar', label: 'Kalendarz', icon: IconCalendarShell, target: 'calendar' },
      { key: 'orders', label: 'Zlecenia', icon: IconClipboard, target: 'jobs' },
    ],
  },
  {
    title: 'ZARZĄDZANIE',
    items: [
      { key: 'devices', label: 'Urządzenia', icon: IconDevice, target: 'devices' },
      { key: 'fuel', label: 'Tankowania', icon: IconFuel, target: 'fuel' },
      { key: 'contractors', label: 'Kontrahenci', icon: IconUsersShell, target: 'contractors' },
    ],
  },
  {
    title: 'KOMUNIKACJA',
    items: [
      { key: 'sms', label: 'SMS', icon: IconMessage, target: 'sms' },
    ],
  },
  {
    title: 'USTAWIENIA',
    items: [
      { key: 'sms_templates', label: 'Szablony SMS', icon: IconFile, target: 'sms', passive: true },
      { key: 'settings', label: 'Ustawienia', icon: IconGear, target: 'sms', passive: true },
      { key: 'users', label: 'Użytkownicy', icon: IconUsersShell, target: 'jobs', passive: true },
    ],
  },
];

function getSidebarActiveState(item, activeModule, activeNavKey) {
  if (activeNavKey && item.key === activeNavKey) return true;
  if (item.key === 'sms') return activeModule === 'sms' && !['sms_templates', 'settings'].includes(activeNavKey);
  if (item.key === 'devices') return activeModule === 'devices';
  if (item.key === 'fuel') return activeModule === 'fuel';
  if (item.key === 'contractors') return activeModule === 'contractors';
  if (item.key === 'calendar') return activeModule === 'calendar';
  if (item.key === 'orders') return activeModule === 'jobs' && !activeNavKey;
  return false;
}

export default function AdminDesktopShell({ activeModule, activeNavKey, setActiveModule, onNavigate, profile, onLogout, children }) {
  const displayName = profile?.full_name || profile?.email || 'Administrator';
  const initials = String(displayName).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'AD';

  return (
    <div className="adminDesktopShell">
      <aside className="adminDesktopSidebar">
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
          <div className="adminDesktopSidebarVersion" aria-label={`Aktualna wersja aplikacji ${APP_VERSION}`}>
            Wersja {APP_VERSION}
          </div>
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
        </div>
      </aside>

      <div className="adminDesktopMain">
        <main className="adminDesktopWorkspace">{children}</main>
      </div>
    </div>
  );
}
