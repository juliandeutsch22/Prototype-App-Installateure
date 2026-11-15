import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import { grundAus } from '@/lib/fehlerGrund';
import Card from '@/components/Card';
import Speicherleiste from '@/components/Speicherleiste';
import { CheckboxField } from '@/components/Field';
import { useToast } from '@/components/Toast';

/**
 * MONATSABSCHLUSS DER ZEITEN (Durchsicht 15.11.2026, Z6 + F3; E1: Einstellung
 * je Betrieb, aus = wie heute).
 *
 * Ohne Abschluss ändert jeder seine Buchungen beliebig alter Monate — auch
 * nach dem Lohnexport, und niemand wird darauf gestoßen. Eingeschaltet
 * schließt das Büro in der Mitarbeiterübersicht einen vergangenen Monat ab;
 * danach geht nur noch der Korrekturantrag, oder das Büro öffnet den Monat
 * mit Grund wieder. Ein Kästchen in einem Formular mit „Speichern“, wie die
 * übrigen Einstellungen dieser Seite.
 */
export default function MonatsabschlussEinstellung() {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();
  const gespeichert = company?.zeitMonatsabschluss === true;
  const [an, setAn] = useState(gespeichert);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  useEffect(() => { setAn(gespeichert); }, [gespeichert]);
  if (!user) return null;

  async function speichern() {
    if (!user) return;
    setFehler(null);
    setSpeichert(true);
    try {
      await updateCompany(user.companyId, { zeitMonatsabschluss: an });
      await reloadCompany();
      toast.success(an ? 'Monatsabschluss eingeschaltet' : 'Monatsabschluss ausgeschaltet');
    } catch (e) {
      setFehler(grundAus(e, 'Die Einstellung konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <Card
      title="Monatsabschluss der Zeiten"
      hint="Eingeschaltet schließen Buchhaltung, Geschäftsführung oder Administration in der Mitarbeiterübersicht einen vergangenen Monat ab — etwa nach dem Lohnexport. Danach lässt sich in diesem Monat nichts mehr buchen, ändern oder löschen, auch nicht vom Büro und nicht über Urlaub, Krankmeldung oder Timer. Wer noch etwas ändern muss, stellt einen Korrekturantrag; das Büro setzt ihn um. Den Korrekturantrag gibt es mit dem Modul „Korrekturanträge“ (Einstellungen → Module); ist es aus, öffnet das Büro den Monat mit Grund wieder. Ein abgeschlossener Monat lässt sich mit Grund wieder öffnen; Abschluss und Öffnen stehen mit Name und Zeit im Verlauf. Ausgeschaltet gilt kein Abschluss — wie bisher."
    >
      <div className="formular">
        <CheckboxField
          id="zeitMonatsabschluss"
          label="Monate abschließen — danach Änderungen nur über einen Korrekturantrag"
          checked={an}
          onChange={(e) => setAn(e.target.checked)}
        />
        {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}
        <Speicherleiste geaendert={an !== gespeichert} speichert={speichert} onVerwerfen={() => { setFehler(null); setAn(gespeichert); }} onSpeichern={() => void speichern()} />
      </div>
    </Card>
  );
}
