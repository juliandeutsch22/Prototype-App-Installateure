import { useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { callBetriebAnlegen } from '@/lib/functions';
import { betriebFehler, type NeuerBetrieb } from '@shared/plattform';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { InputField, FormGrid } from '@/components/Field';
import { ErrorState } from '@/components/States';

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
 */

const LEER: NeuerBetrieb = { name: '', companyId: '', adminEmail: '', adminName: '' };

interface Angelegt {
  companyId: string;
  name: string;
  passwortLink: string;
  adminEmail: string;
}

export default function PlattformView() {
  const { signOut } = useAuth();
  const [form, setForm] = useState<NeuerBetrieb>(LEER);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  /*
    Was in DIESER Sitzung angelegt wurde — nicht, was es gibt. Der Unterschied
    ist der ganze Punkt: gelesen wird nichts, gezeigt wird nur, was gerade
    durch die eigenen Hände ging.
  */
  const [angelegt, setAngelegt] = useState<Angelegt[]>([]);

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
      const { data } = await callBetriebAnlegen(form);
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
              placeholder="Perl Installationen"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              pflicht
            />
            <InputField
              id="b-kennung"
              label="Kennung"
              placeholder="perl"
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value })}
              required
              pflicht
            />
            <InputField
              id="b-adminname"
              label="Erster Administrator"
              placeholder="Petra Perl"
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              required
              pflicht
            />
            <InputField
              id="b-adminmail"
              label="Dessen E-Mail"
              type="email"
              placeholder="petra@perl.at"
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

      <div className="border-t border-line pt-4">
        <Button variant="ghost" onClick={() => void signOut()}>
          Abmelden
        </Button>
      </div>
    </div>
  );
}
