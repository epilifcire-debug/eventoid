import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Loader2, RefreshCw, X, XCircle, Info, type LucideIcon } from 'lucide-react';
import { cx, initials } from '../../lib/format';

/* ---------- Botões ---------- */
type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'success';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm',
  outline: 'border border-line bg-white text-ink hover:bg-bg',
  ghost: 'text-ink-muted hover:bg-bg hover:text-ink',
  danger: 'bg-danger text-white hover:brightness-95',
  success: 'bg-success text-white hover:brightness-95',
};
export function Button({ variant = 'primary', icon: Icon, loading, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: LucideIcon; loading?: boolean }) {
  return (
    <button
      {...p}
      type={p.type ?? 'button'}
      disabled={p.disabled || loading}
      className={cx('inline-flex min-h-[44px] items-center justify-center gap-2 rounded-btn px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[40px]', BTN[variant], className)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-card border border-line bg-surface shadow-card', className)}>{children}</div>;
}
export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Badges ---------- */
type Tone = 'success' | 'danger' | 'warning' | 'primary' | 'neutral' | 'navy';
const TONE: Record<Tone, string> = {
  success: 'bg-success-light text-success',
  danger: 'bg-danger-light text-danger',
  warning: 'bg-warning-light text-[#B45309]',
  primary: 'bg-primary-light text-primary',
  neutral: 'bg-slate-100 text-slate-600',
  navy: 'bg-navy text-white',
};
export function Badge({ tone = 'neutral', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', TONE[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ name, size = 36, tone = 'light' }: { name: string; size?: number; tone?: 'light' | 'dark' }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', tone === 'dark' ? 'bg-navy text-white' : 'bg-primary-light text-primary')}
    >
      {initials(name)}
    </span>
  );
}

/* ---------- Cards de indicador ---------- */
export function StatCard({ label, value, hint, icon: Icon, tone = 'primary', children }: { label: string; value: ReactNode; hint?: ReactNode; icon: LucideIcon; tone?: 'success' | 'primary' | 'warning' | 'danger'; children?: ReactNode }) {
  const bg = { success: 'bg-success-light text-success', primary: 'bg-primary-light text-primary', warning: 'bg-warning-light text-warning', danger: 'bg-danger-light text-danger' }[tone];
  return (
    <Card className="flex items-start gap-4 p-5">
      <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-full', bg)}><Icon className="h-6 w-6" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-muted">{label}</p>
        <p className="mt-0.5 text-[28px] font-bold leading-tight tracking-tight text-ink">{value}</p>
        {hint && <p className="text-xs text-ink-muted">{hint}</p>}
        {children}
      </div>
    </Card>
  );
}
export function MiniStat({ label, value, icon: Icon, tone }: { label: string; value: ReactNode; icon: LucideIcon; tone: 'success' | 'primary' | 'warning' | 'danger' }) {
  const c = { success: 'text-success', primary: 'text-primary', warning: 'text-warning', danger: 'text-danger' }[tone];
  return (
    <Card className="p-3 sm:p-5">
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs leading-tight text-ink-muted sm:text-sm">{label}</p>
        <Icon className={cx('h-4 w-4 shrink-0 sm:h-5 sm:w-5', c)} />
      </div>
      <p className="mt-2 text-xl font-bold leading-none text-ink sm:text-[28px]">{value}</p>
    </Card>
  );
}

/* ---------- Estados ---------- */
export function EmptyState({ title, text, action, icon: Icon = Inbox }: { title: string; text?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bg text-ink-muted"><Icon className="h-5 w-5" /></span>
      <p className="font-semibold text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-btn bg-bg" />)}
    </div>
  );
}
export function ErrorState({ onRetry, text = 'Não foi possível carregar os dados.' }: { onRetry?: () => void; text?: string }) {
  return (
    <EmptyState icon={XCircle} title={text} text="Verifique a conexão e tente novamente." action={onRetry && <Button variant="outline" icon={RefreshCw} onClick={onRetry}>Tentar novamente</Button>} />
  );
}

/* ---------- Alertas inline ---------- */
export function Alert({ tone, title, children }: { tone: 'warning' | 'danger' | 'success' | 'info'; title: string; children?: ReactNode }) {
  const m = {
    warning: ['border-warning/40 bg-warning-light', 'text-[#B45309]', AlertTriangle],
    danger: ['border-danger/30 bg-danger-light', 'text-danger', XCircle],
    success: ['border-success/30 bg-success-light', 'text-success', CheckCircle2],
    info: ['border-primary/30 bg-primary-light', 'text-primary', Info],
  } as const;
  const [box, txt, Icon] = m[tone];
  return (
    <div role="status" className={cx('flex gap-3 rounded-card border p-4', box)}>
      <Icon className={cx('mt-0.5 h-5 w-5 shrink-0', txt)} />
      <div className="text-sm"><p className={cx('font-semibold', txt)}>{title}</p>{children && <div className="mt-0.5 text-ink">{children}</div>}</div>
    </div>
  );
}

/* ---------- Formulário ---------- */
export function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}{required && <span className="text-danger"> *</span>}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-muted">{hint}</span> : null}
    </label>
  );
}
const inputCls = 'w-full min-h-[44px] rounded-btn border border-line bg-white px-3.5 text-sm text-ink placeholder:text-slate-400 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-bg';
export function Input(p: InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={cx(inputCls, p.className)} />; }
export function Select({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...p} className={cx(inputCls, 'pr-8', p.className)}>{children}</select>; }
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={cx(inputCls, 'min-h-[90px] py-2.5', p.className)} />; }
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-[44px] items-center gap-3 text-sm text-ink">
      <span className={cx('relative h-6 w-11 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-slate-300')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
      {label}
    </button>
  );
}

/* ---------- Abas ---------- */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ key: T; label: string }>; value: T; onChange: (k: T) => void }) {
  return (
    <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={cx('min-h-[44px] whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors', value === t.key ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className={cx('animate-[pop_.18s_ease-out] max-h-[92vh] w-full overflow-y-auto rounded-t-card bg-white shadow-pop sm:rounded-card', size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button aria-label="Fechar" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-btn text-ink-muted hover:bg-bg"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Toast ---------- */
type ToastMsg = { id: number; text: string; tone: 'success' | 'danger' | 'info' };
let pushToast: (t: Omit<ToastMsg, 'id'>) => void = () => {};
export const toast = {
  success: (text: string) => pushToast({ text, tone: 'success' }),
  error: (text: string) => pushToast({ text, tone: 'danger' }),
  info: (text: string) => pushToast({ text, tone: 'info' }),
};
export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    pushToast = (t) => {
      const id = Date.now() + Math.random();
      setItems((s) => [...s, { ...t, id }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3500);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 sm:left-auto sm:right-4 sm:translate-x-0">
      {items.map((t) => (
        <div key={t.id} role="status" className={cx('pointer-events-auto flex items-center gap-2 rounded-btn px-4 py-3 text-sm font-medium text-white shadow-pop animate-[pop_.18s_ease-out]', t.tone === 'success' ? 'bg-success' : t.tone === 'danger' ? 'bg-danger' : 'bg-navy')}>
          {t.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : t.tone === 'danger' ? <XCircle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          {t.text}
        </div>
      ))}
    </div>
  );
}
