import type { Role } from '../types';

export type NavKey =
  | 'dashboard' | 'events' | 'employees' | 'faces' | 'sectors' | 'users' | 'readers'
  | 'live' | 'manual' | 'devices' | 'reports' | 'audit' | 'settings' | 'privacy';

const ALL: Role[] = ['admin_master', 'admin', 'supervisor', 'viewer'];
const ADMINS: Role[] = ['admin_master', 'admin'];

// Visibilidade da interface. A autorização real é feita pelo RLS no Supabase.
export const NAV_ACCESS: Record<NavKey, Role[]> = {
  dashboard: ALL,
  events: ALL,
  employees: ['admin_master', 'admin', 'supervisor', 'viewer'],
  faces: ADMINS,
  sectors: ['admin_master', 'admin', 'supervisor'],
  users: ADMINS,
  readers: ADMINS,
  live: ALL,
  manual: ['admin_master', 'admin', 'supervisor'],
  devices: ADMINS,
  reports: ALL,
  audit: ['admin_master'],
  settings: ['admin_master'],
  privacy: ADMINS,
};

export const canAccess = (role: Role | undefined, key: NavKey) => !!role && NAV_ACCESS[key].includes(role);
export const canEdit = (role: Role | undefined) => role === 'admin_master' || role === 'admin';
export const homeFor = (role: Role) => (role === 'reader' ? '/leitor' : '/dashboard');
