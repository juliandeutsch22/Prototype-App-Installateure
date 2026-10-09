/*
  DAS FREIE IM LAGER FÜR DIE ARTIKEL, DIE EINE ANSICHT ZEIGT (Analyse vom
  09.10.2026, „Nebenbei gefundene Lücken“).

  BISHER: `lager_frei()` gab je Artikel des Betriebs eine Zeile zurück, ohne
  Reihenfolge. PostgREST liefert auch die Antwort einer Funktion höchstens
  1.000 Zeilen, ohne Fehler (`zeilengrenze.test.ts`). Mit einem
  eingespielten Großhandelskatalog fehlten damit beliebige Artikel: im Lager
  galt deren Zugesagtes als null, die Anforderung zeigte den Regalbestand
  statt des Freien, und eine Rüstliste meldete keine Fehlmenge.

  JETZT nimmt die Funktion die Artikel entgegen, nach denen gefragt wird. Die
  App fragt in Portionen unter der Grenze und bekommt jede Zeile. Was je
  Artikel herauskommt, ist dieselbe Rechnung wie vorher, Wort für Wort.

  OHNE LISTE (`lager_frei()`) antwortet sie wie bisher für alle Artikel —
  damit eine noch geöffnete ältere Fassung der App nach dem Einspielen weiter
  arbeitet, bis sie sich erneuert.

  Der Betrieb wird einmal je Aufruf geprüft (`(select …)`), nicht je Artikel:
  `company_id = app.betrieb()` und `app.darf(company_id)` sind bei gleichem
  Betrieb dieselbe Frage wie `app.darf(app.betrieb())`.
*/

drop function if exists public.lager_frei();

create or replace function public.lager_frei(p_ids uuid[] default null)
  returns table (material_id uuid, bestand numeric, zugesagt numeric, geplant numeric, frei numeric)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with artikel as (
    select m.id, m.stock
      from public.materials m
     where m.company_id = (select app.betrieb())
       and (select app.darf(app.betrieb()))
       and (p_ids is null or m.id = any (p_ids))
  ),
  zusage as (
    select o.material_id, sum(o.quantity) as menge
      from public.material_orders o
     where o.company_id = (select app.betrieb())
       and o.material_id is not null
       and (p_ids is null or o.material_id = any (p_ids))
       and o.transaction_type = 'order'
       and not o.processed
       and (o.beschaffung = 'lager'
            or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
            or (o.beschaffung is null and o.status = 'Abholbereit'))
     group by o.material_id
  ),
  plan as (
    select p.material_id, sum(p.menge) as menge
      from public.einsatz_material_positionen p
      join public.einsatz_material e on e.id = p.einsatz_material_id
     where e.company_id = (select app.betrieb())
       and p.material_id is not null
       and (p_ids is null or p.material_id = any (p_ids))
       and e.date >= (now() at time zone 'Europe/Vienna')::date
       and not coalesce((e.geladen -> p.id) ? 'gebucht', false)
     group by p.material_id
  )
  select a.id,
         a.stock,
         coalesce(z.menge, 0),
         coalesce(pl.menge, 0),
         a.stock - coalesce(z.menge, 0) - coalesce(pl.menge, 0)
    from artikel a
    left join zusage z on z.material_id = a.id
    left join plan pl on pl.material_id = a.id
   -- Feste Reihenfolge: wer ohne Liste seitenweise fragt, verliert keine Zeile.
   order by a.id
$$;

revoke all on function public.lager_frei(uuid[]) from public, anon;
grant execute on function public.lager_frei(uuid[]) to authenticated;
