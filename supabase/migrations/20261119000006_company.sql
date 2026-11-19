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
