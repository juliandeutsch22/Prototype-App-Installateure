import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  searchCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  assignProjectToCustomer,
  type NewCustomer,
} from '@/lib/db/customers';
import { listRecentProjects } from '@/lib/db/projects';
import { darfKundenPflegen, isGF } from '@/lib/permissions';
import type { Customer, Project } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import RowMenu from '@/components/RowMenu';
import { Marke } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import Nachladen from '@/components/Nachladen';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField, FormGrid, Pflichthinweis } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import KundenImport from './KundenImport';
import { grundAus } from '@/lib/fehlerGrund';

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

/** Namen für den Abgleich vereinheitlichen — Groß-/Kleinschreibung und Leerraum. */
function schluessel(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

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
/**
 * Wie viele Kunden auf einmal geholt werden.
 *
 * Zweihundert statt der bisherigen fünfhundert: die Liste ist zum
 * NACHSCHLAGEN da, und nachgeschlagen wird über die Suche, nicht durch
 * Scrollen. Die kleinere Zahl kostet auf einer Baustelle mit halbem Balken
 * weniger — und was fehlt, steht jetzt dabei, statt lautlos zu verschwinden.
 */
const KUNDEN_JE_SEITE = 200;

export default function CustomersView() {
  const { user } = useAuth();
  const toast = useToast();
  const [kunden, setKunden] = useState<WithId<Customer>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [form, setForm] = useState<NewCustomer>(LEER);
  const [bearbeitet, setBearbeitet] = useState<WithId<Customer> | null>(null);
  /*
    DAS FORMULAR STEHT NICHT MEHR OFFEN, SONDERN KLAPPT AUF.

    GEMESSEN am Telefon (390 px breit, davon nach Kopf- und Fussleiste rund
    590 px sichtbar): die Kundenliste begann bei 1175 px — zwei Bildschirme
    Wischen an einer leeren Maske vorbei. Man öffnet diesen Reiter aber, um
    einen Kunden zu FINDEN; angelegt wird alle paar Wochen einer.

    Das offene Formular sparte beim Anlegen einen Klick und kostete beim
    Nachschauen jedes Mal zwei Wischer. Schlimmer als die Wege: eine Maske
    ganz oben sieht aus wie der ZWECK der Seite.

    Das Muster ist nicht neu — `WartungenView` macht es seit jeher so, und
    `PageHeader` trägt den `action`-Platz dafür. Hier wird es durchgezogen,
    nicht erfunden.
  */
  const [formOffen, setFormOffen] = useState(false);

  const formSchliessen = () => {
    setFormOffen(false);
    setBearbeitet(null);
    setForm(LEER);
  };
  const [speichert, setSpeichert] = useState(false);
  const [toDelete, setToDelete] = useState<WithId<Customer> | null>(null);

  /*
    ZWEI RECHTE, NICHT EINES. Kunden pflegt, wer die Freigabe hat (siehe
    `darfKundenPflegen`) — die Bürokraft ebenso wie die Leitung. „Bestehende
    Baustellen übernehmen“ ordnet dagegen BAUSTELLEN zu, und die ändert nur
    die Leitung; bekäme die Bürokraft den Knopf, schlüge er in der
    Datenbank fehl.
  */
  const darfAendern = user ? darfKundenPflegen(user) : false;
  const darfBaustellenZuordnen = user ? isGF(user.role) : false;

  /*
    WIE VIELE KUNDEN GELADEN SIND — als Zustand, nicht als feste Zahl.

    Vorher stand hier die Voreinstellung der Abfrage: fünfhundert,
    alphabetisch. Ein Betrieb mit mehr Kunden verlor die hinteren Buchstaben,
    und zwar lautlos — der 501. Kunde existierte für die App nicht mehr, auch
    nicht in der Suche. Jetzt sagt die Liste, wenn sie an ihrer Grenze steht,
    und lässt nachladen.
  */
  const [grenze, setGrenze] = useState(KUNDEN_JE_SEITE);

  /*
    GESUCHT WIRD SERVERSEITIG — und das ändert, was die Liste bedeutet.

    Vorher wurden die ersten `grenze` Kunden geladen und im Browser gefiltert:
    wer den 501. suchte, fand ihn nicht, und die App sagte darüber nichts. Der
    Suchbegriff geht jetzt mit in die Abfrage, und die Datenbank sucht über
    den ganzen Bestand.

    WARUM NICHT BEI JEDEM TASTENDRUCK. Zwischen zwei Anschlägen liegen
    Millisekunden, eine Abfrage dauert länger — ohne Verzögerung stünden
    zwanzig Abfragen gleichzeitig in der Leitung, und die Antworten kämen in
    beliebiger Reihenfolge zurück. Dreihundert Millisekunden sind die Pause,
    nach der jemand aufgehört hat zu tippen.
  */
  const [begriff, setBegriff] = useState('');
  const [ohneSuche, setOhneSuche] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setBegriff(suche), 300);
    return () => clearTimeout(t);
  }, [suche]);

  const laden = useMemo(
    () => async () => {
      if (!user) return;
      setLoading(true);
      try {
        const treffer = await searchCustomers(user.companyId, begriff, grenze);
        setKunden(treffer);
        /*
          WIE VIELE OHNE SUCHE DA WAREN — getrennt gemerkt.

          Der Nachladehinweis spricht über die geladene LISTE, nicht über ein
          Suchergebnis. Speiste man ihn mit den Treffern, verschwände er beim
          ersten Suchversuch — und mit ihm die Auskunft, dass die Liste
          überhaupt an ihrer Grenze steht.
        */
        if (!begriff.trim()) setOhneSuche(treffer.length);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [user, grenze, begriff],
  );

  useEffect(() => {
    void laden();
  }, [laden]);

  const sichtbar = kunden;

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
      setFormOffen(false);
      await laden();
    } catch (err) {
      setError(grundAus(err, 'Der Kunde konnte nicht gespeichert werden.'));
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
    } catch (err) {
      setError(grundAus(err, 'Die Übernahme ist fehlgeschlagen.'));
    } finally {
      setUebernahmeLaeuft(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kunden"
        subtitle="Stammdaten, Ansprechpartner und Baustellenhistorie"
        action={
          darfAendern && !formOffen ? (
            <Button onClick={() => { setBearbeitet(null); setForm(LEER); setFormOffen(true); }}>
              Neuer Kunde
            </Button>
          ) : undefined
        }
      />

      {darfAendern && formOffen && (
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
              {/*
                ABBRECHEN GILT JETZT IMMER, nicht nur beim Bearbeiten: solange
                das Formular offen stand, gab es nichts abzubrechen — jetzt
                ist es der Weg zurück zur Liste.
              */}
              <Button
                type="button"
                variant="ghost"
                onClick={formSchliessen}
                className="w-full sm:w-auto"
              >
                Abbrechen
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Übernahme der Altbestände — nur solange es etwas zu übernehmen gibt. */}
      {darfBaustellenZuordnen && (
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
                    <Marke>
                      {g.projekte.length}{' '}
                      {g.projekte.length === 1 ? 'Baustelle' : 'Baustellen'}
                    </Marke>
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

      {/* Der Kundenstamm aus dem Altprogramm — beim Umstieg einmal, danach selten. */}
      {darfAendern && <KundenImport onUebernommen={() => void laden()} />}

      <Card
        title={`Kunden (${kunden.length})`}
        action={
          <input
            aria-label="Kunden durchsuchen"
            placeholder="Suchen …"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            // `w-full sm:w-auto`: der Kartenkopf ist mobil eine SPALTE, und
            // ein Eingabefeld ohne Breitenangabe nimmt darin seine
            // Wunschbreite (rund 180 px plus Polsterung) — gemessen 18 px
            // mehr, als die Karte innen hat. Es ragte damit unter dem Titel
            // heraus. Volle Breite ist dort ohnehin das Richtige.
            className="min-h-touch w-full rounded border border-line bg-surface px-3 py-1 text-base text-ink sm:w-auto"
          />
        }
      >
        {loading ? (
          <SkeletonList rows={4} />
        ) : sichtbar.length === 0 ? (
          <EmptyState>
            {/*
              DIE UNTERSCHEIDUNG HÄNGT AM SUCHBEGRIFF, NICHT AN DER LISTE.

              Bis zum 14.09.2026 war `kunden` die geladene Liste, und leer
              hiess „es gibt keine". Jetzt ist `kunden` das ERGEBNIS DER
              SUCHE — und leer heisst dann „nichts passt". Bliebe die alte
              Bedingung stehen, läse ein Betrieb mit vierhundert Kunden beim
              ersten Fehlversuch „Noch keine Kunden", und das wäre ein
              Schrecken ohne Grund.
            */}
            {suche.trim()
              ? `Kein Kunde passt zu „${suche}".`
              : 'Noch keine Kunden. Über „Bestehende Baustellen übernehmen" lassen sich die vorhandenen anlegen.'}
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
                  </>
                }
              >
                {/*
                  DIE AKTE IST EINE SEITE, KEIN AUFKLAPPEN MEHR.

                  Hier stand „Historie" und schob Baustellen und Angebote in
                  die Nebenzeile dieser Listenzeile. Um Stammdaten und
                  Wartungen erweitert wäre daraus eine Ansicht in der
                  Verkleidung einer Zeile geworden — und E-Mail, UID und Notiz
                  standen bis dahin überhaupt nirgends.
                */}
                <Link
                  to={`/customers/${k.id}`}
                  className="link-weiter flex min-h-touch items-center px-2 text-sm"
                >
                  Akte
                </Link>
                {/*
                  DIESELBEN ZEILENAKTIONEN WIE BEI DEN BAUSTELLEN: die Akte
                  sichtbar, das Seltene im „⋯" (Launch-Check 25.09.2026 —
                  hier standen „Bearbeiten" und ein ✕ in der Zeile, dort
                  „Akte" und ⋯). Das Löschen gehört nicht an die auffälligste
                  Stelle der Zeile.
                */}
                {darfAendern && (
                  <RowMenu
                    about={`Kunde ${k.name}`}
                    items={[
                      {
                        label: 'Bearbeiten',
                        onSelect: () => {
                          setBearbeitet(k);
                          setFormOffen(true);
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
                        },
                      },
                      { label: 'Löschen', onSelect: () => setToDelete(k), danger: true },
                    ]}
                  />
                )}
              </ListRow>
            ))}
          </List>
        )}
        {/*
          Der Hinweis steht AUSSERHALB der Leermeldung: er gehört auch dann
          hin, wenn die Suche gerade nichts findet — denn genau dann ist die
          Frage „gibt es den Kunden nicht, oder ist er nur nicht geladen?" die
          entscheidende.
        */}
        {!loading && (
          <Nachladen
            geladen={suche.trim() ? ohneSuche : kunden.length}
            grenze={grenze}
            einheit="Kunden"
            onMehr={() => setGrenze((n) => n + KUNDEN_JE_SEITE)}
            /*
              UNTER POSTGRES IST DER SATZ „Die Suche geht nur über diese"
              FALSCH — und eine Auskunft, die einmal danebenlag, wird beim
              nächsten Mal nicht mehr geglaubt.

              Die Datenbank sucht über den ganzen Bestand; die Grenze gilt nur
              für das, was OHNE Suchbegriff angezeigt wird. Der Knopf bleibt
              deshalb stehen, der Satz daneben nicht.
            */
            sucheImBrowser={false}
          />
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
