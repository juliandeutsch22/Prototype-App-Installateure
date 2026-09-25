import { useState, type FormEvent } from 'react';
import { passwortSetzen } from '@/lib/auth/sitzung';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { InputField, FormGrid } from '@/components/Field';
import { ErrorState } from '@/components/States';

/**
 * Sein eigenes Passwort setzen — die Stelle, an der es bis zum 20.09.2026
 * keine gab.
 *
 * WAS OHNE SIE PASSIERTE, und es ist kein hypothetischer Fall: Ein neuer
 * Betrieb wird angelegt, der erste Administrator bekommt einen Rücksetzlink.
 * Er klickt ihn, `supabase-js` liest den Verweis aus der Adresse und legt
 * eine Sitzung an — er ist drin. Nirgends in der App wird er nach einem
 * Passwort gefragt; das zufällige, das die Edge Function gesetzt hat, kennt
 * niemand. Beim nächsten Start steht er vor der Anmeldemaske und hat nichts
 * einzutippen. Dasselbe traf jeden Mitarbeiter, den die Verwaltung anlegt:
 * die Willkommensmail ist derselbe Link.
 *
 * Gefunden im Probelauf eines echten Betriebs, nicht in einer Prüfung — weil
 * keine Prüfung je zweimal hintereinander angemeldet hat.
 *
 * DAS ALTE PASSWORT FRAGT SIE NUR BEIM GEWÖHNLICHEN ÄNDERN ab (Launch-Check
 * 25.09.2026, K7): sonst sperrte jeder, der kurz an ein entsperrtes Telefon
 * kommt, den Besitzer aus. Nach einem Rücksetzlink oder mit dem Startpasswort
 * des Büros (`erstmalig`) fragt sie nicht — wer über den Link kommt, kennt das
 * alte nicht, und eine Abfrage versperrte genau den Weg, für den die Maske
 * gebaut ist.
 *
 * DIE ZWEITE EINGABE IST KEIN ZIERRAT. Ein vertipptes Passwort fällt sonst
 * erst beim nächsten Start auf — und dann hilft nur noch ein neuer Link.
 */
export default function PasswortAendern({
  /** Nach einem Rücksetzlink: andere Überschrift, anderer Ton. */
  erstmalig = false,
  /** Was nach dem Speichern geschehen soll — etwa die Sperrseite schliessen. */
  onFertig,
  /**
   * Anmeldung mit Benutzername: es gibt keinen Link per Mail. Der Satz dazu
   * wäre sonst ein Versprechen, das diese Person nie einlösen kann.
   */
  benutzerkonto = false,
  /** Erstmalig, aber nach einem Startpasswort des Büros statt nach einem Link. */
  nachStartpasswort = false,
}: {
  erstmalig?: boolean;
  onFertig?: () => void;
  benutzerkonto?: boolean;
  nachStartpasswort?: boolean;
}) {
  const [aktuell, setAktuell] = useState('');
  const [neu, setNeu] = useState('');
  const [wieder, setWieder] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);

  /*
    ACHT ZEICHEN — dieselbe Untergrenze, die Supabase Auth serverseitig
    durchsetzt. Sie hier NIEDRIGER anzusetzen hiesse, eine Maske zu bauen, die
    mit einer Meldung aus dem Englischen antwortet; sie höher anzusetzen wäre
    eine Regel, die nur hier gilt und die niemand entschieden hat.
  */
  const zuKurz = neu.length > 0 && neu.length < 8;
  const ungleich = wieder.length > 0 && neu !== wieder;
  const hindernis = !erstmalig && aktuell.length === 0
    ? 'Bitte das aktuelle Passwort eingeben.'
    : neu.length < 8
    ? 'Mindestens acht Zeichen.'
    : neu !== wieder
      ? 'Die beiden Eingaben sind nicht gleich.'
      : null;

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (hindernis) { setFehler(hindernis); return; }
    setLaeuft(true);
    setFehler(null);
    try {
      await passwortSetzen(neu, erstmalig ? undefined : aktuell);
      setAktuell('');
      setNeu('');
      setWieder('');
      setFertig(true);
      onFertig?.();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Das Passwort wurde nicht geändert.');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card
      title={erstmalig ? 'Passwort vergeben' : 'Passwort ändern'}
      hint={
        <>
          <strong>Das Passwort gehört zur Anmeldekennung, nicht zum Betrieb.</strong> Wer es
          ändert, ändert es überall — am Telefon auf der Baustelle ebenso wie am Rechner im Büro.
          Angemeldete Geräte bleiben angemeldet; erst beim nächsten Anmelden zählt das neue.
          <br />
          <br />
          <strong>Das Büro kann es nicht nachsehen.</strong> Es steht nirgends im Klartext.{' '}
          {benutzerkonto
            ? 'Wer es vergisst, bekommt von der Geschäftsführung oder Administration ein neues Startpasswort.'
            : 'Wer es vergisst, lässt sich über „Passwort vergessen?" einen neuen Link schicken.'}
        </>
      }
    >
      <form onSubmit={speichern} className="space-y-4">
        {erstmalig && (
          <p className="text-sm text-ink-muted">
            {nachStartpasswort
              ? 'Das Startpasswort kennt auch das Büro. Mit einem eigenen gehört der Zugang nur dir.'
              : 'Damit kommst du beim nächsten Mal wieder herein. Ohne eigenes Passwort brauchst du jedes Mal einen neuen Link per E-Mail.'}
          </p>
        )}

        {!erstmalig && (
          <InputField
            id="pw-aktuell"
            label="Aktuelles Passwort"
            type="password"
            autoComplete="current-password"
            value={aktuell}
            onChange={(e) => { setAktuell(e.target.value); setFertig(false); }}
            required
            pflicht
          />
        )}

        <FormGrid>
          <InputField
            id="pw-neu"
            label="Neues Passwort"
            type="password"
            autoComplete="new-password"
            value={neu}
            onChange={(e) => { setNeu(e.target.value); setFertig(false); }}
            required
            pflicht
            minLength={8}
          />
          <InputField
            id="pw-wieder"
            label="Noch einmal"
            type="password"
            autoComplete="new-password"
            value={wieder}
            onChange={(e) => { setWieder(e.target.value); setFertig(false); }}
            required
            pflicht
            minLength={8}
          />
        </FormGrid>

        {/*
          Der Grund steht NEBEN dem gesperrten Knopf, nicht erst nach dem
          Drücken — dasselbe Muster wie beim Anlegen eines Betriebs.
        */}
        {(zuKurz || ungleich) && (
          <p className="text-sm text-ink-muted">
            {zuKurz ? 'Mindestens acht Zeichen.' : 'Die beiden Eingaben sind nicht gleich.'}
          </p>
        )}

        {fehler && <ErrorState message={fehler} />}

        {fertig && (
          <p className="text-sm font-medium text-ink" role="status">
            Das Passwort ist gesetzt.
          </p>
        )}

        <Button type="submit" variant="primary" loading={laeuft} disabled={!!hindernis}>
          {erstmalig ? 'Passwort vergeben' : 'Passwort ändern'}
        </Button>
      </form>
    </Card>
  );
}
