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
select c.id, e.full_name as employee_name, t.version as term_version, c.accepted_at, coalesce(c.accepted_by, '—') as accepted_by, c.status
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
