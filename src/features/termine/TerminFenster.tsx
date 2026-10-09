import { useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { darfTermineSchreiben } from '@/lib/permissions';
import { terminLoeschen } from '@/lib/db/termine';
import { todayStr } from '@/lib/time';
import type { AppUser, Termin } from '@/types';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { AdresseLink } from '@/components/Kontakt';
import { useToast } from '@/components/Toast';
import TerminFormular from './TerminFormular';
import { artName, bezugText, datumKurz, terminKopf, terminZeit } from './terminText';

/**
 * EIN TERMIN IM SEITENFENSTER der Einsatzplanung (Runde 4, Auftrag 4.4):
 * „Termin ändern“ aus dem Raster, dem Tageskopf oder dem Monat, „Termin
 * anlegen“ aus dem Seitenfenster „Tag“.
 *
 * DASSELBE FORMULAR WIE „TERMINE AM …“ IN „TAG PLANEN“ (`TerminFormular` mit
 * der Vorgabe des Tages) und dasselbe Löschen mit Rückfrage wie in
 * `TermineKarte` — kein zweiter Schreibweg. Die Terminkarte selbst bleibt in
 * Tag planen, Baustellen- und Kundenakte, wie sie ist.
 *
 * WER NUR SEHEN DARF, SIEHT NUR (Auftrag 1.5): dasselbe Fenster, die Angaben
 * als Text, ohne Speichern und ohne Löschen. Was jemand sieht, entscheidet
 * wie überall der Zeilenschutz der Datenbank.
 */
export default function TerminFenster({
  termin,
  datum,
  personen,
  onClose,
  onGeaendert,
}: {
  /** Der Termin zum Ändern bzw. Lesen; ohne ihn wird angelegt. */
  termin: Termin | null;
  /** Für „Termin anlegen“: der Tag, an dem er stehen soll. */
  datum: string;
  personen: AppUser[];
  onClose: () => void;
  /** Gespeichert oder gelöscht — die Seite lädt die Termine neu. */
  onGeaendert: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [loeschFrage, setLoeschFrage] = useState(false);
  if (!user) return null;

  const darf = darfTermineSchreiben(user.role);
  const titel = !termin ? 'Termin anlegen' : darf ? 'Termin ändern' : 'Termin';
  const name = (uid: string) => personen.find((p) => p.uid === uid)?.name;

  return (
    <BottomSheet open onClose={onClose} label={titel} auchBreit titel={titel}>
      {darf ? (
        <div className="space-y-4">
          <TerminFormular
            companyId={user.companyId}
            vorgabe={{ bezug: 'frei', datum: termin?.datum ?? datum }}
            termin={termin ?? undefined}
            personen={personen}
            heute={todayStr()}
            onGespeichert={() => {
              onGeaendert();
              onClose();
            }}
            onAbbrechen={onClose}
          />
          {termin && (
            <div className="fuss-aktionen">
              {/* Rot erst in der Rückfrage — wie „Löschen“ in der Terminkarte. */}
              <Button
                variant="ghost"
                onClick={() => setLoeschFrage(true)}
                aria-label={`${terminKopf(termin)} am ${datumKurz(termin.datum)} löschen`}
              >
                Termin löschen
              </Button>
            </div>
          )}
        </div>
      ) : termin ? (
        /* LESEANSICHT: dieselben Angaben wie im Formular, als Text. */
        <dl className="termin-lesen">
          <dt className="termin-lesen-name">Art</dt>
          <dd className="termin-lesen-wert">{artName(termin.art)}</dd>
          <dt className="termin-lesen-name">Tag</dt>
          <dd className="termin-lesen-wert">{datumKurz(termin.datum)}</dd>
          <dt className="termin-lesen-name">{termin.art === 'Lieferung' ? 'Zeitfenster' : 'Uhrzeit'}</dt>
          <dd className="termin-lesen-wert">{terminZeit(termin) || 'ganzer Tag, ohne Uhrzeit'}</dd>
          <dt className="termin-lesen-name">Wo</dt>
          <dd className="termin-lesen-wert">
            {bezugText(termin)}
            {termin.ortAdresse && (
              <span className="block">
                <AdresseLink adresse={termin.ortAdresse} className="text-sm" />
              </span>
            )}
          </dd>
          <dt className="termin-lesen-name">Teilnehmer</dt>
          <dd className="termin-lesen-wert">
            {termin.teilnehmer.map(name).filter(Boolean).join(', ') || 'keine'}
          </dd>
          {termin.notiz && (
            <>
              <dt className="termin-lesen-name">Notiz</dt>
              <dd className="termin-lesen-notiz">{termin.notiz}</dd>
            </>
          )}
        </dl>
      ) : null}

      <ConfirmDialog
        open={loeschFrage}
        title="Termin löschen?"
        message={termin ? `${terminKopf(termin)} am ${datumKurz(termin.datum)} wird entfernt.` : ''}
        onCancel={() => setLoeschFrage(false)}
        onConfirm={async () => {
          setLoeschFrage(false);
          if (!termin) return;
          try {
            await terminLoeschen(termin.id);
            toast.success('Termin gelöscht');
            onGeaendert();
            onClose();
          } catch {
            toast.error('Der Termin konnte nicht gelöscht werden.');
          }
        }}
      />
    </BottomSheet>
  );
}
