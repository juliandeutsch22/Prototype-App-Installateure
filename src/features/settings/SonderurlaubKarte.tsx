import { useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { useInhaltUebernehmen } from '@/lib/useInhaltUebernehmen';
import { updateCompany } from '@/lib/db/company';
import { ANLAESSE, KUERZUNG_AB_VORGABE } from '@shared/freistellung';
import { leseZahl } from '@/lib/zahl';
import Card from '@/components/Card';
import Speicherleiste from '@/components/Speicherleiste';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import Schalter from '@/components/Schalter';

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
  /** Arztbesuch (E35): Bestätigung verlangen — ab Werk ja. */
  const [nachweis, setNachweis] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Nur, wenn sich DIESE Werte im Betrieb geändert haben (P10) — speichert eine andere Karte, bleibt das Getippte.
  const gespeichert = {
    anlaesse: company?.freistellungAnlaesse ?? {},
    ab: company?.kuerzungAbTagen ?? KUERZUNG_AB_VORGABE,
    nachweis: company?.arztbesuchNachweis !== false,
  };
  /** Der gespeicherte Stand, wie ihn die Felder zeigen — für Laden, Verwerfen und den Vergleich (U1). */
  const alsEingabe = (w: typeof gespeichert) => {
    const abweichend: Record<string, number | undefined> = w.anlaesse;
    return {
      tage: Object.fromEntries(MIT_TAGEN.map((a) => [a.schluessel, String(abweichend[a.schluessel] ?? a.tage)])),
      ab: String(w.ab),
      nachweis: w.nachweis,
    };
  };
  const uebernehmen = (w: typeof gespeichert) => {
    const e = alsEingabe(w);
    setTage(e.tage);
    setAb(e.ab);
    setNachweis(e.nachweis);
  };
  useInhaltUebernehmen(gespeichert, uebernehmen);
  const geaendert = JSON.stringify({ tage, ab, nachweis }) !== JSON.stringify(alsEingabe(gespeichert));

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
        arztbesuchNachweis: nachweis,
      });
      await reloadCompany();
      toast.success('Sonderurlaub und Arztbesuch gespeichert');
    } catch (err) {
      setFehler(grundAus(err, 'Die Einstellungen zum Sonderurlaub konnten nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <Card
      title="Sonderurlaub und Arztbesuch"
      hint="Die Tage der Dienstverhinderung je Anlass, ab Werk nach dem Kollektivvertrag (Arbeiter und Angestellte gleich). Vorladung, Musterung und Arztbesuch bekommen die notwendige Zeit. Beim unbezahlten Urlaub schlägt die App ab der eingestellten Dauer am Stück vor, den Urlaubsanspruch aliquot zu kürzen — übernommen wird erst mit der Entscheidung. Verlangt der Betrieb für Arztbesuche eine Bestätigung, bestätigt das Büro einen Arztbesuch erst, wenn es sie gesehen hat — als Datei oder auf Papier. Sonst ist die Bestätigung freiwillig."
    >
      {/*
        EINSPALTIG (Linie „Lot“, Regel 9): die Anlässe haben lange Namen, die
        in zwei Spalten auf drei Zeilen brachen und die Felder gegeneinander
        verschoben.
      */}
      <div className="formular flex flex-col gap-4">
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
        <Schalter
          id="arztbesuchNachweis"
          label="Für Arztbesuche eine Bestätigung verlangen"
          an={nachweis}
          onChange={(wert) => setNachweis(wert)}
        />
        <InputField
          id="kuerzungAb"
          label="Kürzung vorschlagen ab (Kalendertage unbezahlt am Stück)"
          inputMode="numeric"
          value={ab}
          onChange={(e) => setAb(e.target.value)}
        />
        {fehler && <ErrorState message={fehler} />}
        <Speicherleiste geaendert={geaendert} speichert={speichert} onVerwerfen={() => { setFehler(null); uebernehmen(gespeichert); }} onSpeichern={() => void speichern()} />
      </div>
    </Card>
  );
}
