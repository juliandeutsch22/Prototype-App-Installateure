import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { RequireAuth, RequireRole } from './guards';
import Layout from './Layout';
import LoginPage from '@/features/auth/LoginPage';
import DashboardView from '@/features/dashboard/DashboardView';
import TimeView from '@/features/time/TimeView';
import VoiceView from '@/features/voice/VoiceView';
import OrderView from '@/features/orders/OrderView';
import AdminOrdersView from '@/features/orders/AdminOrdersView';
import AdminProjectsView from '@/features/projects/AdminProjectsView';
import MyProjectsView from '@/features/projects/MyProjectsView';
import AssignmentsView from '@/features/assignments/AssignmentsView';
import MyScheduleView from '@/features/assignments/MyScheduleView';
import InvoicesView from '@/features/invoices/InvoicesView';
import AccountingView from '@/features/accounting/AccountingView';
import PlaceholderView from '@/features/PlaceholderView';

/**
 * App-Wurzel: Auth-Provider + Routing. Jede geschützte Route liegt hinter
 * RequireAuth; rollenspezifische hinter RequireRole. Server-seitig setzen
 * firestore.rules dieselben Grenzen durch (Spec §7).
 */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                <AppRoutes />
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardView />} />

      {/* Außendienst */}
      <Route
        path="/time"
        element={
          <RequireRole roles={['Mitarbeiter', 'Verwaltung', 'Geschäftsführung', 'Administrator']}>
            <TimeView />
          </RequireRole>
        }
      />
      <Route
        path="/voice"
        element={
          <RequireRole roles={['Mitarbeiter', 'Verwaltung', 'Geschäftsführung', 'Administrator']}>
            <VoiceView />
          </RequireRole>
        }
      />
      <Route
        path="/order"
        element={
          <RequireRole roles={['Mitarbeiter', 'Verwaltung', 'Geschäftsführung', 'Administrator']}>
            <OrderView />
          </RequireRole>
        }
      />
      <Route path="/my-schedule" element={<MyScheduleView />} />
      <Route path="/my-projects" element={<MyProjectsView />} />

      {/* Verwaltung */}
      <Route
        path="/admin-projects"
        element={
          <RequireRole roles={['Geschäftsführung', 'Administrator']}>
            <AdminProjectsView />
          </RequireRole>
        }
      />
      <Route
        path="/admin-orders"
        element={
          <RequireRole roles={['Verwaltung', 'Geschäftsführung', 'Administrator']}>
            <AdminOrdersView />
          </RequireRole>
        }
      />
      <Route
        path="/assignments"
        element={
          <RequireRole roles={['Geschäftsführung', 'Administrator']}>
            <AssignmentsView />
          </RequireRole>
        }
      />
      <Route
        path="/user-mgmt"
        element={
          <RequireRole roles={['Geschäftsführung', 'Administrator']}>
            <PlaceholderView title="Benutzerverwaltung" />
          </RequireRole>
        }
      />

      {/* Buchhaltung */}
      <Route
        path="/invoices"
        element={
          <RequireRole roles={['Buchhaltung', 'Geschäftsführung', 'Administrator']}>
            <InvoicesView />
          </RequireRole>
        }
      />
      <Route
        path="/accounting"
        element={
          <RequireRole roles={['Buchhaltung', 'Geschäftsführung', 'Administrator']}>
            <AccountingView />
          </RequireRole>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
