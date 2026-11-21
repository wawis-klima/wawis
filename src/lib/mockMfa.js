// WAWIS 14.72 — atrapa MFA (TOTP) dla testów E2E (tylko tryb testowy; nie trafia do wersji produkcyjnej).
// Stan w localStorage — wspólny dla atrapy komputera i telefonu. Poprawny kod w testach: MOCK_TOTP_CODE.
export const MOCK_TOTP_CODE = '123456';
const KEY = 'klima-mock-mfa';

function read() {
  try { return JSON.parse(window.localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function write(state) {
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* bez pamięci */ }
}

export function createMockMfa({ getUserId, emit }) {
  const factorsOf = (state, uid) => (state.factors?.[uid] || []);
  const api = {
    async listFactors() {
      const uid = getUserId();
      const all = uid ? factorsOf(read(), uid) : [];
      return { data: { all, totp: all.filter((f) => f.factor_type === 'totp' && f.status === 'verified'), phone: [] }, error: null };
    },
    async enroll({ factorType = 'totp', friendlyName = '' } = {}) {
      const uid = getUserId();
      if (!uid) return { data: null, error: { message: 'Brak sesji.' } };
      const state = read();
      state.factors = state.factors || {};
      const id = `mock-factor-${Date.now()}`;
      state.factors[uid] = [...factorsOf(state, uid), { id, factor_type: factorType, status: 'unverified', friendly_name: friendlyName }];
      write(state);
      const secret = 'MOCKSECRETWAWIS';
      return {
        data: {
          id, type: factorType,
          totp: {
            qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="%23ffffff"/><rect x="20" y="20" width="40" height="40"/></svg>',
            secret,
            uri: `otpauth://totp/WAWIS:${uid}?secret=${secret}&issuer=WAWIS`,
          },
        },
        error: null,
      };
    },
    async challengeAndVerify({ factorId, code }) {
      const uid = getUserId();
      const state = read();
      const factor = factorsOf(state, uid).find((f) => f.id === factorId);
      if (!factor) return { data: null, error: { message: 'Factor not found', code: 'mfa_factor_not_found' } };
      if (String(code) !== MOCK_TOTP_CODE) return { data: null, error: { message: 'Invalid TOTP code entered', code: 'mfa_verification_failed' } };
      factor.status = 'verified';
      state.aal = { ...(state.aal || {}), [uid]: 'aal2' };
      write(state);
      emit('MFA_CHALLENGE_VERIFIED');
      return { data: { access_token: `mock-token-${uid}-aal2` }, error: null };
    },
    async unenroll({ factorId }) {
      const uid = getUserId();
      const state = read();
      const factor = factorsOf(state, uid).find((f) => f.id === factorId);
      if (!factor) return { data: null, error: { message: 'Factor not found' } };
      if (factor.status === 'verified' && state.aal?.[uid] !== 'aal2') return { data: null, error: { message: 'AAL2 required', code: 'insufficient_aal' } };
      state.factors[uid] = factorsOf(state, uid).filter((f) => f.id !== factorId);
      write(state);
      return { data: { id: factorId }, error: null };
    },
    async getAuthenticatorAssuranceLevel() {
      const uid = getUserId();
      if (!uid) return { data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] }, error: null };
      const state = read();
      const current = state.aal?.[uid] || 'aal1';
      const hasVerified = factorsOf(state, uid).some((f) => f.status === 'verified');
      return { data: { currentLevel: current, nextLevel: hasVerified ? 'aal2' : current, currentAuthenticationMethods: [] }, error: null };
    },
  };
  return {
    api,
    onSignIn(uid) { const state = read(); state.aal = { ...(state.aal || {}), [uid]: 'aal1' }; write(state); },
  };
}
