import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { RequireAuth, RequireRole, RequireModul } from './guards';
import { ROLES } from '@/types';
import ErrorBoundary from './ErrorBoundary';
import Layout from './Layout';
import LoginPage from '@/features/auth/LoginPage';
import DashboardView from '@/features/dashboard/DashboardView';
import TimeView from '@/features/time/TimeView';
import VoiceView from '@/features/voice/VoiceView';
import OrderView from '@/features/orders/OrderView';
import AdminOrdersView from '@/features/orders/AdminOrdersView';
import StockView from '@/features/orders/StockView';
import AdminProjectsView from '@/features/projects/AdminProjectsView';
import CustomersView from '@/features/customers/CustomersView';
import QuotesView from '@/features/quotes/QuotesView';
import NachkalkulationView from '@/features/costing/NachkalkulationView';
import WorkSheetView from '@/features/worksheets/WorkSheetView';
import VacationsView from '@/features/vacations/VacationsView';
import ModulesView from '@/features/modules/ModulesView';
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
      {/*
        Die KI-Erfassung haengt nicht mehr am Umgebungsschalter, sondern am
        Modul „ki" — und das ist nur waehlbar, wenn die Zugaenge hinterlegt
        sind. Ein Sonderweg weniger.
      */}
      <Route
        path="/voice"
        element={
          <RequireModul id="ki">
            <VoiceView />
          </RequireModul>
        }
      />
      <Route
        path="/order"
        element={
          <RequireModul id="material">
            <RequireRole roles={['Mitarbeiter', 'Verwaltung', 'Geschäftsführung', 'Administrator']}>
              <OrderView />
            </RequireRole>
          </RequireModul>
        }
      />
      {/* Strikt nur reine Mitarbeiter (Legacy:1980) — GF/Admin nutzen die
          Verwaltungssicht. Vorher fehlte hier jeder Schutz. */}
      <Route
        path="/my-schedule"
        element={
          <RequireModul id="einsatzplanung">
            <RequireRole roles={['Mitarbeiter']}>
              <MyScheduleView />
            </RequireRole>
          </RequireModul>
        }
      />
      {/*
        Urlaub beantragen darf jede Rolle — auch Buchhaltung und Verwaltung
        nehmen Urlaub. Wer entscheiden darf, entscheidet die Ansicht selbst
        anhand der Rolle; die harte Grenze steht in firestore.rules.
      */}
      <Route
        path="/vacations"
        element={
          <RequireModul id="urlaub">
            <RequireRole roles={ROLES}>
              <VacationsView />
            </RequireRole>
          </RequireModul>
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
          <RequireModul id="scheine">
            <RequireRole
              roles={['Mitarbeiter', 'Projektleiter', 'Geschäftsführung', 'Administrator']}
            >
              <WorkSheetView />
            </RequireRole>
          </RequireModul>
        }
      />
      <Route
        path="/worksheets"
        element={
          <RequireModul id="scheine">
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
          </RequireModul>
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
          <RequireModul id="nachkalkulation">
            <RequireRole roles={['Geschäftsführung', 'Administrator']}>
              <NachkalkulationView />
            </RequireRole>
          </RequireModul>
        }
      />
      <Route
        path="/quotes"
        element={
          <RequireModul id="angebote">
            <RequireRole
              roles={['Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']}
            >
              <QuotesView />
            </RequireRole>
          </RequireModul>
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
          <RequireModul id="material">
            <RequireRole roles={['Verwaltung', 'Geschäftsführung', 'Administrator']}>
              <AdminOrdersView />
            </RequireRole>
          </RequireModul>
        }
      />
      {/* Lager: eigener Bereich statt versteckter Reiter unter Bestellungen.
          Verwaltung und Leitung fuehren den Bestand. */}
      <Route
        path="/stock"
        element={
          <RequireModul id="material">
            <RequireRole roles={['Verwaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']}>
              <StockView />
            </RequireRole>
          </RequireModul>
        }
      />
      <Route
        path="/assignments"
        element={
          <RequireModul id="einsatzplanung">
            <RequireRole roles={['Geschäftsführung', 'Administrator']}>
              <AssignmentsView />
            </RequireRole>
          </RequireModul>
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

      {/*
        Welche Bereiche der Betrieb benutzt. Bewusst OHNE RequireModul: waere
        die Modulverwaltung selbst abschaltbar, koennte man sich aussperren
        und nie wieder hineinkommen.
      */}
      <Route
        path="/modules"
        element={
          <RequireRole roles={['Geschäftsführung', 'Administrator']}>
            <ModulesView />
          </RequireRole>
        }
      />
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
          <RequireModul id="rechnungen">
            <RequireRole roles={['Buchhaltung', 'Geschäftsführung', 'Administrator']}>
              <InvoicesView />
            </RequireRole>
          </RequireModul>
        }
      />
      <Route
        path="/accounting"
        element={
          <RequireModul id="zeitkonten">
            <RequireRole roles={['Buchhaltung', 'Geschäftsführung', 'Administrator']}>
              <AccountingView />
            </RequireRole>
          </RequireModul>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
