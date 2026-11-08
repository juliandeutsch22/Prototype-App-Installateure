import { useEffect, useMemo, useState } from 'react';
import type { Project, Role } from '@/types';
import type { WithId } from '@/lib/db/core';
import { listActiveProjects, listProjectsForEmployee, searchProjects } from '@/lib/db/projects';
import { baustellenTitel } from '@/lib/baustellenTitel';

/**
 * Die Baustellen, die jemand für einen Thread wählen kann — der Monteur
 * seine, das Büro die aktiven, mit Suche über alle (ab zwei Zeichen auf dem
 * Server). Für „Neue Nachricht“ und die Übernahme dieselbe Liste.
 */
export function useBaustellenAuswahl(open: boolean, companyId: string, uid: string, rolle: Role, suche: string) {
  const [begriff, setBegriff] = useState('');
  const [liste, setListe] = useState<WithId<Project>[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const monteur = rolle === 'Mitarbeiter';

  useEffect(() => {
    const t = setTimeout(() => setBegriff(suche.trim()), 300);
    return () => clearTimeout(t);
  }, [suche]);

  useEffect(() => {
    if (!open) return;
    let weg = false;
    setFehler(false);
    const laden = monteur
      ? listProjectsForEmployee(companyId, uid)
      : begriff.length >= 2 ? searchProjects(companyId, begriff, 50) : listActiveProjects(companyId, 50);
    laden.then((r) => { if (!weg) setListe(r); }).catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [open, monteur, companyId, uid, begriff]);

  const treffer = useMemo(() => {
    const s = begriff.toLowerCase();
    // Beim Monteur wird in seinen Baustellen gesucht, beim Büro hat der Server schon gesucht.
    return (liste ?? []).filter((p) => !monteur || !s
      || `${p.projectNumber} ${baustellenTitel(p)} ${p.address ?? ''}`.toLowerCase().includes(s));
  }, [liste, begriff, monteur]);

  return { liste, treffer, fehler, begriff };
}

