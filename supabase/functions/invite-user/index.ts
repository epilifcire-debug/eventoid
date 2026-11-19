// Edge Function: convite de usuário do EVENTOID.
// Roda no servidor do Supabase com a service_role (nunca exposta ao navegador).
// Valida quem chama (Admin Master ou Admin), cria o convite por e-mail e define papel e eventos.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ROLES = ['admin_master', 'admin', 'supervisor', 'reader', 'viewer'] as const;
type Role = (typeof ROLES)[number];
const PERMISSION: Record<Role, string | null> = { admin_master: null, admin: 'manage', supervisor: 'supervise', reader: 'read', viewer: 'view' };

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'Não autenticado' });

  // 1) quem está chamando (com o token do próprio usuário)
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: me } = await asCaller.auth.getUser();
  if (!me?.user) return json(401, { error: 'Sessão inválida' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: caller } = await admin.from('profiles').select('id, role, active').eq('id', me.user.id).single();
  if (!caller?.active || !['admin_master', 'admin'].includes(caller.role)) return json(403, { error: 'Sem permissão para convidar usuários' });

  // 2) valida a entrada
  let body: { full_name?: string; email?: string; role?: Role; event_ids?: string[]; redirect_to?: string };
  try { body = await req.json(); } catch { return json(400, { error: 'Corpo inválido' }); }
  const fullName = String(body.full_name ?? '').trim().slice(0, 120);
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = body.role as Role;
  const eventIds = Array.isArray(body.event_ids) ? [...new Set(body.event_ids.map(String))] : [];
  if (!fullName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: 'Informe nome e e-mail válidos' });
  if (!ROLES.includes(role)) return json(400, { error: 'Perfil inválido' });
  if (caller.role === 'admin' && (role === 'admin_master' || role === 'admin')) return json(403, { error: 'Administrador não pode criar administradores' });
  if (role === 'reader' && eventIds.length > 1) return json(400, { error: 'O perfil Leitura aceita só um evento' });

  // Admin só atribui eventos que administra
  if (caller.role === 'admin' && eventIds.length) {
    const { data: managed } = await admin.from('user_event_permissions').select('event_id')
      .eq('user_id', caller.id).eq('permission_type', 'manage').eq('active', true).in('event_id', eventIds);
    if ((managed ?? []).length !== eventIds.length) return json(403, { error: 'Sem permissão em algum dos eventos selecionados' });
  }

  // 3) convite (o usuário define a própria senha pelo e-mail; nenhuma senha é criada aqui)
  const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName }, redirectTo: body.redirect_to,
  });
  if (invErr || !invited?.user) {
    const already = /already|registered|exists/i.test(invErr?.message ?? '');
    return json(already ? 409 : 400, { error: already ? 'Este e-mail já possui cadastro' : 'Não foi possível enviar o convite' });
  }
  const userId = invited.user.id;

  // 4) perfil e permissões (o trigger handle_new_user já criou a linha em profiles)
  const { error: pErr } = await admin.from('profiles').upsert({ id: userId, full_name: fullName, email, role, active: true, created_by: caller.id });
  if (pErr) return json(500, { error: 'Convite enviado, mas o perfil não foi salvo' });
  const perm = PERMISSION[role];
  if (perm && eventIds.length) {
    const rows = eventIds.map((event_id) => ({ user_id: userId, event_id, permission_type: perm, active: true, assigned_by: caller.id }));
    const { error: eErr } = await admin.from('user_event_permissions').upsert(rows, { onConflict: 'user_id,event_id,permission_type' });
    if (eErr) return json(500, { error: 'Convite enviado, mas os eventos não foram vinculados' });
  }
  await admin.from('audit_logs').insert({
    actor_user_id: caller.id, action: 'Usuário convidado', entity_type: 'profiles', entity_id: userId,
    detail: `${fullName} (${role})`, sensitive: true,
  });
  return json(200, { id: userId });
});
