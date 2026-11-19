/**
 * Gravações no Supabase. As telas chamam estas funções via runAction() (src/lib/actions.ts),
 * que cuida do modo demonstração, mensagens de erro e atualização das listas.
 * Toda autorização é validada no banco (RLS + funções). Nada aqui confia na interface.
 */
import { supabase } from '../lib/supabase';
import type { AccessType, EventStatus, ReaderMode, Role } from '../types';

function db() {
  if (!supabase) throw new Error('Servidor não configurado.');
  return supabase;
}
async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}
const nul = (v?: string | null) => (v && v.trim() ? v.trim() : null);
const num = (v: string | number | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : d; };
const toIso = (v?: string) => (v ? new Date(v).toISOString() : null);

/* ---------------- Eventos ---------------- */
export interface EventInput {
  name: string; description?: string; venue_name?: string; city?: string; state?: string;
  starts_at?: string; ends_at?: string; manager_name?: string; status?: EventStatus; offline_hours?: string;
}
export async function createEvent(v: EventInput) {
  if (!v.name?.trim()) throw new Error('Informe o nome do evento.');
  if (v.starts_at && v.ends_at && new Date(v.ends_at) < new Date(v.starts_at)) throw new Error('A data final precisa ser depois da inicial.');
  return ok(db().from('events').insert({
    name: v.name.trim(), description: nul(v.description), venue_name: nul(v.venue_name), city: nul(v.city),
    state: nul(v.state)?.toUpperCase().slice(0, 2) ?? null, starts_at: toIso(v.starts_at), ends_at: toIso(v.ends_at),
    manager_name: nul(v.manager_name), status: v.status ?? 'draft', offline_hours: num(v.offline_hours, 24),
  }).select('id').single());
}
export async function updateEvent(id: string, patch: { offline_hours?: number; offline_enabled?: boolean; status?: EventStatus }) {
  return ok(db().from('events').update(patch).eq('id', id));
}
export async function closeEvent(id: string) {
  return ok(db().rpc('close_event', { p_event_id: id }));
}

/* ---------------- Setores e turnos ---------------- */
export async function createSector(v: { event_id: string; name: string; color: string; description?: string; manager_name?: string }) {
  if (!v.event_id) throw new Error('Selecione o evento.');
  if (!v.name?.trim()) throw new Error('Informe o nome do setor.');
  return ok(db().from('sectors').insert({ event_id: v.event_id, name: v.name.trim(), color: v.color, description: nul(v.description), manager_name: nul(v.manager_name) }));
}
export async function createShift(v: { event_id: string; sector_id?: string; name: string; start: string; end: string; tolerance_min?: string; break_min?: string }) {
  if (!v.event_id) throw new Error('Selecione o evento.');
  if (!v.name?.trim() || !v.start || !v.end) throw new Error('Preencha nome, entrada e saída previstas.');
  return ok(db().from('shifts').insert({
    event_id: v.event_id, sector_id: nul(v.sector_id), name: v.name.trim(), starts_time: v.start, ends_time: v.end,
    tolerance_min: Number(v.tolerance_min ?? 10) || 0, break_min: Number(v.break_min ?? 0) || 0,
  }));
}

/* ---------------- Funcionários ---------------- */
export interface EmployeeInput { full_name: string; cpf?: string; phone?: string; email?: string; company?: string; event_id?: string; sector_id?: string; shift_id?: string }
export async function createEmployee(v: EmployeeInput): Promise<string> {
  if (!v.full_name?.trim()) throw new Error('Informe o nome completo.');
  const cpf = (v.cpf ?? '').replace(/\D/g, '');
  if (cpf && cpf.length !== 11) throw new Error('CPF incompleto.');
  const emp = (await ok(db().from('employees').insert({
    full_name: v.full_name.trim(), cpf: cpf || null, phone: nul(v.phone), email: nul(v.email), registration_status: 'complete',
  }).select('id').single())) as { id: string };
  if (v.event_id) {
    const { error } = await db().from('event_employees').insert({
      event_id: v.event_id, employee_id: emp.id, sector_id: nul(v.sector_id), shift_id: nul(v.shift_id), company_name: nul(v.company), access_status: 'authorized',
    });
    if (error) throw new Error(`Funcionário criado, mas o vínculo falhou: ${error.message}`);
  }
  return emp.id;
}
export async function approveEmployee(id: string) {
  await ok(db().from('employees').update({ registration_status: 'complete' }).eq('id', id));
  return ok(db().from('event_employees').update({ access_status: 'authorized' }).eq('employee_id', id).eq('access_status', 'pending'));
}
export async function setEmployeeBlocked(id: string, blocked: boolean) {
  return ok(db().from('employees').update({ registration_status: blocked ? 'blocked' : 'complete' }).eq('id', id));
}

/* ---------------- Cadastro facial ---------------- */
const ANGLES = ['front', 'left', 'right'] as const;
export async function saveFaceCaptures(employeeId: string, shots: Array<Blob | null>) {
  if (!employeeId) throw new Error('Selecione o funcionário.');
  if (!shots[0]) throw new Error('A foto frontal é obrigatória.');
  const sb = db();
  // desativa capturas anteriores (a frontal antiga deixa de ser a principal)
  await ok(sb.from('employee_faces').update({ active: false, is_primary: false }).eq('employee_id', employeeId).eq('active', true));
  const stamp = Date.now();
  for (let i = 0; i < shots.length; i++) {
    const blob = shots[i];
    if (!blob) continue;
    const path = `employees/${employeeId}/${stamp}-${ANGLES[i]}.jpg`;
    const up = await sb.storage.from('employee-faces').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw new Error(`Falha ao enviar a foto: ${up.error.message}`);
    await ok(sb.from('employee_faces').insert({
      employee_id: employeeId, photo_path: path, angle: ANGLES[i], is_primary: i === 0, review_status: 'approved',
      // descriptor: calculado pelo módulo de reconhecimento (face-api.js) na próxima etapa
    }));
    if (i === 0) await ok(sb.from('employees').update({ photo_url: path }).eq('id', employeeId));
  }
}

/* ---------------- Usuários (convite via Edge Function com service_role no servidor) ---------------- */
export async function inviteUser(v: { full_name: string; email: string; role: Role; event_ids: string[] }) {
  if (!v.full_name?.trim() || !v.email?.trim()) throw new Error('Informe nome e e-mail.');
  if (v.role === 'reader' && v.event_ids.length > 1) throw new Error('O perfil Leitura aceita só um evento.');
  const { data, error } = await db().functions.invoke('invite-user', {
    body: { ...v, email: v.email.trim().toLowerCase(), redirect_to: `${location.origin}/login` },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new Error(body?.error ?? 'Não foi possível enviar o convite.');
  }
  return data;
}
export async function setUserActive(id: string, active: boolean) {
  return ok(db().from('profiles').update({ active }).eq('id', id));
}

/* ---------------- Leitores ---------------- */
export async function saveReaderConfig(userId: string, eventId: string | null, v: { device_id?: string; mode: ReaderMode; read_interval_s?: string; result_time_s?: string; offline_hours?: string }) {
  const sb = db();
  const deviceId = nul(v.device_id);
  await ok(sb.from('reader_settings').upsert({
    user_id: userId, device_id: deviceId, mode: v.mode,
    read_interval_s: num(v.read_interval_s, 20), result_time_s: num(v.result_time_s, 5), offline_hours: num(v.offline_hours, 24),
  }));
  await ok(sb.rpc('assign_reader_event', { p_user: userId, p_event: eventId }));
  if (deviceId) {
    // o dispositivo passa a ser deste operador, no evento atribuído
    await ok(sb.from('devices').update({ reader_user_id: null }).eq('reader_user_id', userId).neq('id', deviceId));
    await ok(sb.from('devices').update({ reader_user_id: userId, event_id: eventId }).eq('id', deviceId));
  }
}

/* ---------------- Dispositivos ---------------- */
export async function createDevice(v: { name: string; device_code: string; event_id?: string }) {
  if (!v.name?.trim()) throw new Error('Informe o nome do dispositivo.');
  const code = v.device_code?.trim().toUpperCase() || `DSP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  return ok(db().from('devices').insert({ name: v.name.trim(), device_code: code, event_id: nul(v.event_id) }));
}
export async function setDeviceActive(id: string, active: boolean) {
  return ok(db().from('devices').update({ active }).eq('id', id));
}

/* ---------------- Liberação manual ---------------- */
export async function manualRelease(v: { event_id: string; employee_id: string; access_type: AccessType; reason: string; note?: string }) {
  if (!v.reason) throw new Error('Informe o motivo.');
  return ok(db().rpc('manual_release', { p_event_id: v.event_id, p_employee_id: v.employee_id, p_access_type: v.access_type, p_reason: v.reason, p_note: nul(v.note) }));
}

/* ---------------- Configurações e assinatura ---------------- */
export interface SettingsPatch {
  offline_hours?: number; offline_warn_hours?: number; full_sync_hours_before?: number; queue_alert_threshold?: number;
  reread_interval_s?: number; result_time_s?: number; denied_streak_alert?: number;
  signature_visible?: boolean; signature_link?: string | null; signature_path?: string | null;
}
export async function saveSettings(patch: SettingsPatch) {
  return ok(db().from('app_settings').update(patch).eq('id', true));
}
export async function uploadSignature(file: File): Promise<string> {
  const ext = file.type === 'image/svg+xml' ? 'svg' : 'png';
  const path = `signature-${Date.now()}.${ext}`;
  const up = await db().storage.from('efcsys-signature').upload(path, file, { contentType: file.type, upsert: true });
  if (up.error) throw new Error(up.error.message);
  return path;
}

/* ---------------- Privacidade ---------------- */
export async function createTerm(v: { version: string; purpose: string; retention: string; body: string }) {
  if (!v.version?.trim() || !v.purpose?.trim()) throw new Error('Informe versão e finalidade.');
  const sb = db();
  await ok(sb.from('consent_terms').update({ is_current: false }).eq('is_current', true));
  return ok(sb.from('consent_terms').insert({ ...v, is_current: true }));
}
export async function revokeConsent(consentId: string) {
  return ok(db().from('employee_consents').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', consentId));
}
/** Exclui a biometria do funcionário (arquivos e descritores) e registra a revogação. */
export async function deleteBiometry(employeeId: string, consentId?: string) {
  const sb = db();
  const list = await sb.storage.from('employee-faces').list(`employees/${employeeId}`);
  if (list.error) throw new Error(list.error.message);
  if (list.data.length) {
    const rm = await sb.storage.from('employee-faces').remove(list.data.map((f) => `employees/${employeeId}/${f.name}`));
    if (rm.error) throw new Error(rm.error.message);
  }
  await ok(sb.from('employee_faces').delete().eq('employee_id', employeeId));
  await ok(sb.from('employees').update({ photo_url: null }).eq('id', employeeId));
  if (consentId) await revokeConsent(consentId);
}

/* ---------------- Autocadastro: link do evento e aprovação ---------------- */
export async function setSignupEnabled(eventId: string, enabled: boolean) {
  return ok(db().from('events').update({ signup_enabled: enabled }).eq('id', eventId));
}
/** Gera um novo link: o anterior deixa de funcionar imediatamente. */
export async function rotateSignupToken(eventId: string) {
  return ok(db().from('events').update({ signup_token: crypto.randomUUID() }).eq('id', eventId));
}

/** Aprova o cadastro no evento: vínculo autorizado, cadastro completo e selfie aprovada. */
export async function approveRegistration(employeeId: string, eventId: string, sectorId?: string | null, company?: string) {
  const sb = db();
  const link: Record<string, unknown> = { access_status: 'authorized' };
  if (sectorId !== undefined) link.sector_id = sectorId || null;
  if (company !== undefined && company.trim().length >= 2) link.company_name = company.trim();
  await ok(sb.from('event_employees').update(link).eq('employee_id', employeeId).eq('event_id', eventId));
  await ok(sb.from('employees').update({ registration_status: 'complete' }).eq('id', employeeId).eq('registration_status', 'pending'));
  const faces = (await ok(sb.from('employee_faces').select('id, photo_path, is_primary, review_status').eq('employee_id', employeeId).eq('active', true))) as
    Array<{ id: string; photo_path: string; is_primary: boolean; review_status: string }>;
  const hasPrimary = faces.some((f) => f.is_primary && f.review_status === 'approved');
  for (const f of faces.filter((x) => x.review_status === 'pending')) {
    const primary = !hasPrimary && !faces.some((x) => x.is_primary && x.id !== f.id);
    await ok(sb.from('employee_faces').update({ review_status: 'approved', is_primary: primary }).eq('id', f.id));
    if (primary) await ok(sb.from('employees').update({ photo_url: f.photo_path }).eq('id', employeeId));
  }
}

/** Recusa o cadastro neste evento (o histórico fica na auditoria). */
export async function rejectRegistration(employeeId: string, eventId: string) {
  const sb = db();
  await ok(sb.from('event_employees').update({ access_status: 'cancelled' }).eq('employee_id', employeeId).eq('event_id', eventId));
  await ok(sb.from('employee_faces').update({ active: false }).eq('employee_id', employeeId).eq('review_status', 'pending'));
}

/** URL temporária (5 min) para ver uma foto do bucket privado. */
export async function signedPhotoUrl(path: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.storage.from('employee-faces').createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}
