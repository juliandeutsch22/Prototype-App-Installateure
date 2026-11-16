/*
  DIE LAGERLISTE AUS DER DATENBANK (Durchsicht 15.11.2026, Budget B3:
  höchstens 50 Zeilen je Anfrage).

  Gemessen gegen den gewachsenen Bestand holte das Lager beim Öffnen jeden
  Lagerartikel (2.000 Zeilen in 6 Anfragen) und zu jedem sein Freies
  (`lager_frei`, 1.000 Zeilen in 2 Anfragen), um im Browser zu suchen, zu
  filtern, nach dem Freien zu sortieren und die Kennzahlen zu zählen. Gezeigt
  werden davon 20.

  `lager_liste` rechnet das hier, nach denselben Regeln:
  - frei und reserviert wie `lager_frei` (zugesagte Anforderungen und
    Rüstlisten ab heute, nur gegen das Hauptlager);
  - knapp wie `istKnapp`/`lager_knapp`: unter der Mindestmenge, ohne
    Mindestmenge höchstens `p_grenze` frei, nie ein ausgelaufener Artikel;
  - die Suche wie in der Liste: Teilwort (ohne Platzhalter) in Name,
    Kategorie oder Artikelnummer, dazu die Kennungen `p_treffer`, die die
    Suche über Nummern der Großhändler und die EAN fand;
  - sortiert nach dem Freien (knappes zuerst) oder nach dem Namen, dann
    nach der Kennung — so springt beim Nachladen keine Zeile.

  Zurück kommen die ersten `p_anzahl` Zeilen (ganze Artikel mit
  `zugesagt`, `geplant`, `frei`, an einem weiteren Ort `am_ort`), die Zahl
  der Treffer und die Kennzahlen über ALLE Lagerartikel des Hauptlagers
  (im Lager, knapp, fehlt, reserviert; `knapp_bestand` nach dem reinen
  Bestand für den Kopf des Katalogs) sowie die Warengruppen der
  Lagerartikel für die Zähllisten.

  `p_ort`: nur, was an diesem weiteren Ort liegt (Menge ungleich 0), mit
  seiner Menge dort. `p_nur`: nur diese Artikel (der Artikel im
  Seitenfenster bleibt aktuell, auch wenn er nicht auf der gezeigten Seite
  steht).

  RECHTE wie `lager_frei` und `lager_knapp`: wer im Betrieb lesen darf
  (Mitglied oder Support-Einblick); sonst ein Fehler statt einer leeren
  Liste, die wie ein leeres Lager aussähe.
*/

create or replace function public.lager_liste(
  p_begriff text default '',
  p_treffer uuid[] default '{}',
  p_filter text default 'alle',
  p_reihenfolge text default 'frei',
  p_anzahl integer default 20,
  p_grenze numeric default 5,
  p_ort uuid default null,
  p_nur uuid[] default null
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  begriff text := lower(btrim(coalesce(p_begriff, '')));
  ergebnis jsonb;
begin
  if betrieb is null or not app.darf(betrieb) then
    raise exception 'Kein Zugriff auf das Lager dieses Betriebs' using errcode = '42501';
  end if;
  if p_filter not in ('alle', 'knapp', 'fehlt') or p_reihenfolge not in ('frei', 'name')
     or p_anzahl is null or p_anzahl < 0 then
    raise exception 'Unbekannte Angabe für die Lagerliste' using errcode = '22023';
  end if;

  with artikel as (
    select m.*
      from public.materials m
     where m.company_id = betrieb
       and m.lagerartikel
  ),
  reserviert as (
    -- Frei wie in der Liste bisher: ohne erfassten Bestand zählt er als 0.
    select a.*, f.zugesagt, f.geplant, coalesce(a.stock, 0) - f.zugesagt - f.geplant as frei
      from artikel a
      join public.lager_frei((select coalesce(array_agg(x.id), '{}'::uuid[]) from artikel x)) f
        on f.material_id = a.id
  ),
  stand as (
    select a.*,
           not coalesce(a.ausgelaufen, false)
             and case when a.mindestmenge is not null then a.frei < a.mindestmenge
                      else a.frei <= p_grenze end as knapp,
           not coalesce(a.ausgelaufen, false)
             and case when a.mindestmenge is not null then coalesce(a.stock, 0) < a.mindestmenge
                      else coalesce(a.stock, 0) <= p_grenze end as knapp_bestand
      from reserviert a
  ),
  am_ort as (
    select b.material_id, b.menge
      from public.lagerbestaende b
     where p_ort is not null
       and b.company_id = betrieb
       and b.lagerort_id = p_ort
       and b.menge <> 0
  ),
  treffer as (
    select s.*, o.menge as am_ort_menge
      from stand s
      left join am_ort o on o.material_id = s.id
     where (p_ort is null or o.material_id is not null)
       and (p_nur is null or s.id = any (p_nur))
       and (begriff = ''
            or strpos(lower(coalesce(s.name, '')), begriff) > 0
            or strpos(lower(coalesce(s.category, '')), begriff) > 0
            or strpos(lower(coalesce(s.article_number, '')), begriff) > 0
            or s.id = any (coalesce(p_treffer, '{}')))
       -- Am weiteren Ort gilt kein Filter nach dem Freien: frei ist dort, was liegt.
       and (p_ort is not null or p_filter = 'alle'
            or (p_filter = 'knapp' and s.knapp)
            or (p_filter = 'fehlt' and s.frei < 0))
  ),
  seite as (
    select t.*
      from treffer t
     order by case when p_reihenfolge = 'frei' then t.frei end,
              t.name collate "de-x-icu", t.id
     limit p_anzahl
  )
  select jsonb_build_object(
    'zeilen', coalesce((
      select jsonb_agg(
               to_jsonb(m) || jsonb_build_object(
                 'zugesagt', z.zugesagt, 'geplant', z.geplant, 'frei', z.frei, 'am_ort', z.am_ort_menge)
               order by case when p_reihenfolge = 'frei' then z.frei end, z.name collate "de-x-icu", z.id)
        from seite z join public.materials m on m.id = z.id), '[]'::jsonb),
    'treffer', (select count(*) from treffer),
    'im_lager', (select count(*) from stand),
    'knapp', (select count(*) from stand where knapp),
    'knapp_bestand', (select count(*) from stand where knapp_bestand),
    'fehlt', (select count(*) from stand where frei < 0),
    'reserviert', (select coalesce(sum(zugesagt + geplant), 0) from stand),
    'warengruppen', coalesce((
      select jsonb_agg(w order by w collate "de-x-icu")
        from (select distinct btrim(warengruppe) as w from artikel where nullif(btrim(warengruppe), '') is not null) g), '[]'::jsonb)
  ) into ergebnis;
  return ergebnis;
end;
$$;

revoke all on function public.lager_liste(text, uuid[], text, text, integer, numeric, uuid, uuid[]) from public, anon;
grant execute on function public.lager_liste(text, uuid[], text, text, integer, numeric, uuid, uuid[]) to authenticated;
