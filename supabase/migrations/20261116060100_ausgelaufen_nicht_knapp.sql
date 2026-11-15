/*
  M9 (Entscheidung des Auftraggebers, 15.11.2026): EIN AUSGELAUFENER ARTIKEL
  IST NICHT „KNAPP“.

  Gefunden bei M1: ein ausgelaufener Lagerartikel mit Mindestmenge stand
  weiter unter „knapp“ — in der Lagerliste, auf der Startseite (Zahl und
  Abschnitt „Unter Mindestmenge“) und im Kopf des Katalogs. Er soll nicht
  mehr nachbestellt werden; die Warnung fordert genau das. Gleich, ob der
  Katalog ihn auslaufen ließ (DATANORM) oder jemand von Hand.

  Die Bestellvorschläge schließen Ausgelaufene seit M1 aus
  (20261115300000_artikel_auslaufen.sql, `bestellvorschlag_stand`). Hier die
  zweite Stelle in der Datenbank, die „knapp“ rechnet: `lager_knapp` (die
  Startseite). In der App ist es eine Stelle, `istKnapp`. Der Artikel bleibt
  im Lager sichtbar, mit Bestand und mit dem Kennzeichen „ausgelaufen“ —
  nur die Warnung entfällt.

  Rumpf wie in 20261019200000_startseite_aus_der_datenbank.sql; neu ist nur
  `and not m.ausgelaufen`. RECHTE und Rückgabe unverändert.
*/

create or replace function public.lager_knapp(p_grenze numeric)
  returns table (id uuid, name text, unit text, mindestmenge numeric, frei numeric)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with artikel as (
    select m.id, m.name, m.unit, m.mindestmenge
      from public.materials m
     where m.company_id = (select app.betrieb())
       and (select app.darf(app.betrieb()))
       and m.lagerartikel
       -- NEU (M9): was ausgelaufen ist, wird nicht mehr nachbestellt.
       and not m.ausgelaufen
  )
  select a.id, a.name, a.unit, a.mindestmenge, f.frei
    from artikel a
    join public.lager_frei((select coalesce(array_agg(x.id), '{}'::uuid[]) from artikel x)) f
      on f.material_id = a.id
   where case when a.mindestmenge is not null then f.frei < a.mindestmenge
              else f.frei <= p_grenze end
   order by a.name, a.id
$$;

revoke all on function public.lager_knapp(numeric) from public, anon;
grant execute on function public.lager_knapp(numeric) to authenticated;
