import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileSignature } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Avatar, Badge, Button, Card, CardHeader, MiniStat, Modal } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { ListCard, StatsRow, Toolbar, matches, useDebounced } from '../components/ui/ListKit';
import { useData } from '../hooks/useData';
import { runAction } from '../lib/actions';
import { fmtDateTime } from '../lib/format';
import type { ConsentEntry } from '../types';

const TERM = [
  ['Finalidade da biometria', 'Identificar funcionários na entrada e saída do evento, registrar presença e impedir acessos não autorizados.'],
  ['Prazo de armazenamento', 'Definido pelo Administrador Master conforme a política da empresa (ex.: até 90 dias após o último evento vinculado).'],
  ['Consentimento', 'Coletado no cadastro (pelo administrador ou autocadastro), com data, hora e identificação do aceite.'],
  ['Revogação', 'O funcionário pode revogar a qualquer momento; o acesso passa a ser liberado manualmente.'],
  ['Exclusão ou anonimização', 'Ao revogar ou vencer o prazo, a biometria é excluída e os registros de acesso são anonimizados.'],
];

export default function Privacy() {
  const { data = [], isLoading, error, refetch } = useData('consents');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<ConsentEntry | null>(null);
  const dq = useDebounced(q);
  const rows = data.filter((c) => matches(dq, c.employee_name, c.accepted_by));
  const badge = (s: ConsentEntry['status']) => s === 'accepted' ? <Badge tone="success">Aceito</Badge> : s === 'pending' ? <Badge tone="warning">Pendente</Badge> : <Badge tone="danger">Revogado</Badge>;

  return (
    <Page title="Privacidade e consentimento" subtitle="Gerencie termos, aceites e tratamento da biometria.">
      <div className="space-y-5">
        <Toolbar placeholder="Buscar em privacidade e consentimento..." value={q} onChange={setQ} actionLabel="Novo termo" actionIcon={FileSignature} onAction={() => runAction('Nova versão do termo criada')} />
        <StatsRow>
          <MiniStat label="Consentimentos" value={data.filter((c) => c.status === 'accepted').length} icon={CheckCircle2} tone="success" />
          <MiniStat label="Pendentes" value={data.filter((c) => c.status === 'pending').length} icon={Clock} tone="primary" />
          <MiniStat label="Revogações" value={data.filter((c) => c.status === 'revoked').length} icon={AlertTriangle} tone="warning" />
        </StatsRow>
        <div className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
          <Card className="self-start">
            <CardHeader title="Termo de uso da biometria" subtitle="Versão vigente: v1.2" action={<Badge tone="primary">Vigente</Badge>} />
            <dl className="divide-y divide-line">
              {TERM.map(([k, v]) => <div key={k} className="px-5 py-3.5"><dt className="text-sm font-semibold">{k}</dt><dd className="mt-0.5 text-sm text-ink-muted">{v}</dd></div>)}
            </dl>
          </Card>
          <ListCard title="Aceites" count={rows.length} loading={isLoading} error={error} onRetry={refetch} empty="Nenhum termo ou consentimento cadastrado.">
            <DataTable rows={rows} onRowClick={setSel}
              columns={[
                { key: 'n', header: 'Funcionário', render: (r) => <span className="flex items-center gap-2"><Avatar name={r.employee_name} size={28} />{r.employee_name}</span> },
                { key: 'v', header: 'Versão', render: (r) => r.term_version },
                { key: 'd', header: 'Data e hora', render: (r) => <span className="tabular-nums text-ink-muted">{r.accepted_at ? fmtDateTime(r.accepted_at) : '—'}</span> },
                { key: 'i', header: 'Identificação', render: (r) => <span className="text-ink-muted">{r.accepted_by}</span>, hideOnTablet: true },
                { key: 's', header: 'Status', render: (r) => badge(r.status) },
              ]}
              mobile={(r) => <div className="flex items-center justify-between gap-2"><div><p className="font-medium">{r.employee_name}</p><p className="text-xs text-ink-muted">{r.term_version} · {r.accepted_at ? fmtDateTime(r.accepted_at) : 'sem aceite'}</p></div>{badge(r.status)}</div>} />
          </ListCard>
        </div>
      </div>
      <Modal open={!!sel} onClose={() => setSel(null)} title="Consentimento"
        footer={sel?.status === 'accepted' && <><Button variant="outline" onClick={async () => { await runAction('Consentimento revogado'); setSel(null); }}>Registrar revogação</Button><Button variant="danger" onClick={async () => { await runAction('Biometria excluída e registros anonimizados'); setSel(null); }}>Excluir biometria</Button></>}>
        {sel && <div className="space-y-2 text-sm"><p className="text-base font-semibold">{sel.employee_name}</p><p>Termo {sel.term_version} · {badge(sel.status)}</p><p className="text-ink-muted">Aceite: {sel.accepted_at ? fmtDateTime(sel.accepted_at) : '—'} · {sel.accepted_by}</p></div>}
      </Modal>
    </Page>
  );
}
