import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { ErrorState } from '@/components/States';
import { InputField, TextareaField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { updateCompany } from '@/lib/db/company';
import { grundAus } from '@/lib/fehlerGrund';
import {
  PLATZHALTER, STANDARD_VORLAGEN, adresseFehler, betreffFehler, unbekanntePlatzhalter, type BelegArt, type MailVorlagen,
} from '@shared/belegMail';

/**
 * BELEGE PER MAIL — JE BETRIEB (F16): die Antwortadresse und die Vorlagen für
 * Betreff und Text. Abgesendet wird über die Adresse der Plattform (damit
 * die Mail nicht als gefälscht im Spam landet); der Name des Betriebs steht
 * als Absender, Antworten und die Kopie gehen an die Antwortadresse.
 *
 * Eine leere Vorlage heißt „Standard“ — gespeichert wird dann nichts, und
 * eine bessere Standardvorlage erreicht den Betrieb später von selbst.
 */

const ARTEN: { art: BelegArt; titel: string }[] = [
  { art: 'rechnung', titel: 'Rechnung' },
  { art: 'angebot', titel: 'Angebot' },
  { art: 'mahnung', titel: 'Mahnung' },
];

export default function BelegMailEinstellungen({ bearbeiten }: { bearbeiten: boolean }) {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();
  const [antwort, setAntwort] = useState('');
  const [vorlagen, setVorlagen] = useState<Record<BelegArt, { betreff: string; text: string }>>({
    rechnung: { betreff: '', text: '' }, angebot: { betreff: '', text: '' }, mahnung: { betreff: '', text: '' },
  });
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    setAntwort(company?.belegMailAntwort ?? '');
    const v = company?.belegMailVorlagen ?? {};
    setVorlagen({
      rechnung: { betreff: v.rechnung?.betreff ?? '', text: v.rechnung?.text ?? '' },
      angebot: { betreff: v.angebot?.betreff ?? '', text: v.angebot?.text ?? '' },
      mahnung: { betreff: v.mahnung?.betreff ?? '', text: v.mahnung?.text ?? '' },
    });
  }, [company]);

  if (!bearbeiten) {
    return (
      <Card title="Belege per Mail" hint="Antwortadresse und Vorlagen pflegt die Geschäftsführung.">
        <p className="text-sm text-ink">
          {company?.belegMailAntwort
            ? `Antworten und die Kopie gehen an ${company.belegMailAntwort}.`
            : 'Noch keine Antwortadresse eingetragen — bis dahin gehen keine Belege per Mail hinaus.'}
        </p>
      </Card>
    );
  }

  const adressGrund = antwort.trim() ? adresseFehler(antwort) : null;
  const vorlagenGrund = ARTEN.map(({ art, titel }) => {
    const v = vorlagen[art];
    if (v.betreff.trim() && betreffFehler(v.betreff)) return `${titel}: ${betreffFehler(v.betreff)}`;
    if (v.text.length > 10_000) return `${titel}: Der Text ist zu lang (höchstens 10.000 Zeichen).`;
    const unbekannt = unbekanntePlatzhalter(art, `${v.betreff}\n${v.text}`);
    return unbekannt.length > 0 ? `${titel}: unbekannte Platzhalter ${unbekannt.map((p) => `{${p}}`).join(', ')}` : null;
  }).find(Boolean) ?? null;

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!user || adressGrund || vorlagenGrund) return;
    setLaeuft(true);
    setFehler(null);
    const neu: MailVorlagen = {};
    for (const { art } of ARTEN) {
      const v = vorlagen[art];
      const teil = { ...(v.betreff.trim() ? { betreff: v.betreff.trim() } : {}), ...(v.text.trim() ? { text: v.text } : {}) };
      if (Object.keys(teil).length > 0) neu[art] = teil;
    }
    try {
      await updateCompany(user.companyId, {
        belegMailAntwort: antwort.trim() || null,
        belegMailVorlagen: Object.keys(neu).length > 0 ? neu : null,
      });
      await reloadCompany();
      toast.success('Einstellungen für Belege per Mail gespeichert');
    } catch (err) {
      setFehler(grundAus(err, 'Die Einstellungen für Belege per Mail konnten nicht gespeichert werden.'));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <form onSubmit={speichern} className="space-y-6">
      <Card
        title="Belege per Mail"
        hint={
          <>
            Rechnungen, Mahnungen und Angebote gehen aus der App per Mail an den Kunden — mit dem PDF im Anhang. Abgesendet wird
            über die Adresse von Senklot mit dem Namen des Betriebs; der Kunde antwortet an die Antwortadresse, und
            dorthin geht auf Wunsch die Kopie. Leere Vorlagen heißen „Standard“. Platzhalter: bei der Rechnung{' '}
            {PLATZHALTER.rechnung.map((p) => `{${p}}`).join(', ')}; beim Angebot {PLATZHALTER.angebot.map((p) => `{${p}}`).join(', ')};
            bei der Mahnung {PLATZHALTER.mahnung.map((p) => `{${p}}`).join(', ')} — {'{titel}'} ist „Zahlungserinnerung“,
            „Mahnung“ oder „Letzte Mahnung“.
            Eine Zeile mit {'{link}'} fällt weg, wenn kein Annahme-Link mitgeht.
          </>
        }
      >
        <div className="formular space-y-4">
          <div>
            <InputField
              id="beleg-mail-antwort"
              label="Antwortadresse"
              type="email"
              autoComplete="email"
              value={antwort}
              onChange={(e) => setAntwort(e.target.value)}
              aria-invalid={!!adressGrund || undefined}
              aria-describedby="beleg-mail-antwort-hinweis"
            />
            <p id="beleg-mail-antwort-hinweis" className={`mt-1 text-sm ${adressGrund ? 'text-danger' : 'text-ink-muted'}`}>
              {adressGrund ?? 'Ohne Antwortadresse geht kein Beleg per Mail hinaus — sonst landeten Antworten der Kunden bei Senklot.'}
            </p>
          </div>
          {ARTEN.map(({ art, titel }) => (
            <fieldset key={art} className="space-y-3 border-t border-line pt-4">
              <legend className="section-label">{`Vorlage ${titel}`}</legend>
              <InputField
                id={`beleg-mail-${art}-betreff`}
                label="Betreff"
                placeholder={STANDARD_VORLAGEN[art].betreff}
                value={vorlagen[art].betreff}
                onChange={(e) => setVorlagen((v) => ({ ...v, [art]: { ...v[art], betreff: e.target.value } }))}
              />
              <TextareaField
                id={`beleg-mail-${art}-text`}
                label="Text"
                rows={8}
                placeholder={STANDARD_VORLAGEN[art].text}
                value={vorlagen[art].text}
                onChange={(e) => setVorlagen((v) => ({ ...v, [art]: { ...v[art], text: e.target.value } }))}
              />
            </fieldset>
          ))}
          {vorlagenGrund && <p role="alert" className="text-sm text-danger">{vorlagenGrund}</p>}
        </div>
      </Card>
      {fehler && <ErrorState message={fehler} />}
      <div className="fuss-aktionen">
        <Button type="submit" loading={laeuft} disabled={!!adressGrund || !!vorlagenGrund}>
          Belege per Mail speichern
        </Button>
      </div>
    </form>
  );
}
