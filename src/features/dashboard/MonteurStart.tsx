import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Card from '@/components/Card';
import { List, ListRow } from '@/components/ListRow';
import Grenzliste from '@/components/Grenzliste';
import { EmptyState } from '@/components/States';
import { Marke } from '@/components/Badge';
import { KontaktZeile } from '@/components/Kontakt';
import RuestlisteAbhaken from '@/features/assignments/RuestlisteAbhaken';
import { fmtDauer, fmtMin, tageWort, todayStr } from '@/lib/time';
import type { EinsatzMaterial, Project, RuestPosition } from '@/types';

/** Ein heutiger Einsatz, wie ihn die Startseite geladen hat. */
export interface HeuteEinsatz {
  id: string;
  date: string;
  projectNumber: string;
  customerName: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  asHelper: boolean;
  comment?: string;
  /** Die Abrechnungsart der Baustelle — aus der ohnehin geladenen Baustelle. */
  billingMode?: Project['billingMode'];
  material?: RuestPosition[];
  geladen?: NonNullable<EinsatzMaterial['geladen']>;
}

/** Ein kommender Einsatz — dieselben Angaben wie in „Mein Einsatzplan“. */
export interface NaechsterEinsatz {
  id: string;
  date: string;
  projectNumber: string;
  customerName?: string;
  address?: string;
  comment?: string;
  asHelper: boolean;
}

/** Der zuletzt gebuchte Arbeitstag — Vorlage für „Wie zuletzt“. */
export interface LetzteBuchung {
  startTime: string;
  endTime: string;
  breakDuration: number;
  minuten: number;
  projectNumber?: string;
}

/** Ein Tag der laufenden Woche: gebucht und Soll, beides in Minuten. */
export interface WochenTag {
  datum: string;
  istMin: number;
  sollMin: number;
}

/**
 * Wie viele kommende Einsätze die Startseite nennt. Die Frage hier ist „wo
 * muss ich als Nächstes hin?“ — die ganze Liste steht im Einsatzplan.
 */
const NAECHSTE_AUF_STARTSEITE = 3;

/**
 * DIE STARTSEITE DES MONTEURS — nach dem Entwurf „Monteur-Start“ (Mockup
 * S. 1 und 7, docs/design/linie.md 9):
 *
 *   Heute             wohin (Baustelle, Nummer, Aufgabe), hinfahren,
 *                     anrufen, was mitzunehmen ist — und als Hauptknopf das
 *                     bestehende „Wie zuletzt“, sonst „Zeit erfassen“
 *   Diese Woche       gebuchte Stunden je Tag gegen das Soll, Saldo des Monats
 *   Offen für dich    was noch zu tun ist — oder eine ruhige Zeile
 *   Nächste Einsätze  die kommenden Tage, der Weg in den Einsatzplan
 *
 * Am Telefon untereinander in genau dieser Reihenfolge; ab 1280 px links
 * Heute und Offen, rechts Woche und Nächste (Mockup S. 7). Im DOM stehen die
 * beiden Spalten nacheinander, am Telefon löst `display: contents` sie auf
 * und `order` setzt die Karten in die Reihenfolge des Entwurfs.
 *
 * ES SIND NUR DATEN, DIE DIE STARTSEITE SCHON LÄDT: eigene Buchungen der
 * letzten Wochen, das Profil, die eigenen kommenden Einsätze mit ihren
 * Baustellen (dieselben Abfragen wie „Mein Einsatzplan“), die eigenen
 * offenen Anforderungen. Stunden und Saldo rechnet dieselbe Funktion wie in
 * der Zeiterfassung und der Mitarbeiterübersicht.
 */
export default function MonteurStart({
  einsaetze,
  letzte,
  woche,
  monat,
  fehlendeTage,
  offeneAnforderungen,
  naechste,
  hinweis,
  scheineAn,
  materialAn,
}: {
  einsaetze: HeuteEinsatz[];
  letzte?: LetzteBuchung;
  /** Gebuchte Minuten dieser Woche, das Wochensoll und die Tage Mo–Fr. */
  woche?: { istMin: number; sollMin: number; tage?: WochenTag[] };
  /** Saldo des laufenden Monats; `null`, wenn kein Eintritt hinterlegt ist. */
  monat?: { name: string; saldoMin: number | null };
  fehlendeTage: string[];
  offeneAnforderungen?: number;
  /** Die kommenden Einsätze ab morgen; `undefined`, solange nicht geladen. */
  naechste?: NaechsterEinsatz[];
  /** Eine Meldung, die unter „Heute“ gehört (etwa: kein Eintrittsdatum). */
  hinweis?: ReactNode;
  scheineAn: boolean;
  materialAn: boolean;
}) {
  const offenes =
    fehlendeTage.length > 0 || (materialAn && (offeneAnforderungen ?? 0) > 0);

  return (
    <div className="start-raster">
      <div className="start-spalte-links">
        <div className="start-heute">
          <HeuteKarte
            einsaetze={einsaetze}
            letzte={letzte}
            scheineAn={scheineAn}
            materialAn={materialAn}
          />
        </div>

        {hinweis && <div className="start-hinweis">{hinweis}</div>}

        <div className="start-offen">
          <Card title="Offen für dich">
            {offenes ? (
              <List>
                {fehlendeTage.length > 0 && (
                  <ListRow
                    ziel="/time"
                    title={
                      fehlendeTage.length === 1
                        ? 'Ein Tag ohne Buchung'
                        : `${tageWort(fehlendeTage.length)} ohne Buchung`
                    }
                    subtitle={
                      /* Die Tage selbst, nicht nur die Zahl — „3 Tage fehlen"
                         zwingt zum Suchen, welche. Die letzten fünf, wie bisher. */
                      <>
                        {fehlendeTage.slice(-5).map(tagKurz).join(', ')}
                        {fehlendeTage.length > 5 && ` und ${fehlendeTage.length - 5} weitere`}
                      </>
                    }
                  />
                )}
                {materialAn && (offeneAnforderungen ?? 0) > 0 && (
                  <ListRow
                    ziel="/material"
                    title="Material angefordert"
                    subtitle="Noch nicht abgeschlossen"
                    wert={offeneAnforderungen}
                  />
                )}
              </List>
            ) : (
              <EmptyState>Alles erledigt.</EmptyState>
            )}
          </Card>
        </div>
      </div>

      <div className="start-spalte-rechts">
        {woche && (
          <div className="start-woche">
            <Card
              title="Diese Woche"
              action={
                <p className="woche-summe">
                  <span className="woche-summe-ist">{fmtMin(woche.istMin)}</span> von{' '}
                  {fmtDauer(woche.sollMin)}
                </p>
              }
            >
              {woche.tage && woche.tage.length > 0 && <WochenBalken tage={woche.tage} />}
              {monat && monat.saldoMin !== null && (
                <p className="woche-saldo">
                  <span>Saldo {monat.name}</span>
                  <span className={monat.saldoMin < 0 ? 'woche-saldo-minus' : 'woche-saldo-plus'}>
                    {monat.saldoMin > 0 ? '+' : monat.saldoMin < 0 ? '−' : ''}
                    {fmtMin(Math.abs(monat.saldoMin))}
                  </span>
                </p>
              )}
            </Card>
          </div>
        )}

        {naechste && (
          <div className="start-naechste">
            <Card
              title="Nächste Einsätze"
              action={
                <Link to="/my-schedule" className="textlink-allein">
                  Mein Einsatzplan
                </Link>
              }
            >
              {naechste.length === 0 ? (
                <EmptyState>Zurzeit ist nichts weiter eingeplant.</EmptyState>
              ) : (
                <Grenzliste
                  eintraege={naechste}
                  grenze={NAECHSTE_AUF_STARTSEITE}
                  mehr={{ to: '/my-schedule' }}
                  nachsatz="— im Einsatzplan."
                  zeile={(a) => (
                    <ListRow
                      key={a.id}
                      vorne={<Datumskachel iso={a.date} />}
                      title={
                        a.customerName ? `${a.customerName} · ${a.projectNumber}` : a.projectNumber
                      }
                      subtitle={[a.comment, a.address].filter(Boolean).join(' · ') || undefined}
                      zustand={a.asHelper ? <Marke>Helfer</Marke> : undefined}
                    />
                  )}
                />
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * DIE HEUTE-KARTE — am Monteur-Start und auf der Startseite aller anderen,
 * die heute selbst eingeteilt sind: dieselbe Karte, eine Linie.
 */
export function HeuteKarte({
  einsaetze,
  letzte,
  scheineAn,
  materialAn,
  aktion,
}: {
  einsaetze: HeuteEinsatz[];
  letzte?: LetzteBuchung;
  scheineAn: boolean;
  materialAn: boolean;
  /** Rechts in der Kopfzeile, etwa der Weg in den Einsatzplan. */
  aktion?: ReactNode;
}) {
  const einer = einsaetze.length === 1 ? einsaetze[0] : undefined;
  /*
    OHNE KARTENKOPF: die Zeile „Heute“ steht klein in Akzent über dem
    Kunden, rechts die Abrechnungsart (Mockup S. 1). Eine Uhrzeit („Heute ab
    07:00“) kennt der Einsatz nicht — sie wird nicht erfunden.
  */
  return (
    <Card>
      <div className="heute-kopf">
        <h2 className="heute-titel">
          {einsaetze.length > 1 ? `Heute — ${einsaetze.length} Baustellen` : 'Heute'}
        </h2>
        {einer && <EinsatzMarken e={einer} />}
        {aktion}
      </div>
      {einsaetze.length === 0 ? (
        <>
          <EmptyState>Heute ist kein Einsatz eingeplant.</EmptyState>
          <div className="einsatz-knoepfe">
            <HauptKnopf letzte={letzte} />
          </div>
        </>
      ) : (
        /*
          MEHRERE EINSÄTZE: je einer ein Abschnitt, getrennt durch eine
          Haarlinie — kein Kasten in der Karte (Linie 2).
        */
        einsaetze.map((e, i) => (
          <Fragment key={e.id}>
            {i > 0 && <hr className="einsatz-trenner" />}
            <EinsatzAbschnitt
              e={e}
              letzte={letzte}
              marken={einsaetze.length > 1}
              scheineAn={scheineAn}
              materialAn={materialAn}
            />
          </Fragment>
        ))
      )}
    </Card>
  );
}

/** Helfer und Abrechnungsart — Tatsachen ohne Urteil, deshalb Marken. */
function EinsatzMarken({ e }: { e: HeuteEinsatz }) {
  if (!e.asHelper && !e.billingMode) return null;
  return (
    <span className="einsatz-marken">
      {e.asHelper && <Marke>Helfer</Marke>}
      {e.billingMode && <Marke>{e.billingMode}</Marke>}
    </span>
  );
}

/**
 * Ein Einsatz von heute: Kunde groß, darunter „Nummer · Aufgabe“, Adresse
 * und Kontakt als Chips, was mitzunehmen ist, dann die Knöpfe.
 */
function EinsatzAbschnitt({
  e,
  letzte,
  marken,
  scheineAn,
  materialAn,
}: {
  e: HeuteEinsatz;
  letzte?: LetzteBuchung;
  /** Bei mehreren Einsätzen stehen die Marken am Einsatz, nicht im Kopf. */
  marken: boolean;
  scheineAn: boolean;
  materialAn: boolean;
}) {
  /*
    „WIE ZULETZT“ NUR, WENN ES DIESELBE BAUSTELLE IST.

    Der bestehende Knopf übernimmt Zeiten, Pause UND Baustelle vom letzten
    Eintrag. Stünde er an einem Einsatz auf einer anderen Baustelle, buchte
    ein Tipp die gestrige Baustelle auf den heutigen Tag — genau der Fehler,
    den ein Hauptknopf nicht machen darf. Dann ist „Zeit erfassen“ mit der
    Baustelle des Einsatzes die Hauptaktion.
  */
  const wieZuletzt = !!letzte && letzte.projectNumber === e.projectNumber;
  return (
    <div>
      <p className="einsatz-kunde">{e.customerName}</p>
      <div className="einsatz-meta">
        <p className="einsatz-auftrag">
          {e.projectNumber}
          {/* Die Aufgabe als eigenes Stück: sie unterscheidet zwei Einsätze am
              selben Tag („Bad, Vormittag"). */}
          {e.comment && (
            <>
              {' · '}
              <span>{e.comment}</span>
            </>
          )}
        </p>
        {marken && <EinsatzMarken e={e} />}
      </div>
      <KontaktZeile
        adresse={e.address}
        nummer={e.contactPhone}
        name={e.contactName}
        className="mt-4"
      />
      {/* Was mitzunehmen ist — unter der Adresse, über den Knöpfen: die
          Reihenfolge des Morgens (wohin, was mit, dann losfahren). */}
      {materialAn && e.material && e.material.length > 0 && (
        <RuestlisteAbhaken
          date={e.date}
          projectNumber={e.projectNumber}
          positionen={e.material}
          geladen={e.geladen ?? {}}
        />
      )}
      {/*
        Am Telefon der Hauptknopf über die volle Breite, darunter „Andere
        Zeit“ und „Schein schreiben“ nebeneinander; am Schreibtisch alle in
        einer Reihe, „Schein schreiben“ neben dem Hauptknopf (Mockup S. 7).
      */}
      <div className="einsatz-knoepfe">
        {wieZuletzt && letzte ? (
          <Link
            to="/time"
            state={{ projectNumber: e.projectNumber, asHelper: e.asHelper, wieZuletzt: true }}
            className="einsatz-hauptknopf"
          >
            <span>Wie zuletzt buchen</span>
            <span className="einsatz-hauptknopf-zeile">{zuletztZeile(letzte)}</span>
          </Link>
        ) : (
          <Link
            to="/time"
            state={{ projectNumber: e.projectNumber, asHelper: e.asHelper }}
            className="einsatz-hauptknopf"
          >
            Zeit erfassen
          </Link>
        )}
        {(wieZuletzt || scheineAn) && (
          <div className="einsatz-nebenknoepfe">
            {wieZuletzt && (
              <Link
                to="/time"
                state={{ projectNumber: e.projectNumber, asHelper: e.asHelper }}
                className="knopf-sekundaer"
              >
                Andere Zeit
              </Link>
            )}
            {scheineAn && (
              <Link
                to={`/worksheet?projekt=${encodeURIComponent(e.projectNumber)}`}
                className="knopf-sekundaer"
              >
                Schein schreiben
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** „Mo“ aus einem Datum — ohne den Punkt, den `de-AT` anhängt. */
function wochentagKurz(d: Date): string {
  return d.toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', '');
}

/**
 * DIE WOCHE ALS BALKEN, Mo–Fr (Mockup S. 1, 7).
 *
 * Die Höhe misst am Tagessoll: ein voller Tag reicht bis oben. Wer mehr
 * gebucht hat, bekommt den höheren Balken, und die anderen richten sich an
 * ihm aus — abgeschnitten wird nichts. Heute steht als Rahmen in der Höhe
 * des Solls, gefüllt, so weit schon gebucht ist; ein Tag ohne Buchung ist
 * eine flache Linie.
 *
 * Für die Vorlesehilfe ist es eine Liste mit Text je Tag; die Zeichnung ist
 * ausgeblendet.
 */
function WochenBalken({ tage }: { tage: WochenTag[] }) {
  const heute = todayStr();
  const skala = Math.max(1, ...tage.map((t) => Math.max(t.sollMin, t.istMin)));
  const anteil = (min: number, von: number) => `${Math.round((min / von) * 100)}%`;
  return (
    <ol className="woche-tage" aria-label="Gebuchte Stunden je Tag">
      {tage.map((t) => {
        const d = new Date(`${t.datum}T00:00:00`);
        const istHeute = t.datum === heute;
        const rahmen = Math.max(t.sollMin, t.istMin);
        return (
          <li key={t.datum} className="woche-tag">
            <span className="sr-only">
              {d.toLocaleDateString('de-AT', { weekday: 'long' })}
              {istHeute && ' (heute)'}: {t.istMin > 0 ? fmtDauer(t.istMin) : 'nichts gebucht'}
            </span>
            <span className={istHeute ? 'woche-wert-heute' : 'woche-wert'} aria-hidden="true">
              {t.istMin > 0 ? fmtMin(t.istMin) : istHeute ? 'heute' : '–'}
            </span>
            <span className="woche-saeule" aria-hidden="true">
              {istHeute ? (
                <span
                  className="woche-rahmen-heute"
                  style={{ height: rahmen > 0 ? anteil(rahmen, skala) : '100%' }}
                >
                  {t.istMin > 0 && (
                    <span className="woche-balken" style={{ height: anteil(t.istMin, rahmen) }} />
                  )}
                </span>
              ) : t.istMin > 0 ? (
                <span className="woche-balken" style={{ height: anteil(t.istMin, skala) }} />
              ) : (
                <span className="woche-leer" />
              )}
            </span>
            <span className={istHeute ? 'woche-tagname-heute' : 'woche-tagname'} aria-hidden="true">
              {wochentagKurz(d)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Die Datumskachel vor einem kommenden Einsatz: Wochentag klein, Tag groß,
 * auf deckender heller Fläche (Mockup S. 7) — kein Symbol, keine Farbe.
 */
function Datumskachel({ iso }: { iso: string }) {
  const d = new Date(`${iso}T00:00:00`);
  return (
    <span className="datumskachel">
      <span className="datumskachel-tag" aria-hidden="true">{wochentagKurz(d)}</span>
      <span className="datumskachel-zahl" aria-hidden="true">{d.getDate()}</span>
      <span className="sr-only">{tagKurz(iso)}</span>
    </span>
  );
}

/** „Fr., 18.09.“ — Wochentag und Tag, wie in der bisherigen Meldung. */
function tagKurz(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

/** „07:00–16:00 · 30 min Pause · 08:30 Std“ — was der Knopf übernimmt. */
function zuletztZeile(l: LetzteBuchung): string {
  return `${l.startTime}–${l.endTime} · ${l.breakDuration} min Pause · ${fmtDauer(l.minuten)}`;
}

/** Ohne Einsatz: „Wie zuletzt“, wenn es eine Vorlage gibt, sonst „Zeit erfassen“. */
function HauptKnopf({ letzte }: { letzte?: LetzteBuchung }) {
  if (!letzte) {
    return (
      <Link to="/time" className="einsatz-hauptknopf">
        Zeit erfassen
      </Link>
    );
  }
  return (
    <Link to="/time" state={{ wieZuletzt: true }} className="einsatz-hauptknopf">
      <span>Wie zuletzt buchen</span>
      <span className="einsatz-hauptknopf-zeile">{zuletztZeile(letzte)}</span>
    </Link>
  );
}
