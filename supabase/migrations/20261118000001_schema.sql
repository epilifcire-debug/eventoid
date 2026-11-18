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
