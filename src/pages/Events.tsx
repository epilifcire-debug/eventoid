import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock, Archive, MapPin } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Button, Field, Input, MiniStat, Modal, Select, Textarea, toast } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { ListCard, StatsRow, Toolbar, matches, useDebounced } from '../components/ui/ListKit';
import { EventStatusBadge } from '../components/ui/status';
import { useAuth } from '../hooks/useAuth';
import { useData } from '../hooks/useData';
import { canEdit } from '../lib/permissions';
import { fmtDate } from '../lib/format';
import { runAction } from '../lib/actions';
import { EVENT_STATUS_LABEL, type EventStatus } from '../types';

export default function Events() {
  const { profile } = useAuth();
  const { data = [], isLoading, error, refetch } = useData('events');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<EventStatus | ''>('');
  const [showFilters, setShowFilters] = useState(false);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  const dq = useDebounced(q);
  const rows = data.filter((e) => matches(dq, e.name, e.city, e.venue_name) && (!status || e.status === status));

  return (
    <Page title="Eventos" subtitle="Gerencie eventos, equipes e a operação associada.">
      <div className="space-y-5">
        <Toolbar placeholder="Buscar em eventos..." value={q} onChange={setQ} actionLabel="Novo evento" onAction={() => setCreating(true)} canAct={canEdit(profile?.role)}
          onFilters={() => setShowFilters((v) => !v)} filtersActive={!!status} />
        {showFilters && (
          <div className="flex flex-wrap gap-2">
            {(['', 'draft', 'scheduled', 'active', 'finished', 'archived', 'cancelled'] as const).map((s) => (
              <button key={s || 'all'} onClick={() => setStatus(s)} className={`min-h-[40px] rounded-full border px-3.5 text-sm font-medium ${status === s ? 'border-primary bg-primary-light text-primary' : 'border-line bg-white text-ink-muted'}`}>
                {s ? EVENT_STATUS_LABEL[s] : 'Todos'}
              </button>
            ))}
          </div>
        )}
        <StatsRow>
          <MiniStat label="Eventos ativos" value={data.filter((e) => e.status === 'active').length} icon={CheckCircle2} tone="success" />
          <MiniStat label="Programados" value={data.filter((e) => e.status === 'scheduled').length} icon={Clock} tone="primary" />
          <MiniStat label="Encerrados" value={data.filter((e) => e.status === 'finished' || e.status === 'archived').length} icon={Archive} tone="warning" />
        </StatsRow>
        <ListCard title="Eventos" count={rows.length} loading={isLoading} error={error} onRetry={refetch} empty="Nenhum evento cadastrado." emptyText="Selecione ou cadastre um evento para começar.">
          <DataTable rows={rows} onRowClick={(r) => nav(`/eventos/${r.id}`)}
            columns={[
              { key: 'n', header: 'Evento', render: (r) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-ink-muted">Responsável: {r.manager}</p></div> },
              { key: 'l', header: 'Local', render: (r) => <span className="text-ink-muted">{r.venue_name} · {r.city}/{r.state}</span> },
              { key: 'd', header: 'Período', render: (r) => <span className="tabular-nums">{fmtDate(r.starts_at)} – {fmtDate(r.ends_at)}</span> },
              { key: 'q', header: 'Escalados', render: (r) => r.staff_count.toLocaleString('pt-BR'), hideOnTablet: true },
              { key: 's', header: 'Status', render: (r) => <EventStatusBadge s={r.status} /> },
            ]}
            mobile={(r) => (
              <div>
                <div className="flex items-start justify-between gap-2"><p className="font-semibold text-ink">{r.name}</p><EventStatusBadge s={r.status} /></div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted"><MapPin className="h-3.5 w-3.5" />{r.venue_name} · {r.city}/{r.state}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(r.starts_at)} – {fmtDate(r.ends_at)}</p>
              </div>
            )} />
        </ListCard>
      </div>
      <EventForm open={creating} onClose={() => setCreating(false)} />
    </Page>
  );
}

export function EventForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const save = async () => {
    if (!name.trim()) { toast.error('Informe o nome do evento.'); return; }
    setSaving(true); await runAction('Evento salvo como rascunho'); setSaving(false);
    onClose(); setName('');
  };
  return (
    <Modal open={open} onClose={onClose} title="Novo evento" size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar evento</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Nome" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Festival Horizonte 2026" /></Field></div>
        <div className="sm:col-span-2"><Field label="Descrição"><Textarea placeholder="Resumo da operação" /></Field></div>
        <Field label="Local" required><Input placeholder="Ex.: Parque da Cidade" /></Field>
        <div className="grid grid-cols-[1fr_88px] gap-3"><Field label="Cidade" required><Input /></Field><Field label="UF" required><Input maxLength={2} className="uppercase" /></Field></div>
        <Field label="Data e hora inicial" required><Input type="datetime-local" /></Field>
        <Field label="Data e hora final" required><Input type="datetime-local" /></Field>
        <Field label="Responsável"><Input placeholder="Nome do responsável" /></Field>
        <Field label="Status"><Select defaultValue="draft">{Object.entries(EVENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Validade offline (horas)" hint="Padrão de 24 h. Aviso após 6 h sem sincronizar."><Input type="number" min={1} defaultValue={24} /></Field>
      </div>
      <p className="mt-4 text-xs text-ink-muted">Setores, turnos, funcionários, operadores e dispositivos são vinculados nas abas do evento após salvar.</p>
    </Modal>
  );
}
