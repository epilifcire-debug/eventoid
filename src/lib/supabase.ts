import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HAS_BACKEND, SUPABASE_KEY, SUPABASE_URL } from './config';

// Cliente único. Só usa a chave pública; a autorização real fica no RLS do banco.
export const supabase: SupabaseClient | null = HAS_BACKEND
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
