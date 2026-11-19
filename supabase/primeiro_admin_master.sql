-- Rode DEPOIS de criar sua conta em Authentication → Users (Add user → Create new user).
-- Troque o e-mail pelo seu. Isso transforma a sua conta no Administrador Master.
update public.profiles
   set role = 'admin_master', active = true, must_change_password = false, full_name = 'Eric Filipe'
 where email = 'SEU-EMAIL@dominio.com.br';

-- Termo de consentimento inicial (ajuste o texto com o jurídico)
insert into public.consent_terms (version, purpose, retention, body, is_current)
values ('v1.0',
  'Identificar funcionários na entrada e saída do evento e registrar presença.',
  'Definido pelo Administrador Master conforme a política da empresa.',
  'Texto completo do termo de uso da biometria.', true);
