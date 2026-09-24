import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { betriebAnlegen } from '@/lib/db/plattform';
import { notzugang, offeneFreigaben, type OffeneFreigabe } from '@/lib/db/support';
import { betriebFehler, type NeuerBetrieb } from '@shared/plattform';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { InputField, FormGrid } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { Marke, Warnung } from '@/components/Badge';
import PasswortAendern from '@/features/auth/PasswortAendern';
import { plattformFehler, type PlattformFehler } from '@/lib/db/fehlerprotokoll';
import FehlerListe from '@/features/settings/FehlerListe';

/**
 * Die einzige Seite des globalen Administrators.
 *
 * SIE LIEGT AUSSERHALB DER APP — kein Layout, keine Navigation, kein Reiter.
 * Das ist nicht Sparsamkeit, sondern die sichtbare Form der Zusage: dieses
 * Konto gehört zu keinem Betrieb und kann in keinen hineinsehen. Es hat kein
 * `users`-Dokument, sein Token trägt keine `companyId`, und daran hängt jede
 * einzelne Leseregel. Warum das so gebaut ist, steht in `shared/plattform.ts`.
 *
 * WAS HIER NICHT STEHT UND NICHT STEHEN WIRD: eine Liste der angelegten
 * Betriebe mit Zahlen daneben, ein Zustand ihrer Nachtläufe, eine Statistik.
 * Jede davon wäre am Ende doch ein Fenster in fremde Betriebe — und dann
 * hätte dieses Konto genau das, was es nicht haben soll.
 *
 * SEIT 20.09.2026 GIBT ES EINE EINZIGE AUSNAHME, und sie ist keine: die Liste
 * der Betriebe, die GERADE EINBLICK GEWÄHREN. Sie steht nicht hier, weil ein
 * Plattformkonto Betriebe sehen dürfte, sondern weil diese es ihm erlaubt
 * haben — mit Grund und mit Frist. Wer nichts gewährt, steht nicht darin.
 *
 * DER NOTZUGANG IST DIE ZWEITE AUSNAHME UND DIESMAL WIRKLICH EINE. Eine rein
 * einvernehmliche Lösung versagt dort, wofür man sie braucht: wer sich
 * ausgesperrt hat, kann nichts mehr freigeben. Er läuft ohne Zustimmung, aber
 * nicht heimlich — gekennzeichnet, höchstens 24 Stunden, im Protokoll des
 * Betriebs und mit einem Band in seiner App.
 *
 * DIE DRITTE AUSNAHME, SEIT 24.09.2026: DIE FEHLER DER APP. Sie sind kein
 * Fenster in den Betrieb, sondern in die eigene Software — was abstürzt, in
 * welcher Fassung, auf welchem Gerät. Geputzt, ohne Person, ohne Kennungen in
 * der Ansicht. Eine von Hand geschriebene Meldung erscheint nur, wenn ihr
 * Verfasser sie ausdrücklich auch an den Support geschickt hat. Die Grenze
 * steht in `fehlerprotokoll_plattform`, nicht hier.
 */

const LEER: NeuerBetrieb = { name: '', companyId: '', adminEmail: '', adminName: '' };

interface Angelegt {
  companyId: string;
  name: string;
  passwortLink: string;
  adminEmail: string;
}

export default function PlattformView() {
  const { signOut, einblickStarten } = useAuth();
  const [form, setForm] = useState<NeuerBetrieb>(LEER);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  /*
    Was in DIESER Sitzung angelegt wurde — nicht, was es gibt. Der Unterschied
    ist der ganze Punkt: gelesen wird nichts, gezeigt wird nur, was gerade
    durch die eigenen Hände ging.
  */
  const [angelegt, setAngelegt] = useState<Angelegt[]>([]);

  /* Wer gerade Einblick gewährt. */
  const [offen, setOffen] = useState<OffeneFreigabe[]>([]);
  const [notForm, setNotForm] = useState({ companyId: '', grund: '', stunden: '4' });
  const [notLaeuft, setNotLaeuft] = useState(false);
  const [notFehler, setNotFehler] = useState<string | null>(null);

  async function freigabenLaden() {
    setOffen(await offeneFreigaben());
  }

  useEffect(() => {
    freigabenLaden().catch(() => setOffen([]));
  }, []);

  /* Was in den letzten zwei Wochen in den Betrieben abgestürzt ist. */
  const [fehlerListe, setFehlerListe] = useState<PlattformFehler[] | null>(null);
  const [fehlerFehler, setFehlerFehler] = useState<string | null>(null);
  async function fehlerLaden() {
    setFehlerFehler(null);
    try {
      setFehlerListe(await plattformFehler(14));
    } catch (e) {
      setFehlerFehler(e instanceof Error ? e.message : 'Das Fehlerprotokoll konnte nicht geladen werden.');
    }
  }
  useEffect(() => {
    void fehlerLaden();
  }, []);

  async function notzugangOeffnen(e: FormEvent) {
    e.preventDefault();
    setNotLaeuft(true);
    setNotFehler(null);
    try {
      await notzugang(notForm.companyId.trim(), notForm.grund.trim(), Number(notForm.stunden));
      setNotForm({ companyId: '', grund: '', stunden: '4' });
      await freigabenLaden();
    } catch (err) {
      setNotFehler(err instanceof Error ? err.message : 'Der Notzugang wurde abgewiesen.');
    } finally {
      setNotLaeuft(false);
    }
  }

  /*
    Dieselbe Prüfung wie in der Function, aus derselben Datei. Hier, damit
    niemand ins Leere tippt; dort, weil nur sie zählt — eine Prüfung im
    Browser ist eine Bequemlichkeit und keine Grenze.
  */
  const eingabeFehler = betriebFehler(form);

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    if (eingabeFehler) {
      setFehler(eingabeFehler);
      return;
    }
    setFehler(null);
    setLaeuft(true);
    try {
      const data = await betriebAnlegen(form);
      setAngelegt((bisher) => [
        {
          companyId: data.companyId,
          name: form.name.trim(),
          passwortLink: data.passwortLink,
          adminEmail: form.adminEmail.trim().toLowerCase(),
        },
        ...bisher,
      ]);
      setForm(LEER);
    } catch (e) {
      /*
        Die Meldung der Function durchreichen statt sie zu ersetzen: sie sagt,
        WARUM abgelehnt wurde — vergebene Kennung, schon vorhandene Adresse —,
        und genau das braucht der Nächste, der es noch einmal versucht.
      */
      setFehler(e instanceof Error ? e.message : 'Der Betrieb konnte nicht angelegt werden.');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-ink">Betriebe anlegen</h1>
        <p className="text-sm text-ink-muted">
          Dieses Konto kann Betriebe einrichten und sonst nichts. Es gehört zu keinem Betrieb und
          sieht in keinen hinein — auch nicht in die, die es selbst angelegt hat.
        </p>
      </header>

      <Card
        title="Neuer Betrieb"
        hint={
          <>
            <strong>Die Kennung lässt sich nachträglich nicht ändern.</strong> Sie steht als Feld
            in jedem einzelnen Datensatz des Betriebs und wird zur Adresse seines Firmendokuments.
            Kleinbuchstaben, Ziffern und Bindestriche.
            <br />
            <br />
            <strong>Der erste Administrator braucht eine eigene Adresse.</strong> Ein Konto gehört
            zu genau einem Betrieb: die Berechtigungen hängen an der Anmeldekennung, nicht am
            Betrieb. Wäre dieselbe Person in zwei Betrieben, entschiede allein die Reihenfolge der
            Änderungen, in welchem sie landet.
          </>
        }
      >
        <form onSubmit={anlegen} className="space-y-4">
          <FormGrid>
            <InputField
              id="b-name"
              label="Name des Betriebs"
              placeholder="Name des Betriebs"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              pflicht
            />
            <InputField
              id="b-kennung"
              label="Kennung"
              placeholder="z. B. mustermann"
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value })}
              required
              pflicht
            />
            <InputField
              id="b-adminname"
              label="Erster Administrator"
              placeholder="Vor- und Nachname"
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              required
              pflicht
            />
            <InputField
              id="b-adminmail"
              label="Dessen E-Mail"
              type="email"
              placeholder="name@betrieb.at"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              required
              pflicht
            />
          </FormGrid>

          {fehler && <ErrorState message={fehler} />}

          {/*
            Der Grund für die gesperrte Schaltfläche steht daneben, nicht
            erst nach dem Drücken. Ein Knopf, der nicht geht und nicht sagt
            warum, ist die unangenehmste Form einer Fehlermeldung.
          */}
          {eingabeFehler && !fehler && (
            <p className="text-sm text-ink-muted">{eingabeFehler}</p>
          )}

          <Button type="submit" variant="accent" loading={laeuft} disabled={!!eingabeFehler}>
            Betrieb anlegen
          </Button>
        </form>
      </Card>

      {/*
        EINBLICK GEWÄHREN KANN NUR DER BETRIEB. Was hier steht, hat er
        erlaubt — mit Grund und mit Frist. Wer nichts gewährt, steht nicht in
        der Liste, und wer widerruft, verschwindet daraus.
      */}
      <Card
        title={`Einblick gewährt (${offen.length})`}
        hint="Der Zugang ist LESEND. Zeitbuchungen, Urlaube und Fotos von Baustellen bleiben auch damit verschlossen — dort stehen Kranken- und Urlaubstage von Mitarbeitern und Aufnahmen aus Kundenwohnungen. Jeder geöffnete Bereich steht im Protokoll des Betriebs."
      >
        {offen.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Kein Betrieb gewährt gerade Einblick. Gewähren kann ihn nur er selbst, unter
            Einstellungen → Supportzugang.
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {offen.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {f.notzugang ? <Warnung>Notzugang</Warnung> : null}
                {f.stufe === 'mitarbeiten' ? <Warnung>mitarbeiten</Warnung> : <Marke>ansehen</Marke>}
                <span className="font-medium">{f.name}</span>
                <span className="text-ink-muted">{f.grund}</span>
                <span className="text-ink-muted">
                  bis {new Date(f.gilt_bis).toLocaleString('de-AT', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
                {/*
                  ÖFFNEN HEISST: die echte App unter diesem Betrieb. Kein
                  zweiter Nachbau mehr — was der Support sieht, ist das, was
                  der Betrieb sieht, und was er darf, entscheidet die
                  Datenbank.
                */}
                <Button variant="secondary" onClick={() => einblickStarten(f)}>
                  Öffnen
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/*
        FEHLER DER APP, nicht der Betriebe: gebündelt nach Meldung, mit dem
        Betrieb daneben, damit ein Absturz nach einem Deploy auffällt, bevor
        jemand anruft.
      */}
      <section aria-label="Fehler aus den Betrieben" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">Fehler aus den Betrieben (14 Tage)</h2>
          <Button variant="secondary" onClick={() => void fehlerLaden()}>
            Neu laden
          </Button>
        </div>
        {fehlerFehler && <ErrorState message={fehlerFehler} onRetry={() => void fehlerLaden()} />}
        {fehlerListe && <FehlerListe zeilen={fehlerListe} />}
      </section>

      {/*
        DER NOTZUGANG IST DIE AUSNAHME UND SOLL SICH AUCH SO ANFÜHLEN: eigene
        Karte, eigener Grund, kurze Frist. Er läuft ohne Zustimmung des
        Betriebs — aber nicht heimlich.
      */}
      <Card
        title="Notzugang"
        hint={
          <>
            <strong>Nur, wenn der Betrieb selbst nicht mehr freigeben kann</strong> — etwa weil
            er sich ausgesperrt hat. Er ist als Notzugang gekennzeichnet, gilt höchstens 24
            Stunden, steht im Protokoll des Betriebs und erzeugt dort dasselbe Band in der App
            wie jede andere Freigabe. Der Betrieb kann ihn jederzeit beenden. Lesen ja,
            schreiben nein — wie bei jedem Supportzugang.
          </>
        }
      >
        <form onSubmit={notzugangOeffnen} className="space-y-4">
          <FormGrid>
            <InputField
              id="n-kennung"
              label="Kennung des Betriebs"
              placeholder="z. B. mustermann"
              value={notForm.companyId}
              onChange={(e) => setNotForm({ ...notForm, companyId: e.target.value })}
              required
              pflicht
            />
            <InputField
              id="n-stunden"
              label="Stunden (1–24)"
              type="number"
              min="1"
              max="24"
              value={notForm.stunden}
              onChange={(e) => setNotForm({ ...notForm, stunden: e.target.value })}
              required
              pflicht
            />
          </FormGrid>
          <InputField
            id="n-grund"
            label="Grund"
            placeholder="z. B. Betrieb ausgesperrt"
            value={notForm.grund}
            onChange={(e) => setNotForm({ ...notForm, grund: e.target.value })}
            required
            pflicht
          />
          {notFehler && <ErrorState message={notFehler} />}
          <Button
            type="submit"
            loading={notLaeuft}
            disabled={notForm.companyId.trim() === '' || notForm.grund.trim() === ''}
          >
            Notzugang öffnen
          </Button>
        </form>
      </Card>

      {angelegt.length > 0 && (
        <Card title={`In dieser Sitzung angelegt (${angelegt.length})`}>
          {/*
            DER RÜCKSETZLINK STEHT NUR HIER UND NUR JETZT.

            Er wird nicht gespeichert und nicht versendet — der Betrieb
            versendet seine Post selbst, und eine Mailanbindung wäre ein
            weiterer Dienst mit einem weiteren Auftragsverarbeitungsvertrag.
            Wer die Seite verlässt, muss den nächsten Zugang über
            „Passwort vergessen?" freischalten lassen. Das steht auch da.
          */}
          <ul className="space-y-4">
            {angelegt.map((b) => (
              <li key={b.companyId} className="border-t border-line pt-3 first:border-0 first:pt-0">
                <p className="font-semibold text-ink">
                  {b.name} <span className="text-ink-muted">({b.companyId})</span>
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  Erster Administrator: {b.adminEmail}
                </p>
                <p className="mt-2 break-all text-sm">
                  <a href={b.passwortLink} className="text-brand underline">
                    {b.passwortLink}
                  </a>
                </p>
                <p className="mt-1 text-xs text-warning">
                  Diesen Link an den Administrator weitergeben — er setzt damit sein Passwort. Er
                  steht nur jetzt hier; danach hilft nur noch „Passwort vergessen?".
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/*
        AUCH DIESES KONTO MUSS SEIN PASSWORT ÄNDERN KÖNNEN. Es sieht keine
        Einstellungen — es sieht überhaupt nur diese eine Seite. Ohne die
        Karte hier gäbe es für den Support genau denselben Weg wie für jeden
        Betrieb vorher: einmal per Link hinein und danach nie wieder.
      */}
      <PasswortAendern />

      <div className="border-t border-line pt-4">
        <Button variant="ghost" onClick={() => void signOut()}>
          Abmelden
        </Button>
      </div>
    </div>
  );
}
