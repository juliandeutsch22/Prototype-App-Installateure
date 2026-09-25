import { useEffect, useState } from 'react';
import { calcWorkMin } from '@/lib/time';
import { fmtDauer } from '@/lib/time';
import type { WorkSheetZeit } from '@/types';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import InfoHint from '@/components/InfoHint';
import { InputField, CheckboxField } from '@/components/Field';

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
  onOffen,
}: {
  /** Vorschlag für das Namensfeld — meist steht der Monteur selbst dort. */
  eigenerName: string;
  onHinzufuegen: (zeile: WorkSheetZeit) => void;
  /**
   * Meldet eine eingetippte, aber noch nicht übernommene Spanne („07:00–15:30")
   * oder `null`. Der Schein sperrt damit das Unterschreiben — siehe dort.
   */
  onOffen?: (offen: string | null) => void;
}) {
  const [form, setForm] = useState({ ...LEER, mitarbeiter: eigenerName });
  const [fehler, setFehler] = useState<string | null>(null);

  /*
    „Bis" ist das Feld, an dem man es erkennt: „Von" steht ab Werk auf 08:00,
    „Bis" ist leer, bis jemand eine Zeit einträgt. Steht dort etwas, ist das
    eine Absicht, die noch nicht auf dem Schein steht.
  */
  const offen = form.bis ? `${form.von || '?'}–${form.bis}` : null;
  useEffect(() => {
    onOffen?.(offen);
  }, [offen, onOffen]);
  // Verschwindet das Feld (andere Baustelle, Modul aus), ist auch nichts offen.
  useEffect(() => () => onOffen?.(null), [onOffen]);

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

  /*
    KEIN KASTEN MEHR IN DER KARTE (Linie, 2): die Erfassung steht unter den
    Zeilen, getrennt durch eine Haarlinie. Von und Bis nebeneinander — so
    stehen sie auch auf dem Schein (Mockup S. 2).
  */
  return (
    <div className="lz-block">
      <p className="lz-titel">
        Zeit beim Kunden eintragen
        <InfoHint about="die Leistungszeit">
          {/* Gekürzt (Prüflauf 24.09.2026, D9): vier Absätze, die auf dem
              Telefon mehr Platz nahmen als das Formular darunter. */}
          <strong>Die Zeit vor Ort, ohne Anfahrt</strong> — genau das, was der Kunde
          unterschreibt und verrechnet bekommt.
          <br />
          <br />
          <strong>Ersetzt die Zeiterfassung nicht.</strong> Nach dem Unterschreiben erscheint der
          Einsatz dort als offener Nachtrag, mit Von, Bis und Pause schon ausgefüllt; Anfahrt,
          Fahrzeug und Zuschläge ergänzt du dort.
          <br />
          <br />
          <strong>Kollegen</strong> trägst du je in eine eigene Zeile ein. Ihre Zeit buchen sie
          selbst.
        </InfoHint>
      </p>

      <div className="lz-raster">
        <div className="lz-feld-breit">
          <InputField
            id="lz-name"
            label="Mitarbeiter"
            value={form.mitarbeiter}
            onChange={(e) => setForm({ ...form, mitarbeiter: e.target.value })}
          />
        </div>
        <div className="lz-feld">
          <InputField
            id="lz-von"
            label="Von"
            type="time"
            value={form.von}
            onChange={(e) => setForm({ ...form, von: e.target.value })}
          />
        </div>
        <div className="lz-feld">
          <InputField
            id="lz-bis"
            label="Bis"
            type="time"
            value={form.bis}
            onChange={(e) => setForm({ ...form, bis: e.target.value })}
          />
        </div>
        <div className="lz-feld-pause">
          <InputField
            id="lz-pause"
            label="Pause (Minuten, optional)"
            type="number"
            min="0"
            placeholder="0"
            value={form.pauseMin}
            onChange={(e) => setForm({ ...form, pauseMin: e.target.value })}
          />
        </div>
        <div className="lz-feld-taetigkeit">
          <InputField
            id="lz-taetigkeit"
            label="Tätigkeit (optional)"
            placeholder="z. B. Therme entlüftet, Eckventil getauscht"
            value={form.taetigkeit}
            onChange={(e) => setForm({ ...form, taetigkeit: e.target.value })}
          />
        </div>
      </div>

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
            Für Helferstunden gilt auf der Rechnung ein eigener, niedrigerer Satz. Der Haken gilt je
            Zeile: derselbe Mann kann vormittags als Facharbeiter und nachmittags als Helfer
            gearbeitet haben.
          </InfoHint>
        </p>
      </div>

      {minuten > 0 && (
        <p className="mt-2 text-sm text-ink">
          Ergibt <strong>{fmtDauer(minuten)}</strong> Leistungszeit.
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
          Das sind <strong>{fmtDauer(minuten)}</strong> —{' '}
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

      <div className="lz-knopf">
        <Button variant="secondary" onClick={hinzufuegen} className="w-full sm:w-auto">
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
