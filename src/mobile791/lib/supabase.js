import { createClient } from '@supabase/supabase-js';
import { createMockSupabaseClient } from './mockSupabaseClient.js';
import { createTimedSupabaseFetch } from '../modules/request-timeout.js';

const env = typeof import.meta !== 'undefined' && import.meta?.env ? import.meta.env : {};

export const supabaseMode = String(env.VITE_SUPABASE_MODE || '').trim().toLowerCase();
// 14.50: o atrapie decyduje stała z vite.config.js (__WAWIS_SUPABASE_MOCK__). W produkcji jest `false`,
// więc bundler usuwa gałąź z createMockSupabaseClient() i sam plik atrapy z paczki aplikacji.
// eslint-disable-next-line no-undef
export const isSupabaseMockEnabled = typeof __WAWIS_SUPABASE_MOCK__ === 'boolean' ? __WAWIS_SUPABASE_MOCK__ : false;
export const supabaseUrl = isSupabaseMockEnabled ? 'mock://supabase' : (env.VITE_SUPABASE_URL || '');
export const supabaseAnonKey = isSupabaseMockEnabled ? 'mock-anon-key' : (env.VITE_SUPABASE_ANON_KEY || '');
const timedSupabaseFetch = createTimedSupabaseFetch();
export const supabase = isSupabaseMockEnabled
  ? createMockSupabaseClient()
  : (supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: timedSupabaseFetch } })
    : null);
export const LOGOUT_FLAG_KEY = 'klima-force-logout';
export const isSupabaseConfigured = Boolean(supabase);
