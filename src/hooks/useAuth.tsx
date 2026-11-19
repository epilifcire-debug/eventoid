import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEMO_MODE } from '../lib/config';
import { supabase } from '../lib/supabase';
import type { Profile, Role } from '../types';

interface AuthState {
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string, demoRole?: Role) => Promise<Profile>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  setNewPassword: (password: string) => Promise<void>;
  recovering: boolean;
}

const Ctx = createContext<AuthState | null>(null);
const DEMO_KEY = 'eventoid.demo.role';

const DEMO_PROFILES: Record<Role, Profile> = {
  admin_master: { id: 'u1', full_name: 'Eric Filipe', email: 'eric@efcsys.com.br', role: 'admin_master', active: true },
  admin: { id: 'u2', full_name: 'Admin Silva', email: 'silva@produtora.com.br', role: 'admin', active: true },
  supervisor: { id: 'u3', full_name: 'Supervisor Reis', email: 'reis@produtora.com.br', role: 'supervisor', active: true },
  reader: { id: 'u4', full_name: 'Leitor Portão 01', email: 'portao01@produtora.com.br', role: 'reader', active: true },
  viewer: { id: 'u8', full_name: 'Cliente Horizonte', email: 'cliente@horizonte.com.br', role: 'viewer', active: true },
};

const store = {
  get: () => { try { return sessionStorage.getItem(DEMO_KEY) as Role | null; } catch { return null; } },
  set: (r: Role) => { try { sessionStorage.setItem(DEMO_KEY, r); } catch { /* armazenamento indisponível */ } },
  clear: () => { try { sessionStorage.removeItem(DEMO_KEY); } catch { /* idem */ } },
};

async function loadProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase!.from('profiles').select('id, full_name, email, role, active, avatar_url, must_change_password').eq('id', userId).single();
  if (error || !data) throw new Error('Perfil não encontrado. Procure um administrador.');
  if (!data.active) throw new Error('Usuário inativo. Procure um administrador.');
  return data as Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (DEMO_MODE) {
      const r = store.get();
      setProfile(r ? DEMO_PROFILES[r] : null);
      setLoading(false);
      return;
    }
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) { try { setProfile(await loadProfile(data.session.user.id)); } catch { await supabase!.auth.signOut(); } }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === 'SIGNED_OUT') setProfile(null);
      // link de convite ou de recuperação: a sessão chega pela URL
      if (evt === 'PASSWORD_RECOVERY') setRecovering(true);
      if ((evt === 'SIGNED_IN' || evt === 'PASSWORD_RECOVERY') && session) {
        setTimeout(() => { loadProfile(session.user.id).then(setProfile).catch(() => {}); }, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string, demoRole?: Role) => {
    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 700));
      if (!email || !password) throw new Error('Informe e-mail e senha.');
      const p = DEMO_PROFILES[demoRole ?? 'admin_master'];
      store.set(p.role); setProfile(p); return p;
    }
    if (!supabase) throw new Error('Sistema ainda não conectado ao servidor.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new Error('E-mail ou senha inválidos.');
    try {
      const p = await loadProfile(data.user.id);
      await supabase.rpc('touch_last_login');
      setProfile(p); return p;
    } catch (e) { await supabase.auth.signOut(); throw e; }
  }, []);

  const signOut = useCallback(async () => {
    store.clear();
    if (supabase) await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (DEMO_MODE) { await new Promise((r) => setTimeout(r, 500)); return; }
    if (!supabase) throw new Error('Servidor não configurado.');
    // Resposta sempre neutra: não revela se o e-mail existe
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/definir-senha` });
  }, []);

  const setNewPassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error('Servidor não configurado.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(/weak|short|least/i.test(error.message) ? 'Senha fraca. Use pelo menos 8 caracteres com letras e números.' : 'Não foi possível salvar a senha.');
    await supabase.rpc('password_changed');
    setRecovering(false);
    setProfile((p) => (p ? { ...p, must_change_password: false } : p));
  }, []);

  const value = useMemo(() => ({ profile, loading, signIn, signOut, resetPassword, setNewPassword, recovering }),
    [profile, loading, signIn, signOut, resetPassword, setNewPassword, recovering]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
