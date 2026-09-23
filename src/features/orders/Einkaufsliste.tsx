import { useEffect, useMemo, useState } from 'react';
import type { Company, Material, MaterialOrder } from '@/types';
import type { WithId } from '@/lib/db/core';
import {
  alsBestelltMarkieren,
  geliefert,
  grosshaendlerSpeichern,
  grosshaendlerZuordnen,
  katalogFuer,
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

/**
 * Die Einkaufsliste im Reiter „Einkauf" der Anforderungen.
 *
 * Oben je Grosshändler, was zu bestellen ist — zusammengefasst, mit PDF,
 * E-Mail an den Vertreter und „Als bestellt markieren". Darunter, was
 * bestellt ist und noch nicht da; „Geliefert" bucht die Ware ins Lager und
 * macht die Anforderung abholbereit. Ganz unten die Grosshändler selbst:
 * ohne Bestelladresse keine E-Mail.
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
  meinName,
  anforderungen,
  grosshaendler,
  onGrosshaendlerGeaendert,
}: {
  company: Company;
  meinName: string;
  anforderungen: WithId<MaterialOrder>[];
  grosshaendler: WithId<Grosshaendler>[];
  onGrosshaendlerGeaendert: () => void;
}) {
  const toast = useToast();
  const [katalog, setKatalog] = useState<Map<string, Pick<Material, 'articleNumber' | 'unit'>>>(new Map());
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [bestelltFragen, setBestelltFragen] = useState<EinkaufsGruppe | null>(null);

  const materialIds = useMemo(
    () => [...new Set(anforderungen.map((o) => o.materialId).filter(Boolean))].sort().join('|'),
    [anforderungen],
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

  const gruppen = useMemo(() => einkaufsliste(anforderungen, katalog), [anforderungen, katalog]);
  const nachId = useMemo(() => new Map(grosshaendler.map((g) => [g.id, g])), [grosshaendler]);

  async function tun(schluessel: string, was: () => Promise<unknown>, erfolg: string) {
    setLaeuft(schluessel);
    setFehler(null);
    try {
      await was();
      // „Zurück von der Liste" macht eine Anforderung wieder offen — der
      // Zähler am Menü soll das gleich wissen, nicht erst beim nächsten Laden.
      void postenNeuLaden();
      toast.success(erfolg);
    } catch (e) {
      setFehler(e instanceof Error && e.message ? e.message : 'Das hat nicht geklappt.');
    } finally {
      setLaeuft(null);
    }
  }

  return (
    <div className="space-y-6">
      {fehler && <ErrorState message={fehler} />}

      {gruppen.length === 0 ? (
        <Card title="Einkaufsliste">
          <EmptyState>
            Nichts auf der Einkaufsliste. Fehlt ein Artikel im Lager, bei der Anforderung auf
            „Nicht auf Lager" tippen.
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
                            <span className="tnum">{zeilenText(z)}</span>
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
                                () => grosshaendlerZuordnen(z.anforderungen, ziel),
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
                              },
                              'Wieder offen — zum Nachsehen im Lager',
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
                            'Alles geliefert — im Lager und abholbereit',
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
                          <span className="tnum">
                            {fmtMenge(Number(o.quantity) || 0)} × {o.materialName}
                          </span>
                        }
                        subtitle={[
                          o.userName,
                          o.projectNumber,
                          o.bestelltAm ? `bestellt ${fmtTag(o.bestelltAm)}` : '',
                        ].filter(Boolean).join(' · ')}
                      >
                        <Button
                          variant="secondary"
                          loading={laeuft === o.id}
                          onClick={() =>
                            void tun(o.id, () => geliefert([o.id]), `${o.materialName} ist da — abholbereit`)
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
            () => alsBestelltMarkieren(g.zuBestellen.flatMap((z) => z.anforderungen)),
            'Als bestellt markiert',
          );
        }}
      />
    </div>
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
    } catch {
      setFehler('Der Grosshändler konnte nicht gespeichert werden.');
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
          <p className="flex items-center text-xs text-ink-muted">
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
