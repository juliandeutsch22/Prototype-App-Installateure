import { useEffect, useMemo, useState } from 'react';
import type { Company, EinkaufPosten, Material, MaterialOrder } from '@/types';
import type { WithId } from '@/lib/db/core';
import {
  alsBestelltMarkieren,
  artikelSuchen,
  geliefert,
  grosshaendlerSpeichern,
  grosshaendlerZuordnen,
  katalogFuer,
  lagerPostenAnlegen,
  lagerPostenBestellt,
  lagerPostenLoeschen,
  lagerPostenZuordnen,
  lieferantVorschlag,
  vonEinkaufslisteNehmen,
  type Grosshaendler,
} from '@/lib/db/einkauf';
import { localDateStr } from '@/lib/time';
import { postenNeuLaden } from '@/app/offenePosten';
import Card from '@/components/Card';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import InfoHint from '@/components/InfoHint';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Marke } from '@/components/Badge';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, FormGrid } from '@/components/Field';
import { EmptyState, ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { fmtMenge } from '@/lib/belegLayout';
import { bestellMail, bestellText, einkaufsliste, type EinkaufsGruppe, type EinkaufsZeile } from './einkauf';
import { downloadBestellungPdf } from './bestellungPdf';
import { grundAus } from '@/lib/fehlerGrund';

/**
 * Die Einkaufsliste im Reiter „Einkauf" der Anforderungen.
 *
 * Oben je Grosshändler, was zu bestellen ist — zusammengefasst, mit PDF,
 * E-Mail an den Vertreter und „Als bestellt markieren". Darunter, was
 * bestellt ist und noch nicht da; „Geliefert" bucht die Ware ins Lager und
 * macht die Anforderung abholbereit. Ganz unten die Grosshändler selbst:
 * ohne Bestelladresse keine E-Mail.
 *
 * Ganz oben setzt das Büro eigenes Material auf die Liste — etwa um das
 * Lager aufzufüllen. Es steht mit „Lager" als Kommission neben den
 * Anforderungen und geht beim Eintreffen ins Lager.
 */

const fmtTag = (ms?: number | null) =>
  ms
    ? new Date(ms).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

const heuteAnzeige = () =>
  new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });

function zeilenText(z: EinkaufsZeile): string {
  return `${fmtMenge(z.menge)}${z.einheit ? ` ${z.einheit}` : ''} × ${z.bezeichnung}`;
}

export default function Einkaufsliste({
  company,
  meinUid,
  meinName,
  anforderungen,
  lagerPosten,
  grosshaendler,
  onGrosshaendlerGeaendert,
  onLagerGeaendert,
}: {
  company: Company;
  meinUid: string;
  meinName: string;
  anforderungen: WithId<MaterialOrder>[];
  /** Die offenen eigenen Posten des Büros. */
  lagerPosten: WithId<EinkaufPosten>[];
  grosshaendler: WithId<Grosshaendler>[];
  onGrosshaendlerGeaendert: () => void;
  /** Eigene Posten haben sich geändert — neu laden. */
  onLagerGeaendert: () => void;
}) {
  const toast = useToast();
  const [katalog, setKatalog] = useState<Map<string, Pick<Material, 'articleNumber' | 'unit'>>>(new Map());
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [bestelltFragen, setBestelltFragen] = useState<EinkaufsGruppe | null>(null);

  const materialIds = useMemo(
    () =>
      [
        ...new Set(
          [...anforderungen.map((o) => o.materialId), ...lagerPosten.map((p) => p.materialId ?? '')].filter(
            Boolean,
          ),
        ),
      ]
        .sort()
        .join('|'),
    [anforderungen, lagerPosten],
  );
  useEffect(() => {
    let weg = false;
    const ids = materialIds ? materialIds.split('|') : [];
    void katalogFuer(company.id, ids)
      .then((k) => {
        if (!weg) setKatalog(k);
      })
      // Ohne Katalog stehen Name und Menge trotzdem da — nur ohne Art.-Nr.
      .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, [company.id, materialIds]);

  const gruppen = useMemo(
    () => einkaufsliste(anforderungen, katalog, lagerPosten),
    [anforderungen, katalog, lagerPosten],
  );
  const nachId = useMemo(() => new Map(grosshaendler.map((g) => [g.id, g])), [grosshaendler]);

  async function tun(schluessel: string, was: () => Promise<unknown>, erfolg: string) {
    setLaeuft(schluessel);
    setFehler(null);
    try {
      await was();
      // „Zurück von der Liste" macht eine Anforderung wieder offen — der
      // Zähler am Menü soll das gleich wissen, nicht erst beim nächsten Laden.
      void postenNeuLaden();
      // Die eigenen Posten kommen nicht über das Live-Abo der Anforderungen.
      onLagerGeaendert();
      toast.success(erfolg);
    } catch (e) {
      setFehler(grundAus(e, 'Das hat nicht geklappt.'));
    } finally {
      setLaeuft(null);
    }
  }

  return (
    <div className="space-y-6">
      {fehler && <ErrorState message={fehler} />}

      <LagerPostenFormular
        companyId={company.id}
        meinUid={meinUid}
        meinName={meinName}
        grosshaendler={grosshaendler}
        onAngelegt={onLagerGeaendert}
      />

      {gruppen.length === 0 ? (
        <Card title="Einkaufsliste">
          <EmptyState>
            Nichts auf der Einkaufsliste. Fehlt ein Artikel im Lager, bei der Anforderung auf
            „Nicht auf Lager" tippen — oder oben Material dazusetzen.
          </EmptyState>
        </Card>
      ) : (
        gruppen.map((g) => {
          const h = g.supplierId ? nachId.get(g.supplierId) : undefined;
          const titel = g.supplierId ? h?.name ?? 'Unbekannter Grosshändler' : 'Ohne Grosshändler';
          const text = h
            ? bestellText({
                company,
                kundennummer: h.customerNumber,
                zeilen: g.zuBestellen,
                datum: heuteAnzeige(),
                besteller: meinName,
              })
            : '';
          const mail = h?.bestellEmail
            ? bestellMail({
                an: h.bestellEmail,
                betreff: `Bestellung ${company.name}${h.customerNumber ? ` · Kd.-Nr. ${h.customerNumber}` : ''}`,
                text,
              })
            : null;
          return (
            <Card key={g.supplierId ?? 'ohne'} title={titel}>
              {h?.customerNumber && (
                <p className="mb-2 text-sm text-ink-muted">Kundennummer {h.customerNumber}</p>
              )}
              {g.zuBestellen.length > 0 && (
                <>
                  <h3 className="section-label mb-1">Zu bestellen</h3>
                  <List>
                    {g.zuBestellen.map((z) => (
                      <ListRow
                        key={z.schluessel}
                        title={
                          <span>
                            <span>{zeilenText(z)}</span>
                            {z.artikelnummer && (
                              <span className="ml-2 text-sm text-ink-muted">Art.-Nr. {z.artikelnummer}</span>
                            )}
                          </span>
                        }
                        subtitle={
                          z.kommissionen.length ? `Kommission ${z.kommissionen.join(', ')}` : undefined
                        }
                      >
                        {!g.supplierId && grosshaendler.length > 0 && (
                          <SelectField
                            id={`zuordnen-${z.schluessel}`}
                            label=""
                            aria-label={`Grosshändler für ${z.bezeichnung}`}
                            className="py-1 text-sm"
                            value=""
                            disabled={laeuft !== null}
                            onChange={(e) => {
                              const ziel = e.target.value;
                              if (!ziel) return;
                              void tun(
                                z.schluessel,
                                async () => {
                                  await grosshaendlerZuordnen(z.anforderungen, ziel);
                                  await lagerPostenZuordnen(z.posten, ziel);
                                },
                                'Grosshändler zugeordnet',
                              );
                            }}
                          >
                            <option value="">Grosshändler wählen</option>
                            {grosshaendler.map((x) => (
                              <option key={x.id} value={x.id}>{x.name}</option>
                            ))}
                          </SelectField>
                        )}
                        <IconButton
                          label={`${z.bezeichnung} von der Einkaufsliste nehmen`}
                          tone="danger"
                          onClick={() =>
                            void tun(
                              z.schluessel,
                              async () => {
                                for (const id of z.anforderungen) await vonEinkaufslisteNehmen(id);
                                await lagerPostenLoeschen(z.posten);
                              },
                              z.anforderungen.length > 0
                                ? 'Von der Liste genommen — Anforderungen wieder offen'
                                : 'Von der Einkaufsliste genommen',
                            )
                          }
                        >
                          ✕
                        </IconButton>
                      </ListRow>
                    ))}
                  </List>

                  {g.supplierId ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        loading={laeuft === `pdf-${g.supplierId}`}
                        onClick={() =>
                          void tun(
                            `pdf-${g.supplierId}`,
                            () =>
                              downloadBestellungPdf({
                                company,
                                grosshaendler: {
                                  name: titel,
                                  customerNumber: h?.customerNumber,
                                  contactLine: h?.contactLine,
                                },
                                zeilen: g.zuBestellen,
                                datum: heuteAnzeige(),
                                besteller: meinName,
                                isoDatum: localDateStr(new Date()),
                              }),
                            'PDF erstellt',
                          )
                        }
                      >
                        PDF
                      </Button>
                      {mail ? (
                        <a
                          href={mail.href}
                          className="inline-flex min-h-touch items-center rounded border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-sm hover:bg-surface-2"
                        >
                          E-Mail an {h?.bestellEmail}
                        </a>
                      ) : (
                        <span className="text-sm text-ink-muted">
                          Keine Bestelladresse — unten beim Grosshändler eintragen.
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        disabled={laeuft !== null}
                        onClick={() => setBestelltFragen(g)}
                      >
                        Als bestellt markieren
                      </Button>
                      {mail?.gekuerzt && (
                        <p className="w-full text-sm text-warning">
                          Die Liste ist für eine E-Mail zu lang — die Mail sagt „siehe Anhang".
                          Bitte das PDF anhängen.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-ink-muted">
                      {grosshaendler.length === 0
                        ? 'Noch kein Grosshändler angelegt — unten anlegen, dann hier zuordnen.'
                        : 'Erst einem Grosshändler zuordnen, dann lässt sich bestellen.'}
                    </p>
                  )}
                </>
              )}

              {g.unterwegs.length > 0 && (
                <div className={g.zuBestellen.length > 0 ? 'mt-5' : ''}>
                  <h3 className="section-label mb-1 flex items-center justify-between">
                    <span>Bestellt — noch nicht da</span>
                    {g.unterwegs.length > 1 && (
                      <Button
                        variant="ghost"
                        loading={laeuft === `alle-${g.supplierId}`}
                        onClick={() =>
                          void tun(
                            `alle-${g.supplierId}`,
                            () => geliefert(g.unterwegs.map((o) => o.id)),
                            'Alles geliefert — im Lager, Anforderungen abholbereit',
                          )
                        }
                      >
                        Alles geliefert
                      </Button>
                    )}
                  </h3>
                  <List>
                    {g.unterwegs.map((o) => (
                      <ListRow
                        key={o.id}
                        title={
                          <span>
                            {fmtMenge(o.menge)}
                            {o.einheit ? ` ${o.einheit}` : ''} × {o.bezeichnung}
                          </span>
                        }
                        subtitle={[
                          o.art === 'lager' ? 'fürs Lager' : o.wer,
                          o.art === 'lager' ? o.notiz : o.kommission,
                          o.bestelltAm ? `bestellt ${fmtTag(o.bestelltAm)}` : '',
                        ].filter(Boolean).join(' · ')}
                      >
                        <Button
                          variant="secondary"
                          loading={laeuft === o.id}
                          onClick={() =>
                            void tun(
                              o.id,
                              () => geliefert([o.id]),
                              o.art === 'lager'
                                ? `${o.bezeichnung} ist da — im Lager`
                                : `${o.bezeichnung} ist da — abholbereit`,
                            )
                          }
                        >
                          Geliefert
                        </Button>
                      </ListRow>
                    ))}
                  </List>
                </div>
              )}
            </Card>
          );
        })
      )}

      <GrosshaendlerPflege
        companyId={company.id}
        grosshaendler={grosshaendler}
        onGeaendert={onGrosshaendlerGeaendert}
      />

      <ConfirmDialog
        open={!!bestelltFragen}
        title="Als bestellt markieren?"
        confirmLabel="Bestellt"
        confirmTone="primary"
        message={
          bestelltFragen
            ? `${bestelltFragen.zuBestellen.length} Position(en) bei ${
                (bestelltFragen.supplierId && nachId.get(bestelltFragen.supplierId)?.name) || 'diesem Grosshändler'
              } gelten dann als bestellt und warten auf die Lieferung.`
            : ''
        }
        onCancel={() => setBestelltFragen(null)}
        onConfirm={async () => {
          const g = bestelltFragen;
          setBestelltFragen(null);
          if (!g) return;
          await tun(
            `bestellt-${g.supplierId}`,
            async () => {
              await alsBestelltMarkieren(g.zuBestellen.flatMap((z) => z.anforderungen));
              await lagerPostenBestellt(g.zuBestellen.flatMap((z) => z.posten));
            },
            'Als bestellt markiert',
          );
        }}
      />
    </div>
  );
}

/**
 * Eigenes Material auf die Einkaufsliste — etwa um das Lager aufzufüllen.
 *
 * DER ARTIKEL KOMMT AUS DEM KATALOG, WENN ES IHN GIBT: dann stehen
 * Artikelnummer und Einheit auf der Bestellung, und beim Eintreffen weiss
 * das Lager, wohin die Ware gehört. Gesucht wird auf dem Server — nach einem
 * Datanorm-Import liegen zehntausende Artikel im Katalog. Wer nichts findet,
 * bestellt mit freiem Text; das steht dann so auf der Liste.
 */
function LagerPostenFormular({
  companyId,
  meinUid,
  meinName,
  grosshaendler,
  onAngelegt,
}: {
  companyId: string;
  meinUid: string;
  meinName: string;
  grosshaendler: WithId<Grosshaendler>[];
  onAngelegt: () => void;
}) {
  const toast = useToast();
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<WithId<Material>[]>([]);
  const [sucht, setSucht] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<WithId<Material> | null>(null);
  const [menge, setMenge] = useState('1');
  const [einheit, setEinheit] = useState('');
  const [bei, setBei] = useState('');
  const [notiz, setNotiz] = useState('');
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Suchen, sobald zwei Zeichen da sind — und erst, wenn das Tippen kurz ruht.
  useEffect(() => {
    if (!offen || gewaehlt) return;
    const begriff = suche.trim();
    if (begriff.length < 2) {
      setTreffer([]);
      return;
    }
    let weg = false;
    const zeit = setTimeout(() => {
      setSucht(true);
      artikelSuchen(companyId, begriff)
        .then((t) => {
          if (!weg) setTreffer(t);
        })
        // Scheitert die Suche, bleibt der freie Text — bestellt werden kann trotzdem.
        .catch(() => {
          if (!weg) setTreffer([]);
        })
        .finally(() => {
          if (!weg) setSucht(false);
        });
    }, 250);
    return () => {
      weg = true;
      clearTimeout(zeit);
    };
  }, [companyId, suche, gewaehlt, offen]);

  function leeren() {
    setSuche('');
    setTreffer([]);
    setGewaehlt(null);
    setMenge('1');
    setEinheit('');
    setBei('');
    setNotiz('');
    setFehler(null);
  }

  async function waehlen(m: WithId<Material>) {
    setGewaehlt(m);
    setSuche(m.name);
    setTreffer([]);
    setEinheit(m.unit ?? '');
    // Ein Vorschlag, wo der Artikel zuletzt einen Preis hatte — gewählt wird
    // vom Menschen. Ohne Vorschlag bleibt die Wahl, wie sie war.
    try {
      const vorschlag = await lieferantVorschlag(companyId, m.id);
      if (vorschlag && grosshaendler.some((g) => g.id === vorschlag)) setBei(vorschlag);
    } catch {
      // nur ein Vorschlag
    }
  }

  async function speichern() {
    const name = (gewaehlt?.name ?? suche).trim();
    const zahl = Number(menge.replace(',', '.'));
    if (!name) {
      setFehler('Welcher Artikel? Im Katalog suchen oder frei eintragen.');
      return;
    }
    if (!Number.isFinite(zahl) || zahl <= 0) {
      setFehler('Die Menge muss grösser als null sein.');
      return;
    }
    setSpeichert(true);
    setFehler(null);
    try {
      await lagerPostenAnlegen(companyId, {
        materialId: gewaehlt?.id ?? null,
        materialName: name,
        menge: zahl,
        einheit,
        supplierId: bei || null,
        notiz,
        angelegtVonUid: meinUid,
        angelegtVonName: meinName,
      });
      toast.success(`${fmtMenge(zahl)}${einheit.trim() ? ` ${einheit.trim()}` : ''} × ${name} auf der Einkaufsliste`);
      leeren();
      setOffen(false);
      onAngelegt();
    } catch (e) {
      setFehler(grundAus(e, 'Das Material konnte nicht auf die Liste.'));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <Card
      title="Material dazusetzen"
      hint={
        <>
          Für Material, das kein Monteur angefordert hat — etwa um das Lager aufzufüllen. Es steht
          mit der Kommission „Lager" auf der Bestellung und kommt beim Eintreffen ins Lager.
        </>
      }
      action={
        !offen ? (
          <Button
            variant="ghost"
            onClick={() => {
              // Gibt es nur einen Grosshändler, ist er gemeint — wie bei „Nicht
              // auf Lager". Sonst landete die Zeile unter „Ohne Grosshändler"
              // und musste erst zugeordnet werden (Prüflauf 24.09.2026, L6).
              if (!bei && grosshaendler.length === 1) setBei(grosshaendler[0].id);
              setOffen(true);
            }}
          >
            + Material
          </Button>
        ) : undefined
      }
    >
      {!offen ? (
        <p className="text-sm text-ink-muted">
          Eigenes Material auf die Einkaufsliste setzen, unabhängig von den Anforderungen.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <InputField
              id="lp-artikel"
              label="Artikel"
              pflicht
              placeholder="Name oder Artikelnummer"
              value={suche}
              onChange={(e) => {
                setSuche(e.target.value);
                setGewaehlt(null);
              }}
            />
            {gewaehlt ? (
              <p className="mt-1 text-xs text-ink-muted">
                Aus dem Katalog{gewaehlt.articleNumber ? ` · Art.-Nr. ${gewaehlt.articleNumber}` : ''}
              </p>
            ) : suche.trim().length >= 2 && !sucht && treffer.length === 0 ? (
              <p className="mt-1 text-xs text-ink-muted">
                Nicht im Katalog — wird mit diesem Text bestellt.
              </p>
            ) : null}
            {treffer.length > 0 && (
              <ul className="mt-1 max-h-60 divide-y divide-line overflow-y-auto rounded border border-line" aria-label="Treffer im Katalog">
                {treffer.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="flex min-h-touch w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                      onClick={() => void waehlen(m)}
                    >
                      <span className="min-w-0">{m.name}</span>
                      <span className="shrink-0 text-xs text-ink-muted">
                        {m.articleNumber ?? ''}{m.unit ? ` · ${m.unit}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <FormGrid>
            <InputField id="lp-menge" label="Menge" pflicht inputMode="decimal" value={menge}
              onChange={(e) => setMenge(e.target.value)} />
            <InputField id="lp-einheit" label="Einheit" placeholder="Stk, m, Pkg" value={einheit}
              onChange={(e) => setEinheit(e.target.value)} />
          </FormGrid>
          <SelectField id="lp-bei" label="Grosshändler" value={bei} onChange={(e) => setBei(e.target.value)}>
            <option value="">— später zuordnen —</option>
            {grosshaendler.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </SelectField>
          <InputField id="lp-notiz" label="Anmerkung (freiwillig)" value={notiz}
            onChange={(e) => setNotiz(e.target.value)} />
          {fehler && <p className="text-sm text-danger" role="alert">{fehler}</p>}
          <div className="flex flex-wrap gap-2">
            <Button loading={speichert} onClick={() => void speichern()}>Auf die Einkaufsliste</Button>
            <Button
              variant="ghost"
              onClick={() => {
                leeren();
                setOffen(false);
              }}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Die Grosshändler — Name, Kundennummer, Bestelladresse. */
function GrosshaendlerPflege({
  companyId,
  grosshaendler,
  onGeaendert,
}: {
  companyId: string;
  grosshaendler: WithId<Grosshaendler>[];
  onGeaendert: () => void;
}) {
  const toast = useToast();
  const leer = { name: '', customerNumber: '', bestellEmail: '', contactLine: '' };
  const [bearbeitet, setBearbeitet] = useState<string | 'neu' | null>(null);
  const [entwurf, setEntwurf] = useState(leer);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  function oeffnen(h: WithId<Grosshaendler> | null) {
    setEntwurf(
      h
        ? {
            name: h.name,
            customerNumber: h.customerNumber ?? '',
            bestellEmail: h.bestellEmail ?? '',
            contactLine: h.contactLine ?? '',
          }
        : leer,
    );
    setFehler(null);
    setBearbeitet(h ? h.id : 'neu');
  }

  async function speichern() {
    if (!entwurf.name.trim()) {
      setFehler('Der Name fehlt.');
      return;
    }
    if (entwurf.bestellEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entwurf.bestellEmail.trim())) {
      setFehler('Die Bestelladresse sieht nicht wie eine E-Mail-Adresse aus.');
      return;
    }
    setSpeichert(true);
    setFehler(null);
    try {
      await grosshaendlerSpeichern(companyId, bearbeitet === 'neu' ? null : bearbeitet, entwurf);
      toast.success('Grosshändler gespeichert');
      setBearbeitet(null);
      onGeaendert();
    } catch (err) {
      setFehler(grundAus(err, 'Der Grosshändler konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <Card
      title="Grosshändler"
      hint={
        <>
          Wohin die Einkaufsliste geht. Die <strong>Bestelladresse</strong> ist meist die des
          Vertreters oder des Bestellbüros — an sie öffnet „E-Mail" eine fertige Nachricht.
          Grosshändler aus dem Katalogimport stehen hier schon; es fehlt oft nur die Adresse.
        </>
      }
      action={
        bearbeitet === null ? (
          <Button variant="ghost" onClick={() => oeffnen(null)}>+ Grosshändler</Button>
        ) : undefined
      }
    >
      {grosshaendler.length === 0 && bearbeitet === null && (
        <EmptyState>Noch kein Grosshändler angelegt.</EmptyState>
      )}
      {grosshaendler.length > 0 && (
        <List>
          {grosshaendler.map((h) => (
            <ListRow
              key={h.id}
              title={h.name}
              subtitle={[
                h.customerNumber ? `Kd.-Nr. ${h.customerNumber}` : '',
                h.bestellEmail || 'keine Bestelladresse',
              ].filter(Boolean).join(' · ')}
            >
              {!h.bestellEmail && <Marke>ohne E-Mail</Marke>}
              <Button variant="ghost" onClick={() => oeffnen(h)}>Bearbeiten</Button>
            </ListRow>
          ))}
        </List>
      )}

      {bearbeitet !== null && (
        <div className="mt-4 space-y-3 rounded border border-line p-3">
          <FormGrid>
            <InputField id="gh-name" label="Name" pflicht value={entwurf.name}
              onChange={(e) => setEntwurf({ ...entwurf, name: e.target.value })} />
            <InputField id="gh-kdnr" label="Kundennummer" value={entwurf.customerNumber}
              onChange={(e) => setEntwurf({ ...entwurf, customerNumber: e.target.value })} />
            <InputField id="gh-mail" label="Bestelladresse (E-Mail)" type="email" value={entwurf.bestellEmail}
              onChange={(e) => setEntwurf({ ...entwurf, bestellEmail: e.target.value })} />
            <InputField id="gh-kontakt" label="Kontakt (Vertreter, Telefon)" value={entwurf.contactLine}
              onChange={(e) => setEntwurf({ ...entwurf, contactLine: e.target.value })} />
          </FormGrid>
          <p className="flex flex-wrap items-center text-xs text-ink-muted">
            Die Kontaktzeile steht auf der Bestellung als Empfänger.
            <InfoHint about="Kontaktzeile">
              Etwa „z. Hd. Herrn Maier, 0664 123 45 67". Eine Anschrift des Grosshändlers führt
              Senklot nicht — die Bestellung geht per E-Mail, nicht per Post.
            </InfoHint>
          </p>
          {fehler && <p className="text-sm text-danger" role="alert">{fehler}</p>}
          <div className="flex flex-wrap gap-2">
            <Button loading={speichert} onClick={() => void speichern()}>Speichern</Button>
            <Button variant="ghost" onClick={() => setBearbeitet(null)}>Abbrechen</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
