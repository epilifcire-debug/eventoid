/**
 * Camada única de acesso a dados.
 * - DEMO_MODE: devolve os dados de src/data/demo.ts (apresentação).
 * - Supabase configurado: lê as views `v_*` (security_invoker, protegidas por RLS).
 * - Sem backend: listas vazias → as telas mostram estado vazio.
 * Componentes nunca chamam o Supabase diretamente.
 */
import { DEMO_MODE } from '../lib/config';
import { supabase } from '../lib/supabase';
import * as demo from '../data/demo';
import type {
  AppSettings, AccessLog, AlertItem, AppUser, AuditEntry, ConsentEntry, Device, Employee, EventItem, ReaderConfig, Sector, Shift,
} from '../types';

const delay = <T,>(v: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(v), ms));

async function fromView<T>(view: string, order?: string, asc = false): Promise<T[]> {
  if (!supabase) return [];
  let q = supabase.from(view).select('*');
  if (order) q = q.order(order, { ascending: asc });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export interface DashboardStats {
  scheduled: number; present: number; entries: number; exits: number; denied: number;
  devicesOnline: number; devicesOffline: number; pendingSync: number;
}
export interface HourPoint { h: string; in: number; out: number }

const DEMO_SETTINGS: AppSettings = {
  offline_hours: 24, offline_warn_hours: 6, full_sync_hours_before: 1, queue_alert_threshold: 50,
  reread_interval_s: 20, result_time_s: 5, denied_streak_alert: 5, signature_path: null, signature_visible: true, signature_link: 'https://efcsys.com.br',
};
export interface ConsentTerm { id: string; version: string; purpose: string; retention: string; body: string }
const DEMO_TERM: ConsentTerm = {
  id: 't1', version: 'v1.2',
  purpose: 'Identificar funcionários na entrada e saída do evento, registrar presença e impedir acessos não autorizados.',
  retention: 'Definido pelo Administrador Master conforme a política da empresa (ex.: até 90 dias após o último evento vinculado).',
  body: 'O funcionário pode revogar o consentimento a qualquer momento; o acesso passa a ser liberado manualmente. Ao revogar ou vencer o prazo, a biometria é excluída e os registros de acesso são anonimizados.',
};
const EMPTY_STATS: DashboardStats = { scheduled: 0, present: 0, entries: 0, exits: 0, denied: 0, devicesOnline: 0, devicesOffline: 0, pendingSync: 0 };

export const api = {
  events: (): Promise<EventItem[]> => (DEMO_MODE ? delay(demo.demoEvents) : fromView('v_events', 'starts_at')),
  sectors: (): Promise<Sector[]> => (DEMO_MODE ? delay(demo.demoSectors) : fromView('v_sectors', 'name', true)),
  shifts: (): Promise<Shift[]> => (DEMO_MODE ? delay(demo.demoShifts) : fromView('v_shifts', 'start', true)),
  employees: (): Promise<Employee[]> => (DEMO_MODE ? delay(demo.demoEmployees) : fromView('v_employees', 'full_name', true)),
  accessLogs: (): Promise<AccessLog[]> => (DEMO_MODE ? delay(demo.demoAccessLogs) : fromView('v_access_logs', 'occurred_at')),
  devices: (): Promise<Device[]> => (DEMO_MODE ? delay(demo.demoDevices) : fromView('v_devices', 'name', true)),
  users: (): Promise<AppUser[]> => (DEMO_MODE ? delay(demo.demoUsers) : fromView('v_users', 'full_name', true)),
  readerConfigs: (): Promise<ReaderConfig[]> => (DEMO_MODE ? delay(demo.demoReaderConfigs) : fromView('v_reader_configs', 'operator_name', true)),
  audit: (): Promise<AuditEntry[]> => (DEMO_MODE ? delay(demo.demoAudit) : fromView('v_audit', 'created_at')),
  consents: (): Promise<ConsentEntry[]> => (DEMO_MODE ? delay(demo.demoConsents) : fromView('v_consents', 'accepted_at')),
  alerts: (): Promise<AlertItem[]> => (DEMO_MODE ? delay(demo.demoAlerts) : delay([] as AlertItem[], 0)),

  async currentTerm(): Promise<ConsentTerm | null> {
    if (DEMO_MODE) return delay(DEMO_TERM);
    if (!supabase) return null;
    const { data, error } = await supabase.from('consent_terms').select('id, version, purpose, retention, body').eq('is_current', true).maybeSingle();
    if (error) throw new Error(error.message);
    return data as ConsentTerm | null;
  },
  async settings(): Promise<AppSettings | null> {
    if (DEMO_MODE) return delay(DEMO_SETTINGS);
    if (!supabase) return null;
    const { data, error } = await supabase.from('app_settings').select('*').maybeSingle();
    if (error) throw new Error(error.message);
    return data as AppSettings | null;
  },
  async stats(): Promise<DashboardStats> {
    if (DEMO_MODE) return delay(demo.demoStats);
    const rows = await fromView<DashboardStats>('v_dashboard_stats');
    return rows[0] ?? EMPTY_STATS;
  },
  async hourly(): Promise<HourPoint[]> {
    if (DEMO_MODE) return delay(demo.demoHourly);
    return fromView<HourPoint>('v_access_hourly', 'h', true);
  },
};
