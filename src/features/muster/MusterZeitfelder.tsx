import { useState } from 'react';
import Card from '@/components/Card';
import { ErrorState } from '@/components/States';
import ZeitfeldEingaben from '@/features/time/ZeitfeldEingaben';
import ZeitfeldAngaben from '@/features/time/ZeitfeldAngaben';
import type { Zeitfeld, ZeitfeldAnzeige } from '@/lib/zeitfelder';

/**
 * DIE FREIEN ZEITFELDER (M06b) auf der Musterseite: die Felder der
 * Buchungsmaske je Typ — Text, Zahl mit Einheit, Ja/Nein, Auswahl mit einer
 * nicht mehr wählbaren Option, Datum —, eine Pflicht und eine Meldung, wie
 * sie die Prüfung schreibt; darunter die Angaben einer Buchung als Text mit
 * „Nachpflege“ und „fehlt“. Nur Beispieldaten, nichts wird gespeichert.
 */
const WIEN = '00000000-0000-4000-8000-00000000f001';
const LINZ = '00000000-0000-4000-8000-00000000f002';
const alle = ['Mitarbeiter'];
const feld = (id: string, name: string, x: Partial<Zeitfeld>, reihenfolge: number): Zeitfeld => ({
  id, name, typ: 'text', regeln: {}, staende: ['Anwesend'], rollen: alle, pflicht: 'nie', reihenfolge, ...x,
});

const FELDER: Zeitfeld[] = [
  feld('m-kostenstelle', 'Kostenstelle', {
    typ: 'auswahl', pflicht: 'beim_buchen',
    regeln: { optionen: [{ id: WIEN, text: 'Wien', aktiv: true }, { id: LINZ, text: 'Linz', aktiv: false }] },
  }, 1),
  feld('m-km', 'Kilometer Firmenauto', { typ: 'zahl', regeln: { min: 0, stellen: 1, einheit: 'km' } }, 2),
  feld('m-material', 'Material vom Kunden gestellt', { typ: 'janein' }, 3),
  feld('m-hv', 'Auftragsnummer Hausverwaltung', { typ: 'text', pflicht: 'nur_buero', regeln: { laenge: 30 } }, 4),
  feld('m-abnahme', 'Datum der Abnahme', { typ: 'datum' }, 5),
];

const ANZEIGE: ZeitfeldAnzeige[] = FELDER.map((f) => ({
  id: f.id, name: f.name, typ: f.typ, regeln: f.regeln, reihenfolge: f.reihenfolge, aktiv: true,
}));

export default function MusterZeitfelder() {
  // Die gespeicherte Buchung trägt „Linz“ — die Option ist inzwischen nicht mehr wählbar und bleibt an ihr stehen.
  const [roh, setRoh] = useState<Record<string, string>>({ 'm-kostenstelle': LINZ, 'm-km': '12,5', 'm-material': 'ja' });
  return (
    <Card title="Freie Zeitfelder" hint="Eigene Angaben eines Betriebs zur Zeitbuchung: in der Maske je Typ, mit Pflicht; in Liste und Monatsansicht als Text mit „Nachpflege“ und „fehlt“.">
      <div className="formular space-y-4">
        <ZeitfeldEingaben
          felder={FELDER}
          roh={roh}
          alteWerte={{ 'm-kostenstelle': LINZ }}
          onChange={(id, w) => setRoh((r) => ({ ...r, [id]: w }))}
        />
        <ErrorState message="Kilometer Firmenauto: Höchstens 1 Nachkommastellen" />
        <div className="border-t border-line pt-3">
          <p className="section-label">In Liste und Monatsansicht</p>
          <ZeitfeldAngaben
            definitionen={ANZEIGE}
            werte={{ 'm-kostenstelle': WIEN, 'm-km': 12.5, 'm-material': true }}
            offen={{ fehlt: ['Auftragsnummer Hausverwaltung'], nachpflege: [] }}
          />
          <ZeitfeldAngaben
            definitionen={ANZEIGE}
            werte={{ 'm-km': 4 }}
            offen={{ fehlt: [], nachpflege: ['Kostenstelle'] }}
          />
        </div>
      </div>
    </Card>
  );
}
