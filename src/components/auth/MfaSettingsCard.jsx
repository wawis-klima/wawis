import React, { useCallback, useEffect, useState } from 'react';
import CollapsibleCard from '../common/CollapsibleCard.jsx';
import {
  confirmTotpEnrollment, disableTotp, getMfaErrorMessage, isCompleteMfaCode, listTotpFactors, normalizeMfaCode,
  startTotpEnrollment,
} from '../../modules/mfa.js';

// WAWIS 14.72 — Diagnostyka (administrator): włączenie / wyłączenie kodu z telefonu przy logowaniu.
export default function MfaSettingsCard({ supabase, variant = 'desktop' }) {
  const [state, setState] = useState({ loading: true, verified: [] });
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const reload = useCallback(async () => {
    try {
      const { verified } = await listTotpFactors(supabase);
      setState({ loading: false, verified });
    } catch (err) {
      setState({ loading: false, verified: [] });
      setError(getMfaErrorMessage(err));
    }
  }, [supabase]);
  useEffect(() => { void reload(); }, [reload]);

  const run = async (task) => {
    setBusy(true); setError(''); setInfo('');
    try { await task(); } catch (err) { setError(getMfaErrorMessage(err)); } finally { setBusy(false); }
  };
  const start = () => run(async () => { setCode(''); setEnrollment(await startTotpEnrollment(supabase)); });
  const confirm = (event) => {
    event.preventDefault();
    if (!enrollment || !isCompleteMfaCode(code)) return;
    void run(async () => {
      await confirmTotpEnrollment(supabase, enrollment.factorId, code);
      setEnrollment(null); setCode('');
      setInfo('Kod z telefonu jest włączony. Przy następnym logowaniu aplikacja poprosi o 6 cyfr.');
      await reload();
    });
  };
  const disable = (factorId) => run(async () => {
    if (typeof window !== 'undefined' && !window.confirm('Wyłączyć kod z telefonu? Logowanie będzie wymagało tylko hasła.')) return;
    await disableTotp(supabase, factorId);
    setInfo('Kod z telefonu został wyłączony.');
    await reload();
  });

  const enabled = state.verified.length > 0;
  return (
    <CollapsibleCard variant={variant} testId="mfa-settings-card" title="Kod z telefonu przy logowaniu"
      status={state.loading ? '' : enabled ? 'Włączony' : 'Wyłączony'} statusTone={state.loading ? '' : enabled ? 'ok' : 'warn'} statusTestId="mfa-settings-status">
      {error ? <p className="errorBox" role="alert" data-testid="mfa-settings-error">{error}</p> : null}
      {info ? <p className="muted" data-testid="mfa-settings-info">{info}</p> : null}
      {!state.loading && !enabled && !enrollment ? (
        <button type="button" className="btn" onClick={() => void start()} disabled={busy}>Włącz kod z telefonu</button>
      ) : null}
      {enrollment ? (
        <form onSubmit={confirm} data-testid="mfa-enrollment">
          <p><strong>1.</strong> Zeskanuj kod QR aplikacją z kodami{enrollment.uri ? ' albo na tym iPhonie dotknij „Dodaj do Haseł”' : ''}.</p>
          {enrollment.qrCode ? <img src={enrollment.qrCode} alt="Kod QR do aplikacji z kodami" width="180" height="180" data-testid="mfa-qr" /> : null}
          {enrollment.uri ? <p><a href={enrollment.uri} data-testid="mfa-otpauth-link">Dodaj do Haseł</a></p> : null}
          {enrollment.secret ? <p className="muted">Albo wpisz ręcznie klucz: <code data-testid="mfa-secret">{enrollment.secret}</code></p> : null}
          <p><strong>2.</strong> Wpisz 6 cyfr, które pokazuje aplikacja:</p>
          <input className="input" name="mfa-enroll-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*"
            placeholder="123456" aria-label="Kod z aplikacji" value={code} onChange={(event) => setCode(normalizeMfaCode(event.target.value))} />
          <div className={variant === 'mobile' ? 'mobileDiagnosticsActions' : undefined}>
            <button type="submit" className="btn" disabled={busy || !isCompleteMfaCode(code)}>{busy ? 'Sprawdzam…' : 'Potwierdź i włącz'}</button>
            <button type="button" className="btn secondary" onClick={() => { setEnrollment(null); setCode(''); }} disabled={busy}>Anuluj</button>
          </div>
        </form>
      ) : null}
      {enabled ? (
        <div className={variant === 'mobile' ? 'mobileDiagnosticsActions' : undefined}>
          <button type="button" className="btn secondary" onClick={() => void disable(state.verified[0].id)} disabled={busy}>Wyłącz kod z telefonu</button>
        </div>
      ) : null}
    </CollapsibleCard>
  );
}
