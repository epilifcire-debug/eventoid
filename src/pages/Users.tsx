import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Mail } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Alert, Avatar, Badge, Button, Field, Input, MiniStat, Modal, Select } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { ListCard, StatsRow, Toolbar, matches, useDebounced } from '../components/ui/ListKit';
import { RoleBadge } from '../components/ui/status';
import { useAuth } from '../hooks/useAuth';
import { useData } from '../hooks/useData';
import { formValues, runAction } from '../lib/actions';
import { inviteUser, setUserActive } from '../services/mutations';
import type { AppUser } from '../types';
import { relTime } from '../lib/format';
import { ROLE_LABEL, type Role } from '../types';

export default function Users() {
  const { profile } = useAuth();
  const { data = [], isLoading, error, refetch } = useData('users');
  const events = useData('events').data ?? [];
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>('reader');
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState<AppUser | null>(null);
  const openEvents = events.filter((e) => !['finished', 'archived', 'cancelled'].includes(e.status));
  const dq = useDebounced(q);
  const rows = data.filter((u) => matches(dq, u.full_name, u.email, ROLE_LABEL[u.role]));
  const evName = (id: string) => events.find((e) => e.id === id)?.name ?? id;
  // Admin não cria Admin Master; Admin Master cria todos.
  const allowedRoles: Role[] = profile?.role === 'admin_master' ? ['admin_master', 'admin', 'supervisor', 'reader', 'viewer'] : ['supervisor', 'reader', 'viewer'];

  return (
    <Page title="Usuários e permissões" subtitle="Gerencie perfis e eventos autorizados.">
      <div className="space-y-5">
        <Toolbar placeholder="Buscar em usuários e permissões..." value={q} onChange={setQ} actionLabel="Convidar usuário" onAction={() => setOpen(true)} />
        <StatsRow>
          <MiniStat label="Usuários ativos" value={data.filter((u) => u.active).length} icon={CheckCircle2} tone="success" />
          <MiniStat label="Operadores de leitura" value={data.filter((u) => u.role === 'reader').length} icon={Clock} tone="primary" />
          <MiniStat label="Acessos limitados" value={data.filter((u) => u.role === 'viewer' || (u.role === 'reader' && u.events.length === 0)).length} icon={AlertTriangle} tone="warning" />
        </StatsRow>
        <ListCard title="Usuários e permissões" count={rows.length} loading={isLoading} error={error} onRetry={refetch} empty="Nenhum usuário cadastrado.">
          <DataTable rows={rows} onRowClick={(r) => profile?.id !== r.id && setSel(r)}
            columns={[
              { key: 'n', header: 'Usuário', render: (r) => <span className="flex items-center gap-3"><Avatar name={r.full_name} size={34} tone={r.role === 'admin_master' ? 'dark' : 'light'} /><span><span className="block font-medium">{r.full_name}</span><span className="text-xs text-ink-muted">{r.email}</span></span></span> },
              { key: 'p', header: 'Perfil', render: (r) => <RoleBadge r={r.role} /> },
              { key: 'e', header: 'Eventos autorizados', render: (r) => r.events.length ? <span className="text-ink-muted">{r.role === 'admin_master' ? 'Todos' : r.events.map(evName).join(', ')}</span> : <Badge tone="warning">Sem evento</Badge> },
              { key: 'l', header: 'Último acesso', render: (r) => <span className="text-ink-muted">{r.last_login_at ? relTime(r.last_login_at) : 'Nunca'}</span>, hideOnTablet: true },
              { key: 's', header: 'Status', render: (r) => r.active ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge> },
            ]}
            mobile={(r) => <div className="flex items-center gap-3"><Avatar name={r.full_name} size={40} /><div className="min-w-0 flex-1"><p className="truncate font-medium">{r.full_name}</p><p className="truncate text-xs text-ink-muted">{r.email}</p></div><RoleBadge r={r.role} /></div>} />
        </ListCard>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Convidar usuário" size="lg"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" form="invite-form" icon={Mail} loading={saving}>Enviar convite</Button></>}>
        <form id="invite-form" noValidate onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const v = formValues(e.currentTarget);
          const event_ids = fd.getAll('event_ids').map(String).filter(Boolean);
          setSaving(true);
          const ok = await runAction('Convite enviado por e-mail', () => inviteUser({ full_name: v.full_name, email: v.email, role, event_ids }), ['users', 'readerConfigs']);
          setSaving(false); if (ok) setOpen(false);
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" required><Input name="full_name" required /></Field>
            <Field label="E-mail" required><Input name="email" type="email" inputMode="email" required /></Field>
            <Field label="Perfil" required><Select value={role} onChange={(e) => setRole(e.target.value as Role)}>{allowedRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
          </div>
          {role !== 'admin_master' && (
            <fieldset className="mt-4">
              <legend className="mb-2 text-sm font-medium">{role === 'reader' ? 'Evento (único)' : 'Eventos autorizados'}</legend>
              <div className="space-y-2">
                {role === 'reader' && <label className="flex min-h-[44px] items-center gap-3 rounded-btn border border-line px-3 text-sm"><input type="radio" name="event_ids" value="" defaultChecked className="accent-primary" />Definir depois</label>}
                {openEvents.map((ev) => (
                  <label key={ev.id} className="flex min-h-[44px] items-center gap-3 rounded-btn border border-line px-3 text-sm">
                    <input type={role === 'reader' ? 'radio' : 'checkbox'} name="event_ids" value={ev.id} className="h-4 w-4 accent-primary" />{ev.name}
                  </label>
                ))}
                {openEvents.length === 0 && <p className="text-sm text-ink-muted">Nenhum evento disponível.</p>}
              </div>
            </fieldset>
          )}
          <div className="mt-4 space-y-3">
            {role === 'reader' && <Alert tone="info" title="Perfil Leitura">Abre direto no leitor facial, sem menu e sem trocar de evento. Somente um evento ativo por operador.</Alert>}
            <p className="text-xs text-ink-muted">O usuário recebe um convite por e-mail e define a senha no primeiro acesso. Nenhuma senha é criada pelo administrador.</p>
          </div>
        </form>
      </Modal>

      <Modal open={!!sel} onClose={() => setSel(null)} title="Usuário"
        footer={sel && (sel.active
          ? <Button variant="danger" onClick={async () => { if (await runAction('Usuário desativado', () => setUserActive(sel.id, false), ['users'])) setSel(null); }}>Desativar acesso</Button>
          : <Button variant="success" onClick={async () => { if (await runAction('Usuário ativado', () => setUserActive(sel.id, true), ['users'])) setSel(null); }}>Ativar acesso</Button>)}>
        {sel && <div className="flex items-center gap-4"><Avatar name={sel.full_name} size={56} /><div><p className="text-lg font-bold">{sel.full_name}</p><p className="text-sm text-ink-muted">{sel.email}</p><div className="mt-1"><RoleBadge r={sel.role} /></div></div></div>}
        <p className="mt-4 text-xs text-ink-muted">Para trocar o evento de um operador de Leitura, use Configuração de leitores.</p>
      </Modal>
    </Page>
  );
}
