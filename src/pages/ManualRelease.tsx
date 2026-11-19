import { useState } from 'react';
import { ArrowRightToLine, Check, LogOut, Search, ShieldCheck } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Alert, Avatar, Button, Card, CardHeader, EmptyState, Field, Select, Textarea } from '../components/ui';
import { matches, useDebounced } from '../components/ui/ListKit';
import { EmployeeStatusBadge } from '../components/ui/status';
import { useData } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { runAction } from '../lib/actions';
import { manualRelease } from '../services/mutations';
import { cx, fmtDateTime } from '../lib/format';
import type { AccessType, Employee } from '../types';

const REASONS = ['Falha no reconhecimento facial', 'Funcionário sem biometria cadastrada', 'Dispositivo indisponível', 'Correção de saída não registrada', 'Outro'];

export default function ManualRelease() {
  const { profile } = useAuth();
  const employees = useData('employees').data ?? [];
  const sectors = useData('sectors').data ?? [];
  const shifts = useData('shifts').data ?? [];
  const events = useData('events').data ?? [];
  const [q, setQ] = useState('');
  const [emp, setEmp] = useState<Employee | null>(null);
  const [move, setMove] = useState<AccessType>('entry');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const dq = useDebounced(q);
  const results = dq.length >= 2 ? employees.filter((e) => matches(dq, e.full_name, e.code, e.document)).slice(0, 6) : [];

  const reset = () => { setEmp(null); setQ(''); setReason(''); setNote(''); setDone(false); };
  const [saving, setSaving] = useState(false);
  const confirm = async () => {
    if (!emp) return;
    setSaving(true);
    const ok = await runAction('Liberação manual registrada com auditoria',
      () => manualRelease({ event_id: emp.event_id, employee_id: emp.id, access_type: move, reason, note }), ['accessLogs', 'stats', 'audit']);
    setSaving(false);
    if (ok) setDone(true);
  };

  return (
    <Page title="Liberação manual" subtitle="Autorize exceções com justificativa e registro de auditoria.">
      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <Card>
          <div className="p-5">
            <h3 className="mb-3 font-semibold">1. Pesquisar funcionário</h3>
            <label className="relative block">
              <span className="sr-only">Pesquisar</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setEmp(null); setDone(false); }} placeholder="Nome, documento ou código"
                className="min-h-[46px] w-full rounded-btn border border-line pl-10 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
          </div>
          {!emp && (results.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {results.map((e) => (
                <li key={e.id}><button onClick={() => setEmp(e)} className="flex min-h-[56px] w-full items-center gap-3 px-5 py-2 text-left hover:bg-slate-50">
                  <Avatar name={e.full_name} size={36} /><span className="flex-1"><span className="block font-medium">{e.full_name}</span><span className="text-xs text-ink-muted">{e.code}</span></span><EmployeeStatusBadge s={e.status} />
                </button></li>
              ))}
            </ul>
          ) : <EmptyState title="Nenhum funcionário encontrado." text="Pesquise um funcionário para conferir o vínculo e registrar uma liberação." />)}
          {emp && (
            <div className="border-t border-line p-5">
              <h3 className="mb-3 font-semibold">2–3. Conferir foto e vínculo</h3>
              <div className="flex items-center gap-4 rounded-btn bg-bg p-4">
                <Avatar name={emp.full_name} size={72} />
                <div className="text-sm">
                  <p className="text-base font-bold">{emp.full_name}</p>
                  <p className="text-ink-muted">{emp.code}</p>
                  <p className="mt-1">{events.find((e) => e.id === emp.event_id)?.name} · {sectors.find((s) => s.id === emp.sector_id)?.name}</p>
                  <p className="text-ink-muted">Turno {shifts.find((s) => s.id === emp.shift_id)?.name}</p>
                </div>
              </div>
              {emp.status === 'blocked' && <div className="mt-3"><Alert tone="danger" title="Funcionário bloqueado">Confira com a coordenação antes de liberar.</Alert></div>}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="4–6. Registrar liberação" subtitle="Somente Administrador e Supervisor" />
          {!emp ? <EmptyState icon={ShieldCheck} title="Selecione um funcionário" text="O formulário é liberado após conferir a foto e o vínculo." /> : done ? (
            <div className="space-y-4 p-5">
              <Alert tone="success" title="Liberação registrada">Movimento de {move === 'entry' ? 'entrada' : 'saída'} de {emp.full_name}.</Alert>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                {[['Autorizado por', profile?.full_name], ['Data e hora', fmtDateTime(new Date().toISOString())], ['Dispositivo', 'Painel administrativo'], ['Motivo', reason]].map(([k, v]) => <div key={k} className="rounded-btn bg-bg px-3 py-2"><dt className="text-xs text-ink-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
              </dl>
              <Button variant="outline" onClick={reset}>Nova liberação</Button>
            </div>
          ) : (
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-2">
                {([['entry', 'Entrada', ArrowRightToLine], ['exit', 'Saída', LogOut]] as const).map(([k, l, Icon]) => (
                  <button key={k} onClick={() => setMove(k)} className={cx('flex min-h-[52px] items-center justify-center gap-2 rounded-btn border text-sm font-semibold', move === k ? 'border-primary bg-primary text-white' : 'border-line text-ink')}><Icon className="h-4 w-4" />{l}</button>
                ))}
              </div>
              <Field label="Motivo" required error={!reason ? 'Obrigatório' : undefined}>
                <Select value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Selecione o motivo</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</Select>
              </Field>
              <Field label="Observação"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalhes para a auditoria" /></Field>
              <Button icon={Check} disabled={!reason || !emp?.event_id} loading={saving} onClick={confirm} className="w-full">Confirmar liberação</Button>
              <p className="text-xs text-ink-muted">Registra quem autorizou, funcionário, evento, movimento, data e hora, dispositivo, motivo e observação na auditoria.</p>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}
