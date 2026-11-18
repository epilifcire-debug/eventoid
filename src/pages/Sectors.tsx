import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Badge, Button, Field, Input, MiniStat, Modal, Select, Tabs, Textarea } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { ListCard, StatsRow, Toolbar, matches, useDebounced } from '../components/ui/ListKit';
import { useAuth } from '../hooks/useAuth';
import { useData } from '../hooks/useData';
import { canEdit } from '../lib/permissions';
import { runAction } from '../lib/actions';
import { cx } from '../lib/format';

// Sem roxo; cores para identificação visual dos setores.
const COLORS = ['#2563EB', '#0B1930', '#0D9488', '#CA8A04', '#0891B2', '#EA580C', '#475569', '#0EA5E9', '#78716C', '#1D4ED8'];

export default function Sectors() {
  const { profile } = useAuth();
  const sectors = useData('sectors');
  const shifts = useData('shifts');
  const [tab, setTab] = useState<'sectors' | 'shifts'>('sectors');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<null | 'sector' | 'shift'>(null);
  const [color, setColor] = useState(COLORS[0]);
  const dq = useDebounced(q);
  const secs = (sectors.data ?? []).filter((s) => matches(dq, s.name, s.manager));
  const shs = (shifts.data ?? []).filter((s) => matches(dq, s.name));
  const secName = (id: string) => sectors.data?.find((s) => s.id === id)?.name ?? '—';
  const editable = canEdit(profile?.role);

  return (
    <Page title="Setores e turnos" subtitle="Organize equipes, horários e tolerâncias da operação.">
      <div className="space-y-5">
        <Toolbar placeholder="Buscar em setores e turnos..." value={q} onChange={setQ} canAct={editable}
          actionLabel={tab === 'sectors' ? 'Novo setor' : 'Novo turno'} onAction={() => setForm(tab === 'sectors' ? 'sector' : 'shift')} />
        <StatsRow>
          <MiniStat label="Setores ativos" value={(sectors.data ?? []).filter((s) => s.active).length} icon={CheckCircle2} tone="success" />
          <MiniStat label="Turnos ativos" value={shifts.data?.length ?? 0} icon={Clock} tone="primary" />
          <MiniStat label="Escalados" value={(sectors.data ?? []).reduce((a, s) => a + s.staff_count, 0).toLocaleString('pt-BR')} icon={AlertTriangle} tone="warning" />
        </StatsRow>
        <Tabs tabs={[{ key: 'sectors', label: 'Setores' }, { key: 'shifts', label: 'Turnos' }]} value={tab} onChange={setTab} />
        {tab === 'sectors' ? (
          <ListCard title="Setores" count={secs.length} loading={sectors.isLoading} error={sectors.error} onRetry={sectors.refetch} empty="Nenhum setor ou turno cadastrado.">
            <DataTable rows={secs}
              columns={[
                { key: 'n', header: 'Setor', render: (r) => <span className="flex items-center gap-3"><span className="h-3 w-3 rounded-full" style={{ background: r.color }} /><span className="font-medium">{r.name}</span></span> },
                { key: 'd', header: 'Descrição', render: (r) => <span className="text-ink-muted">{r.description}</span>, hideOnTablet: true },
                { key: 'r', header: 'Responsável', render: (r) => r.manager ?? '—' },
                { key: 'q', header: 'Funcionários', render: (r) => <span className="tabular-nums">{r.staff_count}</span> },
                { key: 's', header: 'Status', render: (r) => r.active ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge> },
              ]}
              mobile={(r) => <div className="flex items-center gap-3"><span className="h-8 w-1.5 rounded-full" style={{ background: r.color }} /><div className="flex-1"><p className="font-medium">{r.name}</p><p className="text-xs text-ink-muted">{r.manager} · {r.staff_count} funcionários</p></div><Badge tone="success">Ativo</Badge></div>} />
          </ListCard>
        ) : (
          <ListCard title="Turnos" count={shs.length} loading={shifts.isLoading} error={shifts.error} onRetry={shifts.refetch} empty="Nenhum turno cadastrado.">
            <DataTable rows={shs}
              columns={[
                { key: 'n', header: 'Turno', render: (r) => <span className="font-medium">{r.name}</span> },
                { key: 's', header: 'Setor', render: (r) => secName(r.sector_id) },
                { key: 'e', header: 'Entrada prevista', render: (r) => <span className="tabular-nums">{r.start}</span> },
                { key: 'x', header: 'Saída prevista', render: (r) => <span className="tabular-nums">{r.end}</span> },
                { key: 't', header: 'Tolerância', render: (r) => `${r.tolerance_min} min` },
                { key: 'i', header: 'Intervalo', render: (r) => `${r.break_min} min`, hideOnTablet: true },
              ]}
              mobile={(r) => <div className="flex items-center justify-between"><div><p className="font-medium">{r.name} · {secName(r.sector_id)}</p><p className="text-xs text-ink-muted">Tolerância {r.tolerance_min} min · Intervalo {r.break_min} min</p></div><span className="text-sm font-semibold tabular-nums">{r.start}–{r.end}</span></div>} />
          </ListCard>
        )}
        <p className="text-xs text-ink-muted">Cada funcionário pode ter apenas um setor no mesmo evento. Atraso e saída antecipada são calculados a partir da entrada/saída prevista e da tolerância.</p>
      </div>

      <Modal open={form === 'sector'} onClose={() => setForm(null)} title="Novo setor"
        footer={<><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={async () => { await runAction('Setor criado'); setForm(null); }}>Salvar setor</Button></>}>
        <div className="space-y-4">
          <Field label="Nome" required><Input placeholder="Ex.: Bilheteria" /></Field>
          <div><span className="mb-1.5 block text-sm font-medium">Cor</span>
            <div className="flex flex-wrap gap-2">{COLORS.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setColor(c)} className={cx('h-10 w-10 rounded-full border-2', color === c ? 'border-ink' : 'border-transparent')} style={{ background: c }} />)}</div>
          </div>
          <Field label="Descrição"><Textarea /></Field>
          <Field label="Responsável"><Input /></Field>
        </div>
      </Modal>
      <Modal open={form === 'shift'} onClose={() => setForm(null)} title="Novo turno"
        footer={<><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={async () => { await runAction('Turno criado'); setForm(null); }}>Salvar turno</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" required><Input placeholder="Ex.: Manhã" /></Field>
          <Field label="Setor" required><Select>{(sectors.data ?? []).map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Entrada prevista" required><Input type="time" defaultValue="08:00" /></Field>
          <Field label="Saída prevista" required><Input type="time" defaultValue="16:00" /></Field>
          <Field label="Tolerância (min)"><Input type="number" defaultValue={10} /></Field>
          <Field label="Intervalo (min)"><Input type="number" defaultValue={60} /></Field>
        </div>
      </Modal>
    </Page>
  );
}
