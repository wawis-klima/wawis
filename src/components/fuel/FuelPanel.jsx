import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FuelPanelBase from './FuelPanelBase.jsx';
import './FuelPanelV1032.css';

const HISTORY_PAGE_SIZE = 10;
const PL_MONTHS = {
  sty: '01',
  lut: '02',
  mar: '03',
  kwi: '04',
  maj: '05',
  cze: '06',
  lip: '07',
  sie: '08',
  wrz: '09',
  'paź': '10',
  paz: '10',
  lis: '11',
  gru: '12',
};

function compactHistoryDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})\s+([^\s,]+)\s+(\d{4})/i);
  if (!match) return text.replace(/,.*$/, '').trim();
  const day = String(match[1]).padStart(2, '0');
  const monthKey = match[2].toLocaleLowerCase('pl-PL').replace(/\.$/, '');
  const month = PL_MONTHS[monthKey];
  if (!month) return text.replace(/,.*$/, '').trim();
  return `${day}.${month}.${match[3].slice(-2)}`;
}

function creatorInitials(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] || '') : '';
  return `${first}${last}`.toLocaleUpperCase('pl-PL');
}

function compactCreatorMeta(shell) {
  shell.querySelectorAll('.fuelHistoryVehicle').forEach((vehicle) => {
    const meta = vehicle.querySelector(':scope > span');
    if (!meta || meta.querySelector('.fuelHistoryDate')) return;

    const original = String(meta.textContent || '').trim();
    const marker = ' · dodał: ';
    const markerIndex = original.indexOf(marker);
    const rawDate = markerIndex >= 0 ? original.slice(0, markerIndex) : original;
    const creator = markerIndex >= 0 ? original.slice(markerIndex + marker.length).trim() : '';

    meta.textContent = '';
    meta.classList.add('fuelHistoryMeta');

    const date = document.createElement('span');
    date.className = 'fuelHistoryDate';
    date.textContent = compactHistoryDate(rawDate);
    meta.appendChild(date);

    if (creator) {
      const badge = document.createElement('span');
      badge.className = 'fuelCreatorBadge';
      badge.textContent = creatorInitials(creator);
      badge.title = `Dodał: ${creator}`;
      badge.setAttribute('aria-label', `Dodał: ${creator}`);
      meta.appendChild(badge);
    }
  });
}

export default function FuelPanel(props) {
  const {
    isAdmin,
    showVehicleOverview = false,
  } = props;
  const shellRef = useRef(null);
  const previousRowCountRef = useRef(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [paginationTarget, setPaginationTarget] = useState(null);

  const compactMobileAdmin = Boolean(isAdmin && !showVehicleOverview);

  const applyMobileHistory = useCallback(() => {
    const shell = shellRef.current;
    if (!shell || !compactMobileAdmin) return;

    const fuelModule = shell.querySelector('.fuelModule');
    const header = shell.querySelector('.fuelModuleHeader');
    const history = shell.querySelector('.fuelHistory');
    const historyHeading = history?.querySelector('.fuelCardHeading');
    const historyList = history?.querySelector('.fuelHistoryList');

    fuelModule?.classList.add('fuelModuleCompactMobile');
    header?.classList.add('fuelModuleHeaderMobile');
    historyHeading?.classList.add('fuelHistoryHeading');
    const title = header?.querySelector('h2');
    if (title) title.textContent = 'Paliwo';

    compactCreatorMeta(shell);

    const rows = historyList ? Array.from(historyList.querySelectorAll(':scope > .fuelHistoryRow')) : [];
    const totalPages = Math.max(1, Math.ceil(rows.length / HISTORY_PAGE_SIZE));

    if (rows.length > previousRowCountRef.current && previousRowCountRef.current > 0 && historyPage !== 1) {
      previousRowCountRef.current = rows.length;
      setHistoryPage(1);
      return;
    }
    previousRowCountRef.current = rows.length;

    const safePage = Math.min(historyPage, totalPages);
    if (safePage !== historyPage) {
      setHistoryPage(safePage);
      return;
    }

    const start = (safePage - 1) * HISTORY_PAGE_SIZE;
    const end = start + HISTORY_PAGE_SIZE;
    rows.forEach((row, index) => {
      row.style.display = index >= start && index < end ? '' : 'none';
    });

    setHistoryTotalPages((current) => current === totalPages ? current : totalPages);
    setPaginationTarget((current) => current === history ? current : history || null);
  }, [compactMobileAdmin, historyPage]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !compactMobileAdmin) return undefined;

    let frameId = window.requestAnimationFrame(applyMobileHistory);
    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(applyMobileHistory);
    });
    observer.observe(shell, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
      shell.querySelectorAll('.fuelHistoryRow').forEach((row) => {
        row.style.display = '';
      });
    };
  }, [applyMobileHistory, compactMobileAdmin]);

  return (
    <div ref={shellRef} className={showVehicleOverview ? 'fuelV1032DesktopShell' : 'fuelV1032Shell'}>
      <FuelPanelBase {...props} />
      {compactMobileAdmin && paginationTarget && historyTotalPages > 1
        ? createPortal(
          <nav className="fuelHistoryPagination" aria-label="Strony historii tankowań">
            <button
              type="button"
              className="fuelHistoryPageArrow"
              onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
              disabled={historyPage === 1}
              aria-label="Poprzednia strona"
            >
              ‹
            </button>
            <div className="fuelHistoryPageNumbers">
              {Array.from({ length: historyTotalPages }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={`fuelHistoryPageButton ${historyPage === pageNumber ? 'isActive' : ''}`}
                  aria-current={historyPage === pageNumber ? 'page' : undefined}
                  onClick={() => setHistoryPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="fuelHistoryPageArrow"
              onClick={() => setHistoryPage((current) => Math.min(historyTotalPages, current + 1))}
              disabled={historyPage === historyTotalPages}
              aria-label="Następna strona"
            >
              ›
            </button>
          </nav>,
          paginationTarget,
        )
        : null}
    </div>
  );
}
