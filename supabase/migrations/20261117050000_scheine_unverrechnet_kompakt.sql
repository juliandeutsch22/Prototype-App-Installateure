/*
  L22 (Messung gegen den gewachsenen Bestand, 15.11.2026) — „NICHT VERRECHNET“
  IN EINER ANTWORT, SO KNAPP WIE DIE ANSICHT ES BRAUCHT.

  WAS GEMESSEN WURDE (`docs/ui-umbau/messung-gewachsen.md`). Mit 30.000
  Scheinen, davon 9.888 unverrechnet, waren Startseite und Rechnungen der
  Geschäftsführung erst nach rund 12 s bereit, die übrigen Seiten nach 3,5 bis
  5 s. Die ganze Mehrzeit lag in `scheine_unverrechnet`: die App holte die
  Liste in 20 Seiten zu 500 Zeilen, EINE NACH DER ANDEREN (die Antwort einer
  Funktion endet bei 1.000 Zeilen), und jede Seite rechnete den ganzen Kern
  neu — je Seite rund 0,2 s Datenbank, 0,15 s Laufzeit und 14 KB über
  langsames 4G, zusammen 8,2 bis 8,8 s. Die Scheinliste der Leitung holte zu
  denselben Kennungen danach noch jeden ganzen Schein (511 Anfragen, 51 s).

  WAS DIE ANSICHTEN WIRKLICH ZEIGEN. Die Startseite nennt nur die Zahl und
  wie viele davon über vier Wochen alt sind. „Nicht verrechnete Leistung“
  unter Rechnungen zeigt eine Zeile je Baustelle (A2, 12.11.2026). Die
  Scheinliste zeigt Scheine — aber nur so viele, wie auf den Schirm passen.
  Alle Scheine in den Browser zu tragen war für keine der drei nötig, und es
  wächst mit jedem vergessenen Schein: genau dort, wo die Zahl am wichtigsten
  ist, wurde die Seite am langsamsten.

  WAS JETZT GILT. Zwei Funktionen über denselben Kern wie
  `scheine_unverrechnet` — dieselben Regeln, dieselben Rechte:
    - `scheine_unverrechnet_stand(p_alt_bis)`: eine Zeile mit Zahl, Zahl der
      Scheine bis einschließlich `p_alt_bis` (die App gibt den Tag vor vier
      Wochen in Wien mit; die Datenbank rechnet kein „heute“ selbst, damit
      Browser und Datenbank nie an verschiedenen Tagen stehen) und dem
      ältesten Tag. Startseite und Schriftfeld der Scheinliste.
    - `scheine_unverrechnet_baustellen()`: je Baustelle eine Zeile — der
      älteste Schein vertritt sie (Kennung, Nummer wie an ihm, Tag,
      Abrechnung), dazu der erste nicht leere Kundenname in derselben
      Reihenfolge und die Zahl der Scheine. Die Baustellennummer wird
      verglichen wie im Kern: ohne „PR-“, ohne Leerzeichen am Rand, ohne
      Groß/klein. Als EIN jsonb-Wert, weil auch eine Antwort je Baustelle über
      1.000 Zeilen gehen kann und die Vollständigkeit die Zusage ist (P3).
  Die Scheinliste blättert in `scheine_unverrechnet` (älteste zuerst) nur so
  weit, wie jemand schaut.

  `scheine_unverrechnet` bleibt, wie es ist — die alte App fragt es, und die
  Scheinliste blättert darin.
*/

create or replace function public.scheine_unverrechnet_stand(p_alt_bis date)
  returns table (anzahl integer, alt integer, aeltester date)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  betrieb text := app.verrechnung_betrieb();
begin
  return query
  select count(*)::integer,
         (count(*) filter (where w.datum <= p_alt_bis))::integer,
         min(w.datum)
    from public.work_sheets w
   where w.company_id = betrieb
     and w.status = 'Unterschrieben'
     and w.id not in (select k from app.scheine_verrechnet_kern(betrieb, null) k);
end;
$$;

revoke all on function public.scheine_unverrechnet_stand(date) from public, anon;
grant execute on function public.scheine_unverrechnet_stand(date) to authenticated;

create or replace function public.scheine_unverrechnet_baustellen()
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.verrechnung_betrieb();
  ergebnis jsonb;
begin
  with offen as (
    select w.id, w.project_number, w.customer_name, w.datum, w.abrechnung,
           lower(regexp_replace(btrim(coalesce(w.project_number, '')), '^pr-', '', 'i')) as nr
      from public.work_sheets w
     where w.company_id = betrieb
       and w.status = 'Unterschrieben'
       and w.id not in (select k from app.scheine_verrechnet_kern(betrieb, null) k)
  ),
  je as (
    select (array_agg(o.id order by o.datum, o.id))[1] as id,
           (array_agg(o.project_number order by o.datum, o.id))[1] as project_number,
           -- Wie die Ansicht bisher: der Kunde des ältesten Scheins, sonst der nächste, der einen nennt.
           (array_agg(o.customer_name order by o.datum, o.id) filter (where o.customer_name <> ''))[1] as customer_name,
           min(o.datum) as datum,
           (array_agg(o.abrechnung order by o.datum, o.id))[1] as abrechnung,
           count(*)::integer as anzahl
      from offen o
     group by o.nr
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', je.id, 'project_number', je.project_number, 'customer_name', coalesce(je.customer_name, ''),
           'datum', je.datum, 'abrechnung', je.abrechnung, 'anzahl', je.anzahl)
         order by je.datum, je.id), '[]'::jsonb)
    into ergebnis
    from je;
  return ergebnis;
end;
$$;

revoke all on function public.scheine_unverrechnet_baustellen() from public, anon;
grant execute on function public.scheine_unverrechnet_baustellen() to authenticated;
