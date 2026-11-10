import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { canAccess } from '@/app/navigation';
import {
  AKTE_GRENZE,
  beteiligterAendern,
  beteiligterEntfernen,
  beteiligterZuKunde,
  getLiegenschaft,
  liegenschaftLoeschen,
  listBaustellenDerLiegenschaft,
  listBeteiligte,
  listTops,
  listWartungenDerLiegenschaft,
  topLoeschen,
} from '@/lib/db/liegenschaften';
import { listCustomersByIds } from '@/lib/db/customers';
import { darfKundenPflegen } from '@/lib/permissions';
import { useModul } from '@/lib/useModule';
import { todayStr } from '@/lib/time';
import { datumAT } from '@/lib/datum';
import { grundAus } from '@/lib/fehlerGrund';
import type { Customer, Liegenschaft, LiegenschaftBeteiligter, LiegenschaftTop, Project, Wartung } from '@/types';
import type { WithId } from '@/lib/db/core';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import ConfirmDialog from '@/components/ConfirmDialog';
import RowMenu, { type RowMenuItem } from '@/components/RowMenu';
import AktenBereiche, { AktenAngaben, AktenAngabe } from '@/components/AktenBereiche';
import { List, ListRow } from '@/components/ListRow';
import { SelectField } from '@/components/Field';
import { Zustand } from '@/components/Badge';
import { AdresseLink, MailLink, TelefonLink } from '@/components/Kontakt';
import { useToast } from '@/components/Toast';
import { EmptyState, ErrorState, SkeletonList, TeilFehler } from '@/components/States';
import ObjektVerlauf from '@/features/verlauf/ObjektVerlauf';
import { verlaufSichtbar } from '@/features/verlauf/verlaufSichtbar';
import { gleichnamigeKunden, rueckfrageText } from '@/features/customers/gleichnamig';
import LiegenschaftFormular from './LiegenschaftFormular';
import TopFormular from './TopFormular';
import BeteiligterFormular from './BeteiligterFormular';
import { ROLLE_TEXT, beteiligterName, giltAm, topText, zeitraumText } from './liegenschaftText';

type Teil<T> = { zustand: 'laedt' } | { zustand: 'fehler' } | { zustand: 'bereit'; daten: T };
const LAEDT = { zustand: 'laedt' } as const;

type Fenster =
  | { art: 'liegenschaft' }
  | { art: 'top'; top?: LiegenschaftTop }
  | { art: 'beteiligter'; beteiligter?: LiegenschaftBeteiligter; vorgabeTopId?: string };

/**
 * DIE AKTE EINER LIEGENSCHAFT (M02c, A09).
 *
 * - „Tops und Beteiligte“: die Wohnungen bzw. Einheiten und wer beteiligt
 *   ist, je mit Rolle — aktuelle oben, ausgezogene unter „Früher“, mit
 *   „Entfernen“ (eine echte Löschung samt der Werte im Journal; von selbst
 *   wird nichts gelöscht).
 * - „Baustellen und Wartungen“: was in diesem Haus gemacht wurde, je Top
 *   filterbar (das Top steht in der Adresse, `?top=`).
 * - „Stammdaten“: Bezeichnung, Anschrift, Notiz und der Änderungsverlauf —
 *   samt dem der Tops und Beteiligten.
 *
 * Pflegen darf, wer Kunden pflegen darf (wie der Server); im
 * Supporteinblick nur lesen. Eine ganze Zeile öffnet ihr Bearbeiten.
 */
export default function LiegenschaftView() {
  const { id } = useParams<{ id: string }>();
  const { user, company, einblick } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const wartungAn = useModul('wartung');
  const [adresse, setAdresse] = useSearchParams();
  const topFilter = adresse.get('top') ?? '';

  const [liegenschaft, setLiegenschaft] = useState<Teil<Liegenschaft | null>>(LAEDT);
  const [tops, setTops] = useState<Teil<LiegenschaftTop[]>>(LAEDT);
  const [beteiligte, setBeteiligte] = useState<Teil<LiegenschaftBeteiligter[]>>(LAEDT);
  const [kunden, setKunden] = useState<Map<string, WithId<Customer>>>(new Map());
  const [baustellen, setBaustellen] = useState<Teil<WithId<Project>[]>>(LAEDT);
  const [wartungen, setWartungen] = useState<Teil<WithId<Wartung>[]>>(LAEDT);
  const [versuch, setVersuch] = useState(0);
  const [fenster, setFenster] = useState<Fenster | null>(null);
  const [frage, setFrage] = useState<
    | { art: 'liegenschaft' }
    | { art: 'top'; top: LiegenschaftTop }
    | { art: 'beteiligter'; beteiligter: LiegenschaftBeteiligter }
    | null
  >(null);
  const [dublette, setDublette] = useState<{ beteiligter: LiegenschaftBeteiligter; gleiche: WithId<Customer>[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const companyId = user?.companyId;
  const heute = todayStr();
  const neuLaden = () => setVersuch((v) => v + 1);

  useEffect(() => {
    if (!companyId || !id) return;
    let weg = false;
    setLiegenschaft(LAEDT);
    setTops(LAEDT);
    setBeteiligte(LAEDT);
    getLiegenschaft(companyId, id)
      .then((l) => { if (!weg) setLiegenschaft({ zustand: 'bereit', daten: l }); })
      .catch(() => { if (!weg) setLiegenschaft({ zustand: 'fehler' }); });
    listTops(companyId, id)
      .then((t) => { if (!weg) setTops({ zustand: 'bereit', daten: t }); })
      .catch(() => { if (!weg) setTops({ zustand: 'fehler' }); });
    void (async () => {
      try {
        const b = await listBeteiligte(companyId, id);
        const ids = [...new Set(b.map((x) => x.customerId).filter((x): x is string => !!x))];
        const k = ids.length > 0 ? await listCustomersByIds(companyId, ids) : [];
        if (weg) return;
        setKunden(new Map(k.map((x) => [x.id, x])));
        setBeteiligte({ zustand: 'bereit', daten: b });
      } catch {
        if (!weg) setBeteiligte({ zustand: 'fehler' });
      }
    })();
    return () => { weg = true; };
  }, [companyId, id, versuch]);

  // Baustellen und Wartungen hängen am Filter — sie laden für sich.
  useEffect(() => {
    if (!companyId || !id) return;
    let weg = false;
    setBaustellen(LAEDT);
    listBaustellenDerLiegenschaft(companyId, id, topFilter || null)
      .then((p) => { if (!weg) setBaustellen({ zustand: 'bereit', daten: p }); })
      .catch(() => { if (!weg) setBaustellen({ zustand: 'fehler' }); });
    if (wartungAn) {
      setWartungen(LAEDT);
      listWartungenDerLiegenschaft(companyId, id, topFilter || null)
        .then((w) => { if (!weg) setWartungen({ zustand: 'bereit', daten: w }); })
        .catch(() => { if (!weg) setWartungen({ zustand: 'fehler' }); });
    }
    return () => { weg = true; };
  }, [companyId, id, topFilter, wartungAn, versuch]);

  const topNamen = useMemo(
    () => new Map((tops.zustand === 'bereit' ? tops.daten : []).map((t) => [t.id, t.bezeichnung])),
    [tops],
  );

  if (!user || !companyId) return null;
  const zurueck = { to: '/liegenschaften', text: 'Zu den Liegenschaften' };

  if (liegenschaft.zustand === 'laedt') {
    return (
      <div className="space-y-6">
        <PageHeader title="Liegenschaft" zurueck={zurueck} />
        <SkeletonList rows={4} />
      </div>
    );
  }
  if (liegenschaft.zustand === 'fehler') {
    return (
      <div className="space-y-6">
        <PageHeader title="Liegenschaft" zurueck={zurueck} />
        <ErrorState message="Die Liegenschaft konnte nicht geladen werden." onRetry={neuLaden} />
      </div>
    );
  }
  const l = liegenschaft.daten;
  if (!l) {
    return (
      <div className="space-y-6">
        <PageHeader title="Liegenschaft" zurueck={zurueck} />
        <Card>
          <EmptyState titel="Nicht gefunden">Diese Liegenschaft gibt es nicht (mehr).</EmptyState>
        </Card>
      </div>
    );
  }

  const pflegen = darfKundenPflegen(user) && !einblick;
  const kundenOeffnen = canAccess(user.role, '/customers', company?.modules);
  const baustellenOeffnen = canAccess(user.role, '/admin-projects', company?.modules);
  const topListe = tops.zustand === 'bereit' ? tops.daten : [];
  const alleBeteiligten = beteiligte.zustand === 'bereit' ? beteiligte.daten : [];
  /*
    DREI GRUPPEN, NICHT ZWEI. Wer erst ab einem späteren Tag gilt (der neue
    Mieter ab nächstem Monat), stand unter „Früher“ — als wäre er schon
    ausgezogen. Früher ist nur, wessen „gültig bis“ vorbei ist; alles andere,
    was heute nicht gilt, beginnt erst.
  */
  const aktuelle = alleBeteiligten.filter((b) => giltAm(b, heute));
  const frueher = alleBeteiligten.filter((b) => !!b.gueltigBis && b.gueltigBis < heute);
  const kuenftige = alleBeteiligten.filter((b) => !giltAm(b, heute) && !frueher.includes(b));

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

  function filtern(top: string) {
    const neu = new URLSearchParams(adresse);
    if (top) neu.set('top', top);
    else neu.delete('top');
    setAdresse(neu, { replace: true, preventScrollReset: true });
  }

  /*
    AUS FREIEN ANGABEN WIRD EIN KUNDE — mit derselben Rückfrage wie in der
    Kundenliste, wenn es den Namen schon gibt: einen vorhandenen übernehmen
    (der Beteiligte zeigt dann auf ihn, die freien Angaben gehen) oder
    trotzdem anlegen.
  */
  const zuKunde = (b: LiegenschaftBeteiligter) => schritt(async () => {
    const gleiche = await gleichnamigeKunden(companyId, b.name ?? '');
    if (gleiche.length > 0) {
      setDublette({ beteiligter: b, gleiche });
      return;
    }
    await beteiligterZuKunde(b.id);
    setFenster(null);
    toast.success(`${b.name ?? 'Der Beteiligte'} ist jetzt Kunde`);
    neuLaden();
  });

  const zeileBeteiligter = (b: LiegenschaftBeteiligter) => {
    const name = beteiligterName(b, kunden);
    const zeitraum = zeitraumText(b, datumAT);
    const unter = [
      ROLLE_TEXT[b.rolle],
      b.topId ? topNamen.get(b.topId) ?? 'Top' : 'ganze Liegenschaft',
      b.customerId ? 'Kunde' : [b.telefon, b.email].filter(Boolean).join(' · '),
      zeitraum,
      b.hinweis,
    ].filter(Boolean).join(' · ');
    if (pflegen) {
      return (
        <ListRow key={b.id} title={name} subtitle={unter}
          onOeffnen={() => setFenster({ art: 'beteiligter', beteiligter: b })} />
      );
    }
    return (
      <ListRow key={b.id} title={name} subtitle={unter}
        {...(b.customerId && kundenOeffnen ? { to: `/customers/${b.customerId}`, pfeil: true } : {})} />
    );
  };

  const topsKarte = (
    <Card id="l-tops" title={`Tops${tops.zustand === 'bereit' ? ` (${tops.daten.length})` : ''}`}
      action={pflegen ? <Button variant="secondary" groesse="klein" onClick={() => setFenster({ art: 'top' })}>Top anlegen</Button> : undefined}
      buendig>
      {tops.zustand === 'laedt' ? <SkeletonList rows={2} />
        : tops.zustand === 'fehler' ? <TeilFehler was="die Tops" onRetry={neuLaden} />
          : tops.daten.length === 0 ? <EmptyState>Noch kein Top — eine Liegenschaft ohne Wohnungen braucht keine.</EmptyState>
            : (
              <List>
                {tops.daten.map((t) => (
                  <ListRow key={t.id} title={t.bezeichnung}
                    subtitle={[t.lage, t.notiz].filter(Boolean).join(' · ') || undefined}
                    zustand={t.aktiv === false ? <Zustand stand="storniert">inaktiv</Zustand> : undefined}
                    {...(pflegen ? { onOeffnen: () => setFenster({ art: 'top', top: t }) } : {})} />
                ))}
              </List>
            )}
    </Card>
  );

  const beteiligteKarte = (
    <Card id="l-beteiligte" title="Beteiligte"
      action={pflegen ? <Button variant="secondary" groesse="klein" onClick={() => setFenster({ art: 'beteiligter' })}>Beteiligten eintragen</Button> : undefined}
      hint={
        <>
          Jeder Beteiligte hat eine Rolle — Eigentümer, Hausverwaltung, Betreiber, Nutzer bzw. Mieter,
          Auftraggeber, Rechnungsempfänger, Versicherung, Lieferadresse — und ist ein Kunde oder steht
          mit freien Angaben da. Beim Anlegen einer Baustelle werden Rechnungsempfänger, Auftraggeber
          bzw. Hausverwaltung als Kunde vorgeschlagen, wenn sie Kunden sind, und der Nutzer des Tops als
          Ansprechpartner. Wer erst später gilt (gültig ab in der Zukunft), steht unter „Künftig“, wer nicht mehr
          gilt (gültig bis vorbei), unter „Früher“; „Entfernen“
          löscht ihn samt seinen Angaben im Änderungsverlauf. Von selbst wird nichts gelöscht.
        </>
      }
      buendig>
      {beteiligte.zustand === 'laedt' ? <SkeletonList rows={2} />
        : beteiligte.zustand === 'fehler' ? <TeilFehler was="die Beteiligten" onRetry={neuLaden} />
          : alleBeteiligten.length === 0 ? <EmptyState>Noch niemand eingetragen.</EmptyState>
            : (
              <>
                {aktuelle.length > 0 && <List>{aktuelle.map(zeileBeteiligter)}</List>}
                {kuenftige.length > 0 && (
                  <section aria-label="Künftig" className="mt-2">
                    <p className="section-label px-4">Künftig</p>
                    <List>{kuenftige.map(zeileBeteiligter)}</List>
                  </section>
                )}
                {frueher.length > 0 && (
                  <section aria-label="Früher" className="mt-2">
                    <p className="section-label px-4">Früher</p>
                    <List>{frueher.map(zeileBeteiligter)}</List>
                  </section>
                )}
              </>
            )}
    </Card>
  );

  const filterFeld = topListe.length > 0 ? (
    <div className="px-4 pb-2">
      <SelectField id="l-top-filter" label="Top" value={topFilter} onChange={(e) => filtern(e.target.value)}>
        <option value="">Alle Tops</option>
        {topListe.map((t) => <option key={t.id} value={t.id}>{topText(t)}</option>)}
      </SelectField>
    </div>
  ) : null;

  const baustellenKarte = (
    <Card id="l-baustellen" title="Baustellen" buendig>
      {filterFeld}
      {baustellen.zustand === 'laedt' ? <SkeletonList rows={2} />
        : baustellen.zustand === 'fehler' ? <TeilFehler was="die Baustellen" onRetry={neuLaden} />
          : baustellen.daten.length === 0 ? <EmptyState>{topFilter ? 'Für dieses Top noch keine Baustelle.' : 'Noch keine Baustelle in dieser Liegenschaft.'}</EmptyState>
            : (
              <>
                <List>
                  {baustellen.daten.map((p) => (
                    <ListRow key={p.id} title={p.customerName} nummer={p.projectNumber}
                      subtitle={[p.topBezeichnung ?? 'ganze Liegenschaft', p.bezeichnung, p.status].filter(Boolean).join(' · ')}
                      {...(baustellenOeffnen ? { to: `/admin-projects/${p.id}`, pfeil: true } : {})} />
                  ))}
                </List>
                {baustellen.daten.length >= AKTE_GRENZE && (
                  <p className="px-4 pb-3 text-sm text-ink-muted">Die jüngsten {AKTE_GRENZE} — ältere in der Baustellenliste.</p>
                )}
              </>
            )}
    </Card>
  );

  const wartungenKarte = wartungAn ? (
    <Card id="l-wartungen" title="Wartungen" buendig>
      {wartungen.zustand === 'laedt' ? <SkeletonList rows={1} />
        : wartungen.zustand === 'fehler' ? <TeilFehler was="die Wartungen" onRetry={neuLaden} />
          : wartungen.daten.length === 0 ? <EmptyState>{topFilter ? 'Für dieses Top keine Wartung.' : 'Keine Wartung in dieser Liegenschaft.'}</EmptyState>
            : (
              <>
                <List>
                  {wartungen.daten.map((w) => (
                    <ListRow key={w.id} title={w.anlage}
                      subtitle={[w.customerName, w.topBezeichnung ?? 'ganze Liegenschaft', `Termin ${datumAT(w.faelligAm)}`].join(' · ')}
                      zustand={w.aktiv === false ? <Zustand stand="storniert">ruht</Zustand> : undefined} />
                  ))}
                </List>
                {wartungen.daten.length >= AKTE_GRENZE && (
                  <p className="px-4 pb-3 text-sm text-ink-muted">Die ersten {AKTE_GRENZE} nach Termin — alle unter Wartungen.</p>
                )}
              </>
            )}
    </Card>
  ) : null;

  const stammdaten = (
    <Card id="l-daten" title="Stammdaten">
      <AktenAngaben>
        <AktenAngabe wort="Bezeichnung">{l.bezeichnung}</AktenAngabe>
        <AktenAngabe wort="Anschrift" breit>{l.anschrift?.trim() ? <AdresseLink adresse={l.anschrift} /> : null}</AktenAngabe>
        <AktenAngabe wort="Notiz" breit>{l.notiz?.trim() ? <span className="whitespace-pre-line">{l.notiz}</span> : null}</AktenAngabe>
      </AktenAngaben>
      {/* Wer was wann geändert hat — an der Liegenschaft, ihren Tops und Beteiligten (M01b). */}
      {verlaufSichtbar(user.role, 'liegenschaft', !!einblick) && (
        <ObjektVerlauf companyId={companyId} objektart="liegenschaft" objektId={l.id}
          top={(t) => topNamen.get(t)} kunde={(k) => kunden.get(k)?.name} />
      )}
    </Card>
  );

  const menue: RowMenuItem[] = pflegen
    ? [{ label: 'Liegenschaft löschen', danger: true, onSelect: () => setFrage({ art: 'liegenschaft' }) }]
    : [];

  const offenerBeteiligter = fenster?.art === 'beteiligter' ? fenster.beteiligter : undefined;
  const offenesTop = fenster?.art === 'top' ? fenster.top : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        zurueck={zurueck}
        title={l.bezeichnung}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{l.anschrift || 'ohne Anschrift'}</span>
            <Zustand stand={l.aktiv === false ? 'storniert' : 'gut'}>{l.aktiv === false ? 'inaktiv' : 'aktiv'}</Zustand>
          </span>
        }
        action={pflegen ? <Button onClick={() => setFenster({ art: 'liegenschaft' })}>Bearbeiten</Button> : undefined}
        mehr={menue.length > 0 ? <RowMenu about={`Liegenschaft ${l.bezeichnung}`} items={menue} /> : undefined}
      />
      {fehler && <ErrorState message={fehler} />}

      <AktenBereiche kennung="liegenschaft" bereiche={[
        { id: 'tops', titel: 'Tops und Beteiligte', sprungziele: ['l-tops', 'l-beteiligte'],
          inhalt: <div className="akten-spalte">{topsKarte}{beteiligteKarte}</div> },
        { id: 'arbeiten', titel: wartungenKarte ? 'Baustellen und Wartungen' : 'Baustellen', sprungziele: ['l-baustellen', 'l-wartungen'],
          inhalt: <div className="akten-spalte">{baustellenKarte}{wartungenKarte}</div> },
        { id: 'daten', titel: 'Stammdaten', sprungziele: ['l-daten'], inhalt: stammdaten },
      ]} />

      <BottomSheet open={fenster?.art === 'liegenschaft'} onClose={() => setFenster(null)} label="Liegenschaft bearbeiten" auchBreit titel="Liegenschaft bearbeiten">
        {fenster?.art === 'liegenschaft' && (
          <LiegenschaftFormular companyId={companyId} liegenschaft={l}
            onGespeichert={() => { setFenster(null); neuLaden(); }} onAbbrechen={() => setFenster(null)} />
        )}
      </BottomSheet>

      <BottomSheet open={fenster?.art === 'top'} onClose={() => setFenster(null)} label={offenesTop ? 'Top ändern' : 'Top anlegen'} auchBreit
        titel={offenesTop ? `${offenesTop.bezeichnung} ändern` : 'Top anlegen'}>
        {fenster?.art === 'top' && (
          <TopFormular companyId={companyId} liegenschaftId={l.id} top={offenesTop}
            onGespeichert={() => { setFenster(null); neuLaden(); }} onAbbrechen={() => setFenster(null)}
            /*
              Über dem Fensterfuß, nicht darunter (E72): der Fuß klebt unten
              und reicht bis an die Kante. Löschen rot wie jedes
              Unumkehrbare (R4); die Rückfrage folgt wie bisher.
            */
            zusatz={offenesTop && (
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <Button type="button" variant="secondary" onClick={() => {
                  setFenster({ art: 'beteiligter', vorgabeTopId: offenesTop.id });
                }}>Beteiligten an diesem Top eintragen</Button>
                <Button type="button" variant="danger" onClick={() => setFrage({ art: 'top', top: offenesTop })}>Top löschen</Button>
              </div>
            )} />
        )}
      </BottomSheet>

      <BottomSheet open={fenster?.art === 'beteiligter'} onClose={() => setFenster(null)}
        label={offenerBeteiligter ? 'Beteiligten ändern' : 'Beteiligten eintragen'} auchBreit
        titel={offenerBeteiligter ? beteiligterName(offenerBeteiligter, kunden) : 'Beteiligten eintragen'}>
        {fenster?.art === 'beteiligter' && (
          <div className="flex flex-col gap-4">
            {offenerBeteiligter && <BeteiligterKontakt b={offenerBeteiligter} kunden={kunden} kundenOeffnen={kundenOeffnen} />}
            <BeteiligterFormular companyId={companyId} liegenschaftId={l.id} tops={topListe}
              beteiligter={offenerBeteiligter} vorgabeTopId={fenster.vorgabeTopId}
              onGespeichert={() => { setFenster(null); neuLaden(); }} onAbbrechen={() => setFenster(null)}
              // Über dem Fensterfuß (E72, wie beim Top); Entfernen rot wie jedes Unumkehrbare (R4).
              zusatz={offenerBeteiligter && (
                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  {!offenerBeteiligter.customerId && (
                    <Button type="button" variant="secondary" loading={busy} onClick={() => void zuKunde(offenerBeteiligter)}>Zum Kunden machen</Button>
                  )}
                  <Button type="button" variant="danger" onClick={() => setFrage({ art: 'beteiligter', beteiligter: offenerBeteiligter })}>Entfernen</Button>
                </div>
              )} />
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={frage?.art === 'beteiligter'}
        title="Beteiligten entfernen?"
        message={frage?.art === 'beteiligter'
          ? `${beteiligterName(frage.beteiligter, kunden)} (${ROLLE_TEXT[frage.beteiligter.rolle]}) wird aus dieser Liegenschaft gelöscht.${frage.beteiligter.customerId ? ' Der Kunde selbst bleibt.' : ' Name, Telefon und E-Mail gehen auch aus dem Änderungsverlauf — dort bleibt nur, wer wann eingetragen und entfernt hat.'}`
          : ''}
        confirmLabel="Entfernen"
        onCancel={() => setFrage(null)}
        onConfirm={async () => {
          if (frage?.art !== 'beteiligter') return;
          await beteiligterEntfernen(frage.beteiligter.id);
          setFrage(null);
          setFenster(null);
          toast.success('Beteiligter entfernt');
          neuLaden();
        }}
      />

      <ConfirmDialog
        open={frage?.art === 'top'}
        title="Top löschen?"
        message={frage?.art === 'top'
          ? `${frage.top.bezeichnung} wird gelöscht, mit den Beteiligten dieses Tops. Ist ihm eine Baustelle, Wartung, ein Eingang oder ein Angebot zugeordnet, bleibt es — dann auf inaktiv setzen.`
          : ''}
        onCancel={() => setFrage(null)}
        onConfirm={async () => {
          if (frage?.art !== 'top') return;
          await topLoeschen(frage.top.id);
          setFrage(null);
          setFenster(null);
          toast.success(`${frage.top.bezeichnung} gelöscht`);
          neuLaden();
        }}
      />

      <ConfirmDialog
        open={frage?.art === 'liegenschaft'}
        title="Liegenschaft löschen?"
        message={`${l.bezeichnung} wird gelöscht, mit allen Tops und Beteiligten. Sind ihr Baustellen, Wartungen, Eingänge oder Angebote zugeordnet, bleibt sie — dann auf inaktiv setzen.`}
        onCancel={() => setFrage(null)}
        onConfirm={async () => {
          await liegenschaftLoeschen(l.id);
          setFrage(null);
          toast.success(`${l.bezeichnung} gelöscht`);
          navigate('/liegenschaften');
        }}
      />

      <ConfirmDialog
        open={dublette !== null}
        title="Gleicher Name — trotzdem anlegen?"
        message={dublette ? rueckfrageText(dublette.beteiligter.name?.trim() ?? '', dublette.gleiche, 'sonst unten den vorhandenen für diesen Beteiligten übernehmen') : ''}
        confirmLabel="Trotzdem anlegen"
        confirmTone="primary"
        onCancel={() => setDublette(null)}
        onConfirm={async () => {
          if (!dublette) return;
          const b = dublette.beteiligter;
          await beteiligterZuKunde(b.id);
          setDublette(null);
          setFenster(null);
          toast.success(`${b.name ?? 'Der Beteiligte'} ist jetzt Kunde`);
          neuLaden();
        }}
      >
        <ul className="flex flex-col gap-2">
          {(dublette?.gleiche ?? []).slice(0, 10).map((k) => (
            <li key={k.id}>
              <Button
                variant="secondary"
                onClick={() => void schritt(async () => {
                  if (!dublette) return;
                  // Der vorhandene Kunde trägt seine Daten selbst — die freien Angaben gehen.
                  await beteiligterAendern(dublette.beteiligter.id, { customerId: k.id, name: null, telefon: null, email: null });
                  setDublette(null);
                  setFenster(null);
                  toast.success(`Beteiligt ist jetzt ${k.name}`);
                  neuLaden();
                })}
                aria-label={`${k.name} (${k.address?.trim() || 'ohne Adresse'}) übernehmen`}
              >
                {k.name} ({k.address?.trim() || 'ohne Adresse'}) übernehmen
              </Button>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </div>
  );
}

/** Wie man den Beteiligten erreicht — über dem Formular, damit „anrufen“ nicht erst ein Bearbeiten ist. */
function BeteiligterKontakt({ b, kunden, kundenOeffnen }: {
  b: LiegenschaftBeteiligter; kunden: ReadonlyMap<string, Customer>; kundenOeffnen: boolean;
}) {
  if (b.customerId) {
    const k = kunden.get(b.customerId);
    return (
      <p className="flex flex-wrap items-center gap-x-3 text-sm">
        {kundenOeffnen ? <Link to={`/customers/${b.customerId}`} className="link">Kundenakte {k?.name ?? ''}</Link> : k?.name}
        <TelefonLink nummer={k?.contactPhone} name={k?.contactName} />
      </p>
    );
  }
  if (!b.telefon && !b.email) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 text-sm">
      <TelefonLink nummer={b.telefon ?? undefined} name={b.name ?? undefined} />
      <MailLink adresse={b.email ?? undefined} />
    </p>
  );
}
