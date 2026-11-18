import { useState } from 'react';
import { BarChart3, Ban, Clock, FileSpreadsheet, FileText, Hand, LogIn, ScanFace, Timer, TimerOff, UserCheck, Users, Layers } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Button, Card, CardHeader, Field, Input, Select } from '../components/ui';
import { useData } from '../hooks/useData';
import { runAction } from '../lib/actions';
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
];

export default function Reports() {
  const events = useData('events').data ?? [];
  const sectors = useData('sectors').data ?? [];
  const shifts = useData('shifts').data ?? [];
  const devices = useData('devices').data ?? [];
  const users = useData('users').data ?? [];
  const [sel, setSel] = useState('presence');
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
            <Button variant="outline" icon={FileText} onClick={() => runAction(`${current.label} exportado em PDF`)}>PDF</Button>
            <Button icon={FileSpreadsheet} onClick={() => runAction(`${current.label} exportado em Excel`)}>Excel</Button>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-1">
            <Field label="Evento"><Select>{events.map((e) => <option key={e.id}>{e.name}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="De"><Input type="date" /></Field><Field label="Até"><Input type="date" /></Field></div>
            <Field label="Funcionário"><Input placeholder="Todos" /></Field>
            <Field label="Setor"><Select><option>Todos</option>{sectors.map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Turno"><Select><option>Todos</option>{shifts.map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Dispositivo"><Select><option>Todos</option>{devices.map((d) => <option key={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Operador"><Select><option>Todos</option>{users.filter((u) => u.role === 'reader' || u.role === 'supervisor').map((u) => <option key={u.id}>{u.full_name}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Movimento"><Select><option>Todos</option><option>Entrada</option><option>Saída</option></Select></Field>
              <Field label="Resultado"><Select><option>Todos</option><option>Liberado</option><option>Negado</option></Select></Field>
            </div>
          </div>
        </Card>
      </div>
    </Page>
  );
}
