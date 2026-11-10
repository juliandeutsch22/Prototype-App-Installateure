import type { AppUser, Termin } from '@/types';
import { AdresseLink } from '@/components/Kontakt';
import { List, ListRow } from '@/components/ListRow';
import { bezugText, datumKurz, terminKopf } from './terminText';
import { BearbeitenKnopf, LoeschenKnopf } from '@/components/Symbolknoepfe';

/**
 * Termine untereinander: Art und Uhrzeit, woran er hängt, wer teilnimmt, die
 * Notiz. Ändern und Löschen nur für die, die schreiben dürfen.
 *
 * EIN MUSTER MIT DEM TAGESFENSTER (E72, 09.11.2026): die Liste war eigens
 * gebaut — eigener Takt (`py-2`), Knöpfe, die je nach Länge der Notiz
 * sprangen, „Löschen“ klein 4 px neben „Ändern“. Jetzt ist jeder Termin eine
 * `ListRow` wie im Seitenfenster „Tag“: Zeilenhöhe und Linien im Takt der
 * Blätter, die Knöpfe rechts in der Zeile mit 44 px Tastfläche, „Löschen“
 * rot wie jedes Unumkehrbare (R4) — die Rückfrage folgt wie bisher.
 */
export default function TerminListe({
  termine,
  personen,
  mitDatum = false,
  ohneBezug = false,
  mitAdresse = false,
  onAendern,
  onLoeschen,
}: {
  termine: Termin[];
  personen: Pick<AppUser, 'uid' | 'name'>[];
  /** In Listen über mehrere Tage steht der Tag vorne. */
  mitDatum?: boolean;
  /** In der Baustellenakte ist die Baustelle klar. */
  ohneBezug?: boolean;
  /** Für den, der hinfährt: die Adresse, antippbar. */
  mitAdresse?: boolean;
  onAendern?: (t: Termin) => void;
  onLoeschen?: (t: Termin) => void;
}) {
  const name = (uid: string) => personen.find((p) => p.uid === uid)?.name;
  return (
    <List>
      {termine.map((t) => {
        const namen = t.teilnehmer.map(name).filter(Boolean);
        const bezug = !ohneBezug ? bezugText(t) : '';
        const adresse = mitAdresse && t.ortAdresse;
        const unten = !!bezug || !!adresse || namen.length > 0 || !!t.notiz;
        return (
          <ListRow
            key={t.id}
            title={
              <span>
                {mitDatum && <span className="nr">{datumKurz(t.datum)} · </span>}
                {terminKopf(t)}
              </span>
            }
            subtitle={
              unten ? (
                <>
                  {bezug && <span className="block">{bezug}</span>}
                  {adresse && <AdresseLink adresse={t.ortAdresse} className="text-sm" />}
                  {namen.length > 0 && <span className="block">Teilnehmer: {namen.join(', ')}</span>}
                  {t.notiz && <span className="block whitespace-pre-line text-ink">{t.notiz}</span>}
                </>
              ) : undefined
            }
          >
            {/* Stift und Papierkorb wie in jeder Zeile (E74); die Rückfrage vor dem Löschen bleibt beim Aufrufer. */}
            {onAendern && <BearbeitenKnopf label={`${terminKopf(t)} am ${datumKurz(t.datum)} ändern`} onClick={() => onAendern(t)} />}
            {onLoeschen && <LoeschenKnopf label={`${terminKopf(t)} am ${datumKurz(t.datum)} löschen`} onClick={() => onLoeschen(t)} />}
          </ListRow>
        );
      })}
    </List>
  );
}
