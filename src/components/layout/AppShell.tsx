import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, CalendarDays, ClipboardList, FileBarChart2, Fingerprint, LayoutGrid, LogOut, Menu, Radio, ScanFace,
  Settings, ShieldCheck, SlidersHorizontal, Smartphone, Clock3, UserCog, Users, X, type LucideIcon,
} from 'lucide-react';
import logoLight from '../../assets/logo-light.png';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import { canAccess, type NavKey } from '../../lib/permissions';
import { DEMO_MODE } from '../../lib/config';
import { cx, relTime } from '../../lib/format';
import { ROLE_LABEL } from '../../types';
import { Avatar, Badge } from '../ui';
import { EfcsysSignature } from './EfcsysSignature';

export const NAV: Array<{ key: NavKey; to: string; label: string; icon: LucideIcon }> = [
  { key: 'dashboard', to: '/dashboard', label: 'Visão geral', icon: LayoutGrid },
  { key: 'events', to: '/eventos', label: 'Eventos', icon: CalendarDays },
  { key: 'employees', to: '/funcionarios', label: 'Funcionários', icon: Users },
  { key: 'faces', to: '/cadastro-facial', label: 'Cadastro facial', icon: ScanFace },
  { key: 'sectors', to: '/setores', label: 'Setores e turnos', icon: Clock3 },
  { key: 'users', to: '/usuarios', label: 'Usuários e permissões', icon: UserCog },
  { key: 'readers', to: '/leitores', label: 'Configuração de leitores', icon: SlidersHorizontal },
  { key: 'live', to: '/monitoramento', label: 'Monitoramento ao vivo', icon: Radio },
  { key: 'manual', to: '/liberacao-manual', label: 'Liberação manual', icon: ShieldCheck },
  { key: 'devices', to: '/dispositivos', label: 'Dispositivos', icon: Smartphone },
  { key: 'reports', to: '/relatorios', label: 'Relatórios', icon: FileBarChart2 },
  { key: 'audit', to: '/auditoria', label: 'Auditoria', icon: ClipboardList },
  { key: 'settings', to: '/configuracoes', label: 'Configurações', icon: Settings },
  { key: 'privacy', to: '/privacidade', label: 'Privacidade', icon: Fingerprint },
];

const ShellCtx = createContext<{ openMenu: () => void }>({ openMenu: () => {} });

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { profile } = useAuth();
  return (
    <div className="flex h-full flex-col bg-navy text-slate-300">
      <div className="flex h-[78px] items-center border-b border-white/10 px-6">
        <img src={logoLight} alt="EVENTOID" className="h-7 w-auto" />
      </div>
      <nav aria-label="Menu principal" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV.filter((n) => canAccess(profile?.role, n.key)).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={onNavigate}
            className={({ isActive }) => cx('flex min-h-[44px] items-center gap-3 rounded-btn px-3 text-sm font-medium transition-colors', isActive ? 'bg-primary text-white shadow-sm' : 'hover:bg-white/5 hover:text-white')}>
            <Icon className="h-[18px] w-[18px] shrink-0" />{label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 px-5 py-5">
        <p className="text-[13px] text-slate-200">Trabalho que faz o evento acontecer.</p>
        <EfcsysSignature className="mt-3 text-[11px] text-slate-400" />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <ShellCtx.Provider value={{ openMenu: () => setOpen(true) }}>
      <div className="min-h-screen bg-bg">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] lg:block"><Sidebar /></aside>
        {/* Drawer móvel/tablet */}
        <div className={cx('fixed inset-0 z-40 lg:hidden', open ? 'pointer-events-auto' : 'pointer-events-none')}>
          <div onClick={() => setOpen(false)} className={cx('absolute inset-0 bg-navy/60 transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0')} />
          <aside className={cx('absolute inset-y-0 left-0 w-[272px] max-w-[85vw] transition-transform duration-200', open ? 'translate-x-0' : '-translate-x-full')}>
            <button aria-label="Fechar menu" onClick={() => setOpen(false)} className="absolute right-3 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-btn text-white hover:bg-white/10"><X className="h-5 w-5" /></button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
        <div className="lg:pl-[252px]">{children}</div>
      </div>
    </ShellCtx.Provider>
  );
}

function AlertsBell() {
  const { data: alerts = [] } = useData('alerts');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const dot = { danger: 'bg-danger', warning: 'bg-warning', info: 'bg-primary' } as const;
  return (
    <div className="relative" ref={ref}>
      <button aria-label="Alertas" onClick={() => setOpen((v) => !v)} className="relative flex h-11 w-11 items-center justify-center rounded-btn text-ink hover:bg-bg">
        <Bell className="h-5 w-5" />
        {alerts.length > 0 && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-danger" />}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-[min(340px,calc(100vw-2rem))] rounded-card border border-line bg-white shadow-pop">
          <p className="border-b border-line px-4 py-3 text-sm font-semibold">Alertas administrativos</p>
          {alerts.length === 0 ? <p className="px-4 py-6 text-center text-sm text-ink-muted">Nenhum alerta no momento.</p> : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-3">
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', dot[a.level])} />
                  <div className="min-w-0 text-sm"><p className="font-medium text-ink">{a.title}</p><p className="text-ink-muted">{a.detail}</p><p className="mt-0.5 text-xs text-slate-400">{relTime(a.at)}</p></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { openMenu } = useContext(ShellCtx);
  const nav = useNavigate();
  const logout = async () => { await signOut(); nav('/login', { replace: true }); };
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="flex min-h-[78px] items-center gap-3 px-4 sm:px-7">
          <button aria-label="Abrir menu" onClick={openMenu} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn text-ink hover:bg-bg lg:hidden"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 py-3">
            <h1 className="truncate text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
            {subtitle && <p className="hidden truncate text-sm text-ink-muted sm:block">{subtitle}</p>}
          </div>
          {DEMO_MODE && <span className="hidden xl:inline-flex"><Badge tone="warning">Demonstração</Badge></span>}
          <AlertsBell />
          {profile && (
            <div className="hidden items-center gap-3 md:flex">
              <Avatar name={profile.full_name} size={40} tone="dark" />
              <div className="leading-tight"><p className="text-sm font-semibold text-ink">{profile.full_name}</p><p className="text-xs text-ink-muted">{ROLE_LABEL[profile.role]}</p></div>
            </div>
          )}
          <button onClick={logout} className="flex min-h-[44px] items-center gap-2 rounded-btn border border-primary px-3 text-sm font-semibold text-primary hover:bg-primary-light sm:min-h-[40px] sm:px-4">
            <LogOut className="h-4 w-4" /><span>Sair</span>
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-7 sm:py-7">
        {actions && <div className="mb-5">{actions}</div>}
        {children}
      </main>
    </>
  );
}
