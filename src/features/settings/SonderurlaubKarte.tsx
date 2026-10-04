import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import { ANLAESSE, KUERZUNG_AB_VORGABE } from '@shared/freistellung';
import { leseZahl } from '@/lib/zahl';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { InputField, FormGrid } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';

/** Nur die Anlässe mit fester Tageszahl — „die notwendige Zeit" stellt niemand ein. */
const MIT_TAGEN = ANLAESSE.filter((a) => a.tage !== null);

/**
 * SONDERURLAUB IM BETRIEB (Plan 10.3): die Tage je Anlass und ab wann die
 * App beim unbezahlten Urlaub eine Kürzung des Anspruchs vorschlägt.
 *
 * Ab Werk die Tage aus dem Kollektivvertrag (Metallgewerbe und Angestellte
 * im Gewerbe gleich). Gespeichert wird nur, was davon abweicht — so gilt
 * eine spätere Berichtigung der Vorbelegung für alle, die nichts geändert
 * haben.
 */
export default function SonderurlaubKarte() {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();
  const [tage, setTage] = useState<Record<string, string>>({});
  const [ab, setAb] = useState(String(KUERZUNG_AB_VORGABE));
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    const abweichend = company?.freistellungAnlaesse ?? {};
    setTage(Object.fromEntries(MIT_TAGEN.map((a) => [a.schluessel, String(abweichend[a.schluessel] ?? a.tage)])));
    setAb(String(company?.kuerzungAbTagen ?? KUERZUNG_AB_VORGABE));
  }, [company]);

  async function speichern() {
    if (!user) return;
    setFehler(null);
    const abweichend: Record<string, number> = {};
    for (const a of MIT_TAGEN) {
      const g = leseZahl(tage[a.schluessel] ?? '');
      if (g.fehler || g.wert === null || !Number.isInteger(g.wert) || g.wert < 1 || g.wert > 30) {
        setFehler(`„${a.name}“: bitte ganze Arbeitstage zwischen 1 und 30.`);
        return;
      }
      if (g.wert !== a.tage) abweichend[a.schluessel] = g.wert;
    }
    const schwelle = leseZahl(ab);
    if (schwelle.fehler || schwelle.wert === null || !Number.isInteger(schwelle.wert) || schwelle.wert < 1 || schwelle.wert > 366) {
      setFehler('Die Kürzung ab: bitte ganze Kalendertage zwischen 1 und 366.');
      return;
    }
    setSpeichert(true);
    try {
      await updateCompany(user.companyId, {
        freistellungAnlaesse: Object.keys(abweichend).length > 0 ? abweichend : null,
        kuerzungAbTagen: schwelle.wert,
      });
      await reloadCompany();
      toast.success('Sonderurlaub gespeichert');
    } catch (err) {
      setFehler(grundAus(err, 'Die Einstellungen zum Sonderurlaub konnten nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <Card
      title="Sonderurlaub"
      hint="Die Tage der Dienstverhinderung je Anlass, ab Werk nach dem Kollektivvertrag (Arbeiter und Angestellte gleich). Vorladung und Musterung bekommen die notwendige Zeit. Beim unbezahlten Urlaub schlägt die App ab der eingestellten Dauer am Stück vor, den Urlaubsanspruch aliquot zu kürzen — übernommen wird erst mit der Entscheidung."
    >
      <FormGrid>
        {MIT_TAGEN.map((a) => (
          <InputField
            key={a.schluessel}
            id={`anlass-${a.schluessel}`}
            label={`${a.name} (Arbeitstage)`}
            inputMode="numeric"
            value={tage[a.schluessel] ?? ''}
            onChange={(e) => setTage({ ...tage, [a.schluessel]: e.target.value })}
          />
        ))}
        <InputField
          id="kuerzungAb"
          label="Kürzung vorschlagen ab (Kalendertage unbezahlt am Stück)"
          inputMode="numeric"
          value={ab}
          onChange={(e) => setAb(e.target.value)}
        />
      </FormGrid>
      {fehler && <div className="mt-3"><ErrorState message={fehler} /></div>}
      <div className="mt-4">
        <Button type="button" loading={speichert} onClick={() => void speichern()}>Speichern</Button>
      </div>
    </Card>
  );
}
