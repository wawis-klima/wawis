import React, { useEffect, useRef, useState } from 'react';
import { APP_VERSION } from '../../version.js';
import { IconFileText } from '../ui.jsx';
import { downloadDiagnosticReportImmediate, logDiagnostic } from '../../modules/diagnostics.js';
import { sendTestPush } from '../../modules/push-subscriptions.js';
import { supabase } from '../../lib/supabase.js';
import { getPhotoQueueSummary, PHOTO_QUEUE_CHANGED_EVENT } from '../../modules/photo-offline-queue.js';

const EMPTY_QUEUE = { total: 0, local: 0, uploading: 0, error: 0 };

export default function MobileDiagnosticButton({ profile = null, selectedJobId = '', sessionUser = null }) {
  const [queueSummary, setQueueSummary] = useState(EMPTY_QUEUE);
  const [pushBusy, setPushBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const summary = await getPhotoQueueSummary();
      if (mounted) setQueueSummary(summary || EMPTY_QUEUE);
    };
    refresh();
    window.addEventListener(PHOTO_QUEUE_CHANGED_EVENT, refresh);
    return () => {
      mounted = false;
      window.removeEventListener(PHOTO_QUEUE_CHANGED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleOutside = (event) => {
      if (!menuRef.current?.contains?.(event.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [menuOpen]);

  async function handleTestPush() {
    if (!sessionUser || profile?.role !== 'Administrator') return;
    setPushBusy(true);
    try {
      const result = await sendTestPush({ supabase, sessionUser, targetCurrentDevice: true });
      const delivered = Number(result?.delivered || 0);
      if (delivered > 0) {
        window.alert('Test push został wysłany na ten telefon. Powiadomienie powinno pojawić się systemowo na iPhonie.');
      } else {
        window.alert(`Test push nie został dostarczony. ${result?.reason || 'Sprawdź status push i spróbuj ponownie.'}`);
      }
    } catch (error) {
      logDiagnostic('diagnostic.mobile.push-test.failed', { error });
      window.alert(`Nie udało się wysłać testowego push: ${error?.message || 'nieznany błąd'}`);
    } finally {
      setPushBusy(false);
    }
  }

  function handleDownload() {
    try {
      downloadDiagnosticReportImmediate({
        appVersion: APP_VERSION,
        role: profile?.role || 'Pracownik',
        currentJobId: selectedJobId || '',
        queueSummary,
        extra: { module: 'mobile-jobs' },
      });
      window.alert('Raport diagnostyczny został pobrany.');
    } catch (error) {
      logDiagnostic('diagnostic.mobile.download.failed', { error });
      window.alert(`Nie udało się pobrać raportu: ${error?.message || 'nieznany błąd'}`);
    }
  }

  if (profile?.role !== 'Administrator') {
    return (
      <button
        type="button"
        className="mobileActionBtn mobileDiagnosticBtn"
        onClick={handleDownload}
        title="Pobierz raport diagnostyczny"
        aria-label="Pobierz raport diagnostyczny"
      >
        <IconFileText />
      </button>
    );
  }

  return (
    <div className="mobileDiagnosticWrap" ref={menuRef}>
      <button
        type="button"
        className="mobileActionBtn mobileDiagnosticBtn"
        onClick={() => setMenuOpen((value) => !value)}
        title="Diagnostyka"
        aria-label="Otwórz diagnostykę"
        aria-expanded={menuOpen}
      >
        <span className="mobileDiagnosticLetter" aria-hidden="true">D</span>
      </button>
      {menuOpen ? (
        <div className="mobileDiagnosticMenu" role="menu" aria-label="Diagnostyka administratora">
          <div className="mobileDiagnosticMenuHeader">
            <strong>Diagnostyka</strong>
            <span>v{APP_VERSION}</span>
          </div>
          <button type="button" onClick={handleTestPush} disabled={pushBusy}>
            {pushBusy ? 'Wysyłanie testu…' : 'Wyślij test push na ten telefon'}
          </button>
          <button type="button" onClick={handleDownload}>
            Pobierz raport diagnostyczny
          </button>
        </div>
      ) : null}
    </div>
  );
}
