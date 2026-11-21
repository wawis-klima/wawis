// WAWIS 14.74 — MFA etap 2 (baza wymaga aal2 od kont z włączonym kodem). Kontrola statyczna migracji i wycofania.
// Pełny test na PostgreSQL: sudo -u postgres bash scripts/pg-test-mfa-v1474/run.sh
import fs from 'node:fs';
import assert from 'node:assert/strict';

const mig = fs.readFileSync('supabase/migrations/20261121200000_mfa_aal2_required_v1474.sql', 'utf8');
const rollback = fs.readFileSync('docs/mfa-etap2-rollback-v1474.sql', 'utf8');
const manifest = JSON.parse(fs.readFileSync('supabase/rebuild/manifest-v1089.json', 'utf8'));

assert.match(mig, /create or replace function public\.current_user_mfa_ok\(\)[\s\S]*security definer[\s\S]*set search_path = ''/, 'funkcja MFA: security definer, pusta ścieżka');
assert.match(mig, /auth\.uid\(\) is null[\s\S]*auth\.jwt\(\) ->> 'aal', ''\) = 'aal2'[\s\S]*status = 'verified'/, 'warunek: brak użytkownika / aal2 / brak zweryfikowanego kodu');
for (const fn of ['current_user_is_admin', 'current_user_is_staff']) {
  const body = mig.slice(mig.indexOf(`function public.${fn}()`), mig.indexOf('$function$;', mig.indexOf(`function public.${fn}()`)));
  assert.match(body, /and public\.current_user_mfa_ok\(\);/, `${fn}: wymaga MFA`);
}
for (const fn of ['save_job_contractor_nip', 'worker_create_or_get_contractor_for_job']) {
  const start = mig.indexOf(`function public.${fn}(`);
  const body = mig.slice(start, mig.indexOf('$function$;', start));
  assert.match(body, /if not public\.current_user_mfa_ok\(\) then[\s\S]*?raise exception 'Potwierdź logowanie kodem z telefonu\.' using errcode = '42501'/, `${fn}: sprawdza MFA`);
}
assert.match(mig, /as restrictive for all to authenticated '\s*'using \(\(select public\.current_user_mfa_ok\(\)\)\) with check \(\(select public\.current_user_mfa_ok\(\)\)\)'/, 'reguła RESTRICTIVE na tabelach public');
assert.match(mig, /n\.nspname = 'public' and c\.relkind in \('r', 'p'\) and c\.relrowsecurity/, 'wszystkie tabele public z RLS');
assert.match(mig, /create policy mfa_aal2_required_v1474 on storage\.objects as restrictive for all to authenticated/, 'pliki (storage.objects)');
assert.match(mig, /drop policy if exists mfa_aal2_required_v1474/, 'migracja powtarzalna');
assert.doesNotMatch(mig, /\bdelete from\b|\bdrop table\b|\btruncate\b/i, 'bez usuwania danych');

// Wycofanie: przywraca helpery bez MFA, usuwa reguły i funkcję.
assert.match(rollback, /^begin;/m); assert.match(rollback, /^commit;/m);
assert.match(rollback, /drop policy if exists mfa_aal2_required_v1474 on storage\.objects/);
assert.match(rollback, /drop function if exists public\.current_user_mfa_ok\(\)/);
assert.equal((rollback.match(/current_user_mfa_ok/g) || []).length, 1, 'wycofanie nie odwołuje się do funkcji MFA poza jej usunięciem');
assert.equal((rollback.match(/create or replace function/g) || []).length, 4, 'przywraca 4 funkcje');

assert.ok(manifest.files.includes('supabase/migrations/20261121200000_mfa_aal2_required_v1474.sql'), 'migracja w manifeście');

// Aplikacja: krok kodu przed danymi — bez niego administrator z kodem zobaczyłby błędy uprawnień zamiast ekranu kodu.
for (const file of ['src/App.jsx', 'src/mobile791/App.jsx']) {
  const src = fs.readFileSync(file, 'utf8');
  assert.ok(src.indexOf('if (mfaGate.status === "required")') < src.indexOf('if (!profile)'), `${file}: krok kodu przed ładowaniem profilu`);
}
console.log('PASS WAWIS 14.74 — migracja MFA aal2: helpery, 2 funkcje, RESTRICTIVE na tabelach i plikach, powtarzalna; wycofanie kompletne.');
