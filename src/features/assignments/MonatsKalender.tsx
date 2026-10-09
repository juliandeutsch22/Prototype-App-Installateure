import { useMemo } from 'react';
import type { AppUser, Assignment, Termin } from '@/types';
import { SelectField } from '@/components/Field';
import { getAustrianHolidayName, isWeekend } from '@/lib/time';
import { artWort, lieferungOhneAnnahme } from './monatsBalken';
import type { Brett } from './planTypen';

/*
  DER MONAT AM HANDY (Runde 4, Auftrag 5.4): ein Kalender mit sieben
  Spalten statt eines Rasters — 31 Tage × Personen wären auf 390 px ein
  Guckloch. „Alle Personen“ sagt je Tag, wie viele Baustellen besetzt sind
  und ob jemand fehlt; eine Person zeigt ihren Monat. Ein Tipp öffnet die
  Vorschau als Blatt.
*/

const KOPF = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export default function MonatsKalender({
  tage,
  heute,
  staff,
  brett,
  zuFuer,
  einsaetze,
  termine,
  person,
  onPerson,
  gewaehlt,
  gewaehltRef,
  onTag,
}: {
  tage: string[];
  heute: string;
  staff: AppUser[];
  brett: Brett;
  zuFuer: (uid: string, tag: string) => boolean;
  einsaetze: Assignment[];
  termine: Termin[];
  /** Leer: alle Personen. */
  person: string;
  onPerson: (uid: string) => void;
  /** Der Tag, dessen Vorschau offen ist. */
  gewaehlt: string | null;
  gewaehltRef: (el: HTMLElement | null) => void;
  onTag: (tag: string, el: HTMLElement) => void;
}) {
  /** Je Tag: Baustellen mit Einsatz, ob jemand Eingeteiltes fehlt, Termine. */
  const proTag = useMemo(() => {
    const m = new Map<string, { baustellen: number; fehlt: boolean; termine: number; achtung: boolean }>();
    for (const tag of tage) {
      const nummern = new Set(einsaetze.filter((a) => a.date === tag).map((a) => a.projectNumber));
      const fehlt = staff.some((u) => {
        const z = brett.get(u.uid)?.get(tag);
        return !!z?.imUrlaub && z.baustellen.length > 0;
      });
      const amTag = termine.filter((t) => t.datum === tag);
      m.set(tag, {
        baustellen: nummern.size,
        fehlt,
        termine: amTag.length,
        achtung: amTag.some((t) => lieferungOhneAnnahme(t, einsaetze)),
      });
    }
    return m;
  }, [tage, einsaetze, staff, brett, termine]);

  const name = staff.find((u) => u.uid === person)?.name;
  const versatz = tage.length > 0 ? (new Date(`${tage[0]}T00:00:00`).getDay() + 6) % 7 : 0;

  return (
    <div className="kal">
      <SelectField id="monat-fuer-wen" label="Für wen" value={person} onChange={(e) => onPerson(e.target.value)}>
        <option value="">Alle Personen</option>
        {staff.map((u) => (
          <option key={u.uid} value={u.uid}>
            {u.name}
          </option>
        ))}
      </SelectField>
      <p className="kal-lesart">
        {person
          ? 'Balken = eingeplant · grau = abwesend · „fehlt“ = eingeteilt, aber abwesend · Punkt = Termin · Tag antippen zeigt die Vorschau'
          : 'Zahl = Baustellen mit Einsatz · Bernstein = jemand Eingeteiltes fehlt · Punkt = Termine · Tag antippen zeigt alle Einsätze'}
      </p>
      <div className="kal-raster" role="group" aria-label={person ? `Monat von ${name}` : 'Monat, alle Personen'}>
        {KOPF.map((k) => (
          <div key={k} className="kal-kopf" aria-hidden="true">
            {k}
          </div>
        ))}
        {Array.from({ length: versatz }, (_, i) => (
          <div key={`leer${i}`} className="kal-leer" aria-hidden="true" />
        ))}
        {tage.map((tag) => {
          const d = new Date(`${tag}T00:00:00`);
          const feiertag = getAustrianHolidayName(d);
          const ruhe = !!feiertag || isWeekend(d);
          const istGewaehlt = tag === gewaehlt;
          const klasse = istGewaehlt ? 'kal-tag-gewaehlt' : tag === heute ? 'kal-tag-heute' : ruhe ? 'kal-tag-we' : 'kal-tag';
          const info = proTag.get(tag);
          const datum = d.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' });
          let zeile1: { klasse: string; text?: string } = { klasse: 'kal-balken-ohne' };
          let zeile2: { klasse: string; text: string } = { klasse: istGewaehlt ? 'kal-info-gewaehlt' : 'kal-info', text: '' };
          let punkt = 'mo-punkt-ohne';
          const vorlesen: string[] = [datum];
          if (feiertag) vorlesen.push(feiertag);
          if (person) {
            const z = brett.get(person)?.get(tag);
            const eigeneTermine = termine.filter((t) => t.datum === tag && t.teilnehmer.includes(person)).length;
            if (z && z.baustellen.length > 0) {
              const konflikt = z.imUrlaub;
              zeile1 = { klasse: istGewaehlt ? 'kal-balken-gewaehlt' : konflikt ? 'kal-balken-konflikt' : 'kal-balken' };
              const anzahl = new Set(z.baustellen.map((b) => b.nummer)).size;
              zeile2 = {
                klasse: konflikt && !istGewaehlt ? 'kal-info-achtung' : zeile2.klasse,
                text: konflikt ? 'fehlt' : anzahl > 1 ? `${anzahl} Bst.` : '',
              };
              vorlesen.push(konflikt ? `eingeteilt, aber ${artWort(z.abwesendText)}` : `eingeplant (${z.baustellen.map((b) => b.name).join(', ')})`);
            } else if (z?.imUrlaub || zuFuer(person, tag)) {
              zeile1 = { klasse: istGewaehlt ? 'kal-balken-gewaehlt' : 'kal-balken-weg' };
              zeile2 = { ...zeile2, text: ruhe ? '' : 'weg' };
              vorlesen.push(z?.imUrlaub ? artWort(z.abwesendText) : 'Betriebsurlaub');
            } else {
              vorlesen.push(ruhe ? 'kein Einsatz' : 'frei');
            }
            if (eigeneTermine > 0) {
              punkt = istGewaehlt ? 'kal-punkt-hell' : 'mo-punkt';
              vorlesen.push(eigeneTermine === 1 ? '1 Termin' : `${eigeneTermine} Termine`);
            }
          } else if (info) {
            zeile2 = {
              klasse: info.fehlt && !istGewaehlt ? 'kal-info-achtung' : zeile2.klasse,
              text: info.baustellen > 0 ? String(info.baustellen) : '',
            };
            if (info.baustellen > 0) vorlesen.push(info.baustellen === 1 ? '1 Baustelle' : `${info.baustellen} Baustellen`);
            if (info.fehlt) vorlesen.push('jemand Eingeteiltes fehlt');
            if (info.termine > 0) {
              punkt = istGewaehlt ? 'kal-punkt-hell' : info.achtung ? 'mo-punkt-achtung' : 'mo-punkt';
              vorlesen.push(info.termine === 1 ? '1 Termin' : `${info.termine} Termine`);
              if (info.achtung) vorlesen.push('Lieferung ohne Annahme');
            }
          }
          return (
            <button
              key={tag}
              ref={istGewaehlt ? gewaehltRef : undefined}
              type="button"
              className={klasse}
              data-vorschau-ausloeser=""
              aria-label={`${vorlesen.join(', ')} – Vorschau`}
              onClick={(e) => onTag(tag, e.currentTarget)}
            >
              <span className="kal-nr">{d.getDate()}</span>
              {person && <span className={zeile1.klasse} aria-hidden="true" />}
              <span className={zeile2.klasse} aria-hidden="true">
                {zeile2.text}
              </span>
              <span className={punkt} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
