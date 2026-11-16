/*
  FÄLLIGE WARTUNGEN FÜR DIE STARTSEITE — ZAHL UND DIE ERSTEN, NICHT ALLE
  (Durchsicht 15.11.2026, Budget B3: höchstens 50 Zeilen je Anfrage).

  Gemessen gegen den gewachsenen Bestand holte die Startseite jede fällige
  Wartung bis zum Stichtag (`listFaelligeWartungen`, 200 Zeilen) — und bei
  200 war Schluss: mit mehr fälligen Wartungen standen Zahl und „ohne
  Baustelle“ still zu niedrig da. Gezeigt werden je Abschnitt drei; die
  Zahlen brauchen alle.

  `wartungen_faellig_stand` zählt hier und gibt je Abschnitt die ersten:
  - „ohne Baustelle“: aktiv, fällig bis `p_bis`, keine offene Baustelle —
    Zahl, davon überfällig (vor `p_heute`), die ersten `p_anzahl` nach dem
    Fälligkeitstag;
  - „eingeplant“: dasselbe mit offener Baustelle, ohne die Wartungen in
    `p_ohne` (die mit Vorschlag „erledigt?“ stehen in eigenen Zeilen).
  Der Hinweis der Verwaltung („N Wartungen stehen an“) zählt beide zusammen.
  Dieselbe Regel wie `beurteile` in der App: vor heute überfällig, bis zum
  Stichtag fällig; ohne Termin keine von beiden.

  RECHTE wie das Lesen der Wartungen: wer im Betrieb lesen darf (Mitglied
  oder Support-Einblick); sonst ein Fehler statt einer leeren Antwort.
*/

create or replace function public.wartungen_faellig_stand(
  p_heute date,
  p_bis date,
  p_anzahl integer default 3,
  p_ohne uuid[] default '{}'
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  ergebnis jsonb;
begin
  if betrieb is null or not app.darf(betrieb) then
    raise exception 'Kein Zugriff auf die Wartungen dieses Betriebs' using errcode = '42501';
  end if;
  if p_heute is null or p_bis is null or p_anzahl is null or p_anzahl < 0 then
    raise exception 'Unbekannte Angabe für die fälligen Wartungen' using errcode = '22023';
  end if;

  with faellig as (
    select w.*
      from public.wartungen w
     where w.company_id = betrieb
       and w.aktiv
       and w.faellig_am <= p_bis
  ),
  ohne as (
    select f.* from faellig f where f.offene_baustelle is null
  ),
  eingeplant as (
    select f.* from faellig f
     where f.offene_baustelle is not null
       and not (f.id = any (coalesce(p_ohne, '{}')))
  )
  select jsonb_build_object(
    'ohne', jsonb_build_object(
      'anzahl', (select count(*) from ohne),
      'ueberfaellig', (select count(*) from ohne where faellig_am < p_heute),
      'zeilen', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.faellig_am, x.id)
          from (select o.* from ohne o order by o.faellig_am, o.id limit p_anzahl) x), '[]'::jsonb)),
    'eingeplant', jsonb_build_object(
      'anzahl', (select count(*) from eingeplant),
      'ueberfaellig', (select count(*) from eingeplant where faellig_am < p_heute),
      'zeilen', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.faellig_am, x.id)
          from (select e.* from eingeplant e order by e.faellig_am, e.id limit p_anzahl) x), '[]'::jsonb))
  ) into ergebnis;
  return ergebnis;
end;
$$;

revoke all on function public.wartungen_faellig_stand(date, date, integer, uuid[]) from public, anon;
grant execute on function public.wartungen_faellig_stand(date, date, integer, uuid[]) to authenticated;
