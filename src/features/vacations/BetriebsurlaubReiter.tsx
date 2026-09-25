import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AppUser, Betriebsurlaub } from '@/types';
import type { WithId } from '@/lib/db/core';
import { listUsers } from '@/lib/db/users';
import {
  betriebsurlaubAnlegen,
  betriebsurlaubLoeschen,
  listBetriebsurlaubeAb,
} from '@/lib/db/abwesenheiten';
import { localDateStr, todayStr } from '@/lib/time';
import Card from '@/components/Card';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import InfoHint from '@/components/InfoHint';
import { Marke } from '@/components/Badge';
import { CheckboxField, InputField, FormGrid } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { zeitraumText } from './abwesenheitText';
import { grundAus } from '@/lib/fehlerGrund';

/**
 * Betriebsurlaub — der Betrieb hat zu.
 *
 * Er sperrt die Planung (Wochenplan grau, Warnung in der Einsatzplanung und
 * bei Baustellendaten) und bucht auf Wunsch jedem aktiven Mitarbeiter die
 * Arbeitstage als Urlaub. Löschen nimmt genau das wieder zurück.
 *
 * AUSNAHMEN (seit 24.09.2026, gewünscht vom Betrieb): wer in der Zeit
 * arbeitet — Notdienst, Lager —, wird beim Anlegen ausgenommen. Er bekommt
 * keinen Urlaub gebucht und gilt in der Planung als verfügbar.
 */
export default function BetriebsurlaubReiter({ companyId, meinName }: { companyId: string; meinName: string }) {
  const toast = useToast();
  const [liste, setListe] = useState<WithId<Betriebsurlaub>[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [stand, setStand] = useState(0);

  const [bezeichnung, setBezeichnung] = useState('Betriebsurlaub');
  const [von, setVon] = useState(todayStr());
  const [bis, setBis] = useState(todayStr());
  const [abbuchen, setAbbuchen] = useState(true);
  const [fragen, setFragen] = useState(false);
  const [loeschen, setLoeschen] = useState<WithId<Betriebsurlaub> | null>(null);
  const [leute, setLeute] = useState<AppUser[]>([]);
  const [ausgenommen, setAusgenommen] = useState<string[]>([]);
  // Zugeklappt: meistens hat der ganze Betrieb zu, und die Liste aller
  // Mitarbeiter wäre dann nur Länge.
  const [ausnahmenOffen, setAusnahmenOffen] = useState(false);

  useEffect(() => {
    let weg = false;
    listUsers(companyId)
      .then((l) => {
        if (!weg) {
          setLeute(
            l.filter((u) => u.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'de')),
          );
        }
      })
      // Ohne die Liste lässt sich niemand ausnehmen — anlegen geht trotzdem.
      .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, [companyId]);

  const nameVon = (uid: string) => leute.find((u) => u.uid === uid)?.name ?? 'ehemaliger Mitarbeiter';
  const ausgenommenText = ausgenommen.map(nameVon).join(', ');

  // Ein Jahr zurück: ein gelöschter Betriebsurlaub bucht auch rückwirkend
  // aus, und wer im Jänner den Weihnachtsurlaub korrigiert, braucht ihn noch.
  const ab = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return localDateStr(d);
  }, []);

  useEffect(() => {
    let weg = false;
    setLaden(true);
    listBetriebsurlaubeAb(companyId, ab)
      .then((l) => {
        if (!weg) setListe(l);
      })
      .catch(() => {
        if (!weg) setFehler('Die Betriebsurlaube konnten nicht geladen werden.');
      })
      .finally(() => {
        if (!weg) setLaden(false);
      });
    return () => {
      weg = true;
    };
  }, [companyId, ab, stand]);

  function pruefen(e: FormEvent) {
    e.preventDefault();
    if (bis < von) {
      setFehler('Das Ende liegt vor dem Beginn.');
      return;
    }
    setFehler(null);
    setFragen(true);
  }

  async function anlegen() {
    setFragen(false);
    try {
      const r = await betriebsurlaubAnlegen({
        von, bis, bezeichnung: bezeichnung.trim() || 'Betriebsurlaub', abbuchen, name: meinName,
        ausgenommen,
      });
      toast.success(
        abbuchen
          ? `Betriebsurlaub angelegt — ${r.tage} ${r.tage === 1 ? 'Urlaubstag' : 'Urlaubstage'} für ${r.mitarbeiter} Mitarbeiter gebucht${r.uebersprungen ? `, ${r.uebersprungen} übersprungen (dort war schon gebucht)` : ''}`
          : 'Betriebsurlaub angelegt — die Planung ist gesperrt, gebucht wurde nichts',
      );
      setAusgenommen([]);
      setStand((n) => n + 1);
    } catch (err) {
      setFehler(grundAus(err, 'Der Betriebsurlaub konnte nicht angelegt werden.'));
    }
  }

  async function loeschenBestaetigt(b: WithId<Betriebsurlaub>) {
    setLoeschen(null);
    try {
      const r = await betriebsurlaubLoeschen(b.id);
      toast.success(
        r.tage
          ? `Betriebsurlaub gelöscht — ${r.tage} Urlaubstage bei ${r.mitarbeiter} Mitarbeitern zurückgenommen`
          : 'Betriebsurlaub gelöscht',
      );
      setStand((n) => n + 1);
    } catch (err) {
      setFehler(grundAus(err, 'Der Betriebsurlaub konnte nicht gelöscht werden.'));
    }
  }

  return (
    <div className="space-y-6">
      {fehler && <ErrorState message={fehler} />}
      <Card
        title="Betriebsurlaub anlegen"
        hint={
          <>
            Der Zeitraum steht im Wochenplan als „Betriebsurlaub", und wer im Zeitraum einen
            Einsatz plant oder eine Baustelle terminiert, bekommt eine Warnung. Ändern heisst:
            löschen und neu anlegen.
          </>
        }
      >
        <form onSubmit={pruefen} className="space-y-4">
          <InputField
            id="bu-bezeichnung"
            label="Bezeichnung"
            value={bezeichnung}
            onChange={(e) => setBezeichnung(e.target.value)}
            pflicht
          />
          <FormGrid>
            <InputField
              id="bu-von"
              label="Von"
              type="date"
              value={von}
              onChange={(e) => {
                setVon(e.target.value);
                if (bis < e.target.value) setBis(e.target.value);
              }}
              pflicht
            />
            <InputField
              id="bu-bis"
              label="Bis (einschließlich)"
              type="date"
              value={bis}
              min={von}
              onChange={(e) => setBis(e.target.value)}
              pflicht
            />
          </FormGrid>
          {/*
            UMBRECHEN UND DEM HAKEN DEN RAUM LASSEN. Ohne `flex-wrap` stand der
            aufgeklappte Text als schmale Spalte neben dem Haken, ein Wort je
            Zeile (Rückmeldung 24.09.2026); ohne `min-w-0 flex-1` rutschte das
            „i" allein unter die Beschriftung.
          */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <CheckboxField
                id="bu-abbuchen"
                label="Urlaubskonto aller aktiven Mitarbeiter belasten"
                checked={abbuchen}
                onChange={(e) => setAbbuchen(e.target.checked)}
              />
            </div>
            <InfoHint about="Urlaubskonto belasten">
              Mit Häkchen bekommt jeder aktive Mitarbeiter die Arbeitstage des Zeitraums als
              genehmigten Urlaub gebucht — nach seinen eigenen Arbeitstagen, ohne Feiertage. Tage, an
              denen schon etwas gebucht ist (etwa ein Notdienst), bleiben unangetastet und werden
              nicht abgezogen. Gezählt wird ab dem Starttag jedes Mitarbeiters; wer später
              eintritt oder wieder aktiv wird, bekommt den Betriebsurlaub ab dann automatisch
              nachgebucht. Ohne Häkchen wird nichts gebucht: die Tage regelt dann jeder selbst,
              etwa als Zeitausgleich.
            </InfoHint>
          </div>
          <div>
            <button
              type="button"
              className="flex min-h-touch items-center gap-2 text-sm font-medium text-brand"
              aria-expanded={ausnahmenOffen}
              aria-controls="bu-ausnahmen"
              onClick={() => setAusnahmenOffen((o) => !o)}
            >
              <span aria-hidden="true">{ausnahmenOffen ? '▾' : '▸'}</span>
              Mitarbeiter ausnehmen
              {ausgenommen.length > 0 && (
                <span className="font-normal text-ink-muted">({ausgenommen.length})</span>
              )}
            </button>
            {/* Zugeklappt steht trotzdem da, wer ausgenommen ist — sonst ginge
                eine Ausnahme unbemerkt mit in den Betriebsurlaub. */}
            {!ausnahmenOffen && ausgenommen.length > 0 && (
              <p className="text-sm text-ink-muted">Arbeiten in dieser Zeit: {ausgenommenText}</p>
            )}
            {ausnahmenOffen && (
              <fieldset id="bu-ausnahmen" className="mt-1">
                <legend className="text-sm text-ink-muted">
                  Wer hier angehakt ist, arbeitet in dieser Zeit: kein Urlaub gebucht, in der
                  Planung verfügbar.
                </legend>
                {leute.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">Die Mitarbeiter konnten nicht geladen werden.</p>
                ) : (
                  <div className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    {leute.map((u) => (
                      <CheckboxField
                        key={u.uid}
                        id={`bu-aus-${u.uid}`}
                        label={u.name}
                        checked={ausgenommen.includes(u.uid)}
                        onChange={(e) =>
                          setAusgenommen((a) =>
                            e.target.checked ? [...a, u.uid] : a.filter((x) => x !== u.uid),
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </fieldset>
            )}
          </div>
          <Button type="submit">Betriebsurlaub anlegen</Button>
        </form>
      </Card>

      <Card title="Betriebsurlaube">
        {laden ? (
          <SkeletonList rows={2} />
        ) : liste.length === 0 ? (
          <EmptyState>Kein Betriebsurlaub eingetragen.</EmptyState>
        ) : (
          <List>
            {liste.map((b) => (
              <ListRow
                key={b.id}
                title={
                  <span>
                    {b.bezeichnung}{' '}
                    <span className="text-ink-muted">{zeitraumText(b.von, b.bis)}</span>
                  </span>
                }
                subtitle={
                  [
                    b.angelegtVonName ? `angelegt von ${b.angelegtVonName}` : null,
                    b.ausgenommen?.length ? `arbeiten: ${b.ausgenommen.map(nameVon).join(', ')}` : null,
                  ].filter(Boolean).join(' · ') || undefined
                }
                zustand={<Marke>{b.urlaubAbbuchen ? 'vom Urlaub abgebucht' : 'nur Planungssperre'}</Marke>}
              >
                <Button variant="ghost" onClick={() => setLoeschen(b)}>Löschen</Button>
              </ListRow>
            ))}
          </List>
        )}
      </Card>

      <ConfirmDialog
        open={fragen}
        title="Betriebsurlaub anlegen?"
        confirmLabel="Anlegen"
        confirmTone="primary"
        message={`${bezeichnung.trim() || 'Betriebsurlaub'}, ${zeitraumText(von, bis)}. ${
          abbuchen
            ? ausgenommen.length
              ? 'Allen aktiven Mitarbeitern ausser den Ausgenommenen werden die Arbeitstage als Urlaub gebucht.'
              : 'Allen aktiven Mitarbeitern werden die Arbeitstage als Urlaub gebucht.'
            : 'Es wird kein Urlaub gebucht — nur die Planung ist gesperrt.'
        }${ausgenommen.length ? ` Arbeiten in dieser Zeit: ${ausgenommenText}.` : ''}`}
        onCancel={() => setFragen(false)}
        onConfirm={anlegen}
      />
      <ConfirmDialog
        open={!!loeschen}
        title="Betriebsurlaub löschen?"
        confirmLabel="Löschen"
        message={
          loeschen
            ? `${loeschen.bezeichnung}, ${zeitraumText(loeschen.von, loeschen.bis)}.${
                loeschen.urlaubAbbuchen
                  ? ' Die Urlaubstage, die er gebucht hat, werden bei allen wieder entfernt. Eigener Urlaub im selben Zeitraum bleibt.'
                  : ''
              }`
            : ''
        }
        onCancel={() => setLoeschen(null)}
        onConfirm={() => (loeschen ? loeschenBestaetigt(loeschen) : undefined)}
      />
    </div>
  );
}
