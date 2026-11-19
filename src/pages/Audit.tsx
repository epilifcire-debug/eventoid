import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, ShieldAlert } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Avatar, Badge, MiniStat } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { ListCard, StatsRow, Toolbar, matches, useDebounced } from '../components/ui/ListKit';
import { useData } from '../hooks/useData';
import { downloadCSV } from '../lib/csv';
import { fmtDateTime } from '../lib/format';

export default function Audit() {
  const { data = [], isLoading, error, refetch } = useData('audit');
  const alerts = useData('alerts').data ?? [];
  const [q, setQ] = useState('');
  const [onlySensitive, setOnlySensitive] = useState(false);
  const dq = useDebounced(q);
  const rows = data.filter((a) => (!onlySensitive || a.sensitive) && matches(dq, a.actor, a.action, a.detail));

  return (
    <Page title="Auditoria" subtitle="Rastreie ações sensíveis e alterações no sistema.">
      <div className="space-y-5">
        <Toolbar placeholder="Buscar em auditoria..." value={q} onChange={setQ} actionLabel="Exportar auditoria" actionIcon={Download} onAction={() => downloadCSV(`eventoid-auditoria-${new Date().toISOString().slice(0, 10)}.csv`, ['Quando', 'Quem', 'Ação', 'Entidade', 'Detalhe', 'Sensível'], rows.map((a) => [fmtDateTime(a.created_at), a.actor, a.action, a.entity, a.detail, a.sensitive ? 'Sim' : 'Não']))}
          onFilters={() => setOnlySensitive((v) => !v)} filtersActive={onlySensitive} />
        <StatsRow>
          <MiniStat label="Ações" value={data.length} icon={CheckCircle2} tone="success" />
          <MiniStat label="Ações sensíveis" value={data.filter((a) => a.sensitive).length} icon={ShieldAlert} tone="primary" />
          <MiniStat label="Alertas" value={alerts.length} icon={AlertTriangle} tone="warning" />
        </StatsRow>
        <ListCard title="Auditoria" subtitle={onlySensitive ? 'Filtrando apenas ações sensíveis' : undefined} count={rows.length} loading={isLoading} error={error} onRetry={refetch} empty="Nenhum registro de auditoria.">
          <DataTable rows={rows}
            columns={[
              { key: 'w', header: 'Quando', render: (r) => <span className="tabular-nums text-ink-muted">{fmtDateTime(r.created_at)}</span> },
              { key: 'u', header: 'Quem', render: (r) => <span className="flex items-center gap-2"><Avatar name={r.actor} size={28} />{r.actor}</span> },
              { key: 'a', header: 'Ação', render: (r) => <span className="flex items-center gap-2 font-medium">{r.action}{r.sensitive && <Badge tone="warning">Sensível</Badge>}</span> },
              { key: 'e', header: 'Entidade', render: (r) => <Badge>{r.entity}</Badge>, hideOnTablet: true },
              { key: 'd', header: 'Detalhe', render: (r) => <span className="text-ink-muted">{r.detail}</span> },
            ]}
            mobile={(r) => <div><div className="flex items-center justify-between gap-2"><p className="font-medium">{r.action}</p><span className="text-xs tabular-nums text-ink-muted">{fmtDateTime(r.created_at)}</span></div><p className="mt-0.5 text-sm text-ink-muted">{r.actor} · {r.detail}</p></div>} />
        </ListCard>
        <p className="text-xs text-ink-muted">Registros de auditoria não podem ser editados nem excluídos.</p>
      </div>
    </Page>
  );
}
