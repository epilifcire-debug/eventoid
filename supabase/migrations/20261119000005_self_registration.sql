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
