import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { laufId, type LaufArt } from './generated/laufStatus.js';

/**
 * Das Ergebnis eines nächtlichen Laufs festhalten.
 *
 * WOZU. Ausleitung und Bilanzlauf arbeiten unbeaufsichtigt. Scheiterten sie,
 * stand das im Google-Protokoll und sonst nirgends — und dorthin sieht in
 * einem Installationsbetrieb niemand. Die Sicherung kann wochenlang
 * ausfallen; bemerkt wird es an dem Tag, an dem man sie braucht.
 *
 * GESCHRIEBEN WIRD AUCH DER FEHLSCHLAG. Nur den Erfolg festzuhalten hiesse:
 * ein Betrieb, bei dem seit Wochen nichts läuft, sieht aus wie einer, der
 * gerade erst eingerichtet wurde. Der Unterschied zwischen „noch nie" und
 * „seit drei Wochen nicht mehr" ist genau der, auf den es ankommt.
 *
 * DAS FESTHALTEN DARF DEN LAUF NICHT ZU FALL BRINGEN. Es ist eine
 * Nebenleistung; scheitert es, ist die Sicherung trotzdem geschrieben. Ein
 * geworfener Fehler hier liesse den ganzen Lauf als gescheitert gelten — und
 * damit stünde in der Überwachung das Gegenteil der Wahrheit.
 */

const SAMMLUNG = 'systemLaeufe';

export async function laufFesthalten(
  companyId: string,
  art: LaufArt,
  ergebnis: {
    erfolg: boolean;
    meldung?: string;
    kennzahl?: number;
    kennzahlEinheit?: string;
    /** Nur die Ausleitung: liegt der Zielspeicher ausserhalb dieses Projekts? */
    zielExtern?: boolean;
  },
): Promise<void> {
  const jetzt = Date.now();
  try {
    await getFirestore()
      .collection(SAMMLUNG)
      .doc(laufId(companyId, art))
      .set(
        {
          companyId,
          art,
          zuletztVersuch: jetzt,
          erfolg: ergebnis.erfolg,
          // Leerstring statt undefined: Firestore lehnt undefined ab, und ein
          // geleertes Feld sagt „diesmal ging es durch".
          meldung: ergebnis.meldung ?? '',
          // Auch beim Fehlschlag: wo die Sicherung LIEGEN SOLL, ist eine
          // Eigenschaft der Einrichtung und nicht des einzelnen Laufs.
          ...(ergebnis.zielExtern === undefined ? {} : { zielExtern: ergebnis.zielExtern }),
          ...(ergebnis.erfolg
            ? {
                zuletztErfolg: jetzt,
                kennzahl: ergebnis.kennzahl ?? 0,
                kennzahlEinheit: ergebnis.kennzahlEinheit ?? '',
              }
            : {}),
        },
        // ZUSAMMENFÜHREN, nicht ersetzen: ein Fehlschlag darf den letzten
        // ERFOLG nicht löschen. Genau dieser Wert ist der, den die Überwachung
        // beurteilt — ohne ihn stünde nach einem Fehlschlag „noch nie
        // gelaufen", und das ist etwas anderes.
        { merge: true },
      );
  } catch (e) {
    logger.error('Laufstatus konnte nicht festgehalten werden', { companyId, art, e });
  }
}
