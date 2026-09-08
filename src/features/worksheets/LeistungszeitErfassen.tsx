import { useState } from 'react';
import { calcWorkMin } from '@/lib/time';
import { fmtMin } from '@/lib/time';
import type { WorkSheetZeit } from '@/types';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import InfoHint from '@/components/InfoHint';
import { InputField, CheckboxField, FormGrid } from '@/components/Field';

/**
 * Leistungszeit beim Kunden — auf dem Schein selbst erfasst.
 *
 * WOZU. Der Monteur stellt den Schein beim Kunden aus, oft bevor er die Zeit
 * gebucht hat: bei einer Reparatur zwischendurch hat er vorher gar nichts
 * erfasst. Bis hierher konnte er auf dem Schein auch nichts eintragen — die
 * Zeilen kamen ausschliesslich aus der Zeiterfassung, und war dort nichts
 * gebucht, stand auf dem Beleg „keine Zeit gebucht". Der Kunde unterschrieb
 * einen Zettel, der nur Material dokumentierte.
 *
 * DAS IST DIE ZEIT BEIM KUNDEN, NICHT DER ARBEITSTAG. Ohne Anfahrt: die
 * Wegzeit steht in der Zeiterfassung als eigenes Feld und zählt dort
 * ausdrücklich NICHT zur Arbeitszeit. Damit ist die Zahl hier genau die, die
 * später auf der Rechnung steht — Schein und Rechnung sagen dasselbe.
 *
 * DIE MINUTEN RECHNET `calcWorkMin`, dieselbe Funktion wie die Zeiterfassung
 * und die Monatsbilanzen. Eine eigene Formel hier ergäbe dieselbe Zahl, bis
 * sie es eines Tages nicht mehr täte — und bemerkt würde es an einer
 * Rechnung, die dem unterschriebenen Beleg widerspricht.
 */

const LEER = { mitarbeiter: '', von: '08:00', bis: '', pauseMin: '', taetigkeit: '', helfer: false };

/**
 * Ab wann eine Spanne nachgefragt wird, in Minuten.
 *
 * WARUM ES DIESE PRÜFUNG BRAUCHT, und sie ist beim Testen aufgefallen:
 * `calcWorkMin` behandelt eine Endzeit VOR der Startzeit als Einsatz über
 * Mitternacht — Bereitschaft und Notdienst gibt es in diesem Gewerbe, und
 * 22:00–06:00 muss acht Stunden ergeben, nicht null.
 *
 * Der Preis dafür: aus dem Vertipper „11:00 bis 08:00" werden stillschweigend
 * einundzwanzig Stunden. Auf einem Zettel, den der Kunde gleich
 * unterschreibt, ist das die teuerste Art von Zahlendreher — er fällt erst
 * auf der Rechnung auf, und dann steht die Unterschrift schon darunter.
 *
 * Vierzehn Stunden BEIM KUNDEN sind die Grenze, ab der nachgefragt wird.
 * Nicht gesperrt: eine durchgemachte Notdienstnacht gibt es wirklich. Aber
 * sie gehört bestätigt, nicht angenommen.
 */
export const NACHFRAGE_AB_MINUTEN = 14 * 60;

export default function LeistungszeitErfassen({
  eigenerName,
  onHinzufuegen,
}: {
  /** Vorschlag für das Namensfeld — meist steht der Monteur selbst dort. */
  eigenerName: string;
  onHinzufuegen: (zeile: WorkSheetZeit) => void;
}) {
  const [form, setForm] = useState({ ...LEER, mitarbeiter: eigenerName });
  const [fehler, setFehler] = useState<string | null>(null);

  const minuten = calcWorkMin({
    status: 'Anwesend',
    startTime: form.von || undefined,
    endTime: form.bis || undefined,
    breakDuration: Number(form.pauseMin) || 0,
  });

  function hinzufuegen() {
    if (!form.mitarbeiter.trim()) {
      setFehler('Ohne Namen lässt sich die Zeile niemandem zuordnen.');
      return;
    }
    if (!form.von || !form.bis) {
      setFehler('Von und Bis werden gebraucht — daraus entsteht die Zeit.');
      return;
    }
    if (minuten <= 0) {
      setFehler('Das ergibt keine Zeit. Ist die Pause so lang wie der Einsatz?');
      return;
    }
    setFehler(null);
    onHinzufuegen({
      datum: '',
      mitarbeiter: form.mitarbeiter.trim(),
      von: form.von,
      bis: form.bis,
      pauseMin: Number(form.pauseMin) || undefined,
      minuten,
      taetigkeit: form.taetigkeit.trim() || undefined,
      helfer: form.helfer || undefined,
    });
    // Name und Helfer-Haken bleiben stehen: der nächste Eintrag ist meist
    // derselbe Mann mit einer zweiten Spanne.
    setForm((f) => ({ ...LEER, mitarbeiter: f.mitarbeiter, helfer: f.helfer }));
  }

  return (
    <div className="rounded-sm border border-line bg-surface-2 p-3">
      <p className="flex flex-wrap items-center gap-1 text-sm font-medium text-ink">
        Zeit beim Kunden eintragen
        <InfoHint about="die Leistungszeit">
          <strong>Das ist die Zeit vor Ort, nicht der Arbeitstag.</strong> Ohne Anfahrt: die
          Wegzeit gehört in die Zeiterfassung und zählt dort ausdrücklich nicht zur Arbeitszeit.
          Damit steht hier genau die Zahl, die später auf der Rechnung landet — der Kunde
          unterschreibt also das, was er auch verrechnet bekommt.
          <br />
          <br />
          <strong>Das ersetzt die Zeiterfassung nicht.</strong> Was du hier einträgst, ist ein
          Beleg für den Kunden. Die Arbeitszeitaufzeichnung, aus der Saldo, Überstunden und
          Lohnzettel entstehen, führst du weiterhin im Zeiterfassungs-Reiter — dort gehören
          Anfahrt, Fahrzeug (Kennzeichen) und die Zuschläge dazu, die dieser Beleg nicht kennt.
          <br />
          <br />
          <strong>Du wirst daran erinnert.</strong> Nach dem Unterschreiben erscheint dieser
          Einsatz in der Zeiterfassung als offener Nachtrag, mit Von, Bis und Pause schon
          ausgefüllt — bis du ihn gebucht hast. Vergessen kostet doppelt: die Stunde wird nie
          verrechnet, und in deinem Zeitkonto fehlt sie auch.
          <br />
          <br />
          <strong>Mehrere Zeilen sind normal.</strong> Waren Kollegen dabei, trag sie einzeln
          ein — der Kunde unterschreibt für alle, die dort waren. Ihre Zeit buchen sie selbst;
          du kannst und darfst das nicht für sie tun.
        </InfoHint>
      </p>

      <FormGrid>
        <InputField
          id="lz-name"
          label="Mitarbeiter"
          value={form.mitarbeiter}
          onChange={(e) => setForm({ ...form, mitarbeiter: e.target.value })}
        />
        <InputField
          id="lz-von"
          label="Von"
          type="time"
          value={form.von}
          onChange={(e) => setForm({ ...form, von: e.target.value })}
        />
        <InputField
          id="lz-bis"
          label="Bis"
          type="time"
          value={form.bis}
          onChange={(e) => setForm({ ...form, bis: e.target.value })}
        />
        <InputField
          id="lz-pause"
          label="Pause (Minuten, optional)"
          type="number"
          min="0"
          placeholder="0"
          value={form.pauseMin}
          onChange={(e) => setForm({ ...form, pauseMin: e.target.value })}
        />
        <InputField
          id="lz-taetigkeit"
          label="Tätigkeit (optional)"
          placeholder="Therme entlüftet, Eckventil getauscht"
          value={form.taetigkeit}
          onChange={(e) => setForm({ ...form, taetigkeit: e.target.value })}
        />
      </FormGrid>

      <div className="mt-2">
        <CheckboxField
          id="lz-helfer"
          label="Als Helfer gearbeitet"
          checked={form.helfer}
          onChange={(e) => setForm({ ...form, helfer: e.target.checked })}
        />
        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-muted">
          Helferstunden werden anders verrechnet.
          <InfoHint about="den Helfer-Haken">
            Auf der Rechnung gilt für Helferstunden ein eigener, niedrigerer Satz. Der Haken
            gehört an die einzelne Zeile, nicht an die Person: derselbe Mann kann vormittags
            als Facharbeiter und nachmittags als Helfer gearbeitet haben.
            <br />
            <br />
            Ein vergessener Haken führt zum falschen Stundensatz — und zwar auf einem Beleg, den
            der Kunde bereits unterschrieben hat.
          </InfoHint>
        </p>
      </div>

      {minuten > 0 && (
        <p className="mt-2 text-sm text-ink">
          Ergibt <strong>{fmtMin(minuten)}</strong> Leistungszeit.
        </p>
      )}
      {/*
        EINE UNGEWÖHNLICH LANGE SPANNE — nachfragen, nicht sperren.

        Eine Endzeit vor der Startzeit gilt als Einsatz über Mitternacht; so
        muss es sein, sonst wäre eine Notdienstnacht unbezahlt. Aus dem
        Vertipper „11:00 bis 08:00" werden dabei aber einundzwanzig Stunden,
        und der Kunde unterschreibt sie gleich.

        DIE URSACHE WIRD ABGELESEN, NICHT ERRATEN. Die Meldung nannte bisher
        immer die Mitternacht als Grund — auch bei „05:00 bis 19:00", wo „Bis"
        gar nicht vor „Von" liegt. Eine Warnung, die den falschen Grund nennt,
        schickt den Monteur zum Prüfen an die falsche Stelle; und wer einmal
        gemerkt hat, dass sie danebenliegt, liest sie beim nächsten Mal nicht
        mehr.
      */}
      {minuten >= NACHFRAGE_AB_MINUTEN && (
        <p className="mt-1 text-sm text-warning" role="alert">
          Das sind <strong>{fmtMin(minuten)}</strong> —{' '}
          {form.bis < form.von
            ? 'über Mitternacht gerechnet, weil „Bis" vor „Von" liegt. Bei einer Notdienstnacht stimmt das; sonst sind Von und Bis vertauscht.'
            : 'ein ungewöhnlich langer Einsatz. Bitte prüfen, ob Von und Bis stimmen.'}
        </p>
      )}
      {fehler && (
        <p className="mt-2 text-sm text-warning" role="alert">
          {fehler}
        </p>
      )}

      <div className="mt-3">
        <Button variant="secondary" onClick={hinzufuegen}>
          Zeile hinzufügen
        </Button>
      </div>
    </div>
  );
}

/** Eine erfasste Zeile wieder wegnehmen — nur solange der Schein Entwurf ist. */
export function ZeileEntfernen({ name, onWeg }: { name: string; onWeg: () => void }) {
  return (
    <IconButton label={`Zeile ${name} entfernen`} tone="danger" onClick={onWeg}>
      ✕
    </IconButton>
  );
}
