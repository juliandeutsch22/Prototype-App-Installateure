import { useState } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import RowMenu from '@/components/RowMenu';
import BottomSheet from '@/components/BottomSheet';
import Fensteraktionen from '@/components/Fensteraktionen';
import NeuFormular from '@/components/NeuFormular';
import Speicherleiste from '@/components/Speicherleiste';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { useAmHandy } from '@/lib/breiten';
import { useSpeicherstand } from '@/lib/speicherstand';

/**
 * DIE BEDIENREGELN DER DURCHSICHT (15.11.2026, U1–U4) auf der Musterseite:
 * die drei Muster der Hauptaktion, „Neu …“ als Blatt und die Knöpfe eines
 * Fensters — jeweils mit dem echten Baustein, den die Seiten nehmen.
 *
 * Muster 1 (Liste) zeigt die Musterseite selbst: „Seitenfenster öffnen“ ist
 * ihre Hauptaktion, am Handy kompakt rechts unten.
 */
export default function MusterBedienung() {
  const toast = useToast();
  const amHandy = useAmHandy();
  const [name, setName] = useState('Familie Huber');
  const [gespeicherterName, setGespeicherterName] = useState('Familie Huber');
  const [speichert, setSpeichert] = useState(false);
  const geaendert = name !== gespeicherterName;
  const stand = useSpeicherstand(geaendert);
  const [fenster, setFenster] = useState(false);
  const [neu, setNeu] = useState(false);

  function speichern() {
    setSpeichert(true);
    // Hier wird nichts gespeichert; die Bestätigung spielt die Musterseite nach.
    window.setTimeout(() => {
      setGespeicherterName(name);
      setSpeichert(false);
      stand.bestaetigen();
      toast.success('Gespeichert (Muster).');
    }, 700);
  }

  return (
    <>
      <Card
        title="Hauptaktion: drei Muster"
        hint="Liste: eine kompakte Aktion rechts unten (diese Seite: „Seitenfenster öffnen“). Akte: eine kompakte Aktion, alles Weitere im ⋯ — der häufige Nebenweg steht ab dem Tablet links daneben, am Handy im ⋯. Formular und Einstellung: die Speicherleiste, erst bei einer Änderung."
      >
        <div className="space-y-6">
          <div>
            <p className="section-label">Akte</p>
            {/* Dieselbe Ordnung wie `AktenKopf`: Nebenweg (ab Tablet) · ⋯ · Hauptaktion. */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!amHandy && <Button variant="secondary" onClick={() => toast.info('Bearbeiten (Muster).')}>Bearbeiten</Button>}
              <RowMenu
                about="Muster-Akte"
                items={[
                  ...(amHandy ? [{ label: 'Bearbeiten', onSelect: () => toast.info('Bearbeiten (Muster).') }] : []),
                  { label: 'Stundennachweis', onSelect: () => toast.info('Stundennachweis (Muster).') },
                  { label: 'Abschließen', onSelect: () => toast.info('Abschließen (Muster).') },
                ]}
              />
              <Button onClick={() => toast.info('Einsatz planen (Muster).')}>Einsatz planen</Button>
            </div>
          </div>
          <form
            className="formular space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              speichern();
            }}
          >
            <p className="section-label">Formular und Einstellung</p>
            <InputField id="muster-speicherleiste" label="Name (ändern, dann erscheint die Leiste)" value={name} onChange={(e) => setName(e.target.value)} />
            <Speicherleiste
              geaendert={geaendert}
              speichert={speichert}
              gespeichert={stand.gespeichert}
              onVerwerfen={() => setName(gespeicherterName)}
            />
          </form>
        </div>
      </Card>

      <Card
        title="Neu und Fenster"
        hint="„Neu …“ öffnet am Handy ein Blatt von unten; ab dem Tablet steht das Formular als Blatt neben dem Bestand. Im Fenster eine gefüllte Hauptaktion, höchstens eine zweite, alles Weitere — und alles Unumkehrbare — im ⋯."
      >
        <div className="flex flex-wrap gap-3">
          {amHandy && <Button variant="secondary" onClick={() => setNeu(true)}>Neuer Eintrag (Muster)</Button>}
          <Button variant="secondary" onClick={() => setFenster(true)}>Fenster mit Aktionen</Button>
        </div>
      </Card>

      <NeuFormular titel="Neuer Eintrag (Muster)" offen={neu} onSchliessen={() => setNeu(false)}>
        <div className="formular space-y-4">
          <InputField id="muster-neu-titel" label="Bezeichnung" defaultValue="" />
          <Fensteraktionen
            about="Neuer Eintrag (Muster)"
            zweit={amHandy ? <Button variant="secondary" onClick={() => setNeu(false)}>Abbrechen</Button> : null}
            haupt={<Button onClick={() => { setNeu(false); toast.success('Angelegt (Muster).'); }}>Anlegen</Button>}
          />
        </div>
      </NeuFormular>

      <BottomSheet open={fenster} onClose={() => setFenster(false)} label="Schein-Entwurf (Muster)" auchBreit titel="Schein-Entwurf">
        <p className="text-fliess">Familie Huber · 15.11.2026 · Regie · 6:30 Std</p>
        <div className="mt-4">
          <Fensteraktionen
            about="Schein-Entwurf (Muster)"
            haupt={<Button onClick={() => toast.info('Weiterbearbeiten (Muster).')}>Weiterbearbeiten</Button>}
            zweit={<Button variant="secondary" onClick={() => toast.info('PDF (Muster).')}>PDF</Button>}
            weitere={[
              { label: 'Verwerfen', onSelect: () => toast.info('Verworfen (Muster).') },
              { label: 'Löschen …', onSelect: () => toast.info('Löschen fragt erst nach (Muster).'), danger: true },
            ]}
          />
        </div>
      </BottomSheet>
    </>
  );
}
