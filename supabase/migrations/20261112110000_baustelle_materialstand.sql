/*
  DER MATERIALSTAND EINER BAUSTELLE (B1, E84, 12.11.2026).

  Die Baustellenakte wird zur Drehscheibe: in der Übersicht steht, was für
  die Baustelle angefordert, abgeholt, zurückgebracht und laut Scheinen
  verbaut ist. Gezählt wird hier und nicht im Browser — eine lange
  Baustelle hat Hunderte Anforderungen; eine Seite mit Grenze zählte nur
  die ersten und behauptete dann zu wenig.

  RECHTE WIE BISHER. Anforderungen anderer lesen Verwaltung, Buchhaltung
  und Führung (`material_orders_lesen`); dieselben bekommen hier ihre
  Zahlen. Wer das nicht darf, bekommt nichts — keine Nullen, die nach
  „nichts angefordert“ aussähen. Scheine liest jeder im Betrieb; ihr Teil
  folgt derselben Regel, weil die Akte beides in einem Block zeigt.

  Schreibweisen der Nummer wie überall: mit und ohne „PR-“, ohne Rücksicht
  auf Groß- und Kleinschrift (`app.baustelle_norm` gibt es nicht als SQL;
  hier dieselbe Regel ausgeschrieben).
*/

create index if not exists material_orders_baustelle
  on public.material_orders (company_id, project_number, created_at desc);

create or replace function public.baustelle_materialstand(p_company text, p_projekt text)
  returns table (
    angefordert integer,
    abholbereit integer,
    abgeholt integer,
    zurueck integer,
    zuletzt timestamptz,
    scheine_mit_material integer,
    positionen integer
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  norm text := lower(regexp_replace(btrim(coalesce(p_projekt, '')), '^pr-', '', 'i'));
begin
  /*
    COALESCE IST HIER DIE SICHERUNG, NICHT ZIER. Ohne Support-Einblick ist
    `app.supportbetrieb()` leer; der Vergleich wird NULL, `not NULL` bleibt
    NULL, und ein `if` mit NULL ist „nicht wahr“ — der fremde Betrieb kam
    durch (gefunden von `baustelleMaterialstand.test.ts`).
  */
  if norm = ''
     or not coalesce(p_company = (select app.lesebetrieb()) or p_company = (select app.supportbetrieb()), false)
     or not coalesce((select app.hat_rolle(array['Verwaltung', 'Buchhaltung'])) or (select app.ist_fuehrung()), false) then
    return;
  end if;
  return query
  with anf as (
    select o.status, o.transaction_type, o.created_at
      from public.material_orders o
     where o.company_id = p_company
       and o.project_number in (p_projekt, norm, upper(norm), 'PR-' || norm, 'PR-' || upper(norm), 'pr-' || norm)
  ), sch as (
    select s.id, count(m.id) as n
      from public.work_sheets s
      join public.work_sheet_material m on m.work_sheet_id = s.id and m.company_id = s.company_id
     where s.company_id = p_company
       and s.status = 'Unterschrieben'
       and s.project_number in (p_projekt, norm, upper(norm), 'PR-' || norm, 'PR-' || upper(norm), 'pr-' || norm)
       and m.menge > 0
     group by s.id
  )
  select
    (select count(*)::integer from anf where transaction_type <> 'return' and status in ('Offen', 'In Bearbeitung')),
    (select count(*)::integer from anf where transaction_type <> 'return' and status = 'Abholbereit'),
    (select count(*)::integer from anf where transaction_type <> 'return' and status = 'Erledigt'),
    (select count(*)::integer from anf where transaction_type = 'return'),
    (select max(created_at) from anf),
    (select count(*)::integer from sch),
    (select coalesce(sum(n), 0)::integer from sch);
end;
$$;

revoke all on function public.baustelle_materialstand(text, text) from public, anon;
grant execute on function public.baustelle_materialstand(text, text) to authenticated;
