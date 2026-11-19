-- =====================================================================
-- EVENTOID — BANCO COMPLETO (versão definitiva para projeto NOVO)
-- Como usar:
--   1. Antes de rodar, troque SEU-EMAIL@dominio.com.br pelo seu e-mail
--      (procure por "TROQUE AQUI", perto do final do arquivo).
--   2. Supabase → SQL Editor → New query → cole TUDO → Run (uma vez só).
--   3. Authentication → Users → Add user → Create new user, com o MESMO e-mail.
--      Essa conta já nasce como Administrador Master.
-- Não rode de novo no mesmo projeto: ajustes futuros vêm em blocos separados.
-- =====================================================================

-- =====================================================================
-- EVENTOID — 0001 · Estrutura (enums, tabelas, índices, triggers)
-- Rodar em um projeto Supabase NOVO, na ordem dos arquivos 0001 → 0003.
-- =====================================================================

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- ---------- Enums ----------
create type public.app_role          as enum ('admin_master', 'admin', 'supervisor', 'reader', 'viewer');
create type public.event_status      as enum ('draft', 'scheduled', 'active', 'finished', 'archived', 'cancelled');
create type public.registration_status as enum ('pending', 'complete', 'blocked');
create type public.face_review       as enum ('pending', 'approved', 'redo');
create type public.access_status     as enum ('pending', 'authorized', 'blocked', 'cancelled');
create type public.permission_type   as enum ('manage', 'supervise', 'read', 'view');
create type public.access_type       as enum ('entry', 'exit');
create type public.access_decision   as enum ('allowed', 'denied');
create type public.denial_reason     as enum (
  'face_not_found', 'face_not_recognized', 'employee_inactive', 'employee_not_linked', 'employee_blocked',
  'event_inactive', 'reader_not_authorized', 'device_not_authorized', 'duplicate_entry', 'duplicate_exit',
  'outside_validity', 'offline_data_expired', 'other'
);
create type public.sync_status       as enum ('synced', 'pending', 'conflict');
create type public.reader_mode       as enum ('entry', 'exit', 'auto');
create type public.consent_status    as enum ('accepted', 'pending', 'revoked');

-- ---------- updated_at ----------
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  avatar_url text,
  role public.app_role not null default 'viewer',
  active boolean not null default false,          -- ativado pelo administrador
  must_change_password boolean not null default true,
  last_login_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create index profiles_active_idx on public.profiles (active);

-- Perfil criado no cadastro do Auth. Nunca usa user_metadata para definir papel:
-- todo novo usuário nasce 'viewer' e inativo; o papel é atribuído por operação administrativa.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- events ----------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  venue_name text,
  address text,
  city text,
  state varchar(2),
  starts_at timestamptz,
  ends_at timestamptz,
  status public.event_status not null default 'draft',
  manager_name text,
  cover_url text,
  offline_enabled boolean not null default true,
  offline_hours int not null default 24 check (offline_hours between 1 and 168),
  closed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create index events_status_idx on public.events (status);
create index events_starts_at_idx on public.events (starts_at);

-- ---------- sectors ----------
create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#2563EB' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  manager_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, name)          -- nome único só dentro do evento
);
create index sectors_event_id_idx on public.sectors (event_id);

-- ---------- shifts (turnos) ----------
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  sector_id uuid references public.sectors (id) on delete set null,
  name text not null,
  starts_time time not null,
  ends_time time not null,
  tolerance_min int not null default 10 check (tolerance_min between 0 and 240),
  break_min int not null default 0 check (break_min between 0 and 480),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shifts_event_id_idx on public.shifts (event_id);
create index shifts_sector_id_idx on public.shifts (sector_id);

-- ---------- employees ----------
create sequence public.employee_code_seq start 241;
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique default ('FUN-' || lpad(nextval('public.employee_code_seq')::text, 5, '0')),
  full_name text not null check (length(trim(full_name)) > 0),
  cpf text check (cpf is null or cpf ~ '^[0-9]{11}$'),          -- normalizado: só dígitos
  phone text check (phone is null or phone ~ '^[0-9]{10,13}$'),
  email text,
  birth_date date,
  photo_url text,                                               -- caminho no bucket privado
  active boolean not null default true,
  registration_status public.registration_status not null default 'pending',
  self_registered boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index employees_cpf_uidx on public.employees (cpf) where cpf is not null;
create index employees_active_idx on public.employees (active);

-- Normaliza CPF e telefone antes de salvar
create or replace function private.normalize_employee()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.cpf := nullif(regexp_replace(coalesce(new.cpf, ''), '\D', '', 'g'), '');
  new.phone := nullif(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), '');
  new.email := nullif(lower(trim(coalesce(new.email, ''))), '');
  return new;
end $$;
create trigger employees_normalize before insert or update on public.employees
  for each row execute function private.normalize_employee();

-- ---------- employee_faces ----------
create table public.employee_faces (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  photo_path text not null,
  angle text not null default 'front' check (angle in ('front', 'left', 'right')),
  descriptor jsonb,                    -- vetor do face-api.js (128 floats)
  descriptor_version text,
  quality_score numeric(5, 2),
  is_primary boolean not null default false,   -- só a frontal aparece no perfil
  review_status public.face_review not null default 'pending',
  active boolean not null default true,
  captured_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employee_faces_employee_id_idx on public.employee_faces (employee_id);
create unique index employee_faces_one_primary_uidx on public.employee_faces (employee_id) where is_primary and active;

-- ---------- event_employees (vínculo) ----------
create table public.event_employees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete restrict,
  sector_id uuid references public.sectors (id) on delete set null,
  shift_id uuid references public.shifts (id) on delete set null,
  position_name text,
  access_status public.access_status not null default 'pending',
  check_in_allowed boolean not null default true,
  check_out_allowed boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, employee_id)       -- um único setor por evento
);
create index event_employees_event_id_idx on public.event_employees (event_id, access_status);
create index event_employees_employee_id_idx on public.event_employees (employee_id);
create index event_employees_sector_id_idx on public.event_employees (sector_id);
create index event_employees_shift_id_idx on public.event_employees (shift_id);

create or replace function private.check_event_employee()
returns trigger language plpgsql set search_path = '' as $$
declare v_status public.event_status; v_active boolean;
begin
  select status into v_status from public.events where id = new.event_id;
  if tg_op = 'INSERT' and v_status in ('finished', 'archived', 'cancelled') then
    raise exception 'Evento encerrado não aceita novos vínculos';
  end if;
  if new.sector_id is not null and not exists (select 1 from public.sectors s where s.id = new.sector_id and s.event_id = new.event_id) then
    raise exception 'O setor precisa pertencer ao mesmo evento';
  end if;
  if new.shift_id is not null and not exists (select 1 from public.shifts s where s.id = new.shift_id and s.event_id = new.event_id) then
    raise exception 'O turno precisa pertencer ao mesmo evento';
  end if;
  select active into v_active from public.employees where id = new.employee_id;
  if new.access_status = 'authorized' and not coalesce(v_active, false) then
    raise exception 'Funcionário inativo não pode ser autorizado';
  end if;
  return new;
end $$;
create trigger event_employees_check before insert or update on public.event_employees
  for each row execute function private.check_event_employee();

-- ---------- user_event_permissions ----------
create table public.user_event_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  permission_type public.permission_type not null,
  active boolean not null default true,
  assigned_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id, permission_type)
);
create index uep_user_id_idx on public.user_event_permissions (user_id, active);
create index uep_event_id_idx on public.user_event_permissions (event_id);
-- Leitura: no máximo UM evento ativo por operador
create unique index uep_one_active_read_uidx on public.user_event_permissions (user_id) where permission_type = 'read' and active;

-- ---------- devices ----------
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  device_code text not null unique,
  name text not null,
  reader_user_id uuid references public.profiles (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  last_sync_at timestamptz,
  last_seen_at timestamptz,
  battery smallint check (battery between 0 and 100),
  pending_sync int not null default 0 check (pending_sync >= 0),
  app_version text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index devices_reader_user_id_idx on public.devices (reader_user_id);
create index devices_event_id_idx on public.devices (event_id);

-- ---------- reader_settings (configuração do perfil Leitura) ----------
create table public.reader_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  device_id uuid references public.devices (id) on delete set null,
  mode public.reader_mode not null default 'entry',
  read_interval_s int not null default 20 check (read_interval_s between 5 and 600),
  result_time_s int not null default 5 check (result_time_s between 2 and 30),
  offline_hours int not null default 24 check (offline_hours between 1 and 168),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create index reader_settings_device_id_idx on public.reader_settings (device_id);

-- ---------- access_logs ----------
create table public.access_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  employee_id uuid references public.employees (id) on delete set null,
  event_employee_id uuid references public.event_employees (id) on delete set null,
  reader_user_id uuid not null references public.profiles (id),
  sector_id uuid references public.sectors (id) on delete set null,
  device_id uuid references public.devices (id) on delete set null,
  access_type public.access_type not null,
  decision public.access_decision not null,
  denial_reason public.denial_reason,
  confidence_score numeric(5, 4),
  manual boolean not null default false,
  manual_reason text,
  note text,
  client_record_id uuid not null unique,        -- idempotência da sincronização offline
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  was_offline boolean not null default false,
  sync_status public.sync_status not null default 'synced',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (decision = 'allowed' or denial_reason is not null),
  check (not manual or manual_reason is not null)
);
create index access_logs_event_time_idx on public.access_logs (event_id, occurred_at desc);
create index access_logs_employee_time_idx on public.access_logs (employee_id, event_id, occurred_at desc);
create index access_logs_reader_user_id_idx on public.access_logs (reader_user_id);
create index access_logs_device_id_idx on public.access_logs (device_id);
create index access_logs_sector_id_idx on public.access_logs (sector_id);
create index access_logs_event_employee_id_idx on public.access_logs (event_employee_id);

-- ---------- audit_logs (somente inserção por funções do sistema) ----------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  event_id uuid references public.events (id) on delete set null,
  detail text,
  sensitive boolean not null default false,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_event_id_idx on public.audit_logs (event_id);

-- ---------- Privacidade ----------
create table public.consent_terms (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  purpose text not null,
  retention text not null,
  body text not null,
  is_current boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index consent_terms_one_current_uidx on public.consent_terms (is_current) where is_current;

create table public.employee_consents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  term_id uuid not null references public.consent_terms (id),
  status public.consent_status not null default 'pending',
  accepted_at timestamptz,
  accepted_by text,            -- identificação do aceite (autocadastro, nome do admin...)
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (employee_id, term_id)
);
create index employee_consents_term_id_idx on public.employee_consents (term_id);

-- ---------- Configurações globais (linha única) ----------
create table public.app_settings (
  id boolean primary key default true check (id),
  offline_hours int not null default 24,
  offline_warn_hours int not null default 6,
  full_sync_hours_before int not null default 1,
  queue_alert_threshold int not null default 50,
  reread_interval_s int not null default 20,
  result_time_s int not null default 5,
  denied_streak_alert int not null default 5,
  signature_path text,
  signature_visible boolean not null default true,
  signature_link text default 'https://efcsys.com.br',
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;

-- ---------- triggers updated_at ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','events','sectors','shifts','employees','employee_faces','event_employees','user_event_permissions','devices','app_settings'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function private.set_updated_at()', t, t);
  end loop;
end $$;
create trigger reader_settings_updated_at before update on public.reader_settings for each row execute function private.set_updated_at();


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
grant select, insert, update on public.consent_terms to authenticated;
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


-- =====================================================================
-- EVENTOID — 0003 · Funções de negócio (RPC) e views do frontend
-- As RPCs abaixo são SECURITY DEFINER porque precisam gravar em tabelas
-- que o cliente não pode escrever diretamente (access_logs, profiles.last_login_at).
-- Todas validam auth.uid(), papel e evento DENTRO da função e só aceitam authenticated.
-- =====================================================================

-- ---------- Sessão ----------
create or replace function public.touch_last_login()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set last_login_at = now() where id = (select auth.uid()) and active;
$$;

create or replace function public.password_changed()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = (select auth.uid());
$$;

-- ---------- Atribuir evento a um operador de Leitura (desativa o anterior) ----------
create or replace function public.assign_reader_event(p_user uuid, p_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role public.app_role;
begin
  if not (select private.is_admin()) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select role into v_role from public.profiles where id = p_user;
  if v_role is distinct from 'reader' then raise exception 'O usuário não é do perfil Leitura'; end if;
  if p_event is not null and not (select private.can_manage_event(p_event)) then raise exception 'Sem permissão para este evento' using errcode = '42501'; end if;

  update public.user_event_permissions set active = false, assigned_by = auth.uid()
   where user_id = p_user and permission_type = 'read' and active and event_id is distinct from p_event;

  if p_event is not null then
    insert into public.user_event_permissions (user_id, event_id, permission_type, active, assigned_by)
    values (p_user, p_event, 'read', true, auth.uid())
    on conflict (user_id, event_id, permission_type) do update set active = true, assigned_by = auth.uid();
  end if;

  perform private.audit('Evento atribuído', 'Leitura', p_user, p_event,
    coalesce(private.profile_name(p_user), '?') || ' → ' || coalesce((select name from public.events where id = p_event), 'sem evento'), true);
end $$;

-- ---------- Contexto do leitor ----------
create or replace function public.reader_context()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n int; v_ev public.events; v_rs public.reader_settings; v_dev public.devices;
begin
  if (select private.my_role()) is distinct from 'reader' then return jsonb_build_object('status', 'not_reader'); end if;
  select count(*) into v_n from public.user_event_permissions where user_id = auth.uid() and permission_type = 'read' and active;
  if v_n = 0 then return jsonb_build_object('status', 'no_event'); end if;
  if v_n > 1 then
    perform private.audit('Erro de configuração do leitor', 'Leitura', auth.uid(), null, 'Mais de um evento ativo', true);
    return jsonb_build_object('status', 'multiple_events');
  end if;
  select e.* into v_ev from public.events e where e.id = (select private.reader_event_id());
  if v_ev.status <> 'active' then return jsonb_build_object('status', 'event_inactive'); end if;
  select * into v_rs from public.reader_settings where user_id = auth.uid();
  select * into v_dev from public.devices where id = v_rs.device_id and active;
  return jsonb_build_object(
    'status', 'ok', 'event_id', v_ev.id, 'event_name', v_ev.name,
    'device_name', coalesce(v_dev.name, 'Sem dispositivo'), 'device_code', v_dev.device_code,
    'mode', coalesce(v_rs.mode, 'entry'), 'offline_hours', coalesce(v_rs.offline_hours, v_ev.offline_hours),
    'read_interval_s', coalesce(v_rs.read_interval_s, 20), 'result_time_s', coalesce(v_rs.result_time_s, 5),
    'last_sync_at', coalesce(v_dev.last_sync_at, now())
  );
end $$;

-- ---------- Conjunto mínimo para reconhecimento (somente o evento do leitor) ----------
-- Sem CPF, telefone ou e-mail. Usado para o cache offline (IndexedDB).
create or replace function public.reader_dataset()
returns table (employee_id uuid, code text, full_name text, sector_name text, photo_path text, descriptors jsonb, valid_until timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.id, e.employee_code, e.full_name, s.name,
         (select f.photo_path from public.employee_faces f where f.employee_id = e.id and f.is_primary and f.active limit 1),
         coalesce((select jsonb_agg(jsonb_build_object('v', f.descriptor_version, 'd', f.descriptor))
                     from public.employee_faces f where f.employee_id = e.id and f.active and f.review_status = 'approved' and f.descriptor is not null), '[]'::jsonb),
         ee.valid_until
  from public.event_employees ee
  join public.employees e on e.id = ee.employee_id and e.active and e.registration_status = 'complete'
  left join public.sectors s on s.id = ee.sector_id
  where (select private.my_role()) = 'reader'
    and ee.event_id = (select private.reader_event_id())
    and ee.access_status = 'authorized'
$$;

-- ---------- Registro de acesso (transacional e idempotente) ----------
create or replace function public.register_access(
  p_client_record_id uuid,
  p_employee_id uuid,             -- null quando o rosto não foi reconhecido
  p_confidence numeric default null,
  p_device_code text default null,
  p_occurred_at timestamptz default null,
  p_was_offline boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_event_id uuid; v_ev public.events; v_rs public.reader_settings; v_dev public.devices;
  v_emp public.employees; v_link public.event_employees; v_sector text;
  v_last public.access_logs; v_existing public.access_logs;
  v_type public.access_type; v_reason public.denial_reason; v_at timestamptz; v_n int;
begin
  -- idempotência: o mesmo client_record_id devolve o registro já gravado
  select * into v_existing from public.access_logs where client_record_id = p_client_record_id;
  if found then
    if v_existing.reader_user_id <> v_uid then raise exception 'Registro de outro operador' using errcode = '42501'; end if;
    return jsonb_build_object('allowed', v_existing.decision = 'allowed', 'decision', v_existing.decision, 'access_type', v_existing.access_type,
      'reason', v_existing.denial_reason, 'occurred_at', v_existing.occurred_at, 'sync_status', 'synced', 'duplicate_request', true);
  end if;

  if (select private.my_role()) is distinct from 'reader' then raise exception 'Somente o perfil Leitura registra leituras' using errcode = '42501'; end if;
  select count(*) into v_n from public.user_event_permissions where user_id = v_uid and permission_type = 'read' and active;
  if v_n <> 1 then raise exception 'Leitor sem evento válido (%)', v_n using errcode = '42501'; end if;
  v_event_id := (select private.reader_event_id());
  select * into v_ev from public.events where id = v_event_id;
  select * into v_rs from public.reader_settings where user_id = v_uid;

  -- horário: servidor; offline aceita o horário local, mas nunca no futuro
  v_at := case when p_was_offline and p_occurred_at is not null then least(p_occurred_at, now()) else now() end;

  select * into v_dev from public.devices where device_code = p_device_code and reader_user_id = v_uid;
  if not found or not v_dev.active then v_reason := 'device_not_authorized';
  elsif v_ev.status <> 'active' then v_reason := 'event_inactive';
  elsif p_was_offline and v_at < now() - make_interval(hours => coalesce(v_rs.offline_hours, v_ev.offline_hours)) then v_reason := 'offline_data_expired';
  elsif p_employee_id is null then v_reason := 'face_not_recognized';
  end if;

  if v_reason is null then
    select * into v_emp from public.employees where id = p_employee_id;
    select * into v_link from public.event_employees where event_id = v_event_id and employee_id = p_employee_id;
    if v_emp.id is null or v_link.id is null then v_reason := 'employee_not_linked';
    elsif v_emp.registration_status = 'blocked' or v_link.access_status = 'blocked' then v_reason := 'employee_blocked';
    elsif not v_emp.active or v_link.access_status <> 'authorized' then v_reason := 'employee_inactive';
    elsif (v_link.valid_from is not null and v_at < v_link.valid_from) or (v_link.valid_until is not null and v_at > v_link.valid_until) then v_reason := 'outside_validity';
    end if;
  end if;

  if v_reason is null then
    select * into v_last from public.access_logs
     where event_id = v_event_id and employee_id = p_employee_id and decision = 'allowed'
     order by occurred_at desc limit 1;
    -- mesmo rosto dentro do intervalo: não cria segundo registro
    if v_last.id is not null and v_at - v_last.occurred_at < make_interval(secs => coalesce(v_rs.read_interval_s, 20)) then
      return jsonb_build_object('allowed', false, 'decision', 'ignored', 'reason', 'reread_interval', 'occurred_at', v_last.occurred_at, 'sync_status', 'synced');
    end if;
    v_type := case coalesce(v_rs.mode, 'entry')
      when 'auto' then case when v_last.access_type = 'entry' then 'exit'::public.access_type else 'entry'::public.access_type end
      else coalesce(v_rs.mode, 'entry')::text::public.access_type end;
    if v_rs.mode = 'entry' and v_last.access_type = 'entry' then v_reason := 'duplicate_entry';
    elsif v_rs.mode = 'exit' and coalesce(v_last.access_type, 'exit') = 'exit' then v_reason := 'duplicate_exit';
    end if;
    select name into v_sector from public.sectors where id = v_link.sector_id;
  end if;

  insert into public.access_logs (event_id, employee_id, event_employee_id, reader_user_id, sector_id, device_id, access_type, decision,
                                  denial_reason, confidence_score, client_record_id, occurred_at, was_offline, sync_status)
  values (v_event_id, case when v_reason in ('employee_not_linked') then null else p_employee_id end, v_link.id, v_uid, v_link.sector_id, v_dev.id,
          coalesce(v_type, case when v_rs.mode = 'exit' then 'exit' else 'entry' end::public.access_type),
          case when v_reason is null then 'allowed' else 'denied' end::public.access_decision,
          v_reason, p_confidence, p_client_record_id, v_at, coalesce(p_was_offline, false), 'synced');

  if v_dev.id is not null then update public.devices set last_seen_at = now(), last_sync_at = now() where id = v_dev.id; end if;

  -- negativa não devolve dados pessoais
  return case when v_reason is null then jsonb_build_object(
      'allowed', true, 'decision', 'allowed', 'access_type', v_type, 'employee_name', v_emp.full_name, 'code', v_emp.employee_code,
      'sector_name', v_sector, 'occurred_at', v_at, 'sync_status', 'synced')
    else jsonb_build_object('allowed', false, 'decision', 'denied', 'reason', v_reason, 'occurred_at', v_at, 'sync_status', 'synced') end;
end $$;

-- ---------- Liberação manual (Admin Master, Admin e Supervisor) ----------
create or replace function public.manual_release(p_event_id uuid, p_employee_id uuid, p_access_type public.access_type, p_reason text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_link public.event_employees; v_id uuid; v_role public.app_role := (select private.my_role());
begin
  if v_role not in ('admin_master', 'admin', 'supervisor') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if not (select private.can_view_event(p_event_id)) then raise exception 'Sem acesso ao evento' using errcode = '42501'; end if;
  if v_role = 'supervisor' and not exists (select 1 from public.user_event_permissions where user_id = auth.uid() and event_id = p_event_id and active and permission_type in ('supervise', 'manage')) then
    raise exception 'Sem permissão de supervisão neste evento' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_reason)), 0) = 0 then raise exception 'Motivo obrigatório'; end if;
  if (select status from public.events where id = p_event_id) <> 'active' then raise exception 'Evento não está em andamento'; end if;
  select * into v_link from public.event_employees where event_id = p_event_id and employee_id = p_employee_id;
  if v_link.id is null then raise exception 'Funcionário não vinculado ao evento'; end if;

  insert into public.access_logs (event_id, employee_id, event_employee_id, reader_user_id, sector_id, access_type, decision,
                                  manual, manual_reason, note, client_record_id, occurred_at)
  values (p_event_id, p_employee_id, v_link.id, auth.uid(), v_link.sector_id, p_access_type, 'allowed', true, p_reason, p_note, gen_random_uuid(), now())
  returning id into v_id;

  perform private.audit('Liberação manual', 'Acesso', v_id, p_event_id,
    (select full_name from public.employees where id = p_employee_id) || ' — ' || p_access_type || ' — motivo: ' || p_reason, true);
  return v_id;
end $$;

-- ---------- Encerramento: bloqueia novas liberações ----------
create or replace function public.close_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.can_manage_event(p_event_id)) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  update public.events set status = 'finished', closed_at = now() where id = p_event_id and status = 'active';
end $$;

revoke all on function public.touch_last_login(), public.password_changed(), public.assign_reader_event(uuid, uuid),
  public.reader_context(), public.reader_dataset(), public.register_access(uuid, uuid, numeric, text, timestamptz, boolean),
  public.manual_release(uuid, uuid, public.access_type, text, text), public.close_event(uuid) from public, anon;
grant execute on function public.touch_last_login(), public.password_changed(), public.assign_reader_event(uuid, uuid),
  public.reader_context(), public.reader_dataset(), public.register_access(uuid, uuid, numeric, text, timestamptz, boolean),
  public.manual_release(uuid, uuid, public.access_type, text, text), public.close_event(uuid) to authenticated;

-- =====================================================================
-- VIEWS (security_invoker: o RLS das tabelas vale para quem consulta)
-- Os nomes de colunas seguem os tipos do frontend (src/types).
-- =====================================================================

create or replace function private.denial_label(r public.denial_reason)
returns text language sql immutable set search_path = '' as $$
  select case when r is null then null else case r
    when 'face_not_found' then 'Nenhum rosto detectado' when 'face_not_recognized' then 'Rosto não reconhecido'
    when 'employee_inactive' then 'Funcionário inativo' when 'employee_not_linked' then 'Funcionário não vinculado ao evento'
    when 'employee_blocked' then 'Funcionário bloqueado' when 'event_inactive' then 'Evento encerrado'
    when 'reader_not_authorized' then 'Operador sem autorização' when 'device_not_authorized' then 'Dispositivo não autorizado'
    when 'duplicate_entry' then 'Entrada duplicada' when 'duplicate_exit' then 'Saída duplicada'
    when 'outside_validity' then 'Fora do período permitido' when 'offline_data_expired' then 'Dados offline desatualizados'
    else 'Outro motivo' end end
$$;
grant execute on function private.denial_label(public.denial_reason) to authenticated;

-- Última movimentação liberada de cada funcionário por evento (base de "presentes")
create view public.v_presence with (security_invoker = true) as
select distinct on (l.event_id, l.employee_id) l.event_id, l.employee_id, l.sector_id, l.access_type, l.occurred_at
from public.access_logs l
where l.decision = 'allowed' and l.employee_id is not null
order by l.event_id, l.employee_id, l.occurred_at desc;

create view public.v_events with (security_invoker = true) as
select e.id, e.name, e.description, e.venue_name, e.city, e.state, e.starts_at, e.ends_at, e.status,
       coalesce(e.manager_name, private.profile_name(e.created_by)) as manager, e.offline_hours,
       (select count(*) from public.event_employees ee where ee.event_id = e.id and ee.access_status = 'authorized')::int as staff_count
from public.events e;

create view public.v_sectors with (security_invoker = true) as
select s.id, s.event_id, s.name, s.color, s.description, s.manager_name as manager, s.active,
       (select count(*) from public.event_employees ee where ee.sector_id = s.id and ee.access_status = 'authorized')::int as staff_count,
       (select count(*) from public.v_presence p where p.sector_id = s.id and p.access_type = 'entry')::int as present
from public.sectors s;

create view public.v_shifts with (security_invoker = true) as
select id, event_id, sector_id, name, to_char(starts_time, 'HH24:MI') as start, to_char(ends_time, 'HH24:MI') as "end", tolerance_min, break_min
from public.shifts where active;

create view public.v_employees with (security_invoker = true) as
select e.id, e.employee_code as code, e.full_name, coalesce(e.cpf, '') as document, coalesce(e.phone, '') as phone, coalesce(e.email, '') as email,
       ee.event_id, ee.sector_id, ee.shift_id,
       case when exists (select 1 from public.employee_faces f where f.employee_id = e.id and f.active and f.review_status = 'approved' and f.is_primary) then 'complete'
            when exists (select 1 from public.employee_faces f where f.employee_id = e.id and f.active and f.review_status = 'redo') then 'redo'
            when exists (select 1 from public.employee_faces f where f.employee_id = e.id and f.active) then 'pending'
            else 'none' end as face_status,
       exists (select 1 from public.employee_consents c where c.employee_id = e.id and c.status = 'accepted') as consent,
       case when e.registration_status = 'blocked' or ee.access_status = 'blocked' then 'blocked'
            when e.registration_status = 'pending' then 'pending' else 'active' end as status,
       e.self_registered
from public.employees e
left join lateral (
  select x.* from public.event_employees x where x.employee_id = e.id order by x.created_at desc limit 1
) ee on true;

create view public.v_access_logs with (security_invoker = true) as
select l.id, l.event_id, l.employee_id,
       coalesce(e.full_name, 'Não identificado') as employee_name, coalesce(s.name, '—') as sector_name,
       l.access_type, l.decision, private.denial_label(l.denial_reason) as reason,
       coalesce(d.name, case when l.manual then 'Painel administrativo' else '—' end) as device_name,
       coalesce(private.profile_name(l.reader_user_id), '—') as operator_name,
       l.occurred_at, l.manual, l.was_offline
from public.access_logs l
left join public.employees e on e.id = l.employee_id
left join public.sectors s on s.id = l.sector_id
left join public.devices d on d.id = l.device_id;

create view public.v_devices with (security_invoker = true) as
select d.id, d.device_code as code, d.name, d.event_id, private.profile_name(d.reader_user_id) as operator_name,
       coalesce(rs.mode, 'entry') as mode, coalesce(d.last_sync_at, d.created_at) as last_sync_at, d.battery,
       coalesce(d.app_version, '—') as app_version,
       (d.active and d.last_seen_at > now() - interval '2 minutes') as online, d.active, d.pending_sync
from public.devices d
left join public.reader_settings rs on rs.user_id = d.reader_user_id;

create view public.v_users with (security_invoker = true) as
select p.id, p.full_name, coalesce(p.email, '') as email, p.role, p.active, p.last_login_at,
       coalesce((select array_agg(distinct u.event_id::text) from public.user_event_permissions u where u.user_id = p.id and u.active), '{}') as events
from public.profiles p;

create view public.v_reader_configs with (security_invoker = true) as
select p.id, p.id as operator_id, p.full_name as operator_name,
       (select u.event_id from public.user_event_permissions u where u.user_id = p.id and u.permission_type = 'read' and u.active limit 1) as event_id,
       rs.device_id, coalesce(rs.mode, 'entry') as mode, coalesce(rs.read_interval_s, 20) as read_interval_s,
       coalesce(rs.result_time_s, 5) as result_time_s, coalesce(rs.offline_hours, 24) as offline_hours
from public.profiles p
left join public.reader_settings rs on rs.user_id = p.id
where p.role = 'reader';

create view public.v_audit with (security_invoker = true) as
select a.id, coalesce(private.profile_name(a.actor_user_id), 'Sistema') as actor, a.action, a.entity_type as entity,
       coalesce(a.detail, '') as detail, a.sensitive, a.created_at
from public.audit_logs a;

create view public.v_consents with (security_invoker = true) as
select c.id, c.employee_id, e.full_name as employee_name, t.version as term_version, c.accepted_at, coalesce(c.accepted_by, '—') as accepted_by, c.status
from public.employee_consents c
join public.employees e on e.id = c.employee_id
join public.consent_terms t on t.id = c.term_id;

-- Indicadores do evento em andamento visível ao usuário (o mais recente)
create view public.v_dashboard_stats with (security_invoker = true) as
with ev as (
  select id from public.events where status = 'active' order by starts_at desc nulls last limit 1
), today as (
  select l.* from public.access_logs l, ev
  where l.event_id = ev.id and l.occurred_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
)
select
  (select count(*) from public.event_employees ee, ev where ee.event_id = ev.id and ee.access_status = 'authorized')::int as scheduled,
  (select count(*) from public.v_presence p, ev where p.event_id = ev.id and p.access_type = 'entry')::int as present,
  (select count(*) from today where decision = 'allowed' and access_type = 'entry')::int as entries,
  (select count(*) from today where decision = 'allowed' and access_type = 'exit')::int as exits,
  (select count(*) from today where decision = 'denied')::int as denied,
  (select count(*) from public.devices d, ev where d.event_id = ev.id and d.active and d.last_seen_at > now() - interval '2 minutes')::int as "devicesOnline",
  (select count(*) from public.devices d, ev where d.event_id = ev.id and d.active and (d.last_seen_at is null or d.last_seen_at <= now() - interval '2 minutes'))::int as "devicesOffline",
  (select coalesce(sum(d.pending_sync), 0) from public.devices d, ev where d.event_id = ev.id)::int as "pendingSync";

create view public.v_access_hourly with (security_invoker = true) as
with ev as (select id from public.events where status = 'active' order by starts_at desc nulls last limit 1)
select to_char(date_trunc('hour', l.occurred_at at time zone 'America/Sao_Paulo'), 'HH24') || 'h' as h,
       count(*) filter (where l.access_type = 'entry')::int as "in",
       count(*) filter (where l.access_type = 'exit')::int as "out"
from public.access_logs l, ev
where l.event_id = ev.id and l.decision = 'allowed' and l.occurred_at > now() - interval '16 hours'
group by 1;

grant select on public.v_presence, public.v_events, public.v_sectors, public.v_shifts, public.v_employees, public.v_access_logs,
  public.v_devices, public.v_users, public.v_reader_configs, public.v_audit, public.v_consents,
  public.v_dashboard_stats, public.v_access_hourly to authenticated;

-- ---------- Realtime (somente o necessário) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.access_logs, public.devices;
  end if;
end $$;


-- =====================================================================
-- EVENTOID — 0004 · Primeiro Administrador Master e termo inicial
-- O e-mail abaixo vira Administrador Master automaticamente:
--   • se a conta já existir no Auth, é promovida agora;
--   • se for criada depois (Authentication → Users → Add user), é promovida no cadastro.
-- Funciona só enquanto não houver nenhum Administrador Master no sistema.
-- =====================================================================

create table private.bootstrap_admin (
  email text primary key check (email = lower(email)),
  full_name text not null
);
revoke all on private.bootstrap_admin from public, anon, authenticated;

-- >>> TROQUE AQUI pelo seu e-mail e nome <<<
insert into private.bootstrap_admin (email, full_name)
values (lower('SEU-EMAIL@dominio.com.br'), 'Eric Filipe');

-- Cadastro no Auth: perfil padrão (viewer, inativo) ou Admin Master, se for o e-mail do bootstrap
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_boot private.bootstrap_admin;
begin
  select * into v_boot from private.bootstrap_admin b
   where b.email = lower(new.email)
     and not exists (select 1 from public.profiles p where p.role = 'admin_master');

  if v_boot.email is not null then
    insert into public.profiles (id, full_name, email, role, active, must_change_password)
    values (new.id, v_boot.full_name, lower(new.email), 'admin_master', true, false)
    on conflict (id) do update set role = 'admin_master', active = true, must_change_password = false, full_name = excluded.full_name;
  else
    insert into public.profiles (id, full_name, email)
    values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)), lower(new.email))
    on conflict (id) do nothing;
  end if;
  return new;
end $$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

-- Conta já existente (caso tenha sido criada antes de rodar este SQL)
insert into public.profiles (id, full_name, email, role, active, must_change_password)
select u.id, b.full_name, lower(u.email), 'admin_master', true, false
from auth.users u
join private.bootstrap_admin b on b.email = lower(u.email)
where not exists (select 1 from public.profiles p where p.role = 'admin_master')
on conflict (id) do update set role = 'admin_master', active = true, must_change_password = false, full_name = excluded.full_name;

-- Termo de consentimento inicial (o texto pode ser trocado depois em Privacidade → Novo termo)
insert into public.consent_terms (version, purpose, retention, body, is_current)
values (
  'v1.0',
  'Identificar funcionários na entrada e saída do evento, registrar presença e impedir acessos não autorizados.',
  'Definido pelo Administrador Master conforme a política da empresa.',
  'Ao aceitar, o funcionário autoriza o uso da sua imagem facial exclusivamente para controle de acesso e presença nos eventos em que estiver escalado. O consentimento pode ser revogado a qualquer momento; nesse caso a biometria é excluída e o acesso passa a ser liberado manualmente.',
  true
) on conflict (version) do nothing;


-- =====================================================================
-- EVENTOID — 0005 · Autocadastro por link do evento
-- Fluxo: o funcionário abre /autocadastro/{link}, envia dados + selfie + aceite do termo.
-- O cadastro fica PENDENTE até um administrador do evento aprovar manualmente.
-- Funções públicas (anon) são SECURITY DEFINER com validação completa dentro delas;
-- nenhuma tabela é liberada para anon.
-- =====================================================================

-- ---------- Link por evento ----------
alter table public.events
  add column if not exists signup_token uuid not null default gen_random_uuid(),
  add column if not exists signup_enabled boolean not null default true;
create unique index if not exists events_signup_token_uidx on public.events (signup_token);

-- Tíquete de uso único para o envio da selfie (30 minutos)
create table if not exists private.self_upload_tickets (
  token uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists self_upload_tickets_event_idx on private.self_upload_tickets (event_id, created_at desc);
create index if not exists self_upload_tickets_employee_idx on private.self_upload_tickets (employee_id);
revoke all on private.self_upload_tickets from public, anon, authenticated;

-- ---------- Validação de CPF (dígitos verificadores) ----------
create or replace function private.cpf_valid(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; r int; i int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;

-- ---------- Página pública: dados do evento pelo link ----------
create or replace function public.signup_event_info(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ev public.events; v_term public.consent_terms;
begin
  select * into v_ev from public.events where signup_token = p_token;
  if v_ev.id is null or not v_ev.signup_enabled or v_ev.status not in ('scheduled', 'active') then
    return jsonb_build_object('status', 'unavailable');
  end if;
  select * into v_term from public.consent_terms where is_current limit 1;
  return jsonb_build_object(
    'status', case when v_term.id is null then 'no_term' else 'ok' end,
    'name', v_ev.name, 'venue_name', v_ev.venue_name, 'city', v_ev.city, 'state', v_ev.state,
    'starts_at', v_ev.starts_at, 'ends_at', v_ev.ends_at,
    'sectors', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
                           from public.sectors s where s.event_id = v_ev.id and s.active), '[]'::jsonb),
    'term', case when v_term.id is null then null else jsonb_build_object(
      'version', v_term.version, 'purpose', v_term.purpose, 'retention', v_term.retention, 'body', v_term.body) end
  );
end $$;

-- ---------- Envio do cadastro ----------
create or replace function public.self_register(
  p_token uuid, p_full_name text, p_cpf text, p_phone text, p_email text,
  p_sector_id uuid, p_term_version text, p_accept boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ev public.events; v_term public.consent_terms; v_emp_id uuid; v_ticket uuid;
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_name text := regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_recent int;
begin
  select * into v_ev from public.events where signup_token = p_token;
  if v_ev.id is null or not v_ev.signup_enabled or v_ev.status not in ('scheduled', 'active') then
    raise exception 'Link de cadastro indisponível. Procure a organização do evento.';
  end if;
  select * into v_term from public.consent_terms where is_current limit 1;
  if v_term.id is null or v_term.version is distinct from p_term_version then raise exception 'O termo foi atualizado. Recarregue a página.'; end if;
  if not coalesce(p_accept, false) then raise exception 'É preciso aceitar o termo de uso da biometria.'; end if;
  if length(v_name) < 5 or v_name !~ ' ' or length(v_name) > 120 then raise exception 'Informe o nome completo.'; end if;
  if not private.cpf_valid(v_cpf) then raise exception 'CPF inválido.'; end if;
  if v_phone is null or length(v_phone) not between 10 and 11 then raise exception 'Telefone inválido.'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.'; end if;
  if p_sector_id is not null and not exists (select 1 from public.sectors where id = p_sector_id and event_id = v_ev.id and active) then
    raise exception 'Setor inválido.';
  end if;

  -- limite simples contra envio em massa
  select count(*) into v_recent from private.self_upload_tickets where event_id = v_ev.id and created_at > now() - interval '10 minutes';
  if v_recent >= 200 then raise exception 'Muitos cadastros ao mesmo tempo. Tente novamente em alguns minutos.'; end if;

  select id into v_emp_id from public.employees where cpf = v_cpf;
  if v_emp_id is not null then
    -- funcionário já existe: não altera dados já cadastrados, só pede o vínculo com este evento
    if exists (select 1 from public.event_employees where event_id = v_ev.id and employee_id = v_emp_id) then
      raise exception 'Este CPF já tem cadastro neste evento. Procure a organização.';
    end if;
    if exists (select 1 from public.employees where id = v_emp_id and registration_status = 'blocked') then
      raise exception 'Cadastro não permitido. Procure a organização do evento.';
    end if;
  else
    insert into public.employees (full_name, cpf, phone, email, registration_status, self_registered)
    values (v_name, v_cpf, v_phone, v_email, 'pending', true) returning id into v_emp_id;
  end if;

  insert into public.event_employees (event_id, employee_id, sector_id, access_status)
  values (v_ev.id, v_emp_id, p_sector_id, 'pending');

  insert into public.employee_consents (employee_id, term_id, status, accepted_at, accepted_by)
  values (v_emp_id, v_term.id, 'accepted', now(), 'Autocadastro (link)')
  on conflict (employee_id, term_id) do update set status = 'accepted', accepted_at = now(), revoked_at = null, accepted_by = 'Autocadastro (link)';

  insert into private.self_upload_tickets (employee_id, event_id) values (v_emp_id, v_ev.id) returning token into v_ticket;

  insert into public.audit_logs (action, entity_type, entity_id, event_id, detail, sensitive)
  values ('Autocadastro recebido', 'employees', v_emp_id, v_ev.id, v_name, true);

  return jsonb_build_object('employee_id', v_emp_id, 'upload_token', v_ticket);
end $$;

-- Caminho esperado da selfie: employees/{employee_id}/self-{ticket}.jpg
create or replace function private.valid_self_upload(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.self_upload_tickets t
    where t.used_at is null and t.expires_at > now()
      and p_name = 'employees/' || t.employee_id || '/self-' || t.token || '.jpg'
  )
$$;

-- ---------- Confirma a selfie enviada ----------
create or replace function public.self_register_photo(p_ticket uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t private.self_upload_tickets; v_path text;
begin
  select * into v_t from private.self_upload_tickets where token = p_ticket for update;
  if v_t.token is null or v_t.used_at is not null or v_t.expires_at < now() then raise exception 'Envio expirado. Refaça o cadastro.'; end if;
  v_path := 'employees/' || v_t.employee_id || '/self-' || v_t.token || '.jpg';
  if not exists (select 1 from storage.objects where bucket_id = 'employee-faces' and name = v_path) then
    raise exception 'Foto não recebida. Tente enviar novamente.';
  end if;
  insert into public.employee_faces (employee_id, photo_path, angle, is_primary, review_status)
  values (v_t.employee_id, v_path, 'front', false, 'pending');
  update private.self_upload_tickets set used_at = now() where token = p_ticket;
end $$;

-- ---------- Permissões ----------
grant usage on schema private to anon;
revoke all on function private.cpf_valid(text), private.valid_self_upload(text) from public;
grant execute on function private.valid_self_upload(text) to anon, authenticated;
grant execute on function private.cpf_valid(text) to authenticated;

revoke all on function public.signup_event_info(uuid), public.self_register(uuid, text, text, text, text, uuid, text, boolean),
  public.self_register_photo(uuid) from public;
grant execute on function public.signup_event_info(uuid), public.self_register(uuid, text, text, text, text, uuid, text, boolean),
  public.self_register_photo(uuid) to anon, authenticated;

-- anon só pode ENVIAR a própria selfie, no caminho do tíquete válido (não lê, não altera, não apaga)
drop policy if exists faces_obj_self_insert on storage.objects;
create policy faces_obj_self_insert on storage.objects for insert to anon, authenticated with check (
  bucket_id = 'employee-faces' and private.valid_self_upload(name)
);

-- ---------- Views atualizadas (novas colunas no final) ----------
drop view if exists public.v_events;
create view public.v_events with (security_invoker = true) as
select e.id, e.name, e.description, e.venue_name, e.city, e.state, e.starts_at, e.ends_at, e.status,
       coalesce(e.manager_name, private.profile_name(e.created_by)) as manager, e.offline_hours,
       (select count(*) from public.event_employees ee where ee.event_id = e.id and ee.access_status = 'authorized')::int as staff_count,
       case when private.can_manage_event(e.id) then e.signup_token end as signup_token,
       e.signup_enabled
from public.events e;

drop view if exists public.v_employees;
create view public.v_employees with (security_invoker = true) as
select e.id, e.employee_code as code, e.full_name, coalesce(e.cpf, '') as document, coalesce(e.phone, '') as phone, coalesce(e.email, '') as email,
       ee.event_id, ee.sector_id, ee.shift_id,
       case when exists (select 1 from public.employee_faces f where f.employee_id = e.id and f.active and f.review_status = 'approved' and f.is_primary) then 'complete'
            when exists (select 1 from public.employee_faces f where f.employee_id = e.id and f.active and f.review_status = 'redo') then 'redo'
            when exists (select 1 from public.employee_faces f where f.employee_id = e.id and f.active) then 'pending'
            else 'none' end as face_status,
       exists (select 1 from public.employee_consents c where c.employee_id = e.id and c.status = 'accepted') as consent,
       case when e.registration_status = 'blocked' or ee.access_status = 'blocked' then 'blocked'
            when e.registration_status = 'pending' or ee.access_status = 'pending' then 'pending' else 'active' end as status,
       e.self_registered,
       (select f.photo_path from public.employee_faces f where f.employee_id = e.id and f.active
         order by (f.review_status = 'pending') desc, f.is_primary desc, f.created_at desc limit 1) as photo_path,
       ee.access_status as link_status
from public.employees e
left join lateral (
  select x.* from public.event_employees x where x.employee_id = e.id
  order by (x.access_status = 'pending') desc, x.created_at desc limit 1
) ee on true;

grant select on public.v_events, public.v_employees to authenticated;


-- =====================================================================
-- EVENTOID — 0006 · Empresa do funcionário no evento (terceirizadas)
-- A empresa fica no VÍNCULO com o evento: a mesma pessoa pode trabalhar
-- por empresas diferentes em eventos diferentes.
-- Requer o 0005 (autocadastro). Pode ser rodado mais de uma vez.
-- =====================================================================

alter table public.event_employees
  add column if not exists company_name text check (company_name is null or length(company_name) between 2 and 120);
create index if not exists event_employees_company_idx on public.event_employees (event_id, lower(company_name));

-- Normaliza espaços
create or replace function private.normalize_company()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.company_name := nullif(regexp_replace(trim(coalesce(new.company_name, '')), '\s+', ' ', 'g'), '');
  return new;
end $$;
drop trigger if exists event_employees_company on public.event_employees;
create trigger event_employees_company before insert or update of company_name on public.event_employees
  for each row execute function private.normalize_company();
revoke execute on function private.normalize_company() from public, anon, authenticated;

-- ---------- Autocadastro com empresa (substitui a versão anterior) ----------
drop function if exists public.self_register(uuid, text, text, text, text, uuid, text, boolean);

create or replace function public.self_register(
  p_token uuid, p_full_name text, p_cpf text, p_phone text, p_email text,
  p_sector_id uuid, p_company text, p_term_version text, p_accept boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ev public.events; v_term public.consent_terms; v_emp_id uuid; v_ticket uuid;
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_name text := regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_company text := regexp_replace(trim(coalesce(p_company, '')), '\s+', ' ', 'g');
  v_recent int;
begin
  select * into v_ev from public.events where signup_token = p_token;
  if v_ev.id is null or not v_ev.signup_enabled or v_ev.status not in ('scheduled', 'active') then
    raise exception 'Link de cadastro indisponível. Procure a organização do evento.';
  end if;
  select * into v_term from public.consent_terms where is_current limit 1;
  if v_term.id is null or v_term.version is distinct from p_term_version then raise exception 'O termo foi atualizado. Recarregue a página.'; end if;
  if not coalesce(p_accept, false) then raise exception 'É preciso aceitar o termo de uso da biometria.'; end if;
  if length(v_name) < 5 or v_name !~ ' ' or length(v_name) > 120 then raise exception 'Informe o nome completo.'; end if;
  if not private.cpf_valid(v_cpf) then raise exception 'CPF inválido.'; end if;
  if v_phone is null or length(v_phone) not between 10 and 11 then raise exception 'Telefone inválido.'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.'; end if;
  if length(v_company) < 2 or length(v_company) > 120 then raise exception 'Informe a empresa pela qual você vai trabalhar.'; end if;
  if p_sector_id is not null and not exists (select 1 from public.sectors where id = p_sector_id and event_id = v_ev.id and active) then
    raise exception 'Setor inválido.';
  end if;

  select count(*) into v_recent from private.self_upload_tickets where event_id = v_ev.id and created_at > now() - interval '10 minutes';
  if v_recent >= 200 then raise exception 'Muitos cadastros ao mesmo tempo. Tente novamente em alguns minutos.'; end if;

  select id into v_emp_id from public.employees where cpf = v_cpf;
  if v_emp_id is not null then
    if exists (select 1 from public.event_employees where event_id = v_ev.id and employee_id = v_emp_id) then
      raise exception 'Este CPF já tem cadastro neste evento. Procure a organização.';
    end if;
    if exists (select 1 from public.employees where id = v_emp_id and registration_status = 'blocked') then
      raise exception 'Cadastro não permitido. Procure a organização do evento.';
    end if;
  else
    insert into public.employees (full_name, cpf, phone, email, registration_status, self_registered)
    values (v_name, v_cpf, v_phone, v_email, 'pending', true) returning id into v_emp_id;
  end if;

  insert into public.event_employees (event_id, employee_id, sector_id, company_name, access_status)
  values (v_ev.id, v_emp_id, p_sector_id, v_company, 'pending');

  insert into public.employee_consents (employee_id, term_id, status, accepted_at, accepted_by)
  values (v_emp_id, v_term.id, 'accepted', now(), 'Autocadastro (link)')
  on conflict (employee_id, term_id) do update set status = 'accepted', accepted_at = now(), revoked_at = null, accepted_by = 'Autocadastro (link)';

  insert into private.self_upload_tickets (employee_id, event_id) values (v_emp_id, v_ev.id) returning token into v_ticket;

  insert into public.audit_logs (action, entity_type, entity_id, event_id, detail, sensitive)
  values ('Autocadastro recebido', 'employees', v_emp_id, v_ev.id, v_name || ' — ' || v_company, true);

  return jsonb_build_object('employee_id', v_emp_id, 'upload_token', v_ticket);
end $$;

revoke all on function public.self_register(uuid, text, text, text, text, uuid, text, text, boolean) from public;
grant execute on function public.self_register(uuid, text, text, text, text, uuid, text, text, boolean) to anon, authenticated;

-- ---------- Views com a empresa (coluna nova no final) ----------
drop view if exists public.v_employees;
create view public.v_employees with (security_invoker = true) as
select e.id, e.employee_code as code, e.full_name, coalesce(e.cpf, '') as document, coalesce(e.phone, '') as phone, coalesce(e.email, '') as email,
       ee.event_id, ee.sector_id, ee.shift_id,
       case when exists (select 1 from public.employee_faces f where f.employee_id = e.id and f.active and f.review_status = 'approved' and f.is_primary) then 'complete'
            when exists (select 1 from public.employee_faces f where f.employee_id = e.id and f.active and f.review_status = 'redo') then 'redo'
            when exists (select 1 from public.employee_faces f where f.employee_id = e.id and f.active) then 'pending'
            else 'none' end as face_status,
       exists (select 1 from public.employee_consents c where c.employee_id = e.id and c.status = 'accepted') as consent,
       case when e.registration_status = 'blocked' or ee.access_status = 'blocked' then 'blocked'
            when e.registration_status = 'pending' or ee.access_status = 'pending' then 'pending' else 'active' end as status,
       e.self_registered,
       (select f.photo_path from public.employee_faces f where f.employee_id = e.id and f.active
         order by (f.review_status = 'pending') desc, f.is_primary desc, f.created_at desc limit 1) as photo_path,
       ee.access_status as link_status,
       ee.company_name as company
from public.employees e
left join lateral (
  select x.* from public.event_employees x where x.employee_id = e.id
  order by (x.access_status = 'pending') desc, x.created_at desc limit 1
) ee on true;

drop view if exists public.v_access_logs;
create view public.v_access_logs with (security_invoker = true) as
select l.id, l.event_id, l.employee_id,
       coalesce(e.full_name, 'Não identificado') as employee_name, coalesce(s.name, '—') as sector_name,
       l.access_type, l.decision, private.denial_label(l.denial_reason) as reason,
       coalesce(d.name, case when l.manual then 'Painel administrativo' else '—' end) as device_name,
       coalesce(private.profile_name(l.reader_user_id), '—') as operator_name,
       l.occurred_at, l.manual, l.was_offline,
       ee.company_name as company
from public.access_logs l
left join public.employees e on e.id = l.employee_id
left join public.sectors s on s.id = l.sector_id
left join public.devices d on d.id = l.device_id
left join public.event_employees ee on ee.id = l.event_employee_id;

grant select on public.v_employees, public.v_access_logs to authenticated;
