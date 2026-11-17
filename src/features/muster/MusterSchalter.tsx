import { useState } from 'react';
import Card from '@/components/Card';
import Schalter from '@/components/Schalter';
import { CheckboxField } from '@/components/Field';

/**
 * SCHALTER UND KÄSTCHEN auf der Musterseite (seit E95, 17.11.2026, ein
 * Muster für die ganze App): der Schalter für jedes Ein/Aus einer
 * Einstellung oder Eigenschaft — ob es sofort wirkt oder mit „Speichern“;
 * das Kästchen nur für Auswahl aus einer Liste, Abhaken und Bestätigung.
 * Hier wird nichts gespeichert.
 */
export default function MusterSchalter() {
  const [meldung, setMeldung] = useState(true);
  const [vorschau, setVorschau] = useState(false);
  const [halbtage, setHalbtage] = useState(true);
  const [tage, setTage] = useState<string[]>(['Mo', 'Di']);
  return (
    <Card title="Schalter und Kästchen" hint="Schalter: jedes Ein/Aus einer Einstellung oder Eigenschaft (Module, Meldungen, Aktiv, Darf …, ein Filter der Ansicht) — ob es sofort wirkt oder erst mit „Speichern“. Kästchen: nur für Auswahl aus einer Liste (Personen, Wochentage), Abhaken und eine Bestätigung. Den Zustand des Schalters tragen Lage, Farbe und das Häkchen im Griff.">
      <div className="space-y-4">
        <div>
          <p className="section-label">Schalter — wirkt sofort</p>
          <Schalter id="muster-schalter-meldung" label="Neue Nachrichten" an={meldung} onChange={setMeldung} />
          <Schalter id="muster-schalter-vorschau" label="Text der Nachricht im Sperrbildschirm zeigen" beschreibung="Gesperrt, solange „Neue Nachrichten“ aus ist." an={vorschau} gesperrt={!meldung} onChange={setVorschau} />
        </div>
        <div className="formular">
          <p className="section-label">Schalter — im Formular, gilt mit „Speichern“</p>
          <Schalter id="muster-schalter-halbtage" label="24. und 31. Dezember als halbe Tage rechnen" an={halbtage} onChange={setHalbtage} />
        </div>
        <div className="formular">
          <p className="section-label">Kästchen — Auswahl aus einer Liste</p>
          {['Mo', 'Di', 'Mi'].map((t) => (
            <CheckboxField key={t} id={`muster-kaestchen-${t}`} label={t} checked={tage.includes(t)} onChange={(e) => setTage(e.target.checked ? [...tage, t] : tage.filter((x) => x !== t))} />
          ))}
        </div>
      </div>
    </Card>
  );
}
