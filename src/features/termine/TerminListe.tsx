import type { AppUser, Termin } from '@/types';
import Button from '@/components/Button';
import { AdresseLink } from '@/components/Kontakt';
import { bezugText, datumKurz, terminKopf } from './terminText';

/**
 * Termine untereinander: Art und Uhrzeit, woran er hängt, wer teilnimmt, die
 * Notiz. Ändern und Löschen nur für die, die schreiben dürfen.
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
    <ul className="divide-y divide-line">
      {termine.map((t) => {
        const namen = t.teilnehmer.map(name).filter(Boolean);
        return (
          <li key={t.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2">
            <div className="min-w-0">
              <p className="font-medium text-ink">
                {mitDatum && <span className="nr">{datumKurz(t.datum)} · </span>}
                {terminKopf(t)}
              </p>
              {!ohneBezug && <p className="text-sm text-ink-muted">{bezugText(t)}</p>}
              {mitAdresse && t.ortAdresse && <AdresseLink adresse={t.ortAdresse} className="text-sm" />}
              {namen.length > 0 && <p className="text-sm text-ink-muted">Teilnehmer: {namen.join(', ')}</p>}
              {t.notiz && <p className="whitespace-pre-line text-sm text-ink">{t.notiz}</p>}
            </div>
            {(onAendern || onLoeschen) && (
              <div className="flex shrink-0 gap-1">
                {onAendern && (
                  <Button variant="ghost" groesse="klein" onClick={() => onAendern(t)} aria-label={`${terminKopf(t)} am ${datumKurz(t.datum)} ändern`}>
                    Ändern
                  </Button>
                )}
                {onLoeschen && (
                  <Button variant="ghost" groesse="klein" onClick={() => onLoeschen(t)} aria-label={`${terminKopf(t)} am ${datumKurz(t.datum)} löschen`}>
                    Löschen
                  </Button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

