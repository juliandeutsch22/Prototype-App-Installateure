import { useEffect, useState } from 'react';
import { listActiveProjects, listProjectsByNumbers, listRecentProjects } from '@/lib/db/projects';
import { baustellenAuswahlAbgeschnitten } from '@/lib/listengrenzen';
import type { Project } from '@/types';
import type { WithId } from '@/lib/db/core';
import { SelectField } from '@/components/Field';
import Button from '@/components/Button';

/**
 * Auswahl einer Baustelle — überall dort, wo eine gebraucht wird.
 *
 * WARUM ALS EIGENE KOMPONENTE: dieselbe Auswahl stand mehrfach im Programm,
 * jedes Mal als `listActiveProjects(...).then(setProjekte).catch(() => undefined)`.
 * Dieses `catch` ist der eigentliche Fehler. Es macht aus jedem denkbaren
 * Problem — fehlende Berechtigung, fehlender Index, keine Verbindung — genau
 * dasselbe Bild: ein Auswahlfeld, in dem nur „— wählen —" steht. Der Benutzer
 * sieht ein kaputtes Formular und hat keinen Anhaltspunkt, was fehlt.
 *
 * Diese Komponente unterscheidet deshalb vier Zustände, die vorher alle gleich
 * aussahen:
 *
 *  1. LÄDT — das Feld ist gesperrt und sagt das.
 *  2. FEHLER — die Meldung steht da, mit einem Knopf zum Erneut-Versuchen.
 *  3. KEINE AKTIVE BAUSTELLE — dann wird der Gesamtbestand nachgeladen und
 *     angeboten, mit Hinweis. Ein Betrieb, dessen Baustellen alle auf
 *     „Abgeschlossen" stehen, bekam vorher ein leeres Feld ohne Erklärung.
 *  4. BEREIT — aktive Baustellen zuerst, abgeschlossene in einer eigenen
 *     Gruppe darunter.
 *
 * Und ein fünfter Fall, der zu stillen Fehlfunktionen führte: eine per Link
 * vorgegebene Baustelle, die nicht in der Liste steht (weil abgeschlossen).
 * Sie wird gezielt nachgeladen. Sonst stünde im Feld eine Nummer, zu der die
 * aufrufende Ansicht kein Projekt findet — und deren Speichern-Knopf dann
 * kommentarlos nichts tut.
 */
export default function BaustellenSelect({
  companyId,
  value,
  onChange,
  id = 'baustelle',
  label = 'Baustelle',
  required,
}: {
  companyId: string;
  value: string;
  /** Nummer UND Datensatz — Aufrufer brauchen Adresse, Kunde, Abrechnungsart. */
  onChange: (projectNumber: string, projekt?: WithId<Project>) => void;
  id?: string;
  label?: string;
  required?: boolean;
}) {
  const [projekte, setProjekte] = useState<WithId<Project>[]>([]);
  const [zustand, setZustand] = useState<'laedt' | 'fehler' | 'bereit'>('laedt');
  /** Wurde auf den Gesamtbestand ausgewichen, weil nichts aktiv ist? */
  const [ausweich, setAusweich] = useState(false);
  /*
    Reichte die Abfrage bis an ihre Grenze? Dann kann eine Baustelle fehlen,
    und das ist hier teuer: wer sie nicht findet, bucht auf die falsche oder
    gar nicht. Siehe `lib/listengrenzen.ts`.
  */
  const [angeschnitten, setAngeschnitten] = useState(false);
  const [versuch, setVersuch] = useState(0);

  useEffect(() => {
    let verworfen = false;
    setZustand('laedt');
    (async () => {
      try {
        let rows = await listActiveProjects(companyId);
        let gewichen = false;
        if (rows.length === 0) {
          // Kein laufender Auftrag heißt nicht „nichts auswählbar": ein Schein
          // wird auch für eine gerade abgeschlossene Baustelle nachgereicht.
          rows = await listRecentProjects(companyId, 200);
          gewichen = true;
        }
        if (verworfen) return;
        setProjekte(rows);
        setAusweich(gewichen && rows.length > 0);
        // Nur die Abfrage der LAUFENDEN Baustellen hat diese Grenze; der
        // Ausweichweg bringt seine eigene mit und sagt es getrennt.
        setAngeschnitten(!gewichen && baustellenAuswahlAbgeschnitten(rows));
        setZustand('bereit');
      } catch {
        if (!verworfen) setZustand('fehler');
      }
    })();
    return () => {
      verworfen = true;
    };
  }, [companyId, versuch]);

  /**
   * Eine vorgegebene Baustelle nachladen, wenn sie nicht in der Liste steht.
   *
   * Tritt bei jedem Tiefenlink auf eine abgeschlossene Baustelle auf. Ohne
   * das bliebe der Wert gesetzt, das Feld zeigte aber „— wählen —", und der
   * Aufrufer bekäme nie einen Datensatz zu sehen.
   */
  useEffect(() => {
    if (zustand !== 'bereit' || !value) return;
    if (projekte.some((p) => p.projectNumber === value)) return;
    let verworfen = false;
    listProjectsByNumbers(companyId, [value])
      .then((rows) => {
        // Nur den Treffer aufnehmen. Etwas anderes anzuhängen liefe in eine
        // Schleife: die Bedingung oben bliebe wahr, und der Effekt startete
        // nach jedem Anhängen erneut.
        const treffer = rows.filter((p) => p.projectNumber === value);
        if (verworfen || treffer.length === 0) return;
        setProjekte((alt) => [...treffer, ...alt]);
      })
      .catch(() => undefined);
    return () => {
      verworfen = true;
    };
  }, [companyId, value, projekte, zustand]);

  /**
   * Den Datensatz zur gewählten Nummer nach oben reichen, sobald er da ist.
   *
   * Bei einem Tiefenlink steht die Nummer vor den Stammdaten fest; ohne diesen
   * Nachtrag behielte der Aufrufer sein `undefined` und liefe in genau den
   * toten Knopf, den die Komponente verhindern soll.
   */
  useEffect(() => {
    if (!value) return;
    const treffer = projekte.find((p) => p.projectNumber === value);
    if (treffer) onChange(value, treffer);
    // Nur beim Eintreffen der Daten, nicht bei jeder Neuzeichnung des Aufrufers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projekte, value]);

  /*
    Der eigene Satz macht das Feld ungültig, bis er wieder gelöscht wird —
    auch wenn der Aufrufer die Baustelle danach selbst setzt (aus einem
    Einsatz, per Link). Deshalb hängt das Löschen am Wert, nicht am Wählen.
  */
  useEffect(() => {
    (document.getElementById(id) as HTMLSelectElement | null)?.setCustomValidity?.('');
  }, [value, id]);

  if (zustand === 'fehler') {
    return (
      <div className="rounded-sm border border-line bg-surface-2 px-3 py-2">
        <p className="text-sm text-danger">
          Die Baustellen konnten nicht geladen werden. Ohne sie lässt sich hier nichts auswählen.
        </p>
        <div className="mt-2">
          <Button variant="secondary" onClick={() => setVersuch((v) => v + 1)}>
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  const aktiv = projekte.filter((p) => p.status === 'Aktiv' || p.status === 'Pausiert');
  const uebrige = projekte.filter((p) => !aktiv.includes(p));
  const beschriften = (p: WithId<Project>) => `${p.customerName} (${p.projectNumber})`;

  return (
    <div>
      <SelectField
        id={id}
        label={label}
        value={value}
        onChange={(e) => {
          const nr = e.target.value;
          onChange(nr, projekte.find((p) => p.projectNumber === nr));
        }}
        required={required}
        /*
          PFLICHT HEISST AUCH HIER: STERN UND EIN EIGENER SATZ. Vorher ging
          `required` an den Browser, der Stern nicht mit — die Zeitmaske liess
          sich nicht speichern, und niemand sah vorher, warum. Die Blase des
          Browsers spricht seine Sprache und sagt „ein Element auswählen";
          dieser Satz sagt, welches (Prüflauf 24.09.2026, F6).
        */
        pflicht={required}
        onInvalid={(e) => e.currentTarget.setCustomValidity('Bitte eine Baustelle wählen.')}
        disabled={zustand === 'laedt'}
      >
        <option value="">{zustand === 'laedt' ? 'lädt …' : '— wählen —'}</option>
        {/*
          Getrennte Gruppen statt einer Mischliste: „abgeschlossen" ist eine
          bewusste Auswahl, keine, die man aus Versehen trifft.
        */}
        {aktiv.length > 0 && (
          <optgroup label="Laufende Baustellen">
            {aktiv.map((p) => (
              <option key={p.id} value={p.projectNumber}>
                {beschriften(p)}
              </option>
            ))}
          </optgroup>
        )}
        {uebrige.length > 0 && (
          <optgroup label="Abgeschlossene Baustellen">
            {uebrige.map((p) => (
              <option key={p.id} value={p.projectNumber}>
                {beschriften(p)}
              </option>
            ))}
          </optgroup>
        )}
      </SelectField>

      {zustand === 'bereit' && projekte.length === 0 && (
        <p className="mt-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-warning">
          Es ist noch keine Baustelle angelegt. Sie entsteht entweder direkt unter „Baustellen"
          oder automatisch, sobald ein Angebot angenommen wird.
        </p>
      )}
      {ausweich && (
        <p className="mt-2 text-sm text-ink-muted">
          Keine laufende Baustelle — angezeigt werden die zuletzt angelegten, unabhängig vom
          Status.
        </p>
      )}
      {/*
        Eine Auswahl, in der etwas fehlt, sagt von sich aus nichts — sie sieht
        vollständig aus. Für ein Auswahlfeld ist das die schlimmste Form einer
        Grenze: der Monteur sucht seine Baustelle, findet sie nicht und bucht
        auf eine andere. Deshalb steht es hier, auch wenn es heute nie
        erscheint.
      */}
      {angeschnitten && (
        <p className="mt-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-warning">
          Es werden nur die ersten {projekte.length} laufenden Baustellen angeboten. Fehlt eine,
          ist sie unter „Baustellen" zu finden — von dort führt ein Weg direkt hierher.
        </p>
      )}
    </div>
  );
}
