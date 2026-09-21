import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  beiAenderung,
  anmelden as anmeldenNaht,
  abmelden as abmeldenNaht,
  passwortZuruecksetzen,
  istPlattformAdmin,
  profilSchnell,
  profilVomServer,
  firmaSchnell,
  profilMerken,
  InactiveUserError,
} from '@/lib/auth/sitzung';
import { getCompany } from '@/lib/db/company';
import { applyBranding } from '@/lib/tenant';
import { mitFristOder } from '@/lib/frist';
import type { CurrentUser, Company } from '@/types';
import { offeneFreigaben, zugriffMelden, type OffeneFreigabe } from '@/lib/db/support';

/**
 * Wie lange der Start auf das Netz wartet, bevor er den Zwischenspeicher
 * nimmt.
 *
 * Acht Sekunden sind lang genug für ein schlechtes Mobilfunknetz und kurz
 * genug, dass niemand glaubt, die App sei kaputt. Vorher gab es hier gar
 * keine Grenze: eine Datenbankabfrage läuft nicht in eine Zeitgrenze, sie
 * warten. Auf der iOS-Startbildschirm-App, die nach dem Aufwecken auf einer
 * toten Verbindung sitzt, hiess das „lädt gar nicht" — unbegrenzt.
 */
const START_FRIST_MS = 8000;

/**
 * Die zuletzt bekannte Firma je Anmeldung.
 *
 * WOFÜR: Profil und Firmendaten liefen bisher NACHEINANDER — erst das Profil,
 * dann mit der darin gefundenen Kennung die Firma. Zwei Netzrunden, bevor das
 * erste Pixel erscheint. Wer sich schon einmal angemeldet hat, dessen Firma
 * kennen wir aber bereits; damit laufen beide Abfragen gleichzeitig.
 *
 * Das ist reine Beschleunigung, keine Quelle der Wahrheit: stimmt der Wert
 * nicht mit dem Profil überein, wird die richtige Firma nachgeladen.
 */
const FIRMA_MERKER = 'perl.letzteFirma';

/**
 * Welcher Einblick gerade läuft — nur die Kennung der Freigabe.
 *
 * Mehr braucht es nicht, und mehr soll auch nicht dastehen: beim
 * Wiederherstellen wird ohnehin gefragt, ob die Freigabe noch gilt. Ein
 * gemerkter Betriebsname wäre eine zweite Wahrheit, die nach einem Widerruf
 * weiterbehäuptet.
 */
const EINBLICK_MERKER = 'senklot.einblick';

function gemerkteFirma(uid: string): string | null {
  try {
    return localStorage.getItem(`${FIRMA_MERKER}.${uid}`);
  } catch {
    // Privates Fenster oder blockierte Website-Daten: dann eben ohne.
    return null;
  }
}

function firmaMerken(uid: string, companyId: string): void {
  try {
    localStorage.setItem(`${FIRMA_MERKER}.${uid}`, companyId);
  } catch {
    /* nicht schlimm */
  }
}

/**
 * Die Firma schon laden, während das Profil noch unterwegs ist.
 *
 * Gibt `null` zurück, wenn sie noch nicht bekannt ist (erste Anmeldung auf
 * diesem Gerät) oder die Abfrage scheitert — dann wird sie danach regulär
 * geholt. Ein Fehler hier darf den Start nicht aufhalten: es ist ein
 * Vorgriff, keine Voraussetzung.
 */
function gemerktesFirmenDokument(uid: string): Promise<Company | null> {
  const id = gemerkteFirma(uid);
  if (!id) return Promise.resolve(null);
  return mitFristOder(getCompany(id), () => firmaSchnell(id), START_FRIST_MS).catch(
    () => null,
  );
}

interface AuthState {
  user: CurrentUser | null;
  company: Company | null;
  loading: boolean;
  error: string | null;
  /** `remember: false` meldet beim Schließen des Browsers ab (Gemeinschaftsgerät). */
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Lädt die Mandanten-Stammdaten neu — nach dem Speichern in den Einstellungen. */
  reloadCompany: () => Promise<void>;
  /**
   * Ein globaler Administrator — angemeldet, aber in KEINEM Betrieb.
   *
   * Er hat kein `users`-Dokument und damit weder `companyId` noch Rolle;
   * `user` bleibt hier `null`, und jede Ansicht der App, die auf `user`
   * prüft, bleibt ihm folglich verschlossen. Er sieht genau eine Seite, und
   * die kann nur eines: Betriebe anlegen. Warum das so gebaut ist, steht in
   * `shared/plattform.ts`.
   */
  plattformAdmin: boolean;
  /**
   * In welchen Betrieb ein Supportzugang GERADE hineinsieht — und mit
   * welcher Stufe.
   *
   * SOLANGE DAS GESETZT IST, IST `user` NICHT NULL: das Plattformkonto
   * bekommt für die Dauer ein zusammengesetztes Profil mit dem Betrieb der
   * Freigabe und der Rolle Administrator. Damit läuft die ECHTE App —
   * dieselben Ansichten, dieselben Wege, dieselbe Datenschicht.
   *
   * WARUM NICHT EINE ZWEITE, EIGENE OBERFLÄCHE. Es gab eine: vier Listen
   * ohne Details. Sie beantwortete die Frage nicht, mit der ein Betrieb
   * anruft, und sie wäre jeder Änderung an der App hinterhergelaufen. Die
   * Grenze steht ohnehin nicht in der Oberfläche, sondern im Zeilenschutz
   * und in den Riegeln der Datenbank.
   */
  einblick: OffeneFreigabe | null;
  einblickStarten: (f: OffeneFreigabe) => void;
  einblickBeenden: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [plattformAdmin, setPlattformAdmin] = useState(false);
  const [einblick, setEinblick] = useState<OffeneFreigabe | null>(null);
  const [einblickFirma, setEinblickFirma] = useState<Company | null>(null);
  /*
    Die Kennung des Plattformkontos. Sie steht sonst nirgends: `user` bleibt
    für dieses Konto `null`, und während eines Einblicks braucht das
    zusammengesetzte Profil sie — alles, was dabei entsteht, soll sie tragen.
  */
  const [plattformKonto, setPlattformKonto] = useState<{ uid: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = beiAenderung(async (wer) => {
      setError(null);
      if (!wer) {
        setUser(null);
        setCompany(null);
        setPlattformAdmin(false);
        setLoading(false);
        return;
      }
      setPlattformAdmin(false);
      setPlattformKonto(null);
      setEinblick(null);
      setEinblickFirma(null);
      // Während das Profil geladen wird, "loading" halten, damit der
      // Auth-Guard nicht fälschlich auf /login zurückspringt.
      setLoading(true);

      /**
       * DER GLOBALE ADMINISTRATOR WIRD GEPRÜFT, BEVOR IRGENDETWAS GELESEN
       * WIRD — und das ist keine Beschleunigung, sondern der Kern.
       *
       * Er hat absichtlich keine Zeile in der Belegschaft: er gehört zu
       * keinem Betrieb. Wer zuerst sein Profil holt, bekommt für ihn nichts
       * zurück und landet im Zweig „kein Profil gefunden" — auf dem
       * Anmeldebildschirm stand dort einmal „Das liegt meist am Empfang".
       * Eine Meldung, die auf ein Netzproblem zeigt, wo keines ist.
       *
       * Gefragt wird das bereits vorliegende Token, nicht die Datenbank: die
       * Marke setzt der Trigger `platform_admins_anspruch`. Das kostet keine
       * Netzrunde, und für alle anderen ändert sich nichts ausser einem
       * aufgelösten Promise.
       *
       * Das ist eine ANZEIGEFRAGE, keine Sicherheitsgrenze: die steht im
       * Zeilenschutz und in der Edge Function, die den Betrieb anlegt. Eine
       * gefälschte Marke brächte hier nur eine Seite zum Vorschein, auf der
       * jeder Knopf serverseitig abgewiesen würde.
       */
      const plattformMarke = await istPlattformAdmin();
      if (plattformMarke) {
        setPlattformAdmin(true);
        setPlattformKonto({ uid: wer.uid, email: wer.email });
        /*
          EINEN LAUFENDEN EINBLICK WIEDERHERSTELLEN.

          Ohne das überlebt er kein Neuladen: wer einen Link öffnet, den
          Zurück-Knopf drückt oder die Seite aktualisiert, steht wieder auf
          der Plattformseite. Beim ersten Versuch fiel das auf, weil JEDE
          Ansicht leer blieb — die App war gar nicht mehr die App.

          GEPRÜFT WIRD DABEI NEU, ob die Freigabe überhaupt noch gilt: gelesen
          wird aus `support_freigaben_offen`, nicht aus dem Merker. Ein
          widerrufener Zugang käme sonst durch einen Tastendruck zurück.

          `sessionStorage` und nicht `localStorage`: ein Supportfall endet
          mit dem Fenster, nicht mit dem Kalender.
        */
        try {
          const gemerkt = sessionStorage.getItem(EINBLICK_MERKER);
          if (gemerkt) {
            const offen = await offeneFreigaben();
            const wieder = offen.find((f) => f.id === gemerkt);
            if (wieder) {
              const comp = await getCompany(wieder.company_id);
              setEinblickFirma(comp);
              if (comp) applyBranding(comp);
              setEinblick(wieder);
            } else {
              sessionStorage.removeItem(EINBLICK_MERKER);
            }
          }
        } catch {
          /* Privates Fenster oder abgelehnte Abfrage: dann eben ohne. */
        }
        setUser(null);
        setCompany(null);
        setLoading(false);
        return;
      }

      /**
       * ERST ZEIGEN, WAS DA IST — DANN NACHZIEHEN.
       *
       * Der Zwischenspeicher antwortet in Millisekunden, das Netz im Keller
       * in Sekunden. Wer sich gestern angemeldet hat, ist damit sofort drin;
       * der aktuelle Stand kommt still hinterher. Erst bei der ALLERERSTEN
       * Anmeldung auf einem Gerät gibt es nichts zu zeigen, und nur dann
       * wartet man noch.
       */
      let sofortDa = false;
      try {
        const schnell = await profilSchnell(wer.uid, wer.email);
        if (schnell) {
          setUser(schnell);
          const firma = await firmaSchnell(schnell.companyId).catch(() => null);
          if (firma) {
            setCompany(firma);
            applyBranding(firma);
          }
          setLoading(false);
          sofortDa = true;
        }
      } catch (e) {
        if (e instanceof InactiveUserError) {
          setError('Dieses Konto ist deaktiviert. Bitte an die Verwaltung wenden.');
          await abmeldenNaht();
          setUser(null);
          setCompany(null);
          setLoading(false);
          return;
        }
      }

      try {
        /**
         * Beide Abfragen GLEICHZEITIG, wenn die Firma schon bekannt ist.
         *
         * Vorher liefen sie nacheinander: zwei volle Netzrunden, bevor
         * irgendetwas erschien. Auf dem Telefon im Keller ist das der
         * Unterschied zwischen „kurz" und „lange".
         */
        const gemerkt = gemerktesFirmenDokument(wer.uid);
        const [profile, firmaVorab] = await Promise.all([
          profilVomServer(wer.uid, wer.email),
          gemerkt,
        ]);

        if (!profile) {
          /*
            Hier landet nur noch, wessen users-Dokument zwar LESBAR ist, aber
            keine companyId oder Rolle trägt. Der globale Administrator kommt
            nicht mehr hierher — er ist oben schon abgebogen, bevor überhaupt
            gelesen wurde.
          */
          setError(
            'Kein Benutzerprofil für dieses Konto gefunden. Bitte an die Verwaltung wenden.',
          );
          await abmeldenNaht();
          setUser(null);
          setCompany(null);
        } else {
          setUser(profile);
          firmaMerken(profile.uid, profile.companyId);
          // Der vorab geladene Stand zählt nur, wenn er zum Profil passt —
          // sonst hätte ein Firmenwechsel die falschen Stammdaten gezeigt.
          const comp =
            firmaVorab && firmaVorab.id === profile.companyId
              ? firmaVorab
              : await mitFristOder(
                  getCompany(profile.companyId),
                  () => firmaSchnell(profile.companyId),
                  START_FRIST_MS,
                );
          setCompany(comp);
          if (comp) applyBranding(comp);
          /*
            FÜR DEN NÄCHSTEN START ABLEGEN. Unter Firestore erledigt das der
            Zwischenspeicher des SDK von selbst; unter Postgres gibt es keinen,
            und ohne diese Zeile begänne jeder Start wieder mit einem
            Ladebalken — genau die Sekunden, die hier einmal mühsam
            weggeräumt wurden.
          */
          profilMerken(profile, comp);
        }
      } catch (e) {
        if (e instanceof InactiveUserError) {
          setError('Dieses Konto ist deaktiviert. Bitte an die Verwaltung wenden.');
          await abmeldenNaht();
          setUser(null);
          setCompany(null);
        } else if (!sofortDa) {
          /**
           * Hierher führt vor allem ein Fall: erste Anmeldung auf diesem
           * Gerät, und das Netz antwortet nicht. Dann liegt auch nichts im
           * Zwischenspeicher, auf das man ausweichen könnte.
           *
           * `sofortDa` ist der Grund, warum diese Meldung fast nie mehr
           * erscheint: wer schon einmal angemeldet war, ARBEITET bereits,
           * während dieser Versuch noch läuft. Ihn dann mit einer Fehlertafel
           * zu unterbrechen wäre falsch — er hat ja alles, was er braucht.
           *
           * Die Firebase-Meldung wäre hier englisch und technisch („Failed
           * to get document because the client is offline"). Sie sagt dem
           * Monteur im Keller nichts — was er wissen muss, ist: es liegt am
           * Empfang, und Nachladen hilft.
           */
          setError(
            'Die Anmeldedaten konnten nicht geladen werden. Das liegt meist am Empfang — bitte erneut versuchen.',
          );
        }
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const signIn = useCallback(async (email: string, password: string, remember = true) => {
    setError(null);
    // Auf einem geteilten Baustellen-Tablet soll die Sitzung mit dem Browser
    // enden — deshalb ist die Dauer wählbar und nicht fest. WIE das erreicht
    // wird, unterscheidet sich je Anmeldung und steht in der Naht.
    await anmeldenNaht(email, password, remember);
  }, []);

  const signOut = useCallback(() => abmeldenNaht(), []);

  const resetPassword = useCallback((email: string) => passwortZuruecksetzen(email), []);

  // Die Stammdaten liegen bewusst nicht auf einem Live-Abo: sie ändern sich
  // selten, und ein Abo auf `companies` hinge an jeder Sitzung. Nach dem
  // Speichern in den Einstellungen wird stattdessen gezielt nachgeladen.
  const reloadCompany = useCallback(async () => {
    if (!user) return;
    const comp = await getCompany(user.companyId);
    setCompany(comp);
    if (comp) applyBranding(comp);
  }, [user]);

  /*
    EINEN EINBLICK BEGINNEN — UND IHN ZUERST MELDEN.

    Das Protokoll entsteht VOR dem ersten gelesenen Datensatz: scheitert die
    Meldung, beginnt der Einblick gar nicht. Ein Zugang, der sich nicht
    protokollieren lässt, ist genau der Generalschlüssel, den dieser Bau
    vermeiden soll.
  */
  const einblickStarten = useCallback((f: OffeneFreigabe) => {
    void (async () => {
      try {
        await zugriffMelden(f.company_id, f.id, 'Betrieb');
        const comp = await getCompany(f.company_id);
        setEinblickFirma(comp);
        if (comp) applyBranding(comp);
        setEinblick(f);
        try {
          sessionStorage.setItem(EINBLICK_MERKER, f.id);
        } catch {
          /* Ohne Merker überlebt der Einblick kein Neuladen — mehr nicht. */
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Der Einblick liess sich nicht beginnen.');
      }
    })();
  }, []);

  const einblickBeenden = useCallback(() => {
    setEinblick(null);
    setEinblickFirma(null);
    try {
      sessionStorage.removeItem(EINBLICK_MERKER);
    } catch {
      /* siehe oben */
    }
  }, []);

  /*
    DAS ZUSAMMENGESETZTE PROFIL EINER SUPPORTSITZUNG.

    Es steht NUR hier und nur, solange ein Einblick läuft. Die Kennung bleibt
    die des Plattformkontos — alles, was dabei entsteht, trägt sie, und genau
    das soll es. Die Rolle ist Administrator, damit die Navigation zeigt, was
    ein Administrator sieht; was davon wirklich geht, entscheidet die
    Datenbank und nicht diese Zeile. Bei der Stufe „ansehen" weist sie jede
    Änderung ab.
  */
  const supportProfil: CurrentUser | null = einblick
    ? {
        uid: plattformKonto?.uid ?? '',
        email: plattformKonto?.email ?? '',
        name: 'Senklot Support',
        role: 'Administrator',
        companyId: einblick.company_id,
        docId: plattformKonto?.uid ?? '',
      }
    : null;

  return (
    <AuthContext.Provider
      value={{
        user: supportProfil ?? user,
        company: einblick ? einblickFirma : company,
        loading,
        error,
        signIn,
        signOut,
        resetPassword,
        reloadCompany,
        plattformAdmin,
        einblick,
        einblickStarten,
        einblickBeenden,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden.');
  return ctx;
}
