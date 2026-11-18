import { Link } from 'react-router-dom';
import { Ban, CalendarDays, CloudOff, LogOut, MapPin, ArrowRightToLine, Users, Wifi, AlertTriangle, RefreshCw } from 'lucide-react';
import symbol from '../assets/symbol.png';
import { Page } from '../components/layout/AppShell';
import { Avatar, Button, Card, CardHeader, EmptyState, LoadingBlock, StatCard } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { HourlyBars, SectorBars } from '../components/ui/charts';
import { DecisionBadge, EventStatusBadge, MovementCell } from '../components/ui/status';
import { useData } from '../hooks/useData';
import { cx, fmtRange, fmtTime, relTime } from '../lib/format';
import type { AccessLog } from '../types';

function Spark({ tone }: { tone: string }) {
  return (
    <span aria-hidden className="absolute bottom-5 right-5 flex items-end gap-[3px]">
      {[8, 13, 18, 24].map((h) => <span key={h} className={cx('w-[4px] rounded-sm', tone)} style={{ height: h }} />)}
    </span>
  );
}

export default function Dashboard() {
  const events = useData('events');
  const stats = useData('stats');
  const hourly = useData('hourly');
  const sectors = useData('sectors');
  const logs = useData('accessLogs');
  const alerts = useData('alerts');
  const ev = events.data?.find((e) => e.status === 'active') ?? events.data?.[0];
  const s = stats.data;
  const pct = s && s.scheduled ? Math.round((s.present / s.scheduled) * 100) : 0;

  return (
    <Page title="Visão geral" subtitle="Acompanhe em tempo real o acesso e a operação dos seus eventos.">
      <div className="space-y-5">
        {/* Evento ativo */}
        <Card className="p-4 sm:p-5">
          {events.isLoading ? <LoadingBlock rows={2} /> : !ev ? (
            <EmptyState title="Nenhum evento cadastrado." text="Selecione ou cadastre um evento para começar." />
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-btn bg-navy sm:w-44">
                <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(37,99,235,.55),transparent_60%)]" />
                <img src={symbol} alt="" className="relative h-12 w-12 opacity-90 brightness-0 invert" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold text-ink">{ev.name}</h2><EventStatusBadge s={ev.status} /></div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{fmtRange(ev.starts_at, ev.ends_at)}</span>
                  <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{ev.venue_name} · {ev.city} - {ev.state}</span>
                </div>
              </div>
              <Link to={`/eventos/${ev.id}`}><Button variant="outline" className="w-full border-primary text-primary sm:w-auto">Ver detalhes</Button></Link>
            </div>
          )}
        </Card>

        {/* Indicadores */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Presentes" value={s?.present ?? 0} icon={Users} tone="success" hint={s?.scheduled ? undefined : 'Sem dados'}>
            {!!s?.scheduled && (
              <>
                <div className="flex items-center justify-between text-xs text-ink-muted"><span>de {s.scheduled.toLocaleString('pt-BR')} escalados</span><span className="font-semibold text-success">{pct}%</span></div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></div>
              </>
            )}
          </StatCard>
          <div className="relative"><StatCard label="Entradas" value={s?.entries ?? 0} icon={ArrowRightToLine} tone="primary" hint={s?.entries ? 'hoje' : 'Sem dados'} />{!!s?.entries && <Spark tone="bg-primary/70" />}</div>
          <div className="relative"><StatCard label="Saídas" value={s?.exits ?? 0} icon={LogOut} tone="warning" hint={s?.exits ? 'hoje' : 'Sem dados'} />{!!s?.exits && <Spark tone="bg-warning/70" />}</div>
          <div className="relative"><StatCard label="Negadas" value={s?.denied ?? 0} icon={Ban} tone="danger" hint={s?.denied ? 'hoje' : 'Sem dados'} />{!!s?.denied && <Spark tone="bg-danger/60" />}</div>
        </div>

        {/* Operação: dispositivos, sincronização, alertas */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="flex items-center gap-4 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-light text-success"><Wifi className="h-5 w-5" /></span>
            <div className="text-sm"><p className="text-ink-muted">Dispositivos</p><p className="font-semibold text-ink"><span className="text-success">{s?.devicesOnline ?? 0} online</span> · <span className="text-ink-muted">{s?.devicesOffline ?? 0} offline</span></p></div>
          </Card>
          <Card className="flex items-center gap-4 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-light text-warning"><RefreshCw className="h-5 w-5" /></span>
            <div className="text-sm"><p className="text-ink-muted">Pendências de sincronização</p><p className="font-semibold text-ink">{s?.pendingSync ?? 0} registros na fila</p></div>
          </Card>
          <Card className="flex items-center gap-4 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-light text-primary"><Users className="h-5 w-5" /></span>
            <div className="text-sm"><p className="text-ink-muted">Pessoas ainda presentes</p><p className="font-semibold text-ink">{s ? Math.max(0, s.entries - s.exits) : 0} no evento agora</p></div>
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader title="Acessos nas últimas horas" subtitle={hourly.data?.length ? 'Entradas e saídas por horário' : 'Sem movimentação registrada'}
              action={hourly.data?.length ? <div className="flex gap-4 text-xs text-ink-muted"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" />Entradas</span><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />Saídas</span></div> : undefined} />
            <div className="p-4 sm:p-5">{hourly.isLoading ? <LoadingBlock rows={4} /> : hourly.data?.length ? <HourlyBars data={hourly.data} /> : <EmptyState title="Nenhum acesso registrado." />}</div>
          </Card>
          <Card>
            <CardHeader title="Status por setor" subtitle="Pessoas presentes agora" />
            <div className="p-5">{sectors.isLoading ? <LoadingBlock rows={5} /> : sectors.data?.some((x) => x.present) ? <SectorBars sectors={sectors.data} /> : <EmptyState title="Nenhum setor cadastrado." />}</div>
          </Card>
        </div>

        <div className="grid gap-5 2xl:grid-cols-[1.8fr_1fr]">
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative h-2.5 w-2.5 rounded-full bg-success" /></span>Últimos acessos em tempo real</span>}
              subtitle={logs.data?.length ? 'Movimentações mais recentes' : 'Nenhuma atualização disponível'}
              action={<Link to="/monitoramento"><Button variant="outline" className="border-primary text-primary">Ver todos</Button></Link>} />
            {logs.isLoading ? <LoadingBlock /> : !logs.data?.length ? <EmptyState title="Nenhum acesso registrado." /> : <AccessTable rows={logs.data.slice(0, 6)} />}
          </Card>
          <Card>
            <CardHeader title="Alertas administrativos" subtitle="Requerem atenção" />
            {!alerts.data?.length ? <EmptyState icon={AlertTriangle} title="Nenhum alerta no momento." /> : (
              <ul className="divide-y divide-line">
                {alerts.data.map((a) => (
                  <li key={a.id} className="flex gap-3 px-5 py-3.5">
                    <span className={cx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', a.level === 'danger' ? 'bg-danger-light text-danger' : a.level === 'warning' ? 'bg-warning-light text-warning' : 'bg-primary-light text-primary')}>
                      {a.level === 'danger' ? <CloudOff className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 text-sm"><p className="font-medium text-ink">{a.title}</p><p className="text-ink-muted">{a.detail}</p><p className="mt-0.5 text-xs text-slate-400">{relTime(a.at)}</p></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}

export function AccessTable({ rows }: { rows: AccessLog[] }) {
  return (
    <DataTable rows={rows}
      columns={[
        { key: 'n', header: 'Funcionário', render: (r) => <span className="flex items-center gap-3"><Avatar name={r.employee_name} size={32} /><span className="font-medium">{r.employee_name}</span></span> },
        { key: 's', header: 'Setor', render: (r) => r.sector_name },
        { key: 'h', header: 'Horário', render: (r) => <span className="tabular-nums">{fmtTime(r.occurred_at)}</span> },
        { key: 'm', header: 'Movimento', render: (r) => <MovementCell t={r.access_type} denied={r.decision === 'denied'} /> },
        { key: 'r', header: 'Resultado', render: (r) => <DecisionBadge d={r.decision} /> },
        { key: 'd', header: 'Dispositivo', render: (r) => r.device_name, hideOnTablet: true },
        { key: 'o', header: 'Operador', render: (r) => <span className="text-ink-muted">{r.operator_name}</span>, hideOnTablet: true },
      ]}
      mobile={(r) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.employee_name} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{r.employee_name}</p>
            <p className="truncate text-xs text-ink-muted">{r.sector_name} · {r.device_name}</p>
          </div>
          <div className="text-right"><DecisionBadge d={r.decision} /><p className="mt-1 text-xs tabular-nums text-ink-muted">{r.access_type === 'entry' ? 'Entrada' : 'Saída'} · {fmtTime(r.occurred_at)}</p></div>
        </div>
      )}
    />
  );
}
