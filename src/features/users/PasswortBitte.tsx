import { useEffect, useState } from 'react';
import { listPasswortAnfragen, passwortAnfrageVerwerfen, type PasswortAnfrage } from '@/lib/db/users';
import Button from '@/components/Button';
import Hinweiszeile from '@/components/Hinweiszeile';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { todayStr } from '@/lib/time';
import { seitText } from '@/features/dashboard/start/regeln';

/**
 * DIE BITTE UM EIN NEUES PASSWORT, IN DER AKTE (V14, Durchsicht 15.11.2026).
 *
 * Wer sich mit Benutzername anmeldet und das Passwort vergessen hat, schickt
 * aus der Anmeldemaske eine Bitte; sie steht auf der Startseite der Leitung
 * und hier. „Neues Startpasswort vergeben“ erledigt sie von selbst; eine
 * Bitte, die nichts verlangt (das Passwort ist wieder eingefallen, oder sie
 * kam nicht von der Person), wird hier verworfen.
 *
 * `stand` ändert sich, wenn die Akte ein Passwort vergeben hat — dann wird
 * nachgesehen, ob die Bitte noch offen ist.
 */
export default function PasswortBitte({
  companyId, uid, name, stand,
}: {
  companyId: string;
  uid: string;
  name: string;
  stand: unknown;
}) {
  const toast = useToast();
  const [offen, setOffen] = useState<PasswortAnfrage | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    let weg = false;
    listPasswortAnfragen(companyId, uid)
      .then((l) => { if (!weg) setOffen(l[0] ?? null); })
      .catch(() => { if (!weg) setOffen(null); });
    return () => {
      weg = true;
    };
  }, [companyId, uid, stand]);

  if (!offen) return null;

  async function verwerfen(id: string) {
    setLaeuft(true);
    try {
      await passwortAnfrageVerwerfen(id);
      setOffen(null);
      toast.success('Bitte verworfen');
    } catch (e) {
      toast.error(grundAus(e, 'Die Bitte ließ sich nicht verwerfen.'));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="mt-4">
      <Hinweiszeile stufe="warn" role="status">
        <p>
          <b>{name} bittet um ein neues Passwort</b> ({seitText(offen.angefragtAm, todayStr())}, aus der
          Anmeldemaske). „Neues Startpasswort vergeben“ erledigt die Bitte; das Passwort persönlich weitergeben.
        </p>
        <Button variant="ghost" className="mt-2" loading={laeuft} onClick={() => void verwerfen(offen.id)}>
          Bitte verwerfen
        </Button>
      </Hinweiszeile>
    </div>
  );
}
