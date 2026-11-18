import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import logoDark from '../assets/logo-dark.png';
import logoLight from '../assets/logo-light.png';
import { useAuth } from '../hooks/useAuth';
import { APP_VERSION, DEMO_MODE, HAS_BACKEND } from '../lib/config';
import { homeFor } from '../lib/permissions';
import { cx } from '../lib/format';
import { ROLE_LABEL, type Role } from '../types';
import { Alert } from '../components/ui';
import { EfcsysSignature } from '../components/layout/EfcsysSignature';

const ROLES: Role[] = ['admin_master', 'admin', 'supervisor', 'reader', 'viewer'];

export default function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState(DEMO_MODE ? 'demo@eventoid.com.br' : '');
  const [password, setPassword] = useState(DEMO_MODE ? 'demonstracao' : '');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [role, setRole] = useState<Role>('admin_master');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgot, setForgot] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const p = await signIn(email.trim(), password, role);
      nav(homeFor(p.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally { setLoading(false); }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Painel da marca */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-navy p-12 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute -right-24 top-1/3 h-[420px] w-[420px] rounded-full border border-white/5" />
        <div aria-hidden className="pointer-events-none absolute -right-8 top-[42%] h-[260px] w-[260px] rounded-full border border-primary/20" />
        <img src={logoLight} alt="EVENTOID" className="h-9 w-auto self-start" />
        <div className="max-w-md">
          <h1 className="text-[40px] font-extrabold leading-[1.1] tracking-tight">Pessoas certas.<br /><span className="text-[#6EA0FF]">Eventos extraordinários.</span></h1>
          <p className="mt-5 text-lg text-slate-300">Controle de acesso, presença e equipes temporárias em uma operação simples e segura.</p>
          <div className="mt-8 flex flex-wrap gap-2 text-sm text-slate-300">
            {['Reconhecimento facial', 'Operação offline', 'Tempo real'].map((t) => <span key={t} className="rounded-full border border-white/15 px-3 py-1">{t}</span>)}
          </div>
        </div>
        <EfcsysSignature className="text-xs text-slate-400" />
      </section>

      {/* Formulário */}
      <section className="flex flex-col justify-between bg-bg px-5 py-8 sm:px-10">
        <div className="lg:hidden"><img src={logoDark} alt="EVENTOID" className="mx-auto h-8 w-auto" /></div>
        <div className="mx-auto w-full max-w-[420px] py-8">
          <div className="rounded-card border border-line bg-white p-6 shadow-card sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Bem-vindo</p>
            <h2 className="mt-1 text-2xl font-bold text-ink">Acesse sua conta</h2>
            <p className="mt-1 text-sm text-ink-muted">Informe suas credenciais para entrar.</p>

            {!HAS_BACKEND && !DEMO_MODE && (
              <div className="mt-5"><Alert tone="warning" title="Servidor não configurado">Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.</Alert></div>
            )}

            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              {DEMO_MODE && (
                <fieldset>
                  <legend className="mb-1.5 text-sm font-medium text-ink">Perfil <span className="font-normal text-ink-muted">(somente na demonstração)</span></legend>
                  <div className="flex flex-wrap gap-2">
                    {ROLES.map((r) => (
                      <button type="button" key={r} onClick={() => setRole(r)} aria-pressed={role === r}
                        className={cx('min-h-[44px] rounded-btn border px-3.5 text-xs font-semibold transition', role === r ? 'border-primary bg-primary-light text-primary' : 'border-line text-ink-muted hover:border-slate-300')}>
                        {r === 'admin_master' ? 'Admin Master' : ROLE_LABEL[r]}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">E-mail</span>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br"
                    className="min-h-[46px] w-full rounded-btn border border-line pl-10 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Senha</span>
                <span className="relative block">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    className="min-h-[46px] w-full rounded-btn border border-line pl-10 pr-12 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  <button type="button" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShow((v) => !v)} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-slate-500 hover:text-ink">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>
              <div className="flex items-center justify-between gap-3 text-sm">
                <label className="flex min-h-[44px] items-center gap-2 text-ink"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-primary" />Lembrar acesso</label>
                <button type="button" onClick={() => setForgot(true)} className="min-h-[44px] font-medium text-primary hover:underline">Esqueci minha senha</button>
              </div>
              {forgot && <Alert tone="info" title="Recuperação de senha">Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.</Alert>}
              {error && <Alert tone="danger" title="Não foi possível entrar">{error}</Alert>}
              <button type="submit" disabled={loading} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-btn bg-primary text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover disabled:opacity-60">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
          </div>
        </div>
        <div className="text-center text-xs text-ink-muted">
          <p>EVENTOID v{APP_VERSION}</p>
          <EfcsysSignature className="mt-1" />
        </div>
      </section>
    </div>
  );
}
