import { ArrowRightToLine, LogOut } from 'lucide-react';
import { Badge } from './index';
import { EVENT_STATUS_LABEL, ROLE_LABEL, type AccessType, type Decision, type EmployeeStatus, type EventStatus, type FaceStatus, type Role } from '../../types';

export function EventStatusBadge({ s }: { s: EventStatus }) {
  const tone = { active: 'success', scheduled: 'primary', draft: 'neutral', finished: 'neutral', archived: 'neutral', cancelled: 'danger' } as const;
  return <Badge tone={tone[s]} dot={s === 'active'}>{EVENT_STATUS_LABEL[s]}</Badge>;
}
export function DecisionBadge({ d }: { d: Decision }) {
  return d === 'allowed' ? <Badge tone="success">Liberado</Badge> : <Badge tone="danger">Negado</Badge>;
}
export function MovementCell({ t, denied }: { t: AccessType; denied?: boolean }) {
  const Icon = t === 'entry' ? ArrowRightToLine : LogOut;
  const color = denied ? 'text-danger' : t === 'entry' ? 'text-success' : 'text-warning';
  return <span className="inline-flex items-center gap-2"><Icon className={`h-4 w-4 ${color}`} />{t === 'entry' ? 'Entrada' : 'Saída'}</span>;
}
export function FaceBadge({ s }: { s: FaceStatus }) {
  const m = { complete: ['success', 'Concluído'], pending: ['warning', 'Em revisão'], redo: ['danger', 'Refazer'], none: ['neutral', 'Sem cadastro'] } as const;
  return <Badge tone={m[s][0]}>{m[s][1]}</Badge>;
}
export function EmployeeStatusBadge({ s }: { s: EmployeeStatus }) {
  const m = { active: ['success', 'Ativo'], pending: ['warning', 'Aguardando aprovação'], blocked: ['danger', 'Bloqueado'] } as const;
  return <Badge tone={m[s][0]}>{m[s][1]}</Badge>;
}
export function RoleBadge({ r }: { r: Role }) {
  const tone = { admin_master: 'navy', admin: 'primary', supervisor: 'primary', reader: 'neutral', viewer: 'neutral' } as const;
  return <Badge tone={tone[r]}>{ROLE_LABEL[r]}</Badge>;
}
export function OnlineDot({ online }: { online: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${online ? 'text-success' : 'text-ink-muted'}`}>
      <span className={`h-2 w-2 rounded-full ${online ? 'bg-success' : 'bg-slate-400'}`} />{online ? 'Online' : 'Offline'}
    </span>
  );
}
