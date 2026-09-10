import { createClient } from '@supabase/supabase-js';
import { createMockSupabaseClient } from './mockSupabaseClient.js';

const env = typeof import.meta !== 'undefined' && import.meta?.env ? import.meta.env : {};

export const supabaseMode = String(env.VITE_SUPABASE_MODE || '').trim().toLowerCase();
export const isSupabaseMockEnabled = supabaseMode === 'mock' || String(env.VITE_SUPABASE_MOCK || '') === '1';
export const supabaseUrl = isSupabaseMockEnabled ? 'mock://supabase' : (env.VITE_SUPABASE_URL || '');
export const supabaseAnonKey = isSupabaseMockEnabled ? 'mock-anon-key' : (env.VITE_SUPABASE_ANON_KEY || '');
export const supabase = isSupabaseMockEnabled
  ? createMockSupabaseClient()
  : (supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null);
export const LOGOUT_FLAG_KEY = 'klima-force-logout';
export const isSupabaseConfigured = Boolean(supabase);
