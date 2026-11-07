import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { canAccess } from '@/app/navigation';
import {
  eingangAblehnen,
  eingangAendern,
  eingangKundeAnlegen,
  eingangLoeschen,
  eingangTerminSetzen,
  eingangWiederOeffnen,
  eingangZuAngebot,
  eingangZuBaustelle,
  getEingang,
} from '@/lib/db/auftragseingaenge';
import { listProjectsByIds } from '@/lib/db/projects';
import { getQuote } from '@/lib/db/quotes';
import { getTermin } from '@/lib/db/termine';
import { listUsers } from '@/lib/db/users';
import { darfEingangErfassen, darfEingangUmwandeln, darfKundenPflegen, darfTermineSchreiben } from '@/lib/permissions';
import { praefixeVon } from '@/lib/praefixe';
import { useModul } from '@/lib/useModule';
import { todayStr } from '@/lib/time';
import { datumAT } from '@/lib/datum';
import { grundAus } from '@/lib/fehlerGrund';
import type { Abrechnungsart, AppUser, Auftragseingang, Customer, Termin } from '@/types';
import type { WithId } from '@/lib/db/core';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Aktenspalten from '@/components/Aktenspalten';
import Button from '@/components/Button';
import KnopfLink from '@/components/KnopfLink';
import BottomSheet from '@/components/BottomSheet';
import ConfirmDialog from '@/components/ConfirmDialog';
import RowMenu, { type RowMenuItem } from '@/components/RowMenu';
import Hinweiszeile from '@/components/Hinweiszeile';
import { TextareaField } from '@/components/Field';
import { LotVerlauf, type LotPunkt } from '@/components/LotBausteine';
import { Zustand } from '@/components/Badge';
import { useToast } from '@/components/Toast';
import { EmptyState, ErrorState, SkeletonList, TeilFehler } from '@/components/States';
import ObjektVerlauf from '@/features/verlauf/ObjektVerlauf';
import { verlaufSichtbar } from '@/features/verlauf/verlaufSichtbar';
import AbrechnungWahl from '@/features/quotes/AbrechnungWahl';
import TerminFormular from '@/features/termine/TerminFormular';
import { terminKopf, terminZeit } from '@/features/termine/terminText';
import { ZIEL } from '@/features/dashboard/start/ziele';
import EingangFormular from './EingangFormular';
import { liegenschaftZeile } from '@/features/liegenschaften/liegenschaftText';
import { gleichnamigeKunden, rueckfrageText } from '@/features/customers/gleichnamig';
import {
  DRINGLICHKEIT_TEXT,
  QUELLE_TEXT,
  besichtigungNotiz,
  kundeText,
  wannText,
  zustandVon,
} from './eingangText';

type Teil<T> = { zustand: 'laedt' } | { zustand: 'fehler' } | { zustand: 'bereit'; daten: T };
const LAEDT = { zustand: 'laedt' } as const;

/** Wohin der Eingang führte — Baustelle oder Angebot, mit Nummer, soweit lesbar. */
interface Ziel {
  art: 'baustelle' | 'angebot';
  id: string;
  /** `null`: das Ziel gibt es, aber diese Rolle liest es nicht (Angebote: nur Führung und Buchhaltung). */
  nummer: string | null;
}

/**
 * EIN EINGANG AUF SEINER SEITE (M02b) — mit Adresse, damit Baustelle, Angebot
 * und Kunde darauf verweisen können.
 *
 * DER NÄCHSTE SCHRITT IST DIE HAUPTAKTION (eine je Seite): offen für die
 * Führung „Baustelle anlegen“, für das übrige Büro „Bearbeiten“; abgelehnt
 * „Wieder öffnen“; übernommen der Weg zur Baustelle bzw. zum Angebot. Was
 * seltener ist — Angebot statt Baustelle, Besichtigung, Kunde anlegen,
 * ablehnen, löschen — liegt im „⋯“ des Seitenkopfs. Was die Rolle nicht darf,
 * steht nicht da; die Grenze ziehen die Funktionen der Datenbank.
 */
export default function EingangView() {
  const { id } = useParams<{ id: string }>();
  const { user, company, einblick } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const angeboteAn = useModul('angebote');
  const einsatzAn = useModul('einsatzplanung');
  const liegenschaftenAn = useModul('kunden.liegenschaften');

  const [eingang, setEingang] = useState<Teil<Auftragseingang | null>>(LAEDT);
  const [ziel, setZiel] = useState<Teil<Ziel | null>>(LAEDT);
  const [termin, setTermin] = useState<Termin | null>(null);
  const [versuch, setVersuch] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [frage, setFrage] = useState<'baustelle' | 'angebot' | 'ablehnen' | 'loeschen' | null>(null);
  /** Gleichnamige Kunden vor einem Weg, der aus dem neuen Kunden einen Kunden macht — und welcher Weg es war. */
  const [dublette, setDublette] = useState<{ aktion: 'kunde' | 'baustelle' | 'angebot'; gleiche: WithId<Customer>[] } | null>(null);
  const [abrechnung, setAbrechnung] = useState<Abrechnungsart>('Regie');
  const [grund, setGrund] = useState('');
  const [bearbeiten, setBearbeiten] = useState(false);
  const [besichtigung, setBesichtigung] = useState(false);
  const [personen, setPersonen] = useState<AppUser[]>([]);

  const companyId = user?.companyId;

  useEffect(() => {
    if (!companyId || !id) return;
    let weg = false;
    setEingang(LAEDT);
    getEingang(companyId, id)
      .then((e) => { if (!weg) setEingang({ zustand: 'bereit', daten: e }); })
      .catch(() => { if (!weg) setEingang({ zustand: 'fehler' }); });
    return () => { weg = true; };
  }, [companyId, id, versuch]);

  /*
    WOHIN ER FÜHRTE, LÄDT FÜR SICH: scheitert es, fehlt nur der Verweis; der
    Eingang bleibt lesbar. Ein Angebot liest nur, wer Angebote liest — für
    die Verwaltung steht dann „Angebot“ ohne Nummer.
  */
  const e = eingang.zustand === 'bereit' ? eingang.daten : null;
  const projectId = e?.projectId ?? null;
  const quoteId = e?.quoteId ?? null;
  const terminId = e?.terminId ?? null;
  useEffect(() => {
    if (!companyId || eingang.zustand !== 'bereit') return;
    let weg = false;
    setZiel(LAEDT);
    void (async () => {
      try {
        let z: Ziel | null = null;
        if (projectId) {
          const [p] = await listProjectsByIds(companyId, [projectId]);
          z = { art: 'baustelle', id: projectId, nummer: p?.projectNumber ?? null };
        } else if (quoteId) {
          const q = await getQuote(companyId, quoteId).catch(() => null);
          z = { art: 'angebot', id: quoteId, nummer: q?.quoteNumber ?? null };
        }
        const t = terminId ? await getTermin(companyId, terminId).catch(() => null) : null;
        if (!weg) {
          setZiel({ zustand: 'bereit', daten: z });
          setTermin(t);
        }
      } catch {
        if (!weg) setZiel({ zustand: 'fehler' });
      }
    })();
    return () => { weg = true; };
  }, [companyId, eingang.zustand, projectId, quoteId, terminId]);

  // Die Belegschaft erst, wenn jemand eine Besichtigung vereinbart (Teilnehmer).
  useEffect(() => {
    if (!besichtigung || !companyId) return;
    let weg = false;
    listUsers(companyId).then((l) => { if (!weg) setPersonen(l); }).catch(() => undefined);
    return () => { weg = true; };
  }, [besichtigung, companyId]);

  if (!user || !companyId) return null;
  const zurueck = { to: '/eingaenge', text: 'Zum Auftragseingang' };

  if (eingang.zustand === 'laedt') {
    return (
      <div className="space-y-6">
        <PageHeader title="Eingang" zurueck={zurueck} />
        <SkeletonList rows={4} />
      </div>
    );
  }
  if (eingang.zustand === 'fehler') {
    return (
      <div className="space-y-6">
        <PageHeader title="Eingang" zurueck={zurueck} />
        <ErrorState message="Der Eingang konnte nicht geladen werden." onRetry={() => setVersuch((v) => v + 1)} />
      </div>
    );
  }
  if (!e) {
    return (
      <div className="space-y-6">
        <PageHeader title="Eingang" zurueck={zurueck} />
        <Card>
          <EmptyState titel="Nicht gefunden">Diesen Eingang gibt es nicht (mehr).</EmptyState>
        </Card>
      </div>
    );
  }

  // Im Supporteinblick nur lesen: die Datenbank lässt ihn hier nichts schreiben.
  const buero = darfEingangErfassen(user.role) && !einblick;
  const fuehrung = darfEingangUmwandeln(user.role) && !einblick;
  const offen = e.stand === 'offen';
  const neuerKunde = !e.customerId && !!e.neukundeName;
  const ohneKunde = !e.customerId && !e.neukundeName;
  const kundePflegen = darfKundenPflegen(user);
  const zielDa = ziel.zustand === 'bereit' ? ziel.daten : null;
  const zielWeg = e.stand === 'uebernommen' && !e.projectId && !e.quoteId;
  const besichtigungMoeglich = offen && buero && einsatzAn && darfTermineSchreiben(user.role) && !e.terminId;
  const z = zustandVon(e);

  const neuLaden = () => setVersuch((v) => v + 1);

  async function schritt(lauf: () => Promise<void>) {
    setBusy(true);
    setFehler(null);
    try {
      await lauf();
    } catch (err) {
      setFehler(grundAus(err, 'Das ging gerade nicht.'));
    } finally {
      setBusy(false);
    }
  }

  const kundeAnlegen = () => schritt(async () => {
    await eingangKundeAnlegen(e.id);
    toast.success(`Kunde ${e.neukundeName ?? ''} angelegt`.trim());
    neuLaden();
  });

  /** Der Weg selbst — ohne Rückfrage, oder nachdem sie beantwortet ist. */
  function weiter(aktion: 'kunde' | 'baustelle' | 'angebot') {
    if (aktion === 'kunde') void kundeAnlegen();
    else {
      if (aktion === 'baustelle') setAbrechnung('Regie');
      setFrage(aktion);
    }
  }

  /*
    GLEICHER NAME — DIESELBE RÜCKFRAGE WIE IN DER KUNDENLISTE (M11). Jeder
    Weg, der aus den Angaben zum neuen Kunden einen Kunden macht („Kunde
    anlegen“, Baustelle, Angebot), fragt vorher den Server, ob es den Namen
    schon gibt. Dann: einen der vorhandenen übernehmen — der Eingang zeigt
    danach auf ihn, die Angaben zum neuen Kunden sind leer — oder trotzdem
    anlegen.
  */
  const mitPruefung = (aktion: 'kunde' | 'baustelle' | 'angebot') => schritt(async () => {
    if (!neuerKunde || !e.neukundeName) {
      weiter(aktion);
      return;
    }
    const gleiche = await gleichnamigeKunden(companyId, e.neukundeName);
    if (gleiche.length === 0) weiter(aktion);
    else setDublette({ aktion, gleiche });
  });

  /** Statt einen zweiten anzulegen: den vorhandenen Kunden übernehmen (über den gewöhnlichen Ändern-Weg). */
  const eingangId = e.id;
  const eingangNummer = e.nummer;
  const firmaId = companyId;
  async function uebernehmen(k: WithId<Customer>, aktion: 'kunde' | 'baustelle' | 'angebot') {
    await eingangAendern(eingangId, {
      customerId: k.id,
      neukundeName: null, neukundeStrasse: null, neukundePlz: null, neukundeOrt: null,
      neukundeTelefon: null, neukundeEmail: null,
    });
    setDublette(null);
    toast.success(`Der Eingang ${eingangNummer} gehört jetzt zu ${k.name}`);
    const frisch = await getEingang(firmaId, eingangId);
    setEingang({ zustand: 'bereit', daten: frisch });
    if (aktion !== 'kunde') weiter(aktion);
  }

  const menue: RowMenuItem[] = [];
  if (offen && fuehrung && angeboteAn) menue.push({ label: 'Angebot anlegen', onSelect: () => void mitPruefung('angebot') });
  if (besichtigungMoeglich && e.customerId) menue.push({ label: 'Besichtigung vereinbaren', onSelect: () => setBesichtigung(true) });
  if (offen && buero && neuerKunde && kundePflegen) menue.push({ label: 'Kunde anlegen', onSelect: () => void mitPruefung('kunde') });
  if (offen && fuehrung) menue.push({ label: 'Bearbeiten', onSelect: () => setBearbeiten(true) });
  if (offen && buero) menue.push({ label: 'Ablehnen', onSelect: () => { setGrund(''); setFrage('ablehnen'); } });
  if ((offen || e.stand === 'abgelehnt') && fuehrung) menue.push({ label: 'Löschen', danger: true, onSelect: () => setFrage('loeschen') });

  const hauptaktion = (() => {
    if (offen && fuehrung) {
      return <Button loading={busy} onClick={() => void mitPruefung('baustelle')}>Baustelle anlegen</Button>;
    }
    if (offen && buero) return <Button onClick={() => setBearbeiten(true)}>Bearbeiten</Button>;
    if ((e.stand === 'abgelehnt' || zielWeg) && buero) {
      return (
        <Button loading={busy} onClick={() => void schritt(async () => {
          await eingangWiederOeffnen(e.id);
          toast.success(`Eingang ${e.nummer} ist wieder offen`);
          neuLaden();
        })}
        >
          Wieder öffnen
        </Button>
      );
    }
    if (zielDa?.art === 'baustelle' && canAccess(user.role, '/admin-projects', company?.modules)) {
      return <KnopfLink to={`/admin-projects/${zielDa.id}`}>Zur Baustelle</KnopfLink>;
    }
    if (zielDa?.art === 'angebot' && zielDa.nummer && canAccess(user.role, '/quotes', company?.modules)) {
      return <KnopfLink to={`/quotes/${zielDa.id}`}>Zum Angebot</KnopfLink>;
    }
    return undefined;
  })();

  /* Wohin er führte — in Worten, mit Weg, soweit die Rolle ihn gehen darf. */
  const zielText = (() => {
    if (ziel.zustand !== 'bereit' || !zielDa) return null;
    if (zielDa.art === 'baustelle') {
      const nr = zielDa.nummer ?? 'Baustelle';
      return canAccess(user.role, '/admin-projects', company?.modules)
        ? <Link to={`/admin-projects/${zielDa.id}`} className="link -my-3 py-3">Baustelle {nr}</Link>
        : <>Baustelle {nr}</>;
    }
    return zielDa.nummer && canAccess(user.role, '/quotes', company?.modules)
      ? <Link to={`/quotes/${zielDa.id}`} className="link -my-3 py-3">Angebot {zielDa.nummer}</Link>
      : <>ein Angebot</>;
  })();

  const punkte: LotPunkt[] = [
    { titel: 'Eingegangen', zeit: wannText(e.eingegangenAm), text: `${QUELLE_TEXT[e.quelle]}${e.erfasstVonName ? ` · erfasst von ${e.erfasstVonName}` : ''}` },
    ...(termin || e.terminId
      ? [{
          titel: 'Besichtigung',
          zeit: termin ? `${datumAT(termin.datum)}${terminZeit(termin) ? `, ${terminZeit(termin)}` : ''}` : undefined,
          text: termin
            ? (canAccess(user.role, '/assignments', company?.modules)
              ? <Link to={ZIEL.tag(termin.datum)} className="link -my-3 py-3">{terminKopf(termin)}</Link>
              : terminKopf(termin))
            : 'vereinbart — die Einzelheiten sieht, wer plant',
        }]
      : []),
    e.stand === 'offen'
      ? { titel: 'Offen', text: ohneKunde ? 'Ohne Kunden — bitte einen wählen, bevor er übernommen wird.' : 'Wartet darauf, Baustelle oder Angebot zu werden.', jetzt: true }
      : e.stand === 'abgelehnt'
        ? {
            titel: 'Abgelehnt',
            zeit: e.abgelehntAm ? wannText(e.abgelehntAm) : undefined,
            text: `${e.abgelehntGrund ?? ''}${e.abgelehntVonName ? ` — ${e.abgelehntVonName}` : ''}`,
            jetzt: true,
          }
        : {
            titel: 'Übernommen',
            zeit: e.uebernommenAm ? wannText(e.uebernommenAm) : undefined,
            text: zielWeg
              ? 'Baustelle bzw. Angebot gibt es nicht mehr — der Eingang lässt sich wieder öffnen.'
              : <>{zielText ?? '…'}{e.uebernommenVonName ? ` · ${e.uebernommenVonName}` : ''}</>,
            jetzt: true,
          },
  ];

  const stand = (
    <Card title="Stand" id="eingang-stand">
      <LotVerlauf name="Stand des Eingangs" punkte={punkte} />
      {/* Wer was wann geändert hat (M01b) — auf Klick. */}
      {verlaufSichtbar(user.role, 'eingang', !!einblick) && (
        <ObjektVerlauf companyId={companyId} objektart="eingang" objektId={e.id} />
      )}
    </Card>
  );

  const angaben = (
    <Card title="Angaben" id="eingang-angaben">
      <dl className="beleg-angaben grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Angabe wort="Kunde">
          {e.customerId && canAccess(user.role, '/customers', company?.modules) ? (
            <Link to={`/customers/${e.customerId}`} className="link inline-flex min-h-touch items-center">{kundeText(e)}</Link>
          ) : neuerKunde ? `${e.neukundeName} (neuer Kunde)` : ohneKunde ? null : kundeText(e)}
        </Angabe>
        {neuerKunde && (
          <Angabe wort="Anschrift und Kontakt des neuen Kunden">
            {[e.neukundeStrasse, [e.neukundePlz, e.neukundeOrt].filter(Boolean).join(' '), e.neukundeTelefon, e.neukundeEmail]
              .filter((x) => x && x.trim()).join(' · ')}
          </Angabe>
        )}
        <Angabe wort="Ort des Einsatzes">{e.ort}</Angabe>
        {/* M02c: Liegenschaft und Top — als Weg zur Akte, wer sie öffnen darf. */}
        {liegenschaftenAn && e.liegenschaftId && (
          <Angabe wort="Liegenschaft">
            {canAccess(user.role, '/liegenschaften', company?.modules)
              ? <Link to={`/liegenschaften/${e.liegenschaftId}`} className="link inline-flex min-h-touch items-center">{liegenschaftZeile(e)}</Link>
              : liegenschaftZeile(e)}
          </Angabe>
        )}
        <Angabe wort="Ansprechpartner vor Ort">
          {[e.ansprechpartnerName, e.ansprechpartnerTelefon].filter((x) => x && x.trim()).join(' · ')}
        </Angabe>
        <Angabe wort="Quelle">{QUELLE_TEXT[e.quelle]}</Angabe>
        <Angabe wort="Nummer des Auftraggebers">{e.auftraggeberNummer}</Angabe>
        <Angabe wort="Dringlichkeit">{DRINGLICHKEIT_TEXT[e.dringlichkeit]}</Angabe>
        <Angabe wort="Wunschtermin">{e.wunschtermin ? datumAT(e.wunschtermin) : null}</Angabe>
      </dl>
    </Card>
  );

  const anliegen = (
    <Card title="Anliegen" id="eingang-anliegen">
      <p className="whitespace-pre-line text-sm text-ink">{e.anliegen}</p>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        zurueck={zurueck}
        title="Eingang"
        stempel={e.nummer}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{kundeText(e)}</span>
            <Zustand stand={z.stand}>{z.text}</Zustand>
          </span>
        }
        action={hauptaktion}
        mehr={menue.length > 0 ? <RowMenu about={`Eingang ${e.nummer}`} items={menue} /> : undefined}
      />

      {ziel.zustand === 'fehler' && <TeilFehler was="wohin der Eingang führte" onRetry={neuLaden} />}
      {fehler && <ErrorState message={fehler} />}
      {offen && neuerKunde && besichtigungMoeglich && (
        <Hinweiszeile>
          <p>
            Für eine Besichtigung braucht der Eingang einen Kunden.{' '}
            {kundePflegen ? (
              <Button variant="ghost" groesse="klein" loading={busy} onClick={() => void mitPruefung('kunde')}>
                Kunde anlegen
              </Button>
            ) : (
              'Anlegen darf ihn, wer Kunden pflegt — oder einen vorhandenen wählen.'
            )}
          </p>
        </Hinweiszeile>
      )}

      <Aktenspalten
        telefon={[stand, anliegen, angaben]}
        links={[anliegen, angaben]}
        rechts={[stand]}
      />

      <BottomSheet open={bearbeiten} onClose={() => setBearbeiten(false)} label="Eingang bearbeiten" auchBreit titel="Eingang bearbeiten" stempel={e.nummer}>
        {bearbeiten && (
          <EingangFormular
            companyId={companyId}
            eingang={e}
            mitLiegenschaft={liegenschaftenAn}
            onGespeichert={() => { setBearbeiten(false); neuLaden(); }}
            onAbbrechen={() => setBearbeiten(false)}
          />
        )}
      </BottomSheet>

      <BottomSheet open={besichtigung} onClose={() => setBesichtigung(false)} label="Besichtigung vereinbaren" auchBreit titel="Besichtigung vereinbaren">
        {besichtigung && e.customerId && (
          <TerminFormular
            companyId={companyId}
            vorgabe={{ bezug: 'kunde', customerId: e.customerId, baustellen: [] }}
            personen={personen}
            heute={todayStr()}
            vorbelegt={{ art: 'Besichtigung', datum: e.wunschtermin ?? undefined, notiz: besichtigungNotiz(e) }}
            onGespeichert={(terminNeu) => {
              setBesichtigung(false);
              void schritt(async () => {
                // Der Eingang bleibt offen und zeigt den Termin.
                if (terminNeu) await eingangTerminSetzen(e.id, terminNeu);
                neuLaden();
              });
            }}
            onAbbrechen={() => setBesichtigung(false)}
          />
        )}
      </BottomSheet>

      <ConfirmDialog
        open={dublette !== null}
        title="Gleicher Name — trotzdem anlegen?"
        message={dublette ? rueckfrageText(e.neukundeName?.trim() ?? '', dublette.gleiche, 'sonst unten den vorhandenen für diesen Eingang übernehmen') : ''}
        confirmLabel="Trotzdem anlegen"
        confirmTone="primary"
        onCancel={() => setDublette(null)}
        onConfirm={() => {
          const aktion = dublette?.aktion;
          setDublette(null);
          if (aktion) weiter(aktion);
        }}
      >
        <ul className="flex flex-col gap-2">
          {(dublette?.gleiche ?? []).slice(0, 10).map((k) => (
            <li key={k.id}>
              <Button
                variant="secondary"
                onClick={() => void schritt(() => uebernehmen(k, dublette!.aktion))}
                aria-label={`${k.name} (${k.address?.trim() || 'ohne Adresse'}) übernehmen`}
              >
                {k.name} ({k.address?.trim() || 'ohne Adresse'}) übernehmen
              </Button>
            </li>
          ))}
        </ul>
      </ConfirmDialog>

      {/* Erst fragen, dann anlegen — wie beim Annehmen eines Angebots. */}
      <ConfirmDialog
        open={frage === 'baustelle'}
        title="Baustelle anlegen?"
        message={`Aus ${e.nummer} entsteht für ${kundeText(e)} eine Baustelle mit der nächsten Baustellennummer.${neuerKunde ? ` Dabei wird der Kunde „${e.neukundeName}“ angelegt.` : ''}`}
        confirmLabel="Baustelle anlegen"
        confirmTone="primary"
        onCancel={() => setFrage(null)}
        onConfirm={async () => {
          const r = await eingangZuBaustelle(e.id, praefixeVon(company).baustelle, abrechnung);
          setFrage(null);
          toast.success(r.neu ? `Baustelle ${r.projectNumber} angelegt` : `Die Baustelle ${r.projectNumber} gab es schon`);
          navigate(`/admin-projects/${r.projectId}`);
        }}
      >
        {/*
          OHNE ANGEBOT GIBT ES KEINEN FESTPREIS UND KEINE EINHEITSPREISE —
          deshalb steht hier Regie vor; gewählt wird wie beim Annehmen.
        */}
        <AbrechnungWahl wert={abrechnung} onWert={setAbrechnung} />
      </ConfirmDialog>

      <ConfirmDialog
        open={frage === 'angebot'}
        title="Angebot anlegen?"
        message={`Aus ${e.nummer} entsteht für ${kundeText(e)} ein Angebotsentwurf mit dem Anliegen in den Anmerkungen.${neuerKunde ? ` Dabei wird der Kunde „${e.neukundeName}“ angelegt.` : ''}`}
        confirmLabel="Angebot anlegen"
        confirmTone="primary"
        onCancel={() => setFrage(null)}
        onConfirm={async () => {
          const r = await eingangZuAngebot(e.id);
          setFrage(null);
          toast.success(r.neu ? `Angebot ${r.quoteNumber} angelegt` : `Das Angebot ${r.quoteNumber} gab es schon`);
          navigate(`/quotes/${r.quoteId}`);
        }}
      />

      <ConfirmDialog
        open={frage === 'ablehnen'}
        title="Eingang ablehnen?"
        message={`${e.nummer} steht danach unter „Abgelehnt“ und lässt sich wieder öffnen.`}
        confirmLabel="Ablehnen"
        confirmTone="primary"
        gesperrt={grund.trim().length < 3}
        onCancel={() => setFrage(null)}
        onConfirm={async () => {
          await eingangAblehnen(e.id, grund);
          setFrage(null);
          toast.success(`Eingang ${e.nummer} abgelehnt`);
          neuLaden();
        }}
      >
        <TextareaField id="eingang-ablehnen-grund" label="Grund" rows={3} maxLength={1000} value={grund} onChange={(ev) => setGrund(ev.target.value)} />
      </ConfirmDialog>

      <ConfirmDialog
        open={frage === 'loeschen'}
        title="Eingang löschen?"
        message={`${e.nummer} wird endgültig gelöscht. Ein Eingang ist kein Beleg — übernommene bleiben, weil sie belegen, woher Baustelle bzw. Angebot kamen.`}
        onCancel={() => setFrage(null)}
        onConfirm={async () => {
          await eingangLoeschen(e.id);
          setFrage(null);
          toast.success(`Eingang ${e.nummer} gelöscht`);
          navigate('/eingaenge');
        }}
      />
    </div>
  );
}

function Angabe({ wort, children }: { wort: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="section-label">{wort}</dt>
      <dd className="mt-0.5 text-sm text-ink">
        {children || <span className="text-ink-muted">nicht angegeben</span>}
      </dd>
    </div>
  );
}
