import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { RequireAuth, RequireRole } from './guards';
import Layout from './Layout';
import LoginPage from '@/features/auth/LoginPage';
import DashboardView from '@/features/dashboard/DashboardView';
import TimeView from '@/features/time/TimeView';
import VoiceView from '@/features/voice/VoiceView';
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
      <Route path="/order" element={<PlaceholderView title="Material bestellen" />} />
      <Route path="/my-schedule" element={<PlaceholderView title="Mein Einsatzplan" />} />
      <Route path="/my-projects" element={<PlaceholderView title="Meine Baustellen" />} />

      {/* Verwaltung */}
      <Route
        path="/admin-projects"
        element={
          <RequireRole roles={['Geschäftsführung', 'Administrator']}>
            <PlaceholderView title="Baustellen" />
          </RequireRole>
        }
      />
      <Route path="/admin-orders" element={<PlaceholderView title="Bestellungen" />} />
      <Route path="/assignments" element={<PlaceholderView title="Einsatzplanung" />} />
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
            <PlaceholderView title="Rechnungen" />
          </RequireRole>
        }
      />
      <Route
        path="/accounting"
        element={
          <RequireRole roles={['Buchhaltung', 'Geschäftsführung', 'Administrator']}>
            <PlaceholderView title="Buchhaltung" />
          </RequireRole>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
