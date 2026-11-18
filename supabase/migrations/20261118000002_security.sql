-- =====================================================================
-- EVENTOID — 0002 · Segurança (funções auxiliares, RLS, grants, storage)
-- Regras: nada para anon; authenticated só o necessário, sempre com RLS.
-- Funções auxiliares ficam no schema "private" (não exposto pela Data API).
-- =====================================================================

-- ---------- Funções auxiliares (SECURITY DEFINER só para ler o papel sem recursão de RLS) ----------
create or replace function private.my_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.active
$$;

create or replace function private.is_master()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.my_role()) = 'admin_master', false)
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.my_role()) in ('admin_master', 'admin'), false)
$$;

/** Usuário pode ver o evento (master vê todos; demais pelo vínculo ativo). Leitura só o evento atribuído. */
create or replace function private.can_view_event(p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_master()) or exists (
    select 1 from public.user_event_permissions u
    join public.profiles p on p.id = u.user_id and p.active
    where u.user_id = (select auth.uid()) and u.event_id = p_event and u.active
  )
$$;

/** Pode administrar o evento: master ou admin com permissão 'manage'. */
create or replace function private.can_manage_event(p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_master()) or exists (
    select 1 from public.user_event_permissions u
    join public.profiles p on p.id = u.user_id and p.active and p.role = 'admin'
    where u.user_id = (select auth.uid()) and u.event_id = p_event and u.active and u.permission_type = 'manage'
  )
$$;

/** Staff (não-Leitura) com acesso a algum evento em que o funcionário está vinculado. */
create or replace function private.can_view_employee(p_employee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_master()) or (
    (select private.my_role()) in ('admin', 'supervisor', 'viewer') and exists (
      select 1 from public.event_employees ee
      join public.user_event_permissions u on u.event_id = ee.event_id and u.active and u.user_id = (select auth.uid())
      where ee.employee_id = p_employee
    )
  ) or (
    -- funcionário ainda sem vínculo (recém-cadastrado) é visível a administradores
    (select private.my_role()) = 'admin' and not exists (select 1 from public.event_employees ee where ee.employee_id = p_employee)
  )
$$;

/** Evento atribuído ao operador de Leitura (null se nenhum). */
create or replace function private.reader_event_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select u.event_id from public.user_event_permissions u
  join public.profiles p on p.id = u.user_id and p.active and p.role = 'reader'
  where u.user_id = (select auth.uid()) and u.permission_type = 'read' and u.active
  limit 1
$$;

/** Apenas o nome de um usuário do sistema (para views, sem expor e-mail/telefone). */
create or replace function private.profile_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select p.full_name from public.profiles p where p.id = p_user
$$;

/** Auditoria genérica. */
create or replace function private.audit(p_action text, p_entity text, p_entity_id uuid, p_event uuid, p_detail text, p_sensitive boolean, p_old jsonb default null, p_new jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, event_id, detail, sensitive, old_data, new_data)
  values ((select auth.uid()), p_action, p_entity, p_entity_id, p_event, p_detail, p_sensitive, p_old, p_new)
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------- Triggers de auditoria ----------
create or replace function private.audit_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_event uuid := case when tg_table_name = 'events' then (v_row ->> 'id')::uuid else nullif(v_row ->> 'event_id', '')::uuid end;
  v_action text;
begin
  -- descritor facial nunca vai para a auditoria
  if tg_table_name = 'employee_faces' then v_old := v_old - 'descriptor'; v_new := v_new - 'descriptor'; end if;
  v_action := case
    when tg_table_name = 'profiles' and tg_op = 'UPDATE' and (v_old ->> 'role') is distinct from (v_new ->> 'role') then 'Perfil alterado'
    when tg_table_name = 'profiles' and tg_op = 'UPDATE' and (v_old ->> 'active') is distinct from (v_new ->> 'active')
      then case when (v_new ->> 'active')::boolean then 'Usuário ativado' else 'Usuário desativado' end
    when tg_table_name = 'profiles' and tg_op = 'UPDATE' then null   -- ex.: last_login_at não é auditado
    -- telemetria do dispositivo (sincronização, bateria) não é auditada
    when tg_table_name = 'devices' and tg_op = 'UPDATE'
      and (v_old - array['last_seen_at','last_sync_at','updated_at','battery','pending_sync','app_version']) = (v_new - array['last_seen_at','last_sync_at','updated_at','battery','pending_sync','app_version']) then null
    when tg_table_name = 'events' and tg_op = 'UPDATE' and (v_old ->> 'status') is distinct from (v_new ->> 'status') then 'Status do evento: ' || (v_new ->> 'status')
    when tg_table_name = 'employees' and tg_op = 'UPDATE' and (v_old ->> 'registration_status') is distinct from (v_new ->> 'registration_status')
      and (v_new ->> 'registration_status') = 'blocked' then 'Funcionário bloqueado'
    when tg_table_name = 'employee_faces' then 'Cadastro facial ' || lower(tg_op)
    when tg_table_name = 'user_event_permissions' then 'Permissão de evento ' || lower(tg_op)
    else initcap(replace(tg_table_name, '_', ' ')) || ' ' || lower(tg_op)
  end;
  if v_action is not null then
    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, event_id, sensitive, old_data, new_data)
    values ((select auth.uid()), v_action, tg_table_name, case when (v_row ->> 'id') ~ '^[0-9a-f-]{36}$' then (v_row ->> 'id')::uuid else nullif(v_row ->> 'user_id', '')::uuid end, v_event,
            tg_table_name in ('profiles', 'employee_faces', 'user_event_permissions') or v_action like 'Funcionário bloqueado%', v_old, v_new);
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','events','employees','employee_faces','event_employees','user_event_permissions','devices','reader_settings','app_settings'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.audit_trigger()', t, t);
  end loop;
end $$;

-- Admin que cria evento recebe permissão 'manage' automaticamente
create or replace function private.grant_creator_manage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select private.my_role()) = 'admin' then
    insert into public.user_event_permissions (user_id, event_id, permission_type, assigned_by)
    values ((select auth.uid()), new.id, 'manage', (select auth.uid())) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger events_grant_creator after insert on public.events for each row execute function private.grant_creator_manage();

-- Funções internas (auditoria e triggers) não são chamáveis por usuários
revoke execute on function private.audit(text, text, uuid, uuid, text, boolean, jsonb, jsonb), private.audit_trigger(),
  private.grant_creator_manage(), private.handle_new_user(), private.set_updated_at(), private.normalize_employee(),
  private.check_event_employee() from authenticated, public;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.sectors enable row level security;
alter table public.shifts enable row level security;
alter table public.employees enable row level security;
alter table public.employee_faces enable row level security;
alter table public.event_employees enable row level security;
alter table public.user_event_permissions enable row level security;
alter table public.devices enable row level security;
alter table public.reader_settings enable row level security;
alter table public.access_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.consent_terms enable row level security;
alter table public.employee_consents enable row level security;
alter table public.app_settings enable row level security;

-- profiles: cada um vê o próprio; admins veem todos. Alteração de papel só pelo master.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update_master on public.profiles for update to authenticated
  using ((select private.is_master())) with check ((select private.is_master()));
-- Admin pode ativar/editar usuários operacionais (nunca master/admin) — papel validado no WITH CHECK
create policy profiles_update_admin on public.profiles for update to authenticated
  using ((select private.my_role()) = 'admin' and role in ('supervisor', 'reader', 'viewer'))
  with check ((select private.my_role()) = 'admin' and role in ('supervisor', 'reader', 'viewer'));

-- events
create policy events_select on public.events for select to authenticated using ((select private.can_view_event(id)));
create policy events_insert on public.events for insert to authenticated with check ((select private.is_admin()));
create policy events_update on public.events for update to authenticated
  using ((select private.can_manage_event(id))) with check ((select private.can_manage_event(id)));
create policy events_delete on public.events for delete to authenticated using ((select private.is_master()) and status = 'draft');

-- sectors / shifts
create policy sectors_select on public.sectors for select to authenticated using ((select private.can_view_event(event_id)));
create policy sectors_write on public.sectors for all to authenticated
  using ((select private.can_manage_event(event_id))) with check ((select private.can_manage_event(event_id)));
create policy shifts_select on public.shifts for select to authenticated using ((select private.can_view_event(event_id)));
create policy shifts_write on public.shifts for all to authenticated
  using ((select private.can_manage_event(event_id))) with check ((select private.can_manage_event(event_id)));

-- employees: Leitura NÃO lê a tabela (recebe dados mínimos pela função reader_dataset)
create policy employees_select on public.employees for select to authenticated using ((select private.can_view_employee(id)));
create policy employees_insert on public.employees for insert to authenticated with check ((select private.is_admin()));
create policy employees_update on public.employees for update to authenticated
  using ((select private.is_admin()) and (select private.can_view_employee(id))) with check ((select private.is_admin()));

-- employee_faces: somente administradores
create policy faces_select on public.employee_faces for select to authenticated
  using ((select private.is_admin()) and (select private.can_view_employee(employee_id)));
create policy faces_write on public.employee_faces for all to authenticated
  using ((select private.is_admin()) and (select private.can_view_employee(employee_id))) with check ((select private.is_admin()));

-- event_employees
create policy ee_select on public.event_employees for select to authenticated
  using ((select private.my_role()) <> 'reader' and (select private.can_view_event(event_id)));
create policy ee_write on public.event_employees for all to authenticated
  using ((select private.can_manage_event(event_id))) with check ((select private.can_manage_event(event_id)));

-- user_event_permissions: o próprio usuário vê os seus; admin gerencia perfis operacionais nos eventos que administra
create policy uep_select on public.user_event_permissions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_master()) or (select private.can_manage_event(event_id)));
create policy uep_write_master on public.user_event_permissions for all to authenticated
  using ((select private.is_master())) with check ((select private.is_master()));
create policy uep_write_admin on public.user_event_permissions for all to authenticated
  using ((select private.can_manage_event(event_id)) and permission_type in ('supervise', 'read', 'view') and user_id <> (select auth.uid()))
  with check ((select private.can_manage_event(event_id)) and permission_type in ('supervise', 'read', 'view') and user_id <> (select auth.uid()));

-- devices
create policy devices_select on public.devices for select to authenticated
  using (reader_user_id = (select auth.uid()) or (select private.is_master())
         or (event_id is not null and (select private.my_role()) <> 'reader' and (select private.can_view_event(event_id)))
         or (event_id is null and (select private.is_admin())));
create policy devices_write on public.devices for all to authenticated
  using ((select private.is_admin()) and (event_id is null or (select private.can_manage_event(event_id))))
  with check ((select private.is_admin()) and (event_id is null or (select private.can_manage_event(event_id))));

-- reader_settings
create policy rs_select on public.reader_settings for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy rs_write on public.reader_settings for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- access_logs: leitura por evento; Leitura vê só o que registrou. Inserção somente pelas funções register_access / manual_release.
create policy access_select on public.access_logs for select to authenticated
  using (((select private.my_role()) <> 'reader' and (select private.can_view_event(event_id))) or reader_user_id = (select auth.uid()));

-- audit_logs: somente o master lê; ninguém altera
create policy audit_select on public.audit_logs for select to authenticated using ((select private.is_master()));

-- privacidade
create policy terms_select on public.consent_terms for select to authenticated using ((select private.is_admin()));
create policy terms_write on public.consent_terms for all to authenticated
  using ((select private.is_master())) with check ((select private.is_master()));
create policy consents_select on public.employee_consents for select to authenticated
  using ((select private.is_admin()) and (select private.can_view_employee(employee_id)));
create policy consents_write on public.employee_consents for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- configurações: admins leem; só o master altera
create policy settings_select on public.app_settings for select to authenticated using ((select private.is_admin()));
create policy settings_update on public.app_settings for update to authenticated
  using ((select private.is_master())) with check ((select private.is_master()));

-- ---------- GRANTS da Data API ----------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url, role, active, must_change_password) on public.profiles to authenticated;
grant select, insert, update, delete on public.events, public.sectors, public.shifts to authenticated;
grant select, insert, update on public.employees, public.employee_faces, public.event_employees,
  public.user_event_permissions, public.devices, public.reader_settings, public.employee_consents to authenticated;
grant delete on public.employee_faces, public.event_employees, public.user_event_permissions to authenticated;
grant select on public.access_logs, public.audit_logs to authenticated;
grant select, insert on public.consent_terms to authenticated;
grant select, update on public.app_settings to authenticated;
grant usage on sequence public.employee_code_seq to authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- ---------- STORAGE: bucket privado de fotos faciais ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-faces', 'employee-faces', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('efcsys-signature', 'efcsys-signature', false, 2097152, array['image/png', 'image/svg+xml'])
on conflict (id) do nothing;

-- Caminho: employees/{employee_id}/{arquivo}. Leitura (operador) só lê fotos de funcionários do evento atribuído.
create or replace function private.face_path_employee(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when (storage.foldername(p_name))[1] = 'employees' and (storage.foldername(p_name))[2] ~ '^[0-9a-f-]{36}$'
              then ((storage.foldername(p_name))[2])::uuid end
$$;
grant execute on function private.face_path_employee(text) to authenticated;

create or replace function private.reader_can_see_employee(p_employee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.event_employees ee
    where ee.employee_id = p_employee and ee.event_id = (select private.reader_event_id()) and ee.access_status = 'authorized'
  )
$$;
grant execute on function private.reader_can_see_employee(uuid) to authenticated;

create policy faces_obj_select on storage.objects for select to authenticated using (
  bucket_id = 'employee-faces' and (
    ((select private.is_admin()) and (select private.can_view_employee(private.face_path_employee(name))))
    or ((select private.my_role()) = 'reader' and (select private.reader_can_see_employee(private.face_path_employee(name))))
  )
);
create policy faces_obj_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'employee-faces' and (select private.is_admin()) and private.face_path_employee(name) is not null
);
create policy faces_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'employee-faces' and (select private.is_admin()))
  with check (bucket_id = 'employee-faces' and (select private.is_admin()) and private.face_path_employee(name) is not null);
create policy faces_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'employee-faces' and (select private.is_admin()));

create policy signature_obj_select on storage.objects for select to authenticated using (bucket_id = 'efcsys-signature');
create policy signature_obj_write on storage.objects for insert to authenticated with check (bucket_id = 'efcsys-signature' and (select private.is_master()));
create policy signature_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'efcsys-signature' and (select private.is_master())) with check (bucket_id = 'efcsys-signature' and (select private.is_master()));
create policy signature_obj_delete on storage.objects for delete to authenticated using (bucket_id = 'efcsys-signature' and (select private.is_master()));
