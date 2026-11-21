// WAWIS 14.75 — MFA etap 3: funkcje serwerowe (Edge) z kluczem serwisowym sprawdzają kod z telefonu.
// Każda funkcja wywoływana przez administratora musi po getUser() zapytać bazę current_user_mfa_ok()
// klientem użytkownika (jego JWT, nie kluczem serwisowym) i odmówić (403), gdy wynik nie jest true.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const targets = [
  { slug: "purge-service-visit", client: "session" },
  { slug: "send-service-visit-protocol-email", client: "user" },
  { slug: "fakturownia-client", client: "userClient" },
  { slug: "send-service-sms", client: "userClient" },
  { slug: "generate-service-sms-queue", client: "userClient" },
];

let checks = 0;
for (const { slug, client } of targets) {
  const src = readFileSync(`supabase/functions/${slug}/index.ts`, "utf8");
  const getUser = src.indexOf(`${client}.auth.getUser()`);
  const mfa = src.indexOf(`${client}.rpc("current_user_mfa_ok")`);
  assert.ok(getUser > 0, `${slug}: brak getUser na kliencie użytkownika`);
  assert.ok(mfa > getUser, `${slug}: sprawdzenie MFA musi być po getUser`);
  assert.equal(src.split('rpc("current_user_mfa_ok")').length - 1, 1, `${slug}: dokładnie jedno sprawdzenie MFA`);
  const after = src.slice(mfa, mfa + 300);
  assert.match(after, /if\s*\(\s*mfaError\s*\|\|\s*mfaOk\s*!==\s*true\s*\)\s*return\s+(json|reply)\(\{\s*error:\s*"Potwierdź logowanie kodem z telefonu\."\s*\},\s*403\)/, `${slug}: odmowa 403 gdy brak potwierdzenia`);
  // Sprawdzenie MFA przed pierwszą operacją kluczem serwisowym na danych (odczyt profilu i dalej).
  const firstAdminUse = src.search(/(adminClient|admin)\s*\.from\("profiles"\)/);
  assert.ok(firstAdminUse > mfa, `${slug}: MFA przed odczytem profilu kluczem serwisowym`);
  // Nie wolno pytać kluczem serwisowym — tam auth.uid() jest pusty i wynik zawsze true.
  assert.doesNotMatch(src, /(adminClient|admin)\.rpc\("current_user_mfa_ok"\)/, `${slug}: MFA nie kluczem serwisowym`);
  checks += 5;
}

// Zadanie dzienne SMS (pg_cron) nie ma sesji użytkownika — sprawdzenie tylko w gałęzi użytkownika.
const queue = readFileSync("supabase/functions/generate-service-sms-queue/index.ts", "utf8");
const elseBranch = queue.indexOf("} else {", queue.indexOf("if (dailyRun.isDaily)"));
assert.ok(elseBranch > 0 && queue.indexOf('rpc("current_user_mfa_ok")') > elseBranch, "kolejka SMS: MFA tylko w gałęzi użytkownika");
checks += 1;

// Funkcja w bazie: użytkownik bez kodu z telefonu dostaje true (pracownicy bez zmian).
const migration = readFileSync("supabase/migrations/20261121200000_mfa_aal2_required_v1474.sql", "utf8");
assert.match(migration, /current_user_mfa_ok\(\)/);
assert.match(migration, /not exists \(\s*select 1 from auth\.mfa_factors/);
checks += 2;

console.log(`smoke-mfa-edge-v1475: OK (${checks} checks)`);
