import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Betriebsurlaub } from '@/types';
import type { WithId } from '@/lib/db/core';
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
      });
      toast.success(
        abbuchen
          ? `Betriebsurlaub angelegt — ${r.tage} ${r.tage === 1 ? 'Urlaubstag' : 'Urlaubstage'} für ${r.mitarbeiter} Mitarbeiter gebucht${r.uebersprungen ? `, ${r.uebersprungen} übersprungen (dort war schon gebucht)` : ''}`
          : 'Betriebsurlaub angelegt — die Planung ist gesperrt, gebucht wurde nichts',
      );
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
          <div className="flex items-center">
            <CheckboxField
              id="bu-abbuchen"
              label="Urlaubskonto aller aktiven Mitarbeiter belasten"
              checked={abbuchen}
              onChange={(e) => setAbbuchen(e.target.checked)}
            />
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
                    <span className="tnum text-ink-muted">{zeitraumText(b.von, b.bis)}</span>
                  </span>
                }
                subtitle={b.angelegtVonName ? `angelegt von ${b.angelegtVonName}` : undefined}
              >
                <Marke>{b.urlaubAbbuchen ? 'vom Urlaub abgebucht' : 'nur Planungssperre'}</Marke>
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
            ? 'Allen aktiven Mitarbeitern werden die Arbeitstage als Urlaub gebucht.'
            : 'Es wird kein Urlaub gebucht — nur die Planung ist gesperrt.'
        }`}
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
