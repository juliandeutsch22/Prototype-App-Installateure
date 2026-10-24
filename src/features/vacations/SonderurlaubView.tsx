import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { getUserByUid } from '@/lib/db/users';
import { listEigeneFreistellungen } from '@/lib/db/freistellungen';
import { canEditTime } from '@/lib/permissions';
import Card from '@/components/Card';
import PageHeader from '@/components/PageHeader';
import { SelectField } from '@/components/Field';
import { ErrorState, SkeletonList } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import type { FreistellungArt } from '@shared/freistellung';
import type { AppUser, Freistellung } from '@/types';
import FreistellungFormular from './FreistellungFormular';
import FreistellungListe from './FreistellungListe';
import FreistellungenBestaetigen from './FreistellungenBestaetigen';

/**
 * SONDERURLAUB OHNE DAS MODUL URLAUB (A15, 24.10.2026).
 *
 * Sonderurlaub, Pflegefreistellung und unbezahlter Urlaub standen nur auf der
 * Seite Urlaub. Ein Betrieb, der Urlaub nicht in Senklot führt, hatte damit
 * keinen Weg dazu — die Pflegefreistellung ist aber ein gesetzlicher
 * Anspruch (§ 16 UrlG), unabhängig davon, wie ein Betrieb seinen Urlaub
 * verwaltet. Diese Seite bringt genau diese drei Anträge, ihre Liste und das
 * Bestätigen durch das Büro; dieselben Bausteine wie auf der Urlaubsseite,
 * derselbe Weg in die Datenbank.
 *
 * Mit dem Modul Urlaub bleibt alles auf der Urlaubsseite; die Navigation
 * zeigt diese Seite dann nicht (`nurOhneModul`).
 */
export default function SonderurlaubView() {
  const { user, company } = useAuth();
  const [art, setArt] = useState<FreistellungArt>('dienstverhinderung');
  const [profil, setProfil] = useState<AppUser | null>(null);
  const [eigene, setEigene] = useState<Freistellung[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const buero = !!user && canEditTime(user.role);

  const laden = useCallback(async () => {
    if (!user) return;
    setFehler(null);
    try {
      const [p, frei] = await Promise.all([
        getUserByUid(user.companyId, user.uid),
        listEigeneFreistellungen(user.companyId, user.uid),
      ]);
      setProfil(p ?? null);
      setEigene(frei);
    } catch (err) {
      setFehler(grundAus(err, 'Die Anträge konnten nicht geladen werden.'));
    }
  }, [user]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const eigeneNeu = () => {
    if (!user) return;
    void listEigeneFreistellungen(user.companyId, user.uid).then(setEigene).catch(() => undefined);
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Sonderurlaub" subtitle="Sonderurlaub, Pflegefreistellung und unbezahlter Urlaub" />

      {buero && <FreistellungenBestaetigen user={user} company={company} />}

      {fehler ? (
        <ErrorState message={fehler} onRetry={() => void laden()} />
      ) : eigene === null ? (
        <SkeletonList rows={2} />
      ) : (
        <div className="zeit-raster">
          <Card className="zeit-formularkarte" title="Antrag stellen">
            <div className="mb-4">
              <SelectField
                id="sart"
                label="Art"
                value={art}
                onChange={(e) => setArt(e.target.value as FreistellungArt)}
              >
                <option value="dienstverhinderung">Sonderurlaub (Hochzeit, Todesfall, Umzug …)</option>
                <option value="pflegefreistellung">Pflegefreistellung</option>
                <option value="unbezahlt">Unbezahlter Urlaub</option>
              </SelectField>
            </div>
            <FreistellungFormular
              // Eigener Schlüssel je Art: der Wechsel beginnt mit leeren Feldern (G16).
              key={art}
              art={art}
              user={user}
              profil={profil}
              company={company}
              eigene={eigene}
              onGestellt={eigeneNeu}
            />
          </Card>
          {eigene.length > 0 && (
            <Card title="Mein Sonderurlaub" buendig className="zeit-liste">
              <FreistellungListe
                antraege={eigene}
                companyId={user.companyId}
                uid={user.uid}
                anlaesse={company?.freistellungAnlaesse}
                onGeaendert={eigeneNeu}
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
