import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { isTopLevel } from '@/lib/permissions';
import { useModul } from '@/lib/useModule';
import {
  deleteQuote, listVerworfeneAngebote, updateQuote, zaehleVerworfeneAngebote, type AngebotImPapierkorb,
} from '@/lib/db/quotes';
import {
  deleteWorkSheetDraft, listVerworfeneScheine, restoreWorkSheetDraft, zaehleVerworfeneScheine,
} from '@/lib/db/workSheets';
import type { WithId } from '@/lib/db/core';
import type { WorkSheet } from '@/types';
import { fristStichtag, ueberFrist } from '@/lib/papierkorb';
import { datumAT } from '@/lib/datum';
import { euro } from '@/lib/betrag';
import { fmtDauer } from '@/lib/time';
import { grundAus } from '@/lib/fehlerGrund';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Abschnitt from '@/components/Abschnitt';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import Hinweiszeile from '@/components/Hinweiszeile';
import Nachladen from '@/components/Nachladen';
import { List, ListRow } from '@/components/ListRow';
import { Zustand } from '@/components/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { ZIEL } from '@/features/dashboard/start/ziele';
import { WIEDERHERGESTELLT_MELDUNG } from '@/features/quotes/verwerfen';
import { entwuerfeLiegen, verworfenText } from './papierkorbText';
import { abgelaufeneLoeschen } from './papierkorbLeeren';
import PapierkorbFristKarte from './PapierkorbFristKarte';

/**
 * Wie viele je Art auf einmal geholt werden. Wer mehr hat, lädt nach — die
 * Überschrift jeder Gruppe nennt die ganze Zahl, gezählt auf dem Server.
 */
const JE_SEITE = 50;

type Angebot = WithId<AngebotImPapierkorb>;
type Schein = WithId<WorkSheet>;

interface Stand {
  angebote: Angebot[];
  angeboteZahl: number;
  scheine: Schein[];
  scheineZahl: number;
  /** Wie viele über der Frist liegen — `null` ohne Frist. */
  ueber: number | null;
}

type Frage = { art: 'angebot'; a: Angebot } | { art: 'schein'; s: Schein };

/**
 * DER PAPIERKORB (M01d, U06): was verworfen wurde, an einer Stelle —
 * Angebotsentwürfe und Entwürfe von Handwerksscheinen.
 *
 * WARUM ES IHN GIBT. „Löschen“ eines Angebotsentwurfs war bis hierher
 * endgültig; ein Fehlgriff kostete die ganze Kalkulation. Jetzt landet ein
 * verworfener Entwurf hier, lässt sich wiederherstellen und wird erst hier —
 * mit eigener Rückfrage — endgültig gelöscht (E42: gelöscht ist gelöscht).
 * Ausgestellte Belege kommen nie hierher: ein versendetes Angebot wird
 * abgelehnt oder ersetzt, ein unterschriebener Schein storniert.
 *
 * FÜR DIE FÜHRUNG. Der Monteur hat für seine eigenen Scheine weiter den
 * Umschalter „verworfene anzeigen“ in der Scheinliste.
 *
 * MODULE: Die Angebote stehen nur da, wenn das Modul Angebote an ist, die
 * Scheine nur mit dem Modul Handwerksscheine. Sind beide aus, gibt es die
 * Seite nicht (`navigation.ts`, `nurMitModul`).
 */
export default function PapierkorbView() {
  const { user, company } = useAuth();
  const toast = useToast();
  const angeboteAn = useModul('angebote');
  const scheineAn = useModul('scheine');
  const spitze = user ? isTopLevel(user.role) : false;
  const frist = company?.papierkorbFristTage ?? null;

  const [stand, setStand] = useState<Stand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ladeFehler, setLadeFehler] = useState(false);
  const [versuch, setVersuch] = useState(0);
  const [grenzeAngebote, setGrenzeAngebote] = useState(JE_SEITE);
  const [grenzeScheine, setGrenzeScheine] = useState(JE_SEITE);
  const [laufend, setLaufend] = useState<string | null>(null);
  const [frage, setFrage] = useState<Frage | null>(null);
  const [leerenFragen, setLeerenFragen] = useState(false);

  const companyId = user?.companyId;

  useEffect(() => {
    if (!companyId) return;
    let weg = false;
    setLadeFehler(false);
    void (async () => {
      try {
        const stichtag = fristStichtag(frist, Date.now());
        const bis = stichtag === null ? null : new Date(stichtag).toISOString();
        const [angebote, angeboteZahl, scheine, scheineZahl, ueberAngebote, ueberScheine] = await Promise.all([
          angeboteAn ? listVerworfeneAngebote(companyId, grenzeAngebote) : Promise.resolve([]),
          angeboteAn ? zaehleVerworfeneAngebote(companyId) : Promise.resolve(0),
          scheineAn ? listVerworfeneScheine(companyId, grenzeScheine) : Promise.resolve([]),
          scheineAn ? zaehleVerworfeneScheine(companyId) : Promise.resolve(0),
          angeboteAn && bis ? zaehleVerworfeneAngebote(companyId, bis) : Promise.resolve(0),
          scheineAn && bis ? zaehleVerworfeneScheine(companyId, bis) : Promise.resolve(0),
        ]);
        if (!weg) {
          setStand({
            angebote, angeboteZahl, scheine, scheineZahl,
            ueber: bis ? ueberAngebote + ueberScheine : null,
          });
        }
      } catch {
        if (!weg) setLadeFehler(true);
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, angeboteAn, scheineAn, frist, grenzeAngebote, grenzeScheine, versuch]);

  if (!user || !companyId) return null;

  const jetzt = Date.now();
  const neuLaden = () => setVersuch((v) => v + 1);

  /** Ein Schritt mit Meldung; scheitert er, sagt die Seite warum. */
  async function schritt(kennung: string, lauf: () => Promise<void>, meldung: string) {
    setLaufend(kennung);
    setFehler(null);
    try {
      await lauf();
      toast.success(meldung);
      neuLaden();
    } catch (err) {
      setFehler(grundAus(err, 'Das ging gerade nicht.'));
    } finally {
      setLaufend(null);
    }
  }

  const ueberMarke = (verworfenAm: number | null | undefined) =>
    ueberFrist(verworfenAm, frist, jetzt) ? <Zustand stand="achtung">über der Frist</Zustand> : undefined;

  const angebotZeile = (a: Angebot) => (
    <ListRow
      key={a.id}
      // Die ganze Zeile öffnet das Angebot — dort steht es „im Papierkorb“, nur zum Lesen.
      to={`/quotes/${a.id}`}
      title={a.customerName}
      nummer={a.quoteNumber}
      wert={euro(a.totalBrutto)}
      zustand={ueberMarke(a.verworfenAm)}
      subtitle={[a.projectNumber ? `Baustelle ${a.projectNumber}` : a.address, verworfenText(a, jetzt)]
        .filter(Boolean).join(' · ')}
    >
      <Button
        variant="ghost"
        loading={laufend === a.id}
        disabled={!!laufend}
        onClick={() => void schritt(a.id, () => updateQuote(a.id, { status: 'Entwurf' }), `${a.quoteNumber}: ${WIEDERHERGESTELLT_MELDUNG}`)}
      >
        Wiederherstellen
      </Button>
      <Button variant="ghost" disabled={!!laufend} onClick={() => setFrage({ art: 'angebot', a })}>
        Endgültig löschen
      </Button>
    </ListRow>
  );

  const scheinZeile = (s: Schein) => (
    <ListRow
      key={s.id}
      // Die ganze Zeile öffnet den Schein in der Scheinliste, mit seinen Einzelheiten.
      to={ZIEL.schein(s.id)}
      title={s.customerName}
      nummer={s.projectNumber}
      zustand={ueberMarke(s.verworfenAm)}
      subtitle={`${datumAT(s.datum)} · ${verworfenText(s, jetzt)}`}
    >
      <Button
        variant="ghost"
        loading={laufend === s.id}
        disabled={!!laufend}
        onClick={() => void schritt(s.id, () => restoreWorkSheetDraft(s.id), 'Schein wiederhergestellt — wieder ein Entwurf')}
      >
        Wiederherstellen
      </Button>
      <Button variant="ghost" disabled={!!laufend} onClick={() => setFrage({ art: 'schein', s })}>
        Endgültig löschen
      </Button>
    </ListRow>
  );

  const leer = !!stand && stand.angeboteZahl === 0 && stand.scheineZahl === 0;
  const fotos = (s: Schein) => (s.fotos ?? []).length;

  return (
    <div className="space-y-6">
      <PageHeader
        ort="Einstellungen"
        title="Papierkorb"
        subtitle="Verworfene Entwürfe wiederherstellen oder löschen"
        hilfe={
          <>
            Hier liegt, was verworfen wurde: {angeboteAn && 'Angebotsentwürfe'}{angeboteAn && scheineAn && ' und '}
            {scheineAn && 'Entwürfe von Handwerksscheinen'}. Wiederherstellen macht daraus wieder einen Entwurf.
            Endgültig löschen lässt sich nicht rückgängig machen; beim Schein gehen Zeiten, Material und Fotos mit.
            Ausgestellte Belege kommen nie hierher: ein versendetes Angebot wird abgelehnt oder ersetzt, ein
            unterschriebener Schein storniert. Von selbst wird nichts gelöscht.
          </>
        }
      />

      {fehler && <ErrorState message={fehler} />}

      {/* Über der Frist: ein Hinweis, und die Spitze leert mit einem Handgriff — nach Rückfrage. */}
      {stand?.ueber != null && stand.ueber > 0 && frist && (
        <Hinweiszeile stufe="warn">
          <p>
            <b>{entwuerfeLiegen(stand.ueber)} länger als {frist} Tage im Papierkorb.</b>{' '}
            {spitze ? 'Sie stehen unten als „über der Frist“.' : 'Leeren kann sie die Geschäftsführung.'}
          </p>
          {spitze && (
            <div className="mt-2">
              <Button variant="secondary" disabled={!!laufend} onClick={() => setLeerenFragen(true)}>
                Abgelaufene endgültig löschen
              </Button>
            </div>
          )}
        </Hinweiszeile>
      )}

      <Card title="Verworfene Entwürfe" buendig>
        {ladeFehler ? (
          <ErrorState message="Der Papierkorb konnte nicht geladen werden." onRetry={neuLaden} />
        ) : !stand ? (
          <SkeletonList rows={4} />
        ) : leer ? (
          <EmptyState titel="Der Papierkorb ist leer.">
            Was verworfen wird, liegt hier, bis es wiederhergestellt oder endgültig gelöscht wird.
          </EmptyState>
        ) : (
          <>
            {angeboteAn && stand.angeboteZahl > 0 && (
              <Abschnitt titel="Angebote" anzahl={stand.angeboteZahl}>
                <List>{stand.angebote.map(angebotZeile)}</List>
                <div className="px-4 pb-3 empty:hidden">
                  <Nachladen
                    geladen={stand.angebote.length}
                    grenze={grenzeAngebote}
                    einheit="Angebote"
                    onMehr={() => setGrenzeAngebote((n) => n + JE_SEITE)}
                    sucheImBrowser={false}
                  />
                </div>
              </Abschnitt>
            )}
            {scheineAn && stand.scheineZahl > 0 && (
              <Abschnitt titel="Handwerksscheine" anzahl={stand.scheineZahl}>
                <List>{stand.scheine.map(scheinZeile)}</List>
                <div className="px-4 pb-3 empty:hidden">
                  <Nachladen
                    geladen={stand.scheine.length}
                    grenze={grenzeScheine}
                    einheit="Scheine"
                    onMehr={() => setGrenzeScheine((n) => n + JE_SEITE)}
                    sucheImBrowser={false}
                  />
                </div>
              </Abschnitt>
            )}
          </>
        )}
      </Card>

      {spitze && <PapierkorbFristKarte />}

      {/*
        ENDGÜLTIG IST ENDGÜLTIG (E42) — deshalb rot, und die Rückfrage nennt,
        was weggeht. Beim Schein wie in der Scheinliste: erst die Fotos im
        Speicher, dann die Zeile samt Zeiten und Material.
      */}
      <ConfirmDialog
        open={!!frage}
        title={frage?.art === 'schein' ? 'Verworfenen Entwurf endgültig löschen' : 'Angebot endgültig löschen'}
        message={
          frage?.art === 'angebot'
            ? `${frage.a.quoteNumber} für ${frage.a.customerName} wird samt Positionen endgültig gelöscht. `
              + 'Das lässt sich nicht rückgängig machen.'
            : frage?.art === 'schein'
              ? `${frage.s.customerName}, ${datumAT(frage.s.datum)} · `
                + `${fmtDauer(frage.s.zeiten.reduce((n, z) => n + z.minuten, 0))} · `
                + `${frage.s.material.length} Materialposten · `
                + `${fotos(frage.s) === 1 ? '1 Foto' : `${fotos(frage.s)} Fotos`}. `
                + 'Der Entwurf wird samt Zeiten, Material und Fotos endgültig gelöscht und lässt sich nicht zurückholen.'
              : undefined
        }
        confirmLabel="Endgültig löschen"
        onCancel={() => setFrage(null)}
        onConfirm={async () => {
          if (!frage) return;
          if (frage.art === 'angebot') {
            await deleteQuote(frage.a.id);
            toast.success(`${frage.a.quoteNumber} endgültig gelöscht`);
          } else {
            await deleteWorkSheetDraft(companyId, frage.s.id, (frage.s.fotos ?? []).map((f) => f.pfad));
            toast.success('Entwurf endgültig gelöscht');
          }
          setFrage(null);
          neuLaden();
        }}
      />

      <ConfirmDialog
        open={leerenFragen}
        title="Abgelaufene endgültig löschen?"
        message={
          stand?.ueber && frist
            ? `${entwuerfeLiegen(stand.ueber)} länger als ${frist} Tage im Papierkorb. `
              + `${stand.ueber === 1 ? 'Er wird' : 'Sie werden'} endgültig gelöscht — Scheine samt Zeiten, Material und Fotos. `
              + 'Das lässt sich nicht rückgängig machen.'
            : undefined
        }
        confirmLabel={stand?.ueber === 1 ? '1 Entwurf löschen' : `${stand?.ueber ?? 0} Entwürfe löschen`}
        onCancel={() => setLeerenFragen(false)}
        onConfirm={async () => {
          const stichtag = fristStichtag(frist, Date.now());
          if (stichtag === null) return;
          const r = await abgelaufeneLoeschen(companyId, new Date(stichtag).toISOString(), {
            angebote: angeboteAn, scheine: scheineAn,
          });
          setLeerenFragen(false);
          neuLaden();
          const zahl = r.angebote + r.scheine;
          if (r.fehler) {
            setFehler(`${zahl === 1 ? '1 Entwurf' : `${zahl} Entwürfe`} gelöscht, dann brach es ab: ${r.fehler}`);
          } else {
            toast.success(`${zahl === 1 ? '1 Entwurf' : `${zahl} Entwürfe`} endgültig gelöscht`);
          }
        }}
      />
    </div>
  );
}
