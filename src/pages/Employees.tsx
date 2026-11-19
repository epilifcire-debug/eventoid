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
import { approveRegistration, createEmployee, rejectRegistration, rotateSignupToken, setEmployeeBlocked, setSignupEnabled, signedPhotoUrl, type EmployeeInput } from '../services/mutations';
import { useEffect } from 'react';
import { DEMO_MODE } from '../lib/config';
import { Toggle } from '../components/ui';
import { RefreshCw } from 'lucide-react';
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
  const [approveSector, setApproveSector] = useState<string>('');
  useEffect(() => { setApproveSector(sel?.sector_id ?? ''); }, [sel]);
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
            {sel.status === 'pending' && sel.event_id && <>
              <Button variant="outline" onClick={async () => { if (await runAction('Cadastro recusado', () => rejectRegistration(sel.id, sel.event_id), ['employees', 'sectors'])) setSel(null); }}>Recusar</Button>
              <Button variant="success" icon={ShieldCheck} onClick={async () => { if (await runAction('Cadastro aprovado', () => approveRegistration(sel.id, sel.event_id, approveSector), ['employees', 'sectors'])) setSel(null); }}>Aprovar cadastro</Button>
            </>}
            {sel.status === 'blocked'
              ? <Button variant="outline" icon={Unlock} onClick={async () => { if (await runAction('Funcionário desbloqueado', () => setEmployeeBlocked(sel.id, false), ['employees'])) setSel(null); }}>Desbloquear</Button>
              : <Button variant="danger" icon={Lock} onClick={async () => { if (await runAction('Funcionário bloqueado', () => setEmployeeBlocked(sel.id, true), ['employees'])) setSel(null); }}>Bloquear</Button>}
            <Link to="/cadastro-facial"><Button icon={ScanFace} className="w-full">Cadastro facial</Button></Link>
          </>
        )}>
        {sel && (
          <div className="space-y-5">
            <div className="flex items-center gap-4"><EmployeePhoto path={sel.photo_path} name={sel.full_name} /><div><p className="text-lg font-bold">{sel.full_name}</p><p className="text-sm text-ink-muted">{sel.code}</p><div className="mt-1 flex gap-2"><EmployeeStatusBadge s={sel.status} /><FaceBadge s={sel.face_status} /></div></div></div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[['Documento', hideCPF(sel.document)], ['Telefone', maskPhone(sel.phone)], ['E-mail', sel.email], ['Setor', sector(sel.sector_id)], ['Turno', sel.shift_id ? 'Conforme escala' : '—'], ['Origem', sel.self_registered ? 'Autocadastro por link' : 'Cadastro pelo administrador'], ['Consentimento', sel.consent ? 'Aceito' : 'Pendente']]
                .map(([k, v]) => <div key={k} className="rounded-btn bg-bg px-3 py-2.5"><dt className="text-xs text-ink-muted">{k}</dt><dd className="font-medium text-ink">{v}</dd></div>)}
            </dl>
            {sel.status === 'pending' && editable && (
              <div className="rounded-btn border border-warning/40 bg-warning-light p-3">
                <p className="text-sm font-semibold text-[#B45309]">Confira a foto e os dados antes de aprovar.</p>
                <div className="mt-2"><Field label="Setor no evento"><Select value={approveSector} onChange={(e) => setApproveSector(e.target.value)}>
                  <option value="">Sem setor</option>{sectors.filter((x) => x.event_id === sel.event_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select></Field></div>
              </div>
            )}
            <p className="text-xs text-ink-muted">Um único setor por evento. O histórico de eventos e acessos fica registrado em Relatórios e Auditoria.</p>
          </div>
        )}
      </Modal>

      <SignupLinkModal open={linkOpen} onClose={() => setLinkOpen(false)} />
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

function EmployeePhoto({ path, name }: { path?: string | null; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (path && !DEMO_MODE) signedPhotoUrl(path).then(setUrl).catch(() => {});
  }, [path]);
  return url ? <img src={url} alt={`Foto de ${name}`} className="h-24 w-24 shrink-0 rounded-card object-cover" /> : <Avatar name={name} size={64} />;
}

function SignupLinkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const events = (useData('events').data ?? []).filter((e) => (e.status === 'active' || e.status === 'scheduled') && (DEMO_MODE || e.signup_token));
  const [eventId, setEventId] = useState('');
  const ev = events.find((e) => e.id === eventId) ?? events[0];
  const link = ev ? `${location.origin}/autocadastro/${DEMO_MODE ? 'demonstracao' : ev.signup_token}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.success('Link copiado'); }
    catch { toast.info('Selecione o link e copie manualmente.'); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Link de autocadastro"
      footer={ev && <><Button variant="outline" onClick={onClose}>Fechar</Button><Button icon={Copy} onClick={copy} disabled={!ev.signup_enabled && !DEMO_MODE}>Copiar link</Button></>}>
      {events.length === 0 ? <p className="text-sm text-ink-muted">Nenhum evento programado ou em andamento que você administre.</p> : ev && (
        <div className="space-y-4">
          {events.length > 1 && <Field label="Evento"><Select value={ev.id} onChange={(e) => setEventId(e.target.value)}>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>}
          <p className="text-sm text-ink-muted">Envie este link aos funcionários de <strong className="text-ink">{ev.name}</strong>. Eles informam os dados, tiram uma selfie e aceitam o termo. O cadastro fica <strong className="text-ink">aguardando aprovação</strong> até um administrador do evento conferir.</p>
          <div className={`select-all break-all rounded-btn border border-line bg-bg px-3 py-3 font-mono text-xs ${ev.signup_enabled === false ? 'opacity-50' : ''}`}>{link}</div>
          <Toggle checked={ev.signup_enabled !== false} label={ev.signup_enabled !== false ? 'Link ativo' : 'Link desativado'}
            onChange={(v) => runAction(v ? 'Link ativado' : 'Link desativado', () => setSignupEnabled(ev.id, v), ['events'])} />
          <button type="button" onClick={() => runAction('Novo link gerado. O anterior deixou de funcionar.', () => rotateSignupToken(ev.id), ['events'])}
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-primary"><RefreshCw className="h-4 w-4" />Gerar novo link (invalida o atual)</button>
        </div>
      )}
    </Modal>
  );
}
