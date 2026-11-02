import React, { useEffect, useState } from 'react';
import AppModal from '../modals/AppModal.jsx';
import { formatQrStickerCode, isOnline, lookupQrSticker } from '../../../modules/qr-stickers.js';
import './QrStickerScanner.css';

// WAWIS 14.08: co jest pod zeskanowaną naklejką (aparat iPhone'a → /u/KOD albo skaner w aplikacji).
export default function QrStickerResolver({ code, supabase, isAdmin, onOpenJob, onOpenDevices, onClose }) {
  const [state, setState] = useState({ loading: true, result: null, error: '' });
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    if (!code) return undefined;
    let active = true;
    setOpenError('');
    setState({ loading: true, result: null, error: '' });
    if (!isOnline()) {
      setState({ loading: false, result: null, error: 'Brak internetu. Zeskanuj naklejkę ponownie po odzyskaniu połączenia.' });
      return undefined;
    }
    lookupQrSticker({ supabase, code })
      .then((result) => { if (active) setState({ loading: false, result, error: '' }); })
      .catch((error) => { if (active) setState({ loading: false, result: null, error: error?.message || 'Nie udało się sprawdzić naklejki.' }); });
    return () => { active = false; };
  }, [code, supabase]);

  const result = state.result || {};
  const device = result.device || {};
  const label = formatQrStickerCode(result.code || code);

  function openJob() {
    const opened = onOpenJob?.(device.job_id);
    if (opened === false) setOpenError('Nie znaleziono tego montażu na liście. Odśwież dane i spróbuj ponownie.');
    else onClose?.();
  }

  return (
    <AppModal open={Boolean(code)} onClose={onClose} overlayClassName="qrScannerOverlay" contentClassName="qrScannerModal">
      <div className="qrResolverCard" data-testid="qr-sticker-resolver">
        <div className="qrScannerHead">
          <h3>Naklejka {label || 'QR'}</h3>
          <button type="button" className="qrScannerLink" onClick={onClose}>Zamknij</button>
        </div>
        {state.loading ? <p className="qrScannerHint">Sprawdzam naklejkę…</p> : null}
        {state.error ? <div className="qrScannerError" role="alert">{state.error}</div> : null}
        {!state.loading && !state.error && (result.status === 'unknown' || result.status === 'invalid') ? (
          <div className="qrScannerError" role="alert">To nie jest naklejka WAWIS albo numer jest nieprawidłowy.</div>
        ) : null}
        {!state.loading && result.status === 'free' ? (
          <>
            <p className="qrScannerHint">Ta naklejka nie jest jeszcze przypisana do żadnego urządzenia.</p>
            <p className="qrScannerHint">
              Aby ją przypisać, otwórz montaż → rozwiń urządzenie → „Przypisz naklejkę QR”
              {isAdmin ? ' albo w Urządzeniach wybierz klienta i urządzenie.' : '.'}
            </p>
          </>
        ) : null}
        {!state.loading && result.status === 'assigned' ? (
          <>
            <dl>
              <dt>Klient</dt><dd>{device.client || device.contractor_name || '—'}</dd>
              <dt>Adres</dt><dd>{[device.street, device.city].filter(Boolean).join(', ') || '—'}</dd>
              <dt>Urządzenie</dt><dd>{device.device_index ? `Urządzenie ${device.device_index}` : 'Urządzenie klienta'}{device.model ? ` · ${device.model}` : ''}</dd>
              {device.serial_number ? <><dt>Nr seryjny</dt><dd>{device.serial_number}</dd></> : null}
              {device.installation_date ? <><dt>Montaż</dt><dd>{String(device.installation_date).split('-').reverse().join('.')}</dd></> : null}
            </dl>
            {openError ? <div className="qrScannerError" role="alert">{openError}</div> : null}
            <div className="qrResolverActions">
              {device.job_id ? <button type="button" className="qrScanBtn primary" onClick={openJob}>Otwórz montaż</button> : null}
              {isAdmin && device.contractor_id && onOpenDevices ? (
                <button type="button" className={device.job_id ? 'qrScanBtn' : 'qrScanBtn primary'} onClick={() => { onOpenDevices(device); onClose?.(); }}>
                  Urządzenia i przeglądy klienta
                </button>
              ) : null}
              {!device.job_id && !(isAdmin && device.contractor_id) ? (
                <p className="qrScannerHint">Urządzenie nie ma powiązanego montażu. Szczegóły zobaczy administrator w Urządzeniach.</p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </AppModal>
  );
}
