import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { decktKvNacht, nachtzeitVon, ueberstundenRegelVon, VOLLZEIT_TAG_HOECHSTENS } from '@/lib/lohnregeln';
import { leseZahl } from '@/lib/zahl';
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
/** Die Wochentage, Montag zuerst — Schlüssel wie `Date.getDay()`. */
const WOCHENTAGE: [string, string][] = [
  ['1', 'Montag'], ['2', 'Dienstag'], ['3', 'Mittwoch'], ['4', 'Donnerstag'],
  ['5', 'Freitag'], ['6', 'Samstag'], ['0', 'Sonntag'],
];

export default function LohnregelnKarte() {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();
  const [nachtVon, setNachtVon] = useState('22:00');
  const [nachtBis, setNachtBis] = useState('06:00');
  const [modell, setModell] = useState<'zeitkonto' | 'tagesgrenze'>('zeitkonto');
  const [grenze, setGrenze] = useState<'tagessoll' | 'zehn'>('tagessoll');
  const [hundert, setHundert] = useState(false);
  const [kvMetall, setKvMetall] = useState(true);
  /** Als Text wie die Durchrechnung — „38,5“ mit Komma. */
  const [vollzeit, setVollzeit] = useState('38,5');
  /** Als Text — das Feld darf beim Tippen kurz leer oder unfertig sein. */
  const [durchrechnung, setDurchrechnung] = useState('17');
  /*
    DIE VOLLZEIT JE WOCHENTAG (A6, 24.10.2026) — nur wenn sie ungleich
    verteilt ist; sonst gilt ein Fünftel der Woche je Tag. Als Text je Tag,
    Montag zuerst, wie man eine Woche liest.
  */
  const [verteilt, setVerteilt] = useState(false);
  const [tage, setTage] = useState<Record<string, string>>({});
  /** § 11 Abs 3 KJBG: der KV lässt für Jugendliche eine andere Verteilung zu (A9, 24.10.2026). Ab Werk aus. */
  const [kjbgKv, setKjbgKv] = useState(false);
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
    setVollzeit(String(regel.vollzeitStunden).replace('.', ','));
    setVerteilt(regel.vollzeitVerteilung !== null);
    setTage(Object.fromEntries(WOCHENTAGE.map(([tag]) => [
      tag, regel.vollzeitVerteilung?.[tag] ? String(regel.vollzeitVerteilung[tag]).replace('.', ',') : '',
    ])));
    setDurchrechnung(String(durchrechnungsWochen(company?.durchrechnungWochen)));
    setKjbgKv(company?.kjbgVerteilungKv === true);
  }, [company]);

  const vollzeitSichtbar = modell === 'tagesgrenze' && grenze === 'tagessoll';

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
    // Ausgeblendet bleibt der gespeicherte Wert, wie er ist — eine Prüfung ohne sichtbares Feld verwirrte nur.
    const vollzeitStunden = vollzeitSichtbar ? leseZahl(vollzeit).wert : undefined;
    if (vollzeitStunden !== undefined && (vollzeitStunden === null || vollzeitStunden <= 0 || vollzeitStunden > 40)) {
      setFehler('Die Vollzeit liegt über 0 und höchstens bei 40 Stunden je Woche (§ 3 AZG).');
      return;
    }
    let verteilung: Record<string, number> | null = null;
    if (vollzeitStunden != null && verteilt) {
      verteilung = {};
      let summe = 0;
      for (const [tag, name] of WOCHENTAGE) {
        const roh = (tage[tag] ?? '').trim();
        const h = roh === '' ? 0 : leseZahl(roh).wert;
        if (h === null || h < 0 || h > VOLLZEIT_TAG_HOECHSTENS) {
          setFehler(`${name}: zwischen 0 und ${VOLLZEIT_TAG_HOECHSTENS} Stunden (§ 4 AZG).`);
          return;
        }
        if (h > 0) verteilung[tag] = h;
        summe += h;
      }
      if (Math.abs(summe - vollzeitStunden) >= 0.01) {
        setFehler(`Die Tage ergeben ${String(Math.round(summe * 100) / 100).replace('.', ',')} Stunden — sie müssen die Vollzeit je Woche ergeben (${String(vollzeitStunden).replace('.', ',')}).`);
        return;
      }
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
        kjbgVerteilungKv: kjbgKv,
        ...(vollzeitStunden != null ? { vollzeitWochenstunden: vollzeitStunden, vollzeitVerteilung: verteilung } : {}),
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
          Kollektivvertrag: bei ihnen bleibt es bei 50 % und dem Schalter für Sonn- und Feiertage. Wer
          weniger als die Vollzeit vereinbart hat, leistet über dem eigenen Soll zuerst Mehrarbeit (§ 19d
          AZG): bis zur Vollzeit eines Tages und der Woche. Die Vollzeit eines Tages ist ein Fünftel der
          Woche; ist sie im Betrieb ungleich verteilt (etwa vier lange Tage und ein kurzer Freitag), gilt
          die Verteilung, die hier je Wochentag steht — an einem Tag ohne Vollzeit ist dann nichts
          Mehrarbeit. Sie steht als
          „Mehrarbeit Teilzeit“ eigens in Lohn-CSV und Stundennachweis, nicht bei den Überstunden — sie
          trägt 25 % oder nichts, wenn sie im Quartal 1:1 ausgeglichen wird; das entscheidet die
          Lohnverrechnung. Erst darüber beginnen die Überstunden. Der
          Durchrechnungszeitraum gilt für die Arbeitszeitgrenzen: im
          Schnitt höchstens 48 Std. je Woche, nach dem Gesetz über 17 Wochen (§ 9 Abs 4 AZG); länger,
          bis 52 Wochen, nur wenn der Kollektivvertrag es zulässt. Jugendliche dürfen an einem Tag bis 9
          Std. arbeiten, wenn ihre Woche ungleich verteilt ist und die kürzeren Tage an der
          Wochenfreizeit liegen — am Anfang oder Ende der Arbeitswoche (§ 11 Abs 2 KJBG). Lässt der
          Kollektivvertrag eine andere Verteilung zu (Abs 3), gilt das unabhängig von der Lage; dann
          den Haken setzen.
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
        {vollzeitSichtbar && (
          <InputField
            id="vollzeitWochenstunden" label="Vollzeit je Woche (Std.)"
            inputMode="decimal"
            value={vollzeit} onChange={(e) => setVollzeit(e.target.value)}
          />
        )}
      </FormGrid>
      {vollzeitSichtbar && (
        <div className="mt-3 flex flex-col gap-2">
          <CheckboxField
            id="vollzeitVerteilt"
            label="Vollzeit ungleich auf die Tage verteilt"
            checked={verteilt}
            onChange={(e) => setVerteilt(e.target.checked)}
          />
          {verteilt && (
            <FormGrid>
              {WOCHENTAGE.map(([tag, name]) => (
                <InputField
                  key={tag} id={`vollzeitTag${tag}`} label={`${name} (Std.)`}
                  inputMode="decimal"
                  value={tage[tag] ?? ''} onChange={(e) => setTage((alt) => ({ ...alt, [tag]: e.target.value }))}
                />
              ))}
            </FormGrid>
          )}
        </div>
      )}
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
      <div className="mt-3">
        <CheckboxField
          id="kjbgVerteilungKv"
          label="Kollektivvertrag lässt für Jugendliche eine andere Verteilung der Arbeitszeit zu (§ 11 Abs 3 KJBG)"
          checked={kjbgKv}
          onChange={(e) => setKjbgKv(e.target.checked)}
        />
      </div>
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
