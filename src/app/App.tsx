import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { RequireAuth, RequireRole } from './guards';
import ErrorBoundary from './ErrorBoundary';
import Layout from './Layout';
import LoginPage from '@/features/auth/LoginPage';
import DashboardView from '@/features/dashboard/DashboardView';
import TimeView from '@/features/time/TimeView';
import VoiceView from '@/features/voice/VoiceView';
import { VOICE_ENABLED } from '@/lib/features';
import OrderView from '@/features/orders/OrderView';
import AdminOrdersView from '@/features/orders/AdminOrdersView';
import StockView from '@/features/orders/StockView';
import AdminProjectsView from '@/features/projects/AdminProjectsView';
import CustomersView from '@/features/customers/CustomersView';
import QuotesView from '@/features/quotes/QuotesView';
import NachkalkulationView from '@/features/costing/NachkalkulationView';
import WorkSheetView from '@/features/worksheets/WorkSheetView';
import WorkSheetsListView from '@/features/worksheets/WorkSheetsListView';
import MyProjectsView from '@/features/projects/MyProjectsView';
import AssignmentsView from '@/features/assignments/AssignmentsView';
import MyScheduleView from '@/features/assignments/MyScheduleView';
import InvoicesView from '@/features/invoices/InvoicesView';
import AccountingView from '@/features/accounting/AccountingView';
import UserMgmtView from '@/features/users/UserMgmtView';
import SettingsView from '@/features/settings/SettingsView';
import NotificationSettings from '@/features/settings/NotificationSettings';

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
                {/* Fehlergrenze INNERHALB des Layouts: schlägt eine Ansicht
                    fehl, bleibt die Navigation bedienbar. */}
                <ErrorBoundary>
                  <AppRoutes />
                </ErrorBoundary>
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
      {/* Zeit- und KI-Erfassung stehen JEDER Rolle offen (auch Buchhaltung:
          Krankenstand/Urlaub) — wie Legacy:1954, das den Tab ungeprüft setzt. */}
      <Route path="/time" element={<TimeView />} />
      {/* Ausgeblendet, nicht entfernt: ohne Schalter fuehrt /voice zurueck
          aufs Dashboard, statt eine Ansicht zu zeigen, die ohne API-
          Schluessel nur eine Fehlermeldung produzieren kann. */}
      <Route
        path="/voice"
        element={VOICE_ENABLED ? <VoiceView /> : <Navigate to="/" replace />}
      />
      <Route
        path="/order"
        element={
          <RequireRole roles={['Mitarbeiter', 'Verwaltung', 'Geschäftsführung', 'Administrator']}>
            <OrderView />
          </RequireRole>
        }
      />
      {/* Strikt nur reine Mitarbeiter (Legacy:1980) — GF/Admin nutzen die
          Verwaltungssicht. Vorher fehlte hier jeder Schutz. */}
      <Route
        path="/my-schedule"
        element={
          <RequireRole roles={['Mitarbeiter']}>
            <MyScheduleView />
          </RequireRole>
        }
      />
      <Route
        path="/my-projects"
        element={
          <RequireRole roles={['Mitarbeiter']}>
            <MyProjectsView />
          </RequireRole>
        }
      />

      {/* Verwaltung */}
      {/*
        Handwerksschein: erstellen darf jeder, der rausfaehrt — der Monteur
        vor allem. Die Liste sieht zusaetzlich das Buero.
      */}
      <Route
        path="/worksheet"
        element={
          <RequireRole
            roles={['Mitarbeiter', 'Projektleiter', 'Geschäftsführung', 'Administrator']}
          >
            <WorkSheetView />
          </RequireRole>
        }
      />
      <Route
        path="/worksheets"
        element={
          <RequireRole
            roles={[
              'Mitarbeiter',
              'Buchhaltung',
              'Verwaltung',
              'Projektleiter',
              'Geschäftsführung',
              'Administrator',
            ]}
          >
            <WorkSheetsListView />
          </RequireRole>
        }
      />
      {/*
        Angebote: kalkulieren ist Leitungssache, die Buchhaltung sieht mit —
        ein angenommenes Angebot ist die Vorstufe der Rechnung.
      */}
      {/* Nachkalkulation zeigt Margen — nur Geschaeftsfuehrung und Admin. */}
      <Route
        path="/costing"
        element={
          <RequireRole roles={['Geschäftsführung', 'Administrator']}>
            <NachkalkulationView />
          </RequireRole>
        }
      />
      <Route
        path="/quotes"
        element={
          <RequireRole
            roles={['Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']}
          >
            <QuotesView />
          </RequireRole>
        }
      />
      <Route
        path="/customers"
        element={
          <RequireRole
            roles={['Buchhaltung', 'Verwaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']}
          >
            <CustomersView />
          </RequireRole>
        }
      />
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
      {/* Lager: eigener Bereich statt versteckter Reiter unter Bestellungen.
          Verwaltung und Leitung fuehren den Bestand. */}
      <Route
        path="/stock"
        element={
          <RequireRole roles={['Verwaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']}>
            <StockView />
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
            <UserMgmtView />
          </RequireRole>
        }
      />
      {/* Persoenliche Benachrichtigungen: jede Rolle, kein RequireRole.
          Was jemand aufs Telefon bekommt, entscheidet er selbst. */}
      <Route path="/notifications" element={<NotificationSettings />} />

      <Route
        path="/settings"
        element={
          <RequireRole roles={['Geschäftsführung', 'Administrator']}>
            <SettingsView />
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
