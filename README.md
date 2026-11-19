# EVENTOID — Controle de Equipes

Controle de acesso, presença e equipes temporárias em eventos por reconhecimento facial.
React + TypeScript + Vite + Tailwind · Supabase (Auth, Postgres com RLS, Storage privado, Realtime) · PWA.

Desenvolvido por EFCsys • Todos os direitos reservados.

## Rodar localmente

```bash
npm install
cp .env.example .env      # preencha URL e chave pública do Supabase
npm run dev               # http://localhost:5173
```

Modo demonstração (dados fictícios e seletor de perfil no login): `VITE_DEMO_MODE=true` no `.env`.
Preview em arquivo único, para aprovar o layout: `npm run build:preview` (gera `dist-preview/index.html`).

## Banco de dados (Supabase)

1. Crie um projeto novo no Supabase (região **São Paulo — sa-east-1**).
2. Em **SQL Editor**, rode o arquivo `supabase/EVENTOID_banco_completo.sql` (ele junta os três arquivos de `supabase/migrations`, na ordem).
3. Em **Authentication → Users**, crie a sua conta (e-mail e senha).
4. Rode `supabase/primeiro_admin_master.sql`, com o seu e-mail, para virar Administrador Master.
5. Em **Project Settings → API**, copie a **Project URL** e a **publishable key** (ou a anon key) para o `.env`.
   Nunca coloque a `service_role` no frontend.

O que o banco já faz:
- 15 tabelas com RLS em todas, sem acesso para `anon`, e grants explícitos para `authenticated`.
- Perfis: `admin_master`, `admin`, `supervisor`, `reader` (Leitura) e `viewer` (Acompanhamento). Todo usuário novo nasce `viewer` e inativo; só um administrador muda o papel.
- Leitura: um único evento ativo por operador (índice único). A troca de evento passa por `assign_reader_event`, que desativa o vínculo anterior e registra auditoria.
- `register_access`: registro transacional e idempotente (`client_record_id`). Valida o operador, o dispositivo, o evento, o vínculo, o bloqueio e a validade; decide entrada ou saída no servidor; ignora a releitura do mesmo rosto dentro do intervalo (20 s); e não devolve dados pessoais quando nega.
- `reader_dataset`: dados mínimos para o reconhecimento do evento do leitor, sem CPF, telefone ou e-mail.
- `manual_release`: liberação manual por Admin Master, Admin ou Supervisor, com motivo obrigatório e auditoria.
- Auditoria automática por triggers (perfis, eventos, funcionários, biometria, vínculos e permissões). Ninguém edita nem apaga registros de auditoria.
- Bucket privado `employee-faces` (`employees/{id}/arquivo`): administradores enviam as fotos, e o operador de Leitura só lê fotos do próprio evento.
- Views `v_*` com `security_invoker = true`, já no formato que o frontend usa.

## Convite de usuários (Edge Function)

Os usuários entram por convite e definem a senha pelo e-mail. A função `supabase/functions/invite-user` usa a `service_role` só no servidor.

```bash
npm i -g supabase          # ou: npx supabase
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy invite-user
```

Em **Authentication → URL Configuration**:
- **Site URL**: o endereço do app (ex.: `https://eventoid.seudominio.com.br`).
- **Redirect URLs**: inclua `https://SEU-DOMINIO/login` e `https://SEU-DOMINIO/definir-senha`.

Opcional: defina o secret `ALLOWED_ORIGIN` da função com o domínio do app, para restringir o CORS.

## Publicar na Shard Cloud

```bash
npm install
npm run build             # gera dist/
npm start                 # node server.js (usa a variável PORT; padrão 8080)
```

- O comando de início é `npm start`, com Node 20 ou superior.
- As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` são lidas **no build**: defina-as antes de rodar `npm run build`.
- `server.js` serve o `dist/` com fallback para as rotas do React e cabeçalhos de segurança, sem dependências extras.

## Estrutura

```
src/
  components/layout   AppShell (menu, cabeçalho, alertas), assinatura EFCsys
  components/ui       botões, cards, tabela/cartões responsivos, modais, gráficos
  pages/              Login, 14 telas administrativas, detalhe do evento, Leitor
  services/           api.ts (única camada de dados), reader.ts
  hooks/              useAuth, useData
  data/demo.ts        dados demonstrativos (somente VITE_DEMO_MODE=true)
supabase/migrations   0001 estrutura · 0002 segurança · 0003 funções e views
```

## Status por etapa

| Etapa | Situação |
|---|---|
| Frontend navegável (todas as telas e estados) | pronto |
| Banco, RLS, Storage e funções de acesso | pronto (testado em Postgres local) |
| Leitura das telas a partir das views | pronto |
| Gravações: eventos, encerramento, setores, turnos, funcionários (criar, aprovar, bloquear), captura facial com upload, convite e ativação de usuários, configuração de leitores, dispositivos, liberação manual, configurações e assinatura, termos, revogação e exclusão de biometria | pronto |
| Primeiro acesso e recuperação de senha | pronto (`/definir-senha`) |
| Exportação Excel (CSV) de relatórios, monitoramento e auditoria; PDF pela impressão do navegador | pronto |
| PWA: manifest, ícones circulares e maskable, service worker só do shell, convite de instalação discreto, safe areas | pronto |
| Leitor: registro por código no servidor (`register_access`) | pronto |
| Reconhecimento facial automático (face-api.js + descritores) | pendente |
| Fila offline do leitor (IndexedDB) e sincronização | pendente: o banco já aceita `was_offline` e `client_record_id` |
| Página pública de autocadastro | pendente |
