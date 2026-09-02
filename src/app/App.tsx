import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { RequireAuth, RequireRole, RequireModul, RequireNav } from './guards';
import ErrorBoundary from './ErrorBoundary';
import Unterreiter from '@/components/Unterreiter';
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

/**
 * Wer wohin darf, steht NUR in `navigation.ts`.
 *
 * Hier stand es früher ein zweites Mal, als `RequireRole` je Route — und die
 * beiden Listen waren bereits auseinandergelaufen: die Projektleitung sah
 * fünf Reiter, die sie nicht betreten konnte. `RequireNav` liest Rolle UND
 * Modul aus demselben Eintrag, aus dem auch der Reiter gebaut wird. Damit
 * kann diese Sorte Sackgasse nicht mehr entstehen.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RequireNav path="/"><DashboardView /></RequireNav>} />

      {/* Außendienst */}
      {/* Zeit- und KI-Erfassung stehen JEDER Rolle offen (auch Buchhaltung:
          Krankenstand/Urlaub) — wie Legacy:1954, das den Tab ungeprüft setzt. */}
      <Route path="/time" element={<RequireNav path="/time"><TimeView /></RequireNav>} />
      {/*
        Die KI-Erfassung haengt nicht mehr am Umgebungsschalter, sondern am
        Modul „ki" — und das ist nur waehlbar, wenn die Zugaenge hinterlegt
        sind. Ein Sonderweg weniger.
      */}
      <Route path="/voice" element={<RequireNav path="/voice"><VoiceView /></RequireNav>} />
      {/*
        Material unter EINEM Reiter: anfordern, Anforderungen bearbeiten,
        Bestand führen. Wer nur anfordert, sieht auch nur das — die
        Unterseiten und ihre Rollen stehen in navigation.ts.
      */}
      <Route
        path="/material/*"
        element={
          <RequireNav path="/material">
            <Unterreiter
              basis="/material"
              elemente={{
                anfordern: <OrderView />,
                anforderungen: <AdminOrdersView />,
                lager: <StockView />,
              }}
            />
          </RequireNav>
        }
      />
      {/* Strikt nur reine Mitarbeiter (Legacy:1980) — GF/Admin nutzen die
          Verwaltungssicht. */}
      <Route
        path="/my-schedule"
        element={<RequireNav path="/my-schedule"><MyScheduleView /></RequireNav>}
      />
      {/*
        Urlaub beantragen darf jede Rolle — auch Buchhaltung und Verwaltung
        nehmen Urlaub. Wer entscheiden darf, entscheidet die Ansicht selbst
        anhand der Rolle; die harte Grenze steht in firestore.rules.
      */}
      <Route path="/vacations" element={<RequireNav path="/vacations"><VacationsView /></RequireNav>} />
      <Route
        path="/my-projects"
        element={<RequireNav path="/my-projects"><MyProjectsView /></RequireNav>}
      />
      <Route
        path="/worksheets"
        element={<RequireNav path="/worksheets"><WorkSheetsListView /></RequireNav>}
      />
      {/*
        Der EINZELNE Schein hat bewusst keinen Reiter: er wird immer aus der
        Liste oder aus dem Einsatzplan heraus geöffnet, zu einem bestimmten
        Tag. Deshalb steht die Rollenprüfung hier ausnahmsweise ausgeschrieben
        — erstellen darf ihn, wer rausfährt.
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

      {/* Verwaltung */}
      <Route path="/costing" element={<RequireNav path="/costing"><NachkalkulationView /></RequireNav>} />
      <Route path="/quotes" element={<RequireNav path="/quotes"><QuotesView /></RequireNav>} />
      <Route path="/customers" element={<RequireNav path="/customers"><CustomersView /></RequireNav>} />
      <Route
        path="/admin-projects"
        element={<RequireNav path="/admin-projects"><AdminProjectsView /></RequireNav>}
      />
      <Route
        path="/assignments"
        element={<RequireNav path="/assignments"><AssignmentsView /></RequireNav>}
      />
      <Route path="/user-mgmt" element={<RequireNav path="/user-mgmt"><UserMgmtView /></RequireNav>} />
      {/*
        Einstellungen unter EINEM Reiter: die eigenen Meldungen (jede Rolle),
        die Sätze des Betriebs und die Module (Geschäftsführung). Der Reiter
        steht allen offen, weil die Meldungen jedem gehören — was enger ist,
        steht als Rollenliste bei der Unterseite.

        Die Module tragen bewusst KEIN Modul: wäre die Modulverwaltung selbst
        abschaltbar, könnte man sich aussperren und nie wieder hineinkommen.
      */}
      <Route
        path="/settings/*"
        element={
          <RequireNav path="/settings">
            <Unterreiter
              basis="/settings"
              elemente={{
                meldungen: <NotificationSettings />,
                saetze: <SettingsView />,
                module: <ModulesView />,
              }}
            />
          </RequireNav>
        }
      />

      {/* Buchhaltung */}
      <Route path="/invoices" element={<RequireNav path="/invoices"><InvoicesView /></RequireNav>} />
      <Route
        path="/accounting"
        element={<RequireNav path="/accounting"><AccountingView /></RequireNav>}
      />

      {/*
        Die alten Adressen bleiben erreichbar.
        WARUM DAS NICHT VERZICHTBAR IST: In bereits zugestellten
        Push-Meldungen stehen /admin-orders und /order. Wer eine alte Meldung
        antippt, landete sonst kommentarlos auf der Startseite — und suchte
        dann die Anforderung, die ihn eigentlich hergerufen hatte. Dasselbe
        gilt für Lesezeichen im Büro.
      */}
      <Route path="/order" element={<Navigate to="/material/anfordern" replace />} />
      <Route path="/admin-orders" element={<Navigate to="/material/anforderungen" replace />} />
      <Route path="/stock" element={<Navigate to="/material/lager" replace />} />
      <Route path="/notifications" element={<Navigate to="/settings/meldungen" replace />} />
      <Route path="/modules" element={<Navigate to="/settings/module" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
