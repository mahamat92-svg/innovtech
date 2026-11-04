import { createClient } from '@supabase/supabase-js';

// Supabase publishable key is intended for browser use; access is constrained by RLS.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ukharykzvrppezxjgqrj.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_AkHCBOsMwOAWkExu_OQtmw_N77lmmwv';

export const supabaseConfigured = Boolean(url && key);
const fetchWithTimeout = (input, init = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};
export const supabase = supabaseConfigured ? createClient(url, key, {
  global: { fetch: fetchWithTimeout },
  // Only the authentication session is kept for this tab. Business data is always read/written in Supabase.
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined
  }
}) : null;
