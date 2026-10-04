import { useEffect, useState } from 'react';
import type { AppUser, UrlaubsanspruchAnpassung } from '@/types';
import { anpassungEntfernen, anspruchAnpassen, listAnpassungen } from '@/lib/db/urlaubsanspruch';
import { localDateStr, todayStr, urlaubsJahrVon, vorzeichenTage } from '@/lib/time';
import Card from '@/components/Card';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField, FormGrid } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { datumAT } from '@/lib/datum';
import { grundAus } from '@/lib/fehlerGrund';
import { leseZahl } from '@/lib/zahl';

/**
 * „Anspruch anpassen" in der Benutzerakte (Plan 10.3, Entscheidung 6).
 *
 * Für Zeiten, in denen kein oder weniger Urlaub entsteht: gesetzliche
 * Elternkarenz, Präsenz- und Zivildienst, ein längerer unbezahlter Urlaub.
 * Die Anpassung gilt für EIN Urlaubsjahr — anders als der Jahresanspruch in
 * den Stammdaten, der für jedes Jahr gilt.
 *
 * Die Akte sieht nur die Geschäftsführung und die Administration; genau sie
 * dürfen anpassen (die Datenbank prüft es noch einmal).
 */
export default function UrlaubsanspruchKarte({
  person,
  jahresbeginn,
}: {
  person: AppUser;
  /** 'MM-DD' — wann das Urlaubsjahr des Betriebs beginnt. */
  jahresbeginn: string;
}) {
  const toast = useToast();
  const laufendesJahr = urlaubsJahrVon(todayStr(), jahresbeginn);
  const [liste, setListe] = useState<UrlaubsanspruchAnpassung[] | 'laedt' | 'fehler'>('laedt');
  const [versuch, setVersuch] = useState(0);
  const [offen, setOffen] = useState(false);
  const [jahr, setJahr] = useState(String(laufendesJahr));
  const [tage, setTage] = useState('');
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [entfernen, setEntfernen] = useState<UrlaubsanspruchAnpassung | null>(null);
  const [entfernGrund, setEntfernGrund] = useState('');

  useEffect(() => {
    let weg = false;
    setListe('laedt');
    listAnpassungen(person.companyId, person.uid)
      .then((rows) => { if (!weg) setListe(rows); })
      .catch(() => { if (!weg) setListe('fehler'); });
    return () => { weg = true; };
  }, [person.companyId, person.uid, versuch]);

  async function speichern() {
    const j = Number(jahr);
    const gelesen = leseZahl(tage, { negativ: true });
    if (gelesen.fehler) {
      setFehler(gelesen.fehler);
      return;
    }
    const t = gelesen.wert ?? 0;
    if (!Number.isInteger(j) || j < 2000 || j > 2100) {
      setFehler('Bitte ein Urlaubsjahr angeben, etwa 2026.');
      return;
    }
    if (t === 0) {
      setFehler('Bitte die Tage angeben — weniger Anspruch mit Minus, etwa −6,25.');
      return;
    }
    if (grund.trim().length < 3) {
      setFehler('Bitte einen Grund angeben, etwa „Elternkarenz 01.03.–31.08.“.');
      return;
    }
    setSpeichert(true);
    setFehler(null);
    try {
      await anspruchAnpassen({ userId: person.uid, urlaubsjahr: j, tage: Math.round(t * 100) / 100, grund: grund.trim() });
      toast.success('Anspruch angepasst');
      setOffen(false);
      setTage('');
      setGrund('');
      setVersuch((v) => v + 1);
    } catch (e) {
      setFehler(grundAus(e, 'Die Anpassung konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  async function entfernenBestaetigt() {
    if (!entfernen) return;
    if (entfernGrund.trim().length < 3) {
      // Geworfen, damit der Dialog offen bleibt und es selbst sagt.
      throw new Error('Bitte einen Grund angeben — mindestens drei Zeichen.');
    }
    await anpassungEntfernen(entfernen.id, entfernGrund.trim());
    setEntfernen(null);
    setEntfernGrund('');
    toast.success('Anpassung entfernt');
    setVersuch((v) => v + 1);
  }

  return (
    <Card
      title="Urlaubsanspruch"
      hint="Für Zeiten, in denen kein oder weniger Urlaub entsteht: gesetzliche Elternkarenz, Präsenz- und Zivildienst, ein längerer unbezahlter Urlaub. Eine Anpassung gilt für ein Urlaubsjahr; Übertrag und Verjährung rechnen mit dem angepassten Anspruch. Aliquot gekürzt wird so: Jahresanspruch × Tage ohne Anspruch ÷ Tage des Urlaubsjahres — bei 25 Tagen und drei Monaten etwa 6,25."
    >
      {liste === 'laedt' ? (
        <SkeletonList rows={1} />
      ) : liste === 'fehler' ? (
        <ErrorState
          message="Die Anpassungen konnten nicht geladen werden."
          onRetry={() => setVersuch((v) => v + 1)}
        />
      ) : liste.length === 0 ? (
        <p className="text-sm text-ink-muted">Keine Anpassung — es gilt der Jahresanspruch aus den Stammdaten.</p>
      ) : (
        <List>
          {liste.map((a) => (
            <ListRow
              key={a.id}
              title={`Urlaubsjahr ${a.urlaubsjahr}: ${vorzeichenTage(a.tage)}`}
              subtitle={`${a.grund}${a.angelegtVonName ? ` · ${a.angelegtVonName}` : ''}${a.createdAt ? `, ${datumAT(localDateStr(new Date(a.createdAt)))}` : ''}`}
            >
              <Button variant="ghost" onClick={() => { setEntfernGrund(''); setEntfernen(a); }}>
                Entfernen
              </Button>
            </ListRow>
          ))}
        </List>
      )}

      {offen ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <FormGrid>
            <InputField
              id="anp-jahr" label="Urlaubsjahr" inputMode="numeric" pflicht
              value={jahr} onChange={(e) => setJahr(e.target.value)}
            />
            <InputField
              id="anp-tage" label="Tage (weniger mit Minus)" inputMode="decimal" pflicht
              placeholder="−6,25" value={tage} onChange={(e) => setTage(e.target.value)}
            />
          </FormGrid>
          <InputField
            id="anp-grund" label="Grund" pflicht
            placeholder="etwa: Elternkarenz 01.03.–31.08."
            value={grund} onChange={(e) => setGrund(e.target.value)}
          />
          {fehler && <ErrorState message={fehler} />}
          <div className="flex flex-wrap gap-3">
            <Button loading={speichert} onClick={() => void speichern()}>Anpassung speichern</Button>
            <Button variant="ghost" onClick={() => { setOffen(false); setFehler(null); }}>Abbrechen</Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Button variant="secondary" onClick={() => setOffen(true)}>Anspruch anpassen</Button>
        </div>
      )}

      <ConfirmDialog
        open={!!entfernen}
        title="Anpassung entfernen?"
        message={entfernen ? `Urlaubsjahr ${entfernen.urlaubsjahr}: ${vorzeichenTage(entfernen.tage)} — danach gilt wieder der volle Anspruch dieses Jahres. Die Anpassung bleibt mit dem Grund in der Datenauskunft.` : undefined}
        confirmLabel="Entfernen"
        onConfirm={entfernenBestaetigt}
        onCancel={() => setEntfernen(null)}
      >
        <InputField
          id="anp-entfernen-grund" label="Grund" pflicht
          value={entfernGrund} onChange={(e) => setEntfernGrund(e.target.value)}
        />
      </ConfirmDialog>
    </Card>
  );
}
