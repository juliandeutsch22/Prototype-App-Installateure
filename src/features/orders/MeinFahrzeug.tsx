import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { canProcessOrders } from '@/lib/permissions';
import { bestandAmOrt, bestandBeobachten } from '@/lib/db/lagerorte';
import { katalogNachIds } from '@/lib/db/materials';
import type { WithId } from '@/lib/db/core';
import type { Lagerbestand, Lagerort, Material } from '@/types';
import { fmtMenge } from '@/lib/belegLayout';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { List, ListRow } from '@/components/ListRow';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useLagerorte } from './useLagerorte';
import { eigeneFahrzeugOrte, HAUPTLAGER, ortName } from './lagerorte';
import { UmlagernDialog } from './LagerDialoge';

/**
 * MEIN FAHRZEUG (M04a): was im eigenen Fahrzeug liegt — für den
 * Standardfahrer, nur zum Lesen. Wenn der Betrieb es erlaubt
 * (`lagerRueckgabeFahrer`), lagert er bei der Rückgabe selbst ins Hauptlager
 * zurück; sonst bucht das Lager. Verwaltung und Leitung dürfen ohnehin
 * umlagern.
 *
 * Ohne eigenes Fahrzeug, ohne „Lagerorte und Fahrzeuglager“ oder wenn die
 * Orte nicht kommen, steht hier nichts.
 */
export default function MeinFahrzeug() {
  const { user, company } = useAuth();
  const lo = useLagerorte();
  const eigene = useMemo(
    () => (user ? eigeneFahrzeugOrte(lo.orte, lo.fahrzeuge, user.uid) : []),
    [lo.orte, lo.fahrzeuge, user],
  );
  if (!user || eigene.length === 0) return null;
  const darfZurueck = !!company?.lagerRueckgabeFahrer || canProcessOrders(user.role);
  return (
    <>
      {eigene.map((o) => (
        <FahrzeugBestand key={o.id} ort={o} orte={lo.orte} darfZurueck={darfZurueck} companyId={user.companyId} />
      ))}
    </>
  );
}

function FahrzeugBestand({
  ort,
  orte,
  darfZurueck,
  companyId,
}: {
  ort: Lagerort;
  orte: readonly Lagerort[];
  darfZurueck: boolean;
  companyId: string;
}) {
  const toast = useToast();
  const [zeilen, setZeilen] = useState<{ b: Lagerbestand; m: WithId<Material> }[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [stand, setStand] = useState(0);
  const [zurueck, setZurueck] = useState<{ b: Lagerbestand; m: WithId<Material> } | null>(null);

  useEffect(() => {
    try {
      return bestandBeobachten(companyId, () => setStand((n) => n + 1));
    } catch {
      return undefined;
    }
  }, [companyId]);

  useEffect(() => {
    let weg = false;
    setFehler(null);
    Promise.resolve()
      .then(async () => {
        const b = await bestandAmOrt(companyId, ort.id);
        const artikel = b.length ? await katalogNachIds(companyId, b.map((z) => z.materialId)) : [];
        const nachId = new Map(artikel.map((m) => [m.id, m]));
        return b
          .filter((z) => nachId.has(z.materialId))
          .map((z) => ({ b: z, m: nachId.get(z.materialId)! }))
          .sort((x, y) => x.m.name.localeCompare(y.m.name, 'de'));
      })
      .then((z) => { if (!weg) setZeilen(z); })
      .catch(() => { if (!weg) setFehler('Der Bestand des Fahrzeugs konnte nicht geladen werden.'); });
    return () => { weg = true; };
  }, [companyId, ort.id, stand]);

  return (
    <Card
      title={`Mein ${ortName(ort)}`}
      hint={darfZurueck
        ? 'Was im Fahrzeug liegt. Was übrig ist, lagern Sie mit „Zurücklagern“ ins Hauptlager zurück — beide Bestände ändern sich in einem Zug.'
        : 'Was im Fahrzeug liegt — nur zum Lesen. Zurück ins Hauptlager bucht das Lager.'}
      buendig
    >
      {fehler ? (
        <div className="px-4 pb-4"><ErrorState message={fehler} /></div>
      ) : zeilen === null ? (
        <div className="px-4 pb-4"><SkeletonList rows={2} /></div>
      ) : zeilen.length === 0 ? (
        <EmptyState>Im Fahrzeug liegt nichts aus dem Lager.</EmptyState>
      ) : (
        <List>
          {zeilen.map(({ b, m }) => (
            <ListRow key={m.id} title={m.name} wert={`${fmtMenge(Number(b.menge))} ${m.unit ?? 'Stk'}`}>
              {darfZurueck && (
                <Button variant="secondary" aria-label={`${m.name} zurücklagern`} onClick={() => setZurueck({ b, m })}>
                  Zurücklagern
                </Button>
              )}
            </ListRow>
          ))}
        </List>
      )}
      {zurueck && (
        <UmlagernDialog
          artikel={zurueck.m}
          orte={orte}
          wahl={[ort]}
          // Der Stand jetzt, nicht der beim Öffnen: nach „veraltet“ fragt der Dialog mit der neuen Zahl.
          bestaende={new Map([[ort.id, Number(zeilen?.find((z) => z.m.id === zurueck.m.id)?.b.menge ?? 0)]])}
          vonVorgabe={ort.id}
          nachVorgabe={HAUPTLAGER}
          nurRueckgabe
          onAbbrechen={() => setZurueck(null)}
          onVeraltet={() => setStand((n) => n + 1)}
          onFertig={(text) => {
            setZurueck(null);
            setStand((n) => n + 1);
            toast.success(text);
          }}
        />
      )}
    </Card>
  );
}
