import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { decktKvNacht, nachtzeitVon, ueberstundenRegelVon } from '@/lib/lohnregeln';
import Hinweiszeile from '@/components/Hinweiszeile';
import { durchrechnungsWochen } from '@/features/accounting/arbeitszeitGrenzen';

/**
 * NACHTZEIT UND ÜBERSTUNDEN (Testbericht 30.09.2026, Paket 2c: M35 und das
 * Überstundenmodell).
 *
 * Beides je Betrieb, ab Werk wie bisher: Nachtzeit 22–6 Uhr, Überstunden
 * über das Zeitkonto. Ausgewiesen werden Stunden, nie Geld. Am
 * Kollektivvertrag Metallgewerbe 2026 nachgeprüft (18.10.2026,
 * `docs/recherche-fragenkataloge.md`): die Nachtzeit stimmt, und bei der
 * Tagesgrenze teilt die App 50 und 100 % nach dem KV (ab Werk an).
 */
export default function LohnregelnKarte() {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();
  const [nachtVon, setNachtVon] = useState('22:00');
  const [nachtBis, setNachtBis] = useState('06:00');
  const [modell, setModell] = useState<'zeitkonto' | 'tagesgrenze'>('zeitkonto');
  const [grenze, setGrenze] = useState<'tagessoll' | 'zehn'>('tagessoll');
  const [hundert, setHundert] = useState(false);
  const [kvMetall, setKvMetall] = useState(true);
  /** Als Text — das Feld darf beim Tippen kurz leer oder unfertig sein. */
  const [durchrechnung, setDurchrechnung] = useState('17');
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    setNachtVon(company?.nachtVon ?? '22:00');
    setNachtBis(company?.nachtBis ?? '06:00');
    const regel = ueberstundenRegelVon(company);
    setModell(regel.modell);
    setGrenze(regel.grenze);
    setHundert(regel.hundertSonnFeiertag);
    setKvMetall(regel.kvMetall);
    setDurchrechnung(String(durchrechnungsWochen(company?.durchrechnungWochen)));
  }, [company]);

  async function speichern() {
    if (!user) return;
    setFehler(null);
    if (!/^\d{2}:\d{2}$/.test(nachtVon) || !/^\d{2}:\d{2}$/.test(nachtBis) || nachtVon === nachtBis) {
      setFehler('Bitte Beginn und Ende der Nachtzeit angeben — zwei verschiedene Uhrzeiten.');
      return;
    }
    const wochen = Number(durchrechnung);
    if (!/^\d+$/.test(durchrechnung.trim()) || wochen < 17 || wochen > 52) {
      setFehler('Der Durchrechnungszeitraum liegt zwischen 17 Wochen (Gesetz) und 52 Wochen (höchstens laut Kollektivvertrag).');
      return;
    }
    setSpeichert(true);
    try {
      await updateCompany(user.companyId, {
        nachtVon,
        nachtBis,
        ueberstundenModell: modell,
        ueberstundenGrenze: grenze,
        ueberstundenHundertSonnFeiertag: hundert,
        ueberstundenKvMetall: kvMetall,
        durchrechnungWochen: wochen,
      });
      await reloadCompany();
      toast.success('Nachtzeit und Überstunden gespeichert');
    } catch (err) {
      setFehler(grundAus(err, 'Nachtzeit und Überstunden konnten nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <Card
      title="Nachtzeit und Überstunden"
      hint={
        <>
          Der Nachtzuschlag gilt nur für die Stunden in der Nachtzeit, in Rechnung, Lohn-CSV und
          Stundennachweis. Beim Zeitkonto (Gleitzeit) sammeln sich Mehrstunden im Saldo. Bei der
          Tagesgrenze stehen die Stunden über der Grenze eines Tages als Überstunden mit 50 % in
          Lohn-CSV und Stundennachweis; an Tagen ohne Soll zählt jede Stunde. Ausgewiesen werden
          Stunden, nie Beträge. Nach dem Kollektivvertrag Metallgewerbe gilt die Nachtarbeitszulage
          für jede Arbeitsstunde zwischen 22 und 6 Uhr, ohne Mindestdauer (Abschnitt XIV Punkt 5) — so
          rechnet die Vorgabe. Mit „Zuschläge nach dem KV Metallgewerbe“ (ab Werk an) stehen bei
          Arbeitern und Lehrlingen — wer eine Einstufung hat — mit 100 %: ab der dritten Überstunde am
          Tag, Überstunden zwischen 20 und 6 Uhr, ab der 51. Stunde der Woche (nicht bei Gleitzeit), am
          sonst arbeitsfreien Tag ab der 11. Stunde, jede Stunde an Sonn- und Feiertagen und am 24. und
          31.12. jede Überstunde (Abschnitt XIV Punkt 8–11). Wann am Tag die Überstunden lagen, steht in
          keiner Buchung; Stunden zwischen 20 und 6 Uhr gelten zuerst als Überstunden. Was am 24./31.12.
          nach 12 Uhr liegt, steht nur in der eigenen Spalte. Für Überstunden gilt der Zuschlag statt der
          Nachtarbeitszulage: „davon Nacht als Überstunde“ sagt, wie viele Nachtstunden das sind. Für Angestellte gilt ein anderer
          Kollektivvertrag: bei ihnen bleibt es bei 50 % und dem Schalter für Sonn- und Feiertage. Der
          Durchrechnungszeitraum gilt für die Arbeitszeitgrenzen: im
          Schnitt höchstens 48 Std. je Woche, nach dem Gesetz über 17 Wochen (§ 9 Abs 4 AZG); länger,
          bis 52 Wochen, nur wenn der Kollektivvertrag es zulässt.
        </>
      }
    >
      <div className="formular">
      <FormGrid>
        <InputField
          id="nachtVon" label="Nachtzeit von" type="time"
          value={nachtVon} onChange={(e) => setNachtVon(e.target.value)}
        />
        <InputField
          id="nachtBis" label="Nachtzeit bis" type="time"
          value={nachtBis} onChange={(e) => setNachtBis(e.target.value)}
        />
        <SelectField
          id="ueberstundenModell" label="Überstunden"
          value={modell}
          onChange={(e) => setModell(e.target.value as 'zeitkonto' | 'tagesgrenze')}
        >
          <option value="zeitkonto">Zeitkonto (Gleitzeit mit Saldo)</option>
          <option value="tagesgrenze">Tagesgrenze (Überstunden je Tag)</option>
        </SelectField>
        <InputField
          id="durchrechnungWochen" label="Durchrechnung für den Schnitt von 48 Std. (Wochen)"
          type="number" inputMode="numeric" min={17} max={52}
          value={durchrechnung} onChange={(e) => setDurchrechnung(e.target.value)}
        />
        {modell === 'tagesgrenze' && (
          <SelectField
            id="ueberstundenGrenze" label="Überstunden ab"
            value={grenze}
            onChange={(e) => setGrenze(e.target.value as 'tagessoll' | 'zehn')}
          >
            <option value="tagessoll">über dem Tagessoll der Person</option>
            <option value="zehn">über 10 Stunden (bei Gleitzeit)</option>
          </SelectField>
        )}
      </FormGrid>
      {/*
        KÜRZER ALS 22–6 UHR (18.10.2026). Unter dem KV Metallgewerbe steht die
        Zulage für 22 bis 6 Uhr zu, und abweichen darf ein Betrieb nur zu
        Gunsten der Arbeitnehmer. Ein Hinweis, keine Sperre: ein Betrieb mit
        anderem Kollektivvertrag stellt ein, was dort gilt, und schaltet den
        KV unten ab.
      */}
      {kvMetall && !decktKvNacht(nachtzeitVon({ nachtVon, nachtBis })) && (
        <div className="mt-3">
          <Hinweiszeile stufe="warn">
            <b>Kürzer als 22 bis 6 Uhr.</b> Gilt der Kollektivvertrag Metallgewerbe, steht die
            Nachtarbeitszulage für jede Stunde zwischen 22 und 6 Uhr zu (Abschnitt XIV Punkt 5); eine
            kürzere Nachtzeit darf der Betrieb nicht vereinbaren, abweichen nur zugunsten der
            Arbeitnehmer (§ 3 Abs 1 ArbVG).
          </Hinweiszeile>
        </div>
      )}
      {modell === 'tagesgrenze' && (
        <div className="mt-3 flex flex-col gap-2">
          <CheckboxField
            id="ueberstundenKvMetall"
            label="Zuschläge nach dem KV Metallgewerbe (Arbeiter und Lehrlinge)"
            checked={kvMetall}
            onChange={(e) => setKvMetall(e.target.checked)}
          />
          <CheckboxField
            id="ueberstundenHundert"
            label={kvMetall ? 'Arbeit an Sonn- und Feiertagen als Überstunden mit 100 % — für Angestellte' : 'Arbeit an Sonn- und Feiertagen als Überstunden mit 100 %'}
            checked={hundert}
            onChange={(e) => setHundert(e.target.checked)}
          />
        </div>
      )}
      {fehler && <p role="alert" className="mt-2 text-sm text-danger">{fehler}</p>}
      <div className="fuss-aktionen mt-4">
        <Button type="button" loading={speichert} onClick={speichern}>
          Speichern
        </Button>
      </div>
      </div>
    </Card>
  );
}
