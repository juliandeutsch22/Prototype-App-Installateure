import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import {
  MODULE,
  KERN,
  aktiveModule,
  aktiveSchalter,
  zieheMit,
  folgenBeimAbschalten,
  schalter,
  HINWEIS_BEIM_EINSCHALTEN,
  type Faehigkeit,
  type Kernbereich,
  type Modul,
  type SchalterId,
} from '@/lib/module';
import Card from '@/components/Card';
import Schalter from '@/components/Schalter';
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
 *  3. Sagen, was ein Modul SPERRT und was nicht (E51 V3, E56): bestehende
 *     Wege blendet es nur aus — das Recht der Rolle bleibt; neue Befehle
 *     (Annahme-Link, Auftragseingang …) prüft der Server, ausgeschaltet sind
 *     sie auch über die Schnittstelle gesperrt. Wer die Rechte sucht, findet
 *     sie in den Rollen.
 */
export default function ModulesView() {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();

  /*
    EIN SCHALTER WIRKT SOFORT (U6, E3, 15.11.2026). Bis dahin sammelte die
    Seite Haken und speicherte sie mit „Module speichern“ — ein Kästchen mit
    „ein“/„aus“ daneben, dem man nicht ansah, ob es schon galt. Jetzt
    schreibt jeder Schalter selbst; was beim Abschalten mitgeht oder nicht
    zurückkommt, fragt die Rückfrage wie bisher VORHER. Der Schalter springt
    erst um, wenn die Datenbank es bestätigt hat.
  */
  const [entwurf, setEntwurf] = useState<Record<string, boolean>>({});
  /** Welcher Schalter gerade schreibt — solange sind alle gesperrt, damit kein Wechsel den anderen überholt. */
  const [laeuft, setLaeuft] = useState<SchalterId | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Was abgeschaltet werden soll und noch bestätigt werden muss — samt dem, was mitgeht und was es nach sich zieht. */
  const [frage, setFrage] = useState<{ id: SchalterId; mit: SchalterId[]; folgen: string[] } | null>(null);
  /** Was eingeschaltet werden soll und vorher einen Hinweis braucht (Direktnachrichten: ArbVG). */
  const [einschalten, setEinschalten] = useState<SchalterId | null>(null);

  useEffect(() => {
    setEntwurf(company?.modules ?? {});
  }, [company]);

  // Das Register wird ausdrücklich übergeben: so prüft der Test die Ansicht auch mit Unterfähigkeiten.
  const aktiv = useMemo(() => aktiveModule(entwurf, MODULE), [entwurf]);
  const schalterAn = useMemo(() => aktiveSchalter(entwurf, MODULE), [entwurf]);

  function umschalten(id: SchalterId, an: boolean) {
    if (!an) {
      const mit = zieheMit(id, entwurf, MODULE);
      const folgen = folgenBeimAbschalten(id, entwurf, MODULE);
      if (mit.length > 0 || folgen.length > 0) {
        // Erst fragen, dann schalten — siehe Punkt 1 oben.
        setFrage({ id, mit, folgen });
        return;
      }
    } else if (HINWEIS_BEIM_EINSCHALTEN[id]) {
      setEinschalten(id);
      return;
    }
    void schreiben(id, an);
  }

  /**
   * Einen Schalter speichern. In der Rückfrage wartet der Dialog darauf und
   * zeigt einen Fehler selbst (`wirf`); sonst steht er über der Liste.
   */
  async function schreiben(id: SchalterId, an: boolean, wirf = false) {
    if (!user) return;
    const neu = { ...entwurf, [id]: an };
    setLaeuft(id);
    setError(null);
    try {
      await updateCompany(user.companyId, { modules: neu });
      setEntwurf(neu);
      await reloadCompany();
      toast.success(`${schalter(id, MODULE)?.name ?? 'Modul'} ${an ? 'eingeschaltet' : 'ausgeschaltet'}`);
    } catch (err) {
      const text = grundAus(err, 'Das Modul konnte nicht umgeschaltet werden.');
      if (wirf) throw new Error(text);
      setError(text);
    } finally {
      setLaeuft(null);
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
            <span className="mt-1 block text-meta">Betrifft: {eintrag.betrifft.join(', ')}</span>
          </>
        }
      >
        <Schalter
          id={`modul-${eintrag.id}`}
          label={eintrag.name}
          labelVerborgen
          an={an}
          laeuft={laeuft === eintrag.id}
          gesperrt={(laeuft !== null && laeuft !== eintrag.id) || (fehlt.length > 0 && !an)}
          onChange={(neu) => umschalten(eintrag.id, neu)}
        />
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
        <span className="flex min-h-touch shrink-0 items-center text-meta text-ink-muted">immer an</span>
      </ListRow>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        ort="Einstellungen"
        title="Module"
        subtitle="Welche Bereiche dieser Betrieb benutzt"
      />

      {error && <ErrorState message={error} />}

      {/*
        DER KERN VOR DEN MODULEN, als eigenes Blatt: er zählt nicht zu
        „Eingeschaltet: N von 9“, und ein Schalter, den es nicht gibt, soll
        nicht zwischen den Schaltern stehen. Seine Teile schalten wie die
        eines Moduls, sofort.
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
            Module ersetzen <strong>keine Rechteverwaltung</strong>. Bei den bestehenden Bereichen
            nimmt ein Modul nur den Weg weg: wer als Buchhaltung Rechnungen anlegen darf, darf das
            weiterhin — die Oberfläche bietet es nur nicht mehr an. Neuere Funktionen wie der
            Annahme-Link oder der Auftragseingang prüft dagegen auch der Server: ausgeschaltet sind
            sie auch über die Schnittstelle gesperrt. Wer wann was darf, steht in den Rollen.
            Geschützt ist hier die <em>Modulliste selbst</em>:
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
        onConfirm={async () => {
          if (frage) await schreiben(frage.id, false, true);
          setFrage(null);
        }}
      />

      <ConfirmDialog
        open={!!einschalten}
        title={einschalten ? `${schalter(einschalten, MODULE)?.name} einschalten?` : ''}
        confirmLabel="Einschalten"
        confirmTone="primary"
        message={einschalten ? HINWEIS_BEIM_EINSCHALTEN[einschalten] : ''}
        onCancel={() => setEinschalten(null)}
        onConfirm={async () => {
          if (einschalten) await schreiben(einschalten, true, true);
          setEinschalten(null);
        }}
      />
    </div>
  );
}
