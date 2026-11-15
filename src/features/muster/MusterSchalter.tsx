import { useState } from 'react';
import Card from '@/components/Card';
import Schalter from '@/components/Schalter';
import { CheckboxField } from '@/components/Field';

/**
 * SCHALTER UND KÄSTCHEN (U6, E3) auf der Musterseite: der Schalter für
 * alles, was sofort wirkt; das Kästchen für die Auswahl in einem Formular,
 * das erst mit „Speichern“ gilt. Hier wird nichts gespeichert.
 */
export default function MusterSchalter() {
  const [meldung, setMeldung] = useState(true);
  const [vorschau, setVorschau] = useState(false);
  const [halbtage, setHalbtage] = useState(true);
  return (
    <Card title="Schalter und Kästchen" hint="Schalter: wirkt beim Tippen (Module, Meldungen, eine Pflicht für den Betrieb, ein Filter der Ansicht). Kästchen: Auswahl in einem Formular, gilt erst mit „Speichern“. Den Zustand tragen Lage, Farbe und das Häkchen im Griff.">
      <div className="space-y-4">
        <div>
          <p className="section-label">Schalter — wirkt sofort</p>
          <Schalter id="muster-schalter-meldung" label="Neue Nachrichten" an={meldung} onChange={setMeldung} />
          <Schalter id="muster-schalter-vorschau" label="Text der Nachricht im Sperrbildschirm zeigen" beschreibung="Gesperrt, solange „Neue Nachrichten“ aus ist." an={vorschau} gesperrt={!meldung} onChange={setVorschau} />
        </div>
        <div className="formular">
          <p className="section-label">Kästchen — Auswahl im Formular</p>
          <CheckboxField id="muster-kaestchen" label="24. und 31. Dezember als halbe Tage rechnen" checked={halbtage} onChange={(e) => setHalbtage(e.target.checked)} />
        </div>
      </div>
    </Card>
  );
}
