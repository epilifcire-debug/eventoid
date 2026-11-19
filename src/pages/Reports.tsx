import { useState } from 'react';
import { BarChart3, Ban, Building2, Clock, FileSpreadsheet, FileText, Hand, LogIn, ScanFace, Timer, TimerOff, UserCheck, Users, Layers } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Button, Card, CardHeader, Field, Input, Select } from '../components/ui';
import { useData } from '../hooks/useData';
import { downloadCSV } from '../lib/csv';
import { fmtDateTime } from '../lib/format';
import { toast } from '../components/ui';
import { cx } from '../lib/format';

const REPORTS = [
  { key: 'presence', label: 'Presença', icon: UserCheck, desc: 'Escalados × presentes por evento e dia' },
  { key: 'moves', label: 'Entradas e saídas', icon: LogIn, desc: 'Todos os movimentos com horário e dispositivo' },
  { key: 'still', label: 'Pessoas ainda presentes', icon: Users, desc: 'Última movimentação = entrada' },
  { key: 'punct', label: 'Pontualidade', icon: Clock, desc: 'Chegadas dentro da tolerância do turno' },
  { key: 'late', label: 'Atrasos', icon: Timer, desc: 'Entradas após a tolerância' },
  { key: 'early', label: 'Saídas antecipadas', icon: TimerOff, desc: 'Saídas antes do previsto' },
  { key: 'hours', label: 'Horas trabalhadas', icon: BarChart3, desc: 'Soma por funcionário, setor e turno' },
  { key: 'denied', label: 'Acessos negados', icon: Ban, desc: 'Negativas com motivo' },
  { key: 'manual', label: 'Liberações manuais', icon: Hand, desc: 'Quem autorizou e por quê' },
  { key: 'fail', label: 'Falhas de reconhecimento', icon: ScanFace, desc: 'Rostos não reconhecidos por dispositivo' },
  { key: 'bysector', label: 'Funcionários por setor', icon: Layers, desc: 'Distribuição da equipe' },
  { key: 'bycompany', label: 'Funcionários por empresa', icon: Building2, desc: 'Equipe própria e terceirizadas' },
];

export default function Reports() {
  const events = useData('events').data ?? [];
  const sectors = useData('sectors').data ?? [];
  const shifts = useData('shifts').data ?? [];
  const devices = useData('devices').data ?? [];
  const users = useData('users').data ?? [];
  const logs = useData('accessLogs').data ?? [];
  const employees = useData('employees').data ?? [];
  const [sel, setSel] = useState('presence');
  const [f, setF] = useState({ event: '', from: '', to: '', emp: '', company: '', sector: '', device: '', op: '', move: '', result: '' });
  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const filtered = logs.filter((l) =>
    (!f.event || l.event_id === f.event) && (!f.from || l.occurred_at >= f.from) && (!f.to || l.occurred_at <= `${f.to}T23:59:59`) &&
    (!f.emp || l.employee_name.toLowerCase().includes(f.emp.toLowerCase())) && (!f.company || l.company === f.company) && (!f.sector || l.sector_name === f.sector) &&
    (!f.device || l.device_name === f.device) && (!f.op || l.operator_name === f.op) && (!f.move || l.access_type === f.move) && (!f.result || l.decision === f.result));
  const companies = [...new Set([...logs.map((l) => l.company), ...employees.map((e) => e.company)].filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const exportExcel = () => {
    const name = `eventoid-${sel}-${new Date().toISOString().slice(0, 10)}.csv`;
    if (sel === 'bycompany') {
      const m = new Map<string, number>();
      employees.filter((e) => !f.event || e.event_id === f.event).forEach((e) => m.set(e.company ?? 'Sem empresa', (m.get(e.company ?? 'Sem empresa') ?? 0) + 1));
      return downloadCSV(name, ['Empresa', 'Funcionários'], [...m.entries()].sort((a, b) => b[1] - a[1]));
    }
    if (sel === 'bysector') {
      return downloadCSV(name, ['Setor', 'Escalados', 'Presentes'], sectors.filter((s) => !f.event || s.event_id === f.event).map((s) => [s.name, s.staff_count, s.present]));
    }
    if (sel === 'still') {
      const last = new Map<string, (typeof logs)[number]>();
      [...filtered].reverse().forEach((l) => { if (l.decision === 'allowed' && l.employee_id) last.set(l.employee_id, l); });
      return downloadCSV(name, ['Funcionário', 'Empresa', 'Setor', 'Entrada', 'Dispositivo'], [...last.values()].filter((l) => l.access_type === 'entry').map((l) => [l.employee_name, l.company ?? '', l.sector_name, fmtDateTime(l.occurred_at), l.device_name]));
    }
    if (sel === 'presence') {
      return downloadCSV(name, ['Código', 'Funcionário', 'Empresa', 'Situação'], employees.filter((e) => (!f.event || e.event_id === f.event) && (!f.company || e.company === f.company)).map((e) => [e.code, e.full_name, e.company ?? '',
        filtered.some((l) => l.employee_id === e.id && l.decision === 'allowed') ? 'Presente' : 'Ausente']));
    }
    const rows = filtered.filter((l) => sel === 'denied' || sel === 'fail' ? l.decision === 'denied' && (sel === 'denied' || l.reason === 'Rosto não reconhecido') : sel === 'manual' ? l.manual : true);
    if (['punct', 'late', 'early', 'hours'].includes(sel)) toast.info('Este relatório usa os turnos; por enquanto o arquivo traz todos os movimentos para cálculo.');
    downloadCSV(name, ['Data e hora', 'Funcionário', 'Empresa', 'Setor', 'Movimento', 'Resultado', 'Motivo', 'Dispositivo', 'Operador', 'Manual', 'Offline'],
      rows.map((l) => [fmtDateTime(l.occurred_at), l.employee_name, l.company ?? '', l.sector_name, l.access_type === 'entry' ? 'Entrada' : 'Saída', l.decision === 'allowed' ? 'Liberado' : 'Negado', l.reason ?? '', l.device_name, l.operator_name, l.manual ? 'Sim' : 'Não', l.was_offline ? 'Sim' : 'Não']));
  };
  const current = REPORTS.find((r) => r.key === sel)!;

  return (
    <Page title="Relatórios" subtitle="Consulte e exporte indicadores da operação.">
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map(({ key, label, icon: Icon, desc }) => (
            <button key={key} onClick={() => setSel(key)} aria-pressed={sel === key}
              className={cx('flex min-h-[96px] items-start gap-3 rounded-card border bg-white p-4 text-left shadow-card transition', sel === key ? 'border-primary ring-2 ring-primary/15' : 'border-line hover:border-slate-300')}>
              <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', sel === key ? 'bg-primary text-white' : 'bg-primary-light text-primary')}><Icon className="h-5 w-5" /></span>
              <span><span className="block font-semibold text-ink">{label}</span><span className="mt-0.5 block text-xs text-ink-muted">{desc}</span></span>
            </button>
          ))}
        </div>
        <Card className="self-start xl:sticky xl:top-24">
          <CardHeader title={current.label} subtitle="Defina os filtros e exporte" />
          <div className="grid grid-cols-2 gap-2 border-b border-line p-5">
            <Button variant="outline" icon={FileText} onClick={() => window.print()}>PDF</Button>
            <Button icon={FileSpreadsheet} onClick={exportExcel}>Excel</Button>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-1">
            <Field label="Evento"><Select value={f.event} onChange={upd('event')}><option value="">Todos</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="De"><Input type="date" value={f.from} onChange={upd('from')} /></Field><Field label="Até"><Input type="date" value={f.to} onChange={upd('to')} /></Field></div>
            <Field label="Funcionário"><Input placeholder="Todos" value={f.emp} onChange={upd('emp')} /></Field>
            <Field label="Empresa"><Select value={f.company} onChange={upd('company')}><option value="">Todas</option>{companies.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Setor"><Select value={f.sector} onChange={upd('sector')}><option value="">Todos</option>{[...new Set(sectors.map((s) => s.name))].map((n) => <option key={n}>{n}</option>)}</Select></Field>
            <Field label="Turno"><Select><option>Todos</option>{shifts.map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Dispositivo"><Select value={f.device} onChange={upd('device')}><option value="">Todos</option>{devices.map((d) => <option key={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Operador"><Select value={f.op} onChange={upd('op')}><option value="">Todos</option>{users.filter((u) => u.role === 'reader' || u.role === 'supervisor').map((u) => <option key={u.id}>{u.full_name}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Movimento"><Select value={f.move} onChange={upd('move')}><option value="">Todos</option><option value="entry">Entrada</option><option value="exit">Saída</option></Select></Field>
              <Field label="Resultado"><Select value={f.result} onChange={upd('result')}><option value="">Todos</option><option value="allowed">Liberado</option><option value="denied">Negado</option></Select></Field>
            </div>
          </div>
        </Card>
      </div>
    </Page>
  );
}
