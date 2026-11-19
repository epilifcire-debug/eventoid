export type Role = 'admin_master' | 'admin' | 'supervisor' | 'reader' | 'viewer';

export const ROLE_LABEL: Record<Role, string> = {
  admin_master: 'Administrador Master',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  reader: 'Leitura',
  viewer: 'Acompanhamento',
};

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
  avatar_url?: string | null;
  must_change_password?: boolean;
}

export type EventStatus = 'draft' | 'scheduled' | 'active' | 'finished' | 'archived' | 'cancelled';

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Programado',
  active: 'Em andamento',
  finished: 'Encerrado',
  archived: 'Arquivado',
  cancelled: 'Cancelado',
};

export interface EventItem {
  id: string;
  name: string;
  description?: string;
  venue_name: string;
  city: string;
  state: string;
  starts_at: string;
  ends_at: string;
  status: EventStatus;
  manager: string;
  offline_hours: number;
  staff_count: number;
  signup_token?: string | null;
  signup_enabled?: boolean;
}

export interface Sector {
  id: string;
  event_id: string;
  name: string;
  color: string;
  description?: string;
  manager?: string;
  staff_count: number;
  present: number;
  active: boolean;
}

export interface Shift {
  id: string;
  event_id: string;
  sector_id: string;
  name: string;
  start: string;
  end: string;
  tolerance_min: number;
  break_min: number;
}

export type FaceStatus = 'complete' | 'pending' | 'redo' | 'none';
export type EmployeeStatus = 'active' | 'pending' | 'blocked';

export interface Employee {
  id: string;
  code: string;
  full_name: string;
  document: string;
  phone: string;
  email: string;
  event_id: string;
  sector_id: string;
  shift_id: string;
  face_status: FaceStatus;
  consent: boolean;
  status: EmployeeStatus;
  self_registered: boolean;
  photo_path?: string | null;
  link_status?: 'pending' | 'authorized' | 'blocked' | 'cancelled' | null;
  company?: string | null;
}

export type AccessType = 'entry' | 'exit';
export type Decision = 'allowed' | 'denied';

export interface AccessLog {
  id: string;
  event_id: string;
  employee_id: string | null;
  employee_name: string;
  sector_name: string;
  access_type: AccessType;
  decision: Decision;
  reason?: string;
  device_name: string;
  operator_name: string;
  occurred_at: string;
  manual?: boolean;
  was_offline?: boolean;
  company?: string | null;
}

export type ReaderMode = 'entry' | 'exit' | 'auto';
export const READER_MODE_LABEL: Record<ReaderMode, string> = { entry: 'Entrada', exit: 'Saída', auto: 'Automático' };

export interface Device {
  id: string;
  code: string;
  name: string;
  event_id: string | null;
  operator_name: string | null;
  mode: ReaderMode;
  last_sync_at: string;
  battery: number | null;
  app_version: string;
  online: boolean;
  active: boolean;
  pending_sync: number;
}

export interface ReaderConfig {
  id: string;
  operator_id: string;
  operator_name: string;
  event_id: string | null;
  device_id: string | null;
  mode: ReaderMode;
  read_interval_s: number;
  result_time_s: number;
  offline_hours: number;
}

export interface AppUser {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
  events: string[];
  last_login_at: string | null;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entity: string;
  detail: string;
  sensitive: boolean;
  created_at: string;
}

export interface ConsentEntry {
  id: string;
  employee_id?: string;
  employee_name: string;
  term_version: string;
  accepted_at: string | null;
  accepted_by: string;
  status: 'accepted' | 'pending' | 'revoked';
}

export interface AppSettings {
  offline_hours: number;
  offline_warn_hours: number;
  full_sync_hours_before: number;
  queue_alert_threshold: number;
  reread_interval_s: number;
  result_time_s: number;
  denied_streak_alert: number;
  signature_path: string | null;
  signature_visible: boolean;
  signature_link: string | null;
}

export interface AlertItem {
  id: string;
  level: 'warning' | 'danger' | 'info';
  title: string;
  detail: string;
  at: string;
}
