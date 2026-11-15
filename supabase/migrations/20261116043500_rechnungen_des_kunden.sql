/*
  DIE RECHNUNGEN EINES KUNDEN ÜBER DIE DATENBANK (Durchsicht 15.11.2026, A10).

  WAS DIE DURCHSICHT FAND. Die Kundenakte holte erst alle Baustellen des
  Kunden und schickte dann ihre Kennungen als `project_id.in.(…)` in einer
  `or`-Zeichenkette in der Adresse mit. Ab gut 220 Baustellen (gemessen
  8135–8145 Zeichen, `kern.ts`) lehnte das Gateway die Adresse ab: bei einer
  Hausverwaltung, bei der jede Reparatur eine Baustelle ist, standen
  „Rechnungen“ und „Jüngste Belege“ dauerhaft auf „konnte nicht geladen
  werden“.

  WAS JETZT GILT. `rechnungen_des_kunden(kunde, grenze)` sucht in der
  Datenbank: Rechnungen mit der Kundenkennung ODER auf einer Baustelle des
  Kunden — dieselbe Regel wie bisher, ohne Liste in der Adresse und ohne
  Grenze an der Zahl der Baustellen. Die jüngsten zuerst, mit Obergrenze
  (die Akte sagt, wenn sie greift).

  WARUM MIT DEN RECHTEN DES AUFRUFERS (security invoker). Wer welche
  Rechnung lesen darf, entscheidet die Regel `invoices_lesen` (Buchhaltung
  und Spitze, Support, Projektleitung auf ihren Baustellen). Als
  `security definer` stünde diese Regel ein zweites Mal hier — zwei
  Wahrheiten, die auseinanderlaufen können. So gilt genau dieselbe Regel wie
  bei der bisherigen Abfrage (wie bei `kunde_umbenennen`, A2).
  `set search_path = ''`; `anon` darf nicht ausführen. Lesend (`stable`),
  steht in `LESENDE_FUNKTIONEN`. Getragen von `invoices_kunde`,
  `invoices_baustelle_id` und `projects_kunde`.
*/
create or replace function public.rechnungen_des_kunden(p_kunde uuid, p_grenze integer default 500)
  returns setof public.invoices
  language sql
  stable
  set search_path = ''
as $$
  select i.*
    from public.invoices i
   where i.customer_id = p_kunde
      or i.project_id in (select p.id from public.projects p where p.customer_id = p_kunde)
   order by i.invoice_date desc, i.id
   limit greatest(1, least(coalesce(p_grenze, 500), 2000))
$$;

revoke all on function public.rechnungen_des_kunden(uuid, integer) from public, anon;
grant execute on function public.rechnungen_des_kunden(uuid, integer) to authenticated;
