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
