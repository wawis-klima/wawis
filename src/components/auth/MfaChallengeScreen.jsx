import React, { useState } from 'react';
import { isCompleteMfaCode, normalizeMfaCode } from '../../modules/mfa.js';

// WAWIS 14.72 — krok kodu z telefonu po haśle (komputer i telefon).
export default function MfaChallengeScreen({ email = '', busy = false, error = '', onVerify, onLogout }) {
  const [code, setCode] = useState('');
  const submit = (event) => {
    event.preventDefault();
    if (!busy && isCompleteMfaCode(code)) onVerify?.(code);
  };
  return (
    <div className="page">
      <div className="auth">
        <div className="stack premiumStack">
          <div className="card authCard" data-testid="mfa-challenge">
            <div className="sectionPill">Kod z telefonu</div>
            <h2>Potwierdź logowanie</h2>
            <p className="muted">Otwórz aplikację z kodami na telefonie (np. „Hasła” w iPhonie) i wpisz 6 cyfr dla WAWIS{email ? ` (${email})` : ''}.</p>
            <form className="authForm" onSubmit={submit}>
              <input
                className="input"
                name="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                aria-label="Kod z telefonu"
                value={code}
                onChange={(event) => setCode(normalizeMfaCode(event.target.value))}
                autoFocus
              />
              {error ? <p className="errorBox" role="alert" data-testid="mfa-challenge-error">{error}</p> : null}
              <button className="btn authBtn" type="submit" disabled={busy || !isCompleteMfaCode(code)}>{busy ? 'Sprawdzam…' : 'Potwierdź'}</button>
            </form>
            <button className="btn secondary" type="button" onClick={() => onLogout?.()} disabled={busy}>Wyloguj</button>
          </div>
        </div>
      </div>
    </div>
  );
}
