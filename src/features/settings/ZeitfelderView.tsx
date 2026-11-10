import { istAn } from '@/lib/module';
import StandardZeitfelder from './StandardZeitfelder';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { isTopLevel } from '@/lib/permissions';
import {
  getAktuelleZeitfeldFassung, listZeitfeldDefinitionen, zeitfeldReihenfolge, zeitfeldSpeichern, zeitfeldTypWechseln,
} from '@/lib/db/zeitfelder';
import type { ZeitfeldDefinition, ZeitfeldFassung } from '@/types';
import {
  regelnFehler, ZEITFELD_PFLICHTEN, ZEITFELD_ROLLEN, ZEITFELD_STAENDE, ZEITFELD_TYPEN,
  type ZeitfeldOption, type ZeitfeldPflicht, type ZeitfeldRegeln, type ZeitfeldTyp,
} from '@/lib/zeitfelder';
import { leseZahl, zahlAlsText } from '@/lib/zahl';
import { datumAusMs } from '@/lib/datum';
import { grundAus } from '@/lib/fehlerGrund';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import { List, ListRow } from '@/components/ListRow';
import { Zustand } from '@/components/Badge';
import { CheckboxField, FormGrid, InputField, SelectField } from '@/components/Field';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { Hinweislinie } from '@/components/Planlinie';
import { useToast } from '@/components/Toast';
import { abfrageSpeicher } from '@/lib/zwischenspeicher';
import { FELDSATZ_SCHLUESSEL } from '@/features/time/useZeitfelder';

/**
 * DIE FREIEN ZEITFELDER (SHK-Ausbau M06b, N01) — Einstellungen › Zeitfelder.
 *
 * Geschäftsführung und Administration legen fest, was der Betrieb über die
 * festen Spalten hinaus zu einer Buchung wissen will. Jede Änderung, die die
 * Prüfung betrifft, veröffentlicht eine neue Fassung — das macht der Server
 * im selben Zug (`zeitfeld_speichern`); umbenennen und umsortieren nicht.
 *
 * TYPWECHSEL ALS „NEUES FELD, ALTES ENDET“ (Entscheidung M06b): ein Wert
 * wechselt seinen Typ nie. Die Seite sagt das, bevor es geschieht; das alte
 * Feld steht danach unter „Beendete Felder“, seine Werte bleiben lesbar.
 */

interface Entwurf {
  id?: string;
  name: string;
  typ: ZeitfeldTyp;
  /** Der gespeicherte Typ — weicht `typ` davon ab, ist es ein Typwechsel. */
  typVorher?: ZeitfeldTyp;
  typAendern: boolean;
  laenge: string;
  min: string;
  max: string;
  stellen: string;
  einheit: string;
  optionen: ZeitfeldOption[];
  /** Kennungen der Optionen, die schon gespeichert sind (entfernen prüft der Server). */
  gespeicherteOptionen: string[];
  staende: string[];
  rollen: string[];
  pflicht: ZeitfeldPflicht;
  aktiv: boolean;
  ersetzt: boolean;
}

const LEER: Entwurf = {
  name: '', typ: 'text', typAendern: false, laenge: '', min: '', max: '', stellen: '0', einheit: '',
  optionen: [], gespeicherteOptionen: [], staende: ['Anwesend'], rollen: [...ZEITFELD_ROLLEN], pflicht: 'nie',
  aktiv: true, ersetzt: false,
};

function ausDefinition(d: ZeitfeldDefinition): Entwurf {
  const r = d.regeln ?? {};
  return {
    id: d.id,
    name: d.name,
    typ: d.typ,
    typVorher: d.typ,
    typAendern: false,
    laenge: r.laenge !== undefined ? String(r.laenge) : '',
    min: r.min !== undefined ? zahlAlsText(r.min) : '',
    max: r.max !== undefined ? zahlAlsText(r.max) : '',
    stellen: String(r.stellen ?? 0),
    einheit: r.einheit ?? '',
    optionen: (r.optionen ?? []).map((o) => ({ ...o })),
    gespeicherteOptionen: (r.optionen ?? []).map((o) => o.id),
    staende: [...d.giltStaende],
    rollen: [...d.giltRollen],
    pflicht: d.pflicht,
    aktiv: d.aktiv,
    ersetzt: !!d.ersetztDurch,
  };
}

/** Die Regeln aus den Feldern der Maske — oder der Grund, warum es so nicht geht. */
function regelnAus(e: Entwurf): { regeln: ZeitfeldRegeln; fehler: string | null } {
  const regeln: ZeitfeldRegeln = {};
  if (e.typ === 'text' && e.laenge.trim()) {
    const l = leseZahl(e.laenge);
    if (l.fehler || l.wert === null) return { regeln, fehler: 'Die Länge muss zwischen 1 und 2000 Zeichen liegen' };
    regeln.laenge = l.wert;
  }
  if (e.typ === 'zahl') {
    for (const [feld, text] of [['min', e.min], ['max', e.max]] as const) {
      if (!text.trim()) continue;
      const z = leseZahl(text, { negativ: true });
      if (z.fehler || z.wert === null) return { regeln, fehler: 'Mindest- und Höchstwert müssen Zahlen sein' };
      regeln[feld] = z.wert;
    }
    regeln.stellen = Number(e.stellen) || 0;
    if (e.einheit.trim()) regeln.einheit = e.einheit.trim();
  }
  if (e.typ === 'auswahl') {
    regeln.optionen = e.optionen.map((o) => ({ ...o, text: o.text.trim() }));
  }
  return { regeln, fehler: regelnFehler(e.typ, regeln) };
}

const TYPNAME = new Map(ZEITFELD_TYPEN.map((t) => [t.wert, t.name]));
const PFLICHTNAME = new Map(ZEITFELD_PFLICHTEN.map((p) => [p.wert, p.name]));

/** Eine Zeile der Liste: was das Feld ist und für wen. */
function beschreibung(d: ZeitfeldDefinition): string {
  const teile = [TYPNAME.get(d.typ) ?? d.typ, PFLICHTNAME.get(d.pflicht) ?? d.pflicht, d.giltStaende.join(', ')];
  teile.push(d.giltRollen.length === ZEITFELD_ROLLEN.length ? 'alle Rollen' : d.giltRollen.join(', '));
  return teile.join(' · ');
}

export default function ZeitfelderView() {
  const { user, company } = useAuth();
  const toast = useToast();
  const [felder, setFelder] = useState<ZeitfeldDefinition[] | null>(null);
  const [fassung, setFassung] = useState<ZeitfeldFassung | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [versuch, setVersuch] = useState(0);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const firma = user?.companyId;

  useEffect(() => {
    if (!firma) return;
    let weg = false;
    setLadeFehler(null);
    Promise.resolve()
      .then(() => Promise.all([listZeitfeldDefinitionen(firma), getAktuelleZeitfeldFassung(firma)]))
      .then(([d, f]) => {
        if (weg) return;
        setFelder(d);
        setFassung(f);
      })
      .catch((e) => { if (!weg) setLadeFehler(grundAus(e, 'Die Zeitfelder konnten nicht geladen werden.')); });
    return () => { weg = true; };
  }, [firma, versuch]);

  const aktive = useMemo(() => (felder ?? []).filter((f) => f.aktiv).sort((a, b) => a.reihenfolge - b.reihenfolge), [felder]);
  const beendete = useMemo(() => (felder ?? []).filter((f) => !f.aktiv), [felder]);
  const nachId = useMemo(() => new Map((felder ?? []).map((f) => [f.id, f])), [felder]);

  if (!user) return null;
  const darf = isTopLevel(user.role) && istAn(company?.modules, 'zeiterfassung.freie_zeitfelder');

  const typwechsel = !!entwurf?.id && !!entwurf.typVorher && entwurf.typ !== entwurf.typVorher;

  async function speichern() {
    if (!entwurf) return;
    setFehler(null);
    if (!entwurf.name.trim()) {
      setFehler('Bitte einen Namen eingeben (höchstens 60 Zeichen)');
      return;
    }
    const { regeln, fehler: regelFehler } = regelnAus(entwurf);
    if (regelFehler) {
      setFehler(regelFehler);
      return;
    }
    if (entwurf.staende.length === 0) {
      setFehler('Gilt für Anwesend, Zeitausgleich oder beide');
      return;
    }
    if (entwurf.rollen.length === 0) {
      setFehler('Bitte mindestens eine Rolle wählen');
      return;
    }
    const daten = {
      id: entwurf.id,
      name: entwurf.name.trim(),
      typ: entwurf.typ,
      regeln,
      giltStaende: entwurf.staende,
      giltRollen: entwurf.rollen,
      pflicht: entwurf.pflicht,
      aktiv: typwechsel ? true : entwurf.aktiv,
    };
    setSpeichert(true);
    try {
      const r = typwechsel && entwurf.id
        ? await zeitfeldTypWechseln(entwurf.id, daten)
        : await zeitfeldSpeichern(daten);
      const titel = typwechsel ? `„${daten.name}“ als neues Feld angelegt, das alte ist beendet` : `„${daten.name}“ gespeichert`;
      toast.success(r.fassung ? `${titel} — Fassung ${r.fassung}` : titel);
      setEntwurf(null);
      setVersuch((v) => v + 1);
      // Die eigene Buchungsmaske soll die neue Fassung gleich kennen, nicht erst nach einer Minute.
      void abfrageSpeicher.invalidateQueries({ queryKey: [FELDSATZ_SCHLUESSEL] });
    } catch (err) {
      setFehler(grundAus(err, 'Das Feld konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  async function verschieben(richtung: -1 | 1) {
    if (!entwurf?.id) return;
    const ids = aktive.map((f) => f.id);
    const i = ids.indexOf(entwurf.id);
    const j = i + richtung;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setFehler(null);
    try {
      await zeitfeldReihenfolge(ids);
      setVersuch((v) => v + 1);
      toast.success('Reihenfolge gespeichert');
    } catch (err) {
      setFehler(grundAus(err, 'Die Reihenfolge konnte nicht gespeichert werden.'));
    }
  }

  const umschalten = (liste: string[], wert: string) =>
    liste.includes(wert) ? liste.filter((x) => x !== wert) : [...liste, wert];

  const stelle = entwurf?.id ? aktive.findIndex((f) => f.id === entwurf.id) : -1;

  return (
    <div className="space-y-6">
      <PageHeader
        ort="Einstellungen"
        title="Zeitfelder"
        // Einzeilig am Handy (E72, N1): der Untertitel ist eine Zeile, keine Erklärung.
        subtitle="Standardfelder und eigene Angaben je Buchung"
        action={darf ? <Button onClick={() => { setFehler(null); setEntwurf({ ...LEER, rollen: [...ZEITFELD_ROLLEN] }); }}>Feld anlegen</Button> : undefined}
        hilfe={
          <>
            Was der Betrieb über Zeiten und Baustelle hinaus zu einer Buchung wissen will — etwa Kostenstelle,
            Kilometer mit dem Firmenauto oder die Auftragsnummer der Hausverwaltung. Die Felder stehen in der
            Zeiterfassung bei den gewählten Ständen und Rollen, in „Meine Einträge“, in der Mitarbeiterübersicht und als
            eigene Spalten am Ende des Exports. „Pflicht beim Buchen“ muss ausgefüllt sein, bevor gebucht wird; „Ergänzt
            das Büro“ darf leer bleiben, das Büro sieht dann „fehlt“. Jede Änderung an Typ, Grenzen, Optionen, Pflicht,
            Ständen oder Rollen ergibt eine neue Fassung; eine offline vorgemerkte Buchung wird nach ihrer Fassung
            geprüft, was die neue zusätzlich verlangt, steht als „Nachpflege“ da. Umbenennen ändert keinen Wert. Ein
            Typwechsel ergibt ein neues Feld: das alte endet, seine Werte bleiben mit altem Namen lesbar. Eine Option
            lässt sich deaktivieren; entfernen nur, solange sie nie gewählt wurde. Wichtig: Ein Textfeld nimmt alles auf,
            was jemand hineintippt — auch Angaben zur Gesundheit, die dort nicht hingehören. Freitext deshalb sparsam und
            mit einem klaren Namen anlegen; im Krankenstand gelten keine Felder.
          </>
        }
      />

      <StandardZeitfelder darf={isTopLevel(user.role)} />

      <Card title="Eigene Felder" buendig>
        {ladeFehler ? (
          <div className="px-4 pb-4"><ErrorState message={ladeFehler} /></div>
        ) : felder === null ? (
          <div className="px-4 pb-4"><SkeletonList rows={3} /></div>
        ) : aktive.length === 0 ? (
          <EmptyState>Noch keine eigenen Felder angelegt.</EmptyState>
        ) : (
          <List>
            {aktive.map((f) => (
              <ListRow
                key={f.id}
                title={f.name}
                subtitle={beschreibung(f)}
                onOeffnen={darf ? () => { setFehler(null); setEntwurf(ausDefinition(f)); } : undefined}
                pfeil={darf}
              />
            ))}
          </List>
        )}
      </Card>

      {fassung && (
        <Card title="Geltende Fassung">
          <p className="text-sm text-ink">
            Fassung {fassung.nummer}
            {fassung.veroeffentlichtAm ? ` vom ${datumAusMs(fassung.veroeffentlichtAm)}` : ''}
            {fassung.anlass ? ` · ${fassung.anlass}` : ''}
          </p>
        </Card>
      )}

      {beendete.length > 0 && (
        <Card
          title="Beendete Felder"
          hint="Ein beendetes Feld steht in keiner neuen Buchung mehr; seine Werte bleiben an den Buchungen mit Name und Typ lesbar, auch im Export."
          buendig
        >
          <List>
            {beendete.map((f) => (
              <ListRow
                key={f.id}
                title={f.name}
                subtitle={f.ersetztDurch
                  ? `${TYPNAME.get(f.typ) ?? f.typ} · ersetzt durch „${nachId.get(f.ersetztDurch)?.name ?? 'neues Feld'}“`
                  : beschreibung(f)}
                zustand={<Zustand stand="erledigt">beendet</Zustand>}
                onOeffnen={darf && !f.ersetztDurch ? () => { setFehler(null); setEntwurf(ausDefinition(f)); } : undefined}
                pfeil={darf && !f.ersetztDurch}
              />
            ))}
          </List>
        </Card>
      )}

      <BottomSheet
        open={!!entwurf}
        onClose={() => setEntwurf(null)}
        label="Zeitfeld"
        auchBreit
        titel={entwurf?.id ? 'Feld ändern' : 'Feld anlegen'}
      >
        {entwurf && (
          <div className="formular space-y-4">
            <InputField
              id="zeitfeld-name"
              label="Name"
              pflicht
              maxLength={60}
              placeholder="z. B. Kostenstelle"
              value={entwurf.name}
              onChange={(e) => setEntwurf({ ...entwurf, name: e.target.value })}
            />
            <SelectField
              id="zeitfeld-typ"
              label="Typ"
              value={entwurf.typ}
              disabled={!!entwurf.id && !entwurf.typAendern}
              onChange={(e) => {
                const typ = e.target.value as ZeitfeldTyp;
                setEntwurf({
                  ...entwurf, typ,
                  optionen: typ === 'auswahl' && entwurf.optionen.length === 0
                    ? [{ id: crypto.randomUUID(), text: '', aktiv: true }]
                    : entwurf.optionen,
                });
              }}
            >
              {ZEITFELD_TYPEN.map((t) => <option key={t.wert} value={t.wert}>{t.name}</option>)}
            </SelectField>
            {entwurf.id && entwurf.aktiv && !entwurf.typAendern && (
              <button type="button" className="link -mt-2 self-start text-sm" onClick={() => setEntwurf({ ...entwurf, typAendern: true })}>
                Typ ändern …
              </button>
            )}
            {entwurf.typAendern && (
              <Hinweislinie>
                Ein Typwechsel ergibt ein neues Feld: das alte endet, seine Werte bleiben mit altem Namen und Typ lesbar.
                Neue Buchungen füllen das neue Feld.
              </Hinweislinie>
            )}

            {entwurf.typ === 'text' && (
              <InputField
                id="zeitfeld-laenge"
                label="Höchstens Zeichen"
                inputMode="numeric"
                placeholder="leer = 200"
                value={entwurf.laenge}
                onChange={(e) => setEntwurf({ ...entwurf, laenge: e.target.value })}
              />
            )}
            {entwurf.typ === 'zahl' && (
              <FormGrid>
                <InputField id="zeitfeld-min" label="Mindestens (optional)" inputMode="decimal" value={entwurf.min}
                  onChange={(e) => setEntwurf({ ...entwurf, min: e.target.value })} />
                <InputField id="zeitfeld-max" label="Höchstens (optional)" inputMode="decimal" value={entwurf.max}
                  onChange={(e) => setEntwurf({ ...entwurf, max: e.target.value })} />
                <SelectField id="zeitfeld-stellen" label="Nachkommastellen" value={entwurf.stellen}
                  onChange={(e) => setEntwurf({ ...entwurf, stellen: e.target.value })}>
                  {['0', '1', '2', '3', '4'].map((s) => <option key={s} value={s}>{s}</option>)}
                </SelectField>
                <InputField id="zeitfeld-einheit" label="Einheit (optional)" maxLength={20} placeholder="z. B. km"
                  value={entwurf.einheit} onChange={(e) => setEntwurf({ ...entwurf, einheit: e.target.value })} />
              </FormGrid>
            )}
            {entwurf.typ === 'auswahl' && (
              <fieldset className="space-y-3 border-t border-line pt-2">
                <legend className="pr-2 section-label">Optionen</legend>
                {entwurf.optionen.map((o, i) => (
                  <div key={o.id} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <InputField
                        id={`zeitfeld-option-${i}`}
                        label={`Option ${i + 1}`}
                        maxLength={80}
                        value={o.text}
                        onChange={(e) => setEntwurf({
                          ...entwurf,
                          optionen: entwurf.optionen.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)),
                        })}
                      />
                    </div>
                    <CheckboxField
                      id={`zeitfeld-option-${i}-aktiv`}
                      label="wählbar"
                      checked={o.aktiv}
                      onChange={(e) => setEntwurf({
                        ...entwurf,
                        optionen: entwurf.optionen.map((x) => (x.id === o.id ? { ...x, aktiv: e.target.checked } : x)),
                      })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Option ${i + 1} entfernen`}
                      onClick={() => setEntwurf({ ...entwurf, optionen: entwurf.optionen.filter((x) => x.id !== o.id) })}
                    >
                      Entfernen
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEntwurf({ ...entwurf, optionen: [...entwurf.optionen, { id: crypto.randomUUID(), text: '', aktiv: true }] })}
                >
                  Option hinzufügen
                </Button>
              </fieldset>
            )}

            <fieldset className="border-t border-line pt-2">
              <legend className="pr-2 section-label">Gilt für</legend>
              <div className="flex flex-wrap gap-x-4">
                {ZEITFELD_STAENDE.map((s) => (
                  <CheckboxField key={s} id={`zeitfeld-stand-${s}`} label={s} checked={entwurf.staende.includes(s)}
                    onChange={() => setEntwurf({ ...entwurf, staende: umschalten(entwurf.staende, s) })} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4">
                {ZEITFELD_ROLLEN.map((r) => (
                  <CheckboxField key={r} id={`zeitfeld-rolle-${r}`} label={r} checked={entwurf.rollen.includes(r)}
                    onChange={() => setEntwurf({ ...entwurf, rollen: umschalten(entwurf.rollen, r) })} />
                ))}
              </div>
            </fieldset>

            <SelectField id="zeitfeld-pflicht" label="Pflicht" value={entwurf.pflicht}
              onChange={(e) => setEntwurf({ ...entwurf, pflicht: e.target.value as ZeitfeldPflicht })}>
              {ZEITFELD_PFLICHTEN.map((p) => <option key={p.wert} value={p.wert}>{p.name}</option>)}
            </SelectField>

            {entwurf.id && !typwechsel && !entwurf.ersetzt && (
              <CheckboxField id="zeitfeld-aktiv" label="In Gebrauch (aus = beendet, die Werte bleiben)" checked={entwurf.aktiv}
                onChange={(e) => setEntwurf({ ...entwurf, aktiv: e.target.checked })} />
            )}

            {entwurf.id && entwurf.aktiv && !typwechsel && aktive.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={stelle <= 0} onClick={() => void verschieben(-1)}>
                  Weiter nach oben
                </Button>
                <Button type="button" variant="secondary" disabled={stelle < 0 || stelle >= aktive.length - 1} onClick={() => void verschieben(1)}>
                  Weiter nach unten
                </Button>
              </div>
            )}

            {fehler && <ErrorState message={fehler} />}
            <div className="fuss-aktionen">
              <Button variant="ghost" onClick={() => setEntwurf(null)}>Abbrechen</Button>
              <Button loading={speichert} onClick={() => void speichern()}>
                {typwechsel ? 'Als neues Feld anlegen' : 'Speichern'}
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
