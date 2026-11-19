import { useState } from 'react';
import { CheckCircle2, Download, Percent, Ban } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Badge, MiniStat, Select } from '../components/ui';
import { ListCard, StatsRow, Toolbar, matches, useDebounced } from '../components/ui/ListKit';
import { AccessTable } from './Dashboard';
import { useData } from '../hooks/useData';
import { downloadCSV } from '../lib/csv';
import { fmtDateTime } from '../lib/format';

export default function LiveMonitor() {
  const { data = [], isLoading, error, refetch } = useData('accessLogs');
  const [q, setQ] = useState('');
  const [result, setResult] = useState('');
  const [move, setMove] = useState('');
  const [showF, setShowF] = useState(false);
  const dq = useDebounced(q);
  const rows = data.filter((l) => matches(dq, l.employee_name, l.sector_name, l.device_name, l.operator_name) && (!result || l.decision === result) && (!move || l.access_type === move));
  const allowed = data.filter((l) => l.decision === 'allowed').length;

  return (
    <Page title="Monitoramento ao vivo" subtitle="Acompanhe entradas, saídas e negativas em tempo real.">
      <div className="space-y-5">
        <Toolbar placeholder="Buscar em monitoramento ao vivo..." value={q} onChange={setQ} actionLabel="Exportar acessos" actionIcon={Download}
          onAction={() => downloadCSV(`eventoid-acessos-${new Date().toISOString().slice(0, 10)}.csv`, ['Data e hora', 'Funcionário', 'Setor', 'Movimento', 'Resultado', 'Motivo', 'Dispositivo', 'Operador'], rows.map((l) => [fmtDateTime(l.occurred_at), l.employee_name, l.sector_name, l.access_type === 'entry' ? 'Entrada' : 'Saída', l.decision === 'allowed' ? 'Liberado' : 'Negado', l.reason ?? '', l.device_name, l.operator_name]))} onFilters={() => setShowF((v) => !v)} filtersActive={!!(result || move)} />
        {showF && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={result} onChange={(e) => setResult(e.target.value)} aria-label="Resultado"><option value="">Todos os resultados</option><option value="allowed">Liberado</option><option value="denied">Negado</option></Select>
            <Select value={move} onChange={(e) => setMove(e.target.value)} aria-label="Movimento"><option value="">Entradas e saídas</option><option value="entry">Entrada</option><option value="exit">Saída</option></Select>
          </div>
        )}
        <StatsRow>
          <MiniStat label="Acessos" value={data.length} icon={CheckCircle2} tone="success" />
          <MiniStat label="Taxa de liberação" value={data.length ? `${Math.round((allowed / data.length) * 100)}%` : 0} icon={Percent} tone="primary" />
          <MiniStat label="Negadas" value={data.length - allowed} icon={Ban} tone="warning" />
        </StatsRow>
        <ListCard title="Monitoramento ao vivo" count={rows.length} loading={isLoading} error={error} onRetry={refetch} empty="Nenhum acesso registrado."
          action={data.length > 0 && <Badge tone="success" dot>Ao vivo</Badge>}>
          <AccessTable rows={rows} />
        </ListCard>
      </div>
    </Page>
  );
}
