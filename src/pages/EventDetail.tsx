import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Check, Lock, MapPin, User } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Field, Input, LoadingBlock, Tabs, Textarea, Toggle } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { EmployeeStatusBadge, EventStatusBadge, FaceBadge, OnlineDot } from '../components/ui/status';
import { AccessTable } from './Dashboard';
import { useData } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { canEdit } from '../lib/permissions';
import { formValues, runAction } from '../lib/actions';
import { closeEvent, updateEvent } from '../services/mutations';
import { cx, fmtDateTime, fmtRange, relTime } from '../lib/format';
import { READER_MODE_LABEL } from '../types';

type TabKey = 'summary' | 'employees' | 'sectors' | 'shifts' | 'operators' | 'devices' | 'access' | 'reports' | 'settings' | 'closing';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'summary', label: 'Resumo' }, { key: 'employees', label: 'Funcionários' }, { key: 'sectors', label: 'Setores' },
  { key: 'shifts', label: 'Turnos' }, { key: 'operators', label: 'Operadores' }, { key: 'devices', label: 'Dispositivos' },
  { key: 'access', label: 'Acessos' }, { key: 'reports', label: 'Relatórios' }, { key: 'settings', label: 'Configurações' },
  { key: 'closing', label: 'Encerramento' },
];

const CLOSING = [
  'Impedir novas liberações', 'Sincronizar pendências', 'Conferir quem ainda está presente', 'Corrigir saídas',
  'Registrar motivo nas correções', 'Gerar relatório final', 'Arquivar evento', 'Manter histórico e auditoria',
];

export default function EventDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const events = useData('events');
  const employees = useData('employees');
  const sectors = useData('sectors');
  const shifts = useData('shifts');
  const devices = useData('devices');
  const readers = useData('readerConfigs');
  const logs = useData('accessLogs');
  const stats = useData('stats');
  const [tab, setTab] = useState<TabKey>('summary');
  const [step, setStep] = useState(0);
  const [offline, setOffline] = useState(true);
  const ev = events.data?.find((e) => e.id === id);

  if (events.isLoading) return <Page title="Evento"><LoadingBlock /></Page>;
  if (!ev) return <Page title="Evento"><Card><EmptyState title="Evento não encontrado." action={<Link to="/eventos"><Button variant="outline" icon={ArrowLeft}>Voltar para eventos</Button></Link>} /></Card></Page>;

  const emps = (employees.data ?? []).filter((e) => e.event_id === ev.id);
  const secs = (sectors.data ?? []).filter((s) => s.event_id === ev.id);
  const sectorName = (sid: string) => secs.find((s) => s.id === sid)?.name ?? '—';
  const editable = canEdit(profile?.role);

  return (
    <Page title={ev.name} subtitle="Detalhe do evento">
      <div className="space-y-5">
        <Link to="/eventos" className="inline-flex min-h-[40px] items-center gap-2 text-sm font-medium text-primary"><ArrowLeft className="h-4 w-4" />Eventos</Link>
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold">{ev.name}</h2><EventStatusBadge s={ev.status} /></div>
          {ev.description && <p className="mt-1 text-sm text-ink-muted">{ev.description}</p>}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{fmtRange(ev.starts_at, ev.ends_at)}</span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{ev.venue_name} · {ev.city}/{ev.state}</span>
            <span className="inline-flex items-center gap-1.5"><User className="h-4 w-4" />{ev.manager}</span>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-3 pt-1"><Tabs tabs={TABS} value={tab} onChange={setTab} /></div>
          <div className={tab === 'access' || tab === 'employees' || tab === 'devices' ? '' : 'p-5'}>
            {tab === 'summary' && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[['Escalados', stats.data?.scheduled], ['Presentes', stats.data?.present], ['Entradas', stats.data?.entries], ['Negadas', stats.data?.denied],
                  ['Setores', secs.length], ['Turnos', shifts.data?.length], ['Dispositivos', devices.data?.filter((d) => d.event_id === ev.id).length], ['Validade offline', `${ev.offline_hours} h`]]
                  .map(([l, v]) => <div key={String(l)} className="rounded-btn border border-line p-4"><p className="text-xs text-ink-muted">{l}</p><p className="mt-1 text-xl font-bold">{typeof v === 'number' ? v.toLocaleString('pt-BR') : v ?? 0}</p></div>)}
              </div>
            )}
            {tab === 'employees' && (emps.length === 0 ? <EmptyState title="Nenhum funcionário cadastrado neste evento." action={editable && <Link to="/funcionarios"><Button>Adicionar funcionário</Button></Link>} /> : (
              <DataTable rows={emps}
                columns={[
                  { key: 'n', header: 'Funcionário', render: (r) => <span className="flex items-center gap-3"><Avatar name={r.full_name} size={32} /><span><span className="block font-medium">{r.full_name}</span><span className="text-xs text-ink-muted">{r.code}</span></span></span> },
                  { key: 's', header: 'Setor', render: (r) => sectorName(r.sector_id) },
                  { key: 'f', header: 'Facial', render: (r) => <FaceBadge s={r.face_status} /> },
                  { key: 'st', header: 'Status', render: (r) => <EmployeeStatusBadge s={r.status} /> },
                ]}
                mobile={(r) => <div className="flex items-center gap-3"><Avatar name={r.full_name} size={36} /><div className="flex-1"><p className="font-medium">{r.full_name}</p><p className="text-xs text-ink-muted">{sectorName(r.sector_id)}</p></div><EmployeeStatusBadge s={r.status} /></div>} />
            ))}
            {tab === 'sectors' && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {secs.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-btn border border-line p-4">
                    <span className="h-9 w-1.5 rounded-full" style={{ background: s.color }} />
                    <div className="flex-1"><p className="font-semibold">{s.name}</p><p className="text-xs text-ink-muted">{s.staff_count} escalados · {s.present} presentes</p></div>
                  </div>
                ))}
                {!secs.length && <EmptyState title="Nenhum setor neste evento." />}
              </div>
            )}
            {tab === 'shifts' && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(shifts.data ?? []).map((s) => (
                  <div key={s.id} className="rounded-btn border border-line p-4">
                    <div className="flex items-center justify-between"><p className="font-semibold">{s.name}</p><Badge tone="primary">{sectorName(s.sector_id)}</Badge></div>
                    <p className="mt-1 text-sm tabular-nums">{s.start} – {s.end}</p>
                    <p className="text-xs text-ink-muted">Tolerância {s.tolerance_min} min · Intervalo {s.break_min} min</p>
                  </div>
                ))}
              </div>
            )}
            {tab === 'operators' && (
              <ul className="divide-y divide-line rounded-btn border border-line">
                {(readers.data ?? []).filter((r) => r.event_id === ev.id).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3"><Avatar name={r.operator_name} size={34} /><div className="flex-1"><p className="font-medium">{r.operator_name}</p><p className="text-xs text-ink-muted">Modo {READER_MODE_LABEL[r.mode]}</p></div><Badge tone="success">Atribuído</Badge></li>
                ))}
              </ul>
            )}
            {tab === 'devices' && (
              <DataTable rows={(devices.data ?? []).filter((d) => d.event_id === ev.id)}
                columns={[
                  { key: 'n', header: 'Dispositivo', render: (r) => <span className="font-medium">{r.name}</span> },
                  { key: 'o', header: 'Operador', render: (r) => r.operator_name ?? '—' },
                  { key: 's', header: 'Situação', render: (r) => <OnlineDot online={r.online} /> },
                  { key: 'y', header: 'Última sincronização', render: (r) => relTime(r.last_sync_at) },
                ]}
                mobile={(r) => <div className="flex items-center justify-between"><div><p className="font-medium">{r.name}</p><p className="text-xs text-ink-muted">{relTime(r.last_sync_at)}</p></div><OnlineDot online={r.online} /></div>} />
            )}
            {tab === 'access' && <AccessTable rows={(logs.data ?? []).filter((l) => l.event_id === ev.id).slice(0, 15)} />}
            {tab === 'reports' && <p className="text-sm text-ink-muted">Os relatórios deste evento ficam em <Link to="/relatorios" className="font-medium text-primary">Relatórios</Link>, já filtrados por evento.</p>}
            {tab === 'settings' && (
              <form className="grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={async (e) => {
                e.preventDefault();
                const v = formValues(e.currentTarget);
                await runAction('Configurações do evento salvas', () => updateEvent(ev.id, { offline_hours: Number(v.offline_hours) || 24, offline_enabled: offline }), ['events']);
              }}>
                <Field label="Validade dos dados offline (horas)"><Input name="offline_hours" type="number" min={1} max={168} defaultValue={ev.offline_hours} disabled={!editable} /></Field>
                <Field label="Sincronização completa até"><Input defaultValue="1 hora antes do início" disabled /></Field>
                <div className="sm:col-span-2"><Toggle checked={offline} label="Permitir operação offline neste evento" onChange={setOffline} /></div>
                {editable && <div><Button type="submit">Salvar</Button></div>}
              </form>
            )}
            {tab === 'closing' && (
              <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
                <ol className="space-y-1">
                  {CLOSING.map((c, i) => (
                    <li key={c} className={cx('flex min-h-[44px] items-center gap-3 rounded-btn px-3 text-sm', i === step ? 'bg-primary-light font-semibold text-primary' : i < step ? 'text-success' : 'text-ink-muted')}>
                      <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold', i < step ? 'border-success bg-success text-white' : i === step ? 'border-primary' : 'border-line')}>{i < step ? <Check className="h-4 w-4" /> : i + 1}</span>{c}
                    </li>
                  ))}
                </ol>
                <div className="space-y-4">
                  {step === 0 && <Alert tone="warning" title="Ação irreversível">Ao confirmar, os leitores deste evento deixam de liberar novos acessos.</Alert>}
                  {step === 2 && <Alert tone="info" title={`${Math.max(0, (stats.data?.entries ?? 0) - (stats.data?.exits ?? 0))} pessoas ainda presentes`}>Confira a lista e registre as saídas pendentes.</Alert>}
                  {(step === 3 || step === 4) && <Field label="Motivo da correção" required><Textarea placeholder="Ex.: saída não registrada por queda de energia no Portão B" /></Field>}
                  {step === 7 ? (
                    <Alert tone="success" title="Fluxo de encerramento concluído">O histórico e a auditoria permanecem disponíveis.</Alert>
                  ) : (
                    <Card className="p-4"><p className="text-sm font-semibold">{CLOSING[step]}</p><p className="mt-1 text-sm text-ink-muted">Etapa {step + 1} de {CLOSING.length}.</p></Card>
                  )}
                  {editable && step < 7 && (
                    <Button icon={step === 0 ? Lock : Check} variant={step === 0 ? 'danger' : 'primary'} onClick={async () => {
                      if (step === 0 && !(await runAction('Evento encerrado: novas liberações bloqueadas', () => closeEvent(ev.id), ['events', 'stats']))) return;
                      setStep((s) => s + 1);
                    }}>
                      {step === 0 ? 'Confirmar bloqueio' : 'Concluir etapa'}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
        {tab === 'access' && <p className="text-xs text-ink-muted">Atualizado {fmtDateTime(new Date().toISOString())}</p>}
      </div>
    </Page>
  );
}

