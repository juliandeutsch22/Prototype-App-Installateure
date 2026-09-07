import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  listWartungen,
  createWartung,
  updateWartung,
  deleteWartung,
  wartungErledigt,
  type NewWartung,
} from '@/lib/db/wartungen';
import { listCustomers } from '@/lib/db/customers';
import { isGF } from '@/lib/permissions';
import { todayStr } from '@/lib/time';
import type { Customer, Wartung } from '@/types';
import type { WithId } from '@/lib/db/core';
import {
  beurteile,
  nachFaelligkeit,
  naechsterTermin,
  INTERVALLE,
  VORLAUF_TAGE,
  type Dringlichkeit,
} from './wartungsplan';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge, { type Tone } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  InputField,
  SelectField,
  CheckboxField,
  FormGrid,
  Pflichthinweis,
} from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';

const fmtDatum = (iso?: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT') : '—';

const TON: Record<Dringlichkeit, Tone> = {
  'überfällig': 'danger',
  'fällig': 'warning',
  'später': 'gray',
  ruht: 'gray',
  unklar: 'info',
};

const LEER = (): NewWartung => ({
  customerId: '',
  customerName: '',
  anlage: '',
  address: '',
  intervallMonate: 12,
  zuletztAm: '',
  faelligAm: '',
  aktiv: true,
  hinweis: '',
});

/** Was gerade erledigt eingetragen wird. */
interface Erledigung {
  wartung: WithId<Wartung>;
  datum: string;
  intervall: number;
  baustelle: string;
}

/**
 * Wiederkehrende Wartungen.
 *
 * DER GANZE ABLAUF, nicht die Liste allein: erfassen, sehen was fällig wird,
 * erledigt eintragen — und mit dem Eintragen rückt der nächste Termin nach.
 * Ohne den letzten Schritt wäre das hier nach einem Jahr eine Sammlung roter
 * Zeilen, die niemand mehr ansieht, und die Vereinbarung wäre dieselbe
 * Karteileiche wie vorher im Kalender.
 *
 * Zwei Abschnitte, und die Reihenfolge ist die Aussage: oben steht, was zu
 * tun ist, darunter der Bestand. Wer die Seite öffnet, will nicht
 * dreihundert Vereinbarungen sehen, sondern die vier, die anstehen.
 */
export default function WartungenView() {
  const { user } = useAuth();
  const toast = useToast();
  const [wartungen, setWartungen] = useState<WithId<Wartung>[]>([]);
  const [kunden, setKunden] = useState<WithId<Customer>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [form, setForm] = useState<NewWartung>(LEER);
  const [bearbeitet, setBearbeitet] = useState<WithId<Wartung> | null>(null);
  const [formOffen, setFormOffen] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [erledigung, setErledigung] = useState<Erledigung | null>(null);
  const [toDelete, setToDelete] = useState<WithId<Wartung> | null>(null);

  const darfAendern = user ? isGF(user.role) : false;
  const heute = todayStr();

  const companyId = user?.companyId;

  useEffect(() => {
    if (!companyId) return;
    let weg = false;
    setLoading(true);
    void (async () => {
      try {
        const [w, k] = await Promise.all([listWartungen(companyId), listCustomers(companyId)]);
        if (weg) return;
        setWartungen(w);
        setKunden(k);
        setError(null);
      } catch (e) {
        if (!weg) setError((e as Error).message);
      } finally {
        if (!weg) setLoading(false);
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId]);

  const neuLaden = async () => {
    if (!companyId) return;
    setWartungen(await listWartungen(companyId));
  };

  /**
   * Anstehend heisst überfällig, fällig binnen Vorlauf — und ohne Termin.
   *
   * Der letzte Fall gehört dazu, weil eine Vereinbarung ohne brauchbares
   * Datum sonst im Bestand verschwindet. Sie ist der einzige Eintrag, der
   * eine Eingabe braucht, und der einzige, den niemand vermisst.
   */
  const anstehend = useMemo(
    () =>
      wartungen
        .filter((w) => {
          const s = beurteile(w, heute).stand;
          return s === 'überfällig' || s === 'fällig' || s === 'unklar';
        })
        .sort(nachFaelligkeit),
    [wartungen, heute],
  );

  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase();
    if (!s) return wartungen;
    return wartungen.filter(
      (w) =>
        w.customerName.toLowerCase().includes(s) ||
        w.anlage.toLowerCase().includes(s) ||
        (w.address ?? '').toLowerCase().includes(s),
    );
  }, [wartungen, suche]);

  const formOeffnen = (w?: WithId<Wartung>) => {
    if (w) {
      setBearbeitet(w);
      setForm({
        customerId: w.customerId,
        customerName: w.customerName,
        anlage: w.anlage,
        address: w.address ?? '',
        intervallMonate: w.intervallMonate,
        zuletztAm: w.zuletztAm ?? '',
        faelligAm: w.faelligAm,
        aktiv: w.aktiv !== false,
        hinweis: w.hinweis ?? '',
      });
    } else {
      setBearbeitet(null);
      setForm(LEER());
    }
    setFormOffen(true);
  };

  /**
   * Beim Wechsel des Kunden wandert der Name als Kopie mit.
   *
   * Dieselbe Überlegung wie bei den Baustellen: die Liste zeigt ihn und soll
   * dafür nicht die Kundensammlung nachladen müssen.
   */
  const kundeWaehlen = (id: string) => {
    const k = kunden.find((x) => x.id === id);
    setForm((f) => ({ ...f, customerId: id, customerName: k?.name ?? '' }));
  };

  /**
   * Aus „zuletzt gewartet" den Vorschlag für den nächsten Termin rechnen.
   *
   * VORSCHLAG, nicht Zwang: das Feld bleibt frei änderbar. Eine übernommene
   * Anlage kann eine Frist haben, die nicht in dieses Raster passt — etwa
   * weil der Vorbetrieb sie im Herbst gewartet hat und der Kunde die Wartung
   * künftig im Frühjahr will.
   */
  const terminVorschlagen = () => {
    if (!form.zuletztAm) return;
    try {
      setForm((f) => ({ ...f, faelligAm: naechsterTermin(f.zuletztAm!, f.intervallMonate) }));
    } catch {
      /* unbrauchbares Datum: dann bleibt der Termin, wie er ist */
    }
  };

  const speichern = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    if (!form.customerId) {
      toast.error('Bitte einen Kunden wählen.');
      return;
    }
    if (!form.anlage.trim()) {
      toast.error('Bitte eintragen, was gewartet wird.');
      return;
    }
    if (!form.faelligAm) {
      toast.error('Ohne Termin wüsste niemand, wann die Wartung ansteht.');
      return;
    }
    setSpeichert(true);
    try {
      const daten: NewWartung = {
        ...form,
        anlage: form.anlage.trim(),
        address: form.address?.trim() || undefined,
        hinweis: form.hinweis?.trim() || undefined,
        zuletztAm: form.zuletztAm || undefined,
      };
      if (bearbeitet) {
        await updateWartung(bearbeitet.id, daten);
        toast.success('Wartung geändert.');
      } else {
        await createWartung(companyId, daten);
        toast.success('Wartung angelegt.');
      }
      setFormOffen(false);
      setBearbeitet(null);
      setForm(LEER());
      await neuLaden();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  const erledigtSpeichern = async () => {
    if (!erledigung) return;
    setSpeichert(true);
    try {
      await wartungErledigt(erledigung.wartung.id, {
        erledigtAm: erledigung.datum,
        intervallMonate: erledigung.intervall,
        projectNumber: erledigung.baustelle.trim() || undefined,
      });
      const naechster = naechsterTermin(erledigung.datum, erledigung.intervall);
      setErledigung(null);
      await neuLaden();
      toast.success(`Eingetragen. Nächste Wartung: ${fmtDatum(naechster)}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  const loeschen = async () => {
    if (!toDelete) return;
    try {
      await deleteWartung(toDelete.id);
      setToDelete(null);
      await neuLaden();
      toast.success('Wartung gelöscht.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!user) return null;
  if (error) return <ErrorState message={error} />;

  const zeile = (w: WithId<Wartung>) => {
    const u = beurteile(w, heute);
    return (
      <ListRow
        key={w.id}
        title={
          <>
            <span>{w.customerName}</span>
            <Badge tone={TON[u.stand]}>{u.stand === 'ruht' ? 'ruht' : u.text}</Badge>
          </>
        }
        subtitle={
          <>
            {w.anlage}
            {w.address ? ` · ${w.address}` : ''} · alle {w.intervallMonate} Monate · Termin{' '}
            {fmtDatum(w.faelligAm)}
            {w.zuletztAm ? ` · zuletzt ${fmtDatum(w.zuletztAm)}` : ' · noch nie gewartet'}
            {w.hinweis ? ` · ${w.hinweis}` : ''}
          </>
        }
      >
        {darfAendern && (
          <>
            <Button
              variant="secondary"
              onClick={() =>
                setErledigung({
                  wartung: w,
                  datum: heute,
                  intervall: w.intervallMonate,
                  baustelle: '',
                })
              }
            >
              Erledigt
            </Button>
            <Button variant="ghost" onClick={() => formOeffnen(w)}>
              Bearbeiten
            </Button>
          </>
        )}
      </ListRow>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wartungen"
        subtitle={`Wiederkehrende Wartungen · fällig gilt ab ${VORLAUF_TAGE} Tagen im Voraus`}
        action={
          darfAendern ? <Button onClick={() => formOeffnen()}>Neue Wartung</Button> : undefined
        }
      />

      {formOffen && darfAendern && (
        <Card title={bearbeitet ? 'Wartung ändern' : 'Neue Wartung'}>
          <form onSubmit={speichern} className="space-y-4">
            <FormGrid>
              <SelectField id="w-kunde"
                label="Kunde"
                pflicht
                value={form.customerId}
                onChange={(e) => kundeWaehlen(e.target.value)}
              >
                <option value="">— wählen —</option>
                {kunden.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </SelectField>
              <InputField id="w-anlage"
                label="Anlage"
                pflicht
                placeholder="Therme Vaillant ecoTEC, Keller"
                value={form.anlage}
                onChange={(e) => setForm({ ...form, anlage: e.target.value })}
              />
              <InputField id="w-standort"
                label="Standort (leer = Kundenadresse)"
                value={form.address ?? ''}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
              <SelectField id="w-intervall"
                label="Intervall"
                value={String(form.intervallMonate)}
                onChange={(e) => setForm({ ...form, intervallMonate: Number(e.target.value) })}
              >
                {INTERVALLE.map((m) => (
                  <option key={m} value={m}>
                    alle {m} Monate
                  </option>
                ))}
              </SelectField>
              <InputField id="w-zuletzt"
                label="Zuletzt gewartet"
                type="date"
                value={form.zuletztAm ?? ''}
                onChange={(e) => setForm({ ...form, zuletztAm: e.target.value })}
                onBlur={terminVorschlagen}
              />
              <InputField id="w-termin"
                label="Nächster Termin"
                pflicht
                type="date"
                value={form.faelligAm}
                onChange={(e) => setForm({ ...form, faelligAm: e.target.value })}
              />
              <InputField id="w-hinweis"
                label="Hinweis"
                placeholder="Schlüssel bei der Hausverwaltung"
                value={form.hinweis ?? ''}
                onChange={(e) => setForm({ ...form, hinweis: e.target.value })}
              />
              <CheckboxField id="w-aktiv"
                label="Vereinbarung läuft"
                checked={form.aktiv}
                onChange={(e) => setForm({ ...form, aktiv: e.target.checked })}
              />
            </FormGrid>
            <Pflichthinweis />
            <p className="text-sm text-ink-muted">
              Eine gekündigte Vereinbarung wird nicht gelöscht, sondern angehalten — die
              Historie ist der Grund, warum man den Kunden später wieder anruft.
            </p>
            <div className="flex gap-2">
              <Button type="submit" disabled={speichert}>
                {speichert ? 'Speichert …' : 'Speichern'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFormOffen(false);
                  setBearbeitet(null);
                }}
              >
                Abbrechen
              </Button>
              {bearbeitet && (
                <Button type="button" variant="danger" onClick={() => setToDelete(bearbeitet)}>
                  Löschen
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      <Card title={`Steht an (${anstehend.length})`}>
        {loading ? (
          <SkeletonList />
        ) : anstehend.length === 0 ? (
          <EmptyState>
            In den nächsten {VORLAUF_TAGE} Tagen steht keine Wartung an.
          </EmptyState>
        ) : (
          <List>{anstehend.map(zeile)}</List>
        )}
      </Card>

      <Card title={`Alle Vereinbarungen (${wartungen.length})`}>
        <div className="mb-3">
          <InputField id="w-suche"
            label="Suche"
            placeholder="Kunde, Anlage oder Standort"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
        </div>
        {loading ? (
          <SkeletonList />
        ) : gefiltert.length === 0 ? (
          <EmptyState>
            {wartungen.length === 0
              ? 'Noch keine Wartung erfasst.'
              : 'Kein Treffer für diese Suche.'}
          </EmptyState>
        ) : (
          <List>{gefiltert.map(zeile)}</List>
        )}
      </Card>

      {erledigung && (
        <ConfirmDialog
          open
          title="Wartung erledigt eintragen"
          confirmLabel={speichert ? 'Trägt ein …' : 'Eintragen'}
          onConfirm={erledigtSpeichern}
          onCancel={() => setErledigung(null)}
        >
          <div className="space-y-3">
            <p className="text-sm">
              {erledigung.wartung.customerName} · {erledigung.wartung.anlage}
            </p>
            <FormGrid cols={1}>
              <InputField id="e-datum"
                label="Gewartet am"
                type="date"
                value={erledigung.datum}
                onChange={(e) => setErledigung({ ...erledigung, datum: e.target.value })}
              />
              <SelectField id="e-intervall"
                label="Intervall ab jetzt"
                value={String(erledigung.intervall)}
                onChange={(e) =>
                  setErledigung({ ...erledigung, intervall: Number(e.target.value) })
                }
              >
                {INTERVALLE.map((m) => (
                  <option key={m} value={m}>
                    alle {m} Monate
                  </option>
                ))}
              </SelectField>
              <InputField id="e-baustelle"
                label="Baustelle (optional)"
                placeholder="2026-014"
                value={erledigung.baustelle}
                onChange={(e) => setErledigung({ ...erledigung, baustelle: e.target.value })}
              />
            </FormGrid>
            <p className="text-sm text-ink-muted">
              Nächster Termin: {fmtDatum(naechsterTermin(erledigung.datum, erledigung.intervall))}
              . Gerechnet ab dem Tag der Ausführung, nicht ab dem geplanten Termin — das
              Wartungsintervall läuft ab der letzten tatsächlichen Wartung.
            </p>
          </div>
        </ConfirmDialog>
      )}

      {toDelete && (
        <ConfirmDialog
          open
          title="Wartung löschen?"
          confirmLabel="Löschen"
          onConfirm={loeschen}
          onCancel={() => setToDelete(null)}
        >
          <p>
            {toDelete.customerName} · {toDelete.anlage}. Die Historie geht mit verloren. Wer die
            Vereinbarung nur beenden will, hält sie besser an.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
