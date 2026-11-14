import { useState } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Hinweiszeile from '@/components/Hinweiszeile';
import { CheckboxField, InputField, SelectField, TextareaField } from '@/components/Field';
import { EmptyState, ErrorState, LoadingState, SkeletonList, TeilFehler } from '@/components/States';
import { Segmente } from '@/components/LotBausteine';
import { useToast } from '@/components/Toast';

/**
 * DIE BAUSTEINE DER DESIGNLINIE V10 auf der Musterseite (13.11.2026,
 * Implementierungsauftrag 11.7): Knöpfe in jedem Zustand, Felder und
 * Auswahl, Hinweise, Reiter, Meldung und die vier Zustände einer Liste.
 *
 * NUR ECHTE BAUSTEINE. Alles hier ist die Komponente, die auch die Seiten
 * benutzen — kein Nachbau. Wo ein Baustein nur mit echten Daten lebt (die
 * Arbeitstagkarte hängt an der laufenden Zeitsitzung), zeigt die Musterseite
 * sein Bedienmuster (`MusterZeitablauf`), nicht eine Attrappe.
 */
export default function MusterV10() {
  const toast = useToast();
  const [laeuft, setLaeuft] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [reiter, setReiter] = useState<'tag' | 'woche' | 'monat'>('woche');
  const [herkunft, setHerkunft] = useState('lager');

  function speichern() {
    setGespeichert(false);
    setLaeuft(true);
    // Erst nach der (hier gespielten) Bestätigung zeigt der Knopf „gespeichert“ — nie vorher.
    window.setTimeout(() => {
      setLaeuft(false);
      setGespeichert(true);
    }, 900);
  }

  return (
    <>
      <Card title="Knöpfe" hint="Eine Hauptaktion je Zusammenhang, gefüllt in Terrakotta; alles Weitere als Linien- oder Textaktion. Der Knopf behält beim Laden seine Breite.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Hauptaktion</Button>
            <Button variant="secondary">Zweitaktion</Button>
            <Button variant="ghost">Textaktion</Button>
            <Button variant="danger">Entfernen</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button loading={laeuft} gespeichert={gespeichert} onClick={speichern}>Speichern</Button>
            <Button loading>Lädt</Button>
            <Button gespeichert>Gespeichert</Button>
            <Button disabled>Nicht möglich</Button>
            <Button variant="secondary" disabled>Zweitaktion gesperrt</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button groesse="klein">Klein</Button>
            <Button variant="secondary" groesse="klein">Klein, Linie</Button>
          </div>
        </div>
      </Card>

      <Card title="Felder und Auswahl" hint="Fokus färbt nur den Rand, das Feld wächst nicht. Auswahl ist warme Fläche, feine Kontur und Häkchen — passive Information bleibt neutral.">
        <div className="formular space-y-4">
          <InputField id="v10-suche" label="Suchfeld" placeholder="Name, Nummer oder Ort" />
          <InputField id="v10-gesperrt" label="Gesperrt" defaultValue="Nicht änderbar" disabled />
          <SelectField id="v10-wahl" label="Auswahlfeld" defaultValue="b">
            <option value="a">Facharbeiter</option>
            <option value="b">Helfer</option>
          </SelectField>
          <TextareaField id="v10-text" label="Notiz" defaultValue="Zweizeilige Notiz zum Einsatz." />
          <CheckboxField id="v10-haken" label="Angemeldet bleiben" defaultChecked />
          <fieldset className="wahl-gruppe">
            <legend className="mb-2 text-sm text-ink-muted">Herkunft (kompakte Auswahl)</legend>
            {[
              { wert: 'lager', name: 'Lager', zusatz: 'Aus dem eigenen Bestand' },
              { wert: 'haendler', name: 'Beim Händler mitgenommen', zusatz: 'Direkt auf die Baustelle' },
            ].map((o) => (
              <label key={o.wert} className="wahl-option">
                <input type="radio" name="v10-herkunft" value={o.wert} checked={herkunft === o.wert} onChange={() => setHerkunft(o.wert)} />
                <span className="wahl-text">
                  <span className="wahl-name">{o.name}</span>
                  <span className="wahl-zusatz">{o.zusatz}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      </Card>

      <Card title="Auswahl als Segmente" hint="Seit V10 kompakte Texttabs mit einer präzisen Unterlinie, keine Segmentkästen — derselbe Baustein für Woche/Monat/Tag und Personen/Baustellen.">
        <Segmente
          name="Zeitraum"
          werte={[{ wert: 'tag', text: 'Tag' }, { wert: 'woche', text: 'Woche' }, { wert: 'monat', text: 'Monat' }]}
          wert={reiter}
          onChange={setReiter}
        />
      </Card>

      <Card title="Hinweise" hint="Symbol, eindeutiger Satz, höchstens eine nächste Aktion. Keine farbige Fläche, keine farbige Kante.">
        <div className="space-y-3">
          <Hinweiszeile>
            <p><b>Information.</b> Neutral, ohne Auswahlrahmen und ohne Aktion.</p>
          </Hinweiszeile>
          <Hinweiszeile stufe="warn" role="status">
            <p><b>Offline · 2 Schritte vorgemerkt.</b> Sie gehen hinaus, sobald die Verbindung wieder steht.</p>
          </Hinweiszeile>
          <TeilFehler was="Der Zahlungsstand" onRetry={() => toast.info('Erneut geladen (Muster).')} />
        </div>
      </Card>

      <Card title="Meldung" hint="Erst nach bestätigtem Schreiben; Rückgängig nur, wo es fachlich geht. Zeiger oder Fokus auf der Meldung halten sie an.">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast.success('Einsatz verschoben.', { label: 'Rückgängig', onClick: () => toast.info('Zurückgenommen.') })}>
            Erfolg mit Rückgängig
          </Button>
          <Button variant="secondary" onClick={() => toast.success('Gespeichert.')}>Erfolg</Button>
          <Button variant="secondary" onClick={() => toast.error('Speichern hat nicht geklappt. Bitte erneut versuchen.')}>Fehler</Button>
          <Button variant="secondary" onClick={() => toast.wichtig('Diese Meldung bleibt stehen, bis sie gelesen ist.')}>Bleibt stehen</Button>
        </div>
      </Card>

      {/*
        DIE VIER ZUSTÄNDE EINER LISTE, nebeneinander, weil sie verwechselt
        werden: Laden ist Struktur ohne Inhalt, leer ist ein echter leerer
        Bestand (die einzige Stelle mit Zeichnung), Filterleere bietet das
        Zurücksetzen an, ein Fehler nennt den Grund und nie eine Null.
      */}
      <Card title="Laden" buendig>
        <div className="px-4">
          <SkeletonList rows={2} />
        </div>
        <LoadingState label="Wird geladen …" />
      </Card>
      <Card title="Leerer Zustand" buendig>
        <EmptyState titel="Noch keine Einträge" zeichnung="akte" action={<Button variant="secondary">Eintrag erfassen</Button>}>
          Für diesen Zeitraum liegen keine Buchungen vor.
        </EmptyState>
      </Card>
      <Card title="Filterleere" buendig>
        <EmptyState action={<Button variant="ghost">Filter zurücksetzen</Button>}>
          Kein Eintrag passt zu „Weiz, offen“.
        </EmptyState>
      </Card>
      <Card title="Fehler">
        <ErrorState message="Zahlungsstand konnte nicht geladen werden — kein Ersatzwert, keine scheinbare Null." onRetry={() => toast.info('Erneut geladen (Muster).')} />
      </Card>

      <Card title="Bewegung" hint="Mit „Bewegung reduzieren“ am Gerät wechseln Zustände ohne räumliche Bewegung, höchstens mit kurzer Überblendung — Information und Bedienung bleiben vollständig.">
        <ul className="space-y-1 text-fliess">
          <li>Navigation und Reiter: etwa 160 ms</li>
          <li>Seitenfenster und Blätter: etwa 220 ms, aus ihrer Richtung</li>
          <li>Meldung: etwa 240 ms; Speichern erst nach bestätigtem Schreiben</li>
          <li>Laden, Offline und Fehler: sofort, ohne Verzögerung</li>
        </ul>
      </Card>
    </>
  );
}
