import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { getPrefs, savePrefs, PREFS_DEFAULTS } from '@/lib/db/prefs';
import { getPushState, enablePush, disablePush, pushProbe, type PushState, type ProbeErgebnis } from '@/lib/push';
import { canProcessOrders, einplanbar, isGF, isMitarbeiter, isTopLevel } from '@/lib/permissions';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { CheckboxField } from '@/components/Field';
import InfoHint from '@/components/InfoHint';
import { useToast } from '@/components/Toast';
import { ErrorState, TeilFehler } from '@/components/States';
import PushStatus from './PushStatus';
import PasswortAendern from '@/features/auth/PasswortAendern';
import ZweiFaktorKarte from './ZweiFaktorKarte';
import { istBenutzerkonto } from '@shared/benutzername';
import { grundAus } from '@/lib/fehlerGrund';
import { useModul } from '@/lib/useModule';
import MeineNachrichten from '@/features/nachrichten/MeineNachrichten';
import { useDarstellung, type Darstellung } from '@/lib/darstellung';

/** Was der Zustand für den Nutzer bedeutet — in seinen Worten, nicht in Fehlercodes. */
const PUSH_TEXT: Record<PushState, { text: string; ton: 'ok' | 'hinweis' | 'aus' }> = {
  bereit: { text: 'Dieses Gerät ist angemeldet und bekommt Meldungen.', ton: 'ok' },
  aus: { text: 'Dieses Gerät bekommt noch keine Meldungen.', ton: 'aus' },
  blockiert: {
    text:
      'Benachrichtigungen wurden für diese Seite abgelehnt. Das lässt sich nur in den ' +
      'Browsereinstellungen wieder erlauben — in der Adresszeile auf das Schloss tippen.',
    ton: 'hinweis',
  },
  'nicht-unterstuetzt': {
    text: 'Dieser Browser kann keine Push-Benachrichtigungen anzeigen.',
    ton: 'hinweis',
  },
  'ios-installation-noetig': {
    text:
      'Auf dem iPhone gibt es Benachrichtigungen nur, wenn die App zum Home-Bildschirm ' +
      'hinzugefügt wurde: in Safari auf „Teilen“ und dann „Zum Home-Bildschirm“.',
    ton: 'hinweis',
  },
  'nicht-konfiguriert': {
    text: 'Für diesen Betrieb ist der Push-Dienst noch nicht eingerichtet.',
    ton: 'hinweis',
  },
};

/** Wie die Probemeldung ausging (E69). Abgelehnt nennt Googles Code. */
const PROBE_TEXT: Record<'gesendet' | 'neu-angemeldet' | 'nicht-angemeldet', string> = {
  gesendet:
    'Google hat die Probemeldung angenommen — sie sollte gleich erscheinen. Kommt keine, hält das ' +
    'Telefon sie zurück: Mitteilungen für Senklot, Fokus oder „Nicht stören“ in seinen Einstellungen.',
  'neu-angemeldet':
    'Das Gerät war bei Google nicht mehr angemeldet und ist jetzt neu angemeldet. Die Probemeldung ist unterwegs.',
  'nicht-angemeldet': 'Das Gerät ließ sich nicht anmelden. Bitte „Auf diesem Gerät einschalten“ noch einmal versuchen.',
};

/**
 * Persönliche Benachrichtigungen. Jeder stellt für sich ein, was er bekommen
 * will — die Geschäftsführung entscheidet über Sätze, nicht über das Telefon
 * ihrer Monteure.
 *
 * Bewusst zwei getrennte Ebenen: WAS jemand bekommen will (gilt für ihn
 * überall) und OB dieses Gerät Meldungen anzeigt (gilt nur hier). Wer das
 * Telefon wechselt, verliert sonst unbemerkt seine Meldungen.
 */
export default function NotificationSettings() {
  const { user, company, einblick, reloadCompany, signOut } = useAuth();
  const toast = useToast();
  const [newOrder, setNewOrder] = useState(PREFS_DEFAULTS.notifyNewOrder ?? true);
  const [orderReady, setOrderReady] = useState(PREFS_DEFAULTS.notifyOrderReady ?? true);
  const [urgent, setUrgent] = useState(PREFS_DEFAULTS.notifyUrgentDelivery ?? true);
  const [abwesenheit, setAbwesenheit] = useState(PREFS_DEFAULTS.notifyAbwesenheit ?? true);
  const [timer, setTimer] = useState(true);
  const [angebot, setAngebot] = useState(PREFS_DEFAULTS.notifyAngebot ?? true);
  const [nachrichten, setNachrichten] = useState(PREFS_DEFAULTS.notifyNachrichten ?? true);
  const [vorschau, setVorschau] = useState(PREFS_DEFAULTS.nachrichtVorschau ?? false);
  const [einsaetze, setEinsaetze] = useState(PREFS_DEFAULTS.notifyEinsaetze ?? true);
  const [push, setPush] = useState<PushState>('aus');
  const [busy, setBusy] = useState(false);
  const [probeBusy, setProbeBusy] = useState(false);
  /** Was die letzte Probemeldung ergab — bleibt stehen, bis die nächste läuft. */
  const [probe, setProbe] = useState<ProbeErgebnis | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — die Seite steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  // Selten gebraucht — das Formular bleibt zu, bis es jemand öffnet.
  const [passwortOffen, setPasswortOffen] = useState(false);
  const [ueberallBusy, setUeberallBusy] = useState(false);

  // Wer Anforderungen bearbeitet, ist der Empfänger der Eingangsmeldung;
  // wer selbst anfordert, der der Abholmeldung. Beides zu zeigen, wenn nur
  // eines zutrifft, wäre Ballast.
  const zeigeNeueAnforderung = user ? canProcessOrders(user.role) || isGF(user.role) : false;
  const zeigeAbholbereit = user ? isMitarbeiter(user.role) : false;
  // Eilzustellungen betreffen, wer eine Baustelle verantwortet — also die
  // Projektleitung und die Geschaeftsfuehrung.
  const zeigeEil = user ? isGF(user.role) : false;
  // Die Antwort eines Kunden über den Annahme-Link (M02a) geht an die, die Angebote annehmen dürfen.
  const onlineAnnahme = useModul('angebote.online_annahme');
  const zeigeAngebot = user ? isGF(user.role) && onlineAnnahme : false;
  // Nachrichten (M10/B09): jeder, solange das Modul an ist.
  const zeigeNachrichten = useModul('nachrichten');
  // Einsatzplan (E85): nur, wer selbst eingeplant wird — die Planer ändern ihn ja selbst.
  const einsatzplanung = useModul('einsatzplanung');
  const zeigeEinsaetze = user ? einsatzplanung && einplanbar(user, company) : false;

  useEffect(() => {
    if (!user) return;
    getPrefs(user.uid)
      .then((p) => {
        if (!p) return;
        setNewOrder(p.notifyNewOrder ?? true);
        setOrderReady(p.notifyOrderReady ?? true);
        setUrgent(p.notifyUrgentDelivery ?? true);
        setAbwesenheit(p.notifyAbwesenheit ?? true);
        setAngebot(p.notifyAngebot ?? true);
        setTimer(p.notifyZeiterfassung ?? true);
        setNachrichten(p.notifyNachrichten ?? true);
        setVorschau(p.nachrichtVorschau ?? false);
        setEinsaetze(p.notifyEinsaetze ?? true);
      })
      // Stumm gescheitert saehen die Schalter aus wie „steht auf Standard",
      // und wer sie danach umlegt, ueberschreibt seine eigene Einstellung mit
      // dem Standard.
      .catch(() => setNebenFehler('Deine Einstellungen'));
    getPushState(user.uid).then(setPush).catch(() => setNebenFehler('Der Zustand der Meldungen'));
  }, [user]);

  /*
    EINE Änderung, ALLE Schalter: gespeichert wird immer die ganze Auswahl,
    damit ein Schalter nie den Stand eines anderen überschreibt.
  */
  async function speichern(aenderung: Partial<{
    notifyNewOrder: boolean;
    notifyOrderReady: boolean;
    notifyUrgentDelivery: boolean;
    notifyAbwesenheit: boolean;
    notifyAngebot: boolean;
    notifyZeiterfassung: boolean;
    notifyNachrichten: boolean;
    nachrichtVorschau: boolean;
    notifyEinsaetze: boolean;
  }>) {
    if (!user) return;
    const next = {
      notifyNewOrder: newOrder,
      notifyOrderReady: orderReady,
      notifyUrgentDelivery: urgent,
      notifyAbwesenheit: abwesenheit,
      notifyAngebot: angebot,
      notifyZeiterfassung: timer,
      notifyNachrichten: nachrichten,
      nachrichtVorschau: vorschau,
      notifyEinsaetze: einsaetze,
      ...aenderung,
    };
    setNewOrder(next.notifyNewOrder);
    setOrderReady(next.notifyOrderReady);
    setUrgent(next.notifyUrgentDelivery);
    setAbwesenheit(next.notifyAbwesenheit);
    setAngebot(next.notifyAngebot);
    setTimer(next.notifyZeiterfassung);
    setNachrichten(next.notifyNachrichten);
    setVorschau(next.nachrichtVorschau);
    setEinsaetze(next.notifyEinsaetze);
    try {
      await savePrefs(user.companyId, user.uid, next);
    } catch (err) {
      setError(grundAus(err, 'Die Einstellung konnte nicht gespeichert werden.'));
    }
  }

  async function geraetAnmelden() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const token = await enablePush(user.companyId, user.uid);
      const state = await getPushState(user.uid);
      setPush(state);
      if (token) toast.success('Dieses Gerät bekommt jetzt Meldungen');
      else if (state === 'blockiert') setError(PUSH_TEXT.blockiert.text);
      else setError('Das Gerät konnte nicht angemeldet werden.');
    } catch (err) {
      setError(grundAus(err, 'Das Gerät konnte nicht angemeldet werden.'));
    } finally {
      setBusy(false);
    }
  }

  async function geraetAbmelden() {
    if (!user) return;
    setBusy(true);
    try {
      await disablePush(user.uid, true);
      setProbe(null);
      setPush(await getPushState(user.uid));
      toast.success('Dieses Gerät bekommt keine Meldungen mehr');
    } finally {
      setBusy(false);
    }
  }

  async function probeSenden() {
    if (!user) return;
    setProbeBusy(true);
    setProbe(null);
    setError(null);
    try {
      const ergebnis = await pushProbe(user.companyId, user.uid);
      setProbe(ergebnis);
      setPush(await getPushState(user.uid));
    } catch (err) {
      setError(grundAus(err, 'Die Probemeldung konnte nicht verschickt werden.'));
    } finally {
      setProbeBusy(false);
    }
  }

  async function ueberallAbmelden() {
    setUeberallBusy(true);
    try {
      await signOut(true);
    } catch (e) {
      toast.error(grundAus(e, 'Das Abmelden auf allen Geräten hat nicht geklappt.'));
      setUeberallBusy(false);
    }
  }

  if (!user) return null;
  const zustand = PUSH_TEXT[push];

  return (
    <div className="space-y-6">
      <PageHeader
        ort="Einstellungen"
        title="Mein Konto"
        subtitle="Benachrichtigungen, Anmeldung und Passwort"
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      {/*
        ERST DAS GERÄT, DANN DIE AUSWAHL, DANN DAS PASSWORT (Analyse
        03.10.2026, Paket 2). Wer hierherkommt, will meistens die Meldungen
        auf dem Telefon einschalten — das Passwort braucht man zweimal im
        Jahr. Es steht weiter auf der einzigen Unterseite, die jede Rolle
        sieht, aber hinter einem Knopf.
      */}
      <Card
        title="Dieses Gerät"
        hint="Jedes Gerät meldet sich einzeln an — Telefon und Rechner getrennt. Das ist Absicht: so entscheidest du, wo dich eine Meldung erreicht."
      >
        <p
          className={
            zustand.ton === 'ok'
              ? 'font-normal text-success'
              : zustand.ton === 'hinweis'
                ? 'text-warning'
                : 'text-ink-muted'
          }
        >
          {zustand.text}
        </p>

        {(push === 'aus' || push === 'bereit') && (
          <div className="mt-4">
            {push === 'bereit' ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" loading={probeBusy} disabled={busy} onClick={() => void probeSenden()}>
                  Probemeldung senden
                </Button>
                <Button variant="ghost" loading={busy} disabled={probeBusy} onClick={() => void geraetAbmelden()}>
                  Auf diesem Gerät abschalten
                </Button>
              </div>
            ) : (
              <Button loading={busy} onClick={() => void geraetAnmelden()}>
                Auf diesem Gerät einschalten
              </Button>
            )}
          </div>
        )}

        {probe && (probe.art === 'gesendet' || probe.art === 'neu-angemeldet') && (
          <p role="status" className="mt-3 text-sm text-ink-muted">{PROBE_TEXT[probe.art]}</p>
        )}
        {probe && (probe.art === 'abgelehnt' || probe.art === 'nicht-angemeldet') && (
          <div className="mt-3">
            <ErrorState message={probe.art === 'abgelehnt' ? `Google hat die Probemeldung abgelehnt (${probe.code}).` : PROBE_TEXT['nicht-angemeldet']} />
          </div>
        )}

        {error && (
          <div className="mt-3">
            <ErrorState message={error} />
          </div>
        )}
      </Card>

      <Card
        title="Wovon möchtest du erfahren?"
        hint="Die Auswahl gilt für dich auf allen Geräten und wird sofort gespeichert."
      >
        {/* 8 px zwischen den Schaltern wie in den Einstellungen › Personal (E72, N11). */}
        <div className="space-y-2">
          {zeigeNeueAnforderung && (
            <CheckboxField
              id="n-new-order"
              label="Eine neue Materialanforderung geht ein"
              checked={newOrder}
              onChange={(e) => void speichern({ notifyNewOrder: e.target.checked })}
            />
          )}
          {zeigeAbholbereit && (
            <CheckboxField
              id="n-order-ready"
              label="Mein angefordertes Material ist abholbereit"
              checked={orderReady}
              onChange={(e) => void speichern({ notifyOrderReady: e.target.checked })}
            />
          )}
          {zeigeEil && (
            <div className="flex flex-wrap items-center gap-2">
              <CheckboxField
                id="n-urgent"
                label="Eilzustellung für meine Baustellen"
                checked={urgent}
                onChange={(e) => void speichern({ notifyUrgentDelivery: e.target.checked })}
              />
              <InfoHint about="Eilzustellungen">
                Zwei Meldungen je Anforderung: sobald sie eingeht, und noch einmal, sobald das
                Material abholbereit ist.
              </InfoHint>
            </div>
          )}
          {/*
            FÜR JEDE ROLLE: jeder kann Urlaub oder Zeitausgleich beantragen
            und bekommt die Entscheidung gemeldet.
          */}
          <div className="flex flex-wrap items-center gap-2">
            <CheckboxField
              id="n-abwesenheit"
              label="Urlaub, Zeitausgleich und Krankmeldungen"
              checked={abwesenheit}
              onChange={(e) => void speichern({ notifyAbwesenheit: e.target.checked })}
            />
            <InfoHint about="Abwesenheiten">
              Du erfährst, wenn über deinen Antrag entschieden ist. Wer Urlaub genehmigt, bekommt
              neue Anträge gemeldet; Buchhaltung und Geschäftsführung zusätzlich Krankmeldungen.
            </InfoHint>
          </div>
          <CheckboxField id="n-timer" label="Zeiterfassung: Timer und Korrekturanträge" checked={timer} onChange={(e) => void speichern({ notifyZeiterfassung: e.target.checked })} />
          {zeigeEinsaetze && (
            <div className="flex flex-wrap items-center gap-2">
              <CheckboxField
                id="n-einsaetze"
                label="Geänderter Einsatzplan für heute und morgen"
                checked={einsaetze}
                onChange={(e) => void speichern({ notifyEinsaetze: e.target.checked })}
              />
              <InfoHint about="Einsatzplan">
                Plant das Büro dich für heute oder morgen um, kommt eine Meldung mit deinem Plan, wie
                er jetzt ist. Mehrere Änderungen kurz hintereinander kommen als eine Meldung;
                Änderungen für spätere Tage stehen im Plan und melden sich nicht.
              </InfoHint>
            </div>
          )}
          {zeigeAngebot && (
            <div className="flex flex-wrap items-center gap-2">
              <CheckboxField
                id="n-angebot"
                label="Antwort eines Kunden über den Annahme-Link"
                checked={angebot}
                onChange={(e) => void speichern({ notifyAngebot: e.target.checked })}
              />
              <InfoHint about="Annahme-Link">
                Du erfährst, wenn ein Kunde ein Angebot über den Link annimmt oder ablehnt — mit
                Angebotsnummer und Namen, ohne Betrag.
              </InfoHint>
            </div>
          )}
          {zeigeNachrichten && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <CheckboxField
                  id="n-nachrichten"
                  label="Neue Nachrichten"
                  checked={nachrichten}
                  onChange={(e) => void speichern({ notifyNachrichten: e.target.checked })}
                />
                <InfoHint about="Nachrichten">
                  Aus deinen Gesprächen und aus den Baustellen, denen du folgst. Ein stumm
                  geschaltetes Gespräch meldet sich nur, wenn dich jemand erwähnt.
                </InfoHint>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CheckboxField
                  id="n-vorschau"
                  label="Text der Nachricht im Sperrbildschirm zeigen"
                  checked={vorschau}
                  disabled={!nachrichten}
                  onChange={(e) => void speichern({ nachrichtVorschau: e.target.checked })}
                />
                <InfoHint about="Vorschau">
                  Aus heißt: die Meldung sagt nur, wer geschrieben hat. An heißt: die ersten 80
                  Zeichen stehen im Sperrbildschirm — sichtbar für jeden, der dein Telefon sieht,
                  und auf dem Weg über den Push-Dienst des Browsers.
                </InfoHint>
              </div>
            </>
          )}
        </div>
      </Card>

      {!einblick && <MeineNachrichten />}

      {/*
        Nicht im Einblick des Supports: dort ist das Konto das Plattformkonto,
        und dessen zweiter Faktor gehört auf die Plattformseite.
      */}
      {!einblick && (
        <ZweiFaktorKarte
          betrieb={isTopLevel(user.role) ? user.companyId : undefined}
          onBetriebGeaendert={reloadCompany}
        />
      )}

      <DarstellungKarte />

      {passwortOffen ? (
        <PasswortAendern benutzerkonto={istBenutzerkonto(user?.email)} />
      ) : (
        <Card title="Passwort">
          <Button variant="secondary" onClick={() => setPasswortOffen(true)}>
            Passwort ändern
          </Button>
        </Card>
      )}

      {/*
        AUF ALLEN GERÄTEN ABMELDEN (Testbericht Runde 6, 8.4; 27.10.2026):
        für das verlorene Telefon. „Abmelden“ im Menü meldet nur dieses Gerät
        ab. Nicht im Einblick des Supports — dort ist das Konto das
        Plattformkonto, und das meldet sich auf seiner eigenen Seite ab.
      */}
      {!einblick && (
        <Card
          title="Auf allen Geräten"
          hint="„Abmelden“ im Menü meldet nur dieses Gerät ab. Hier endet die Anmeldung auf jedem Gerät sofort, auch hier — etwa wenn ein Telefon verloren ging. Danach meldest du dich neu an."
        >
          <Button variant="secondary" loading={ueberallBusy} onClick={() => void ueberallAbmelden()}>
            Auf allen Geräten abmelden
          </Button>
        </Card>
      )}

      {/*
        NUR FÜR DIE FÜHRUNG, aus demselben Grund wie die Lauf-Warnung auf der
        Startseite: ein Monteur kann an einem gestörten Versand nichts ändern,
        und „drei Meldungen kamen nicht durch" wäre für ihn eine Beunruhigung
        ohne Handlungsmöglichkeit.
      */}
      {user && isGF(user.role) && (
        <Card
          title="Kommen die Meldungen an?"
          hint="Stündlich nachgesehen: von den Meldungen, die angestoßen wurden, wie viele haben den Versand nicht verlassen. Keine Frist — Push läuft, wenn es etwas zu melden gibt, und ein ruhiger Tag ist kein Befund."
        >
          <PushStatus />
        </Card>
      )}
    </div>
  );
}

const DARSTELLUNGEN: { wert: Darstellung; label: string; zusatz: string }[] = [
  { wert: 'hell', label: 'Hell', zusatz: 'Gut lesbar draußen und in der Sonne' },
  { wert: 'dunkel', label: 'Dunkel', zusatz: 'Ruhiger am Abend und in dunklen Räumen' },
  { wert: 'system', label: 'System', zusatz: 'Folgt der Einstellung dieses Geräts' },
];

/*
  DARSTELLUNG UND BEWEGUNG (V10, 13.11.2026): Hell, Dunkel oder wie das
  Gerät. Die Wahl gilt für dieses Gerät auf jeder Seite; der Schalter in der
  Navigation bleibt der schnelle Weg zwischen Hell und Dunkel. Bewegung folgt
  „Bewegung reduzieren“ des Geräts — dann wechseln Zustände ohne räumliche
  Bewegung.
*/
function DarstellungKarte() {
  const [darstellung, setDarstellung] = useDarstellung();
  return (
    <Card
      title="Darstellung und Bewegung"
      hint="Gilt für dieses Gerät. „System“ folgt der hellen oder dunklen Einstellung des Geräts, auch wenn sie sich während der Arbeit ändert. Bewegungen folgen „Bewegung reduzieren“ in den Einstellungen des Geräts."
    >
      <fieldset className="wahl-gruppe">
        <legend className="sr-only">Darstellung</legend>
        {DARSTELLUNGEN.map((d) => (
          <label key={d.wert} className="wahl-option">
            <input
              type="radio"
              name="darstellung"
              value={d.wert}
              checked={darstellung === d.wert}
              onChange={() => setDarstellung(d.wert)}
            />
            <span className="wahl-text">
              <span className="wahl-name">{d.label}</span>
              <span className="wahl-zusatz">{d.zusatz}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Card>
  );
}
