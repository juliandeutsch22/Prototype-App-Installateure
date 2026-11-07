import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { useUngespeichertWarnung } from '@/lib/ungespeichert';
import { updateCompany } from '@/lib/db/company';
import {
  MODULE,
  KERN,
  aktiveModule,
  aktiveSchalter,
  zieheMit,
  folgenBeimAbschalten,
  schalter,
  type Faehigkeit,
  type Kernbereich,
  type Modul,
  type SchalterId,
} from '@/lib/module';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Warnung } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';

/**
 * Der Text der Rückfrage: was mitgeht, was es nach sich zieht, was bleibt.
 *
 * Der Satz über die Daten passt sich an. „In beiden Fällen“ stimmt nur, wenn
 * ein zweiter Bereich mitgeht; und wo etwas nicht zurückkommt (die Folgen),
 * bleiben nur die ÜBRIGEN Daten — „Daten bleiben erhalten“ stünde dann direkt
 * unter dem Satz, der das Gegenteil sagt.
 */
function rueckfrage(frage: { id: SchalterId; mit: SchalterId[]; folgen: string[] }): string {
  const name = (id: SchalterId) => schalter(id, MODULE)?.name ?? id;
  const teile: string[] = [];
  if (frage.mit.length > 0) {
    teile.push(
      `Damit geht auch ${frage.mit.map(name).join(' und ')} aus — ` +
        `${frage.mit.length === 1 ? 'dieser Bereich braucht' : 'diese Bereiche brauchen'} ${name(frage.id)}.`,
    );
  }
  teile.push(...frage.folgen);
  if (frage.folgen.length > 0) teile.push('Alle übrigen Daten bleiben erhalten.');
  else teile.push('Daten bleiben in beiden Fällen erhalten.');
  return teile.join(' ');
}

/**
 * Module ein- und ausschalten.
 *
 * Die App ist auf siebzehn Bereiche gewachsen; ein Betrieb braucht selten
 * alle. Wer extern fakturiert, will keine Rechnungen sehen; wer kein Lager
 * führt, keine Materialanforderung. Jeder ungenutzte Bereich ist ein Eintrag
 * in der Navigation, eine Frage im Kopf und eine Stelle, an der etwas
 * kaputtgehen kann, ohne dass es jemand merkt.
 *
 * DREI DINGE, DIE DIESE ANSICHT DESHALB LEISTEN MUSS:
 *
 *  1. Sagen, was ein Abschalten NACH SICH ZIEHT — bevor es passiert. Die
 *     Nachkalkulation braucht die Rechnungen; wer sie abschaltet und das
 *     erst hinterher merkt, ist überrascht, und Überraschung ist bei
 *     Einstellungen das Gegenteil von Kontrolle.
 *  2. Sagen, dass DATEN BLEIBEN. Sonst traut sich niemand, etwas
 *     abzuschalten — und die Einstellung wäre für nichts da.
 *  3. Sagen, dass ein Modul KEINE Rechteverwaltung ist. Wer das verwechselt,
 *     hält ein abgeschaltetes Modul für Schutz.
 */
export default function ModulesView() {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();

  const [entwurf, setEntwurf] = useState<Record<string, boolean>>({});
  const [speichert, setSpeichert] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Was abgeschaltet werden soll und noch bestätigt werden muss — samt dem, was mitgeht und was es nach sich zieht. */
  const [frage, setFrage] = useState<{ id: SchalterId; mit: SchalterId[]; folgen: string[] } | null>(null);

  useEffect(() => {
    setEntwurf(company?.modules ?? {});
  }, [company]);

  // Das Register wird ausdrücklich übergeben: so prüft der Test die Ansicht auch mit Unterfähigkeiten.
  const aktiv = useMemo(() => aktiveModule(entwurf, MODULE), [entwurf]);
  const schalterAn = useMemo(() => aktiveSchalter(entwurf, MODULE), [entwurf]);
  const gespeichert = useMemo(() => aktiveSchalter(company?.modules, MODULE), [company]);

  /** Weicht der Entwurf vom gespeicherten Stand ab? */
  const geaendert = useMemo(() => {
    if (schalterAn.size !== gespeichert.size) return true;
    return [...schalterAn].some((m) => !gespeichert.has(m));
  }, [schalterAn, gespeichert]);
  // Wer mit ungespeicherten Änderungen weggeht, wird gefragt (Testbericht 30.09.2026, M1).
  const warnung = useUngespeichertWarnung(geaendert);

  function umschalten(id: SchalterId, an: boolean) {
    if (!an) {
      const mit = zieheMit(id, entwurf, MODULE);
      const folgen = folgenBeimAbschalten(id, entwurf, MODULE);
      if (mit.length > 0 || folgen.length > 0) {
        // Erst fragen, dann schalten — siehe Punkt 1 oben.
        setFrage({ id, mit, folgen });
        return;
      }
    }
    setEntwurf((alt) => ({ ...alt, [id]: an }));
  }

  async function speichern() {
    if (!user) return;
    setSpeichert(true);
    setError(null);
    try {
      await updateCompany(user.companyId, { modules: entwurf });
      await reloadCompany();
      toast.success('Module gespeichert');
    } catch (err) {
      setError(grundAus(err, 'Die Module konnten nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  /**
   * Eine Zeile je Modul und je Unterfähigkeit (N02). Die Unterfähigkeit steht
   * direkt unter ihrem Modul und sagt, wozu sie gehört; ist das Modul aus, ist
   * auch sie aus und lässt sich erst mit ihm wieder einschalten.
   */
  function zeile(eintrag: Modul | Faehigkeit, zu: Modul | Kernbereich | null) {
    const an = schalterAn.has(eintrag.id);
    const braucht = [...(zu ? [zu.id] : []), ...(eintrag.abhaengigVon ?? [])];
    const fehlt = braucht.filter((d) => !schalterAn.has(d));
    return (
      <ListRow
        key={eintrag.id}
        title={
          <>
            {eintrag.name}
            {/* Eine Aufforderung, keine Eigenschaft: ohne das andere
                Modul lässt sich dieses gar nicht einschalten. */}
            {fehlt.length > 0 && (
              <Warnung>
                braucht {fehlt.map((d) => schalter(d, MODULE)?.name ?? d).join(', ')}
              </Warnung>
            )}
          </>
        }
        subtitle={
          <>
            {zu && <span className="block">Teil von {zu.name}</span>}
            <span className="block">{eintrag.zweck}</span>
            <span className="mt-1 block text-xs">Betrifft: {eintrag.betrifft.join(', ')}</span>
          </>
        }
      >
        <label className="flex min-h-touch shrink-0 items-center gap-3">
          <span className="text-sm text-ink-muted">{an ? 'ein' : 'aus'}</span>
          <input
            type="checkbox"
            className="checkbox checkbox-lg"
            checked={an}
            disabled={fehlt.length > 0 && !an}
            onChange={(e) => umschalten(eintrag.id, e.target.checked)}
            aria-label={`${eintrag.name} ${an ? 'ausschalten' : 'einschalten'}`}
          />
        </label>
      </ListRow>
    );
  }

  /**
   * Ein Kernbereich (M02b): immer an, ohne Schalter — Kunden und Baustellen
   * sind der Bezug für alles Übrige (E51, V1). Seine Teile darunter schaltet
   * der Betrieb wie die eines Moduls.
   */
  function kernZeile(k: Kernbereich) {
    return (
      <ListRow key={k.id} title={k.name} subtitle={k.zweck}>
        <span className="flex min-h-touch shrink-0 items-center text-sm text-ink-muted">immer an</span>
      </ListRow>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      {warnung}
      <PageHeader
        ort="Einstellungen"
        title="Module"
        subtitle="Welche Bereiche dieser Betrieb benutzt"
      />

      {error && <ErrorState message={error} />}

      {/*
        DER KERN VOR DEN MODULEN, als eigenes Blatt: er zählt nicht zu
        „Eingeschaltet: N von 9“, und ein Schalter, den es nicht gibt, soll
        nicht zwischen den Schaltern stehen. Davor, damit „Module speichern“
        am Ende von allem steht — es speichert auch seine Teile.
      */}
      <Card
        title="Immer an"
        hint={
          <>
            Kunden und Baustellen lassen sich nicht ausschalten — Planung, Zeiten, Scheine,
            Wartungen und Rechnungen beziehen sich auf sie. Ihre Teile darunter schaltet der
            Betrieb wie die eines Moduls; vorhandene Daten bleiben dabei erhalten.
          </>
        }
        buendig
      >
        <List>
          {KERN.flatMap((k) => [kernZeile(k), ...k.unter.map((f) => zeile(f, k))])}
        </List>
      </Card>

      {/*
        Die Erklaerung stand als EIGENE KARTE ueber der Liste — eine ganze
        Karte Hoehe, bei jedem Aufruf, obwohl sie nur beim ersten Mal etwas
        sagt. Sie gehoert an die Liste, die sie erklaert, und dort ins „i".
      */}
      <Card
        title={`Eingeschaltet: ${aktiv.size} von ${MODULE.length}`}
        hint={
          <>
            Ein ausgeschaltetes Modul verschwindet aus der Navigation, und seine Adressen sind
            zu. <strong>Vorhandene Daten bleiben unangetastet</strong> — wird es wieder
            eingeschaltet, ist alles da, wo es war. Was sich ausnahmsweise nicht zurückholen
            lässt, etwa die Kalender-Abos des ganzen Einsatzplans, nennt die Rückfrage vor dem
            Abschalten.
            <br />
            <br />
            Module sind <strong>keine Rechteverwaltung</strong>. Sie nehmen den Weg weg, nicht das
            Recht: wer als Buchhaltung Rechnungen anlegen darf, darf das weiterhin — die
            Oberfläche bietet es nur nicht mehr an. Wer wann was darf, steht in den Rollen und
            wird serverseitig durchgesetzt. Geschützt ist hier die <em>Modulliste selbst</em>:
            ändern darf sie nur der Administrator.
          </>
        }
        buendig
      >
        {/*
          EIN MODUL, EINE ZEILE (Linie „Lot“): bündig in der Gruppe, der
          Schalter rechts als eigenes Ziel. Inhalt wie zuvor.
        */}
        <List>
          {MODULE.flatMap((m) => [
            zeile(m, null),
            ...(m.unter ?? []).map((f) => zeile(f, m)),
          ])}
        </List>

        {/* Fusszeile der Aktionen: Speichern ganz rechts, Verwerfen bzw. der Stand davor. */}
        <div className="fuss-aktionen items-center px-4 pb-4">
          {geaendert && (
            <Button variant="ghost" onClick={() => setEntwurf(company?.modules ?? {})}>
              Verwerfen
            </Button>
          )}
          {!geaendert && (
            <span className="text-sm text-ink-muted">Keine Änderung offen.</span>
          )}
          <Button onClick={speichern} loading={speichert} disabled={!geaendert}>
            Module speichern
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={!!frage}
        title={frage ? `${schalter(frage.id, MODULE)?.name} ausschalten?` : ''}
        // Ohne diese Zeile stand auf dem Knopf die Vorgabe „Löschen" — in Rot,
        // direkt unter dem Satz „Daten bleiben in beiden Fällen erhalten".
        // Der Knopf widersprach damit dem Text über ihm.
        confirmLabel="Ausschalten"
        message={frage ? rueckfrage(frage) : ''}
        onCancel={() => setFrage(null)}
        onConfirm={() => {
          if (frage) setEntwurf((alt) => ({ ...alt, [frage.id]: false }));
          setFrage(null);
        }}
      />
    </div>
  );
}
