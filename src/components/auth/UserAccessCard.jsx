import React, { useCallback, useEffect, useState } from 'react';
import { formatLoginTime, listUserLogins, setUserBlocked } from '../../modules/user-access.js';
import CollapsibleCard from '../common/CollapsibleCard.jsx';

// WAWIS 14.76 — Diagnostyka (administrator): aktywne logowania kont, „Wyloguj i zablokuj”, „Odblokuj”.
// O każdym nowym logowaniu administrator dostaje PUSH (zadanie bazy + funkcja notify-new-login).
export default function UserAccessCard({ supabase, variant = 'desktop' }) {
  const [users, setUsers] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const reload = useCallback(async () => {
    try {
      setUsers(await listUserLogins(supabase));
    } catch (err) {
      setUsers([]);
      setError(err?.message || 'Nie udało się odczytać logowań.');
    }
  }, [supabase]);
  useEffect(() => { void reload(); }, [reload]);

  const change = async (user, blocked) => {
    const question = blocked
      ? `Wylogować i zablokować konto „${user.fullName}”? Wszystkie jego urządzenia stracą dostęp od razu. Konto i historia zostają — możesz je później odblokować.`
      : `Odblokować konto „${user.fullName}”? Będzie mógł zalogować się ponownie swoim hasłem.`;
    if (typeof window !== 'undefined' && !window.confirm(question)) return;
    setBusyId(user.userId); setError(''); setInfo('');
    try {
      const result = await setUserBlocked(supabase, user.userId, blocked);
      setInfo(blocked
        ? `Konto „${user.fullName}” jest zablokowane. Zakończone logowania: ${result.sessionsEnded}.`
        : `Konto „${user.fullName}” jest odblokowane.`);
      await reload();
    } catch (err) {
      setError(err?.message || 'Nie udało się zmienić blokady.');
      await reload();
    } finally {
      setBusyId('');
    }
  };

  const blockedCount = (users || []).filter((user) => user.blocked).length;
  const loggedIn = (users || []).filter((user) => user.sessions.length > 0).length;
  const status = users === null ? '' : blockedCount ? `Zablokowane: ${blockedCount}` : `Zalogowani: ${loggedIn}`;
  return (
    <CollapsibleCard variant={variant} testId="user-access-card" title="Logowania i blokada kont"
      status={status} statusTone={blockedCount ? 'warn' : ''}>
      {error ? <p className="errorBox" role="alert" data-testid="user-access-error">{error}</p> : null}
      {info ? <p className="muted" data-testid="user-access-info">{info}</p> : null}
      {users === null ? <p className="muted">Wczytywanie…</p> : null}
      {users && users.length === 0 && !error ? <p className="muted">Brak kont.</p> : null}
      {(users || []).map((user) => (
        <div key={user.userId} className="userAccessRow" data-testid="user-access-row" data-user-id={user.userId}>
          <p>
            <strong>{user.fullName}</strong> <span className="muted">{user.role}</span>{' '}
            {user.blocked ? <span className="badge dangerGhostBtn" data-testid="user-access-blocked">Zablokowane</span> : null}
          </p>
          {user.sessions.length ? (
            <ul className="muted">
              {user.sessions.map((session, index) => (
                <li key={`${user.userId}-${index}`}>
                  {session.device} — zalogowano {formatLoginTime(session.createdAt)}, ostatnio aktywne {formatLoginTime(session.lastActiveAt)}
                  {session.current ? ' (to urządzenie)' : ''}
                </li>
              ))}
            </ul>
          ) : <p className="muted">{user.blocked ? 'Brak aktywnych logowań.' : 'Nie jest teraz nigdzie zalogowany.'}</p>}
          {user.isSelf ? null : (
            <div className={variant === 'mobile' ? 'mobileDiagnosticsActions' : undefined}>
              {user.blocked ? (
                <button type="button" className="btn secondary" onClick={() => void change(user, false)} disabled={!!busyId}>
                  {busyId === user.userId ? 'Zapisuję…' : 'Odblokuj'}
                </button>
              ) : (
                <button type="button" className="btn dangerGhostBtn" onClick={() => void change(user, true)} disabled={!!busyId}>
                  {busyId === user.userId ? 'Blokuję…' : 'Wyloguj i zablokuj'}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      <div className={variant === 'mobile' ? 'mobileDiagnosticsActions' : 'diagnosticsActions'}>
        <button type="button" className="btn secondary" onClick={() => { setError(''); setInfo(''); void reload(); }} disabled={!!busyId}>Odśwież</button>
      </div>
    </CollapsibleCard>
  );
}
