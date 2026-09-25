import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import { MODULE, aktiveModule, zieheMit, modul, type ModulId } from '@/lib/module';
import Card from '@/components/Card';
import Aktionsleiste from '@/components/Aktionsleiste';
import { List, ListRow } from '@/components/ListRow';
import Button from '@/components/Button';
import { Warnung } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';

/**
 * Module ein- und ausschalten.
 *
 * Die App ist auf siebzehn Bereiche gewachsen; ein Betrieb braucht selten
 * alle. Wer extern fakturiert, will keine Rechnungen sehen; wer kein Lager
 * führt, keine Materialanforderung. Jeder ungenutzte Bereich ist ein Eintrag
 * in der Navigation, eine Frage im Kopf und eine Stelle, an der etwas
 * kaputtgehen kann, ohne dass es jemand merkt.
 *
 * DREI DINGE, DIE DIESE ANSICHT DESHALB LEISTEN MUSS:
 *
 *  1. Sagen, was ein Abschalten NACH SICH ZIEHT — bevor es passiert. Die
 *     Nachkalkulation braucht die Rechnungen; wer sie abschaltet und das
 *     erst hinterher merkt, ist überrascht, und Überraschung ist bei
 *     Einstellungen das Gegenteil von Kontrolle.
 *  2. Sagen, dass DATEN BLEIBEN. Sonst traut sich niemand, etwas
 *     abzuschalten — und die Einstellung wäre für nichts da.
 *  3. Sagen, dass ein Modul KEINE Rechteverwaltung ist. Wer das verwechselt,
 *     hält ein abgeschaltetes Modul für Schutz.
 */
export default function ModulesView() {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();

  const [entwurf, setEntwurf] = useState<Record<string, boolean>>({});
  const [speichert, setSpeichert] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Modul, dessen Abschalten noch bestätigt werden muss. */
  const [frage, setFrage] = useState<{ id: ModulId; mit: ModulId[] } | null>(null);

  useEffect(() => {
    setEntwurf(company?.modules ?? {});
  }, [company]);

  const aktiv = useMemo(() => aktiveModule(entwurf), [entwurf]);
  const gespeichert = useMemo(() => aktiveModule(company?.modules), [company]);

  /** Weicht der Entwurf vom gespeicherten Stand ab? */
  const geaendert = useMemo(() => {
    if (aktiv.size !== gespeichert.size) return true;
    return [...aktiv].some((m) => !gespeichert.has(m));
  }, [aktiv, gespeichert]);

  function umschalten(id: ModulId, an: boolean) {
    if (!an) {
      const mit = zieheMit(id, entwurf);
      if (mit.length > 0) {
        // Erst fragen, dann schalten — siehe Punkt 1 oben.
        setFrage({ id, mit });
        return;
      }
    }
    setEntwurf((alt) => ({ ...alt, [id]: an }));
  }

  async function speichern() {
    if (!user) return;
    setSpeichert(true);
    setError(null);
    try {
      await updateCompany(user.companyId, { modules: entwurf });
      await reloadCompany();
      toast.success('Module gespeichert');
    } catch (err) {
      setError(grundAus(err, 'Die Module konnten nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Module"
        subtitle="Welche Bereiche dieser Betrieb benutzt"
      />

      {error && <ErrorState message={error} />}

      {/*
        Die Erklaerung stand als EIGENE KARTE ueber der Liste — eine ganze
        Karte Hoehe, bei jedem Aufruf, obwohl sie nur beim ersten Mal etwas
        sagt. Sie gehoert an die Liste, die sie erklaert, und dort ins „i".
      */}
      {/* Der Stand rechts in der Titelzeile, der Titel sagt, was die Liste
          ist (Linie, 2). */}
      <Card
        title="Bereiche"
        action={<span className="titel-angabe">Eingeschaltet: {aktiv.size} von {MODULE.length}</span>}
        hint={
          <>
            Ein ausgeschaltetes Modul verschwindet aus der Navigation, und seine Adressen sind
            zu. <strong>Vorhandene Daten bleiben unangetastet</strong> — wird es wieder
            eingeschaltet, ist alles da, wo es war.
            <br />
            <br />
            Module sind <strong>keine Rechteverwaltung</strong>. Sie nehmen den Weg weg, nicht das
            Recht: wer als Buchhaltung Rechnungen anlegen darf, darf das weiterhin — die
            Oberfläche bietet es nur nicht mehr an. Wer wann was darf, steht in den Rollen und
            wird serverseitig durchgesetzt. Geschützt ist hier die <em>Modulliste selbst</em>:
            ändern darf sie nur die Geschäftsführung.
          </>
        }
      >
        <div className="space-y-4">
          <List>
            {MODULE.map((m) => {
              const an = aktiv.has(m.id);
              const fehlt = m.abhaengigVon?.filter((d) => !aktiv.has(d)) ?? [];
              return (
                <ListRow
                  key={m.id}
                  title={
                    <>
                      {m.name}
                      {/* Eine Aufforderung, keine Eigenschaft: ohne das andere
                          Modul lässt sich dieses gar nicht einschalten. */}
                      {fehlt.length > 0 && (
                        <Warnung>
                          braucht {fehlt.map((d) => modul(d)?.name ?? d).join(', ')}
                        </Warnung>
                      )}
                    </>
                  }
                  subtitle={
                    <>
                      {m.zweck}
                      <span className="mt-1 block text-xs">Betrifft: {m.betrifft.join(', ')}</span>
                    </>
                  }
                >
                  <label className="flex min-h-touch shrink-0 items-center gap-3">
                    <span className="text-sm text-ink-muted">{an ? 'ein' : 'aus'}</span>
                    <input
                      type="checkbox"
                      className="kaestchen-gross"
                      checked={an}
                      disabled={fehlt.length > 0 && !an}
                      onChange={(e) => umschalten(m.id, e.target.checked)}
                      aria-label={`${m.name} ${an ? 'ausschalten' : 'einschalten'}`}
                    />
                  </label>
                </ListRow>
              );
            })}
          </List>

          {/* Die Liste läuft am Telefon über fast zwei Bildschirme; wer oben
              ein Modul umschaltet, findet das Speichern in der Aktionsleiste
              statt erst am Ende. Liste und Leiste teilen einen Behälter —
              sonst hätte die Leiste nichts, woran sie kleben kann. */}
          <Aktionsleiste>
            <Button onClick={speichern} loading={speichert} disabled={!geaendert}>
              Module speichern
            </Button>
            {geaendert && (
              <Button variant="ghost" onClick={() => setEntwurf(company?.modules ?? {})}>
                Verwerfen
              </Button>
            )}
            {!geaendert && (
              <span className="text-sm text-ink-muted sm:self-center">Keine Änderung offen.</span>
            )}
          </Aktionsleiste>
        </div>
      </Card>

      <ConfirmDialog
        open={!!frage}
        title={frage ? `${modul(frage.id)?.name} ausschalten?` : ''}
        // Ohne diese Zeile stand auf dem Knopf die Vorgabe „Löschen" — in Rot,
        // direkt unter dem Satz „Daten bleiben in beiden Fällen erhalten".
        // Der Knopf widersprach damit dem Text über ihm.
        confirmLabel="Ausschalten"
        message={
          frage
            ? `Damit geht auch ${frage.mit
                .map((m) => modul(m)?.name ?? m)
                .join(' und ')} aus — dieser Bereich braucht ${modul(frage.id)?.name}. ` +
              'Daten bleiben in beiden Fällen erhalten.'
            : ''
        }
        onCancel={() => setFrage(null)}
        onConfirm={() => {
          if (frage) setEntwurf((alt) => ({ ...alt, [frage.id]: false }));
          setFrage(null);
        }}
      />
    </div>
  );
}
