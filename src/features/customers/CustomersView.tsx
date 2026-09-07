import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listProjectsForCustomer,
  listUnlinkedProjectsByName,
  assignProjectToCustomer,
  type NewCustomer,
} from '@/lib/db/customers';
import { listRecentProjects } from '@/lib/db/projects';
import { listQuotesForCustomer } from '@/lib/db/quotes';
import { isGF } from '@/lib/permissions';
import type { Customer, Project, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import IconButton from '@/components/IconButton';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField, FormGrid, Pflichthinweis } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';

const LEER: NewCustomer = {
  name: '',
  address: '',
  contactName: '',
  contactPhone: '',
  email: '',
  vatId: '',
  notes: '',
  active: true,
};

const fmtEUR = (n: number) =>
  `€ ${new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

/** Namen für den Abgleich vereinheitlichen — Groß-/Kleinschreibung und Leerraum. */
function schluessel(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Die Akte eines Kunden: was der Betrieb für ihn tut und getan hat.
 *
 * `vorschlaege` ist der Teil, den es vorher nicht gab und dessen Fehlen die
 * Ansicht unbrauchbar machte: Baustellen, die den Namen des Kunden tragen,
 * aber noch auf keinen Kundendatensatz zeigen. Sie sind der Normalfall bei
 * allem, was vor den Kundenstammdaten angelegt wurde — und bei jedem Kunden,
 * den jemand von Hand nachträgt, während seine Baustelle längst existiert.
 */
type Akte =
  | { zustand: 'laedt' }
  | { zustand: 'fehler' }
  | {
      zustand: 'bereit';
      zugeordnet: WithId<Project>[];
      vorschlaege: WithId<Project>[];
      angebote: WithId<Quote>[];
    };

/** Baustellen jüngste zuerst — die Nummer trägt das Jahr. */
const nachNummer = (a: Project, b: Project) => b.projectNumber.localeCompare(a.projectNumber);

/**
 * Kundenverwaltung.
 *
 * Der Kunde war bis hierher ein Textfeld an der Baustelle und wurde bei jedem
 * Auftrag neu getippt. Was dadurch fehlte, ist keine Bequemlichkeit, sondern
 * Substanz: die Kundenhistorie („was haben wir dort zuletzt gemacht?"), die
 * Grundlage für Wartungsverträge, und ein Mahnwesen, das über die einzelne
 * Rechnung hinausgeht. Zwei Schreibweisen desselben Namens ergaben zwei
 * Kunden, und keiner der beiden war vollständig.
 */
export default function CustomersView() {
  const { user } = useAuth();
  const toast = useToast();
  const [kunden, setKunden] = useState<WithId<Customer>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [form, setForm] = useState<NewCustomer>(LEER);
  const [bearbeitet, setBearbeitet] = useState<WithId<Customer> | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [toDelete, setToDelete] = useState<WithId<Customer> | null>(null);
  /** Aufgeklappter Kunde samt seiner Akte. */
  const [offen, setOffen] = useState<string | null>(null);
  const [akte, setAkte] = useState<Akte>({ zustand: 'laedt' });

  const darfAendern = user ? isGF(user.role) : false;

  const laden = useMemo(
    () => async () => {
      if (!user) return;
      setLoading(true);
      try {
        setKunden(await listCustomers(user.companyId));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    void laden();
  }, [laden]);

  /**
   * Die Akte des aufgeklappten Kunden — erst auf Anforderung geladen.
   *
   * Drei Abfragen nebeneinander: die zugeordneten Baustellen, die namensgleich
   * NICHT zugeordneten, und die Angebote. Der mittlere Teil ist der Grund für
   * diese Überarbeitung — ohne ihn stand bei einem Kunden „noch keine
   * Baustelle zugeordnet", während im Bestand eine mit genau seinem Namen lag.
   *
   * Ein Fehler wird angezeigt, nicht verschluckt: er sah vorher aus wie „es
   * gibt nichts", und das ist eine andere Aussage.
   */
  const [zuordnenLaeuft, setZuordnenLaeuft] = useState<string | null>(null);

  const akteLaden = useMemo(
    () => async (kunde: WithId<Customer>) => {
      if (!user) return;
      setAkte({ zustand: 'laedt' });
      try {
        const [zugeordnet, namensgleich, angebote] = await Promise.all([
          listProjectsForCustomer(user.companyId, kunde.id),
          listUnlinkedProjectsByName(user.companyId, kunde.name),
          listQuotesForCustomer(user.companyId, kunde.id),
        ]);
        setAkte({
          zustand: 'bereit',
          zugeordnet: [...zugeordnet].sort(nachNummer),
          vorschlaege: [...namensgleich].sort(nachNummer),
          angebote,
        });
      } catch {
        setAkte({ zustand: 'fehler' });
      }
    },
    [user],
  );

  useEffect(() => {
    if (!user || !offen) return;
    const kunde = kunden.find((k) => k.id === offen);
    if (kunde) void akteLaden(kunde);
  }, [user, offen, kunden, akteLaden]);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return kunden;
    return kunden.filter((k) =>
      [k.name, k.address, k.contactName, k.contactPhone, k.email].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [kunden, suche]);

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!user || !form.name.trim()) return;
    setSpeichert(true);
    setError(null);
    try {
      if (bearbeitet) {
        const nachgezogen = await updateCustomer(user.companyId, bearbeitet.id, form);
        toast.success(
          nachgezogen > 0
            ? `Kunde gespeichert, ${nachgezogen} ${nachgezogen === 1 ? 'Baustelle' : 'Baustellen'} nachgezogen`
            : 'Kunde gespeichert',
        );
      } else {
        // Doppelte Anlage abfangen — der Grund, warum es diese Ansicht gibt.
        const doppelt = kunden.find((k) => schluessel(k.name) === schluessel(form.name));
        if (doppelt) {
          setError(`„${doppelt.name}" gibt es bereits. Bitte den bestehenden Kunden bearbeiten.`);
          return;
        }
        await createCustomer(user.companyId, form);
        toast.success('Kunde angelegt');
      }
      setForm(LEER);
      setBearbeitet(null);
      await laden();
    } catch {
      setError('Der Kunde konnte nicht gespeichert werden.');
    } finally {
      setSpeichert(false);
    }
  }

  /**
   * Bestehende Baustellen übernehmen.
   *
   * Bewusst mit Vorschau statt als stiller Hintergrundlauf: die
   * Geschäftsführung sieht, wie viele Kunden aus wie vielen Baustellen
   * entstehen, bevor etwas geschrieben wird. Bei Altbeständen mit
   * uneinheitlichen Schreibweisen ist genau das die Stelle, an der jemand
   * merkt, dass „Huber" und „Fam. Huber" derselbe Kunde sind.
   */
  const [uebernahme, setUebernahme] = useState<{ name: string; projekte: WithId<Project>[] }[] | null>(
    null,
  );
  const [uebernahmeLaeuft, setUebernahmeLaeuft] = useState(false);

  async function uebernahmeVorbereiten() {
    if (!user) return;
    setUebernahmeLaeuft(true);
    setError(null);
    try {
      const projekte = await listRecentProjects(user.companyId, 500);
      const ohneKunde = projekte.filter((p) => !p.customerId && p.customerName?.trim());
      const nachName = new Map<string, { name: string; projekte: WithId<Project>[] }>();
      for (const p of ohneKunde) {
        const k = schluessel(p.customerName);
        const eintrag = nachName.get(k) ?? { name: p.customerName.trim(), projekte: [] };
        eintrag.projekte.push(p);
        nachName.set(k, eintrag);
      }
      setUebernahme([...nachName.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')));
    } catch {
      setError('Die Baustellen konnten nicht gelesen werden.');
    } finally {
      setUebernahmeLaeuft(false);
    }
  }

  async function uebernahmeAusfuehren() {
    if (!user || !uebernahme) return;
    setUebernahmeLaeuft(true);
    setError(null);
    try {
      let neu = 0;
      let zugeordnet = 0;
      for (const gruppe of uebernahme) {
        // Gibt es den Kunden schon, wird er verwendet statt neu angelegt.
        const bestehend = kunden.find((k) => schluessel(k.name) === schluessel(gruppe.name));
        const jüngste = [...gruppe.projekte].sort((a, b) =>
          b.projectNumber.localeCompare(a.projectNumber),
        )[0];
        const id =
          bestehend?.id ??
          (await createCustomer(user.companyId, {
            ...LEER,
            name: gruppe.name,
            // Adresse und Ansprechpartner der JÜNGSTEN Baustelle als
            // Startwert — die älteste ist am ehesten veraltet.
            address: jüngste?.address ?? '',
            contactName: jüngste?.contactName ?? '',
            contactPhone: jüngste?.contactPhone ?? '',
          }));
        if (!bestehend) neu++;
        for (const p of gruppe.projekte) {
          await assignProjectToCustomer(p.id, id, gruppe.name);
          zugeordnet++;
        }
      }
      toast.success(`${neu} Kunden angelegt, ${zugeordnet} Baustellen zugeordnet`);
      setUebernahme(null);
      await laden();
    } catch {
      setError('Die Übernahme ist fehlgeschlagen.');
    } finally {
      setUebernahmeLaeuft(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Kunden" subtitle="Stammdaten, Ansprechpartner und Baustellenhistorie" />

      {darfAendern && (
        <Card title={bearbeitet ? `„${bearbeitet.name}" bearbeiten` : 'Neuen Kunden anlegen'}>
          <form onSubmit={speichern} className="space-y-4">
            <InputField
              id="kname"
              label="Name oder Firma"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              pflicht
            />
            {/* Ausdrücklich die RECHNUNGSadresse: die Baustelle hat ihre
                eigene, und eine Hausverwaltung hat zwanzig davon. */}
            <InputField
              id="kadr"
              label="Rechnungsadresse"
              value={form.address ?? ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <FormGrid>
              <InputField
                id="kcontact"
                label="Ansprechpartner"
                value={form.contactName ?? ''}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              />
              <InputField
                id="kphone"
                label="Telefon"
                value={form.contactPhone ?? ''}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              />
            </FormGrid>
            <FormGrid>
              <InputField
                id="kmail"
                label="E-Mail"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <InputField
                id="kuid"
                label="UID-Nummer (bei Firmen)"
                value={form.vatId ?? ''}
                onChange={(e) => setForm({ ...form, vatId: e.target.value })}
              />
            </FormGrid>
            <InputField
              id="knotes"
              label="Notiz"
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <Pflichthinweis />
            {error && <ErrorState message={error} />}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" loading={speichert} className="w-full sm:w-auto">
                {bearbeitet ? 'Änderungen speichern' : 'Kunde anlegen'}
              </Button>
              {bearbeitet && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setBearbeitet(null);
                    setForm(LEER);
                  }}
                  className="w-full sm:w-auto"
                >
                  Abbrechen
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      {/* Übernahme der Altbestände — nur solange es etwas zu übernehmen gibt. */}
      {darfAendern && (
        <Card
          title="Bestehende Baustellen übernehmen"
          hint={
            <>
              Legt aus den Kundennamen bestehender Baustellen Kunden an und ordnet die Baustellen
              zu. Vor dem Schreiben wird angezeigt, was entstehen würde — geschrieben wird erst
              auf Bestätigung.
            </>
          }
        >
          {uebernahme === null ? (
            <>
              <div className="mt-1">
                <Button variant="secondary" loading={uebernahmeLaeuft} onClick={uebernahmeVorbereiten}>
                  Vorschau erstellen
                </Button>
              </div>
            </>
          ) : uebernahme.length === 0 ? (
            <>
              <EmptyState>
                Alle Baustellen sind bereits einem Kunden zugeordnet. Nichts zu übernehmen.
              </EmptyState>
              <div className="mt-3">
                <Button variant="ghost" onClick={() => setUebernahme(null)}>
                  Schließen
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink">
                <strong>{uebernahme.length}</strong>{' '}
                {uebernahme.length === 1 ? 'Kunde entsteht' : 'Kunden entstehen'} aus{' '}
                {uebernahme.reduce((n, g) => n + g.projekte.length, 0)} Baustellen.
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Stehen hier zwei Schreibweisen desselben Kunden, entstehen auch zwei Datensätze.
                Sie lassen sich danach zusammenführen, indem die Baustellen der einen dem anderen
                zugeordnet werden.
              </p>
              <ul className="mt-3 max-h-64 divide-y divide-line overflow-y-auto rounded border border-line">
                {uebernahme.map((g) => (
                  <li key={g.name} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="truncate text-ink">{g.name}</span>
                    <Badge tone="info">
                      {g.projekte.length}{' '}
                      {g.projekte.length === 1 ? 'Baustelle' : 'Baustellen'}
                    </Badge>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button loading={uebernahmeLaeuft} onClick={uebernahmeAusfuehren}>
                  Übernahme durchführen
                </Button>
                <Button variant="ghost" onClick={() => setUebernahme(null)}>
                  Abbrechen
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      <Card
        title={`Kunden (${kunden.length})`}
        action={
          <input
            aria-label="Kunden durchsuchen"
            placeholder="Suchen …"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            className="min-h-touch rounded border border-line bg-surface px-3 py-1 text-base text-ink"
          />
        }
      >
        {loading ? (
          <SkeletonList rows={4} />
        ) : sichtbar.length === 0 ? (
          <EmptyState>
            {kunden.length === 0
              ? 'Noch keine Kunden. Über „Bestehende Baustellen übernehmen" lassen sich die vorhandenen anlegen.'
              : `Kein Kunde passt zu „${suche}".`}
          </EmptyState>
        ) : (
          <List>
            {sichtbar.map((k) => (
              <ListRow
                key={k.id}
                title={k.name}
                subtitle={
                  <>
                    <span className="flex flex-wrap items-center gap-x-3">
                      <AdresseLink adresse={k.address} />
                      <TelefonLink nummer={k.contactPhone} name={k.contactName} />
                    </span>
                    {k.contactName && (
                      <span className="mt-1 block text-xs text-ink-muted">{k.contactName}</span>
                    )}
                    {offen === k.id && (
                      <span className="mt-2 block rounded border border-line p-2">
                        <span className="section-label block">Baustellen</span>

                        {akte.zustand === 'laedt' && (
                          <span className="mt-1 block text-sm text-ink-muted">lädt …</span>
                        )}

                        {akte.zustand === 'fehler' && (
                          <span className="mt-1 block text-sm text-danger">
                            Die Baustellen konnten nicht geladen werden. Das heißt nicht, dass es
                            keine gibt.
                          </span>
                        )}

                        {akte.zustand === 'bereit' && (
                          <>
                            {akte.zugeordnet.length === 0 ? (
                              <span className="mt-1 block text-sm text-ink-muted">
                                Noch keine Baustelle zugeordnet.
                              </span>
                            ) : (
                              <span className="mt-1 block space-y-1">
                                {akte.zugeordnet.map((p) => (
                                  <Link
                                    key={p.id}
                                    to={`/admin-projects?baustelle=${encodeURIComponent(p.projectNumber)}`}
                                    className="block truncate text-sm text-brand underline"
                                  >
                                    {p.projectNumber} · {p.address ?? 'ohne Adresse'} ({p.status})
                                  </Link>
                                ))}
                              </span>
                            )}

                            {/*
                              DER TEIL, DER VORHER FEHLTE. Eine Baustelle mit
                              genau diesem Kundennamen, die auf keinen Kunden
                              zeigt. Sie hier nur anzuzeigen wäre halb: der
                              Knopf daneben stellt die Verbindung her.
                            */}
                            {akte.vorschlaege.length > 0 && (
                              <span className="mt-3 block rounded border border-warning/40 bg-warning-bg p-2">
                                <span className="block text-sm text-warning">
                                  <strong>{akte.vorschlaege.length}</strong>{' '}
                                  {akte.vorschlaege.length === 1
                                    ? 'Baustelle trägt diesen Namen'
                                    : 'Baustellen tragen diesen Namen'}
                                  , {akte.vorschlaege.length === 1 ? 'ist' : 'sind'} aber noch
                                  keinem Kunden zugeordnet.
                                </span>
                                <span className="mt-2 block space-y-1">
                                  {akte.vorschlaege.map((p) => (
                                    <span
                                      key={p.id}
                                      className="flex flex-wrap items-center justify-between gap-2"
                                    >
                                      <span className="truncate text-sm text-ink">
                                        {p.projectNumber} · {p.address ?? 'ohne Adresse'}
                                      </span>
                                      {darfAendern && (
                                        <Button
                                          variant="secondary"
                                          loading={zuordnenLaeuft === p.id}
                                          onClick={async () => {
                                            setZuordnenLaeuft(p.id);
                                            try {
                                              await assignProjectToCustomer(p.id, k.id, k.name);
                                              toast.success('Baustelle zugeordnet');
                                              await akteLaden(k);
                                            } catch {
                                              setError('Die Zuordnung ist fehlgeschlagen.');
                                            } finally {
                                              setZuordnenLaeuft(null);
                                            }
                                          }}
                                        >
                                          Zuordnen
                                        </Button>
                                      )}
                                    </span>
                                  ))}
                                </span>
                              </span>
                            )}

                            {/*
                              Der Namensabgleich ist EXAKT. „Fam. Huber" und
                              „Huber" findet er nicht — das gehört gesagt,
                              sonst hält jemand das Ergebnis für vollständig.
                            */}
                            {akte.zugeordnet.length === 0 && akte.vorschlaege.length === 0 && (
                              <span className="mt-1 block text-xs text-ink-muted">
                                Gesucht wurde nach exakt „{k.name}". Bei abweichender Schreibweise
                                hilft „Bestehende Baustellen übernehmen" weiter oben.
                              </span>
                            )}

                            {akte.angebote.length > 0 && (
                              <>
                                <span className="section-label mt-3 block">Angebote</span>
                                <span className="mt-1 block space-y-1">
                                  {akte.angebote.map((q) => (
                                    <Link
                                      key={q.id}
                                      to="/quotes"
                                      className="block truncate text-sm text-brand underline"
                                    >
                                      {q.quoteNumber} · {fmtEUR(q.totalNetto)} netto ({q.status})
                                    </Link>
                                  ))}
                                </span>
                              </>
                            )}
                          </>
                        )}
                      </span>
                    )}
                  </>
                }
              >
                <Button
                  variant="ghost"
                  onClick={() => setOffen(offen === k.id ? null : k.id)}
                >
                  {offen === k.id ? 'Historie schließen' : 'Historie'}
                </Button>
                {darfAendern && (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setBearbeitet(k);
                        setForm({
                          name: k.name,
                          address: k.address ?? '',
                          contactName: k.contactName ?? '',
                          contactPhone: k.contactPhone ?? '',
                          email: k.email ?? '',
                          vatId: k.vatId ?? '',
                          notes: k.notes ?? '',
                          active: k.active ?? true,
                        });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Bearbeiten
                    </Button>
                    <IconButton label={`${k.name} löschen`} tone="danger" onClick={() => setToDelete(k)}>
                      ✕
                    </IconButton>
                  </>
                )}
              </ListRow>
            ))}
          </List>
        )}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Kunde löschen?"
        message={
          toDelete
            ? `„${toDelete.name}" wird entfernt. Das geht nur, solange dem Kunden keine Baustelle zugeordnet ist.`
            : ''
        }
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete || !user) return;
          try {
            await deleteCustomer(user.companyId, toDelete.id);
            toast.success('Kunde gelöscht');
            await laden();
          } catch (e) {
            setError((e as Error).message);
          }
          setToDelete(null);
        }}
      />
    </div>
  );
}
