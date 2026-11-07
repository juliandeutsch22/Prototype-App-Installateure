import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import { leseZahl } from '@/lib/zahl';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { FormGrid } from '@/components/Field';
import ZahlFeld from '@/components/ZahlFeld';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';

/** Wie die Datenbank (`companies_preissprung_schwelle`, `companies_katalog_veraltet_tage`). */
const SCHWELLE_HOECHSTENS = 1000;
const TAGE_HOECHSTENS = 3650;
const SCHWELLE_VORGABE = 10;
const VERALTET_VORGABE = 180;

/**
 * KATALOG UND PREISVERGLEICH (M03a, E03/E04) — zwei Zahlen der Spitze:
 *
 *  - ab welcher Änderung der Bericht einer Katalogübernahme einen
 *    Preissprung nennt (Vorgabe 10 %);
 *  - ab welchem Alter ein Preisstand nicht mehr für „günstigster“ taugt
 *    (Vorgabe 180 Tage) — ein Großhändler, dessen Katalog seit einem Jahr
 *    nicht kam, ist nicht billiger, nur alt.
 *
 * Bei den Sätzen, weil dort Aufschlag und Verkaufspreise stehen, die aus
 * denselben Einkaufspreisen folgen. Eigener Speichern-Knopf: die Werte
 * stehen in eigenen Spalten, nicht in den Sätzen. Schreiben darf die Spitze
 * (`companies_aendern`); die Seite zeigt sie nur ihr.
 */
export default function KatalogEinstellungenKarte() {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();
  const [schwelle, setSchwelle] = useState('');
  const [tage, setTage] = useState('');
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    setSchwelle(String(company?.preissprungSchwelleProzent ?? SCHWELLE_VORGABE).replace('.', ','));
    setTage(String(company?.katalogVeraltetTage ?? VERALTET_VORGABE));
  }, [company]);

  async function speichern() {
    if (!user) return;
    setFehler(null);
    const s = leseZahl(schwelle);
    const t = leseZahl(tage);
    if (s.fehler || s.wert === null || s.wert <= 0 || s.wert > SCHWELLE_HOECHSTENS) {
      setFehler(`Preissprung: bitte eine Zahl über 0 und höchstens ${SCHWELLE_HOECHSTENS} %.`);
      return;
    }
    if (t.fehler || t.wert === null || !Number.isInteger(t.wert) || t.wert < 1 || t.wert > TAGE_HOECHSTENS) {
      setFehler(`Preisstand: bitte ganze Tage zwischen 1 und ${TAGE_HOECHSTENS}.`);
      return;
    }
    setSpeichert(true);
    try {
      await updateCompany(user.companyId, {
        preissprungSchwelleProzent: Math.round(s.wert * 100) / 100,
        katalogVeraltetTage: t.wert,
      });
      await reloadCompany();
      toast.success('Katalog-Einstellungen gespeichert');
    } catch (err) {
      setFehler(grundAus(err, 'Die Einstellungen konnten nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <Card
      title="Katalog und Preisvergleich"
      hint={
        <>
          <strong>Preissprung:</strong> Ändert sich der Einkaufspreis eines Großhändlers gegen seinen
          vorigen um mehr als diesen Anteil (auf oder ab), nennt der Bericht der Katalogübernahme den
          Artikel mit altem und neuem Preis. Ohne Einkaufspreis zählt der Listenpreis.
          <br />
          <br />
          <strong>Preisstand:</strong> Als „günstigster“ wird ein Großhändler nur gekennzeichnet, wenn
          kein Preis im Vergleich älter ist als diese Zahl an Tagen. Ein alter Preis ist keine
          Auskunft darüber, was der Artikel heute kostet.
        </>
      }
    >
      <div className="formular flex flex-col gap-4">
        <FormGrid>
          <ZahlFeld
            id="preissprungSchwelle"
            label="Preissprung ab (%)"
            value={schwelle}
            onChange={setSchwelle}
          />
          <ZahlFeld
            id="katalogVeraltetTage"
            label="Preisstand gilt höchstens (Tage)"
            value={tage}
            onChange={setTage}
          />
        </FormGrid>
        {fehler && <ErrorState message={fehler} />}
        <div className="fuss-aktionen">
          <Button type="button" loading={speichert} onClick={() => void speichern()}>
            Katalog-Einstellungen speichern
          </Button>
        </div>
      </div>
    </Card>
  );
}
