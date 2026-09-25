import { Link } from 'react-router-dom';
import Card from '@/components/Card';
import { List, ListRow } from '@/components/ListRow';
import { EmptyState } from '@/components/States';
import { Marke } from '@/components/Badge';
import { KontaktZeile } from '@/components/Kontakt';
import RuestlisteAbhaken from '@/features/assignments/RuestlisteAbhaken';
import { fmtDauer, fmtMin, tageWort } from '@/lib/time';
import type { EinsatzMaterial, RuestPosition } from '@/types';

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
  material?: RuestPosition[];
  geladen?: NonNullable<EinsatzMaterial['geladen']>;
}

/** Der zuletzt gebuchte Arbeitstag — Vorlage für „Wie zuletzt“. */
export interface LetzteBuchung {
  startTime: string;
  endTime: string;
  breakDuration: number;
  minuten: number;
  projectNumber?: string;
}

/**
 * DIE STARTSEITE DES MONTEURS — höchstens drei Karten.
 *
 * Aufbau nach dem Entwurf „Monteur-Start“ (Design-Durchgang 25.09.2026):
 *
 *   Heute           wohin (Baustelle, Nummer, Aufgabe), hinfahren, anrufen,
 *                   was mitzunehmen ist — und als Hauptknopf das bestehende
 *                   „Wie zuletzt“, sonst „Zeit erfassen“
 *   Diese Woche     gebuchte Stunden gegen das Wochensoll, Saldo des Monats
 *   Offen für dich  was noch zu tun ist — oder eine ruhige Zeile
 *
 * ES SIND NUR DATEN, DIE DIE STARTSEITE SCHON LÄDT: eigene Buchungen der
 * letzten Wochen, das Profil, die heutigen Einsätze, die eigenen offenen
 * Anforderungen. Stunden und Saldo rechnet dieselbe Funktion wie in der
 * Zeiterfassung und der Mitarbeiterübersicht.
 */
export default function MonteurStart({
  einsaetze,
  letzte,
  woche,
  monat,
  fehlendeTage,
  offeneAnforderungen,
  scheineAn,
  materialAn,
}: {
  einsaetze: HeuteEinsatz[];
  letzte?: LetzteBuchung;
  /** Gebuchte Minuten dieser Woche und das Wochensoll in Minuten. */
  woche?: { istMin: number; sollMin: number };
  /** Saldo des laufenden Monats; `null`, wenn kein Eintritt hinterlegt ist. */
  monat?: { name: string; saldoMin: number | null };
  fehlendeTage: string[];
  offeneAnforderungen?: number;
  scheineAn: boolean;
  materialAn: boolean;
}) {
  const offenes =
    fehlendeTage.length > 0 || (materialAn && (offeneAnforderungen ?? 0) > 0);

  return (
    <div className="monteur-start">
      <Card
        title={
          einsaetze.length > 1 ? `Heute — ${einsaetze.length} Baustellen` : 'Heute'
        }
        action={
          <Link to="/my-schedule" className="textlink-allein">
            Mein Einsatzplan
          </Link>
        }
      >
        {einsaetze.length === 0 ? (
          <>
            <EmptyState>Heute ist kein Einsatz eingeplant.</EmptyState>
            <HauptKnopf letzte={letzte} />
          </>
        ) : (
          <div className="monteur-einsaetze">
            {einsaetze.map((e) => {
              /*
                „WIE ZULETZT“ NUR, WENN ES DIESELBE BAUSTELLE IST.

                Der bestehende Knopf übernimmt Zeiten, Pause UND Baustelle vom
                letzten Eintrag. Stünde er an einem Einsatz auf einer anderen
                Baustelle, buchte ein Tipp die gestrige Baustelle auf den
                heutigen Tag — genau der Fehler, den ein Hauptknopf nicht
                machen darf. Dann ist „Zeit erfassen“ mit der Baustelle des
                Einsatzes die Hauptaktion.
              */
              const wieZuletzt = !!letzte && letzte.projectNumber === e.projectNumber;
              return (
                <div key={e.id} className="kasten-hell">
                  <p className="monteur-kunde">
                    {e.customerName}
                    {e.asHelper && <Marke>Helfer</Marke>}
                  </p>
                  <p className="monteur-auftrag">
                    {e.projectNumber}
                    {e.comment ? ` · ${e.comment}` : ''}
                  </p>
                  <KontaktZeile
                    adresse={e.address}
                    nummer={e.contactPhone}
                    name={e.contactName}
                    className="mt-3"
                  />
                  {materialAn && e.material && e.material.length > 0 && (
                    <RuestlisteAbhaken
                      date={e.date}
                      projectNumber={e.projectNumber}
                      positionen={e.material}
                      geladen={e.geladen ?? {}}
                    />
                  )}
                  <div className="monteur-knoepfe">
                    {wieZuletzt && letzte ? (
                      <Link
                        to="/time"
                        state={{ projectNumber: e.projectNumber, asHelper: e.asHelper, wieZuletzt: true }}
                        className="monteur-hauptknopf"
                      >
                        <span>Wie zuletzt buchen</span>
                        <span className="monteur-hauptknopf-zeile">{zuletztZeile(letzte)}</span>
                      </Link>
                    ) : (
                      <Link
                        to="/time"
                        state={{ projectNumber: e.projectNumber, asHelper: e.asHelper }}
                        className="monteur-hauptknopf"
                      >
                        Zeit erfassen
                      </Link>
                    )}
                    <div className="monteur-nebenknoepfe">
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="monteur-seite">
        {woche && (
          <Card title="Diese Woche">
            <p className="monteur-woche">
              <span className="monteur-woche-ist">{fmtMin(woche.istMin)}</span> von{' '}
              {fmtDauer(woche.sollMin)}
            </p>
            {monat && monat.saldoMin !== null && (
              <p className="monteur-saldo">
                <span>Saldo {monat.name}</span>
                <span className={monat.saldoMin < 0 ? 'monteur-saldo-minus' : 'monteur-saldo-plus'}>
                  {monat.saldoMin > 0 ? '+' : monat.saldoMin < 0 ? '−' : ''}
                  {fmtMin(Math.abs(monat.saldoMin))}
                </span>
              </p>
            )}
          </Card>
        )}

        <Card title="Offen für dich">
          {offenes ? (
            <List>
              {fehlendeTage.length > 0 && (
                <ListRow
                  title={
                    <Link to="/time" className="textlink">
                      {fehlendeTage.length === 1
                        ? 'Ein Tag ohne Buchung'
                        : `${tageWort(fehlendeTage.length)} ohne Buchung`}
                    </Link>
                  }
                  subtitle="In der Zeiterfassung nachtragen"
                />
              )}
              {materialAn && (offeneAnforderungen ?? 0) > 0 && (
                <ListRow
                  title={
                    <Link to="/material" className="textlink">
                      Material angefordert
                    </Link>
                  }
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
  );
}

/** „07:00–16:00 · 30 min Pause · 08:30 Std“ — was der Knopf übernimmt. */
function zuletztZeile(l: LetzteBuchung): string {
  return `${l.startTime}–${l.endTime} · ${l.breakDuration} min Pause · ${fmtDauer(l.minuten)}`;
}

/** Ohne Einsatz: „Wie zuletzt“, wenn es eine Vorlage gibt, sonst „Zeit erfassen“. */
function HauptKnopf({ letzte }: { letzte?: LetzteBuchung }) {
  if (!letzte) {
    return (
      <Link to="/time" className="monteur-hauptknopf">
        Zeit erfassen
      </Link>
    );
  }
  return (
    <Link to="/time" state={{ wieZuletzt: true }} className="monteur-hauptknopf">
      <span>Wie zuletzt buchen</span>
      <span className="monteur-hauptknopf-zeile">{zuletztZeile(letzte)}</span>
    </Link>
  );
}
