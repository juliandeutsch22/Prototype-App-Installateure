import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { baustelleAbschliessen, baustelleAbschlussLage, type AbschlussLage } from '@/lib/db/projects';
import { datumAT } from '@/lib/datum';
import { ZIEL } from '@/features/dashboard/start/ziele';
import { abschlussPunkte } from './abschlussPunkte';

/**
 * BAUSTELLE GEFÜHRT ABSCHLIESSEN (Durchsicht 15.11.2026, A11 / F1 / V2).
 *
 * „Abgeschlossen“ war ein Auswahlfeld ohne jede Prüfung: die Baustelle fiel
 * aus allen Auswahlfeldern, ihre kommenden Einsätze blieben im Plan, ein
 * Schein-Entwurf oder unverrechnete Leistung blieb liegen, ohne dass es
 * jemand sah. Dieser Schritt zeigt vorher, was offen ist — je mit dem Weg
 * dorthin. Kommende Einsätze halten ihn auf (sie stünden sonst auf einer
 * abgeschlossenen Baustelle im Plan); alles andere darf bleiben, aber nicht
 * unbemerkt: dann heißt der Knopf „Trotzdem abschließen“.
 *
 * Eine Stelle für Akte und Baustellenliste.
 */
export default function BaustelleAbschliessen({
  projekt,
  onClose,
  onAbgeschlossen,
}: {
  /** Offen, solange gesetzt. */
  projekt: { id: string; projectNumber: string } | null;
  onClose: () => void;
  onAbgeschlossen?: () => void;
}) {
  const toast = useToast();
  const [lage, setLage] = useState<{ id: string; lage: AbschlussLage } | 'laedt' | 'fehler' | null>(null);

  useEffect(() => {
    if (!projekt) {
      setLage(null);
      return;
    }
    let weg = false;
    setLage('laedt');
    baustelleAbschlussLage(projekt.id)
      .then((l) => { if (!weg) setLage({ id: projekt.id, lage: l }); })
      .catch(() => { if (!weg) setLage('fehler'); });
    return () => {
      weg = true;
    };
  }, [projekt]);

  const l = lage && typeof lage === 'object' && projekt && lage.id === projekt.id ? lage.lage : null;
  const punkte = l && projekt ? abschlussPunkte(l) : [];
  const einsaetze = l?.kommendeEinsaetze ?? 0;

  return (
    <ConfirmDialog
      open={!!projekt}
      title={projekt ? `Baustelle ${projekt.projectNumber} abschließen?` : ''}
      message={
        !l
          ? lage === 'fehler'
            ? 'Was an der Baustelle noch offen ist, ließ sich gerade nicht nachsehen. Abschließen geht trotzdem; kommende Einsätze hält die Datenbank auf.'
            : 'Wird nachgesehen, was an der Baustelle noch offen ist …'
          : einsaetze > 0
            ? 'Erst die kommenden Einsätze umplanen oder entfernen — sie stünden sonst auf einer abgeschlossenen Baustelle im Plan.'
            : punkte.length === 0
              ? 'Nichts ist mehr offen. Abgeschlossen fällt sie aus den Auswahllisten; wieder öffnen geht unter „Bearbeiten“.'
              : 'Noch offen — das bleibt auch nach dem Abschließen bestehen. Wieder öffnen geht unter „Bearbeiten“.'
      }
      confirmLabel={punkte.length > 0 && einsaetze === 0 ? 'Trotzdem abschließen' : 'Abschließen'}
      confirmTone="primary"
      gesperrt={lage === 'laedt' || einsaetze > 0}
      onCancel={onClose}
      onConfirm={async () => {
        if (!projekt) return;
        await baustelleAbschliessen(projekt.id);
        toast.success(`Baustelle ${projekt.projectNumber} abgeschlossen`);
        onAbgeschlossen?.();
        onClose();
      }}
    >
      {l && projekt && (einsaetze > 0 || punkte.length > 0) && (
        <ul className="space-y-2 text-sm text-ink">
          {einsaetze > 0 && (
            <li>
              {einsaetze === 1 ? 'Ein Einsatz' : `${einsaetze} Einsätze`} ab {datumAT(l.naechsterEinsatz ?? undefined)} geplant
              {' · '}
              <Link to={ZIEL.tag(l.naechsterEinsatz ?? '')} className="link">Im Einsatzplan öffnen</Link>
            </li>
          )}
          {punkte.map((p) => (
            <li key={p.key}>
              {p.text}
              {p.weg && (
                <>
                  {' · '}
                  <Link to={p.weg.zu(projekt.projectNumber)} className="link">{p.weg.text}</Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {l && l.unverrechneteMinuten === null && (
        <p className="mt-2 text-sm text-ink-muted">Ob noch Leistung unverrechnet ist, sieht, wer die Rechnungen dieser Baustelle liest.</p>
      )}
    </ConfirmDialog>
  );
}
