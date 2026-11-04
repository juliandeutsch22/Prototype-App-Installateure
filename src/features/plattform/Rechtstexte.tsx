import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import ConfirmDialog from '@/components/ConfirmDialog';
import Hinweiszeile from '@/components/Hinweiszeile';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { MehrAnzeigen } from '@/components/LotBausteine';
import { CheckboxField, InputField, TextareaField } from '@/components/Field';
import { ErrorState, LoadingState } from '@/components/States';
import { Marke, Warnung } from '@/components/Badge';
import { useToast } from '@/components/Toast';
import { datumAusMs } from '@/lib/datum';
import {
  rechtstextEntwurfSpeichern, rechtstextEntwurfVerwerfen, rechtstextVerlauf, rechtstextVeroeffentlichen,
  type RechtstextZeile,
} from '@/lib/db/rechtstexte';
import RechtInhalt from '@/features/recht/RechtInhalt';
import {
  BETREIBER_FELDER, LEERER_BETREIBER, VERARBEITER_PLATZHALTER, aenderungenText, betreiberAenderungen,
  neueVerarbeiter, offeneAngaben, textFehler,
  type Abschnitt, type Betreiber, type RechtstextArt, type TextInhalt, type Verarbeiter,
} from '@/features/recht/rechtstext';

/**
 * RECHTSTEXTE IN DER PLATTFORM (04.11.2026, E45): Impressum,
 * Datenschutzerklärung und die Angaben zum Betreiber, die beide einsetzen.
 *
 * GEARBEITET WIRD IM ENTWURF, VERÖFFENTLICHT WIRD EINE FASSUNG. Ein Entwurf
 * ist für niemanden außer der Plattform zu sehen; „Veröffentlichen“ macht
 * daraus die nächste Fassung, und die gilt ab sofort auf /impressum bzw.
 * /datenschutz. Eine Fassung ändert sich nie wieder — wer etwas ändert,
 * veröffentlicht die nächste. So lässt sich belegen, welcher Text wann galt.
 *
 * DIE SEITE ZEIGT, WAS SIE PRÜFEN KANN — offene Angaben, vertippte
 * Platzhalter, die fehlende Liste der Unterauftragsverarbeiter —, und sie
 * sagt vor dem Veröffentlichen, was sich ändert und wer davon erfährt. Ob
 * ein Text rechtlich stimmt, kann sie nicht prüfen; dafür ist „rechtlich
 * geprüft, von …“.
 */

const NAME: Record<RechtstextArt, string> = {
  betreiber: 'Angaben zum Betreiber',
  impressum: 'Impressum',
  datenschutz: 'Datenschutzerklärung',
};
const ARTEN: RechtstextArt[] = ['betreiber', 'impressum', 'datenschutz'];

type Verlauf = Record<RechtstextArt, RechtstextZeile[]>;

const datum = (iso: string | null) => (iso ? datumAusMs(Date.parse(iso)) : '');
const geltend = (zeilen: RechtstextZeile[]) => zeilen.find((z) => z.nummer != null);
const entwurfVon = (zeilen: RechtstextZeile[]) => zeilen.find((z) => z.nummer == null);
const kopie = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export default function Rechtstexte() {
  const [verlauf, setVerlauf] = useState<Verlauf | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<RechtstextArt | null>(null);

  const laden = useCallback(async () => {
    setFehler(null);
    try {
      const [betreiber, impressum, datenschutz] = await Promise.all(ARTEN.map((a) => rechtstextVerlauf(a)));
      setVerlauf({ betreiber, impressum, datenschutz });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void laden();
  }, [laden]);

  if (auswahl && verlauf) {
    const zeilen = verlauf[auswahl];
    // Nach Speichern oder Veröffentlichen beginnt der Editor neu — mit dem, was jetzt gilt.
    const schluessel = `${auswahl}:${entwurfVon(zeilen)?.geaendertAm ?? ''}:${geltend(zeilen)?.nummer ?? ''}`;
    return <Editor key={schluessel} art={auswahl} verlauf={verlauf} geaendert={laden} zurueck={() => setAuswahl(null)} />;
  }

  return (
    <>
      <PageHeader
        ort="Globaler Administrator"
        title="Rechtstexte"
        subtitle="Impressum und Datenschutzerklärung — für alle Betriebe und jeden Besucher."
        hilfe="Hier pflegt der Betreiber Impressum und Datenschutzerklärung von Senklot und die Angaben zum Betreiber, die beide einsetzen. Gearbeitet wird in einem Entwurf, den nur die Plattform sieht; „Veröffentlichen“ macht daraus die nächste Fassung, die sofort gilt. Eine veröffentlichte Fassung bleibt unverändert, damit sich belegen lässt, welcher Text wann galt."
      />
      <div className="plattform-spalten">
        <div>
          <Card title="Texte" buendig>
            {fehler ? (
              <ErrorState message={fehler} onRetry={() => void laden()} />
            ) : !verlauf ? (
              <LoadingState />
            ) : (
              <List>
                {ARTEN.map((art) => {
                  const zeilen = verlauf[art];
                  const g = geltend(zeilen);
                  const e = entwurfVon(zeilen);
                  const betreiber = (geltend(verlauf.betreiber)?.inhalt as Betreiber | undefined) ?? LEERER_BETREIBER;
                  const offen = art === 'betreiber'
                    ? BETREIBER_FELDER.filter((f) => !betreiber[f.feld].trim()).length
                    : g ? offeneAngaben(g.inhalt as TextInhalt, betreiber).length : 0;
                  return (
                    <ListRow
                      key={art}
                      onOeffnen={() => setAuswahl(art)}
                      pfeil
                      title={NAME[art]}
                      subtitle={
                        <>
                          {g ? `Fassung ${g.nummer} vom ${datum(g.veroeffentlichtAm)}` : 'Noch keine Fassung'}
                          {art !== 'betreiber' && g && (g.geprueft ? ` · geprüft von ${g.geprueftVon}` : ' · nicht rechtlich geprüft')}
                          <span className="plattform-zustaende">
                            {e && <Warnung>Entwurf vom {datum(e.geaendertAm)}</Warnung>}
                            {offen > 0 && (
                              <Warnung>{art === 'betreiber' ? `${offen} von ${BETREIBER_FELDER.length} Feldern leer` : `${offen} ${offen === 1 ? 'Angabe' : 'Angaben'} offen`}</Warnung>
                            )}
                          </span>
                        </>
                      }
                    />
                  );
                })}
              </List>
            )}
          </Card>
        </div>
        <aside className="plattform-kontext" aria-label="So geht es">
          <h2>So geht es</h2>
          <h3>Entwurf</h3>
          <p>Ändern und speichern, so oft es nötig ist. Den Entwurf sieht nur die Plattform; die Vorschau zeigt ihn wie die Seite.</p>
          <h3>Veröffentlichen</h3>
          <p>Macht ihn zur nächsten Fassung. Sie gilt sofort auf /impressum bzw. /datenschutz und bleibt unverändert.</p>
          <h3>Rechtlich geprüft</h3>
          <p>Erst mit dem Namen dessen, der geprüft hat, und ohne offene Angaben fällt das Band „Entwurf“ auf der Seite.</p>
        </aside>
      </div>
    </>
  );
}

/* ───────────────────────────────── Editor ───────────────────────────────── */

function leererInhalt(art: RechtstextArt): Betreiber | TextInhalt {
  if (art === 'betreiber') return { ...LEERER_BETREIBER };
  return art === 'datenschutz'
    ? { abschnitte: [{ titel: '', text: '' }], verarbeiter: [] }
    : { abschnitte: [{ titel: '', text: '' }] };
}

function Editor({ art, verlauf, geaendert, zurueck }: {
  art: RechtstextArt;
  verlauf: Verlauf;
  geaendert: () => Promise<void>;
  zurueck: () => void;
}) {
  const toast = useToast();
  const zeilen = verlauf[art];
  const g = geltend(zeilen);
  const e = entwurfVon(zeilen);
  const basis = useMemo(() => kopie(e?.inhalt ?? g?.inhalt ?? leererInhalt(art)), [art, e, g]);
  const [stand, setStand] = useState<Betreiber | TextInhalt>(() => kopie(basis));
  const geaendertGegenBasis = JSON.stringify(stand) !== JSON.stringify(basis);

  const [laeuft, setLaeuft] = useState(false);
  const [aktionsFehler, setAktionsFehler] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState<{ titel: string; inhalt: Betreiber | TextInhalt } | null>(null);
  const [veroeffentlichen, setVeroeffentlichen] = useState(false);
  const [verwerfen, setVerwerfen] = useState(false);
  const [wegGehen, setWegGehen] = useState(false);
  const [geprueft, setGeprueft] = useState(false);
  const [geprueftVon, setGeprueftVon] = useState('');
  const [hinweisen, setHinweisen] = useState(true);
  const [anzahlFassungen, setAnzahlFassungen] = useState(10);

  /** Die Betreiberangaben, die eine Seite gerade einsetzt — die veröffentlichten. */
  const geltenderBetreiber = (geltend(verlauf.betreiber)?.inhalt as Betreiber | undefined) ?? LEERER_BETREIBER;
  const fehler = art === 'betreiber' ? [] : textFehler(art, stand as TextInhalt);
  const offen = art === 'betreiber'
    ? BETREIBER_FELDER.filter((f) => !(stand as Betreiber)[f.feld].trim()).map((f) => f.beschriftung)
    : offeneAngaben(stand as TextInhalt, geltenderBetreiber);
  const fassungen = zeilen.filter((z) => z.nummer != null);

  async function ausfuehren(schritt: () => Promise<void>) {
    setLaeuft(true);
    setAktionsFehler(null);
    try {
      await schritt();
    } catch (err) {
      setAktionsFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setLaeuft(false);
    }
  }

  const speichern = () => ausfuehren(async () => {
    await rechtstextEntwurfSpeichern(art, stand);
    toast.success('Entwurf gespeichert');
    await geaendert();
  });

  const aenderung = art === 'betreiber'
    ? betreiberAenderungen(g?.inhalt as Betreiber | undefined, stand as Betreiber)
    : aenderungenText(g?.inhalt as TextInhalt | undefined, stand as TextInhalt);
  const neu = art === 'datenschutz'
    ? neueVerarbeiter((stand as TextInhalt).verarbeiter ?? [], ((g?.inhalt as TextInhalt | undefined)?.verarbeiter) ?? [])
    : [];
  const naechste = (g?.nummer ?? 0) + 1;
  const geprueftGeht = art !== 'betreiber' && offen.length === 0;

  return (
    <>
      <PageHeader
        ort={<button type="button" className="seitenkopf-zurueck" onClick={() => (geaendertGegenBasis ? setWegGehen(true) : zurueck())}>← Rechtstexte</button>}
        title={NAME[art]}
        subtitle={
          e ? `Entwurf vom ${datum(e.geaendertAm)} — es gilt ${g ? `Fassung ${g.nummer}` : 'noch keine Fassung'}`
            : g ? `Es gilt Fassung ${g.nummer} vom ${datum(g.veroeffentlichtAm)}` : 'Noch keine Fassung'
        }
        hilfe={art === 'betreiber'
          ? 'Die Angaben zum Betreiber setzen Impressum und Datenschutzerklärung über Platzhalter ein ({Name}, {Anschrift} …). Veröffentlicht gelten sie sofort auf beiden Seiten; ein leeres Feld steht dort als „[… — wird ergänzt]“.'
          : 'Ein Abschnitt hat eine Überschrift und einen Text. Im Text: Leerzeile = neuer Absatz; Zeilen, die mit „- “ beginnen = Aufzählung; **fett**; [Text](https://…) = Verweis (nur https:, mailto:, tel:). Die Platzhalter {Name}, {Anschrift}, {E-Mail}, {Telefon}, {UID-Nummer}, {Firmenbuch} und {Gewerbe} setzen die Angaben zum Betreiber ein.'
          + (art === 'datenschutz' ? ` Eine Zeile, die nur ${VERARBEITER_PLATZHALTER} enthält, setzt die Liste der Unterauftragsverarbeiter ein.` : '')}
        action={
          <Button onClick={() => setVeroeffentlichen(true)} disabled={laeuft || fehler.length > 0}>
            Veröffentlichen …
          </Button>
        }
      />
      <div className="plattform-spalten">
        <div className="space-y-4">
          {fehler.length > 0 && (
            <Hinweiszeile stufe="fehl">
              <b>So lässt es sich nicht veröffentlichen:</b>
              <ul className="list-disc pl-5">{fehler.map((f) => <li key={f}>{f}</li>)}</ul>
            </Hinweiszeile>
          )}
          {offen.length > 0 && (
            <Hinweiszeile stufe="warn">
              <b>{art === 'betreiber' ? 'Leere Felder' : 'Offene Angaben'}:</b> {offen.join(' · ')}
              {art !== 'betreiber' && ' — solange sie offen sind, steht auf der Seite „Entwurf“.'}
            </Hinweiszeile>
          )}
          {aktionsFehler && <ErrorState message={aktionsFehler} />}

          {art === 'betreiber' ? (
            <BetreiberFormular wert={stand as Betreiber} setzen={(b) => setStand(b)} />
          ) : (
            <>
              <AbschnitteFormular art={art} wert={stand as TextInhalt} setzen={(t) => setStand(t)} />
              {art === 'datenschutz' && (
                <VerarbeiterFormular
                  wert={(stand as TextInhalt).verarbeiter ?? []}
                  neu={neu}
                  setzen={(v) => setStand({ ...(stand as TextInhalt), verarbeiter: v })}
                />
              )}
            </>
          )}

          {/*
            KLEBT UNTEN, solange der Editor im Bild ist: die Datenschutzerklärung
            ist lang, und „Speichern“ erst nach sieben Abschnitten zu finden,
            hieße Änderungen zu verlieren.
          */}
          <div className="rt-aktionen">
            <Button variant="secondary" onClick={() => void speichern()} disabled={laeuft || !geaendertGegenBasis} loading={laeuft}>
              Entwurf speichern
            </Button>
            <Button variant="ghost" onClick={() => setVorschau({ titel: 'Vorschau', inhalt: stand })}>
              Vorschau
            </Button>
            {e && (
              <Button variant="ghost" onClick={() => setVerwerfen(true)} disabled={laeuft}>
                Entwurf verwerfen
              </Button>
            )}
          </div>

          <Card title={`Fassungen (${fassungen.length})`} buendig>
            {fassungen.length === 0 ? (
              <p className="leer">Noch keine Fassung veröffentlicht.</p>
            ) : (
              <List>
                {fassungen.slice(0, anzahlFassungen).map((f) => (
                  <ListRow
                    key={f.id}
                    title={`Fassung ${f.nummer}`}
                    subtitle={
                      <>
                        veröffentlicht am {datum(f.veroeffentlichtAm)}
                        {art !== 'betreiber' && (f.geprueft ? ` · geprüft von ${f.geprueftVon}` : ' · nicht rechtlich geprüft')}
                        {f.neueVerarbeiter.length > 0 && ` · neu: ${f.neueVerarbeiter.join(', ')}`}
                        {f.hinweisen && ' · Hinweis an alle'}
                        {f.id === g?.id && <span className="plattform-zustaende"><Marke>gilt</Marke></span>}
                      </>
                    }
                  >
                    <Button variant="ghost" groesse="klein" onClick={() => setVorschau({ titel: `Fassung ${f.nummer}`, inhalt: f.inhalt })}>
                      Ansehen
                    </Button>
                    <Button variant="ghost" groesse="klein" onClick={() => setStand(kopie(f.inhalt))} aria-label={`Fassung ${f.nummer} als Entwurf übernehmen`}>
                      Übernehmen
                    </Button>
                  </ListRow>
                ))}
              </List>
            )}
          </Card>
          <MehrAnzeigen anzahl={Math.max(0, fassungen.length - anzahlFassungen)} onClick={() => setAnzahlFassungen((n) => n + 20)} />
        </div>
        <aside className="plattform-kontext" aria-label="Wer davon erfährt">
          <h2>Wer davon erfährt</h2>
          <h3>Sofort</h3>
          <p>Jeder, der /impressum oder /datenschutz öffnet — auch ohne Konto.</p>
          {art === 'datenschutz' && (
            <>
              <h3>Neue Unterauftragsverarbeiter</h3>
              <p>Die Geschäftsführung und die Administration jedes Betriebs sehen einen Hinweis in der App und nehmen ihn zur Kenntnis (Art. 28 Abs. 2 DSGVO).</p>
              <h3>Hinweis an alle</h3>
              <p>Wahlweise sehen alle, die die App benutzen, einmal „Die Datenschutzerklärung wurde geändert“.</p>
            </>
          )}
        </aside>
      </div>

      <BottomSheet open={!!vorschau} onClose={() => setVorschau(null)} label={`${NAME[art]}: ${vorschau?.titel ?? ''}`} auchBreit breit titel={`${NAME[art]} — ${vorschau?.titel ?? ''}`}>
        {vorschau && <Vorschau art={art} inhalt={vorschau.inhalt} verlauf={verlauf} />}
      </BottomSheet>

      <ConfirmDialog
        open={veroeffentlichen}
        title={`${NAME[art]} veröffentlichen`}
        confirmLabel="Veröffentlichen"
        confirmTone="primary"
        gesperrt={fehler.length > 0 || (geprueft && !geprueftVon.trim())}
        message={`Wird Fassung ${naechste}. Sie gilt sofort und lässt sich danach nicht mehr ändern. ${aenderung.join(' ')}`}
        onCancel={() => setVeroeffentlichen(false)}
        onConfirm={async () => {
          await rechtstextEntwurfSpeichern(art, stand);
          const nummer = await rechtstextVeroeffentlichen(art, {
            geprueft: geprueftGeht && geprueft,
            geprueftVon: geprueftVon.trim(),
            hinweisen: art === 'datenschutz' && hinweisen,
          });
          setVeroeffentlichen(false);
          toast.success(`${NAME[art]}: Fassung ${nummer} gilt`);
          await geaendert();
        }}
      >
        <div className="flex flex-col gap-3">
          {art !== 'betreiber' && (
            <>
              <CheckboxField
                id={`rt-${art}-geprueft`}
                label="Rechtlich geprüft und freigegeben"
                checked={geprueftGeht && geprueft}
                disabled={!geprueftGeht}
                onChange={(ev) => setGeprueft(ev.target.checked)}
              />
              {!geprueftGeht && <p className="text-sm text-ink-muted">Erst ohne offene Angaben — die Seite trägt sonst ohnehin „Entwurf“.</p>}
              {geprueftGeht && geprueft && (
                <InputField id={`rt-${art}-geprueft-von`} label="Geprüft von" pflicht value={geprueftVon} placeholder="z. B. Kanzlei Muster" onChange={(ev) => setGeprueftVon(ev.target.value)} />
              )}
            </>
          )}
          {art === 'datenschutz' && (
            <CheckboxField
              id="rt-hinweisen"
              label="Alle, die die App benutzen, auf die Änderung hinweisen"
              checked={hinweisen}
              onChange={(ev) => setHinweisen(ev.target.checked)}
            />
          )}
          {neu.length > 0 && (
            <Hinweiszeile>
              Neu: {neu.join(', ')}. Die Geschäftsführung und die Administration jedes Betriebs bekommen dazu einen Hinweis und nehmen ihn zur Kenntnis.
            </Hinweiszeile>
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={verwerfen}
        title="Entwurf verwerfen"
        confirmLabel="Verwerfen"
        message={`Der Entwurf vom ${datum(e?.geaendertAm ?? null)} wird gelöscht. ${g ? `Es gilt weiter Fassung ${g.nummer}.` : ''}`}
        onCancel={() => setVerwerfen(false)}
        onConfirm={async () => {
          await rechtstextEntwurfVerwerfen(art);
          setVerwerfen(false);
          toast.success('Entwurf verworfen');
          await geaendert();
        }}
      />

      <ConfirmDialog
        open={wegGehen}
        title="Nicht gespeicherte Änderungen"
        confirmLabel="Änderungen verwerfen"
        message="Was seit dem letzten Speichern geändert wurde, geht verloren."
        onCancel={() => setWegGehen(false)}
        onConfirm={() => {
          setWegGehen(false);
          zurueck();
        }}
      />
    </>
  );
}

/** Die Seite, wie sie aussähe — bei den Betreiberangaben beide Seiten mit den neuen Angaben. */
function Vorschau({ art, inhalt, verlauf }: { art: RechtstextArt; inhalt: Betreiber | TextInhalt; verlauf: Verlauf }) {
  const betreiber = art === 'betreiber' ? (inhalt as Betreiber) : ((geltend(verlauf.betreiber)?.inhalt as Betreiber | undefined) ?? LEERER_BETREIBER);
  const texte: Array<[string, TextInhalt | undefined]> = art === 'betreiber'
    ? [['Impressum', geltend(verlauf.impressum)?.inhalt as TextInhalt | undefined],
       ['Datenschutzerklärung', geltend(verlauf.datenschutz)?.inhalt as TextInhalt | undefined]]
    : [[NAME[art], inhalt as TextInhalt]];
  return (
    <div className="space-y-8">
      {texte.map(([titel, text]) => (
        <div key={titel} className="recht space-y-6 text-base leading-relaxed text-ink">
          {art === 'betreiber' && <h2 className="text-lg text-ink">{titel}</h2>}
          {text ? <RechtInhalt inhalt={text} betreiber={betreiber} /> : <p className="leer">Noch keine Fassung.</p>}
        </div>
      ))}
    </div>
  );
}

function BetreiberFormular({ wert, setzen }: { wert: Betreiber; setzen: (b: Betreiber) => void }) {
  return (
    <Card title="Angaben">
      <div className="formular">
        {BETREIBER_FELDER.map((f) =>
          f.mehrzeilig ? (
            <TextareaField key={f.feld} id={`rt-betreiber-${f.feld}`} label={`${f.beschriftung} ${f.platzhalter}`} rows={3} value={wert[f.feld]} onChange={(ev) => setzen({ ...wert, [f.feld]: ev.target.value })} />
          ) : (
            <InputField key={f.feld} id={`rt-betreiber-${f.feld}`} label={`${f.beschriftung} ${f.platzhalter}`} value={wert[f.feld]} onChange={(ev) => setzen({ ...wert, [f.feld]: ev.target.value })} />
          ),
        )}
      </div>
    </Card>
  );
}

function verschieben<T>(liste: T[], i: number, um: number): T[] {
  const neu = [...liste];
  const [x] = neu.splice(i, 1);
  neu.splice(i + um, 0, x);
  return neu;
}

function AbschnitteFormular({ art, wert, setzen }: { art: RechtstextArt; wert: TextInhalt; setzen: (t: TextInhalt) => void }) {
  const aendern = (i: number, a: Abschnitt) => setzen({ ...wert, abschnitte: wert.abschnitte.map((x, j) => (j === i ? a : x)) });
  return (
    <Card title={`Abschnitte (${wert.abschnitte.length})`}>
      <div className="rt-liste">
        {wert.abschnitte.map((a, i) => (
          <div key={i} className="rt-eintrag">
            <InputField id={`rt-${art}-titel-${i}`} label={`Überschrift ${i + 1}`} value={a.titel} onChange={(ev) => aendern(i, { ...a, titel: ev.target.value })} />
            <TextareaField
              id={`rt-${art}-text-${i}`}
              label={`Text ${i + 1}`}
              rows={Math.min(24, Math.max(4, a.text.split('\n').length + 1))}
              value={a.text}
              onChange={(ev) => aendern(i, { ...a, text: ev.target.value })}
            />
            <div className="rt-werkzeuge">
              <Button variant="ghost" groesse="klein" disabled={i === 0} onClick={() => setzen({ ...wert, abschnitte: verschieben(wert.abschnitte, i, -1) })} aria-label={`Abschnitt ${i + 1} nach oben`}>Nach oben</Button>
              <Button variant="ghost" groesse="klein" disabled={i === wert.abschnitte.length - 1} onClick={() => setzen({ ...wert, abschnitte: verschieben(wert.abschnitte, i, 1) })} aria-label={`Abschnitt ${i + 1} nach unten`}>Nach unten</Button>
              <Button variant="ghost" groesse="klein" disabled={wert.abschnitte.length === 1} onClick={() => setzen({ ...wert, abschnitte: wert.abschnitte.filter((_, j) => j !== i) })} aria-label={`Abschnitt ${i + 1} entfernen`}>Entfernen</Button>
            </div>
          </div>
        ))}
      </div>
      <Button variant="secondary" disabled={wert.abschnitte.length >= 50} onClick={() => setzen({ ...wert, abschnitte: [...wert.abschnitte, { titel: '', text: '' }] })}>
        Abschnitt hinzufügen
      </Button>
    </Card>
  );
}

function VerarbeiterFormular({ wert, neu, setzen }: { wert: Verarbeiter[]; neu: string[]; setzen: (v: Verarbeiter[]) => void }) {
  const aendern = (i: number, v: Verarbeiter) => setzen(wert.map((x, j) => (j === i ? v : x)));
  return (
    <Card title={`Unterauftragsverarbeiter (${wert.length})`}>
      <div className="rt-liste">
        {wert.length === 0 && <p className="leer">Noch keiner eingetragen.</p>}
        {wert.map((v, i) => (
          <div key={i} className="rt-eintrag">
            {neu.includes(v.wer) && v.wer.trim() && <span><Marke>neu gegenüber der geltenden Fassung</Marke></span>}
            <InputField id={`rt-v-wer-${i}`} label={`Anbieter ${i + 1}`} value={v.wer} onChange={(ev) => aendern(i, { ...v, wer: ev.target.value })} />
            <InputField id={`rt-v-wofuer-${i}`} label="Zweck" value={v.wofuer} onChange={(ev) => aendern(i, { ...v, wofuer: ev.target.value })} />
            <InputField id={`rt-v-wo-${i}`} label="Standort" value={v.wo} onChange={(ev) => aendern(i, { ...v, wo: ev.target.value })} />
            <div className="rt-werkzeuge">
              <Button variant="ghost" groesse="klein" disabled={i === 0} onClick={() => setzen(verschieben(wert, i, -1))} aria-label={`Unterauftragsverarbeiter ${i + 1} nach oben`}>Nach oben</Button>
              <Button variant="ghost" groesse="klein" disabled={i === wert.length - 1} onClick={() => setzen(verschieben(wert, i, 1))} aria-label={`Unterauftragsverarbeiter ${i + 1} nach unten`}>Nach unten</Button>
              <Button variant="ghost" groesse="klein" onClick={() => setzen(wert.filter((_, j) => j !== i))} aria-label={`Unterauftragsverarbeiter ${i + 1} entfernen`}>Entfernen</Button>
            </div>
          </div>
        ))}
      </div>
      <Button variant="secondary" disabled={wert.length >= 50} onClick={() => setzen([...wert, { wer: '', wofuer: '', wo: '' }])}>
        Unterauftragsverarbeiter hinzufügen
      </Button>
    </Card>
  );
}
