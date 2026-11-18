const env = import.meta.env;

export const SUPABASE_URL = (env.VITE_SUPABASE_URL as string | undefined) ?? '';
export const SUPABASE_KEY =
  (env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? (env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export const HAS_BACKEND = Boolean(SUPABASE_URL && SUPABASE_KEY);

/**
 * Modo demonstração: dados fictícios separados em src/data/demo.ts e seletor de perfil no login.
 * Só fica ativo quando VITE_DEMO_MODE=true. Sem Supabase configurado e sem demo, as telas
 * mostram estado vazio (nunca dados simulados).
 */
export const DEMO_MODE = env.VITE_DEMO_MODE === 'true';

/** 'memory' = preview publicado (sem depender da URL); padrão = BrowserRouter. */
export const ROUTER_MODE = (env.VITE_ROUTER as 'memory' | 'hash' | undefined) ?? 'browser';

export const APP_VERSION = '1.0.0';

export const READER_RESULT_SECONDS = 5;
export const READER_REREAD_BLOCK_SECONDS = 20;
