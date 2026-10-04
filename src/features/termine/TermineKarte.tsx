import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { darfTermineSchreiben } from '@/lib/permissions';
import { listTermineDerBaustelle, listTermineDesKunden, listTermineImZeitraum, terminLoeschen } from '@/lib/db/termine';
import { listUsers } from '@/lib/db/users';
import { todayStr } from '@/lib/time';
import type { AppUser, Termin } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import { useToast } from '@/components/Toast';
import TerminFormular, { type TerminVorgabe } from './TerminFormular';
import TerminListe from './TerminListe';
import { datumKurz, terminKopf } from './terminText';

/**
 * DIE TERMINE AN EINER STELLE — Tagesplanung, Baustellenakte, Kundenakte
 * (Plan 10.4). Liest, was der Zeilenschutz zeigt; anlegen, ändern und
 * löschen nur, wer darf (Leitung, Verwaltung).
 *
 * In den Akten stehen die kommenden Termine oben, die vergangenen klappen
 * auf: wer die Akte öffnet, will wissen, was ansteht.
 */
export default function TermineKarte({
  titel,
  vorgabe,
}: {
  titel: string;
  vorgabe: TerminVorgabe;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const heute = todayStr();
  const [termine, setTermine] = useState<Termin[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [personen, setPersonen] = useState<AppUser[]>([]);
  const [bearbeite, setBearbeite] = useState<Termin | 'neu' | null>(null);
  const [weg, setWeg] = useState<Termin | null>(null);
  const [fruehere, setFruehere] = useState(false);
  const [versuch, setVersuch] = useState(0);

  const companyId = user?.companyId;
  const darf = !!user && darfTermineSchreiben(user.role);
  const schluessel =
    vorgabe.bezug === 'frei' ? vorgabe.datum
      : vorgabe.bezug === 'baustelle' ? vorgabe.projectNumber
        : `${vorgabe.customerId}|${vorgabe.baustellen.map((b) => b.projectNumber).join(',')}`;

  const laden = useCallback(() => {
    if (!companyId) return Promise.resolve([] as Termin[]);
    if (vorgabe.bezug === 'frei') return listTermineImZeitraum(companyId, vorgabe.datum, vorgabe.datum);
    if (vorgabe.bezug === 'baustelle') return listTermineDerBaustelle(companyId, vorgabe.projectNumber);
    return listTermineDesKunden(companyId, vorgabe.customerId, vorgabe.baustellen.map((b) => b.projectNumber));
    // `schluessel` fasst die Vorgabe zusammen — ein neues, gleiches Objekt lädt nicht neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, schluessel]);

  useEffect(() => {
    let verworfen = false;
    setFehler(false);
    laden()
      .then((t) => {
        if (!verworfen) setTermine(t);
      })
      .catch(() => {
        if (!verworfen) {
          setTermine([]);
          setFehler(true);
        }
      });
    return () => {
      verworfen = true;
    };
  }, [laden, versuch]);

  // Die Namen der Teilnehmer — und die Auswahl im Formular.
  useEffect(() => {
    if (!companyId) return;
    listUsers(companyId).then(setPersonen).catch(() => setPersonen([]));
  }, [companyId]);

  if (!user || !companyId) return null;

  const tagesansicht = vorgabe.bezug === 'frei';
  const kommende = (termine ?? []).filter((t) => tagesansicht || t.datum >= heute);
  const vergangene = tagesansicht ? [] : (termine ?? []).filter((t) => t.datum < heute).reverse();

  return (
    <Card
      title={titel}
      action={
        darf && bearbeite === null ? (
          <Button variant="secondary" groesse="klein" onClick={() => setBearbeite('neu')}>
            Termin anlegen
          </Button>
        ) : undefined
      }
      hint="Termine sind Kundentermine, Besichtigungen, Besprechungen, Abnahmen, Lieferungen (Aviso) und Behördenwege — alles, was kein Einsatz ist. Ein Termin bucht keine Arbeitszeit. Teilnehmer sehen ihn auf der Startseite und in „Mein Einsatzplan“, ebenso wer an diesem Tag auf der Baustelle eingeteilt ist."
    >
      {bearbeite !== null && (
        <div className="mb-4 border-b border-line pb-4">
          <TerminFormular
            companyId={companyId}
            vorgabe={vorgabe}
            termin={bearbeite === 'neu' ? undefined : bearbeite}
            personen={personen}
            heute={heute}
            onGespeichert={() => {
              setBearbeite(null);
              setVersuch((v) => v + 1);
            }}
            onAbbrechen={() => setBearbeite(null)}
          />
        </div>
      )}

      {termine === null ? (
        <SkeletonList rows={1} />
      ) : fehler ? (
        <TeilFehler was="die Termine" onRetry={() => setVersuch((v) => v + 1)} />
      ) : kommende.length === 0 && vergangene.length === 0 ? (
        <EmptyState>{tagesansicht ? 'Keine Termine an diesem Tag.' : 'Keine Termine.'}</EmptyState>
      ) : (
        <>
          {kommende.length > 0 ? (
            <TerminListe
              termine={kommende}
              personen={personen}
              mitDatum={!tagesansicht}
              ohneBezug={vorgabe.bezug === 'baustelle'}
              onAendern={darf ? (t) => setBearbeite(t) : undefined}
              onLoeschen={darf ? (t) => setWeg(t) : undefined}
            />
          ) : (
            <p className="text-sm text-ink-muted">Nichts geplant.</p>
          )}
          {vergangene.length > 0 && (
            <>
              <Button variant="ghost" className="mt-2" onClick={() => setFruehere((f) => !f)}>
                {fruehere ? 'Frühere ausblenden' : `Frühere zeigen (${vergangene.length})`}
              </Button>
              {fruehere && (
                <TerminListe
                  termine={vergangene}
                  personen={personen}
                  mitDatum
                  ohneBezug={vorgabe.bezug === 'baustelle'}
                  onLoeschen={darf ? (t) => setWeg(t) : undefined}
                />
              )}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!weg}
        title="Termin löschen?"
        message={weg ? `${terminKopf(weg)} am ${datumKurz(weg.datum)} wird entfernt.` : ''}
        onCancel={() => setWeg(null)}
        onConfirm={async () => {
          const t = weg;
          setWeg(null);
          if (!t) return;
          try {
            await terminLoeschen(t.id);
            toast.success('Termin gelöscht');
            setVersuch((v) => v + 1);
          } catch {
            toast.error('Der Termin konnte nicht gelöscht werden.');
          }
        }}
      />
    </Card>
  );
}
