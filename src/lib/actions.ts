import { DEMO_MODE } from './config';
import { supabase } from './supabase';
import { queryClient } from './queryClient';
import { toast } from '../components/ui';
import type { api } from '../services/api';

type QueryKey = keyof typeof api;

/** Traduz erros do Postgres/Supabase para mensagens claras, sem expor detalhes internos. */
export function friendlyError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)) || '';
  if (/row-level security|permission denied|42501|Sem permissão/i.test(msg)) return msg.startsWith('Sem ') ? msg : 'Você não tem permissão para esta ação.';
  if (/employees_cpf_uidx/.test(msg)) return 'Já existe um funcionário com este CPF.';
  if (/event_employees_event_id_employee_id_key/.test(msg)) return 'Funcionário já vinculado a este evento.';
  if (/uep_one_active_read_uidx/.test(msg)) return 'Este operador já tem um evento ativo. Desmarque o atual antes.';
  if (/devices_device_code_key/.test(msg)) return 'Já existe um dispositivo com este código.';
  if (/sectors_event_id_name_key/.test(msg)) return 'Já existe um setor com este nome no evento.';
  if (/duplicate key/i.test(msg)) return 'Registro duplicado.';
  if (/violates check constraint/i.test(msg)) return 'Algum campo está com formato inválido.';
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) return 'Sem conexão com o servidor. Tente novamente.';
  // mensagens de RAISE EXCEPTION das funções do banco já estão em português
  return msg.length && msg.length < 140 ? msg : 'Não foi possível concluir a operação.';
}

/**
 * Executa uma gravação.
 * - Demonstração: simula e avisa que nada foi gravado.
 * - Sem servidor configurado: avisa e não finge sucesso.
 * - Com Supabase: executa, mostra o erro real ou sucesso, e atualiza as listas indicadas.
 */
export async function runAction(successMsg: string, fn?: () => Promise<unknown>, invalidate: QueryKey[] = []): Promise<boolean> {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 500));
    toast.success(`${successMsg} (demonstração — nada foi gravado)`);
    return true;
  }
  if (!supabase || !fn) { toast.info('Servidor não configurado.'); return false; }
  try {
    await fn();
    toast.success(successMsg);
    await Promise.all(invalidate.map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
    return true;
  } catch (e) {
    toast.error(friendlyError(e));
    return false;
  }
}

/** Lê os campos de um <form> como objeto de strings. */
export function formValues(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  new FormData(form).forEach((v, k) => { if (typeof v === 'string') out[k] = v.trim(); });
  return out;
}
