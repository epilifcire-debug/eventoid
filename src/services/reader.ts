import { DEMO_MODE } from '../lib/config';
import { supabase } from '../lib/supabase';
import { demoDevices, demoEmployees, demoEvents, demoSectors } from '../data/demo';
import type { AccessType, ReaderMode } from '../types';

export interface ReaderContext {
  event_id: string;
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
