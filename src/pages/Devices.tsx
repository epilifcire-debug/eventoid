import { useState } from 'react';
import { BatteryMedium, CheckCircle2, CloudOff, Power, RefreshCw } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Badge, Button, Field, Input, MiniStat, Modal, Select } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { ListCard, StatsRow, Toolbar, matches, useDebounced } from '../components/ui/ListKit';
import { OnlineDot } from '../components/ui/status';
import { useData } from '../hooks/useData';
import { runAction } from '../lib/actions';
import { relTime } from '../lib/format';
import { READER_MODE_LABEL, type Device } from '../types';

export default function Devices() {
  const { data = [], isLoading, error, refetch } = useData('devices');
  const events = useData('events').data ?? [];
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [off, setOff] = useState<Device | null>(null);
  const dq = useDebounced(q);
  const rows = data.filter((d) => matches(dq, d.name, d.code, d.operator_name));
  const evName = (id: string | null) => events.find((e) => e.id === id)?.name ?? '—';
  const stale = (d: Device) => Date.now() - new Date(d.last_sync_at).getTime() > 6 * 3600_000;

  return (
    <Page title="Dispositivos" subtitle="Acompanhe leitores, sincronização e disponibilidade.">
      <div className="space-y-5">
        <Toolbar placeholder="Buscar em dispositivos..." value={q} onChange={setQ} actionLabel="Novo dispositivo" onAction={() => setCreating(true)} />
        <StatsRow>
          <MiniStat label="Online" value={data.filter((d) => d.online).length} icon={CheckCircle2} tone="success" />
          <MiniStat label="Offline" value={data.filter((d) => !d.online && d.active).length} icon={CloudOff} tone="primary" />
          <MiniStat label="Sincronizando" value={data.reduce((a, d) => a + d.pending_sync, 0)} icon={RefreshCw} tone="warning" />
        </StatsRow>
        <ListCard title="Dispositivos" count={rows.length} loading={isLoading} error={error} onRetry={refetch} empty="Nenhum dispositivo cadastrado.">
          <DataTable rows={rows}
            columns={[
              { key: 'n', header: 'Dispositivo', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-ink-muted">{r.code} · v{r.app_version}</p></div> },
              { key: 'e', header: 'Evento / Operador', render: (r) => <div className="text-sm"><p>{evName(r.event_id)}</p><p className="text-xs text-ink-muted">{r.operator_name ?? 'Sem operador'}</p></div> },
              { key: 'm', header: 'Modo', render: (r) => <Badge tone="primary">{READER_MODE_LABEL[r.mode]}</Badge>, hideOnTablet: true },
              { key: 's', header: 'Última sincronização', render: (r) => <div><p className={stale(r) && r.active ? 'font-medium text-[#B45309]' : ''}>{relTime(r.last_sync_at)}</p>{r.pending_sync > 0 && <p className="text-xs text-[#B45309]">{r.pending_sync} na fila</p>}</div> },
              { key: 'b', header: 'Bateria', render: (r) => r.battery == null ? <span className="text-ink-muted">—</span> : <span className={`inline-flex items-center gap-1 ${r.battery < 20 ? 'text-danger' : ''}`}><BatteryMedium className="h-4 w-4" />{r.battery}%</span>, hideOnTablet: true },
              { key: 'o', header: 'Situação', render: (r) => r.active ? <OnlineDot online={r.online} /> : <Badge>Desativado</Badge> },
              { key: 'a', header: '', className: 'text-right', render: (r) => r.active && <Button variant="ghost" icon={Power} aria-label={`Desativar ${r.name}`} onClick={(e) => { e.stopPropagation(); setOff(r); }} /> },
            ]}
            mobile={(r) => (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1"><p className="font-medium">{r.name}</p><p className="truncate text-xs text-ink-muted">{r.operator_name ?? 'Sem operador'} · sincronizado {relTime(r.last_sync_at)}</p></div>
                {r.active ? <OnlineDot online={r.online} /> : <Badge>Desativado</Badge>}
              </div>
            )} />
        </ListCard>
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title="Novo dispositivo"
        footer={<><Button variant="outline" onClick={() => setCreating(false)}>Cancelar</Button><Button onClick={async () => { await runAction('Dispositivo cadastrado'); setCreating(false); }}>Salvar</Button></>}>
        <div className="space-y-4">
          <Field label="Nome" required><Input placeholder="Ex.: Portão C" /></Field>
          <Field label="Código" hint="Gerado automaticamente"><Input disabled placeholder="DSP-006" /></Field>
          <Field label="Evento"><Select>{events.map((e) => <option key={e.id}>{e.name}</option>)}</Select></Field>
        </div>
      </Modal>
      <Modal open={!!off} onClose={() => setOff(null)} title="Desativar dispositivo"
        footer={<><Button variant="outline" onClick={() => setOff(null)}>Cancelar</Button><Button variant="danger" onClick={async () => { await runAction('Dispositivo desativado remotamente'); setOff(null); }}>Desativar</Button></>}>
        <p className="text-sm">O dispositivo <strong>{off?.name}</strong> deixará de registrar acessos imediatamente. Registros pendentes na fila ainda serão sincronizados.</p>
      </Modal>
    </Page>
  );
}
