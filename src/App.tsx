import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient as qc } from './lib/queryClient';
import { Loader2, ShieldOff } from 'lucide-react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AppShell, Page } from './components/layout/AppShell';
import { Card, EmptyState, Toaster } from './components/ui';
import { canAccess, homeFor, type NavKey } from './lib/permissions';
import { ROUTER_MODE } from './lib/config';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Events = lazy(() => import('./pages/Events'));
const EventDetail = lazy(() => import('./pages/EventDetail'));
const Employees = lazy(() => import('./pages/Employees'));
const FaceEnroll = lazy(() => import('./pages/FaceEnroll'));
const Sectors = lazy(() => import('./pages/Sectors'));
const Users = lazy(() => import('./pages/Users'));
const Readers = lazy(() => import('./pages/Readers'));
const LiveMonitor = lazy(() => import('./pages/LiveMonitor'));
const ManualRelease = lazy(() => import('./pages/ManualRelease'));
const Devices = lazy(() => import('./pages/Devices'));
const Reports = lazy(() => import('./pages/Reports'));
const Audit = lazy(() => import('./pages/Audit'));
const Settings = lazy(() => import('./pages/Settings'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Reader = lazy(() => import('./pages/Reader'));
const SelfRegister = lazy(() => import('./pages/SelfRegister'));


function Splash() {
  return <div className="flex min-h-screen items-center justify-center bg-bg"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Carregando" /></div>;
}

/** Exige sessão. O perfil Leitura nunca entra no painel administrativo. */
function Admin({ k, children }: { k: NavKey; children: ReactNode }) {
  const { profile, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!profile) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (profile.must_change_password) return <Navigate to="/definir-senha" replace />;
  if (profile.role === 'reader') return <Navigate to="/leitor" replace />;
  return (
    <AppShell>
      {canAccess(profile.role, k) ? children : (
        <Page title="Acesso restrito"><Card><EmptyState icon={ShieldOff} title="Você não tem permissão para esta área." text="Fale com um administrador se precisar de acesso." /></Card></Page>
      )}
    </AppShell>
  );
}

function ReaderRoute() {
  const { profile, loading } = useAuth();
  if (loading) return <Splash />;
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.must_change_password) return <Navigate to="/definir-senha" replace />;
  if (profile.role !== 'reader') return <Navigate to={homeFor(profile.role)} replace />;
  return <Reader />;
}

function LoginRoute() {
  const { profile, loading } = useAuth();
  if (loading) return <Splash />;
  if (profile?.must_change_password) return <Navigate to="/definir-senha" replace />;
  return profile ? <Navigate to={homeFor(profile.role)} replace /> : <Login />;
}

function SetPasswordRoute() {
  const { profile, loading, recovering } = useAuth();
  if (loading) return <Splash />;
  if (!profile) return <Navigate to="/login" replace />;
  if (!profile.must_change_password && !recovering) return <Navigate to={homeFor(profile.role)} replace />;
  return <SetPassword />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/leitor" element={<ReaderRoute />} />
        <Route path="/definir-senha" element={<SetPasswordRoute />} />
        {/* Página pública (sem login) */}
        <Route path="/autocadastro/:token" element={<SelfRegister />} />
        <Route path="/dashboard" element={<Admin k="dashboard"><Dashboard /></Admin>} />
        <Route path="/eventos" element={<Admin k="events"><Events /></Admin>} />
        <Route path="/eventos/:id" element={<Admin k="events"><EventDetail /></Admin>} />
        <Route path="/funcionarios" element={<Admin k="employees"><Employees /></Admin>} />
        <Route path="/cadastro-facial" element={<Admin k="faces"><FaceEnroll /></Admin>} />
        <Route path="/setores" element={<Admin k="sectors"><Sectors /></Admin>} />
        <Route path="/usuarios" element={<Admin k="users"><Users /></Admin>} />
        <Route path="/leitores" element={<Admin k="readers"><Readers /></Admin>} />
        <Route path="/monitoramento" element={<Admin k="live"><LiveMonitor /></Admin>} />
        <Route path="/liberacao-manual" element={<Admin k="manual"><ManualRelease /></Admin>} />
        <Route path="/dispositivos" element={<Admin k="devices"><Devices /></Admin>} />
        <Route path="/relatorios" element={<Admin k="reports"><Reports /></Admin>} />
        <Route path="/auditoria" element={<Admin k="audit"><Audit /></Admin>} />
        <Route path="/configuracoes" element={<Admin k="settings"><Settings /></Admin>} />
        <Route path="/privacidade" element={<Admin k="privacy"><Privacy /></Admin>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  const routes = <AppRoutes />;
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        {ROUTER_MODE === 'memory' ? <MemoryRouter initialEntries={['/login']}>{routes}</MemoryRouter>
          : ROUTER_MODE === 'hash' ? <HashRouter>{routes}</HashRouter>
          : <BrowserRouter>{routes}</BrowserRouter>}
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
