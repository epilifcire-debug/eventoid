import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import logoDark from '../assets/logo-dark.png';
import { useAuth } from '../hooks/useAuth';
import { homeFor } from '../lib/permissions';
import { Alert } from '../components/ui';
import { EfcsysSignature } from '../components/layout/EfcsysSignature';

/** Primeiro acesso (convite) ou recuperação de senha. */
export default function SetPassword() {
  const { profile, setNewPassword, signOut } = useAuth();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (pw.length < 8 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) { setError('Use pelo menos 8 caracteres, com letras e números.'); return; }
    if (pw !== pw2) { setError('As senhas não conferem.'); return; }
    setLoading(true);
    try {
      await setNewPassword(pw);
      nav(profile ? homeFor(profile.role) : '/login', { replace: true });
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); }
    finally { setLoading(false); }
  }

  const input = 'min-h-[46px] w-full rounded-btn border border-line pl-10 pr-12 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-bg px-5 py-8">
      <img src={logoDark} alt="EVENTOID" className="h-8 w-auto" />
      <form onSubmit={submit} className="w-full max-w-[420px] rounded-card border border-line bg-white p-6 shadow-card sm:p-8" noValidate>
        <h1 className="text-2xl font-bold text-ink">Definir senha</h1>
        <p className="mt-1 text-sm text-ink-muted">{profile ? `Olá, ${profile.full_name.split(' ')[0]}. ` : ''}Crie a senha que você vai usar para entrar.</p>
        <div className="mt-6 space-y-4">
          {[['Nova senha', pw, setPw, 'new-password'], ['Confirmar senha', pw2, setPw2, 'new-password']].map(([label, val, set, ac]) => (
            <label key={label as string} className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{label as string}</span>
              <span className="relative block">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type={show ? 'text' : 'password'} autoComplete={ac as string} value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} className={input} />
                <button type="button" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShow((v) => !v)} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-slate-500">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
          ))}
          {error && <Alert tone="danger" title="Verifique a senha">{error}</Alert>}
          <button type="submit" disabled={loading} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-btn bg-primary text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}Salvar senha
          </button>
          <button type="button" onClick={async () => { await signOut(); nav('/login', { replace: true }); }} className="min-h-[44px] w-full text-sm font-medium text-ink-muted hover:text-ink">Sair</button>
        </div>
      </form>
      <EfcsysSignature className="text-xs text-ink-muted" />
    </div>
  );
}
