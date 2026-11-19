/** Autocadastro público (sem login). Toda validação é feita pelas funções do banco. */
import { DEMO_MODE } from '../lib/config';
import { supabase } from '../lib/supabase';
import { demoEvents, demoSectors } from '../data/demo';

export interface SignupInfo {
  status: 'ok' | 'no_term' | 'unavailable';
  name?: string; venue_name?: string | null; city?: string | null; state?: string | null;
  starts_at?: string | null; ends_at?: string | null;
  sectors?: Array<{ id: string; name: string }>;
  term?: { version: string; purpose: string; retention: string; body: string } | null;
}

export interface SignupInput {
  full_name: string; cpf: string; phone: string; email?: string; sector_id?: string; term_version: string; accept: boolean;
}

const DEMO_TERM = {
  version: 'v1.2',
  purpose: 'Identificar funcionários na entrada e saída do evento, registrar presença e impedir acessos não autorizados.',
  retention: 'Definido pela organização do evento.',
  body: 'Ao aceitar, você autoriza o uso da sua imagem facial exclusivamente para controle de acesso e presença nos eventos em que estiver escalado. Você pode revogar o consentimento a qualquer momento.',
};

export async function getSignupInfo(token: string): Promise<SignupInfo> {
  if (DEMO_MODE) {
    const ev = demoEvents[0];
    return { status: 'ok', name: ev.name, venue_name: ev.venue_name, city: ev.city, state: ev.state, starts_at: ev.starts_at, ends_at: ev.ends_at,
      sectors: demoSectors.map((s) => ({ id: s.id, name: s.name })), term: DEMO_TERM };
  }
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(token)) return { status: 'unavailable' };
  const { data, error } = await supabase.rpc('signup_event_info', { p_token: token });
  if (error) throw new Error('Não foi possível carregar o cadastro. Verifique a conexão.');
  return data as SignupInfo;
}

/** Envia os dados e depois a selfie (tíquete de uso único gerado pelo banco). */
export async function submitSignup(token: string, v: SignupInput, selfie: Blob): Promise<void> {
  if (DEMO_MODE) { await new Promise((r) => setTimeout(r, 900)); return; }
  if (!supabase) throw new Error('Servidor não configurado.');
  const { data, error } = await supabase.rpc('self_register', {
    p_token: token, p_full_name: v.full_name, p_cpf: v.cpf, p_phone: v.phone, p_email: v.email || null,
    p_sector_id: v.sector_id || null, p_term_version: v.term_version, p_accept: v.accept,
  });
  if (error) throw new Error(error.message.length < 140 ? error.message : 'Não foi possível enviar o cadastro.');
  const { employee_id, upload_token } = data as { employee_id: string; upload_token: string };
  const path = `employees/${employee_id}/self-${upload_token}.jpg`;
  const up = await supabase.storage.from('employee-faces').upload(path, selfie, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw new Error('Seus dados foram recebidos, mas a foto não foi enviada. Procure a organização do evento.');
  const conf = await supabase.rpc('self_register_photo', { p_ticket: upload_token });
  if (conf.error) throw new Error('Seus dados foram recebidos, mas a foto não foi confirmada. Procure a organização do evento.');
}
