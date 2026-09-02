import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { RequireAuth, RequireRole, RequireModul, RequireNav } from './guards';
import ErrorBoundary from './ErrorBoundary';
import { nachladbar } from '@/lib/nachladen';
import Unterreiter from '@/components/Unterreiter';
import Layout from './Layout';
import { LoadingState } from '@/components/States';

/**
 * Jede Ansicht ist ein eigenes Paket.
 *
 * WARUM. Vorher lag die ganze App in EINER Datei von 1,05 MB. Der Monteur
 * lud die Rechnungsansicht, die Nachkalkulation und die Benutzerverwaltung
 * mit, bevor er seine Zeit buchen konnte. Am Schreibtisch faellt das nicht
 * auf; auf dem Telefon kostet es zweimal — einmal die Uebertragung ueber
 * Mobilfunk, und dann noch einmal das Auswerten von einem Megabyte
 * JavaScript, was auf einem aelteren Geraet fuer sich genommen ein bis zwei
 * Sekunden dauert.
 *
 * Anmeldung, Layout und Waechter bleiben fest eingebunden: sie werden IMMER
 * gebraucht, und ein Nachladen ausgerechnet der Anmeldeseite waere ein
 * zusaetzlicher Schritt genau dort, wo noch gar nichts zu sehen ist.
 *
 * DER PREIS: das erste Oeffnen einer Ansicht kostet eine kurze Nachladepause,
 * und ohne Netz ist eine noch nie geoeffnete Ansicht nicht erreichbar. Gegen
 * das Zweite arbeitet der Service Worker, der die Pakete nach dem ersten
 * Besuch vorhaelt.
 */
const LoginPage = lazy(() => nachladbar(() => import('@/features/auth/LoginPage')));
const DashboardView = lazy(() => nachladbar(() => import('@/features/dashboard/DashboardView')));
const TimeView = lazy(() => nachladbar(() => import('@/features/time/TimeView')));
const VoiceView = lazy(() => nachladbar(() => import('@/features/voice/VoiceView')));
const OrderView = lazy(() => nachladbar(() => import('@/features/orders/OrderView')));
const AdminOrdersView = lazy(() => nachladbar(() => import('@/features/orders/AdminOrdersView')));
const StockView = lazy(() => nachladbar(() => import('@/features/orders/StockView')));
const AdminProjectsView = lazy(() => nachladbar(() => import('@/features/projects/AdminProjectsView')));
const CustomersView = lazy(() => nachladbar(() => import('@/features/customers/CustomersView')));
const QuotesView = lazy(() => nachladbar(() => import('@/features/quotes/QuotesView')));
const NachkalkulationView = lazy(() => nachladbar(() => import('@/features/costing/NachkalkulationView')));
const WorkSheetView = lazy(() => nachladbar(() => import('@/features/worksheets/WorkSheetView')));
const VacationsView = lazy(() => nachladbar(() => import('@/features/vacations/VacationsView')));
const ModulesView = lazy(() => nachladbar(() => import('@/features/modules/ModulesView')));
const SicherungView = lazy(() => nachladbar(() => import('@/features/settings/SicherungView')));
const WorkSheetsListView = lazy(() => nachladbar(() => import('@/features/worksheets/WorkSheetsListView')));
const MyProjectsView = lazy(() => nachladbar(() => import('@/features/projects/MyProjectsView')));
const AssignmentsView = lazy(() => nachladbar(() => import('@/features/assignments/AssignmentsView')));
const MyScheduleView = lazy(() => nachladbar(() => import('@/features/assignments/MyScheduleView')));
const InvoicesView = lazy(() => nachladbar(() => import('@/features/invoices/InvoicesView')));
const AccountingView = lazy(() => nachladbar(() => import('@/features/accounting/AccountingView')));
const UserMgmtView = lazy(() => nachladbar(() => import('@/features/users/UserMgmtView')));
const SettingsView = lazy(() => nachladbar(() => import('@/features/settings/SettingsView')));
const NotificationSettings = lazy(() => nachladbar(() => import('@/features/settings/NotificationSettings')));

/**
 * App-Wurzel: Auth-Provider + Routing. Jede geschützte Route liegt hinter
 * RequireAuth; rollenspezifische hinter RequireRole. Server-seitig setzen
 * firestore.rules dieselben Grenzen durch (Spec §7).
 */
/**
 * Die täglich gebrauchten Ansichten still im Hintergrund vorladen.
 *
 * SEIT DEM AUFTEILEN DES PAKETS wird jede Ansicht erst beim Öffnen geholt.
 * Am Schreibtisch merkt das niemand; auf der Baustelle sind es zwei bis drei
 * Sekunden bei jedem ersten Aufruf — und ein Netzhänger genau in diesem
 * Moment ist die Meldung „konnte nicht geladen werden". Der Monteur bezahlt
 * den Preis also mehrfach am Tag, an unvorhersehbaren Stellen.
 *
 * ERST WENN DER BROWSER OHNEHIN NICHTS ZU TUN HAT (`requestIdleCallback`) und
 * NUR die Ansichten, die praktisch jeder täglich öffnet. Das lädt die
 * Startseite nicht langsamer — sie ist zu diesem Zeitpunkt längst da — und
 * macht den ersten Aufruf danach unmittelbar.
 *
 * Fehlschläge werden bewusst verschluckt: das hier ist ein Vorgriff, keine
 * Voraussetzung. Wer die Ansicht später wirklich öffnet, geht ohnehin durch
 * `nachladbar()` mit seinen Wiederholungen.
 */
function vorladen() {
  const wichtig = [
    () => import('@/features/dashboard/DashboardView'),
    () => import('@/features/time/TimeView'),
    () => import('@/features/worksheets/WorkSheetView'),
    () => import('@/features/orders/OrderView'),
    () => import('@/features/vacations/VacationsView'),
  ];
  // Nacheinander statt alle auf einmal: fünf gleichzeitige Anfragen nehmen
  // sich auf einer schmalen Leitung gegenseitig die Bandbreite — und zwar
  // genau die, die eine echte Aktion des Benutzers gerade braucht.
  void wichtig.reduce(
    (kette, laden) => kette.then(() => laden().then(() => undefined, () => undefined)),
    Promise.resolve(),
  );
}

function Vorlader() {
  const { user } = useAuth();
  useEffect(() => {
    // ERST NACH DER ANMELDUNG. Auf der Anmeldeseite waere das Vorladen ein
    // Wettbewerb um dieselbe schmale Leitung, die gerade den Anmeldevorgang
    // braucht — und wer sich nicht anmeldet, braucht die Ansichten ohnehin
    // nicht.
    if (!user) return;
    const start = () => vorladen();
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(start, { timeout: 4000 });
      return;
    }
    // Safari kennt `requestIdleCallback` bis heute nicht — dort einfach
    // etwas später, wenn der Start durch ist.
    const uhr = setTimeout(start, 2500);
    return () => clearTimeout(uhr);
  }, [user]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <Vorlader />
      <Routes>
        <Route
          path="/login"
          element={
            <Suspense fallback={<LoadingState label="Anmeldung wird geladen …" />}>
              <LoginPage />
            </Suspense>
          }
        />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                {/* Fehlergrenze INNERHALB des Layouts: schlägt eine Ansicht
                    fehl, bleibt die Navigation bedienbar. */}
                <ErrorBoundary>
                  {/*
                    Die Wartegrenze liegt ebenfalls INNERHALB des Layouts.
                    Läge sie außen, verschwände beim Wechsel zwischen zwei
                    Ansichten kurz die ganze Navigation — die Leiste am
                    unteren Rand eingeschlossen. Sie soll stehen bleiben,
                    während der Inhalt nachlädt.
                  */}
                  <Suspense fallback={<LoadingState label="Wird geladen …" />}>
                    <AppRoutes />
                  </Suspense>
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
                sicherung: <SicherungView />,
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
