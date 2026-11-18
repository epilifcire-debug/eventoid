import { useEffect, useState, type ReactNode } from 'react';
import { Filter, Plus, Search, type LucideIcon } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock } from './index';

export function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function Toolbar({ placeholder, value, onChange, actionLabel, actionIcon = Plus, onAction, canAct = true, filtersActive, onFilters, extra }: {
  placeholder: string; value: string; onChange: (v: string) => void;
  actionLabel?: string; actionIcon?: LucideIcon; onAction?: () => void; canAct?: boolean;
  filtersActive?: boolean; onFilters?: () => void; extra?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <label className="relative block w-full sm:max-w-md">
        <span className="sr-only">{placeholder}</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="min-h-[44px] w-full rounded-btn border border-line bg-white pl-10 pr-3 text-sm shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </label>
      <div className="flex gap-2 sm:ml-auto">
        {extra}
        {onFilters && (
          <Button variant="outline" icon={Filter} onClick={onFilters} className={filtersActive ? 'border-primary text-primary' : ''}>
            Filtros{filtersActive ? ' •' : ''}
          </Button>
        )}
        {actionLabel && canAct && <Button icon={actionIcon} onClick={onAction} className="flex-1 sm:flex-none">{actionLabel}</Button>}
      </div>
    </div>
  );
}

export function StatsRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-3 gap-2.5 sm:gap-4">{children}</div>;
}

export function ListCard({ title, subtitle, loading, error, onRetry, empty, emptyText, emptyAction, count, children, action }: {
  title: string; subtitle?: string; loading?: boolean; error?: unknown; onRetry?: () => void;
  empty: string; emptyText?: string; emptyAction?: ReactNode; count: number; children: ReactNode; action?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} subtitle={subtitle ?? (count ? `${count} registro${count > 1 ? 's' : ''}` : 'Os registros aparecerão aqui após a conexão com o sistema.')} action={action} />
      {loading ? <LoadingBlock /> : error ? <ErrorState onRetry={onRetry} /> : count === 0 ? <EmptyState title={empty} text={emptyText} action={emptyAction} /> : children}
    </Card>
  );
}

export function matches(q: string, ...fields: Array<string | null | undefined>) {
  if (!q) return true;
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const t = n(q);
  return fields.some((f) => f && n(f).includes(t));
}
