import { useEffect, useState } from 'react';
import type { AppUser, KontoUmstellung } from '@/types';
import { kontoUmstellen } from '@/lib/auth/sitzung';
import { resendPasswordReset } from '@/lib/auth/provisionUser';
import { listKontoUmstellungen } from '@/lib/db/users';
import { benutzernameFehler, istBenutzerkonto, mailAdresseFehler } from '@shared/benutzername';
import Button from '@/components/Button';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAT } from '@/lib/datum';
import { localDateStr } from '@/lib/time';

/**
 * EIN KONTO ZWISCHEN E-MAIL UND BENUTZERNAME UMSTELLEN — im Zugang der Akte
 * (Entscheidung vom 02.10.2026).
 *
 * Die beiden Richtungen wiegen verschieden, und die Maske sagt es vorher:
 *   - auf die E-Mail: das Passwort bleibt, danach geht eine Passwort-Mail an
 *     die neue Adresse. Kommt sie nicht an, stimmt die Adresse nicht. Auch
 *     für das eigene Konto.
 *   - auf den Benutzernamen: Pflichtgrund, die Person wird überall abgemeldet,
 *     und es gibt ein Startpasswort, das nur jetzt dasteht. Nicht für das
 *     eigene Konto — das macht eine zweite Leitung.
 *
 * Darunter das Protokoll der Umstellungen dieser Person: wer, wann, wohin,
 * warum.
 */
export default function KontoUmstellen({
  person, eigenesKonto, onUmgestellt,
}: {
  person: AppUser;
  eigenesKonto: boolean;
  /**
   * Die Akte lädt danach neu — die Anmeldung steht an der Person. Das
   * Startpasswort zeigt die Akte selbst an: diese Karte wird beim Neuladen
   * neu aufgebaut, und mit ihr ginge es verloren.
   */
  onUmgestellt: (startpasswort?: string) => void;
}) {
  const toast = useToast();
  const benutzerkonto = istBenutzerkonto(person.email);
  const [offen, setOffen] = useState(false);
  const [email, setEmail] = useState('');
  const [benutzername, setBenutzername] = useState('');
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [protokoll, setProtokoll] = useState<KontoUmstellung[] | null>(null);
  const [nochmal, setNochmal] = useState(0);

  useEffect(() => {
    let weg = false;
    listKontoUmstellungen(person.uid)
      .then((z) => { if (!weg) setProtokoll(z); })
      // Ohne Protokoll bleibt die Umstellung möglich; die Liste fehlt dann nur.
      .catch(() => { if (!weg) setProtokoll([]); });
    return () => {
      weg = true;
    };
  }, [person.uid, nochmal]);

  const aufBenutzername = !benutzerkonto;
  if (aufBenutzername && eigenesKonto && (protokoll ?? []).length === 0) return null;

  function schliessen() {
    setOffen(false);
    setEmail('');
    setBenutzername('');
    setGrund('');
    setFehler(null);
  }

  async function umstellen(): Promise<void> {
    const warum = aufBenutzername
      ? benutzernameFehler(benutzername.trim()) ?? (grund.trim() ? null : 'Bitte einen Grund angeben — er steht im Protokoll.')
      : (email.trim().includes('@') ? mailAdresseFehler(email.trim().toLowerCase()) : 'Bitte eine E-Mail-Adresse eingeben.');
    if (warum) {
      setFehler(warum);
      return;
    }
    setLaeuft(true);
    setFehler(null);
    try {
      if (aufBenutzername) {
        const r = await kontoUmstellen(person.uid, { nach: 'benutzername', benutzername: benutzername.trim(), grund: grund.trim() });
        schliessen();
        toast.success(`${person.name} meldet sich jetzt mit Benutzername an`);
        onUmgestellt(r.startpasswort);
      } else {
        const r = await kontoUmstellen(person.uid, { nach: 'mail', email: email.trim() });
        schliessen();
        try {
          await resendPasswordReset(r.anmeldung);
          toast.success(`Auf E-Mail umgestellt — Passwort-Mail an ${r.anmeldung} gesendet`);
        } catch (err) {
          toast.error(grundAus(err, `Umgestellt, aber die Passwort-Mail an ${r.anmeldung} ging nicht hinaus.`));
        }
        onUmgestellt();
      }
      setNochmal((n) => n + 1);
    } catch (err) {
      setFehler(grundAus(err, 'Das Konto ließ sich nicht umstellen.'));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-3">
      {!(aufBenutzername && eigenesKonto) && !offen && (
        <Button variant="ghost" onClick={() => setOffen(true)}>
          {aufBenutzername ? 'Auf Benutzername umstellen …' : 'Auf E-Mail umstellen …'}
        </Button>
      )}

      {offen && (
        <div className="space-y-3">
          {aufBenutzername ? (
            <>
              <p className="text-sm text-ink-muted">
                {person.name} wird überall abgemeldet und meldet sich danach mit dem Benutzernamen
                und einem Startpasswort an, das nur einmal angezeigt wird. Der Grund steht im Protokoll.
              </p>
              <InputField
                id="umstellen-benutzername" label="Benutzername" pflicht autoComplete="off"
                value={benutzername} onChange={(e) => setBenutzername(e.target.value)}
              />
              <InputField
                id="umstellen-grund" label="Grund" pflicht
                value={grund} onChange={(e) => setGrund(e.target.value)}
              />
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">
                Danach meldet sich {eigenesKonto ? 'dein Konto' : person.name} mit dieser Adresse an;
                das Passwort bleibt. Eine Passwort-Mail geht an die Adresse — kommt sie nicht an,
                stimmt die Adresse nicht.
              </p>
              <InputField
                id="umstellen-mail" label="E-Mail" type="email" pflicht autoComplete="off"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </>
          )}
          {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}
          <div className="flex flex-wrap gap-3">
            <Button loading={laeuft} onClick={() => void umstellen()}>Umstellen</Button>
            <Button variant="ghost" onClick={schliessen} disabled={laeuft}>Abbrechen</Button>
          </div>
        </div>
      )}

      {(protokoll ?? []).length > 0 && (
        <div>
          <p className="text-sm font-semibold text-ink">Anmeldung umgestellt</p>
          <ul className="mt-1 space-y-1 text-sm text-ink-muted">
            {protokoll!.map((u) => (
              <li key={u.id}>
                {datumAT(localDateStr(new Date(u.am)))} · auf {u.nach === 'mail' ? 'E-Mail' : 'Benutzername'}
                {u.durchName ? ` · durch ${u.durchName}` : ''}
                {u.grund ? ` · ${u.grund}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
