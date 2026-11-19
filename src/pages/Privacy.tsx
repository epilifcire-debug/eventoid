import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileSignature } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Avatar, Badge, Button, Card, CardHeader, MiniStat, Modal } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { ListCard, StatsRow, Toolbar, matches, useDebounced } from '../components/ui/ListKit';
import { useData } from '../hooks/useData';
import { formValues, runAction } from '../lib/actions';
import { createTerm, deleteBiometry, revokeConsent } from '../services/mutations';
import { Alert, Field, Input, Textarea } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import type { ConsentEntry } from '../types';

export default function Privacy() {
  const { data = [], isLoading, error, refetch } = useData('consents');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<ConsentEntry | null>(null);
  const [termOpen, setTermOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const term = useData('currentTerm');
  const dq = useDebounced(q);
  const rows = data.filter((c) => matches(dq, c.employee_name, c.accepted_by));
  const badge = (s: ConsentEntry['status']) => s === 'accepted' ? <Badge tone="success">Aceito</Badge> : s === 'pending' ? <Badge tone="warning">Pendente</Badge> : <Badge tone="danger">Revogado</Badge>;

  return (
    <Page title="Privacidade e consentimento" subtitle="Gerencie termos, aceites e tratamento da biometria.">
      <div className="space-y-5">
        <Toolbar placeholder="Buscar em privacidade e consentimento..." value={q} onChange={setQ} actionLabel="Novo termo" actionIcon={FileSignature} onAction={() => setTermOpen(true)} />
        <StatsRow>
          <MiniStat label="Consentimentos" value={data.filter((c) => c.status === 'accepted').length} icon={CheckCircle2} tone="success" />
          <MiniStat label="Pendentes" value={data.filter((c) => c.status === 'pending').length} icon={Clock} tone="primary" />
          <MiniStat label="Revogações" value={data.filter((c) => c.status === 'revoked').length} icon={AlertTriangle} tone="warning" />
        </StatsRow>
        <div className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
          <Card className="self-start">
            <CardHeader title="Termo de uso da biometria" subtitle={term.data ? `Versão vigente: ${term.data.version}` : 'Nenhum termo cadastrado'} action={term.data && <Badge tone="primary">Vigente</Badge>} />
            {term.data ? (
              <dl className="divide-y divide-line">
                {[['Finalidade da biometria', term.data.purpose], ['Prazo de armazenamento', term.data.retention], ['Termo', term.data.body],
                  ['Revogação', 'Pode ser registrada a qualquer momento; a biometria é excluída e o acesso passa a ser liberado manualmente.']]
                  .map(([k, v]) => <div key={k} className="px-5 py-3.5"><dt className="text-sm font-semibold">{k}</dt><dd className="mt-0.5 whitespace-pre-line text-sm text-ink-muted">{v}</dd></div>)}
              </dl>
            ) : <div className="p-5"><Alert tone="warning" title="Cadastre o termo">Sem um termo vigente, o consentimento não pode ser registrado.</Alert></div>}
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
        footer={sel && sel.status !== 'revoked' && (confirmDel
          ? <><Button variant="outline" onClick={() => setConfirmDel(false)}>Voltar</Button><Button variant="danger" onClick={async () => { if (sel.employee_id && await runAction('Biometria excluída', () => deleteBiometry(sel.employee_id!, sel.id), ['consents', 'employees'])) { setSel(null); setConfirmDel(false); } }}>Confirmar exclusão</Button></>
          : <><Button variant="outline" onClick={async () => { if (await runAction('Consentimento revogado', () => revokeConsent(sel.id), ['consents', 'employees'])) setSel(null); }}>Registrar revogação</Button><Button variant="danger" onClick={() => setConfirmDel(true)}>Excluir biometria</Button></>)}>
        {confirmDel && <div className="mb-4"><Alert tone="danger" title="Ação irreversível">As fotos e descritores faciais deste funcionário serão apagados e o consentimento será marcado como revogado.</Alert></div>}
        {sel && <div className="space-y-2 text-sm"><p className="text-base font-semibold">{sel.employee_name}</p><p>Termo {sel.term_version} · {badge(sel.status)}</p><p className="text-ink-muted">Aceite: {sel.accepted_at ? fmtDateTime(sel.accepted_at) : '—'} · {sel.accepted_by}</p></div>}
      </Modal>

      <Modal open={termOpen} onClose={() => setTermOpen(false)} title="Nova versão do termo" size="lg"
        footer={<><Button variant="outline" onClick={() => setTermOpen(false)}>Cancelar</Button><Button type="submit" form="term-form">Publicar termo</Button></>}>
        <form id="term-form" className="space-y-4" onSubmit={async (e) => {
          e.preventDefault(); const v = formValues(e.currentTarget);
          if (await runAction('Nova versão do termo publicada', () => createTerm(v as never), ['currentTerm'])) setTermOpen(false);
        }}>
          <Field label="Versão" required><Input name="version" required placeholder="Ex.: v1.3" /></Field>
          <Field label="Finalidade da biometria" required><Textarea name="purpose" required /></Field>
          <Field label="Prazo de armazenamento" required><Input name="retention" required /></Field>
          <Field label="Texto completo do termo" required><Textarea name="body" required className="min-h-[160px]" /></Field>
          <p className="text-xs text-ink-muted">A nova versão passa a valer para os próximos aceites. Os aceites anteriores ficam registrados com a versão aceita.</p>
        </form>
      </Modal>
    </Page>
  );
}
