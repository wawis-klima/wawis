import React, { useCallback, useEffect, useState } from 'react';
import QrStickerScanner from './QrStickerScanner.jsx';
import {
  assignQrStickerToDevice, assignQrStickerToJobDevice, describeQrAssignFailure, describeQrDevice,
  formatQrStickerCode, isOnline, loadJobQrStickers, QR_STICKERS_CHANGED_EVENT, unassignQrSticker,
} from '../../../modules/qr-stickers.js';

// WAWIS 14.08: naklejka QR przy urządzeniu montażu.
// 14.24 (decyzja właściciela 06.11.2026): wymagana do zakończenia montażu przez pracownika (jak tabliczki).

export function useJobQrStickers({ supabase, jobId, enabled = true, refreshKey = '' }) {
  const [stickers, setStickers] = useState({});
  const [available, setAvailable] = useState(true);
  // 14.24: dla którego montażu naklejki zostały faktycznie wczytane — puste {} przed odczytem to nie „brak naklejek”.
  const [loadedJobId, setLoadedJobId] = useState('');
  const reload = useCallback(async () => {
    if (!supabase || !jobId || !enabled || !isOnline()) return;
    try {
      setStickers(await loadJobQrStickers({ supabase, jobId }));
      setAvailable(true);
      setLoadedJobId(String(jobId));
    } catch {
      // Brak funkcji w bazie (przed migracją) albo chwilowy błąd sieci — sekcja ukryta, montaż działa normalnie.
      setAvailable(false);
    }
  }, [supabase, jobId, enabled]);
  useEffect(() => {
    setStickers({});
    setLoadedJobId('');
    setAvailable(true);
  }, [jobId]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onOnline = () => { reload(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [reload]);
  // 14.09: odświeżenie także po zapisie urządzeń (naklejki z kreatora) — bez czyszczenia widoku.
  useEffect(() => {
    reload();
  }, [reload, refreshKey]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = (event) => {
      if (!event?.detail?.jobId || String(event.detail.jobId) === String(jobId)) reload();
    };
    window.addEventListener(QR_STICKERS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(QR_STICKERS_CHANGED_EVENT, handler);
  }, [reload, jobId]);
  return { stickers, available, reload, setStickers, loadedJobId };
}

export function JobDeviceQrStickerRow({ code, canAssign, isAdmin, busy, onAssign, onUnassign, message }) {
  const label = formatQrStickerCode(code);
  return (
    <div className={`qrStickerRow${label ? ' assigned' : ''}`} data-testid="job-device-qr-sticker">
      <div className="qrStickerLabel">
        <strong>{label ? `Naklejka QR: ${label}` : 'Naklejka QR: brak'}</strong>
        {!label ? <small>opcjonalnie</small> : null}
      </div>
      {!label && canAssign ? (
        <button type="button" className="btn qrStickerBtn" disabled={busy} onClick={onAssign}>Przypisz naklejkę QR</button>
      ) : null}
      {label && isAdmin ? (
        <span className="qrStickerAdminActions">
          <button type="button" className="btn qrStickerBtn" disabled={busy} onClick={onAssign}>Wymień</button>
          <button type="button" className="btn qrStickerBtn" disabled={busy} onClick={onUnassign}>Zwolnij</button>
        </span>
      ) : null}
      {message ? <div className={`qrStickerMessage ${message.ok ? 'ok' : 'err'}`} role="status">{message.text}</div> : null}
    </div>
  );
}

/** Okno skanera dla urządzenia montażu: przypisanie, a dla administratora także wymiana i przepisanie. */
export function JobDeviceQrScanner({ supabase, jobId, target, isAdmin, onClose, onAssigned }) {
  const deviceIndex = target?.deviceIndex || 0;
  const currentCode = target?.currentCode || '';
  async function handleCode(code) {
    let result = await assignQrStickerToJobDevice({ supabase, code, jobId, deviceIndex });
    if (!result?.ok && isAdmin && result?.can_replace && result?.target_device_id) {
      const question = result.reason === 'device_has_sticker'
        ? `Urządzenie ${deviceIndex} ma naklejkę ${formatQrStickerCode(result.existing_code)}.\n\nZastąpić ją naklejką ${formatQrStickerCode(code)}? Stara naklejka zostanie zwolniona.`
        : `Naklejka ${formatQrStickerCode(code)} jest przypisana do: ${describeQrDevice(result.device || {})}.\n\nPrzepisać ją do Urządzenia ${deviceIndex}?`;
      if (!window.confirm(question)) throw new Error('Anulowano — nic nie zmieniono.');
      result = await assignQrStickerToDevice({ supabase, code, deviceId: result.target_device_id, replace: true });
    }
    if (!result?.ok) throw new Error(describeQrAssignFailure(result));
    onAssigned?.(deviceIndex, result.code || code, Boolean(result.already));
  }
  return (
    <QrStickerScanner
      open={Boolean(target)}
      title={`${currentCode ? 'Wymiana naklejki' : 'Naklejka QR'} — Urządzenie ${deviceIndex}`}
      description={currentCode
        ? `Obecna naklejka: ${formatQrStickerCode(currentCode)}. Zeskanuj nową naklejkę.`
        : 'Przyklej naklejkę na urządzeniu i zeskanuj kod. Instalacja multi ma jedną naklejkę.'}
      onCode={handleCode}
      onClose={onClose}
    />
  );
}

export async function unassignJobDeviceQrSticker({ supabase, code }) {
  const result = await unassignQrSticker({ supabase, code });
  if (!result?.ok) throw new Error(describeQrAssignFailure(result));
  return result;
}
