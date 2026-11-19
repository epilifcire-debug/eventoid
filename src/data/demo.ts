/**
 * DADOS DEMONSTRATIVOS — usados somente com VITE_DEMO_MODE=true.
 * Camada única de dados fictícios; nunca são gravados no banco.
 */
import type {
  AccessLog, AlertItem, AppUser, AuditEntry, ConsentEntry, Device, Employee, EventItem,
  ReaderConfig, Sector, Shift,
} from '../types';

let seed = 20260110;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const H = 3600_000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const todayAt = (h: number, m = 0) => {
  const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime();
};

export const demoEvents: EventItem[] = [
  { id: 'ev1', name: 'Festival Horizonte 2026', description: 'Festival de música com três palcos e área gastronômica.', venue_name: 'Parque da Cidade', city: 'São Paulo', state: 'SP', starts_at: iso(todayAt(8) - 24 * H), ends_at: iso(todayAt(23) + 24 * H), status: 'active', manager: 'Admin Silva', offline_hours: 24, staff_count: 1200 },
  { id: 'ev2', name: 'Congresso Saúde Nordeste', description: 'Congresso com credenciamento de expositores.', venue_name: 'Centro de Convenções', city: 'Aracaju', state: 'SE', starts_at: iso(now + 9 * 24 * H), ends_at: iso(now + 11 * 24 * H), status: 'scheduled', manager: 'Paula Menezes', offline_hours: 24, staff_count: 320 },
  { id: 'ev3', name: 'Corrida Noturna Orla', description: 'Corrida de rua 5 km e 10 km.', venue_name: 'Orla de Atalaia', city: 'Aracaju', state: 'SE', starts_at: iso(now - 20 * 24 * H), ends_at: iso(now - 20 * 24 * H + 6 * H), status: 'finished', manager: 'Admin Silva', offline_hours: 12, staff_count: 140 },
  { id: 'ev4', name: 'Feira de Negócios 2027', venue_name: 'Expo Center Norte', city: 'São Paulo', state: 'SP', starts_at: iso(now + 60 * 24 * H), ends_at: iso(now + 63 * 24 * H), status: 'draft', manager: 'Paula Menezes', offline_hours: 24, staff_count: 0 },
];

const SECTORS: Array<[string, string, number, number]> = [
  ['Produção', '#2563EB', 340, 312], ['Segurança', '#0B1930', 210, 198], ['Limpeza', '#0D9488', 140, 122],
  ['Garçom', '#CA8A04', 120, 96], ['Apoio', '#0891B2', 90, 78], ['Credenciamento', '#1D4ED8', 48, 36],
  ['Portaria', '#475569', 80, 0], ['Bilheteria', '#EA580C', 60, 0], ['Recepção', '#0EA5E9', 52, 0], ['Cozinha', '#78716C', 60, 0],
];
export const demoSectors: Sector[] = SECTORS.map(([name, color, staff, present], i) => ({
  id: `s${i + 1}`, event_id: 'ev1', name, color, staff_count: staff, present, active: true,
  manager: pick(['Marcos Lima', 'Renata Dias', 'Fábio Rocha', 'Luana Prado']),
  description: `Equipe de ${name.toLowerCase()} do evento.`,
}));

export const demoShifts: Shift[] = [
  { id: 'sh1', event_id: 'ev1', sector_id: 's1', name: 'Manhã', start: '06:00', end: '14:00', tolerance_min: 10, break_min: 60 },
  { id: 'sh2', event_id: 'ev1', sector_id: 's1', name: 'Tarde', start: '14:00', end: '22:00', tolerance_min: 10, break_min: 60 },
  { id: 'sh3', event_id: 'ev1', sector_id: 's2', name: 'Noturno', start: '18:00', end: '02:00', tolerance_min: 5, break_min: 30 },
  { id: 'sh4', event_id: 'ev1', sector_id: 's3', name: 'Integral', start: '08:00', end: '20:00', tolerance_min: 15, break_min: 90 },
  { id: 'sh5', event_id: 'ev1', sector_id: 's6', name: 'Abertura', start: '07:00', end: '13:00', tolerance_min: 10, break_min: 30 },
];

const FIRST = ['Ana Clara', 'Rafael', 'Mariana', 'Thiago', 'Beatriz', 'Lucas', 'Juliana', 'Bruno', 'Camila', 'Pedro', 'Larissa', 'Gustavo', 'Fernanda', 'Diego', 'Patrícia', 'Rodrigo', 'Aline', 'Felipe', 'Carla', 'Vinícius', 'Isabela', 'André', 'Natália', 'Leonardo', 'Bianca', 'Matheus', 'Débora', 'Caio', 'Priscila', 'Henrique'];
const LAST = ['Souza', 'Lima', 'Costa', 'Almeida', 'Santos', 'Oliveira', 'Pereira', 'Rocha', 'Carvalho', 'Ribeiro', 'Martins', 'Gomes', 'Barbosa', 'Araújo', 'Freitas', 'Nascimento', 'Moreira', 'Teixeira'];
const cpf = () => Array.from({ length: 11 }, () => Math.floor(rnd() * 10)).join('');

export const demoEmployees: Employee[] = Array.from({ length: 42 }, (_, i) => {
  const name = i < FIRST.length ? `${FIRST[i]} ${LAST[i % LAST.length]}` : `${pick(FIRST)} ${pick(LAST)}`;
  const sector = demoSectors[i % 6];
  const r = rnd();
  return {
    id: `e${i + 1}`,
    code: `FUN-${String(241 + i).padStart(5, '0')}`,
    full_name: name,
    document: cpf(),
    phone: `79${Math.floor(900000000 + rnd() * 99999999)}`,
    email: `${name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}${i}@email.com`,
    event_id: 'ev1',
    sector_id: sector.id,
    shift_id: pick(demoShifts).id,
    face_status: r < 0.78 ? 'complete' : r < 0.88 ? 'pending' : r < 0.94 ? 'redo' : 'none',
    consent: r < 0.9,
    status: i === 3 ? 'blocked' : r > 0.93 ? 'pending' : 'active',
    self_registered: rnd() > 0.6,
  };
});

const DEVICES = ['Portão Principal', 'Portão A', 'Portão B', 'Backstage 1'];
const OPERATORS = ['Leitor Portão 01', 'Leitor Portão 02', 'Leitor Backstage'];
const DENY = ['Rosto não reconhecido', 'Funcionário não vinculado ao evento', 'Funcionário bloqueado', 'Fora do período permitido', 'Entrada duplicada'];

export const demoAccessLogs: AccessLog[] = Array.from({ length: 64 }, (_, i) => {
  const emp = demoEmployees[i % demoEmployees.length];
  const sector = demoSectors.find((s) => s.id === emp.sector_id)!;
  const denied = i === 3 || i % 11 === 7;
  return {
    id: `a${i + 1}`,
    event_id: 'ev1',
    employee_id: denied && i % 2 ? null : emp.id,
    employee_name: denied && i % 2 ? 'Não identificado' : emp.full_name,
    sector_name: denied && i % 2 ? '—' : sector.name,
    access_type: i % 5 === 1 ? 'exit' : 'entry',
    decision: denied ? 'denied' : 'allowed',
    reason: denied ? (i === 3 ? 'Funcionário bloqueado' : DENY[i % DENY.length]) : undefined,
    device_name: DEVICES[i % DEVICES.length],
    operator_name: i % 13 === 5 ? 'Supervisor Reis' : OPERATORS[i % OPERATORS.length],
    occurred_at: iso(now - i * 47_000 - 30_000),
    manual: i % 13 === 5,
    was_offline: i % 17 === 9,
  };
});

// Acessos por hora (08h–23h) — usado no gráfico
export const demoHourly = [
  { h: '08h', in: 22, out: 12 }, { h: '09h', in: 8, out: 4 }, { h: '10h', in: 30, out: 14 }, { h: '11h', in: 74, out: 24 },
  { h: '12h', in: 88, out: 22 }, { h: '13h', in: 86, out: 40 }, { h: '14h', in: 120, out: 48 }, { h: '15h', in: 112, out: 50 },
  { h: '16h', in: 158, out: 70 }, { h: '17h', in: 196, out: 88 }, { h: '18h', in: 150, out: 64 }, { h: '19h', in: 145, out: 56 },
  { h: '20h', in: 116, out: 38 }, { h: '21h', in: 60, out: 20 }, { h: '22h', in: 40, out: 12 }, { h: '23h', in: 22, out: 6 },
];

export const demoStats = {
  scheduled: 1200, present: 842, entries: 914, exits: 72, denied: 18,
  devicesOnline: 3, devicesOffline: 1, pendingSync: 6,
};

export const demoDevices: Device[] = [
  { id: 'd1', code: 'DSP-001', name: 'Portão Principal', event_id: 'ev1', operator_name: 'Leitor Portão 01', mode: 'entry', last_sync_at: iso(now - 40_000), battery: 82, app_version: '1.0.0', online: true, active: true, pending_sync: 0 },
  { id: 'd2', code: 'DSP-002', name: 'Portão A', event_id: 'ev1', operator_name: 'Leitor Portão 02', mode: 'auto', last_sync_at: iso(now - 95_000), battery: 64, app_version: '1.0.0', online: true, active: true, pending_sync: 0 },
  { id: 'd3', code: 'DSP-003', name: 'Portão B', event_id: 'ev1', operator_name: null, mode: 'exit', last_sync_at: iso(now - 7.2 * H), battery: 18, app_version: '0.9.8', online: false, active: true, pending_sync: 6 },
  { id: 'd4', code: 'DSP-004', name: 'Backstage 1', event_id: 'ev1', operator_name: 'Leitor Backstage', mode: 'entry', last_sync_at: iso(now - 20_000), battery: null, app_version: '1.0.0', online: true, active: true, pending_sync: 0 },
  { id: 'd5', code: 'DSP-005', name: 'Tablet reserva', event_id: null, operator_name: null, mode: 'entry', last_sync_at: iso(now - 30 * 24 * H), battery: null, app_version: '0.9.5', online: false, active: false, pending_sync: 0 },
];

export const demoUsers: AppUser[] = [
  { id: 'u1', full_name: 'Eric Filipe', email: 'eric@efcsys.com.br', role: 'admin_master', active: true, events: ['ev1', 'ev2', 'ev3', 'ev4'], last_login_at: iso(now - 0.2 * H) },
  { id: 'u2', full_name: 'Admin Silva', email: 'silva@produtora.com.br', role: 'admin', active: true, events: ['ev1', 'ev3'], last_login_at: iso(now - 1 * H) },
  { id: 'u3', full_name: 'Supervisor Reis', email: 'reis@produtora.com.br', role: 'supervisor', active: true, events: ['ev1'], last_login_at: iso(now - 2 * H) },
  { id: 'u4', full_name: 'Leitor Portão 01', email: 'portao01@produtora.com.br', role: 'reader', active: true, events: ['ev1'], last_login_at: iso(now - 3 * H) },
  { id: 'u5', full_name: 'Leitor Portão 02', email: 'portao02@produtora.com.br', role: 'reader', active: true, events: ['ev1'], last_login_at: iso(now - 3 * H) },
  { id: 'u6', full_name: 'Leitor Backstage', email: 'backstage@produtora.com.br', role: 'reader', active: true, events: ['ev1'], last_login_at: iso(now - 4 * H) },
  { id: 'u7', full_name: 'Leitor Reserva', email: 'reserva@produtora.com.br', role: 'reader', active: true, events: [], last_login_at: null },
  { id: 'u8', full_name: 'Cliente Horizonte', email: 'cliente@horizonte.com.br', role: 'viewer', active: true, events: ['ev1'], last_login_at: iso(now - 26 * H) },
  { id: 'u9', full_name: 'Paula Menezes', email: 'paula@produtora.com.br', role: 'admin', active: false, events: ['ev2', 'ev4'], last_login_at: iso(now - 12 * 24 * H) },
];

export const demoReaderConfigs: ReaderConfig[] = [
  { id: 'r1', operator_id: 'u4', operator_name: 'Leitor Portão 01', event_id: 'ev1', device_id: 'd1', mode: 'entry', read_interval_s: 20, result_time_s: 5, offline_hours: 24 },
  { id: 'r2', operator_id: 'u5', operator_name: 'Leitor Portão 02', event_id: 'ev1', device_id: 'd2', mode: 'auto', read_interval_s: 20, result_time_s: 5, offline_hours: 24 },
  { id: 'r3', operator_id: 'u6', operator_name: 'Leitor Backstage', event_id: 'ev1', device_id: 'd4', mode: 'entry', read_interval_s: 20, result_time_s: 5, offline_hours: 24 },
  { id: 'r4', operator_id: 'u7', operator_name: 'Leitor Reserva', event_id: null, device_id: null, mode: 'entry', read_interval_s: 20, result_time_s: 5, offline_hours: 24 },
];

export const demoAudit: AuditEntry[] = [
  { id: 'au1', actor: 'Supervisor Reis', action: 'Liberação manual', entity: 'Acesso', detail: 'Entrada de Pedro Ribeiro — motivo: falha de reconhecimento por boné', sensitive: true, created_at: iso(now - 0.3 * H) },
  { id: 'au2', actor: 'Admin Silva', action: 'Evento atribuído', entity: 'Leitura', detail: 'Leitor Portão 02 → Festival Horizonte 2026', sensitive: true, created_at: iso(now - 2.5 * H) },
  { id: 'au3', actor: 'Admin Silva', action: 'Cadastro facial', entity: 'Funcionário', detail: 'Ana Clara Souza — 3 capturas', sensitive: true, created_at: iso(now - 4 * H) },
  { id: 'au4', actor: 'Eric Filipe', action: 'Perfil alterado', entity: 'Usuário', detail: 'Supervisor Reis: Acompanhamento → Supervisor', sensitive: true, created_at: iso(now - 6 * H) },
  { id: 'au5', actor: 'Admin Silva', action: 'Funcionário bloqueado', entity: 'Funcionário', detail: 'Thiago Almeida — documento divergente', sensitive: true, created_at: iso(now - 7 * H) },
  { id: 'au6', actor: 'Admin Silva', action: 'Exportação', entity: 'Relatório', detail: 'Presença — Festival Horizonte 2026 (Excel)', sensitive: false, created_at: iso(now - 9 * H) },
  { id: 'au7', actor: 'Eric Filipe', action: 'Login', entity: 'Sessão', detail: 'Acesso pelo navegador', sensitive: false, created_at: iso(now - 10 * H) },
  { id: 'au8', actor: 'Eric Filipe', action: 'Validade offline alterada', entity: 'Configuração', detail: '24 h → 24 h (aviso 6 h)', sensitive: true, created_at: iso(now - 30 * H) },
];

export const demoConsents: ConsentEntry[] = demoEmployees.slice(0, 14).map((e, i) => ({
  id: `c${i}`, employee_id: e.id, employee_name: e.full_name, term_version: 'v1.2',
  accepted_at: e.consent ? iso(now - (i + 2) * 5 * H) : null,
  accepted_by: e.self_registered ? 'Autocadastro (link)' : 'Admin Silva',
  status: i === 6 ? 'revoked' : e.consent ? 'accepted' : 'pending',
}));

export const demoAlerts: AlertItem[] = [
  { id: 'al1', level: 'danger', title: 'Dispositivo offline', detail: 'Portão B sem sincronizar há 7 h — 6 registros na fila.', at: iso(now - 7.2 * H) },
  { id: 'al2', level: 'warning', title: 'Operador sem evento', detail: 'Leitor Reserva não possui evento atribuído.', at: iso(now - 1 * H) },
  { id: 'al3', level: 'danger', title: 'Funcionário bloqueado tentando entrar', detail: 'Thiago Almeida — Portão Principal.', at: iso(now - 0.05 * H) },
  { id: 'al4', level: 'info', title: 'Evento próximo de começar', detail: 'Congresso Saúde Nordeste em 9 dias — sincronização completa até 1 h antes.', at: iso(now - 0.5 * H) },
];
