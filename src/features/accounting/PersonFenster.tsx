import { useEffect, useRef, type ReactNode } from 'react';
import type { WithId } from '@/lib/db/core';
import type { AppUser, TimeEntry } from '@/types';
import type { CompletenessResult, MonthStats } from '@/lib/time';
import {
  calcWorkMin,
  fmtDauer,
  fmtMin,
  getAustrianHolidayName,
  tagesStatusName,
  tageZahl,
  vorzeichenTage,
} from '@/lib/time';
import { einstufungText } from '@/lib/einstufung';
import type { Nachtzeit } from '@/lib/lohnregeln';
import Button from '@/components/Button';
import { Marke } from '@/components/Badge';
import Hinweiszeile from '@/components/Hinweiszeile';
import InfoHint from '@/components/InfoHint';
import Zeitmarker from '@/features/time/Zeitmarker';
import AntragKnopf, { FreistellungKnopf } from '@/features/time/AntragKnopf';
import Gesamtsaldo from './Gesamtsaldo';
import { GrenzListe } from './ArbeitszeitGrenzenKarte';
import type { GrenzDaten } from './useArbeitszeitGrenzen';
import { kurzeZeit, tageDesMonats, tagKurz, type Tageswert } from './tagesauswertung';

/**
 * DAS SEITENFENSTER „PERSON IM MONAT“ (Runde 4, Auftrag 3.5) — es ersetzt die
 * aufgeklappte Karte der Liste.
 *
 * DER INHALT IST DER DER KARTE, Wortlaut und Zahlen zeichengleich: Saldo,
 * „hh:mm von hh:mm Soll bisher“, Gesamtsaldo, Resturlaub mit „Anspruch
 * angepasst“, die Zeile Krank/Urlaub/…, die Zeile Tagessoll/Wochenstunden/…
 * mit „laufend“, der Hinweis ohne Eintrittsdatum, die Tage ohne Buchung, der
 * Tagesnachweis mit seinen Aktionen je Art, „Monat als CSV“ und „Bericht für
 * Zeitraum“. Nur die Anordnung ist neu: Kennzahlen oben, Abschnitte darunter,
 * die Knöpfe in der Fussleiste.
 *
 * NEU, aber keine neue Funktion (Entscheidung R4-0, Frage 3): an jedem Tag
 * ohne Buchung „Zeit erfassen“ — dasselbe Formular wie die Hauptaktion, mit
 * Person und Tag vorbelegt.
 */
export default function PersonFenster({
  user: u,
  stats,
  completeness,
  monthEntries,
  monatsWerte,
  jahr,
  monat,
  monatsName,
  halbeTage,
  nacht,
  markiert,
  grenzDaten,
  companyId,
  onErfassen,
  onBearbeiten,
  onLoeschen,
  onMeldung,
  onKorrigieren,
  onCsv,
  onBericht,
}: {
  user: AppUser;
  stats: MonthStats;
  completeness: CompletenessResult;
  monthEntries: WithId<TimeEntry>[];
  /** Die Tagesauswertung des Monats (Streifen) — für das Soll je Tag und den markierten Tag. */
  monatsWerte: readonly Tageswert[];
  jahr: number;
  monat: number;
  monatsName: string;
  halbeTage: boolean;
  nacht: Nachtzeit;
  /** Der Tag, über den das Fenster geöffnet wurde. */
  markiert: string | null;
  grenzDaten: GrenzDaten;
  companyId: string;
  onErfassen: (tag: string | null) => void;
  onBearbeiten: (e: WithId<TimeEntry>) => void;
  onLoeschen: (e: WithId<TimeEntry>) => void;
  onMeldung: (id: string) => void;
  onKorrigieren: (e: WithId<TimeEntry>) => void;
  onCsv: () => void;
  onBericht: () => void;
}) {
  /*
    Traegt dieser Mitarbeiter ueberhaupt einen Saldo? Ohne hinterlegtes
    Eintrittsdatum laesst sich keines rechnen — das ist unten mit einem
    eigenen Hinweis erklaert.
  */
  const zeigtSaldo = stats.hasConfig;
  const markierterWert = markiert ? monatsWerte.find((t) => t.tag === markiert) : undefined;
  const behaelter = useRef<HTMLDivElement>(null);

  /*
    DER GEWÄHLTE TAG INS BILD. Über ein Feld geöffnet, ist die Zeile dieses
    Tages markiert; sie soll man sehen, ohne zu suchen.
  */
  useEffect(() => {
    if (!markiert) return;
    behaelter.current?.querySelector('[data-markiert="ja"]')?.scrollIntoView?.({ block: 'center' });
  }, [markiert]);

  const ueber = [einstufungText(u, markiert ?? `${jahr}-${String(monat + 1).padStart(2, '0')}-01`) || u.role, monatsName]
    .filter(Boolean)
    .join(' · ');

  /* Die Zeile Krank/Urlaub/…: dieselben Teile wie in der Karte, nur ohne den Resturlaub, der jetzt Kennzahl ist. */
  const teile: ReactNode[] = [
    <><b className="font-semibold text-ink">{stats.krankDays}</b> Tage krank</>,
    <><b className="font-semibold text-ink">{tageZahl(stats.urlaubDays)}</b> Tage Urlaub</>,
  ];
  if (stats.zaMin > 0) teile.push(<><b className="font-semibold text-ink">{fmtDauer(stats.zaMin)}</b> ZA</>);
  if (stats.berufsschuleDays > 0) teile.push(<><b className="font-semibold text-ink">{stats.berufsschuleDays}</b> Tage Berufsschule</>);
  if (stats.sonderurlaubDays > 0) teile.push(<><b className="font-semibold text-ink">{stats.sonderurlaubDays}</b> Tage Sonderurlaub</>);
  if (stats.pflegeDays > 0) teile.push(<><b className="font-semibold text-ink">{stats.pflegeDays}</b> Tage Pflegefreistellung</>);
  if (stats.freigestelltMin > 0) teile.push(<><b className="font-semibold text-ink">{fmtDauer(stats.freigestelltMin)}</b> freigestellt</>);
  if (stats.unbezahltDays > 0) teile.push(<><b className="font-semibold text-ink">{stats.unbezahltDays}</b> Tage unbezahlt</>);

  /*
    EINE ZEILE JE EINTRAG, nicht je Tag (aus dem Betrieb: „die zweite
    Zeitbuchung an einem Tag … wird in der Mitarbeiterübersicht nicht
    angezeigt“). Innerhalb eines Tages nach Beginn sortiert. Ein Feiertag
    ohne Buchung steht da, aber nicht vor dem Eintritt; eine BUCHUNG vor dem
    Eintritt bleibt stehen — sie ist eine Merkwürdigkeit, die man sehen soll.
  */
  type Tageszeile = { d: string; entry?: WithId<TimeEntry>; holiday: string | null; zeit: string | null };
  const days = tageDesMonats(jahr, monat).flatMap((d): Tageszeile[] => {
    const holiday = getAustrianHolidayName(new Date(`${d}T00:00:00`));
    const amTag = monthEntries
      .filter((e) => e.date === d)
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
    if (amTag.length === 0) {
      if (u.appStartDate && d < u.appStartDate) return [];
      return holiday ? [{ d, entry: undefined, holiday, zeit: null }] : [];
    }
    return amTag.map((entry) => ({
      d,
      entry,
      holiday,
      zeit: entry.startTime && entry.endTime ? `${entry.startTime}–${entry.endTime}` : null,
    }));
  });

  /* Die Art als Wort (Auftrag 3.3.1) — Abwesenheit und Feiertag als Marke, nicht als eingefärbte Zeile. */
  const status = (x: Tageszeile) =>
    !x.entry ? (
      <Marke>{x.holiday}</Marke>
    ) : x.entry.status === 'Anwesend' ? (
      <span className="text-ink-muted">Anwesend</span>
    ) : (
      <Marke>{tagesStatusName(x.entry.status)}</Marke>
    );

  /* Die Aktionen je Art — wie in der Karte. */
  const actions = (e: WithId<TimeEntry>) =>
    e.isBilled ? (
      // Verrechnete Einträge sind Rechnungsgrundlage und bleiben unangetastet.
      <Marke>verrechnet</Marke>
    ) : e.krankmeldungId ? (
      // Ein Tag einer Krankmeldung wird nur über sie geändert — Ende ändern oder löschen.
      <Button variant="ghost" onClick={() => onMeldung(e.krankmeldungId!)}>
        Krankmeldung
      </Button>
    ) : e.freistellungId ? (
      <FreistellungKnopf />
    ) : e.vacationId ? (
      // Ein Tag aus einem genehmigten Antrag ändert sich nur über den Antrag.
      <AntragKnopf eintrag={e} />
    ) : (
      <>
        <Button variant="ghost" onClick={() => onBearbeiten(e)}>
          Bearbeiten
        </Button>
        <Button variant="ghost" onClick={() => onLoeschen(e)}>
          Löschen
        </Button>
      </>
    );

  const eintraegeText = monthEntries.length === 1 ? '1 Eintrag' : `${monthEntries.length} Einträge`;
  const zukunftMarkiert = markierterWert && markierterWert.zustand === 'zukunft';

  return (
    <div ref={behaelter} className="pf">
      <p className="pf-ueber">{ueber}</p>

      {zukunftMarkiert && (
        <ul className="pf-liste">
          <li className="pf-zeile-markiert" data-markiert="ja">
            <span className="pf-zeile-text">
              <span className="pf-zeile-titel">{markierterWert.kurz}</span>
              <span className="pf-zeile-info">
                noch nichts gebucht
                {markierterWert.tagessollMin !== null && ` · Soll ${kurzeZeit(markierterWert.tagessollMin)}`}
              </span>
            </span>
            <Button variant="secondary" onClick={() => onErfassen(markierterWert.tag)}>
              Zeit erfassen
            </Button>
          </li>
        </ul>
      )}

      {/* Die Zahlen des Monats zuerst; wer das Fenster öffnet, will meist wissen, wie der Monat steht. */}
      <div className="pf-kennzahlen">
        <div className="pf-kennzahl">
          <p className="pf-kennzahl-name">{zeigtSaldo ? 'Saldo im Monat' : 'Gebucht im Monat'}</p>
          {/*
            RUHIG, NICHT KLEINER IN DER AUSSAGE (aus dem Betrieb, 24.09.2026:
            „der Saldo zu fett und gross, Rot auf Rot“): Tinte, halbfett, ohne
            Signalfarbe. Ohne Soll steht, was wirklich gemessen ist.
          */}
          <p className="mt-1 text-xl font-semibold leading-none text-ink">
            {zeigtSaldo ? `${stats.saldoMin > 0 ? '+' : ''}${fmtMin(stats.saldoMin)}` : fmtMin(stats.istMin)}
          </p>
        </div>
        {zeigtSaldo && (
          <div className="pf-kennzahl">
            <p className="pf-kennzahl-name">Gebucht</p>
            <p className="pf-kennzahl-text">
              {fmtMin(stats.istMin)} von {fmtMin(stats.sollMin)} Soll
              {stats.istLaufend && ' bisher'}
            </p>
          </div>
        )}
        {zeigtSaldo && u.appStartDate && (
          <div className="pf-kennzahl">
            <p className="pf-kennzahl-name">Gesamtsaldo</p>
            <Gesamtsaldo profil={u} halbeTage={halbeTage} />
          </div>
        )}
        <div className="pf-kennzahl">
          <p className="pf-kennzahl-name">Resturlaub</p>
          <p className="pf-kennzahl-text" data-testid="resturlaub">
            <b className={stats.urlaubRest < 5 ? 'font-semibold text-warning' : 'font-semibold text-ink'}>
              {tageZahl(stats.urlaubRest)}
            </b>{' '}
            Tage Resturlaub
            {stats.urlaubAngepasst !== 0 && <> (Anspruch angepasst: {vorzeichenTage(stats.urlaubAngepasst)})</>}
          </p>
        </div>
      </div>

      <p className="pf-text">
        {teile.map((t, i) => (
          <span key={i}>
            {i > 0 && ' · '}
            {t}
          </span>
        ))}
      </p>
      {/*
        DIE ZAHLEN BLEIBEN, DER ERKLAERSATZ STEHT IM „i“ (im Fenster bleibt es
        an seinem Platz). Übrig bleibt das Wort „laufend“.
      */}
      <p className="pf-text-klein">
        Tagessoll {fmtDauer(Math.round(stats.dailyTargetH * 60))} ·
        Wochenstunden {fmtDauer(Math.round(stats.weeklyTarget * 60))} ·{' '}
        {stats.requiredDays === 1 ? '1 Solltag' : `${tageZahl(stats.requiredDays)} Solltage`}
        {stats.holidaysInMonth > 0 &&
          ` · ${stats.holidaysInMonth === 1 ? '1 Feiertag' : `${stats.holidaysInMonth} Feiertage`}`}
        {stats.hasConfig && stats.istLaufend && (
          <>
            {' · laufend'}
            <InfoHint about="den laufenden Monat">
              Gezählt sind die Solltage bis gestern. Die Zahl wächst mit jedem
              Arbeitstag und ist erst nach Monatsende endgültig — ein Rückstand
              mitten im Monat ist deshalb noch keine Aussage.
            </InfoHint>
          </>
        )}
      </p>
      {!stats.hasConfig && (
        <div className="mt-2">
          <Hinweiszeile stufe="warn">
            <p>
              Für diesen Mitarbeiter ist kein Eintrittsdatum hinterlegt. Ohne das
              lässt sich kein Soll berechnen — die Zahlen oben sind deshalb kein
              Rückstand, sondern keine Aussage. Nachtragen in der
              Benutzerverwaltung.
            </p>
          </Hinweiszeile>
        </div>
      )}

      {completeness.missingCount > 0 && (
        <section aria-label="Arbeitstage ohne Buchung">
          <h3 className="pf-abschnitt">
            {completeness.missingCount === 1
              ? '1 Arbeitstag ohne Buchung'
              : `${completeness.missingCount} Arbeitstage ohne Buchung`}
          </h3>
          <ul className="pf-liste">
            {completeness.missingDates.map((d) => {
              const soll = monatsWerte.find((t) => t.tag === d)?.sollMin ?? null;
              const an = d === markiert;
              return (
                <li key={d} className={an ? 'pf-zeile-markiert' : 'pf-zeile'} data-markiert={an ? 'ja' : undefined}>
                  <span className="pf-zeile-text">
                    <span className="pf-zeile-titel">{tagKurz(d)}</span>
                    {soll !== null && <span className="pf-zeile-info">Soll {kurzeZeit(soll)}</span>}
                  </span>
                  <Button variant="secondary" onClick={() => onErfassen(d)} aria-label={`Zeit erfassen für ${tagKurz(d)}`}>
                    Zeit erfassen
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {grenzDaten.stand && grenzDaten.stand.faelle.some(({ person }) => person.uid === u.uid) && (
        <section aria-label="Arbeitszeitgrenzen dieser Person">
          <h3 className="pf-abschnitt">Arbeitszeitgrenzen</h3>
          <GrenzListe companyId={companyId} daten={grenzDaten} onKorrigieren={onKorrigieren} nurPerson={u.uid} />
        </section>
      )}

      <section aria-label="Tagesnachweis">
        <h3 className="pf-abschnitt">
          Tagesnachweis · <span className="whitespace-nowrap">{eintraegeText}</span>
        </h3>
        <ul className="pf-liste" aria-label={`Tagesnachweis ${u.name}`}>
          {days.map((x) => {
            const an = x.d === markiert;
            return (
              // Der Schlüssel hängt am EINTRAG: zwei Buchungen desselben Tages hätten sonst denselben.
              <li key={x.entry?.id ?? x.d} className={an ? 'pf-zeile-markiert' : 'pf-zeile'} data-markiert={an ? 'ja' : undefined}>
                <span className="pf-zeile-text">
                  <span className="pf-zeile-kopf">
                    <span className="pf-zeile-titel">{tagKurz(x.d)}</span>
                    {status(x)}
                    {/* Notdienst und Nachtarbeit gehören NEBEN den Status: sie hängen an einem Zuschlag. */}
                    {x.entry && <Zeitmarker eintrag={x.entry} nacht={nacht} />}
                  </span>
                  {x.entry && (
                    <span className="pf-zeile-info">
                      <span>{x.zeit ?? '—'}</span>
                      {' · '}
                      <span>{x.entry.customerName ?? '—'}</span>
                    </span>
                  )}
                </span>
                <span className="pf-zeile-wert">{x.entry ? fmtMin(calcWorkMin(x.entry)) : '—'}</span>
                {x.entry && <span className="pf-aktionen">{actions(x.entry)}</span>}
              </li>
            );
          })}
          <li className="pf-summe">
            <span>{eintraegeText}</span>
            <span>{fmtMin(stats.istMin)}</span>
          </li>
        </ul>
      </section>

      <div className="pf-fuss">
        <Button variant="secondary" onClick={onCsv}>
          Monat als CSV
        </Button>
        <Button variant="secondary" onClick={onBericht}>
          Bericht für Zeitraum
        </Button>
        <Button variant="primary" onClick={() => onErfassen(null)}>
          Zeit erfassen
        </Button>
      </div>
    </div>
  );
}
