import React, { useEffect, useRef, useState } from 'react';
import AppModal from '../modals/AppModal.jsx';
import { formatQrStickerCode, isOnline, normalizeQrStickerCode } from '../../../modules/qr-stickers.js';
import './QrStickerScanner.css';

const SCAN_INTERVAL_MS = 350;

// WAWIS 14.08: skaner naklejki QR — aparat na żywo, zdjęcie albo ręczne wpisanie numeru z naklejki.
// onCode(code) zwraca Promise; komunikat błędu z onCode zostaje w oknie, można spróbować ponownie.
export default function QrStickerScanner({ open, title = 'Naklejka QR', description = '', onCode, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(0);
  const busyRef = useRef(false);
  const fileRef = useRef(null);
  const openRef = useRef(open);
  openRef.current = open;
  const [cameraState, setCameraState] = useState('idle'); // idle | starting | live | unavailable
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function stopCamera() {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks?.().forEach((track) => { try { track.stop(); } catch { /* już zatrzymany */ } });
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function submit(rawValue, source) {
    const code = normalizeQrStickerCode(rawValue);
    if (!code) {
      setError(source === 'manual'
        ? 'Wpisz 8 znaków z naklejki, np. K7M2-P9XA.'
        : 'To nie jest naklejka WAWIS. Zeskanuj naklejkę z napisem „WAWIS Klimatyzacja”.');
      return false;
    }
    if (!isOnline()) {
      setError('Brak internetu. Naklejkę przypiszesz po odzyskaniu połączenia.');
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    setStatus(`Odczytano ${formatQrStickerCode(code)}…`);
    stopCamera();
    setCameraState('idle');
    try {
      await onCode?.(code);
      return true;
    } catch (err) {
      setStatus('');
      setError(String(err?.message || err || 'Nie udało się zapisać naklejki.'));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function scanLoop(detect) {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    if (!busyRef.current && video.readyState >= 2 && video.videoWidth) {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const values = await detect(canvas);
        canvas.width = 1; canvas.height = 1;
        const value = values.find((item) => normalizeQrStickerCode(item)) || values[0];
        if (value) {
          const done = await submit(value, 'camera');
          if (done || !streamRef.current) return;
        }
      } catch { /* kolejna klatka */ }
    }
    if (streamRef.current) timerRef.current = window.setTimeout(() => scanLoop(detect), SCAN_INTERVAL_MS);
  }

  async function startCamera() {
    setError('');
    setStatus('');
    if (!isOnline()) {
      setCameraState('unavailable');
      setError('Brak internetu. Przypisanie naklejki wymaga połączenia.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable');
      return;
    }
    setCameraState('starting');
    try {
      const reader = await import('../../../modules/desktop-nameplate-barcode.js');
      // Czytnik przed aparatem: gdy się nie załaduje, nie trzymamy włączonego aparatu bez odczytu.
      await reader.getQrDetector();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      const { detectQrCodeValues } = reader;
      if (!openRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stopCamera(); return; }
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      await video.play().catch(() => {});
      setCameraState('live');
      scanLoop(detectQrCodeValues);
    } catch (err) {
      stopCamera();
      setCameraState('unavailable');
      if (!openRef.current) return;
      const denied = /NotAllowed|Permission/i.test(String(err?.name || err?.message || ''));
      setError(denied
        ? 'Brak dostępu do aparatu. Zrób zdjęcie naklejki albo wpisz numer spod kodu.'
        : `${String(err?.message || 'Aparat niedostępny.')} Możesz zrobić zdjęcie naklejki albo wpisać numer spod kodu.`);
    }
  }

  async function handlePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setStatus('Odczytuję kod ze zdjęcia…');
    try {
      const { detectQrCodeValues } = await import('../../../modules/desktop-nameplate-barcode.js');
      const values = await detectQrCodeValues(file);
      const value = values.find((item) => normalizeQrStickerCode(item)) || values[0];
      if (!value) {
        setStatus('');
        setError('Nie znaleziono kodu QR na zdjęciu. Zrób zdjęcie bliżej albo wpisz numer spod kodu.');
        return;
      }
      await submit(value, 'photo');
    } catch (err) {
      setStatus('');
      setError(String(err?.message || 'Nie udało się odczytać zdjęcia.'));
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    setManual('');
    setError('');
    setStatus('');
    setBusy(false);
    busyRef.current = false;
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => { stopCamera(); onClose?.(); };
  return (
    <AppModal open={open} onClose={close} overlayClassName="qrScannerOverlay" contentClassName="qrScannerModal" lockPagePosition>
      <div className="qrScannerHead">
        <h3>{title}</h3>
        <button type="button" className="qrScannerLink" onClick={close} aria-label="Zamknij skaner">Zamknij</button>
      </div>
      {description ? <p className="qrScannerHint">{description}</p> : null}
      <div className={`qrScannerViewport ${cameraState}`}>
        <video ref={videoRef} playsInline muted aria-label="Podgląd aparatu" />
        {cameraState === 'live' ? (
          <div className="qrScannerFrame" aria-hidden="true"><i /><i /><i /><i /></div>
        ) : (
          <span className="qrScannerOverlayText">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><rect x="8" y="8" width="8" height="8" rx="1" /></svg>
            {cameraState === 'starting' ? 'Uruchamiam aparat…' : cameraState === 'unavailable' ? 'Aparat niedostępny' : 'Aparat wyłączony'}
          </span>
        )}
      </div>
      {cameraState === 'live' && !busy ? <p className="qrScannerHint center">Skieruj aparat na naklejkę — kod odczyta się sam.</p> : null}
      {status ? <div className="qrScannerStatus" role="status">{status}</div> : null}
      {error ? <div className="qrScannerError" role="alert">{error}</div> : null}
      <div className="qrScannerActions">
        {cameraState !== 'live' ? (
          <button type="button" className="qrScanBtn" onClick={startCamera} disabled={busy}>Włącz aparat</button>
        ) : null}
        <button type="button" className="qrScanBtn" onClick={() => fileRef.current?.click()} disabled={busy}>Zrób zdjęcie</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={handlePhoto} />
      </div>
      <form
        className="qrScannerManual"
        onSubmit={(event) => { event.preventDefault(); submit(manual, 'manual'); }}
      >
        <label htmlFor="qr-sticker-manual">Albo wpisz numer spod kodu</label>
        <div className="qrScannerManualRow">
          <input
            id="qr-sticker-manual"
            className="qrScanInput"
            value={manual}
            onChange={(event) => setManual(event.target.value.toUpperCase())}
            placeholder="np. K7M2-P9XA"
            autoComplete="off"
            autoCapitalize="characters"
            inputMode="text"
            maxLength={12}
            disabled={busy}
          />
          <button type="submit" className="qrScanBtn primary" disabled={busy || !manual.trim()}>{busy ? 'Zapisuję…' : 'Zatwierdź'}</button>
        </div>
      </form>
    </AppModal>
  );
}
