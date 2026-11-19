import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Settings2 } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Alert, Avatar, Badge, Button, Field, Input, MiniStat, Modal, Select } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { ListCard, StatsRow, Toolbar, matches, useDebounced } from '../components/ui/ListKit';
import { useData } from '../hooks/useData';
import { formValues, runAction } from '../lib/actions';
import { saveReaderConfig } from '../services/mutations';
import { toast } from '../components/ui';
import { cx } from '../lib/format';
import { READER_MODE_LABEL, type ReaderConfig, type ReaderMode } from '../types';

export default function Readers() {
  const { data = [], isLoading, error, refetch } = useData('readerConfigs');
  const events = useData('events').data ?? [];
  const devices = useData('devices').data ?? [];
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<ReaderConfig | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [mode, setMode] = useState<ReaderMode>('entry');
  const [saving, setSaving] = useState(false);
  const dq = useDebounced(q);
  const rows = data.filter((r) => matches(dq, r.operator_name));
  const evName = (id: string | null) => events.find((e) => e.id === id)?.name;
  const devName = (id: string | null) => devices.find((d) => d.id === id)?.name;

  const openEdit = (r: ReaderConfig) => { setEdit(r); setEventId(r.event_id); setMode(r.mode); };

  return (
    <Page title="Configuração de leitores" subtitle="Defina operador, evento, dispositivo e modo de leitura.">
      <div className="space-y-5">
        <Toolbar placeholder="Buscar em configuração de leitores..." value={q} onChange={setQ} actionLabel="Configurar leitor" actionIcon={Settings2} onAction={() => { const r = data.find((x) => !x.event_id) ?? data[0]; if (r) openEdit(r); else toast.info('Convide um usuário com perfil Leitura em Usuários e permissões.'); }} />
        <StatsRow>
          <MiniStat label="Leitores configurados" value={data.filter((r) => r.event_id).length} icon={CheckCircle2} tone="success" />
          <MiniStat label="Em operação" value={data.filter((r) => r.event_id && r.device_id).length} icon={Clock} tone="primary" />
          <MiniStat label="Sem evento" value={data.filter((r) => !r.event_id).length} icon={AlertTriangle} tone="warning" />
        </StatsRow>
        <ListCard title="Configuração de leitores" count={rows.length} loading={isLoading} error={error} onRetry={refetch} empty="Nenhum leitor configurado.">
          <DataTable rows={rows} onRowClick={openEdit}
            columns={[
              { key: 'o', header: 'Operador', render: (r) => <span className="flex items-center gap-3"><Avatar name={r.operator_name} size={34} /><span className="font-medium">{r.operator_name}</span></span> },
              { key: 'e', header: 'Evento', render: (r) => evName(r.event_id) ?? <Badge tone="warning">Sem evento</Badge> },
              { key: 'd', header: 'Dispositivo', render: (r) => devName(r.device_id) ?? '—' },
              { key: 'm', header: 'Modo', render: (r) => <Badge tone="primary">{READER_MODE_LABEL[r.mode]}</Badge> },
              { key: 't', header: 'Intervalo / Resultado', render: (r) => <span className="tabular-nums text-ink-muted">{r.read_interval_s}s / {r.result_time_s}s</span>, hideOnTablet: true },
            ]}
            mobile={(r) => <div className="flex items-center gap-3"><Avatar name={r.operator_name} size={40} /><div className="min-w-0 flex-1"><p className="font-medium">{r.operator_name}</p><p className="truncate text-xs text-ink-muted">{evName(r.event_id) ?? 'Sem evento'} · {devName(r.device_id) ?? 'Sem dispositivo'}</p></div><Badge tone="primary">{READER_MODE_LABEL[r.mode]}</Badge></div>} />
        </ListCard>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Leitor — ${edit?.operator_name ?? ''}`} size="lg"
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button><Button type="submit" form="reader-form" loading={saving}>Salvar configuração</Button></>}>
        {edit && (
          <form id="reader-form" className="space-y-5" onSubmit={async (e) => {
            e.preventDefault(); const v = formValues(e.currentTarget); setSaving(true);
            const ok = await runAction('Configuração do leitor salva', () => saveReaderConfig(edit.operator_id, eventId, { ...v, mode }), ['readerConfigs', 'devices', 'users']);
            setSaving(false); if (ok) setEdit(null);
          }}>
            <div>
              <p className="mb-2 text-sm font-medium">Evento ativo <span className="font-normal text-ink-muted">(um único evento)</span></p>
              <div className="space-y-2">
                {events.filter((e) => e.status === 'active' || e.status === 'scheduled').map((e) => {
                  const checked = eventId === e.id;
                  const locked = !!eventId && !checked;
                  return (
                    <label key={e.id} className={cx('flex min-h-[48px] items-center gap-3 rounded-btn border px-3', checked ? 'border-primary bg-primary-light' : 'border-line', locked && 'opacity-50')}>
                      <input type="checkbox" checked={checked} disabled={locked} onChange={() => setEventId(checked ? null : e.id)} className="h-4 w-4 accent-primary" />
                      <span className="flex-1 text-sm font-medium">{e.name}</span>
                      {locked && <span className="text-xs text-ink-muted">Desmarque o atual para trocar</span>}
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-ink-muted">Não há troca automática pela data e o operador não pode trocar o evento.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dispositivo"><Select name="device_id" defaultValue={edit.device_id ?? ''}><option value="">Selecione</option>{devices.filter((d) => d.active).map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}</Select></Field>
              <div>
                <span className="mb-1.5 block text-sm font-medium">Modo</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['entry', 'exit', 'auto'] as ReaderMode[]).map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)} className={cx('min-h-[44px] rounded-btn border text-sm font-semibold', mode === m ? 'border-primary bg-primary text-white' : 'border-line text-ink-muted')}>{READER_MODE_LABEL[m]}</button>
                  ))}
                </div>
              </div>
              <Field label="Intervalo entre leituras do mesmo funcionário (s)"><Input name="read_interval_s" type="number" min={5} max={600} defaultValue={edit.read_interval_s} /></Field>
              <Field label="Tempo do resultado na tela (s)"><Input name="result_time_s" type="number" min={2} max={30} defaultValue={edit.result_time_s} /></Field>
              <Field label="Validade offline (horas)"><Input name="offline_hours" type="number" min={1} max={168} defaultValue={edit.offline_hours} /></Field>
            </div>
            {!eventId && <Alert tone="warning" title="Operador sem evento">Sem evento atribuído, o leitor mostra “Nenhum evento atribuído” e não abre a câmera.</Alert>}
          </form>
        )}
      </Modal>
    </Page>
  );
}
