import { createClient } from '@supabase/supabase-js';
import { createMockSupabaseClient } from './mockSupabaseClient.js';
import { createTimedSupabaseFetch } from '../modules/request-timeout.js';

const env = typeof import.meta !== 'undefined' && import.meta?.env ? import.meta.env : {};

const isDesignLab = String(env.VITE_WAWIS_DESIGN_LAB || '') === '1';
if (isDesignLab && (env.VITE_SUPABASE_URL || env.VITE_SUPABASE_ANON_KEY)) {
  throw new Error('WAWIS DESIGN LAB: niedozwolony adres lub klucz prawdziwego Supabase');
}
export const supabaseMode = String(env.VITE_SUPABASE_MODE || '').trim().toLowerCase();
export const isSupabaseMockEnabled = isDesignLab || supabaseMode === 'mock' || String(env.VITE_SUPABASE_MOCK || '') === '1';
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
