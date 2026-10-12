/**
 * DER EINRICHTUNGSSTAND JENSEITS DES BRIEFKOPFS (11.10.2026, Plan 17 E).
 *
 * Bis hierher las die Übersicht nur den Betrieb, der ohnehin geladen ist:
 * Briefkopf, UID, Bankverbindung. Ob die Kostensätze stehen, der
 * Kontenrahmen eingerichtet ist und die Sicherung läuft, erfuhr man erst auf
 * der jeweiligen Seite — oder gar nicht: ohne Kostensätze rechnet die
 * Nachkalkulation nichts, ohne Kontenrahmen fehlt der Buchungsstapel für die
 * Kanzlei, und eine Sicherung, die nie lief, fällt erst auf, wenn man sie
 * braucht.
 *
 * DREI ABFRAGEN, NUR FÜR DIE SPITZE und nur auf der Übersicht. Jede scheitert
 * für sich: dann heisst die Zeile „prüfen — ließ sich nicht abrufen“ statt
 * „offen“. Eine Behauptung, die nicht stimmt, wäre schlechter als keine.
 */
import { kostensaetze, type Kostensaetze } from '@/lib/db/kosten';
import { buchungskonten } from '@/lib/db/konten';
import { ladeLauf } from '@/lib/db/laeufe';
import { beurteile, type Lauf } from '@shared/laufStatus';
import type { Stand } from '@/components/Badge';
import { euro } from '@/lib/betrag';
import type { Einrichtungspunkt } from './EinstellungenUebersicht';

/** `'fehler'`: die Abfrage scheiterte — nicht dasselbe wie „nicht hinterlegt“. */
export interface EinrichtungZusatz {
  kosten: Kostensaetze | null | 'fehler';
  konten: number | 'fehler';
  sicherung: Lauf<'ausleitung'> | undefined;
}

const nichtAbrufbar = { stand: 'achtung' as Stand, wort: 'prüfen', info: 'Der Stand ließ sich gerade nicht abrufen' };

export function einrichtungZusatzPunkte(z: EinrichtungZusatz, jetzt: number): Einrichtungspunkt[] {
  const u = beurteile(z.sicherung, jetzt);
  return [
    {
      titel: 'Kostensätze',
      pfad: 'saetze',
      ...(z.kosten === 'fehler'
        ? nichtAbrufbar
        : z.kosten
          ? {
              stand: 'ruht' as Stand,
              wort: 'erledigt',
              info: `Facharbeiter ${euro(z.kosten.fach)}, Helfer ${euro(z.kosten.helper)} je Stunde`,
            }
          : { stand: 'achtung' as Stand, wort: 'offen', info: 'Ohne Kostensätze rechnet die Nachkalkulation nichts' }),
    },
    {
      titel: 'Kontenrahmen',
      pfad: 'konten',
      ...(z.konten === 'fehler'
        ? nichtAbrufbar
        : z.konten > 0
          ? { stand: 'ruht' as Stand, wort: 'erledigt', info: `${z.konten} ${z.konten === 1 ? 'Konto' : 'Konten'} für den Buchungsstapel` }
          : { stand: 'achtung' as Stand, wort: 'offen', info: 'Ohne Konten fehlt der Buchungsstapel für die Kanzlei' }),
    },
    {
      titel: 'Sicherung',
      pfad: 'sicherung',
      // Dasselbe Urteil wie auf der Seite der Sicherung (`LaufStatus`).
      ...(u.stand === 'gut'
        ? { stand: 'ruht' as Stand, wort: 'erledigt', info: u.text }
        : u.stand === 'ueberfaellig'
          ? { stand: 'schlecht' as Stand, wort: 'prüfen', info: u.text }
          : // Ohne Lauf kennt `beurteile` keinen Namen („Der Lauf …“); die Zeile heisst schon „Sicherung“.
            { stand: 'achtung' as Stand, wort: 'offen', info: 'Noch nie durchgelaufen — oder es ist nichts darüber festgehalten.' }),
    },
  ];
}

export async function einrichtungZusatzLaden(companyId: string): Promise<EinrichtungZusatz> {
  const [kosten, konten, sicherung] = await Promise.all([
    kostensaetze(companyId).catch(() => 'fehler' as const),
    buchungskonten(companyId).then((k) => k.length).catch(() => 'fehler' as const),
    // `ladeLauf` wirft nie: was es nicht weiss, kommt als `undefined`.
    ladeLauf(companyId, 'ausleitung'),
  ]);
  return { kosten, konten, sicherung };
}
