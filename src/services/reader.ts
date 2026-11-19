import { DEMO_MODE } from '../lib/config';
import { supabase } from '../lib/supabase';
import { demoDevices, demoEmployees, demoEvents, demoSectors } from '../data/demo';
import type { AccessType, ReaderMode } from '../types';

export interface ReaderContext {
  event_id: string;
  device_code?: string | null;
  read_interval_s?: number;
  result_time_s?: number;
  event_name: string;
  device_name: string;
  mode: ReaderMode;
  offline_hours: number;
  last_sync_at: string;
}

export type ReaderContextResult =
  | { ok: true; ctx: ReaderContext }
  | { ok: false; reason: 'no_event' | 'multiple_events' | 'event_inactive' | 'no_backend' };

/** Evento atribuído ao operador de Leitura. Nunca escolhido pelo operador. */
export async function getReaderContext(): Promise<ReaderContextResult> {
  if (DEMO_MODE) {
    const ev = demoEvents[0];
    return { ok: true, ctx: { event_id: ev.id, event_name: ev.name, device_name: demoDevices[0].name, mode: 'entry', offline_hours: 24, last_sync_at: new Date().toISOString() } };
  }
  if (!supabase) return { ok: false, reason: 'no_backend' };
  const { data, error } = await supabase.rpc('reader_context');
  if (error) throw new Error(error.message);
  const r = data as { status: string } & Partial<ReaderContext>;
  if (r.status !== 'ok') return { ok: false, reason: (r.status as 'no_event' | 'multiple_events' | 'event_inactive') ?? 'no_event' };
  return { ok: true, ctx: r as ReaderContext };
}

export interface RecognitionResult {
  decision: 'allowed' | 'denied';
  employee_id?: string;
  employee_name?: string;
  code?: string;
  sector_name?: string;
  access_type?: AccessType;
  reason?: string;
  occurred_at: string;
}

/* -------- Simulação (somente demonstração) -------- */
const DENY_REASONS = ['Funcionário não vinculado ao evento', 'Rosto não reconhecido', 'Funcionário bloqueado', 'Fora do período permitido'];
let cursor = 0;

export function demoNextCandidate(): string {
  const list = demoEmployees.filter((e) => e.face_status === 'complete');
  const e = list[cursor % list.length];
  cursor += 1;
  return e.id;
}

export function demoRecognize(employeeId: string, forceDeny = false, mode: ReaderMode = 'entry'): RecognitionResult {
  const e = demoEmployees.find((x) => x.id === employeeId)!;
  const now = new Date().toISOString();
  if (forceDeny || e.status === 'blocked') {
    return { decision: 'denied', reason: e.status === 'blocked' ? 'Funcionário bloqueado' : DENY_REASONS[Math.floor(Math.random() * DENY_REASONS.length)], occurred_at: now };
  }
  return {
    decision: 'allowed', employee_id: e.id, employee_name: e.full_name, code: e.code,
    sector_name: demoSectors.find((s) => s.id === e.sector_id)?.name, access_type: mode === 'exit' ? 'exit' : 'entry', occurred_at: now,
  };
}

/** Busca por código digitado pelo operador (não lista funcionários). */
export function demoLookupCode(code: string): RecognitionResult | null {
  const e = demoEmployees.find((x) => x.code.toLowerCase() === code.trim().toLowerCase() || x.code.endsWith(code.trim()));
  return e ? demoRecognize(e.id) : null;
}

/* -------- Operação real (Supabase) -------- */
export interface ReaderEmployee { employee_id: string; code: string; full_name: string; sector_name: string | null; photo_path: string | null; descriptors: unknown[] }

/** Dados mínimos do evento do leitor (sem CPF/telefone/e-mail). Base do cache offline. */
export async function loadReaderDataset(): Promise<ReaderEmployee[]> {
  if (DEMO_MODE || !supabase) return [];
  const { data, error } = await supabase.rpc('reader_dataset');
  if (error) throw new Error(error.message);
  return (data ?? []) as ReaderEmployee[];
}

const REASON_LABEL: Record<string, string> = {
  face_not_found: 'Nenhum rosto detectado', face_not_recognized: 'Rosto não reconhecido', employee_inactive: 'Funcionário inativo',
  employee_not_linked: 'Funcionário não vinculado ao evento', employee_blocked: 'Funcionário bloqueado', event_inactive: 'Evento encerrado',
  reader_not_authorized: 'Operador sem autorização', device_not_authorized: 'Dispositivo não autorizado', duplicate_entry: 'Entrada já registrada',
  duplicate_exit: 'Saída sem entrada registrada', outside_validity: 'Fora do período permitido', offline_data_expired: 'Dados offline desatualizados',
};

/** Registra a leitura no servidor (a decisão é sempre do banco). `null` = leitura repetida ignorada. */
export async function registerAccess(ctx: ReaderContext, employeeId: string | null, confidence: number | null): Promise<RecognitionResult | null> {
  const { data, error } = await supabase!.rpc('register_access', {
    p_client_record_id: crypto.randomUUID(), p_employee_id: employeeId, p_confidence: confidence, p_device_code: ctx.device_code ?? null,
  });
  if (error) throw new Error(error.message);
  const r = data as { decision: string; reason?: string; employee_name?: string; code?: string; sector_name?: string; access_type?: AccessType; occurred_at: string };
  if (r.decision === 'ignored') return null;
  return {
    decision: r.decision === 'allowed' ? 'allowed' : 'denied', employee_id: employeeId ?? undefined, employee_name: r.employee_name, code: r.code,
    sector_name: r.sector_name, access_type: r.access_type, reason: r.reason ? REASON_LABEL[r.reason] ?? 'Acesso não autorizado' : undefined, occurred_at: r.occurred_at,
  };
}
