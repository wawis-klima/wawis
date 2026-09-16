import assert from 'node:assert/strict';
import handler from '../api/read-nameplate-ai.js';

function makeRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function runCase({ user, profileRole, profileOk = true }) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-test';
  process.env.OPENAI_API_KEY = 'openai-test';

  globalThis.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.includes('/auth/v1/user')) {
      return new Response(JSON.stringify(user), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (value.includes('/rest/v1/profiles')) {
      return new Response(JSON.stringify(profileRole == null ? [] : [{ role: profileRole }]), {
        status: profileOk ? 200 : 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (value.includes('api.openai.com')) {
      return new Response(JSON.stringify({ output_text: JSON.stringify({
        manufacturer: '', model_code: '', model_family: '', power_kw: '', serial_number: '', ean: '',
        unit_type: 'unknown', raw_text: '', uncertain_characters: [], notes: '',
        confidence: { manufacturer: 0, model: 0, power: 0, serial_number: 0, ean: 0 },
      }) }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${value}`);
  };

  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer test-user-token' },
    body: { imageDataUrl: 'data:image/png;base64,AA==' },
  };
  const res = makeRes();
  try {
    await handler(req, res);
    return { res, calls };
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
}

const forgedUserMetadata = await runCase({
  user: { id: '11111111-1111-4111-8111-111111111111', user_metadata: { role: 'admin' }, app_metadata: {} },
  profileRole: 'Pracownik',
});
assert.equal(forgedUserMetadata.res.statusCode, 403);
assert.equal(forgedUserMetadata.calls.filter((url) => url.includes('/rest/v1/profiles')).length, 1);
assert.equal(forgedUserMetadata.calls.some((url) => url.includes('api.openai.com')), false);

const forgedAppMetadata = await runCase({
  user: { id: '22222222-2222-4222-8222-222222222222', user_metadata: {}, app_metadata: { role: 'admin' } },
  profileRole: 'Pracownik',
});
assert.equal(forgedAppMetadata.res.statusCode, 403);
assert.equal(forgedAppMetadata.calls.some((url) => url.includes('api.openai.com')), false);

const adminProfile = await runCase({
  user: { id: '33333333-3333-4333-8333-333333333333', user_metadata: { role: 'worker' }, app_metadata: {} },
  profileRole: 'Administrator',
});
assert.equal(adminProfile.res.statusCode, 200);
assert.equal(adminProfile.calls.some((url) => url.includes('api.openai.com')), true);

const missingProfile = await runCase({
  user: { id: '44444444-4444-4444-8444-444444444444', user_metadata: { role: 'admin' }, app_metadata: {} },
  profileRole: null,
});
assert.equal(missingProfile.res.statusCode, 403);

console.log('GO: 10.85 AI authorization ignores editable metadata and trusts only profiles.role.');
