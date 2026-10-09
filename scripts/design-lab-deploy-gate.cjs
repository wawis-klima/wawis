'use strict';
const assert = require('node:assert/strict');
function verify(env) {
  assert.equal(env.VITE_WAWIS_DESIGN_LAB, '1', 'LAB: brak jednoznacznego trybu DESIGN LAB');
  assert.equal(env.VITE_SUPABASE_MODE, 'mock', 'LAB: dane muszą pochodzić wyłącznie z mocka');
  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SMSAPI_TOKEN', 'OPENAI_API_KEY', 'FACTUROWNIA_API_TOKEN']) {
    assert(!env[key], 'LAB: niedozwolony sekret albo produkcyjny backend (' + key + ')');
  }
  if (env.VERCEL === '1') {
    assert.equal(env.VERCEL_PROJECT_ID, 'prj_5w36Qi6GFNoXlH1S07gNp4r9AWQR', 'LAB: niedozwolony cel wdrożenia Vercel');
    assert.equal(env.VERCEL_ENV, 'production', 'LAB: wdrożenie tylko w odrębnym projekcie');
    if (env.VERCEL_GIT_COMMIT_REF) {
      assert.equal(env.VERCEL_GIT_COMMIT_REF, 'design-lab/v12.76', 'LAB: niedozwolona gałąź');
    }
  }
  return true;
}
if (require.main === module) {
  try { verify(process.env); console.log('WAWIS DESIGN LAB: GO — same mock, osobny projekt, bez sekretów'); }
  catch (error) { console.error('WAWIS DESIGN LAB: NO-GO — '+error.message); process.exit(1); }
}
module.exports={verify};
