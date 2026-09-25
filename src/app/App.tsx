import { Suspense, lazy, useEffect, useState } from 'react';
import MarkenBand from '@/components/MarkenBand';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { beiPasswortRuecksetzung, startpasswortOffen } from '@/lib/auth/sitzung';
import { istBenutzerkonto } from '@shared/benutzername';
import { RequireAuth, RequireRole, RequireModul, RequireNav } from './guards';
import ErrorBoundary from './ErrorBoundary';
import Unterreiter from '@/components/Unterreiter';
import Layout from './Layout';
import { LoadingState } from '@/components/States';
import PageHeader from '@/components/PageHeader';
import { SCHEIN_ROLLEN } from '@/lib/permissions';

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
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
// Ausserhalb der Anmeldung: das Impressum muss jeder lesen können, auch ohne Konto.
const ImpressumView = lazy(() => import('@/features/recht/ImpressumView'));
const DatenschutzView = lazy(() => import('@/features/recht/DatenschutzView'));
/*
  NICHT NACHGELADEN. Die Passwortmaske steht am Anfang jeder Kette — nach dem
  Rücksetzlink UND unter „Mein Konto". Ein Nachladen ausgerechnet dort wäre
  ein zusätzlicher Schritt an der Stelle, an der jemand gerade nicht
  weiterkommt; sie ist dafür klein genug.
*/
import PasswortAendern from '@/features/auth/PasswortAendern';
const PlattformView = lazy(() => import('@/features/plattform/PlattformView'));
const DashboardView = lazy(() => import('@/features/dashboard/DashboardView'));
const TimeView = lazy(() => import('@/features/time/TimeView'));
const OrderView = lazy(() => import('@/features/orders/OrderView'));
const AdminOrdersView = lazy(() => import('@/features/orders/AdminOrdersView'));
const StockView = lazy(() => import('@/features/orders/StockView'));
const AdminProjectsView = lazy(() => import('@/features/projects/AdminProjectsView'));
const BaustellenakteView = lazy(() => import('@/features/projects/BaustellenakteView'));
const CustomersView = lazy(() => import('@/features/customers/CustomersView'));
const KundenakteView = lazy(() => import('@/features/customers/KundenakteView'));
const WartungenView = lazy(() => import('@/features/maintenance/WartungenView'));
const QuotesView = lazy(() => import('@/features/quotes/QuotesView'));
const AngebotView = lazy(() => import('@/features/quotes/AngebotView'));
const NachkalkulationView = lazy(() => import('@/features/costing/NachkalkulationView'));
const WorkSheetView = lazy(() => import('@/features/worksheets/WorkSheetView'));
const VacationsView = lazy(() => import('@/features/vacations/VacationsView'));
const ModulesView = lazy(() => import('@/features/modules/ModulesView'));
const SicherungView = lazy(() => import('@/features/settings/SicherungView'));
const WorkSheetsListView = lazy(() => import('@/features/worksheets/WorkSheetsListView'));
const MyProjectsView = lazy(() => import('@/features/projects/MyProjectsView'));
const AssignmentsView = lazy(() => import('@/features/assignments/AssignmentsView'));
const MyScheduleView = lazy(() => import('@/features/assignments/MyScheduleView'));
const WochenplanView = lazy(() => import('@/features/assignments/WochenplanView'));
const InvoicesView = lazy(() => import('@/features/invoices/InvoicesView'));
const AccountingView = lazy(() => import('@/features/accounting/AccountingView'));
const UserMgmtView = lazy(() => import('@/features/users/UserMgmtView'));
const BenutzerakteView = lazy(() => import('@/features/users/BenutzerakteView'));
const SettingsView = lazy(() => import('@/features/settings/SettingsView'));
const KontenrahmenView = lazy(() => import('@/features/settings/KontenrahmenView'));
const SupportzugangView = lazy(() => import('@/features/settings/SupportzugangView'));
const FirmendatenView = lazy(() => import('@/features/settings/FirmendatenView'));
const NotificationSettings = lazy(() => import('@/features/settings/NotificationSettings'));

/**
 * App-Wurzel: Auth-Provider + Routing. Jede geschützte Route liegt hinter
 * RequireAuth; rollenspezifische hinter RequireRole. Serverseitig setzt der
 * Zeilenschutz der Datenbank dieselben Grenzen durch.
 */
export default function App() {
  return (
    <AuthProvider>
      <AppInhalt />
    </AuthProvider>
  );
}

/**
 * DER GLOBALE ADMINISTRATOR KOMMT GAR NICHT ERST IN DIE APP.
 *
 * Er hat kein `users`-Dokument und damit weder Betrieb noch Rolle. Statt ihn
 * durch `RequireAuth` zu schicken — das ihn mangels `user` zur Anmeldung
 * zurückwürfe, wo er schon angemeldet ist — bekommt er seine eine Seite, ohne
 * Layout und ohne Navigation.
 *
 * Das ist die sichtbare Form der Zusage: dieses Konto legt Betriebe an und
 * sieht in keinen hinein. Die Grenze selbst steht nicht hier, sondern im
 * Zeilenschutz (jede Richtlinie verlangt einen Betrieb im Token, und er hat
 * keinen) und in der Edge Function, die den Betrieb anlegt.
 */
function AppInhalt() {
  const { plattformAdmin, loading, einblick, user, signOut } = useAuth();

  /*
    WER ÜBER EINEN RÜCKSETZLINK KOMMT, WIRD ZUERST NACH EINEM PASSWORT
    GEFRAGT — vor der App, vor der Plattformseite, vor allem.

    Bis zum 20.09.2026 fehlte diese Seite ganz. Der Link meldete den
    Empfänger an und liess ihn stehen: drin, aber ohne je ein Passwort zu
    kennen. Beim nächsten Start hatte er nichts einzutippen. Für den ersten
    Administrator eines neuen Betriebs war das ein einziger Besuch und danach
    ausgesperrt; für jeden Mitarbeiter dasselbe, denn die Willkommensmail ist
    derselbe Link.

    DAS HORCHEN MUSS BEIM ERSTEN AUFBAU STEHEN. `supabase-js` liest den
    Verweis aus der Adresse, sobald der Client entsteht, und meldet
    `PASSWORD_RECOVERY` genau einmal. Wer sich später anhängt, verpasst es.
  */
  const [passwortFaellig, setPasswortFaellig] = useState<false | 'link' | 'start'>(false);
  useEffect(() => beiPasswortRuecksetzung(() => setPasswortFaellig('link')), []);

  /*
    DASSELBE NACH EINEM STARTPASSWORT DES BÜROS. Wer mit dem Passwort
    hereinkommt, das die Geschäftsführung vergeben hat, vergibt zuerst ein
    eigenes — sonst bliebe ein Passwort in Gebrauch, das jemand anderes
    kennt. Die Marke setzen `mitarbeiter-anlegen` und `passwort-vergeben`.
  */
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    let weg = false;
    void startpasswortOffen().then((offen) => {
      if (offen && !weg) setPasswortFaellig((f) => f || 'start');
    });
    return () => {
      weg = true;
    };
  }, [uid]);

  if (passwortFaellig) {
    return (
      <div className="mx-auto max-w-xl space-y-6 p-4 sm:p-6">
        <MarkenBand />
        <PageHeader
          title="Willkommen"
          subtitle={
            passwortFaellig === 'start'
              ? 'Du bist mit einem Startpasswort angemeldet. Vergib zuerst ein eigenes — danach geht es weiter.'
              : 'Vergib zuerst ein Passwort. Danach geht es weiter.'
          }
        />
        <PasswortAendern
          erstmalig
          nachStartpasswort={passwortFaellig === 'start'}
          benutzerkonto={istBenutzerkonto(user?.email)}
          onFertig={() => setPasswortFaellig(false)}
        />
        {/*
          EIN AUSGANG. Wer auf einem gemeinsamen Gerät mit dem falschen Konto
          hereinkommt — der Kollege hatte sich nicht abgemeldet, oder der Link
          war für jemand anderen —, stand hier fest: nur das Passwortformular,
          kein Weg hinaus (Prüflauf L3). Abmelden verlangt kein Passwort.
        */}
        <p className="text-sm text-ink-muted">
          Nicht dein Konto?{' '}
          <button
            type="button"
            className="textlink-allein"
            onClick={() => {
              void signOut().finally(() => setPasswortFaellig(false));
            }}
          >
            Abmelden
          </button>
        </p>
      </div>
    );
  }

  /*
    DAS PLATTFORMKONTO SIEHT SEINE EINE SEITE — SOLANGE ES NICHT IN EINEM
    BETRIEB IST.

    Läuft ein Einblick, fällt es durch auf den gewöhnlichen Weg und bekommt
    die ECHTE App: dieselben Ansichten, dieselben Reiter, dieselbe
    Datenschicht. Sein Profil setzt `AuthContext` dafür zusammen; was davon
    wirklich geht, entscheidet die Datenbank.

    Bis zum 21.09.2026 stand hier eine zweite, eigene Oberfläche mit vier
    Listen ohne Details. Sie beantwortete die Frage nicht, mit der ein Betrieb
    anruft — und wäre jeder Änderung an der App hinterhergelaufen.
  */
  if (!loading && plattformAdmin && !einblick) {
    return (
      <Suspense fallback={<LoadingState label="Wird geladen …" />}>
        <PlattformView />
      </Suspense>
    );
  }

  return (
    <>
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
          path="/impressum"
          element={
            <Suspense fallback={<LoadingState label="Wird geladen …" />}>
              <ImpressumView />
            </Suspense>
          }
        />
        <Route
          path="/datenschutz"
          element={
            <Suspense fallback={<LoadingState label="Wird geladen …" />}>
              <DatenschutzView />
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
    </>
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
      {/* Die Zeiterfassung steht JEDER Rolle offen (auch der Buchhaltung:
          Krankenstand und Urlaub) — wie Legacy:1954, das den Tab ungeprüft
          setzt. */}
      <Route path="/time" element={<RequireNav path="/time"><TimeView /></RequireNav>} />
      {/*
        Drei eigene Bereiche statt eines Reiters mit Unterreitern — drei
        Tätigkeiten von drei verschiedenen Leuten. Die Rollen stehen in
        navigation.ts, `RequireNav` liest sie von dort.
      */}
      <Route path="/material" element={<RequireNav path="/material"><OrderView /></RequireNav>} />
      <Route
        path="/anforderungen"
        element={<RequireNav path="/anforderungen"><AdminOrdersView /></RequireNav>}
      />
      <Route path="/lager" element={<RequireNav path="/lager"><StockView /></RequireNav>} />
      {/*
        Die Unterreiter-Adressen bleiben als Weiterleitung bestehen: sie
        stehen in Lesezeichen und in den Meldungen, die schon verschickt
        wurden. Eine tote Adresse dort wäre ein Fehler ohne Not.
      */}
      <Route path="/material/anfordern" element={<Navigate to="/material" replace />} />
      <Route path="/material/anforderungen" element={<Navigate to="/anforderungen" replace />} />
      <Route path="/material/lager" element={<Navigate to="/lager" replace />} />
      {/* Strikt nur reine Mitarbeiter (Legacy:1980) — GF/Admin nutzen die
          Verwaltungssicht. */}
      <Route
        path="/my-schedule/*"
        element={
          <RequireNav path="/my-schedule">
            <Unterreiter
              basis="/my-schedule"
              elemente={{
                mein: <MyScheduleView />,
                team: <WochenplanView nurLesen />,
              }}
            />
          </RequireNav>
        }
      />
      {/*
        Urlaub beantragen darf jede Rolle — auch Buchhaltung und Verwaltung
        nehmen Urlaub. Wer entscheiden darf, entscheidet die Ansicht selbst
        anhand der Rolle; die harte Grenze steht in der Datenbank.
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
            {/*
              Die Rollen stehen in `permissions.ts`, nicht hier ausgeschrieben:
              die Liste der Scheine zeigt denselben Knopf und sieht auch die
              Buchhaltung. Zwei getrennte Aufzaehlungen laufen auseinander,
              und dann fuehrt ein Knopf auf eine gesperrte Seite.
            */}
            <RequireRole roles={SCHEIN_ROLLEN}>
              <WorkSheetView />
            </RequireRole>
          </RequireModul>
        }
      />

      {/* Verwaltung */}
      <Route path="/costing" element={<RequireNav path="/costing"><NachkalkulationView /></RequireNav>} />
      <Route path="/quotes" element={<RequireNav path="/quotes"><QuotesView /></RequireNav>} />
      {/* Ein Angebot — dieselbe Prüfung wie die Liste, aus demselben Grund wie bei den Akten. */}
      <Route
        path="/quotes/:id"
        element={
          <RequireNav path="/quotes">
            <AngebotView />
          </RequireNav>
        }
      />
      <Route path="/customers" element={<RequireNav path="/customers"><CustomersView /></RequireNav>} />
      {/*
        Die Akte eines Kunden. Sie hängt an derselben Prüfung wie die Liste
        (`path="/customers"`): wer die Liste sehen darf, darf auch die Akte —
        eine eigene Rollenangabe hier wäre eine zweite Wahrheit über dieselbe
        Frage und liefe irgendwann auseinander.
      */}
      <Route
        path="/customers/:id"
        element={
          <RequireNav path="/customers">
            <KundenakteView />
          </RequireNav>
        }
      />
      <Route path="/wartungen" element={<RequireNav path="/wartungen"><WartungenView /></RequireNav>} />
      <Route
        path="/admin-projects"
        element={<RequireNav path="/admin-projects"><AdminProjectsView /></RequireNav>}
      />
      {/*
        Die Akte einer Baustelle. Sie hängt an derselben Prüfung wie die Liste
        (`path="/admin-projects"`): wer die Liste sehen darf, darf auch die
        Akte — eine eigene Rollenangabe hier wäre eine zweite Wahrheit über
        dieselbe Frage und liefe irgendwann auseinander.
      */}
      <Route
        path="/admin-projects/:id"
        element={
          <RequireNav path="/admin-projects">
            <BaustellenakteView />
          </RequireNav>
        }
      />
      {/*
        Einsatzplanung unter EINEM Reiter, zwei Unterseiten: der Wochenplan
        beantwortet „wer ist frei", die Tagesplanung traegt ein. Der alte
        Pfad `/assignments` fuehrt weiterhin hierher — `Unterreiter` leitet
        auf die erste Unterseite weiter, damit bestehende Verweise (z. B.
        „Zur Einsatzplanung" auf der Startseite) nicht ins Leere gehen.
      */}
      <Route
        path="/assignments/*"
        element={
          <RequireNav path="/assignments">
            <Unterreiter
              basis="/assignments"
              elemente={{
                tag: <AssignmentsView />,
                woche: <WochenplanView />,
              }}
            />
          </RequireNav>
        }
      />
      <Route path="/user-mgmt" element={<RequireNav path="/user-mgmt"><UserMgmtView /></RequireNav>} />
      {/*
        Die Akte eines Benutzers, unter dem Pfad der Liste: wer die Liste
        sehen darf, darf auch die Akte. Eine eigene Rollenangabe hier wäre
        eine zweite Wahrheit über dieselbe Frage.
      */}
      <Route
        path="/user-mgmt/:uid"
        element={
          <RequireNav path="/user-mgmt">
            <BenutzerakteView />
          </RequireNav>
        }
      />
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
                firma: <FirmendatenView />,
                saetze: <SettingsView teil="saetze" />,
                nummern: <SettingsView teil="nummern" />,
                personal: <SettingsView teil="personal" />,
                konten: <KontenrahmenView />,
                support: <SupportzugangView />,
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
      <Route path="/order" element={<Navigate to="/material" replace />} />
      <Route path="/admin-orders" element={<Navigate to="/anforderungen" replace />} />
      <Route path="/stock" element={<Navigate to="/lager" replace />} />
      <Route path="/notifications" element={<Navigate to="/settings/meldungen" replace />} />
      <Route path="/modules" element={<Navigate to="/settings/module" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
