import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, Copy, Link2, Lock, ScanFace, ShieldCheck, Unlock, AlertTriangle } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Avatar, Badge, Button, Field, Input, MiniStat, Modal, Select, Tabs, toast } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { ListCard, StatsRow, Toolbar, matches, useDebounced } from '../components/ui/ListKit';
import { EmployeeStatusBadge, FaceBadge } from '../components/ui/status';
import { useAuth } from '../hooks/useAuth';
import { useData } from '../hooks/useData';
import { canEdit } from '../lib/permissions';
import { formValues, runAction } from '../lib/actions';
import { approveEmployee, createEmployee, setEmployeeBlocked, type EmployeeInput } from '../services/mutations';
import { DEMO_MODE } from '../lib/config';
import { hideCPF, maskCPF, maskPhone } from '../lib/format';
import type { Employee } from '../types';

export default function Employees() {
  const { profile } = useAuth();
  const { data = [], isLoading, error, refetch } = useData('employees');
  const sectors = useData('sectors').data ?? [];
  const [q, setQ] = useState('');
  const [view, setView] = useState<'all' | 'pending'>('all');
  const [creating, setCreating] = useState(false);
  const [sel, setSel] = useState<Employee | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const dq = useDebounced(q);
  const sector = (id: string) => sectors.find((s) => s.id === id)?.name ?? '—';
  const rows = data.filter((e) => (view === 'all' || e.status === 'pending') && matches(dq, e.full_name, e.code, e.document, e.phone, sector(e.sector_id)));
  const editable = canEdit(profile?.role);

  return (
    <Page title="Funcionários" subtitle="Cadastre, vincule e acompanhe funcionários temporários.">
      <div className="space-y-5">
        <Toolbar placeholder="Buscar por nome, CPF, telefone ou setor..." value={q} onChange={setQ} actionLabel="Novo funcionário" onAction={() => setCreating(true)} canAct={editable}
          extra={editable && <Button variant="outline" icon={Link2} onClick={() => setLinkOpen(true)} className="hidden sm:inline-flex">Link de autocadastro</Button>} />
        <StatsRow>
          <MiniStat label="Funcionários" value={data.length} icon={CheckCircle2} tone="success" />
          <MiniStat label="Com biometria" value={data.filter((e) => e.face_status === 'complete').length} icon={Clock} tone="primary" />
          <MiniStat label="Pendentes" value={data.filter((e) => e.status === 'pending' || e.face_status !== 'complete').length} icon={AlertTriangle} tone="warning" />
        </StatsRow>
        <ListCard title="Funcionários" count={rows.length} loading={isLoading} error={error} onRetry={refetch} empty="Nenhum funcionário encontrado."
          action={<div className="w-full sm:w-auto"><Tabs tabs={[{ key: 'all', label: 'Todos' }, { key: 'pending', label: `Aguardando aprovação (${data.filter((e) => e.status === 'pending').length})` }]} value={view} onChange={setView} /></div>}>
          <DataTable rows={rows} onRowClick={setSel}
            columns={[
              { key: 'n', header: 'Funcionário', render: (r) => <span className="flex items-center gap-3"><Avatar name={r.full_name} size={34} /><span><span className="block font-medium">{r.full_name}</span><span className="text-xs text-ink-muted">{r.code}</span></span></span> },
              { key: 'd', header: 'Documento', render: (r) => <span className="tabular-nums text-ink-muted">{hideCPF(r.document)}</span>, hideOnTablet: true },
              { key: 's', header: 'Setor', render: (r) => sector(r.sector_id) },
              { key: 'f', header: 'Facial', render: (r) => <FaceBadge s={r.face_status} /> },
              { key: 'c', header: 'Consentimento', render: (r) => r.consent ? <Badge tone="success">Aceito</Badge> : <Badge tone="warning">Pendente</Badge>, hideOnTablet: true },
              { key: 'st', header: 'Status', render: (r) => <EmployeeStatusBadge s={r.status} /> },
            ]}
            mobile={(r) => (
              <div className="flex items-center gap-3">
                <Avatar name={r.full_name} size={42} />
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{r.full_name}</p><p className="text-xs text-ink-muted">{r.code} · {sector(r.sector_id)}</p></div>
                <EmployeeStatusBadge s={r.status} />
              </div>
            )} />
        </ListCard>
      </div>

      <EmployeeForm open={creating} onClose={() => setCreating(false)} />

      <Modal open={!!sel} onClose={() => setSel(null)} title="Funcionário" size="lg"
        footer={sel && editable && (
          <>
            {sel.status === 'pending' && <Button variant="success" icon={ShieldCheck} onClick={async () => { if (await runAction('Cadastro aprovado', () => approveEmployee(sel.id), ['employees'])) setSel(null); }}>Aprovar cadastro</Button>}
            {sel.status === 'blocked'
              ? <Button variant="outline" icon={Unlock} onClick={async () => { if (await runAction('Funcionário desbloqueado', () => setEmployeeBlocked(sel.id, false), ['employees'])) setSel(null); }}>Desbloquear</Button>
              : <Button variant="danger" icon={Lock} onClick={async () => { if (await runAction('Funcionário bloqueado', () => setEmployeeBlocked(sel.id, true), ['employees'])) setSel(null); }}>Bloquear</Button>}
            <Link to="/cadastro-facial"><Button icon={ScanFace} className="w-full">Cadastro facial</Button></Link>
          </>
        )}>
        {sel && (
          <div className="space-y-5">
            <div className="flex items-center gap-4"><Avatar name={sel.full_name} size={64} /><div><p className="text-lg font-bold">{sel.full_name}</p><p className="text-sm text-ink-muted">{sel.code}</p><div className="mt-1 flex gap-2"><EmployeeStatusBadge s={sel.status} /><FaceBadge s={sel.face_status} /></div></div></div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[['Documento', hideCPF(sel.document)], ['Telefone', maskPhone(sel.phone)], ['E-mail', sel.email], ['Setor', sector(sel.sector_id)], ['Turno', sel.shift_id ? 'Conforme escala' : '—'], ['Origem', sel.self_registered ? 'Autocadastro por link' : 'Cadastro pelo administrador'], ['Consentimento', sel.consent ? 'Aceito' : 'Pendente']]
                .map(([k, v]) => <div key={k} className="rounded-btn bg-bg px-3 py-2.5"><dt className="text-xs text-ink-muted">{k}</dt><dd className="font-medium text-ink">{v}</dd></div>)}
            </dl>
            <p className="text-xs text-ink-muted">Um único setor por evento. O histórico de eventos e acessos fica registrado em Relatórios e Auditoria.</p>
          </div>
        )}
      </Modal>

      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title="Link de autocadastro"
        footer={DEMO_MODE ? <Button icon={Copy} onClick={() => { toast.info('Link copiado'); setLinkOpen(false); }}>Copiar link</Button> : <Button variant="outline" onClick={() => setLinkOpen(false)}>Fechar</Button>}>
        <p className="text-sm text-ink-muted">Envie este link aos funcionários. Os cadastros ficam <strong className="text-ink">pendentes de aprovação</strong> até um administrador conferir os dados e a foto.</p>
        {DEMO_MODE
          ? <div className="mt-4 rounded-btn border border-line bg-bg px-3 py-3 font-mono text-xs break-all">https://app.eventoid.com.br/autocadastro/festival-horizonte-2026</div>
          : <p className="mt-4 rounded-btn bg-warning-light px-3 py-3 text-sm text-[#B45309]">A página pública de autocadastro será ativada na próxima etapa.</p>}
      </Modal>
    </Page>
  );
}

function EmployeeForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sectors = useData('sectors').data ?? [];
  const shifts = useData('shifts').data ?? [];
  const events = (useData('events').data ?? []).filter((e) => !['finished', 'archived', 'cancelled'].includes(e.status));
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [eventId, setEventId] = useState('');
  const [saving, setSaving] = useState(false);
  const ev = eventId || events[0]?.id || '';
  const evSectors = sectors.filter((s) => s.event_id === ev);
  const evShifts = shifts.filter((s) => s.event_id === ev);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = formValues(e.currentTarget) as unknown as EmployeeInput;
    if (!v.full_name) { toast.error('Informe o nome completo.'); return; }
    setSaving(true);
    const ok = await runAction('Funcionário cadastrado', () => createEmployee(v), ['employees', 'sectors']);
    setSaving(false);
    if (ok) { setCpf(''); setPhone(''); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Novo funcionário" size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" form="employee-form" loading={saving}>Salvar funcionário</Button></>}>
      <form id="employee-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><Field label="Nome completo" required><Input name="full_name" autoComplete="off" required /></Field></div>
        <Field label="CPF"><Input name="cpf" inputMode="numeric" value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} placeholder="000.000.000-00" /></Field>
        <Field label="Telefone"><Input name="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(79) 99999-9999" /></Field>
        <div className="sm:col-span-2"><Field label="E-mail"><Input name="email" type="email" inputMode="email" /></Field></div>
        <Field label="Evento"><Select name="event_id" value={ev} onChange={(e) => setEventId(e.target.value)}>
          {events.length === 0 && <option value="">Nenhum evento disponível</option>}
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select></Field>
        <Field label="Setor" hint="Um único setor por evento."><Select name="sector_id"><option value="">Sem setor</option>{evSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Turno"><Select name="shift_id"><option value="">Sem turno</option>{evShifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start}–{s.end})</option>)}</Select></Field>
        <Field label="Código" hint="Gerado automaticamente ao salvar"><Input disabled placeholder="FUN-00000" /></Field>
      </form>
      <p className="mt-4 text-xs text-ink-muted">Depois de salvar, faça a captura em Cadastro facial.</p>
    </Modal>
  );
}
